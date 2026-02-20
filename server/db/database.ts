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

db.exec(`
  CREATE TABLE IF NOT EXISTS predictions (
    id           TEXT PRIMARY KEY,
    summary_id   TEXT NOT NULL,
    video_title  TEXT NOT NULL DEFAULT '',
    video_url    TEXT NOT NULL DEFAULT '',
    channel_name TEXT NOT NULL DEFAULT '',
    author       TEXT NOT NULL DEFAULT '',
    asset_name   TEXT NOT NULL DEFAULT '',
    direction    TEXT NOT NULL DEFAULT '',
    if_cases     TEXT NOT NULL DEFAULT '',
    price_target TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (summary_id) REFERENCES summaries(id) ON DELETE CASCADE
  )
`)

// Migrations for existing databases
try { db.exec('ALTER TABLE summaries ADD COLUMN author TEXT NOT NULL DEFAULT ""') } catch {}
try { db.exec('ALTER TABLE predictions ADD COLUMN author TEXT NOT NULL DEFAULT ""') } catch {}
try { db.exec('ALTER TABLE predictions ADD COLUMN if_cases TEXT NOT NULL DEFAULT ""') } catch {}
try { db.exec('ALTER TABLE predictions ADD COLUMN price_target TEXT NOT NULL DEFAULT ""') } catch {}

// Migrate old prompt to new format
const OLD_PROMPT_PREFIX = 'Du bist ein Experte für Zusammenfassungen. Fasse das folgende YouTube-Transkript'
const currentPrompt = db.query('SELECT value FROM settings WHERE key = ?').get('summary_prompt') as { value: string } | null
if (currentPrompt?.value?.startsWith(OLD_PROMPT_PREFIX)) {
  db.query('UPDATE settings SET value = ? WHERE key = ?').run(DEFAULT_SETTINGS.summaryPrompt, 'summary_prompt')
}

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
