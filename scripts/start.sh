#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== InterviewOS 启动脚本 ==="

# 后端虚拟环境
if [ ! -d "$ROOT/backend/.venv" ]; then
    echo "创建 Python 虚拟环境..."
    python3 -m venv "$ROOT/backend/.venv"
    "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

# 前端依赖
if [ ! -d "$ROOT/frontend/node_modules" ]; then
    echo "安装前端依赖..."
    (cd "$ROOT/frontend" && npm install)
fi

# 启动后端
echo "启动后端 (port 8000)..."
(cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

sleep 2

# 启动前端
echo "启动前端 (port 3000)..."
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "InterviewOS 已启动！"
echo "前端: http://localhost:3000"
echo "后端: http://localhost:8000"
echo "按 Ctrl+C 停止"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
