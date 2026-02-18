export interface YouTubeVideo {
  id: string
  title: string
  channel: string
  channelUrl: string
  thumbnail: string
  duration: number
  durationFormatted: string
  uploadDate: string
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
}

export interface Note {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

export type ProcessingStep = 'queued' | 'metadata' | 'transcript' | 'summarizing' | 'done' | 'error'

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
}

export const DEFAULT_SETTINGS: Settings = {
  summaryPrompt: `Du bist ein Experte für Zusammenfassungen. Fasse das folgende YouTube-Transkript strukturiert zusammen.

Regeln:
- Schreibe auf Deutsch
- Nutze Bullet Points für die Kernaussagen
- Beginne mit einer kurzen Einleitung (1-2 Sätze)
- Liste dann die wichtigsten Punkte auf
- Schließe mit einem Fazit ab
- Ignoriere Werbung, Sponsoring und Off-Topic Abschnitte

Transkript:
`,
  defaultLang: 'de',
  cookieBrowser: 'brave',
  openaiModel: 'gpt-4o',
  blockedChannels: [],
}
