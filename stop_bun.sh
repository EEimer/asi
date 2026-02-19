#!/bin/zsh
# Stop server + vite
pkill -f "bun.*server/index.ts" 2>/dev/null
pkill -f "vite" 2>/dev/null
rm -f /tmp/asi_server.pid /tmp/asi_vite.pid
