#!/bin/zsh

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR" || exit 1

print ""
print "正在检查神笔马良本地运行环境..."
print ""

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@9.15.4 --activate
  else
    print "没有检测到 pnpm，也没有检测到 corepack。请先安装 Node.js 20 或更新版本。"
    read "unused?按回车关闭窗口..."
    exit 1
  fi
fi

pnpm local:doctor

print ""
read "unused?按回车关闭窗口..."
