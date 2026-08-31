/**
 * runReorder 单测 —— 验证:
 *  - 同级重排后 sort 字段按 STEP=10 递增写入
 *  - orderedIds 含非同级菜单 → 抛 BAD_REQUEST
 *  - orderedIds 重复 → 抛 BAD_REQUEST
 *  - parentId 指具体子级时只操作该子级下的菜单
 *  - 整组 update 走 $transaction(契约:原子化)
 *
 * 设计:测试直接 import 抽离文件 `./run-reorder`,
 *      避免拉到 router → trpc → next-auth → next/server 的副作用。
 *      该文件仅依赖 `@trpc/server` 与生成产物 PrismaClient 类型,运行时不会有副作用。
 *
 * mock 策略:vi.mock("@/server/db") + hoisted db stub,完整模拟 $transaction。
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

type MenuRecord = { id: string; parentId: string | null; sort: number };

const dbMock = vi.hoisted(() => {
  const rows: MenuRecord[] = [];
  const all = () => rows.map((r) => ({ ...r }));
  return {
    menu: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    /** Prisma 的 $transaction 在 db 顶级,不在 db.menu 下 */
    $transaction: vi.fn(),
    __seed: (next: MenuRecord[]) => {
      rows.length = 0;
      rows.push(...next);
    },
    __all: all,
    __reinstallMocks: () => {
      dbMock.menu.findMany.mockImplementation((args: { where: { parentId: string | null } }) =>
        all()
          .filter((r) => r.parentId === args.where.parentId)
          .map((r) => ({ id: r.id })),
      );
      dbMock.menu.update.mockImplementation(
        (args: { where: { id: string }; data: { sort: number } }) => {
          const row = rows.find((r) => r.id === args.where.id);
          if (!row) throw new Error(`Row not found: ${args.where.id}`);
          row.sort = args.data.sort;
          return { ...row };
        },
      );
      dbMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => {
        const out: unknown[] = [];
        for (const op of ops) out.push(await op);
        return out;
      });
    },
  };
});

vi.mock("@/server/db", () => ({ db: dbMock }));

describe("runReorder (同级菜单重排核心逻辑)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.__reinstallMocks();
  });

  it("同一 parent 下重排,a→c→b,sort 写为 10/20/30;另一个 parent 的 d 不动", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "b", parentId: null, sort: 0 },
      { id: "c", parentId: null, sort: 0 },
      { id: "d", parentId: "x", sort: 0 },
    ]);

    const { runReorder } = await import("./run-reorder");
    const result = await runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["c", "a", "b"]);

    expect(result.count).toBe(3);
    const all = dbMock.__all();
    expect(all.find((r) => r.id === "c")?.sort).toBe(10);
    expect(all.find((r) => r.id === "a")?.sort).toBe(20);
    expect(all.find((r) => r.id === "b")?.sort).toBe(30);
    expect(all.find((r) => r.id === "d")?.sort).toBe(0);
  });

  it("orderedIds 含非同级菜单 → 抛 TRPCError BAD_REQUEST", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "d", parentId: "x", sort: 0 },
    ]);
    const { runReorder } = await import("./run-reorder");
    await expect(runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "d"])).rejects.toBeInstanceOf(TRPCError);
    try {
      await runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "d"]);
    } catch (e: any) {
      expect(e.code).toBe("BAD_REQUEST");
      expect(e.message).toContain("d");
    }
  });

  it("orderedIds 含重复 id → 抛 BAD_REQUEST", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "b", parentId: null, sort: 0 },
    ]);
    const { runReorder } = await import("./run-reorder");
    await expect(runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "a"])).rejects.toBeInstanceOf(TRPCError);
    try {
      await runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "a"]);
    } catch (e: any) {
      expect(e.code).toBe("BAD_REQUEST");
      expect(e.message).toContain("重复");
    }
  });

  it("parentId 指具体子级时,只操作该子级下的菜单", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "b", parentId: "x", sort: 0 },
      { id: "c", parentId: "x", sort: 0 },
    ]);
    const { runReorder } = await import("./run-reorder");
    await runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], "x", ["c", "b"]);

    const all = dbMock.__all();
    expect(all.find((r) => r.id === "c")?.sort).toBe(10);
    expect(all.find((r) => r.id === "b")?.sort).toBe(20);
    expect(all.find((r) => r.id === "a")?.sort).toBe(0);
  });

  it("整组 update 走 $transaction(契约:原子化)", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "b", parentId: null, sort: 0 },
      { id: "c", parentId: null, sort: 0 },
    ]);
    const { runReorder } = await import("./run-reorder");
    await runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "b", "c"]);

    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.menu.update).toHaveBeenCalledTimes(3);
  });

  it("$transaction 中第一个 update 抛错时,失败传递且事务已被调用", async () => {
    dbMock.__seed([
      { id: "a", parentId: null, sort: 0 },
      { id: "b", parentId: null, sort: 0 },
    ]);
    dbMock.menu.update.mockImplementationOnce(async () => {
      throw new Error("simulated rollback");
    });
    const { runReorder } = await import("./run-reorder");
    await expect(runReorder(dbMock as unknown as Parameters<typeof runReorder>[0], null, ["a", "b"])).rejects.toThrow(
      "simulated rollback",
    );
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
