import type { YouTubeVideo, SummaryListItem, Summary, Settings, Note, Prediction, ChatMessage, TtsGenerateResponse, TtsIndex, TtsModel, TtsVoice, XSummary } from '../../shared/types'

export interface CustomPrompt {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

const BASE = '/api'

export async function fetchYouTubeFeed(offset = 0, limit = 30, includeBlocked = false): Promise<{ videos: YouTubeVideo[]; total: number; hasMore: boolean }> {
  const res = await fetch(`${BASE}/youtube/feed?offset=${offset}&limit=${limit}&includeBlocked=${includeBlocked ? '1' : '0'}`)
  if (!res.ok) {
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.error ?? `Feed error: ${res.status}`)
    } catch {
      throw new Error(`Feed error: ${res.status}`)
    }
  }
  return res.json()
}

export async function refreshYouTubeFeed(): Promise<void> {
  const res = await fetch(`${BASE}/youtube/feed/refresh`, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.error ?? `Refresh error: ${res.status}`)
    } catch {
      throw new Error(`Refresh error: ${res.status}`)
    }
  }
}

export async function fetchSummaries(): Promise<SummaryListItem[]> {
  const res = await fetch(`${BASE}/summaries`)
  if (!res.ok) throw new Error(`Summaries error: ${res.status}`)
  return res.json()
}

export async function fetchSummariesPaged(offset = 0, limit = 20): Promise<{ items: SummaryListItem[]; total: number; hasMore: boolean }> {
  const res = await fetch(`${BASE}/summaries/paged?offset=${offset}&limit=${limit}`)
  if (!res.ok) throw new Error(`Summaries paged error: ${res.status}`)
  return res.json()
}

export async function fetchSummary(id: string): Promise<Summary> {
  const res = await fetch(`${BASE}/summaries/${id}`)
  if (!res.ok) throw new Error(`Summary error: ${res.status}`)
  return res.json()
}

export async function createSummary(
  videoUrl: string,
  meta?: { title?: string; channel?: string; thumbnail?: string },
  lang?: string,
  model?: string,
  customPrompt?: string,
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${BASE}/summaries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, videoTitle: meta?.title, channelName: meta?.channel, thumbnailUrl: meta?.thumbnail, lang, model, customPrompt }),
  })
  if (!res.ok) throw new Error(`Create error: ${res.status}`)
  return res.json()
}

export async function fetchVideoSummaries(videoId: string): Promise<SummaryListItem[]> {
  const res = await fetch(`${BASE}/videos/${videoId}/summaries`)
  if (!res.ok) throw new Error(`Video summaries error: ${res.status}`)
  return res.json()
}

export async function retrySummary(id: string): Promise<{ ok: boolean; id: string; status: string }> {
  const res = await fetch(`${BASE}/summaries/${id}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error(`Retry error: ${res.status}`)
  return res.json()
}

export async function updateAuthor(id: string, author: string): Promise<void> {
  const res = await fetch(`${BASE}/summaries/${id}/author`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author }),
  })
  if (!res.ok) throw new Error(`Update author error: ${res.status}`)
}

export async function deleteSummary(id: string): Promise<void> {
  const res = await fetch(`${BASE}/summaries/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete error: ${res.status}`)
}

export async function fetchSummaryChat(id: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/summaries/${id}/chat`)
  if (!res.ok) throw new Error(`Chat error: ${res.status}`)
  return res.json()
}

export async function sendSummaryChatMessage(id: string, question: string, model: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/summaries/${id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, model }),
  })
  if (!res.ok) {
    // Provider-Fehler (Rate Limit, Context zu lang) steckt im Body — ohne ihn
    // stünde im UI nur eine nackte Statuszahl.
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.error ?? `Chat error: ${res.status}`)
    } catch (e: any) {
      throw new Error(e?.message ?? `Chat error: ${res.status}`)
    }
  }
  return res.json()
}

export async function resetSummaryChat(id: string): Promise<void> {
  const res = await fetch(`${BASE}/summaries/${id}/chat`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Chat reset error: ${res.status}`)
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`)
  if (!res.ok) throw new Error(`Settings error: ${res.status}`)
  return res.json()
}

export async function updateSettings(settings: Partial<Settings>): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`Settings update error: ${res.status}`)
}

export async function fetchCustomPrompts(): Promise<CustomPrompt[]> {
  const res = await fetch(`${BASE}/custom-prompts`)
  if (!res.ok) throw new Error(`Custom prompts error: ${res.status}`)
  return res.json()
}

