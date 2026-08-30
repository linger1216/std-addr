"""
评估指标 —— BIO 序列的实体级 / 字符级 P/R/F1。

- 实体级(entity-level):按 BIO 规则把标签序列切分为实体集合 (type, start, end),
  统计集合级 P/R/F1 —— NER 业界标准指标(评估时以它为准,选择 best 模型)。
- 字符级(char-level):逐 token 展平比较(非 O 标签命中率),与原实现语义一致。

用法:
    from train.metrics import entity_scores, char_scores
    p, r, f1 = entity_scores(pred_tags_list, true_tags_list)
"""

from __future__ import annotations

from typing import Dict, List, Sequence, Set, Tuple


def extract_entities(tags: Sequence[str]) -> Set[Tuple[str, int, int]]:
    """从 BIO 标签序列提取实体集合 {(type, start, end)}。

    规则:B- 开始一个新实体;I- 延续当前同类型实体;O / 类型切换 结束当前实体。
    非法序列(B 后直接不同类型 I、裸 I 等)按"忽略裸 I"处理,尽量稳健。

    Args:
        tags: BIO 标签列表,如 ["O", "B-road", "I-road", "O"]

    Returns:
        实体集合,元素为 (实体类型, 起始下标, 结束下标(不含))
    """
    entities: Set[Tuple[str, int, int]] = set()
    cur_type: str | None = None
    start = -1

    for i, tag in enumerate(tags):
        if tag.startswith("B-"):
            # 上一个实体收尾
            if cur_type is not None:
                entities.add((cur_type, start, i))
            cur_type = tag[2:]
            start = i
        elif tag.startswith("I-"):
            if cur_type == tag[2:]:
                continue  # 正常延续
            # 裸 I 或类型跳变:忽略该 token(不开启新实体)
            if cur_type is not None:
                entities.add((cur_type, start, i))
                cur_type = None
        else:  # O 或未知
            if cur_type is not None:
                entities.add((cur_type, start, i))
                cur_type = None

    if cur_type is not None:
        entities.add((cur_type, start, len(tags)))

    return entities


def _f1(precision: float, recall: float) -> float:
    if precision + recall <= 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _aggregate(
    preds: Sequence[Set[Tuple[str, int, int]]],
    trues: Sequence[Set[Tuple[str, int, int]]],
) -> Tuple[float, float, float]:
    """集合级 P/R/F1(跨所有样本聚合)。"""
    tp = 0
    pred_count = 0
    true_count = 0
    for p, t in zip(preds, trues):
        tp += len(p & t)
        pred_count += len(p)
        true_count += len(t)
    precision = tp / pred_count if pred_count > 0 else 0.0
    recall = tp / true_count if true_count > 0 else 0.0
    return precision, recall, _f1(precision, recall)


def entity_scores(
    pred_tags_list: Sequence[Sequence[str]],
    true_tags_list: Sequence[Sequence[str]],
) -> Dict[str, float]:
    """实体级 P/R/F1(主指标)。"""
    pred_entities = [extract_entities(tags) for tags in pred_tags_list]
    true_entities = [extract_entities(tags) for tags in true_tags_list]
    p, r, f1 = _aggregate(pred_entities, true_entities)
    return {"precision": p, "recall": r, "f1": f1}


def char_scores(
    pred_tags_list: Sequence[Sequence[str]],
    true_tags_list: Sequence[Sequence[str]],
) -> Dict[str, float]:
    """token 级 P/R/F1(逐位置展平,非 O 命中;与原实现语义一致)。"""
    all_preds: List[str] = []
    all_labels: List[str] = []
    for p, t in zip(pred_tags_list, true_tags_list):
        all_preds.extend(p)
        all_labels.extend(t)

    correct = sum(1 for p, t in zip(all_preds, all_labels) if p != "O" and p == t)
    pred_entity_count = sum(1 for p in all_preds if p != "O")
    true_entity_count = sum(1 for t in all_labels if t != "O")

    precision = correct / pred_entity_count if pred_entity_count > 0 else 0.0
    recall = correct / true_entity_count if true_entity_count > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": _f1(precision, recall)}
