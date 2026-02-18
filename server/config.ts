import { DEFAULT_SETTINGS } from '../shared/types'
import { getSettings } from './db/settings'

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''

export function loadSettings() {
  const dbSettings = getSettings()
  return { ...DEFAULT_SETTINGS, ...dbSettings }
}

if (!OPENAI_API_KEY) console.warn('[config] OPENAI_API_KEY not set -- summarization will fail')
