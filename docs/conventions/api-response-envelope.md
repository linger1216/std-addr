# API 响应封装约定

## 目标
所有 HTTP / RPC 接口返回统一的外层结构，前端通过 `data` 字段拿到业务数据。

## 约定格式

```ts
type ApiResponse<T> =
  | { code: 0; msg: "ok"; data: T }
  | { code: number; msg: string; data: null };

// 成功: code === 0
// 失败: code !== 0, msg 为可展示给用户的错误信息, data 始终为 null
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `number` | `0` 表示成功；非 `0` 为业务/系统错误码（前端无需关心具体值，由 `msg` 兜底） |
| `msg` | `string` | 人类可读的错误信息；成功时为 `"ok"` |
| `data` | `T \| null` | 业务载荷；失败时为 `null` |

## tRPC 当前状态（待改造）
- 现状：tRPC procedure 直接返回业务对象（如 `{ items, total }`），未套 envelope。
- 计划：见 `docs/adr/0001-trpc-envelope.md`（待写）。
- 过渡期：tRPC 调用站点仍按"裸返回"写，直到 envelope 改造完成并全量迁移。

## 适用范围
- ✅ HTTP / REST 接口（若有新增）
- ⏳ tRPC procedure（待改造，详见 ADR）
- ❌ Next.js 内置 route handler 的 `NextResponse.json`（保持原生，仅在内部业务接口套 envelope）

## 反例（不允许）
```ts
// 禁止: 直接返回业务对象
return { items: [...], total: 10 };

// 禁止: 嵌套多层 envelope
return { code: 0, msg: "ok", data: { code: 0, data: { items: [...] } } };
```

## 前端读取模板
```ts
const res = await fetch(...);
const body: ApiResponse<MyData> = await res.json();
if (body.code !== 0) throw new Error(body.msg);
const data = body.data;
```