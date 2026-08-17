import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils'

/**
 * Aufklappbarer Abschnitt (nach ../wealth). Der Kopf ist eine ganze Zeile, kein
 * Button in einer Zeile – die gesamte Breite ist das Klickziel.
 *
 * Das Chevron dreht sich, statt zwischen zwei Icons zu wechseln: der Wechsel
 * ChevronUp/ChevronDown springt, die Drehung zeigt die Richtung der Bewegung.
 *
 * `open` optional von aussen steuerbar; ohne die Prop verwaltet die Komponente
 * ihren Zustand selbst.
 */
interface CollapsibleSectionProps {
  title: ReactNode
  /** Rechts im Kopf, vor dem Chevron – z. B. eine Anzahl oder ein Badge. */
  aside?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  contentClassName?: string
}

export function CollapsibleSection({
  title,
  aside,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [internal, setInternal] = useState(defaultOpen)
  const isOpen = open ?? internal
  const contentId = useId()

  function toggle() {
    const next = !isOpen
    if (open === undefined) setInternal(next)
    onOpenChange?.(next)
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 py-3 text-sm text-muted transition-colors hover:text-content"
      >
        <span className="min-w-0 text-left">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {aside}
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')} />
        </span>
      </button>
      {isOpen && <div id={contentId} className={contentClassName}>{children}</div>}
    </div>
  )
}
