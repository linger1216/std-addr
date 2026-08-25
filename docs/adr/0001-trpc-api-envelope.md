# ADR-0001: tRPC API 统一 Envelope 化（`{ code, msg, data }`）

- **状态**：📝 提案，待评审
- **日期**：2025-08-25
- **作者**：—
- **影响范围**：服务端 `src/server/**`、客户端 `src/trpc/**`、`src/components/**`、`src/lib/api/**`（新建）

---

## 1. 背景与动机

### 1.1 现状

- **服务端**：所有 tRPC procedure 直接返回业务对象，无外层封装。
  ```ts
  // 例: src/server/api/routers/community.ts
  list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
    // ...
    return { items, total, page, pageSize };
  }),

  stats: adminProcedure.query(async ({ ctx }) => {
    return { total, enabled, disabled, regionCount };
  }),

  deleteMany: adminProcedure.input(...).mutation(async ({ ctx, input }) => {
    return { count: result.count };
  }),
  ```
- **错误**：tRPC 原生 `TRPCError({ code: "FORBIDDEN", message: "..." })`，**走 tRPC 自己的错误协议**，与 envelope 的 `code/msg` 不一致。
- **客户端**：直接读裸字段，无 unwrap 工具。
  ```ts
  const { data: listData } = api.community.list.useQuery(listInput);
  const rows = listData?.items ?? [];   // 直接访问 .items
  ```

### 1.2 问题

| 问题 | 影响 |
|---|---|
| **错误信息碎片化** | 业务错误（`TRPCError`）、字段校验错误（`ZodError`）、运行时异常（`Prisma` 错误）格式各不相同，前端需要分别处理 |
| **成功响应 schema 不可知** | 后端返回 `{ items, total }` 还是 `{ data: { items, total } }`，只在类型层面对齐，运行时没有"统一格式"约束 |
| **跨接口约定缺失** | 接入新接口时不知道返回什么形状，文档/类型靠口头约定 |

### 1.3 目标

所有 tRPC 接口返回统一形如：
```ts
{ code: 0, msg: "ok", data: <T> }        // 成功
{ code: <非零>, msg: "<错误信息>", data: null }  // 失败
```

---

## 2. 设计方案

### 2.1 整体策略

**采用 tRPC middleware 统一包裹 + `errorFormatter` 增强错误**，**不**改 procedure 的 `return` 语句（避免侵入式改动）。

理由：
- middleware 在 router 入口/出口拦截，procedure 内部仍按"返回业务数据"写，**与现状一致**。
- 错误通过 `errorFormatter` 转 envelope，**不依赖每个 procedure 主动 throw 新格式错误**。
- React Query / tRPC client 收到的是"已经包好 envelope"的最终值，前端做类型适配即可。

### 2.2 响应类型定义

新建 `src/lib/api/envelope.ts`：

```ts
/**
 * 统一 API 响应外层。
 *
 * 成功: code === 0, data 为业务载荷
 * 失败: code !== 0, msg 为可展示给用户的错误信息, data 始终为 null
 */
export type ApiResponse<T> =
  | { code: 0; msg: "ok"; data: T }
  | { code: number; msg: string; data: null };

/** 解包工具: 成功返回 data, 失败抛 ApiError */
export function unwrap<T>(res: ApiResponse<T>): T {
  if (res.code === 0) return res.data;
  throw new ApiError(res.code, res.msg);
}

/** 业务错误类 —— 透传给 toast.error / 表单回显 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

### 2.3 错误码约定

| `code` 范围 | 语义 | 例子 |
|---|---|---|
| `0` | 成功 | — |
| `1xxx` | 通用业务错误 | `1001` 入参缺失, `1002` 资源不存在 |
| `2xxx` | 鉴权/权限 | `2001` 未登录, `2002` 无权限 |
| `3xxx` | 数据校验 | `3001` 字段格式错（来自 ZodError） |
| `4xxx` | 资源冲突 | `4001` 重复创建, `4002` 引用不存在 |
| `5xxx` | 系统/底层错误 | `5001` 数据库错误, `5002` 第三方服务失败 |

**TRPCError code → envelope code 映射**：

| tRPC `code` | envelope `code` | `msg` 模板 |
|---|---|---|
| `UNAUTHORIZED` | `2001` | "请先登录" |
| `FORBIDDEN` | `2002` | "无权限访问" |
| `NOT_FOUND` | `1002` | "资源不存在" |
| `BAD_REQUEST` | `3001` | "请求参数错误" |
| `TIMEOUT` | `5003` | "请求超时,请稍后再试" |
| `INTERNAL_SERVER_ERROR` | `5000` | "服务器内部错误" |
| 其他 | `5000` | 沿用 tRPC message |
| ZodError (cause) | `3001` | "请求参数错误" + 字段级 detail |

> msg 文案优先使用后端原始 message；若为空则用上表模板。
> i18n：**本 ADR 不强制 i18n key**，仅硬编码中文；后续若上 next-intl 再替换为 key。

### 2.4 服务端实现

#### 2.4.1 中间件：包裹成功响应

新建 `src/server/api/middleware/envelope.ts`：

```ts
import { TRPCError, initTRPC } from "@trpc/server";

