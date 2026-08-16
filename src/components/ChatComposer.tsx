import { useEffect, useRef } from 'react'
import { Loader2, Send } from 'lucide-react'
import { MODEL_OPTIONS, MODEL_TIER_LABELS, LEGACY_MODEL_LABELS, type ModelTier } from '../../shared/types'
import { Button } from './ui/Button'

const MODEL_TIERS: ModelTier[] = ['gut', 'mittel', 'beste']

const MAX_ROWS = 5

interface ChatComposerProps {
  model: string
  onModelChange: (model: string) => void
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled: boolean
}

export function ChatComposer({ model, onModelChange, value, onChange, onSend, disabled }: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Höhe am Inhalt ausrichten: erst zurücksetzen, sonst wächst das Feld nur.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const maxHeight = lineHeight * MAX_ROWS
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value])

  const isLegacyModel = !MODEL_OPTIONS.some(o => o.value === model)

  return (
    <div className="flex items-end gap-2">
      <select
        value={model}
        onChange={e => onModelChange(e.target.value)}
        disabled={disabled}
        className="shrink-0 h-10 px-3 text-sm bg-inputBg border border-surfaceBorder rounded-sm text-content focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
      >
        {MODEL_TIERS.map(tier => (
          <optgroup key={tier} label={MODEL_TIER_LABELS[tier]}>
            {MODEL_OPTIONS.filter(o => o.tier === tier).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        {/* Altmodell sichtbar halten, sonst zeigt das Feld stillschweigend ein
            anderes Modell an als das, was tatsächlich verwendet wird. */}
        {isLegacyModel && model && (
          <optgroup label="Zuletzt verwendet (nicht mehr in der Auswahl)">
            <option value={model}>{LEGACY_MODEL_LABELS[model] ?? model}</option>
          </optgroup>
        )}
      </select>

      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder="Frage zum Video stellen... (Enter senden, Shift+Enter neue Zeile)"
        className="flex-1 resize-none px-3 py-2 text-sm bg-inputBg border border-surfaceBorder rounded-sm text-content placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-primary/40"
      />

      <Button className="shrink-0" onClick={onSend} disabled={disabled || !value.trim()} loading={disabled}>
        <Send className="w-4 h-4" /> Senden
      </Button>
    </div>
  )
}
