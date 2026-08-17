# Code-Audit ASI

**Stand: 17.08.2026** — Qualitäts-Audit der Codebasis: Duplikate, God Files, toter Code,
fehlende Abstraktionen, Code Smells. Kein Security-Audit; das System läuft nur lokal.

Durchgeführt als Multi-Agent-Audit über fünf Dimensionen. Jeder Fund wurde anschließend von
einem zweiten, gegnerisch instruierten Agent gegen den echten Code geprüft.

**Ergebnis: 74 Funde — 63 vollständig bestätigt, 11 mit Detailkorrekturen, 0 widerlegt.**
Nach Schwere: 18 hoch, 40 mittel, 16 niedrig.

Codebasis zum Zeitpunkt des Audits: ~8.700 Zeilen TypeScript/TSX, React 19 + Vite (`src/`),
Elysia auf Bun (`server/`), geteilte Typen (`shared/`).

> **Status der Umsetzung:** siehe [Anhang: Was wurde behoben](#anhang--was-wurde-behoben) am Ende.

---

## Der eine Befund hinter fast allen anderen

Es fehlt durchgehend die mittlere Ebene zwischen „View" und „API-Aufruf". Es gibt kein
`src/hooks/`, kein `src/lib/`, keine Route-Module auf dem Server. Jede View baut sich deshalb
selbst, was sie braucht: eigene TTS-State-Machine, eigenes Polling, eigene Pagination, eigene
Fehleranzeige. Das erzeugt gleichzeitig die God-Files *und* die Duplikate *und* die
Inkonsistenzen — es sind nicht drei Probleme, sondern eines mit drei Symptomen.

Zahlen dazu: TTS-Logik existiert 3× im Frontend + 1× auf dem Server. Polling ist 5× implementiert
in 4 Varianten. Infinite-Scroll 2×. Fehleranzeige in 4 konkurrierenden Stilen. Das
JSON-Error-Response-Literal auf dem Server 21×. Der fetch-Boilerplate im API-Client 36×.

---

## Teil 1 — Echte Bugs

Diese sechs sind keine Stilfragen, sondern falsches Verhalten.

### 1. Blockierte Kanäle werden durch „Speichern" wieder freigeschaltet
`src/views/SettingsView.tsx:90-117`

`addBlockedChannel`/`removeBlockedChannel` schreiben sofort per PUT zum Server, während alle
anderen Felder der Seite dem Speichern/Abbrechen-Modell gegen `lastSavedSettings` folgen. Die
beiden Modelle zerstören sich gegenseitig: Nach dem Blocken von Kanal B enthält
`lastSavedSettings.blockedChannels` noch die alte Liste — „Abbrechen" setzt die UI zurück,
während der Server B behält; ein anschließendes „Speichern" schreibt die veraltete Liste zurück
und löscht B serverseitig wieder. Fehler beim Schreiben landen nur in `console.error`.

### 2. Die Feed-Fehlermeldung wird verschluckt, die man sehen soll
`src/api/endpoints.ts:15-23` und `:29-37`

In `fetchYouTubeFeed` und `refreshYouTubeFeed` steht `throw new Error(json.error …)` **innerhalb**
des `try`-Blocks. Der eigene Throw wird sofort vom danebenstehenden `catch` gefangen und durch
das generische `Feed error: ${res.status}` ersetzt. Der Server schickt bei `server/index.ts:175-178`
extra die echte yt-dlp/Cookie-Fehlermeldung, und `BrowseView.tsx:482` rendert sie neben dem
Hinweis „Prüfe in den Einstellungen den Cookie-Browser" — ankommen kann dort nur „Feed error: 500".

Das korrekte Muster steht in derselben Datei bei `sendSummaryChatMessage` (113-123).

### 3. yt-dlp kann eine Summary dauerhaft hängen lassen
`server/services/youtube.ts:336-342` und `:380-384`

`fetchVideoMeta` und `downloadSubtitles` starten `Bun.spawn` mit `stderr: 'pipe'`, lesen stderr
aber nie und warten dann auf `proc.exited`. Sobald yt-dlp mehr als den OS-Pipe-Puffer (~64 KB)
nach stderr schreibt — bei `--impersonate`-Warnungen normal — blockiert es beim Schreiben und
beendet sich nie. Kein Timeout. Beide liegen direkt im Verarbeitungspfad (`server/index.ts:68, 76`),
die Summary bleibt also für immer auf `processing`, während die Detail-View sie alle 3 s
weiterpollt. `downloadSubtitles` verschärft das mit bis zu 8 solchen Spawns pro Aufruf.

Dieselbe Datei enthält bei `youtube.ts:91-117` bereits `runYtDlp` — genau für diese Gefahr gebaut,
mit Deadline und einem Kommentar, warum `proc.kill()` allein nicht reicht. Beide Funktionen gehen
daran vorbei. Gleiches Muster in `server/services/xcom.ts:68-74`.

### 4. Ein Poll-Fehler löscht die komplette X-Liste — dauerhaft
`src/views/XView.tsx:41-48`

Das Poll-Intervall macht `setItems(await fetchXSummaries().catch(() => []))`. Jeder
vorübergehende Fehler — Serverneustart, laufender yt-dlp-Call — wird zu `[]` und ersetzt die
ganze Liste. Danach ist es selbstterminierend: mit leerem `items` ist `hasProcessing` false, der
Effekt kehrt früh zurück, Polling startet nie wieder. Die Liste bleibt bis zum manuellen Reload
leer. `SummariesView.tsx:212-221` macht es richtig.

### 5. Manuell angelegte Prognose lässt sich doppelt einfügen
`src/views/SummaryDetailView.tsx:229-258`

`handleAddCustomRow` postet die Prognose und hängt sie an `items`, trägt ihren `rowKey` aber
nicht in `addedRows` ein — anders als `handleAddRow` (216-220). Die Zeile rendert also mit
`isAdded === false` und aktivem „Add"-Button. Nochmal klicken ruft `addPredictions` erneut, und
`server/db/predictions.ts:30-36` fügt ohne Dedupe mit frischer Random-ID ein.

### 6. Zwei Poll-Loops in der Detail-View, der aktive ist nicht abbrechbar
`src/views/SummaryDetailView.tsx:479-493` und `:516-529`

- **Effekt A (479-493)** kettet sich per `setTimeout(load, 3000)` selbst. Der Handle wird nie
  gespeichert, `active = false` unterdrückt also nur das `setState` — der bereits eingeplante
  `load()` feuert nach Unmount/Navigation trotzdem noch einen Request.
- **Effekt B (517-529)** hängt an `[id, summary?.status]`. Da `status` während des Pollens die
  konstante Zeichenkette `'processing'` bleibt, sieht `Object.is` keine Änderung: Effekt B feuert
  **genau einmal** beim Übergang nach `processing` und rearmt nie wieder.

Netto: ein doppelter Request bei ca. t=3 s, danach ein einzelner 3-s-Takt allein aus Effekt A,
und kein Weg, ihn zu stoppen. Es eskaliert *nicht* — die naheliegende Vermutung „verdoppelt sich
mit jedem Render" ist falsch. Der richtige Fix ist deshalb: Effekt B löschen, Effekt A
abbrechbar machen — nicht umgekehrt.

Beide Effekte schlucken zudem jeden Fehler (`catch { /* ignore */ }`); ein fehlgeschlagener Load
rendert kommentarlos „Nicht gefunden".

---

## Teil 2 — Duplikation

### TTS-Logik existiert vier Mal

| Was | Wo |
|---|---|
| `TTS_CLASSIC_VOICES` / `TTS_EXTENDED_VOICES` | SummaryDetailView:23-24, SummariesView:21-22, SettingsView:40-41, server/services/tts.ts:11-12 |
| Voice-für-Modell-Funktion | SummaryDetailView:42-45, SummariesView:34-37, SettingsView:43-46 (dort `availableVoices`) |
| `normalizeInstructions` | SummaryDetailView:47-49, SummariesView:39-41, tts.ts:16-18 |
| `estimateDurationSecondsFromText` | SummaryDetailView:51-55, SummariesView:43-47, tts.ts:76-80 |
| `interface TtsVariantDraft` | SummaryDetailView:26-30, SummariesView:24-28 — feldgleich zum bereits geteilten `TtsVariantConfig` in shared/types.ts:87-91 |
| Modell→Voice-Abgleich | SummaryDetailView:592-599, SummariesView:282-289, SettingsView:119-126 |
| Cache-Variant-Lookup | SummaryDetailView:613-626, SummariesView:300-307, tts.ts:82-97 |
| TTS-Config-Modal (~50 Zeilen JSX) | SummaryDetailView:1131-1180 vs. SummariesView:527-576 |
| generate → Index neu laden → abspielen | SummaryDetailView:628-756, SummariesView:309-379, BrowseView:155-195 |

Bemerkenswert: `shared/types.ts:83-85` definiert die Voice-Unions bereits als *Typen* — die
Laufzeitliste wurde daneben dupliziert statt abgeleitet.

### 36× derselbe fetch-Block

`src/api/endpoints.ts` hat 37 exportierte Funktionen, 36 `if (!res.ok)`-Guards und 12× identisch
`method`/`headers`/`body: JSON.stringify(...)`. Von 322 Zeilen sind rund 200 dieser Boilerplate.
Dazu drei konkurrierende Fehlerstile, von denen einer kaputt ist (siehe Bug 2) — und der
Normalfall verwirft die Server-Meldung ganz: `server/index.ts:342` schickt bei TTS-Fehlern
`{error: message}`, angezeigt wird `TTS generate error: 500`.

### Weitere bestätigte Duplikate

- **21× JSON-Error-Response** in `server/index.ts` (Zeilen 177, 227, 238, 240, 249, 255, 258,
  285, 291, 300, 342, 361, 410, 423, 429, 442, 448, 454, 496, 506, 521) — daneben löst der
  Catch-all bei 525 dieselbe Aufgabe idiomatisch über `set.status`. Dieselbe API antwortet über
  zwei Mechanismen.
- **Fünf Domain-Interfaces doppelt deklariert**: `Prediction`, `Note`, `XSummary` je in
  `server/db/*` *und* `shared/types.ts`; `PredictionRow` in predictions.ts und tableParser.ts;
  `CustomPrompt` in customPrompts.ts und endpoints.ts. Da die Kopien nicht verknüpft sind,
  kompiliert eine neue Spalte auf einer Seite sauber, während die andere still veraltet.
- **Infinite-Scroll komplett doppelt**: Loader, Length-Ref, Sentinel-Ref, IntersectionObserver
  (`rootMargin: '200px'`) und Footer — BrowseView:105-129/242-251 vs.
  SummariesView:166-185/225-234. Erschwert durch zwei Namen für dieselbe Hülle:
  `{items,total,hasMore}` vs. `{videos,hasMore}`.
- **yt-dlp-Pfadsuche wortgleich** in xcom.ts:3-15 und youtube.ts:42-54 (12-Zeilen-IIFE).
- **Ein Input-Class-String 28×** über sieben Views getippt.
- **Datumsgruppierung 2×** mit *zwei verschiedenen* Formaten: SummariesView:124-144 („Heute —
  Montag, 04.08.2025", handgebaute WEEKDAYS-Konstante) vs. GlaskugelView:80-91 („Montag,
  04.08.2025" via `toLocaleDateString`).
- **Thumbnail-URLs an 8 Stellen** von Hand gebaut, in zwei Qualitäten gemischt (`maxresdefault`
  serverseitig, `hqdefault` in den Views).
- **Model-Dropdown mit Legacy-Optgroup 2×**: SettingsView:266-288 und ChatComposer:42-55.
- **Direction→Farbe/Icon 2×**: SummaryDetailView:112-119 vs. GlaskugelView:13-18.
- **`isXUrl` identisch** auf Client (XView:14-16) und Server (xcom.ts:17-19) — die Server-Kopie
  importiert niemand, `POST /api/x` akzeptiert jeden String.
- **Delete-SQL 5× handgeschrieben** über die `server/db/`-Module.

---

## Teil 3 — God Files

| Datei | Umfang | Vermischt |
|---|---|---|
| `src/views/SummaryDetailView.tsx` | 1256 Z., 34 useState | 2 Komponenten in einem File: `PredictionsTable` (134-447, 314 Z., eigenes 11er-State) + Seite (449-1256, 808 Z., 23 useState, 7 useEffect, 8 useMemo) mit ~12 Aufgaben: Markdown-Parsing, Fetch, Polling, Geschwister-Versionen, TTS-Kompatibilität, TTS-Cache/Play/Pause, TTS→Telegram, Autor-Inline-Edit, Transcript-Akkordeon, 3 Modals, Tastaturnavigation |
| `src/views/BrowseView.tsx` | 702 Z., 28 useState | Feed-Paging + Observer, 3-s-Poller, TTS-Job-Queue, Summary-Erzeugung in drei Varianten, Kanal-Blockliste, Video-Karte inline |
| `server/index.ts` | 528 Z., 42 Routen | Bootstrap + SSE-Bus + beide Verarbeitungs-Pipelines + 42 Handler für 10 Ressourcen in *einer* Methodenkette |
| `src/views/SummariesView.tsx` | 589 Z., 14 useState | 125 Z. Markdown-/Datums-Verarbeitung auf Modulebene + Listen-View + komplettes TTS-Subsystem |
| `src/views/SettingsView.tsx` | 489 Z., 13 useState | Settings-Formular + vollständiges CRUD für Custom Prompts (fremde Ressource) + Danger Zone |

Zwei Details, die den Zustand gut illustrieren:

- SummaryDetailView lädt bei Zeile 537 per `fetchSummaries()` die **komplette** Summary-Tabelle —
  einzig um daraus prev/next für die Pfeiltasten zu berechnen.
- Der Poll-Effekt in BrowseView (254-306) holt Summaries, baut drei Maps neu, schreibt vier
  State-Stücke, holt den TTS-Index *und* startet TTS-Jobs — alles in einem `setInterval`, dessen
  Dependency-Array `[videos.length, pendingTtsByVideo, runningTtsByVideo, videos]` das Intervall
  bei jeder dieser Änderungen abreißt und neu aufbaut.

`server/index.ts` hat den Ordnungszwang schon selbst dokumentiert — Zeile 131:
`// Settings (before dynamic :id routes!)`. Elysia-Instanzen komponieren nativ; ein Split nach
`server/routes/*.ts` plus `.use()` brächte index.ts auf ~40 Zeilen Verdrahtung.

Einzige Nicht-Komponenten-Funktion über 80 Zeilen: `getOrGenerateTts`
(`server/services/tts.ts:157-240`, 84 Z.) — baut dasselbe 10-Feld-Response-Literal zweimal,
Unterschied nur `cached: true/false`.

---

## Teil 4 — Toter Code

Jeder Punkt wurde mit expliziten Greps gegengeprüft.

**Läuft ins Leere, obwohl es aussieht als täte es etwas:**

- `AudioPlayerStore.error` (`src/store/audioPlayerStore.ts:16`) wird an vier Stellen geschrieben
  (`onplay`, `onerror`, `playTrack`, `resume`) und **nirgends gelesen**. Wenn `audio.onerror`
  feuert (kaputtes mp3, fehlende Datei), zeigt die UI einen hängenden Play-Button ohne Erklärung.
  → Entweder in NavAudioPlayer rendern oder Feld löschen.
- `forceRegenerate` ist durch drei Schichten verdrahtet (endpoints.ts:274 → index.ts:322/351 →
  tts.ts:163/175), aber kein einziger der vier `generateTts`-Aufrufer setzt es je.
- `ModelOption.provider` ist auf allen 6 Modellen gesetzt, wird nie gelesen — die
  Provider-Auswahl passiert stattdessen per String-Sniffing
  (`model.toLowerCase().startsWith('claude')`, summarizer.ts:151).
- `Summary.customPrompt` wird gespeichert, extra im DETAIL_QUERY selektiert — und nie gerendert.
- `dismissed` in ProcessingConsole:35 — nur der Setter existiert, das Set wird nie gelesen; der
  Aufruf erzwingt bloß einen zusätzlichen Render.
- `feedExhausted` in youtube.ts:127 — zweimal geschrieben (302, 327), nie gelesen.
  `refreshFeedCache(_targetCount)` ignoriert seinen einzigen Parameter, der Aufrufer übergibt `0`.

**Unerreichbare Varianten und ungenutzte Exporte:**

- `Modal`s `size`-Prop wird von keinem der 10 Aufrufer gesetzt → `max-w-6xl` ist toter CSS.
- `Badge`: die gesamte `bgStyle`-Achse wird nie übergeben, dazu die Varianten `sky` und `warning`.
- `Spinner`: `label` und `size` werden nie übergeben; es gibt genau einen Aufrufer
  (Button.tsx:124), also sind 4 von 5 Größen unerreichbar.
- `Button`s `'outline'`-Varianten-Alias — alle Aufrufer nutzen stattdessen das boolesche
  `outline`-Prop.
- Exporte ohne jeden Importeur: `deleteVariant` (tts.ts:260), `getQueueLength` (retry.ts:114),
  `isXUrl` (xcom.ts:17) u. a.
- `themeStore`-Export sowie die `toggle`/`isDark`-API — nie benutzt.
- `modelShortLabel` ist ein reiner Pass-Through auf `modelLabel`, doppelt deklariert.

**Konfiguration und Artefakte:**

- `@shared/*`-Alias in vite.config.ts:8 und tsconfig.json:14 — kein einziger der 24 Imports nutzt
  ihn, alle gehen über relative Pfade.
- Tailwind-Tokens `pink` und `sidebar` sowie die CSS-Variable `--sidebar-sep`: nie referenziert.
- Port 8788 hartkodiert in fünf Dateien (vite.config.ts 2×, server/index.ts:21, run_bun.sh:7,
  bar/bar.sh:38), 5173 in zweien.
- In Git eingecheckt, sollte ignoriert sein: `bun_error.log`, `tsconfig.tsbuildinfo`,
  `scripts/.DS_Store`.

---

## Teil 5 — Inkonsistenzen

- **Fehleranzeige in vier Stilen nebeneinander**: 11× blockierendes `alert()` (8× BrowseView,
  NotesView:58, SettingsView:98 und :169), `addToast(...)` (SummaryDetailView, SettingsView,
  SummaryChat), stilles `console.error`, und viertens View-eigener Error-State. SettingsView
  enthält zwei davon gleichzeitig. BrowseView importiert `useToast` gar nicht erst, trotz sechs
  Fehlerpfaden.
- **`themeStore` ist handgebaut** (Modul-Variable + Listener-`Set` + Mirror-`useState`, ~40 Z.),
  während `audioPlayerStore` und `toastStore` im selben Ordner Zustand `create()` nutzen. Der
  Modul-Level-Seiteneffekt vor dem ersten Paint rechtfertigt das nicht — der ginge auch mit
  Zustand.
- **Ein „Prediction"-Konzept, vier Feldbenennungen**: `ParsedPrediction {name, direction,
  if_cases, price_target}` → `PredictionRow {asset, direction, ifCases, priceTarget}` → POST-Body
  wieder snake_case → gespeichert als `Prediction {assetName, …}`.
- **Drei Row-Mapping-Konventionen in `server/db/`**: vier Module nutzen Spaltenlisten mit
  `replace(created_at,' ','T')||'Z'`, `xSummaries.ts` macht `SELECT *` mit Hand-Mapper und gibt
  `created_at` roh durch — `XSummary.createdAt` ist damit als einziges nicht ISO. Noch latent,
  weil es niemand rendert.
- **Einstellungen und TTS-Index werden pro View gecacht** statt in einem Store: `fetchSettings()`
  an 7 Stellen in 4 Views, `fetchTtsIndex()` in 3 Views plus BrowseViews Poller. Ein in der
  Detail-View erzeugtes TTS lässt BrowseViews Kopie bis zum nächsten Poll veralten.
- **`src/components/ui/` ist keine saubere Grenze**: Modal, ConfirmModal und SegmentedControl sind
  genauso generisch wie Button/Badge/Spinner, liegen aber eine Ebene höher neben echt
  app-spezifischen Komponenten. SegmentedControl importiert sogar `./ui/controlSizes`.
- **`SettingsView` greift per `document.getElementById` in den DOM** (Zeile 386) — die einzige
  DOM-Abfrage in eine gerenderte Komponente im ganzen Frontend.
- **`insertManualPrediction`** (predictions.ts:38-48): sechs gleichtypige Positionsparameter in
  einer Reihenfolge, die weder zur Spalten- noch zur Aufrufer-Reihenfolge passt; `author` wird
  doppelt gebunden (auch als `channel_name`, daher steht in der Glaskugel zweimal derselbe Name);
  und es schaltet `PRAGMA foreign_keys` auf der geteilten Verbindung global aus und wieder an.
- **Ungeschütztes `JSON.parse`** in settings.ts:28-32 — die einzige Stelle ohne Guard. Eine
  kaputte Zeile in `blocked_channels` reißt jeden Request mit, inkl. Serverstart (index.ts:27).
- **Alle Views abonnieren den ganzen Audio-Store** ohne Selektor, während `ontimeupdate` ~4×/s
  `set({currentTime})` aufruft → BrowseView (30+ Karten), SummariesView und SummaryDetailView
  rendern während jeder Wiedergabe viermal pro Sekunde neu.
- **Destruktive Handler ohne Fehlerpfad**: Delete/Done-Handler in fünf Views mutieren nach dem
  `await` lokalen State ohne `try/catch` — schlägt der Request fehl, schließt das Confirm-Modal
  und nichts passiert.
- **Fehlende/Index-basierte React-Keys**: GlaskugelView:127 gibt aus `grouped.map` ein
  Kurz-Fragment zurück, das keinen Key tragen kann; ProcessingConsole:113 keyt per Array-Index,
  während Einträge aus der Mitte entfernt werden.
- **`SummariesView`-Poller reißt sich selbst ab**: Der Effekt hängt an `[summaries]` und sein
  eigener Callback ruft `setSummaries(data.items)` mit frisch alloziertem Array — jeder Tick
  startet das Intervall neu, es läuft nie eine zweite Periode zu Ende.
- **`/api/x/:id/translate` hat als einzige Route kein try/catch** — die bewusst
  benutzerfreundliche deutsche Meldung aus xcom.ts:119 („Tweet könnte privat oder gelöscht sein")
  erreicht die UI nie, dort steht `Translate error: 500`.
- **Temp-Verzeichnis für Untertitel** (youtube.ts:372-398): `mkdirSync` ohne `finally`; wirft
  `readdirSync`/`readFileSync`/`Bun.spawn`, bleibt das Verzeichnis in /tmp liegen. Name ist
  `Date.now()` + Sprache, ohne weitere Entropie.

---

## Anhang — Was wurde behoben

Umgesetzt wurden Stufe 1 (die sechs Bugs) und Stufe 2 (die fehlende gemeinsame Ebene).
Teil 3 (Dateien aufteilen) und Teil 4 (toter Code) sind bewusst offen geblieben.

### Stufe 1 — Bugs

| # | Datei | Was jetzt anders ist |
|---|---|---|
| 1 | `src/views/SettingsView.tsx` | Blocklisten-Schreibvorgänge ziehen `lastSavedSettings` mit, Abbrechen/Speichern können den Server nicht mehr überschreiben. Fehler gehen als Toast raus statt in `console.error`. |
| 2 | `src/api/endpoints.ts` | Der `throw` steht außerhalb des `try` — die Server-Meldung erreicht die UI. Gilt jetzt für **alle** Endpunkte, nicht nur den Feed (siehe Stufe 2). |
| 3 | `server/services/youtube.ts`, `xcom.ts` | Alle yt-dlp-Aufrufe laufen über `runYtDlp` mit Deadline und geleerten Pipes. Kein blockierender stderr-Puffer mehr, kein Aufruf ohne Timeout. |
| 4 | `src/views/XView.tsx` | Poll-Fehler behält die letzte Liste; Dependency ist der `hasProcessing`-Boolean statt `items`. |
| 5 | `src/views/SummaryDetailView.tsx` | `handleAddCustomRow` trägt den `rowKey` in `addedRows` ein — kein doppeltes Einfügen mehr. |
| 6 | `src/views/SummaryDetailView.tsx` | Zweiter Poll-Effekt gelöscht, der verbleibende hält den Timer-Handle und räumt im Cleanup auf. |

Mitgenommen, weil dieselbe Stelle ohnehin angefasst wurde: das Untertitel-Temp-Verzeichnis
bekommt `finally { rmSync }` und `crypto.randomUUID()` statt `Date.now()`, und der
SummariesView-Poller hängt nicht mehr an `summaries` (er riss sich bei jedem Tick selbst ab).

### Stufe 2 — Gemeinsame Ebene

**Neue Dateien**

| Datei | Ersetzt |
|---|---|
| `shared/tts.ts` | Vier Kopien von Voice-Listen, `ttsVoiceOptions`, `normalizeInstructions`, `estimateDurationSeconds`, Modell→Voice-Abgleich und Variantenvergleich. Von Client **und** Server importiert. |
| `src/hooks/useTtsPlayback.ts` | Die dreifach geschriebene Orchestrierung „Cache prüfen → erzeugen → Index neu laden → abspielen" samt Loading-/Fehler-Maps. |
| `src/components/TtsConfigModal.tsx` | Zwei fast wortgleiche 50-Zeilen-Modals. |
| `server/services/ytdlp.ts` | Die doppelte yt-dlp-Binary-Suche und die nur einseitig vorhandene Deadline-Logik. |
| `src/hooks/useInfiniteScroll.ts` | Den identischen IntersectionObserver-Effekt aus zwei Views. |
| `src/lib/constants.ts` | `POLL_INTERVAL_MS` (lag als nackte `3000` in vier Views) und `appendUnique`. |

**Umbauten**

- `src/api/endpoints.ts`: **322 → 188 Zeilen.** Ein `request<T>()`/`requestVoid()`-Paar ersetzt
  36 handgeschriebene fetch-Blöcke. Alle Fehler-Labels sind erhalten, aber jeder Endpunkt
  surfacet jetzt die Server-Meldung, bevor er auf `Label error: Status` zurückfällt.
- `server/index.ts`: alle 21 JSON-Error-Literale laufen über ein `jsonError(set, message, status)`
  im Stil des bereits vorhandenen Catch-alls. Routenreihenfolge unverändert (sie ist load-bearing).
- Fünf doppelt deklarierte Interfaces (`Prediction`, `Note`, `XSummary`, `PredictionRow`,
  `CustomPrompt`) liegen jetzt nur noch in `shared/types.ts`.
- Nebeneffekt des Hooks: die Views abonnieren den Audio-Store über gezielte Selektoren statt
  komplett — das Re-Render-Gewitter mit ~4 Renders/Sekunde während der Wiedergabe ist weg.

Die neue gemeinsame Ebene umfasst 433 Zeilen und ersetzt deutlich mehr als das Doppelte an
kopiertem Code. Die God-Files sind dadurch geschrumpft, ohne aufgeteilt worden zu sein:
`SummaryDetailView.tsx` 1256 → 1073, `SummariesView.tsx` 589 → 404, `BrowseView.tsx` 747 → 718.
(In diesen Zahlen steckt auch die parallel laufende UI-Komponenten-Umstellung im Working Tree,
sie sind also nicht ausschließlich diesem Umbau zuzurechnen.) `server/index.ts` wächst um
3 Zeilen — der `jsonError`-Helfer kostet mehr, als 21 Ein-Zeilen-Ersetzungen einsparen, macht
die Datei aber gleichförmig.

### Beim Umbau neu aufgefallen

**`server/` wird überhaupt nicht typgeprüft.** `tsconfig.json` hat
`"include": ["src", "shared"]` und keine Project References — `bun run build` (`tsc -b && vite build`)
prüft den gesamten Backend-Code nie. Ein separater Lauf über `server/index.ts` fördert genau
einen bestehenden Fehler zutage: im `PUT /api/settings`-Handler typisiert das TypeBox-Schema
`ttsModel`/`ttsVoice` als `t.String()`, während `Settings` die Unions `TtsModel`/`TtsVoice`
erwartet. Das ist Ursache und Symptom zugleich — der Fehler steht seit jeher da, weil ihn nie
jemand sehen konnte. Das gehört als Nächstes gefixt, vor Stufe 3.
