import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { Prisma, type PrismaClient } from "../../../../generated/prisma/client";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import {
  regionCreateSchema,
  regionImportSchema,
  regionUpdateSchema,
} from "@/lib/validators/region";
import {
  flattenRegionJson,
  injectRegionAdminRoots,
  inferRegionType,
  type RegionImportItem,
} from "@/lib/region-import";
import { toRegionIdOrNull } from "@/lib/constants";
import { parseAliasEntries } from "@/lib/alias-entries";

/** 树节点(含 children,给前端左侧树用) */
export type RegionTreeNode = {
  id: string;
  code: string;
  name: string;
  level: number;
  type: string | null;
  alias: Prisma.JsonValue | null;
  parentCode: string | null;
  fullName: string | null;
  sortOrder: number;
  status: number;
  createdAt: Date;
  updatedAt: Date;
  children: RegionTreeNode[];
};

/** 扁平行(node 去掉 children 的形态) */
export type RegionFlatRow = Omit<RegionTreeNode, "children">;

/** helper 用到的 db 子集 */
type DbLike = Pick<PrismaClient, "region" | "community" | "village" | "poi">;

/**
 * 行政区划(regions)router —— 树形维护 + region.json 覆盖导入。
 *
 * 数据约定:
 *   - 树关系用 parentCode(code 字段,不是 id)表达,顶级为 null
 *   - level / fullName 由服务端维护:level = 深度(1 起),
 *     fullName = 祖先名称路径(如 浦江镇/居(村)委会/聚缘居民委员会)
 *   - 删除节点会级联删除其整棵子树,并把社区/村/POI 的 regionId 置空
 *   - import 以 code 为主键 upsert(保留已有关联 id,社区引用不断),
 *     文件里不再出现的编码整批删除 → 即"覆盖原有数据"
 *
 * 注:本模块没有分页,list 返回全量树;命名为 list/stats 是为了
 * useCrudMutations 的 invalidateAll(list/stats/getById)约定能直接命中。
 */

/** 扁平行 → 嵌套树(按 sortOrder/name 排序,parentCode 分组) */
export function buildRegionTree(rows: RegionFlatRow[]): RegionTreeNode[] {
  const byParent = new Map<string | null, RegionFlatRow[]>();
  for (const row of rows) {
    const key = row.parentCode ?? null;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  const walk = (parentKey: string | null): RegionTreeNode[] =>
    (byParent.get(parentKey) ?? [])
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh"),
      )
      .map((row) => ({
        ...row,
        children: walk(row.code),
      }));
  return walk(null);
}

