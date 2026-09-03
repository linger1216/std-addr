/**
 * 标准地址库 · 标准化服务(10 步流水线)。
 *
 * 从旧架构 stdaddr-service/server/services/standardizeService.js(872 行)迁移:
 * 预处理 → 缓存 → ML 解析 → 清洗(含中文数字) → 上下文推断 → DB 匹配覆盖
 * → 行政去重 → 拼接 → 评分。
 *
 * 降级(缺失表暂不使用,后续加强):
 *  - RoadLaneNumber / RoadLaneNumberRef(路弄号映射):跳过
 *  - VillageNumber(村号段):跳过
 *  - Redis 缓存:降级为进程内 LRU
 */
import { db } from "@/server/db";
import {
  preprocessRaw,
  normalizeChineseDigit,
  normalizeChineseNum,
} from "@/lib/standardize/preprocess";
import { buildStdAddress, type StdFields } from "@/lib/standardize/build";
import { calcScore } from "@/lib/standardize/score";
import { readModelServiceUrl } from "@/lib/settings/model-service";
import { LruCache } from "@/lib/lru-cache";

/** 标准化结果 */
export interface StandardizeResult {
  rawAddress: string;
  stdAddress: string;
  stdScore: number;
  fields: StdFields;
}

/**
 * 标准化单步 trace(debug 模式返回,用于前端展示「过程」)。
 * - 只保留 input/output/msg/status/fields 五个核心展示字段,不再存 matched;
 *   matched 更有信息量的值由调用方拼进 msg(如「命中:S32小区」)。
 * - fields = 本步执行后的完整 StdFields 快照,前端只展示非空要素。
 * - 两级结构:顶层步骤(主步骤)可带 children(子步骤)。
 * - 不存 index:顺序 push 的数组,渲染遍历时用下标自动编号。
 */
export interface StandardizeStep {
  name: string;
  /** 子步骤(两级结构);缺省无 */
  children?: StandardizeStep[];
  /** 本步执行后的完整 StdFields 快照;未改动字段的步骤与上一步一致,空字段不展示 */
  fields?: StdFields;
  input?: unknown;
  output?: unknown;
  /** 过程说明文本(纯字符串,格式由调用方负责;无 = 不展示) */
  msg?: string;
  /** ok=成功 / error=失败 / skip=跳过 / match=命中实体 */
  status?: "ok" | "error" | "skip" | "match";
}

/** unknown → 紧凑可读文本(msg 里拼接用) */
function safeString(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}

/** trace 收集回调:parentName(顶层分组名)/name(子步骤名)/input/output/msg/status;
 * 分组不存在时由实现侧自动建组,子步骤挂到分组 children。
 * 供 standardize 的 trace 闭包与 inferAdmin 共用,保证每步都带当前 StdFields 快照。 */
type TraceFn = (
  parentName: string,
  name: string,
  input?: unknown,
  output?: unknown,
  msg?: string,
  status?: StandardizeStep["status"],
) => void;

/** 进程内 LRU 缓存(Redis 降级;上限 1000 条) */
const cache = new LruCache<StandardizeResult>();

/** 清空标准化缓存(测试隔离用;生产无副作用) */
export function clearStandardizeCache(): void {
  cache.clear();
}

/** 行政字段(精确匹配上下文用) */
interface AdminFields {
  province?: string;
  city?: string;
  district?: string;
  street?: string;
  town?: string;
  neighborhood?: string;
}

/**
 * region 层级 → 行政字段。
 *
 * 主库实际数据语义(与旧库不同!):
 *  - level 1 = 街道/镇(名称后缀区分:镇/乡 → town;街道/其它 → street)
 *  - level 2 = 居民委员会/村民委员会 → neighborhood
 *  - 主库无省/市/区层级;预留 3=district、4=province/city 扩展位
 *    (若后续导入省市数据,需按名称后缀细化)
 */
function regionFieldFor(region: {
  level: number;
  name: string;
}): keyof AdminFields | null {
  const name = region.name;
  if (region.level === 1) {
    if (name.endsWith("镇") || name.endsWith("乡")) return "town";
    return "street";
  }
  if (region.level === 2) return "neighborhood";
  if (region.level === 3) return "district";
  if (region.level === 4) return "street";
  return null;
}

