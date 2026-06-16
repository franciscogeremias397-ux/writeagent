#!/bin/zsh

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR" || exit 1

print ""
print "正在停止神笔马良..."

STOPPED_APP=0

for port in 3000 3001; do
  PIDS="$(lsof -ti ":$port" 2>/dev/null || true)"

  if [[ -n "$PIDS" ]]; then
    print "正在停止端口 $port 上的本地服务..."
    while IFS= read -r pid; do
      if [[ -n "$pid" ]]; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done <<< "$PIDS"
    STOPPED_APP=1
  fi
done

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  print "正在停止本地数据库和队列容器..."
  docker compose stop >/dev/null 2>&1 || true
fi

if [[ "$STOPPED_APP" -eq 0 ]]; then
  print "没有发现正在运行的神笔马良网页服务。"
else
  print "网页服务已停止。"
fi

print "本地作品、备份、记忆和数据库数据不会因为停止服务而丢失。"
print ""
read "unused?按回车关闭窗口..."
