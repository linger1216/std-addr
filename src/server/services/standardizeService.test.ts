/**
 * 标准地址库 · 标准化服务层测试(10 步流水线)。
 *
 * mock 策略:
 *  - db:vi.mock("@/server/db") 注入假 Prisma client(region/community/poi/village/subarea/sysSetting)
 *  - ML 服务:stubGlobal("fetch") 模拟 /api/format 响应
 *
 * 覆盖移植对照点:
 *  - 全链路拼接+评分(mock ML 无 DB 命中)
 *  - ML 逻辑失败(code!==0)降级继续(旧架构 fields={} 行为)
 *  - ML 网络错误抛错(与旧架构一致)
 *  - 进程内缓存命中(第二次调用不再调 ML)
 *  - community 匹配 + 行政路径填充
 *  - community+subarea 双匹配
 *  - cleanFields 逗号拆分(village→zhai / community→subarea)
 *  - 队/组中文数字十位展开(二十一队 → 21队)
 *  - 直辖市行政去重
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearStandardizeCache, standardizeService } from "./standardizeService";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

/** 假 Prisma client(db 单例,hoisted 保证 vi.mock 工厂可见) */
const dbMock = vi.hoisted(() => ({
  region: { findFirst: vi.fn() },
  community: { findMany: vi.fn() },
  poi: { findMany: vi.fn() },
  village: { findMany: vi.fn() },
  subarea: { findFirst: vi.fn() },
  sysSetting: { findMany: vi.fn() },
}));

vi.mock("@/server/db", () => ({ db: dbMock }));

const fetchMock = vi.fn<typeof fetch>();

/** 模拟 ML /api/format 返回(默认 code=0 成功) */
function mlOk(data: Record<string, unknown>): void {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ code: 0, message: "success", data }),
  } as Response);
}

/** region 树:按查询值(id/code/name)派发,主库两级链:居委(level2) → 镇(level1) */
function regionTree(): Record<string, unknown> {
  return {
    // 居委(level2)→ 华漕镇(level1)
    "1254": { id: "1254", code: "310112106001", name: "万博家园居民委员会", level: 2, parentCode: "310112106" },
    "310112106": { id: "40", code: "310112106", name: "华漕镇", level: 1, parentCode: null },
    // 居委(level2)→ 浦锦街道(level1)
    "1770": { id: "1770", code: "310112502001", name: "一品漫城第一居民委员会", level: 2, parentCode: "310112502" },
    "310112502": { id: "38", code: "310112502", name: "浦锦街道", level: 1, parentCode: null },
  };
}

/** region.findFirst:兼容 OR[{id}|{code}]、{code}、{name} 三种查询形态 */
function mockRegionTree(tree: Record<string, unknown>) {
  dbMock.region.findFirst.mockImplementation(async ({ where }: any) => {
    const or = where?.OR as Array<Record<string, string>> | undefined;
    const q = or ? (or[0]?.id ?? or[1]?.code) : (where?.code ?? where?.name ?? where?.id);
    return (tree[q as string]) ?? null;
  });
}

