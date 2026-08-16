import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../utils'
import {
  controlHeight,
  segmentedItemPadding,
  segmentedPillInset,
  segmentedRootPadding,
  type ControlSize,
} from './ui/controlSizes'

interface SegmentedControlProps<T extends string> {
  values: T[]
  labels?: ReactNode[]
  value: T
  onChange: (value: T) => void
  /** Gleiche Skala wie Button – ein Segment neben einem Button braucht dessen Höhe. */
  size?: ControlSize
  className?: string
}

export function SegmentedControl<T extends string>({
  values,
  labels,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [sizes, setSizes] = useState<{ width: number; left: number }[]>([])

  const displayLabels: ReactNode[] = labels ?? values.map(v => v.toUpperCase())
  const activeIndex = values.findIndex(v => v === value)
  const activeSize = activeIndex >= 0 ? sizes[activeIndex] : null

  useEffect(() => {
    const measureSizes = () => {
      const newSizes = itemRefs.current.map(ref => {
        if (!ref) return { width: 0, left: 0 }
        const rect = ref.getBoundingClientRect()
        const parent = ref.parentElement
        if (!parent) return { width: 0, left: 0 }
        const parentRect = parent.getBoundingClientRect()
        return {
          width: rect.width - 2,
          left: rect.left - parentRect.left,
        }
      })
      setSizes(newSizes)
    }

    const timeoutId = setTimeout(measureSizes, 0)
    window.addEventListener('resize', measureSizes)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', measureSizes)
    }
  }, [values, value])

  return (
    // Track ist die Control-Fläche (surface-2), nicht die Kartenfarbe – so hebt sich
    // die aktive Pille in beiden Themes ab. Der Schatten ist eine Light-Dekoration.
    <div className={cn(
      'relative flex items-center gap-1 rounded-lg border border-surfaceBorder bg-inputBg shadow-sm dark:shadow-none',
      /* Feste Höhe aus derselben Skala wie Button. Vorher ergab sie sich aus
         Padding + geerbter line-height – ein text-xs am Elternknoten machte den
         Track dadurch 34px hoch und damit 2px höher als der h-8-Button daneben. */
      controlHeight[size],
      segmentedRootPadding[size],
      className,
    )}>
      {activeSize && activeSize.width > 0 && (
        <div
          className={cn('absolute rounded-inner bg-primary transition-all duration-300 ease-out', segmentedPillInset[size])}
          style={{
            width: `${activeSize.width}px`,
            left: `${activeSize.left}px`,
          }}
        />
      )}
      {values.map((val, index) => (
        <button
          key={val}
          ref={(el) => { itemRefs.current[index] = el }}
          type="button"
          onClick={() => onChange(val)}
          className={cn(
            /* h-full statt py-*: die Höhe kommt vom Track, nicht aus der Schriftgrösse. */
            'relative z-10 flex h-full items-center justify-center rounded-inner font-medium transition-colors duration-200',
            segmentedItemPadding[size],
            val === value ? 'text-white' : 'text-muted hover:bg-primary/10 hover:text-primary',
          )}
        >
          {displayLabels[index]}
        </button>
      ))}
    </div>
  )
}
