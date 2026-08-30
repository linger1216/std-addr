# 地址 NER(bert-crf-addr) — 逐步验证手册

基于 **chinese-roberta-wwm-ext + BiLSTM + CRF** 的中文地址命名实体识别工程。
纯 Python(≥3.13),包管理用 uv,与 Next.js 前端完全独立(位于 `src/ner`)。

> 本文档是唯一权威流程,按 **Step 0 → 6** 顺序执行即可完整验证:
> 标注数据 → 训练/验证集 → 训练 → 模型产出 → 服务输出 → 测试。

## 全流程总览

```
label/exported/*.json(Label Studio 标注)+ 根 .env 的 DATABASE_URL → DB label 表(标签映射)
      │  Step 1:uv run python -m train.data(读取标注 + 切分)
      ▼
data/train.json · val.json · tag2id.json · labels.json
      │  Step 2:uv run python -m train.train(读 base/ 预训练模型)
      ▼
model/best_model.pt(唯一保存,可续训)
      │  Step 3:service.predict(AddressParser 按 checkpoint 超参重建)
      ▼
Step 4:service.service(FastAPI:/api/health · /api/format · /api/batch_format)
```

---

## Step 0:环境检查(1 分钟)

```bash
cd src/ner

# 0.1 确认 uv 虚拟环境可用(python 3.13 + 全部依赖已装)
uv run python --version        # 期望:Python 3.13.x
uv run python -c "import torch, transformers, pymysql, fastapi; print('deps OK')"
                               # 期望:deps OK

# 0.2 确认预训练模型在位(393MB,已下载)
ls base/chinese-roberta-wwm-ext/pytorch_model.bin

# 0.3 确认数据库可达(label 表为标签唯一来源)
uv run python -m core.db
# 期望输出(共 27 项):
#   label 表映射共 27 项:
#     alley -> alley
#     building -> building
#     ...
#     zhai -> zhai
```

> 依赖与 `.venv` 已在仓库根配置好(pyproject.toml + uv.lock);
> 首次使用或依赖变更后执行 `cd 仓库根 && uv sync` 同步。
> 数据库连接复用仓库根 `.env` 的 `DATABASE_URL`,Python 侧不另建 .env。

---

## Step 1:标注数据 → 训练集/测试集(1 分钟)

```bash
cd src/ner
uv run python -m train.data
```

**合并 + 分层切分**:读取 `label/exported/` 下**全部 `*.json`**标注文件(city/labeled/village 等)合并为一个整体,
去重后**按地址长度分层**切分(每 5 字符一桶,桶内按比例随机抽)——
保证训练/验证集与整体的**地址长度分布一致**(避免 99% 都是短地址或长地址)。

**预期输出**(合并 11923 条,去重 11746):

```
读取标注文件(3 个):
  .../city_labeled.json: 1123 samples
  .../labeled.json: 10000 samples
  .../village_labeled.json: 800 samples
Dedup: 11923 → 11746 (177 removed)
标签分布: district=11019, city=10357, ...
Train: 9393, Val: 2353

地址长度分布对比(桶宽 5 字符,占比 %):
  长度桶     整体     训练     验证
  0-4       0.3%    0.3%    0.3%
  5-9       8.2%    8.2%    8.2%
  10-14    16.2%   16.2%   16.2%
  ...(整体/训练/验证三列占比基本一致,即分层公允)

切分完成: total=11923, deduped=11746, train=9393, val=2353, tags=55
```

- `data/train.json` / `data/val.json`:Label Studio 原始记录(按长度分层 8:2 切分,去重,固定种子 42 可复现);
- `data/tag2id.json`:55 个 BIO 标签 = `O` + 27 标签 × `B-/I-`(**标签集来自 DB label 表,非 json**);
- `data/labels.json`:DB 标签映射缓存(数据库不可用时,训练/预标注降级使用)。

可选参数:`--exported <目录>`、`--out <目录>`、`--ratio 0.9`、`--bucket-size 5`(长度桶宽)、`--seed 7`。

---

## Step 2:训练(冒烟 1 分钟 / 正式数小时)

### 2a.快速冒烟(验证链路,1 分钟内)

先用 200 条子集跑 1 epoch,验证"训练 → 检查点产出"全链路:

