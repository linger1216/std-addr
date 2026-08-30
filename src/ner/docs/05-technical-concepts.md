> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# 技术概念详解

本文档详细解释地址 NER 模型中的关键技术概念。

## 1. BERT Tokenization 机制

### 1.1 WordPiece 分词器

BERT 使用 WordPiece 算法进行中文分词。与简单的字符分词不同，WordPiece 可能会将连续的数字或某些字符合并成一个 token。

**示例**：
```
原始文本: "闵行区华茂路32弄17号"
字符分词: ["闵", "行", "区", "华", "茂", "路", "3", "2", "弄", "1", "7", "号"]
         12 个字符

BERT分词: ["闵", "行", "区", "华", "茂", "路", "32", "弄", "17", "号"]
         10 个 token (注意 "32" 和 "17" 被合并)
```

### 1.2 input_ids

token 对应的 ID 序列，用于 BERT 查找词向量。

```
input_ids: [101, 872, 1298, 2207, 13944, 7032, 131, ..., 102, 0, 0, 0]
             CLS  闵    行    区    华    茂   路  ...  SEP  PAD PAD PAD
```

### 1.3 attention_mask

注意力掩码，标记哪些位置是真实 token (1)，哪些是 padding (0)。

```
attention_mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, ...]
                  ↑                                           ↑
                有效                                      padding
```

**作用**：BERT 的注意力机制会关注所有位置，但通过 mask 可以忽略 padding，避免干扰。

### 1.4 offset_mapping

记录每个 token 对应原始字符串的字符范围 `[start, end)`。

```
offset_mapping: [[0,0],   [0,1],   [1,2],   [2,3],   [3,4],   [4,5],   [5,6],   [6,8],   [8,9],   [9,11],  [11,12],  [0,0],   ...]
                CLS      闵      行       区       华       茂       路      32       弄       17        号       SEP

解释:
  token[7]: [6,8] → 对应 chars[6:8] = "32" (两个字符被合并成一个token)
  token[9]: [9,11] → 对应 chars[9:11] = "17" (两个字符被合并成一个token)
```

## 2. 三者的关系

### 2.1 数据结构对比

| 变量 | 含义 | 长度 | 示例 |
|------|------|------|------|
| `address` | 原始地址字符串 | 12 字符 | `"闵行区华茂路32弄17号"` |
| `input_ids` | token ID 序列 | max_length (128) | `[101, 872, ..., 102, 0, 0]` |
| `attention_mask` | 有效位置掩码 | max_length (128) | `[1, 1, ..., 1, 0, 0]` |
| `offset_mapping` | token→字符映射 | max_length (128) | `[[0,0], [0,1], ..., [0,0]]` |

### 2.2 有效序列长度

确定有效 token 数量的方法：

```python
# 方法1: attention_mask.sum() ✓ 正确
seq_len = int(attention_mask[0].sum())  # 包含 CLS + 所有token + SEP

# 方法2: 统计 offset_mapping 中 start!=end 的数量
seq_len = sum(1 for s, e in offset_mapping if s != e)  # 只计算有效字符token，不含CLS/SEP

# 方法3: len(chars) + 2 ✗ 可能错误（没有考虑字符合并）
seq_len = len(chars) + 2  # 假设每个字符对应一个token
```

**注意**：WordPiece 会合并连续数字，所以方法3可能不正确。

### 2.3 图示三者关系

```
原始地址: 闵   行   区   华   茂   路   3    2    弄   1    7    号
           0    1    2    3    4    5    6    7    8    9   10   11

input_ids:  [CLS, 闵,  行,  区,  华,  茂,  路,  32,  弄,  17,   号,  SEP, PAD...]
attention:  1    1    1    1    1    1    1    1    1    1    1    1    0   0...
offset:     [CLS, 闵,  行,  区,  华,  茂,  路,  32,  弄,  17,   号,  SEP, PAD...]
            [0,0] [0,1][1,2][2,3][3,4][4,5][5,6][6,8][8,9][9,11][11,12][0,0]
```

## 3. BIO 标注体系

### 3.1 标签含义

| 标签 | 全称 | 含义 | 示例 |
|------|------|------|------|
| `B-` | Begin | 实体开始 | `B-district` = 区县实体开始 |
| `I-` | Inside | 实体延续 | `I-district` = 区县实体延续 |
| `O` | Outside | 非实体 | 非地址元素 |

### 3.2 BIO 序列示例

```
地址: "闵行区华茂路32弄17号"
字符:  闵   行   区   华   茂   路   3    2    弄   1    7    号
标签:  B-   I-   I-   B-   I-   I-   B-   I-   I-   B-   I-   I-
      district      road           lane            building
```

**合法性规则**：
- `B-` 后面可以接 `I-` (同一实体) 或 `O` (新实体)
- `I-` 前面必须是 `B-` 或 `I-` (同一实体)
- `I-` 后面不能直接接 `B-` (实体不能突然中断)

