import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { DEFAULT_SETTINGS } from '../../shared/types'

const DATA_DIR = join(import.meta.dir, '../data')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'asi.db')
const db = new Database(DB_PATH, { create: true })

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS summaries (
    id            TEXT PRIMARY KEY,
    video_id      TEXT NOT NULL,
    video_url     TEXT NOT NULL,
    video_title   TEXT NOT NULL DEFAULT '',
    channel_name  TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    lang          TEXT NOT NULL DEFAULT 'de',
    transcript    TEXT DEFAULT '',
    summary       TEXT DEFAULT '',
    custom_prompt TEXT DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'processing',
    error_message TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    text       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

const existingKeys = db.query('SELECT key FROM settings').all() as { key: string }[]
const existing = new Set(existingKeys.map(r => r.key))
const defaults: Record<string, string> = {
  summary_prompt: DEFAULT_SETTINGS.summaryPrompt,
  default_lang: DEFAULT_SETTINGS.defaultLang,
  cookie_browser: DEFAULT_SETTINGS.cookieBrowser,
  openai_model: DEFAULT_SETTINGS.openaiModel,
}
const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [key, value] of Object.entries(defaults)) {
  if (!existing.has(key)) insert.run(key, value)
}

export default db
