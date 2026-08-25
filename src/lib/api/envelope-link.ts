/**
 * tRPC client link:把 envelope 格式的 response 解包成裸业务数据。
 *
 * 调用站点无需感知 envelope:
 *   - 成功: 业务数据作为 result.data 返回
 *   - 失败: 转 ApiError,通过 result.data 透传(下流 link 会识别为 TRPCClientError)
 *
 * 详见 docs/adr/0001-trpc-api-envelope.md §2.5.3
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  OperationResultEnvelope,
  TRPCLink,
} from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { map, observable } from "@trpc/server/observable";

import { ApiError } from "./envelope";

/** envelope 错误形态(由 errorFormatter 输出到 shape.data 下) */
type EnvelopeErrorPayload = {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
  zodError?: unknown;
};

/** 判断是否为 envelope 错误结构 */
function isEnvelopeError(data: unknown): data is EnvelopeErrorPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof (data as { code?: unknown }).code === "number"
  );
}

/** 判断是否为 envelope 成功结构 */
function isEnvelopeSuccess(value: unknown): value is { code: 0; data: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: unknown }).code === 0 &&
    "data" in value
  );
}

/** 从 unknown 错误中尝试提取 envelope 错误,转 ApiError */
function tryExtractApiError(error: unknown): ApiError | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { data?: unknown; message?: string };
  const data = e.data;
  if (isEnvelopeError(data)) {
    const code = typeof data.code === "number" ? data.code : 5000;
    const msg =
      typeof data.msg === "string" ? data.msg : (e.message ?? "未知错误");
    const zod = data.zodError ?? null;
    return new ApiError(code, msg, zod);
  }
  return null;
}

/** envelope 解包 link */
export function envelopeLink(): TRPCLink<any> {
  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        return next(op)
          .pipe(
            map((result: OperationResultEnvelope<unknown, TRPCClientError<any>>) => {
              const inner = result.result;

              // started / stopped / 连接状态 —— 透传
              if (!inner) return result;
              if (inner.type !== "data") return result;

              // data 形态:可能是 success envelope, 可能是 TRPCClientError
              const data = inner.data;

              // 错误路径:tRPC 把 TRPCClientError 包在 data 里
              if (data instanceof TRPCClientError) {
                const apiErr = tryExtractApiError(data);
                if (apiErr) {
                  // 透传 ApiError 给下流
                  return {
                    ...result,
                    result: {
                      ...inner,
                      data: apiErr as unknown as TRPCClientError<any>,
                    },
                  };
                }
                return result;
              }

              // 成功路径:解包 envelope
              if (isEnvelopeSuccess(data)) {
                return {
                  ...result,
                  result: { ...inner, data: data.data },
                };
              }

              // 防御:服务端没包 envelope(过渡期),原样透传
              return result;
            }),
          )
          .subscribe({
            next: (v) => observer.next(v),
            error: (e) => observer.error(e),
            complete: () => observer.complete(),
          });
      });
    };
  };
}