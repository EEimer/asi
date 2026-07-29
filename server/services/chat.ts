/**
 * Nachfrage-Chat zu einer fertigen Zusammenfassung.
 *
 * Transkript und Zusammenfassung landen komplett im System-Prompt — bewusst ohne
 * Chunking: die aktuellen Modelle fassen ein Transkript in einem Context, und
 * stilles Kürzen würde Antworten liefern, die plausibel klingen, aber auf einem
 * halben Transkript beruhen. Läuft es trotzdem über, kommt der Provider-Fehler
 * über die normale Fehlerbehandlung im UI an.
 */

import { callModel, type ChatTurn } from './summarizer'
import type { ChatMessage } from '../../shared/types'

const CHAT_RULES = `Du beantwortest Rückfragen zu einem YouTube-Video.
Dir liegen das vollständige Transkript und die daraus erstellte Zusammenfassung vor.

Regeln:
- Antworte ausschließlich auf Basis von Transkript und Zusammenfassung.
- Wenn etwas dort nicht vorkommt, sage das offen statt zu raten.
- Antworte auf Deutsch, kurz und konkret; Markdown ist erlaubt.
- Zitiere bei Bedarf wörtlich aus dem Transkript.
- Keine Einleitungsfloskeln, direkt zur Sache.`

export interface SummaryChatParams {
  model: string
  videoTitle: string
  channelName: string
  transcript: string
  summary: string
  history: ChatMessage[]
  question: string
}

function buildSystemPrompt(params: SummaryChatParams): string {
  const meta = [
    params.videoTitle && `Videotitel: ${params.videoTitle}`,
    params.channelName && `Kanal: ${params.channelName}`,
  ].filter(Boolean).join('\n')

  return [
    CHAT_RULES,
    meta,
    `<zusammenfassung>\n${params.summary}\n</zusammenfassung>`,
    `<transkript>\n${params.transcript}\n</transkript>`,
  ].filter(Boolean).join('\n\n')
}

export async function answerSummaryQuestion(params: SummaryChatParams): Promise<string> {
  const messages: ChatTurn[] = [
    ...params.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: params.question },
  ]
  return callModel(params.model, buildSystemPrompt(params), messages)
}
