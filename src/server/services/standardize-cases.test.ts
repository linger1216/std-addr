/**
 * 标准地址库 · 回归用例集(合并自 stdaddr-service/server/data/test-cases.js,75 用例)。
 *
 * 适配策略(根据主库现有数据实际情况):
 *  1. 区划:主库 region 只有 level1=街道/镇、level2=居委(村民)委员会,无省/市/区
 *     → 期望中无"上海市闵行区"前缀,行政填充只涉及 街道/镇/居委;
 *  2. 实体:用例中的 小区/POI/村 全部取自主库真实数据
 *     (万博家园/七韵美地苑/S32小区、836公交终点站、革新村/联星村/镇北村/杨家巷村/华漕村);
 *  3. 降级:路弄号(ref 表)、村号段(village_number 表)主库不存在
 *     → 对应用例(RL-*、RN-*)断言"无实体填充"行为;
 *  4. ML 输出以 mock 字段给定(单测不依赖真实模型服务);
 *  5. 冗余用例合并(壹~肆街区、双候选、重复评分场景等只留代表)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearStandardizeCache, standardizeService } from "./standardizeService";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const dbMock = vi.hoisted(() => ({
  region: { findFirst: vi.fn() },
  community: { findMany: vi.fn() },
  poi: { findMany: vi.fn() },
  village: { findMany: vi.fn() },
  subarea: { findFirst: vi.fn(), findMany: vi.fn() },
  sysSetting: { findMany: vi.fn() },
}));

vi.mock("@/server/db", () => ({ db: dbMock }));

const fetchMock = vi.fn<typeof fetch>();

/* ==================== 主库真实区划 fixture ==================== */

type RegionRow = {
  name: string;
  level: number;
  parentCode: string | null;
  /** 别名数组(可选;inferAdmin 别名兜底锚点用) */
  alias?: string[];
};

/** key = region.id 或 region.code(查询 OR[{id},{code}] / {code} 兼容) */
const REGIONS: Record<string, RegionRow> = {
  // level1 街镇(真实)
  "310112102": { name: "七宝镇", level: 1, parentCode: null },
  "310112103": { name: "颛桥镇", level: 1, parentCode: null },
  "310112106": { name: "华漕镇", level: 1, parentCode: null, alias: ["华漕"] },
  "310112114": { name: "浦江镇", level: 1, parentCode: null },
  "310112502": { name: "浦锦街道", level: 1, parentCode: null, alias: ["浦锦"] },
  "310112006": { name: "古美路街道", level: 1, parentCode: null },
  "310112112": { name: "马桥镇", level: 1, parentCode: null },
  // level2 居委(真实,含村民委员会)
  "1254": { name: "万博家园居民委员会", level: 2, parentCode: "310112106" },
  "1677": { name: "七韵美地苑居民委员会", level: 2, parentCode: "310112102" },
  "1770": { name: "一品漫城第一居民委员会", level: 2, parentCode: "310112502" },
  "1374": { name: "富昆居民委员会", level: 2, parentCode: "310112112" },
  "cmtcluixl0030gxxs41mtky78": { name: "革新村村民委员会", level: 2, parentCode: "310112114" },
  "cmtcluixf002kgxxsqfzeixqk": { name: "联星村村民委员会", level: 2, parentCode: "310112114" },
  "cmtcluixe002fgxxswchb69nq": { name: "镇北村村民委员会", level: 2, parentCode: "310112114" },
  "cmtcluiqw0007gxxsp7uicrxq": { name: "杨家巷村村民委员会", level: 2, parentCode: "310112106" },
  "cmtcluiqi0000gxxsb570vb96": { name: "华漕村村民委员会", level: 2, parentCode: "310112106" },
};

function mockRegionTree() {
  dbMock.region.findFirst.mockImplementation(async ({ where }: any) => {
    const or = where?.OR as Array<Record<string, string>> | undefined;
    const q = or ? (or[0]?.id ?? or[1]?.code) : (where?.code ?? where?.name);
    if (q && REGIONS[q]) return { id: q, code: q, ...REGIONS[q] } as never;
    // 别名兜底锚点查询:region.alias(JSON 数组)array_contains 精确命中
    const aliasQ = where?.alias?.array_contains as string | undefined;
    if (aliasQ) {
      const hit = Object.entries(REGIONS).find(([, r]) =>
        r.alias?.includes(aliasQ),
      );
      if (hit) return { id: hit[0], code: hit[0], ...hit[1] } as never;
    }
    // name 查询(inferAdmin 锚点):按名称反查
    const hit = Object.entries(REGIONS).find(([, r]) => r.name === q);
    if (hit) return { id: hit[0], code: hit[0], ...hit[1] } as never;
    return null;
  });
}

