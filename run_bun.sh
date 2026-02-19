#!/bin/zsh
source ~/.zshrc
cd /Users/ee/Documents/asi

# Start server + vite fully backgrounded (detached from SwiftBar)
nohup /opt/homebrew/bin/bun --hot server/index.ts > /tmp/asi_server.log 2>&1 &
echo "$!" > /tmp/asi_server.pid

sleep 1

nohup npx vite > /tmp/asi_vite.log 2>&1 &
echo "$!" > /tmp/asi_vite.pid

# Exit immediately so SwiftBar can refresh
exit 0
