export interface YouTubeVideo {
  id: string
  title: string
  channel: string
  channelUrl: string
  thumbnail: string
  duration: number
  durationFormatted: string
  uploadDate: string
  publishedAt?: number
  url: string
  alreadySummarized?: boolean
  summaryId?: string | null
}

export type SummaryStatus = 'processing' | 'done' | 'error'

export interface Summary {
  id: string
  videoId: string
  videoUrl: string
  videoTitle: string
  channelName: string
  author: string
  model: string
  thumbnailUrl: string
  lang: string
  transcript: string
  summary: string
  customPrompt: string
  status: SummaryStatus
  errorMessage: string
  createdAt: string
}

export interface SummaryListItem extends Omit<Summary, 'transcript' | 'customPrompt'> {}

export interface CreateSummaryRequest {
  videoUrl: string
  videoTitle?: string
  channelName?: string
  thumbnailUrl?: string
  lang?: string
  model?: string
}

export interface Note {
  id: string
  title: string
  text: string
  isTodo: boolean
  isDone: boolean
  createdAt: string
  updatedAt: string
}

export interface Prediction {
  id: string
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
  assetName: string
  direction: string
  ifCases: string
  priceTarget: string
  createdAt: string
}

export type TtsModel = 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts'

export type TtsVoiceClassic = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer'
export type TtsVoiceExtended = 'ballad' | 'verse' | 'marin' | 'cedar'
export type TtsVoice = TtsVoiceClassic | TtsVoiceExtended

export interface TtsVariantConfig {
  model: TtsModel
  voice: TtsVoice
  instructions: string
}

export interface TtsVariantIndexEntry extends TtsVariantConfig {
  filePath: string
  createdAt: string
  sizeBytes: number
  durationSeconds?: number
}

export interface TtsSummaryIndexEntry {
  lastUsedVariantKey?: string
  variants: Record<string, TtsVariantIndexEntry>
}

export type TtsIndex = Record<string, TtsSummaryIndexEntry>

export interface TtsGenerateResponse {
  cached: boolean
  audioUrl: string
  summaryId: string
  variantKey: string
  model: TtsModel
  voice: TtsVoice
  instructions: string
  createdAt: string
  durationSeconds?: number
}

export type ProcessingStep =
  | 'queued'
  | 'metadata'
  | 'transcript'
  | 'summarizing'
  | 'done'
  | 'error'
  | 'tts_generating'
  | 'tts_cached'
  | 'tts_done'
  | 'tts_error'

export interface ProcessingEvent {
  summaryId: string
  videoTitle: string
  step: ProcessingStep
  message: string
  timestamp: string
}

export interface Settings {
  summaryPrompt: string
  defaultLang: string
  cookieBrowser: string
  openaiModel: string
  blockedChannels: string[]
  ttsModel: TtsModel
  ttsVoice: TtsVoice
  ttsInstructions: string
}

export interface XSummary {
  id: string
  tweetId: string
  tweetUrl: string
  author: string
  tweetText: string
  summary: string
  status: 'processing' | 'done' | 'error'
  errorMessage: string
  createdAt: string
}

export const DEFAULT_SETTINGS: Settings = {
  summaryPrompt: `Du bist ein Experte für Zusammenfassungen von YouTube-Videos.

## Metadaten (immer zuerst ausgeben)
- **Hauptsprecher / Interviewpartner:** [Name der Person, die die inhaltlichen Aussagen trifft – NICHT der Kanalinhaber, falls es ein Interview ist. Falls unklar, weglassen.]

---

## TLDR
[2–4 prägnante Sätze. Die wichtigste Aussage zuerst.]

---

## Kernaussagen
- [Bullet Points, nur inhaltlich relevante Punkte]
- Werbung, Sponsoring und Off-Topic werden ignoriert

---

## Assets & Prognosen
Falls im Video konkrete Assets, Prognosen oder Kursziele genannt werden, gib diese als JSON zurück:

\`\`\`json
[
  {
    "name": "Bitcoin",
    "direction": "long",
    "if_cases": "Falls Fed Zinsen senkt",
    "price_target": "$120.000"
  }
]
\`\`\`

Relevante Assets: S&P 500, MSCI World, Bitcoin, Ethereum, Solana, Tesla, Amazon, Gold, Silber – sowie alle anderen explizit genannten.
Wenn keine Prognosen genannt werden: Abschnitt weglassen.

---

## Sprache & Regeln
- Antworte immer auf Deutsch
- So kurz wie möglich, so ausführlich wie nötig
- Keine Einleitung außer den Metadaten

Transkript:
`,
  defaultLang: 'de',
  cookieBrowser: 'brave',
  openaiModel: 'gpt-4o',
  blockedChannels: [],
  ttsModel: 'tts-1-hd',
  ttsVoice: 'nova',
  ttsInstructions: '',
}
