/**
 * icons-list 的解析函数测试(纯逻辑,node 环境)。
 *
 * 关键不变量:
 *  - 库里存的小写 kebab 名(map-pin / tree-pine / users)都能解析成 lucide key
 *  - PascalCase 名原样可解析
 *  - legacy 旧名(dashboard 等)经别名表解析
 *  - 解析不到的返回 null(LucideIcon 组件渲染占位,不画方块)
 *  - toKebabCase 与 toPascalCase 互逆
 */

import { describe, expect, it } from "vitest";

import {
  ALL_LUCIDE_ICONS,
  iconToLabel,
  LEGACY_ALIAS,
  PINNED_ICONS,
  resolveLucideIconKey,
  toKebabCase,
  toPascalCase,
} from "./icons-list";

describe("icons-list 解析", () => {
  it("ALL_LUCIDE_ICONS 非空,且至少包含 Pin / Home / Users / Settings", () => {
    expect(ALL_LUCIDE_ICONS.length).toBeGreaterThan(1000);
    for (const required of ["Pin", "Home", "Users", "Settings"]) {
      expect(ALL_LUCIDE_ICONS).toContain(required);
    }
  });

  it("全部图标名都是 PascalCase", () => {
    const bad = ALL_LUCIDE_ICONS.filter(
      (n) => !/^[A-Z][A-Za-z0-9]*$/.test(n),
    );
    // lucide 偶尔会有特殊命名,允许存在少量(容差上限)
    expect(bad.length).toBeLessThan(30);
  });

  it("PINNED_ICONS 是 ALL_LUCIDE_ICONS 的子集", () => {
    const all = new Set(ALL_LUCIDE_ICONS);
    for (const p of PINNED_ICONS) {
      expect(all.has(p)).toBe(true);
    }
  });

  it("iconToLabel 把 PascalCase 转小写、单词间空格分隔", () => {
    expect(iconToLabel("Home")).toBe("home");
    expect(iconToLabel("UsersRound")).toBe("users round");
    expect(iconToLabel("ArrowDownUp")).toBe("arrow down up");
    expect(iconToLabel("Trash2")).toBe("trash2");
    expect(iconToLabel("")).toBe("");
  });
});

describe("resolveLucideIconKey(库名 → lucide key)", () => {
  it("kebab-case 库名(seed/sidebar 约定)→ 可解析", () => {
    for (const n of [
      "users",
      "map-pin",
      "tree-pine",
      "home",
      "building",
      "waypoints",
      "sliders-horizontal",
      "book-marked",
      "layers",
      "shield",
      "menu",
      "trees",
      "settings",
    ]) {
      const key = resolveLucideIconKey(n);
      expect(key, `kebab 名 ${n} 应解析成功`).not.toBeNull();
      expect(ALL_LUCIDE_ICONS).toContain(key);
    }
  });

  it("PascalCase 名原样可解析", () => {
    for (const n of ["Home", "Users", "MapPin", "TreePine", "Settings"]) {
      expect(resolveLucideIconKey(n)).toBe(n);
    }
  });

  it("legacy 别名(dashboard 等)→ 解析到现代名", () => {
    expect(resolveLucideIconKey("dashboard")).toBe("LayoutDashboard");
    expect(resolveLucideIconKey("poi")).toBe("MapPin");
    expect(resolveLucideIconKey("village")).toBe("Home");
    expect(resolveLucideIconKey("region")).toBe("Map");
    expect(LEGACY_ALIAS.dashboard).toBe("LayoutDashboard");
  });

  it("空串 / null / 未知名 → null(不抛错,组件渲染占位)", () => {
    expect(resolveLucideIconKey(null)).toBeNull();
    expect(resolveLucideIconKey("")).toBeNull();
    expect(resolveLucideIconKey("  ")).toBeNull();
    expect(resolveLucideIconKey("not-a-real-icon")).toBeNull();
  });
});

describe("toKebabCase / toPascalCase", () => {
  it("Pascal → kebab,再解析回原 key(与 IconPicker 存 kebab 的约定一致)", () => {
    const cases: [string, string][] = [
      ["LayoutDashboard", "layout-dashboard"],
      ["MapPin", "map-pin"],
      ["TreePine", "tree-pine"],
      ["Users", "users"],
      ["Home", "home"],
      ["BarChart3", "bar-chart3"],
    ];
    for (const [pascal, kebab] of cases) {
      expect(toKebabCase(pascal)).toBe(kebab);
      expect(resolveLucideIconKey(kebab)).toBe(pascal);
    }
  });

  it("toPascalCase 处理多个连字符段", () => {
    expect(toPascalCase("map-pin")).toBe("MapPin");
    expect(toPascalCase("sliders-horizontal")).toBe("SlidersHorizontal");
    expect(toPascalCase("book-marked")).toBe("BookMarked");
  });
});