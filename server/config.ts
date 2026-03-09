import { DEFAULT_SETTINGS } from '../shared/types'
import { getSettings } from './db/settings'

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

export function loadSettings() {
  const dbSettings = getSettings()
  return { ...DEFAULT_SETTINGS, ...dbSettings }
}

if (!OPENAI_API_KEY) console.warn('[config] OPENAI_API_KEY not set -- summarization will fail')
if (!ANTHROPIC_API_KEY) console.warn('[config] ANTHROPIC_API_KEY not set -- Claude models will fail')
if (!TELEGRAM_BOT_TOKEN) console.warn('[config] TELEGRAM_BOT_TOKEN not set -- Telegram TTS send will fail')
