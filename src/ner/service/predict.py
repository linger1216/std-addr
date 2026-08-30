"""
推理脚本 - 使用训练好的 BERT-CRF 模型进行地址解析

用法:
    cd src/ner
    uv run python -m service.predict --address "闵行区华茂路32弄17号"
    uv run python -m service.predict                # 跑内置测试地址
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Optional

import torch
from transformers import BertTokenizerFast

from core.paths import BASE_MODEL_DIR, BEST_MODEL_PATH
from train.bert_crf import BertCRF


class AddressParser:
    """地址解析器:加载 checkpoint(含全部超参)重建 BERT-CRF 模型。"""

    def __init__(
        self,
        model_path: str,
        bert_model_name: Optional[str] = None,
        device: Optional[str] = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.bert_model_name = bert_model_name or str(BASE_MODEL_DIR)

        checkpoint = torch.load(model_path, map_location=self.device)
        self.tag2id = checkpoint["tag2id"]
        self.id2tag = {i: tag for tag, i in self.tag2id.items()}

        # 从 checkpoint 读取超参(兼容旧版不含超参的检查点 → 用默认值)
        self.num_tags = checkpoint.get("num_tags", len(self.tag2id))
        self.lstm_hidden = checkpoint.get("lstm_hidden", 256)
        self.lstm_layers = checkpoint.get("lstm_layers", 1)
        self.dropout = checkpoint.get("dropout", 0.1)
        self.max_length = checkpoint.get("max_length", 128)

        self.model = BertCRF(
            bert_model_name=self.bert_model_name,
            num_tags=self.num_tags,
            dropout=self.dropout,
            lstm_hidden=self.lstm_hidden,
            lstm_layers=self.lstm_layers,
        )
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.model = self.model.to(self.device)
        self.model.eval()

        self.tokenizer = BertTokenizerFast.from_pretrained(
            self.bert_model_name, local_files_only=True
        )

    def parse(self, address: str) -> Dict[str, str]:
        """解析单个地址字符串。"""
        if not address or not address.strip():
            return {}

        encoding = self.tokenizer(
            address,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
            return_offsets_mapping=True,
        )

        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)

        with torch.no_grad():
            predictions = self.model.decode(input_ids, attention_mask)

        pred_tags = [self.id2tag.get(p, "O") for p in predictions[0]]
        offset_mapping = encoding["offset_mapping"][0].tolist()
        seq_len = int(attention_mask[0].sum())

        entities = self._extract_entities(address, pred_tags, offset_mapping, seq_len)
        return self._to_structured_result(entities)

    def parse_batch(self, addresses: List[str]) -> List[Dict[str, str]]:
        """批量解析地址字符串(一次模型前向推理)。"""
        results: List[Dict[str, str]] = [{} for _ in addresses]

        valid_idx = [i for i, a in enumerate(addresses) if a and a.strip()]
        if not valid_idx:
            return results
        valid_texts = [addresses[i].strip() for i in valid_idx]

        encoding = self.tokenizer(
            valid_texts,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
            return_offsets_mapping=True,
        )
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)

        with torch.no_grad():
            predictions = self.model.decode(input_ids, attention_mask)

        for k, i in enumerate(valid_idx):
            try:
                address = valid_texts[k]
                pred_tags = [self.id2tag.get(p, "O") for p in predictions[k]]
                offset_mapping = encoding["offset_mapping"][k].tolist()
                seq_len = int(attention_mask[k].sum())
                entities = self._extract_entities(address, pred_tags, offset_mapping, seq_len)
                results[i] = self._to_structured_result(entities)
            except Exception:
                results[i] = {}

        return results

    def _extract_entities(self, address: str, tags: list, offset_mapping: list, seq_len: int) -> Dict[str, list]:
        """从 BIO 标签序列中提取实体(token 级标签 → 合并字符)。"""
        chars = list(address)

        token_to_chars = {}
        for token_idx in range(seq_len):
            start, end = offset_mapping[token_idx]
            if start == end:
                continue
            token_to_chars[token_idx] = [i for i in range(start, end) if i < len(chars)]

        entities: Dict[str, list] = {}
        cur_type = None
        cur_text: List[str] = []

        for token_idx in range(seq_len):
            if token_idx not in token_to_chars:
                continue

            char_indices = token_to_chars[token_idx]
            tag = tags[token_idx]

            if tag == "O":
                if cur_type:
                    entities.setdefault(cur_type, []).append("".join(cur_text))
                    cur_type = None
                    cur_text = []

            elif tag.startswith("B-"):
                if cur_type:
                    entities.setdefault(cur_type, []).append("".join(cur_text))
                cur_type = tag[2:]
                cur_text = [chars[i] for i in char_indices]

            elif tag.startswith("I-"):
                entity_type = tag[2:]
                if cur_type == entity_type:
                    cur_text.extend(chars[i] for i in char_indices)
                else:
                    cur_type = None
                    cur_text = []

        if cur_type:
            entities.setdefault(cur_type, []).append("".join(cur_text))

        return entities

    def _to_structured_result(self, entities: Dict[str, list]) -> Dict[str, str]:
        """将实体字典转换为结构化结果(同类型多值用逗号连接)。"""
        result: Dict[str, str] = {}
        for tag, texts in entities.items():
            if not texts:
                continue
            unique_texts = list(dict.fromkeys(texts))
            result[tag] = unique_texts[0] if len(unique_texts) == 1 else ",".join(unique_texts)
        return result


def format_address(address: str, parser: Optional[AddressParser] = None) -> Dict[str, str]:
    """格式化地址的便捷函数(默认加载 model/best_model.pt)。"""
    if parser is None:
        if not BEST_MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {BEST_MODEL_PATH}(请先训练:uv run python -m train.train)"
            )
        parser = AddressParser(str(BEST_MODEL_PATH))
    return parser.parse(address)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default=str(BEST_MODEL_PATH), help="模型路径")
    parser.add_argument("--address", type=str, default=None, help="要解析的地址")
    args = parser.parse_args()

    addr_parser = AddressParser(args.model)

    if args.address:
        result = addr_parser.parse(args.address)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        test_addresses = [
            "闵行区华茂路32弄17号",
            "闵行区科苑路150弄3支弄6号楼3层302室",
            "闵行区闵北路675号虹桥国际医学中心",
            "闵行区古美小区34号103",
        ]
        for addr in test_addresses:
            print(f"\n地址: {addr}")
            result = addr_parser.parse(addr)
            print(f"结果: {result}")
