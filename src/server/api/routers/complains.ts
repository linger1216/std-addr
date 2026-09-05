import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { standardizeService } from "@/server/services/standardizeService";
import {
  buildCommonFilter,
  whereSql,
  resolveTown,
  rollUpByTown,
  type DupGroup,
  type AddrFields,
} from "./complains-logic";

export type {
  DupGroup,
  TownReport,
  PersonRow,
  PersonHouseTree,
  AreaKind,
  AreaNode,
  BuildingNode,
  RoomNode,
  UnitNode,
} from "./complains-logic";

/** 公共筛选入参(重复诉件 / 人房 共用) */
const filterInput = z.object({
  cgType: z.union([z.string(), z.array(z.string())]).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
});

/** 分页诉件列表的原始行类型($queryRawUnsafe 无法直接推断,手动声明以保留类型安全) */
type ComplaintsListRow = {
  taskid: string;
  address: string | null;
  std_address: string | null;
  reporter: string | null;
  contactinfo: string | null;
  cgtype: string | null;
  discovertime: Date | string | null;
  streetname: string | null;
  newworkgridname: string | null;
  infobcname: string | null;
  infoscname: string | null;
  infozcname: string | null;
};

export const complainsRouter = createTRPCRouter({
  /** 城管类型下拉数据(去重) */
  types: protectedProcedure.query(async ({ ctx }) => {
    const rows: { cgtype: string }[] = await ctx.db.$queryRawUnsafe(
      `SELECT DISTINCT cgtype FROM complains WHERE cgtype IS NOT NULL AND cgtype <> '' ORDER BY cgtype`,
    );
    return rows.map((r) => r.cgtype);
  }),

  /**
   * 人房关联筛选下拉数据:仅返回去重的街镇(streetname),供页面「街镇」下拉框使用。
   * 人房关联只用 时间 + 街镇(网格名称 / 案件大类小类子类筛选已移除)。
   */
  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const streets: { streetname: string }[] = await ctx.db.$queryRawUnsafe(
      `SELECT DISTINCT streetname FROM complains WHERE streetname IS NOT NULL AND streetname <> '' ORDER BY streetname`,
    );
    return { streets: streets.map((s) => s.streetname) };
  }),

  /** 重复诉件:按 标准地址(空则用原始地址) + 城管类型 + 年月 分组,HAVING COUNT>=2,按街镇汇总 */
  duplicateComplaints: protectedProcedure
    .input(filterInput)
    .query(async ({ ctx, input }) => {
      const { whereParts, params } = buildCommonFilter(input);
      // 排除空地址,避免空 group_key 噪声
      whereParts.push(`address IS NOT NULL AND address <> ''`);
      const w = whereSql(whereParts);

      const sql = `
        SELECT t.group_key, ANY_VALUE(t.address) AS address,
               ANY_VALUE(t.std_address) AS std_address, ANY_VALUE(t.cgtype) AS cgtype,
               t.y, t.m, t.cnt AS count,
               ANY_VALUE(t.streetname) AS streetname, ANY_VALUE(t.newworkgridname) AS newworkgridname,
               g.ids AS task_ids, g.dates AS discover_dates
        FROM (
          SELECT IF(std_address IS NOT NULL AND std_address <> '', std_address, address) AS group_key,
                 ANY_VALUE(address) AS address, ANY_VALUE(std_address) AS std_address,
                 ANY_VALUE(cgtype) AS cgtype,
                 ANY_VALUE(streetname) AS streetname, ANY_VALUE(newworkgridname) AS newworkgridname,
                 YEAR(discovertime) AS y, MONTH(discovertime) AS m, COUNT(*) AS cnt
          FROM complains ${w}
          GROUP BY group_key, cgtype, YEAR(discovertime), MONTH(discovertime)
          HAVING COUNT(*) >= 2
        ) t
        LEFT JOIN (
          SELECT group_key,
                 GROUP_CONCAT(taskid ORDER BY taskid SEPARATOR ',') AS ids,
                 GROUP_CONCAT(discovertime ORDER BY taskid SEPARATOR ',') AS dates
          FROM (
            SELECT IF(std_address IS NOT NULL AND std_address <> '', std_address, address) AS group_key,
                   taskid, discovertime
            FROM complains ${w}
          ) s
          GROUP BY group_key
        ) g ON g.group_key = t.group_key
        ORDER BY t.cnt DESC
      `;
      // ${w} 出现两次,参数也需传两份
      const raw: Array<{
        group_key: string;
        address: string | null;
        std_address: string | null;
        cgtype: string | null;
        y: number;
        m: number;
        count: number;
        streetname: string | null;
        newworkgridname: string | null;
        task_ids: string | null;
        discover_dates: string | null;
      }> = await ctx.db.$queryRawUnsafe(sql, ...params, ...params);

      const groups: DupGroup[] = raw.map((r) => {
        const dates = String(r.discover_dates ?? "")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
          .sort();
        const cg = r.cgtype ?? "";
        return {
          groupKey: r.group_key,
          address: r.address ?? "",
          stdAddress: r.std_address ?? "",
          cgType: cg,
          month: `${r.y}-${String(r.m).padStart(2, "0")}`,
          count: Number(r.count),
          taskIds: String(r.task_ids ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          discoverDates: dates,
          firstDate: dates[0] ?? "",
          lastDate: dates[dates.length - 1] ?? "",
          town: resolveTown(r.streetname, r.newworkgridname),
        };
      });

      return {
        groups,
        towns: rollUpByTown(groups),
        totalGroups: groups.length,
      };
    }),

  /**
   * 人房关联分页诉件查询:仅按 时间范围 + 街镇 过滤,返回该条件下的诉件(不限匿名)分页结果。
   * 人房树由前端拿到全量分页结果后逐条调用 mlFieldsBatch + buildPersonHouseTree 自行渲染。
   */
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
        streetName: z.string().trim().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { whereParts, params } = buildCommonFilter({
        startDate: input.startDate,
        endDate: input.endDate,
        streetName: input.streetName,
      });
      const w = whereSql(whereParts);

      const countSql = `SELECT COUNT(*) AS c FROM complains ${w}`;
      const listSql = `
        SELECT taskid, address, std_address, reporter, contactinfo,
               cgtype, discovertime, streetname, newworkgridname,
               infobcname, infoscname, infozcname
        FROM complains ${w}
        ORDER BY discovertime DESC
        LIMIT ? OFFSET ?
      `;
      const [countRow, raw] = await Promise.all([
        ctx.db.$queryRawUnsafe<{ c: bigint }[]>(countSql, ...params),
        ctx.db.$queryRawUnsafe<ComplaintsListRow[]>(
          listSql,
          ...params,
          input.pageSize,
          (input.page - 1) * input.pageSize,
        ),
      ]);

      const items = raw.map((r) => ({
        taskId: r.taskid,
        reporter: r.reporter ?? "",
        contactInfo: r.contactinfo ?? "",
        address: r.address ?? "",
        stdAddress: r.std_address ?? "",
        cgType: r.cgtype ?? "",
        discoverTime: r.discovertime ? String(r.discovertime).slice(0, 10) : "",
        streetName: r.streetname ?? "",
        gridName: r.newworkgridname ?? "",
        caseBigType: r.infobcname ?? "",
        caseSmallType: r.infoscname ?? "",
        caseSubType: r.infozcname ?? "",
      }));

      return {
        items,
        total: Number(countRow[0]?.c ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * 批量标准地址解析(仅取模型 NER 要素,不做 DB 实体匹配)。前端人房关联对每页诉件
   * 收集地址后批量调用,合并进前端大对象。单批上限 500 条;底层走模型 `POST /api/batch_format`
   * 一次吞吐整批(避免逐条串行请求压垮单进程模型服务),单批整体超时;模型不可达时整批降级为空字段
   * (前端退化为未分类区域)。返回顺序与入参地址一一对应。
   */
  mlFieldsBatch: protectedProcedure
    .input(z.object({ addresses: z.array(z.string()).max(500) }))
    // 必须是 mutation(而非 query):地址批量入参可达 500 条,若用 query 会塞进 GET URL,
    // 超过服务端 URI 长度上限返回 431(空响应体)→ 浏览器 res.json() 抛 "Unexpected end of JSON input"。
    // mutation 走 POST,入参在请求体,无 URL 长度限制。
    .mutation(async ({ input }) => {
      const ML_TIMEOUT = 60000;
      const fields = await standardizeService.mlFieldsBatch(
        input.addresses,
        ML_TIMEOUT,
      );
      return fields.map(
        (f) =>
          ({
            community: f.community,
            poi: f.poi,
            village: f.village,
            building: f.building,
            room: f.room,
            road: f.road,
            team: f.team,
            group: f.group,
          }) satisfies AddrFields,
      );
    }),
});
