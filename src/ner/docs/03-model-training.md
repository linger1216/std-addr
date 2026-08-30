> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# NER 模型训练

## 技术方案

| 组件 | 技术 | 说明 |
|------|------|------|
| 主干网络 | chinese-roberta-wwm-ext | 哈工大讯飞联合发布，中文全词掩码，效果优于 bert-base-chinese |
| 序列标注层 | CRF | 条件随机场，转移矩阵约束 + Viterbi 解码 |
| 框架 | PyTorch + Transformers | 主流深度学习框架 |

## 模型架构

```
Input: "北京市朝阳区建国路88号"
       ↓
chinese-roberta-wwm-ext (12层 Transformer)
       ↓
BiLSTM: 双向 LSTM (hidden=256, layers=1)
       ↓
CRF: 条件随机场（转移矩阵约束 + Viterbi 解码）
       ↓
Output: B-province I-province I-district ...
```

## 训练参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| bert_model | base/chinese-roberta-wwm-ext | 中文预训练模型（本地加载） |
| lstm_hidden | 256 | LSTM 隐藏层大小 |
| lstm_layers | 1 | LSTM 层数 |
| dropout | 0.1 | Dropout 比例 |
| learning_rate | 2e-5 | BERT 微调学习率 |
| crf_lr | 1e-4 | CRF 层学习率 |
| batch_size | 8 | 批处理大小 |
| epochs | 20 | 训练轮数 |
| max_length | 128 | 最大序列长度 |
| warmup_ratio | 0.1 | 学习率预热比例 |

## 评估指标

| 指标 | 含义 | 目标 |
|------|------|------|
| Precision | 精确率 | > 0.85 |
| Recall | 召回率 | > 0.85 |
| F1 Score | 综合指标 | > 0.85 |

## 训练流程

```python
for epoch in range(epochs):
    model.train()
    for batch in train_loader:
        # 整个 batch 一次前向（CRF loss）
        loss, _ = model(input_ids, attention_mask, tag_ids)
        loss.backward()
        optimizer.step()

    # 验证（Viterbi 解码）
    f1 = evaluate(model, val_loader)
    if f1 > best_f1:
        save_checkpoint(model, f1)
```

## 执行命令

```bash
cd src/ner

# 训练(默认参数:读 data/,输出 model/)
uv run python -m train.train

# 自定义参数
uv run python -m train.train \
    --batch_size 16 \
    --epochs 30 \
    --lr 2e-5

# 早停:实体 F1 连续 5 轮不提升则停止
uv run python -m train.train --patience 5

# 从检查点续训(恢复优化器/调度器状态,学习率曲线与早停计数连续)
uv run python -m train.train --resume model/epochs/epoch_08.pt

# 只存 best,不存每轮检查点(省磁盘,每份约 400MB)
uv run python -m train.train --save_epochs 0
```

- 设备自动选择:`cuda` → `mps`(mac)→ `cpu`(可 `--device` 显式指定);
- 评估以**实体级 F1** 为准(BIO 切分为实体集合),字符级 F1 作参考;
- 产物:`model/best_model.pt`(实体 F1 最优)+ `model/epochs/epoch_NN.pt`(每轮检查点,可 `--resume` 续训)+ `model/training_log.jsonl`(每轮日志);
- checkpoint 内含全部超参(tag2id / num_tags / lstm_hidden / lstm_layers / dropout / max_length / bert_model_name),推理端据此重建。

## 可选参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--epochs` | 20 | 训练轮数 |
| `--batch_size` | 8 | 批大小 |
| `--lr` | 2e-5 | BERT 学习率 |
| `--crf_lr` | 1e-4 | CRF 层学习率 |
| `--max_length` | 128 | 最大序列长度 |
| `--bert_model` | base/chinese-roberta-wwm-ext | 预训练模型路径 |
| `--save_epochs` | 1 | 0=只存 best,不存每轮检查点 |
| `--patience` | 0 | 早停:实体 F1 连续 N 轮不提升则停止(0=关闭) |
| `--resume` | — | 从检查点续训 |
| `--device` | 自动 | 显式指定 cuda / mps / cpu |

## 模型导出

训练完成后,产物位于 `model/`:

```
model/
├── best_model.pt              # 验证集 F1 最优检查点
└── epochs/
    └── epoch_01.pt …          # 每轮检查点(--save_epochs 0 关闭)
```

检查点内容:
- BERT + BiLSTM + CRF 模型权重
- 标签映射表(tag2id)
- 全部超参(num_tags / lstm_hidden / lstm_layers / dropout / max_length),推理端据此重建模型