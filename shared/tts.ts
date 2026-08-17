import type { TtsModel, TtsVoice, TtsVoiceClassic, TtsVoiceExtended, TtsVariantConfig } from './types'

/* Eine Quelle für das TTS-Vokabular. Vorher lagen diese Listen und Helfer in vier
   Kopien: SummaryDetailView, SummariesView, SettingsView und server/services/tts.ts.
   `satisfies` bindet die Laufzeitlisten an die Unions in types.ts — ein Voice, der
   dort verschwindet, wird hier zum Compilerfehler statt still weiterzuleben. */

export const TTS_CLASSIC_VOICES = [
  'alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer',
] as const satisfies readonly TtsVoiceClassic[]

export const TTS_EXTENDED_VOICES = [
  'ballad', 'verse', 'marin', 'cedar',
] as const satisfies readonly TtsVoiceExtended[]

export const DEFAULT_TTS_VOICE: TtsVoice = 'nova'

/* Grobe Sprechgeschwindigkeit für die Dauerschätzung, bevor die Datei existiert. */
export const AVG_TTS_CHARS_PER_SECOND = 14

export function ttsVoiceOptions(model: TtsModel): TtsVoice[] {
  if (model === 'gpt-4o-mini-tts') return [...TTS_CLASSIC_VOICES, ...TTS_EXTENDED_VOICES]
  return [...TTS_CLASSIC_VOICES]
}

export function isVoiceCompatible(model: TtsModel, voice: TtsVoice): boolean {
  return ttsVoiceOptions(model).includes(voice)
}

/* Beim Modellwechsel: kompatible Stimme behalten, sonst auf die Standardstimme
   zurückfallen. Nur gpt-4o-mini-tts wertet Instruktionen aus. */
export function reconcileConfigForModel(config: TtsVariantConfig, model: TtsModel): TtsVariantConfig {
  return {
    ...config,
    model,
    voice: isVoiceCompatible(model, config.voice) ? config.voice : DEFAULT_TTS_VOICE,
    instructions: model === 'gpt-4o-mini-tts' ? config.instructions : '',
  }
}

export function normalizeInstructions(value: string): string {
  return value.trim()
}

export function estimateDurationSecondsFromText(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 0
  return Math.max(1, Math.round(normalized.length / AVG_TTS_CHARS_PER_SECOND))
}

export function variantMatches(
  entry: { model: string; voice: string; instructions: string },
  config: TtsVariantConfig,
): boolean {
  return entry.model === config.model
    && entry.voice === config.voice
    && normalizeInstructions(entry.instructions) === normalizeInstructions(config.instructions)
}