/** 获取 region 的完整祖先链(从当前向上到根);regionId 兼容 id/code 两种存储 */
async function getRegionAncestors(
  regionId: string | null | undefined,
): Promise<[region: unknown, fields: AdminFields]> {
  const fields: AdminFields = {};
  if (!regionId) return [null, fields];
  const region = await db.region.findFirst({
    where: { OR: [{ id: regionId }, { code: regionId }] },
  });
  let current = region;
  while (current) {
    const f = regionFieldFor(current);
    if (f) (fields as Record<string, string>)[f] = current.name;
    if (!current.parentCode) break;
    current =
      (await db.region.findFirst({ where: { code: current.parentCode } })) ??
      null;
  }
  return [region, fields];
}

/**
 * region 祖先链 → StdFields 应用。
 * 旧算法「居委」字段落在 region(评分 +3),而 region 树 level2 落在 neighborhood;
 * 两者语义同源(居民委员会/村民委员会),命中居委时同时写 region + neighborhood,
 * 避免 score.ts 读 region 读不到(既有失败根因)。
 */
function applyAdminToFields(fields: StdFields, admin: AdminFields): void {
  if (!hasAnyAdmin(admin)) return;
  Object.assign(fields, admin);
  if (admin.neighborhood) fields.region = admin.neighborhood;
}


/** 行政上下文精确匹配(任一字段不符即失败) */
function matchAdmin(src: AdminFields, dst: AdminFields): boolean {
  if (dst.province && src.province !== dst.province) return false;
  if (dst.city && src.city !== dst.city) return false;
  if (dst.district && src.district !== dst.district) return false;
  if (dst.street && src.street !== dst.street) return false;
  if (dst.town && src.town !== dst.town) return false;
  if (dst.neighborhood && src.neighborhood !== dst.neighborhood) return false;
  return true;
}

/** 行政填充守卫:任一行政字段非空即视为有效填充。
 * 注意:主库只有 街道/镇(level1)+ 居委(level2),没有省市区,
 * 旧实现只认省市区会永远不触发填充。 */
function hasAnyAdmin(fields: AdminFields): boolean {
  return [
    fields.province,
    fields.city,
    fields.district,
    fields.street,
    fields.town,
    fields.neighborhood,
  ].some((v): v is string => v != null && v !== "");
}

/** 归一同步:居委值 region/neighborhood 两个 key 保持同值。
 * ML 直接给居委(SCR-A1 等用 neighborhood key)、DB 行政链双写后调用,保证 score 读 region 有效。 */
function syncNeighborhoodRegion(fields: StdFields): void {
  if (fields.neighborhood) fields.region = fields.neighborhood;
  else if (fields.region) fields.neighborhood = fields.region;
}

/** 特殊:子区域匹配(仅当父实体是 community 时,按 entity_type/entity_id 绑定) */
async function matchSubarea(
  keyword: string,
  parentId: string,
): Promise<{ id: string; name: string; regionId: string | null } | null> {
  if (!keyword || !parentId) return null;
  const sub = await db.subarea.findFirst({
    where: {
      entityType: "community",
      entityId: parentId,
      OR: [
        { name: { contains: keyword } },
        { alias: { string_contains: keyword } },
      ],
    },
    select: { id: true, name: true, regionId: true },
  });
  return sub;
}

/** 子区域匹配(2/2):楼栋范围。源地址 building(如 16号/A栋)与子区域
 * property.building 数组精确成员命中;无命中返回 null。
 * building 归一:去掉 号楼/栋/幢/座 后缀、忽略空白(与 property 存储口径一致)。 */
function normalizeBuildingKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/(号楼|号|栋|幢|座)$/u, "")
    .trim()
    .toUpperCase();
}

async function matchSubareaByBuilding(
  communityId: string,
  building: unknown,
): Promise<{ id: string; name: string; regionId: string | null } | null> {
  const key = normalizeBuildingKey(building);
  if (!key) return null;
  const subs = await db.subarea.findMany({
    where: {
      entityType: "community",
      entityId: communityId,
      status: 1,
    },
    select: { id: true, name: true, regionId: true, property: true },
    take: 50,
  });
  for (const s of subs) {
    const prop = s.property as { building?: unknown } | null;
    const list = Array.isArray(prop?.building) ? prop.building : [];
    if (list.some((v) => normalizeBuildingKey(v) === key)) {
      return { id: s.id, name: s.name, regionId: s.regionId };
    }
  }
  return null;
}

