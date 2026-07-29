#!/bin/bash


# SWIFTBAR FOR OSX

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# WICHTIG: audio-toggle.sh darf NICHT in diesem Ordner liegen — SwiftBar würde
# es sonst als eigenes Plugin ausführen und dabei laufend umschalten.
AUDIO_TOGGLE="/Users/ee/Documents/asi/scripts/audio-toggle.sh"

SAS="$(command -v SwitchAudioSource)"


# ------------------------------------------------------- Audio-Status --------

AUDIO_ICON=""
AUDIO_LABEL=""

if [ -n "$SAS" ]; then
  AUDIO_OUT=$("$SAS" -c -t output)
  AUDIO_IN=$("$SAS" -c -t input)

  if echo "$AUDIO_OUT" | grep -qiE 'headphone|kopfhörer'; then
    AUDIO_ICON="🎧"; AUDIO_LABEL="Kopfhörer"
  elif echo "$AUDIO_OUT" | grep -qiE 'usb audio|usb.*dac|\bdac\b|usb.*(speaker|lautsprecher)'; then
    AUDIO_ICON="🔊"; AUDIO_LABEL="Lautsprecher"
  elif echo "$AUDIO_OUT" | grep -qiE 'macbook|built-?in'; then
    AUDIO_ICON="💻"; AUDIO_LABEL="MacBook intern"
  else
    AUDIO_ICON="🎚"; AUDIO_LABEL="$AUDIO_OUT"
  fi
fi


# ------------------------------------------------------- Projekt-Status ------

SERVER_PORT=8788
VITE_PORT=5173

# Am Port prüfen, nicht am Prozess: `bun --hot` bleibt nach einem
# Startup-Crash (z.B. EADDRINUSE) als Zombie stehen, ohne zu lauschen.
# Eine ps-Prüfung meldet in dem Fall fälschlich "läuft".
SERVER_RUNNING=$(lsof -nP -iTCP:$SERVER_PORT -sTCP:LISTEN -t 2>/dev/null)
VITE_RUNNING=$(lsof -nP -iTCP:$VITE_PORT -sTCP:LISTEN -t 2>/dev/null)

# Prozess da, aber kein Listener -> genau so ein Zombie.
SERVER_ZOMBIE=""
if [ -z "$SERVER_RUNNING" ] && pgrep -f "bun --hot server/index.ts" >/dev/null 2>&1; then
  SERVER_ZOMBIE="1"
fi


# ------------------------------------------------------- Titelzeile ----------

if [ -z "$SERVER_RUNNING" ]; then
  echo "👾 $AUDIO_ICON | color=red"
elif [ -n "$VITE_RUNNING" ]; then
  echo "👾 $AUDIO_ICON"
else
  echo "⚡ $AUDIO_ICON | color=orange"
fi


# ------------------------------------------------------- Menü: Projekt -------

echo "---"

if [ -z "$SERVER_RUNNING" ]; then
  if [ -n "$SERVER_ZOMBIE" ]; then
    echo "💀 bun-Prozess ohne Listener auf $SERVER_PORT | color=#cc4444 size=12"
    echo "-- Erst stoppen, dann neu starten | size=12 color=#888888"
    echo "🛑 Stop | shell='/Users/ee/Documents/asi/stop_bun.sh' terminal=false refresh=true"
  fi
  echo "▶️ Server starten | shell='/Users/ee/Documents/asi/run_bun.sh' terminal=false refresh=true"
else
  [ -z "$VITE_RUNNING" ] && echo "⚡ Server läuft, Vite nicht | color=orange size=12"
  echo "🌐 Browser | shell='open' param1='http://localhost:$VITE_PORT' terminal=false"
  echo "📡 API | shell='open' param1='http://localhost:$SERVER_PORT' terminal=false"
  echo "---"
  echo "🛑 Stop | shell='/Users/ee/Documents/asi/stop_bun.sh' terminal=false refresh=true"
fi


# ------------------------------------------------------- Menü: Audio ---------

echo "---"

if [ -z "$SAS" ]; then
  echo "🎧 Audio nicht verfügbar | color=#cc4444"
  echo "-- SwitchAudioSource fehlt | size=12"
  echo "-- brew install switchaudio-osx | size=12 color=#888888"
else
  echo "$AUDIO_ICON Audio: $AUDIO_LABEL"
  echo "-- Ausgabe: $AUDIO_OUT | size=12 color=#888888"
  echo "-- Eingabe: $AUDIO_IN | size=12 color=#888888"
  echo "-----"
  echo "-- 🔊 Lautsprecher (USB) | shell='$AUDIO_TOGGLE' param1='speakers' terminal=false refresh=true"
  echo "-- 🎧 Kopfhörer | shell='$AUDIO_TOGGLE' param1='headphones' terminal=false refresh=true"
  echo "-- 💻 MacBook intern | shell='$AUDIO_TOGGLE' param1='builtin' terminal=false refresh=true"

  echo "🔀 Ausgabe ändern (⌃⇧⌘A) | shell='$AUDIO_TOGGLE' terminal=false refresh=true key=ctrl+shift+cmd+a"
fi
