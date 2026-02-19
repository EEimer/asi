# ASI – AI Summary Interface

Lokales Tool zum Zusammenfassen von YouTube-Videos via OpenAI. Läuft komplett auf deinem Mac und nutzt Browser-Cookies für YouTube-Zugriff.

## Features

- **Browse** – YouTube Abo-Feed durchsuchen, Videos per Klick zusammenfassen
- **Zusammenfassungen** – Alle Summaries mit Markdown/HTML-Rendering, gruppiert nach Datum
- **Glaskugel** – Automatisch extrahierte Asset-Prognosen aus allen Zusammenfassungen
- **Notizen** – Einfache Notiz-Verwaltung mit Titel + Text
- **Settings** – Prompt, Sprache, OpenAI-Modell, Cookie-Browser, Kanal-Blocklist
- **Processing Console** – Live-Fortschritt via Server-Sent Events
- **SwiftBar** – Menubar-Integration zum Starten/Stoppen

## Voraussetzungen

| Tool | Version | Installation |
|------|---------|-------------|
| **Bun** | ≥ 1.0 | `curl -fsSL https://bun.sh/install \| bash` |
| **yt-dlp** | aktuell | `brew install yt-dlp` |
| **OpenAI API Key** | – | https://platform.openai.com/api-keys |

Optional:
- **SwiftBar** – für Menubar-Widget (`brew install --cask swiftbar`)

## Installation

```bash
# Repo klonen / in den Ordner wechseln
cd ~/Documents/asi

# Dependencies installieren
bun install

# .env anlegen
echo 'OPENAI_API_KEY=sk-...' > .env
```

## Starten

```bash
bun run dev
```

Startet beides gleichzeitig:
- **Elysia Server** auf `http://localhost:8788` (API + yt-dlp)
- **Vite Dev Server** auf `http://localhost:5173` (React UI)

Browser öffnen: http://localhost:5173

## Projektstruktur

```
asi/
├── server/                 # Backend (Elysia auf Bun)
│   ├── index.ts            # API-Routen + SSE
│   ├── config.ts           # Settings + API Key
│   ├── db/
│   │   ├── database.ts     # SQLite Setup + Migrations
│   │   ├── summaries.ts    # Summaries CRUD
│   │   ├── predictions.ts  # Prognosen CRUD
│   │   ├── notes.ts        # Notizen CRUD
│   │   └── settings.ts     # Settings Key-Value Store
│   └── services/
│       ├── youtube.ts      # yt-dlp Integration
│       ├── summarizer.ts   # OpenAI API
│       └── tableParser.ts  # Prognosen-Extraktion aus Tabellen
├── src/                    # Frontend (React + Vite)
│   ├── App.tsx             # Navigation + Routing
│   ├── api/endpoints.ts    # API Client
│   ├── views/              # Seiten
│   │   ├── BrowseView.tsx
│   │   ├── SummariesView.tsx
│   │   ├── SummaryDetailView.tsx
│   │   ├── GlaskugelView.tsx
│   │   ├── NotesView.tsx
│   │   └── SettingsView.tsx
│   ├── components/         # UI Komponenten
│   │   ├── Modal.tsx
│   │   ├── ConfirmModal.tsx
│   │   ├── ProcessingConsole.tsx
│   │   └── ToastStack.tsx
│   └── store/toastStore.ts # Zustand Store
├── shared/types.ts         # Geteilte TypeScript Interfaces
├── bar/bar.sh              # SwiftBar Plugin
├── run_bun.sh              # Start-Script
├── stop_bun.sh             # Stop-Script
└── .env                    # OPENAI_API_KEY
```

## Tech Stack

- **Runtime**: Bun
- **Backend**: Elysia.js + SQLite (`bun:sqlite`)
- **Frontend**: React 19 + Vite + Tailwind CSS
- **State**: Zustand
- **AI**: OpenAI API (GPT-4o)
- **YouTube**: yt-dlp (nutzt lokale Browser-Cookies)
