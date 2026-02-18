import db from './database'
import type { Settings } from '../../shared/types'

const KEY_MAP: Record<string, keyof Settings> = {
  summary_prompt: 'summaryPrompt',
  default_lang: 'defaultLang',
  cookie_browser: 'cookieBrowser',
  openai_model: 'openaiModel',
  blocked_channels: 'blockedChannels',
}

const JSON_KEYS = new Set<keyof Settings>(['blockedChannels'])

const REVERSE_MAP: Record<string, string> = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]))

export function getSettings(): Partial<Settings> {
  const rows = db.query('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, any> = {}
  for (const row of rows) {
    const mapped = KEY_MAP[row.key]
    if (mapped) {
      result[mapped] = JSON_KEYS.has(mapped) ? JSON.parse(row.value) : row.value
    }
  }
  return result as Partial<Settings>
}

export function updateSettings(settings: Partial<Settings>) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(settings)) {
    const dbKey = REVERSE_MAP[key]
    if (dbKey && value !== undefined) {
      const serialized = JSON_KEYS.has(key as keyof Settings) ? JSON.stringify(value) : String(value)
      stmt.run(dbKey, serialized)
    }
  }
}
