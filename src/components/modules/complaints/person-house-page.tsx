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
import { ComplaintsListTable, type ComplaintsListItem } from "./complaints-list-table";
import {
  buildPersonHouseTree,
  type AddrFields,
  type PersonHouseEntry,
  type PersonRow,
  type PersonHouseTree as PersonHouseTreeData,
} from "@/server/api/routers/complains-logic";

type Filters = {
  startDate?: string;
  endDate?: string;
  streetName?: string;
};

const PAGE_SIZE = 200;
const ML_BATCH_SIZE = 500;

export function PersonHousePage() {
  const [range, setRange] = useState<DateRangeValue>({});
  const [streetName, setStreetName] = useState("");

  // 已「查询」的筛选条件(驱动诉件列表);树分析复用同一条件
  const [applied, setApplied] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 前端自管的人房树数据 / 进度 / 运行状态
  const [treeData, setTreeData] = useState<PersonHouseTreeData | null>(null);
  const [treeProgress, setTreeProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [treeRunning, setTreeRunning] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // 取消令牌:每次「分析」自增,旧轮询检测到序列变化即中止,避免并发/重复渲染
  const analyzeSeqRef = useRef(0);

  const utils = api.useUtils();

  // 人房分析批量解析模型要素:必须是 mutation(POST),不能走 query(GET 会把几百条地址塞进 URL 超限)
  const mlFieldsBatch = api.complains.mlFieldsBatch.useMutation();

  // 街镇下拉数据(仅街镇)
  const options = api.complains.filterOptions.useQuery(undefined, {
    placeholderData: (prev) => prev,
  });
  const streetOptions: SearchSelectOption[] = (options.data?.streets ?? []).map(
    (s) => ({ value: s, label: s }),
  );

  // 诉件列表:按 时间 + 街镇 分页(前端分析时再逐页全量拉取 + 调 ML)
  const listQuery = api.complains.list.useQuery(
    {
      startDate: applied?.startDate,
      endDate: applied?.endDate,
      streetName: applied?.streetName,
      page,
      pageSize,
    },
    { enabled: applied !== null },
  );

  function buildFilters(): Filters {
    return {
      startDate: range.from,
      endDate: range.to,
      streetName: streetName || undefined,
    };
  }

  // 查询:只加载诉件列表(分页)
  function runSearch() {
    setPage(1);
    setApplied(buildFilters());
  }

  function toPerson(it: {
    taskId: string;
    reporter: string;
    contactInfo: string;
    address: string;
    stdAddress: string;
    cgType: string;
    discoverTime: string;
    streetName: string;
  }): PersonRow {
    return {
      taskId: it.taskId,
      reporter: it.reporter,
      contactInfo: it.contactInfo,
      address: it.address,
      stdAddress: it.stdAddress,
      discoverTime: it.discoverTime,
      cgType: it.cgType,
      streetName: it.streetName,
    };
  }

  /**
   * 前端人房分析:按 时间 + 街镇 分页拉取全部诉件 → 逐条地址批量调 mlFieldsBatch
   * → 合并进大对象 → buildPersonHouseTree → 实时渲染(setTreeData 每页重建一次)。
   * 不落库、无动画;模型不可达时 mlFieldsBatch 降级空字段,树退化为未分类区域。
   */
  async function runAnalyze() {
    // 分析当前已查询的筛选条件(列表分页用的同一条件)
    const f = applied ?? buildFilters();
    const seq = analyzeSeqRef.current + 1;
    analyzeSeqRef.current = seq;

    setTreeRunning(true);
    setTreeError(null);
    setTreeData(null);
    setTreeProgress({ processed: 0, total: 0 });

    const entries: PersonHouseEntry[] = [];
    try {
      let page = 1;
      let total = 0;
      let more = true;
      while (more) {
        if (analyzeSeqRef.current !== seq) return; // 被新一轮分析取消
        const res = await utils.complains.list.fetch({
          startDate: f.startDate,
          endDate: f.endDate,
          streetName: f.streetName,
          page,
          pageSize: PAGE_SIZE,
        });
        if (page === 1) total = res.total;

        // 仅取非匿名(reporter 非空)的诉件作为"人";其余跳过(无人员信息)
        const rows = res.items
          .filter((it) => it.reporter?.trim())
          .map((it) => ({
            person: toPerson(it),
            addr: (it.stdAddress || it.address).trim(),
          }));

        // 收集非空地址,按 ML_BATCH_SIZE 分批调用(返回顺序与入参一一对应)
        const addrList = rows.map((r) => r.addr).filter(Boolean);
        const fieldsByAddr = new Map<string, AddrFields>();
        for (let i = 0; i < addrList.length; i += ML_BATCH_SIZE) {
          if (analyzeSeqRef.current !== seq) return;
          const batch = addrList.slice(i, i + ML_BATCH_SIZE);
          const fieldsArr = await mlFieldsBatch.mutateAsync({
            addresses: batch,
          });
          batch.forEach((a, j) => fieldsByAddr.set(a, fieldsArr[j] ?? {}));
        }

        for (const r of rows) {
          const fields = r.addr ? (fieldsByAddr.get(r.addr) ?? {}) : {};
          entries.push({ person: r.person, fields });
        }

        const processed = Math.min(page * PAGE_SIZE, total);
        setTreeProgress({ processed, total });
        setTreeData(buildPersonHouseTree(entries));

        if (page * PAGE_SIZE >= total || res.items.length === 0) more = false;
        else page += 1;
      }
      setTreeRunning(false);
    } catch (err) {
      if (analyzeSeqRef.current !== seq) return;
      setTreeRunning(false);
      setTreeError(err instanceof Error ? err.message : String(err));
    }
  }

  function resetAll() {
    analyzeSeqRef.current += 1; // 取消进行中的分析
    setRange({});
    setStreetName("");
    setApplied(null);
    setPage(1);
    setTreeData(null);
    setTreeProgress(null);
    setTreeRunning(false);
    setTreeError(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="人房关联"
        description="按时间窗口 + 街镇筛选后点击「分析」:前端拉取该条件下全部诉件,逐条用模型接口解析地址,
          聚合成 区域(小区/村/POI) → 楼栋/队组 → 室号 → 人员 的树(纯前端渲染,不落库)。"
      />

      {/* 筛选:时间 + 街镇 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">筛选</CardTitle>
          <CardDescription>时间窗口 + 街镇。点击「分析」即按当前条件构建人房树。</CardDescription>
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
                onValueChange={setStreetName}
                options={streetOptions}
                placeholder="选择街镇"
                loading={options.isFetching}
                triggerClassName="h-9 w-44"
              />
            </div>

            <Button onClick={runSearch} disabled={treeRunning || listQuery.isFetching}>
              <Search className="mr-1 size-4" />
              查询
            </Button>
            <Button variant="outline" onClick={resetAll} disabled={treeRunning}>
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 诉件列表:头部「分析」按钮,点击后下方人房树出现 */}
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
          <Button onClick={runAnalyze} disabled={treeRunning || (!applied && !streetName && !range.from)}>
            {treeRunning ? (
              <Spinner className="mr-1 size-4" />
            ) : (
              <FlaskConical className="mr-1 size-4" />
            )}
            {treeRunning ? "分析中…" : "分析"}
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

      {/* 人房树 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">人房树</CardTitle>
          <CardDescription>
            {treeData
              ? `共 ${treeData.stats.areas} 个区域 / ${treeData.stats.buildings} 栋(含村队组) / ${treeData.stats.rooms} 室号 / ${treeData.stats.persons} 名人员。`
              : treeRunning
                ? treeProgress
                  ? `正在解析地址并构建人房树…(已分析 ${treeProgress.processed}/${treeProgress.total})`
                  : "正在解析地址并构建人房树…"
                : "设置筛选条件后点击「分析」生成人房树。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!treeRunning && !treeData && !treeError && (
            <p className="text-sm text-muted-foreground">尚未分析。</p>
          )}
          {treeError && (
            <p className="text-sm text-destructive">分析失败:{treeError}</p>
          )}
          {treeData && <PersonHouseTree tree={treeData} />}
        </CardContent>
      </Card>
    </div>
  );
}
