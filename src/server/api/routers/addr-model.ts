import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { checkModelHealth, resolveModelServiceUrl } from "@/lib/settings/model-service";
import type { PrismaClient } from "../../../../generated/prisma/client";

/** unknown → 可展示字符串(仅 string/number/boolean;其它返回空串) */
function toText(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}

/** 从 sys_setting 读模型服务 URL(DB → env → 默认) */
async function readModelUrl(
  ctx: { db: PrismaClient },
): Promise<string> {
  const rows = await ctx.db.sysSetting.findMany();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return resolveModelServiceUrl(settings["model.serviceUrl"], process.env.ML_SERVICE_URL);
}

/** 统一错误归一:fetch 失败 / JSON 解析失败 → 抛出可展示信息 */
async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`模型服务异常:HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    code?: unknown;
    message?: unknown;
    data: T;
  };
  // NER 服务统一 envelope:{ code, message, data }
  if (body.code !== 0) {
    throw new Error(`模型解析失败:${toText(body.message)}`);
  }
  return body.data;
}

export const addrModelRouter = createTRPCRouter({
  /** 模型服务健康检查(返回 URL + 在线状态 + 延迟) */
  health: adminProcedure.query(async ({ ctx }) => {
    const url = await readModelUrl(ctx);
    const health = await checkModelHealth(url);
    return { url, ...health };
  }),

  /** 单条地址解析:返回结构化 + 实体分片(前端标注可视化) */
  parse: adminProcedure
    .input(z.object({ address: z.string().trim().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const url = await readModelUrl(ctx);
      const res = await fetch(
        `${url.replace(/\/+$/, "")}/api/format?address=${encodeURIComponent(input.address)}`,
      );
      const data = await parseResponse<Record<string, unknown>>(res);
      return data;
    }),

  /** 批量地址解析(能力演示/批量场景;POST 避免长 URL) */
  batchParse: adminProcedure
    .input(z.object({ addresses: z.array(z.string().trim().max(200)).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const url = await readModelUrl(ctx);
      const res = await fetch(`${url.replace(/\/+$/, "")}/api/batch_format`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresses: input.addresses }),
      });
      const data = await parseResponse<unknown>(res);
      return data as Array<Record<string, unknown>>;
    }),
});