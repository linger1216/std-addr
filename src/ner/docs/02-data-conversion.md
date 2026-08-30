> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# 数据转换 - BIO 格式

## 概述

将 Label Studio 导出的 JSON 格式转换为 NER 训练所需的 BIO 格式。

## 字段定义

> 字段定义统一保存在 `DB label 表(core/db.py)`，各模块通过相对路径引用。

**Label Studio 标签 → NER 标签映射（从 DB label 表(core/db.py)）：**

| Label Studio 标签 | NER key | BIO 标注 |
|------------------|---------|----------|
| 省份 | province | B-province, I-province |
| 城市 | city | B-city, I-city |
| 区县 | district | B-district, I-district |
| 街道 | street | B-street, I-street |
| 镇 | town | B-town, I-town |
| 乡 | township | B-township, I-township |
| 路 | road | B-road, I-road |
| 巷 | alley | B-alley, I-alley |
| 高速公路 | highway | B-highway, I-highway |
| 快速路 | expressway | B-expressway, I-expressway |
| 弄 | lane | B-lane, I-lane |
| 支弄 | sub_lane | B-sub_lane, I-sub_lane |
| 路号 | road_number | B-road_number, I-road_number |
| 小区 | community | B-community, I-community |
| 村 | village | B-village, I-village |
| 子区域 | subarea | B-subarea, I-subarea |
| 宅 | zhai | B-zhai, I-zhai |
| 楼栋 | building | B-building, I-building |
| 单元 | unit | B-unit, I-unit |
| 队 | team | B-team, I-team |
| 组 | group | B-group, I-group |
| 楼层 | floor | B-floor, I-floor |
| 室号 | room | B-room, I-room |
| 方向 | direction | B-direction, I-direction |
| 位置类型 | location_type | B-location_type, I-location_type |
| 兴趣点 | poi | B-poi, I-poi |
| 其他 | other | B-other, I-other |

## 输入格式

Label Studio JSON (`label/exported/sample_100_labeled.json`):

```json
{
  "id": 1,
  "data": { "address": "闵行区闵北路675号虹桥国际医学中心.一楼.四楼.八楼." },
  "annotations": [{
    "result": [
      {
        "value": { "start": 0, "end": 3, "text": "闵行区", "labels": ["区县"] },
        "from_name": "admin",
        "to_name": "address"
      }
    ]
  }]
}
```

## BIO 标注说明

- **B-**: Begin，实体开始
- **I-**: Inside，实体延续
- **O**: Outside，非实体

### 转换示例

原始地址: `闵行区闵北路675号`

```
字符序列:    闵   行   区   闵   北   路   6    7    5    号
BIO 标签:   B-district I-district I-district B-road I-road B-road_number I-road_number I-road_number O
```

## 输出格式

训练数据输出为 JSON Lines 格式：

```json
{"address": "闵行区闵北路675号", "labels": ["B-district", "I-district", "I-district", "B-road", "I-road", "I-road", "B-road_number", "I-road_number", "I-road_number", "O"]}
```

## 数据划分

| 数据集 | 比例 | 数量（100条示例） |
|--------|------|-------------------|
| 训练集 | 80% | 80 |
| 验证集 | 20% | 20 |

## 注意事项

1. 处理重叠标签时，按标注顺序取第一个
2. 未标注的字符统一标记为 `O`
3. 实体边界以 Label Studio 的 `start` 和 `end` 为准
