"""
数据库标签读取 —— 替代已废弃的 label/field_definitions.json。

标签唯一事实源 = MySQL `label` 表(status=1),字段:
  - name : 英文 key(如 road / district / road_number)—— 训练 BIO 标签与服务输出字段
  - label: 中文显示名(如 路 / 区县 / 路号)—— Label Studio 标注值

连接信息来自仓库根 .env 的 DATABASE_URL(Next.js 同源),Python 侧不另建 .env。
读取结果缓存到 data/labels.json:DB 不可用时(如离线训练)降级用缓存并告警。

本模块对外只暴露两个函数:
  - get_database_url()      调试用,返回解析后的连接字典
  - load_label_map()        返回 {中文label: 英文key}(@lru_cache,进程内只查一次)
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

from core.paths import DATA_DIR, NER_ROOT

# DATABASE_URL 示例:mysql://user:password@host:port/dbname
_URL_RE = re.compile(
    r"^mysql://(?P<user>[^:]+)(?::(?P<password>[^@]*))?@(?P<host>[^:/]+)(?::(?P<port>\d+))?/(?P<db>[^/?#]+)"
)

CACHE_FILE = DATA_DIR / "labels.json"


def _find_root_env() -> Optional[Path]:
    """从 src/ner 向上查找 .env(仓库根已有,不再新建)。"""
    cur: Path = NER_ROOT
    for _ in range(4):  # src/ner → src → 仓库根 → 上级,最多 4 层
        candidate = cur / ".env"
        if candidate.is_file():
            return candidate
        cur = cur.parent
    return None


def get_database_url() -> str:
    """返回 DATABASE_URL;优先环境变量,否则从根 .env 加载。"""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_file = _find_root_env()
    if env_file:
        load_dotenv(env_file)
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "未找到 DATABASE_URL:请确认仓库根 .env 存在且含 DATABASE_URL,"
            "或通过环境变量提供(如 export DATABASE_URL='mysql://user:pass@host:3306/db')"
        )
    return url


def parse_database_url(url: str) -> Dict[str, str]:
    """解析 mysql://user:pass@host:port/db 为连接参数字典。"""
    m = _URL_RE.match(url.strip())
    if not m:
        raise RuntimeError(f"DATABASE_URL 格式无法解析(仅支持 mysql://): {url}")
    return {
        "user": m.group("user"),
        "password": m.group("password") or "",
        "host": m.group("host"),
        "port": int(m.group("port") or 3306),
        "db": m.group("db"),
    }


def _query_label_map() -> Dict[str, str]:
    """直连 MySQL 查询 label 表,返回 {中文label: 英文key}。"""
    import pymysql

    cfg = parse_database_url(get_database_url())
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["db"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, label FROM label WHERE status = 1")
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        raise RuntimeError("label 表为空或没有 status=1 的标签")

    # 中文 label 可能为空 → 用 name 自身兜底(极少见)
    result: Dict[str, str] = {}
    for r in rows:
        key = r["name"]
        cn = r.get("label") or key
        result[cn] = key
    return result


def _read_cache() -> Optional[Dict[str, str]]:
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data:
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return None


def _write_cache(mapping: Dict[str, str]) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
    except OSError:
        pass


@lru_cache(maxsize=1)
def load_label_map() -> Dict[str, str]:
    """
    加载标签映射 {中文label: 英文key}(进程内缓存,只查一次 DB)。

    优先级:DB(label 表)→ 磁盘缓存 data/labels.json(DB 不可用时降级,并告警)。
    """
    try:
        mapping = _query_label_map()
        _write_cache(mapping)  # 同步缓存,供离线场景复用
        return mapping
    except Exception as e:  # noqa: BLE001 - 统一降级,不阻断离线流程
        cached = _read_cache()
        if cached:
            print(f"[core.db] 数据库读取失败({e}),使用缓存 {CACHE_FILE}")
            return cached
        raise RuntimeError(
            f"无法从数据库读取 label 表,且无缓存可用: {e}"
        ) from e


def clear_label_map_cache() -> None:
    """测试用:清除进程内缓存。"""
    load_label_map.cache_clear()


if __name__ == "__main__":
    mapping = load_label_map()
    print(f"label 表映射共 {len(mapping)} 项:")
    for cn, key in sorted(mapping.items(), key=lambda kv: kv[1]):
        print(f"  {cn} -> {key}")