/* ==================== 用例模型 ==================== */

type EntityRow = { id: string; name: string; alias?: string[]; regionId: string | null };
type DbFixture = {
  community?: EntityRow[];
  poi?: EntityRow[];
  village?: EntityRow[];
};

type StdCase = {
  id: string;
  category: string;
  description: string;
  /** 原始地址(会先过预处理) */
  raw: string;
  /** mock ML /api/format 返回字段 */
  ml: Record<string, string>;
  /** mock DB 命中的实体(主库真实数据) */
  db?: DbFixture;
  expected: {
    stdAddress?: string;
    score?: number;
    fieldsExist?: string[];
    fieldsNotExist?: string[];
  };
};

/* ==================== 用例集 ==================== */

const C = "华漕镇", Q = "颛桥镇", P = "浦江镇";

const CASES: StdCase[] = [
  // ============ A. 预处理 ============
  {
    id: "PRE-A1", category: "预处理", description: "去除中文括号内容",
    raw: "闵行区颛桥镇（都市路）阳光花园16号701室",
    ml: { district: "闵行区", town: Q, road: "都市路", community: "阳光花园", building: "16号", room: "701室" },
    expected: { stdAddress: `闵行区${Q}都市路阳光花园16号701室` },
  },
  {
    id: "PRE-A2", category: "预处理", description: "去除英文括号内容",
    raw: `闵行区${Q}颛兴路180弄18号601室(靠近河边)`,
    ml: { district: "闵行区", town: Q, road: "颛兴路", lane: "180弄", building: "18号", room: "601室" },
    expected: { stdAddress: `闵行区${Q}颛兴路180弄18号601室` },
  },
  {
    id: "PRE-A3", category: "预处理", description: "去除多余空格",
    raw: `闵行区  ${Q}  都市路  16号  701室`,
    ml: { district: "闵行区", town: Q, road: "都市路", building: "16号", room: "701室" },
    expected: { stdAddress: `闵行区${Q}都市路16号701室`, fieldsExist: ["district", "street", "road", "room"] },
  },
  {
    id: "PRE-A4", category: "预处理", description: "去除井号",
    raw: `闵行区${Q}都市路402#室`,
    ml: { district: "闵行区", town: Q, road: "都市路", room: "402室" },
    expected: { stdAddress: `闵行区${Q}都市路402室`, fieldsExist: ["room"] },
  },
  {
    id: "PRE-A5", category: "预处理", description: "多级连字符室号 ML 不解析(当前行为)",
    raw: `闵行区${Q}贵都路1-2-3室`,
    ml: { district: "闵行区", town: Q, road: "贵都路" },
    expected: { stdAddress: `闵行区${Q}贵都路` },
  },
  {
    id: "PRE-A6", category: "预处理", description: "括号内容去除 → building 缺失",
    raw: `闵行区${Q}颛兴路180弄(building A)601室`,
    ml: { district: "闵行区", town: Q, road: "颛兴路", lane: "180弄", room: "601室" },
    expected: { stdAddress: `闵行区${Q}颛兴路180弄601室`, fieldsNotExist: ["building"] },
  },
  {
    id: "PRE-A7", category: "预处理", description: "单元字母前缀保留",
    raw: `闵行区${Q}贵都路A单元701室`,
    ml: { district: "闵行区", town: Q, road: "贵都路", unit: "A单元", room: "701室" },
    expected: { stdAddress: `闵行区${Q}贵都路A单元701室`, fieldsExist: ["unit"] },
  },

  // ============ B. 中文数字(村实体为真实数据:革新村 → 浦江镇) ============
  {
    id: "CN-A1", category: "中文数字", description: "十队五组 → 10队5组",
    raw: `闵行区${P}革新村十队五组302号`,
    ml: { district: "闵行区", town: P, village: "革新村", team: "十队", group: "五组", room: "302号" },
    db: { village: [{ id: "cmtcluixl0030gxxs41mtky78", name: "革新村", regionId: "cmtcluixl0030gxxs41mtky78" }] },
    expected: { stdAddress: `闵行区${P}革新村10队5组302号`, fieldsExist: ["team", "group"] },
  },
  {
    id: "CN-A2", category: "中文数字", description: "十三队 → 13队",
    raw: `闵行区${P}革新村十三队302号`,
    ml: { district: "闵行区", town: P, village: "革新村", team: "十三队", room: "302号" },
    db: { village: [{ id: "cmtcluixl0030gxxs41mtky78", name: "革新村", regionId: "cmtcluixl0030gxxs41mtky78" }] },
    expected: { stdAddress: `闵行区${P}革新村13队302号`, fieldsExist: ["team"] },
  },
  {
    id: "CN-A3", category: "中文数字", description: "十组 → 10组",
    raw: `闵行区${P}革新村十组302号`,
    ml: { district: "闵行区", town: P, village: "革新村", group: "十组", room: "302号" },
    db: { village: [{ id: "cmtcluixl0030gxxs41mtky78", name: "革新村", regionId: "cmtcluixl0030gxxs41mtky78" }] },
    expected: { stdAddress: `闵行区${P}革新村10组302号`, fieldsExist: ["group"] },
  },

  // ============ C. ML 解析 + 清洗污染 ============
  {
    id: "ML-A1", category: "清洗污染", description: "ML 正常字段,社区名无实体命中时保留",
    raw: `闵行区${Q}都市阳光花园16号701室`,
    ml: { district: "闵行区", town: Q, road: "贵都路", lane: "366弄", community: "都市阳光花园", building: "16号", room: "701室" },
    expected: { stdAddress: `闵行区${Q}贵都路366弄16号701室`, fieldsExist: ["road", "lane", "building", "room", "community"] },
  },
  {
    id: "ML-A2", category: "清洗污染", description: "building 尾随逗号清洗(16号, → 16号)",
    raw: `闵行区${Q}都市阳光花园16号,701室`,
    ml: { district: "闵行区", town: Q, road: "贵都路", lane: "366弄", community: "都市阳光花园", building: "16号,", room: "701室" },
    expected: { stdAddress: `闵行区${Q}贵都路366弄16号701室`, fieldsExist: ["building"] },
  },
  {
    id: "ML-A3", category: "清洗污染", description: "community 逗号拆分:后半段兜底给 subarea(新行为)",
    raw: `闵行区${Q}都市阳光花园,701室`,
    ml: { district: "闵行区", town: Q, community: "都市阳光花园,701室" },
    expected: { stdAddress: `闵行区${Q}都市阳光花园`, fieldsExist: ["community", "subarea"] },
  },

  // ============ D. 小区匹配(实体:万博家园→华漕镇 / S32小区→马桥镇) ============
  {
    id: "COM-A1", category: "小区匹配", description: "小区名称直接匹配 → 居委+镇 行政填充",
    raw: `华漕镇万博家园16号701室`,
    ml: { town: C, community: "万博家园", building: "16号", room: "701室" },
    db: { community: [{ id: "c000001a03e838ba32cad1aa8", name: "万博家园", regionId: "1254" }] },
    expected: { stdAddress: `华漕镇万博家园16号701室`, score: 9, fieldsExist: ["community", "neighborhood"] },
  },
  {
    id: "COM-A2", category: "小区匹配", description: "小区别名匹配(S32小区 alias=S32)",
    raw: `马桥镇S32小区10号402室`,
    ml: { town: "马桥镇", community: "S32", building: "10号", room: "402室" },
    db: { community: [{ id: "c000001a03e838ba174515e55", name: "S32小区", alias: ["S32"], regionId: "1374" }] },
    // 别名命中后 community 字段替换为库内规范名(S32 → S32小区)
    expected: { stdAddress: "马桥镇S32小区10号402室", fieldsExist: ["community"] },
  },
  {
    id: "COM-A4", category: "小区匹配", description: "小区匹配无楼栋室号",
    raw: `华漕镇万博家园`,
    ml: { town: C, community: "万博家园" },
    db: { community: [{ id: "c000001a03e838ba32cad1aa8", name: "万博家园", regionId: "1254" }] },
    expected: { stdAddress: `华漕镇万博家园`, score: 7 },
  },
  {
    id: "COM-A5", category: "小区匹配", description: "小区不存在 → 保留 ML 字段",
    raw: `颛桥镇不存在的某某小区16号701室`,
    ml: { town: Q, community: "不存在的某某小区", building: "16号", room: "701室" },
    expected: { stdAddress: `颛桥镇不存在的某某小区16号701室`, fieldsExist: ["community"], fieldsNotExist: ["road", "lane"] },
  },

  // ============ E. POI 匹配(实体:836公交终点站) ============
  {
    id: "POI-A1", category: "POI匹配", description: "POI 直接匹配(region 为空 → 无行政填充)",
    raw: `颛桥镇836公交终点站`,
    ml: { town: Q, poi: "836公交终点站" },
    db: { poi: [{ id: "2955", name: "836公交终点站", regionId: null }] },
    expected: { stdAddress: `颛桥镇836公交终点站`, score: 6, fieldsExist: ["poi"] },
  },
  {
    id: "POI-A2", category: "POI匹配", description: "POI 无路弄号 ref → 路保留 ML 值(降级:不替换为关联路)",
    raw: `颛桥镇颛兴路836公交终点站`,
    ml: { town: Q, road: "颛兴路", poi: "836公交终点站" },
    db: { poi: [{ id: "2955", name: "836公交终点站", regionId: null }] },
    expected: { stdAddress: `颛桥镇颛兴路836公交终点站`, fieldsExist: ["poi", "road"], fieldsNotExist: ["lane"] },
  },
  {
    id: "POI-A3", category: "POI匹配", description: "纯路号无 POI 关联",
    raw: `颛桥镇新镇路256号`,
    ml: { town: Q, road: "新镇路", road_number: "256号" },
    expected: { stdAddress: `颛桥镇新镇路256号`, score: 6, fieldsNotExist: ["poi"] },
  },

  // ============ F. 子区域匹配(实体无 subarea 记录 → 保留 ML 字段) ============
  {
    id: "SUB-A1", category: "子区域匹配", description: "小区匹配成功,同名街区不在库 → subarea 保留 ML 值",
    raw: `七宝镇七韵美地苑壹街区18号501室`,
    ml: { town: "七宝镇", community: "七韵美地苑", subarea: "壹街区", building: "18号", room: "501室" },
    db: { community: [{ id: "c000001a03e838ba3704253eb", name: "七韵美地苑", regionId: "1677" }] },
    expected: { stdAddress: "七宝镇七韵美地苑18号501室", fieldsExist: ["community", "subarea"] },
  },

  // ============ G. 村匹配(实体真实:革新/联星/镇北/杨家巷/华漕村) ============
  {
    id: "VIL-A1", category: "村匹配", description: "完整农村:村+宅+队+组+号",
    raw: `浦江镇革新村徐家宅10队5组302号`,
    ml: { town: P, village: "革新村", zhai: "徐家宅", team: "10队", group: "5组", room: "302号" },
    db: { village: [{ id: "cmtcluixl0030gxxs41mtky78", name: "革新村", regionId: "cmtcluixl0030gxxs41mtky78" }] },
    expected: { stdAddress: `浦江镇革新村徐家宅10队5组302号`, score: 9, fieldsExist: ["village", "zhai", "team", "group"] },
  },
  {
    id: "VIL-A2", category: "村匹配", description: "村+组+号",
    raw: `浦江镇联星村9组42号`,
    ml: { town: P, village: "联星村", group: "9组", room: "42号" },
    db: { village: [{ id: "cmtcluixf002kgxxsqfzeixqk", name: "联星村", regionId: "cmtcluixf002kgxxsqfzeixqk" }] },
    expected: { stdAddress: `浦江镇联星村9组42号`, fieldsExist: ["village", "group"] },
  },
  {
    id: "VIL-A3", category: "村匹配", description: "仅村+号",
    raw: `浦江镇革新村302号`,
    ml: { town: P, village: "革新村", room: "302号" },
    db: { village: [{ id: "cmtcluixl0030gxxs41mtky78", name: "革新村", regionId: "cmtcluixl0030gxxs41mtky78" }] },
    expected: { stdAddress: `浦江镇革新村302号`, score: 7, fieldsExist: ["village"] },
  },
  {
    id: "VIL-A4", category: "村匹配", description: "村在库(镇北村)→ 正常匹配(旧库不在,主库存在,行为升级)",
    raw: `浦江镇镇北村448号`,
    ml: { town: P, village: "镇北村", room: "448号" },
    db: { village: [{ id: "cmtcluixe002fgxxswchb69nq", name: "镇北村", regionId: "cmtcluixe002fgxxswchb69nq" }] },
    expected: { stdAddress: `浦江镇镇北村448号`, fieldsExist: ["village"] },
  },
  {
    id: "VIL-A5", category: "村匹配", description: "宅+队+组(无村名)→ 不反查村",
    raw: `浦江镇徐家宅10队5组302号`,
    ml: { town: P, zhai: "徐家宅", team: "10队", group: "5组", room: "302号" },
    expected: { stdAddress: `浦江镇徐家宅10队5组302号`, fieldsExist: ["zhai", "team", "group"] },
  },
  {
    id: "VIL-A6", category: "村匹配", description: "仅队(1 字段→不反查村)",
    raw: `浦江镇10队302号`,
    ml: { town: P, team: "10队", room: "302号" },
    expected: { fieldsNotExist: ["village"] },
  },
  {
    id: "VIL-A7", category: "村匹配", description: "仅组(1 字段→不反查村)",
    raw: `浦江镇15组37号`,
    ml: { town: P, group: "15组", room: "37号" },
    expected: { fieldsNotExist: ["village"] },
  },
  {
    id: "VIL-A8", category: "村匹配", description: "错误镇名被村匹配修正(杨家巷村在华漕镇,非浦江镇)",
    raw: `浦江镇杨家巷村302号`,
    ml: { town: P, village: "杨家巷村", room: "302号" },
    db: { village: [{ id: "cmtcluiqw0007gxxsp7uicrxq", name: "杨家巷村", regionId: "cmtcluiqw0007gxxsp7uicrxq" }] },
    expected: { stdAddress: "华漕镇杨家巷村302号", fieldsExist: ["village", "street"] },
  },

  // ============ H/I/J. 路弄号/路号(主库无 ref 表 → 无实体填充) ============
  {
    id: "RL-C1", category: "路弄号→小区", description: "路+弄:无 ref 表 → 不填充小区(降级)",
    raw: `颛桥镇贵都路366弄20号601室`,
    ml: { town: Q, road: "贵都路", lane: "366弄", building: "20号", room: "601室" },
    expected: { stdAddress: `颛桥镇贵都路366弄20号601室`, score: 8, fieldsNotExist: ["community"] },
  },
  {
    id: "RL-C3", category: "路弄号→小区", description: "仅有弄号(无路)→ 不触发匹配,弄只计分不拼接",
    raw: `颛桥镇366弄`,
    ml: { town: Q, lane: "366弄" },
    expected: { stdAddress: `颛桥镇`, score: 4, fieldsNotExist: ["community"] },
  },
  {
    id: "RL-C4", category: "路弄号→小区", description: "仅有路名 → 不触发匹配",
    raw: `颛桥镇贵都路`,
    ml: { town: Q, road: "贵都路" },
    expected: { stdAddress: `颛桥镇贵都路`, score: 4, fieldsNotExist: ["community"] },
  },
  {
    id: "RL-C5", category: "路弄号→小区", description: "路+弄(库无该弄)→ 不填充",
    raw: `颛桥镇贵都路260弄`,
    ml: { town: Q, road: "贵都路", lane: "260弄" },
    expected: { stdAddress: `颛桥镇贵都路260弄`, score: 6 },
  },
  {
    id: "RL-S1", category: "路弄号→子区域", description: "路+弄 → 无 ref 表,不填充子区域(降级)",
    raw: `浦江镇叶家桥东路260弄`,
    ml: { town: P, road: "叶家桥东路", lane: "260弄" },
    expected: { stdAddress: `浦江镇叶家桥东路260弄`, fieldsNotExist: ["subarea", "community"] },
  },
  {
    id: "RL-S4", category: "路弄号→子区域", description: "仅有路名 → 不触发子区域匹配",
    raw: `浦江镇叶家桥东路`,
    ml: { town: P, road: "叶家桥东路" },
    expected: { fieldsExist: ["road"], fieldsNotExist: ["subarea", "community"] },
  },
  {
    id: "RN-P1", category: "路号→POI", description: "路+号 → 无 ref 表,不填充 POI(降级)",
    raw: `浦江镇永跃路260号`,
    ml: { town: P, road: "永跃路", road_number: "260号" },
    expected: { stdAddress: `浦江镇永跃路260号`, fieldsNotExist: ["poi"] },
  },
  {
    id: "RN-P2", category: "路号→POI", description: "有路+弄+号时 → 不走路号 POI 匹配",
    raw: `颛桥镇颛兴路180弄18号601室`,
    ml: { town: Q, road: "颛兴路", lane: "180弄", building: "18号", room: "601室" },
    expected: { fieldsExist: ["road", "lane", "building", "room"], fieldsNotExist: ["poi"] },
  },
  {
    id: "RN-P3", category: "路号→POI", description: "路+号 → 无 POI 关联",
    raw: `颛桥镇新镇路256号`,
    ml: { town: Q, road: "新镇路", road_number: "256号" },
    expected: { stdAddress: `颛桥镇新镇路256号`, fieldsNotExist: ["poi"] },
  },

  // ============ K. 上下文推断 ============
  {
    id: "INF-A1", category: "上下文推断", description: "无区划 → 锚点命中镇,填 street",
    raw: `颛桥镇都市阳光花园16号701室`,
    ml: { town: Q, community: "都市阳光花园", building: "16号", room: "701室" },
    expected: { stdAddress: `颛桥镇都市阳光花园16号701室`, fieldsExist: ["street"] },
  },
  {
    id: "INF-A2", category: "上下文推断", description: "仅区+镇 → 保留 ML 区名(库无区级)",
    raw: `闵行区颛桥镇`,
    ml: { district: "闵行区", town: Q },
    expected: { stdAddress: `闵行区${Q}`, score: 2, fieldsExist: ["street", "district"] },
  },
  {
    id: "INF-A3", category: "上下文推断", description: "仅有区 → 无法向上推断市(主库无市实体)",
    raw: "闵行区",
    ml: { district: "闵行区" },
    expected: { stdAddress: "闵行区", score: 1 },
  },
  {
    id: "INF-A4", category: "上下文推断", description: "ML 给省 → 直辖市逻辑补 city,清 province",
    raw: `上海市颛桥镇都市阳光花园16号701室`,
    ml: { province: "上海市", town: Q, community: "都市阳光花园", building: "16号", room: "701室" },
    expected: { stdAddress: `上海市${Q}都市阳光花园16号701室`, fieldsExist: ["city"], fieldsNotExist: ["province"] },
  },
  {
    id: "INF-A5", category: "上下文推断", description: "无任何行政 → ML 解析出镇",
    raw: "都市阳光花园16号701室",
    ml: { town: Q, community: "都市阳光花园", building: "16号", room: "701室" },
    expected: { stdAddress: `颛桥镇都市阳光花园16号701室`, fieldsExist: ["street"] },
  },

  // ============ L. 行政去重 ============
  {
    id: "DED-A1", category: "行政去重", description: "直辖市:province 清空,保留 city",
    raw: `上海市闵行区颛桥镇颛兴路180弄18号601室`,
    ml: { province: "上海市", city: "上海市", district: "闵行区", town: Q, road: "颛兴路", lane: "180弄", building: "18号", room: "601室" },
    expected: { stdAddress: `上海市闵行区${Q}颛兴路180弄18号601室`, fieldsExist: ["city"], fieldsNotExist: ["province"] },
  },
  {
    id: "DED-A2", category: "行政去重", description: "重复区名去除",
    raw: "闵行区闵行区颛桥镇",
    ml: { district: "闵行区", town: Q },
    expected: { stdAddress: `闵行区${Q}` },
  },

  // ============ M. 评分 ============
  {
    id: "SCR-A1", category: "评分", description: "完整城市(居委/路/弄/楼栋/室)= 9 分",
    raw: `华漕镇贵都路366弄16号701室`,
    ml: { neighborhood: "万博家园居民委员会", road: "贵都路", lane: "366弄", building: "16号", room: "701室" },
    expected: { score: 9 },
  },
  {
    id: "SCR-A3", category: "评分", description: "简略道路(镇/路/弄)= 6 分",
    raw: `闵行区颛桥镇颛兴路180弄`,
    ml: { district: "闵行区", town: Q, road: "颛兴路", lane: "180弄" },
    expected: { score: 6 },
  },
  {
    id: "SCR-A5", category: "评分", description: "仅上海市 → 0 分",
    raw: "上海市",
    ml: { province: "上海市" },
    expected: { score: 0 },
  },
  {
    id: "SCR-C1", category: "评分", description: "完整农村(镇/村/队组/室)= 8 分(无居委)",
    raw: `浦江镇革新村徐家宅10队5组302号`,
    ml: { town: P, village: "革新村", zhai: "徐家宅", team: "10队", group: "5组", room: "302号" },
    expected: { score: 8 },
  },
  {
    id: "SCR-C2", category: "评分", description: "仅村名(镇/村)= 5 分",
    raw: `浦江镇革新村`,
    ml: { town: P, village: "革新村" },
    expected: { score: 5 },
  },

  // ============ N/O. 楼栋与完整拼接 ============
  {
    id: "BLD-A1", category: "楼栋拼接", description: "完整楼栋:号+单元+层+室",
    raw: `颛桥镇颛兴路180弄1号2单元3层401室`,
    ml: { town: Q, road: "颛兴路", lane: "180弄", building: "1号", unit: "2单元", floor: "3层", room: "401室" },
    // 单元/层不计分:镇2+路2+弄2+栋1+室1=8
    expected: { stdAddress: `颛桥镇颛兴路180弄1号2单元3层401室`, score: 8, fieldsExist: ["building", "unit", "floor", "room"] },
  },
  {
    id: "BLD-A2", category: "楼栋拼接", description: "无楼栋有室号",
    raw: `颛桥镇颛兴路180弄601室`,
    ml: { town: Q, road: "颛兴路", lane: "180弄", room: "601室" },
    expected: { stdAddress: `颛桥镇颛兴路180弄601室`, fieldsExist: ["room"], fieldsNotExist: ["building"] },
  },
  {
    id: "BLD-A4", category: "楼栋拼接", description: "仅有路名",
    raw: `颛桥镇颛兴路`,
    ml: { town: Q, road: "颛兴路" },
    expected: { stdAddress: `颛桥镇颛兴路`, fieldsNotExist: ["lane", "number", "building", "room"] },
  },
  {
    id: "CPL-A1", category: "地址拼接", description: "完整城市地址",
    raw: `上海市闵行区颛桥镇颛兴路180弄18号601室`,
    ml: { province: "上海市", district: "闵行区", town: Q, road: "颛兴路", lane: "180弄", building: "18号", room: "601室" },
    expected: { stdAddress: `上海市闵行区${Q}颛兴路180弄18号601室` },
  },
  {
    id: "CPL-A5", category: "地址拼接", description: "有路弄+小区名(无楼栋室号)",
    raw: `颛桥镇颛兴路180弄都市阳光花园`,
    ml: { town: Q, road: "颛兴路", lane: "180弄", community: "都市阳光花园" },
    expected: { stdAddress: `颛桥镇颛兴路180弄` },
  },

  // ============ P. 行政修正 ============
  {
    id: "FIX-A2", category: "行政修正", description: "错误镇名被小区匹配覆盖(万博家园在华漕镇)",
    raw: `七宝镇万博家园10号402室`,
    ml: { town: "七宝镇", community: "万博家园", building: "10号", room: "402室" },
    db: { community: [{ id: "c000001a03e838ba32cad1aa8", name: "万博家园", regionId: "1254" }] },
    expected: { stdAddress: `华漕镇万博家园10号402室`, fieldsExist: ["street"] },
  },
  {
    id: "ADM-A1", category: "行政推断", description: "镇锚点用别名命中(华漕=华漕镇),street 归一到规范名",
    raw: "华漕金光路199号",
    ml: { town: "华漕", road: "金光路", road_number: "199号" },
    // 规范名 "华漕镇" 不含锚点 "华漕" → name 不命中;靠 alias=["华漕"] 命中,行政链填规范名
    expected: { stdAddress: "华漕镇金光路199号", fieldsExist: ["street"] },
  },
  {
    id: "ADM-A2", category: "行政推断", description: "街道别名命中(浦锦=浦锦街道),street 归一到规范名",
    raw: "浦锦陈行路233弄",
    ml: { street: "浦锦", road: "陈行路", lane: "233弄" },
    expected: { stdAddress: "浦锦街道陈行路233弄", fieldsExist: ["street"] },
  },

  // ============ Q. 无匹配(纯道路) ============
  {
    id: "NOR-A1", category: "无匹配", description: "纯道路地址无实体匹配",
    raw: "闵行区古美路街道古龙路288号102室",
    ml: { district: "闵行区", street: "古美路街道", road: "古龙路", road_number: "288号", room: "102室" },
    expected: { stdAddress: "闵行区古美路街道古龙路288号102室", score: 7 },
  },

  // ============ R. 边界条件 ============
  {
    id: "BND-A3", category: "边界条件", description: "单元带字母前缀",
    raw: `颛桥镇颛兴路180弄A单元601室`,
    ml: { town: Q, road: "颛兴路", lane: "180弄", unit: "A单元", room: "601室" },
    expected: { stdAddress: `颛桥镇颛兴路180弄A单元601室`, fieldsExist: ["unit"] },
  },

  // ============ S. 异常输入 ============
  { id: "ERR-A1", category: "异常输入", description: "纯字母乱码", raw: "asdfghjkl", ml: {}, expected: { score: 0 } },
  { id: "ERR-A2", category: "异常输入", description: "仅有标点符号", raw: "。。。", ml: {}, expected: { score: 0 } },
  { id: "ERR-A3", category: "异常输入", description: "空字符串", raw: "", ml: {}, expected: { score: 0 } },
  {
    id: "ERR-A4", category: "异常输入", description: "室号前单连字符清理(402-室 → 402室)",
    raw: `闵行区颛桥镇402-室`,
    ml: { district: "闵行区", town: Q, room: "402室" },
    expected: { stdAddress: `闵行区${Q}402室`, fieldsExist: ["room"] },
  },
];

