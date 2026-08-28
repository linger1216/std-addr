import { beforeEach, describe, expect, it } from "vitest";
import { useRoadStore } from "./road-store";

function resetStore() {
  useRoadStore.setState({
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

describe("road-store 编辑态流转", () => {
  it("openEdit 设置 editingId,但 form 不立即打开(等 getById 数据就绪)", () => {
    useRoadStore.getState().openEdit("row-1");
    const s = useRoadStore.getState();
    expect(s.editingId).toBe("row-1");
    expect(s.formOpen).toBe(false);
  });

  it("openFormWhenReady:有 editingId 且未打开时才打开表单(幂等)", () => {
    useRoadStore.getState().openFormWhenReady();
    expect(useRoadStore.getState().formOpen).toBe(false);

    useRoadStore.getState().openEdit("row-1");
    useRoadStore.getState().openFormWhenReady();
    expect(useRoadStore.getState().formOpen).toBe(true);

    useRoadStore.getState().setPage(2);
    useRoadStore.getState().openFormWhenReady();
    expect(useRoadStore.getState().formOpen).toBe(true);
  });

  it("closeForm 关闭并清空 editingId", () => {
    useRoadStore.getState().openEdit("row-1");
    useRoadStore.getState().openFormWhenReady();
    useRoadStore.getState().closeForm();
    const s = useRoadStore.getState();
    expect(s.formOpen).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("openCreate 清空 editingId(新建不走 getById)", () => {
    useRoadStore.getState().openEdit("row-1");
    useRoadStore.getState().openCreate();
    const s = useRoadStore.getState();
    expect(s.editingId).toBeNull();
    expect(s.formOpen).toBe(true);
  });

  it("删除/批量删除的确认态流转", () => {
    useRoadStore.getState().requestDelete({ id: "r-1", name: "中山大道" });
    expect(useRoadStore.getState().deleteRow?.name).toBe("中山大道");
    useRoadStore.getState().cancelDelete();
    expect(useRoadStore.getState().deleteRow).toBeNull();

    useRoadStore.getState().requestBatchDelete();
    expect(useRoadStore.getState().batchDeleteOpen).toBe(true);
    useRoadStore.getState().cancelBatchDelete();
    expect(useRoadStore.getState().batchDeleteOpen).toBe(false);
  });
});