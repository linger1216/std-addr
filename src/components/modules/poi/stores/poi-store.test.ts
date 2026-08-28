import { beforeEach, describe, expect, it } from "vitest";
import { usePoiStore } from "./poi-store";

function resetStore() {
  usePoiStore.setState({
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

describe("poi-store 编辑态流转", () => {
  it("openEdit 设置 editingId,但 form 不立即打开(等 getById 数据就绪)", () => {
    usePoiStore.getState().openEdit("row-1");
    const s = usePoiStore.getState();
    expect(s.editingId).toBe("row-1");
    expect(s.formOpen).toBe(false);
  });

  it("openFormWhenReady:有 editingId 且未打开时才打开表单(幂等)", () => {
    usePoiStore.getState().openFormWhenReady();
    expect(usePoiStore.getState().formOpen).toBe(false);

    usePoiStore.getState().openEdit("row-1");
    usePoiStore.getState().openFormWhenReady();
    expect(usePoiStore.getState().formOpen).toBe(true);

    usePoiStore.getState().setPage(2);
    usePoiStore.getState().openFormWhenReady();
    expect(usePoiStore.getState().formOpen).toBe(true);
  });

  it("closeForm 关闭并清空 editingId", () => {
    usePoiStore.getState().openEdit("row-1");
    usePoiStore.getState().openFormWhenReady();
    usePoiStore.getState().closeForm();
    const s = usePoiStore.getState();
    expect(s.formOpen).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("openCreate 清空 editingId(新建不走 getById)", () => {
    usePoiStore.getState().openEdit("row-1");
    usePoiStore.getState().openCreate();
    const s = usePoiStore.getState();
    expect(s.editingId).toBeNull();
    expect(s.formOpen).toBe(true);
  });

  it("删除/批量删除的确认态流转", () => {
    usePoiStore.getState().requestDelete({ id: "p-1", name: "市第一人民医院" });
    expect(usePoiStore.getState().deleteRow?.name).toBe("市第一人民医院");
    usePoiStore.getState().cancelDelete();
    expect(usePoiStore.getState().deleteRow).toBeNull();

    usePoiStore.getState().requestBatchDelete();
    expect(usePoiStore.getState().batchDeleteOpen).toBe(true);
    usePoiStore.getState().cancelBatchDelete();
    expect(usePoiStore.getState().batchDeleteOpen).toBe(false);
  });
});