export const regionRouter = createTRPCRouter({
  /** 全部区划树(不分页,树形模块天然全量) */
  list: adminProcedure.query(async ({ ctx }): Promise<RegionTreeNode[]> => {
    const rows = await ctx.db.region.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        type: true,
        alias: true,
        parentCode: true,
        fullName: true,
        sortOrder: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return buildRegionTree(rows);
  }),

  /** 统计:总数 / 顶级数 / 禁用数 / 最大层级 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, roots, disabled, maxLevel] = await Promise.all([
      ctx.db.region.count(),
      ctx.db.region.count({ where: { parentCode: null } }),
      ctx.db.region.count({ where: { status: 0 } }),
      ctx.db.region
        .aggregate({ _max: { level: true } })
        .then((r) => r._max.level ?? 0),
    ]);
    return { total, roots, disabled, maxLevel };
  }),

  /** 新建节点(可指定上级;level/fullName 服务端计算) */
  create: adminProcedure
    .input(regionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const parentCode = toRegionIdOrNull(input.parentCode);
      const parent = parentCode
        ? await ctx.db.region.findUnique({ where: { code: parentCode } })
        : null;
      if (parentCode && !parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "上级区划不存在" });
      }
      await assertCodeAvailable(ctx.db.region, input.code);

      return ctx.db.region.create({
        data: {
          code: input.code,
          name: input.name,
          level: parent ? parent.level + 1 : 1,
          type: input.type ?? null,
          alias: toNullableAlias(input.alias),
          parentCode,
          fullName: parent
            ? joinFullName(parent.fullName, input.name)
            : input.name,
          sortOrder: input.sortOrder,
          status: input.status,
          createdAt: new Date(),
        },
      });
    }),

  /** 更新节点;名称/上级/编码变化时级联重算子树 level/fullName/parentCode */
  update: adminProcedure
    .input(regionUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.region.findUnique({
        where: { id: input.id },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "区划不存在" });
      }

      const data: Prisma.RegionUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.type !== undefined) data.type = input.type ?? null;
      if (input.alias !== undefined) data.alias = toNullableAlias(input.alias);
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.status !== undefined) data.status = input.status;

      // 纯 string 视图,避免从 Prisma 联合类型里取值
      const nextName = input.name ?? target.name;
      const nextCode = input.code?.trim() ?? target.code;
      const codeChanged = input.code !== undefined && nextCode !== target.code;
      if (codeChanged) {
        await assertCodeAvailable(ctx.db.region, nextCode, target.id);
        data.code = nextCode;
      }

      // 换父:仅当显式传了 parentCode(含 "")才处理;undefined = 不动
      const parentChanged =
        input.parentCode !== undefined &&
        toRegionIdOrNull(input.parentCode) !== target.parentCode;
      let nextParentCode = target.parentCode;
      let nextLevel = target.level;
      let nextFullName = target.fullName ?? target.name;

      if (parentChanged) {
        nextParentCode = toRegionIdOrNull(input.parentCode);
        if (
          nextParentCode !== null &&
          (nextParentCode === nextCode ||
            (await isDescendantCode(ctx.db, nextParentCode, nextCode)))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "不能把节点移到自身或其子节点下",
          });
        }
        const parent = nextParentCode
          ? await ctx.db.region.findUnique({ where: { code: nextParentCode } })
          : null;
        if (nextParentCode && !parent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "上级区划不存在" });
        }
        data.parentCode = nextParentCode;
        nextLevel = parent ? parent.level + 1 : 1;
        nextFullName = parent
          ? joinFullName(parent.fullName, nextName)
          : nextName;
        data.level = nextLevel;
        data.fullName = nextFullName;
      } else if (input.name !== undefined) {
        // 仅改名:路径最后一段跟随变化
        data.fullName = replaceLastName(target.fullName, nextName);
        nextFullName = data.fullName;
      }

      await ctx.db.region.update({ where: { id: target.id }, data });

      // 级联:名称/编码/上级任一变化都会影响子树
      if (input.name !== undefined || codeChanged || parentChanged) {
        await refreshSubtree(ctx.db, {
          rootId: target.id,
          oldCode: target.code,
          rootCode: nextCode,
          rootParentCode: nextParentCode,
          rootLevel: nextLevel,
          rootFullName: nextFullName,
        });
      }

      return ctx.db.region.findUnique({ where: { id: target.id } });
    }),

  /** 删除节点 + 整棵子树;关联的小区/村/POI regionId 置空 */
  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.region.findUnique({
        where: { id: input.id },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "区划不存在" });
      }
      const ids = await collectSubtreeIds(ctx.db, target.code);
      await detachReferences(ctx.db, ids);
      const result = await ctx.db.region.deleteMany({
        where: { id: { in: ids } },
      });
      return { count: result.count };
    }),

  /**
   * 批量删除(每个节点级联子树,id 去重)。
   * 注:树形 UI 目前没有批量选择,此 procedure 为满足 useCrudMutations
   * 四钩子契约而存在,与 delete 同一套级联逻辑。
   */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.region.findMany({
        where: { id: { in: input.ids } },
        select: { id: true, code: true },
      });
      const idSet = new Set<string>();
      for (const row of rows) {
        const ids = await collectSubtreeIds(ctx.db, row.code);
        for (const id of ids) idSet.add(id);
      }
      const ids = [...idSet];
      await detachReferences(ctx.db, ids);
      const result = await ctx.db.region.deleteMany({
        where: { id: { in: ids } },
      });
      return { count: result.count };
    }),

  /**
   * 覆盖导入:region.json envelope 的 data 数组。
   * 与现有数据按 code 合并:已存在的编码更新(保留 id,社区引用不断)、
   * 新增的创建、文件里已消失的编码删除 → 整体等于"导入后覆盖原有数据"。
   */
  import: adminProcedure
    .input(regionImportSchema)
    .mutation(async ({ ctx, input }) => {
      const summary = flattenRegionJson(input.data);
      if (summary.items.length === 0) {
        const s = summary.skipped;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `文件中没有可导入的行政区划节点:无编码 ${s.uncoded}、` +
            `继承编码 ${s.echo}、重复 ${s.duplicate}、非区划名称 ${s.nameFiltered}`,
        });
      }

      // 自动补全顶层行政区划根(上海市 310 → 闵行区 310112)并按 type 重算 level,
      // 使树形显示 上海市 → 闵行区 → 街镇 → 居村委
      const items = injectRegionAdminRoots(summary.items);

      const result = await ctx.db.$transaction(async (tx) => {
        const existing = await tx.region.findMany({
          select: { id: true, code: true },
        });
        // 一次建索引,避免逐 item 线性查找
        const byCode = new Map(existing.map((r) => [r.code, r.id]));

        let created = 0;
        let updated = 0;
        for (const item of items) {
          const id = byCode.get(item.code);
          if (id) {
            await tx.region.update({
              where: { id },
              data: toRegionData(item),
            });
            updated++;
          } else {
            await tx.region.create({
              data: { ...toRegionData(item), createdAt: new Date() },
            });
            created++;
          }
        }

        // 文件里已消失的编码 → 整批删除(先解除引用,避免 FK 报错)
        const codeSet = new Set(items.map((i) => i.code));
        const removedIds = existing
          .filter((r) => !codeSet.has(r.code))
          .map((r) => r.id);
        if (removedIds.length > 0) {
          await detachReferences(tx, removedIds);
          await tx.region.deleteMany({ where: { id: { in: removedIds } } });
        }

        return {
          total: items.length,
          created,
          updated,
          deleted: removedIds.length,
        };
      });

      return {
        ...result,
        skipped: summary.skipped,
        warnings: summary.warnings,
        /** 首个导入节点 code(前端导入后定位用) */
        firstCode: items[0]?.code ?? null,
      };
    }),

  /**
   * 一次性回填:type 字段为 NULL 的行,按 name 调 inferRegionType 推断后写入。
   * 幂等:推断结果仍为 null 的行保留 NULL(交给人工编辑),已非 NULL 的不覆盖。
   *
   * 用法:导入老 region.json 后,或 schema 调整让 type 字段首次有值前,
   * 管理员在 region 页面点一次"补全类型"按钮,看到回填统计即可。
   */
  backfillType: adminProcedure.mutation(async ({ ctx }) => {
    const rows = await ctx.db.region.findMany({
      where: { type: null },
      select: { id: true, name: true },
    });

    let filled = 0;
    let skipped = 0;
    const samples: Array<{ id: string; name: string }> = [];
    for (const row of rows) {
      const inferred = inferRegionType(row.name);
      if (inferred === null) {
        skipped++;
        if (samples.length < 10) samples.push({ id: row.id, name: row.name });
        continue;
      }
      await ctx.db.region.update({
        where: { id: row.id },
        data: { type: inferred },
      });
      filled++;
    }

    return { scanned: rows.length, filled, skipped, samples };
  }),
});

