"""
基准测试 - 测量地址解析延迟与吞吐(PyTorch 版)

前置条件:data/val.json(uv run python -m train.data)与
         model/best_model.pt(uv run python -m train.train)。

用法:
    cd src/ner
    uv run python -m test.benchmark [--n N]

输出:单条 parse 延迟(p50/p95)、顺序循环吞吐、parse_batch 批量吞吐
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from core.paths import BEST_MODEL_PATH, DATA_DIR
from service.predict import AddressParser


def load_addresses(n: int) -> list:
    with open(DATA_DIR / "val.json") as f:
        data = json.load(f)
    return [d["data"]["address"] for d in data[:n]]


def make_parser() -> AddressParser:
    return AddressParser(str(BEST_MODEL_PATH))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=200)
    args = ap.parse_args()

    addresses = load_addresses(args.n)
    parser = make_parser()

    # warmup(含模型加载)
    for a in addresses[:5]:
        parser.parse(a)

    # 单条延迟(与 /api/format 语义一致)
    lat_ms = []
    for a in addresses:
        t0 = time.perf_counter()
        parser.parse(a)
        lat_ms.append((time.perf_counter() - t0) * 1000)
    lat_ms.sort()

    def pct(p):
        return lat_ms[min(len(lat_ms) - 1, int(len(lat_ms) * p))]

    # 顺序逐条吞吐
    t0 = time.perf_counter()
    for a in addresses:
        parser.parse(a)
    sequential_qps = len(addresses) / (time.perf_counter() - t0)

    # parse_batch 批量吞吐(一次前向推理)
    t0 = time.perf_counter()
    parser.parse_batch(addresses)
    batch_qps = len(addresses) / (time.perf_counter() - t0)

    result = {
        "engine": "torch",
        "n": len(addresses),
        "single_latency_ms": {
            "mean": round(statistics.mean(lat_ms), 2),
            "p50": round(pct(0.5), 2),
            "p95": round(pct(0.95), 2),
            "max": round(lat_ms[-1], 2),
        },
        "sequential_throughput_qps": round(sequential_qps, 2),
        "batch_throughput_qps": round(batch_qps, 2),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
