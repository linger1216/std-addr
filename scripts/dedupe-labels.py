"""
一次性脚本: 对 label 表按 name 去重,保留最早一行(created_at 最小)。
- 幂等:重复跑会跳过(只剩一条时无删除)
- 跑前 / 跑后打印统计

用法:
  python3 scripts/dedupe-labels.py

环境变量同 seed_labels.py: DATABASE_URL 或 DB_HOST/...
"""
import os
from urllib.parse import urlparse

import pymysql


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
            # 跑前
            cur.execute("SELECT COUNT(*) FROM label")
            before = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT name) FROM label")
            distinct_before = cur.fetchone()[0]
            cur.execute(
                "SELECT name, COUNT(*) c FROM label GROUP BY name HAVING c > 1 ORDER BY name"
            )
            dup_groups = cur.fetchall()
            print(f"跑前:总行 {before} / 不重复 name {distinct_before} / 重复组 {len(dup_groups)}")
            if dup_groups:
                print("重复 name(每组 2 条):")
                for n, c in dup_groups[:10]:
                    print(f"  {n}  ×{c}")
                if len(dup_groups) > 10:
                    print(f"  ... 共 {len(dup_groups)} 组")

            # 自连接:同 name 且 created_at 较新(并列时 id 较大)的删掉
            # 一次 DELETE 删所有重复中"最老的之外"的行;多次执行也安全(删完后没匹配)
            sql = (
                "DELETE l1 FROM label l1 "
                "INNER JOIN label l2 "
                "ON l1.name = l2.name "
                "AND (l1.created_at > l2.created_at "
                "     OR (l1.created_at = l2.created_at AND l1.id > l2.id))"
            )
            cur.execute(sql)
            deleted = cur.rowcount
            conn.commit()

            # 跑后
            cur.execute("SELECT COUNT(*) FROM label")
            after = cur.fetchone()[0]
            cur.execute("SELECT COUNT(DISTINCT name) FROM label")
            distinct_after = cur.fetchone()[0]
            cur.execute(
                "SELECT name, COUNT(*) c FROM label GROUP BY name HAVING c > 1"
            )
            remaining = cur.fetchall()
            print(
                f"跑后:总行 {after} / 不重复 name {distinct_after} / 剩余重复组 {len(remaining)}"
            )
            print(f"删除行数: {deleted} (预期 {before - distinct_before})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()