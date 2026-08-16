import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSummariesPaged, deleteSummary, retrySummary, fetchSettings, fetchTtsIndex, generateTts, getTtsAudioUrl } from '../api/endpoints'
import type { SummaryListItem, TtsIndex, TtsModel, TtsVoice } from '../../shared/types'
import { modelLabel } from '../../shared/types'
import { Clock, Trash2, ExternalLink, Loader2, FileText, AlertCircle, RotateCcw, Volume2, Pause, Play, SlidersHorizontal, Send } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { Button, buttonClasses } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAudioPlayer } from '../store/audioPlayerStore'

const STATUS_BADGE: Record<string, { variant: 'success' | 'primary' | 'danger'; label: string }> = {
  done: { variant: 'success', label: 'Fertig' },
  processing: { variant: 'primary', label: 'Verarbeite...' },
  error: { variant: 'danger', label: 'Fehler' },
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

const EXCERPT_SENTENCES = 3
const EXCERPT_MAX_CHARS = 220

const META_HEADING = /^#{1,6}\s*(?:metadaten|metadata|kopfdaten|übersicht)\s*:?\s*$/i
const META_LABELS = new Set([
  'titel', 'videotitel', 'video-titel', 'title', 'video',
  'kanal', 'kanal/interviewer', 'kanal / interviewer', 'channel',
  'autor', 'author', 'sprecher', 'hauptsprecher', 'interviewpartner',
  'hauptsprecher / interviewpartner', 'hauptsprecher/interviewpartner',
  'gast', 'gäste', 'moderator', 'quelle', 'source',
  'datum', 'date', 'dauer', 'länge', 'link', 'url',
])

/** Zeile aus dem Metadaten-Kopf? Entweder bekannte Beschriftung oder ein Wert,
 *  der exakt das wiederholt, was ohnehin schon auf der Karte steht. */
function isMetaLine(line: string, title?: string, channel?: string): boolean {
  const clean = line.replace(/^\s*[-*+]\s+/, '').replace(/\*\*|__/g, '').trim()
  const colon = clean.indexOf(':')
  if (colon < 0) return false
  const label = clean.slice(0, colon).trim().toLowerCase()
  if (META_LABELS.has(label)) return true
  if (label.length > 40) return false
  const value = clean.slice(colon + 1).trim().toLowerCase()
  if (!value) return false
  return value === (title ?? '').trim().toLowerCase() || value === (channel ?? '').trim().toLowerCase()
}

/** Führenden Metadaten-Block abschneiden — je nach Modell mal als "## Metadaten"-
 *  Abschnitt, mal als lose Liste, mal ganz ohne Überschrift. */
function stripMetaHeader(summary: string, title?: string, channel?: string): string {
  const lines = summary.split('\n')
  let i = 0
  let sawMeta = false
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) { i++; continue }
    if (META_HEADING.test(trimmed)) { sawMeta = true; i++; continue }
    if (isMetaLine(trimmed, title, channel)) { sawMeta = true; i++; continue }
    break
  }
  return sawMeta ? lines.slice(i).join('\n') : summary
}

/**
 * Vorschautext für die Karten: die ersten Sätze der Zusammenfassung, von
 * Markdown befreit. Bewusst inhaltsbasiert statt an einen Abschnitt gebunden —
 * so bleibt die Vorschau auch dann heil, wenn sich der Prompt ändert.
 */
