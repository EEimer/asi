#!/bin/bash


# SWIFTBAR FOR OSX

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# WICHTIG: audio-toggle.sh darf NICHT in diesem Ordner liegen — SwiftBar würde
# es sonst als eigenes Plugin ausführen und dabei laufend umschalten.
AUDIO_TOGGLE="/Users/ee/Documents/asi/scripts/audio-toggle.sh"

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


# ---------------------------------------------------------------- AUDIO ------
# Schaltet Ein- und Ausgang gemeinsam zwischen MacBook-intern und Kopfhörer.
# Voraussetzung: brew install switchaudio-osx

SAS="$(command -v SwitchAudioSource)"

echo "---"

if [ -z "$SAS" ]; then
  echo "🎧 Audio nicht verfügbar | color=#cc4444"
  echo "-- SwitchAudioSource fehlt | size=12"
  echo "-- brew install switchaudio-osx | size=12 color=#888888"
else
  AUDIO_OUT=$("$SAS" -c -t output)
  AUDIO_IN=$("$SAS" -c -t input)

  if echo "$AUDIO_OUT" | grep -qiE 'headphone|kopfhörer'; then
    AUDIO_LABEL="Kopfhörer"
  else
    AUDIO_LABEL="MacBook intern"
  fi

  echo "🎧 Audio: $AUDIO_LABEL"
  echo "-- Ausgabe: $AUDIO_OUT | size=12 color=#888888"
  echo "-- Eingabe: $AUDIO_IN | size=12 color=#888888"
  echo "-----"
  echo "-- → Kopfhörer | shell='$AUDIO_TOGGLE' param1='headphones' terminal=false refresh=true"
  echo "-- → MacBook intern | shell='$AUDIO_TOGGLE' param1='builtin' terminal=false refresh=true"

  echo "🔀 Audio umschalten | shell='$AUDIO_TOGGLE' terminal=false refresh=true"
fi
