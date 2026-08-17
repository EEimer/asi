import type { TtsModel, TtsVariantConfig, TtsVoice } from '../../shared/types'
import { reconcileConfigForModel, ttsVoiceOptions } from '../../shared/tts'
import { Modal, ModalFooter } from './Modal'
import { Button, Input, Select } from './ui'

/* Lag vorher zweimal fast wortgleich im Code — in SummaryDetailView und in
   SummariesView. Die Unterschiede zwischen beiden Kopien (Titelzeile, wann der
   Bestätigen-Button deaktiviert ist) sind hier Props. */

interface TtsConfigModalProps {
  open: boolean
  /** Zweite Zeile im Kopf, üblicherweise der Videotitel. */
  description?: string
  draft: TtsVariantConfig
  onDraftChange: (next: TtsVariantConfig) => void
  onClose: () => void
  onSubmit: () => void
  submitDisabled?: boolean
}

const FALLBACK_DESCRIPTION = 'Nur für diese Summary. Globale Defaults bleiben unverändert.'

export function TtsConfigModal({
  open,
  description,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
  submitDisabled = false,
}: TtsConfigModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="TTS Config"
      description={description || FALLBACK_DESCRIPTION}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-content mb-1">Modell</label>
          <Select
            value={draft.model}
            onChange={e => onDraftChange(reconcileConfigForModel(draft, e.target.value as TtsModel))}
          >
            <option value="tts-1">tts-1</option>
            <option value="tts-1-hd">tts-1-hd</option>
            <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-content mb-1">Stimme</label>
          <Select
            value={draft.voice}
            onChange={e => onDraftChange({ ...draft, voice: e.target.value as TtsVoice })}
          >
            {ttsVoiceOptions(draft.model).map(voice => {
              const recommended = draft.model === 'gpt-4o-mini-tts' && (voice === 'marin' || voice === 'cedar')
              return <option key={voice} value={voice}>{recommended ? `${voice} - ★ Empfohlen` : voice}</option>
            })}
          </Select>
        </div>
        {draft.model === 'gpt-4o-mini-tts' && (
          <div>
            <label className="block text-sm font-medium text-content mb-1">Instruktionen</label>
            <Input
              type="text"
              value={draft.instructions}
              onChange={e => onDraftChange({ ...draft, instructions: e.target.value })}
              placeholder={'z.B. "Speak slowly and clearly in German"'}
            />
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="cancel" outline onClick={onClose}>Abbrechen</Button>
        <Button onClick={onSubmit} disabled={submitDisabled}>TTS</Button>
      </ModalFooter>
    </Modal>
  )
}
