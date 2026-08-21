# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## 从模板新建项目

模板自带 `new.sh` 复制脚本，可一键生成同结构的新项目。

### 1. 复制项目

```bash
./new.sh <项目名> [目标目录]
# 例: ./new.sh my-app ~/projects
```

脚本会做：
- `rsync` 复制项目（排除 `node_modules` / `.next` / `generated` / `.env`）
- 把所有 `std-addr` 文本替换成 `<项目名>`
- 从 `.env.example` 生成 `.env`，**自动生成 `AUTH_SECRET`**（用 `crypto.randomBytes`）
- 更新 `DATABASE_URL` 中的数据库名为 `<项目名>`

### 2. 手动创建数据库

`prisma db push` 不能创建数据库本身，库需手动建（推荐 utf8mb4）：

```bash
mysql -u root -p -e "CREATE DATABASE \`<项目名>\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 3. 编辑 `.env` 填数据库密码

`new.sh` 生成的 `.env` 中密码占位为 `password`，需替换为真实密码。

### 4. 安装依赖 + 一键初始化数据库

```bash
pnpm install      # postinstall 自动跑 prisma generate 生成客户端
pnpm db:setup     # 一键: prisma db push (建表) + tsx scripts/seed.ts (种子数据)
```

`pnpm db:setup` 写入：管理员角色 + `admin / 123456` 用户 + 完整菜单树（仪表盘 / 系统管理 → 用户管理 / 角色管理 / 菜单管理）。

### 5. 启动

```bash
pnpm dev
# 浏览器打开 http://localhost:3000
# 用 admin / 123456 登录
```

### 完整流程速记

```bash
./new.sh my-app ~/projects && cd ~/projects/my-app
mysql -u root -p -e "CREATE DATABASE \`my-app\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# 编辑 .env 填真实数据库密码
pnpm install && pnpm db:setup && pnpm dev
```

---

## 业务模块结构

项目采用 `app/(main)/` 路由组 + `components/modules/` 组件模块的划分方式，所有管理后台页面均遵循同一套目录结构和开发套路。

### 目录结构

```
src/
├── app/
│   ├── (auth)/                # 免登录页：登录/注册等
│   │   └── login/page.tsx
│   ├── (main)/               # 需要登录的后台页面
│   │   ├── layout.tsx        # 布局：auth guard + 侧边栏
│   │   ├── page.tsx          # 仪表盘
│   │   ├── users/page.tsx    # 用户管理（薄包装）
│   │   ├── roles/page.tsx    # 角色管理
│   │   └── menus/page.tsx    # 菜单管理
│   └── layout.tsx            # 根布局（含 Toaster）
├── components/
│   ├── layout/               # 全局布局组件
│   │   ├── sidebar-provider.tsx  # 客户端包装：管理 collapsed 状态
│   │   ├── sidebar.tsx       # 动态侧边栏（菜单树驱动，可折叠）
│   │   └── topbar.tsx        # 顶部栏：侧边栏开关 + 用户名 + 退出
│   ├── modules/              # 业务模块组件（CRUD 客户端）
│   │   ├── users/
│   │   │   └── users-client.tsx
│   │   ├── roles/
│   │   │   └── roles-client.tsx
│   │   └── menus/
│   │       └── menus-client.tsx
│   └── ui/                   # shadcn/ui 基础组件
└── server/
    └── api/
        ├── routers/          # tRPC 路由
        │   ├── menu.ts
        │   ├── role.ts
        │   ├── user.ts
        │   └── root.ts
        └── trpc.ts           # tRPC 初始化（含 adminProcedure）
