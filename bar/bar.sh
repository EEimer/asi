#!/bin/bash

# Checken ob Bun mit deinem Server läuft
APP_RUNNING=$(ps aux | grep "[b]un" | grep "server/index.ts")

if [ -z "$APP_RUNNING" ]; then
  echo "👾 Off | color=red"
  echo "---"
  # Wir rufen jetzt direkt dein neues Wrapper-Skript auf
  echo "▶️ Server starten | shell='/Users/ee/Documents/asi/run_bun.sh' terminal=true refresh=true"
else
  echo "🚀 On | color=green"
  echo "---"
  echo "🌐 Browser | shell='open' param1='http://localhost:3000' terminal=false"
  echo "🛑 Stop | shell='/usr/bin/pkill' param1='-f' param2='bun.*index.ts' terminal=false refresh=true"
fi