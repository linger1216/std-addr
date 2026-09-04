"use client";

import { useState } from "react";
import { FlaskConical, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";

import { api } from "@/trpc/react";
import { PersonHouseTree } from "./complaints-components";
import { ComplaintsListTable } from "./complaints-list-table";

type Filters = {
  startDate?: string;
  endDate?: string;
  streetName?: string;
  gridName?: string;
};

export function PersonHousePage() {
  const [range, setRange] = useState<DateRangeValue>({});
  const [streetName, setStreetName] = useState("");
  const [gridName, setGridName] = useState("");
  // applied: 已「查询」的筛选条件(驱动诉件列表);treeApplied: 已「分析」的筛选条件(驱动人房树)
  const [applied, setApplied] = useState<Filters | null>(null);
  const [treeApplied, setTreeApplied] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 街镇 / 网格 下拉数据:网格随街镇联动(带上 streetName 即只返回该镇下属网格)
  // placeholderData 保留上一次结果:切换街镇时,网格选项不会因慢查询而短暂清空(导致"选了街镇网格不显示")
  const options = api.complains.filterOptions.useQuery(
    { streetName: streetName || undefined },
    { placeholderData: (prev) => prev },
  );
  const streetOptions: SearchSelectOption[] = (options.data?.streets ?? []).map(
    (s) => ({ value: s, label: s }),
  );
  const gridOptions: SearchSelectOption[] = (options.data?.grids ?? []).map(
    (g) => ({ value: g, label: g }),
  );

  const listQuery = api.complains.list.useQuery(
    {
      startDate: applied?.startDate,
      endDate: applied?.endDate,
      streetName: applied?.streetName,
      gridName: applied?.gridName,
      page,
      pageSize,
    },
    { enabled: applied !== null },
  );

  const treeQuery = api.complains.personHouseTree.useQuery(
    treeApplied ?? { startDate: undefined, endDate: undefined },
    { enabled: treeApplied !== null },
  );

  // 由当前控件值组装筛选条件
  function buildFilters(): Filters {
    return {
      startDate: range.from,
      endDate: range.to,
      streetName: streetName || undefined,
      gridName: gridName || undefined,
    };
  }

  // 查询:只加载诉件列表
  function runSearch() {
    setPage(1);
    setApplied(buildFilters());
  }

  // 分析:在诉件列表之上构建人房树(同时保证列表已按当前筛选加载)
  function runAnalyze() {
    const f = buildFilters();
    setPage(1);
    setApplied(f);
    setTreeApplied(f);
  }

  function resetAll() {
    setRange({});
    setStreetName("");
    setGridName("");
    setApplied(null);
    setTreeApplied(null);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="人房关联"
        description="按时间窗口 + 街镇/网格名称筛选后「查询」诉件列表;点击列表上方的「分析」,对诉求人地址用模型接口解析,聚合成 区域(小区/POI/村) → 楼栋 → 室号 → 人员 的树(不落库)。"
      />

      {/* 筛选:搜索 → 诉件列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
          <CardDescription>
            时间窗口 + 街镇/网格名称。先选街镇,网格名称会随街镇联动。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">时间窗口</p>
              <DateRangePicker
                value={range}
                onChange={setRange}
                placeholder="开始 ~ 结束"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">街镇</p>
              <SearchSelect
                value={streetName || undefined}
                onValueChange={(v) => {
                  setStreetName(v);
                  setGridName(""); // 街镇变化,清空并联动网格选项
                }}
                options={streetOptions}
                placeholder="选择街镇"
                triggerClassName="h-9 w-44"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">网格名称(片区)</p>
              <SearchSelect
                value={gridName || undefined}
                onValueChange={setGridName}
                options={gridOptions}
                placeholder={streetName ? "选择网格" : "请先选街镇"}
                disabled={!streetName}
                loading={options.isFetching}
                triggerClassName="h-9 w-44"
              />
            </div>

            <Button
              onClick={runSearch}
              disabled={options.isFetching || listQuery.isFetching}
            >
              {listQuery.isFetching ? (
                <Spinner className="mr-1 size-4" />
              ) : (
                <Search className="mr-1 size-4" />
              )}
              查询
            </Button>
            <Button variant="outline" onClick={resetAll}>
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 人房树:点击「分析」后才出现,位于诉件列表之上 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">人房树</CardTitle>
          <CardDescription>
            {treeApplied === null
              ? "设置筛选条件后,点击下方「诉件列表」头部的「分析」生成人房树。"
              : treeQuery.isFetching
                ? "正在解析地址并构建人房树…"
                : `共 ${treeQuery.data?.stats.areas ?? 0} 个区域 / ${treeQuery.data?.stats.buildings ?? 0} 栋 / ${treeQuery.data?.stats.persons ?? 0} 名人员。`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {treeApplied === null && (
            <p className="text-sm text-muted-foreground">尚未分析。</p>
          )}
          {treeQuery.isError && (
            <p className="text-sm text-destructive">
              分析失败:{treeQuery.error.message}
            </p>
          )}
          {treeQuery.data && <PersonHouseTree tree={treeQuery.data} />}
        </CardContent>
      </Card>

      {/* 诉件列表:头部「分析」按钮,点击后上方人房树出现 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">诉件列表</CardTitle>
            <CardDescription>
              {applied === null
                ? "设置筛选条件后点击「查询」查看诉件分页列表。"
                : listQuery.isFetching
                  ? "正在加载诉件列表…"
                  : `共 ${listQuery.data?.total ?? 0} 条诉件。`}
            </CardDescription>
          </div>
          <Button
            onClick={runAnalyze}
            disabled={options.isFetching || treeQuery.isFetching}
          >
            {treeQuery.isFetching ? (
              <Spinner className="mr-1 size-4" />
            ) : (
              <FlaskConical className="mr-1 size-4" />
            )}
            分析
          </Button>
        </CardHeader>
        <CardContent>
          {applied === null && (
            <p className="text-sm text-muted-foreground">尚未查询。</p>
          )}
          {listQuery.isError && (
            <p className="text-sm text-destructive">
              加载失败:{listQuery.error.message}
            </p>
          )}
          {listQuery.data && (
            <ComplaintsListTable
              items={listQuery.data.items}
              total={listQuery.data.total}
              page={listQuery.data.page}
              pageSize={listQuery.data.pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
