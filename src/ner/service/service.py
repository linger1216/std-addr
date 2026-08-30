"""
FastAPI 服务 - 提供地址格式化 API

用法:
    cd src/ner
    uv run python -m service.service                 # 单进程,端口 8000
    WORKERS=2 uv run python -m service.service       # 多进程

环境变量:
    NER_MODEL_PATH   覆盖模型路径(默认 model/best_model.pt)
    WORKERS          进程数(默认 1)

API:
    GET  /api/health         健康检查
    GET  /api/format?address=…   单条地址解析
    POST /api/batch_format    批量地址解析
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.paths import BEST_MODEL_PATH, NER_ROOT
from service.predict import AddressParser


# ========== 数据模型 ==========

class FormatData(BaseModel):
    """结构化地址字段(英文 key 与 DB label 表 name 一致;模型未预测到的字段为 None)"""

    model_config = {"exclude_none": True}
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    street: Optional[str] = None
    town: Optional[str] = None
    township: Optional[str] = None
    community: Optional[str] = None
    village: Optional[str] = None
    subarea: Optional[str] = None
    road: Optional[str] = None
    lane: Optional[str] = None
    sub_lane: Optional[str] = None
    alley: Optional[str] = None
    highway: Optional[str] = None
    expressway: Optional[str] = None
    road_number: Optional[str] = None
    building: Optional[str] = None
    unit: Optional[str] = None
    zhai: Optional[str] = None
    team: Optional[str] = None
    group: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    direction: Optional[str] = None
    location_type: Optional[str] = None
    poi: Optional[str] = None
    other: Optional[str] = None


class FormatResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[FormatData] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class BatchFormatRequest(BaseModel):
    addresses: List[str] = Field(description="地址字符串列表")


# ========== 全局状态 ==========

_parser: Optional[AddressParser] = None
BATCH_CHUNK_SIZE = 32


def model_path() -> Path:
    """模型路径:环境变量 NER_MODEL_PATH 覆盖,默认 model/best_model.pt。"""
    override = os.environ.get("NER_MODEL_PATH")
    return Path(override) if override else BEST_MODEL_PATH


def get_parser() -> AddressParser:
    global _parser
    if _parser is None:
        path = model_path()
        if not path.exists():
            raise RuntimeError(
                f"Model not found at {path}(请先训练:uv run python -m train.train)"
            )
        _parser = AddressParser(str(path))
    return _parser


# ========== 应用生命周期 ==========

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时预加载模型
    try:
        get_parser()
        print("Model loaded successfully on startup")
    except Exception as e:
        print(f"Model load failed on startup: {e}")
    yield


app = FastAPI(
    title="地址解析 API",
    description="基于 BERT-CRF 模型的地址字符串解析服务，支持单个和批量地址解析",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== API 端点 ==========

@app.get("/api/health", response_model=HealthResponse, tags=["地址解析"])
def health_check():
    try:
        get_parser()
        return HealthResponse(status="ok", model_loaded=True)
    except Exception:
        return HealthResponse(status="error", model_loaded=False)


@app.get("/api/format", tags=["地址解析"])
def format_address(address: str = Query(..., description="地址字符串", min_length=1)):
    if not address or not address.strip():
        raise HTTPException(status_code=400, detail="address is empty")

    try:
        parser = get_parser()
        result = parser.parse(address.strip())
        data = FormatData(**result)
        return {"code": 0, "message": "success", "data": data.model_dump(exclude_none=True)}
    except RuntimeError as e:
        if "Model not found" in str(e):
            raise HTTPException(status_code=503, detail="model load failed")
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"server internal error: {str(e)}")


@app.post("/api/batch_format", tags=["地址解析"])
def batch_format_address(req: BatchFormatRequest):
    try:
        parser = get_parser()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="model load failed")

    results = []
    for i in range(0, len(req.addresses), BATCH_CHUNK_SIZE):
        chunk = req.addresses[i:i + BATCH_CHUNK_SIZE]
        parsed = parser.parse_batch(chunk)
        for address, result in zip(chunk, parsed):
            if result:
                data = FormatData(**result)
                results.append({"address": address, "data": data.model_dump(exclude_none=True)})
            else:
                results.append({"address": address, "data": None})

    return {"code": 0, "message": "success", "data": results}


if __name__ == "__main__":
    import uvicorn

    workers = int(os.environ.get("WORKERS", "1"))
    if workers > 1:
        # 多进程:worker 以模块路径重新 import,需确保 src/ner 在 sys.path
        sys.path.insert(0, str(NER_ROOT))
        uvicorn.run("service.service:app", host="0.0.0.0", port=8000, workers=workers)
    else:
        uvicorn.run(app, host="0.0.0.0", port=8000)