/**
 * 把 procedure 的"裸返回"包装成 { code: 0, msg: "ok", data }。
 *
 * 注意: 必须放在所有"业务 middleware"之后,以便最终结果被包裹。
 * 在 src/server/api/trpc.ts 中通过 procedure.use(this) 挂到所有 procedure。
 */
export const envelopeMiddleware = t.middleware(async ({ next }) => {
  const result = await next();
  // result.ok 为 true 时,result.data 才是 procedure 的实际返回值
  if (result.ok) {
    return {
      ok: true as const,
      data: { code: 0 as const, msg: "ok" as const, data: result.data },
    };
  }
  // 错误不在这里处理,留给 errorFormatter
  return result;
});
```

> ⚠️ **关键约束**：`envelopeMiddleware` 必须是 procedure chain 的**最外层**，否则内层 middleware 修改后的 `result.data` 才会被包裹；通常作为 `t.procedure.use(...)` 的第一个 `use()`。

#### 2.4.2 `errorFormatter`：把错误格式化成 envelope

在 `src/server/api/trpc.ts` 的 `initTRPC.create({...})` 中替换 `errorFormatter`：

```ts
import { TRPCError_CODE_MAP, buildEnvelopeError } from "./middleware/envelope-error";

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // 把 zodError 提出来,作为 data.detail
    const zodError =
      error.cause instanceof ZodError ? error.cause.flatten() : null;

    const envelope = buildEnvelopeError(error.code, error.message, zodError);

    return {
      ...shape,
      data: {
        ...shape.data,           // tRPC 内部字段保留(便于 react-query 错误识别)
        ...envelope,             // envelope 字段覆盖到 data.* 下
        zodError,                // 兼容原前端 ZodError 消费点
      },
    };
  },
});
```

`tRPC` 的链路是：

```
procedure 抛 TRPCError
  → middleware.next() 返回 { ok: false, error }
  → errorFormatter 包装 shape.data
  → client 收到 shape.data.code / shape.data.msg / shape.data.data
```

所以 **envelope 的 `code/msg/data: null` 必须挂在 `shape.data` 下**，而不是 `shape` 顶层（否则 client 拿到的就是 `{ code, msg, data }` 顶层 envelope，但 client 还会再嵌套一层，结构就乱了）。

#### 2.4.3 procedure 写法**不变**

```ts
// 仍然这样写:
list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
  return { items, total };   // ← 中间件会自动包成 { code: 0, msg: "ok", data: { items, total } }
});

stats: adminProcedure.query(async ({ ctx }) => {
  return { total, enabled }; // ← 同上
});
```

#### 2.4.4 应用 middleware

在 `src/server/api/trpc.ts` 中，把 `envelopeMiddleware` 加到所有 procedure builder 的最外层：

```ts
// 例: publicProcedure 改写为
export const publicProcedure = t.procedure
  .use(envelopeMiddleware)   // ← 必须第一行
  .use(timingMiddleware);

// protectedProcedure / adminProcedure 同理
export const protectedProcedure = t.procedure
  .use(envelopeMiddleware)
  .use(timingMiddleware)
  .use(({ ctx, next }) => { /* 鉴权 */ });

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });   // ← 仍写原生错误,errorFormatter 翻译
  }
  return next();
});
```

### 2.5 客户端适配

#### 2.5.1 类型同步

`tRPC` 的 `inferRouterOutputs<AppRouter>` 会自动从 `RouterOutputs` 推导出新的 `{ code, msg, data }` 形状（因为 procedure 返回值变了）。这意味着：

```ts
// 之前
type OldListOutput = RouterOutputs["community"]["list"];
// { items: ...; total: number; page: number; pageSize: number }