beforeEach(() => {
  // 清空模块级 LRU,避免用例间同地址串扰
  clearStandardizeCache();
  dbMock.region.findFirst.mockReset().mockResolvedValue(null);
  dbMock.community.findMany.mockReset().mockResolvedValue([]);
  dbMock.poi.findMany.mockReset().mockResolvedValue([]);
  dbMock.village.findMany.mockReset().mockResolvedValue([]);
  dbMock.subarea.findFirst.mockReset().mockResolvedValue(null);
  dbMock.sysSetting.findMany.mockReset().mockResolvedValue([]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("standardizeService 10 步流水线", () => {
  it("城市路弄号全链路:ML 解析→清洗→拼接→评分,mock ML 无 DB 命中", async () => {
    mlOk({ road: "永跃路", lane: "260弄", number: "38号", building: "5号", room: "502室" });

    const res = await standardizeService.standardize("永跃路260弄38号502室");

    expect(res.stdAddress).toBe("永跃路260弄38号5号502室");
    expect(res.stdScore).toBe(8); // 路2 + 弄2 + 号2 + 楼栋1 + 室1
    expect(res.fields.room).toBe("502室");
    // ML 只被调用一次,且 URL 带清洗后的地址(中文被 URL 编码,先解码再断言)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstArg = fetchMock.mock.calls[0]?.[0];
    const url = typeof firstArg === "string" ? firstArg : "";
    expect(decodeURIComponent(url)).toContain("永跃路260弄38号502室");
  });

  it("ML 逻辑失败(code!==0)→ 降级为空字段继续流水线,不抛错(旧架构行为)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 5000, message: "模型内部错误" }),
    } as Response);

    const res = await standardizeService.standardize("无法解析的地址");
    expect(res.stdAddress).toBe("");
    expect(res.stdScore).toBe(0);
  });

  it("ML 网络错误 → 抛错(调用方按单条错误收集,与旧架构一致)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(standardizeService.standardize("永跃路260弄")).rejects.toThrow("network down");
  });

  it("进程内缓存:同一地址第二次标准化不再调 ML", async () => {
    mlOk({ road: "永跃路", number: "260号" });
    const first = await standardizeService.standardize("永跃路260号");
    expect(first.stdAddress).toBe("永跃路260号");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await standardizeService.standardize("永跃路260号");
    expect(second.stdAddress).toBe("永跃路260号");
    expect(fetchMock).toHaveBeenCalledTimes(1); // 命中缓存,不再调 ML
  });

  it("community 匹配 + 行政路径填充(居委→镇 两级链)", async () => {
    mlOk({ community: "阳光花园", building: "16号", room: "701室" });
    dbMock.community.findMany.mockResolvedValue([
      { id: "c1", name: "阳光花园", regionId: "1254" },
    ]);
    mockRegionTree(regionTree());

    const res = await standardizeService.standardize("阳光花园16号701室");

    // 行政链:万博家园居民委员会(level2 居委)→ 华漕镇(level1);主库无省市层级
    expect(res.fields.neighborhood).toBe("万博家园居民委员会");
    expect(res.fields.town).toBe("华漕镇");
    expect(res.fields.city).toBeUndefined();
    expect(res.stdAddress).toBe("华漕镇阳光花园16号701室");
    // 评分:居委 3 + 无路无村地标(community)4 + 楼栋 1 + 室 1 = 9
    expect(res.stdScore).toBe(9);
  });

  it("community + subarea 双匹配:子区域行政优先,小区行政覆盖", async () => {
    mlOk({ community: "瑞和雅苑", subarea: "壹街区" });
    dbMock.community.findMany.mockResolvedValue([
      { id: "c2", name: "瑞和雅苑", regionId: "1254" },
    ]);
    dbMock.subarea.findFirst.mockResolvedValue({
      id: "s1", name: "壹街区", regionId: "310112106",
    });
    mockRegionTree(regionTree());

    const res = await standardizeService.standardize("瑞和雅苑壹街区");

    expect(res.fields.subarea).toBe("壹街区");
    expect(res.fields.community).toBe("瑞和雅苑");
    // 子区域填行政(镇),小区再覆盖(居委+镇)
    expect(res.fields.neighborhood).toBe("万博家园居民委员会");
    expect(res.fields.town).toBe("华漕镇");
  });

  it("cleanFields 逗号拆分:village 后半段兜底给 zhai", async () => {
    mlOk({ village: "革新村,徐家宅", team: "十队", group: "五组" });
    dbMock.village.findMany.mockResolvedValue([]);

    const res = await standardizeService.standardize("革新村,徐家宅十队五组");

    expect(res.fields.village).toBe("革新村");
    expect(res.fields.zhai).toBe("徐家宅");
    // team/group 中文数字十位展开:十队 → 10队;五组 → 5组
    expect(res.fields.team).toBe("10队");
    expect(res.fields.group).toBe("5组");
    expect(res.stdAddress).toBe("革新村徐家宅10队5组");
    expect(res.stdScore).toBe(5); // 村 3 + 宅/队/组 2
  });

  it("队/组中文数字十位展开:二十一队 → 21队(旧算法缺陷修正)", async () => {
    mlOk({ village: "联星村", team: "二十一队", group: "十二组" });

    const res = await standardizeService.standardize("联星村二十一队十二组");

    expect(res.fields.team).toBe("21队");
    expect(res.fields.group).toBe("12组");
    expect(res.stdAddress).toBe("联星村21队12组");
  });

  it("直辖市行政去重:上海市 省市合并,province 清空", async () => {
    mlOk({ province: "上海市", city: "上海市", district: "闵行区", road: "永跃路", number: "260号" });

    const res = await standardizeService.standardize("上海市上海市闵行区永跃路260号");

    expect(res.fields.province).toBe("");
    expect(res.fields.city).toBe("上海市");
    expect(res.stdAddress).toBe("上海市闵行区永跃路260号");
  });

  it("空地址:跳过 ML,返回空结果不崩溃", async () => {
    const res = await standardizeService.standardize("");
    expect(res.stdAddress).toBe("");
    expect(res.stdScore).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});