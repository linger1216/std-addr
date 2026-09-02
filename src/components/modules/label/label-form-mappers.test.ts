import { describe, expect, it } from "vitest";
import { toForm, toSubmit, formSchema, type LabelDetailLike } from "./label-form-mappers";

function makeDetail(overrides: Partial<LabelDetailLike> = {}): LabelDetailLike {
  return {
    id: "l-1",
    name: "province",
    label: "省份",
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(标签详情 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,状态默认启用", () => {
    const f = toForm(null);
    expect(f.name).toBe("");
    expect(f.label).toBe("");
    expect(f.status).toBe(1);
    expect(f.id).toBeNull();
  });

  it("详情 → 表单初值;label 为 null 时归一为空串", () => {
    const f = toForm(makeDetail({ label: null }));
    expect(f.id).toBe("l-1");
    expect(f.name).toBe("province");
    expect(f.label).toBe("");
    expect(f.status).toBe(1);
  });

  it("禁用状态归 0", () => {
    expect(toForm(makeDetail({ status: 0 })).status).toBe(0);
  });

  it("P0-6:data 统一配置拆出数据源 + prefix/suffix + skipRate", () => {
    const f = toForm(
      makeDetail({
        data: {
          randomValue: { name: "road" },
          randomNumber: { format: "arabic", minDigits: 1, maxDigits: 2 },
          prefix: { texts: ["大"], skipRate: 30 },
          suffix: { texts: ["路"], skipRate: 10 },
          skipRate: 25,
        },
      }),
    );
    expect(f.data?.randomValue?.name).toBe("road");
    expect(f.data?.randomNumber?.minDigits).toBe(1);
    expect(f.prefix?.texts).toEqual(["大"]);
    expect(f.prefix?.skipRate).toBe(30);
    expect(f.suffix?.skipRate).toBe(10);
    expect(f.skipRate).toBe(25);
  });

  it("P0-6:旧数据(prefix/suffix 独立列)→ 表单回退读取", () => {
    const f = toForm(
      makeDetail({
        data: { randomValue: { name: "road" } },
        prefix: { texts: ["大"], skipRate: 30 },
        suffix: { texts: ["号"], skipRate: 60 },
      }),
    );
    expect(f.data?.randomValue?.name).toBe("road");
    expect(f.prefix?.skipRate).toBe(30);
    expect(f.suffix?.texts).toEqual(["号"]);
  });

  it("P0-6:data 兼容旧字母 key {A,B,C,D}(读时迁移)", () => {
    const f = toForm(
      makeDetail({
        data: { A: { name: "road" }, D: { minLength: 2, maxLength: 4 } },
      }),
    );
    expect(f.data?.randomValue?.name).toBe("road");
    expect(f.data?.randomChinese?.minLength).toBe(2);
  });

  it("P0-6:data 为 null/非法 → 归一 null", () => {
    expect(toForm(makeDetail({ data: null })).data).toBeNull();
    expect(toForm(makeDetail({ data: "not-an-object" })).data).toBeNull();
  });

  it("P0-6:prefix/suffix 的 skipRate 往返不丢(跳过率保存回归)", () => {
    const f = toForm(
      makeDetail({
        data: {
          randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 },
          prefix: { texts: [], skipRate: 30 },
          suffix: { texts: ["号"], skipRate: 60 },
        },
      }),
    );
    const submitted = toSubmit(f);
    // 三段合并进统一 data
    expect(submitted.data?.randomNumber?.maxDigits).toBe(4);
    expect(submitted.data?.prefix?.skipRate).toBe(30);
    expect(submitted.data?.prefix?.texts).toEqual([]);
    expect(submitted.data?.suffix?.skipRate).toBe(60);
    expect(submitted.data?.suffix?.texts).toEqual(["号"]);
    // 独立列不再携带
    expect(submitted.prefix).toBeUndefined();
    expect(submitted.suffix).toBeUndefined();
  });
});

