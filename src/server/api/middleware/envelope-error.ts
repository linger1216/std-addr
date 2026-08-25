/**
 * envelope 错误格式化:把 tRPC 原生错误 → envelope { code, msg, data: null }。
 *
 * 输出挂在 errorFormatter 返回值的 shape.data 下,前端 TRPCClientError.data 拿到。
 */

import type { TRPCError } from "@trpc/server";

/**
 * 错误码分桶:
 *  1xxx  通用业务错误
 *  2xxx  鉴权/权限
 *  3xxx  数据校验
 *  4xxx  资源冲突
 *  5xxx  系统/底层错误
 */
export const TRPC_ERROR_CODE_MAP: Record<string, { code: number; fallbackMsg: string }> = {
  PARSE_ERROR:           { code: 1001, fallbackMsg: "请求格式错误" },
  BAD_REQUEST:           { code: 3001, fallbackMsg: "请求参数错误" },
  UNAUTHORIZED:          { code: 2001, fallbackMsg: "请先登录" },
  FORBIDDEN:             { code: 2002, fallbackMsg: "无权限访问" },
  NOT_FOUND:             { code: 1002, fallbackMsg: "资源不存在" },
  METHOD_NOT_SUPPORTED:  { code: 1003, fallbackMsg: "不支持的请求方法" },
  TIMEOUT:               { code: 5003, fallbackMsg: "请求超时,请稍后再试" },
  CONFLICT:              { code: 4001, fallbackMsg: "资源冲突" },
  PRECONDITION_FAILED:   { code: 4002, fallbackMsg: "前置条件不满足" },
  PAYLOAD_TOO_LARGE:     { code: 1004, fallbackMsg: "请求内容过大" },
  UNSUPPORTED_MEDIA_TYPE:{ code: 1005, fallbackMsg: "不支持的媒体类型" },
  UNPROCESSABLE_CONTENT: { code: 3002, fallbackMsg: "请求内容无法处理" },
  TOO_MANY_REQUESTS:     { code: 5004, fallbackMsg: "请求过于频繁,请稍后再试" },
  CLIENT_CLOSED_REQUEST: { code: 5005, fallbackMsg: "客户端已关闭请求" },
  INTERNAL_SERVER_ERROR: { code: 5000, fallbackMsg: "服务器内部错误" },
};

export type EnvelopeError = {
  code: number;
  msg: string;
  data: null;
  zodError: unknown;
};

/**
 * 把 tRPC 错误码 + message + ZodError 转 envelope 错误形状。
 *
 * 优先级:
 *  1. 后端 message 不为空 → 直接用
 *  2. message 为空 → 用 TRPC_ERROR_CODE_MAP 的 fallbackMsg
 *  3. 未知 code → 5000 + 原始 message
 */
export function buildEnvelopeError(
  trpcCode: string,
  message: string | undefined,
  zodError: unknown,
): EnvelopeError {
  const entry = TRPC_ERROR_CODE_MAP[trpcCode] ?? {
    code: 5000,
    fallbackMsg: message ?? "未知错误",
  };
  const msg = (message && message.trim().length > 0)
    ? message
    : entry.fallbackMsg;
  return {
    code: entry.code,
    msg,
    data: null,
    zodError,
  };
}

export type { TRPCError };