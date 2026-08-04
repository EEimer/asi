# Audio-Umschalter

Wechselt Audio-Ein- und -Ausgang gemeinsam zwischen drei Zielen. Hintergrund:
Am Monitor ist das MacBook zugeklappt, interne Lautsprecher und Mikrofon sind
dann nicht nutzbar.

Jedes Ziel hat eine eigene Tastenkombination — es wird **nicht** weiter-
geschaltet, dieselbe Taste führt immer zum selben Gerät:

| Taste | Ziel |
|---|---|
| **⌃⇧⌘Q** | 🎧 Kopfhörer |
| **⌃⇧⌘A** | 💻 MacBook intern |
| **⌃⇧⌘Z** | 🔊 Lautsprecher (USB) |

Alternativ über das SwiftBar-Plugin `../bar/bar.sh` oder direkt im Terminal.

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
| `rebuild-quickaction.sh` | Baut die drei Schnellaktionen, bettet das Skript ein, setzt die Tasten |
| `Audio Kopfhörer.workflow` | Schnellaktion für ⌃⇧⌘Q |
| `Audio MacBook.workflow` | Schnellaktion für ⌃⇧⌘A |
| `Audio Lautsprecher.workflow` | Schnellaktion für ⌃⇧⌘Z |
| `../bar/bar.sh` | SwiftBar-Plugin, ruft `audio-toggle.sh` per Pfad auf |

## Drei Ziele

| Modus | Ausgabe | Eingabe |
|---|---|---|
| `builtin` | MacBook Pro Speakers | MacBook-Mikrofon |
| `headphones` | External Headphones | Mikrofon der Kopfhörer |
| `speakers` | USB Audio DAC | bleibt unverändert |

Die Tastenkombis wählen jeweils genau einen dieser Modi. Ohne Argument im
Terminal (oder über den Menüeintrag „Weiterschalten") wird zyklisch
weitergeschaltet: builtin → headphones → speakers → builtin. Nicht
angeschlossene Geräte werden dabei übersprungen.

## Direkt aufrufen

```
./audio-toggle.sh              # weiterschalten
./audio-toggle.sh speakers     # gezielt auf USB-Lautsprecher
./audio-toggle.sh headphones   # gezielt auf Kopfhörer
./audio-toggle.sh builtin      # gezielt auf MacBook intern
./audio-toggle.sh status       # anzeigen was aktiv und was verfügbar ist
```

## Wichtig: Skript geändert? Schnellaktionen neu bauen

Jede Schnellaktion enthält eine **eingebettete Kopie** von `audio-toggle.sh`,
keinen Verweis darauf. Grund: macOS verweigert Automator-Diensten den Zugriff
auf `~/Documents` — ein Dienst, der das Skript per Pfad aufruft, scheitert mit
*„Operation not permitted"*. Der Modus wird beim Bauen als `set -- <modus>`
vorangestellt, deshalb schaltet keine der drei Aktionen weiter.

Nach jeder Änderung an `audio-toggle.sh` also:

```
./rebuild-quickaction.sh --install
```

Das baut alle drei Schnellaktionen neu, kopiert sie nach `~/Library/Services`,
setzt die Tastenkombinationen und meldet die Dienste beim System an.

Das SwiftBar-Plugin ruft `audio-toggle.sh` normal per Pfad auf und braucht
keinen Rebuild — SwiftBar hat den Ordnerzugriff.

## Tastenkombinationen

`rebuild-quickaction.sh --install` setzt sie selbst, über die Domain `pbs`
(`NSServicesStatus`, Modifier-Kürzel: `@` cmd, `^` ctrl, `$` shift, `~` option).
Prüfen lässt sich das mit:

```
defaults read pbs NSServicesStatus
```

Greift eine Kombi in einer schon offenen App nicht, diese App einmal neu
starten — Services-Shortcuts werden beim App-Start eingelesen.

Andere Tasten gewünscht? In `rebuild-quickaction.sh` das Array `MODES` anpassen
und `--install` erneut laufen lassen. Von Hand geht es auch: Systemeinstellungen
→ Tastatur → **Keyboard Shortcuts…** → **Services** → Kategorie **General** →
„Audio Kopfhörer" / „Audio MacBook" / „Audio Lautsprecher".

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