export async function createCustomPromptApi(title: string, text: string): Promise<CustomPrompt> {
  const res = await fetch(`${BASE}/custom-prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text }),
  })
  if (!res.ok) throw new Error(`Create custom prompt error: ${res.status}`)
  return res.json()
}

export async function updateCustomPromptApi(id: string, title: string, text: string): Promise<void> {
  const res = await fetch(`${BASE}/custom-prompts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text }),
  })
  if (!res.ok) throw new Error(`Update custom prompt error: ${res.status}`)
}

export async function deleteCustomPromptApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/custom-prompts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete custom prompt error: ${res.status}`)
}

export async function fetchNotes(): Promise<Note[]> {
  const res = await fetch(`${BASE}/notes`)
  if (!res.ok) throw new Error(`Notes error: ${res.status}`)
  return res.json()
}

export async function createNoteApi(title: string, text: string, isTodo: boolean): Promise<Note> {
  const res = await fetch(`${BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text, isTodo }),
  })
  if (!res.ok) throw new Error(`Create note error: ${res.status}`)
  return res.json()
}

export async function updateNoteApi(id: string, title: string, text: string, isTodo: boolean): Promise<void> {
  const res = await fetch(`${BASE}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text, isTodo }),
  })
  if (!res.ok) throw new Error(`Update note error: ${res.status}`)
}

export async function markNoteDoneApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/notes/${id}/done`, { method: 'PUT' })
  if (!res.ok) throw new Error(`Done note error: ${res.status}`)
}

export async function deleteNoteApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/notes/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete note error: ${res.status}`)
}

export async function addPredictions(payload: {
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
  predictions: { name: string; direction: string; if_cases: string; price_target: string }[]
}): Promise<{ ok: boolean; added: number }> {
  const res = await fetch(`${BASE}/predictions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Add predictions error: ${res.status}`)
  return res.json()
}

export async function fetchPredictions(): Promise<Prediction[]> {
  const res = await fetch(`${BASE}/predictions`)
  if (!res.ok) throw new Error(`Predictions error: ${res.status}`)
  return res.json()
}

export async function addManualPrediction(payload: {
  asset: string
  direction: string
  ifCases?: string
  priceTarget?: string
  author?: string
  videoTitle?: string
}): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${BASE}/predictions/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Manual prediction error: ${res.status}`)
  return res.json()
}

export async function deletePrediction(id: string): Promise<void> {
  const res = await fetch(`${BASE}/predictions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete prediction error: ${res.status}`)
}

export async function resetTable(table: 'summaries' | 'notes' | 'predictions' | 'settings'): Promise<void> {
  const res = await fetch(`${BASE}/reset/${table}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Reset error: ${res.status}`)
}

export async function fetchTtsIndex(): Promise<TtsIndex> {
  const res = await fetch(`${BASE}/tts/index`)
  if (!res.ok) throw new Error(`TTS index error: ${res.status}`)
  return res.json()
}

export async function generateTts(payload: {
  summaryId: string
  text: string
  model?: TtsModel
  voice?: TtsVoice
  instructions?: string
  forceRegenerate?: boolean
  sendToTelegram?: boolean
}): Promise<TtsGenerateResponse> {
  const res = await fetch(`${BASE}/tts/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`TTS generate error: ${res.status}`)
  return res.json()
}

export function getTtsAudioUrl(summaryId: string, variantKey: string): string {
  return `${BASE}/tts/${encodeURIComponent(summaryId)}/${encodeURIComponent(variantKey)}`
}

export async function fetchXSummaries(): Promise<XSummary[]> {
  const res = await fetch(`${BASE}/x`)
  if (!res.ok) throw new Error(`X summaries error: ${res.status}`)
  return res.json()
}

export async function createXSummaryApi(tweetUrl: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${BASE}/x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tweetUrl }),
  })
  if (!res.ok) throw new Error(`Create X summary error: ${res.status}`)
  return res.json()
}

export async function retryXSummary(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/x/${id}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error(`Retry X summary error: ${res.status}`)
  return res.json()
}

export async function deleteXSummaryApi(id: string): Promise<void> {
  const res = await fetch(`${BASE}/x/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete X summary error: ${res.status}`)
}

export async function translateXSummary(id: string): Promise<string> {
  const res = await fetch(`${BASE}/x/${id}/translate`, { method: 'POST' })
  if (!res.ok) throw new Error(`Translate error: ${res.status}`)
  const data = await res.json() as { translation: string }
  return data.translation
}
