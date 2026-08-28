# 查询参数 Store —— `createQueryParamsStore`

> 项目书 · 状态管理卷 · 第三章

## 一句话

列表页的查询参数,用一个工厂 `createQueryParamsStore` 创建一份**模块私有**的 zustand store,
内部用 `draft`(正在编辑)+ `committed`(已生效)双态避免每次输入都重发请求。

## 为什么需要它

列表页的筛选 UI 几乎都是这样工作的:

1. 用户在搜索框打字 → UI 立刻反映,但**不要立刻查后端**
2. 用户按 Enter(或点"搜索"按钮) → 才把当前输入作为新查询条件去查
3. 用户点"重置" → 清空查询,回到第一页

如果直接用受控 input + React Query 的 `useQuery({ input })`,每次按键都会触发请求,
对后端是 N 倍压力、对前端是 N 次 loading 闪烁。React Hook Form 的"uncontrolled"语义
就是为了应对这个:`setValue` 不触发 submit,`handleSubmit` 才提交。

列表查询也是同样的需求。`createQueryParamsStore` 把这个模式固化成一份工厂,
每个模块拿一份**独立的** store 实例(共享同一份代码,但状态互不污染)。

## 状态形状

```ts
type QueryParams = Record<string, string>;

type QueryParamsState = {
  /** 用户当前正在编辑的值(尚未触发查询) */
  draft: QueryParams;
  /** 已生效、正在驱动 useQuery 的值 */
  committed: QueryParams;
  setDraft: (next: QueryParams) => void;
  patchDraft: (partial: Partial<QueryParams>) => void;
  commit: () => void;
  reset: () => void;
};
```

字段约定:

- **全部字段以 string 保存**,空串 `""` 表示"未筛选"。
  原因是 input 的原生值就是 string,中间不转换;数字/枚举等复杂类型在 useQuery 的 input
  里再做 `Number(...)` 或 `as 0 | 1`。
- **`draft` 与 `committed` 共用同一份字段形状**。
  切换到"已提交"只是把 `committed = { ...draft }` 浅拷一份,不丢字段。

## API 一览

| 方法 | 何时调 | 作用 |
| --- | --- | --- |
| `patchDraft({ q: "..." })` | input onChange | 只更新某个字段,不动其他 |
| `setDraft(next)` | 一次性重置整套(罕见) | 用 next 整体替换 draft |
| `commit()` | Enter / 点搜索 | `committed = { ...draft }`,触发查询 |
| `reset()` | 点重置 | draft 和 committed 都回到 `empty` |

没有 `setCommitted` —— `committed` 只能通过 `commit()` 从 draft 推出来,
避免出现"committed 跟 draft 不一致但没 commit"的中间状态。

## 工厂签名

```ts
// src/store/use-query-params.ts
export function createQueryParamsStore(
  empty: QueryParams,
): QueryParamsHook;
```

每个模块在自己的 `use-<module>-query-params.ts` 文件里:

```ts
import { createQueryParamsStore } from "@/store/use-query-params";

export type CommunityQueryParams = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_COMMUNITY_QUERY_PARAMS: CommunityQueryParams = {
  q: "",
  regionId: "",
  status: "",
};

export const useCommunityQueryParams =
  createQueryParamsStore(EMPTY_COMMUNITY_QUERY_PARAMS);
```

四个模块(community / road / poi / village)各持有自己的实例,类型独立,互不影响。

## 标准用法 —— Toolbar + Page 拆分

`useQueryParams` 在两种角色里被消费:

### Toolbar —— 编辑端

```tsx
// community-toolbar.tsx
export function CommunityToolbar({ ... }) {
  const draft = useCommunityQueryParams((s) => s.draft);
  const patchDraft = useCommunityQueryParams((s) => s.patchDraft);
  const commit = useCommunityQueryParams((s) => s.commit);
  const reset = useCommunityQueryParams((s) => s.reset);

  return (
    <Input
      value={draft.q}
      onChange={(e) => patchDraft({ q: e.target.value })}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
    <Button onClick={commit}>搜索</Button>
    <Button onClick={reset}>重置</Button>
  );
}
```

