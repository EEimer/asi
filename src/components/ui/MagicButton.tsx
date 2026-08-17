import type React from 'react'
import { cn } from '../../utils'
import { controlHeight, controlPadding, type ControlSize } from './controlSizes'

/**
 * Button für Vorgänge, die ein Modell ausführt (Zusammenfassen, Chat, TTS).
 *
 * Die Optik kommt vollständig aus `.magic-border` (index.css): ein animierter
 * Gradient-Rahmen als inset-Ring. Deshalb KEINE variant-Achse wie beim Button –
 * der Magic-Button ist eine eigene Kategorie und nicht eine weitere Farbe.
 *
 * Die Aussenkante entspricht exakt `controlHeight`, damit er in einer Toolbar mit
 * normalen Buttons fluchtet.
 */
interface MagicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize
  /** Schnellere Animation + stärkerer Schein – während der Vorgang läuft. */
  active?: boolean
  /** Label im Farbverlauf statt in der Textfarbe. */
  gradientText?: boolean
}

export function MagicButton({
  className,
  size = 'md',
  active = false,
  gradientText = false,
  children,
  type,
  disabled,
  ...props
}: MagicButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'magic-border inline-flex cursor-pointer items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        active && 'magic-border-active',
        controlHeight[size],
        className,
      )}
      {...props}
    >
      <span className={cn('magic-border-content inline-flex items-center justify-center gap-1.5', controlPadding[size])}>
        <span className={cn('inline-flex items-center gap-1.5', gradientText ? 'magic-text' : 'text-content')}>
          {children}
        </span>
      </span>
    </button>
  )
}
