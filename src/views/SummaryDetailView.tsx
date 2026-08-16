import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSummary, deleteSummary, addPredictions, updateAuthor, createSummary, fetchVideoSummaries, retrySummary, fetchPredictions, fetchSettings, fetchTtsIndex, generateTts, getTtsAudioUrl, fetchSummaries } from '../api/endpoints'
import type { Summary, SummaryListItem, TtsIndex, TtsModel, TtsVoice } from '../../shared/types'
import { MODEL_OPTIONS, MODEL_TIER_LABELS, DEFAULT_SETTINGS, modelLabel } from '../../shared/types'
import { ArrowLeft, ArrowRight, ExternalLink, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Pencil, Save, User, Plus, Check, RotateCcw, Volume2, Pause, Play, SlidersHorizontal, Send, MessageSquare } from 'lucide-react'
import { marked } from 'marked'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { SummaryChat } from '../components/SummaryChat'
import { Button, buttonClasses } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../store/toastStore'
import { useAudioPlayer } from '../store/audioPlayerStore'

interface ParsedPrediction {
  name: string
  direction: string
  if_cases: string
  price_target: string
}

const TTS_CLASSIC_VOICES: TtsVoice[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const TTS_EXTENDED_VOICES: TtsVoice[] = ['ballad', 'verse', 'marin', 'cedar']

interface TtsVariantDraft {
  model: TtsModel
  voice: TtsVoice
  instructions: string
}

function modelShortLabel(model: string): string {
  return modelLabel(model)
}

function ttsModelShortLabel(model: TtsModel): string {
  if (model === 'tts-1') return 'tts-1'
  if (model === 'tts-1-hd') return 'tts-1-hd'
  return '4o-mini-tts'
}

function ttsVoiceOptions(model: TtsModel): TtsVoice[] {
  if (model === 'gpt-4o-mini-tts') return [...TTS_CLASSIC_VOICES, ...TTS_EXTENDED_VOICES]
  return TTS_CLASSIC_VOICES
}

function normalizeInstructions(value: string): string {
  return value.trim()
}

function estimateDurationSecondsFromText(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 0
  return Math.max(1, Math.round(normalized.length / 14))
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

const EDIT_INPUT_CLS = 'w-full text-xs px-2 py-1.5 border border-surfaceBorder rounded-sm bg-inputBg text-content focus:outline-none focus:ring-1 focus:ring-primary/40'
const EDIT_TEXTAREA_CLS = `${EDIT_INPUT_CLS} resize-y leading-snug`
const EDIT_CELL_CLS = 'w-full text-left -mx-1 px-1 py-0.5 rounded cursor-text hover:bg-accent/10 hover:ring-1 hover:ring-accent/20 transition-colors'

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
    setDirectAdding(true)
    try {
      await addPredictions({
        summaryId,
        videoTitle,
        videoUrl,
        channelName,
        author,
        predictions: [{ name, direction: newDirection, if_cases: ifCases, price_target: priceTarget }],
      })
      setNewName('')
      setNewDirection('neutral')
      setNewTarget('')
      setNewIfCases('')
      setItems(prev => [...prev, { name, direction: newDirection, if_cases: ifCases, price_target: priceTarget }])
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
                      <input
                        type="text"
                        autoFocus={editingField === 'name'}
                        value={draft.name}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        onKeyDown={handleEditKey}
                        placeholder="Asset"
                        className={EDIT_INPUT_CLS}
                      />
                    ) : (
                      <button type="button" onClick={() => startEdit(i, 'name')} className={EDIT_CELL_CLS} title="Bearbeiten">
                        {p.name || <span className="text-faint">—</span>}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 ${isEditing ? 'align-top' : ''}`}>
                    {isEditing ? (
                      <select
                        autoFocus={editingField === 'direction'}
                        value={draft.direction}
                        onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}
                        onKeyDown={handleEditKey}
                        className={EDIT_INPUT_CLS}
                      >
                        {!['long', 'short', 'neutral'].includes(draft.direction) && <option value={draft.direction}>{draft.direction || '—'}</option>}
                        <option value="long">long</option>
                        <option value="short">short</option>
                        <option value="neutral">neutral</option>
                      </select>
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
                      <textarea
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
                      <textarea
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
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Asset"
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-surfaceBorder rounded-sm bg-inputBg text-content focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-2.5">
                <select
                  value={newDirection}
                  onChange={e => setNewDirection(e.target.value)}
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-surfaceBorder rounded-sm bg-inputBg text-content focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                >
                  <option value="long">long</option>
                  <option value="short">short</option>
                  <option value="neutral">neutral</option>
                </select>
              </td>
              <td className="px-4 py-2.5">
                <input
                  type="text"
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  placeholder="Kursziel"
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-surfaceBorder rounded-sm bg-inputBg text-content focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-2.5">
                <input
                  type="text"
                  value={newIfCases}
                  onChange={e => setNewIfCases(e.target.value)}
                  placeholder="Bedingung"
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-surfaceBorder rounded-sm bg-inputBg text-content focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
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
  const [ttsDefaults, setTtsDefaults] = useState<TtsVariantDraft>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsConfig, setTtsConfig] = useState<TtsVariantDraft>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsDraft, setTtsDraft] = useState<TtsVariantDraft>({ model: 'tts-1-hd', voice: 'nova', instructions: '' })
  const [ttsConfigOpen, setTtsConfigOpen] = useState(false)
  const [ttsIndex, setTtsIndex] = useState<TtsIndex>({})
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsError, setTtsError] = useState('')
  const [ttsAlreadyExistsOpen, setTtsAlreadyExistsOpen] = useState(false)
  const [pendingCachedVariantKey, setPendingCachedVariantKey] = useState<string | null>(null)
  const [pendingCachedConfig, setPendingCachedConfig] = useState<TtsVariantDraft | null>(null)
  const player = useAudioPlayer()
  const { addToast } = useToast()

  useEffect(() => {
    if (!id) return
    let active = true
    const load = async () => {
      try {
        const s = await fetchSummary(id)
        if (active) setSummary(s)
        if (active) setSelectedModel(s.model || DEFAULT_SETTINGS.openaiModel)
        if (active && s.status === 'processing') setTimeout(load, 3000)
      } catch { /* ignore */ }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [id])

  useEffect(() => {
    let active = true
    const loadTtsConfig = async () => {
      try {
        const [settings, index] = await Promise.all([fetchSettings(), fetchTtsIndex()])
        if (!active) return
        const defaults: TtsVariantDraft = {
          model: settings.ttsModel,
          voice: settings.ttsVoice,
          instructions: settings.ttsInstructions,
        }
        setTtsDefaults(defaults)
        setTtsConfig(defaults)
        setTtsIndex(index)
      } catch {
        // ignore
      }
    }
    loadTtsConfig()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!id || summary?.status !== 'processing') return
    const timeout = setTimeout(async () => {
      try {
        const s = await fetchSummary(id)
        setSummary(s)
        setSelectedModel(s.model || DEFAULT_SETTINGS.openaiModel)
      } catch {
        /* ignore */
      }
    }, 3000)
    return () => clearTimeout(timeout)
  }, [id, summary?.status])

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

  useEffect(() => {
    if (!summary) return
    setTtsConfig(ttsDefaults)
    setTtsLoading(false)
    setTtsError('')
  }, [summary?.id, ttsDefaults])

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

  function updateTtsModel(model: TtsModel) {
    setTtsDraft(prev => {
      const options = ttsVoiceOptions(model)
      const nextVoice = options.includes(prev.voice) ? prev.voice : 'nova'
      const nextInstructions = model === 'gpt-4o-mini-tts' ? prev.instructions : ''
      return { ...prev, model, voice: nextVoice, instructions: nextInstructions }
    })
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

  function findCachedVariantKey(summaryId: string, draft: TtsVariantDraft): string | null {
    const summaryEntry = ttsIndex[summaryId]
    if (!summaryEntry) return null
    for (const [variantKey, variant] of Object.entries(summaryEntry.variants)) {
      if (
        variant.model === draft.model
        && variant.voice === draft.voice
        && normalizeInstructions(variant.instructions) === normalizeInstructions(draft.instructions)
      ) {
        return variantKey
      }
    }
    return null
  }

  async function handleTtsPlay(configOverride?: TtsVariantDraft) {
    if (!summary || summary.status !== 'done' || !summary.summary) return
    const effectiveConfig = configOverride ?? ttsConfig
    const cachedVariant = findCachedVariantKey(summary.id, effectiveConfig)
    const isSameVariant = !!cachedVariant
      && player.track?.summaryId === summary.id
      && player.track.variantKey === cachedVariant

    if (isSameVariant && player.isPlaying) {
      player.pause()
      return
    }
    if (isSameVariant && !player.isPlaying) {
      await player.resume()
      return
    }
    if (cachedVariant) {
      setPendingCachedVariantKey(cachedVariant)
      setPendingCachedConfig(effectiveConfig)
      setTtsAlreadyExistsOpen(true)
      return
    }
    setTtsError('')
    setTtsLoading(true)
    try {
      const result = await generateTts({
        summaryId: summary.id,
        text: summary.summary,
        model: effectiveConfig.model,
        voice: effectiveConfig.voice,
        instructions: effectiveConfig.instructions,
      })
      const refreshedIndex = await fetchTtsIndex()
      setTtsIndex(refreshedIndex)
      await player.playTrack(result.audioUrl, {
        summaryId: summary.id,
        variantKey: result.variantKey,
        title: summary.videoTitle || 'Summary',
        durationHintSeconds: result.durationSeconds,
      })
    } catch (e: any) {
      setTtsError(e?.message ?? 'TTS fehlgeschlagen')
    } finally {
      setTtsLoading(false)
    }
  }

  async function playPendingCachedVariant() {
    if (!summary || !pendingCachedVariantKey) return
    const variantKey = pendingCachedVariantKey
    const chosenConfig = pendingCachedConfig
    setTtsAlreadyExistsOpen(false)
    setPendingCachedVariantKey(null)
    setPendingCachedConfig(null)
    if (chosenConfig) setTtsConfig(chosenConfig)
    setTtsError('')
    setTtsLoading(true)
    try {
      await player.playTrack(getTtsAudioUrl(summary.id, variantKey), {
        summaryId: summary.id,
        variantKey,
        title: summary.videoTitle || 'Summary',
        durationHintSeconds: ttsIndex[summary.id]?.variants?.[variantKey]?.durationSeconds ?? estimateDurationSecondsFromText(summary.summary ?? ''),
      })
    } catch (e: any) {
      setTtsError(e?.message ?? 'TTS konnte nicht abgespielt werden')
    } finally {
      setTtsLoading(false)
    }
  }

  async function handlePlayExistingVariant(variantKey: string) {
    if (!summary || summary.status !== 'done') return
    const isSameVariant = player.track?.summaryId === summary.id && player.track.variantKey === variantKey
    if (isSameVariant && player.isPlaying) {
      player.pause()
      return
    }
    if (isSameVariant && !player.isPlaying) {
      await player.resume()
      return
    }
    setTtsError('')
    setTtsLoading(true)
    try {
      await player.playTrack(getTtsAudioUrl(summary.id, variantKey), {
        summaryId: summary.id,
        variantKey,
        title: summary.videoTitle || 'Summary',
        durationHintSeconds: ttsIndex[summary.id]?.variants?.[variantKey]?.durationSeconds ?? estimateDurationSecondsFromText(summary.summary ?? ''),
      })
      const variant = ttsIndex[summary.id]?.variants?.[variantKey]
      if (variant) {
        setTtsConfig({
          model: variant.model as TtsModel,
          voice: variant.voice as TtsVoice,
          instructions: variant.instructions,
        })
      }
    } catch (e: any) {
      setTtsError(e?.message ?? 'TTS konnte nicht abgespielt werden')
    } finally {
      setTtsLoading(false)
    }
  }

  async function handleTtsSendToTelegram(configOverride?: TtsVariantDraft) {
    if (!summary || summary.status !== 'done' || !summary.summary) return
    const effectiveConfig = configOverride ?? ttsConfig
    setTtsError('')
    setTtsLoading(true)
    try {
      await generateTts({
        summaryId: summary.id,
        text: summary.summary,
        model: effectiveConfig.model,
        voice: effectiveConfig.voice,
        instructions: effectiveConfig.instructions,
        sendToTelegram: true,
      })
      const refreshedIndex = await fetchTtsIndex()
      setTtsIndex(refreshedIndex)
      addToast('TTS an Telegram gesendet', 'success', 3000)
    } catch (e: any) {
      setTtsError(e?.message ?? 'TTS konnte nicht an Telegram gesendet werden')
    } finally {
      setTtsLoading(false)
    }
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
    if (!summary) return false
    return !!findCachedVariantKey(summary.id, ttsConfig)
  }, [summary?.id, ttsConfig, ttsIndex])

  const summaryCharCount = useMemo(() => (summary?.summary ?? '').length, [summary?.summary])
  const summaryWordCount = useMemo(() => (summary?.summary ?? '').trim().split(/\s+/).filter(Boolean).length, [summary?.summary])

  const availableTtsVariants = useMemo(() => {
    if (!summary) return [] as { variantKey: string; model: TtsModel; voice: TtsVoice; instructions: string; createdAt: string }[]
    const variants = ttsIndex[summary.id]?.variants ?? {}
    return Object.entries(variants)
      .map(([variantKey, value]) => ({
        variantKey,
        model: value.model as TtsModel,
        voice: value.voice as TtsVoice,
        instructions: value.instructions,
        createdAt: value.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [summary?.id, ttsIndex])

  const ttsState = useMemo<'idle' | 'loading' | 'playing' | 'paused'>(() => {
    if (ttsLoading) return 'loading'
    if (!summary) return 'idle'
    if (player.track?.summaryId !== summary.id) return 'idle'
    return player.isPlaying ? 'playing' : 'paused'
  }, [ttsLoading, summary?.id, player.track?.summaryId, player.isPlaying])

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

      <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl overflow-hidden">
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
                    {modelShortLabel(summary.model)}
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
                {modelShortLabel(v.model)}
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
                  const isActive = player.track?.summaryId === summary.id && player.track.variantKey === variant.variantKey
                  return (
                    <Button
                      key={variant.variantKey}
                      size="sm"
                      variant={isActive ? 'primary' : 'cancel'}
                      outline={!isActive}
                      onClick={() => handlePlayExistingVariant(variant.variantKey)}
                      title={`${variant.model} · ${variant.voice}`}
                    >
                      {isActive && player.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
                <input
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
                  className="flex-1 h-8 text-sm bg-inputBg text-content border border-surfaceBorder rounded-sm px-3 focus:outline-none focus:ring-1 focus:ring-primary/40"
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
          <div className="border-t border-surfaceBorderSoft">
            <button type="button" onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between p-5 text-sm text-muted hover:bg-rowHover transition-colors">
              <span>Transkript ({summary.transcript.length.toLocaleString('de-DE')} Zeichen · {summary.transcript.split(/\s+/).filter(Boolean).length.toLocaleString('de-DE')} Wörter)</span>
              {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showTranscript && (
              <div className="px-5 pb-5">
                <div className="bg-inputBg rounded-lg p-4 text-xs text-muted leading-relaxed max-h-96 overflow-y-auto">{summary.transcript.replace(/\n/g, ' ')}</div>
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

      <Modal
        open={ttsConfigOpen}
        onClose={() => setTtsConfigOpen(false)}
        title="TTS Config"
        description={summary?.videoTitle || 'Nur für diese Summary. Globale Defaults bleiben unverändert.'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content mb-1">Modell</label>
            <select
              value={ttsDraft.model}
              onChange={e => updateTtsModel(e.target.value as TtsModel)}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="tts-1">tts-1</option>
              <option value="tts-1-hd">tts-1-hd</option>
              <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-1">Stimme</label>
            <select
              value={ttsDraft.voice}
              onChange={e => setTtsDraft(prev => ({ ...prev, voice: e.target.value as TtsVoice }))}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {ttsVoiceOptions(ttsDraft.model).map(voice => {
                const recommended = ttsDraft.model === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
                return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
              })}
            </select>
          </div>
          {ttsDraft.model === 'gpt-4o-mini-tts' && (
            <div>
              <label className="block text-sm font-medium text-content mb-1">Instruktionen</label>
              <input
                type="text"
                value={ttsDraft.instructions}
                onChange={e => setTtsDraft(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder={'z.B. "Speak slowly and clearly in German"'}
                className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setTtsConfigOpen(false)}>Abbrechen</Button>
          <Button onClick={applyTtsConfigForSummary} disabled={ttsLoading}>TTS</Button>
        </ModalFooter>
      </Modal>

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
