# Audio-Umschalter

Wechselt Audio-Ein- und -Ausgang gemeinsam zwischen drei Zielen. Hintergrund:
Am Monitor ist das MacBook zugeklappt, interne Lautsprecher und Mikrofon sind
dann nicht nutzbar.

Bedienbar per Tastenkombination **⌃⇧⌘A**, über das SwiftBar-Plugin
`../bar/bar.sh` (Eintrag „Ausgabe ändern (⌃⇧⌘A)") oder direkt im Terminal.

> **Nicht nach `bar/` verschieben.** Dieser Ordner ist der SwiftBar-Plugin-
> Ordner. SwiftBar führt dort jede ausführbare Datei zyklisch aus — und
> `audio-toggle.sh` ohne Argument *schaltet um*. Das Ergebnis wäre ein
> Dauerwechsel im Sekundentakt.

## Voraussetzung

macOS hat keinen eingebauten Befehl zum Wechseln von Audiogeräten:

```
brew install switchaudio-osx
```

## Dateien

| Datei | Zweck |
|---|---|
| `audio-toggle.sh` | Das eigentliche Skript — einzige Quelle der Wahrheit |
| `rebuild-quickaction.sh` | Baut die Schnellaktion neu und bettet das Skript ein |
| `Audio umschalten.workflow` | Die Schnellaktion für die Tastenkombination |
| `../bar/bar.sh` | SwiftBar-Plugin, ruft `audio-toggle.sh` per Pfad auf |

## Drei Ziele

| Modus | Ausgabe | Eingabe |
|---|---|---|
| `builtin` | MacBook Pro Speakers | MacBook-Mikrofon |
| `headphones` | External Headphones | Mikrofon der Kopfhörer |
| `speakers` | USB Audio DAC | bleibt unverändert |

Ohne Argument wird weitergeschaltet: builtin → headphones → speakers → builtin.
Nicht angeschlossene Geräte werden übersprungen.

## Direkt aufrufen

```
./audio-toggle.sh              # weiterschalten
./audio-toggle.sh speakers     # gezielt auf USB-Lautsprecher
./audio-toggle.sh headphones   # gezielt auf Kopfhörer
./audio-toggle.sh builtin      # gezielt auf MacBook intern
./audio-toggle.sh status       # anzeigen was aktiv und was verfügbar ist
```

## Wichtig: Skript geändert? Schnellaktion neu bauen

Die Schnellaktion enthält eine **eingebettete Kopie** von `audio-toggle.sh`,
keinen Verweis darauf. Grund: macOS verweigert Automator-Diensten den Zugriff
auf `~/Documents` — ein Dienst, der das Skript per Pfad aufruft, scheitert mit
*„Operation not permitted"*.

Nach jeder Änderung an `audio-toggle.sh` also:

```
./rebuild-quickaction.sh --install
```

Das baut die Schnellaktion neu, kopiert sie nach `~/Library/Services` und
meldet den Dienst beim System an. Die Tastenkombination bleibt erhalten.

Das SwiftBar-Plugin ruft `audio-toggle.sh` normal per Pfad auf und braucht
keinen Rebuild — SwiftBar hat den Ordnerzugriff.

## Tastenkombination ⌃⇧⌘A

Ist eingerichtet. Falls sie neu zugewiesen werden muss:

Systemeinstellungen → Tastatur → **Keyboard Shortcuts…** → **Services** →
Kategorie **General** → „Audio umschalten" → Häkchen setzen, doppelt auf die
rechte Spalte klicken und die Kombination drücken.

## Gerätesuche

Es sind keine Gerätenamen fest verdrahtet, gesucht wird per Muster:

- Kopfhörer: enthält `headphone` oder `kopfhörer`
- USB-Lautsprecher: enthält `usb audio`, `dac` o. ä.
- Intern: enthält `macbook` bzw. `built-in`

Falls ein Gerät nicht erkannt wird, die tatsächlichen Namen ansehen:

```
SwitchAudioSource -a -t output
SwitchAudioSource -a -t input
```

und die Muster in `audio-toggle.sh` im Abschnitt „Geräte anhand von Mustern
finden" ergänzen. Danach nicht den Rebuild vergessen.
