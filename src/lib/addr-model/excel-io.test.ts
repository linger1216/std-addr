import { describe, expect, it } from "vitest";

import {
  ADDR_FIELDS,
  columnOptions,
  decodeCsvBuffer,
  detectHeaderRow,
  extractAddresses,
  toExcelRows,
} from "./excel-io";

describe("detectHeaderRow 表头检测", () => {
  it("含'地址'关键字行 → 返回该行号", () => {
    expect(
      detectHeaderRow([
        ["序号", "名称"],
        ["地址", "备注"],
        ["a", "b"],
      ]),
    ).toBe(1);
  });

  it("含英文 address → 命中", () => {
    expect(detectHeaderRow([["address"], ["x"]])).toBe(0);
  });

  it("无关键字 → null(无表头)", () => {
    expect(detectHeaderRow([["上海市", "a"], ["北京市", "b"]])).toBeNull();
  });
});

describe("columnOptions 列选项", () => {
  it("有表头时用表头文本;空列给序号名", () => {
    const rows: string[][] = [
      ["序号", "", "地址"],
      ["1", "x", "地址A"],
    ];
    expect(columnOptions(rows, 0)).toEqual(["序号", "第2列", "地址"]);
  });

  it("无表头时给序号列名", () => {
    const rows: string[][] = [["a", "b"]];
    expect(columnOptions(rows, null)).toEqual(["第1列", "第2列"]);
  });
});

describe("extractAddresses 地址提取", () => {
  it("有表头:跳过表头行,取指定列并过滤空", () => {
    const rows: string[][] = [
      ["序号", "地址"],
      ["1", "闵行区华茂路32弄17号"],
      ["2", ""],
      ["3", "新市路1500号"],
    ];
    expect(extractAddresses(rows, 0, 1)).toEqual([
      "闵行区华茂路32弄17号",
      "新市路1500号",
    ]);
  });

  it("无表头:第一行即数据", () => {
    const rows: string[][] = [["地址A"], ["地址B"]];
    expect(extractAddresses(rows, null, 0)).toEqual(["地址A", "地址B"]);
  });
});

describe("toExcelRows 导出行", () => {
  it("源地址 + 27 要素(空要素留空)", () => {
    const rows = toExcelRows([
      {
        address: "闵行区华茂路32弄17号",
        data: { district: "闵行区", road: "华茂路", lane: "32弄", room: "17号" },
      },
      { address: "空结果", data: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!["源地址"]).toBe("闵行区华茂路32弄17号");
    expect(rows[0]!["区县"]).toBe("闵行区");
    expect(rows[0]!["路"]).toBe("华茂路");
    expect(rows[0]!["弄"]).toBe("32弄");
    expect(rows[0]!["室号"]).toBe("17号");
    expect(rows[0]!["城市"]).toBe("");
    expect(rows[1]!["省"] ?? rows[1]!["省份"]).toBe("");
  });

  it("列集合 = 源地址 + 27 要素", () => {
    const rows = toExcelRows([]);
    expect(rows).toEqual([]);
    expect(ADDR_FIELDS).toHaveLength(27);
    // 列集合验证:构造一行,keys 数 = 1 + 27
    const one = toExcelRows([{ address: "x", data: {} }])[0]!;
    expect(Object.keys(one)).toHaveLength(1 + ADDR_FIELDS.length);
  });
});
describe("decodeCsvBuffer 非 UTF-8 CSV 解码", () => {
  it("UTF-8 文本正常解码", () => {
    const bytes = new TextEncoder().encode("地址,备注\n闵行区,abc");
    expect(decodeCsvBuffer(bytes.buffer)).toBe("地址,备注\n闵行区,abc");
  });

  it("UTF-8 BOM → 去除 BOM", () => {
    const body = new TextEncoder().encode("闵行区");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    expect(decodeCsvBuffer(withBom.buffer)).toBe("闵行区");
  });

  it("GBK 字节(中文= D6D0 CEC4)→ gb18030 解码还原", () => {
    // "中文" 的 GBK 编码
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeCsvBuffer(gbk.buffer)).toBe("中文");
  });

  it("GBK 混合(地址列场景)→ 还原中文 + 保留 ASCII", () => {
    // "地址,A" GBK:地=B5D8 址=D6B7
    const gbk = new Uint8Array([0xb5, 0xd8, 0xd6, 0xb7, 0x2c, 0x41]);
    expect(decodeCsvBuffer(gbk.buffer)).toBe("地址,A");
  });

  it("UTF-16 LE BOM → 解码", () => {
    // "地址" UTF-16LE:地=0x3002? 不,地址:地 U+5730 -> 30 57;址 U+5740 -> 40 57
    const u16 = new Uint8Array([
      0xff, 0xfe, // BOM
      0x30, 0x57, 0x40, 0x57, // 地址
    ]);
    expect(decodeCsvBuffer(u16.buffer)).toBe("地址");
  });

  it("极端:随机字节不抛错(宽松兜底)", () => {
    const junk = new Uint8Array([0x80, 0x81, 0xfe, 0xff, 0x00, 0x41]);
    expect(typeof decodeCsvBuffer(junk.buffer)).toBe("string");
  });
});
