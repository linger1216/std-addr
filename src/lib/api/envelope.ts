/**
 * API 响应统一 envelope 约定。
 *
 * 成功: code === 0, data 为业务载荷
 * 失败: code !== 0, msg 为可展示给用户的错误信息, data 始终为 null
 *
 * 详见 docs/adr/0001-trpc-api-envelope.md。
 */

/** 成功形态 */
export type ApiSuccess<T> = {
  code: 0;
  msg: "ok";
  data: T;
};

/** 失败形态 */
export type ApiFailure = {
  code: number;
  msg: string;
  data: null;
};

/** 完整 envelope 类型 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * 类型层"解包"工具:从 envelope 形态里取 data 字段类型。
 *
 * 用法:
 *   type MyOutput = UnwrapResponse<RouterOutputs["x"]["list"]>;
 *   // 等价于 procedure 的"裸返回"类型
 */
export type UnwrapResponse<T> = T extends ApiResponse<infer U> ? U : T;

/** 业务错误类 —— 透传给 toast.error / 表单回显 */
export class ApiError extends Error {
  public readonly code: number;
  public readonly zodError: unknown;

  constructor(code: number, message: string, zodError: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.zodError = zodError;
  }
}

/**
 * 手动 unwrap 工具。
 *
 * 大多数调用点不需要它:客户端 transformer 会自动 unwrap,
 * 失败自动抛 ApiError。但 server-side caller / 直接 fetch 时仍可能用到。
 */
export function unwrap<T>(res: ApiResponse<T>): T {
  if (res.code === 0) return (res as ApiSuccess<T>).data;
  throw new ApiError(res.code, res.msg);
}

/** 仅取 data,失败返回 undefined(不抛) */
export function envelopeOk<T>(
  res: ApiResponse<T> | undefined,
): T | undefined {
  if (!res) return undefined;
  if (res.code !== 0) return undefined;
  // 收窄到成功形态:此时 data 必为 T(失败形态下 data 必为 null)
  return (res as ApiSuccess<T>).data;
}