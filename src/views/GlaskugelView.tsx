import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPredictions, deletePrediction } from '../api/endpoints'
import type { Prediction } from '../../shared/types'
import { Loader2, ExternalLink, TrendingUp, TrendingDown, Minus, Trash2 } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'

const directionStyle = (d: string) => {
  const lower = d.toLowerCase()
  if (lower.includes('long') || lower.includes('bull') || lower.includes('kauf')) return { cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: TrendingUp }
  if (lower.includes('short') || lower.includes('bear') || lower.includes('verkauf')) return { cls: 'text-rose-700 bg-rose-50 border-rose-200', icon: TrendingDown }
  return { cls: 'text-slate-600 bg-slate-50 border-slate-200', icon: Minus }
}

export default function GlaskugelView() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try { setPredictions(await fetchPredictions()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleDelete(id: string) {
    await deletePrediction(id)
    setPredictions(prev => prev.filter(p => p.id !== id))
    setDeleteTarget(null)
  }

  const filtered = predictions.filter(p => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return p.assetName.toLowerCase().includes(q) || p.channelName.toLowerCase().includes(q) || p.direction.toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q) || (p.ifCases ?? '').toLowerCase().includes(q)
  })

  // Group by date
  const grouped: { date: string; label: string; items: Prediction[] }[] = []
  let lastDate = ''
  for (const p of filtered) {
    const d = new Date(p.createdAt)
    const key = isNaN(d.getTime()) ? 'Unbekannt' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (key !== lastDate) {
      const formatted = isNaN(d.getTime()) ? 'Unbekannt' : d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      grouped.push({ date: key, label: formatted, items: [] })
      lastDate = key
    }
    grouped[grouped.length - 1].items.push(p)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Glaskugel</h2>
        <span className="text-xs text-slate-400">{predictions.length} Prognosen</span>
      </div>

      <input type="text" placeholder="Filtern nach Asset, Kanal, Richtung..." value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full mb-4 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40" />

      {predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-sm mb-2">Noch keine Prognosen</p>
          <p className="text-xs">Fasse Videos zusammen und füge Prognosen über die Zusammenfassung hinzu</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Asset</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Richtung</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Kursziel</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Bedingung</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Autor</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Video</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <>{/* Fragment with key on the separator row */}
                  <tr key={`sep-${group.date}`}>
                    <td colSpan={7} className="px-4 py-2 bg-slate-50/50 border-t border-slate-100">
                      <span className="text-xs font-medium text-slate-500">{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map(p => {
                    const ds = directionStyle(p.direction)
                    const DirIcon = ds.icon
                    return (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{p.assetName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${ds.cls}`}>
                            <DirIcon className="w-3 h-3" /> {p.direction}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{p.priceTarget}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs">{p.ifCases}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{p.author || p.channelName}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Link to={`/summaries/${p.summaryId}`} className="text-xs text-primary hover:underline truncate max-w-[150px]" title={p.videoTitle}>
                              {p.videoTitle.slice(0, 40)}{p.videoTitle.length > 40 ? '...' : ''}
                            </Link>
                            <a href={p.videoUrl} target="_blank" rel="noopener" className="text-slate-400 hover:text-accent shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </td>
                        <td className="w-10 px-2 py-2.5 text-center">
                          <button onClick={() => setDeleteTarget(p.id)} className="p-1 text-slate-300 hover:text-danger hover:bg-red-50 rounded transition-colors" title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Prognose löschen"
        description="Möchtest du diesen Eintrag wirklich löschen?"
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  )
}
