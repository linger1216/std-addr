# CLAUDE.md

> 每次启动新对话时自动加载的项目级记忆。本文档回答三个问题:
> **做什么**(技术栈/目录)、**怎么做**(约定/规范)、**不要做什么**(踩过的坑)。

---

## 1. 项目简介

`std-addr` —— 小区/道路/POI/楼宇等地址类基础信息管理系统。Next.js 15 + tRPC + Prisma + MySQL,前端为社区模块标杆 CRUD,后续扩展 road/poi/village/users/menus/roles 等模块。

---

## 2. 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 15 (App Router, Turbopack) + React 19 |
| API | tRPC v11 (transformer + link 链路) |
| 数据 | Prisma + MySQL (MariaDB),schema 在 `prisma/schema.prisma`,生成的 client 在 `generated/` |
| 表状态 | TanStack Table v9 (用 `createTableHook` 封装成 `lib/table.ts`) |
| 表单 | react-hook-form + zodResolver + zod |
| 状态 | zustand (模块私有 store 用 `createQueryParamsStore` 工厂) |
| 序列化 | SuperJSON + 自研 envelope 包装 |
| 样式 | Tailwind CSS + shadcn 风格组件 |
| 包管理 | pnpm (workspace 单包) |

---

## 3. 目录结构

```
src/
├── app/                           # Next.js App Router 路由
│   ├── (main)/                   # 已认证区域(侧边栏布局)
│   └── api/trpc/[trpc]/route.ts  # tRPC fetch handler
├── components/
│   ├── modules/                  # 业务模块(每个含 page/table/form/detail/toolbar/stats/store)
│   │   ├── community/            # 标杆 CRUD,代码已对齐通用 hooks
│   │   ├── road/ poi/ village/   # 待对齐 community 模板
│   │   ├── users/ menus/ roles/  # 管理类模块
│   │   └── shared/               # 跨模块复用组件(excel-import / pagination-control)
│   ├── ui/                       # 通用 UI 组件(基于 shadcn)
│   └── layout/                   # 全局布局(sidebar / page-transition)
├── lib/
│   ├── api/                      # envelope/transformer/link 基础设施
│   ├── crud/                     # use-crud-{table,excel,mutations} 通用 hooks
│   ├── validators/               # 共享 zod schema
│   ├── constants.ts              # 业务常量(STATUS / PAGE_SIZES / orEmpty)
│   ├── format.ts                 # 日期/JSON 格式化
│   ├── table.ts                  # useAppTable / createAppColumnHelper
│   └── utils.ts                  # cn() 等
├── server/
│   ├── api/                      # tRPC routers + middleware
│   ├── auth/                     # NextAuth 配置
│   └── db.ts                     # Prisma client 单例
├── store/                        # 全局 zustand stores
│   └── use-query-params.ts       # createQueryParamsStore 工厂
└── trpc/                         # tRPC 客户端 provider
    ├── react.tsx
    ├── server.ts
    └── query-client.ts
```

---

## 4. 关键架构约定

### 4.1 API 响应统一 envelope ⚠️

**所有 tRPC 接口返回 `{ code, msg, data }` 三字段封装**:
- `code === 0` 成功,`data` 为业务载荷
- `code !== 0` 失败,`msg` 为可展示的错误信息,`data` 为 `null`
- 错误码分桶: `0` 成功 / `1xxx` 通用业务 / `2xxx` 鉴权 / `3xxx` 校验 / `4xxx` 冲突 / `5xxx` 系统

调用站点写法**不变** —— hook 直接吐业务数据,envelope 透明。详见 `docs/adr/0001-trpc-api-envelope.md`。

### 4.2 transformer 一致性 ⚠️

server 与 client **必须共用同一个 `superjsonEnvelopeTransformer`**(在 `src/lib/api/envelope-transformer.ts`)。
否则服务端包了 envelope、客户端解不开 → `SuperJSON.deserialize` 把响应吞成 `undefined` → React Query 永远 pending → 页面一直 loading。