function summaryExcerpt(summary: string, title?: string, channel?: string): string {
  // Metadaten-Kopf überspringen: Titel und Kanal stehen bereits auf der Karte.
  const plain = stripMetaHeader(summary, title, channel)
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

  if (loading) return <div className="flex items-center justify-center py-20 text-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>

  if (!summaries.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted">
      <FileText className="w-12 h-12 mb-3 text-faint" />
      <p className="text-lg font-medium">Noch keine Zusammenfassungen</p>
      <p className="text-sm mt-1">Geh zu <Link to="/browse" className="text-primary hover:underline">Browse</Link> und fasse dein erstes Video zusammen</p>
    </div>
  )

  return (
    <div>
      <input type="text" placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2.5 bg-inputBg border border-surfaceBorder rounded-lg text-sm text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40" />

      {grouped.map(group => (
        <div key={group.dateKey} className="mb-5">
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-px flex-1 bg-surfaceBorder" />
            <span className="text-md font-medium text-muted shrink-0">{group.label}</span>
            <div className="h-px flex-1 bg-surfaceBorder" />
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
                <div key={s.id} className="card-elevation bg-panel border border-surfaceBorder rounded-xl overflow-hidden card-interactive">
                  <div className="flex p-4">
                    <Link to={`/summaries/${s.id}`} className="flex gap-4 flex-1 min-w-0">
                      <img src={s.thumbnailUrl} alt="" className="w-40 h-24 object-cover rounded-lg bg-inputBg shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg` }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-content text-sm truncate flex-1 min-w-0">{s.videoTitle || (s.status === 'processing' ? 'Wird verarbeitet...' : 'Ohne Titel')}</h3>
                          {s.model && <Badge variant="accent" size="xs" className="shrink-0">{modelShortLabel(s.model)}</Badge>}
                          <Badge variant={badge.variant} size="xs" className={`shrink-0${s.status === 'processing' ? ' animate-pulse-slow' : ''}`}>
                            {s.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          {s.channelName}
                          {s.author && s.author !== s.channelName && <span className="text-dim"> · {s.author}</span>}
                        </p>
                        {s.status === 'done' && s.summary && <p className="text-xs text-muted mt-2 line-clamp-3">{summaryExcerpt(s.summary, s.videoTitle, s.channelName)}</p>}
                        {s.status === 'error' && <p className="text-xs text-danger mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{s.errorMessage?.slice(0, 100)}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-[10px] text-dim">
                            <Clock className="w-3 h-3" /> {new Date(s.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex flex-col gap-1 shrink-0 ml-4">
                      {s.status === 'done' && (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            iconOnly
                            onClick={() => handleTtsClick(s)}
                            disabled={ttsState === 'loading'}
                            className="text-dim hoverable:text-primary"
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
                                      {hasCachedTts ? <span className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-success" /> : null}
                                    </span>}
                          </Button>
                          <Button size="xs" variant="ghost" iconOnly onClick={() => openConfigForSummary(s)} className="text-dim hoverable:text-primary" title="TTS Config">
                            <SlidersHorizontal className="w-4 h-4" />
                          </Button>
                          <Button size="xs" variant="ghost" iconOnly onClick={() => handleTtsTelegramClick(s)} disabled={ttsState === 'loading'} className="text-dim hoverable:text-primary" title="TTS erzeugen und an Telegram senden">
                            {ttsState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </Button>
                          {ttsErrors[s.id] && (
                            <span className="text-[10px] text-danger max-w-24 text-right leading-tight">{ttsErrors[s.id]}</span>
                          )}
                        </>
                      )}
                      {s.status === 'error' && (
                        <Button size="xs" variant="ghost" iconOnly onClick={() => handleRetry(s)} disabled={retryingId === s.id} className="text-dim hoverable:text-primary" title="Retry">
                          {retryingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </Button>
                      )}
                      <a href={s.videoUrl} target="_blank" rel="noopener" className={buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true }, 'text-dim hover:text-primary')} title="YouTube">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <Button size="xs" variant="ghost" iconOnly onClick={() => setDeleteTarget(s.id)} className="text-dim hoverable:text-danger" title="Löschen">
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
          <span className="text-sm text-muted">Mehr Zusammenfassungen laden...</span>
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
            <label className="block text-sm font-medium text-content mb-1">Modell</label>
            <select
              value={configDraft.model}
              onChange={e => updateConfigModel(e.target.value as TtsModel)}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="tts-1">tts-1</option>
              <option value="tts-1-hd">tts-1-hd</option>
              <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Stimme</label>
            <select
              value={configDraft.voice}
              onChange={e => setConfigDraft(prev => ({ ...prev, voice: e.target.value as TtsVoice }))}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {ttsVoiceOptions(configDraft.model).map(voice => {
                const recommended = configDraft.model === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
                return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
              })}
            </select>
          </div>
          {configDraft.model === 'gpt-4o-mini-tts' && (
            <div>
              <label className="block text-sm font-medium text-content mb-1">Instruktionen</label>
              <input
                type="text"
                value={configDraft.instructions}
                onChange={e => setConfigDraft(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder={'z.B. "Speak slowly and clearly in German"'}
                className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setConfigTarget(null)}>Abbrechen</Button>
          <Button onClick={applyConfigAndRunTts} disabled={!configTarget || !!(configTarget && ttsLoadingBySummary[configTarget.id])}>TTS</Button>
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
