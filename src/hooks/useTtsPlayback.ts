import { useCallback, useEffect, useState } from 'react'
import { fetchSettings, fetchTtsIndex, generateTts, getTtsAudioUrl } from '../api/endpoints'
import type { TtsIndex, TtsVariantConfig } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { estimateDurationSecondsFromText, variantMatches } from '../../shared/tts'
import { useAudioPlayer } from '../store/audioPlayerStore'

/* Die TTS-Orchestrierung lag dreimal im Code: SummaryDetailView, SummariesView
   und BrowseView hatten je eine eigene Kopie von "Cache prüfen → ggf. erzeugen →
   Index neu laden → abspielen", inklusive eigener Loading- und Fehler-Maps. */

export interface TtsTarget {
  /** Summary-ID; zugleich Schlüssel für Loading- und Fehlerzustand. */
  id: string
  title: string
  /** Der vorzulesende Text; nur für die Dauerschätzung nötig. */
  text: string
}

const SETTINGS_DEFAULTS: TtsVariantConfig = {
  model: DEFAULT_SETTINGS.ttsModel,
  voice: DEFAULT_SETTINGS.ttsVoice,
  instructions: DEFAULT_SETTINGS.ttsInstructions,
}

export function useTtsPlayback() {
  /* Gezielte Selektoren statt useAudioPlayer(): der Store schreibt während der
     Wiedergabe rund viermal pro Sekunde currentTime. Ein Abo auf den gesamten
     State würde jede Listenansicht in diesem Takt neu rendern. */
  const track = useAudioPlayer(s => s.track)
  const isPlaying = useAudioPlayer(s => s.isPlaying)
  const playTrack = useAudioPlayer(s => s.playTrack)
  const pause = useAudioPlayer(s => s.pause)
  const resume = useAudioPlayer(s => s.resume)

  const [index, setIndex] = useState<TtsIndex>({})
  const [defaults, setDefaults] = useState<TtsVariantConfig>(SETTINGS_DEFAULTS)
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({})
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    Promise.all([fetchSettings(), fetchTtsIndex()])
      .then(([settings, loadedIndex]) => {
        if (!active) return
        setDefaults({
          model: settings.ttsModel,
          voice: settings.ttsVoice,
          instructions: settings.ttsInstructions,
        })
        setIndex(loadedIndex)
      })
      .catch(() => { /* Voreinstellungen bleiben stehen */ })
    return () => { active = false }
  }, [])

  const refreshIndex = useCallback(async () => {
    const loaded = await fetchTtsIndex()
    setIndex(loaded)
    return loaded
  }, [])

  const setLoading = useCallback((id: string, value: boolean) => {
    setLoadingById(prev => ({ ...prev, [id]: value }))
  }, [])

  const setError = useCallback((id: string, message: string) => {
    setErrorById(prev => ({ ...prev, [id]: message }))
  }, [])

  const clearError = useCallback((id: string) => {
    setErrorById(prev => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const isLoading = useCallback((id: string) => !!loadingById[id], [loadingById])
  const errorFor = useCallback((id: string) => errorById[id] ?? '', [errorById])

  /** Variantenschlüssel einer bereits erzeugten Datei, oder null. */
  const findCachedVariant = useCallback((summaryId: string, config: TtsVariantConfig): string | null => {
    const entry = index[summaryId]
    if (!entry) return null
    for (const [variantKey, variant] of Object.entries(entry.variants)) {
      if (variantMatches(variant, config)) return variantKey
    }
    return null
  }, [index])

  /** Läuft genau diese Variante gerade im globalen Player? */
  const isCurrent = useCallback(
    (summaryId: string, variantKey: string) =>
      track?.summaryId === summaryId && track?.variantKey === variantKey,
    [track],
  )

  const durationHintFor = useCallback(
    (target: TtsTarget, variantKey: string) =>
      index[target.id]?.variants?.[variantKey]?.durationSeconds
        ?? estimateDurationSecondsFromText(target.text),
    [index],
  )

  /**
   * Spielt eine vorhandene Variante. Läuft sie bereits, wird stattdessen
   * pausiert bzw. fortgesetzt.
   */
  const playVariant = useCallback(async (target: TtsTarget, variantKey: string) => {
    if (isCurrent(target.id, variantKey)) {
      if (isPlaying) { pause(); return }
      await resume()
      return
    }
    clearError(target.id)
    setLoading(target.id, true)
    try {
      await playTrack(getTtsAudioUrl(target.id, variantKey), {
        summaryId: target.id,
        variantKey,
        title: target.title || 'Summary',
        durationHintSeconds: durationHintFor(target, variantKey),
      })
    } catch (e: any) {
      setError(target.id, e?.message ?? 'TTS konnte nicht abgespielt werden')
    } finally {
      setLoading(target.id, false)
    }
  }, [isCurrent, isPlaying, pause, resume, playTrack, durationHintFor, clearError, setLoading, setError])

  /** Erzeugt die Variante, lädt den Index nach und spielt sie ab. */
  const generateAndPlay = useCallback(async (target: TtsTarget, config: TtsVariantConfig) => {
    clearError(target.id)
    setLoading(target.id, true)
    try {
      const result = await generateTts({
        summaryId: target.id,
        text: target.text,
        model: config.model,
        voice: config.voice,
        instructions: config.instructions,
      })
      await refreshIndex()
      await playTrack(result.audioUrl, {
        summaryId: target.id,
        variantKey: result.variantKey,
        title: target.title || 'Summary',
        durationHintSeconds: result.durationSeconds,
      })
    } catch (e: any) {
      setError(target.id, e?.message ?? 'TTS fehlgeschlagen')
      throw e
    } finally {
      setLoading(target.id, false)
    }
  }, [refreshIndex, playTrack, clearError, setLoading, setError])

  /** Erzeugt die Variante und schickt sie an Telegram, ohne lokale Wiedergabe. */
  const sendToTelegram = useCallback(async (target: TtsTarget, config: TtsVariantConfig) => {
    clearError(target.id)
    setLoading(target.id, true)
    try {
      await generateTts({
        summaryId: target.id,
        text: target.text,
        model: config.model,
        voice: config.voice,
        instructions: config.instructions,
        sendToTelegram: true,
      })
      await refreshIndex()
    } catch (e: any) {
      setError(target.id, e?.message ?? 'TTS konnte nicht an Telegram gesendet werden')
      throw e
    } finally {
      setLoading(target.id, false)
    }
  }, [refreshIndex, clearError, setLoading, setError])

  return {
    index,
    defaults,
    track,
    isPlaying,
    refreshIndex,
    findCachedVariant,
    isCurrent,
    isLoading,
    errorFor,
    clearError,
    setError,
    playVariant,
    generateAndPlay,
    sendToTelegram,
  }
}