## 4. 字符级与 Token 级对齐

### 4.1 问题背景

训练数据是**字符级**标注：
```json
{"start": 0, "end": 3, "text": "闵行区", "labels": ["区县"]}
```

但 BERT 输出的是 **token 级**预测。

### 4.2 对齐方法

```python
# 1. 建立字符索引 → token索引列表 的映射
char_to_tokens = {}  # char_idx -> [token_idx1, token_idx2, ...]
for token_idx, (start, end) in enumerate(offset_mapping[:seq_len]):
    if start == end:  # 跳过特殊token
        continue
    for char_idx in range(start, end):
        if char_idx not in char_to_tokens:
            char_to_tokens[char_idx] = []
        char_to_tokens[char_idx].append(token_idx)

# 2. 将字符级标签赋给所有对应的token
token_tags = ["O"] * seq_len
for char_idx, tag in enumerate(tags):
    if char_idx not in char_to_tokens:
        continue
    for token_idx in char_to_tokens[char_idx]:
        if token_tags[token_idx] == "O":  # 未赋值则赋值
            token_tags[token_idx] = tag
```

### 4.3 合并 token 问题

当多个字符映射到同一 token 时（如 "32" 被合并）：

```
char[6]="3" → token[7]
char[7]="2" → token[7]  ← 同一个 token

问题: token[7] 只能有一个标签，但对应两个字符
```

**处理规则**：
- 第一个字符决定该 token 的标签类型
- 后续字符如果是同一实体的延续，不需要额外处理
- token 级预测后，用 `offset_mapping` 恢复字符级结果

## 5. 实体提取算法

### 5.1 算法流程

```python
def extract_entities(chars, tags, offset_mapping, seq_len):
    # 1. 建立 token → 字符列表 的映射
    token_to_chars = {}
    for token_idx, (start, end) in enumerate(offset_mapping[:seq_len]):
        if start == end:
            continue
        if token_idx not in token_to_chars:
            token_to_chars[token_idx] = []
        for char_idx in range(start, end):
            if char_idx < len(chars):
                token_to_chars[token_idx].append(char_idx)

    # 2. 遍历 token，按 BIO 标签提取实体
    entities = {}
    current_entity = None
    current_text = []
    processed_tokens = set()

    for token_idx in range(seq_len):
        if token_idx in processed_tokens or token_idx not in token_to_chars:
            continue

        tag = tags[token_idx]
        char_indices = token_to_chars[token_idx]
        processed_tokens.add(token_idx)

        if tag.startswith("B-"):
            # 保存上一个实体，开始新实体
            ...
        elif tag.startswith("I-") and current_entity == tag[2:]:
            # 延续当前实体
            current_text.extend([chars[i] for i in char_indices])
        else:
            # 结束当前实体
            ...

    return entities
```

### 5.2 合并 token 的处理

```
offset_mapping:
  token[7]: [6,8] → chars[6]="3", chars[7]="2"

token_to_chars:
  token[7] → [6, 7]

提取时:
  char_indices = [6, 7]
  chars = ["3", "2"]
  current_text.extend(["3", "2"])  → "32"
```

## 6. 常见问题与解决方案

### 6.1 数字被合并

**问题**：连续数字被 BERT WordPiece 合并成单个 token。

**示例**：
```
"781" → 可能被合并成 1 个 token 或 2 个 token
```

**影响**：
- 训练时标签对齐可能丢失部分信息
- 预测时实体边界可能不准确

**解决方案**：
1. 使用 `attention_mask.sum()` 确定有效序列长度
2. 在实体提取时正确处理 `token_to_chars` 映射
3. 模型会学习处理常见的合并模式

### 6.2 [CLS] 和 [SEP] 标签

**问题**：模型可能对 [CLS] 位置预测出非 "O" 的标签。

**原因**：训练时 [CLS] 位置标签固定为 "O"，但模型可能学到其他模式。

**解决方案**：
```python
# 强制 [CLS] 位置为 O
pred_tags = [id2tag.get(p, "O") for p in predictions[0]]
if len(pred_tags) > 0:
    pred_tags[0] = "O"  # [CLS]
```

### 6.3 padding 影响

**问题**：padding 位置可能干扰实体提取。

**解决方案**：
- 使用 `attention_mask` 确定有效序列长度
- 只遍历有效 token 位置

## 7. 术语表

| 术语 | 说明 |
|------|------|
| Token | BERT 分词后的最小单元 |
| WordPiece | BERT 使用的分词算法 |
| subword | 被拆分的词片段，如 "##行" |
| emission | 发射分数，分类层输出的原始 logits |
| BIO | Begin-Inside-Outside 标注体系 |
| offset_mapping | token 到原始字符位置的映射 |
| attention_mask | 有效位置掩码 |
| entity | 命名实体，如省、市、区等 |
