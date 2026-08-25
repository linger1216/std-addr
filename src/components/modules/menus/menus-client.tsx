"use client";

import { useState } from "react";
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

type Menu = RouterOutputs["menu"]["listAll"][number];

type FormState = {
  id: string | null;
  name: string;
  path: string;
  icon: string;
  sort: number;
  visible: boolean;
  parentId: string;
};

const emptyForm: FormState = {
  id: null,
  name: "",
  path: "",
  icon: "",
  sort: 0,
  visible: true,
  parentId: "",
};

export function MenusClient() {
  const rpc = api.useUtils();
  const { data: menus, isLoading } = api.menu.listAll.useQuery();

  const createMenu = api.menu.create.useMutation({
    onSuccess: async () => {
      await rpc.menu.listAll.invalidate();
      toast.success("菜单已创建");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMenu = api.menu.update.useMutation({
    onSuccess: async () => {
      await rpc.menu.listAll.invalidate();
      toast.success("菜单已更新");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMenu = api.menu.delete.useMutation({
    onSuccess: async () => {
      await rpc.menu.listAll.invalidate();
      toast.success("菜单已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  function openCreate(parentId = "") {
    setForm({ ...emptyForm, parentId });
    setOpen(true);
  }
  function openEdit(m: Menu) {
    setForm({
      id: m.id,
      name: m.name,
      path: m.path ?? "",
      icon: m.icon ?? "",
      sort: m.sort,
      visible: m.visible,
      parentId: m.parentId ?? "",
    });
    setOpen(true);
  }

  function submit() {
    const payload = {
      name: form.name,
      path: form.path || null,
      icon: form.icon || null,
      sort: form.sort,
      visible: form.visible,
      parentId: form.parentId ? form.parentId : null,
    };
    if (form.id) {
      updateMenu.mutate({ id: form.id, ...payload });
    } else {
      createMenu.mutate(payload);
    }
    setOpen(false);
  }

  const tree = buildMenuTree(menus ?? []);
  const parentOptions = flattenWithDepth(menus ?? [], form.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="菜单管理"
        description="维护侧边栏菜单结构与排序"
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="size-4" />
            新建菜单
          </Button>
        }
      />

      <Reveal delay={40}>
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>路径</TableHead>
            <TableHead>图标</TableHead>
            <TableHead>排序</TableHead>
            <TableHead>显示</TableHead>
            <TableHead className="w-48 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : tree.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                暂无菜单
              </TableCell>
            </TableRow>
          ) : (
            tree.map((m) => (
              <MenuRow
                key={m.id}
                node={m}
                depth={0}
                onEdit={openEdit}
                onDelete={(id) => deleteMenu.mutate({ id })}
              />
            ))
          )}
        </TableBody>
      </Table>
      </Reveal>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑菜单" : "新建菜单"}</DialogTitle>
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
              <Label htmlFor="path">路径（如 /users，父菜单可留空）</Label>
              <Input
                id="path"
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icon">图标名（如 users）</Label>
              <Input
                id="icon"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort">排序（数值小在前）</Label>
              <Input
                id="sort"
                type="number"
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parent">父菜单</Label>
              <select
                id="parent"
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="h-9 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
              >
                <option value="">(顶级)</option>
                {parentOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {"　".repeat(o.depth)}
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="visible"
                checked={form.visible}
                onCheckedChange={(c) => setForm({ ...form, visible: !!c })}
              />
              <Label htmlFor="visible">显示在侧边栏</Label>
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
    (byParent.get(pid) ?? []).map((m) => ({ ...m, children: walk(m.id) }));
  return walk(null);
}

function flattenWithDepth(menus: Menu[], excludeId: string | null) {
  const byParent = new Map<string | null, Menu[]>();
  for (const m of menus) {
    const k = m.parentId ?? null;
    const list = byParent.get(k) ?? [];
    list.push(m);
    byParent.set(k, list);
  }
  const exclude = new Set<string>();
  if (excludeId) collectSubtree(excludeId, byParent, exclude);

  const result: { id: string; name: string; depth: number }[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const m of byParent.get(pid) ?? []) {
      if (exclude.has(m.id)) continue;
      result.push({ id: m.id, name: m.name, depth });
      walk(m.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

function collectSubtree(
  id: string,
  byParent: Map<string | null, Menu[]>,
  out: Set<string>
) {
  out.add(id);
  for (const m of byParent.get(id) ?? []) {
    collectSubtree(m.id, byParent, out);
  }
}

function MenuRow({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  onEdit: (m: Menu) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell>
          <span style={{ paddingLeft: `${depth * 20}px` }}>{node.name}</span>
        </TableCell>
        <TableCell className="font-mono text-xs">{node.path ?? "—"}</TableCell>
        <TableCell>{node.icon ?? "—"}</TableCell>
        <TableCell>{node.sort}</TableCell>
        <TableCell>{node.visible ? "是" : "否"}</TableCell>
        <TableCell className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit({ ...node, children: undefined } as unknown as Menu)}>
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={() => {
              if (confirm(`确定删除菜单 ${node.name} 及其子菜单？`)) {
                onDelete(node.id);
              }
            }}
          >
            删除
          </Button>
        </TableCell>
      </TableRow>
      {node.children.map((c) => (
        <MenuRow
          key={c.id}
          node={c}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