describe("toSubmit(标签表单值 → 提交值)", () => {
  it("name / label 自动 trim(默认率也写入 data)", () => {
    const v = toSubmit({ id: null, name: " city ", label: " 城市 ", status: 1, skipRate: 15, noiseRate: 15 });
    expect(v.name).toBe("city");
    expect(v.label).toBe("城市");
    expect(v.data).toEqual({ skipRate: 15, noiseRate: 15 });
  });

  it("空白 label → 空串(保留,后端区分空 vs 未传)", () => {
    const v = toSubmit({ id: null, name: "x", label: "   ", status: 1, skipRate: 15, noiseRate: 15 });
    expect(v.label).toBe("");
  });

  it("P0-6:data/prefix/suffix/skipRate/noiseRate 合并进统一 data;独立列不再携带", () => {
    const v = toSubmit({
      id: null,
      name: "road",
      label: "",
      status: 1,
      skipRate: 30,
      noiseRate: 20,
      data: { customValue: { list: ["甲", "乙"] } },
      prefix: { texts: ["大"], skipRate: 20 },
      suffix: null,
    });
    expect(v.data?.customValue?.list).toEqual(["甲", "乙"]);
    expect(v.data?.prefix).toEqual({ texts: ["大"], skipRate: 20 });
    expect(v.data?.skipRate).toBe(30);
    expect(v.data?.noiseRate).toBe(20);
    expect(v.data?.suffix).toBeUndefined();
    expect(v.prefix).toBeUndefined();
    expect(v.suffix).toBeUndefined();
  });

  it("全空(默认率)→ data 至少写入 skipRate/noiseRate 默认值", () => {
    const v = toSubmit({
      id: null, name: "x", label: "", status: 1, skipRate: 15, noiseRate: 15,
      data: null, prefix: null, suffix: null,
    });
    expect(v.data).toEqual({ skipRate: 15, noiseRate: 15 });
  });

  it("显式 0 / 非默认率 → 原样写入,保存重开往返稳定", () => {
    const v = toSubmit({
      id: null, name: "x", label: "", status: 1, skipRate: 0, noiseRate: 0,
      data: null, prefix: null, suffix: null,
    });
    expect(v.data).toEqual({ skipRate: 0, noiseRate: 0 });
    const v2 = toSubmit({
      id: null, name: "x", label: "", status: 1, skipRate: 0, noiseRate: 15,
      data: { randomNumber: { format: "arabic", minDigits: 1, maxDigits: 2 } },
      prefix: null, suffix: null,
    });
    expect(v2.data?.skipRate).toBe(0);
    expect(v2.data?.noiseRate).toBe(15);
    expect(v2.data?.randomNumber?.maxDigits).toBe(2);
  });
});

describe("formSchema(zod 校验)", () => {
  it("name 必填且 ≤ 100 字", () => {
    expect(formSchema.safeParse({ id: null, name: "", label: "", status: 1, skipRate: 0, noiseRate: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x".repeat(101), label: "", status: 1, skipRate: 0, noiseRate: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "city", label: "", status: 1, skipRate: 0, noiseRate: 0 }).success).toBe(true);
  });

  it("label 限长 255", () => {
    expect(
      formSchema.safeParse({ id: null, name: "x", label: "y".repeat(256), status: 1, skipRate: 0, noiseRate: 0 }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({ id: null, name: "x", label: "标签", status: 1, skipRate: 0, noiseRate: 0 }).success,
    ).toBe(true);
  });

  it("status 仅接受 0 或 1", () => {
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 2 as unknown as 1, skipRate: 0, noiseRate: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1, skipRate: 0, noiseRate: 0 }).success).toBe(true);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 0, skipRate: 0, noiseRate: 0 }).success).toBe(true);
  });

  it("skipRate / noiseRate 范围 0~100 校验", () => {
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1, skipRate: -1, noiseRate: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1, skipRate: 101, noiseRate: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1, skipRate: 30, noiseRate: 0 }).success).toBe(true);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1, skipRate: 0, noiseRate: 101 }).success).toBe(false);
  });
});