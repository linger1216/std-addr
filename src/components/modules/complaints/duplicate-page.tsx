"use client";

import { useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { api } from "@/trpc/react";
import {
  ComplaintsFilter,
  TownCard,
  DupTable,
  type ComplaintsFilters,
} from "./complaints-components";

export function DuplicateComplaintsPage() {
  const [filters, setFilters] = useState<ComplaintsFilters>({});
  const [applied, setApplied] = useState<ComplaintsFilters>({});

  const dup = api.complains.duplicateComplaints.useQuery(applied);

  return (
    <div className="space-y-6">
      <PageHeader
        title="重复诉件"
        description="基于 complains 表即时计算(不落库):同一标准地址(空则用原始地址)+城管类型+年月 出现≥2次,按街镇汇总。"
      />

      <ComplaintsFilter
        filters={filters}
        onChange={setFilters}
        onSearch={() => setApplied(filters)}
        onReset={() => setApplied({})}
        loading={dup.isFetching}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">重复诉件</CardTitle>
          <CardDescription>
            同一标准地址 + 城管类型 + 年月 出现 ≥2 次,按街镇汇总。共 {dup.data?.totalGroups ?? 0} 组。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dup.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {dup.error && (
            <p className="text-sm text-destructive">查询失败:{dup.error.message}</p>
          )}
          {dup.data &&
            (dup.data.towns.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {dup.data.towns.map((t) => (
                    <TownCard key={t.town} town={t} />
                  ))}
                </div>
                <DupTable groups={dup.data.groups} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">无重复诉件。</p>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
