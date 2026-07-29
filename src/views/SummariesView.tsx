import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSummariesPaged, deleteSummary, retrySummary, fetchSettings, fetchTtsIndex, generateTts, getTtsAudioUrl } from '../api/endpoints'
import type { SummaryListItem, TtsIndex, TtsModel, TtsVoice } from '../../shared/types'
import { modelLabel } from '../../shared/types'
import { Clock, Trash2, ExternalLink, Loader2, FileText, AlertCircle, RotateCcw, Volume2, Pause, Play, SlidersHorizontal, Send } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { useAudioPlayer } from '../store/audioPlayerStore'

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  done: { cls: 'text-success bg-success/10 border-success/30', label: 'Fertig' },
  processing: { cls: 'text-primary bg-primary/10 border-primary/30 animate-pulse-slow', label: 'Verarbeite...' },
  error: { cls: 'text-danger bg-danger/10 border-danger/30', label: 'Fehler' },
}
const PAGE_SIZE = 20

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const TTS_CLASSIC_VOICES: TtsVoice[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const TTS_EXTENDED_VOICES: TtsVoice[] = ['ballad', 'verse', 'marin', 'cedar']

interface TtsVariantDraft {
  model: TtsModel
  voice: TtsVoice
  instructions: string
}

function modelShortLabel(model: string): string {
  return modelLabel(model)
}

function ttsVoiceOptions(model: TtsModel): TtsVoice[] {
  if (model === 'gpt-4o-mini-tts') return [...TTS_CLASSIC_VOICES, ...TTS_EXTENDED_VOICES]
  return TTS_CLASSIC_VOICES
}

function normalizeInstructions(value: string): string {
  return value.trim()
}

function estimateDurationSecondsFromText(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 0
  return Math.max(1, Math.round(normalized.length / 14))
}

function variantMatches(entry: { model: string; voice: string; instructions: string }, draft: TtsVariantDraft): boolean {
  return entry.model === draft.model
    && entry.voice === draft.voice
    && normalizeInstructions(entry.instructions) === normalizeInstructions(draft.instructions)
}

const EXCERPT_SENTENCES = 5
const EXCERPT_MAX_CHARS = 300

/**
 * Vorschautext für die Karten: die ersten Sätze der Zusammenfassung, von
 * Markdown befreit. Bewusst inhaltsbasiert statt an einen Abschnitt gebunden —
 * so bleibt die Vorschau auch dann heil, wenn sich der Prompt ändert.
 */
function summaryExcerpt(summary: string): string {
  // Metadaten-Kopf überspringen: Titel und Kanal stehen bereits auf der Karte.
  const firstSection = summary.search(/^##\s+/m)
  const body = firstSection >= 0 ? summary.slice(firstSection) : summary

  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')      // Codeblöcke (Assets-JSON)
    .replace(/^#{1,6}\s.*$/gm, ' ')       // Überschriften
    .replace(/^\s*-{3,}\s*$/gm, ' ')      // Trennlinien
    .replace(/^\s*[-*+]\s+/gm, '')        // Listenmarker
    .replace(/\*\*|__|[*_`]/g, '')        // Betonungen
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return ''

  // Satzgrenze nur bei Satzzeichen + Leerraum + neuem Satzanfang. Ohne den
  // Leerraum bliebe "120.000" mitten im Satz stehen und würde ihn zerreißen.
  const sentences = plain.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"»(])/)
  let text = sentences.slice(0, EXCERPT_SENTENCES).join(' ').trim()
  if (text.length > EXCERPT_MAX_CHARS) text = text.slice(0, EXCERPT_MAX_CHARS).replace(/\s+\S*$/, '')

  return text.length < plain.length ? `${text} …` : text
}

function formatDateKey(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Unbekannt'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const target = new Date(y, m - 1, d)

  const weekday = WEEKDAYS[date.getDay()]
  const formatted = `${weekday}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`

  if (target.getTime() === today.getTime()) return `Heute — ${formatted}`
  if (target.getTime() === yesterday.getTime()) return `Gestern — ${formatted}`
  return formatted
}

export default function SummariesView() {
  const [summaries, setSummaries] = useState<SummaryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [ttsDefaults, setTtsDefaults] = useState<TtsVariantDraft>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsConfigBySummary, setTtsConfigBySummary] = useState<Record<string, TtsVariantDraft>>({})
  const [ttsIndex, setTtsIndex] = useState<TtsIndex>({})
  const [ttsLoadingBySummary, setTtsLoadingBySummary] = useState<Record<string, boolean>>({})
  const [ttsErrors, setTtsErrors] = useState<Record<string, string>>({})
  const [configTarget, setConfigTarget] = useState<SummaryListItem | null>(null)
  const [configDraft, setConfigDraft] = useState<TtsVariantDraft>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const sentinelRef = useRef<HTMLDivElement>(null)
  const summariesLenRef = useRef(0)
  const player = useAudioPlayer()
  summariesLenRef.current = summaries.length

  const loadSummaries = useCallback(async (reset = true) => {
    try {
      const offset = reset ? 0 : summariesLenRef.current
      if (reset) setLoading(true)
      else setLoadingMore(true)
      const data = await fetchSummariesPaged(offset, PAGE_SIZE)
      setSummaries(prev => {
        if (reset) return data.items
        const existingIds = new Set(prev.map(s => s.id))
        const appended = data.items.filter(s => !existingIds.has(s.id))
        return [...prev, ...appended]
      })
      setHasMore(data.hasMore)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { loadSummaries(true) }, [loadSummaries])

  useEffect(() => {
    let active = true
    const loadTtsDefaultsAndIndex = async () => {
      try {
        const [settings, index] = await Promise.all([fetchSettings(), fetchTtsIndex()])
        if (!active) return
        setTtsDefaults({
          model: settings.ttsModel,
          voice: settings.ttsVoice,
          instructions: settings.ttsInstructions,
        })
        setTtsIndex(index)
      } catch (e) {
        console.error(e)
      }
    }
    loadTtsDefaultsAndIndex()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const hasProcessing = summaries.some(s => s.status === 'processing')
    if (!hasProcessing) return
    const interval = setInterval(async () => {
      try {
        const count = Math.max(summariesLenRef.current, PAGE_SIZE)
        const data = await fetchSummariesPaged(0, count)
        setSummaries(data.items)
        setHasMore(data.hasMore)
      } catch (e) {
        console.error(e)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [summaries])

  useEffect(() => {
    if (!hasMore || loadingMore) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadSummaries(false)
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadSummaries])

  async function handleDelete(id: string) {
    await deleteSummary(id)
    setSummaries(prev => prev.filter(s => s.id !== id))
    setDeleteTarget(null)
  }

  async function handleRetry(s: SummaryListItem) {
    setRetryingId(s.id)
    setSummaries(prev => prev.map(item =>
      item.id === s.id
        ? { ...item, status: 'processing', errorMessage: '' }
        : item,
    ))
    try {
      await retrySummary(s.id)
    } catch (e) {
      console.error(e)
      setSummaries(prev => prev.map(item =>
        item.id === s.id
          ? { ...item, status: 'error' }
          : item,
      ))
    } finally {
      setRetryingId(null)
    }
  }

  function getDraftForSummary(summaryId: string): TtsVariantDraft {
    return ttsConfigBySummary[summaryId] ?? ttsDefaults
  }

  function clearTtsError(summaryId: string) {
    setTtsErrors(prev => {
      if (!prev[summaryId]) return prev
      const next = { ...prev }
      delete next[summaryId]
      return next
    })
  }

  function openConfigForSummary(summary: SummaryListItem) {
    const draft = getDraftForSummary(summary.id)
    setConfigTarget(summary)
    setConfigDraft(draft)
  }

  function updateConfigModel(model: TtsModel) {
    setConfigDraft(prev => {
      const options = ttsVoiceOptions(model)
      const nextVoice = options.includes(prev.voice) ? prev.voice : 'nova'
      const nextInstructions = model === 'gpt-4o-mini-tts' ? prev.instructions : ''
      return { ...prev, model, voice: nextVoice, instructions: nextInstructions }
    })
  }

  async function applyConfigAndRunTts() {
    if (!configTarget) return
    const target = configTarget
    const draft = { ...configDraft }
    setTtsConfigBySummary(prev => ({ ...prev, [target.id]: draft }))
    setConfigTarget(null)
    await handleTtsClick(target, draft)
  }

  function findCachedVariant(summaryId: string, draft: TtsVariantDraft): string | null {
    const summaryEntry = ttsIndex[summaryId]
    if (!summaryEntry) return null
    for (const [variantKey, variant] of Object.entries(summaryEntry.variants)) {
      if (variantMatches(variant, draft)) return variantKey
    }
    return null
  }

  async function handleTtsClick(summary: SummaryListItem, draftOverride?: TtsVariantDraft) {
    if (summary.status !== 'done' || !summary.summary) return
    const draft = draftOverride ?? getDraftForSummary(summary.id)
    const cachedVariant = findCachedVariant(summary.id, draft)
    const isActive = player.track?.summaryId === summary.id
    const isSameVariant = isActive && cachedVariant && player.track?.variantKey === cachedVariant
    if (isSameVariant) {
      if (player.isPlaying) {
        player.pause()
        return
      }
      await player.resume()
      return
    }
    clearTtsError(summary.id)
    setTtsLoadingBySummary(prev => ({ ...prev, [summary.id]: true }))
    try {
      if (cachedVariant) {
        const durationHintSeconds = ttsIndex[summary.id]?.variants?.[cachedVariant]?.durationSeconds ?? estimateDurationSecondsFromText(summary.summary)
        await player.playTrack(getTtsAudioUrl(summary.id, cachedVariant), {
          summaryId: summary.id,
          variantKey: cachedVariant,
          title: summary.videoTitle || 'Summary',
          durationHintSeconds,
        })
        return
      }
      const result = await generateTts({
        summaryId: summary.id,
        text: summary.summary,
        model: draft.model,
        voice: draft.voice,
        instructions: draft.instructions,
      })
      const refreshedIndex = await fetchTtsIndex()
      setTtsIndex(refreshedIndex)
      await player.playTrack(result.audioUrl, {
        summaryId: summary.id,
        variantKey: result.variantKey,
        title: summary.videoTitle || 'Summary',
        durationHintSeconds: result.durationSeconds,
      })
    } catch (e: any) {
      setTtsErrors(prev => ({ ...prev, [summary.id]: e?.message ?? 'TTS fehlgeschlagen' }))
    } finally {
      setTtsLoadingBySummary(prev => ({ ...prev, [summary.id]: false }))
    }
  }

  async function handleTtsTelegramClick(summary: SummaryListItem, draftOverride?: TtsVariantDraft) {
    if (summary.status !== 'done' || !summary.summary) return
    const draft = draftOverride ?? getDraftForSummary(summary.id)
    clearTtsError(summary.id)
    setTtsLoadingBySummary(prev => ({ ...prev, [summary.id]: true }))
    try {
      await generateTts({
        summaryId: summary.id,
        text: summary.summary,
        model: draft.model,
        voice: draft.voice,
        instructions: draft.instructions,
        sendToTelegram: true,
      })
      const refreshedIndex = await fetchTtsIndex()
      setTtsIndex(refreshedIndex)
    } catch (e: any) {
      setTtsErrors(prev => ({ ...prev, [summary.id]: e?.message ?? 'Telegram-Senden fehlgeschlagen' }))
    } finally {
      setTtsLoadingBySummary(prev => ({ ...prev, [summary.id]: false }))
    }
  }

  const filtered = summaries.filter(s => {
    const q = search.toLowerCase()
    return (s.videoTitle ?? '').toLowerCase().includes(q) || (s.channelName ?? '').toLowerCase().includes(q) || (s.summary ?? '').toLowerCase().includes(q)
  })

  const latestPerVideo: SummaryListItem[] = []
  const seenVideoIds = new Set<string>()
  for (const s of filtered) {
    if (seenVideoIds.has(s.videoId)) continue
    seenVideoIds.add(s.videoId)
    latestPerVideo.push(s)
  }

  // Group by date
  const grouped: { dateKey: string; label: string; items: SummaryListItem[] }[] = []
  let lastKey = ''
  for (const s of latestPerVideo) {
    const key = formatDateKey(s.createdAt)
    if (key !== lastKey) {
      grouped.push({ dateKey: key, label: formatDateLabel(key), items: [] })
      lastKey = key
    }
    grouped[grouped.length - 1].items.push(s)
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>

  if (!summaries.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <FileText className="w-12 h-12 mb-3 text-slate-300" />
      <p className="text-lg font-medium">Noch keine Zusammenfassungen</p>
      <p className="text-sm mt-1">Geh zu <Link to="/browse" className="text-primary hover:underline">Browse</Link> und fasse dein erstes Video zusammen</p>
    </div>
  )

  return (
    <div>
      <input type="text" placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40" />

      {grouped.map(group => (
        <div key={group.dateKey} className="mb-5">
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-md font-medium text-slate-600 shrink-0">{group.label}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="grid gap-3">
            {group.items.map(s => {
              const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.error
              const ttsDraft = getDraftForSummary(s.id)
              const hasCachedTts = !!findCachedVariant(s.id, ttsDraft)
              const isLoading = !!ttsLoadingBySummary[s.id]
              const isActiveTrack = player.track?.summaryId === s.id
              const ttsState = isLoading ? 'loading' : isActiveTrack ? (player.isPlaying ? 'playing' : 'paused') : 'idle'
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                  <div className="flex p-4">
                    <Link to={`/summaries/${s.id}`} className="flex gap-4 flex-1 min-w-0">
                      <img src={s.thumbnailUrl} alt="" className="w-40 h-24 object-cover rounded-lg bg-slate-100 shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg` }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm truncate flex-1 min-w-0">{s.videoTitle || (s.status === 'processing' ? 'Wird verarbeitet...' : 'Ohne Titel')}</h3>
                          {s.model && (
                            <span className="shrink-0 inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border text-violet-700 bg-violet-50 border-violet-200">
                              {modelShortLabel(s.model)}
                            </span>
                          )}
                          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            {s.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.channelName}
                          {s.author && s.author !== s.channelName && <span className="text-slate-400"> · {s.author}</span>}
                        </p>
                        {s.status === 'done' && s.summary && <p className="text-xs text-slate-600 mt-2 line-clamp-3">{summaryExcerpt(s.summary)}</p>}
                        {s.status === 'error' && <p className="text-xs text-danger mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{s.errorMessage?.slice(0, 100)}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" /> {new Date(s.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex flex-col gap-1 shrink-0 ml-4">
                      {s.status === 'done' && (
                        <>
                          <button
                            onClick={() => handleTtsClick(s)}
                            disabled={ttsState === 'loading'}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                            title={hasCachedTts ? 'TTS abspielen (gecached)' : 'TTS erzeugen und abspielen'}
                          >
                            {ttsState === 'loading'
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : ttsState === 'playing'
                                ? <Pause className="w-4 h-4" />
                                : ttsState === 'paused'
                                  ? <Play className="w-4 h-4" />
                                  : <span className="relative inline-flex">
                                      <Volume2 className="w-4 h-4" />
                                      {hasCachedTts ? <span className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-emerald-500" /> : null}
                                    </span>}
                          </button>
                          <button
                            onClick={() => openConfigForSummary(s)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors"
                            title="TTS Config"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTtsTelegramClick(s)}
                            disabled={ttsState === 'loading'}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                            title="TTS erzeugen und an Telegram senden"
                          >
                            {ttsState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                          {ttsErrors[s.id] && (
                            <span className="text-[10px] text-danger max-w-24 text-right leading-tight">{ttsErrors[s.id]}</span>
                          )}
                        </>
                      )}
                      {s.status === 'error' && (
                        <button
                          onClick={() => handleRetry(s)}
                          disabled={retryingId === s.id}
                          className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Retry"
                        >
                          {retryingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      )}
                      <a href={s.videoUrl} target="_blank" rel="noopener" className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors" title="YouTube">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button onClick={() => setDeleteTarget(s.id)} className="p-2 text-slate-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors" title="Löschen">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-slate-500">Mehr Zusammenfassungen laden...</span>
        </div>
      )}

      <Modal
        open={!!configTarget}
        onClose={() => setConfigTarget(null)}
        title="TTS Config"
        description={configTarget?.videoTitle || 'Nur für diese Summary. Globale Defaults bleiben unverändert.'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1">Modell</label>
            <select
              value={configDraft.model}
              onChange={e => updateConfigModel(e.target.value as TtsModel)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            >
              <option value="tts-1">tts-1</option>
              <option value="tts-1-hd">tts-1-hd</option>
              <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1">Stimme</label>
            <select
              value={configDraft.voice}
              onChange={e => setConfigDraft(prev => ({ ...prev, voice: e.target.value as TtsVoice }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            >
              {ttsVoiceOptions(configDraft.model).map(voice => {
                const recommended = configDraft.model === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
                return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
              })}
            </select>
          </div>
          {configDraft.model === 'gpt-4o-mini-tts' && (
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1">Instruktionen</label>
              <input
                type="text"
                value={configDraft.instructions}
                onChange={e => setConfigDraft(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder={'z.B. "Speak slowly and clearly in German"'}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
            </div>
          )}
        </div>
        <ModalFooter>
          <button
            onClick={() => setConfigTarget(null)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={applyConfigAndRunTts}
            disabled={!configTarget || !!(configTarget && ttsLoadingBySummary[configTarget.id])}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            TTS
          </button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Zusammenfassung löschen"
        description="Möchtest du diese Zusammenfassung wirklich löschen? Das kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  )
}
