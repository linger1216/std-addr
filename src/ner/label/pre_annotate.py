#!/usr/bin/env python3
"""
预标注脚本 - 使用已训练模型对 Label Studio 中的未标注任务进行预标注。

用法:
    cd src/ner
    uv run python -m label.pre_annotate --project "address format"            # 处理全部未标注任务
    uv run python -m label.pre_annotate --project "address format" --limit 100  # 只处理前 100 条

环境变量(读仓库根 .env 或系统环境):
    LABEL_STUDIO_URL        Label Studio 地址(默认 http://localhost:8081)
    LABEL_STUDIO_API_KEY    API Key(务必用环境变量注入,勿硬编码)
    ML_SERVICE_URL          模型解析服务地址(默认 http://localhost:8000)

标签映射:来自 DB label 表(core.db),from_name 固定为 "standard"(与 address_template.xml 一致)。
"""

import argparse
import json
import os
import time

import requests
from dotenv import load_dotenv
from label_studio_sdk import LabelStudio

from core.db import load_label_map
from core.paths import NER_ROOT


def _env(key: str, default: str = "") -> str:
    # 优先系统环境变量;否则从仓库根 .env 读取(不覆盖已有值)
    load_dotenv(NER_ROOT.parent.parent / ".env", override=False)
    return os.environ.get(key, default)


LABEL_STUDIO_URL = _env("LABEL_STUDIO_URL", "http://localhost:8081")
LABEL_STUDIO_API_KEY = _env("LABEL_STUDIO_API_KEY")
ML_SERVICE_URL = _env("ML_SERVICE_URL", "http://localhost:8000")

# DB label 表 → {英文key: 中文label}(预标注结果映射回 Label Studio 中文标签)
LABEL_MAP = load_label_map()
FIELD_TO_LABEL = {key: cn for cn, key in LABEL_MAP.items()}
# Label Studio 模板中 Labels 控件名为 standard(与 exported 数据 from_name 一致)
FIELD_TO_FROM_NAME = {key: "standard" for key in FIELD_TO_LABEL}


def parse_address(address):
    """调用 ML 服务解析地址。"""
    try:
        resp = requests.get(
            f"{ML_SERVICE_URL}/api/format",
            params={"address": address},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == 0 and data.get("data"):
                return data["data"]
        return None
    except Exception as e:
        print(f"  [错误] 解析失败: {e}")
        return None


def convert_to_prediction(address, parsed_data, task_id):
    """将解析结果转换为 Label Studio 预测格式。"""
    if not parsed_data:
        return None

    result = []

    for field, label in FIELD_TO_LABEL.items():
        value = parsed_data.get(field)
        if not value:
            continue

        # 模型可能返回逗号分隔的多个值,逐个处理
        for idx, single_value in enumerate(value.split(",")):
            single_value = single_value.strip()
            if not single_value:
                continue

            start_idx = address.find(single_value)
            if start_idx == -1:
                continue
            end_idx = start_idx + len(single_value)

            result.append({
                "value": {
                    "start": start_idx,
                    "end": end_idx,
                    "text": single_value,
                    "labels": [label],
                },
                "id": f"pred_{field}_{idx}" if idx > 0 else f"pred_{field}",
                "from_name": FIELD_TO_FROM_NAME[field],
                "to_name": "address",
                "type": "labels",
                "origin": "prediction",
            })

    if not result:
        return None

    return {
        "task": task_id,
        "result": result,
    }


def main():
    parser = argparse.ArgumentParser(description="预标注脚本")
    parser.add_argument("--project", type=str, default="test", help="项目名称")
    parser.add_argument("--limit", type=int, default=50, help="限制处理数量,0 表示全部")
    parser.add_argument("--batch", type=int, default=50, help="每批处理数量")
    args = parser.parse_args()

    if not LABEL_STUDIO_API_KEY:
        raise SystemExit("未设置 LABEL_STUDIO_API_KEY(请通过环境变量或仓库根 .env 提供)")

    # 连接 Label Studio
    client = LabelStudio(base_url=LABEL_STUDIO_URL, api_key=LABEL_STUDIO_API_KEY)

    print(f"连接到 Label Studio: {LABEL_STUDIO_URL}")

    # 根据项目名称查找项目
    projects = client.projects.list()
    project_id = None
    for p in projects:
        if p.title == args.project:
            project_id = p.id
            break

    if not project_id:
        print(f"错误: 找不到项目 '{args.project}'")
        return

    print(f"项目名称: {args.project}, 项目ID: {project_id}")

    # 获取任务
    tasks = client.tasks.list(project=project_id)
    unlabeled_tasks = list(tasks)
    print(f"获取任务数: {len(unlabeled_tasks)}")

    # 跳过已标注 / 已有预测的任务
    unlabeled_tasks = [t for t in unlabeled_tasks if not t.annotations]
    print(f"排除已标注任务后: {len(unlabeled_tasks)}")
    unlabeled_tasks = [t for t in unlabeled_tasks if not t.predictions]
    print(f"排除已有预测后: {len(unlabeled_tasks)}")

    if args.limit > 0:
        unlabeled_tasks = unlabeled_tasks[: args.limit]
        print(f"限制处理数量: {args.limit}")

    if not unlabeled_tasks:
        print("没有需要处理的任务")
        return

    # 处理任务
    success = 0
    failed = 0
    skipped = 0

    print(f"\n开始处理,每批 {args.batch} 个...")
    start_time = time.time()

    for i, task in enumerate(unlabeled_tasks):
        address = task.data.get("address", "")
        if not address:
            skipped += 1
            continue

        parsed = parse_address(address)
        if not parsed:
            failed += 1
            continue

        prediction = convert_to_prediction(address, parsed, task.id)
        if not prediction:
            failed += 1
            continue

        try:
            client.predictions.create(**prediction)
            success += 1
        except Exception as e:
            print(f"  [错误] 创建预测失败: {e}")
            failed += 1

        # 进度输出
        if (i + 1) % args.batch == 0 or i == len(unlabeled_tasks) - 1:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(unlabeled_tasks) - i - 1) / rate if rate > 0 else 0
            print(f"进度: {i + 1}/{len(unlabeled_tasks)} | 成功: {success} | 失败: {failed} | 剩余时间: {remaining:.0f}秒")

    print(f"\n完成! 成功: {success}, 失败: {failed}, 跳过: {skipped}")


if __name__ == "__main__":
    main()