```

### 常用脚本

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 启动开发服务器（含 Turbopack） |
| `pnpm build` | 生产构建 |
| `pnpm typecheck` | 仅类型检查 |
| `pnpm db:push` | 仅同步 Prisma schema 到数据库 |
| `pnpm db:seed` | 仅跑种子脚本 |
| `pnpm db:setup` | **一键：建表 + 跑种子**（新建/重置库用） |
| `pnpm db:studio` | Prisma Studio 数据浏览 |
| `./new.sh <名>` | 从模板复制出新项目 |

### 添加新业务模块（套路）

假设新增一个 `Article`（文章）模块，按以下步骤扩展：

#### 1. 扩展 Prisma Schema

在 `prisma/schema.prisma` 中添加 model，然后 `pnpm db:push` 同步到数据库（保留现有数据）。

#### 2. 编写 tRPC Router

在 `src/server/api/routers/` 下新建 `article.ts`：

```ts
// src/server/api/routers/article.ts
import { z } from "zod";
import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";

export const articleRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db.article.findMany({ orderBy: { createdAt: "desc" } }),
  ),
  create: adminProcedure
    .input(z.object({ title: z.string(), content: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.article.create({ data: input })),
  update: adminProcedure
    .input(z.object({ id: z.string(), title: z.string(), content: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.article.update({ where: { id: input.id }, data: input }),
    ),
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.article.delete({ where: { id: input.id } })),
});
```

#### 3. 注册 Router

在 `src/server/api/root.ts` 中 import 并挂载：

```ts
import { articleRouter } from "./routers/article";
// ...
export const appRouter = createTRPCRouter({
  article: articleRouter,  // ← 加这一行
});
```

#### 4. 编写业务组件

在 `src/components/modules/articles/` 下新建 `articles-client.tsx`（客户端组件，包含列表 + 弹窗 CRUD）：

```tsx
// src/components/modules/articles/articles-client.tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type RouterOutputs } from "@/trpc/react";

type Article = RouterOutputs["article"]["list"][number];

export function ArticlesClient() {
  const utils = api.useUtils();
  const { data: articles, isLoading } = api.article.list.useQuery();
  const create = api.article.create.useMutation({ onSuccess: () => { utils.article.list.invalidate(); toast.success("创建成功"); }, onError: (e) => toast.error(e.message) });
  const update = api.article.update.useMutation({ ...同上... });
  const remove = api.article.delete.useMutation({ ...同上... });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: null as string|null, title: "", content: "" });

  function openCreate() { setForm({ id: null, title: "", content: "" }); setOpen(true); }
  function openEdit(a: Article) { setForm({ id: a.id, title: a.title, content: a.content }); setOpen(true); }

  function submit() {
    if (form.id) update.mutate({ id: form.id, title: form.title, content: form.content });
    else create.mutate({ title: form.title, content: form.content });
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">文章管理</h1>
        <Button onClick={openCreate}>新建文章</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>标题</TableHead><TableHead>操作</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {articles?.map(a => (
            <TableRow key={a.id}>
              <TableCell>{a.title}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button variant="outline" size="sm" onClick={() => openEdit(a)}>编辑</Button>
                <Button variant="destructive" size="sm" onClick={() => { if(confirm("确定?")) remove.mutate({ id: a.id }); }}>删除</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "编辑" : "新建"}文章</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>标题</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div className="space-y-1"><Label>内容</Label><Input value={form.content} onChange={e => setForm({...form, content: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={submit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

#### 5. 编写页面路由

```tsx
// src/app/(main)/articles/page.tsx
import { ArticlesClient } from "@/components/modules/articles/articles-client";
export default function ArticlesPage() {
  return <ArticlesClient />;
}
```

#### 6. 验证

```bash
pnpm typecheck && pnpm build
```

---

## 技术栈

- [Next.js](https://nextjs.org)
- [NextAuth.js v5](https://next-auth.js.org)
- [Prisma](https://prisma.io) + MariaDB
- [tRPC](https://trpc.io)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui (@base-ui/react)](https://ui.shadcn.com)
- [lucide-react](https://lucide.dev)

## 部署

See the [T3 Stack deployment guides](https://create.t3.gg/en/deployment/vercel) for Vercel, Netlify and Docker.