/** 从 sys_setting 读 ML 服务地址 */
async function readMlUrl(): Promise<string> {
  return readModelServiceUrl(
    () => db.sysSetting.findMany(),
    process.env.ML_SERVICE_URL,
  );
}

/** ML 解析:调 NER /api/format(与旧架构 mlService 一致)。
 * 与旧架构对齐:模型逻辑失败(code !== 0)→ 返回空字段**降级继续**流水线
 * (拼接出仅含规则字段的标准地址);仅 HTTP/网络层面失败才抛错,
 * 由调用方按单条错误收集。
 */
async function mlParse(cleaned: string): Promise<StdFields> {
  const url = await readMlUrl();
  const base = url.replace(/\/+$/, "");
  const res = await fetch(
    `${base}/api/format?address=${encodeURIComponent(cleaned)}`,
    // 旧架构 axios 超时 30s(模型冷启动/长地址耗时);10s 会误杀
    { signal: AbortSignal.timeout(30000) },
  );
  if (!res.ok) throw new Error(`模型服务异常:HTTP ${res.status}`);
  const body = (await res.json()) as {
    code?: number;
    message?: string;
    data?: StdFields;
  };
  if (body.code !== 0) {
    // 模型逻辑失败:降级为空字段(旧架构 code!==0 时 fields = {})
    return {};
  }
  const data = body.data ?? {};
  const fields: StdFields = { ...data };
  // 乡(township)与镇(town)合并为 town(统称为 town)
  const tw = (data as Record<string, string | undefined>).township;
  if (tw) fields.town = fields.town ?? tw;
  // ML 若直接返回居委(neighborhood 或 region),两个 key 保持同值(评分读 region)
  syncNeighborhoodRegion(fields);
  return fields;
}

/** 清洗 ML 逗号污染 + 中文数字转阿拉伯(旧 #cleanFields + 队/组十位展开):
 * 行政字段去逗号、building 取首个、village/community 逗号拆分(后半段兜底给宅/子区域)、
 * team/group 中文数字归一(如 二十一队 → 21队)。 */
function cleanFields(fields: StdFields): void {
  for (const k of [
    "province",
    "city",
    "district",
    "street",
    "town",
    "neighborhood",
  ] as const) {
    if (fields[k]) fields[k] = (fields[k] ?? "").replace(/,/g, "");
  }
  if (
    fields.building &&
    typeof fields.building === "string" &&
    fields.building.includes(",")
  ) {
    fields.building = fields.building.split(",")[0]!.trim();
  }
  if (
    fields.village &&
    typeof fields.village === "string" &&
    fields.village.includes(",")
  ) {
    const parts = fields.village
      .split(",")
      .filter(Boolean)
      .map((s) => s.trim());
    fields.village = parts[0] ?? "";
    if (parts[1] && !fields.zhai) fields.zhai = parts[1];
  }
  if (
    fields.community &&
    typeof fields.community === "string" &&
    fields.community.includes(",")
  ) {
    const parts = fields.community
      .split(",")
      .filter(Boolean)
      .map((s) => s.trim());
    fields.community = parts[0] ?? "";
    if (parts[1] && !fields.subarea) fields.subarea = parts[1];
  }
  if (fields.road && typeof fields.road === "string") {
    // road 逗号保留(拼接时合并);只清理边界多余逗号
    fields.road = fields.road.replace(/^[,，]+|[,，]+$/g, "");
  }
  // 中文数字转阿拉伯(team/group,十位展开)
  if (fields.team) fields.team = normalizeChineseNum(fields.team);
  if (fields.group) fields.group = normalizeChineseNum(fields.group);
}

/** 行政去重(旧 #deduplicateAdmin):直辖市/重复项归一 */
function deduplicateAdmin(fields: StdFields): void {
  const MUNICIPALITIES = ["上海市", "北京市", "天津市", "重庆市"];
  const isMun = MUNICIPALITIES.includes(fields.province ?? "");

  if (isMun) {
    if (!fields.city || fields.city === "市辖区") fields.city = fields.province;
    fields.province = "";
  }
  if (fields.city && fields.province && fields.city === fields.province) {
    fields.city = "";
  }
  if (!isMun && fields.city === "市辖区") {
    fields.city = "";
  }
  if (fields.district && fields.province) {
    const p = fields.province.replace(/[市省]$/, "");
    const d = fields.district.replace(/[,，\s]/g, "");
    if (d.startsWith(p)) {
      const cleaned = d
        .replace(p, "")
        .replace(/^[,，\s]+/, "")
        .replace(/[,，\s]+$/, "");
      if (cleaned) fields.district = cleaned;
    }
  }
  if (fields.district && fields.city && fields.district === fields.city) {
    fields.district = "";
  }
  if (fields.district && fields.city && fields.district.endsWith("区")) {
    const cCore = fields.city.replace(/[市]$/, "");
    const dCore = fields.district.replace(/区$/, "");
    if (dCore.startsWith(cCore) && dCore !== cCore) {
      fields.district = dCore.replace(cCore, "") + "区";
    }
  }
}


