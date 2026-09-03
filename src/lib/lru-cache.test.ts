import { describe, expect, it } from "vitest";
import { LruCache } from "./lru-cache";

describe("LruCache", () => {
  it("set/get 基本读写", () => {
    const c = new LruCache<string>(3);
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
    expect(c.get("missing")).toBeUndefined();
  });

  it("容量上限触发 LRU 淘汰(最旧条目出局)", () => {
    const c = new LruCache<string>(2);
    c.set("a", "1");
    c.set("b", "2");
    c.set("c", "3"); // 淘汰 a
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("2");
    expect(c.get("c")).toBe("3");
  });

  it("get 命中刷新为最近使用,避免被误淘汰", () => {
    const c = new LruCache<string>(2);
    c.set("a", "1");
    c.set("b", "2");
    expect(c.get("a")).toBe("1"); // a 变为最近使用
    c.set("c", "3"); // 应淘汰 b(最旧)
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
  });

  it("重复 set 同一 key 不翻倍 size,且更新值", () => {
    const c = new LruCache<string>(3);
    c.set("a", "1");
    c.set("a", "2");
    expect(c.size).toBe(1);
    expect(c.get("a")).toBe("2");
  });

  it("has / size / clear", () => {
    const c = new LruCache<number>(3);
    expect(c.size).toBe(0);
    c.set("x", 9);
    expect(c.has("x")).toBe(true);
    expect(c.has("y")).toBe(false);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get("x")).toBeUndefined();
  });

  it("capacity 非法值抛错", () => {
    expect(() => new LruCache<string>(0)).toThrow();
    expect(() => new LruCache<string>(1.5)).toThrow();
  });

  it("泛型值类型(number)可用", () => {
    const c = new LruCache<number>(2);
    c.set("n", 42);
    expect(c.get("n")).toBe(42);
  });
});
