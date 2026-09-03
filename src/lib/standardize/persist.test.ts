import { describe, expect, it } from "vitest";

import { mapFieldsToPersist } from "./persist";

describe("mapFieldsToPersist 标准化字段 → 表列名", () => {
  it("road_number 沿用 NER 原生键 → 写 roadNumber 列(不归一为 number)", () => {
    const out = mapFieldsToPersist({
      road: "七莘路",
      road_number: "38号",
    });
    expect(out.roadNumber).toBe("38号");
    expect(out.road).toBe("七莘路");
    // 不再产生 number 中间键
    expect((out as Record<string, unknown>).number).toBeUndefined();
  });

  it("农村组号 group → 写 groupField 列(group 是 MySQL 关键字)", () => {
    const out = mapFieldsToPersist({ village: "革新村", group: "五组" });
    expect(out.groupField).toBe("五组");
    expect(out.village).toBe("革新村");
  });

  it("sub_lane / location_type 映射为模型字段名 subLane / locationType", () => {
    const out = mapFieldsToPersist({
      sub_lane: "2支弄",
      locationType: "小区",
    });
    expect(out.subLane).toBe("2支弄");
    expect(out.locationType).toBe("小区");
  });

  it("覆盖式:空值归一为 null,不影响其它列", () => {
    const out = mapFieldsToPersist({ room: "502室" });
    expect(out.room).toBe("502室");
    expect(out.province).toBeNull();
    expect(out.city).toBeNull();
    expect(out.district).toBeNull();
    expect(out.roadNumber).toBeNull();
    expect(out.groupField).toBeNull();
    expect(Object.entries(out)).toHaveLength(26);
  });

  it("值去除首尾空白后写库", () => {
    const out = mapFieldsToPersist({ city: " 上海市 " });
    expect(out.city).toBe("上海市");
  });
});