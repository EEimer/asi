import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSummary, deleteSummary, addPredictions, updateAuthor, createSummary, fetchVideoSummaries, retrySummary, fetchPredictions, fetchSummaries } from '../api/endpoints'
import type { Summary, SummaryListItem, TtsModel, TtsVariantConfig, TtsVoice } from '../../shared/types'
import { MODEL_OPTIONS, MODEL_TIER_LABELS, DEFAULT_SETTINGS, modelLabel } from '../../shared/types'
import { ArrowLeft, ArrowRight, ExternalLink, Trash2, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Pencil, Save, User, Plus, Check, RotateCcw, Volume2, Pause, Play, SlidersHorizontal, Send, MessageSquare } from 'lucide-react'
import { marked } from 'marked'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { SummaryChat } from '../components/SummaryChat'
import { useToast } from '../store/toastStore'
import { TtsConfigModal } from '../components/TtsConfigModal'
import { useTtsPlayback, type TtsTarget } from '../hooks/useTtsPlayback'
import { Badge, Button, Card, Input, Select, Textarea, buttonClasses, CollapsibleSection } from '../components/ui'
import { POLL_INTERVAL_MS } from '../lib/constants'

interface ParsedPrediction {
  name: string
  direction: string
  if_cases: string
  price_target: string
}


function ttsModelShortLabel(model: TtsModel): string {
  if (model === 'tts-1') return 'tts-1'
  if (model === 'tts-1-hd') return 'tts-1-hd'
  return '4o-mini-tts'
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

  const merged: ParsedPrediction[] = []
  const byName = new Map<string, ParsedPrediction>()
  for (const p of predictions) {
    const key = p.name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (p.price_target && !existing.price_target.includes(p.price_target)) existing.price_target += ` / ${p.price_target}`
      if (p.if_cases && !existing.if_cases.includes(p.if_cases)) existing.if_cases += ` / ${p.if_cases}`
    } else {
      const copy = { ...p }
      byName.set(key, copy)
      merged.push(copy)
    }
  }

  return { markdown, predictions: merged }
}

function directionBadge(d: string): { variant: 'success' | 'danger' | 'secondary'; Icon: typeof TrendingUp } {
  const lower = d.toLowerCase()
  if (lower.includes('long') || lower.includes('bull') || lower.includes('kauf'))
    return { variant: 'success', Icon: TrendingUp }
  if (lower.includes('short') || lower.includes('bear') || lower.includes('verkauf'))
    return { variant: 'danger', Icon: TrendingDown }
  return { variant: 'secondary', Icon: Minus }
}

/* Mehrzeilig in einer Tabellenzelle: die Mindesthoehe der Textarea waere hier zu
   hoch, deshalb per className zurueckgenommen. */
const EDIT_TEXTAREA_CLS = 'min-h-0 resize-y py-1 text-xs leading-snug'
/* Die Zelle selbst ist das Klickziel zum Bearbeiten – kein Control, deshalb nur
   ein Hover-Hinweis und kein Rahmen. */
const EDIT_CELL_CLS = 'w-full text-left -mx-1 px-1 py-0.5 rounded-sm cursor-text hover:bg-content/[0.04] transition-colors'

interface PredictionsTableProps {
  predictions: ParsedPrediction[]
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
}

