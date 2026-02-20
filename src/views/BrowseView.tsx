import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchYouTubeFeed, refreshYouTubeFeed, createSummary, fetchSummaries, fetchSettings, updateSettings } from '../api/endpoints'
import type { YouTubeVideo } from '../../shared/types'
import { Loader2, RefreshCw, ExternalLink, Sparkles, AlertCircle, EyeOff, LinkIcon } from 'lucide-react'
import { Modal, ModalFooter } from '../components/Modal'

const PAGE_SIZE = 30

export default function BrowseView() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [summarized, setSummarized] = useState<Map<string, string>>(new Map())
  const sentinelRef = useRef<HTMLDivElement>(null)
  const videosLenRef = useRef(0)
  videosLenRef.current = videos.length
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadFeed = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setError('') }
    try {
      const offset = reset ? 0 : videosLenRef.current
      if (!reset) setLoadingMore(true)
      const data = await fetchYouTubeFeed(offset, PAGE_SIZE)
      setVideos(prev => {
        if (reset) return data.videos
        const existingIds = new Set(prev.map(v => v.id))
        const newVideos = data.videos.filter(v => !existingIds.has(v.id))
        return [...prev, ...newVideos]
      })
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
  }, [])

  async function handleRefresh() {
    await refreshYouTubeFeed()
    loadFeed(true)
  }

  useEffect(() => { loadFeed(true) }, [])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!hasMore || loadingMore) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadFeed(false)
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadFeed])

  // Poll for processing status
  useEffect(() => {
    if (processing.size === 0) return
    const interval = setInterval(async () => {
      try {
        const summaries = await fetchSummaries()
        const doneMap = new Map<string, string>()
        const errorVideoIds = new Set<string>()
        for (const s of summaries) {
          if (s.status === 'done') doneMap.set(s.videoId, s.id)
          if (s.status === 'error') errorVideoIds.add(s.videoId)
        }
        setProcessing(prev => {
          const next = new Set(prev)
          for (const id of prev) if (doneMap.has(id) || errorVideoIds.has(id)) next.delete(id)
          return next
        })
        setSummarized(prev => {
          const next = new Map(prev)
          for (const [videoId, summaryId] of doneMap) next.set(videoId, summaryId)
          return next
        })
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [processing.size])

  async function handleSummarize(video: YouTubeVideo) {
    setProcessing(prev => new Set(prev).add(video.id))
    try {
      await createSummary(video.url, { title: video.title, channel: video.channel, thumbnail: video.thumbnail })
    } catch (e: any) {
      setProcessing(prev => { const n = new Set(prev); n.delete(video.id); return n })
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
      await createSummary(url)
      setProcessing(prev => new Set(prev).add(videoId))

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

  async function handleBlock(channel: string) {
    if (!channel) return
    try {
      const s = await fetchSettings()
      if (s.blockedChannels.some(c => c.toLowerCase() === channel.toLowerCase())) return
      const updated = [...s.blockedChannels, channel]
      await updateSettings({ blockedChannels: updated })
      setVideos(prev => prev.filter(v => v.channel.toLowerCase() !== channel.toLowerCase()))
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
      <p className="text-sm">YouTube Abo-Feed wird geladen...</p>
      <p className="text-xs text-slate-400 mt-1">Das kann beim ersten Mal etwas dauern</p>
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertCircle className="w-10 h-10 text-danger mb-3" />
      <p className="text-sm text-slate-700 font-medium mb-1">Feed konnte nicht geladen werden</p>
      <p className="text-xs text-slate-500 mb-4 max-w-md text-center">{error}</p>
      <button onClick={() => loadFeed(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Erneut versuchen
      </button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Deine YouTube Abos</h2>
          <span className="text-xs text-slate-400">{videos.length} Videos</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setManualUrl(''); setLinkModalOpen(true) }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            <LinkIcon className="w-3.5 h-3.5" /> YouTube Link
          </button>
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors" title="Feed aktualisieren">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {videos.map(v => {
          const isProcessing = processing.has(v.id)
          const summaryId = summarized.get(v.id)
          return (
            <div key={v.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
              <div className="flex gap-4 p-4">
                <div className="relative shrink-0">
                  <img src={v.thumbnail} alt="" className="w-44 h-[100px] object-cover rounded-lg bg-slate-100" />
                  {v.durationFormatted && <span className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded">{v.durationFormatted}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">{v.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    {v.channel}
                    {v.channel && <button onClick={() => handleBlock(v.channel)} title={`${v.channel} ignorieren`} className="text-slate-300 hover:text-danger transition-colors"><EyeOff className="w-3 h-3" /></button>}
                  </p>
                  {v.uploadDate && <p className="text-xs text-slate-400 mt-0.5">{v.uploadDate}</p>}
                </div>
                <div className="shrink-0 flex flex-col gap-1.5 items-stretch">
                  {summaryId ? (
                    <Link to={`/summaries/${summaryId}`} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-success bg-success/10 border border-success/30 rounded-lg hover:bg-success/20 transition-colors">
                      Zusammengefasst <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  ) : isProcessing ? (
                    <span className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 border border-primary/30 rounded-lg animate-pulse-slow">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verarbeite...
                    </span>
                  ) : (
                    <button onClick={() => handleSummarize(v)} className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                      <Sparkles className="w-3.5 h-3.5" /> Zusammenfassen
                    </button>
                  )}
                  <a href={v.url} target="_blank" rel="noopener" className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> In YT öffnen
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-slate-500">Mehr Videos laden...</span>
        </div>
      )}
      {!hasMore && videos.length > 0 && (
        <p className="text-center text-xs text-slate-400 py-4">Alle {videos.length} Videos geladen</p>
      )}

      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="YouTube Video zusammenfassen">
        <p className="text-sm text-slate-500 mb-3">Füge einen YouTube-Link ein um das Video zusammenzufassen.</p>
        <input
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
          className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <ModalFooter>
          <button onClick={() => setLinkModalOpen(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleManualUrl} disabled={submitting || !manualUrl.trim()} className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Zusammenfassen
          </button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