// 之后
type NewListOutput = RouterOutputs["community"]["list"];
// { code: 0; msg: "ok"; data: { items: ...; total: number; ... } }
```

#### 2.5.2 unwrap helper + 调用约定

```ts
// src/lib/api/envelope.ts (新建,上面已写)

// 客户端使用方式:
// 选项 A: 显式 unwrap
const result = await rpc.community.list.fetch(input);
const listData = unwrap(result);   // { items, total, page, pageSize }

// 选项 B: hook 模式下 React Query 自动 throw,error 走 onError
const { data: envelopeData, error } = api.community.list.useQuery(input);
const listData = envelopeData;  // 已经是 unwrap 后的? —— 取决于方案 (见 2.5.3)
```

#### 2.5.3 Hook 行为的两种取舍

| 方案 | 行为 | 代价 |
|---|---|---|
| **A. hook 不自动 unwrap** | `useQuery` 返回 `data: { code, msg, data: ... }` 整 envelope | 调用站点必须 `data?.data.items` 或写个 custom hook |
| **B. hook 自动 unwrap, 失败 throw** | 成功 `data: T`, 失败 `error: ApiError` | 调用站点最自然,跟现状一致 ✅ **推荐** |

**推荐方案 B**。在 `src/trpc/react.tsx` 中包一层：

```ts
// src/trpc/react.tsx
import { ApiError } from "@/lib/api/envelope";

// 拿到 rawResponse 后 unwrap;失败转 ApiError 让 React Query 捕获
const fetchWithUnwrap: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();  // 单 procedure 调用时,res.json() 是 envelope
  return json;                    // 交给 tRPC client 解码
};
```

**但这不够干净**——tRPC client 的链路本身有 `transformer`(SuperJSON) 和 `links`。**正确做法**：写一个 **transformer**，在 `superjson.deserialize` 之后对结果做 unwrap：

> 这条路线评估后**风险较高**（会破坏所有 mutation 的乐观更新、影响 React Query 缓存 key 序列化），**不推荐**走 transformer。

**实际推荐**（更稳）：**保留 envelope 在 `data` 里**，在 `src/trpc/react.tsx` 提供一个 `useApiQuery` / `useApiUtils` 包装：

```ts
// src/trpc/react.tsx
import { unwrap, ApiError } from "@/lib/api/envelope";

export function useApiQuery<T>(opts: {
  envelope: { data: ApiResponse<T> | undefined; error: unknown; isLoading: boolean };
}) {
  const { envelope } = opts;
  if (envelope.error instanceof ApiError) throw envelope.error;  // 让 React Query 捕获
  if (!envelope.data) return { data: undefined, isLoading: envelope.isLoading };
  // envelope.data.code === 0 时返回 data,否则 throw
  const data = unwrap(envelope.data);
  return { data, isLoading: envelope.isLoading };
}
```

> 这个 helper 略糙；更顺手的做法是直接接受"调用站点多一层 `.data`"，**通过 codemod 一键替换**（见 §4）。

**最终决议（推荐）**：

**调用站点写法保持现状，所有 .data 多一层 data 解包：**

```ts
const { data, isLoading } = api.community.list.useQuery(input);
// data 形状: { code: 0; msg: "ok"; data: { items, total, ... } } | undefined

const listData = data?.data;          // ← 业务载荷
const total = listData?.total ?? 0;
const rows: CommunityRow[] = listData?.items ?? [];
```

**封装一个轻量 hook helper** 来减少噪音：

```ts
// src/trpc/react.tsx
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type EnvelopedRouterOutputs = {
  [K in keyof inferRouterOutputs<AppRouter>]: {
    [P in keyof inferRouterOutputs<AppRouter>[K]]: inferRouterOutputs<AppRouter>[K][P];
  };
};

