"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/trpc/react";

type Role = RouterOutputs["role"]["list"][number];
type Menu = RouterOutputs["menu"]["listAll"][number];

type FormState = {
  id: string | null;
  name: string;
  code: string;
  description: string;
};

const emptyForm: FormState = { id: null, name: "", code: "", description: "" };

export function RolesClient() {
  const utils = api.useUtils();
  const { data: roles, isLoading } = api.role.list.useQuery();
  const { data: allMenus } = api.menu.listAll.useQuery();

  const createRole = api.role.create.useMutation({
    onSuccess: async () => {
      await utils.role.list.invalidate();
      toast.success("角色已创建");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateRole = api.role.update.useMutation({
    onSuccess: async () => {
      await utils.role.list.invalidate();
      toast.success("角色已更新");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteRole = api.role.delete.useMutation({
    onSuccess: async () => {
      await utils.role.list.invalidate();
      toast.success("角色已删除");
    },
    onError: (e) => toast.error(e.message),
  });
  const setMenus = api.role.setMenus.useMutation({
    onSuccess: async () => {
      await utils.role.list.invalidate();
      toast.success("授权已保存");
    },
    onError: (e) => toast.error(e.message),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [authRoleId, setAuthRoleId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const { data: roleMenuIds } = api.role.menuIds.useQuery(
    { roleId: authRoleId ?? "" },
    { enabled: !!authRoleId }
  );
  useEffect(() => {
    if (roleMenuIds) setChecked(roleMenuIds);
  }, [roleMenuIds]);

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
  }
  function openEdit(r: Role) {
    setForm({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description ?? "",
    });
    setFormOpen(true);
  }

  function submitForm() {
    if (form.id) {
      updateRole.mutate({
        id: form.id,
        name: form.name,
        code: form.code,
        description: form.description || null,
      });
    } else {
      createRole.mutate({
        name: form.name,
        code: form.code,
        description: form.description || null,
      });
    }
    setFormOpen(false);
  }

  function toggleMenu(id: string) {
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const tree = buildMenuTree(allMenus ?? []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="角色管理"
        description="定义角色、绑定菜单权限"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建角色
          </Button>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>标识</TableHead>
            <TableHead>用户数</TableHead>
            <TableHead>菜单数</TableHead>
            <TableHead className="w-52 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : roles?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                暂无角色
              </TableCell>
            </TableRow>
          ) : (
            roles?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell>{r._count.users}</TableCell>
                <TableCell>{r._count.menus}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChecked([]);
                      setAuthRoleId(r.id);
                    }}
                  >
                    授权
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#ff3b30]"
                    onClick={() => {
                      if (confirm(`确定删除角色 ${r.name}？`)) {
                        deleteRole.mutate({ id: r.id });
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

      {/* 角色表单 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑角色" : "新建角色"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">标识（code）</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                disabled={!!form.id}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">描述</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button onClick={submitForm}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 菜单授权 */}
      <Dialog
        open={!!authRoleId}
        onOpenChange={(o) => !o && setAuthRoleId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>菜单授权</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border p-3">
            {tree.map((m) => (
              <MenuNodeCheck
                key={m.id}
                node={m}
                depth={0}
                checked={checked}
                onToggle={toggleMenu}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAuthRoleId(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (authRoleId) setMenus.mutate({ roleId: authRoleId, menuIds: checked });
                setAuthRoleId(null);
              }}
            >
              保存授权
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TreeNode = Menu & { children: TreeNode[] };

function buildMenuTree(menus: Menu[]): TreeNode[] {
  const byParent = new Map<string | null, Menu[]>();
  for (const m of menus) {
    const k = m.parentId ?? null;
    const list = byParent.get(k) ?? [];
    list.push(m);
    byParent.set(k, list);
  }
  const walk = (pid: string | null): TreeNode[] =>
    (byParent.get(pid) ?? []).map((m) => ({
      ...m,
      children: walk(m.id),
    }));
  return walk(null);
}

function MenuNodeCheck({
  node,
  depth,
  checked,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  checked: string[];
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        <Checkbox
          checked={checked.includes(node.id)}
          onCheckedChange={() => onToggle(node.id)}
          id={`menu-${node.id}`}
        />
        <label htmlFor={`menu-${node.id}`} className="cursor-pointer text-[13px]">
          {node.name}
        </label>
      </div>
      {hasChildren && (
        <div>
          {node.children.map((c) => (
            <MenuNodeCheck
              key={c.id}
              node={c}
              depth={depth + 1}
              checked={checked}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
