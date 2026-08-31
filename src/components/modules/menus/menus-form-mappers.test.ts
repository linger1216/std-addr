/**
 * 菜单表单 mapper 单测 —— 覆盖 toForm/toSubmit/empty 边界。
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  formSchema,
  toForm,
  toSubmit,
  type MenuDetailLike,
} from "./menus-form-mappers";

describe("menus-form-mappers", () => {
  describe("toForm", () => {
    it("null 时返回 EMPTY_FORM 派生", () => {
      const r = toForm(null);
      expect(r).toEqual({ id: null, ...EMPTY_FORM });
    });

    it("MenuDetailLike → 各字段正常归一(空值变空串)", () => {
      const detail: MenuDetailLike = {
        id: "menu_1",
        name: "用户管理",
        path: "/users",
        icon: "Users",
        sort: 10,
        visible: true,
        parentId: "",
      };
      expect(toForm(detail)).toEqual({
        id: "menu_1",
        name: "用户管理",
        path: "/users",
        icon: "Users",
        sort: 10,
        visible: true,
        parentId: "",
      });
    });

    it("icon/parentId 是 null → 表单空串", () => {
      const r = toForm({
        id: "menu_2",
        name: "X",
        path: "/x",
        icon: null,
        sort: 0,
        visible: false,
        parentId: "",
      });
      expect(r.icon).toBe("");
      expect(r.parentId).toBe("");
    });
  });

  describe("toSubmit", () => {
    it("表单空串字段归一为 null 提交(path/parentId/icon)", () => {
      const r = toSubmit({
        id: "menu_1",
        name: "  用户  ",
        path: "",
        icon: "",
        sort: 5,
        visible: true,
        parentId: "",
      });
      expect(r.name).toBe("用户");
      expect(r.path).toBeNull();
      expect(r.icon).toBeNull();
      expect(r.parentId).toBeNull();
      expect(r.sort).toBe(5);
      expect(r.id).toBe("menu_1");
    });

    it("id 为 null 时,提交不带 id(走 create 分支)", () => {
      const r = toSubmit({
        id: null,
        name: "X",
        path: "/x",
        icon: "Pin",
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.id).toBeUndefined();
    });
  });

  describe("formSchema", () => {
    it("name 必填,且 trim 后非空", () => {
      const r = formSchema.safeParse({
        id: null,
        name: "   ",
        path: "",
        icon: "",
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.success).toBe(false);
    });

    it("name 在限长内 + icon 在 lucide 集里 → 通过", () => {
      const r = formSchema.safeParse({
        id: null,
        name: "X",
        path: "/x",
        icon: "Users",
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.success).toBe(true);
    });

    it("icon 为空串(未选择)→ 通过", () => {
      const r = formSchema.safeParse({
        id: null,
        name: "X",
        path: "/x",
        icon: "",
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.success).toBe(true);
    });

    it("icon 为任意非空名(含 legacy 旧名)→ 通过,不阻塞保存", () => {
      const r = formSchema.safeParse({
        id: null,
        name: "X",
        path: "/x",
        icon: "bar-chart",
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.success).toBe(true);
    });

    it("icon 超长(>60 字)→ 拒", () => {
      const r = formSchema.safeParse({
        id: null,
        name: "X",
        path: "/x",
        icon: "Icon".repeat(20),
        sort: 0,
        visible: true,
        parentId: "",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path[0] === "icon")).toBe(true);
      }
    });
  });
});
