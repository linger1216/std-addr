import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MODEL_SERVICE_URL,
  checkModelHealth,
  resolveModelServiceUrl,
} from "./model-service";

describe("resolveModelServiceUrl URL 优先级", () => {
  it("DB 配置 > env > 默认值", () => {
    expect(resolveModelServiceUrl("http://10.0.0.9:9000", "http://env:8000")).toBe(
      "http://10.0.0.9:9000",
    );
    expect(resolveModelServiceUrl(undefined, "http://env:8000")).toBe(
      "http://env:8000",
    );
    expect(resolveModelServiceUrl(undefined, undefined)).toBe(
      DEFAULT_MODEL_SERVICE_URL,
    );
  });

  it("DB 值为 JSON 文档包裹(string)/对象时也能解析", () => {
    // Prisma Json 列读回:纯字符串值返回 string;但防御处理对象形态
    expect(resolveModelServiceUrl("http://db:8000", undefined)).toBe("http://db:8000");
    expect(resolveModelServiceUrl({ value: "http://obj:8000" }, undefined)).toBe(
      "http://obj:8000",
    );
  });

  it("空白/非法 DB 值跳过,落到 env/默认", () => {
    expect(resolveModelServiceUrl("   ", "http://env:8000")).toBe("http://env:8000");
    expect(resolveModelServiceUrl(123, undefined)).toBe(DEFAULT_MODEL_SERVICE_URL);
  });
});

describe("checkModelHealth 健康检查", () => {
  function okFetch(): Promise<Response> {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "ok" }) } as Response);
  }

  it("成功:返回 ok + 延迟 + 数据(URL 去尾部斜杠)", async () => {
    const fetcher = vi.fn<typeof fetch>(okFetch);
    const res = await checkModelHealth("http://x:8000/", fetcher);
    expect(res.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith("http://x:8000/api/health", expect.any(Object));
    expect(typeof res.latencyMs).toBe("number");
    expect(res.data).toEqual({ status: "ok" });
  });

  it("HTTP 非 2xx → 失败含状态码", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve({ ok: false, status: 503 } as Response),
    );
    const res = await checkModelHealth("http://x:8000", fetcher);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("HTTP 503");
  });

  it("网络错误 → 失败含原因", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new Error("ECONNREFUSED")));
    const res = await checkModelHealth("http://x:8000", fetcher);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
  });

  it("超时(AbortError)→ 失败原因=连接超时", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
    const res = await checkModelHealth("http://x:8000", fetcher);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("连接超时(5s)");
  });
});