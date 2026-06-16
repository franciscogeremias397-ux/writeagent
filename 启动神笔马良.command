#!/bin/zsh

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR" || exit 1

APP_URL="http://localhost:3000"
APP_HEALTH_URL="http://127.0.0.1:3000"
API_HEALTH_URL="http://127.0.0.1:3001/api/settings"
CODEX_NODE_DIR="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

print ""
print "神笔马良正在启动..."
print "项目位置：$ROOT_DIR"
print ""

mkdir -p storage workspace/works logs

if [[ ! -f ".env" && ! -f ".env.local" && -f ".env.example" ]]; then
  cp ".env.example" ".env"
  print "已自动创建本地配置文件 .env。"
fi

if ! command -v node >/dev/null 2>&1 && [[ -x "$CODEX_NODE_DIR/node" ]]; then
  export PATH="$CODEX_NODE_DIR:$PATH"
  print "没有检测到系统 Node.js，已临时使用 Codex 自带 Node.js。"
fi

if ! command -v node >/dev/null 2>&1; then
  print "没有检测到 Node.js。"
  print "请先安装 Node.js 20 或更新版本，然后重新双击这个文件。"
  print ""
  read "unused?按回车关闭窗口..."
  exit 1
fi

HAS_PNPM=0

if command -v pnpm >/dev/null 2>&1; then
  HAS_PNPM=1
else
  if command -v corepack >/dev/null 2>&1; then
    print "正在准备 pnpm..."
    corepack enable
    corepack prepare pnpm@9.15.4 --activate
    if command -v pnpm >/dev/null 2>&1; then
      HAS_PNPM=1
    fi
  else
    print "没有检测到 pnpm/corepack；如果依赖已经在 node_modules 里，会使用本地依赖启动。"
  fi
fi

if [[ ! -d "node_modules" ]]; then
  if [[ "$HAS_PNPM" -ne 1 ]]; then
    print "没有找到 node_modules，也没有可用的 pnpm。"
    print "请先安装 Node.js 20+，再运行 corepack enable 或 pnpm install。"
    print ""
    read "unused?按回车关闭窗口..."
    exit 1
  fi

  print "第一次启动需要安装依赖，可能需要几分钟。"
  pnpm install
  if [[ "$?" -ne 0 ]]; then
    print "依赖安装失败。请检查网络后重试。"
    read "unused?按回车关闭窗口..."
    exit 1
  fi
fi

if command -v xattr >/dev/null 2>&1; then
  print "正在确认搬迁依赖可用..."
  xattr -dr com.apple.quarantine node_modules apps/web/node_modules apps/api/node_modules >/dev/null 2>&1 || true
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    print "正在启动本地数据库和队列..."
    docker compose up -d
    if [[ "$?" -eq 0 ]]; then
      if [[ "$HAS_PNPM" -eq 1 ]]; then
        print "正在确认数据库表结构..."
        pnpm db:migrate || print "数据库表结构确认失败，工作台仍会使用本地文件兜底。"
      else
        print "当前没有 pnpm，暂时跳过数据库迁移；工作台仍会使用本地文件兜底。"
      fi
    fi
  else
    print "检测到 Docker，但 Docker Desktop 还没打开。工作台仍可用，只是会先用本地文件保存。"
  fi
else
  print "没有检测到 Docker。工作台仍可用，只是会先用本地文件保存。"
fi

health_contains() {
  local url="$1"
  local expected="$2"

  curl -fsS --max-time 3 "$url" 2>/dev/null | grep -q "$expected"
}

port_pids() {
  lsof -ti ":$1" 2>/dev/null || true
}

ensure_port_ready_or_free() {
  local port="$1"
  local url="$2"
  local expected="$3"
  local name="$4"
  local pids

  pids="$(port_pids "$port")"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  if health_contains "$url" "$expected"; then
    print "$name 已经在端口 $port 运行。"
    return 0
  fi

  print ""
  print "端口 $port 已被其他进程占用，但看起来不是神笔马良的 $name。"
  print "占用进程：$pids"
  read "answer?是否停止这些进程并继续启动？输入 y 继续："

  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    print "已取消启动。你也可以先双击“停止神笔马良.command”，再重新启动。"
    exit 1
  fi

  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done <<< "$pids"

  for attempt in {1..10}; do
    if [[ -z "$(port_pids "$port")" ]]; then
      return 0
    fi

    sleep 1
  done

  print "端口 $port 仍未释放，请先关闭占用它的程序。"
  exit 1
}

build_local_packages() {
  if [[ -x "node_modules/.bin/tsc" ]]; then
    print "正在准备本地运行产物..."
    node_modules/.bin/tsc -p packages/shared/tsconfig.build.json || return 1
    node_modules/.bin/tsc -p apps/api/tsconfig.build.json || return 1
    return 0
  fi

  if [[ "$HAS_PNPM" -eq 1 ]]; then
    print "正在准备本地运行产物..."
    pnpm --filter @shenbi/shared build || return 1
    pnpm --filter @shenbi/api build || return 1
    return 0
  fi

  print "没有找到 TypeScript 编译器，无法准备后端运行产物。"
  return 1
}

ensure_port_ready_or_free 3000 "$APP_HEALTH_URL" "神笔马良短篇小说" "网页工作台"
ensure_port_ready_or_free 3001 "$API_HEALTH_URL" "aiProvider" "API 服务"

if health_contains "$APP_HEALTH_URL" "神笔马良短篇小说" && health_contains "$API_HEALTH_URL" "aiProvider"; then
  print ""
  print "神笔马良已经在运行，正在打开：$APP_URL"
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL"
  fi
  print ""
  read "unused?按回车关闭窗口..."
  exit 0
fi

print ""
print "正在启动网页工作台。请不要关闭这个窗口；关闭后服务会停止。"
print ""

if ! build_local_packages; then
  print "本地运行产物准备失败。"
  read "unused?按回车关闭窗口..."
  exit 1
fi

API_PID=""
WEB_PID=""

if ! health_contains "$API_HEALTH_URL" "aiProvider"; then
  node --conditions=compiled apps/api/dist/main.js &
  API_PID=$!
fi

if ! health_contains "$APP_HEALTH_URL" "神笔马良短篇小说"; then
  (cd apps/web && node_modules/.bin/next dev -H 127.0.0.1 -p 3000) &
  WEB_PID=$!
fi

cleanup() {
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1
  fi

  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1
  fi
}

trap cleanup INT TERM EXIT

for attempt in {1..60}; do
  if health_contains "$APP_HEALTH_URL" "神笔马良短篇小说" && health_contains "$API_HEALTH_URL" "aiProvider"; then
    print ""
    print "神笔马良已启动：$APP_URL"
    if command -v open >/dev/null 2>&1; then
      open "$APP_URL"
    fi
    break
  fi

  sleep 1
done

if ! health_contains "$APP_HEALTH_URL" "神笔马良短篇小说"; then
  print "网页工作台暂时没有正常响应，请查看上方日志。"
fi

if ! health_contains "$API_HEALTH_URL" "aiProvider"; then
  print "API 服务暂时没有正常响应，请查看上方日志。"
fi

wait $API_PID $WEB_PID 2>/dev/null
