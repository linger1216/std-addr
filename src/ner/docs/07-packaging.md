> **注意**:本文件为历史设计参考,当前目录结构 / 命令 / 标签来源以 [`src/ner/README.md`](../README.md) 为准(标签映射改读 DB label 表,运行统一 `uv run python -m ...`)。

# 打包部署

> 注意：`service.spec` 已随目录重构移除。如需打包，需在 `model/` 下重建 PyInstaller 配置。

使用 PyInstaller 将 FastAPI 服务打包为独立可执行文件。

## 前置条件

```bash
pip install pyinstaller
```

## 构建

```bash
pyinstaller service/service.spec(需重建)
```

输出目录：`dist/addr_service/`

```
dist/addr_service/
├── addr_service              # Linux/macOS 主程序
├── addr_service.exe          # Windows 主程序
└── _internal/                # 运行时文件
    ├── dist/
    │   └── best_model.pt       # NER 模型权重
    ├── base/
    │   └── chinese-roberta-wwm-ext/  # 预训练模型/分词器
    ├── torch/                    # PyTorch 运行时
    ├── transformers/             # HuggingFace transformers
    └── ...
```

## 启动

```bash
cd dist/addr_service
./addr_service   # Linux/macOS
addr_service.exe # Windows
```

服务默认在 `0.0.0.0:8000` 启动。

## 目录结构

```
├── model/
│   ├── service/service.py     # FastAPI 服务源码
│   ├── service/service.spec   # PyInstaller 构建配置（待重建）
│   ├── dist/
│   │   └── best_model.pt      # 模型权重
│   └── base/
│       └── chinese-roberta-wwm-ext/  # 预训练模型
└── dist/addr_service/   # 构建产物
```

## 常见问题

**Q: 打包后模型找不到？**

检查 `service.py` 中的 `BASE_DIR` 路径逻辑。打包后模型位于 `sys._MEIPASS` 目录，源码运行则指向项目根目录。

**Q: 体积太大？**

PyTorch + BERT 模型本身约 300-500MB，加上运行时库最终约 1-2GB，属于正常范围。可考虑：
- 使用 ONNX Runtime 替代 PyTorch（需要额外转换）
- 仅打包 CPU 版本（删除 CUDA 相关库）