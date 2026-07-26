import db from './database'
import type { Settings } from '../../shared/types'

const KEY_MAP: Record<string, keyof Settings> = {
  summary_prompt: 'summaryPrompt',
  default_lang: 'defaultLang',
  cookie_browser: 'cookieBrowser',
  openai_model: 'openaiModel',
  blocked_channels: 'blockedChannels',
  tts_model: 'ttsModel',
  tts_voice: 'ttsVoice',
  tts_instructions: 'ttsInstructions',
  api_concurrency: 'apiConcurrency',
}

const JSON_KEYS = new Set<keyof Settings>(['blockedChannels'])
const NUMBER_KEYS = new Set<keyof Settings>(['apiConcurrency'])

const REVERSE_MAP: Record<string, string> = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]))

export function getSettings(): Partial<Settings> {
  const rows = db.query('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, any> = {}
  for (const row of rows) {
    const mapped = KEY_MAP[row.key]
    if (mapped) {
      const parsed = JSON_KEYS.has(mapped)
        ? JSON.parse(row.value)
        : NUMBER_KEYS.has(mapped)
          ? (Number.isFinite(Number(row.value)) ? Math.max(1, Math.floor(Number(row.value))) : 1)
          : row.value
      result[mapped] = mapped === 'openaiModel' && parsed === 'claude-3-5-haiku-latest'
        ? 'claude-haiku-4-5'
        : parsed
    }
  }
  return result as Partial<Settings>
}

export function resetSettings() {
  db.query('DELETE FROM settings').run()
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
