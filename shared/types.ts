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
  /** Max. gleichzeitige OpenAI/Anthropic-Requests. Niedriger = weniger 429er. */
  apiConcurrency: number
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

export type ChatRole = 'user' | 'assistant'

/** Eine gespeicherte Nachricht im Nachfrage-Chat zu einer Zusammenfassung. */
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  /** Modell, das diese Antwort erzeugt hat. Leer bei User-Nachrichten. */
  model?: string
  createdAt: string
}

export type ModelProvider = 'openai' | 'anthropic'
/** Auswahl-Stufe: bewusst kuratiert statt vollständiger Modell-Katalog. */
export type ModelTier = 'gut' | 'mittel' | 'beste'

export interface ModelOption {
  value: string
  /** Vollständiges Label im Settings-Dropdown. */
  label: string
  /** Kurzform für das Badge in der Übersicht. */
  short: string
  provider: ModelProvider
  tier: ModelTier
  hint: string
}

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  gut: 'Gut — schnell & günstig',
  mittel: 'Mittel — ausgewogen',
  beste: 'Beste — höchste Qualität',
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', short: '5.4 Mini', provider: 'openai', tier: 'gut', hint: 'Schnellste und günstigste Option' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5', short: 'Sonnet 5', provider: 'anthropic', tier: 'gut', hint: 'Schnell, nahe an Opus-Qualität' },
  { value: 'gpt-5.5', label: 'GPT-5.5', short: 'GPT-5.5', provider: 'openai', tier: 'mittel', hint: 'Guter Kompromiss aus Tempo und Tiefe' },
  { value: 'claude-opus-5', label: 'Claude Opus 5', short: 'Opus 5', provider: 'anthropic', tier: 'mittel', hint: 'Stark bei langen Transkripten' },
  // gpt-5.5-pro & Co. laufen nur über die Responses-API, nicht über
  // /v1/chat/completions — daher hier die neueste Chat-fähige Generation.
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', short: '5.6 Terra', provider: 'openai', tier: 'beste', hint: 'Neueste OpenAI-Generation (Varianten: luna/sol/terra)' },
  { value: 'claude-fable-5', label: 'Claude Fable 5', short: 'Fable 5', provider: 'anthropic', tier: 'beste', hint: 'Anthropics stärkstes Modell, teuerste Option' },
]

/**
 * Anzeigenamen für Modelle, die nicht mehr zur Auswahl stehen. Alte
 * Zusammenfassungen speichern ihre Modell-ID mit — ohne diese Tabelle stünde
 * dort die nackte ID im Badge.
 */
export const LEGACY_MODEL_LABELS: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': '4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4.1': 'GPT-4.1',
  'gpt-5': 'GPT-5',
  'gpt-5.1': 'GPT-5.1',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.4': 'GPT-5.4',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-8': 'Opus 4.8',
  'claude-opus-4-1': 'Opus 4.1',
  'claude-3-5-haiku-latest': 'Haiku 3.5',
}

export function modelLabel(model: string): string {
  return MODEL_OPTIONS.find(m => m.value === model)?.short ?? LEGACY_MODEL_LABELS[model] ?? model
}

export const DEFAULT_SETTINGS: Settings = {
  summaryPrompt: `Du bist ein Experte für Zusammenfassungen von YouTube-Videos.

## Metadaten (immer zuerst ausgeben)
- **Hauptsprecher / Interviewpartner:** [Name der Person, die die inhaltlichen Aussagen trifft – NICHT der Kanalinhaber, falls es ein Interview ist. Falls unklar, weglassen.]

---

## Kernaussagen
- [Bullet Points, nur inhaltlich relevante Punkte]
- Die wichtigste Aussage zuerst
- Werbung, Sponsoring und Off-Topic werden ignoriert

---

## Erwähnenswertes
- [Was am Rande auffällt und hängen bleibt: überraschende Zahlen, Anekdoten, genannte Quellen, Buch- oder Tool-Empfehlungen, pointierte Meinungen, Widersprüche zu vorher Gesagtem]
- Lieber zwei starke Punkte als sechs belanglose
- Wenn nichts Erwähnenswertes vorkommt: Abschnitt weglassen

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
  openaiModel: 'gpt-5.5',
  blockedChannels: [],
  ttsModel: 'tts-1-hd',
  ttsVoice: 'nova',
  ttsInstructions: '',
  apiConcurrency: 1,
}
