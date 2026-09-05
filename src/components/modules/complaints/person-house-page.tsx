"use client";

import { useRef, useState } from "react";
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
import type { PersonHouseTree as PersonHouseTreeData } from "@/server/api/routers/complains";
import {
  buildPersonHouseTree,
  type PersonHouseEntry,
} from "@/server/api/routers/complains-logic";

/** 每批 ML 解析的地址数:批越大两次刷新间隔越久,批越小请求越多。30 在"流畅生长"与"请求数"间折中。 */
const TREE_CHUNK = 30;

type Filters = {
  startDate?: string;
  endDate?: string;
  streetName?: string;
  gridName?: string;
  caseBigType?: string;
  caseSmallType?: string;
  caseSubType?: string;
};

export function PersonHousePage() {
  const [range, setRange] = useState<DateRangeValue>({});
  const [streetName, setStreetName] = useState("");
  const [gridName, setGridName] = useState("");
  const [caseBigType, setCaseBigType] = useState("");
  const [caseSmallType, setCaseSmallType] = useState("");
  const [caseSubType, setCaseSubType] = useState("");
  // applied: 已「查询」的筛选条件(驱动诉件列表)
  const [applied, setApplied] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // 人房树:增量分析状态(每批 ML 解析完即重建树并刷新 UI,实现"边算边显")
  const [treeData, setTreeData] = useState<PersonHouseTreeData | null>(null);
  const [treeProgress, setTreeProgress] = useState<{ parsed: number; total: number } | null>(null);
  const [treeRunning, setTreeRunning] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const analyzeSeq = useRef(0); // 取消令牌:重分析 / 重置时自增,作废在途的增量循环
  const utils = api.useUtils();

  // 街镇 / 网格 下拉数据:网格随街镇联动(带上 streetName 即只返回该镇下属网格)
  // 案件分类级联:小类随大类、子类随大类+小类
  // placeholderData 保留上一次结果:切换街镇时,网格选项不会因慢查询而短暂清空(导致"选了街镇网格不显示")
  const options = api.complains.filterOptions.useQuery(
    {
      streetName: streetName || undefined,
      caseBigType: caseBigType || undefined,
      caseSmallType: caseSmallType || undefined,
    },
    { placeholderData: (prev) => prev },
  );
  const streetOptions: SearchSelectOption[] = (options.data?.streets ?? []).map(
    (s) => ({ value: s, label: s }),
  );
  const gridOptions: SearchSelectOption[] = (options.data?.grids ?? []).map(
    (g) => ({ value: g, label: g }),
  );
  const bigTypeOptions: SearchSelectOption[] = (options.data?.bigTypes ?? []).map(
    (s) => ({ value: s, label: s }),
  );
  const smallTypeOptions: SearchSelectOption[] = (options.data?.smallTypes ?? []).map(
    (s) => ({ value: s, label: s }),
  );
  const subTypeOptions: SearchSelectOption[] = (options.data?.subTypes ?? []).map(
    (s) => ({ value: s, label: s }),
  );

  const listQuery = api.complains.list.useQuery(
    {
      startDate: applied?.startDate,
      endDate: applied?.endDate,
      streetName: applied?.streetName,
      gridName: applied?.gridName,
      caseBigType: applied?.caseBigType,
      caseSmallType: applied?.caseSmallType,
      caseSubType: applied?.caseSubType,
      page,
      pageSize,
    },
    { enabled: applied !== null },
  );

  // 由当前控件值组装筛选条件
  function buildFilters(): Filters {
    return {
      startDate: range.from,
      endDate: range.to,
      streetName: streetName || undefined,
      gridName: gridName || undefined,
      caseBigType: caseBigType || undefined,
      caseSmallType: caseSmallType || undefined,
      caseSubType: caseSubType || undefined,
    };
  }

  // 查询:只加载诉件列表
  function runSearch() {
    setPage(1);
    setApplied(buildFilters());
  }

  /**
   * 分析(增量):取原始行 → 按 chunk 调 mlFieldsBatch 标准化 → 每批重建树并刷新 UI。
   * 分析过程中人房树会随新区域/楼栋逐步生长;resetAll / 再次分析会通过 analyzeSeq 取消在途循环。
   */
  async function runAnalyze() {
    const f = buildFilters();
    const seq = ++analyzeSeq.current;
    setPage(1);
    setApplied(f);
    setTreeRunning(true);
    setTreeError(null);
    setTreeProgress({ parsed: 0, total: 0 });
    setTreeData(null);
    try {
      const rows = await utils.client.complains.personHouseRows.query({
        startDate: f.startDate,
        endDate: f.endDate,
        streetName: f.streetName,
        gridName: f.gridName,
        caseBigType: f.caseBigType,
        caseSmallType: f.caseSmallType,
        caseSubType: f.caseSubType,
        limit: 5000,
      });
      if (seq !== analyzeSeq.current) return; // 已被重置 / 重分析取消
      const entries: PersonHouseEntry[] = [];
      for (let i = 0; i < rows.length; i += TREE_CHUNK) {
        if (seq !== analyzeSeq.current) return;
        const slice = rows.slice(i, i + TREE_CHUNK);
        const addresses = slice.map((r) => r.stdAddress || r.address);
        const fieldsList = await utils.client.complains.mlFieldsBatch.query({ addresses });
        slice.forEach((r, idx) => {
          entries.push({ person: r, fields: fieldsList[idx] ?? {} });
        });
        if (seq !== analyzeSeq.current) return;
        // 每批重建整树并刷新:AnimatePresence 只对"真正新增"的区域/楼栋播放入场动画
        setTreeData(buildPersonHouseTree(entries));
        setTreeProgress({ parsed: Math.min(i + TREE_CHUNK, rows.length), total: rows.length });
      }
    } catch (e) {
      if (seq === analyzeSeq.current) {
        setTreeError(e instanceof Error ? e.message : "分析失败");
      }
      return;
    } finally {
      if (seq === analyzeSeq.current) setTreeRunning(false);
    }
  }

  function resetAll() {
    analyzeSeq.current++; // 取消在途增量循环
    setRange({});
    setStreetName("");
    setGridName("");
    setCaseBigType("");
    setCaseSmallType("");
    setCaseSubType("");
    setApplied(null);
    setTreeData(null);
    setTreeProgress(null);
    setTreeRunning(false);
    setTreeError(null);
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
            时间窗口 + 街镇/网格名称 + 案件大类/小类/子类。先选街镇,网格名称会随街镇联动;案件分类按
            大类 → 小类 → 子类 级联。
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

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">案件大类</p>
              <SearchSelect
                value={caseBigType || undefined}
                onValueChange={(v) => {
                  setCaseBigType(v);
                  setCaseSmallType(""); // 大类变化,清空并联动小类/子类
                  setCaseSubType("");
                }}
                options={bigTypeOptions}
                placeholder="选择大类"
                loading={options.isFetching}
                triggerClassName="h-9 w-44"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">案件小类</p>
              <SearchSelect
                value={caseSmallType || undefined}
                onValueChange={(v) => {
                  setCaseSmallType(v);
                  setCaseSubType(""); // 小类变化,清空并联动子类
                }}
                options={smallTypeOptions}
                placeholder={caseBigType ? "选择小类" : "请先选大类"}
                disabled={!caseBigType}
                loading={options.isFetching}
                triggerClassName="h-9 w-44"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">案件子类</p>
              <SearchSelect
                value={caseSubType || undefined}
                onValueChange={setCaseSubType}
                options={subTypeOptions}
                placeholder={caseSmallType ? "选择子类" : "请先选小类"}
                disabled={!caseSmallType}
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
            disabled={options.isFetching || treeRunning}
          >
            {treeRunning ? (
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

      {/* 人房树:点击「分析」后增量生长,位于诉件列表下方 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">人房树</CardTitle>
          <CardDescription>
            {treeError
              ? "分析失败,请重试。"
              : treeRunning
                ? `正在解析地址并构建人房树…已解析 ${treeProgress?.parsed ?? 0} / ${treeProgress?.total ?? 0} · ${treeData?.stats.areas ?? 0} 个区域`
                : treeData
                  ? `共 ${treeData.stats.areas} 个区域 / ${treeData.stats.buildings} 栋 / ${treeData.stats.rooms} 室 / ${treeData.stats.persons} 名人员。`
                  : "设置筛选条件后,点击上方「诉件列表」头部的「分析」生成人房树(过程中会逐步生长)。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {treeError && (
            <p className="text-sm text-destructive">分析失败:{treeError}</p>
          )}
          {!treeError && !treeData && !treeRunning && (
            <p className="text-sm text-muted-foreground">尚未分析。</p>
          )}
          {treeRunning && !treeData && (
            <p className="text-sm text-muted-foreground">正在加载原始诉件…</p>
          )}
          {treeData && <PersonHouseTree tree={treeData} />}
        </CardContent>
      </Card>


    </div>
  );
}
