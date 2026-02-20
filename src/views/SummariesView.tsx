import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSummaries, deleteSummary } from '../api/endpoints'
import type { SummaryListItem } from '../../shared/types'
import { Clock, Trash2, ExternalLink, Loader2, FileText, AlertCircle } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  done: { cls: 'text-success bg-success/10 border-success/30', label: 'Fertig' },
  processing: { cls: 'text-primary bg-primary/10 border-primary/30 animate-pulse-slow', label: 'Verarbeite...' },
  error: { cls: 'text-danger bg-danger/10 border-danger/30', label: 'Fehler' },
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

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
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { loadSummaries() }, [])

  useEffect(() => {
    const hasProcessing = summaries.some(s => s.status === 'processing')
    if (!hasProcessing) return
    const interval = setInterval(loadSummaries, 3000)
    return () => clearInterval(interval)
  }, [summaries])

  async function loadSummaries() {
    try { setSummaries(await fetchSummaries()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleDelete(id: string) {
    await deleteSummary(id)
    setSummaries(prev => prev.filter(s => s.id !== id))
    setDeleteTarget(null)
  }

  const filtered = summaries.filter(s => {
    const q = search.toLowerCase()
    return (s.videoTitle ?? '').toLowerCase().includes(q) || (s.channelName ?? '').toLowerCase().includes(q) || (s.summary ?? '').toLowerCase().includes(q)
  })

  // Group by date
  const grouped: { dateKey: string; label: string; items: SummaryListItem[] }[] = []
  let lastKey = ''
  for (const s of filtered) {
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
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                  <div className="flex p-4">
                    <Link to={`/summaries/${s.id}`} className="flex gap-4 flex-1 min-w-0">
                      <img src={s.thumbnailUrl} alt="" className="w-40 h-24 object-cover rounded-lg bg-slate-100 shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg` }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm truncate flex-1 min-w-0">{s.videoTitle || (s.status === 'processing' ? 'Wird verarbeitet...' : 'Ohne Titel')}</h3>
                          <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.channelName}
                          {s.author && s.author !== s.channelName && <span className="text-slate-400"> · {s.author}</span>}
                        </p>
                        {s.status === 'done' && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{s.summary?.slice(0, 200)}...</p>}
                        {s.status === 'error' && <p className="text-xs text-danger mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{s.errorMessage?.slice(0, 100)}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" /> {new Date(s.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex flex-col gap-1 shrink-0 ml-4">
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
