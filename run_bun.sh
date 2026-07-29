#!/bin/zsh
source ~/.zshrc

PROJECT=/Users/ee/Documents/asi
cd "$PROJECT"

SERVER_PORT=8788
VITE_PORT=5173
BUN=/opt/homebrew/bin/bun
VITE="$PROJECT/node_modules/.bin/vite"
LOCK=/tmp/asi_start.lock

port_pids() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null }


# ------------------------------------------------------- Doppelstart-Schutz --
# SwiftBar feuert den Menüpunkt gelegentlich zweimal. Ohne Lock startet dann
# ein zweiter bun-Prozess, scheitert mit EADDRINUSE -- und bleibt wegen --hot
# trotzdem als Zombie stehen (siehe Port-Check unten).

# Stale Lock aus einem hart abgebrochenen Lauf (älter als 1 Minute) entfernen
if [ -d "$LOCK" ] && [ -z "$(find "$LOCK" -maxdepth 0 -mmin -1 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Start läuft bereits -- abgebrochen"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT


# ------------------------------------------------------- Server --------------

if [ -n "$(port_pids $SERVER_PORT)" ]; then
  echo "Server läuft bereits auf $SERVER_PORT -- übersprungen"
else
  # Verwaiste bun-Prozesse ohne Listener aufräumen: `bun --hot` beendet sich
  # bei einem Startup-Crash nicht, sondern wartet auf Dateiänderungen. Der
  # Prozess taucht dann in `ps` auf, obwohl der Port tot ist.
  pkill -f "bun --hot server/index.ts" 2>/dev/null

  nohup "$BUN" --hot server/index.ts > /tmp/asi_server.log 2>&1 &
  echo "$!" > /tmp/asi_server.pid

  # Auf den echten Listener warten, nicht bloß auf den Prozess.
  for i in {1..40}; do
    [ -n "$(port_pids $SERVER_PORT)" ] && break
    sleep 0.25
  done

  if [ -z "$(port_pids $SERVER_PORT)" ]; then
    echo "Server kam nicht hoch -- siehe /tmp/asi_server.log" >&2
    kill "$(cat /tmp/asi_server.pid 2>/dev/null)" 2>/dev/null
    rm -f /tmp/asi_server.pid
    exit 1
  fi

  echo "Server läuft auf $SERVER_PORT"
fi


# ------------------------------------------------------- Vite ----------------

if [ -n "$(port_pids $VITE_PORT)" ]; then
  echo "Vite läuft bereits auf $VITE_PORT -- übersprungen"
else
  # Direkt statt via `npx`: so ist $! die echte Vite-PID und nicht der Wrapper.
  # --strictPort verhindert das stille Ausweichen auf 5174, wodurch früher zwei
  # Vite-Instanzen nebeneinander liefen.
  nohup "$VITE" --port $VITE_PORT --strictPort > /tmp/asi_vite.log 2>&1 &
  echo "$!" > /tmp/asi_vite.pid

  for i in {1..40}; do
    [ -n "$(port_pids $VITE_PORT)" ] && break
    sleep 0.25
  done

  if [ -z "$(port_pids $VITE_PORT)" ]; then
    echo "Vite kam nicht hoch -- siehe /tmp/asi_vite.log" >&2
    exit 1
  fi

  echo "Vite läuft auf $VITE_PORT"
fi

exit 0
