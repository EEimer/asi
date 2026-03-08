import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../utils'

interface SegmentedControlProps<T extends string> {
  values: T[]
  labels?: ReactNode[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  values,
  labels,
  value,
  onChange,
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
    <div className={cn('relative flex gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-sm', className)}>
      {activeSize && activeSize.width > 0 && (
        <div
          className="absolute top-1 h-[calc(100%-0.5rem)] rounded-md bg-primary transition-all duration-300 ease-out"
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
            'relative z-10 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200',
            val === value ? 'text-white' : 'text-slate-600 hover:bg-primary/10 hover:text-primary',
            className?.includes('mini') && 'px-2 py-1 text-[11px]',
          )}
        >
          {displayLabels[index]}
        </button>
      ))}
    </div>
  )
}
