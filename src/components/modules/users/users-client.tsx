"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { TableSkeleton } from "@/components/ui/skeleton-blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/trpc/react";

type User = RouterOutputs["user"]["list"][number];

type FormState = {
  id: string | null;
  username: string;
  password: string;
  name: string;
  roleId: string;
};

const emptyForm: FormState = {
  id: null,
  username: "",
  password: "",
  name: "",
  roleId: "",
};

export function UsersClient() {
  const rpc = api.useUtils();
  const { data: users, isLoading } = api.user.list.useQuery();
  const { data: roles } = api.role.list.useQuery();

  const createUser = api.user.create.useMutation({
    onSuccess: async () => {
      await rpc.user.list.invalidate();
      toast.success("用户已创建");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateUser = api.user.update.useMutation({
    onSuccess: async () => {
      await rpc.user.list.invalidate();
      toast.success("用户已更新");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = api.user.delete.useMutation({
    onSuccess: async () => {
      await rpc.user.list.invalidate();
      toast.success("用户已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!users) return [];
    const k = q.trim().toLowerCase();
    if (!k) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(k) ||
        (u.name ?? "").toLowerCase().includes(k) ||
        (u.role?.name ?? "").toLowerCase().includes(k)
    );
  }, [users, q]);

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(u: User) {
    setForm({
      id: u.id,
      username: u.username,
      password: "",
      name: u.name ?? "",
      roleId: u.roleId ?? "",
    });
    setOpen(true);
  }

  function submit() {
    if (form.id) {
      updateUser.mutate({
        id: form.id,
        name: form.name || undefined,
        password: form.password || undefined,
        roleId: form.roleId ? form.roleId : null,
      });
    } else {
      createUser.mutate({
        username: form.username,
        password: form.password,
        name: form.name || undefined,
        roleId: form.roleId ? form.roleId : null,
      });
    }
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="用户管理"
        description="管理系统账号、昵称与角色绑定"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建用户
          </Button>
        }
      />

      <Reveal>
        <div className="flex items-center justify-between gap-3">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索用户名/昵称/角色"
            className="h-8 border-transparent bg-secondary pl-8 pr-3 text-[13px]"
          />
        </div>
        <div className="text-[12.5px] text-muted-foreground">
          共 {filtered.length} 人
        </div>
      </div>
      </Reveal>

      <Reveal delay={60}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户名</TableHead>
            <TableHead>昵称</TableHead>
            <TableHead>角色</TableHead>
            <TableHead className="w-40 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {q ? "无匹配用户" : "暂无用户"}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.name ?? "—"}</TableCell>
                <TableCell>{u.role?.name ?? "—"}</TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                    编辑
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`确定删除用户 ${u.username}？`)) {
                        deleteUser.mutate({ id: u.id });
                      }
                    }}
                  >
                    删除
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </Reveal>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑用户" : "新建用户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!form.id}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">
                {form.id ? "密码（留空则不修改）" : "密码"}
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">角色</Label>
              <select
                id="role"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="h-9 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
              >
                <option value="">无角色</option>
                {roles?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
