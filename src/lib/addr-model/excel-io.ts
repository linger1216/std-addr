/**
 * 地址模型 · 批量解析的 Excel/CSV 读写工具(纯函数,可测)。
 *
 *  - 导入:读取工作簿 → sheet 列表 → 指定 sheet 的二维数组 → 表头行检测 → 地址列提取
 *  - 导出:解析结果(源地址 + 27 地址要素)写为 .xlsx 并触发下载
 */
import * as XLSX from "xlsx";

import { ADDR_FIELDS, FIELD_KEY_TO_ZH } from "./fields";


/** 工作簿读取结果:sheet 名列表(惰性,行数据按需取) */
export interface WorkbookInfo {
  sheets: string[];
  /** 按 sheet 名读二维数组(单元格统一转字符串,空为 "") */
  rowsOf: (sheet: string) => string[][];
}

/**
 * 字节解码 CSV 文本:优先 UTF-8(含 BOM);非 UTF-8(如 Windows 导出的 GBK/GB2312)
 * 自动降级 gb18030 解码;UTF-16 LE BOM 也支持。
 * xlsx/xls 二进制不经过此函数(保持 array 路径)。
 */
export function decodeCsvBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);

  // 1) BOM 检测
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    // UTF-8 BOM
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    // UTF-16 LE BOM
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }

  // 2) 严格 UTF-8:合法序列直接用(避免误伤正常 UTF-8 文件)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 3) UTF-8 非法 → 大概率 GBK/GB2312/GB18030(Windows Excel 导出场景)
    try {
      return new TextDecoder("gb18030").decode(bytes);
    } catch {
      // 4) 极端兜底:宽松 UTF-8(替换非法字节,尽量保留 ASCII)
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

/** 读取 Excel/CSV 文件 → WorkbookInfo(CSV 先解码文本,兼容非 UTF-8 编码) */
export async function readWorkbook(file: File): Promise<WorkbookInfo> {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const readInput = isCsv ? decodeCsvBuffer(buffer) : buffer;
  const wb = XLSX.read(readInput, {
    type: isCsv ? "string" : "array",
  });
  const sheetNames = wb.SheetNames;
  return {
    sheets: sheetNames,
    rowsOf: (sheet: string): string[][] => {
      const ws = wb.Sheets[sheet];
      if (!ws) return [];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: "",
      });
      return aoa.map((row) => row.map((cell) => toText(cell)));
    },
  };
}

/**
 * 数据行常见列名(表头行检测时命中任一即视为表头行)
 */
const HEADER_KEYWORDS = ["地址", "address", "addr", "详细地址", "路段"];

/**
 * 检测表头行:遍历前 8 行,返回第一个包含地址关键字列的行号;
 * 找不到返回 null(视为无表头,第一行就是数据)。
 */
export function detectHeaderRow(rows: string[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i]!;
    if (
      row.some((cell) =>
        HEADER_KEYWORDS.some((k) => cell.toLowerCase().includes(k)),
      )
    ) {
      return i;
    }
  }
  return null;
}

/** 候选地址列:表头行中各列(供用户选择,无表头时给序号列名) */
export function columnOptions(
  rows: string[][],
  headerRow: number | null,
): string[] {
  if (rows.length === 0) return [];
  const header = headerRow != null ? (rows[headerRow] ?? []) : [];
  const from = headerRow != null ? headerRow + 1 : 0;
  const width = Math.max(header.length, ...rows.slice(from).map((r) => r.length));
  return Array.from({ length: width }, (_, i) => {
    const label = header[i]?.trim() ?? `第${i + 1}列`;
    return (label || `第${i + 1}列`).slice(0, 30);
  });
}

/** 从指定列提取地址列表(有表头时跳过表头行及之前;空值过滤) */
export function extractAddresses(
  rows: string[][],
  headerRow: number | null,
  colIndex: number,
): string[] {
  const from = headerRow != null ? headerRow + 1 : 0;
  const out: string[] = [];
  for (let i = from; i < rows.length; i++) {
    const v = rows[i]?.[colIndex]?.trim();
    if (v) out.push(v);
  }
  return out;
}

/** 解析结果 → Excel 行(源地址 + 27 要素;模型未输出的字段留空) */
export function toExcelRows(
  results: Array<{ address: string; data: Record<string, unknown> | null }>,
): Array<Record<string, string>> {
  return results.map((r) => {
    const row: Record<string, string> = { "源地址": r.address };
    for (const zh of ADDR_FIELDS) row[zh] = "";
    if (r.data) {
      for (const [k, v] of Object.entries(r.data)) {
        if (v == null) continue;
        const zh = FIELD_KEY_TO_ZH[k];
        if (zh) row[zh] = toText(v);
      }
    }
    return row;
  });
}

/** 下载解析结果 xlsx(列:源地址 + 27 要素) */
export function downloadResultsXlsx(
  results: Array<{ address: string; data: Record<string, unknown> | null }>,
  filename = "addr-model-batch-results.xlsx",
): void {
  const rows = toExcelRows(results);
  const header = ["源地址", ...ADDR_FIELDS];
  const aoa = [header, ...rows.map((r) => header.map((h) => r[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "解析结果");
  XLSX.writeFile(wb, filename);
}

/** unknown → 可展示字符串(仅 string/number/boolean;其它返回空串) */
function toText(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}
