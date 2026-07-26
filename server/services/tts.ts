import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { OPENAI_API_KEY } from '../config'
import { fetchOrThrow, withRetry, type RetryNotifier } from './retry'
import type { TtsGenerateResponse, TtsIndex, TtsModel, TtsVoice, TtsVariantConfig, TtsVariantIndexEntry } from '../../shared/types'

const TTS_DIR = join(import.meta.dir, '../data/tts')
const INDEX_PATH = join(TTS_DIR, 'index.json')

const CLASSIC_VOICES = new Set<TtsVoice>(['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'])
const EXTENDED_ONLY_VOICES = new Set<TtsVoice>(['ballad', 'verse', 'marin', 'cedar'])
const MAX_TTS_INPUT_CHARS = 3900
const AVG_TTS_CHARS_PER_SECOND = 14

function normalizeInstructions(value: string): string {
  return value.trim()
}

export function ensureTtsStorage() {
  if (!existsSync(TTS_DIR)) mkdirSync(TTS_DIR, { recursive: true })
  if (!existsSync(INDEX_PATH)) writeFileSync(INDEX_PATH, '{}')
}

function readIndex(): TtsIndex {
  ensureTtsStorage()
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as TtsIndex
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeIndex(index: TtsIndex) {
  ensureTtsStorage()
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2))
}

export function getTtsIndex(): TtsIndex {
  return readIndex()
}

function isVoiceCompatible(model: TtsModel, voice: TtsVoice): boolean {
  if (model === 'gpt-4o-mini-tts') return CLASSIC_VOICES.has(voice) || EXTENDED_ONLY_VOICES.has(voice)
  return CLASSIC_VOICES.has(voice)
}

function fallbackVoiceForModel(model: TtsModel, voice: TtsVoice): TtsVoice {
  if (isVoiceCompatible(model, voice)) return voice
  return 'nova'
}

export function buildVariantKey(config: TtsVariantConfig): string {
  const normalized = `${config.model}|${config.voice}|${normalizeInstructions(config.instructions)}`
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

function getAudioFileAbsolutePath(summaryId: string, variantKey: string): string {
  return join(TTS_DIR, summaryId, `${variantKey}.mp3`)
}

function getAudioFileRelativePath(summaryId: string, variantKey: string): string {
  return `server/data/tts/${summaryId}/${variantKey}.mp3`
}

function upsertIndexEntry(summaryId: string, variantKey: string, entry: TtsVariantIndexEntry) {
  const index = readIndex()
  index[summaryId] ??= { variants: {} }
  index[summaryId].variants[variantKey] = entry
  index[summaryId].lastUsedVariantKey = variantKey
  writeIndex(index)
}

function estimateDurationSecondsFromText(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 0
  return Math.max(1, Math.round(normalized.length / AVG_TTS_CHARS_PER_SECOND))
}

export function findVariantByConfig(summaryId: string, config: TtsVariantConfig): { variantKey: string; entry: TtsVariantIndexEntry } | null {
  const index = readIndex()
  const summaryEntry = index[summaryId]
  if (!summaryEntry) return null
  const normalizedInstructions = normalizeInstructions(config.instructions)
  for (const [variantKey, variant] of Object.entries(summaryEntry.variants)) {
    if (
      variant.model === config.model
      && variant.voice === config.voice
      && normalizeInstructions(variant.instructions) === normalizedInstructions
    ) {
      return { variantKey, entry: variant }
    }
  }
  return null
}

async function callOpenAiSpeechApi(
  config: TtsVariantConfig,
  text: string,
  onRetry?: RetryNotifier,
): Promise<Buffer> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')
  const body: Record<string, string> = {
    model: config.model,
    voice: config.voice,
    input: text,
    response_format: 'mp3',
  }
  const normalizedInstructions = normalizeInstructions(config.instructions)
  if (config.model === 'gpt-4o-mini-tts' && normalizedInstructions) {
    body.instructions = normalizedInstructions
  }

  return withRetry(async () => {
    const response = await fetchOrThrow('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    }, 'OpenAI TTS API')
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }, { label: `OpenAI TTS ${config.model}`, onRetry })
}

function splitTextForTts(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['']
  if (normalized.length <= MAX_TTS_INPUT_CHARS) return [normalized]

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + MAX_TTS_INPUT_CHARS, normalized.length)
    if (end < normalized.length) {
      const lookback = normalized.slice(start, end)
      const splitAt = Math.max(
        lookback.lastIndexOf('. '),
        lookback.lastIndexOf('! '),
        lookback.lastIndexOf('? '),
        lookback.lastIndexOf('; '),
        lookback.lastIndexOf(', '),
      )
      if (splitAt > 500) end = start + splitAt + 1
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start = end
  }
  return chunks
}