// ─── helpers ───────────────────────────────────────────

/** fullName 拼接:父为空直接返回自身;分隔符必须与导入(flattenRegionJson)一致用 "/" */
function joinFullName(parent: string | null, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/** 替换路径最后一段(仅改名时用) */
function replaceLastName(fullName: string | null, name: string): string {
  if (!fullName) return name;
  const idx = fullName.lastIndexOf("/");
  return idx === -1 ? name : `${fullName.slice(0, idx)}/${name}`;
}

/** 编码唯一性校验(update 时排除自身) */
async function assertCodeAvailable(
  region: {
    findUnique: (args: {
      where: { code: string };
    }) => Promise<{ id: string } | null>;
  },
  code: string,
  excludeId?: string,
) {
  const hit = await region.findUnique({ where: { code } });
  if (hit && hit.id !== excludeId) {
    throw new TRPCError({ code: "CONFLICT", message: `编码 ${code} 已存在` });
  }
}

/** 区划图:一次全表加载,按 parentCode 建 children 索引 + code → 行索引。
 * collectSubtreeIds / isDescendantCode / refreshSubtree 共用,避免三处重复建图。 */
type RegionGraphRow = {
  id: string;
  code: string;
  name: string;
  parentCode: string | null;
  sortOrder: number;
};
type RegionGraph = {
  rows: RegionGraphRow[];
  byCode: Map<string, RegionGraphRow>;
  childrenOf: Map<string | null, RegionGraphRow[]>;
};

async function loadRegionGraph(db: DbLike): Promise<RegionGraph> {
  const rows = (await db.region.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      parentCode: true,
      sortOrder: true,
    },
  })) as RegionGraphRow[];
  const byCode = new Map<string, RegionGraphRow>();
  const childrenOf = new Map<string | null, RegionGraphRow[]>();
  for (const r of rows) {
    byCode.set(r.code, r);
    const key = r.parentCode ?? null;
    const list = childrenOf.get(key) ?? [];
    list.push(r);
    childrenOf.set(key, list);
  }
  return { rows, byCode, childrenOf };
}

