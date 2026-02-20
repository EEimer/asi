import { OPENAI_API_KEY, loadSettings } from '../config'

const MAX_CHUNK_WORDS = 12_000
const OVERLAP_WORDS = 200

const CHUNK_SYSTEM_PROMPT = `Du erhältst einen Abschnitt eines YouTube-Transkripts.
Extrahiere ALLE Kernaussagen als Bullet Points.
Falls konkrete Assets, Kursziele oder Prognosen genannt werden, liste diese als JSON auf:
\`\`\`json
[{"name": "...", "direction": "long/short/neutral", "if_cases": "...", "price_target": "..."}]
\`\`\`
Keine Einleitung, kein Fazit, keine Formatierung. Nur die extrahierten Informationen.`

const MERGE_USER_PREFIX = `Hier sind die extrahierten Informationen aus allen Teilen des Videos. Erstelle daraus eine einzige, vollständige Zusammenfassung:\n\n`

export type ProgressCallback = (message: string) => void

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function splitIntoChunks(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return [text]

  const chunks: string[] = []
  const step = maxWords - OVERLAP_WORDS

  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(start + maxWords, words.length)
    chunks.push(words.slice(start, end).join(' '))
    if (end === words.length) break
  }

  return chunks
}

async function callOpenAI(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens = 4000,
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as any
  return data.choices?.[0]?.message?.content ?? ''
}

export interface TranscriptContext {
  title?: string
  channel?: string
}

export async function summarizeTranscript(
  transcript: string,
  onProgress?: ProgressCallback,
  context?: TranscriptContext,
): Promise<string> {
  const settings = loadSettings()
  const wordCount = countWords(transcript)
  const promptText = settings.summaryPrompt.replace(/Transkript:\s*$/, '').trim()

  const metaHeader = [
    context?.title && `Videotitel: ${context.title}`,
    context?.channel && `Kanal: ${context.channel}`,
  ].filter(Boolean).join('\n')
  const userPrefix = metaHeader ? `${metaHeader}\n\nTranskript:\n` : ''

  if (wordCount <= MAX_CHUNK_WORDS) {
    onProgress?.(`Zusammenfassung läuft (${wordCount.toLocaleString('de-DE')} Wörter)...`)
    return callOpenAI(settings.openaiModel, promptText, userPrefix + transcript)
  }

  const chunks = splitIntoChunks(transcript, MAX_CHUNK_WORDS)
  onProgress?.(`Transkript zu lang (${wordCount.toLocaleString('de-DE')} Wörter) — wird in ${chunks.length} Teile aufgeteilt...`)

  const chunkResults: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkWords = countWords(chunks[i])
    onProgress?.(`Teil ${i + 1}/${chunks.length} wird analysiert (${chunkWords.toLocaleString('de-DE')} Wörter)...`)
    const chunkMeta = metaHeader ? `${metaHeader}\n\n` : ''
    const result = await callOpenAI(
      settings.openaiModel,
      `${CHUNK_SYSTEM_PROMPT}\n\nDies ist Teil ${i + 1} von ${chunks.length}.`,
      chunkMeta + chunks[i],
    )
    chunkResults.push(result)
  }

  onProgress?.('Ergebnisse werden zur finalen Zusammenfassung kombiniert...')
  const mergedInput = chunkResults.map((r, i) => `--- Teil ${i + 1} ---\n${r}`).join('\n\n')
  const mergePrefix = metaHeader ? `${metaHeader}\n\n${MERGE_USER_PREFIX}` : MERGE_USER_PREFIX
  return callOpenAI(settings.openaiModel, promptText, mergePrefix + mergedInput)
}
