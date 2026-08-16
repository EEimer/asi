import { cn } from '../../utils'
import { spinnerSize, type SpinnerSize } from './controlSizes'

/**
 * Der einzige Spinner der App (nach ../wealth). Groessen kommen ausschliesslich
 * aus `spinnerSize` (controlSizes.ts), damit ein Spinner im Button und einer im
 * Seiten-Ladezustand nicht zufaellig gleich gross sind.
 */
interface SpinnerProps {
  /** Text rechts vom Kreis. Ohne Angabe laeuft der Spinner unbeschriftet. */
  label?: string
  size?: SpinnerSize
  className?: string
}

export function Spinner({ label, size = 'sm', className }: SpinnerProps) {
  const px = spinnerSize[size]
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg className="animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ width: px, height: px }}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {label ?? null}
    </span>
  )
}
