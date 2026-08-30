"""
train/data.py 数据切分与 BIO 转换单测。

不依赖数据库/模型:显式注入 fake label_map,验证:
  - BIO 标签体系生成
  - 标注解析 + 字符级 BIO 转换
  - 训练/验证切分(固定种子可复现)
  - NERDataset 预解析与字符↔token 标签对齐
"""

import pytest

from train.data import (
    NERDataset,
    address_to_bio,
    align_char_tags_to_tokens,
    get_bio_tags,
    parse_annotation,
    split_data,
)

FAKE_LABEL_MAP = {
    "区县": "district",
    "路": "road",
    "路号": "road_number",
    "小区": "community",
    "弄": "lane",
    "楼栋": "building",
}


def test_get_bio_tags_稳定顺序():
    tags = get_bio_tags(FAKE_LABEL_MAP)
    # O + 每标签 B-/I-
    assert tags == [
        "O",
        "B-building", "I-building",
        "B-community", "I-community",
        "B-district", "I-district",
        "B-lane", "I-lane",
        "B-road", "I-road",
        "B-road_number", "I-road_number",
    ]


def test_parse_annotation_中文标签映射为英文key():
    entities = parse_annotation(
        "闵行区华茂路32弄17号",
        [
            {
                "result": [
                    {
                        "value": {"start": 0, "end": 3, "text": "闵行区", "labels": ["区县"]},
                    },
                    {
                        "value": {"start": 3, "end": 6, "text": "华茂路", "labels": ["路"]},
                    },
                ]
            }
        ],
        FAKE_LABEL_MAP,
    )
    assert [(e.label, e.start, e.end) for e in entities] == [
        ("district", 0, 3),
        ("road", 3, 6),
    ]


def test_address_to_bio():
    chars, tags = address_to_bio(
        "闵行区华茂路",
        [
            parse_annotation(
                "闵行区华茂路",
                [{"result": [{"value": {"start": 0, "end": 3, "text": "闵行区", "labels": ["区县"]}}]}],
                FAKE_LABEL_MAP,
            )[0],
        ],
    )
    assert "".join(chars) == "闵行区华茂路"
    assert tags == ["B-district", "I-district", "I-district", "O", "O", "O"]


def test_split_data_固定种子可复现():
    data = [{"data": {"address": f"地址{i}"}, "annotations": []} for i in range(100)]
    t1, v1 = split_data(data, 0.8, seed=42)
    t2, v2 = split_data(data, 0.8, seed=42)
    assert len(t1) == 80 and len(v1) == 20
    assert t1 == t2 and v1 == v2  # 同种子结果一致


def test_split_data_不同种子结果不同():
    data = [{"data": {"address": f"地址{i}"}, "annotations": []} for i in range(100)]
    t1, _ = split_data(data, 0.8, seed=1)
    t2, _ = split_data(data, 0.8, seed=2)
    assert t1 != t2


def _ls_item(address: str, spans: list):
    """构造 LS 导出单条记录:spans = [(start, end, 中文label), ...]"""
    return {
        "data": {"address": address},
        "annotations": [
            {
                "result": [
                    {
                        "value": {
                            "start": s,
                            "end": e,
                            "text": address[s:e],
                            "labels": [label],
                        }
                    }
                    for s, e, label in spans
                ]
            }
        ],
    }


def test_nerdataset_预解析():
    items = [
        _ls_item("闵行区华茂路32弄17号", [(0, 3, "区县"), (3, 6, "路")]),
        _ls_item("古美小区34号103", [(0, 4, "小区")]),
    ]
    ds = NERDataset(items, max_length=64, label_map=FAKE_LABEL_MAP)
    assert len(ds) == 2
    # 第一条:前 3 字符应为 B-district/I-district/I-district
    addr, chars, ids = ds[0]
    assert addr == "闵行区华茂路32弄17号"
    id2tag = {i: t for t, i in ds.tag2id.items()}
    assert [id2tag[cid] for cid in ids[:3]] == ["B-district", "I-district", "I-district"]
    # tag2id 来自全部标签(注入的 label_map)
    assert "B-road_number" in ds.tag2id


def test_align_char_tags_to_tokens():
    """单字符中文 → 单 token,字符级标签原样映射到 token 级。"""
    encoding = {
        "offset_mapping": [
            [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 5]]  # 6 个 token(尾 padding)
        ]
    }
    token_tags = align_char_tags_to_tokens(
        ["闵", "行", "区"],
        ["B-district", "I-district", "I-district"],
        encoding,
        seq_len=6,
    )
    assert token_tags == ["B-district", "I-district", "I-district", "O", "O", "O"]


def test_align_char_tags_to_tokens_多字token():
    """一个 token 覆盖多个字符:token 取首字符标签(B),后续字符标签被跳过(防重复赋值)。"""
    encoding = {"offset_mapping": [[[0, 3], [3, 5], [5, 5]]]}  # token0 覆盖字符 0-2
    token_tags = align_char_tags_to_tokens(
        ["华", "茂", "路"],
        ["B-road", "I-road", "I-road"],
        encoding,
        seq_len=3,
    )
    # token0 = B-road(取首字符 B);token1/token2 未覆盖有效字符 → O
    assert token_tags == ["B-road", "O", "O"]


def test_nerdataset_需tokenizer才能collate():
    """未设置 tokenizer 时 collate_fn 应报错(防误用)。"""
    items = [_ls_item("闵行区华茂路", [(0, 3, "区县")])]
    ds = NERDataset(items, max_length=64, label_map=FAKE_LABEL_MAP)
    with pytest.raises(AttributeError):
        ds.collate_fn([ds[0]])
