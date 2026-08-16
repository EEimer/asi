import { useEffect, useState } from 'react'
import { fetchSettings, updateSettings, resetTable, fetchCustomPrompts, createCustomPromptApi, updateCustomPromptApi, deleteCustomPromptApi } from '../api/endpoints'
import type { CustomPrompt } from '../api/endpoints'
import type { Settings, TtsModel, TtsVoice, ModelTier } from '../../shared/types'
import { DEFAULT_SETTINGS, MODEL_OPTIONS, MODEL_TIER_LABELS, LEGACY_MODEL_LABELS } from '../../shared/types'
import { Save, RotateCcw, Loader2, Check, Plus, X, Trash2, AlertTriangle, Pencil, Sun, Moon } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal, ModalFooter } from '../components/Modal'
import { SegmentedControl } from '../components/SegmentedControl'
import { Button } from '../components/ui/Button'
import { useToast } from '../store/toastStore'
import { useTheme, type Theme } from '../store/themeStore'

const LANG_OPTIONS = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
]

const BROWSER_OPTIONS = [
  { value: 'brave', label: 'Brave' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'safari', label: 'Safari' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'edge', label: 'Edge' },
]

const MODEL_TIERS: ModelTier[] = ['gut', 'mittel', 'beste']

const TTS_MODEL_OPTIONS: { value: TtsModel; label: string; hint: string }[] = [
  { value: 'tts-1', label: 'tts-1', hint: 'Schnell, günstig (~$15/1M chars, ~$0.015/min)' },
  { value: 'tts-1-hd', label: 'tts-1-hd', hint: 'Beste Qualität (~$30/1M chars, ~$0.030/min)' },
  { value: 'gpt-4o-mini-tts', label: 'gpt-4o-mini-tts', hint: 'Steuerbar via Instruktionen (~$15/1M chars, ~$0.015/min)' },
]

const TTS_CLASSIC_VOICES: TtsVoice[] = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const TTS_EXTENDED_VOICES: TtsVoice[] = ['ballad', 'verse', 'marin', 'cedar']

function availableVoices(model: TtsModel): TtsVoice[] {
  if (model === 'gpt-4o-mini-tts') return [...TTS_CLASSIC_VOICES, ...TTS_EXTENDED_VOICES]
  return TTS_CLASSIC_VOICES
}

type DangerTarget = 'summaries' | 'notes' | 'predictions' | 'settings' | null

