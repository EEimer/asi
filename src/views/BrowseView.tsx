import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchYouTubeFeed, refreshYouTubeFeed, createSummary, retrySummary, fetchSummaries, fetchSettings, updateSettings } from '../api/endpoints'
import type { SummaryDetail, YouTubeVideo } from '../../shared/types'
import { SUMMARY_DETAIL_HINTS, SUMMARY_DETAIL_LABELS, normalizeDetail } from '../../shared/types'
import { Loader2, RefreshCw, ExternalLink, Sparkles, AlertCircle, Eye, EyeOff, ScrollText, Zap } from 'lucide-react'
import { SegmentedControl } from '../components/SegmentedControl'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { POLL_INTERVAL_MS, appendUnique } from '../lib/constants'
import { useSummaryLaunch } from '../store/summaryLaunchStore'
import { Badge, Button, Card, buttonClasses, SkeletonList } from '../components/ui'

const PAGE_SIZE = 30

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
  /** summaryId -> Detailgrad, damit die Karte "Kurz"/"Mittel"/"Lang" anzeigen kann. */
  const [detailById, setDetailById] = useState<Map<string, SummaryDetail>>(new Map())
  const sentinelRef = useRef<HTMLDivElement>(null)
  const videosLenRef = useRef(0)
  videosLenRef.current = videos.length
  const [channelFilterMode, setChannelFilterMode] = useState<'filtered' | 'all'>('filtered')
  const [blockedChannels, setBlockedChannels] = useState<string[]>([])
  const showAllChannels = channelFilterMode === 'all'
  const blockedKeys = new Set(blockedChannels.map(channelKey))

  async function refreshSummaryStatusMaps() {
    try {
      const all = await fetchSummaries()
      const doneMap = new Map<string, string>()
      const errMap = new Map<string, string>()
      const detailMap = new Map<string, SummaryDetail>()
      for (const s of all) {
        detailMap.set(s.id, normalizeDetail(s.detail))
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

  /* Link/Custom stehen in der Kopfzeile, also ausserhalb dieser Liste. Ein dort
     gestarteter Lauf bekommt hier sofort seine Platzhalterkarte - sonst taucht das
     Video erst beim naechsten Feed-Refresh auf, falls ueberhaupt (Abo-Filter). */
  const pendingLaunches = useSummaryLaunch(s => s.pending)
  const consumeLaunches = useSummaryLaunch(s => s.consume)
  useEffect(() => {
    if (pendingLaunches.length === 0) return
    for (const { videoId, summaryId, url, detail } of pendingLaunches) {
      setProcessing(prev => new Map(prev).set(videoId, summaryId))
      if (detail) setDetailById(prev => new Map(prev).set(summaryId, detail))
      setFailed(prev => {
        const next = new Map(prev)
        next.delete(videoId)
        return next
      })
      setVideos(prev => {
        if (prev.some(v => v.id === videoId)) return prev
        return [{
          id: videoId, title: 'Wird geladen...', channel: '', channelUrl: '',
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0, durationFormatted: '', uploadDate: '', url,
        }, ...prev]
      })
    }
    consumeLaunches()
  }, [pendingLaunches, consumeLaunches])

  // Blocked list can change elsewhere (Settings) - re-sync when the feed mode flips.
  useEffect(() => {
    fetchSettings().then(s => setBlockedChannels(s.blockedChannels)).catch(() => {})
  }, [showAllChannels])

  const loadMore = useCallback(() => { loadFeed(false) }, [loadFeed])
  useInfiniteScroll(sentinelRef, hasMore && !loadingMore, loadMore)

  /* Poll summary status continuously so browse updates without manual refresh.
     Haengt nur am „gibt es ueberhaupt Videos" — an der Liste selbst wuerde jedes
     Nachladen das Intervall neu aufsetzen und der Takt nie durchlaufen. */
  const hasVideos = videos.length > 0
  useEffect(() => {
    if (!hasVideos) return
    const interval = setInterval(async () => {
      try {
        const summaries = await fetchSummaries()
        const doneMap = new Map<string, string>()
        const errorMap = new Map<string, string>()
        const detailMap = new Map<string, SummaryDetail>()
        for (const s of summaries) {
          detailMap.set(s.id, normalizeDetail(s.detail))
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
      } catch {}
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [hasVideos])

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
                      {/* Eine Hierarchie pro Spalte: „Zusammenfassen" (= Mittel) ist der
                          Normalfall und trägt als einzige eine gefüllte Fläche, die beiden
                          Abweichungen „Kurz" und „Lang" dieselbe Farbe eine Stufe leiser.
                          Sekundäres bleibt neutral, Zustände tragen ihre Semantikfarbe –
                          gleiche Bauform, andere Farbe. */}
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
                        <>
                          <Button size="sm" variant="primary" block onClick={() => handleSummarize(v, 'medium')} title={`Zusammenfassung — ${SUMMARY_DETAIL_HINTS.medium}`}>
                            <Sparkles className="w-3.5 h-3.5" /> Zusammenfassen
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="primary" outline onClick={() => handleSummarize(v, 'short')} title={`Kurzfassung — ${SUMMARY_DETAIL_HINTS.short}`}>
                              <Zap className="w-3.5 h-3.5" /> Kurz
                            </Button>
                            <Button size="sm" variant="primary" outline onClick={() => handleSummarize(v, 'long')} title={`Langfassung — ${SUMMARY_DETAIL_HINTS.long}`}>
                              <ScrollText className="w-3.5 h-3.5" /> Lang
                            </Button>
                          </div>
                        </>
                      )}

                      <a href={v.url} target="_blank" rel="noopener" className={buttonClasses({ variant: 'accent', outline: true, size: 'sm', block: true })}>
                        <ExternalLink className="w-3.5 h-3.5" /> In YT öffnen
                      </a>
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
    </div>
  )
}