function PredictionsTable({ predictions, summaryId, videoTitle, videoUrl, channelName, author }: PredictionsTableProps) {
  const [items, setItems] = useState<ParsedPrediction[]>(predictions)
  const [addingRow, setAddingRow] = useState<number | null>(null)
  const [addedRows, setAddedRows] = useState<Set<string>>(new Set())
  const [directAdding, setDirectAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDirection, setNewDirection] = useState('neutral')
  const [newTarget, setNewTarget] = useState('')
  const [newIfCases, setNewIfCases] = useState('')
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editingField, setEditingField] = useState<keyof ParsedPrediction | null>(null)
  const [draft, setDraft] = useState<ParsedPrediction>({ name: '', direction: '', if_cases: '', price_target: '' })
  const { addToast } = useToast()

  function rowKey(item: ParsedPrediction): string {
    return [item.name, item.direction, item.if_cases, item.price_target].map(v => v.trim().toLowerCase()).join('||')
  }

  useEffect(() => {
    let active = true
    const loadAddedRows = async () => {
      try {
        const existing = await fetchPredictions()
        if (!active) return
        const keys = new Set(
          existing
            .filter(p => p.summaryId === summaryId)
            .map(p => rowKey({ name: p.assetName, direction: p.direction, if_cases: p.ifCases, price_target: p.priceTarget })),
        )
        setAddedRows(keys)
      } catch {
        // Ignore: button state still updates after successful add
      }
    }
    loadAddedRows()
    return () => { active = false }
  }, [summaryId])

  function applyDraft(idx: number, value: ParsedPrediction) {
    const cleaned: ParsedPrediction = {
      name: value.name.trim(),
      direction: value.direction.trim(),
      if_cases: value.if_cases.trim(),
      price_target: value.price_target.trim(),
    }
    setItems(prev => prev.map((it, i) => (i === idx ? cleaned : it)))
  }

  function startEdit(idx: number, field: keyof ParsedPrediction) {
    if (editingRow !== null && editingRow !== idx) applyDraft(editingRow, draft)
    setDraft({ ...items[idx] })
    setEditingRow(idx)
    setEditingField(field)
  }

  function commitEdit() {
    if (editingRow === null) return
    applyDraft(editingRow, draft)
    setEditingRow(null)
    setEditingField(null)
  }

  function cancelEdit() {
    setEditingRow(null)
    setEditingField(null)
  }

  function handleEditKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  // Textareas: Enter macht eine neue Zeile, Cmd/Ctrl+Enter übernimmt
  function handleEditKeyMultiline(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  async function handleAddRow(item: ParsedPrediction, idx: number) {
    setAddingRow(idx)
    try {
      await addPredictions({ summaryId, videoTitle, videoUrl, channelName, author, predictions: [item] })
      setAddedRows(prev => {
        const next = new Set(prev)
        next.add(rowKey(item))
        return next
      })
      addToast('Prognose zur Glaskugel hinzugefügt', 'success', 2200)
    } catch (e: any) {
      addToast(`Fehler: ${e.message}`, 'error', 5000)
    } finally {
      setAddingRow(null)
    }
  }

  async function handleAddCustomRow() {
    const name = newName.trim()
    const ifCases = newIfCases.trim()
    const priceTarget = newTarget.trim()
    if (!name) {
      addToast('Asset ist erforderlich', 'error', 2500)
      return
    }
    const created: ParsedPrediction = { name, direction: newDirection, if_cases: ifCases, price_target: priceTarget }
    setDirectAdding(true)
    try {
      await addPredictions({
        summaryId,
        videoTitle,
        videoUrl,
        channelName,
        author,
        predictions: [created],
      })
      setNewName('')
      setNewDirection('neutral')
      setNewTarget('')
      setNewIfCases('')
      setItems(prev => [...prev, created])
      /* Ohne diesen Eintrag bleibt der "Hinzufügen"-Button der neuen Zeile aktiv
         und ein zweiter Klick legt die Prognose ein zweites Mal an. */
      setAddedRows(prev => {
        const next = new Set(prev)
        next.add(rowKey(created))
        return next
      })
      addToast('Eintrag direkt hinzugefügt', 'success', 2200)
    } catch (e: any) {
      addToast(`Fehler: ${e.message}`, 'error', 5000)
    } finally {
      setDirectAdding(false)
    }
  }

  return (
    <div className="my-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-content">Assets & Prognosen</h3>
      </div>
      <div className="border border-surfaceBorder rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surfaceBorder bg-inputBg">
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted">Asset</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted">Richtung</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted">Kursziel</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted">Bedingung</th>
              <th className="w-24 px-3 py-2 text-center">Add</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) => {
              const { variant: dirVariant, Icon } = directionBadge(p.direction)
              const isAdded = addedRows.has(rowKey(p))
              const isEditing = editingRow === i
              return (
                <tr key={i} className={`border-t border-surfaceBorderSoft transition-colors ${isEditing ? 'bg-accent/10' : ''}`}>
                  <td className={`px-4 py-2.5 font-medium text-content ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <Input
                        type="text"
                        autoFocus={editingField === 'name'}
                        value={draft.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        onKeyDown={handleEditKey}
                        placeholder="Asset"
                        size="xs"
                      />
                    ) : (
                      <button type="button" onClick={() => startEdit(i, 'name')} className={EDIT_CELL_CLS} title="Bearbeiten">
                        {p.name || <span className="text-faint">—</span>}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <Select
                        autoFocus={editingField === 'direction'}
                        value={draft.direction}
                        onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}
                        onKeyDown={handleEditKey}
                        size="xs"
                      >
                        {!['long', 'short', 'neutral'].includes(draft.direction) && <option value={draft.direction}>{draft.direction || '—'}</option>}
                        <option value="long">long</option>
                        <option value="short">short</option>
                        <option value="neutral">neutral</option>
                      </Select>
                    ) : (
                      <button type="button" onClick={() => startEdit(i, 'direction')} className={EDIT_CELL_CLS} title="Bearbeiten">
                        <Badge variant={dirVariant}>
                          <Icon className="w-3 h-3 shrink-0" /> {p.direction || '—'}
                        </Badge>
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-muted ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <Textarea
                        autoFocus={editingField === 'price_target'}
                        rows={3}
                        value={draft.price_target}
                        onChange={e => setDraft(d => ({ ...d, price_target: e.target.value }))}
                        onKeyDown={handleEditKeyMultiline}
                        placeholder="Kursziel"
                        className={EDIT_TEXTAREA_CLS}
                      />
                    ) : (
                      <button type="button" onClick={() => startEdit(i, 'price_target')} className={`${EDIT_CELL_CLS} whitespace-pre-wrap`} title="Bearbeiten">
                        {p.price_target || <span className="text-faint">—</span>}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-sm text-content ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <Textarea
                        autoFocus={editingField === 'if_cases'}
                        rows={3}
                        value={draft.if_cases}
                        onChange={e => setDraft(d => ({ ...d, if_cases: e.target.value }))}
                        onKeyDown={handleEditKeyMultiline}
                        placeholder="Bedingung"
                        className={EDIT_TEXTAREA_CLS}
                      />
                    ) : (
                      <button type="button" onClick={() => startEdit(i, 'if_cases')} className={`${EDIT_CELL_CLS} whitespace-pre-wrap`} title="Bearbeiten">
                        {p.if_cases || <span className="text-faint">—</span>}
                      </button>
                    )}
                  </td>
                  <td className={`w-24 px-3 py-2.5 text-center ${isEditing ? 'align-top' : ''}`}>
                    <button
                      onClick={() => handleAddRow(p, i)}
                      disabled={addingRow === i || isAdded || isEditing}
                      className={buttonClasses({ variant: isAdded ? 'success' : 'primary', outline: true, size: 'xs' })}
                    >
                      {addingRow === i ? <Loader2 className="w-3 h-3 animate-spin" /> : isAdded ? <Check className="w-3 h-3" /> : <><Plus className="w-3 h-3" /> Add</>}
                    </button>
                  </td>
                  <td className={`w-12 px-2 py-2.5 text-center ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <button
                        onClick={commitEdit}
                        title="Änderung übernehmen"
                        className={buttonClasses({ variant: 'success', outline: true, size: 'xs', iconOnly: true })}
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(i, 'name')}
                        title="Bearbeiten"
                        className={buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true }, 'text-dim hover:text-primary')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-surfaceBorder bg-rowHover/40">
              <td className="px-4 py-2.5">
                <Input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Asset"
                  disabled={directAdding}
                  size="xs"
                />
              </td>
              <td className="px-4 py-2.5">
                <Select
                  value={newDirection}
                  onChange={e => setNewDirection(e.target.value)}
                  disabled={directAdding}
                  size="xs"
                >
                  <option value="long">long</option>
                  <option value="short">short</option>
                  <option value="neutral">neutral</option>
                </Select>
              </td>
              <td className="px-4 py-2.5">
                <Input
                  type="text"
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  placeholder="Kursziel"
                  disabled={directAdding}
                  size="xs"
                />
              </td>
              <td className="px-4 py-2.5">
                <Input
                  type="text"
                  value={newIfCases}
                  onChange={e => setNewIfCases(e.target.value)}
                  placeholder="Bedingung"
                  disabled={directAdding}
                  size="xs"
                />
              </td>
              <td className="w-24 px-3 py-2.5 text-center">
                <button
                  onClick={handleAddCustomRow}
                  disabled={directAdding}
                  className={buttonClasses({ variant: 'primary', outline: true, size: 'xs' })}
                >
                  {directAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} ADD
                </button>
              </td>
              <td className="w-12"></td>
            </tr>
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
  const [chatOpen, setChatOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingAuthor, setEditingAuthor] = useState(false)
  const [authorDraft, setAuthorDraft] = useState('')
  const [versions, setVersions] = useState<SummaryListItem[]>([])
  const [summaryOrder, setSummaryOrder] = useState<SummaryListItem[]>([])
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SETTINGS.openaiModel)
  const [creatingModelSummary, setCreatingModelSummary] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const tts = useTtsPlayback()
  const [ttsConfig, setTtsConfig] = useState<TtsVariantConfig>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsDraft, setTtsDraft] = useState<TtsVariantConfig>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsConfigOpen, setTtsConfigOpen] = useState(false)
  const [ttsAlreadyExistsOpen, setTtsAlreadyExistsOpen] = useState(false)
  const [pendingCachedVariantKey, setPendingCachedVariantKey] = useState<string | null>(null)
  const [pendingCachedConfig, setPendingCachedConfig] = useState<TtsVariantConfig | null>(null)
  const { addToast } = useToast()
  /* Die Hooks unten haengen bewusst an der ID, nicht am ganzen summary-Objekt:
     der Poller ersetzt das Objekt alle 3s durch eine neue Referenz, obwohl sich
     inhaltlich nichts geaendert hat. */
  const summaryId = summary?.id

  useEffect(() => {
    if (!id) return
    let active = true
    /* Der Handle muss festgehalten werden: ohne clearTimeout feuert der bereits
       eingeplante load() auch nach dem Verlassen der Seite noch einen Request. */
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const s = await fetchSummary(id)
        if (!active) return
        setSummary(s)
        setSelectedModel(s.model || DEFAULT_SETTINGS.openaiModel)
        if (s.status === 'processing') timer = setTimeout(load, POLL_INTERVAL_MS)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false; clearTimeout(timer) }
  }, [id])

  useEffect(() => {
    if (!summary?.videoId) return
    fetchVideoSummaries(summary.videoId).then(setVersions).catch(() => {})
  }, [summary?.videoId, id])

  useEffect(() => {
    let active = true
    fetchSummaries().then(items => {
      if (active) setSummaryOrder(items)
    }).catch(() => {})
    return () => { active = false }
  }, [id])

  /* Beim Wechsel auf eine andere Summary auf die globalen Defaults zurück.
     Loading und Fehler sind im Hook pro Summary-ID getrennt und brauchen kein Reset. */
  useEffect(() => {
    if (!summaryId) return
    setTtsConfig(tts.defaults)
  }, [summaryId, tts.defaults])

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

  async function handleCreateWithModel() {
    if (!summary) return
    setCreatingModelSummary(true)
    try {
      const result = await createSummary(
        summary.videoUrl,
        { title: summary.videoTitle, channel: summary.channelName, thumbnail: summary.thumbnailUrl },
        summary.lang,
        selectedModel,
      )
      setModelModalOpen(false)
      navigate(`/summaries/${result.id}`)
    } finally {
      setCreatingModelSummary(false)
    }
  }

  async function handleRetryFromDetail() {
    if (!id) return
    setRetrying(true)
    try {
      await retrySummary(id)
      setSummary(prev => prev ? { ...prev, status: 'processing', errorMessage: '' } : prev)
    } finally {
      setRetrying(false)
    }
  }

  function openTtsConfig() {
    setTtsDraft(ttsConfig)
    setTtsConfigOpen(true)
  }

  async function applyTtsConfigForSummary() {
    const draft = { ...ttsDraft }
    setTtsConfig(draft)
    setTtsConfigOpen(false)
    await handleTtsPlay(draft)
  }

  const ttsTarget: TtsTarget | null = summary
    ? { id: summary.id, title: summary.videoTitle || 'Summary', text: summary.summary ?? '' }
    : null

  async function handleTtsPlay(configOverride?: TtsVariantConfig) {
    if (!summary || !ttsTarget || summary.status !== 'done' || !summary.summary) return
    const config = configOverride ?? ttsConfig
    const cachedVariant = tts.findCachedVariant(summary.id, config)

    /* Läuft die passende Variante bereits, ist der Klick ein Play/Pause-Toggle.
       Existiert sie nur im Cache, fragt erst der Dialog nach. */
    if (cachedVariant && tts.isCurrent(summary.id, cachedVariant)) {
      await tts.playVariant(ttsTarget, cachedVariant)
      return
    }
    if (cachedVariant) {
      setPendingCachedVariantKey(cachedVariant)
      setPendingCachedConfig(config)
      setTtsAlreadyExistsOpen(true)
      return
    }
    await tts.generateAndPlay(ttsTarget, config).catch(() => {})
  }

  async function playPendingCachedVariant() {
    if (!ttsTarget || !pendingCachedVariantKey) return
    const variantKey = pendingCachedVariantKey
    const chosenConfig = pendingCachedConfig
    setTtsAlreadyExistsOpen(false)
    setPendingCachedVariantKey(null)
    setPendingCachedConfig(null)
    if (chosenConfig) setTtsConfig(chosenConfig)
    await tts.playVariant(ttsTarget, variantKey)
  }

  async function handlePlayExistingVariant(variantKey: string) {
    if (!summary || !ttsTarget || summary.status !== 'done') return
    await tts.playVariant(ttsTarget, variantKey)
    const variant = tts.index[summary.id]?.variants?.[variantKey]
    if (variant) {
      setTtsConfig({
        model: variant.model as TtsModel,
        voice: variant.voice as TtsVoice,
        instructions: variant.instructions,
      })
    }
  }

  async function handleTtsSendToTelegram(configOverride?: TtsVariantConfig) {
    if (!summary || !ttsTarget || summary.status !== 'done' || !summary.summary) return
    try {
      await tts.sendToTelegram(ttsTarget, configOverride ?? ttsConfig)
      addToast('TTS an Telegram gesendet', 'success', 3000)
    } catch { /* Meldung steht bereits im Hook-State */ }
  }

  const versionsByModel = useMemo(() => {
    const map = new Map<string, SummaryListItem>()
    for (const v of versions) {
      const key = v.model || 'unbekannt'
      if (!map.has(key)) map.set(key, v)
    }
    return Array.from(map.values())
  }, [versions])

  const usedModels = useMemo(() => {
    const set = new Set<string>()
    for (const v of versionsByModel) {
      if (v.model) set.add(v.model)
    }
    return set
  }, [versionsByModel])

  const hasCachedVariant = useMemo(() => {
    if (!summaryId) return false
    return !!tts.findCachedVariant(summaryId, ttsConfig)
  }, [summaryId, ttsConfig, tts.findCachedVariant])

  const summaryCharCount = useMemo(() => (summary?.summary ?? '').length, [summary?.summary])
  const summaryWordCount = useMemo(() => (summary?.summary ?? '').trim().split(/\s+/).filter(Boolean).length, [summary?.summary])

  const availableTtsVariants = useMemo(() => {
    if (!summaryId) return [] as { variantKey: string; model: TtsModel; voice: TtsVoice; instructions: string; createdAt: string }[]
    const variants = tts.index[summaryId]?.variants ?? {}
    return Object.entries(variants)
      .map(([variantKey, value]) => ({
        variantKey,
        model: value.model as TtsModel,
        voice: value.voice as TtsVoice,
        instructions: value.instructions,
        createdAt: value.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [summaryId, tts.index])

  const ttsLoading = summaryId ? tts.isLoading(summaryId) : false
  const ttsError = summaryId ? tts.errorFor(summaryId) : ''

  const ttsState = useMemo<'idle' | 'loading' | 'playing' | 'paused'>(() => {
    if (ttsLoading) return 'loading'
    if (!summaryId) return 'idle'
    if (tts.track?.summaryId !== summaryId) return 'idle'
    return tts.isPlaying ? 'playing' : 'paused'
  }, [ttsLoading, summaryId, tts.track?.summaryId, tts.isPlaying])

  const { previousSummary, nextSummary } = useMemo(() => {
    const empty = { previousSummary: null as SummaryListItem | null, nextSummary: null as SummaryListItem | null }
    if (!id || !summaryOrder.length) return empty
    const currentIndex = summaryOrder.findIndex(item => item.id === id)
    if (currentIndex < 0) return empty
    return {
      previousSummary: summaryOrder[currentIndex - 1] ?? null,
      nextSummary: summaryOrder[currentIndex + 1] ?? null,
    }
  }, [id, summaryOrder])
  const previousSummaryId = previousSummary?.id ?? null
  const nextSummaryId = nextSummary?.id ?? null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && previousSummaryId) navigate(`/summaries/${previousSummaryId}`)
      if (e.key === 'ArrowRight' && nextSummaryId) navigate(`/summaries/${nextSummaryId}`)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previousSummaryId, nextSummaryId, navigate])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  if (!summary) return <div className="text-center py-20 text-muted">Nicht gefunden</div>

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <button
          onClick={() => previousSummaryId && navigate(`/summaries/${previousSummaryId}`)}
          disabled={!previousSummaryId}
          className={buttonClasses({ variant: 'cancel', outline: true, size: 'md' }, 'h-auto justify-start gap-2.5 py-1.5 text-left')}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-inputBg text-muted">
            <ArrowLeft className="w-4 h-4" />
          </span>
          {previousSummary && (
            <span className="hidden sm:block w-72 min-w-0">
              <span className="block truncate text-xs font-medium leading-tight text-content">{previousSummary.videoTitle || 'Ohne Titel'}</span>
              <span className="block truncate text-[11px] leading-tight text-dim">{previousSummary.channelName}</span>
            </span>
          )}
        </button>
        <button
          onClick={() => nextSummaryId && navigate(`/summaries/${nextSummaryId}`)}
          disabled={!nextSummaryId}
          className={buttonClasses({ variant: 'cancel', outline: true, size: 'md' }, 'h-auto justify-end gap-2.5 py-1.5 text-right')}
        >
          {nextSummary && (
            <span className="hidden sm:block w-72 min-w-0">
              <span className="block truncate text-xs font-medium leading-tight text-content">{nextSummary.videoTitle || 'Ohne Titel'}</span>
              <span className="block truncate text-[11px] leading-tight text-dim">{nextSummary.channelName}</span>
            </span>
          )}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-inputBg text-muted">
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </div>

      <Card className="overflow-hidden">
        {summary.thumbnailUrl && (
          <div className="relative">
            <img src={summary.thumbnailUrl} alt="" className="w-full h-56 object-cover bg-inputBg"
              onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${summary.videoId}/maxresdefault.jpg` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <h1 className="text-xl font-bold text-white">{summary.videoTitle || 'Wird verarbeitet...'}</h1>
              <p className="text-white/80 text-sm mt-1">
                {summary.channelName}
                {summary.author && !/^(nicht angegeben|unbekannt|unknown|n\/a|-|–)$/i.test(summary.author.trim()) && summary.author !== summary.channelName && <span className="text-white/60"> · {summary.author}</span>}
              </p>
              {summary.model && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {/* Badges liegen auf dem abgedunkelten Thumbnail, nicht auf einer Panel-Flaeche –
                      deshalb weiss/schwarz statt Theme-Tokens: in beiden Themes derselbe Grund. */}
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-sm border text-white border-white/40 bg-primary/70">
                    {modelLabel(summary.model)}
                  </span>
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-sm border text-white/90 border-white/40 bg-black/30">
                    {summaryCharCount.toLocaleString('de-DE')} Chars
                  </span>
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-sm border text-white/90 border-white/40 bg-black/30">
                    {summaryWordCount.toLocaleString('de-DE')} Wörter
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="cancel" outline onClick={() => setModelModalOpen(true)}>
              Anderes Model
            </Button>
            {/* Aktive Version = gefüllt, die anderen neutral. Ein An/Aus, nicht zwei Farben. */}
            {versionsByModel.map(v => (
              <Button
                key={v.id}
                size="sm"
                variant={v.id === summary.id ? 'primary' : 'cancel'}
                outline={v.id !== summary.id}
                onClick={() => navigate(`/summaries/${v.id}`)}
                disabled={v.id === summary.id}
                className="disabled:opacity-100"
              >
                {modelLabel(v.model)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {summary.status === 'done' && (
              <>
                <Button
                  size="sm"
                  /* Durchgehend primary statt cancel-im-Ruhezustand: der Chat ist die
                     eine inhaltliche Aktion in einer sonst rein grauen TTS-Leiste.
                     Gefüllt heisst in dieser Toolbar überall "gerade aktiv" (laufende
                     TTS-Variante, offener Chat) – das bleibt so. */
                  variant="primary"
                  outline={!chatOpen}
                  onClick={() => setChatOpen(open => !open)}
                  title={chatOpen ? 'Zurück zur Zusammenfassung' : 'Rückfragen zum Video stellen'}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </Button>
                <Button
                  size="sm"
                  variant="cancel"
                  outline
                  onClick={() => { void handleTtsPlay() }}
                  disabled={ttsState === 'loading'}
                  title={hasCachedVariant ? 'TTS abspielen (gecached)' : 'TTS erzeugen und abspielen'}
                >
                  {ttsState === 'loading'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : ttsState === 'playing'
                      ? <Pause className="w-3.5 h-3.5" />
                      : ttsState === 'paused'
                        ? <Play className="w-3.5 h-3.5" />
                        : <Volume2 className="w-3.5 h-3.5" />}
                  TTS
                  {hasCachedVariant ? <span className="w-1.5 h-1.5 rounded-full bg-success" /> : null}
                </Button>
                <Button size="sm" variant="cancel" outline onClick={openTtsConfig}>
                  <SlidersHorizontal className="w-3.5 h-3.5" /> TTS Config
                </Button>
                <Button
                  size="sm"
                  variant="cancel"
                  outline
                  onClick={() => { void handleTtsSendToTelegram() }}
                  disabled={ttsState === 'loading'}
                  title="TTS erzeugen und an Telegram senden"
                >
                  {ttsState === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  TTS
                </Button>
                {availableTtsVariants.map(variant => {
                  const isActive = tts.isCurrent(summary.id, variant.variantKey)
                  return (
                    <Button
                      key={variant.variantKey}
                      size="sm"
                      variant={isActive ? 'primary' : 'cancel'}
                      outline={!isActive}
                      onClick={() => handlePlayExistingVariant(variant.variantKey)}
                      title={`${variant.model} · ${variant.voice}`}
                    >
                      {isActive && tts.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {ttsModelShortLabel(variant.model)} · {variant.voice}
                    </Button>
                  )
                })}
              </>
            )}
            {/* accent + outline wie "In YT öffnen" in BrowseView – derselbe Link verdient
                dieselbe Farbe, egal von welcher Seite aus. */}
            <a href={summary.videoUrl} target="_blank" rel="noopener" className={buttonClasses({ variant: 'accent', outline: true, size: 'sm' })}>
              <ExternalLink className="w-3.5 h-3.5" /> YouTube
            </a>
            <Button size="sm" variant="danger" outline onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </Button>
          </div>
        </div>
        {ttsError && summary.status === 'done' && (
          <div className="px-5 pb-1 text-xs text-danger">{ttsError}</div>
        )}

        <div className="p-5">
          {summary.status === 'processing' && (
            <div className="flex items-center gap-3 text-primary mb-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Wird gerade verarbeitet...</span>
            </div>
          )}

          {summary.status === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/20 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger">Fehler bei der Verarbeitung</p>
                <p className="text-xs text-muted mt-1">{summary.errorMessage}</p>
                <Button size="sm" variant="danger" outline className="mt-3" onClick={handleRetryFromDetail} disabled={retrying} loading={retrying}>
                  <RotateCcw className="w-3.5 h-3.5" /> Refresh
                </Button>
              </div>
            </div>
          )}

          {summary.status === 'done' && chatOpen && (
            <SummaryChat
              key={summary.id}
              summaryId={summary.id}
              summaryHtml={htmlParts.join('')}
              summaryModel={summary.model}
            />
          )}

          {summary.status === 'done' && !chatOpen && (
            <>
              {htmlParts.map((part, i) => (
                <div key={i}>
                  <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: part }} />
                  {i < htmlParts.length - 1 && (
                    <PredictionsTable
                      key={summary.id}
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
              {htmlParts.length <= 1 && (
                <PredictionsTable
                  key={summary.id}
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

        {summary.status === 'done' && (
          <div className="border-t border-surfaceBorderSoft px-5 py-4 flex items-center gap-3">
            <User className="w-4 h-4 text-dim shrink-0" />
            {editingAuthor ? (
              <>
                <Input
                  type="text"
                  value={authorDraft}
                  onChange={e => setAuthorDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      updateAuthor(summary.id, authorDraft.trim()).then(() => {
                        setSummary(prev => prev ? { ...prev, author: authorDraft.trim() } : prev)
                        setEditingAuthor(false)
                      })
                    }
                  }}
                  autoFocus
                  size="sm"
                  className="flex-1"
                  placeholder="Autor / Sprecher eingeben..."
                />
                <Button
                  size="sm"
                  onClick={() => {
                    updateAuthor(summary.id, authorDraft.trim()).then(() => {
                      setSummary(prev => prev ? { ...prev, author: authorDraft.trim() } : prev)
                      setEditingAuthor(false)
                    })
                  }}
                >
                  <Save className="w-3.5 h-3.5" /> Speichern
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-content">
                  {summary.author || <span className="text-dim italic">Kein Autor hinterlegt</span>}
                </span>
                <Button size="sm" variant="cancel" outline onClick={() => { setAuthorDraft(summary.author ?? ''); setEditingAuthor(true) }}>
                  <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                </Button>
              </>
            )}
          </div>
        )}

        {summary.transcript && (
          <CollapsibleSection
            className="border-t border-surfaceBorderSoft px-5"
            open={showTranscript}
            onOpenChange={setShowTranscript}
            title={`Transkript (${summary.transcript.length.toLocaleString('de-DE')} Zeichen · ${summary.transcript.split(/\s+/).filter(Boolean).length.toLocaleString('de-DE')} Wörter)`}
            contentClassName="pb-5"
          >
            <div className="bg-inputBg rounded-sm p-4 text-xs text-content/70 leading-relaxed max-h-96 overflow-y-auto">
              {summary.transcript.replace(/\n/g, ' ')}
            </div>
          </CollapsibleSection>
        )}
      </Card>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => { setDeleteOpen(false); handleDelete() }}
        title="Zusammenfassung löschen"
        description="Möchtest du diese Zusammenfassung wirklich löschen? Das kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        variant="danger"
      />

      <TtsConfigModal
        open={ttsConfigOpen}
        description={summary?.videoTitle}
        draft={ttsDraft}
        onDraftChange={setTtsDraft}
        onClose={() => setTtsConfigOpen(false)}
        onSubmit={applyTtsConfigForSummary}
        submitDisabled={ttsLoading}
      />

      <Modal
        open={ttsAlreadyExistsOpen}
        onClose={() => {
          setTtsAlreadyExistsOpen(false)
          setPendingCachedVariantKey(null)
          setPendingCachedConfig(null)
        }}
        title="TTS schon vorhanden"
        description="Für die gewählten Einstellungen existiert bereits ein TTS. Willst du dieses jetzt abspielen?"
      >
        <ModalFooter>
          <Button
            variant="cancel"
            outline
            onClick={() => {
              setTtsAlreadyExistsOpen(false)
              setPendingCachedVariantKey(null)
              setPendingCachedConfig(null)
            }}
          >
            Abbrechen
          </Button>
          <Button onClick={() => { void playPendingCachedVariant() }}>Play</Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        title="Anderes Model"
        description="Wähle ein Modell für eine neue Zusammenfassung dieses Videos."
      >
        <div className="grid gap-2">
          {MODEL_OPTIONS.map(option => {
            const isUsed = usedModels.has(option.value)
            const isSelected = selectedModel === option.value
            return (
              <button
                key={option.value}
                onClick={() => setSelectedModel(option.value)}
                disabled={isUsed}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-sm transition-colors disabled:cursor-not-allowed ${
                  isUsed
                    ? 'border-surfaceBorder text-dim bg-inputBg'
                    : isSelected
                      ? 'border-primary/40 text-primary bg-primary/15'
                      : 'border-surfaceBorder text-content hover:bg-rowHover'
                }`}
              >
                <span className="text-left">
                  <span className="block">
                    {option.label}
                    {isUsed ? <span className="ml-2 text-[11px]">bereits genutzt</span> : null}
                  </span>
                  <span className={`block text-[11px] ${isUsed ? 'text-dim' : 'text-muted'}`}>
                    {MODEL_TIER_LABELS[option.tier]} · {option.hint}
                  </span>
                </span>
                <span className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-white' : 'border-surfaceBorder'}`}>
                  {isSelected ? <Check className="w-3 h-3" /> : null}
                </span>
              </button>
            )
          })}
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setModelModalOpen(false)}>Abbrechen</Button>
          <Button onClick={handleCreateWithModel} disabled={creatingModelSummary || usedModels.has(selectedModel)} loading={creatingModelSummary}>
            Zusammenfassung starten
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
