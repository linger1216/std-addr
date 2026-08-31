/**
 * 同级菜单重排的核心逻辑 —— 纯函数,零副作用依赖(仅 PrismaClient 类型)。
 *
 * 抽离本文件的目的:
 *   1. 让 vitest 可单独 import 此文件进行单元测试,无需 import router 文件。
 *      router 文件 → trpc → next-auth → next/server 的 import 链在 node 测试
 *      环境会触发 `Cannot find module 'next/server'`(详见历史踩坑)。
 *   2. procedure mutation body 仅调它,使 router 文件纯瘦,核心逻辑可独立测试。
 *
 * 协议:
 *  - 入参 `parentId` 为 null 时表示顶级菜单层。
 *  - `orderedIds` 必须全部属于该 parent(否则 reject),且互不重复。
 *  - 服务端用 `$transaction` 把整组 update 包成原子操作;
 *    sort 字段值以 `STEP=10` 递增写(新菜单 sort=0 自然排到末尾)。
 */

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "../../../../../generated/prisma/client";

/** 抽离的最小菜单接口 —— 只需要 menu.findMany / menu.update / $transaction */
export type ReorderDb = Pick<PrismaClient, "menu" | "$transaction">;

const STEP = 10;

export async function runReorder(
  db: ReorderDb,
  parentId: string | null,
  orderedIds: string[],
): Promise<{ count: number }> {
  const siblings = await db.menu.findMany({
    where: { parentId },
    select: { id: true },
  });
  const validIds = new Set(siblings.map((s) => s.id));
  const invalid = orderedIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `以下菜单不属于该同级:${invalid.join(", ")}`,
    });
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "orderedIds 存在重复",
    });
  }

  const updated = await db.$transaction(
    orderedIds.map((id, i) =>
      db.menu.update({
        where: { id },
        data: { sort: (i + 1) * STEP },
      }),
    ),
  );
  return { count: updated.length };
}
