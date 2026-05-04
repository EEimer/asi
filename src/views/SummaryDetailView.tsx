import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSummary, deleteSummary, addPredictions, updateAuthor, createSummary, fetchVideoSummaries, retrySummary, fetchPredictions, fetchSettings, fetchTtsIndex, generateTts, getTtsAudioUrl, fetchSummaries } from '../api/endpoints'
import type { Summary, SummaryListItem, TtsIndex, TtsModel, TtsVoice } from '../../shared/types'
import { ArrowLeft, ArrowRight, ExternalLink, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Pencil, Save, User, Plus, Check, RotateCcw, Volume2, Pause, Play, SlidersHorizontal, Send } from 'lucide-react'
import { marked } from 'marked'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { useToast } from '../store/toastStore'
import { useAudioPlayer } from '../store/audioPlayerStore'

interface ParsedPrediction {
  name: string
  direction: string
  if_cases: string
  price_target: string
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o', shortLabel: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', shortLabel: '4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', shortLabel: 'GPT-4 Turbo' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', shortLabel: 'Haiku' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', shortLabel: 'Sonnet' },
  { value: 'claude-opus-4-1', label: 'Claude Opus', shortLabel: 'Opus' },
]

const TTS_CLASSIC_VOICES: TtsVoice[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const TTS_EXTENDED_VOICES: TtsVoice[] = ['ballad', 'verse', 'marin', 'cedar']

interface TtsVariantDraft {
  model: TtsModel
  voice: TtsVoice
  instructions: string
}

function modelLabel(model: string): string {
  return MODEL_OPTIONS.find(m => m.value === model)?.label ?? model
}

function modelShortLabel(model: string): string {
  return MODEL_OPTIONS.find(m => m.value === model)?.shortLabel ?? model
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
  const [items, setItems] = useState<ParsedPrediction[]>(predictions)
  const [addingRow, setAddingRow] = useState<number | null>(null)
  const [addedRows, setAddedRows] = useState<Set<string>>(new Set())
  const [directAdding, setDirectAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDirection, setNewDirection] = useState('neutral')
  const [newTarget, setNewTarget] = useState('')
  const [newIfCases, setNewIfCases] = useState('')
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
        <h3 className="text-base font-semibold text-slate-900">Assets & Prognosen</h3>
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Asset</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Richtung</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Kursziel</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Bedingung</th>
              <th className="w-24 px-3 py-2 text-center">Add</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) => {
              const { cls, Icon } = directionBadge(p.direction)
              const isAdded = addedRows.has(rowKey(p))
              return (
                <tr key={i} className="border-t border-slate-100 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cls}`}>
                      <Icon className="w-3 h-3" /> {p.direction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{p.price_target}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{p.if_cases}</td>
                  <td className="w-24 px-3 py-2.5 text-center">
                    <button
                      onClick={() => handleAddRow(p, i)}
                      disabled={addingRow === i || isAdded}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors disabled:opacity-60 ${isAdded ? 'text-success border border-success/30 bg-success/10' : 'text-accent border border-accent/30 bg-accent/10 hover:bg-accent/20'}`}
                    >
                      {addingRow === i ? <Loader2 className="w-3 h-3 animate-spin" /> : isAdded ? <Check className="w-3 h-3" /> : <><Plus className="w-3 h-3" /> Add</>}
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-slate-200 bg-slate-50/40">
              <td className="px-4 py-2.5">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Asset"
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-2.5">
                <select
                  value={newDirection}
                  onChange={e => setNewDirection(e.target.value)}
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
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
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-2.5">
                <input
                  type="text"
                  value={newIfCases}
                  onChange={e => setNewIfCases(e.target.value)}
                  placeholder="Bedingung"
                  disabled={directAdding}
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                />
              </td>
              <td className="w-24 px-3 py-2.5 text-center">
                <button
                  onClick={handleAddCustomRow}
                  disabled={directAdding}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-accent border border-accent/30 bg-accent/10 rounded-md hover:bg-accent/20 transition-colors disabled:opacity-40"
                >
                  {directAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} ADD
                </button>
              </td>
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingAuthor, setEditingAuthor] = useState(false)
  const [authorDraft, setAuthorDraft] = useState('')
  const [versions, setVersions] = useState<SummaryListItem[]>([])
  const [summaryOrder, setSummaryOrder] = useState<SummaryListItem[]>([])
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
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
        if (active) setSelectedModel(s.model || 'gpt-4o')
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
        setSelectedModel(s.model || 'gpt-4o')
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

  const { previousSummaryId, nextSummaryId } = useMemo(() => {
    if (!id || !summaryOrder.length) return { previousSummaryId: null as string | null, nextSummaryId: null as string | null }
    const currentIndex = summaryOrder.findIndex(item => item.id === id)
    if (currentIndex < 0) return { previousSummaryId: null, nextSummaryId: null }
    return {
      previousSummaryId: summaryOrder[currentIndex - 1]?.id ?? null,
      nextSummaryId: summaryOrder[currentIndex + 1]?.id ?? null,
    }
  }, [id, summaryOrder])

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
  if (!summary) return <div className="text-center py-20 text-slate-500">Nicht gefunden</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => previousSummaryId && navigate(`/summaries/${previousSummaryId}`)}
          disabled={!previousSummaryId}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" /> Vorheriger
        </button>
        <button
          onClick={() => nextSummaryId && navigate(`/summaries/${nextSummaryId}`)}
          disabled={!nextSummaryId}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Nächster <ArrowRight className="w-4 h-4" />
        </button>
      </div>

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
                {summary.author && !/^(nicht angegeben|unbekannt|unknown|n\/a|-|–)$/i.test(summary.author.trim()) && summary.author !== summary.channelName && <span className="text-white/60"> · {summary.author}</span>}
              </p>
              {summary.model && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border text-violet-100 border-violet-200/60 bg-violet-500/30">
                    {modelShortLabel(summary.model)}
                  </span>
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border text-white/90 border-white/40 bg-black/30">
                    {summaryCharCount.toLocaleString('de-DE')} Chars
                  </span>
                  <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border text-white/90 border-white/40 bg-black/30">
                    {summaryWordCount.toLocaleString('de-DE')} Wörter
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setModelModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Anderes Model
            </button>
            {versionsByModel.map(v => (
              <button
                key={v.id}
                onClick={() => navigate(`/summaries/${v.id}`)}
                disabled={v.id === summary.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors disabled:opacity-100 ${
                  v.id === summary.id
                    ? 'border-violet-300 text-violet-700 bg-violet-50'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {modelShortLabel(v.model)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {summary.status === 'done' && (
              <>
                <button
                  onClick={() => { void handleTtsPlay() }}
                  disabled={ttsState === 'loading'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
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
                  {hasCachedVariant ? <span className="w-2 h-2 rounded-full bg-emerald-500" /> : null}
                </button>
                <button
                  onClick={openTtsConfig}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> TTS Config
                </button>
                <button
                  onClick={() => { void handleTtsSendToTelegram() }}
                  disabled={ttsState === 'loading'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                  title="TTS erzeugen und an Telegram senden"
                >
                  {ttsState === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  TTS
                </button>
                {availableTtsVariants.map(variant => {
                  const isActive = player.track?.summaryId === summary.id && player.track.variantKey === variant.variantKey
                  return (
                    <button
                      key={variant.variantKey}
                      onClick={() => handlePlayExistingVariant(variant.variantKey)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-lg transition-colors ${
                        isActive
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title={`${variant.model} · ${variant.voice}`}
                    >
                      {isActive
                        ? (player.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />)
                        : <Play className="w-3.5 h-3.5" />}
                      {ttsModelShortLabel(variant.model)} · {variant.voice}
                    </button>
                  )
                })}
              </>
            )}
            <a href={summary.videoUrl} target="_blank" rel="noopener" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> YouTube
            </a>
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 text-danger hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
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
            <div className="flex items-start gap-3 p-4 bg-danger/5 border border-danger/20 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger">Fehler bei der Verarbeitung</p>
                <p className="text-xs text-slate-600 mt-1">{summary.errorMessage}</p>
                <button
                  onClick={handleRetryFromDetail}
                  disabled={retrying}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-danger/30 text-danger rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Refresh
                </button>
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
              {htmlParts.length <= 1 && (
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

        {summary.status === 'done' && (
          <div className="border-t border-slate-100 px-5 py-4 flex items-center gap-3">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
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
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  placeholder="Autor / Sprecher eingeben..."
                />
                <button
                  onClick={() => {
                    updateAuthor(summary.id, authorDraft.trim()).then(() => {
                      setSummary(prev => prev ? { ...prev, author: authorDraft.trim() } : prev)
                      setEditingAuthor(false)
                    })
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" /> Speichern
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-700">
                  {summary.author || <span className="text-slate-400 italic">Kein Autor hinterlegt</span>}
                </span>
                <button
                  onClick={() => { setAuthorDraft(summary.author ?? ''); setEditingAuthor(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                </button>
              </>
            )}
          </div>
        )}

        {summary.transcript && (
          <div className="border-t border-slate-100">
            <button onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between p-5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
              <span>Transkript ({summary.transcript.length.toLocaleString('de-DE')} Zeichen · {summary.transcript.split(/\s+/).filter(Boolean).length.toLocaleString('de-DE')} Wörter)</span>
              {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showTranscript && (
              <div className="px-5 pb-5">
                <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600 leading-relaxed max-h-96 overflow-y-auto">{summary.transcript.replace(/\n/g, ' ')}</div>
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
            <label className="block text-sm font-medium text-slate-800 mb-1">Modell</label>
            <select
              value={ttsDraft.model}
              onChange={e => updateTtsModel(e.target.value as TtsModel)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            >
              <option value="tts-1">tts-1</option>
              <option value="tts-1-hd">tts-1-hd</option>
              <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1">Stimme</label>
            <select
              value={ttsDraft.voice}
              onChange={e => setTtsDraft(prev => ({ ...prev, voice: e.target.value as TtsVoice }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            >
              {ttsVoiceOptions(ttsDraft.model).map(voice => {
                const recommended = ttsDraft.model === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
                return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
              })}
            </select>
          </div>
          {ttsDraft.model === 'gpt-4o-mini-tts' && (
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1">Instruktionen</label>
              <input
                type="text"
                value={ttsDraft.instructions}
                onChange={e => setTtsDraft(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder={'z.B. "Speak slowly and clearly in German"'}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
            </div>
          )}
        </div>
        <ModalFooter>
          <button
            onClick={() => setTtsConfigOpen(false)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={applyTtsConfigForSummary}
            disabled={ttsLoading}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            TTS
          </button>
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
          <button
            onClick={() => {
              setTtsAlreadyExistsOpen(false)
              setPendingCachedVariantKey(null)
              setPendingCachedConfig(null)
            }}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => { void playPendingCachedVariant() }}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Play
          </button>
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
                className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors disabled:cursor-not-allowed ${
                  isUsed
                    ? 'border-slate-200 text-slate-400 bg-slate-100'
                    : isSelected
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>
                  {option.label}
                  {isUsed ? <span className="ml-2 text-[11px]">bereits genutzt</span> : null}
                </span>
                <span className={`w-4 h-4 rounded border inline-flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-white' : 'border-slate-300'}`}>
                  {isSelected ? <Check className="w-3 h-3" /> : null}
                </span>
              </button>
            )
          })}
        </div>
        <ModalFooter>
          <button
            onClick={() => setModelModalOpen(false)}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleCreateWithModel}
            disabled={creatingModelSummary || usedModels.has(selectedModel)}
            className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {creatingModelSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Zusammenfassung starten
          </button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
