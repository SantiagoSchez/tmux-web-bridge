#!/bin/sh
# Development helper: restart the hub in the background (logs in server-dev.log).
cd "$(dirname "$0")"
pkill -f "tsx src/index.ts" 2>/dev/null
sleep 0.5
cd server && TMUX_WEB_CONFIG=../config.yaml nohup npx tsx src/index.ts > ../server-dev.log 2>&1 &