```bash
cd src/ner
uv run python - <<'PY'
import json, os
os.makedirs("data/_smoke", exist_ok=True)
train = json.load(open("data/train.json"))[:200]
val = json.load(open("data/val.json"))[:50]
json.dump(train, open("data/_smoke/train.json", "w"), ensure_ascii=False)
json.dump(val, open("data/_smoke/val.json", "w"), ensure_ascii=False)
print(f"冒烟子集已生成:train {len(train)} / val {len(val)}")
PY

uv run python -m train.train \
  --data data/_smoke \
  --output_dir data/_smoke_model \
  --epochs 1 --lstm_hidden 64 --batch_size 8
```

**预期输出**(设备自动选 mps/cpu):

```
Using device: mps
标签映射(27 个):['alley', 'building', ..., 'zhai']
Train size: 200, Val size: 50
Number of tags: 55
Epoch 1/1: ... loss=...
Epoch 1: Saved best model with Entity F1=0.1234 → data/_smoke_model/best_model.pt
Epoch 1: Loss=..., P=..., R=..., F1=...
Saved best model with F1=... → data/_smoke_model/best_model.pt
Training complete! Best F1: ...
```

> 冒烟模型只训练 1 epoch,**预测结果无业务价值**,仅证明链路通。

### 2b.正式训练(全量 7860 条,建议 GPU)

```bash
cd src/ner
uv run python -m train.train                      # 默认参数(20 epoch,全量)
# 常用调参:
uv run python -m train.train --epochs 10 --batch_size 16 --max_length 128 --patience 3
uv run python -m train.train --patience 5         # 早停:实体 F1 连续 5 轮不升则停
uv run python -m train.train --resume model/best_model.pt   # 从 best 续训(恢复优化器/学习率曲线/早停计数)
```

**产物**:

```
model/
├── best_model.pt              # 验证集实体级 F1 最优检查点
├── epochs/
│   └── best_model.pt          # 唯一保存:验证集实体 F1 最优(可续训)
└── training_log.jsonl         # 每轮训练日志(loss/P/R/F1/实体F1/lr,JSONL)
```

- 设备自动选择:`cuda` → `mps`(mac)→ `cpu`;
- checkpoint 内含**全部超参**(tag2id / num_tags / lstm_hidden / lstm_layers / dropout / max_length),推理端据此重建,无需记忆参数;
- 本机(MPS)全量 20 epoch 约 8~11 小时,建议先跑 1~3 epoch 观察 loss 收敛,或使用 GPU 服务器;
- 完整参数表见文末或 `uv run python -m train.train --help`。

---

## Step 3:命令行推理(1 分钟)

```bash
cd src/ner

# 用冒烟模型(链路验证):
uv run python -m service.predict \
  --model data/_smoke_model/best_model.pt \
  --address "闵行区华茂路32弄17号"

# 用正式模型(默认 model/best_model.pt,需先完成 2b):
uv run python -m service.predict --address "闵行区华茂路32弄17号"
```

**预期输出**(正式模型):

```json
{
  "district": "闵行区",
  "road": "华茂路",
  "lane": "32弄",
  "building": "17号"
}
```

---

## Step 4:服务输出(2 分钟)

### 4a.启动服务

```bash
cd src/ner
uv run python -m service.service            # 默认加载 model/best_model.pt
# 冒烟模型验证服务链路:
NER_MODEL_PATH=data/_smoke_model/best_model.pt uv run python -m service.service
```

启动日志:`Model loaded successfully on startup`,监听 `0.0.0.0:8000`。

### 4b.验证三个接口(另开终端)

```bash
# 1) 健康检查
curl http://127.0.0.1:8000/api/health
# 期望:{"status":"ok","model_loaded":true}

# 2) 单条解析(中文需 URL 编码,用 -G --data-urlencode)
curl -G "http://127.0.0.1:8000/api/format" --data-urlencode "address=闵行区华茂路32弄17号"
# 期望:{"code":0,"message":"success","data":{...结构化字段...}}

# 3) 批量解析(含空地址)
curl -X POST "http://127.0.0.1:8000/api/batch_format" \
  -H "Content-Type: application/json" \
  -d '{"addresses":["闵行区华茂路32弄17号",""]}'
# 期望:{"code":0,"message":"success","data":[{"address":"闵行区华茂路32弄17号","data":{...}},{"address":"","data":null}]}
```

