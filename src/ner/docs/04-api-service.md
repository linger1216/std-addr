> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# API 服务

## 服务架构

```
FastAPI ──HTTP──> NER Model (in-memory)
```

## 目录结构

```
src/ner/
├── service/
│   ├── service.py        # FastAPI 服务
│   └── predict.py        # AddressParser 推理模块
├── model/
│   └── best_model.pt     # 模型权重(训练产物)
├── train/
│   └── bert_crf.py       # BERT-CRF 模型定义
└── test/
    └── benchmark.py      # 性能基准
```

## 接口定义

### GET /api/health

**响应**
```json
{
  "status": "ok",
  "model_loaded": true
}
```

### GET /api/format

**请求**
```
GET /api/format?address=北京市朝阳区建国路88号1号楼2单元301室
```

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "province": "北京",
    "city": "北京",
    "district": "朝阳",
    "road": "建国路",
    "road_number": "88",
    "building": "1号楼",
    "unit": "2单元",
    "floor": "3",
    "room": "301室"
  }
}
```

### POST /api/batch_format

**请求**
```json
{
  "addresses": ["地址1", "地址2", "地址3"]
}
```

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {"address": "地址1", "data": {...}},
    {"address": "地址2", "data": null}
  ]
}
```

## 启动服务

```bash
cd src/ner
uv run python -m service.service     # 默认加载 model/best_model.pt,端口 8000
```

覆盖模型路径 / 多 Worker:

```bash
NER_MODEL_PATH=data/_smoke_model/best_model.pt uv run python -m service.service
WORKERS=2 uv run python -m service.service
```

> 中文参数请使用 URL 编码,`curl -G --data-urlencode "address=..."`(见 README 示例)。

## 测试接口

```bash
# 健康检查
curl http://localhost:8000/api/health

# 单条解析
curl "http://localhost:8000/api/format?address=闵行区古美路1458号"

# 批量解析
curl -X POST http://localhost:8000/api/batch_format \
  -H "Content-Type: application/json" \
  -d '{"addresses":["闵行区华茂路32弄17号","朝阳区建国路88号1号楼2单元301室"]}'
```

## 性能基准

```bash
cd src/ner
uv run python -m test.benchmark --n 200   # 需 data/val.json + model/best_model.pt
```

## 部署建议

### 生产环境

1. **GPU 推理**: 使用 NVIDIA GPU + CUDA 加速
2. **模型优化**: 使用 ONNX Runtime 加速推理
3. **负载均衡**: 多实例部署 + Nginx 负载均衡
4. **缓存**: 对相同地址做结果缓存

### 性能目标

| 指标 | 目标 |
|------|------|
| 响应时间 | < 200ms (GPU) |
| 并发数 | 100+ QPS |
| 可用性 | 99.9% |