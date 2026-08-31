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
import { preprocessRaw, normalizeChineseDigit } from "@/lib/standardize/preprocess";
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
}

const cache = new LruCache();

/** 行政区字段(精确匹配上下文用) */
interface AdminFields {
  province?: string;
  city?: string;
  district?: string;
  street?: string;
  town?: string;
  neighborhood?: string;
}

/** 行政层级映射(region.level → 字段) */
const LEVEL_TO_FIELD = {
  1: "province",
  2: "city",
  3: "district",
  4: "street",
  5: "town",
  6: "neighborhood",
} as const;

/** 获取 region 的完整祖先链(从当前向上到根);regionId 兼容 id/code 两种存储 */
async function getRegionAncestors(regionId: string | null | undefined): Promise<[region: unknown, fields: AdminFields]> {
  const fields: AdminFields = {};
  if (!regionId) return [null, fields];
  const region = await db.region.findFirst({
    where: { OR: [{ id: regionId }, { code: regionId }] },
  });
  let current = region;
  while (current) {
    const f = LEVEL_TO_FIELD[current.level as keyof typeof LEVEL_TO_FIELD];
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

/** ML 解析:调 NER /api/format(与旧架构 mlService 一致),返回字段 */
async function mlParse(cleaned: string): Promise<StdFields> {
  const url = await readMlUrl();
  const base = url.replace(/\/+$/, "");
  const res = await fetch(
    `${base}/api/format?address=${encodeURIComponent(cleaned)}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`模型服务异常:HTTP ${res.status}`);
  const body = (await res.json()) as { code?: number; message?: string; data?: StdFields };
  if (body.code !== 0) throw new Error(`模型解析失败:${body.message ?? ""}`);
  return { ...(body.data ?? {}) };
}

/** 清洗 ML 逗号污染(旧 #cleanFields):行政字段去逗号、building 保留首个 */
function cleanFields(fields: StdFields): void {
  for (const k of ["province", "city", "district", "street", "town", "neighborhood"] as const) {
    if (fields[k]) fields[k] = (fields[k] ?? "").replace(/,/g, "");
  }
  if (fields.building && typeof fields.building === "string" && fields.building.includes(",")) {
    fields.building = fields.building.split(",")[0]!.trim();
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
  /** 标准化单个地址(10 步流水线) */
  async standardize(rawAddress: string): Promise<StandardizeResult> {
    const res: {
      rawAddress: string;
      stdAddress: string;
      stdScore: number;
      fields: StdFields;
    } = {
      rawAddress,
      stdAddress: "",
      stdScore: 0,
      fields: {},
    };

    // ====== 1. 预处理 ======
    const cleaned = preprocessRaw(rawAddress);

    // ====== 1.5 缓存命中 ======
    if (cleaned) {
      const cached = cache.get(`std:${cleaned}`);
      if (cached) return { ...cached, rawAddress };
    }

    // ====== 2. ML 解析 ======
    res.fields = cleaned.trim().length > 0 ? await mlParse(cleaned) : {};

    // ====== 3. 清洗 ML 逗号污染 ======
    cleanFields(res.fields);

    // road_number → number(旧算法规格)
    if (res.fields.road_number) {
      res.fields.number = res.fields.road_number;
      delete res.fields.road_number;
    }

    // ====== 4. 中文数字转阿拉伯(team/group) ======
    if (res.fields.team) res.fields.team = normalizeChineseDigit(res.fields.team);
    if (res.fields.group) res.fields.group = normalizeChineseDigit(res.fields.group);

    // ====== 5. 上下文推断(向上反查省市) ======
    await this.inferAdmin(res.fields);

    // ====== 6. 数据库匹配覆盖 ======
    await this.matchAnythingEntity(res.fields);

    // ====== 7. 行政去重 ======
    deduplicateAdmin(res.fields);

    // ====== 8. 拼接标准地址 ======
    res.stdAddress = buildStdAddress(res.fields);

    // ====== 9. 评分 ======
    res.stdScore = calcScore(res.fields);

    // ====== 10. 缓存(去 logs,本实现无 logs) ======
    if (cleaned) cache.set(`std:${cleaned}`, res);

    return res;
  }

  /** 上下文推断:锚点(街/镇/区/市/省)→ region 表反查行政链 */
  private async inferAdmin(fields: StdFields): Promise<void> {
    const anchors = [
      fields.street, fields.town, fields.district, fields.city, fields.province,
    ].filter(Boolean);

    let region: { id: string; code: string; name: string; level: number; parentCode: string | null } | null = null;
    for (const name of anchors) {
      region = await db.region.findFirst({ where: { name } });
      if (region) break;
    }
    if (!region) return;

    const [, admin] = await getRegionAncestors(region.id);
    Object.assign(fields, admin);
  }

  /** 数据库匹配覆盖:小区/子区域/POI/村(缺失表降级,仅行政路径填充) */
  private async matchAnythingEntity(fields: StdFields): Promise<void> {
    const adminFields: AdminFields = {
      province: fields.province,
      city: fields.city,
      district: fields.district,
      street: fields.street,
      town: fields.town,
      neighborhood: fields.neighborhood,
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
            if (subFields.province || subFields.city || subFields.district) {
              Object.assign(fields, subFields);
            }
          }
        }
        // 行政路径填充(以小区为准,覆盖子区域结果)
        const [, fields2] = await getRegionAncestors(communityMatch.regionId);
        if (fields2.province || fields2.city || fields2.district) {
          Object.assign(fields, fields2);
        }
      }
    }

    // 2. POI 匹配
    if (fields.poi) {
      const matchPoi = await matchEntity("poi", fields.poi, adminFields);
      if (matchPoi) {
        const [, poiFields] = await getRegionAncestors(matchPoi.regionId);
        if (poiFields.province || poiFields.city || poiFields.district) {
          Object.assign(fields, poiFields);
        }
      }
    }

    // 3. 村匹配(村号段 VillageNumber 降级,仅行政路径填充)
    if (fields.village) {
      const matchVillage = await matchEntity("village", fields.village, adminFields);
      if (matchVillage) {
        const [, villageFields] = await getRegionAncestors(matchVillage.regionId);
        if (villageFields.province || villageFields.city || villageFields.district) {
          Object.assign(fields, villageFields);
        }
      }
    }
    // 路弄号映射(RoadLaneNumber/Ref)缺失 → 降级跳过
  }
}

export const standardizeService = new StandardizeService();