```ts
// src/server/api/trpc.ts
transformer: superjsonEnvelopeTransformer

// src/trpc/react.tsx
httpBatchLink({ transformer: superjsonEnvelopeTransformer, ... })
```

### 4.3 错误归一

`tRPCClientError` / `Error` / `unknown` 一律用 `toApiError()` 转 `ApiError`:
```ts
import { toApiError } from "@/lib/api/error";
onError: (e) => toast.error(toApiError(e).message),
```

### 4.4 模块结构(标杆: community)

每个 CRUD 模块目录包含:
```
<module>/
├── <module>-page.tsx         # 顶层编排(纯组件拼装,无业务逻辑)
├── <module>-table.tsx       # 列定义 + 展示组件
├── <module>-form.tsx        # RHF + zodResolver
├── <module>-detail.tsx      # 详情展示
├── <module>-toolbar.tsx     # 筛选 + 操作按钮
├── <module>-stats.tsx       # 顶部指标卡
├── stores/<module>-store.ts # UI 态(分页/排序/选中/dialog open)
└── use-<module>-query-params.ts  # createQueryParamsStore 实例
```

### 4.5 通用 CRUD hooks(必用)

| Hook | 职责 |
| --- | --- |
| `useCrudTable` | tanstack table + 分页/排序/选中/行回调统一 |
| `useCrudExcel` | 导出 + 导入 dialog 调度(自动 toast) |
| `useCrudMutations` | create/update/delete/deleteMany 自动 invalidate + toast + 副作用 |
| `createQueryParamsStore` (工厂) | draft/committed 双态查询参数,Enter 触发 commit |

**不要**在这套 hook 上加更多层抽象 —— 4 个就够,过度封装反而更难维护。

---

## 5. React / Next.js 规则 ⚠️

### Rules of Hooks

`useMutation` / `useQuery` / `useState` / `useEffect` 等**所有 hook 必须在函数顶层无条件调用**:
- ❌ 不能在 `useMemo` / `useEffect` 回调里调用 hook
- ❌ 不能条件调用(`if (xxx) useState(...)`)
- 动态 mutation 集合要展开成固定数量的 hook 调用,不能用 `useMemo` 包

### Flex + overflow 模式 ⚠️

浮层类组件(下拉、tooltip、popover)需要内部滚动时:
```tsx
<div className="flex flex-col overflow-hidden max-h-..."> {/* 外层必须 overflow-hidden */}
  <div className="shrink-0">...</div>                  {/* 固定区 */}
  <div className="min-h-0 flex-1 overflow-y-auto">...</div> {/* 滚动区,min-h-0 必加 */}
</div>
```
没有 `min-h-0` 时 flex 子元素默认 `min-height: auto`,会撑爆 `max-height`,`overflow-y: auto` 永远不触发。

### 浮层滚动定位

fixed 浮层 + Portal 到 body 时,**滚动时重新定位**(调 `trigger.getBoundingClientRect()` 更新 rect),不要直接关闭 —— 否则选项列表内部滚动、外层 toolbar 滚动、页面滚动都会误关。`resize` 保留关闭。

---

## 6. 状态管理约定

### 模块私有 store(用 createQueryParamsStore 工厂)

```ts
// src/store/use-query-params.ts 已有
export const useCommunityQueryParams = createQueryParamsStore(EMPTY_COMMUNITY_QUERY_PARAMS);
```

UI 态(分页/排序/选中/dialog open)放在模块私有 zustand store,**用 useShallow 拆分 selectors**,避免 27 字段全订阅导致渲染抖动。

### 服务端状态(tRPC + React Query)

- `staleTime: 30s` (全局)
- 数据变更走 `useCrudMutations`,自动 invalidate list + stats + **getById**
  (getById 漏失效 = 编辑表单读到旧缓存,有回归测试守护:`src/lib/crud/invalidate.test.ts`)

---

## 7. 代码风格

