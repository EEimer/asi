import { Fragment, useDeferredValue, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPredictions, fetchPredictionCatalog, deletePrediction, addManualPrediction, addPredictions } from '../api/endpoints'
import type { Prediction } from '../../shared/types'
import { Loader2, ExternalLink, TrendingUp, TrendingDown, Minus, Trash2, Plus } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { SegmentedControl } from '../components/SegmentedControl'
import { useToast } from '../store/toastStore'
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

/** `saved` = nur Übernommenes, `all` = plus alles, was in Zusammenfassungen steckt. */
type Scope = 'saved' | 'all'

/** Zeitraum im Alle-Modus – Monate oder der ganze Bestand. */
type Range = '3' | '6' | 'all'
const RANGE_MONTHS: Record<Range, number | undefined> = { 3: 3, 6: 6, all: undefined }

/** Max. Zeilen im Alle-Modus – darüber hilft nur noch der Filter. */
const ALL_RENDER_LIMIT = 300

/** Gleiche Prognose? Asset + Richtung reichen – das Kursziel wird oft editiert. */
const sameRow = (a: Prediction, b: Prediction) =>
  a.assetName.trim().toLowerCase() === b.assetName.trim().toLowerCase() &&
  a.direction.trim().toLowerCase() === b.direction.trim().toLowerCase()

