#!/bin/bash
#
# audio-toggle.sh
# Schaltet Audio-Ein- und -Ausgang zwischen drei Zielen um.
#
# Ziele:
#   builtin     MacBook-Lautsprecher + MacBook-Mikrofon
#   headphones  Kopfhörer am Klinkenanschluss + dessen Mikrofon
#   speakers    USB Audio DAC (Schreibtisch-Lautsprecher), Eingang bleibt
#
# Aufruf:
#   audio-toggle.sh             -> weiterschalten (builtin -> headphones -> speakers -> ...)
#   audio-toggle.sh builtin
#   audio-toggle.sh headphones
#   audio-toggle.sh speakers
#   audio-toggle.sh status      -> nur ausgeben, nichts ändern
#
# Tastenkombinationen (je eine Schnellaktion pro Ziel, kein Weiterschalten):
#   ⌃⇧⌘Q  headphones
#   ⌃⇧⌘A  builtin
#   ⌃⇧⌘Z  speakers
# Gebaut und installiert von rebuild-quickaction.sh — nach jeder Änderung hier
# unbedingt `./rebuild-quickaction.sh --install` ausführen.
#
# Voraussetzung (einmalig):  brew install switchaudio-osx
#
# NICHT nach bar/ verschieben — das ist der SwiftBar-Plugin-Ordner, dort würde
# das Skript zyklisch ausgeführt und dauernd umschalten.
#

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

SAS="$(command -v SwitchAudioSource)"

notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1
}

if [ -z "$SAS" ]; then
  notify "Audio-Umschalter" "SwitchAudioSource fehlt — installieren mit: brew install switchaudio-osx"
  echo "Fehler: SwitchAudioSource nicht gefunden. Installieren mit: brew install switchaudio-osx" >&2
  exit 1
fi

# --- Geräte anhand von Mustern finden (keine fest verdrahteten Namen) ---------

pick() { grep -i -m1 -E "$1"; }

OUTPUTS=$("$SAS" -a -t output)
INPUTS=$("$SAS"  -a -t input)

BI_OUT=$(echo "$OUTPUTS" | pick 'macbook.*(speaker|lautsprecher)|built-?in.*(output|speaker)')
BI_IN=$(echo  "$INPUTS"  | pick 'macbook.*(micro|mikro)|built-?in.*(micro|mikro)')

HP_OUT=$(echo "$OUTPUTS" | pick 'headphone|kopfhörer')
HP_IN=$(echo  "$INPUTS"  | pick 'external.*(mic|mikro)|headset|kopfhörer')

SP_OUT=$(echo "$OUTPUTS" | pick 'usb audio|usb.*dac|\bdac\b|usb.*(speaker|lautsprecher)')

CUR_OUT=$("$SAS" -c -t output)
CUR_IN=$("$SAS"  -c -t input)

# --- Modus des aktuellen Ausgabegeräts bestimmen ------------------------------

current_mode() {
  [ -n "$SP_OUT" ] && [ "$CUR_OUT" = "$SP_OUT" ] && { echo "speakers"; return; }
  [ -n "$HP_OUT" ] && [ "$CUR_OUT" = "$HP_OUT" ] && { echo "headphones"; return; }
  [ -n "$BI_OUT" ] && [ "$CUR_OUT" = "$BI_OUT" ] && { echo "builtin"; return; }
  echo "unknown"
}

# --- Zielmodus bestimmen ------------------------------------------------------

MODE="$1"

if [ "$MODE" = "status" ]; then
  echo "Modus:   $(current_mode)"
  echo "Ausgabe: ${CUR_OUT:-?}"
  echo "Eingabe: ${CUR_IN:-?}"
  echo
  echo "Verfügbar:"
  [ -n "$BI_OUT" ] && echo "  builtin     $BI_OUT"
  [ -n "$HP_OUT" ] && echo "  headphones  $HP_OUT"
  [ -n "$SP_OUT" ] && echo "  speakers    $SP_OUT"
  exit 0
fi

if [ -z "$MODE" ] || [ "$MODE" = "toggle" ]; then
  # Nur tatsächlich vorhandene Ziele in fester Reihenfolge durchlaufen
  CYCLE=()
  [ -n "$BI_OUT" ] && CYCLE+=("builtin")
  [ -n "$HP_OUT" ] && CYCLE+=("headphones")
  [ -n "$SP_OUT" ] && CYCLE+=("speakers")

  if [ ${#CYCLE[@]} -eq 0 ]; then
    notify "Audio-Umschalter" "Kein bekanntes Ausgabegerät gefunden."
    exit 1
  fi

  CUR_MODE=$(current_mode)
  MODE="${CYCLE[0]}"
  for i in "${!CYCLE[@]}"; do
    if [ "${CYCLE[$i]}" = "$CUR_MODE" ]; then
      MODE="${CYCLE[$(( (i + 1) % ${#CYCLE[@]} ))]}"
      break
    fi
  done
fi

# --- Umschalten ---------------------------------------------------------------

case "$MODE" in
  headphones)
    [ -z "$HP_OUT" ] && { notify "Audio-Umschalter" "Keine Kopfhörer gefunden — steckt der Klinkenstecker?"; exit 1; }
    TARGET_OUT="$HP_OUT"
    TARGET_IN="${HP_IN:-$BI_IN}"
    LABEL="Kopfhörer"
    ;;
  builtin)
    [ -z "$BI_OUT" ] && { notify "Audio-Umschalter" "Interne Lautsprecher nicht gefunden."; exit 1; }
    TARGET_OUT="$BI_OUT"
    TARGET_IN="$BI_IN"
    LABEL="MacBook intern"
    ;;
  speakers)
    [ -z "$SP_OUT" ] && { notify "Audio-Umschalter" "USB-Lautsprecher nicht gefunden — eingeschaltet und verbunden?"; exit 1; }
    TARGET_OUT="$SP_OUT"
    TARGET_IN=""   # Eingang bewusst unverändert lassen
    LABEL="Lautsprecher"
    ;;
  *)
    echo "Unbekannter Modus: $MODE" >&2
    echo "Erlaubt: toggle | builtin | headphones | speakers | status" >&2
    exit 2
    ;;
esac

"$SAS" -s "$TARGET_OUT" -t output >/dev/null 2>&1
[ -n "$TARGET_IN" ] && "$SAS" -s "$TARGET_IN" -t input >/dev/null 2>&1

# Systemtöne auf dasselbe Ausgabegerät; schlägt still fehl, falls nicht unterstützt
"$SAS" -s "$TARGET_OUT" -t system >/dev/null 2>&1

# --- Rückmeldung --------------------------------------------------------------

NEW_OUT=$("$SAS" -c -t output)
NEW_IN=$("$SAS"  -c -t input)

notify "Audio → $LABEL" "Aus: $NEW_OUT · Ein: $NEW_IN"
echo "Ausgabe: $NEW_OUT"
echo "Eingabe: $NEW_IN"

open -g "swiftbar://refreshallplugins" >/dev/null 2>&1

exit 0
