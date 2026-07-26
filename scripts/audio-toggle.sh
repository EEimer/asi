#!/bin/bash
#
# audio-toggle.sh
# Schaltet Audio-Ein- UND -Ausgang zwischen MacBook-intern und Kopfhörer um.
#
# Aufruf:
#   audio-toggle.sh            -> umschalten (Toggle)
#   audio-toggle.sh headphones -> gezielt auf Kopfhörer
#   audio-toggle.sh builtin    -> gezielt auf MacBook intern
#   audio-toggle.sh status     -> nur ausgeben, nichts ändern
#
# Voraussetzung (einmalig):  brew install switchaudio-osx
#
# Wird von bar/bar.sh (SwiftBar) mit aufgerufen.
#

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

SAS="$(command -v SwitchAudioSource)"

notify() {
  # $1 = Titel, $2 = Text
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1
}

if [ -z "$SAS" ]; then
  notify "Audio-Umschalter" "SwitchAudioSource fehlt — installieren mit: brew install switchaudio-osx"
  echo "Fehler: SwitchAudioSource nicht gefunden. Installieren mit: brew install switchaudio-osx" >&2
  exit 1
fi

# --- Geräte anhand von Mustern finden (keine fest verdrahteten Namen) ---------

pick() { grep -i -m1 -E "$1"; }

HP_OUT=$("$SAS" -a -t output | pick 'headphone|kopfhörer')
HP_IN=$("$SAS"  -a -t input  | pick 'external.*(mic|mikro)|headset|kopfhörer')
BI_OUT=$("$SAS" -a -t output | pick 'macbook.*(speaker|lautsprecher)|built-?in.*(output|speaker)')
BI_IN=$("$SAS"  -a -t input  | pick 'macbook.*(micro|mikro)|built-?in.*(micro|mikro)')

CUR_OUT=$("$SAS" -c -t output)
CUR_IN=$("$SAS"  -c -t input)

# --- Zielmodus bestimmen ------------------------------------------------------

MODE="$1"

if [ "$MODE" = "status" ]; then
  echo "Ausgabe: ${CUR_OUT:-?}"
  echo "Eingabe: ${CUR_IN:-?}"
  exit 0
fi

if [ -z "$MODE" ] || [ "$MODE" = "toggle" ]; then
  if echo "$CUR_OUT" | grep -qiE 'headphone|kopfhörer'; then
    MODE="builtin"
  else
    MODE="headphones"
  fi
fi

# --- Umschalten ---------------------------------------------------------------

case "$MODE" in
  headphones)
    if [ -z "$HP_OUT" ]; then
      notify "Audio-Umschalter" "Keine Kopfhörer gefunden — steckt der Klinkenstecker?"
      echo "Keine Kopfhörer gefunden." >&2
      exit 1
    fi
    TARGET_OUT="$HP_OUT"
    TARGET_IN="${HP_IN:-$BI_IN}"
    LABEL="Kopfhörer"
    ;;
  builtin)
    if [ -z "$BI_OUT" ]; then
      notify "Audio-Umschalter" "Interne Lautsprecher nicht gefunden."
      echo "Interne Lautsprecher nicht gefunden." >&2
      exit 1
    fi
    TARGET_OUT="$BI_OUT"
    TARGET_IN="${BI_IN:-$HP_IN}"
    LABEL="MacBook intern"
    ;;
  *)
    echo "Unbekannter Modus: $MODE  (erlaubt: toggle | headphones | builtin | status)" >&2
    exit 2
    ;;
esac

"$SAS" -s "$TARGET_OUT" -t output >/dev/null 2>&1
[ -n "$TARGET_IN" ] && "$SAS" -s "$TARGET_IN" -t input >/dev/null 2>&1

# Systemtöne (Warnsignale) auf dasselbe Ausgabegerät legen — schlägt still fehl,
# falls die installierte Version das nicht unterstützt.
"$SAS" -s "$TARGET_OUT" -t system >/dev/null 2>&1

# --- Rückmeldung --------------------------------------------------------------

NEW_OUT=$("$SAS" -c -t output)
NEW_IN=$("$SAS"  -c -t input)

notify "Audio → $LABEL" "Aus: $NEW_OUT · Ein: $NEW_IN"
echo "Ausgabe: $NEW_OUT"
echo "Eingabe: $NEW_IN"

# Menüleisten-Anzeige sofort aktualisieren
open -g "swiftbar://refreshallplugins" >/dev/null 2>&1

exit 0
