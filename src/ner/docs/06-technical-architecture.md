> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# 地址 NER 系统 - 技术架构文档

## 目录

1. [系统概述](#1-系统概述)
2. [项目目录结构](#2-项目目录结构)
3. [BERT Tokenization 机制](#3-bert-tokenization-机制)
4. [BIO 标注体系](#4-bio-标注体系)
5. [数据处理流程](#5-数据处理流程)
6. [模型训练](#6-模型训练)
7. [预测推理](#7-预测推理)
8. [API 服务](#8-api-服务)
9. [标签定义](#9-标签定义)

---

## 1. 系统概述

### 项目目标

将非结构化地址字符串解析为结构化字段：

```
输入: "闵行区华茂路32弄17号"
输出: {
  "district": "闵行区",
  "road": "华茂路",
  "lane": "32弄",
  "building": "17号"
}
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 标注工具 | Label Studio |
| 主干模型 | chinese-roberta-wwm-ext |
| 序列建模 | BiLSTM + CRF |
| 训练框架 | PyTorch + Transformers |
| API 服务 | FastAPI |

### 整体流程

```
Label Studio 标注
       ↓
  导出 JSON (包含 start/end 字符索引)
       ↓
  数据转换 (train/data.py)
       ↓
  BIO 格式 (字符级标签)
       ↓
  训练 (train/train.py)
       ↓
  模型推理 (service/predict.py)
       ↓
  结构化地址结果
```

---

## 2. 项目目录结构

```
├── model/                        # 模型相关
│   ├── base/                     # 预训练模型
│   │   └── chinese-roberta-wwm-ext/
│   ├── data/                     # 数据转换
│   │   ├── data.py               # Label Studio JSON → 训练数据
│   │   ├── train.json            # 训练集
│   │   ├── val.json              # 验证集
│   │   └── tag2id.json           # 标签映射
│   ├── train/                    # 模型定义与训练
│   │   ├── bert_crf.py           # BERT-CRF 架构
│   │   └── train.py              # 训练脚本
│   ├── predict/                  # 推理
│   │   └── predict.py            # 推理脚本
│   ├── dist/                     # 模型权重
│   │   └── best_model.pt
│   ├── label/                    # 标注相关
│   │   ├── DB label 表(core/db.py) # 共享字段定义
│   │   ├── exported/             # 导出标注数据 JSON
│   │   ├── raw/                  # 数据源（道路/小区/村/兴趣点/规则库）
│   │   ├── template/             # 标注模板 XML
│   │   ├── mock/                 # 模拟数据生成器
│   │   └── prediction/           # 预标注脚本
│   ├── service/                  # 服务
│   │   └── service.py            # FastAPI 服务
│   ├── test/                     # 测试
│   │   └── benchmark.py
│   ├── scripts/                  # 工具脚本
│   │   └── serve.py              # mock 静态服务
│   └── docs/                     # 文档
├── pyproject.toml                # 项目配置
└── README.md                     # 快速开始
```

---

## 3. BERT Tokenization 机制

### 3.1 WordPiece 分词器

BERT 使用 WordPiece 算法进行中文分词，可能将连续数字或某些字符合并成一个 token。

**示例**：
```
原始文本: "闵行区华茂路32弄17号"
字符分词: ["闵", "行", "区", "华", "茂", "路", "3", "2", "弄", "1", "7", "号"]
         12 个字符

BERT分词: ["闵", "行", "区", "华", "茂", "路", "32", "弄", "17", "号"]
         10 个 token (注意 "32" 和 "17" 被合并)
```

### 3.2 核心数据结构

#### input_ids
token 对应的 ID 序列，用于 BERT 查找词向量。

```
input_ids: [101, 872, 1298, 2207, 13944, 7032, 131, ..., 102, 0, 0, 0]
             CLS  闵    行    区    华    茂   路  ...  SEP PAD PAD PAD
```

#### attention_mask
注意力掩码，标记哪些位置是真实 token (1)，哪些是 padding (0)。

```
attention_mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, ...]
```

#### offset_mapping
记录每个 token 对应原始字符串的字符范围 `[start, end)`。

```
offset_mapping: [[0,0], [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,8], [8,9], [9,11], [11,12], [0,0]]
                CLS     闵      行      区     华      茂      路     32      弄      17       号     SEP
```

### 3.3 有效序列长度

| 方法 | 计算 | 说明 |
|------|------|------|
| `attention_mask.sum()` | `int(attention_mask[0].sum())` | ✓ 正确，包含 CLS + 所有token + SEP |
| `sum(1 for s,e in offset if s!=e)` | 统计非特殊token数量 | 只计算有效字符token，不含CLS/SEP |
| `len(chars) + 2` | 假设每个字符对应一个token | ✗ 可能错误（没有考虑字符合并） |

---

## 4. BIO 标注体系

### 4.1 标签含义

| 标签 | 全称 | 含义 | 示例 |
|------|------|------|------|
| `B-` | Begin | 实体开始 | `B-district` = 区县实体开始 |
| `I-` | Inside | 实体延续 | `I-district` = 区县实体延续 |
| `O` | Outside | 非实体 | 非地址元素 |

### 4.2 BIO 序列示例

```
地址: "闵行区华茂路32弄17号"
字符:  闵   行   区   华   茂   路   3    2    弄   1    7    号
标签:  B-   I-   I-   B-   I-   I-   B-   I-   I-   B-   I-   I-
      district      road           lane            building
```

### 4.3 合法性规则

- `B-` 后面可以接 `I-` (同一实体) 或 `O` (新实体)
- `I-` 前面必须是 `B-` 或 `I-` (同一实体)
- CRF 层确保预测序列始终合法（Viterbi 解码）

---

## 5. 数据处理流程

### 5.1 Label Studio 标注格式

```json
{
  "id": 1,
  "data": { "address": "闵行区闵北路675号" },
  "annotations": [{
    "result": [{
      "value": { "start": 0, "end": 3, "text": "闵行区", "labels": ["区县"] },
      "from_name": "admin",
      "to_name": "address"
    }]
  }]
}
```

### 5.2 数据转换 (train/data.py)

```python
entities = parse_annotation(address, annotations)
chars, tags = address_to_bio(address, entities)
# chars: ["闵", "行", "区", ...]
# tags: ["B-district", "I-district", "I-district", ...]
```

### 5.3 字符级与 Token 级对齐

```python
def align_char_tags_to_tokens(chars, tags, encoding, seq_len):
    offset_mapping = encoding["offset_mapping"][0].tolist()
    token_tags = ["O"] * seq_len
    char_to_tokens = {}
    for token_idx, (start, end) in enumerate(offset_mapping[:seq_len]):
        if start == end:
            continue
        for char_idx in range(start, end):
            char_to_tokens.setdefault(char_idx, []).append(token_idx)
    for char_idx, tag in enumerate(tags):
        if char_idx not in char_to_tokens:
            continue
        for i, token_idx in enumerate(char_to_tokens[char_idx]):
            if token_tags[token_idx] != "O":
                continue
            if tag.startswith("B-") and i == 0:
                token_tags[token_idx] = tag
            elif tag.startswith("B-"):
                token_tags[token_idx] = "I-" + tag[2:]
            else:
                token_tags[token_idx] = tag
    return token_tags
```

### 执行命令

```bash
uv run python -m train.data --exported label/exported
```

---

## 6. 模型训练

### 6.1 模型架构

```
Input: "闵行区华茂路32弄17号"
       ↓
chinese-roberta-wwm-ext (12层 Transformer, 768维)
       ↓
BiLSTM: 双向 (hidden=256, layers=1)
       ↓
CRF: 条件随机场（转移矩阵 + Viterbi 解码）
       ↓
Output: B-district I-district I-district B-road ...
```

### 6.2 训练参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| bert_model | base/chinese-roberta-wwm-ext | 预训练模型 |
| lstm_hidden | 256 | LSTM 隐藏层 |
| lstm_layers | 1 | LSTM 层数 |
| dropout | 0.1 | Dropout |
| lr | 2e-5 | BERT 学习率 |
| crf_lr | 1e-4 | CRF 层学习率 |
| batch_size | 8 | 批大小 |
| epochs | 20 | 轮数 |
| max_length | 128 | 序列长度 |

### 6.3 训练流程

```python
for epoch in range(epochs):
    model.train()
    for batch in train_loader:
        # 整个 batch 一次前向（CRF 负对数似然损失）
        loss, _ = model(input_ids, attention_mask, tag_ids)
        loss.backward()
        optimizer.step()

    # 验证（Viterbi 解码）
    f1 = evaluate(model, val_loader)
    if f1 > best_f1:
        save_checkpoint(model, f1)
```

### 6.4 评估指标

| 指标 | 公式 | 说明 |
|------|------|------|
| Precision | TP / (TP + FP) | 预测为实体且正确的字符数 / 预测为实体的总字符数 |
| Recall | TP / (TP + FN) | 预测为实体且正确的字符数 / 真值为实体的总字符数 |
| F1 | 2 * P * R / (P + R) | 精确率和召回率的调和平均 |

### 执行命令

```bash
uv run python -m train.train --data data/ --output dist/
```

---

## 7. 预测推理

### 7.1 推理流程

```
输入地址: "闵行区华茂路32弄17号"
    ↓
分词编码: tokenizer(address)
    ↓
chinese-roberta-wwm-ext → BiLSTM → CRF Viterbi 解码
    ↓
标签序列: [B-district, I-district, I-district, B-road, ...]
    ↓
实体提取: 根据 BIO 标签提取实体文本
    ↓
结构化结果: {"district": "闵行区", "road": "华茂路", "lane": "32弄", "building": "17号"}
```

### 7.2 实体提取算法

```python
def extract_entities(address, pred_tags, offset_mapping, seq_len):
    chars = list(address)
    entities = {}
    cur_type = None
    cur_text = []

    token_to_chars = {}
    for token_idx, (start, end) in enumerate(offset_mapping[:seq_len]):
        if start == end:
            continue
        token_to_chars[token_idx] = [i for i in range(start, end) if i < len(chars)]

    for token_idx in range(seq_len):
        if token_idx not in token_to_chars:
            continue
        char_indices = token_to_chars[token_idx]
        tag = pred_tags[token_idx]

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
        elif tag.startswith("I-") and cur_type == tag[2:]:
            cur_text.extend(chars[i] for i in char_indices)
        else:
            cur_type = None
            cur_text = []

    if cur_type:
        entities.setdefault(cur_type, []).append("".join(cur_text))
    return entities
```

### 执行命令

```bash
uv run python -m service.predict
uv run python -m service.predict --address "上海市闵行区浦申路200弄27号303室"
```

---

## 8. API 服务

### 启动服务

```bash
uvicorn model.service.service:app --host 0.0.0.0 --port 8000
```

### API 接口

#### GET /api/health
健康检查，返回模型加载状态。

#### GET /api/format?address=xxx
单条地址解析。

#### POST /api/batch_format
批量地址解析（body 为 JSON，含 `addresses` 数组）。

---

## 9. 标签定义

字段定义统一保存在 `DB label 表(core/db.py)`。

| key | label | from_name |
|-----|-------|-----------|
| province | 省份 | standard |
| city | 城市 | standard |
| district | 区县 | standard |
| street | 街道 | standard |
| town | 镇 | standard |
| township | 乡 | standard |
| road | 路 | standard |
| alley | 巷 | standard |
| highway | 高速公路 | standard |
| expressway | 快速路 | standard |
| lane | 弄 | standard |
| sub_lane | 支弄 | standard |
| road_number | 路号 | standard |
| community | 小区 | standard |
| village | 村 | standard |
| subarea | 子区域 | standard |
| zhai | 宅 | standard |
| building | 楼栋 | standard |
| unit | 单元 | standard |
| floor | 楼层 | standard |
| room | 室号 | standard |
| team | 队 | standard |
| group | 组 | standard |
| direction | 方向 | standard |
| location_type | 位置类型 | standard |
| poi | 兴趣点 | standard |
| other | 其他 | standard |

## 附录：术语表

| 术语 | 说明 |
|------|------|
| Token | BERT 分词后的最小单元 |
| WordPiece | BERT 使用的分词算法 |
| input_ids | token 对应的 ID 序列 |
| attention_mask | 有效位置掩码 |
| offset_mapping | token 到原始字符位置的映射 |
| BIO | Begin-Inside-Outside 标注体系 |
| emission | 发射分数，分类层输出的原始 logits |
| CRF | 条件随机场，含转移矩阵约束 |
| Viterbi | 最优路径解码算法 |