export default function GlaskugelView() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [catalog, setCatalog] = useState<Prediction[] | null>(null)
  const [scope, setScope] = useState<Scope>('saved')
  const [range, setRange] = useState<Range>('3')
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const { addToast } = useToast()

  useEffect(() => { load() }, [])

  /* Der Katalog parst serverseitig jede Zusammenfassung neu – deshalb nur auf
     Anforderung laden (Wechsel auf "Alle", Zeitraumwechsel, Wiederholen) und
     danach im State behalten. Bewusst kein useEffect: dessen Cleanup verwarf
     beim Zustandswechsel loading=true genau die Antwort, auf die er wartete. */
  async function loadCatalog(r: Range) {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      setCatalog(await fetchPredictionCatalog(RANGE_MONTHS[r]))
    } catch (e: any) {
      console.error(e)
      setCatalog(null)
      setCatalogError(e?.message ?? 'Laden fehlgeschlagen')
    } finally {
      setCatalogLoading(false)
    }
  }

  function handleScope(next: Scope) {
    setScope(next)
    if (next === 'all' && !catalog && !catalogLoading) loadCatalog(range)
  }

  function handleRange(next: Range) {
    setRange(next)
    loadCatalog(next)
  }

  async function load() {
    try { setPredictions(await fetchPredictions()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleDelete(id: string) {
    await deletePrediction(id)
    setPredictions(prev => prev.filter(p => p.id !== id))
    setCatalog(prev => prev?.filter(p => p.id !== id) ?? null)
    setDeleteTarget(null)
  }

  /* Übernimmt eine abgeleitete Zeile in die Glaskugel. Die Zeile bleibt an Ort
     und Stelle stehen und wird nur als übernommen markiert – ein Neuladen des
     Katalogs würde die Liste unter dem Klick wegspringen lassen. */
  async function handleAdopt(p: Prediction) {
    setAdding(p.id)
    try {
      await addPredictions({
        summaryId: p.summaryId,
        videoTitle: p.videoTitle,
        videoUrl: p.videoUrl,
        channelName: p.channelName,
        author: p.author,
        predictions: [{ name: p.assetName, direction: p.direction, if_cases: p.ifCases, price_target: p.priceTarget }],
      })
      const fresh = await fetchPredictions()
      setPredictions(fresh)
      /* Die abgeleitete ID ist nur ein Platzhalter – für den Löschen-Button muss
         die echte aus der Datenbank nachgezogen werden. Datum bleibt das des
         Videos, sonst springt die Zeile in eine andere Datumsgruppe. */
      const match = fresh.find(r => r.summaryId === p.summaryId && sameRow(r, p))
      setCatalog(prev => prev?.map(row => (row.id === p.id ? { ...row, id: match?.id ?? row.id, saved: true } : row)) ?? null)
      addToast('Zur Glaskugel hinzugefügt', 'success', 2200)
    } catch (e: any) {
      addToast(`Fehler: ${e.message}`, 'error', 5000)
    } finally {
      setAdding(null)
    }
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

  const rows = scope === 'all' ? (catalog ?? []) : predictions
  /* Im Alle-Modus hängen an jedem Tastendruck über tausend Zeilen. Der Deferred
     Value lässt React die Eingabe sofort zeichnen und die Liste hinterherlaufen. */
  const query = useDeferredValue(filter)
  const filtered = rows.filter(p => {
    if (!query) return true
    const q = query.toLowerCase()
    return p.assetName.toLowerCase().includes(q) || p.channelName.toLowerCase().includes(q) || p.direction.toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q) || (p.ifCases ?? '').toLowerCase().includes(q)
  })

  /* "Alle" sind mehrere tausend Zeilen – ungebremst würde die Liste bei jedem
     Tastendruck im Filter komplett neu rendern. Der Deckel fällt nur im
     Alle-Modus an, die übernommenen Prognosen bleiben immer vollständig. */
  const truncated = scope === 'all' && filtered.length > ALL_RENDER_LIMIT
  const visible = truncated ? filtered.slice(0, ALL_RENDER_LIMIT) : filtered

  const grouped: { date: string; label: string; items: Prediction[] }[] = []
  let lastDate = ''
  for (const p of visible) {
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
        <span className="text-xs text-dim">
          {rows.length} Prognosen{scope === 'all' && catalog ? ` · ${catalog.filter(p => !p.saved).length} nicht übernommen` : ''}
        </span>
        {scope === 'all' && (
          <SegmentedControl<Range>
            size="sm"
            className="ml-auto"
            values={['3', '6', 'all']}
            labels={['3 Mon.', '6 Mon.', 'Alle']}
            value={range}
            onChange={handleRange}
          />
        )}
        <SegmentedControl<Scope>
          size="sm"
          className={scope === 'all' ? undefined : 'ml-auto'}
          values={['saved', 'all']}
          labels={['Hinzugefügt', 'Alle']}
          value={scope}
          onChange={handleScope}
        />
        <Button size="sm" onClick={() => { setShowAdd(true); setForm(EMPTY_FORM); setFormError('') }}>
          <Plus className="w-4 h-4" /> Manuell anlegen
        </Button>
      </div>

      <Input type="text" placeholder="Filtern nach Asset, Kanal, Richtung..." value={filter} onChange={e => setFilter(e.target.value)}
        className="mb-4" />

      {scope === 'all' && catalogError ? (
        <div className="flex flex-col items-center justify-center py-20 text-dim gap-3">
          <p className="text-sm">Alle Prognosen konnten nicht geladen werden</p>
          <p className="text-xs">{catalogError}</p>
          <Button size="sm" variant="cancel" outline onClick={() => loadCatalog(range)}>Erneut versuchen</Button>
        </div>
      ) : scope === 'all' && catalogLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
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
                /* Key gehört an das Fragment, nicht an die Trennerzeile – sonst
                   sieht React eine Liste ohne Keys und baut bei jedem Filter-
                   Tastendruck alle Gruppen neu auf. */
                <Fragment key={group.date}>
                  {/* Datums-Trenner: kein TableRow – er ist keine Datenzeile und
                      soll weder Hover noch Zeilentrenner tragen. */}
                  <tr className="border-t border-surfaceBorderSoft bg-rowHover/50">
                    <td colSpan={6} className="px-4 py-2">
                      <span className={microLabelClass}>{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map(p => {
                    const ds = directionStyle(p.direction)
                    const DirIcon = ds.icon
                    const hasAuthor = !!p.author && !/^(nicht angegeben|unbekannt|unknown|n\/a|-|–)$/i.test(p.author.trim())
                    /* Im "Alle"-Modus stehen übernommene und nur abgeleitete Zeilen
                       nebeneinander – ohne Marker wäre nicht erkennbar, was davon
                       wirklich in der Glaskugel liegt. */
                    const isDerived = p.saved === false
                    return (
                      <TableRow key={p.id}>
                        <TableCell className={isDerived ? 'font-medium text-muted' : 'font-medium text-content'}>
                          <span className="flex items-center gap-2">
                            {p.assetName}
                            {isDerived && <span className="text-[10px] uppercase tracking-wide text-dim border border-surfaceBorder rounded px-1 py-px shrink-0">neu</span>}
                          </span>
                        </TableCell>
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
                          {isDerived ? (
                            <Button size="xs" variant="ghost" iconOnly loading={adding === p.id} disabled={adding === p.id}
                              onClick={() => handleAdopt(p)} className="text-dim hoverable:text-primary" title="Zur Glaskugel hinzufügen">
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button size="xs" variant="ghost" iconOnly onClick={() => setDeleteTarget(p.id)} className="text-dim hoverable:text-danger" title="Löschen">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {truncated && (
        <p className="text-xs text-dim mt-3 text-center">
          {ALL_RENDER_LIMIT} von {filtered.length} Treffern angezeigt – grenze mit dem Filter weiter ein.
        </p>
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
