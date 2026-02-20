import { useEffect, useState } from 'react'
import { fetchSettings, updateSettings, resetTable } from '../api/endpoints'
import type { Settings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { Save, RotateCcw, Loader2, Check, Plus, X, Trash2, AlertTriangle } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { useToast } from '../store/toastStore'

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

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (günstiger)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
]

type DangerTarget = 'summaries' | 'notes' | 'predictions' | 'settings' | null

const DANGER_LABELS: Record<string, { title: string; desc: string; confirm: string }> = {
  summaries: { title: 'Alle Zusammenfassungen löschen', desc: 'Alle Zusammenfassungen und zugehörige Prognosen werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  notes: { title: 'Alle Notizen löschen', desc: 'Alle Notizen werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  predictions: { title: 'Alle Prognosen löschen', desc: 'Alle Glaskugel-Einträge werden unwiderruflich gelöscht.', confirm: 'Alle löschen' },
  settings: { title: 'Einstellungen zurücksetzen', desc: 'Alle Einstellungen werden auf Standardwerte zurückgesetzt. Prompt, blockierte Kanäle, Modell etc. gehen verloren.', confirm: 'Zurücksetzen' },
}

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [dangerTarget, setDangerTarget] = useState<DangerTarget>(null)
  const { addToast } = useToast()

  useEffect(() => {
    fetchSettings().then(s => setSettings(s)).catch(console.error).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setSaving(false) }
  }

  function handleReset() {
    setSettings({ ...DEFAULT_SETTINGS })
    setResetOpen(false)
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

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900 mb-6">Einstellungen</h2>

      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <label className="block text-sm font-medium text-slate-800 mb-2">Summary Prompt</label>
          <p className="text-xs text-slate-500 mb-3">Dieser Prompt wird vor jedes Transkript gesetzt und an OpenAI geschickt. Das Transkript wird automatisch ans Ende angehängt.</p>
          <textarea value={settings.summaryPrompt} onChange={e => setSettings(s => ({ ...s, summaryPrompt: e.target.value }))}
            rows={10} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-y font-mono" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-2">Sprache</label>
            <select value={settings.defaultLang} onChange={e => setSettings(s => ({ ...s, defaultLang: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40">
              {LANG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-2">Cookie Browser</label>
            <select value={settings.cookieBrowser} onChange={e => setSettings(s => ({ ...s, cookieBrowser: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40">
              {BROWSER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-2">OpenAI Model</label>
            <select value={settings.openaiModel} onChange={e => setSettings(s => ({ ...s, openaiModel: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/40">
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <label className="block text-sm font-medium text-slate-800 mb-1">Blockierte Kanäle</label>
          <p className="text-xs text-slate-500 mb-3">Videos von diesen Kanälen werden im Browse-Feed ausgeblendet.</p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              id="blocked-channel-input"
              placeholder="Kanalname eingeben..."
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const input = e.currentTarget
                  const val = input.value.trim()
                  addBlockedChannel(val)
                  input.value = ''
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const input = document.getElementById('blocked-channel-input') as HTMLInputElement
                const val = input.value.trim()
                addBlockedChannel(val)
                input.value = ''
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Hinzufügen
            </button>
          </div>

          {settings.blockedChannels.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Keine Kanäle blockiert</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {settings.blockedChannels.map(ch => (
                <span key={ch} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                  {ch}
                  <button onClick={() => removeBlockedChannel(ch)}
                    className="text-slate-400 hover:text-danger transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Speichern...' : saved ? 'Gespeichert' : 'Speichern'}
          </button>
          <button onClick={() => setResetOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            <RotateCcw className="w-4 h-4" /> Zurücksetzen
          </button>
        </div>

        <div className="bg-white border border-danger/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-danger/5 border-b border-danger/20">
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
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <button
                  onClick={() => setDangerTarget(item.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-danger/40 text-danger rounded-lg hover:bg-danger/5 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {item.key === 'settings' ? 'Zurücksetzen' : 'Löschen'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Einstellungen zurücksetzen"
        description="Alle Einstellungen auf Standardwerte zurücksetzen? Blockierte Kanäle werden ebenfalls gelöscht."
        confirmLabel="Zurücksetzen"
        variant="warning"
      />

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
    </div>
  )
}
