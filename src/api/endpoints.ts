import type { YouTubeVideo, SummaryListItem, Summary, SummaryDetail, Settings, Note, Prediction, ChatMessage, CustomPrompt, TtsGenerateResponse, TtsIndex, TtsModel, TtsVoice, XSummary } from '../../shared/types'

const BASE = '/api'

/* Server-Fehler kommen als { error: string }. Der Parse liegt bewusst ausserhalb
   des throw-Pfads: steht der throw im try, faengt ihn das eigene catch wieder ein
   und ersetzt die Server-Meldung durch den generischen Fallback. */
async function errorMessage(res: Response, label: string): Promise<string> {
  const fallback = `${label} error: ${res.status}`
  try {
    const json = JSON.parse(await res.text())
    return typeof json?.error === 'string' ? json.error : fallback
  } catch {
    return fallback
  }
}

type RequestInitJson = RequestInit & { json?: unknown }

/* Kein try um den throw herum — sonst verschluckt das catch die Server-Meldung. */
async function send(path: string, init: RequestInitJson, label: string): Promise<Response> {
  const { json, ...rest } = init
  if (json !== undefined) {
    const headers = new Headers(rest.headers)
    headers.set('Content-Type', 'application/json')
    rest.headers = headers
    rest.body = JSON.stringify(json)
  }
  const res = await fetch(`${BASE}${path}`, rest)
  if (!res.ok) throw new Error(await errorMessage(res, label))
  return res
}

async function request<T>(path: string, init: RequestInitJson = {}, label = 'Request'): Promise<T> {
  const res = await send(path, init, label)
  return res.json() as Promise<T>
}

/* Fuer Routen, deren Body niemand liest: res.json() wuerde bei leerer Antwort werfen. */
async function requestVoid(path: string, init: RequestInitJson = {}, label = 'Request'): Promise<void> {
  await send(path, init, label)
}

export const fetchYouTubeFeed = (offset = 0, limit = 30, includeBlocked = false) =>
  request<{ videos: YouTubeVideo[]; total: number; hasMore: boolean }>(`/youtube/feed?offset=${offset}&limit=${limit}&includeBlocked=${includeBlocked ? '1' : '0'}`, {}, 'Feed')

export const refreshYouTubeFeed = () =>
  requestVoid('/youtube/feed/refresh', { method: 'POST' }, 'Refresh')

export const fetchSummaries = () =>
  request<SummaryListItem[]>('/summaries', {}, 'Summaries')

export const fetchSummariesPaged = (offset = 0, limit = 20) =>
  request<{ items: SummaryListItem[]; total: number; hasMore: boolean }>(`/summaries/paged?offset=${offset}&limit=${limit}`, {}, 'Summaries paged')

export const fetchSummary = (id: string) =>
  request<Summary>(`/summaries/${id}`, {}, 'Summary')

export const createSummary = (
  videoUrl: string,
  meta?: { title?: string; channel?: string; thumbnail?: string },
  lang?: string,
  model?: string,
  customPrompt?: string,
  detail?: SummaryDetail,
) =>
  request<{ id: string; status: string }>('/summaries', {
    method: 'POST',
    json: { videoUrl, videoTitle: meta?.title, channelName: meta?.channel, thumbnailUrl: meta?.thumbnail, lang, model, customPrompt, detail },
  }, 'Create')

export const fetchVideoSummaries = (videoId: string) =>
  request<SummaryListItem[]>(`/videos/${videoId}/summaries`, {}, 'Video summaries')

export const retrySummary = (id: string) =>
  request<{ ok: boolean; id: string; status: string }>(`/summaries/${id}/retry`, { method: 'POST' }, 'Retry')

export const updateAuthor = (id: string, author: string) =>
  requestVoid(`/summaries/${id}/author`, { method: 'PUT', json: { author } }, 'Update author')

export const deleteSummary = (id: string) =>
  requestVoid(`/summaries/${id}`, { method: 'DELETE' }, 'Delete')

export const fetchSummaryChat = (id: string) =>
  request<ChatMessage[]>(`/summaries/${id}/chat`, {}, 'Chat')

export const sendSummaryChatMessage = (id: string, question: string, model: string) =>
  request<ChatMessage[]>(`/summaries/${id}/chat`, { method: 'POST', json: { question, model } }, 'Chat')

