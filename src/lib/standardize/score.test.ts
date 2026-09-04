import { describe, expect, it } from "vitest";

import { buildStdAddress } from "./build";
import { calcScore, classifyClass, formatScoreDetail } from "./score";

describe("buildStdAddress 标准地址拼接", () => {
  it("城市路弄号:行政去重 + 路弄号", () => {
    const s = buildStdAddress({
      province: "上海市", city: "上海市", district: "闵行区",
      street: "七宝镇", road: "永跃路", lane: "260弄", road_number: "38号",
      building: "5号", room: "502室",
    });
    // 注:building 已含"号"则保持 "5号"(不重复补号);模型输出的 "5号楼" 形态拼接为 "5号楼"(不再补 号楼号)
    expect(s).toBe("上海市闵行区七宝镇永跃路260弄38号5号502室");
  });

  it("road 逗号合并:七莘路,沪闵路 → 七莘路沪闵路", () => {
    expect(buildStdAddress({ road: "七莘路,沪闵路", road_number: "1号" })).toBe("七莘路沪闵路1号");
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

describe("classifyClass 地址分类", () => {
  it("农村:有村/宅", () => {
    expect(classifyClass({ village: "革新村" })).toBe("rural");
    expect(classifyClass({ zhai: "徐家宅" })).toBe("rural");
  });
  it("城市POI:有 poi", () => {
    expect(classifyClass({ poi: "中心广场" })).toBe("poi");
  });
  it("城市小区:有小区/子区域/路", () => {
    expect(classifyClass({ community: "万博家园" })).toBe("community");
    expect(classifyClass({ subarea: "河东片" })).toBe("community");
    expect(classifyClass({ road: "七莘路" })).toBe("community");
  });
  it("未归类:仅有行政", () => {
    expect(classifyClass({ district: "闵行区" })).toBe("unknown");
  });
});

describe("calcScore 标准评分(0-10,类内核心满=6,额外要素+1,封顶10)", () => {
  it("城市小区核心凑满(行政+路+弄+号+楼栋+室号)=6", () => {
    expect(calcScore({
      district: "闵行区", street: "七宝镇", road: "永跃路",
      lane: "260弄", road_number: "38号", building: "5号楼", room: "502室",
    })).toBe(6);
  });

  it("城市小区核心满 + 支弄/方向/单元/楼层 = 10", () => {
    expect(calcScore({
      district: "闵行区", street: "七宝镇", road: "永跃路",
      lane: "260弄", road_number: "38号", sub_lane: "1支弄",
      building: "5号楼", room: "502室", direction: "南", unit: "1单元", floor: "3层",
    })).toBe(10);
  });

  it("无路无村城市地址:仅 community+楼栋 → 1", () => {
    expect(calcScore({ community: "万博家园", building: "1号" })).toBe(1);
  });

  it("城市POI:中心广场无路无号 → 0;完整 POI=6,加方向单元=8", () => {
    expect(calcScore({ poi: "中心广场" })).toBe(0);
    expect(calcScore({
      poi: "中心广场", district: "闵行区", road: "南京西路", road_number: "1号", room: "301室",
    })).toBe(6);
    expect(calcScore({
      poi: "中心广场", district: "闵行区", road: "南京西路", road_number: "1号", room: "301室",
      direction: "北", unit: "2单元",
    })).toBe(8);
  });

  it("农村:村+宅 → base 2/3×6=2 + 宅额外1 = 3", () => {
    expect(calcScore({ village: "革新村", zhai: "徐家宅" })).toBe(3);
  });

  it("农村核心满 + 队/组/方向 = 9", () => {
    expect(calcScore({
      district: "闵行区", village: "革新村", room: "302号",
      team: "10队", group: "5组", direction: "东",
    })).toBe(9);
  });

  it("纯行政保留基础分:仅区县1;街镇2;居委3", () => {
    expect(calcScore({ district: "闵行区" })).toBe(1);
    expect(calcScore({ district: "闵行区", street: "七宝镇" })).toBe(2);
    expect(calcScore({ district: "闵行区", region: "航华居委" })).toBe(3);
  });

  it("室号+1 方向+1(未归类)", () => {
    expect(calcScore({ room: "403室", direction: "北" })).toBe(2);
  });

  it("上限 10:核心满 + 4 额外要素", () => {
    const full = {
      district: "闵行区", street: "七宝镇", road: "永跃路", lane: "260弄",
      road_number: "38号", building: "5号楼", room: "502室",
      sub_lane: "1支弄", direction: "南", unit: "1单元", floor: "3层",
    };
    expect(calcScore(full)).toBe(10);
  });
});

describe("formatScoreDetail 评分明细", () => {
  it("城市小区明细含类别/核心凑满度/得分", () => {
    const lines = formatScoreDetail(6, {
      district: "闵行区", road: "永跃路", lane: "260弄",
      road_number: "38号", building: "5号楼", room: "502室",
    });
    expect(lines[0]).toBe("类别：城市小区");
    expect(lines.some((l) => l.startsWith("核心凑满度：6/6"))).toBe(true);
    expect(lines[lines.length - 1]).toBe("\n得分：6 / 10");
  });

  it("未归类明细显示行政基础分", () => {
    const lines = formatScoreDetail(2, { district: "闵行区", street: "七宝镇" });
    expect(lines[0]).toBe("类别：未归类(纯行政)");
    expect(lines.some((l) => l.startsWith("街镇"))).toBe(true);
    expect(lines[lines.length - 1]).toBe("\n得分：2 / 10");
  });
});
