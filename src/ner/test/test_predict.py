"""
service/predict.py 推理链路单测。

用随机权重的小模型(不经训练)造 checkpoint → AddressParser 加载 → 解析地址:
  - checkpoint 携带超参时按超参重建(不崩溃、返回 dict);
  - 兼容旧版无超参 checkpoint(用默认值)。
依赖 torch/transformers;环境缺失时自动跳过。
"""

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("transformers")

from service.predict import AddressParser
from train.bert_crf import BertCRF

TAG2ID = {"O": 0, "B-road": 1, "I-road": 2, "B-district": 3, "I-district": 4}


def _save_checkpoint(path, hyper: dict):
    """随机权重小模型 + 指定超参,存成 checkpoint 文件。"""
    model = BertCRF(
        num_tags=len(TAG2ID),
        dropout=0.0,
        lstm_hidden=16,
        lstm_layers=1,
    )
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "tag2id": TAG2ID,
        **hyper,  # num_tags / lstm_hidden / lstm_layers / dropout / max_length
    }
    torch.save(checkpoint, path)


def test_address_parser_加载新checkpoint并解析(tmp_path):
    path = tmp_path / "best_model.pt"
    _save_checkpoint(
        path,
        {
            "num_tags": len(TAG2ID),
            "lstm_hidden": 16,
            "lstm_layers": 1,
            "dropout": 0.0,
            "max_length": 64,
        },
    )

    parser = AddressParser(str(path), device="cpu")
    result = parser.parse("闵行区华茂路32弄17号")
    assert isinstance(result, dict)
    # 随机权重模型可能预测为空,但必须合法返回 dict
    assert all(isinstance(v, str) for v in result.values())

    # 批量解析:空串跳过,合法地址返回
    results = parser.parse_batch(["闵行区华茂路32弄17号", "", "古美小区34号"])
    assert len(results) == 3
    assert results[1] == {}  # 空地址 → 空结果


def test_address_parser_兼容旧checkpoint(tmp_path):
    """旧版 checkpoint 无超参 → 用默认值重建(旧模型以默认超参训练,形状匹配)。"""
    path = tmp_path / "legacy.pt"
    # 旧版按默认超参训练(lstm_hidden=256, lstm_layers=1),checkpoint 不含超参
    model = BertCRF(num_tags=len(TAG2ID), dropout=0.0)
    torch.save({"model_state_dict": model.state_dict(), "tag2id": TAG2ID}, path)

    parser = AddressParser(str(path), device="cpu")
    assert parser.max_length == 128  # 默认值
    result = parser.parse("闵行区华茂路32弄17号")
    assert isinstance(result, dict)


def test_address_parser_空地址返回空dict(tmp_path):
    """空字符串/空白输入直接短路返回 {},不触发模型推理。"""
    path = tmp_path / "m.pt"
    model = BertCRF(num_tags=len(TAG2ID), dropout=0.0, lstm_hidden=16)
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "tag2id": TAG2ID,
            "num_tags": len(TAG2ID),
            "lstm_hidden": 16,
            "lstm_layers": 1,
            "dropout": 0.0,
            "max_length": 64,
        },
        path,
    )
    parser = AddressParser(str(path), device="cpu")
    assert parser.parse("") == {}
    assert parser.parse("   ") == {}
