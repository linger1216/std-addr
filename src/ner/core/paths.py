"""
路径常量 —— src/ner 工程内所有目录的单一事实来源。

所有脚本(训练/服务/测试/预标注)一律通过本模块取路径,
避免散落的相对路径在换工作目录时失效。
"""

from pathlib import Path

# src/ner 根目录(core/paths.py → core → src/ner)
NER_ROOT = Path(__file__).resolve().parents[1]

# 预训练中文模型(hfl/chinese-roberta-wwm-ext,已下载,只读引用)
BASE_MODEL_DIR = NER_ROOT / "base" / "chinese-roberta-wwm-ext"

# Label Studio 导出标注目录(只读输入)
EXPORTED_DIR = NER_ROOT / "label" / "exported"

# 数据产物目录(data.py 切分输出:train/val/tag2id/labels.json)
DATA_DIR = NER_ROOT / "data"

# 模型产物目录(train.py 输出:best_model.pt)
MODEL_DIR = NER_ROOT / "model"

# 最佳模型(唯一保存,可续训)
BEST_MODEL_PATH = MODEL_DIR / "best_model.pt"
