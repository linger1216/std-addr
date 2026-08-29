"""
一次性脚本: 合并"标签管理"菜单到"要素定义"。
- 旧菜单"标签管理"(若存在):把 menuRole 授权迁移到"要素定义",然后删除
- 新菜单"要素定义":用最新配置更新(path/icon/sort)
- 幂等:可重复跑,完成后无副作用

用法:
  python3 scripts/migrate-label-menu.py
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
            # 1. 找到两个菜单
            cur.execute(
                "SELECT id, name, path, icon, sort FROM menu WHERE name IN (%s, %s)",
                ("标签管理", "要素定义"),
            )
            rows = cur.fetchall()
            old = next((r for r in rows if r[1] == "标签管理"), None)
            new = next((r for r in rows if r[1] == "要素定义"), None)
            print(f"旧菜单 标签管理: {old}")
            print(f"新菜单 要素定义: {new}")

            if old and new:
                # 2. 迁移 menuRole:把旧菜单的授权复制到新菜单(去重)
                cur.execute(
                    """
                    INSERT IGNORE INTO menu_role (menuId, roleId)
                    SELECT %s, roleId FROM menu_role WHERE menuId = %s
                    """,
                    (new[0], old[0]),
                )
                migrated = cur.rowcount
                print(f"角色授权迁移: {migrated} 条")

                # 3. 删除旧菜单(menu_role 会因 FK 自动级联)
                cur.execute("DELETE FROM menu WHERE id = %s", (old[0],))
                print(f"已删除旧菜单 标签管理 ({old[0]})")

            if new:
                # 4. 更新新菜单为最新配置(icon 改成 book-marked)
                cur.execute(
                    "UPDATE menu SET path=%s, icon=%s, sort=%s WHERE id=%s",
                    ("/knowledge/label", "book-marked", 6, new[0]),
                )
                print(f"新菜单 要素定义 配置已更新 (icon=book-marked)")

            conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()