import { useState } from 'react'
import { Loader2, LinkIcon, Sparkles, Wand2 } from 'lucide-react'
import type { CustomPrompt, SummaryDetail } from '../../shared/types'
import { MODEL_OPTIONS, DEFAULT_SETTINGS, SUMMARY_DETAIL_LABELS } from '../../shared/types'
import { createSummary, fetchCustomPrompts, fetchSettings } from '../api/endpoints'
import { Modal, ModalFooter } from './Modal'
import { SegmentedControl } from './SegmentedControl'
import { Button, Input } from './ui'
import { useToast } from '../store/toastStore'
import { useSummaryLaunch } from '../store/summaryLaunchStore'

const YT_ID_RE = /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/

/**
 * Beide Wege, ein Video von Hand zusammenzufassen, standen frueher nur in der
 * Browse-Toolbar – fuer einen neuen Lauf musste man erst dorthin zurueck. Hier in
 * der Kopfzeile sind sie aus jedem View erreichbar; BrowseView erfaehrt den Start
 * ueber den summaryLaunchStore.
 */
export default function NavSummarizeActions() {
  const addToast = useToast(s => s.addToast)
  const announce = useSummaryLaunch(s => s.announce)

  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualDetail, setManualDetail] = useState<SummaryDetail>('long')
  const [submitting, setSubmitting] = useState(false)

  const [customPromptModalOpen, setCustomPromptModalOpen] = useState(false)
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [customPromptsLoading, setCustomPromptsLoading] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [customPromptUrl, setCustomPromptUrl] = useState('')
  const [customPromptSubmitting, setCustomPromptSubmitting] = useState(false)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SETTINGS.openaiModel)

  async function handleManualUrl() {
    const url = manualUrl.trim()
    if (!url) return
    const match = url.match(YT_ID_RE)
    if (!match) { addToast('Kein gültiger YouTube Link', 'error'); return }

    setSubmitting(true)
    try {
      const result = await createSummary(url, undefined, undefined, undefined, undefined, manualDetail)
      announce({ videoId: match[1], summaryId: result.id, url, detail: manualDetail })
      setManualUrl('')
      setLinkModalOpen(false)
      addToast('Zusammenfassung gestartet', 'success', 3200, '/browse')
    } catch (e: any) { addToast(`Fehler: ${e.message}`, 'error') }
    finally { setSubmitting(false) }
  }

  async function openCustomPromptModal() {
    setCustomPromptUrl('')
    setSelectedPromptId(null)
    setCustomPromptModalOpen(true)
    setCustomPromptsLoading(true)
    try {
      const [prompts, settings] = await Promise.all([fetchCustomPrompts(), fetchSettings()])
      setCustomPrompts(prompts)
      setSelectedPromptId(prompts[0]?.id ?? null)
      setSelectedModel(settings.openaiModel)
    } catch {}
    finally { setCustomPromptsLoading(false) }
  }

  async function handleCustomPromptSubmit() {
    const url = customPromptUrl.trim()
    if (!url || !selectedPromptId) return
    const match = url.match(YT_ID_RE)
    if (!match) { addToast('Kein gültiger YouTube Link', 'error'); return }
    const prompt = customPrompts.find(p => p.id === selectedPromptId)
    if (!prompt) return

    setCustomPromptSubmitting(true)
    try {
      const result = await createSummary(url, undefined, undefined, selectedModel, prompt.text)
      announce({ videoId: match[1], summaryId: result.id, url })
      setCustomPromptUrl('')
      setSelectedPromptId(null)
      setCustomPromptModalOpen(false)
      addToast('Zusammenfassung gestartet', 'success', 3200, '/browse')
    } catch (e: any) { addToast(`Fehler: ${e.message}`, 'error') }
    finally { setCustomPromptSubmitting(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => { setManualUrl(''); setLinkModalOpen(true) }} title="YouTube Link zusammenfassen">
        <LinkIcon className="w-3.5 h-3.5" /> Link
      </Button>
      <Button size="sm" variant="cancel" outline onClick={openCustomPromptModal} title="Mit Custom Prompt zusammenfassen">
        <Wand2 className="w-3.5 h-3.5" /> Custom
      </Button>

      <Modal open={customPromptModalOpen} onClose={() => setCustomPromptModalOpen(false)} title="Mit Custom Prompt zusammenfassen">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">YouTube URL</label>
            <Input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={customPromptUrl}
              onChange={e => setCustomPromptUrl(e.target.value)}
              autoFocus
              onPaste={e => {
                const text = e.clipboardData.getData('text').trim()
                if (text.match(/(?:youtube\.com|youtu\.be)/)) {
                  e.preventDefault()
                  setCustomPromptUrl(text)
                }
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Prompt auswählen</label>
            {customPromptsLoading ? (
              <div className="flex items-center gap-2 py-4 text-dim text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Prompts laden...
              </div>
            ) : customPrompts.length === 0 ? (
              <p className="text-sm text-dim italic py-2">Keine Custom Prompts vorhanden. Zuerst in den Einstellungen anlegen.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {/* Auswahllisten sind keine Buttons: eine Zeile, aktiv = Primary-Tönung. */}
                {customPrompts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPromptId(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-sm border transition-colors ${
                      selectedPromptId === p.id
                        ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                        : 'bg-inputBg border-surfaceBorder text-content hover:bg-rowHover'
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Modell</label>
            <div className="flex flex-wrap gap-1.5">
              {MODEL_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSelectedModel(o.value)}
                  className={`w-28 px-2 py-1.5 text-xs rounded-sm border transition-colors truncate ${
                    selectedModel === o.value
                      ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                      : 'bg-inputBg border-surfaceBorder text-muted hover:bg-rowHover'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setCustomPromptModalOpen(false)}>Abbrechen</Button>
          <Button
            onClick={handleCustomPromptSubmit}
            disabled={customPromptSubmitting || !customPromptUrl.trim() || !selectedPromptId}
            loading={customPromptSubmitting}
          >
            <Wand2 className="w-4 h-4" /> Zusammenfassen
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="YouTube Video zusammenfassen">
        <p className="text-sm text-muted mb-3">Füge einen YouTube-Link ein um das Video zusammenzufassen.</p>
        <Input
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={manualUrl}
          onChange={e => setManualUrl(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleManualUrl() }}
          onPaste={e => {
            const text = e.clipboardData.getData('text').trim()
            if (text.match(/(?:youtube\.com|youtu\.be)/)) {
              e.preventDefault()
              setManualUrl(text)
            }
          }}
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-xs text-muted">{manualDetail === 'short' ? 'Nur die 2-3 Kernaussagen' : 'Ausführlich mit allen Details'}</span>
          <SegmentedControl<SummaryDetail>
            size="sm"
            values={['short', 'long']}
            labels={[SUMMARY_DETAIL_LABELS.short, SUMMARY_DETAIL_LABELS.long]}
            value={manualDetail}
            onChange={setManualDetail}
          />
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setLinkModalOpen(false)}>Abbrechen</Button>
          <Button onClick={handleManualUrl} disabled={submitting || !manualUrl.trim()} loading={submitting}>
            <Sparkles className="w-4 h-4" /> Zusammenfassen
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
