import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSummary, deleteSummary } from '../api/endpoints'
import type { Summary } from '../../shared/types'
import { ArrowLeft, Clock, ExternalLink, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'
import { marked } from 'marked'
import { ConfirmModal } from '../components/ConfirmModal'

export default function SummaryDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    const load = async () => {
      try {
        const s = await fetchSummary(id)
        if (active) setSummary(s)
        if (active && s.status === 'processing') setTimeout(load, 3000)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [id])

  const parsedSummary = useMemo(() => {
    if (!summary?.summary) return ''
    return marked.parse(summary.summary, { async: false }) as string
  }, [summary?.summary])

  async function handleDelete() {
    if (!id) return
    await deleteSummary(id)
    navigate('/summaries')
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  if (!summary) return <div className="text-center py-20 text-slate-500">Nicht gefunden</div>

  return (
    <div>
      <button onClick={() => navigate('/summaries')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {summary.thumbnailUrl && (
          <div className="relative">
            <img src={summary.thumbnailUrl} alt="" className="w-full h-56 object-cover bg-slate-100"
              onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${summary.videoId}/maxresdefault.jpg` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <h1 className="text-xl font-bold text-white">{summary.videoTitle || 'Wird verarbeitet...'}</h1>
              <p className="text-white/80 text-sm mt-1">{summary.channelName}</p>
            </div>
          </div>
        )}

        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <Clock className="w-4 h-4" /> {new Date(summary.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{summary.lang}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={summary.videoUrl} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> YouTube
            </a>
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-danger hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          </div>
        </div>

        <div className="p-5">
          {summary.status === 'processing' && (
            <div className="flex items-center gap-3 text-primary mb-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Wird gerade verarbeitet...</span>
            </div>
          )}

          {summary.status === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-danger/5 border border-danger/20 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger">Fehler bei der Verarbeitung</p>
                <p className="text-xs text-slate-600 mt-1">{summary.errorMessage}</p>
              </div>
            </div>
          )}

          {summary.status === 'done' && (
            <>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Zusammenfassung</h2>
              <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: parsedSummary }} />
            </>
          )}
        </div>

        {summary.transcript && (
          <div className="border-t border-slate-100">
            <button onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between p-5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
              <span>Transkript ({summary.transcript.length.toLocaleString('de-DE')} Zeichen)</span>
              {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showTranscript && (
              <div className="px-5 pb-5">
                <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">{summary.transcript}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteOpen(false); handleDelete() }}
        title="Zusammenfassung löschen"
        description="Möchtest du diese Zusammenfassung wirklich löschen? Das kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  )
}
