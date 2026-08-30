"""
训练脚本 - BERT-CRF 地址 NER 模型

架构: BERT → BiLSTM → CRF
- BERT: 预训练中文语言模型 (chinese-roberta-wwm-ext,已下载于 base/)
- BiLSTM: 双向序列特征提取
- CRF: 条件随机场(转移矩阵约束 + Viterbi 解码)

用法:
    cd src/ner
    uv run python -m train.train                                # 读 data/,输出 model/
    uv run python -m train.train --epochs 10 --batch_size 16    # 调参
    uv run python -m train.train --patience 5                   # 早停:F1 连续 5 轮不升则停
    uv run python -m train.train --resume model/epochs/epoch_08.pt  # 从检查点续训
    uv run python -m train.train --save_epochs 0                # 只存 best,不存每轮检查点

产物:
    model/best_model.pt            验证集实体级 F1 最优检查点
    model/epochs/epoch_NN.pt       每轮检查点(含全部超参,可 --resume 续训)
    model/training_log.jsonl       每轮训练日志(loss / P / R / F1 / 实体 F1 / lr)
"""

import argparse
import json
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.optim as optim
from torch.utils.data import DataLoader
from transformers import BertTokenizerFast, get_linear_schedule_with_warmup
from tqdm import tqdm

from core.db import load_label_map
from core.paths import BASE_MODEL_DIR, DATA_DIR, MODEL_DIR
from train.bert_crf import BertCRF
from train.data import NERDataset, load_label_studio_data
from train.metrics import char_scores, entity_scores


def parse_args():
    parser = argparse.ArgumentParser(description="训练 BERT-CRF 地址 NER 模型")

    # 数据参数
    parser.add_argument("--data", type=str, default=str(DATA_DIR), help="训练数据目录(含 train.json / val.json)")
    parser.add_argument("--output_dir", type=str, default=str(MODEL_DIR), help="模型输出目录")

    # 模型参数
    parser.add_argument("--bert_model", type=str, default=str(BASE_MODEL_DIR), help="BERT 模型")
    parser.add_argument("--lstm_hidden", type=int, default=256, help="LSTM 隐藏层大小")
    parser.add_argument("--lstm_layers", type=int, default=1, help="LSTM 层数")
    parser.add_argument("--dropout", type=float, default=0.1, help="Dropout 比例")

    # 训练参数
    parser.add_argument("--epochs", type=int, default=20, help="训练轮数")
    parser.add_argument("--batch_size", type=int, default=8, help="批处理大小")
    parser.add_argument("--lr", type=float, default=2e-5, help="BERT 学习率")
    parser.add_argument("--crf_lr", type=float, default=1e-4, help="CRF 层学习率")
    parser.add_argument("--warmup_ratio", type=float, default=0.1, help="学习率预热比例")
    parser.add_argument("--weight_decay", type=float, default=0.01, help="权重衰减")
    parser.add_argument("--max_length", type=int, default=128, help="最大序列长度")
    parser.add_argument("--num_workers", type=int, default=0, help="DataLoader 加载进程数")

    # 其他
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    parser.add_argument("--device", type=str, default=None, help="设备(cuda/mps/cpu),默认自动选择")
    parser.add_argument("--eval_interval", type=int, default=1, help="评估间隔")
    parser.add_argument(
        "--patience",
        type=int,
        default=0,
        help="早停:验证集实体 F1 连续 N 轮不提升则停止(0=关闭)",
    )
    parser.add_argument(
        "--save_epochs",
        type=int,
        default=1,
        help="是否保存每轮检查点(1=存到 model/epochs/,0=只存 best;每份约 400MB,注意磁盘)",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="从指定检查点续训(如 model/epochs/epoch_08.pt),超参与 tag2id 取自检查点",
    )

    return parser.parse_args()


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def pick_device(explicit: Optional[str]) -> str:
    """设备选择:显式指定优先,否则 cuda → mps(mac)→ cpu。"""
    if explicit:
        if explicit not in ("cuda", "mps", "cpu"):
            raise ValueError(f"未知设备: {explicit}(可选 cuda/mps/cpu)")
        return explicit
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_data(data_path: str, max_length: int, tokenizer, label_map: dict):
    """加载 train/val JSON,创建 NERDataset(train 决定 tag2id,val 复用)。"""
    data_path = Path(data_path)

    train_data = load_label_studio_data(str(data_path / "train.json"))
    val_data = load_label_studio_data(str(data_path / "val.json"))

    train_dataset = NERDataset(
        train_data, max_length=max_length, label_map=label_map
    )
    val_dataset = NERDataset(
        val_data, max_length=max_length, tag2id=train_dataset.tag2id, label_map=label_map
    )

    # 设置 tokenizer(collate_fn 需要)
    train_dataset.set_tokenizer(tokenizer)
    val_dataset.set_tokenizer(tokenizer)

    return train_dataset, val_dataset


