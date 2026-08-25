/**
 * TanStack Table v9 全局列元数据扩展。
 * 让 ColumnDef 的 meta 支持 className(表格统一用它控制列宽,见 table.tsx)。
 * 通过 declaration merging 扩展空接口 ColumnMeta,所有表格共享,无需每处 as 强转。
 */
import "@tanstack/react-table";
import type {
  TableFeatures,
  RowData,
  CellData,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** 该列表头/单元格的 className(table.tsx 消费,用于控制列宽/对齐) */
    className?: string;
  }
}
