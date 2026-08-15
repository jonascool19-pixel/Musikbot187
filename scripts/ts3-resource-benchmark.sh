#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-3139}
DATA_DIR=${DATA_DIR:-/tmp/radiobot-ts3-benchmark}
mkdir -p "$DATA_DIR"
cleanup(){ [[ -n "${PID:-}" ]] && kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT
DATA_DIR="$DATA_DIR" FRONTEND_DIR="$(pwd)/frontend" PORT="$PORT" HOST=127.0.0.1 TS3_BENCHMARK_ONLY=1 node backend/dist/index.js >/tmp/radiobot-ts3-bench.log 2>&1 & PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/api/setup/status" >/dev/null && break || sleep .25; done
sleep 3
ps -o pid=,pcpu=,rss=,comm= -p "$PID" || true
echo "TS3 architecture benchmark complete"