Toolbar 只读写 `draft`,从来不直接调 `useQuery` —— 它只管输入。

### Page —— 消费端

```tsx
// community-page.tsx
export function CommunityPage() {
  // 只读 committed,不订阅 draft(避免 Toolbar 输入时整个 Page 重渲染)
  const committed = useCommunityQueryParams((s) => s.committed);

  // 切筛选 → 回第一页
  useEffect(() => {
    actions.setPage(1);
  }, [committed.q, committed.regionId, committed.status]);

  const listQueryParas = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      q: committed.q || undefined,
      regionId: committed.regionId || undefined,
      status:
        committed.status === "" ? undefined : (Number(committed.status) as 0 | 1),
      // ...
    }),
    [state.page, state.pageSize, committed],
  );

  const { data: listData } = api.community.list.useQuery(listQueryParas);
  // ...
}
```

Page **只读 `committed`**,不订阅 `draft`。Toolbar 输入时 Page 不会重渲染,只有
Enter 触发 `commit()` 后 `committed` 变化,Page 才跟着重查。

### 选择器拆分

每个组件用 selector 只取自己关心的字段,避免不相关的字段变化触发重渲染:

```ts
// 只取 draft 字段
useCommunityQueryParams((s) => s.draft)

// 只取 commit 函数
useCommunityQueryParams((s) => s.commit)
```

不要直接 `const state = useCommunityQueryParams()` —— 这会订阅整个 store,
别处 `commit()` 时当前组件也会跟着渲染。

## 设计决策记录

### 为什么不直接用 React Hook Form

RHF 是为"提交一条记录"设计的,这里的需求是"驱动一份查询参数"。
强行用 RHF 会引入 formState、submit handler、reset 模式等额外概念,
跟"列表页 + useQuery"的搭配不够直接。

### 为什么不直接用 URL search params

URL 同步是另一层特性(分享链接、刷新保留)。这里的需求只是"暂存 vs 提交",
URL 同步是可选增强,不是这个 store 的职责。
后续若要支持,可以在 `commit()` 旁边加一个 `syncToUrl()`,跟 store 本身解耦。

### 为什么不跟 UI 态 store 合并

`use<Module>State` 管的是分页 / 排序 / 选中 / dialog open 等"展示态",
跟"查询参数"是两类不同生命周期的东西:

- 切筛选 → 回第一页 → 触发的就是这两类状态的**联动**,如果合并到同一个 store,
  模块私有 store 的字段数会膨胀到 15+,反而不好维护。
- 测试时可以独立 mock 筛选状态,不污染 UI 态。

### 为什么每模块一份独立 store

虽然工厂代码只有一份,但 `createQueryParamsStore(empty)` **每次调用都返回一个新
的 zustand store 实例**,状态完全隔离。从社区页切到道路页,两边的输入互不干扰。

## 已知坑 / 不要做的事

- ❌ 不要把 `EMPTY_*_QUERY_PARAMS` 直接传给 `setDraft` 用 —— 它是 `empty`,会被原样展开,
  但写法上应该走 `patchDraft` 局部更新。
- ❌ 不要在 Page 里订阅 `draft` —— 会导致 Toolbar 输入时整个列表重渲染。
- ❌ 不要在 store 里塞 `page` / `pageSize` / `sorting` —— 这些是 UI 态,属于
  `use<Module>State`,跟 query params 不混。
- ❌ 不要新增 `setCommitted` —— `committed` 只能通过 `commit()` 从 draft 推出。

## 相关文档

- `src/store/use-query-params.ts` —— 工厂本体
- `src/components/modules/<module>/use-<module>-query-params.ts` —— 各模块实例
- `CLAUDE.md §6` —— 状态管理约定速查
- `docs/knowledge/` —— 本目录其它知识章节(陆续补全)
