import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { checkModelHealth, readModelServiceUrl } from "@/lib/settings/model-service";

/** 系统设置 key 白名单(仅允许管理这些键) */
const SETTING_KEYS = ["sys.name", "sys.description", "model.serviceUrl"] as const;

const updateInput = z.object({
  updates: z
    .array(
      z.object({
        key: z.enum(SETTING_KEYS),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(10),
});

export const settingsRouter = createTRPCRouter({
  /** 全部设置(键值映射) */
  get: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.sysSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }),

  /** 局部更新(upsert 语义);返回更新后的全部设置 */
  update: adminProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      for (const { key, value } of input.updates) {
        const jsonValue = value as Prisma.InputJsonValue;
        await ctx.db.sysSetting.upsert({
          where: { key },
          update: { value: jsonValue },
          create: { key, value: jsonValue },
        });
      }
      const rows = await ctx.db.sysSetting.findMany();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    }),

  /** 模型服务连通性测试(服务端 fetch,规避浏览器 CORS) */
  modelTest: adminProcedure.query(async ({ ctx }) => {
    const url = await readModelServiceUrl(
      () => ctx.db.sysSetting.findMany(),
      process.env.ML_SERVICE_URL,
    );
    const health = await checkModelHealth(url);
    return { url, ...health };
  }),
});