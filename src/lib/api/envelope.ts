/**
 * API 响应统一 envelope 约定。
 *
 * 成功: code === 0, data 为业务载荷
 * 失败: code !== 0, msg 为可展示给用户的错误信息, data 始终为 null
 *
 * 详见 docs/adr/0001-trpc-api-envelope.md。
 */

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