多进程服务:`WORKERS=2 uv run python -m service.service`。
停止服务:Ctrl+C。`service/test.http` 提供 IDE(REST Client)版本请求样例。

---

## Step 5:测试与基准(1 分钟)

```bash
cd src/ner
uv run pytest                    # 12 例单测(数据转换/推理链路,不依赖 DB 与模型)
uv run python -m test.benchmark --n 200   # 性能基准(需 data/val.json + model/best_model.pt)
```

**期望**:`12 passed`;基准输出 JSON(延迟 p50/p95、顺序/批量吞吐)。

---

## Step 6:预标注(可选)

把已训练模型的预测写回 Label Studio 未标注任务:

```bash
cd src/ner
LABEL_STUDIO_API_KEY=你的key uv run python -m label.pre_annotate \
  --project "address format" --limit 100
```

环境变量:`LABEL_STUDIO_URL`(默认 http://localhost:8081)、`LABEL_STUDIO_API_KEY`(必填)、
`ML_SERVICE_URL`(默认 http://localhost:8000)。
标签映射与 `from_name="standard"` 均来自 DB label 表与标注模板。

---

## 目录结构

```
src/ner/
├── base/           预训练模型 chinese-roberta-wwm-ext(已下载,不入库)
├── label/          标注:exported/(LS 导出)、template/(标注模板)、pre_annotate.py(预标注)
├── core/           公共:paths.py(路径常量)、db.py(DB label 表读取)
├── train/          训练:data.py(切分)、bert_crf.py(模型)、train.py(训练入口)
├── service/        服务:predict.py(AddressParser)、service.py(FastAPI)、test.http
├── test/           测试:test_data.py / test_predict.py(单测)、benchmark.py(基准)
├── data/           数据产物(不入库):train/val/tag2id/labels.json
├── model/          模型产物(不入库):best_model.pt + epochs/
└── docs/           详细设计参考(历史文档,顶部已注明以本 README 为准)
```

## 训练参数速查

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--epochs` | 20 | 训练轮数 |
| `--batch_size` | 8 | 批大小 |
| `--lr` / `--crf_lr` | 2e-5 / 1e-4 | BERT / CRF 层学习率 |
| `--max_length` | 128 | 最大序列长度 |
| `--lstm_hidden` / `--lstm_layers` | 256 / 1 | BiLSTM 结构 |
| `--dropout` | 0.1 | Dropout |
| `--warmup_ratio` | 0.1 | 学习率预热 |
| `--eval_interval` | 1 | 每 N 轮评估一次 |
| `--patience` | 0 | 早停:实体 F1 连续 N 轮不提升则停(0=关闭) |
| `--resume` | — | 从检查点续训;恢复优化器/调度器状态(学习率曲线与早停计数连续) |
| `--device` | 自动 | 显式指定 cuda / mps / cpu |
| `--num_workers` | 0 | DataLoader 加载进程数 |
| ~~`--save_epochs`~~ | - | 已移除:只保存 best_model.pt,不保存每轮检查点 |
| `--data` / `--output_dir` | data/ / model/ | 数据 / 产物目录 |
| `--bert_model` | base/chinese-roberta-wwm-ext | 预训练模型(本地) |
| `--seed` | 42 | 随机种子 |

评估以**实体级 F1** 为准(BIO 切分为实体集合后计算,`train/metrics.py`),字符级 F1 作参考;每轮结果写入 `model/training_log.jsonl`。

## 常见问题

- **`uv run` 报缓存错误**:本机 uv 正常;若 CI/受限环境缓存不可写,改用
  `仓库根/.venv/bin/python -m <模块>`(同一 uv venv)运行。
- **数据库不可用**:`train.data` / `train.train` 会报错;若已有 `data/labels.json` 缓存,
  `core.db` 会告警后降级使用缓存(可离线训练)。
- **预测结果乱码/空字段**:冒烟模型(1 epoch)无业务价值,请先完成正式训练。
- **磁盘不足**:训练只保存 best_model.pt(约 400MB/份),已无每轮检查点占用。
- **新增标签**:在 DB `label` 表增加记录(status=1)后,重新执行 Step 1 再训练。
- **换机器**:重新下载 `base/chinese-roberta-wwm-ext` 放入 base/ 目录(已在 .gitignore)。
- **安全**:旧脚本曾硬编码 Label Studio API Key 进入 git 历史,请到 LS 后台**轮换该 Key**。
