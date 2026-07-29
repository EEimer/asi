#!/bin/zsh
# Stop server + vite -- ausschließlich die Prozesse dieses Projekts.

PROJECT=/Users/ee/Documents/asi

# Primär über die PID-Files: exakt die Prozesse, die run_bun.sh gestartet hat.
for f in /tmp/asi_server.pid /tmp/asi_vite.pid; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
done

# Fallback für Prozesse ohne PID-File (z.B. aus einem älteren Lauf).
# Auf dieses Projekt begrenzt -- ein nacktes `pkill -f vite` würde sonst auch
# Vite-Instanzen anderer Projekte mitreißen.
pkill -f "bun --hot server/index.ts" 2>/dev/null
pkill -f "$PROJECT/node_modules/.bin/vite" 2>/dev/null

rm -f /tmp/asi_server.pid /tmp/asi_vite.pid
rmdir /tmp/asi_start.lock 2>/dev/null

exit 0