class StandardizeService {
  /**
   * 标准化单个地址(10 步流水线)。
   * debug=true 时收集每步 trace(输入/输出/命中),即使 ML 失败也降级返回(不抛错),
   * 供前端展示「标准化过程」。非 debug 行为完全不变(零开销、网络失败照常抛错)。
   */
  async standardize(
    rawAddress: string,
    opts?: { debug?: boolean },
  ): Promise<StandardizeResult & { trace?: StandardizeStep[] }> {
    const debug = opts?.debug ?? false;
    const steps: StandardizeStep[] = [];

    const res: StandardizeResult = {
      rawAddress,
      stdAddress: "",
      stdScore: 0,
      fields: {},
    };

    // 记录 trace 单步:trace(parentName, name, …)。
    // - parentName = 顶层分组名(如「预处理」「解析」「定稿」),不存在则自动建组,
    //   子步骤挂到该组的 children(两级结构;编号由渲染侧拼 父.子);
    // - name = 本子步骤名;其后 input/output/msg/status,status 未传默认 "ok";
    // - 自动快照本步执行后的 res.fields(每步都是「trace 前的最近一次字段变更」之后的状态);
    // - 仅 debug 收集(非 debug 返回结果不含 trace,避免无谓快照)。
    const trace: TraceFn = (
      parentName,
      name,
      input,
      output,
      msg,
      status,
    ) => {
      if (!debug || !parentName) return;
      let parent = [...steps].reverse().find((s) => s.name === parentName);
      if (!parent) {
        parent = { name: parentName, children: [] };
        steps.push(parent);
      }
      const step: StandardizeStep = {
        name,
        input,
        output,
        msg,
        status: status ?? "ok",
        fields: { ...res.fields },
      };
      parent.children?.push(step);
    };

    // ====== 1. 预处理 ======
    const cleanedAddress = preprocessRaw(rawAddress);
    trace("预处理", "清洗",  rawAddress, cleanedAddress);

    // ====== 1.5 缓存命中 ======
    if (debug) {
      trace("预处理", "缓存查找", cleanedAddress, cleanedAddress, "调试模式忽略缓存", "skip");
    } else {
      const cached = cache.get(`std:${cleanedAddress}`);
      if (cached) return { ...cached, rawAddress };
    }

    // ====== 2. ML 解析(NER /api/format) ======
    try {
      res.fields = cleanedAddress.trim().length > 0 ? await mlParse(cleanedAddress) : {};
      trace( "解析", "模型", cleanedAddress, null, "模型返回的地址要素");
    } catch (err) {
      res.fields = {};
      const errMsg = err instanceof Error ? err.message : String(err);
      if (debug) {
        // debug 模式:降级继续(用空字段拼出结果),不抛错,便于展示失败步骤
        trace(
          "解析",
          "模型",
          cleanedAddress,
          null,
          `模型异常:${errMsg}`,
          "error",
        );
      } else {
        throw err; // 非 debug 保持原语义:网络/HTTP 层失败抛错
      }
    }

    // ====== 3~10:后续步骤 (debug 下任意异常降级返回 partial trace) ======
    try {
      // ====== 3. 清洗地址要素符号污染(含 team/group 中文数字转阿拉伯) ======
      const beforeClean = { ...res.fields };
      cleanFields(res.fields);
      trace("后清洗", "清洗地址要素", beforeClean, null, "清洗地址要素符号污染");

      // ====== 5. 上下文推断(向上反查省市) ======
      await this.inferAdmin(res.fields, trace);

      const adminFields: AdminFields = {
        province: res.fields.province,
        city: res.fields.city,
        district: res.fields.district,
        street: res.fields.street,
        town: res.fields.town,
        neighborhood: res.fields.neighborhood,
      };

      // 6.1 小区匹配
      // ====== 6. 数据库匹配覆盖(小区/子区域/POI/村;缺失表降级,仅行政路径填充) ======
      // 6.1 小区匹配 已按你描述的逻辑重写:
      // 1. 匹配:用 ML community 名称/别名查小区。未命中 → skip + note「小区流程结束」。
      // 2. 命中:
      //   - 先用库内规范名替换 fields.community(S32 → S32小区),trace 里标明「别名命中→替换规范名」。
      //   - 小区有 region_id → 它直接归属一个居委,getRegionAncestors 采用该居委,记 DB 匹配(小区→居委)。
      //   - 小区无 region_id → 走子区域判定:
      //       - 先按源地址 building 精确命中子区域 property.building(matchSubareaByBuilding,归一化 16号→16/A栋→A);
      //     - 未命中再用 ML subarea 名兜底(matchSubarea);
      //     - 命中子区域 → subarea 也替换为规范名,并采用子区域的 region。
      // 3. 每一步都有独立 trace(楼栋/名称/region 等),日志更细。

      // 顺带修复(与你确认的「region + neighborhood 都写」一致): score.ts 读 fields.region 而 DB 行政链只填 neighborhood,导致之前 COM/VIL/SCR 评分少 +1~+3。新增 applyAdminToFields(居委双写)与
      // syncNeighborhoodRegion(ML 直接给居委时同步),并应用到 6.1/6.2/6.3/inferAdmin,全部用例通过。

      if (res.fields.community) {
        const mlCommunity = res.fields.community;
        // 1. 匹配:用 ML community 名称/别名查小区(先原词,再中文数字归一)
        const communityNormalized = normalizeChineseDigit(mlCommunity);
        const communityRows = await db.community.findMany({
          where: {
            OR: [
              { name: { contains: mlCommunity } },
              { name: { contains: communityNormalized } },
              { alias: { string_contains: mlCommunity } },
              { alias: { string_contains: communityNormalized } },
            ],
          },
          select: { id: true, name: true, regionId: true },
          take: 20,
        });


        // 命中多个时按行政上下文过滤;仍无命中保留首行
        let communityMatch = communityRows[0] ?? null;
        if (communityMatch && Object.keys(adminFields).length > 0) {
          for (const cand of communityRows) {
            const [, candAdmin] = await getRegionAncestors(cand.regionId);
            if (matchAdmin(candAdmin, adminFields)) {
              communityMatch = cand;
              break;
            }
          }
        }
        if (!communityMatch) {
          // 名称/别名都没命中 → 该地址不属于任何已维护小区,小区流程直接结束
          trace(
            "DB 匹配(小区)",
            "小区匹配",
            mlCommunity,
            undefined,
            `小区名称/别名未命中(「${mlCommunity}」),小区流程结束`,
            "skip",
          );
        } else {
          // ① 用库内规范名替换 ML 原始小区名(别名 S32 → S32小区)
          const matchedCommunityName = communityMatch.name;
          const replacedName =
            matchedCommunityName !== mlCommunity ? matchedCommunityName : null;
          if (replacedName) res.fields.community = replacedName;
          trace(
            "DB 匹配(小区)",
            "小区匹配",
            mlCommunity,
            matchedCommunityName,
            replacedName
              ? `小区命中(别名「${mlCommunity}」)→ 替换为规范名「${matchedCommunityName}」`
              : `小区名称命中:${matchedCommunityName}`,
            "match",
          );

          if (communityMatch.regionId) {
            // ② 小区自带 region_id → 它直接归属一个居委,采用该居委
            const [, admin] = await getRegionAncestors(
              communityMatch.regionId,
            );
            applyAdminToFields(res.fields, admin);
            trace(
              "DB 匹配(小区)",
              "采用小区自带居委",
              {
                community: matchedCommunityName,
                regionId: communityMatch.regionId,
              },
              admin,
              `小区就一个居委,直接采用:${safeString(admin)}`,
              "match",
            );
          } else {
            // ③ 小区无 region_id → 说明小区有子区域,每个子区域有楼栋范围:
            //    用源地址楼栋数据找子区域,进而用子区域的 region
            let subareaMatch: {
              id: string;
              name: string;
              regionId: string | null;
            } | null = null;

            // 3.1 楼栋范围优先(源地址 building 精确命中 property.building)
            if (res.fields.building) {
              subareaMatch = await matchSubareaByBuilding(
                communityMatch.id,
                res.fields.building,
              );
              trace(
                "DB 匹配(小区)",
                "子区域·楼栋范围",
                {
                  community: matchedCommunityName,
                  building: res.fields.building,
                },
                subareaMatch?.name,
                subareaMatch
                  ? `楼栋「${res.fields.building}」命中子区域「${subareaMatch.name}」`
                  : `楼栋「${res.fields.building}」不在任何子区域楼栋范围`,
                subareaMatch ? "match" : "skip",
              );
            }

            // 3.2 楼栋未命中 → 用 ML 子区域名兜底(名称/别名)
            if (!subareaMatch && res.fields.subarea) {
              const nameMatch = await matchSubarea(
                res.fields.subarea,
                communityMatch.id,
              );
              trace(
                "DB 匹配(小区)",
                "子区域·名称兜底",
                {
                  community: matchedCommunityName,
                  subarea: res.fields.subarea,
                },
                nameMatch?.name,
                nameMatch
                  ? `子区域名「${res.fields.subarea}」命中「${nameMatch.name}」`
                  : `子区域名「${res.fields.subarea}」未命中`,
                nameMatch ? "match" : "skip",
              );
              subareaMatch = nameMatch;
            }

            if (subareaMatch) {
              // 命中子区域 → 规范名替换 subarea + 采用子区域 region
              if (res.fields.subarea !== subareaMatch.name) {
                res.fields.subarea = subareaMatch.name;
              }
              if (subareaMatch.regionId) {
                const [, subAdmin] = await getRegionAncestors(
                  subareaMatch.regionId,
                );
                applyAdminToFields(res.fields, subAdmin);
                trace(
                  "DB 匹配(小区)",
                  "子区域→region",
                  {
                    subarea: subareaMatch.name,
                    regionId: subareaMatch.regionId,
                  },
                  subAdmin,
                  `子区域「${subareaMatch.name}」命中 → 采用其 region:${safeString(subAdmin)}`,
                  "match",
                );
              } else {
                trace(
                  "DB 匹配(小区)",
                  "子区域→region",
                  { subarea: subareaMatch.name },
                  undefined,
                  `子区域「${subareaMatch.name}」命中但无 region_id,无法填充居委`,
                  "skip",
                );
              }
            } else {
              trace(
                "DB 匹配(小区)",
                "子区域判定",
                {
                  community: matchedCommunityName,
                  building: res.fields.building,
                  subarea: res.fields.subarea,
                },
                undefined,
                "小区无 region_id,且楼栋/名称均未命中子区域 → 无法确定居委",
                "skip",
              );
            }
          }
        }
      }

      // 6.2 POI 匹配
      if (res.fields.poi) {
        // 匹配:用 ML poi 名称/别名查 POI(先原词,再中文数字归一)
        const poiNormalized = normalizeChineseDigit(res.fields.poi);
        const poiRows = await db.poi.findMany({
          where: {
            OR: [
              { name: { contains: res.fields.poi } },
              { name: { contains: poiNormalized } },
              { alias: { string_contains: res.fields.poi } },
              { alias: { string_contains: poiNormalized } },
            ],
          },
          select: { id: true, name: true, regionId: true },
          take: 20,
        });
        // 命中多个时按行政上下文过滤;仍无命中保留首行
        let matchPoi = poiRows[0] ?? null;
        if (matchPoi && Object.keys(adminFields).length > 0) {
          for (const cand of poiRows) {
            const [, candAdmin] = await getRegionAncestors(cand.regionId);
            if (matchAdmin(candAdmin, adminFields)) {
              matchPoi = cand;
              break;
            }
          }
        }
        if (matchPoi) {
          const [, poiFields] = await getRegionAncestors(matchPoi.regionId);
          applyAdminToFields(res.fields, poiFields);
          trace(
            "DB 匹配(POI)",
            "POI 匹配",
            res.fields.poi,
            matchPoi.name,
            `POI 命中:${matchPoi.name};行政链填充:${safeString(poiFields)}`,
            "match",
          );
        } else {
          trace("DB 匹配(POI)", "POI 匹配", res.fields.poi, undefined, "未命中", "skip");
        }
      }

      // 6.3 村匹配(村号段 VillageNumber 降级,仅行政路径填充)
      if (res.fields.village) {
        // 匹配:用 ML village 名称/别名查村(先原词,再中文数字归一)
        const villageNormalized = normalizeChineseDigit(res.fields.village);
        const villageRows = await db.village.findMany({
          where: {
            OR: [
              { name: { contains: res.fields.village } },
              { name: { contains: villageNormalized } },
              { alias: { string_contains: res.fields.village } },
              { alias: { string_contains: villageNormalized } },
            ],
          },
          select: { id: true, name: true, regionId: true },
          take: 20,
        });
        // 命中多个时按行政上下文过滤;仍无命中保留首行
        let matchVillage = villageRows[0] ?? null;
        if (matchVillage && Object.keys(adminFields).length > 0) {
          for (const cand of villageRows) {
            const [, candAdmin] = await getRegionAncestors(cand.regionId);
            if (matchAdmin(candAdmin, adminFields)) {
              matchVillage = cand;
              break;
            }
          }
        }
        if (matchVillage) {
          const [, villageFields] = await getRegionAncestors(
            matchVillage.regionId,
          );
          applyAdminToFields(res.fields, villageFields);
          trace(
            "DB 匹配(村)",
            "村匹配",
            res.fields.village,
            matchVillage.name,
            `村命中:${matchVillage.name};行政链填充:${safeString(villageFields)}`,
            "match",
          );
        } else {
          trace("DB 匹配(村)", "村匹配", res.fields.village, undefined, "未命中", "skip");
        }
      }
      // 路弄号映射(RoadLaneNumber/Ref)缺失 → 降级跳过

      // ====== 7. 行政去重 ======
      const beforeDedup = { ...res.fields };
      deduplicateAdmin(res.fields);
      trace("收尾", "行政去重", beforeDedup, res.fields);

      // ====== 8. 拼接标准地址 ======
      res.stdAddress = buildStdAddress(res.fields);
      trace("收尾", "拼接标准地址", res.fields, res.stdAddress);

      // ====== 9. 评分 ======
      res.stdScore = calcScore(res.fields);
      trace("收尾", "评分", res.fields, res.stdScore);

      // ====== 10. 缓存写入 ======
      if (cleanedAddress) cache.set(`std:${cleanedAddress}`, res);
      trace(
        "收尾",
        "缓存写入",
        null,
        `std:${cleanedAddress}`,
        "进程内 LRU 缓存",
        "skip",
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (debug) {
        // debug 模式:降级返回已收集的过程(含失败步),不抛错
        trace(
          "异常中断",
          "降级返回",
          undefined,
          undefined,
          `后续步骤异常,降级返回已收集过程:${errMsg}`,
          "error",
        );
        return { ...res, trace: steps };
      }
      throw err; // 非 debug 照常抛错
    }

    // debug:附 trace 供前端展示过程;非 debug 仅返回结果
    return debug ? { ...res, trace: steps } : res;
  }

  /**
   *  基础行政区划推断:锚点(街/镇/区/市/省)→ region 表反查行政链
   *  把为空的区划字段剔除，只保留有内容的行政区链
  */
  private async inferAdmin(
    fields: StdFields,
    trace?: TraceFn,
  ): Promise<void> {
    const anchors = [
      fields.town,
      fields.street,
      fields.district,
      fields.city,
      fields.province,
    ].filter((v): v is string => Boolean(v));

    let region: {
      id: string;
      code: string;
      name: string;
      level: number;
      parentCode: string | null;
    } | null = null;
    // 别名兜底命中记录(trace 展示用)
    let matchedAlias: string | null = null;
    for (const name of anchors) {
      // 先按规范名精确命中
      region = await db.region.findFirst({ where: { name } });
      if (region) break;
      // 未命中 → 用别名兜底(region.alias 是 JSON 字符串数组,array_contains 精确匹配数组元素)
      region = await db.region.findFirst({
        where: { alias: { array_contains: name } },
      });
      if (region) {
        matchedAlias = name;
        break;
      }
    }
    if (!region) {
      trace?.(
        "上下文推断",
        "region 反查",
        anchors,
        null,
        "无锚点命中 region 表(名称与别名均未命中)",
        "skip",
      );
      return;
    }

    const [, admin] = await getRegionAncestors(region.id);
    applyAdminToFields(fields, admin);
    trace?.(
      "上下文推断",
      "region 反查",
      anchors,
      admin,
      matchedAlias === null
        ? `命中 region:${region.name}`
        : `命中 region:${region.name}(别名 ${matchedAlias} 命中)`,
      "match",
    );
  }
}

export const standardizeService = new StandardizeService();