- **中文优先**: 注释、文档、UI 文案、commit message、对话回复
- **type 优先**: 业务对象类型从 `RouterOutputs["module"]["procedure"]` 推导,不手写
- **单一事实来源**: 列定义、状态码、错误码都用 const 常量或类型推导
- **避免过度封装**: 4 个 CRUD hook 已是上限,新需求先在模块内实现,跨 3+ 模块复用才抽
- **细节差异保留**: 不抽 `<CrudPage>`/`<CrudToolbar>` 等 UI 通用组件,模块视觉细节差异大,抽出来反而失真
- **详情字段顺序**: `<module>-detail.tsx` 里创建时间/更新时间必须放在详情字段的**最后**显示(标杆: community)

---

## 8. 开发流程

### 修改前

1. 读 `docs/adr/` 里的 ADR(若有相关),理解当前架构决策
2. 标杆参考 `src/components/modules/community/` 的实现
3. 不要触碰 git status 里别人留下的 `M` 标记文件,除非明确属于本次工作

### 修改后(必跑)

```bash
# 1. 类型检查
node_modules/.bin/tsc --noEmit -p tsconfig.json

# 2. lint(只看本次涉及目录)
node_modules/.bin/next lint --quiet --dir <本次修改的目录>

# 3. 单测(改动 CRUD / 表单 / 状态逻辑必跑;失败 = bug 未修完)
pnpm test
```

提交前两条必须 exit 0(测试 3 条无失败用例)。

### Commit 规范

- 分多个 commit 而不是一个巨 commit(便于 review 和回滚)
- commit message 中文,说明"做什么 + 为什么"
- 引用 ADR 文件:`详见 docs/adr/0001-xxx.md`
- 不混进自己无法 review 的改动(别人的 stash / 工作区脏文件)

---

## 9. 已沉淀的文档

| 文档 | 内容 |
| --- | --- |
| `docs/adr/0001-trpc-api-envelope.md` | envelope 化完整 ADR(背景/设计/迁移/回滚) |
| `docs/conventions/api-response-envelope.md` | envelope 简版约定 |
| `docs/knowledge/` | 项目书 · 各知识点章节(状态管理、tRPC 链路、表格封装……持续补全) |
| `docs/css/css.md` | 样式约定(若存在) |

`design/` 目录在 `.gitignore` 内,只用于本地重构方案草稿,不进 commit。

---

## 10. 已知坑 / 不要做的事

- ❌ 客户端 `httpBatchLink` 用裸 `SuperJSON` 而服务端用 envelope transformer → 永远 loading
- ❌ `useCrudMutations` 把 `useMutation` 包进 `useMemo` → Rules of Hooks 违规
- ❌ `React Query data === undefined` 时页面显示"一直 loading" → 检查 transformer 一致性
- ❌ 删除 `.npmrc`(原来 commit 过,误删会让 dev server 配置失效)
- ❌ 把 `package.json` 改动混进功能 commit(它经常因为依赖调整大改,应独立 commit)
- ❌ 浮层类组件用 `addEventListener("scroll", close, true)` 直接关闭 —— 误伤自身滚动
- ❌ flex 子元素做内部滚动时忘记加 `min-h-0`

---

## 11. 常用命令

```bash
# 开发
pnpm dev                                # 启动 dev server
pnpm build                              # 生产构建

# 检查
node_modules/.bin/tsc --noEmit -p tsconfig.json      # 类型检查
node_modules/.bin/next lint --quiet --dir <dir>     # lint 指定目录
pnpm test                                           # 单测/回归(vitest)

# 数据库
pnpm db:generate                        # prisma generate
```

---

## 12. 与 AI agent 协作的元约定

- 用户倾向 **方案评审后再动手**: 复杂改动(跨模块/改架构)先写设计文档等确认
- **不要替用户决定范围**: 不擅自 commit 别人工作区里的未跟踪改动
- **中文对话 + 中文文档**,技术术语保留英文
- 每次重大改动结束,主动总结做了什么 + 验证清单(tsc/lint/smoke test)
- 报错时优先定位**根因**而非绕开症状(例:`httpBatchStreamLink` 显示问题 → 根因是 batch 协议不匹配,不是 link 选错)