/**
 * 区划树通用工具(纯函数,可单测)。
 * 查找 / 计数 / 路径 / 展开集 / 搜索过滤 / 节点分类图标 集中管理,
 * 避免树遍历逻辑散落在 page / tree / form 多处重复实现。
 */

import type { RegionTreeNode } from "./region-tree";

/** 按 id 查找节点(递归) */
export function findNodeById(
  nodes: RegionTreeNode[],
  id: string,
): RegionTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 按 code 查找节点(递归) */
export function findNodeByCode(
  nodes: RegionTreeNode[],
  code: string,
): RegionTreeNode | null {
  for (const n of nodes) {
    if (n.code === code) return n;
    const hit = findNodeByCode(n.children, code);
    if (hit) return hit;
  }
  return null;
}

/** 子树节点总数(含自身) */
export function countNodes(nodes: RegionTreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

/** 根 → 目标节点 的完整 code 链(含目标自身,用于展开路径定位) */
export function collectPathCodes(
  nodes: RegionTreeNode[],
  targetCode: string,
): string[] | null {
  for (const n of nodes) {
    if (n.code === targetCode) return [n.code];
    const sub = collectPathCodes(n.children, targetCode);
    if (sub) return [n.code, ...sub];
  }
  return null;
}

/** 所有"有子节点"的 code(供"全部展开"使用) */
export function allExpandableCodes(nodes: RegionTreeNode[]): string[] {
  const codes: string[] = [];
  const walk = (list: RegionTreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) codes.push(n.code);
      walk(n.children);
    }
  };
  walk(nodes);
  return codes;
}

/**
 * 按关键词过滤树:命中名称或编码的节点保留,且祖先链全部保留;
 * 未命中且无命中后代的整支剪掉。
 */
export function filterRegionTree(
  nodes: RegionTreeNode[],
  keyword: string,
): RegionTreeNode[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return nodes;
  const hit = (n: RegionTreeNode) =>
    n.name.toLowerCase().includes(needle) ||
    n.code.toLowerCase().includes(needle);
  const walk = (list: RegionTreeNode[]): RegionTreeNode[] => {
    const out: RegionTreeNode[] = [];
    for (const n of list) {
      const children = walk(n.children);
      if (hit(n) || children.length > 0) {
        out.push({ ...n, children });
      }
    }
    return out;
  };
  return walk(nodes);
}

/** 节点分类(决定树形前的图标):街道 / 镇乡 / 村委 / 居委 / 其他 */
export type RegionNodeIconKey =
  | "street"
  | "town"
  | "village"
  | "committee"
  | "other";

/**
 * 按名称归类节点类型。判定顺序:街道 → 镇/乡 → 村委 → 居委,
 * 与导入规则(名称含区划特征)同源,手动新建的节点同样适用。
 */
export function regionNodeIcon(name: string): RegionNodeIconKey {
  if (name.includes("街道")) return "street";
  if (name.includes("镇") || name.includes("乡")) return "town";
  if (name.includes("村委会") || name.includes("村民委员会")) return "village";
  if (
    name.includes("居民委员会") ||
    name.includes("居委会") ||
    name.includes("居(村)委会")
  ) {
    return "committee";
  }
  return "other";
}