// 暴露一个 .unwrap() 工具
export const envelope = {
  ok: <T>(res: { code: number; msg: string; data: T | null } | undefined) =>
    res?.code === 0 ? res.data : undefined,
};
```

调用方：

```ts
const { data } = api.community.list.useQuery(input);
const listData = envelope.ok(data);   // 业务载荷 | undefined
```

#### 2.5.4 错误处理统一

```tsx
// 任何 mutation/query 的 onError 都能拿到 ApiError
const createMut = api.community.create.useMutation({
  onError: (e) => {
    if (e instanceof ApiError) {
      toast.error(e.message);   // = 后端 msg
    } else {
      toast.error("未知错误");
    }
  },
});
```

但 `tRPC` 的 `useMutation` 默认 onError 拿到的是 `TRPCClientError<AppRouter>`，**不是** `ApiError`。需要：

```ts
// src/trpc/react.tsx
import { TRPCClientError } from "@trpc/client";

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof TRPCClientError) {
    // TRPCClientError.data 是 errorFormatter 的 shape.data
    const data = e.data as { code?: number; msg?: string } | undefined;
    return new ApiError(data?.code ?? 5000, data?.msg ?? e.message);
  }
  if (e instanceof Error) return new ApiError(5000, e.message);
  return new ApiError(5000, String(e));
}
```

调用站点：

```tsx
onError: (e) => toast.error(toApiError(e).message),
```

或者**写一个全局 mutation/query 默认 onError**，详见 §3.4。

---

## 3. 文件改动清单

### 3.1 新增

| 文件 | 内容 |
|---|---|
| `src/lib/api/envelope.ts` | `ApiResponse<T>` 类型 + `ApiError` 类 + `unwrap()` + `envelope.ok()` 工具 |
| `src/lib/api/error.ts` | `toApiError()` 工具,把任意错误转 `ApiError` |
| `src/server/api/middleware/envelope.ts` | `envelopeMiddleware`(包裹成功响应) |
| `src/server/api/middleware/envelope-error.ts` | `buildEnvelopeError()`(tRPC 错误 → envelope code/msg)+ `TRPCError_CODE_MAP` |

### 3.2 修改

| 文件 | 改动 |
|---|---|
| `src/server/api/trpc.ts` | 1. `errorFormatter` 改为返回 envelope 字段;<br>2. `publicProcedure` / `protectedProcedure` 第一行加 `.use(envelopeMiddleware)`;<br>3. `adminProcedure` 同样 |
| `src/trpc/react.tsx` | 暴露 `envelope` 工具对象(可选) |
| `src/components/**/client.tsx` 全部 | `data?.items` → `envelope.ok(data)?.items` 或 `data?.data?.items` |
| `src/lib/validators/**` | 无需改 |

### 3.3 不动

- 所有 **procedure 的 `return` 语句**(继续返回业务对象)
- `superjson` transformer
- 数据库 schema / Prisma
- `auth.ts`

### 3.4 可选增强(不在本次范围)

- 全局 `useMutation` 默认 `onError` → 统一 toast
- 全局 React Query `defaultOptions` 把 TRPCClientError 自动转 ApiError
- i18n 化 `msg`

---

## 4. 迁移步骤

按以下顺序执行,每步可独立 commit + 回滚:

### Step 1: 基础类型与工具
- 新建 `src/lib/api/envelope.ts`
- 新建 `src/lib/api/error.ts`
- ✅ `pnpm tsc --noEmit` 通过

### Step 2: 服务端错误格式化
- 新建 `src/server/api/middleware/envelope-error.ts`
- 改 `src/server/api/trpc.ts` 的 `errorFormatter`
- ⚠️ 此时**成功响应未包裹**,失败已是 envelope;前端 error 处理可同步迁移

### Step 3: 服务端成功包裹
- 新建 `src/server/api/middleware/envelope.ts`
- 在三个 procedure builder 上加 `.use(envelopeMiddleware)`
- ⚠️ 此时**所有响应都是 envelope**,前端不改造就读不到业务数据

### Step 4: 前端批量迁移
按目录顺序(从最外层 page → 组件 → hook):
1. `src/components/modules/users/users-client.tsx`
2. `src/components/modules/roles/roles-client.tsx`
3. `src/components/modules/menus/menus-client.tsx`
4. `src/components/modules/community/community-page.tsx`
5. `src/components/modules/village/village-client.tsx`
6. `src/components/modules/poi/poi-client.tsx`
7. `src/components/modules/road/road-client.tsx`
8. `src/components/modules/dashboard/**`
9. 任何使用 `rpc.*.fetch` / `useUtils().*.fetch` 的地方

每个文件改动模式:
```diff
- const { data } = api.x.y.useQuery(input);
- const rows = data?.items ?? [];
+ const { data } = api.x.y.useQuery(input);
+ const rows = envelope.ok(data)?.items ?? [];
```

### Step 5: 错误处理统一
所有 `onError: (e) => toast.error(e.message)` 改为:
```ts
onError: (e) => toast.error(toApiError(e).message),
```

### Step 6: 验证
- [ ] `pnpm tsc --noEmit` 通过
- [ ] `pnpm lint` 通过
- [ ] 每个模块手测一次: 列表 / 新建 / 编辑 / 删除 / 搜索 / 排序 / 分页 / 导入 / 导出
- [ ] 触发一个故意失败(如无权限访问)验证 envelope 错误

---

## 5. 风险与权衡

### 5.1 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| **类型断链**:envelope 改造后 `inferRouterOutputs` 全变,组件编译失败 | 🟡 中 | 步骤 3 后立即跑 tsc,集中修复 |
| **错误协议混淆**:某些地方仍用 `e.data.zodError`,envelope 后路径变化 | 🟡 中 | errorFormatter 同时输出 envelope **和** 原始 zodError,保持兼容 |
| **缓存结构变化**:React Query 缓存 key 不变,但缓存值形状变了,旧缓存残留 | 🟢 低 | 升级后建议清除 localStorage 缓存或重新登录 |
| **mutation 乐观更新**:如果某处用了 `onMutate` 假设返回裸对象 | 🟡 中 | 搜一遍 `setQueryData`,确认改造点 |

### 5.2 权衡

- **侵入 vs 一致性**:选择"中间件包裹"而非"每个 procedure return envelope" → 保持 procedure 写法自然,但增加一层心智负担。
- **i18n 推迟**:`msg` 暂硬编码中文,后续上 next-intl 时再统一替换。
- **失败统一 throw**:前端调用站点拿不到 `{ code: 0, data: null }` 的 envelope;只能拿到 `T` 或抛 `ApiError`。这与现有 React Query 错误处理习惯一致,正面。

### 5.3 不在范围

- ❌ HTTP/REST envelope(若有,后续单独 ADR)
- ❌ GraphQL / WebSocket envelope
- ❌ 错误码国际化
- ❌ 错误上报/监控埋点

---

## 6. 回滚方案

每个 step 独立可回滚(对应独立 commit):

| Step | 回滚命令 |
|---|---|
| 1 | `git revert <step1-commit>` |
| 2 | `git revert <step2-commit>` 后,前端 error 处理需要手动回退 |
| 3 | ⚠️ **最危险的一步**;若前端未迁移就回滚,前端会读到双层 envelope 报错。建议客户端迁移完成后再回滚,或通过 feature flag |
| 4-5 | 各 commit 独立 revert |

**生产环境回滚**:直接 `git revert <step3-commit>` 并重新部署;前端 SSR 渲染异常会立即显现。

---

## 7. 附录:完整改动对照示例

### 7.1 procedure(不变)
```ts
// src/server/api/routers/community.ts
list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
  // ...
  return { items, total, page, pageSize };
}),
```

### 7.2 客户端调用站点
```ts
// 之前
const { data: listData } = api.community.list.useQuery(input);
const rows = listData?.items ?? [];

// 之后(选项 A: 显式 envelope.ok)
const { data: envelopeData } = api.community.list.useQuery(input);
const listData = envelope.ok(envelopeData);   // { items, total, ... } | undefined
const rows = listData?.items ?? [];

// 之后(选项 B: 工具函数 unwrap)
const { data: envelopeData } = api.community.list.useQuery(input);
const listData = envelopeData?.code === 0 ? envelopeData.data : undefined;
const rows = listData?.items ?? [];
```

**推荐统一走选项 A**,在 `src/trpc/react.tsx` 暴露 `envelope` 工具对象。

### 7.3 错误处理
```ts
// 之前
const mut = api.community.create.useMutation({
  onError: (e) => toast.error(e.message),
});

// 之后
const mut = api.community.create.useMutation({
  onError: (e) => toast.error(toApiError(e).message),
});
```

### 7.4 Network 调试
改造后,在 DevTools Network 看 `community.list` 请求的 Response body:
```json
[
  {
    "0": {
      "result": {
        "data": {
          "code": 0,
          "msg": "ok",
          "data": {
            "items": [...],
            "total": 42,
            "page": 1,
            "pageSize": 20
          }
        }
      }
    }
  }
]
```

错误时:
```json
[
  {
    "0": {
      "error": {
        "data": {
          "code": 2002,
          "msg": "无权限访问",
          "data": null,
          "zodError": null
        }
      }
    }
  }
]
```