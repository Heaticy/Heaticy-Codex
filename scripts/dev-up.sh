#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

readarray -t CONFIGURED_PORTS < <(
  node --input-type=module -e '
    import fs from "node:fs";
    import dotenv from "dotenv";

    const envPath = process.argv[1];
    let parsed = {};
    try {
      parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
    } catch {}

    console.log(parsed.PORT || "");
    console.log(parsed.WEB_PORT || "");
  ' "$ROOT_DIR/.env"
)

SERVER_LOG="/tmp/codex-server-dev.log"
WEB_LOG="/tmp/codex-web-dev.log"
PORT="${PORT:-${CONFIGURED_PORTS[0]:-3211}}"
WEB_PORT="${WEB_PORT:-${CONFIGURED_PORTS[1]:-5206}}"

echo "[dev-up] stopping old dev processes..."
pkill -f "vite --config ./web/vite.config.js" >/dev/null 2>&1 || true
pkill -f "node --watch ./src/server.js" >/dev/null 2>&1 || true
pkill -f "./src/server.js" >/dev/null 2>&1 || true

echo "[dev-up] starting server (watch) on :$PORT ..."
nohup env PORT="$PORT" node --watch ./src/server.js >"$SERVER_LOG" 2>&1 &

echo "[dev-up] starting web (vite hmr) on :$WEB_PORT ..."
nohup env WEB_PORT="$WEB_PORT" npm run web:dev >"$WEB_LOG" 2>&1 &

sleep 2

echo
echo "[dev-up] listening ports:"
lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P || true
lsof -iTCP:"$WEB_PORT" -sTCP:LISTEN -n -P || true

echo
echo "[dev-up] open:"
echo "  http://127.0.0.1:$WEB_PORT/#/sessions"
echo
echo "[dev-up] logs:"
echo "  tail -f $SERVER_LOG $WEB_LOG"
