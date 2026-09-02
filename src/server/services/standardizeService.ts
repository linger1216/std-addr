/**
 * 标准地址库 · 标准化服务(10 步流水线)。
 *
 * 从旧架构 stdaddr-service/server/services/standardizeService.js(872 行)迁移:
 * 预处理 → 缓存 → ML 解析 → 清洗 → 中文数字 → 上下文推断 → DB 匹配覆盖
 * → 行政去重 → 拼接 → 评分。
 *
 * 降级(缺失表暂不使用,后续加强):
 *  - RoadLaneNumber / RoadLaneNumberRef(路弄号映射):跳过
 *  - VillageNumber(村号段):跳过
 *  - Redis 缓存:降级为进程内 LRU
 */
import { db } from "@/server/db";
import { preprocessRaw, normalizeChineseDigit, normalizeChineseNum } from "@/lib/standardize/preprocess";
import { buildStdAddress, type StdFields } from "@/lib/standardize/build";
import { calcScore } from "@/lib/standardize/score";
import { readModelServiceUrl } from "@/lib/settings/model-service";

/** 标准化结果 */
export interface StandardizeResult {
  rawAddress: string;
  stdAddress: string;
  stdScore: number;
  fields: StdFields;
}

/**
 * 标准化单步 trace(debug 模式返回,用于前端展示「过程」)。
 * input/output 为该步骤的输入与输出(可序列化);matched 为「命中的结果」
 * (如 ML 解析出的要素、DB 匹配的实体、region 行政链);status 标注步骤状态。
 */
export interface StandardizeStep {
  index: number;
  name: string;
  input?: unknown;
  output?: unknown;
  matched?: unknown;
  note?: string;
  status?: "ok" | "skip" | "fail";
}

/** unknown → 紧凑可读文本(用于 log) */
function safeString(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
    try {
      return JSON.stringify(v);
    } catch {
      return "[unserializable]";
    }
}

/** trace → 每步一行的可读日志(前端「原始日志」视图) */
export function traceToLog(steps: StandardizeStep[]): string[] {
  return steps.map((s) => {
    const status = s.status ? ` [${s.status}]` : "";
    const parts = [`${s.index}. ${s.name}${status}`];
    if (s.input !== undefined) parts.push(`   输入: ${safeString(s.input)}`);
    if (s.output !== undefined) parts.push(`   输出: ${safeString(s.output)}`);
    if (s.matched !== undefined) parts.push(`   命中: ${safeString(s.matched)}`);
    if (s.note) parts.push(`   备注: ${s.note}`);
    return parts.join("\n");
  });
}

/** 简单 LRU 缓存(Redis 降级;上限 1000 条) */
class LruCache {
  private map = new Map<string, StandardizeResult>();
  constructor(private cap = 1000) {}

  get(key: string): StandardizeResult | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // 刷新最近使用
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: StandardizeResult): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

const cache = new LruCache();

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
function regionFieldFor(region: { level: number; name: string }): keyof AdminFields | null {
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
async function getRegionAncestors(regionId: string | null | undefined): Promise<[region: unknown, fields: AdminFields]> {
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
      (await db.region.findFirst({ where: { code: current.parentCode } })) ?? null;
  }
  return [region, fields];
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
  return (
    [fields.province, fields.city, fields.district, fields.street, fields.town, fields.neighborhood]
      .some((v): v is string => v != null && v !== "")
  );
}

/** 实体匹配结果最小结构 */
interface EntityRow {
  id: string;
  name: string;
  regionId: string | null;
}

/**
 * 实体匹配(旧 #matchEntity):
 * name/alias 模糊匹配(先原词,再中文数字归一);命中多个时按行政上下文过滤。
 * Prisma 各表 findMany 类型不兼容 → 显式三分支。
 */
async function matchEntity(
  kind: "community" | "poi" | "village",
  entityName: string,
  adminFields: AdminFields,
): Promise<EntityRow | null> {
  if (!entityName) return null;
  const normalized = normalizeChineseDigit(entityName);
  const orWhere = [
    { name: { contains: entityName } },
    { name: { contains: normalized } },
    { alias: { string_contains: entityName } },
    { alias: { string_contains: normalized } },
  ];

  let rows: EntityRow[];
  if (kind === "community") {
    rows = await db.community.findMany({
      where: { OR: orWhere },
      select: { id: true, name: true, regionId: true },
      take: 20,
    });
  } else if (kind === "poi") {
    rows = await db.poi.findMany({
      where: { OR: orWhere },
      select: { id: true, name: true, regionId: true },
      take: 20,
    });
  } else {
    rows = await db.village.findMany({
      where: { OR: orWhere },
      select: { id: true, name: true, regionId: true },
      take: 20,
    });
  }
  if (rows.length === 0) return null;

  if (Object.keys(adminFields).length > 0) {
    for (const e of rows) {
      const [, fields] = await getRegionAncestors(e.regionId);
      if (matchAdmin(fields, adminFields)) return e;
    }
  }
  return rows[0]!;
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
  const body = (await res.json()) as { code?: number; message?: string; data?: StdFields };
  if (body.code !== 0) {
    // 模型逻辑失败:降级为空字段(旧架构 code!==0 时 fields = {})
    return {};
  }
  return { ...(body.data ?? {}) };
}

/** 清洗 ML 逗号污染(旧 #cleanFields):
 * 行政字段去逗号、building 取首个、village/community 逗号拆分(后半段兜底给宅/子区域) */
