"""
数据切分模块 - 读取 label/exported 下全部 Label Studio 导出文件,
去重后按比例切分为训练集 / 验证集,写入 data/ 目录。

数据流:label/exported/*.json + DB label 表(标签映射)→ data/{train,val,tag2id,labels}.json

用法:
    cd src/ner
    uv run python -m train.data                       # 默认读 label/exported,写 data/
    uv run python -m train.data --ratio 0.9 --seed 7  # 调整切分比例 / 随机种子
    uv run python -m train.data --exported 其他目录 --out 其他输出

说明:
    - 标签映射来自 core.db(MySQL label 表,替代已废弃的 field_definitions.json);
    - 本模块不写数据库,只做"标注数据 → 训练/验证集"的切分;
    - 单测可显式传入 label_map / tag2id,避免依赖数据库。
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import torch
from core.db import load_label_map
from core.paths import DATA_DIR, EXPORTED_DIR


@dataclass
class AddressEntity:
    """地址实体(字符区间 + 标签)"""

    text: str
    label: str
    start: int
    end: int


def get_bio_tags(label_map: Dict[str, str]) -> List[str]:
    """由标签映射生成完整 BIO 标签列表:["O", "B-key1", "I-key1", ...](按 key 排序,结果稳定)。

    Args:
        label_map: {中文label: 英文key}(来自 DB label 表)
    """
    keys = sorted(set(label_map.values()))
    tags = ["O"]
    for key in keys:
        tags.append(f"B-{key}")
        tags.append(f"I-{key}")
    return tags


def load_label_studio_data(json_path: str) -> List[Dict]:
    """加载 Label Studio 导出的 JSON 文件(顶层为数组)。"""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{json_path} 顶层应为数组(Label Studio 导出格式)")
    return data


def parse_annotation(
    address: str,
    annotations: List[Dict],
    label_map: Dict[str, str],
) -> List[AddressEntity]:
    """解析标注结果,提取地址实体。

    Args:
        label_map: {中文label: 英文key};标注里的中文 label 查不到时原样保留(防御)。
    """
    entities: List[AddressEntity] = []
    for annotation in annotations:
        for result in annotation.get("result", []):
            value = result.get("value", {})
            text = value.get("text", "")
            labels = value.get("labels", [])
            start = value.get("start", 0)
            end = value.get("end", 0)
            for label in labels:
                ner_label = label_map.get(label, label)
                entities.append(
                    AddressEntity(text=text, label=ner_label, start=start, end=end)
                )
    return entities


def address_to_bio(address: str, entities: List[AddressEntity]) -> Tuple[List[str], List[str]]:
    """将地址字符串转换为字符级 BIO 序列。"""
    chars = list(address)
    tags = ["O"] * len(address)

    for entity in sorted(entities, key=lambda e: e.start):
        start = entity.start
        end = entity.end
        label = entity.label
        if start < len(tags):
            tags[start] = f"B-{label}"
        for i in range(start + 1, min(end, len(tags))):
            tags[i] = f"I-{label}"

    return chars, tags


def split_data(
    data: List[Dict], train_ratio: float = 0.8, seed: int = 42
) -> Tuple[List[Dict], List[Dict]]:
    """按比例随机切分训练集 / 验证集(固定种子,结果可复现)。"""
    rng = random.Random(seed)
    shuffled = data.copy()
    rng.shuffle(shuffled)
    split_idx = int(len(shuffled) * train_ratio)
    return shuffled[:split_idx], shuffled[split_idx:]


def align_char_tags_to_tokens(
    chars: list, tags: list, encoding: dict, seq_len: int
) -> list:
    """将字符级 BIO 标签对齐到 BERT token 位置。

    Args:
        chars: 字符列表
        tags: 字符级 BIO 标签列表
        encoding: tokenizer 输出,包含 offset_mapping
        seq_len: 有效序列长度

    Returns:
        token_tags: token 级标签列表
    """
    offset_mapping = encoding["offset_mapping"][0]
    # 训练时 offset_mapping 为 tensor;兼容 list 输入(单测/纯数据场景)
    if hasattr(offset_mapping, "tolist"):
        offset_mapping = offset_mapping.tolist()
    token_tags = ["O"] * seq_len

    # 字符索引 → token 索引列表
    char_to_tokens: Dict[int, List[int]] = {}
    for token_idx, (start, end) in enumerate(offset_mapping[:seq_len]):
        if start == end:
            continue
        for char_idx in range(start, end):
            char_to_tokens.setdefault(char_idx, []).append(token_idx)

    # 字符级标签赋给所有对应 token(B 标签多字 token 时首 token 为 B,其余为 I)
    for char_idx, tag in enumerate(tags):
        if char_idx >= len(chars) or char_idx not in char_to_tokens:
            continue
        is_b_tag = tag.startswith("B-")
        for i, token_idx in enumerate(char_to_tokens[char_idx]):
            if token_tags[token_idx] != "O":
                continue
            if is_b_tag and i == 0:
                token_tags[token_idx] = tag
            elif is_b_tag:
                token_tags[token_idx] = "I-" + tag[2:]
            else:
                token_tags[token_idx] = tag

    return token_tags


class NERDataset:
    """NER 数据集:预解析字符级 BIO,批量 tokenize + 对齐到 token 级标签。

    tag2id / label_map 均可注入:训练脚本与单测不依赖 DB。
    """

    def __init__(
        self,
        data: List[Dict],
        max_length: int = 128,
        tag2id: Optional[Dict[str, int]] = None,
        label_map: Optional[Dict[str, str]] = None,
    ):
        self.data = data
        self.max_length = max_length
        self.label_map = label_map or load_label_map()

        if tag2id is None:
            self.tag2id = {
                tag: i for i, tag in enumerate(get_bio_tags(self.label_map))
            }
        else:
            self.tag2id = tag2id
        self.id2tag = {i: tag for tag, i in self.tag2id.items()}

        # 预解析所有样本
        self._samples: List[Tuple[str, List[str], List[int]]] = []
        skipped_empty = 0
        for item in data:
            address = item["data"]["address"]
            if not address or not address.strip():
                skipped_empty += 1
                continue  # 过滤空地址(避免空序列样本干扰训练)
            annotations = item["annotations"]
            entities = parse_annotation(address, annotations, self.label_map)
            chars, tags = address_to_bio(address, entities)
            # 字符上界只是防御:真正的截断点在 tokenizer(truncation=True,按 max_length tokens)。
            # 中文 1 字≈1 token,但数字/英文可能拆分,字符上界放宽到 2 倍避免"字符先于 token 截断"
            # 导致尾部实体标签丢失(对齐逻辑对缺失字符安全跳过,不会错位)。
            cut = min(len(chars), self.max_length * 2)
            chars = chars[:cut]
            tags = tags[:cut]
            char_ids = [self.tag2id.get(t, 0) for t in tags]
            self._samples.append((address, chars, char_ids))
        if skipped_empty:
            print(f"  [data] 跳过 {skipped_empty} 条空地址样本")

    def __len__(self) -> int:
        return len(self._samples)

    def __getitem__(self, idx: int) -> Tuple[str, List[str], List[int]]:
        """返回 (地址字符串, 字符列表, 字符级标签ID列表)"""
        return self._samples[idx]

    def set_tokenizer(self, tokenizer) -> None:
        """设置 tokenizer(训练脚本在创建 DataLoader 前调用)"""
        self._tokenizer = tokenizer

    def collate_fn(self, batch: List[Tuple]) -> Dict:
        """批量处理:一次 tokenize + 标签对齐。"""
        addresses, chars_list, char_ids_list = zip(*batch)

        encoding = self._tokenizer(
            list(addresses),
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
            return_offsets_mapping=True,
        )

        input_ids = encoding["input_ids"]
        attention_mask = encoding["attention_mask"]
        offset_mapping = encoding["offset_mapping"]
        max_seq_len = input_ids.size(1)

        batch_tag_ids = []
        for i in range(len(batch)):
            seq_len = int(attention_mask[i].sum())
            chars = chars_list[i]
            char_ids = char_ids_list[i]
            char_tags = [self.id2tag.get(cid, "O") for cid in char_ids]

            token_tags = align_char_tags_to_tokens(
                chars,
                char_tags,
                {"offset_mapping": offset_mapping[i].unsqueeze(0)},
                seq_len,
            )
            tag_ids = [self.tag2id.get(t, 0) for t in token_tags]
            tag_ids = tag_ids[:max_seq_len] + [0] * (max_seq_len - len(tag_ids))
            batch_tag_ids.append(tag_ids)

        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "tag_ids": torch.tensor(batch_tag_ids, dtype=torch.long),
        }


def convert_to_train_format(
    json_paths: List[str],
    output_dir: str,
    train_ratio: float = 0.8,
    seed: int = 42,
    label_map: Optional[Dict[str, str]] = None,
) -> Dict:
    """读取 exported JSON 文件,去重 + 切分,写出 train/val/tag2id/labels 四件套。

    Returns:
        统计信息 {total, deduped, train, val, tags}
    """
    label_map = label_map or load_label_map()

    if not (0 < train_ratio < 1):
        raise ValueError(f"--ratio 必须在 (0, 1) 之间,当前 {train_ratio}")

    all_data: List[Dict] = []
    for p in json_paths:
        data = load_label_studio_data(p)
        all_data.extend(data)
        print(f"  {p}: {len(data)} samples")

    # 去重(按地址文本)
    seen = set()
    deduped = []
    for item in all_data:
        addr = item["data"]["address"]
        if addr not in seen:
            seen.add(addr)
            deduped.append(item)
    if len(deduped) < len(all_data):
        print(f"Dedup: {len(all_data)} → {len(deduped)} ({len(all_data) - len(deduped)} removed)")

    # 标签分布统计(帮助发现标注不平衡)
    from collections import Counter

    label_counter: Counter = Counter()
    for item in deduped:
        entities = parse_annotation(
            item["data"]["address"], item["annotations"], label_map
        )
        for e in entities:
            label_counter[e.label] += 1
    if label_counter:
        top = ", ".join(f"{k}={v}" for k, v in label_counter.most_common())
        print(f"标签分布: {top}")

    train_part, val_part = split_data(deduped, train_ratio, seed)
    print(f"Train: {len(train_part)}, Val: {len(val_part)}")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for split_name, subset in [("train", train_part), ("val", val_part)]:
        output_file = output_path / f"{split_name}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(subset, f, ensure_ascii=False, indent=2)
        print(f"Saved {split_name} data to {output_file}")

    tag2id = {tag: i for i, tag in enumerate(get_bio_tags(label_map))}
    tag_file = output_path / "tag2id.json"
    with open(tag_file, "w", encoding="utf-8") as f:
        json.dump(tag2id, f, ensure_ascii=False, indent=2)
    print(f"Saved tag mapping to {tag_file} ({len(tag2id)} tags)")

    # 标签映射缓存(供离线训练/预标注降级使用)
    labels_file = output_path / "labels.json"
    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump(label_map, f, ensure_ascii=False, indent=2)
    print(f"Saved label map cache to {labels_file} ({len(label_map)} labels)")

    return {
        "total": len(all_data),
        "deduped": len(deduped),
        "train": len(train_part),
        "val": len(val_part),
        "tags": len(tag2id),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="标注数据 → 训练/验证集切分")
    parser.add_argument(
        "--exported", type=str, default=str(EXPORTED_DIR), help="Label Studio 导出目录(读取全部 *.json)"
    )
    parser.add_argument("--out", type=str, default=str(DATA_DIR), help="输出目录(默认 data/)")
    parser.add_argument("--ratio", type=float, default=0.8, help="训练集比例(默认 0.8)")
    parser.add_argument("--seed", type=int, default=42, help="随机种子(默认 42)")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    exported_path = Path(args.exported)
    json_files = sorted(exported_path.glob("*.json"))
    if not json_files:
        raise SystemExit(f"目录 {exported_path} 下没有 .json 标注文件")

    print(f"读取标注文件({len(json_files)} 个):")
    stats = convert_to_train_format(
        [str(p) for p in json_files],
        args.out,
        train_ratio=args.ratio,
        seed=args.seed,
    )
    print(f"\n切分完成: total={stats['total']}, deduped={stats['deduped']}, "
          f"train={stats['train']}, val={stats['val']}, tags={stats['tags']}")
