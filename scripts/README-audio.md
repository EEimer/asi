# Audio-Umschalter

Wechselt Audio-Ein- und -Ausgang gemeinsam zwischen MacBook-intern und
Kopfhörer. Hintergrund: Am Monitor ist das MacBook zugeklappt, interne
Lautsprecher und Mikrofon sind dann nicht nutzbar.

Bedienbar über das SwiftBar-Plugin `../bar/bar.sh` (Abschnitt „🎧 Audio")
oder direkt im Terminal.

> **Nicht nach `bar/` verschieben.** Dieser Ordner ist der SwiftBar-Plugin-
> Ordner. SwiftBar führt dort jede ausführbare Datei zyklisch aus — und
> `audio-toggle.sh` ohne Argument *schaltet um*. Das Ergebnis wäre ein
> Dauerwechsel im Sekundentakt.

## Einmalige Voraussetzung

macOS hat keinen eingebauten Befehl zum Wechseln von Audiogeräten:

```
brew install switchaudio-osx
```

Fehlt das Tool, zeigt das Plugin einen entsprechenden Hinweis statt der
Audio-Sektion — es geht nichts kaputt.

## Dateien

| Datei | Zweck |
|---|---|
| `bar.sh` | Das SwiftBar-Plugin (Projekt-Status + Audio-Sektion) |
| `audio-toggle.sh` | Macht das eigentliche Umschalten, auch einzeln nutzbar |

## audio-toggle.sh direkt aufrufen

```
./audio-toggle.sh              # umschalten
./audio-toggle.sh headphones   # gezielt auf Kopfhörer
./audio-toggle.sh builtin      # gezielt auf MacBook intern
./audio-toggle.sh status       # nur anzeigen, nichts ändern
```

Nach dem Umschalten erscheint eine Notification. Beim ersten Mal fragt macOS
nach der Berechtigung für Mitteilungen — einmal erlauben.

## Tastenkombination (optional)

Kurzbefehle-App → neuer Kurzbefehl → Aktion **„Shell-Skript ausführen"** →
Inhalt: `/Users/ee/Documents/asi/scripts/audio-toggle.sh` → rechts in der
Detailleiste eine Tastenkombination zuweisen. Wirkt systemweit.

## Gerätesuche

Es sind keine Gerätenamen fest verdrahtet, gesucht wird per Muster:

- Kopfhörer-Ausgang: enthält `headphone` oder `kopfhörer`
- Kopfhörer-Eingang: enthält `external mic`, `headset` o. ä.
- Intern: enthält `macbook … speaker` bzw. `macbook … micro`

Falls ein Gerät nicht erkannt wird, die tatsächlichen Namen ansehen:

```
SwitchAudioSource -a -t output
SwitchAudioSource -a -t input
```

und die Muster in `audio-toggle.sh` im Abschnitt „Geräte anhand von Mustern
finden" ergänzen.
