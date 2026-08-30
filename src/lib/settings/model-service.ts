/**
 * 模型服务工具 —— URL 读取优先级 + 健康检查(纯函数,可测)。
 *
 * URL 读取优先级(settings.ts / addr-model.ts 共用):
 *   DB sys_setting("model.serviceUrl") > env ML_SERVICE_URL > http://localhost:8000
 */

export const DEFAULT_MODEL_SERVICE_URL = "http://localhost:8000";

/** 健康检查结果 */
export interface ModelHealthResult {
  ok: boolean;
  /** 耗时 ms(成功时) */
  latencyMs?: number;
  /** 服务返回的原始数据(成功时) */
  data?: unknown;
  /** 失败原因(失败时) */
  error?: string;
}

/** 解析设置值:DB 存的是 JSON 文档,统一取 string;非法返回 null */
function toJsonString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    const maybe = (v as { value?: unknown }).value;
    if (typeof maybe === "string") return maybe;
  }
  return null;
}

/**
 * 计算模型服务 URL。
 * @param dbValue sys_setting 中 model.serviceUrl 的原始值(undefined = 无配置)
 * @param envValue process.env.ML_SERVICE_URL(undefined = 未设置)
 */
export function resolveModelServiceUrl(
  dbValue: unknown,
  envValue: string | undefined,
): string {
  const fromDb = toJsonString(dbValue)?.trim();
  if (fromDb) return fromDb;
  const fromEnv = envValue?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_MODEL_SERVICE_URL;
}

/**
 * 读取全部系统设置(key → value 映射)。
 * @param findMany sysSetting 查询函数(Prisma 或测试 mock)
 */
export async function loadSettingsMap(
  findMany: () => Promise<Array<{ key: string; value: unknown }>>,
): Promise<Record<string, unknown>> {
  const rows = await findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * 从 DB 读取模型服务 URL(DB model.serviceUrl → env ML_SERVICE_URL → 默认)。
 * settings / addr-model 两个 router 共用。
 */
export async function readModelServiceUrl(
  findMany: () => Promise<Array<{ key: string; value: unknown }>>,
  envValue: string | undefined,
): Promise<string> {
  const settings = await loadSettingsMap(findMany);
  return resolveModelServiceUrl(settings["model.serviceUrl"], envValue);
}

/**
 * 健康检查:fetch `${base}/api/health`,超时 5s。
 * @param fetcher 可注入 fetch(测试用),默认全局 fetch
 */
export async function checkModelHealth(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<ModelHealthResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/health`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetcher(url, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, latencyMs, data };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "连接超时(5s)"
          : err.message
        : String(err);
    return { ok: false, latencyMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}