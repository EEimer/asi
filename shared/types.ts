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

/**
 * Detailgrad: `short` = nur die Kernaussagen, `medium` = der Normalfall,
 * `long` = die volle Struktur. `medium` kam später dazu, deshalb steht in
 * Altbeständen der Datenbank weiterhin `short` oder `long`.
 */
export type SummaryDetail = 'short' | 'medium' | 'long'

export const SUMMARY_DETAIL_VALUES: SummaryDetail[] = ['short', 'medium', 'long']

export const SUMMARY_DETAIL_LABELS: Record<SummaryDetail, string> = {
  short: 'Kurz',
  medium: 'Mittel',
  long: 'Lang',
}

/** Einzeiler unter der Auswahl – sagt, was der Detailgrad konkret liefert. */
export const SUMMARY_DETAIL_HINTS: Record<SummaryDetail, string> = {
  short: 'Nur die 2-3 Kernaussagen',
  medium: 'Max. 6 Punkte, ein knapper Satz je Punkt',
  long: 'Ausführlich mit allen Details',
}

/**
 * Ein Custom Prompt ersetzt den Standard-Prompt komplett – der Detailgrad kann
 * dort also nicht über die Prompt-Auswahl wirken. Stattdessen hängt der Server
 * diese Zeile an den Custom Prompt an.
 */
export const SUMMARY_DETAIL_LENGTH_HINTS: Record<SummaryDetail, string> = {
  short: 'Länge: sehr knapp. Nur die 2-3 wichtigsten Aussagen, ein Satz pro Punkt, keine Details.',
  medium: 'Länge: knapp. Maximal 6 Punkte, ein Satz je Punkt, höchstens 20 Wörter. Telegrammstil, keine Zuschreibungen ("laut Sprecher"), kein Konjunktiv.',
  long: 'Länge: ausführlich. Alle relevanten Details, Beispiele und Nebenstränge.',
}

/** Aus der Datenbank oder vom Client kommender Wert – Unbekanntes fällt auf `long` zurück. */
export function normalizeDetail(value: unknown): SummaryDetail {
  return value === 'short' || value === 'medium' ? value : 'long'
}

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
  detail: SummaryDetail
  transcript: string
  summary: string
  customPrompt: string
  status: SummaryStatus
  errorMessage: string
  createdAt: string
}

/** Listeneintrag: alles ausser den beiden grossen Textfeldern. */
export type SummaryListItem = Omit<Summary, 'transcript' | 'customPrompt'>

export interface CreateSummaryRequest {
  videoUrl: string
  videoTitle?: string
  channelName?: string
  thumbnailUrl?: string
  lang?: string
  model?: string
  detail?: SummaryDetail
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
  /** Nur im Katalog (/predictions/all) gesetzt: false = aus der Zusammenfassung
      abgeleitet, aber noch nicht in die Glaskugel übernommen. */
  saved?: boolean
}