export const resetSummaryChat = (id: string) =>
  requestVoid(`/summaries/${id}/chat`, { method: 'DELETE' }, 'Chat reset')

export const fetchSettings = () =>
  request<Settings>('/settings', {}, 'Settings')

export const updateSettings = (settings: Partial<Settings>) =>
  requestVoid('/settings', { method: 'PUT', json: settings }, 'Settings update')

export const fetchCustomPrompts = () =>
  request<CustomPrompt[]>('/custom-prompts', {}, 'Custom prompts')

export const createCustomPromptApi = (title: string, text: string) =>
  request<CustomPrompt>('/custom-prompts', { method: 'POST', json: { title, text } }, 'Create custom prompt')

export const updateCustomPromptApi = (id: string, title: string, text: string) =>
  requestVoid(`/custom-prompts/${id}`, { method: 'PUT', json: { title, text } }, 'Update custom prompt')

export const deleteCustomPromptApi = (id: string) =>
  requestVoid(`/custom-prompts/${id}`, { method: 'DELETE' }, 'Delete custom prompt')

export const fetchNotes = () =>
  request<Note[]>('/notes', {}, 'Notes')

export const createNoteApi = (title: string, text: string, isTodo: boolean) =>
  request<Note>('/notes', { method: 'POST', json: { title, text, isTodo } }, 'Create note')

export const updateNoteApi = (id: string, title: string, text: string, isTodo: boolean) =>
  requestVoid(`/notes/${id}`, { method: 'PUT', json: { title, text, isTodo } }, 'Update note')

export const markNoteDoneApi = (id: string) =>
  requestVoid(`/notes/${id}/done`, { method: 'PUT' }, 'Done note')

export const deleteNoteApi = (id: string) =>
  requestVoid(`/notes/${id}`, { method: 'DELETE' }, 'Delete note')

export const addPredictions = (payload: {
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
  predictions: { name: string; direction: string; if_cases: string; price_target: string }[]
}) =>
  request<{ ok: boolean; added: number }>('/predictions', { method: 'POST', json: payload }, 'Add predictions')

export const fetchPredictions = () =>
  request<Prediction[]>('/predictions', {}, 'Predictions')

export const addManualPrediction = (payload: {
  asset: string
  direction: string
  ifCases?: string
  priceTarget?: string
  author?: string
  videoTitle?: string
}) =>
  request<{ ok: boolean; id: string }>('/predictions/manual', { method: 'POST', json: payload }, 'Manual prediction')

export const deletePrediction = (id: string) =>
  requestVoid(`/predictions/${id}`, { method: 'DELETE' }, 'Delete prediction')

export const resetTable = (table: 'summaries' | 'notes' | 'predictions' | 'settings') =>
  requestVoid(`/reset/${table}`, { method: 'DELETE' }, 'Reset')

export const fetchTtsIndex = () =>
  request<TtsIndex>('/tts/index', {}, 'TTS index')

export const generateTts = (payload: {
  summaryId: string
  text: string
  model?: TtsModel
  voice?: TtsVoice
  instructions?: string
  forceRegenerate?: boolean
  sendToTelegram?: boolean
}) =>
  request<TtsGenerateResponse>('/tts/generate', { method: 'POST', json: payload }, 'TTS generate')

export function getTtsAudioUrl(summaryId: string, variantKey: string): string {
  return `${BASE}/tts/${encodeURIComponent(summaryId)}/${encodeURIComponent(variantKey)}`
}

export const fetchXSummaries = () =>
  request<XSummary[]>('/x', {}, 'X summaries')

export const createXSummaryApi = (tweetUrl: string) =>
  request<{ id: string; status: string }>('/x', { method: 'POST', json: { tweetUrl } }, 'Create X summary')

export const retryXSummary = (id: string) =>
  request<{ ok: boolean }>(`/x/${id}/retry`, { method: 'POST' }, 'Retry X summary')

export const deleteXSummaryApi = (id: string) =>
  requestVoid(`/x/${id}`, { method: 'DELETE' }, 'Delete X summary')

export const translateXSummary = async (id: string): Promise<string> => {
  const data = await request<{ translation: string }>(`/x/${id}/translate`, { method: 'POST' }, 'Translate')
  return data.translation
}
