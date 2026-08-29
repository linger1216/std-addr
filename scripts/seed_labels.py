"""
一次性脚本: 向 labels 表插入地址组件标签种子数据。
cuid 在 MySQL 没有内建函数,用 Python 的 uuid4 hex 截前 23 字符 + 'cl_' 前缀,
凑成 25 字符 ID(项目其他 cuid 例如 cmtd12y4m0000yqxsobhu050y 也是 25 字符)。

用法:
  python3 scripts/seed_labels.py

环境变量:
  DATABASE_URL=mysql://user:pass@host:3306/dbname   (优先)
  或 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME

特性:
  - ON DUPLICATE KEY UPDATE name: 重复跑不会报错,顺带刷新 label 中文名
  - 自动统计新增/更新条数
"""
import os
import uuid
from urllib.parse import urlparse

import pymysql

LABELS = [
    ("province",      "省份"),
    ("city",          "城市"),
    ("district",      "区县"),
    ("street",        "街道"),
    ("town",          "镇"),
    ("township",      "乡"),
    ("road",          "路"),
    ("alley",         "巷"),
    ("highway",       "高速公路"),
    ("expressway",    "快速路"),
    ("lane",          "弄"),
    ("sub_lane",      "支弄"),
    ("road_number",   "路号"),
    ("community",     "小区"),
    ("village",       "村"),
    ("subarea",       "子区域"),
    ("zhai",          "宅"),
    ("building",      "楼栋"),
    ("unit",          "单元"),
    ("floor",         "楼层"),
    ("room",          "室号"),
    ("team",          "队"),
    ("group",         "组"),
    ("direction",     "方向"),
    ("location_type", "位置类型"),
    ("poi",           "兴趣点"),
    ("other",         "其他"),
]


def get_conn():
    url = os.environ.get("DATABASE_URL")
    if url:
        u = urlparse(url)
        return pymysql.connect(
            host=u.hostname,
            port=u.port or 3306,
            user=u.username,
            password=u.password,
            database=(u.path or "/").lstrip("/"),
            charset="utf8mb4",
        )
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "std_addr"),
        charset="utf8mb4",
    )


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            sql = (
                "INSERT INTO `label` "
                "(`id`, `name`, `label`, `status`, `created_at`, `updated_at`) "
                "VALUES (%s, %s, %s, 1, NOW(), NOW()) "
                "ON DUPLICATE KEY UPDATE `label`=VALUES(`label`), `updated_at`=NOW()"
            )
            inserted = 0
            updated = 0
            for name, label_zh in LABELS:
                # cuid 风格 25 字符 ID(以 cl_ 前缀方便识别)
                cid = "cl_" + uuid.uuid4().hex[:23]
                cur.execute(sql, (cid, name, label_zh))
                # MySQL ON DUPLICATE KEY UPDATE 时:rowcount=1(新增) 或 rowcount=2(更新已有)
                if cur.rowcount == 1:
                    inserted += 1
                elif cur.rowcount >= 2:
                    updated += 1
            conn.commit()
            print(f"✅ 完成: 新增 {inserted} 条, 更新 {updated} 条, 共 {len(LABELS)} 条")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
