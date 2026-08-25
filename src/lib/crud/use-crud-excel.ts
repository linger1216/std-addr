/**
 * useCrudExcel —— 统一封装导出 + 导入调度。
 *
 * 负责:
 *   - 导出:fetchAll → 行映射 → XLSX → 触发浏览器下载,自动 toast
 *   - 导入:维护 open 状态 + 提供 ExcelImportDialog 全部 props,
 *           解析后的行经 coerceRow 转 mutation input,统一调用 importMut
 *
 * 不负责:
 *   - 字段定义(由调用方传 ImportField[])
 *   - 行映射逻辑(由调用方传 exportRow / coerceRow)
 *   - 文件下载实现(xlsx 直接 writeFile)
 *
 * 用法:
 *   const excel = useCrudExcel({
 *     moduleName: "小区",
 *     exportColumns: [{ header: "名称", width: 24 }, ...],
 *     exportRow: (r) => ({ "名称": r.name, "状态": r.status }),
 *     fetchAll: () => rpc.community.exportAll.fetch(currentFilter),
 *     importFields: [{ key: "name", label: "名称", required: true }, ...],
 *     coerceRow: (r) => ({ name: r.name, ... }),
 *     importMutation: importMut,
 *   });
 *
 *   // 导出按钮:
 *   <Button onClick={excel.handleExport}>导出</Button>
 *   // 导入 dialog:
 *   <ExcelImportDialog {...excel.importDialogProps} />
 */

"use client";

import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import {
  type ImportField,
  type ImportResult,
  type ImportRow,
} from "@/components/modules/shared/excel-import";
import { toApiError } from "@/lib/api/error";

/** 导出列定义 */
export type ExportColumn = {
  /** Excel 表头 */
  header: string;
  /** 列宽(字符数) */
  width?: number;
};

/** 任意 mutation 的最小子集(避免硬绑 tRPC 类型) */
/* eslint-disable @typescript-eslint/no-explicit-any */
type MinimalMutation<I, R> = {
  useMutation: (
    opts?: any,
  ) => {
    mutateAsync: (input: I) => Promise<R>;
    isPending: boolean;
    reset?: () => void;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 导入 mutation 返回值 */
export type ImportMutationResult = {
  created: number;
  errors: Array<{ index: number; message: string }>;
};

export type UseCrudExcelOptions<TRow, TImportInput, TInput = TImportInput[]> = {
  /** 模块中文名(用于文件名前缀、toast 文案) */
  moduleName: string;
  /** 导出列配置 */
  exportColumns: ExportColumn[];
  /** TRow → Excel 行对象 */
  exportRow: (row: TRow) => Record<string, unknown>;
  /** 拉取全量数据(已应用筛选)的 fetcher */
  fetchAll: () => Promise<TRow[]>;
  /** 导入字段配置(列头、必填、列宽) */
  importFields: ImportField[];
  /** ImportRow → mutation 入参(单行) */
  coerceRow: (row: ImportRow) => TImportInput;
  /** 单行入参数组 → 完整 mutation input(默认直接传数组,procedure 期望 { rows: [...] } 时由本字段包一层) */
  wrapInput?: (rows: TImportInput[]) => TInput;
  /** 导入 mutation(tRPC procedure 引用,需有 useMutation) */
  importMutation: MinimalMutation<TInput, ImportMutationResult>;
  /** 文案覆盖 */
  messages?: {
    /** 默认:已导出 N 条 */
    exportSuccess?: (n: number) => string;
    /** 默认:已导入 N 条(无失败);已导入 N · 失败 M(有失败) */
    importSuccess?: (res: ImportMutationResult) => string;
  };
};

export type UseCrudExcelResult = {
  /** 导入弹窗是否打开 */
  isImportOpen: boolean;
  /** 打开导入弹窗 */
  openImport: () => void;
  /** 关闭导入弹窗(供 dialog onOpenChange) */
  closeImport: () => void;
  /** 触发导出 */
  handleExport: () => Promise<void>;
  /** 直接喂给 <ExcelImportDialog /> 的 props */
  importDialogProps: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    fields: ImportField[];
    onSubmit: (rows: ImportRow[]) => Promise<ImportResult | undefined>;
    isPending: boolean;
    fileNamePrefix: string;
  };
};

export function useCrudExcel<
  TRow,
  TImportInput,
  TInput = TImportInput[],
>(
  opts: UseCrudExcelOptions<TRow, TImportInput, TInput>,
): UseCrudExcelResult {
  const {
    moduleName,
    exportColumns,
    exportRow,
    fetchAll,
    importFields,
    coerceRow,
    wrapInput,
    importMutation,
    messages,
  } = opts;

  // 实例化 import mutation 一次(避免在回调里再调 useMutation)
  const mutation = importMutation.useMutation({});

  const [isImportOpen, setImportOpen] = useState(false);

  async function handleExport() {
    try {
      const items = await fetchAll();
      const rows = items.map(exportRow);
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = exportColumns.map((c) => ({ wch: c.width ?? 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, moduleName);
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${moduleName}_${date}.xlsx`);
      toast.success(
        messages?.exportSuccess?.(rows.length) ?? `已导出 ${rows.length} 条`,
      );
    } catch (err) {
      toast.error(toApiError(err).message);
    }
  }

  async function handleImport(
    rows: ImportRow[],
  ): Promise<ImportResult | undefined> {
    try {
      const coerced = rows.map(coerceRow);
      const input = wrapInput ? wrapInput(coerced) : (coerced as unknown as TInput);
      const res = await mutation.mutateAsync(input);
      toast.success(
        messages?.importSuccess?.(res) ??
          (res.errors.length > 0
            ? `已导入 ${res.created} 条 · 失败 ${res.errors.length} 条`
            : `已导入 ${res.created} 条`),
      );
      return res;
    } catch (err) {
      toast.error(toApiError(err).message);
      return undefined;
    }
  }

  return {
    isImportOpen,
    openImport: () => setImportOpen(true),
    closeImport: () => setImportOpen(false),
    handleExport,
    importDialogProps: {
      open: isImportOpen,
      onOpenChange: (v: boolean) => setImportOpen(v),
      title: `导入${moduleName}`,
      fields: importFields,
      onSubmit: handleImport,
      isPending: mutation.isPending,
      fileNamePrefix: `${moduleName}导入模板`,
    },
  };
}