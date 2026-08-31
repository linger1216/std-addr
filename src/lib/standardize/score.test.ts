import { describe, expect, it } from "vitest";

import { buildStdAddress } from "./build";
import { calcScore, formatScoreDetail } from "./score";

describe("buildStdAddress 标准地址拼接", () => {
  it("城市路弄号:行政去重 + 路弄号", () => {
    const s = buildStdAddress({
      province: "上海市", city: "上海市", district: "闵行区",
      street: "七宝镇", road: "永跃路", lane: "260弄", number: "38号",
      building: "5号", room: "502室",
    });
    // 注:building 末尾带"号"才被 replace(/号$/) 规整;模型输出的 "5号楼" 形态保持旧行为(5号楼号)
    expect(s).toBe("上海市闵行区七宝镇永跃路260弄38号5号502室");
  });

  it("road 逗号合并:七莘路,沪闵路 → 七莘路沪闵路", () => {
    expect(buildStdAddress({ road: "七莘路,沪闵路", number: "1号" })).toBe("七莘路沪闵路1号");
  });

  it("无门牌但有社区:路后补地标", () => {
    expect(buildStdAddress({ road: "南京西路", community: "恒隆广场" })).toBe("南京西路恒隆广场");
  });

  it("农村:村+宅+队+组+方向", () => {
    const s = buildStdAddress({
      village: "革新村", zhai: "徐家宅", team: "三队", group: "五组", direction: "东",
    });
    expect(s).toBe("革新村徐家宅三队五组东");
  });

  it("农村 subarea:村+子区域(无宅)→ 无门牌补地标分支先输出子区域,再村+子区域(旧行为)", () => {
    expect(buildStdAddress({ village: "革新村", subarea: "河东片" })).toBe("河东片革新村河东片");
  });

  it("楼栋房间:号楼+单元+层+室(室号规整)", () => {
    expect(buildStdAddress({ building: "16号", unit: "1单元", floor: "3层" })).toBe("16号1单元3层");
    expect(buildStdAddress({ room: "403室" })).toBe("403室");
    expect(buildStdAddress({ room: "403" })).toBe("403室");
  });

  it("空字段 → 空串", () => {
    expect(buildStdAddress({})).toBe("");
  });
});

describe("calcScore 标准评分(0-10)", () => {
  it("城市完整地址:行政+路弄号+楼栋+室号", () => {
    const score = calcScore({
      district: "闵行区", street: "七宝镇", road: "永跃路",
      lane: "260弄", number: "38号", building: "5号楼", room: "502室",
    });
    // 区县1+街镇2 + 路2+弄2+号2+楼栋1 + 室1 = 11 → cap 10
    expect(score).toBe(10);
  });

  it("无路无村城市地址:小区/POI +4 楼栋+1", () => {
    expect(calcScore({ community: "万博家园", building: "1号" })).toBe(5);
    expect(calcScore({ poi: "中心广场" })).toBe(4);
  });

  it("农村地址:村3 + 宅/队/组2", () => {
    expect(calcScore({ village: "革新村", zhai: "徐家宅" })).toBe(5);
  });

  it("行政分级:仅区县1;街镇2;居委3", () => {
    expect(calcScore({ district: "闵行区" })).toBe(1);
    expect(calcScore({ district: "闵行区", street: "七宝镇" })).toBe(2);
    expect(calcScore({ district: "闵行区", neighborhood: "航华居委" })).toBe(3);
  });

  it("室号+1 方向+1", () => {
    expect(calcScore({ room: "403室", direction: "北" })).toBe(2);
  });

  it("上限 10", () => {
    const full = {
      district: "闵行区", street: "七宝镇", road: "永跃路", lane: "260弄",
      number: "38号", building: "5号楼", room: "502室", direction: "南",
    };
    expect(calcScore(full)).toBe(10);
  });
});

describe("formatScoreDetail 评分明细", () => {
  it("明细行数与得分一致", () => {
    const lines = formatScoreDetail(8, { district: "闵行区", road: "永跃路", lane: "260弄", room: "502室" });
    expect(lines[0]).toBe("区：闵行区 (+1)");
    expect(lines[lines.length - 1]).toBe("\n得分：8 / 10");
  });
});