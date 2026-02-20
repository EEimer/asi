import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSummary, deleteSummary, addPredictions } from '../api/endpoints'
import type { Summary } from '../../shared/types'
import { ArrowLeft, ExternalLink, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Gem, Check } from 'lucide-react'
import { marked } from 'marked'
import { ConfirmModal } from '../components/ConfirmModal'
import { useToast } from '../store/toastStore'

interface ParsedPrediction {
  name: string
  direction: string
  if_cases: string
  price_target: string
}

function stripMetadataSection(text: string): string {
  return text
    .replace(/##\s*Metadaten[\s\S]*?(?=\n##)/i, '')
    .replace(/-\s*\*\*Titel:\*\*[^\n]*/gi, '')
    .replace(/-\s*\*\*Kanal\/Interviewer:\*\*[^\n]*/gi, '')
    .replace(/-\s*\*\*Hauptsprecher[^:]*:\*\*[^\n]*/gi, '')
    .replace(/-\s*\*\*Datum:\*\*[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s\n]*---[\s\n]*/g, '')
    .replace(/^\s+/, '')
}

function extractJsonAndMarkdown(text: string): { markdown: string; predictions: ParsedPrediction[] } {
  const predictions: ParsedPrediction[] = []
  let markdown = text.replace(/```json\s*\n([\s\S]*?)```/g, (_match, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr.trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (typeof item === 'object' && item && (item.name || item.asset)) {
          predictions.push({
            name: String(item.name ?? item.asset ?? ''),
            direction: String(item.direction ?? ''),
            if_cases: String(item.if_cases ?? item.ifCases ?? ''),
            price_target: String(item.price_target ?? item.priceTarget ?? item.target ?? ''),
          })
        }
      }
      return '%%PREDICTIONS_TABLE%%'
    } catch {
      return _match
    }
  })
  markdown = stripMetadataSection(markdown)
  markdown = markdown.replace(/##\s*Assets\s*&\s*Prognosen[^\n]*/gi, '')
  markdown = markdown.replace(/Falls im Video konkrete Assets[^\n]*/gi, '')
  return { markdown, predictions }
}

function directionBadge(d: string) {
  const lower = d.toLowerCase()
  if (lower.includes('long') || lower.includes('bull') || lower.includes('kauf'))
    return { cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: TrendingUp }
  if (lower.includes('short') || lower.includes('bear') || lower.includes('verkauf'))
    return { cls: 'text-rose-700 bg-rose-50 border-rose-200', Icon: TrendingDown }
  return { cls: 'text-slate-600 bg-slate-50 border-slate-200', Icon: Minus }
}

interface PredictionsTableProps {
  predictions: ParsedPrediction[]
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
}

function PredictionsTable({ predictions, summaryId, videoTitle, videoUrl, channelName, author }: PredictionsTableProps) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set(predictions.map((_, i) => i)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { addToast } = useToast()

  if (!predictions.length) return null

  const allChecked = checked.size === predictions.length
  const noneChecked = checked.size === 0

  function toggleAll() {
    if (allChecked) setChecked(new Set())
    else setChecked(new Set(predictions.map((_, i) => i)))
  }

  function toggle(idx: number) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  async function handleAdd() {
    const selected = predictions.filter((_, i) => checked.has(i))
    if (!selected.length) return
    setSaving(true)
    try {
      await addPredictions({ summaryId, videoTitle, videoUrl, channelName, author, predictions: selected })
      addToast(`${selected.length} Prognose${selected.length > 1 ? 'n' : ''} zur Glaskugel hinzugefügt`, 'success', 3000)
      setSaved(true)
    } catch (e: any) {
      addToast(`Fehler: ${e.message}`, 'error', 5000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="my-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-slate-900">Assets & Prognosen</h3>
        {saved ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <Check className="w-3.5 h-3.5" /> Hinzugefügt
          </span>
        ) : (
          <button
            onClick={handleAdd}
            disabled={noneChecked || saving}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gem className="w-3.5 h-3.5" />}
            Zu Glaskugel hinzufügen{!noneChecked && ` (${checked.size})`}
          </button>
        )}
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Asset</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Richtung</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Kursziel</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Bedingung</th>
              <th className="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={saved}
                  title="Alle auswählen"
                  className="w-3.5 h-3.5 rounded border-slate-300 text-accent focus:ring-accent/40 cursor-pointer disabled:opacity-40"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p, i) => {
              const { cls, Icon } = directionBadge(p.direction)
              return (
                <tr key={i} className={`border-t border-slate-100 ${!checked.has(i) && !saved ? 'opacity-40' : ''} transition-opacity`}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}>
                      <Icon className="w-3 h-3" /> {p.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{p.price_target}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{p.if_cases}</td>
                  <td className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={() => toggle(i)}
                      disabled={saved}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-accent focus:ring-accent/40 cursor-pointer disabled:opacity-40"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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

  const { htmlParts, predictions } = useMemo(() => {
    if (!summary?.summary) return { htmlParts: [], predictions: [] }
    const { markdown, predictions } = extractJsonAndMarkdown(summary.summary)
    const html = marked.parse(markdown, { async: false }) as string
    const parts = html.split('%%PREDICTIONS_TABLE%%')
    return { htmlParts: parts, predictions }
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
              <p className="text-white/80 text-sm mt-1">
                {summary.channelName}
                {summary.author && summary.author !== summary.channelName && <span className="text-white/60"> · {summary.author}</span>}
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-3 flex items-center justify-end gap-2">
          <a href={summary.videoUrl} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> YouTube
          </a>
          <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-danger hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Löschen
          </button>
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
              {htmlParts.map((part, i) => (
                <div key={i}>
                  <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: part }} />
                  {i < htmlParts.length - 1 && (
                    <PredictionsTable
                      predictions={predictions}
                      summaryId={summary.id}
                      videoTitle={summary.videoTitle}
                      videoUrl={summary.videoUrl}
                      channelName={summary.channelName}
                      author={summary.author ?? ''}
                    />
                  )}
                </div>
              ))}
              {htmlParts.length <= 1 && predictions.length > 0 && (
                <PredictionsTable
                  predictions={predictions}
                  summaryId={summary.id}
                  videoTitle={summary.videoTitle}
                  videoUrl={summary.videoUrl}
                  channelName={summary.channelName}
                  author={summary.author ?? ''}
                />
              )}
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
