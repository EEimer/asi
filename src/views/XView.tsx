import { useEffect, useState, useRef } from 'react'
import { createXSummaryApi, deleteXSummaryApi, fetchXSummaries, retryXSummary, translateXSummary } from '../api/endpoints'
import type { XSummary } from '../../shared/types'
import { Loader2, Trash2, ExternalLink, Sparkles, AlertCircle, RotateCcw, Languages } from 'lucide-react'

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  done: { cls: 'text-success bg-success/10 border-success/30', label: 'Fertig' },
  processing: { cls: 'text-primary bg-primary/10 border-primary/30 animate-pulse-slow', label: 'Verarbeite...' },
  error: { cls: 'text-danger bg-danger/10 border-danger/30', label: 'Fehler' },
}

function isXUrl(url: string): boolean {
  return /https?:\/\/(www\.)?(x\.com|twitter\.com)/.test(url)
}

export default function XView() {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems] = useState<XSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const [translating, setTranslating] = useState<string | null>(null)
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  async function loadItems() {
    try {
      setItems(await fetchXSummaries())
    } catch {
      setError('Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [])

  useEffect(() => {
    const hasProcessing = items.some(s => s.status === 'processing')
    if (!hasProcessing) return
    const timer = setInterval(async () => {
      setItems(await fetchXSummaries().catch(() => []))
    }, 3000)
    return () => clearInterval(timer)
  }, [items])

  async function handleSubmit() {
    const trimmed = url.trim()
    if (!trimmed || !isXUrl(trimmed)) { setError('Bitte einen gültigen X.com Link eingeben'); return }
    setError('')
    setSubmitting(true)
    try {
      const result = await createXSummaryApi(trimmed)
      setItems(prev => [{
        id: result.id,
        tweetId: '',
        tweetUrl: trimmed,
        author: '',
        tweetText: '',
        summary: '',
        status: 'processing',
        errorMessage: '',
        createdAt: new Date().toISOString(),
      } as XSummary, ...prev])
      setUrl('')
      inputRef.current?.focus()
    } catch (e: any) {
      setError(e?.message ?? 'Fehler beim Starten')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteXSummaryApi(id).catch(() => {})
    setItems(prev => prev.filter(s => s.id !== id))
  }

  async function handleRetry(id: string) {
    setRetrying(id)
    try {
      await retryXSummary(id)
      setItems(prev => prev.map(s => s.id === id ? { ...s, status: 'processing', errorMessage: '' } : s))
    } catch {}
    finally { setRetrying(null) }
  }

  async function handleTranslate(id: string) {
    setTranslating(id)
    try {
      const translation = await translateXSummary(id)
      setTranslations(prev => ({ ...prev, [id]: translation }))
    } catch (e: any) {
      setTranslations(prev => ({ ...prev, [id]: `Fehler: ${e?.message ?? 'Unbekannt'}` }))
    } finally {
      setTranslating(null)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">X Zusammenfassen</h2>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onPaste={e => {
              const text = e.clipboardData.getData('text').trim()
              if (isXUrl(text)) { e.preventDefault(); setUrl(text) }
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="https://x.com/i/status/..."
            className="flex-1 px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !url.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Zusammenfassen
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade...
        </div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-12">Noch keine X-Posts zusammengefasst.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.error
            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {item.author && (
                        <span className="text-xs font-medium text-slate-600">@{item.author.replace(/^@/, '')}</span>
                      )}
                      <a
                        href={item.tweetUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-[10px] text-slate-400 hover:text-primary transition-colors flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" /> {item.tweetUrl.slice(0, 50)}
                      </a>
                    </div>
                    {item.summary && (
                      <p className="text-sm text-slate-800 leading-relaxed">{item.summary}</p>
                    )}
                    {item.status === 'done' && (
                      <button
                        onClick={() => translations[item.id]
                          ? setTranslations(prev => { const n = { ...prev }; delete n[item.id]; return n })
                          : handleTranslate(item.id)
                        }
                        disabled={translating === item.id}
                        className={`mt-2 flex items-center gap-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${translations[item.id] ? 'text-primary hover:text-primary/70' : 'text-slate-400 hover:text-primary'}`}
                      >
                        {translating === item.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Languages className="w-3 h-3" />}
                        {translations[item.id] ? 'Ausblenden' : 'Komplett'}
                      </button>
                    )}
                    {translations[item.id] && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{translations[item.id]}</p>
                      </div>
                    )}
                    {item.status === 'error' && item.errorMessage && (
                      <p className="text-xs text-danger mt-1">{item.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${badge.cls}`}>
                      {item.status === 'processing'
                        ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{badge.label}</span>
                        : badge.label}
                    </span>
                    {item.status === 'error' && (
                      <button
                        onClick={() => handleRetry(item.id)}
                        disabled={retrying === item.id}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary bg-primary/10 border border-primary/30 rounded hover:bg-primary/20 transition-colors disabled:opacity-50"
                        title="Erneut versuchen"
                      >
                        {retrying === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-slate-300 hover:text-danger transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
