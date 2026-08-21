"use client";

import { useState } from "react";
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
  const utils = api.useUtils();
  const { data: users, isLoading } = api.user.list.useQuery();
  const { data: roles } = api.role.list.useQuery();

  const createUser = api.user.create.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
      toast.success("用户已创建");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateUser = api.user.update.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
      toast.success("用户已更新");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteUser = api.user.delete.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
      toast.success("用户已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">用户管理</h1>
        <Button onClick={openCreate}>新建用户</Button>
      </div>

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
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                加载中...
              </TableCell>
            </TableRow>
          ) : users?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                暂无用户
              </TableCell>
            </TableRow>
          ) : (
            users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.username}</TableCell>
                <TableCell>{u.name ?? "-"}</TableCell>
                <TableCell>{u.role?.name ?? "-"}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                    编辑
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`确定删除用户 ${u.username}?`)) {
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑用户" : "新建用户"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!form.id}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">昵称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">
                {form.id ? "密码(留空则不修改)" : "密码"}
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role">角色</Label>
              <select
                id="role"
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