def evaluate(
    model: BertCRF,
    dataloader: DataLoader,
    id2tag: dict,
    device: str,
) -> Dict[str, float]:
    """评估模型在验证集上的性能,返回实体级 + 字符级 P/R/F1。

    实体级(entity F1)为主指标:BIO 序列切分为实体集合后计算(见 train/metrics.py);
    字符级为逐 token 命中率,保留作参考。
    """
    model.eval()

    pred_tags_list: List[List[str]] = []
    true_tags_list: List[List[str]] = []

    with torch.no_grad():
        for batch in dataloader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            tag_ids = batch["tag_ids"].to(device)

            predictions = model.decode(input_ids, attention_mask)

            for b in range(input_ids.size(0)):
                seq_len = int(attention_mask[b].sum())
                # 去掉 [CLS](0) 和 [SEP](seq_len-1),只取有效 token 段
                pred_tags_list.append(
                    [id2tag.get(p, "O") for p in predictions[b][1 : seq_len - 1]]
                )
                true_tags_list.append(
                    [id2tag.get(t, "O") for t in tag_ids[b].tolist()[1 : seq_len - 1]]
                )

    entity = entity_scores(pred_tags_list, true_tags_list)
    char = char_scores(pred_tags_list, true_tags_list)
    return {
        "entity_p": entity["precision"],
        "entity_r": entity["recall"],
        "entity_f1": entity["f1"],
        "char_p": char["precision"],
        "char_r": char["recall"],
        "char_f1": char["f1"],
    }


def save_checkpoint(
    model: BertCRF,
    tag2id: dict,
    path: Path,
    hyper: dict,
    epoch: int = 0,
    optimizer: Optional[torch.optim.Optimizer] = None,
    scheduler: Optional[object] = None,
    best_f1: float = 0.0,
    no_improve: int = 0,
):
    """保存检查点:模型权重 + tag2id + 全部超参 + 优化器/调度器状态。

    推理端只读权重与超参;训练端 resume 恢复 optimizer/scheduler 状态,
    保证续训时学习率曲线与早停计数连续。
    """
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "tag2id": tag2id,
        "num_tags": len(tag2id),
        "bert_model_name": hyper["bert_model"],
        "lstm_hidden": hyper["lstm_hidden"],
        "lstm_layers": hyper["lstm_layers"],
        "dropout": hyper["dropout"],
        "max_length": hyper["max_length"],
        "epoch": epoch,
        "best_entity_f1": best_f1,
        "no_improve": no_improve,
        "datetime": datetime.now().isoformat(),
    }
    if optimizer is not None:
        checkpoint["optimizer_state_dict"] = optimizer.state_dict()
    if scheduler is not None:
        checkpoint["scheduler_state_dict"] = scheduler.state_dict()
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(checkpoint, path)


def append_training_log(log_path: Path, record: dict):
    """把一轮训练结果追加到 JSONL 日志(每行一条,立即 flush 防进程中断丢失)。"""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8", buffering=1) as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def make_worker_seed_fn(seed: int):
    """DataLoader worker 进程固定随机种子(多进程加载时可复现 shuffle)。"""

    def worker_init_fn(worker_id: int):
        random.seed(seed + worker_id)
        np.random.seed(seed + worker_id)
        torch.manual_seed(seed + worker_id)

    return worker_init_fn


