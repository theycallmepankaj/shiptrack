#!/usr/bin/env bash
# Runs ShipTrack on this machine without Docker:  scripts/local.sh start | stop | status
# Uses Node 20 / MongoDB from ~/.local/opt when present (else whatever is on PATH) and the
# Python venv in ai-service/.venv. Ports: app 5174, API 5055, AI 8001, MongoDB 27017.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$HOME/.local/var/shiptrack"
mkdir -p "$STATE/mongo" "$STATE/logs" "$STATE/pids"

for d in "$HOME"/.local/opt/node-v20*/bin "$HOME"/.local/opt/mongodb-*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH

APP_PORT=5174 API_PORT=5055 AI_PORT=8001 MONGO_PORT=27017

running() { [ -f "$STATE/pids/$1" ] && kill -0 "$(cat "$STATE/pids/$1")" 2>/dev/null; }
launch() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  if running "$name"; then echo "  $name already running"; return; fi
  # `&` applies to nohup alone, so $! is the server's own pid (not a wrapper shell).
  (cd "$dir" || exit 1; nohup "$@" >"$STATE/logs/$name.log" 2>&1 & echo $! >"$STATE/pids/$name")
  echo "  started $name (log: $STATE/logs/$name.log)"
}
# Frees a port, but only from a process of this project (cwd inside the repo, or our MongoDB).
free_port() {
  local pid; pid=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1)
  [ -z "$pid" ] && return
  local cwd cmd; cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'); cmd=$(ps -o command= -p "$pid")
  if [[ "$cwd" == "$ROOT"* || "$cmd" == *"$STATE"* ]]; then kill "$pid" && echo "  freed port $1"; fi
}
wait_for() { # url, label
  for _ in $(seq 1 60); do curl -fs -o /dev/null "$1" && { echo "  $2 ready"; return; }; sleep 1; done
  echo "  $2 not responding yet — see $STATE/logs"
}

case "${1:-start}" in
  start)
    launch mongo "$ROOT" mongod --dbpath "$STATE/mongo" --port $MONGO_PORT --bind_ip 127.0.0.1
    sleep 2
    launch ai "$ROOT/ai-service" .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $AI_PORT
    launch api "$ROOT/server" node src/index.js
    launch app "$ROOT/client" "$ROOT/node_modules/.bin/vite" --port $APP_PORT --strictPort
    wait_for "http://localhost:$API_PORT/api/health" API
    wait_for "http://localhost:$AI_PORT/health" "AI service"
    wait_for "http://localhost:$APP_PORT" App
    echo
    echo "  App  http://localhost:$APP_PORT"
    echo "  API  http://localhost:$API_PORT/api/health"
    echo "  AI   http://localhost:$AI_PORT/health"
    ;;
  stop)
    for name in app api ai mongo; do
      if running "$name"; then kill "$(cat "$STATE/pids/$name")" && echo "  stopped $name"; fi
      rm -f "$STATE/pids/$name"
    done
    sleep 1
    for port in $APP_PORT $API_PORT $AI_PORT $MONGO_PORT; do free_port "$port"; done
    ;;
  status)
    for name in mongo ai api app; do printf '  %-6s %s\n' "$name" "$(running "$name" && echo running || echo stopped)"; done
    ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac
