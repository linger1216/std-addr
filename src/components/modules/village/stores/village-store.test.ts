import { beforeEach, describe, expect, it } from "vitest";
import { useVillageStore } from "./village-store";

/** 重置 store 到初始状态(单例 store,必须还原字段避免用例间串扰) */
function resetStore() {
  useVillageStore.setState({
    page: 1,
    pageSize: 20,
    sorting: [],
    rowSelection: {},
    formOpen: false,
    editingId: null,
    detailOpen: false,
    detailId: null,
    deleteRow: null,
    batchDeleteOpen: false,
    importOpen: false,
  });
}

beforeEach(resetStore);

describe("village-store 编辑态流转", () => {
  it("openEdit 设置 editingId,但 form 不立即打开(等 getById 数据就绪)", () => {
    useVillageStore.getState().openEdit("row-1");
    const s = useVillageStore.getState();
    expect(s.editingId).toBe("row-1");
    expect(s.formOpen).toBe(false);
  });

  it("openFormWhenReady:有 editingId 且未打开时才打开表单(幂等)", () => {
    // 无 editingId:不打开
    useVillageStore.getState().openFormWhenReady();
    expect(useVillageStore.getState().formOpen).toBe(false);

    useVillageStore.getState().openEdit("row-1");
    useVillageStore.getState().openFormWhenReady();
    expect(useVillageStore.getState().formOpen).toBe(true);

    // 已打开:再次调用不改变状态
    useVillageStore.getState().setPage(2); // 干扰项,确认只关注 formOpen
    useVillageStore.getState().openFormWhenReady();
    expect(useVillageStore.getState().formOpen).toBe(true);
  });

  it("closeForm 关闭并清空 editingId(下次编辑重新拉 getById)", () => {
    useVillageStore.getState().openEdit("row-1");
    useVillageStore.getState().openFormWhenReady();
    useVillageStore.getState().closeForm();
    const s = useVillageStore.getState();
    expect(s.formOpen).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("openCreate 清空 editingId(新建不走 getById)", () => {
    useVillageStore.getState().openEdit("row-1");
    useVillageStore.getState().openCreate();
    const s = useVillageStore.getState();
    expect(s.editingId).toBeNull();
    expect(s.formOpen).toBe(true);
  });

  it("编辑 → 保存成功(onAfterUpdate=closeForm)→ 再编辑同一行:editingId 重新赋值", () => {
    // 模拟完整链路:编辑 row-1 → 保存 → 再次编辑 row-1
    useVillageStore.getState().openEdit("row-1");
    useVillageStore.getState().openFormWhenReady();
    useVillageStore.getState().closeForm(); // onAfterUpdate

    useVillageStore.getState().openEdit("row-1");
    expect(useVillageStore.getState().editingId).toBe("row-1");
  });
});