/** nextParentCode 是否在 startCode 的子树上(防循环挂载) */
async function isDescendantCode(
  db: DbLike,
  nextParentCode: string,
  startCode: string,
): Promise<boolean> {
  if (nextParentCode === startCode) return true;
  const { childrenOf } = await loadRegionGraph(db);
  const queue = [startCode];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const child of childrenOf.get(cur) ?? []) queue.push(child.code);
  }
  return seen.has(nextParentCode);
}

/** 收集某 code 的整棵子树 id(含自身,含所有后代) */
async function collectSubtreeIds(
  db: DbLike,
  rootCode: string,
): Promise<string[]> {
  const { byCode, childrenOf } = await loadRegionGraph(db);
  const root = byCode.get(rootCode);
  if (!root) return [];
  // 含自身:删除节点时整棵子树都要删
  const ids = [root.id];
  const queue = [rootCode];
  const seen = new Set<string>([rootCode]);
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (seen.has(child.code)) continue;
      seen.add(child.code);
      ids.push(child.id);
      queue.push(child.code);
    }
  }
  return ids;
}

/**
 * 节点变更后级联重算子树。
 * 注意:childrenOf 按"旧 parentCode"分组,所以根节点要先按 oldCode 找子,
 * 子节点的 parentCode 统一改写为新 code(改码场景),再继续递归。
 */
async function refreshSubtree(
  db: DbLike,
  opts: {
    rootId: string;
    oldCode: string;
    rootCode: string;
    rootParentCode: string | null;
    rootLevel: number;
    rootFullName: string;
  },
): Promise<void> {
  const {
    rootId,
    oldCode,
    rootCode,
    rootParentCode,
    rootLevel,
    rootFullName,
  } = opts;
  const { childrenOf } = await loadRegionGraph(db);

  const updates: Array<{
    id: string;
    level: number;
    fullName: string;
    parentCode: string | null;
  }> = [
    {
      id: rootId,
      level: rootLevel,
      fullName: rootFullName,
      parentCode: rootParentCode,
    },
  ];

  const walk = (
    currentCode: string,
    level: number,
    fullName: string,
    parentKey: string | null,
  ) => {
    for (const kid of (childrenOf.get(parentKey) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    )) {
      const childFullName = `${fullName}/${kid.name}`;
      updates.push({
        id: kid.id,
        level: level + 1,
        fullName: childFullName,
        // 跟在"当前节点"下面 → parentCode 一律指向当前节点的最终 code
        parentCode: currentCode,
      });
      walk(kid.code, level + 1, childFullName, kid.code);
    }
  };

  // 根的子节点挂在 oldCode 下(尚未更新);其后代挂在各自 code 下(未变)
  walk(rootCode, rootLevel, rootFullName, oldCode);

  await Promise.all(
    updates.map((u) => db.region.update({ where: { id: u.id }, data: u })),
  );
}

/** 解除子树下的关联(社区/村/POI 的 regionId → null),删除/覆盖不因 FK 失败 */
async function detachReferences(db: DbLike, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.all([
    db.community.updateMany({
      where: { regionId: { in: ids } },
      data: { regionId: null },
    }),
    db.village.updateMany({
      where: { regionId: { in: ids } },
      data: { regionId: null },
    }),
    db.poi.updateMany({
      where: { regionId: { in: ids } },
      data: { regionId: null },
    }),
  ]);
}

/** import item → region 行字段(createdAt 由调用方决定,update 时不传) */
function toRegionData(
  item: RegionImportItem,
): Omit<Prisma.RegionUncheckedCreateInput, "createdAt"> {
  return {
    code: item.code,
    name: item.name,
    level: item.level,
    parentCode: item.parentCode,
    fullName: item.fullName,
    sortOrder: item.sortOrder,
    type: item.type ?? null,
    alias: toNullableAlias(item.alias),
    status: 1,
  };
}

/**
 * 别名(JSON 列)归一 —— 多值数组形式(对齐 village / community 模块)。
 *   - undefined / 空数组 / 元素全空 → JsonNull(等价 NULL,清空列)
 *   - 否则 → 字符串数组(Prisma 序列化为 JSON 数组)
 *
 * 兼容:旧客户端若传单个字符串 / JSON 字符串,parseAliasEntries 会展平成数组;
 * 兼容 region.json 导入的别名字段(任意可解析形态)与历史脏数据。
 */
function toNullableAlias(
  v: string | string[] | undefined,
): string[] | typeof Prisma.JsonNull {
  const list = parseAliasEntries(v);
  if (list.length === 0) return Prisma.JsonNull;
  return list;
}
