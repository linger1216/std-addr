/**
 * 错误归一化工具:把任意形态的错误(TRPCClientError / Error / 字符串 / unknown)
 * 统一转成 ApiError,便于上层统一 toast / 表单回显。
 */

import { ApiError } from "./envelope";

const FALLBACK_CODE = 5000;
const FALLBACK_MSG = "未知错误";

/** 任意错误 → ApiError */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;

  // tRPC client 错误:tRPCClientError.message + tRPCClientError.data
  // 我们的 errorFormatter 把 envelope 字段放在 data 下
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const d = data as { code?: unknown; msg?: unknown; zodError?: unknown };
      if (typeof d.code === "number") {
        const msg = typeof d.msg === "string" ? d.msg : FALLBACK_MSG;
        return new ApiError(d.code, msg, d.zodError ?? null);
      }
    }
  }

  if (e instanceof Error) {
    return new ApiError(FALLBACK_CODE, e.message || FALLBACK_MSG);
  }

  return new ApiError(FALLBACK_CODE, String(e));
}