export async function getOrGenerateTts(input: {
  summaryId: string
  text: string
  model: TtsModel
  voice: TtsVoice
  instructions: string
  forceRegenerate?: boolean
  onProgress?: (message: string) => void
}): Promise<TtsGenerateResponse> {
  ensureTtsStorage()
  const model = input.model
  const voice = fallbackVoiceForModel(model, input.voice)
  const instructions = normalizeInstructions(input.instructions)
  const config: TtsVariantConfig = { model, voice, instructions }
  const variantKey = buildVariantKey(config)
  const absPath = getAudioFileAbsolutePath(input.summaryId, variantKey)
  const relPath = getAudioFileRelativePath(input.summaryId, variantKey)

  if (existsSync(absPath) && !input.forceRegenerate) {
    const sizeBytes = statSync(absPath).size
    const existing = findVariantByConfig(input.summaryId, config)
    const createdAt = existing?.entry.createdAt ?? new Date().toISOString()
    const durationSeconds = existing?.entry.durationSeconds ?? estimateDurationSecondsFromText(input.text)
    upsertIndexEntry(input.summaryId, variantKey, {
      filePath: relPath,
      model,
      voice,
      instructions,
      createdAt,
      sizeBytes,
      durationSeconds,
    })
    return {
      cached: true,
      audioUrl: `/api/tts/${encodeURIComponent(input.summaryId)}/${encodeURIComponent(variantKey)}`,
      summaryId: input.summaryId,
      variantKey,
      model,
      voice,
      instructions,
      createdAt,
      durationSeconds,
    }
  }

  const textChunks = splitTextForTts(input.text)
  const buffers: Buffer[] = []
  for (let i = 0; i < textChunks.length; i++) {
    const partLabel = textChunks.length > 1 ? `Teil ${i + 1}/${textChunks.length}: ` : ''
    const part = await callOpenAiSpeechApi(config, textChunks[i], ({ attempt, maxAttempts, delayMs, reason }) => {
      input.onProgress?.(
        `${partLabel}${reason} — neuer Versuch ${attempt + 1}/${maxAttempts} in ${(delayMs / 1000).toFixed(1)}s...`,
      )
    })
    buffers.push(part)
  }
  const audioBuffer = Buffer.concat(buffers)
  const summaryDir = dirname(absPath)
  if (!existsSync(summaryDir)) mkdirSync(summaryDir, { recursive: true })
  writeFileSync(absPath, audioBuffer)
  const createdAt = new Date().toISOString()
  const sizeBytes = statSync(absPath).size
  const durationSeconds = estimateDurationSecondsFromText(input.text)
  upsertIndexEntry(input.summaryId, variantKey, {
    filePath: relPath,
    model,
    voice,
    instructions,
    createdAt,
    sizeBytes,
    durationSeconds,
  })
  return {
    cached: false,
    audioUrl: `/api/tts/${encodeURIComponent(input.summaryId)}/${encodeURIComponent(variantKey)}`,
    summaryId: input.summaryId,
    variantKey,
    model,
    voice,
    instructions,
    createdAt,
    durationSeconds,
  }
}

export function resolveTtsFilePath(summaryId: string, variantKey: string): string {
  return getAudioFileAbsolutePath(summaryId, variantKey)
}

export function deleteTtsBySummary(summaryId: string) {
  const index = readIndex()
  delete index[summaryId]
  writeIndex(index)
  const summaryDir = join(TTS_DIR, summaryId)
  if (existsSync(summaryDir)) rmSync(summaryDir, { recursive: true, force: true })
}

export function clearAllTts() {
  writeIndex({})
  if (existsSync(TTS_DIR)) rmSync(TTS_DIR, { recursive: true, force: true })
  ensureTtsStorage()
}

export function deleteVariant(summaryId: string, variantKey: string) {
  const absPath = getAudioFileAbsolutePath(summaryId, variantKey)
  if (existsSync(absPath)) unlinkSync(absPath)
  const index = readIndex()
  const summary = index[summaryId]
  if (!summary) return
  delete summary.variants[variantKey]
  if (summary.lastUsedVariantKey === variantKey) {
    const firstRemaining = Object.keys(summary.variants)[0]
    summary.lastUsedVariantKey = firstRemaining
  }
  if (Object.keys(summary.variants).length === 0) delete index[summaryId]
  writeIndex(index)
}