const DANGER_LABELS: Record<string, { title: string; desc: string; confirm: string }> = {
  summaries: { title: 'Alle Zusammenfassungen löschen', desc: 'Alle Zusammenfassungen und zugehörige Prognosen werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  notes: { title: 'Alle Notizen löschen', desc: 'Alle Notizen werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  predictions: { title: 'Alle Prognosen löschen', desc: 'Alle Glaskugel-Einträge werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  settings: { title: 'Einstellungen zurücksetzen', desc: 'Alle Einstellungen werden auf Standardwerte zurückgesetzt. Prompt, blockierte Kanäle, Modell etc. gehen verloren.', confirm: 'Zurücksetzen' },
}

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [lastSavedSettings, setLastSavedSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dangerTarget, setDangerTarget] = useState<DangerTarget>(null)
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [editPrompt, setEditPrompt] = useState<CustomPrompt | null>(null)
  const [promptTitle, setPromptTitle] = useState('')
  const [promptText, setPromptText] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptDeleteTarget, setPromptDeleteTarget] = useState<string | null>(null)
  const { addToast } = useToast()
  /* Das Theme liegt bewusst NICHT in den Server-Settings: es ist eine Eigenschaft
     dieses Geräts, nicht des Accounts, und muss vor dem ersten Paint feststehen. */
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    fetchCustomPrompts().then(setCustomPrompts).catch(console.error)
  }, [])

  useEffect(() => {
    fetchSettings()
      .then(s => {
        setSettings(s)
        setLastSavedSettings(s)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateSettings(settings)
      setLastSavedSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setSaving(false) }
  }

  function handleCancel() {
    setSettings({ ...lastSavedSettings })
  }

  function addBlockedChannel(name: string) {
    if (!name || settings.blockedChannels.some(c => c.toLowerCase() === name.toLowerCase())) return
    const updated = [...settings.blockedChannels, name]
    setSettings(s => ({ ...s, blockedChannels: updated }))
    updateSettings({ blockedChannels: updated }).catch(console.error)
  }

  function removeBlockedChannel(name: string) {
    const updated = settings.blockedChannels.filter(c => c !== name)
    setSettings(s => ({ ...s, blockedChannels: updated }))
    updateSettings({ blockedChannels: updated }).catch(console.error)
  }

  function updateTtsModel(value: TtsModel) {
    setSettings(prev => {
      const options = availableVoices(value)
      const nextVoice = options.includes(prev.ttsVoice) ? prev.ttsVoice : 'nova'
      const nextInstructions = value === 'gpt-4o-mini-tts' ? prev.ttsInstructions : ''
      return { ...prev, ttsModel: value, ttsVoice: nextVoice, ttsInstructions: nextInstructions }
    })
  }

  async function handleDangerReset() {
    if (!dangerTarget) return
    try {
      await resetTable(dangerTarget)
      if (dangerTarget === 'settings') {
        setSettings({ ...DEFAULT_SETTINGS })
        await updateSettings(DEFAULT_SETTINGS)
      }
      addToast(DANGER_LABELS[dangerTarget].title + ' — erfolgreich', 'success', 3000)
    } catch (e: any) {
      addToast(`Fehler: ${e.message}`, 'error', 5000)
    }
    setDangerTarget(null)
  }

  function openNewPrompt() {
    setEditPrompt(null)
    setPromptTitle('')
    setPromptText('')
    setPromptModalOpen(true)
  }

  function openEditPrompt(p: CustomPrompt) {
    setEditPrompt(p)
    setPromptTitle(p.title)
    setPromptText(p.text)
    setPromptModalOpen(true)
  }

  async function handleSavePrompt() {
    if (!promptTitle.trim()) return
    setPromptSaving(true)
    try {
      if (editPrompt) {
        await updateCustomPromptApi(editPrompt.id, promptTitle.trim(), promptText.trim())
        setCustomPrompts(prev => prev.map(p => p.id === editPrompt.id ? { ...p, title: promptTitle.trim(), text: promptText.trim() } : p))
      } else {
        const created = await createCustomPromptApi(promptTitle.trim(), promptText.trim())
        setCustomPrompts(prev => [created, ...prev])
      }
      setPromptModalOpen(false)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setPromptSaving(false) }
  }

  async function handleDeletePrompt(id: string) {
    await deleteCustomPromptApi(id)
    setCustomPrompts(prev => prev.filter(p => p.id !== id))
    setPromptDeleteTarget(null)
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  return (
    <div>
      <h2 className="text-lg font-semibold text-content mb-6">Einstellungen</h2>

      <div className="space-y-6">
        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="block text-sm font-medium text-content">Erscheinungsbild</label>
              <p className="text-xs text-muted mt-0.5">
                Die Wahl gilt sofort und bleibt im Browser gespeichert. Ohne eigene Wahl folgt die App dem Betriebssystem.
              </p>
            </div>
            <SegmentedControl<Theme>
              values={['light', 'dark']}
              labels={[
                <span key="light" className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" /> Hell</span>,
                <span key="dark" className="flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" /> Dunkel</span>,
              ]}
              value={theme}
              onChange={setTheme}
              className="shrink-0"
            />
          </div>
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <label className="block text-sm font-medium text-content mb-2">Summary Prompt (Lang)</label>
          <p className="text-xs text-muted mb-3">Dieser Prompt wird vor jedes Transkript gesetzt und an OpenAI geschickt. Das Transkript wird automatisch ans Ende angehängt.</p>
          <textarea value={settings.summaryPrompt} onChange={e => setSettings(s => ({ ...s, summaryPrompt: e.target.value }))}
            rows={10} className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y font-mono" />
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <label className="block text-sm font-medium text-content mb-2">Summary Prompt (Kurz)</label>
          <p className="text-xs text-muted mb-3">Wird für den "Kurz"-Button verwendet — nur die wichtigsten Kernaussagen statt der vollen Struktur.</p>
          <textarea value={settings.shortSummaryPrompt} onChange={e => setSettings(s => ({ ...s, shortSummaryPrompt: e.target.value }))}
            rows={10} className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y font-mono" />
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-medium text-content">Custom Prompts</label>
              <p className="text-xs text-muted mt-0.5">Wiederverwendbare Prompt-Vorlagen für spezifische Zusammenfassungen.</p>
            </div>
            <Button size="sm" onClick={openNewPrompt}><Plus className="w-3.5 h-3.5" /> Neuen Prompt</Button>
          </div>
          {customPrompts.length === 0 ? (
            <p className="text-xs text-dim italic">Noch keine Custom Prompts angelegt</p>
          ) : (
            <div className="space-y-2">
              {customPrompts.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-inputBg border border-surfaceBorder rounded-lg">
                  <span className="text-sm text-content font-medium truncate">{p.title}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="xs" variant="ghost" iconOnly onClick={() => openEditPrompt(p)} className="text-dim hoverable:text-primary" title="Bearbeiten">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="xs" variant="ghost" iconOnly onClick={() => setPromptDeleteTarget(p.id)} className="text-dim hoverable:text-danger" title="Löschen">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-content mb-2">Sprache</label>
            <select value={settings.defaultLang} onChange={e => setSettings(s => ({ ...s, defaultLang: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40">
              {LANG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-2">Cookie Browser</label>
            <select value={settings.cookieBrowser} onChange={e => setSettings(s => ({ ...s, cookieBrowser: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40">
              {BROWSER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-2">KI Modell</label>
            <select value={settings.openaiModel} onChange={e => setSettings(s => ({ ...s, openaiModel: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40">
              {MODEL_TIERS.map(tier => (
                <optgroup key={tier} label={MODEL_TIER_LABELS[tier]}>
                  {MODEL_OPTIONS.filter(o => o.tier === tier).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
              {/* Gespeichertes Altmodell sichtbar halten, sonst zeigt das Feld
                  stillschweigend einen anderen Wert an als tatsächlich aktiv ist. */}
              {!MODEL_OPTIONS.some(o => o.value === settings.openaiModel) && settings.openaiModel && (
                <optgroup label="Aktuell gespeichert (nicht mehr in der Auswahl)">
                  <option value={settings.openaiModel}>
                    {LEGACY_MODEL_LABELS[settings.openaiModel] ?? settings.openaiModel}
                  </option>
                </optgroup>
              )}
            </select>
            <p className="mt-1 text-xs text-muted">
              {MODEL_OPTIONS.find(o => o.value === settings.openaiModel)?.hint ?? 'Älteres Modell — auf eine aktuelle Stufe wechseln empfohlen.'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-content mb-2">Parallele API-Requests</label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.apiConcurrency}
              onChange={e => {
                const n = Number(e.target.value)
                setSettings(s => ({ ...s, apiConcurrency: Number.isFinite(n) ? Math.min(10, Math.max(1, Math.floor(n))) : 1 }))
              }}
              className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1 text-xs text-muted">
              Wie viele KI-Requests gleichzeitig laufen dürfen. 1 = seriell, empfohlen bei niedrigem Rate Limit (429-Fehler).
              Fehlgeschlagene Requests werden automatisch bis zu 5x wiederholt.
            </p>
          </div>
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <h3 className="text-sm font-semibold text-content mb-3">Text-to-Speech</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content mb-2">TTS-Modell</label>
              <select
                value={settings.ttsModel}
                onChange={e => updateTtsModel(e.target.value as TtsModel)}
                className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {TTS_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">
                {TTS_MODEL_OPTIONS.find(o => o.value === settings.ttsModel)?.hint}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-2">Stimme</label>
              <select
                value={settings.ttsVoice}
                onChange={e => setSettings(s => ({ ...s, ttsVoice: e.target.value as TtsVoice }))}
                className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {availableVoices(settings.ttsModel).map(voice => {
                  const recommended = settings.ttsModel === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
                  return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
                })}
              </select>
            </div>
          </div>
          {settings.ttsModel === 'gpt-4o-mini-tts' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-content mb-2">Sprach-Instruktionen</label>
              <input
                type="text"
                value={settings.ttsInstructions}
                onChange={e => setSettings(s => ({ ...s, ttsInstructions: e.target.value }))}
                placeholder={'z.B. "Speak slowly and clearly in German"'}
                className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-xs text-muted">Nur verfügbar für gpt-4o-mini-tts. Steuert Ton, Tempo und Stil der Stimme.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button onClick={handleSave} disabled={saving} loading={saving}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Gespeichert' : 'Speichern'}
          </Button>
          <Button variant="cancel" outline onClick={handleCancel}>
            <RotateCcw className="w-4 h-4" /> Abbrechen
          </Button>
        </div>

        <div className="card-elevation bg-panel border border-surfaceBorder rounded-xl p-5">
          <label className="block text-sm font-medium text-content mb-1">Blockierte Kanäle</label>
          <p className="text-xs text-muted mb-3">Videos von diesen Kanälen werden im Browse-Feed ausgeblendet.</p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              id="blocked-channel-input"
              placeholder="Kanalname eingeben..."
              className="flex-1 px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const input = e.currentTarget
                  const val = input.value.trim()
                  addBlockedChannel(val)
                  input.value = ''
                }
              }}
            />
            <Button
              onClick={() => {
                const input = document.getElementById('blocked-channel-input') as HTMLInputElement
                const val = input.value.trim()
                addBlockedChannel(val)
                input.value = ''
              }}
            >
              <Plus className="w-4 h-4" /> Hinzufügen
            </Button>
          </div>

          {settings.blockedChannels.length === 0 ? (
            <p className="text-xs text-dim italic">Keine Kanäle blockiert</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {settings.blockedChannels.map(ch => (
                <span key={ch} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-inputBg text-content rounded-full border border-surfaceBorder">
                  {ch}
                  <button type="button" onClick={() => removeBlockedChannel(ch)}
                    className="text-dim hover:text-danger transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card-elevation bg-panel border border-danger/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-danger/10 border-b border-danger/20">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="text-sm font-semibold text-danger">Danger Zone</span>
          </div>
          <div className="p-5 space-y-3">
            {([
              { key: 'summaries' as const, label: 'Zusammenfassungen', desc: 'Alle Zusammenfassungen + zugehörige Prognosen löschen' },
              { key: 'predictions' as const, label: 'Glaskugel', desc: 'Alle Prognosen löschen' },
              { key: 'notes' as const, label: 'Notizen', desc: 'Alle Notizen löschen' },
              { key: 'settings' as const, label: 'Einstellungen', desc: 'Prompt, Modell, Sprache und blockierte Kanäle zurücksetzen' },
            ]).map(item => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-content">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
                <Button size="sm" variant="danger" outline className="shrink-0" onClick={() => setDangerTarget(item.key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {item.key === 'settings' ? 'Zurücksetzen' : 'Löschen'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {dangerTarget && (
        <ConfirmModal
          open
          onClose={() => setDangerTarget(null)}
          onConfirm={handleDangerReset}
          title={DANGER_LABELS[dangerTarget].title}
          description={DANGER_LABELS[dangerTarget].desc}
          confirmLabel={DANGER_LABELS[dangerTarget].confirm}
          variant="danger"
        />
      )}

      <Modal open={promptModalOpen} onClose={() => setPromptModalOpen(false)} title={editPrompt ? 'Prompt bearbeiten' : 'Neuen Prompt erstellen'}>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Titel"
            value={promptTitle}
            onChange={e => setPromptTitle(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <textarea
            placeholder="Prompt-Text..."
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-lg text-content placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y font-mono"
          />
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setPromptModalOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSavePrompt} disabled={promptSaving || !promptTitle.trim()} loading={promptSaving}>
            {editPrompt ? 'Speichern' : 'Erstellen'}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        open={!!promptDeleteTarget}
        onClose={() => setPromptDeleteTarget(null)}
        onConfirm={() => promptDeleteTarget && handleDeletePrompt(promptDeleteTarget)}
        title="Prompt löschen"
        description="Möchtest du diesen Custom Prompt wirklich löschen?"
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  )
}
