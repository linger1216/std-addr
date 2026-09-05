import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { standardizeService } from "@/server/services/standardizeService";
import {
  buildCommonFilter,
  whereSql,
  resolveTown,
  rollUpByTown,
  buildPersonHouseTree,
  type DupGroup,
  type PersonRow,
  type PersonHouseEntry,
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
   * 人房关联筛选下拉数据:从 complains 表提取去重的街镇(streetname)与
   * 网格名称(newworkgridname),供页面下拉框使用。
   * 网格名称随街镇联动:传入 streetName 时,网格仅取该街镇下属(街镇+网格 一对多)。
   */
  filterOptions: protectedProcedure
    .input(
      z.object({
        streetName: z.string().trim().optional(),
        caseBigType: z.string().trim().optional(),
        caseSmallType: z.string().trim().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const streets: { streetname: string }[] = await ctx.db.$queryRawUnsafe(
        `SELECT DISTINCT streetname FROM complains WHERE streetname IS NOT NULL AND streetname <> '' ORDER BY streetname`,
      );
      const gridSql = input.streetName
        ? `SELECT DISTINCT newworkgridname FROM complains WHERE streetname LIKE ? AND newworkgridname IS NOT NULL AND newworkgridname <> '' ORDER BY newworkgridname`
        : `SELECT DISTINCT newworkgridname FROM complains WHERE newworkgridname IS NOT NULL AND newworkgridname <> '' ORDER BY newworkgridname`;
      const grids: { newworkgridname: string }[] = input.streetName
        ? await ctx.db.$queryRawUnsafe(gridSql, `%${input.streetName}%`)
        : await ctx.db.$queryRawUnsafe(gridSql);

      // 案件分类级联:大类 → 小类(随大类) → 子类(随大类 + 小类)
      const bigTypes: { infobcname: string }[] = await ctx.db.$queryRawUnsafe(
        `SELECT DISTINCT infobcname FROM complains WHERE infobcname IS NOT NULL AND infobcname <> '' ORDER BY infobcname`,
      );
      const smallSql = input.caseBigType
        ? `SELECT DISTINCT infoscname FROM complains WHERE infobcname = ? AND infoscname IS NOT NULL AND infoscname <> '' ORDER BY infoscname`
        : `SELECT DISTINCT infoscname FROM complains WHERE infoscname IS NOT NULL AND infoscname <> '' ORDER BY infoscname`;
      const smallTypes: { infoscname: string }[] = input.caseBigType
        ? await ctx.db.$queryRawUnsafe(smallSql, input.caseBigType)
        : await ctx.db.$queryRawUnsafe(smallSql);
      const subSql =
        input.caseBigType && input.caseSmallType
          ? `SELECT DISTINCT infozcname FROM complains WHERE infobcname = ? AND infoscname = ? AND infozcname IS NOT NULL AND infozcname <> '' ORDER BY infozcname`
          : `SELECT DISTINCT infozcname FROM complains WHERE infozcname IS NOT NULL AND infozcname <> '' ORDER BY infozcname`;
      const subTypes: { infozcname: string }[] =
        input.caseBigType && input.caseSmallType
          ? await ctx.db.$queryRawUnsafe(subSql, input.caseBigType, input.caseSmallType)
          : await ctx.db.$queryRawUnsafe(subSql);

      return {
        streets: streets.map((s) => s.streetname),
        grids: grids.map((g) => g.newworkgridname),
        bigTypes: bigTypes.map((t) => t.infobcname),
        smallTypes: smallTypes.map((t) => t.infoscname),
        subTypes: subTypes.map((t) => t.infozcname),
      };
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
   * 人房关联(树):取非匿名(reporter 非空)诉件,在时间范围内对每人地址做标准地址解析,
   * 聚合成 小区 → 楼栋 → 室号 → 人员 的树(点击「分析」时按需计算,不落库)。
   */
  personHouseTree: protectedProcedure
    .input(
      z.object({
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
        streetName: z.string().trim().optional(),
        gridName: z.string().trim().optional(),
        caseBigType: z.string().trim().optional(),
        caseSmallType: z.string().trim().optional(),
        caseSubType: z.string().trim().optional(),
        limit: z.number().int().min(1).max(10000).default(2000),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { whereParts, params } = buildCommonFilter({
        startDate: input.startDate,
        endDate: input.endDate,
        streetName: input.streetName,
        gridName: input.gridName,
        caseBigType: input.caseBigType,
        caseSmallType: input.caseSmallType,
        caseSubType: input.caseSubType,
      });
      whereParts.unshift(`reporter IS NOT NULL AND reporter <> ''`);
      const w = whereSql(whereParts);

      const sql = `
        SELECT taskid, address, std_address, reporter, contactinfo,
               cgtype, discovertime, streetname
        FROM complains ${w}
        ORDER BY discovertime DESC
        LIMIT ?
      `;
      const raw: Array<{
        taskid: string;
        address: string | null;
        std_address: string | null;
        reporter: string | null;
        contactinfo: string | null;
        cgtype: string | null;
        discovertime: Date | string | null;
        streetname: string | null;
      }> = await ctx.db.$queryRawUnsafe(sql, ...params, input.limit);

      const rows: PersonRow[] = raw.map((r) => ({
        taskId: r.taskid,
        reporter: r.reporter ?? "",
        contactInfo: r.contactinfo ?? "",
        address: r.address ?? "",
        stdAddress: r.std_address ?? "",
        discoverTime: r.discovertime
          ? String(r.discovertime).slice(0, 10)
          : "",
        cgType: r.cgtype ?? "",
        streetName: r.streetname ?? "",
      }));

      // 并发标准化(分块,避免一次性打满模型服务);进程内 LRU 缓存命中重复地址
      // 人房关联只用 ML 接口:mlFields 直接取模型 NER 要素(小区/POI/村/楼栋/室号/路),
      // 不进标准地址库(region/community/subarea 匹配 + 评分)。
      const entries: PersonHouseEntry[] = [];
      const CONCURRENCY = 8;
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        const chunk = rows.slice(i, i + CONCURRENCY);
        const res = await Promise.all(
          chunk.map(async (row): Promise<PersonHouseEntry> => {
            const inputAddr = row.stdAddress || row.address;
            let fields: AddrFields = {};
            if (inputAddr) {
              try {
                const std = await standardizeService.mlFields(inputAddr);
                fields = {
                  community: std.community,
                  poi: std.poi,
                  village: std.village,
                  building: std.building,
                  room: std.room,
                  road: std.road,
                };
              } catch {
                fields = {};
              }
            }
            return { person: row, fields };
          }),
        );
        entries.push(...res);
      }

      return buildPersonHouseTree(entries);
    }),

  /**
   * 人房关联筛选下方的分页诉件列表:按 时间范围 + 街镇 + 网格名称 过滤,
   * 返回该条件下的诉件(不限匿名)分页结果。offset 分页,与仓库 list 约定一致。
   */
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
        streetName: z.string().trim().optional(),
        gridName: z.string().trim().optional(),
        caseBigType: z.string().trim().optional(),
        caseSmallType: z.string().trim().optional(),
        caseSubType: z.string().trim().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { whereParts, params } = buildCommonFilter({
        startDate: input.startDate,
        endDate: input.endDate,
        streetName: input.streetName,
        gridName: input.gridName,
        caseBigType: input.caseBigType,
        caseSmallType: input.caseSmallType,
        caseSubType: input.caseSubType,
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
});
