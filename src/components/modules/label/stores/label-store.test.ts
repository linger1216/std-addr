import { beforeEach, describe, expect, it } from "vitest";
import { useLabelStore } from "./label-store";

function resetStore() {
  useLabelStore.setState({
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

describe("label-store 编辑态流转", () => {
  it("openEdit 设置 editingId,但 form 不立即打开(等 getById 数据就绪)", () => {
    useLabelStore.getState().openEdit("row-1");
    const s = useLabelStore.getState();
    expect(s.editingId).toBe("row-1");
    expect(s.formOpen).toBe(false);
  });

  it("openFormWhenReady:有 editingId 且未打开时才打开表单(幂等)", () => {
    useLabelStore.getState().openFormWhenReady();
    expect(useLabelStore.getState().formOpen).toBe(false);

    useLabelStore.getState().openEdit("row-1");
    useLabelStore.getState().openFormWhenReady();
    expect(useLabelStore.getState().formOpen).toBe(true);

    useLabelStore.getState().setPage(2);
    useLabelStore.getState().openFormWhenReady();
    expect(useLabelStore.getState().formOpen).toBe(true);
  });

  it("closeForm 关闭并清空 editingId", () => {
    useLabelStore.getState().openEdit("row-1");
    useLabelStore.getState().openFormWhenReady();
    useLabelStore.getState().closeForm();
    const s = useLabelStore.getState();
    expect(s.formOpen).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("openCreate 清空 editingId(新建不走 getById)", () => {
    useLabelStore.getState().openEdit("row-1");
    useLabelStore.getState().openCreate();
    const s = useLabelStore.getState();
    expect(s.editingId).toBeNull();
    expect(s.formOpen).toBe(true);
  });

  it("删除/批量删除的确认态流转", () => {
    useLabelStore.getState().requestDelete({ id: "l-1", name: "province" });
    expect(useLabelStore.getState().deleteRow?.name).toBe("province");
    useLabelStore.getState().cancelDelete();
    expect(useLabelStore.getState().deleteRow).toBeNull();

    useLabelStore.getState().requestBatchDelete();
    expect(useLabelStore.getState().batchDeleteOpen).toBe(true);
    useLabelStore.getState().cancelBatchDelete();
    expect(useLabelStore.getState().batchDeleteOpen).toBe(false);
  });
});