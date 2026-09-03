/**
 * 进程内 LRU 缓存。
 *
 * 基于 Map 插入顺序实现 O(1) 最近最少使用淘汰(最旧条目始终位于 Map 头部)。
 * 作为 Redis 等外部缓存不可用时的本地兜底,也可独立用作任意模块的轻量缓存。
 *
 * 泛型:值类型由调用方决定;key 统一为 string。
 */
export class LruCache<V> {
  private map = new Map<string, V>();
  private readonly cap: number;

  constructor(capacity = 1000) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`LruCache capacity 必须为正整数,收到: ${capacity}`);
    }
    this.cap = capacity;
  }

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // 命中即刷新为最近使用(删除后重插到 Map 尾部)
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.cap) {
      // Map 头部即最旧条目
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
