import { beforeEach, describe, expect, it } from "vitest";
import { useStdAddressStore } from "./std-address-store";

/** 重置 store 到初始状态(单例 store,必须还原字段避免用例间串扰) */
function resetStore() {
  useStdAddressStore.setState({
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
  });
}

beforeEach(resetStore);

describe("std-address-store 编辑态流转", () => {
  it("openEdit 设置 editingId,但 form 不立即打开(等 getById 数据就绪)", () => {
    useStdAddressStore.getState().openEdit("row-1");
    const s = useStdAddressStore.getState();
    expect(s.editingId).toBe("row-1");
    expect(s.formOpen).toBe(false);
  });

  it("openFormWhenReady:有 editingId 且未打开时才打开表单(幂等)", () => {
    // 无 editingId:不打开
    useStdAddressStore.getState().openFormWhenReady();
    expect(useStdAddressStore.getState().formOpen).toBe(false);

    useStdAddressStore.getState().openEdit("row-1");
    useStdAddressStore.getState().openFormWhenReady();
    expect(useStdAddressStore.getState().formOpen).toBe(true);

    // 已打开:再次调用不改变状态
    useStdAddressStore.getState().openFormWhenReady();
    expect(useStdAddressStore.getState().formOpen).toBe(true);
  });

  it("closeForm 关闭并清空 editingId(下次编辑重新拉 getById)", () => {
    useStdAddressStore.getState().openEdit("row-1");
    useStdAddressStore.getState().openFormWhenReady();
    useStdAddressStore.getState().closeForm();
    const s = useStdAddressStore.getState();
    expect(s.formOpen).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("openCreate 清空 editingId(新建不走 getById)", () => {
    useStdAddressStore.getState().openEdit("row-1");
    useStdAddressStore.getState().openCreate();
    const s = useStdAddressStore.getState();
    expect(s.editingId).toBeNull();
    expect(s.formOpen).toBe(true);
  });

  it("删除流转:requestDelete 只存 id/name,确认后 cancel 清空", () => {
    useStdAddressStore.getState().requestDelete({ id: "row-1", name: "永跃路260弄" });
    expect(useStdAddressStore.getState().deleteRow).toEqual({
      id: "row-1",
      name: "永跃路260弄",
    });
    useStdAddressStore.getState().cancelDelete();
    expect(useStdAddressStore.getState().deleteRow).toBeNull();
  });

  it("分页:setPageSize 重置回第 1 页;setPage 不小于 1", () => {
    useStdAddressStore.getState().setPage(3);
    useStdAddressStore.getState().setPageSize(50);
    const s = useStdAddressStore.getState();
    expect(s.pageSize).toBe(50);
    expect(s.page).toBe(1);

    useStdAddressStore.getState().setPage(0);
    expect(useStdAddressStore.getState().page).toBe(1);
  });
});