/** Aus dem Zusammenfassungs-Text geparste Prognose — Rohform vor dem Insert. */
export interface PredictionRow {
  asset: string
  direction: string
  ifCases: string
  priceTarget: string
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
  /** Prompt für die Kurzversion — nur die 2-3 Kernaussagen. */
  shortSummaryPrompt: string
  /** Prompt für die Mittelversion — der Normalfall zwischen Kurz und Lang. */
  mediumSummaryPrompt: string
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

/** Gespeicherte Prompt-Vorlage für einmalige Zusammenfassungen. */
export interface CustomPrompt {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

/** Woechentliche Kopie der Wealth-Datenbank in den Documents-Ordner (server/services/wealthBackup.ts). */
export interface WealthBackupStatus {
  configured: boolean
  directory: string
  lastRunAt: string | null
  lastFilename: string | null
  fileCount: number
  totalBytes: number
  due: boolean
}

export interface WealthBackupResult {
  ran: boolean
  filename?: string
  bytes?: number
  removed?: string[]
  skippedReason?: 'not-due' | 'not-configured' | 'in-progress'
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
  { value: 'gpt-6-luna', label: 'GPT-6 Luna', short: '6 Luna', provider: 'openai', tier: 'gut', hint: 'Schnellste und günstigste Option' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', provider: 'anthropic', tier: 'gut', hint: 'Schnell, nahe an Opus-Qualität' },
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', short: '6.1 Sol', provider: 'openai', tier: 'mittel', hint: 'Guter Kompromiss aus Tempo und Tiefe' },
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', short: 'Opus 5.5', provider: 'anthropic', tier: 'mittel', hint: 'Stark bei langen Transkripten, günstiger als Opus 5' },
  // Die GPT-6-Modelle laufen über /v1/chat/completions nur ohne Tool-Calling —
  // reicht hier, die App schickt keine Tools mit.
  { value: 'gpt-6-astra', label: 'GPT-6 Astra', short: '6 Astra', provider: 'openai', tier: 'beste', hint: 'OpenAIs stärkstes Modell, teuerste Option' },
  { value: 'claude-fable-5-1', label: 'Claude Fable 5.1', short: 'Fable 5.1', provider: 'anthropic', tier: 'beste', hint: 'Anthropics stärkstes Modell, teuerste Option' },
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
  'gpt-5.4-mini': '5.4 Mini',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-6-sol': '6 Sol',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-opus-4-8': 'Opus 4.8',
  'claude-opus-5': 'Opus 5',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-fable-5': 'Fable 5',
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
  mediumSummaryPrompt: `Du bist ein Experte für dichte Zusammenfassungen von YouTube-Videos.
Schreibe im Telegrammstil. Der Leser will die Information, nicht den Text.

## Metadaten (immer zuerst ausgeben)
- **Hauptsprecher / Interviewpartner:** [Name der Person, die die inhaltlichen Aussagen trifft – NICHT der Kanalinhaber, falls es ein Interview ist. Falls unklar, weglassen.]

---

## Kernaussagen
- Maximal 6 Punkte, die wichtigste Aussage zuerst
- EIN Satz pro Punkt, höchstens 20 Wörter. Kein zweiter Satz, kein Nachsatz, kein Semikolon als Notausgang.
- Aufbau: Thema, Doppelpunkt, Aussage. Zahlen und Marken gehören rein, Herleitungen nicht.
- Keine Zuschreibungen: kein "laut Sprecher", "aus seiner Sicht", "er empfiehlt". Dass es die Aussage des Videos ist, weiß der Leser.
- Kein Konjunktiv, keine Abschwächungen ("sei relevant", "könnte möglicherweise")
- Im Zweifel den Punkt streichen statt ihn zu kürzen
- Werbung, Sponsoring und Off-Topic werden ignoriert

So nicht – zwei Sätze, Zuschreibung, Konjunktiv:
- Bitcoin steht an einem Entscheidungspunkt: Ein Rücksetzer in die Zone von 69.000 bis 72.500 US-Dollar wäre laut Analyse eine attraktive Dip-Buying-Region, sofern dort Spot-Käufe und Handelsvolumen wieder sichtbar anziehen. Besonders 72.400, 69.000 sowie die 200-Tage-EMAs bei rund 72.000 und 69.200 US-Dollar seien relevante Marken.

So ja:
- Bitcoin-Kaufzone: 69.000–72.500 USD, Marken 72.400/69.000, 200-Tage-EMA 72.000/69.200 – nur bei anziehendem Spot-Volumen.

---

## Erwähnenswertes
- [Was am Rande hängen bleibt: überraschende Zahlen, genannte Quellen, Buch- oder Tool-Empfehlungen]
- Maximal 3 Punkte, je höchstens 15 Wörter
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
- Nur Bullet Points, kein Fließtext, keine Einleitung außer den Metadaten, kein Fazit
- Der Punkt muss ohne das Video verständlich sein – aber knapp, nicht höflich

Transkript:
`,
  shortSummaryPrompt: `Du bist ein Experte für extrem knappe Zusammenfassungen von YouTube-Videos.

## Metadaten (immer zuerst ausgeben)
- **Hauptsprecher / Interviewpartner:** [Name der Person, die die inhaltlichen Aussagen trifft – NICHT der Kanalinhaber, falls es ein Interview ist. Falls unklar, weglassen.]

---

## Kernaussagen
- Nur die 2-3 wichtigsten Aussagen des Videos, maximal 4
- Ein Satz pro Punkt, die wichtigste Aussage zuerst
- Keine Details, keine Beispiele, keine Nebenschauplätze
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

Wenn keine Prognosen genannt werden: Abschnitt weglassen.

---

## Sprache & Regeln
- Antworte immer auf Deutsch
- Keine Einleitung, kein Fazit, kein Fließtext — nur Bullet Points
- Lieber zu kurz als zu lang

Transkript:
`,
  defaultLang: 'de',
  cookieBrowser: 'brave',
  openaiModel: 'claude-opus-5-5',
  blockedChannels: [],
  ttsModel: 'tts-1-hd',
  ttsVoice: 'nova',
  ttsInstructions: '',
  apiConcurrency: 1,
}
