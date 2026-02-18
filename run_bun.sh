#!/bin/zsh
# Alle Umgebungsvariablen laden
source ~/.zshrc
cd /Users/ee/Documents/asi
# Bun explizit im Projekt-Kontext starten
/opt/homebrew/bin/bun run server/index.ts
