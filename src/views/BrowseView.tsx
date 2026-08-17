import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchYouTubeFeed, refreshYouTubeFeed, createSummary, retrySummary, fetchSummaries, fetchSettings, updateSettings, fetchSummary, fetchCustomPrompts } from '../api/endpoints'
import type { CustomPrompt, SummaryDetail, TtsIndex, TtsModel, TtsVoice, YouTubeVideo } from '../../shared/types'
import { MODEL_OPTIONS, DEFAULT_SETTINGS, SUMMARY_DETAIL_LABELS } from '../../shared/types'
import { Loader2, RefreshCw, ExternalLink, Sparkles, AlertCircle, Eye, EyeOff, LinkIcon, Play, Send, Check, Wand2, Zap } from 'lucide-react'
import { Modal, ModalFooter } from '../components/Modal'
import { SegmentedControl } from '../components/SegmentedControl'
import { useTtsPlayback, type TtsTarget } from '../hooks/useTtsPlayback'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { POLL_INTERVAL_MS, appendUnique } from '../lib/constants'
import { Badge, Button, Card, Input, buttonClasses, SkeletonList } from '../components/ui'

const PAGE_SIZE = 30
type PendingTtsMode = 'play' | 'telegram'

function timeAgo(ts: number): string {
  const totalSeconds = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  if (months >= 1) return `vor ${months} Monat${months > 1 ? 'en' : ''}`
  if (weeks >= 1) return `vor ${weeks} Woche${weeks > 1 ? 'n' : ''}`
  if (days >= 1) return `vor ${days} Tag${days > 1 ? 'en' : ''}`
  if (hours >= 1) return `vor ${hours} Stunde${hours > 1 ? 'n' : ''}`
  if (minutes >= 1) return `vor ${minutes} Minute${minutes > 1 ? 'n' : ''}`
  return 'gerade eben'
}

// Mirrors the server-side matching in /api/youtube/feed: compare on the bare
// handle/name, case-insensitive and without a leading @.
function channelKey(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase()
}

function channelKeysOf(video: YouTubeVideo): string[] {
  const keys = [channelKey(video.channel ?? '')]
  const handle = video.channelUrl?.split('/').pop() ?? ''
  if (handle) keys.push(channelKey(handle))
  return keys.filter(Boolean)
}


