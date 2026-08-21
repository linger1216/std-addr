#!/usr/bin/env bash
set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "用法: ./new.sh <项目名> [目标目录]"
  echo "示例: ./new.sh address ~/projects"
  exit 1
fi

if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "错误: 项目名不合法 (只能以小写字母或数字开头, 含小写字母、数字、-、_)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${2:-$PWD}"
DEST="$DEST_DIR/$NAME"

if [[ -e "$DEST" ]]; then
  echo "错误: 目标已存在: $DEST"
  exit 1
fi

case "$(uname)" in
  Darwin) SED_INLINE=(-i "") ;;
  *) SED_INLINE=(-i) ;;
esac

echo "从模板生成项目: $DEST"
mkdir -p "$DEST_DIR"

rsync -a \
  --exclude "node_modules" \
  --exclude ".next" \
  --exclude "generated" \
  --exclude "*.tsbuildinfo" \
  --exclude ".env" \
  --exclude ".git" \
  "$SCRIPT_DIR/" "$DEST/"

# 替换文本文件中的项目名
grep -rl "std-addr" "$DEST" 2>/dev/null \
  | grep -vE '\.(ico|png|jpe?g|gif|webp|woff2?|ttf|eot)$' \
  | while IFS= read -r f; do
      sed "${SED_INLINE[@]}" "s/std-addr/$NAME/g" "$f"
    done

# 从 .env.example 生成 .env (替换数据库名, 生成 AUTH_SECRET, 密码留空待填)
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" 2>/dev/null \
  || openssl rand -base64 32)
sed "s|std-addr|$NAME|g; s|AUTH_SECRET=\"\"|AUTH_SECRET=\"$SECRET\"|" "$SCRIPT_DIR/.env.example" > "$DEST/.env"

# 确保新项目不带 .git 历史 (双保险: rsync 已排除, 这里再兜底清理)
rm -rf "$DEST/.git"

echo ""
echo "完成! 下一步:"
echo "  cd $DEST"
echo "  pnpm install"
echo "  # 编辑 .env 填入数据库密码等配置"
echo "  # 手动创建数据库 (utf8mb4): mysql -e \"CREATE DATABASE \\\\\"$NAME\\\\\" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
echo "  pnpm db:setup   # 建表 + 插种子数据 (admin / 123456)"
echo "  pnpm dev"
