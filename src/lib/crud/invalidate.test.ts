import { describe, expect, it, vi } from "vitest";
import {
  invalidateAll,
  type NamespaceInvalidateUtils,
  type UtilsShape,
} from "./invalidate";

function makeUtils(procs: (keyof NamespaceInvalidateUtils)[]) {
  const invalidate = vi.fn(() => Promise.resolve(undefined));
  const ns: NamespaceInvalidateUtils = {};
  for (const p of procs) ns[p] = { invalidate };
  return { invalidate, utils: { community: ns } as UtilsShape };
}

describe("invalidateAll(CRUD 修改成功后查询失效集)", () => {
  it("必须失效 list / stats / getById —— 回归:编辑表单保存后能拿到最新数据", async () => {
    // 用户场景:编辑小区添加地址 A → 保存成功 → 再次点编辑,表单必须出现 A。
    // 若 getById 未失效,React Query 在 staleTime 内命中 fresh 缓存,
    // 编辑表单仍是旧数据(只有整页刷新才正常)—— 本测试防回归。
    const { invalidate, utils } = makeUtils(["list", "stats", "getById"]);

    await invalidateAll(utils, ["community"]);

    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("多命名空间(如 road/poi/village)各自全部失效", async () => {
    const a = makeUtils(["list", "stats", "getById"]);
    const b = makeUtils(["list", "stats", "getById"]);
    const utils: UtilsShape = { community: a.utils.community, poi: b.utils.community };

    await invalidateAll(utils, ["community", "poi"]);

    expect(a.invalidate).toHaveBeenCalledTimes(3);
    expect(b.invalidate).toHaveBeenCalledTimes(3);
  });

  it("缺失某个 procedure(模块还没实现)时跳过,不报错", async () => {
    const { invalidate, utils } = makeUtils(["list"]);
    // getById 缺失的旧模块:不能抛错
    await expect(invalidateAll(utils, ["community"])).resolves.toBeUndefined();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("不存在的命名空间直接忽略", async () => {
    const { invalidate } = makeUtils(["list"]);
    await invalidateAll({}, ["no-such-module"]);
    expect(invalidate).not.toHaveBeenCalled();
  });
});