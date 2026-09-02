import { beforeEach, describe, expect, it } from "vitest";

import { useAddrSimStore } from "./addr-sim-store";

beforeEach(() => {
  // 重置 store 到初始态(避免用例间污染)
  useAddrSimStore.setState({
    selectedIds: [],
    radioMap: {},
    ratios: {},
    editingId: null,
    editingName: "",
    editingRadio: null,
    editingStatus: 1,
    draftSteps: [],
    nameEdited: false,
    labelMap: {},
  });
});

describe("addr-sim-store 选择与占比初始化", () => {
  it("setRadioMap 同步规则占比表", () => {
    useAddrSimStore.getState().setRadioMap({ a: 40, b: 60 });
    expect(useAddrSimStore.getState().radioMap).toEqual({ a: 40, b: 60 });
  });

  it("setSelected(快捷选择):按 radioMap 自动赋占比,缺失的用均分", () => {
    const st = useAddrSimStore.getState();
    st.setRadioMap({ a: 40, b: 30, c: null });
    st.setSelected(["a", "b", "c"]);
    const { ratios } = useAddrSimStore.getState();
    // a=40(radioMap), b=30(radioMap), c 无 radio → 均分 33
    expect(ratios).toEqual({ a: 40, b: 30, c: 33 });
  });

  it("setSelected 再次调用不改已有已初始化的占比", () => {
    const st = useAddrSimStore.getState();
    st.setRadioMap({ a: 40, b: 30 });
    st.setSelected(["a"]);
    st.setSelected(["a", "b"]);
    const { ratios } = useAddrSimStore.getState();
    // a 保持 40(已有),b 新增 → 30
    expect(ratios).toEqual({ a: 40, b: 30 });
  });

  it("toggleSelect 单个勾选:radio 参数 > radioMap > 均分", () => {
    const st = useAddrSimStore.getState();
    st.setRadioMap({ a: 40, b: 30, c: null });
    st.toggleSelect("a", null); // 传 null → 用 radioMap 40
    st.toggleSelect("b", null); // 30
    st.toggleSelect("c", null); // null → 均分 floor(100/3)=33
    const { ratios } = useAddrSimStore.getState();
    expect(ratios).toEqual({ a: 40, b: 30, c: 33 });
  });

  it("toggleSelect 取消勾选时清理该规则占比", () => {
    const st = useAddrSimStore.getState();
    st.setRadioMap({ a: 40, b: 60 });
    st.setSelected(["a", "b"]);
    st.toggleSelect("a", null);
    const { ratios, selectedIds } = useAddrSimStore.getState();
    expect(selectedIds).toEqual(["b"]);
    expect(ratios).toEqual({ b: 60 });
  });
});

describe("规则名自动拼接(要素中文名以 - 连接)", () => {
  it("换要素/增删/改序都重新拼接;手动改名后停止", () => {
    const st = useAddrSimStore.getState();
    st.setLabelMap({ city: "城市", road: "路", district: "区县" });
    st.openCreate();

    const s0 = useAddrSimStore.getState();
    s0.updateStep(s0.draftSteps[0]!.id, { name: "city" });
    expect(useAddrSimStore.getState().editingName).toBe("城市");

    const s1 = useAddrSimStore.getState();
    s1.addStep({ name: "road" });
    expect(useAddrSimStore.getState().editingName).toBe("城市-路");

    const s2 = useAddrSimStore.getState();
    s2.addStep({ name: "district" });
    expect(useAddrSimStore.getState().editingName).toBe("城市-路-区县");

    const s3 = useAddrSimStore.getState();
    s3.removeStep(s3.draftSteps[1]!.id);
    expect(useAddrSimStore.getState().editingName).toBe("城市-区县");

    const s4 = useAddrSimStore.getState();
    s4.moveStep(0, 1);
    expect(useAddrSimStore.getState().editingName).toBe("区县-城市");

    // 手动改名 → 停止自动拼接
    useAddrSimStore.getState().setEditingName("自定义名");
    const s5 = useAddrSimStore.getState();
    s5.updateStep(s5.draftSteps[0]!.id, { name: "road" });
    expect(useAddrSimStore.getState().editingName).toBe("自定义名");
  });

  it("未知要素名 → 用英文 name 兜底拼接", () => {
    const st = useAddrSimStore.getState();
    st.setLabelMap({ city: "城市" });
    st.openCreate();
    const s = useAddrSimStore.getState();
    s.updateStep(s.draftSteps[0]!.id, { name: "weird" });
    expect(useAddrSimStore.getState().editingName).toBe("weird");
  });
});