function cleanFields(fields: StdFields): void {
  for (const k of ["province", "city", "district", "street", "town", "neighborhood"] as const) {
    if (fields[k]) fields[k] = (fields[k] ?? "").replace(/,/g, "");
  }
  if (fields.building && typeof fields.building === "string" && fields.building.includes(",")) {
    fields.building = fields.building.split(",")[0]!.trim();
  }
  if (fields.village && typeof fields.village === "string" && fields.village.includes(",")) {
    const parts = fields.village.split(",").filter(Boolean).map((s) => s.trim());
    fields.village = parts[0] ?? "";
    if (parts[1] && !fields.zhai) fields.zhai = parts[1];
  }
  if (fields.community && typeof fields.community === "string" && fields.community.includes(",")) {
    const parts = fields.community.split(",").filter(Boolean).map((s) => s.trim());
    fields.community = parts[0] ?? "";
    if (parts[1] && !fields.subarea) fields.subarea = parts[1];
  }
  if (fields.road && typeof fields.road === "string") {
    // road 逗号保留(拼接时合并);只清理边界多余逗号
    fields.road = fields.road.replace(/^[,，]+|[,，]+$/g, "");
  }
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
      const cleaned = d.replace(p, "").replace(/^[,，\s]+/, "").replace(/[,，\s]+$/, "");
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

/** NER 字段 key → 旧算法规格(road_number→number;组归一) */
function toStdFields(data: Record<string, unknown>): StdFields {
  const fields: StdFields = { ...(data as Record<string, string>) };
  if (fields.road_number) {
    fields.number = fields.road_number;
    delete fields.road_number;
  }
  if (fields.group) {
    // 旧算法 PERSIST 用 group_field;group 保留供拼接使用
    void fields.group;
  }
  return fields;
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
  ): Promise<StandardizeResult & { trace?: StandardizeStep[]; log?: string[] }> {
    const debug = opts?.debug ?? false;
    const trace: StandardizeStep[] = [];
    const push = (
      name: string,
      input?: unknown,
      output?: unknown,
      extra?: {
        matched?: unknown;
        note?: string;
        status?: StandardizeStep["status"];
      },
    ) => {
      trace.push({ index: trace.length + 1, name, input, output, ...extra });
    };

    const res: StandardizeResult = {
      rawAddress,
      stdAddress: "",
      stdScore: 0,
      fields: {},
    };

    // ====== 1. 预处理 ======
    const cleaned = preprocessRaw(rawAddress);
    if (debug) push("预处理", rawAddress, cleaned);

    // ====== 1.5 缓存命中 ======
    if (cleaned) {
      const cached = cache.get(`std:${cleaned}`);
      if (cached) {
        if (debug) {
          push("缓存命中(直接返回)", cleaned, cached, {
            status: "skip",
            note: "命中进程内缓存,跳过后续步骤",
          });
        }
        return finalize({ ...cached, rawAddress }, debug, trace);
      }
      if (debug) push("缓存查找", cleaned, null, { status: "skip", note: "未命中" });
    }

    // ====== 2. ML 解析(NER /api/format) ======
    try {
      res.fields = cleaned.trim().length > 0 ? await mlParse(cleaned) : {};
      if (debug) {
        push("ML 解析(NER)", cleaned, res.fields, {
          matched: res.fields,
          note: "模型 /api/format 返回的 27 要素",
        });
      }
    } catch (err) {
      res.fields = {};
      const msg = err instanceof Error ? err.message : String(err);
      if (debug) {
        // debug 模式:降级继续(用空字段拼出结果),不抛错,便于展示失败步骤
        push("ML 解析(NER)", cleaned, null, {
          status: "fail",
          note: `模型服务异常,降级继续:${msg}`,
        });
      } else {
        throw err; // 非 debug 保持原语义:网络/HTTP 层失败抛错
      }
    }

    // ====== 3~10:后续步骤(debug 下任意异常降级返回 partial trace) ======
    try {
    // ====== 3. 清洗 ML 逗号污染 ======
    const beforeClean = { ...res.fields };
    cleanFields(res.fields);
    if (debug) push("清洗 ML 字段", beforeClean, res.fields);

    // road_number → number(旧算法规格)
    if (res.fields.road_number) {
      res.fields.number = res.fields.road_number;
      delete res.fields.road_number;
    }

    // ====== 4. 中文数字转阿拉伯(team/group,十位展开) ======
    const beforeNum = { team: res.fields.team, group: res.fields.group };
    if (res.fields.team) res.fields.team = normalizeChineseNum(res.fields.team);
    if (res.fields.group) res.fields.group = normalizeChineseNum(res.fields.group);
    if (debug) {
      push("中文数字转阿拉伯", beforeNum, {
        team: res.fields.team,
        group: res.fields.group,
      });
    }

    // ====== 5. 上下文推断(向上反查省市) ======
    await this.inferAdmin(res.fields, debug ? trace : undefined);

    // ====== 6. 数据库匹配覆盖 ======
    await this.matchAnythingEntity(res.fields, debug ? trace : undefined);

    // ====== 7. 行政去重 ======
    const beforeDedup = { ...res.fields };
    deduplicateAdmin(res.fields);
    if (debug) push("行政去重", beforeDedup, res.fields);

    // ====== 8. 拼接标准地址 ======
    res.stdAddress = buildStdAddress(res.fields);
    if (debug) push("拼接标准地址", res.fields, res.stdAddress);

    // ====== 9. 评分 ======
    res.stdScore = calcScore(res.fields);
    if (debug) push("评分", res.fields, res.stdScore);

    // ====== 10. 缓存写入 ======
    if (cleaned) cache.set(`std:${cleaned}`, res);
    if (debug) {
      push("缓存写入", null, `std:${cleaned}`, {
        status: "skip",
        note: "进程内 LRU 缓存",
      });
    }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (debug) {
        // debug 模式:降级返回已收集的过程(含失败步),不抛错
        push("异常中断", undefined, undefined, {
          status: "fail",
          note: `后续步骤异常,降级返回已收集过程:${msg}`,
        });
        return finalize(res, true, trace);
      }
      throw err; // 非 debug 照常抛错
    }

    return finalize(res, debug, trace);
  }

  /** 上下文推断:锚点(街/镇/区/市/省)→ region 表反查行政链 */
  private async inferAdmin(
    fields: StdFields,
    trace?: StandardizeStep[],
  ): Promise<void> {
    const anchors = [
      fields.street, fields.town, fields.district, fields.city, fields.province,
    ].filter(Boolean);

    let region: { id: string; code: string; name: string; level: number; parentCode: string | null } | null = null;
    for (const name of anchors) {
      region = await db.region.findFirst({ where: { name } });
      if (region) break;
    }
    if (!region) {
      trace?.push({
        index: trace.length + 1,
        name: "上下文推断(region 反查)",
        input: anchors,
        status: "skip",
        note: "无锚点命中 region 表",
      });
      return;
    }

    const [, admin] = await getRegionAncestors(region.id);
    Object.assign(fields, admin);
    trace?.push({
      index: trace.length + 1,
      name: "上下文推断(region 反查)",
      input: anchors,
      output: admin,
      matched: admin,
      note: `命中 region:${region.name}`,
    });
  }

  /** 数据库匹配覆盖:小区/子区域/POI/村(缺失表降级,仅行政路径填充) */
  private async matchAnythingEntity(
    fields: StdFields,
    trace?: StandardizeStep[],
  ): Promise<void> {
    const adminFields: AdminFields = {
      province: fields.province,
      city: fields.city,
      district: fields.district,
      street: fields.street,
      town: fields.town,
      neighborhood: fields.neighborhood,
    };

    const recordMatch = (
      label: string,
      name: string,
      row: { id: string; name: string; regionId: string | null } | null,
      note?: string,
    ) => {
      if (row) {
        trace?.push({
          index: trace.length + 1,
          name: `DB 匹配(${label})`,
          input: name,
          output: row.name,
          matched: { id: row.id, name: row.name },
          note,
        });
      } else {
        trace?.push({
          index: trace.length + 1,
          name: `DB 匹配(${label})`,
          input: name,
          status: "skip",
          note: "未命中",
        });
      }
    };

    // 1. 小区匹配
    if (fields.community) {
      const communityMatch = await matchEntity("community", fields.community, adminFields);
      if (communityMatch) {
        // 小区 + 子区域匹配(绑定 entity_type=community)
        if (fields.subarea) {
          const subareaMatch = await matchSubarea(fields.subarea, communityMatch.id);
          if (subareaMatch) {
            const [, subFields] = await getRegionAncestors(subareaMatch.regionId);
            if (hasAnyAdmin(subFields)) {
              Object.assign(fields, subFields);
            }
            trace?.push({
              index: trace.length + 1,
              name: "DB 匹配(子区域)",
              input: fields.subarea,
              output: subareaMatch.name,
              matched: subareaMatch,
              note: `绑定小区 ${communityMatch.name}`,
            });
          }
        }
        // 行政路径填充(以小区为准,覆盖子区域结果)
        const [, fields2] = await getRegionAncestors(communityMatch.regionId);
        if (hasAnyAdmin(fields2)) {
          Object.assign(fields, fields2);
        }
        recordMatch("小区", fields.community, communityMatch, `行政链填充:${safeString(fields2)}`);
      } else {
        recordMatch("小区", fields.community, null);
      }
    }

    // 2. POI 匹配
    if (fields.poi) {
      const matchPoi = await matchEntity("poi", fields.poi, adminFields);
      if (matchPoi) {
        const [, poiFields] = await getRegionAncestors(matchPoi.regionId);
        if (hasAnyAdmin(poiFields)) {
          Object.assign(fields, poiFields);
        }
        recordMatch("POI", fields.poi, matchPoi);
      } else {
        recordMatch("POI", fields.poi, null);
      }
    }

    // 3. 村匹配(村号段 VillageNumber 降级,仅行政路径填充)
    if (fields.village) {
      const matchVillage = await matchEntity("village", fields.village, adminFields);
      if (matchVillage) {
        const [, villageFields] = await getRegionAncestors(matchVillage.regionId);
        if (hasAnyAdmin(villageFields)) {
          Object.assign(fields, villageFields);
        }
        recordMatch("村", fields.village, matchVillage);
      } else {
        recordMatch("村", fields.village, null);
      }
    }
    // 路弄号映射(RoadLaneNumber/Ref)缺失 → 降级跳过
  }
}

/** 最终返回:debug 时附 trace/log,非 debug 仅基础结果(零开销) */
function finalize(
  result: StandardizeResult,
  debug: boolean,
  trace: StandardizeStep[],
): StandardizeResult & { trace?: StandardizeStep[]; log?: string[] } {
  if (!debug) return result;
  return { ...result, trace, log: traceToLog(trace) };
}

export const standardizeService = new StandardizeService();