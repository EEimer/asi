import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPredictions, deletePrediction, addManualPrediction } from '../api/endpoints'
import type { Prediction } from '../../shared/types'
import { Loader2, ExternalLink, TrendingUp, TrendingDown, Minus, Trash2, Plus } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { Badge, Button, Card, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableHeaderRow, TableRow, microLabelClass } from '../components/ui'

type DirectionVariant = 'success' | 'danger' | 'secondary'

const directionStyle = (d: string): { variant: DirectionVariant; icon: typeof TrendingUp } => {
  const lower = d.toLowerCase()
  if (lower.includes('long') || lower.includes('bull') || lower.includes('kauf')) return { variant: 'success', icon: TrendingUp }
  if (lower.includes('short') || lower.includes('bear') || lower.includes('verkauf')) return { variant: 'danger', icon: TrendingDown }
  return { variant: 'secondary', icon: Minus }
}

const DIRECTIONS: { value: string; label: string; variant: DirectionVariant }[] = [
  { value: 'long', label: 'Long', variant: 'success' },
  { value: 'short', label: 'Short', variant: 'danger' },
  { value: 'neutral', label: 'Neutral', variant: 'secondary' },
]

const EMPTY_FORM = { asset: '', direction: 'long', ifCases: '', priceTarget: '', author: '', videoTitle: '' }

export default function GlaskugelView() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

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

  async function handleSave() {
    if (!form.asset.trim()) { setFormError('Asset ist erforderlich'); return }
    setSaving(true)
    setFormError('')
    try {
      await addManualPrediction({
        asset: form.asset.trim(),
        direction: form.direction,
        ifCases: form.ifCases.trim(),
        priceTarget: form.priceTarget.trim(),
        author: form.author.trim(),
        videoTitle: form.videoTitle.trim(),
      })
      await load()
      setShowAdd(false)
      setForm(EMPTY_FORM)
    } catch (e: any) {
      setFormError(e?.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const filtered = predictions.filter(p => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return p.assetName.toLowerCase().includes(q) || p.channelName.toLowerCase().includes(q) || p.direction.toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q) || (p.ifCases ?? '').toLowerCase().includes(q)
  })

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
        <h2 className="text-lg font-semibold text-content">Glaskugel</h2>
        <span className="text-xs text-dim">{predictions.length} Prognosen</span>
        <Button size="sm" className="ml-auto" onClick={() => { setShowAdd(true); setForm(EMPTY_FORM); setFormError('') }}>
          <Plus className="w-4 h-4" /> Manuell anlegen
        </Button>
      </div>

      <Input type="text" placeholder="Filtern nach Asset, Kanal, Richtung..." value={filter} onChange={e => setFilter(e.target.value)}
        className="mb-4" />

      {predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-dim">
          <p className="text-sm mb-2">Noch keine Prognosen</p>
          <p className="text-xs">Fasse Videos zusammen und füge Prognosen über die Zusammenfassung hinzu</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table className="[&_th]:px-4 [&_td]:px-4">
            <TableHeader>
              <TableHeaderRow withBorder>
                <TableHeaderCell>Asset</TableHeaderCell>
                <TableHeaderCell>Richtung</TableHeaderCell>
                <TableHeaderCell>Kursziel</TableHeaderCell>
                <TableHeaderCell>Bedingung</TableHeaderCell>
                <TableHeaderCell>Quelle</TableHeaderCell>
                <TableHeaderCell className="w-10" />
              </TableHeaderRow>
            </TableHeader>
            <TableBody>
              {grouped.map(group => (
                <>{/* Fragment with key on the separator row */}
                  {/* Datums-Trenner: kein TableRow – er ist keine Datenzeile und
                      soll weder Hover noch Zeilentrenner tragen. */}
                  <tr key={`sep-${group.date}`} className="border-t border-surfaceBorderSoft bg-rowHover/50">
                    <td colSpan={6} className="px-4 py-2">
                      <span className={microLabelClass}>{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map(p => {
                    const ds = directionStyle(p.direction)
                    const DirIcon = ds.icon
                    const hasAuthor = !!p.author && !/^(nicht angegeben|unbekannt|unknown|n\/a|-|–)$/i.test(p.author.trim())
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-content">{p.assetName}</TableCell>
                        <TableCell>
                          <Badge variant={ds.variant}>
                            <DirIcon className="w-3 h-3 shrink-0" /> {p.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted">{p.priceTarget}</TableCell>
                        <TableCell className="text-muted text-xs max-w-xs">{p.ifCases}</TableCell>
                        <TableCell>
                          {p.summaryId ? (
                            <div className="flex items-center gap-2">
                              <Link to={`/summaries/${p.summaryId}`} className="text-xs text-primary hover:underline truncate max-w-[150px]" title={p.videoTitle}>
                                {p.videoTitle.slice(0, 40)}{p.videoTitle.length > 40 ? '...' : ''}
                              </Link>
                              {p.videoUrl && (
                                <a href={p.videoUrl} target="_blank" rel="noopener" className="text-dim hover:text-primary shrink-0 transition-colors">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-dim">{p.videoTitle || '—'}</span>
                          )}
                          <div className="text-xs text-muted truncate max-w-[180px]" title={hasAuthor ? p.author! : undefined}>{hasAuthor ? p.author : '—'}</div>
                          <div className="text-xs text-dim truncate max-w-[180px]" title={p.channelName}>{p.channelName}</div>
                        </TableCell>
                        <TableCell className="w-10 px-2 text-center">
                          <Button size="xs" variant="ghost" iconOnly onClick={() => setDeleteTarget(p.id)} className="text-dim hoverable:text-danger" title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </>
              ))}
            </TableBody>
          </Table>
        </Card>
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Prognose anlegen">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-content mb-1">Asset <span className="text-danger">*</span></label>
            <Input
              autoFocus
              type="text"
              value={form.asset}
              onChange={e => setForm(f => ({ ...f, asset: e.target.value }))}
              placeholder="z. B. Bitcoin, S&P 500, Tesla"
              
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-content mb-1">Richtung</label>
            <div className="grid grid-cols-3 gap-1.5">
              {DIRECTIONS.map(d => (
                <Button
                  key={d.value}
                  variant={d.variant}
                  outline={form.direction !== d.value}
                  onClick={() => setForm(f => ({ ...f, direction: d.value }))}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-content mb-1">Kursziel</label>
              <Input
                type="text"
                value={form.priceTarget}
                onChange={e => setForm(f => ({ ...f, priceTarget: e.target.value }))}
                placeholder="z. B. $120.000"
                
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content mb-1">Autor</label>
              <Input
                type="text"
                value={form.author}
                onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
                placeholder="Name"
                
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-content mb-1">Bedingung</label>
            <Input
              type="text"
              value={form.ifCases}
              onChange={e => setForm(f => ({ ...f, ifCases: e.target.value }))}
              placeholder="z. B. Falls Fed Zinsen senkt"
              
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-content mb-1">Quelle</label>
            <Input
              type="text"
              value={form.videoTitle}
              onChange={e => setForm(f => ({ ...f, videoTitle: e.target.value }))}
              placeholder="z. B. Bloomberg Artikel, eigene Analyse"
              
            />
          </div>

          {formError && <p className="text-xs text-danger">{formError}</p>}
        </div>

        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setShowAdd(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !form.asset.trim()} loading={saving}>Speichern</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
