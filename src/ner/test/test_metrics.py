"""
train/metrics.py 评估指标单测:BIO 实体提取 + 实体级/字符级 P/R/F1。
"""

from train.metrics import char_scores, entity_scores, extract_entities


def test_extract_entities_基本切分():
    tags = ["O", "B-road", "I-road", "O", "B-district", "I-district", "I-district"]
    assert extract_entities(tags) == {
        ("road", 1, 3),
        ("district", 4, 7),
    }


def test_extract_entities_相邻同类型实体():
    # 两个相邻同类实体必须由 O 或不同标签分隔
    tags = ["B-road", "I-road", "O", "B-road", "I-road"]
    assert extract_entities(tags) == {("road", 0, 2), ("road", 3, 5)}


def test_extract_entities_无实体():
    assert extract_entities(["O", "O", "O"]) == set()
    assert extract_entities([]) == set()


def test_extract_entities_裸I与类型跳变():
    # 裸 I(前无 B)→ 忽略;I 类型跳变 → 结束当前实体
    tags = ["I-road", "B-road", "I-road", "I-district", "O"]
    assert extract_entities(tags) == {("road", 1, 3)}


def test_entity_scores_完全正确():
    pred = [["O", "B-road", "I-road", "O"]]
    true = [["O", "B-road", "I-road", "O"]]
    s = entity_scores(pred, true)
    assert s == {"precision": 1.0, "recall": 1.0, "f1": 1.0}


def test_entity_scores_边界偏移f1小于1():
    # 预测实体边界偏移一格(road 多包一个 token)→ 实体未命中
    pred = [["O", "B-road", "I-road", "I-road", "O"]]
    true = [["O", "B-road", "I-road", "O", "O"]]
    s = entity_scores(pred, true)
    assert s["precision"] == 0.0 and s["recall"] == 0.0 and s["f1"] == 0.0


def test_entity_scores_部分命中():
    pred = [["O", "B-road", "I-road", "O", "B-road", "O"]]
    true = [["O", "B-road", "I-road", "O", "B-district", "O"]]
    s = entity_scores(pred, true)
    # 预测 2 个实体,命中 1 个;真值 2 个,命中 1 个
    assert s["precision"] == 0.5
    assert s["recall"] == 0.5
    assert s["f1"] == 0.5


def test_entity_scores_无预测或无数值():
    assert entity_scores([["O"]], [["O"]])["f1"] == 0.0
    assert entity_scores([], [])["f1"] == 0.0


def test_char_scores_逐token命中():
    pred = [["O", "B-road", "I-road", "O"]]
    true = [["O", "B-road", "I-road", "O"]]
    s = char_scores(pred, true)
    assert s["precision"] == 1.0 and s["recall"] == 1.0 and s["f1"] == 1.0

    # 预测全 O → precision 0
    s2 = char_scores([["O", "O", "O"]], [["O", "B-road", "O"]])
    assert s2["precision"] == 0.0 and s2["recall"] == 0.0