export default function BrowseView() {
  const navigate = useNavigate()
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<Map<string, string>>(new Map())
  const [summarized, setSummarized] = useState<Map<string, string>>(new Map())
  const [failed, setFailed] = useState<Map<string, string>>(new Map())
  /** summaryId -> Detailgrad, damit die Karte "Kurz"/"Lang" anzeigen kann. */
  const [detailById, setDetailById] = useState<Map<string, SummaryDetail>>(new Map())
  const sentinelRef = useRef<HTMLDivElement>(null)
  const videosLenRef = useRef(0)
  videosLenRef.current = videos.length
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualDetail, setManualDetail] = useState<SummaryDetail>('long')
  const [submitting, setSubmitting] = useState(false)
  const [customPromptModalOpen, setCustomPromptModalOpen] = useState(false)
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [customPromptsLoading, setCustomPromptsLoading] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [customPromptUrl, setCustomPromptUrl] = useState('')
  const [customPromptSubmitting, setCustomPromptSubmitting] = useState(false)
  const [defaultModel, setDefaultModel] = useState(DEFAULT_SETTINGS.openaiModel)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SETTINGS.openaiModel)
  const [channelFilterMode, setChannelFilterMode] = useState<'filtered' | 'all'>('filtered')
  const [blockedChannels, setBlockedChannels] = useState<string[]>([])
  const tts = useTtsPlayback()
  const [pendingTtsByVideo, setPendingTtsByVideo] = useState<Record<string, PendingTtsMode>>({})
  const [runningTtsByVideo, setRunningTtsByVideo] = useState<Record<string, boolean>>({})
  const [ttsErrors, setTtsErrors] = useState<Record<string, string>>({})
  const showAllChannels = channelFilterMode === 'all'
  const blockedKeys = new Set(blockedChannels.map(channelKey))

  async function refreshSummaryStatusMaps() {
    try {
      const all = await fetchSummaries()
      const doneMap = new Map<string, string>()
      const errMap = new Map<string, string>()
      const detailMap = new Map<string, SummaryDetail>()
      for (const s of all) {
        detailMap.set(s.id, s.detail === 'short' ? 'short' : 'long')
        if (s.status === 'done') doneMap.set(s.videoId, s.id)
        else if (s.status === 'error') errMap.set(s.videoId, s.id)
      }
      setSummarized(doneMap)
      setFailed(errMap)
      setDetailById(detailMap)
    } catch {}
  }

  const loadFeed = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setError('') }
    try {
      const offset = reset ? 0 : videosLenRef.current
      if (!reset) setLoadingMore(true)
      const data = await fetchYouTubeFeed(offset, PAGE_SIZE, showAllChannels)
      setVideos(prev => (reset ? data.videos : appendUnique(prev, data.videos)))
      setHasMore(data.hasMore)
      setSummarized(prev => {
        const n = new Map(prev)
        for (const v of data.videos) if (v.alreadySummarized && v.summaryId) n.set(v.id, v.summaryId)
        return n
      })
    } catch (e: any) {
      if (reset) setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [showAllChannels])

  async function handleRefresh() {
    await refreshYouTubeFeed()
    loadFeed(true)
  }

  useEffect(() => { loadFeed(true) }, [loadFeed])
  useEffect(() => { refreshSummaryStatusMaps() }, [])
  useEffect(() => {
    fetchSettings()
      .then(s => {
        setDefaultModel(s.openaiModel)
        setSelectedModel(s.openaiModel)
        setBlockedChannels(s.blockedChannels)
      })
      .catch(() => {})
  }, [])

  // Blocked list can change elsewhere (Settings) - re-sync when the feed mode flips.
  useEffect(() => {
    fetchSettings().then(s => setBlockedChannels(s.blockedChannels)).catch(() => {})
  }, [showAllChannels])

  async function runTtsJob(video: YouTubeVideo, summaryId: string, mode: PendingTtsMode) {
    setRunningTtsByVideo(prev => ({ ...prev, [video.id]: true }))
    setTtsErrors(prev => {
      const next = { ...prev }
      delete next[video.id]
      return next
    })
    try {
      const summary = await fetchSummary(summaryId)
      if (!summary.summary) throw new Error('Summary noch nicht verfügbar')
      const target: TtsTarget = {
        id: summaryId,
        title: summary.videoTitle || video.title || 'Summary',
        text: summary.summary,
      }
      /* Fehler werden hier zusätzlich nach Video-ID abgelegt — die Karte in der
         Liste kennt die Summary-ID nicht, unter der der Hook sie führt. */
      if (mode === 'telegram') await tts.sendToTelegram(target, tts.defaults)
      else await tts.generateAndPlay(target, tts.defaults)
    } catch (e: any) {
      setTtsErrors(prev => ({ ...prev, [video.id]: e?.message ?? 'TTS fehlgeschlagen' }))
    } finally {
      setRunningTtsByVideo(prev => ({ ...prev, [video.id]: false }))
      setPendingTtsByVideo(prev => {
        const next = { ...prev }
        delete next[video.id]
        return next
      })
    }
  }

  async function queueTtsFlow(video: YouTubeVideo, mode: PendingTtsMode) {
    setPendingTtsByVideo(prev => ({ ...prev, [video.id]: mode }))
    setTtsErrors(prev => {
      const next = { ...prev }
      delete next[video.id]
      return next
    })

    const doneId = summarized.get(video.id)
    if (doneId) {
      await runTtsJob(video, doneId, mode)
      return
    }

    const failedId = failed.get(video.id)
    if (failedId) {
      try {
        await retrySummary(failedId)
        setProcessing(prev => new Map(prev).set(video.id, failedId))
      } catch (e: any) {
        setTtsErrors(prev => ({ ...prev, [video.id]: e?.message ?? 'Retry fehlgeschlagen' }))
        setPendingTtsByVideo(prev => {
          const next = { ...prev }
          delete next[video.id]
          return next
        })
      }
      return
    }

    if (processing.has(video.id)) return
    try {
      const result = await createSummary(video.url, { title: video.title, channel: video.channel, thumbnail: video.thumbnail })
      setProcessing(prev => new Map(prev).set(video.id, result.id))
    } catch (e: any) {
      setTtsErrors(prev => ({ ...prev, [video.id]: e?.message ?? 'Summary konnte nicht gestartet werden' }))
      setPendingTtsByVideo(prev => {
        const next = { ...prev }
        delete next[video.id]
        return next
      })
    }
  }

  const loadMore = useCallback(() => { loadFeed(false) }, [loadFeed])
  useInfiniteScroll(sentinelRef, hasMore && !loadingMore, loadMore)

  /* Der Poller laeuft in einem festen 3s-Takt. runTtsJob entsteht bei jedem Render
     neu; als Dependency wuerde das Intervall staendig neu aufgesetzt und der Takt
     nie erreicht. Die Ref haelt immer die aktuelle Fassung, ohne den Effekt zu
     invalidieren. */
  const runTtsJobRef = useRef(runTtsJob)
  runTtsJobRef.current = runTtsJob

  // Poll summary status continuously so browse updates without manual refresh.
  useEffect(() => {
    if (videos.length === 0) return
    const interval = setInterval(async () => {
      try {
        const summaries = await fetchSummaries()
        const doneMap = new Map<string, string>()
        const errorMap = new Map<string, string>()
        const detailMap = new Map<string, SummaryDetail>()
        for (const s of summaries) {
          detailMap.set(s.id, s.detail === 'short' ? 'short' : 'long')
          if (s.status === 'done') doneMap.set(s.videoId, s.id)
          if (s.status === 'error') errorMap.set(s.videoId, s.id)
        }
        setDetailById(detailMap)
        setProcessing(prev => {
          const next = new Map(prev)
          for (const id of prev.keys()) if (doneMap.has(id) || errorMap.has(id)) next.delete(id)
          return next
        })
        setSummarized(prev => {
          const next = new Map(prev)
          for (const [videoId, summaryId] of doneMap) next.set(videoId, summaryId)
          return next
        })
        setFailed(errorMap)
        try {
          await tts.refreshIndex()
        } catch {}

        for (const [videoId, mode] of Object.entries(pendingTtsByVideo)) {
          if (runningTtsByVideo[videoId]) continue
          const doneSummaryId = doneMap.get(videoId)
          if (doneSummaryId) {
            const video = videos.find(item => item.id === videoId)
            if (video) {
              void runTtsJobRef.current(video, doneSummaryId, mode)
            }
            continue
          }
          if (errorMap.has(videoId)) {
            setPendingTtsByVideo(prev => {
              const next = { ...prev }
              delete next[videoId]
              return next
            })
            setTtsErrors(prev => ({ ...prev, [videoId]: 'Summary fehlgeschlagen - TTS abgebrochen' }))
          }
        }
      } catch {}
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [pendingTtsByVideo, runningTtsByVideo, videos])

  async function handleSummarize(video: YouTubeVideo, detail: SummaryDetail) {
    try {
      const result = await createSummary(video.url, { title: video.title, channel: video.channel, thumbnail: video.thumbnail }, undefined, undefined, undefined, detail)
      setProcessing(prev => new Map(prev).set(video.id, result.id))
      setDetailById(prev => new Map(prev).set(result.id, detail))
      setFailed(prev => {
        const next = new Map(prev)
        next.delete(video.id)
        return next
      })
    } catch (e: any) {
      alert(`Fehler: ${e.message}`)
    }
  }

  async function handleRetry(videoId: string, summaryId: string) {
    try {
      await retrySummary(summaryId)
      setProcessing(prev => new Map(prev).set(videoId, summaryId))
      setFailed(prev => {
        const next = new Map(prev)
        next.delete(videoId)
        return next
      })
    } catch (e: any) {
      alert(`Fehler: ${e.message}`)
    }
  }

  async function handleManualUrl() {
    const url = manualUrl.trim()
    if (!url) return
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)
    if (!match) { alert('Kein gültiger YouTube Link'); return }
    const videoId = match[1]

    setSubmitting(true)
    try {
      const result = await createSummary(url, undefined, undefined, undefined, undefined, manualDetail)
      setProcessing(prev => new Map(prev).set(videoId, result.id))
      setDetailById(prev => new Map(prev).set(result.id, manualDetail))

      // Add a placeholder video to the top of the list
      setVideos(prev => {
        if (prev.some(v => v.id === videoId)) return prev
        return [{
          id: videoId,
          title: 'Wird geladen...',
          channel: '',
          channelUrl: '',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          durationFormatted: '',
          uploadDate: '',
          url,
        }, ...prev]
      })

      setManualUrl('')
      setLinkModalOpen(false)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setSubmitting(false) }
  }

  async function openCustomPromptModal() {
    setCustomPromptUrl('')
    setSelectedPromptId(null)
    setSelectedModel(defaultModel)
    setCustomPromptModalOpen(true)
    setCustomPromptsLoading(true)
    try {
      const prompts = await fetchCustomPrompts()
      setCustomPrompts(prompts)
      setSelectedPromptId(prompts[0]?.id ?? null)
    } catch {}
    finally { setCustomPromptsLoading(false) }
  }

  async function handleCustomPromptSubmit() {
    const url = customPromptUrl.trim()
    if (!url || !selectedPromptId) return
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)
    if (!match) { alert('Kein gültiger YouTube Link'); return }
    const videoId = match[1]
    const prompt = customPrompts.find(p => p.id === selectedPromptId)
    if (!prompt) return
    setCustomPromptSubmitting(true)
    try {
      const result = await createSummary(url, undefined, undefined, selectedModel, prompt.text)
      setProcessing(prev => new Map(prev).set(videoId, result.id))
      setVideos(prev => {
        if (prev.some(v => v.id === videoId)) return prev
        return [{
          id: videoId, title: 'Wird geladen...', channel: '', channelUrl: '',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0, durationFormatted: '', uploadDate: '', url,
        }, ...prev]
      })
      setCustomPromptUrl('')
      setSelectedPromptId(null)
      setCustomPromptModalOpen(false)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setCustomPromptSubmitting(false) }
  }

  async function handleBlock(channel: string) {
    if (!channel) return
    try {
      const s = await fetchSettings()
      if (s.blockedChannels.some(c => channelKey(c) === channelKey(channel))) {
        setBlockedChannels(s.blockedChannels)
        return
      }
      const updated = [...s.blockedChannels, channel]
      await updateSettings({ blockedChannels: updated })
      setBlockedChannels(updated)
      if (!showAllChannels) {
        setVideos(prev => prev.filter(v => v.channel.toLowerCase() !== channel.toLowerCase()))
      }
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
  }

  async function handleUnblock(video: YouTubeVideo) {
    const keys = new Set(channelKeysOf(video))
    if (keys.size === 0) return
    try {
      const s = await fetchSettings()
      const updated = s.blockedChannels.filter(c => !keys.has(channelKey(c)))
      if (updated.length === s.blockedChannels.length) {
        setBlockedChannels(s.blockedChannels)
        return
      }
      await updateSettings({ blockedChannels: updated })
      setBlockedChannels(updated)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-content">Deine YouTube Abos</h2>
          {!loading && <span className="text-xs text-dim">{videos.length} Videos</span>}
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl<'filtered' | 'all'>
            size="sm"
            values={['filtered', 'all']}
            labels={['Gefiltert', 'Alle']}
            value={channelFilterMode}
            onChange={setChannelFilterMode}
          />
          <Button size="sm" onClick={() => { setManualUrl(''); setLinkModalOpen(true) }}>
            <LinkIcon className="w-3.5 h-3.5" /> YouTube Link
          </Button>
          <Button size="sm" variant="cancel" outline onClick={openCustomPromptModal}>
            <Wand2 className="w-3.5 h-3.5" /> Custom Prompt
          </Button>
          <Button size="sm" variant="cancel" outline iconOnly onClick={handleRefresh} disabled={loading} title="Feed aktualisieren">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonList count={5} />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-10 h-10 text-danger mb-3" />
          <p className="text-sm text-content font-medium mb-1">Feed konnte nicht geladen werden</p>
          <p className="text-xs text-muted mb-2 max-w-md text-center">{error}</p>
          <p className="text-xs text-dim mb-4 max-w-md text-center">Prüfe in den Einstellungen den Cookie-Browser oder verwende einen direkten YouTube-Link.</p>
          <Button onClick={() => loadFeed(true)}>
            <RefreshCw className="w-3.5 h-3.5" /> Erneut versuchen
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {videos.map(v => {
              const isProcessing = processing.has(v.id)
              const doneId = summarized.get(v.id)
              const processingId = processing.get(v.id)
              const failedId = failed.get(v.id)
              const summaryId = doneId ?? processingId ?? failedId
              const isFailed = !doneId && !processingId && !!failedId
              const doneDetail = doneId ? detailById.get(doneId) : undefined
              const processingDetail = processingId ? detailById.get(processingId) : undefined
              const hasTts = !!(doneId && tts.index[doneId] && Object.keys(tts.index[doneId].variants).length > 0)
              const cardClickable = !!summaryId
              const isBlocked = channelKeysOf(v).some(k => blockedKeys.has(k))
              return (
                <Card
                  onClick={cardClickable && summaryId ? () => navigate(`/summaries/${summaryId}`) : undefined}
                  className={`overflow-hidden p-0 card-interactive ${cardClickable ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex gap-4 p-4">
                    <div className="relative shrink-0">
                      <img src={v.thumbnail} alt="" className="w-44 h-[100px] object-cover rounded-lg bg-inputBg" />
                      {v.durationFormatted && <span className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded">{v.durationFormatted}</span>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <h3 className="font-semibold text-content text-sm leading-snug line-clamp-2">{v.title}</h3>
                      <div>
                        <p className="text-xs text-content flex items-center gap-1.5">
                          {v.channel}
                          {v.channel && (
                            isBlocked ? (
                              <Button
                                size="inline"
                                variant="danger"
                                outline
                                onClick={e => { e.stopPropagation(); handleUnblock(v) }}
                                title={`${v.channel} wieder einblenden`}
                              >
                                <EyeOff className="w-3 h-3" /> Ausgeblendet
                              </Button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); handleBlock(v.channel) }} title={`${v.channel} ignorieren`} className="text-faint hover:text-danger transition-colors"><Eye className="w-3 h-3" /></button>
                            )
                          )}
                        </p>
                        {v.publishedAt && <p className="text-[10px] text-muted mt-0.5">{timeAgo(v.publishedAt)} · {v.uploadDate}</p>}
                      </div>
                    </div>
                    {/* Feste Spaltenbreite: sonst richtet sich die Breite nach dem
                        längsten Label und die Buttons springen von Karte zu Karte. */}
                    <div className="shrink-0 w-56 flex flex-col gap-2 items-stretch" onClick={e => e.stopPropagation()}>
                      {/* Eine Hierarchie pro Spalte: „Lang" ist die Hauptaktion und
                          trägt als einzige eine gefüllte Fläche, „Kurz" dieselbe Farbe
                          eine Stufe leiser. Sekundäres bleibt neutral, Zustände tragen
                          ihre Semantikfarbe – gleiche Bauform, andere Farbe. */}
                      {summaryId && !isProcessing ? (
                        isFailed ? (
                          <>
                            <Link to={`/summaries/${summaryId}`} className={buttonClasses({ variant: 'danger', outline: true, size: 'sm', block: true })}>
                              Fehlgeschlagen <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <Button size="sm" variant="primary" block onClick={() => failedId && handleRetry(v.id, failedId)}>
                              <Sparkles className="w-3.5 h-3.5" /> Retry
                            </Button>
                          </>
                        ) : (
                          <Link to={`/summaries/${summaryId}`} className={buttonClasses({ variant: 'success', outline: true, size: 'sm', block: true })}>
                            Zusammengefasst
                            {doneDetail && <span className="text-[10px] opacity-70">· {SUMMARY_DETAIL_LABELS[doneDetail]}</span>}
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )
                      ) : isProcessing ? (
                        <Badge variant="primary" className="h-8 justify-center animate-pulse-slow">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Verarbeite{processingDetail ? ` (${SUMMARY_DETAIL_LABELS[processingDetail].toLowerCase()})` : ''}...
                        </Badge>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button size="sm" variant="primary" outline onClick={() => handleSummarize(v, 'short')} title="Kurzfassung — nur die 2-3 Kernaussagen">
                            <Zap className="w-3.5 h-3.5" /> Kurz
                          </Button>
                          <Button size="sm" variant="primary" onClick={() => handleSummarize(v, 'long')} title="Ausführliche Zusammenfassung mit allen Details">
                            <Sparkles className="w-3.5 h-3.5" /> Lang
                          </Button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant={hasTts ? 'success' : 'cancel'}
                          outline
                          onClick={() => { void queueTtsFlow(v, 'play') }}
                          disabled={!!runningTtsByVideo[v.id]}
                          title="Summary + TTS erstellen und abspielen"
                        >
                          {pendingTtsByVideo[v.id] === 'play' || runningTtsByVideo[v.id]
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : hasTts ? <Check className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          TTS
                        </Button>
                        <Button
                          size="sm"
                          variant="cancel"
                          outline
                          onClick={() => { void queueTtsFlow(v, 'telegram') }}
                          disabled={!!runningTtsByVideo[v.id]}
                          title="Summary + TTS erstellen und an Telegram senden"
                        >
                          {pendingTtsByVideo[v.id] === 'telegram' || runningTtsByVideo[v.id]
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                          TTS
                        </Button>
                      </div>

                      <a href={v.url} target="_blank" rel="noopener" className={buttonClasses({ variant: 'accent', outline: true, size: 'sm', block: true })}>
                        <ExternalLink className="w-3.5 h-3.5" /> In YT öffnen
                      </a>
                      {ttsErrors[v.id] ? <span className="text-[10px] text-danger text-right">{ttsErrors[v.id]}</span> : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted">Mehr Videos laden...</span>
            </div>
          )}
          {!hasMore && videos.length > 0 && (
            <p className="text-center text-xs text-dim py-4">Alle {videos.length} Videos geladen</p>
          )}
        </>
      )}

      <Modal open={customPromptModalOpen} onClose={() => setCustomPromptModalOpen(false)} title="Mit Custom Prompt zusammenfassen">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">YouTube URL</label>
            <Input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={customPromptUrl}
              onChange={e => setCustomPromptUrl(e.target.value)}
              autoFocus
              onPaste={e => {
                const text = e.clipboardData.getData('text').trim()
                if (text.match(/(?:youtube\.com|youtu\.be)/)) {
                  e.preventDefault()
                  setCustomPromptUrl(text)
                }
              }}
              
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Prompt auswählen</label>
            {customPromptsLoading ? (
              <div className="flex items-center gap-2 py-4 text-dim text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Prompts laden...
              </div>
            ) : customPrompts.length === 0 ? (
              <p className="text-sm text-dim italic py-2">Keine Custom Prompts vorhanden. Zuerst in den Einstellungen anlegen.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {/* Auswahllisten sind keine Buttons: eine Zeile, aktiv = Primary-Tönung. */}
                {customPrompts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPromptId(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-sm border transition-colors ${
                      selectedPromptId === p.id
                        ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                        : 'bg-inputBg border-surfaceBorder text-content hover:bg-rowHover'
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Modell</label>
            <div className="flex flex-wrap gap-1.5">
              {MODEL_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSelectedModel(o.value)}
                  className={`w-28 px-2 py-1.5 text-xs rounded-sm border transition-colors truncate ${
                    selectedModel === o.value
                      ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                      : 'bg-inputBg border-surfaceBorder text-muted hover:bg-rowHover'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setCustomPromptModalOpen(false)}>Abbrechen</Button>
          <Button
            onClick={handleCustomPromptSubmit}
            disabled={customPromptSubmitting || !customPromptUrl.trim() || !selectedPromptId}
            loading={customPromptSubmitting}
          >
            <Wand2 className="w-4 h-4" /> Zusammenfassen
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="YouTube Video zusammenfassen">
        <p className="text-sm text-muted mb-3">Füge einen YouTube-Link ein um das Video zusammenzufassen.</p>
        <Input
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleManualUrl() }}
          onPaste={e => {
            const text = e.clipboardData.getData('text').trim()
            if (text.match(/(?:youtube\.com|youtu\.be)/)) {
              e.preventDefault()
              setManualUrl(text)
            }
          }}
          
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-xs text-muted">{manualDetail === 'short' ? 'Nur die 2-3 Kernaussagen' : 'Ausführlich mit allen Details'}</span>
          <SegmentedControl<SummaryDetail>
            size="sm"
            values={['short', 'long']}
            labels={[SUMMARY_DETAIL_LABELS.short, SUMMARY_DETAIL_LABELS.long]}
            value={manualDetail}
            onChange={setManualDetail}
          />
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setLinkModalOpen(false)}>Abbrechen</Button>
          <Button onClick={handleManualUrl} disabled={submitting || !manualUrl.trim()} loading={submitting}>
            <Sparkles className="w-4 h-4" /> Zusammenfassen
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