/* ==================== 测试运行器 ==================== */

beforeEach(() => {
  // 进程内 LRU 是模块级单例,不清空会串扰(同 raw 地址的用例互相命中缓存,如 VIL-A1 与 SCR-C1)
  clearStandardizeCache();
  dbMock.region.findFirst.mockReset();
  dbMock.community.findMany.mockReset().mockResolvedValue([]);
  dbMock.poi.findMany.mockReset().mockResolvedValue([]);
  dbMock.village.findMany.mockReset().mockResolvedValue([]);
  dbMock.subarea.findFirst.mockReset().mockResolvedValue(null);
  dbMock.subarea.findMany.mockReset().mockResolvedValue([]);
  dbMock.sysSetting.findMany.mockReset().mockResolvedValue([]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockRegionTree();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("合并自旧 test-cases.js 的回归用例(主库实体 + 两级区划适配)", () => {
  for (const c of CASES) {
    it(`${c.id} ${c.category}·${c.description}`, async () => {
      // —— mock ML 输出 ——
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, message: "success", data: c.ml }),
      } as Response);
      // —— mock DB 实体(主库真实数据) ——
      if (c.db?.community) dbMock.community.findMany.mockResolvedValue(c.db.community);
      if (c.db?.poi) dbMock.poi.findMany.mockResolvedValue(c.db.poi);
      if (c.db?.village) dbMock.village.findMany.mockResolvedValue(c.db.village);

      const res = await standardizeService.standardize(c.raw);

      if (c.expected.stdAddress !== undefined) {
        expect(res.stdAddress, `${c.id} std_address`).toBe(c.expected.stdAddress);
      }
      if (c.expected.score !== undefined) {
        expect(res.stdScore, `${c.id} score`).toBe(c.expected.score);
      }
      for (const f of c.expected.fieldsExist ?? []) {
        expect(res.fields[f as keyof typeof res.fields], `${c.id} 应有字段 ${f}`).toBeTruthy();
      }
      for (const f of c.expected.fieldsNotExist ?? []) {
        expect(res.fields[f as keyof typeof res.fields], `${c.id} 不应有字段 ${f}`).toBeFalsy();
      }
    });
  }
});