def train():
    args = parse_args()

    set_seed(args.seed)
    device = pick_device(args.device)
    print(f"Using device: {device}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    epochs_dir = output_dir / "epochs"
    if args.save_epochs:
        epochs_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "training_log.jsonl"

    # 标签映射:来自 DB label 表(core.db,缓存 data/labels.json)
    label_map = load_label_map()
    print(f"标签映射({len(label_map)} 个):{sorted(label_map.values())}")

    # 初始化 tokenizer
    tokenizer = BertTokenizerFast.from_pretrained(args.bert_model, local_files_only=True)

    # 加载数据(collate_fn 需要 tokenizer)
    print(f"Loading data from {args.data}")
    train_dataset, val_dataset = load_data(args.data, args.max_length, tokenizer, label_map)

    print(f"Train size: {len(train_dataset)}, Val size: {len(val_dataset)}")
    print(f"Number of tags: {len(train_dataset.tag2id)}")
    if len(train_dataset) == 0 or len(val_dataset) == 0:
        raise ValueError(
            "训练集或验证集为空(请检查 data/ 目录与 data.py 切分产物)。"
        )

    worker_seed_fn = make_worker_seed_fn(args.seed)

    # DataLoader — 使用 Dataset.collate_fn 批量 tokenize + 标签对齐
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        collate_fn=train_dataset.collate_fn,
        worker_init_fn=worker_seed_fn,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        collate_fn=val_dataset.collate_fn,
        worker_init_fn=worker_seed_fn,
    )

    num_tags = len(train_dataset.tag2id)
    model = BertCRF(
        bert_model_name=args.bert_model,
        num_tags=num_tags,
        dropout=args.dropout,
        lstm_hidden=args.lstm_hidden,
        lstm_layers=args.lstm_layers,
    )
    model = model.to(device)

    # 分组学习率
    bert_params = []
    other_params = []
    for n, p in model.named_parameters():
        if "bert" in n:
            bert_params.append(p)
        else:
            other_params.append(p)

    optimizer = optim.AdamW(
        [{"params": bert_params, "lr": args.lr}, {"params": other_params, "lr": args.crf_lr}],
        weight_decay=args.weight_decay,
    )

    # 学习率调度
    total_steps = len(train_loader) * args.epochs
    warmup_steps = int(total_steps * args.warmup_ratio)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    # —— 续训:恢复权重 + 优化器/调度器状态,best/no_improve 连续 ——
    start_epoch = 0
    best_f1 = 0.0
    best_epoch = 0
    no_improve = 0
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        # 先校验模型结构参数与命令行一致(不一致直接报错,而非静默重建错形状)
        expect = {
            "num_tags": ckpt.get("num_tags"),
            "lstm_hidden": ckpt.get("lstm_hidden"),
            "lstm_layers": ckpt.get("lstm_layers"),
        }
        actual = {"num_tags": num_tags, "lstm_hidden": args.lstm_hidden, "lstm_layers": args.lstm_layers}
        mismatches = [k for k, v in expect.items() if v not in (None, actual[k])]
        if mismatches:
            raise ValueError(
                f"检查点结构参数不一致:{mismatches}(检查点 {expect},命令行 {actual}),"
                f"请确认 resume 的检查点与训练参数匹配"
            )
        model.load_state_dict(ckpt["model_state_dict"])
        if ckpt.get("optimizer_state_dict") and ckpt.get("scheduler_state_dict"):
            optimizer.load_state_dict(ckpt["optimizer_state_dict"])
            scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        start_epoch = int(ckpt.get("epoch", 0))
        best_f1 = float(ckpt.get("best_entity_f1", 0.0))
        best_epoch = int(start_epoch)
        no_improve = int(ckpt.get("no_improve", 0))
        print(f"Resumed from {args.resume}(epoch {start_epoch}), tags {ckpt.get('num_tags', '?')}, "
              f"best_f1={best_f1:.4f}, lr={scheduler.get_last_lr()[0]:.2e}")
        if set(ckpt.get("tag2id", {})) != set(train_dataset.tag2id):
            print("⚠️ 检查点 tag2id 与当前数据标签不一致,请确认数据未变更")

    # 训练循环
    hyper = {
        "bert_model": args.bert_model,
        "lstm_hidden": args.lstm_hidden,
        "lstm_layers": args.lstm_layers,
        "dropout": args.dropout,
        "max_length": args.max_length,
    }
    print(f"\nStart training for {args.epochs} epochs "
          f"(patience={args.patience or 'off'})...")
    print("-" * 50)

    for epoch in range(start_epoch, args.epochs):
        model.train()
        total_loss = 0.0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch + 1}/{args.epochs}")

        for batch in pbar:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            tag_ids = batch["tag_ids"].to(device)

            optimizer.zero_grad(set_to_none=True)

            loss, _ = model(input_ids, attention_mask, tag_ids)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()

            total_loss += loss.item()
            pbar.set_postfix({"loss": f"{loss.item():.4f}"})

        avg_loss = total_loss / len(train_loader)

        # 评估(每 eval_interval 轮):先评估更新 best/no_improve,再存检查点,
        # 保证 epoch 检查点里的 best_entity_f1 / no_improve 包含本轮结果(resume 可连续)
        if (epoch + 1) % args.eval_interval == 0:
            metrics = evaluate(model, val_loader, train_dataset.id2tag, device)
            print(
                f"\nEpoch {epoch + 1}: Loss={avg_loss:.4f}, "
                f"Char P={metrics['char_p']:.4f} R={metrics['char_r']:.4f} F1={metrics['char_f1']:.4f}, "
                f"Entity P={metrics['entity_p']:.4f} R={metrics['entity_r']:.4f} F1={metrics['entity_f1']:.4f}"
            )

            # 以实体级 F1 为准选择 best(业界惯例)
            if metrics["entity_f1"] > best_f1:
                best_f1 = metrics["entity_f1"]
                best_epoch = epoch + 1
                no_improve = 0
                best_path = output_dir / "best_model.pt"
                save_checkpoint(
                    model, train_dataset.tag2id, best_path, hyper,
                    epoch=epoch + 1, optimizer=optimizer, scheduler=scheduler,
                    best_f1=best_f1, no_improve=no_improve,
                )
                print(f"Saved best model with Entity F1={best_f1:.4f} → {best_path}")
            else:
                no_improve += 1

            # 训练日志(每轮一行 JSON)
            append_training_log(log_path, {
                "epoch": epoch + 1,
                "loss": round(avg_loss, 4),
                **{k: round(v, 4) for k, v in metrics.items()},
                "lr": scheduler.get_last_lr()[0],
                "best_entity_f1": round(best_f1, 4),
            })
        else:
            print(f"\nEpoch {epoch + 1}: Loss={avg_loss:.4f}")

        # 每轮检查点(需求:model/ 下保留每 epoch 模型;评估后保存,含本轮 best/no_improve)
        if args.save_epochs:
            epoch_path = epochs_dir / f"epoch_{epoch + 1:02d}.pt"
            save_checkpoint(
                model, train_dataset.tag2id, epoch_path, hyper,
                epoch=epoch + 1, optimizer=optimizer, scheduler=scheduler,
                best_f1=best_f1, no_improve=no_improve,
            )
            print(f"Saved checkpoint → {epoch_path}")

        # 早停
        if args.patience > 0 and no_improve >= args.patience:
            print(f"\nEarly stop:实体 F1 连续 {args.patience} 轮未提升,停止训练")
            break

    print("-" * 50)
    print(f"Training complete! Best Entity F1: {best_f1:.4f}(epoch {best_epoch})")
    print(f"训练日志:{log_path}")


if __name__ == "__main__":
    train()
