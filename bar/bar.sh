#!/bin/bash


# SWIFTBAR FOR OSX

SERVER_RUNNING=$(ps aux | grep "[b]un" | grep "server/index.ts")
VITE_RUNNING=$(ps aux | grep "[v]ite" | grep -v "grep")

if [ -z "$SERVER_RUNNING" ]; then
  echo "👾 Off | color=red"
  echo "---"
  echo "▶️ Server starten | shell='/Users/ee/Documents/asi/run_bun.sh' terminal=false refresh=true"
else
  if [ -n "$VITE_RUNNING" ]; then
    echo "👾"
  else
    echo "⚡ Server only | color=orange"
  fi
  echo "---"
  echo "🌐 Browser | shell='open' param1='http://localhost:5173' terminal=false"
  echo "📡 API | shell='open' param1='http://localhost:8788' terminal=false"
  echo "---"
  echo "🛑 Stop | shell='/Users/ee/Documents/asi/stop_bun.sh' terminal=false refresh=true"
fi
