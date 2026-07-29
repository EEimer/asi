import { OPENAI_API_KEY, ANTHROPIC_API_KEY, loadSettings } from '../config'
import { fetchOrThrow, withRetry, type RetryNotifier } from './retry'

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

const TEMPERATURE = 0.3
const MAX_OUTPUT_TOKENS = 4000
/**
 * Reasoning-Modelle rechnen ihre internen Denk-Tokens gegen dasselbe Budget wie
 * die sichtbare Antwort. Mit 4000 kann das Denken das Budget komplett
 * aufbrauchen und eine leere Zusammenfassung zurückkommen.
 */
const MAX_OUTPUT_TOKENS_REASONING = 16_000

/**
 * GPT-5 und die o-Reihe verlangen `max_completion_tokens` statt `max_tokens`
 * und akzeptieren nur die Default-Temperature. Beides sonst: HTTP 400.
 */
function isOpenAiReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model)
}

/**
 * Anthropic hat die Sampling-Parameter ab Opus 4.7 entfernt — `temperature`
 * quittieren diese Modelle mit HTTP 400. Umgekehrte Logik (Allowlist der alten
 * Modelle), weil ein weggelassenes `temperature` immer gültig ist, ein
 * mitgeschicktes aber jedes neue Modell bricht.
 */
const ANTHROPIC_TEMPERATURE_MODELS = [
  'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-5',
  'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1', 'claude-3',
]

function anthropicAcceptsTemperature(model: string): boolean {
  return ANTHROPIC_TEMPERATURE_MODELS.some(prefix => model.toLowerCase().startsWith(prefix))
}

/** Denkt das Modell (Anthropic ab Opus 5 standardmäßig)? Dann mehr Budget. */
function isAnthropicThinkingModel(model: string): boolean {
  return /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-[78])/i.test(model)
}

/** Ein Gesprächs-Turn. Reicht für beide Provider — der System-Prompt läuft separat. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

async function callOpenAI(
  model: string,
  systemPrompt: string,
  messages: ChatTurn[],
  onRetry?: RetryNotifier,
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const reasoning = isOpenAiReasoningModel(model)
  const budget = reasoning ? MAX_OUTPUT_TOKENS_REASONING : MAX_OUTPUT_TOKENS

  return withRetry(async () => {
    const response = await fetchOrThrow('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        ...(reasoning
          ? { max_completion_tokens: budget }
          : { temperature: TEMPERATURE, max_tokens: budget }),
      }),
    }, 'OpenAI API')

    const data = await response.json() as any
    return data.choices?.[0]?.message?.content ?? ''
  }, { label: `OpenAI ${model}`, onRetry })
}

async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: ChatTurn[],
  onRetry?: RetryNotifier,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const budget = isAnthropicThinkingModel(model) ? MAX_OUTPUT_TOKENS_REASONING : MAX_OUTPUT_TOKENS

  return withRetry(async () => {
    const response = await fetchOrThrow('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages,
        ...(anthropicAcceptsTemperature(model) ? { temperature: TEMPERATURE } : {}),
        max_tokens: budget,
      }),
    }, 'Anthropic API')

    const data = await response.json() as any
    // Denk-Blöcke überspringen und den eigentlichen Antworttext einsammeln.
    const texts = (data.content ?? [])
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text ?? '')
    return texts.join('').trim()
  }, { label: `Anthropic ${model}`, onRetry })
}

export async function callModel(
  model: string,
  systemPrompt: string,
  messages: ChatTurn[],
  onRetry?: RetryNotifier,
): Promise<string> {
  if (model.toLowerCase().startsWith('claude')) {
    return callAnthropic(model, systemPrompt, messages, onRetry)
  }
  return callOpenAI(model, systemPrompt, messages, onRetry)
}

export interface TranscriptContext {
  title?: string
  channel?: string
}

export async function summarizeTranscript(
  transcript: string,
  model: string,
  onProgress?: ProgressCallback,
  context?: TranscriptContext,
  promptOverride?: string,
): Promise<string> {
  const settings = loadSettings()
  const wordCount = countWords(transcript)
  const rawPrompt = promptOverride ?? settings.summaryPrompt
  const promptText = rawPrompt.replace(/Transkript:\s*$/, '').trim()

  const metaHeader = [
    context?.title && `Videotitel: ${context.title}`,
    context?.channel && `Kanal: ${context.channel}`,
  ].filter(Boolean).join('\n')
  const userPrefix = metaHeader ? `${metaHeader}\n\nTranskript:\n` : ''

  // Retry-Versuche sichtbar machen, damit im UI nicht einfach "hängt" steht.
  const retryNotifier = (prefix = ''): RetryNotifier => ({ attempt, maxAttempts, delayMs, reason }) => {
    onProgress?.(
      `${prefix}${reason} — neuer Versuch ${attempt + 1}/${maxAttempts} in ${(delayMs / 1000).toFixed(1)}s...`,
    )
  }

  if (wordCount <= MAX_CHUNK_WORDS) {
    onProgress?.(`Zusammenfassung läuft (${wordCount.toLocaleString('de-DE')} Wörter)...`)
    return callModel(model, promptText, [{ role: 'user', content: userPrefix + transcript }], retryNotifier())
  }

  const chunks = splitIntoChunks(transcript, MAX_CHUNK_WORDS)
  onProgress?.(`Transkript zu lang (${wordCount.toLocaleString('de-DE')} Wörter) — wird in ${chunks.length} Teile aufgeteilt...`)

  const chunkResults: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunkWords = countWords(chunks[i])
    onProgress?.(`Teil ${i + 1}/${chunks.length} wird analysiert (${chunkWords.toLocaleString('de-DE')} Wörter)...`)
    const chunkMeta = metaHeader ? `${metaHeader}\n\n` : ''
    const result = await callModel(
      model,
      `${CHUNK_SYSTEM_PROMPT}\n\nDies ist Teil ${i + 1} von ${chunks.length}.`,
      [{ role: 'user', content: chunkMeta + chunks[i] }],
      retryNotifier(`Teil ${i + 1}/${chunks.length}: `),
    )
    chunkResults.push(result)
  }

  onProgress?.('Ergebnisse werden zur finalen Zusammenfassung kombiniert...')
  const mergedInput = chunkResults.map((r, i) => `--- Teil ${i + 1} ---\n${r}`).join('\n\n')
  const mergePrefix = metaHeader ? `${metaHeader}\n\n${MERGE_USER_PREFIX}` : MERGE_USER_PREFIX
  return callModel(model, promptText, [{ role: 'user', content: mergePrefix + mergedInput }], retryNotifier('Finale Zusammenfassung: '))
}
