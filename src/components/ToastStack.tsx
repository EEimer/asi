import { useEffect, useState } from 'react'
import { useToast, type ToastMessage } from '../store/toastStore'
import { Check, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * BEWUSSTE AUSNAHME von der Token-Regel – nicht auf success/danger/warning umstellen.
 *
 * Ein Token ist ein Farbton; ein Toast braucht drei Ebenen (Rahmen, Fläche, Schrift),
 * die in Light und Dark unterschiedlich weit auseinanderliegen: hell eine zarte
 * 50er-Fläche mit kräftiger 700er-Schrift, dunkel eine tiefe 950er-Fläche mit heller
 * 200er-Schrift. Mit `bg-success/10 text-success` kollabiert das zu einem Ton und
 * wirkt ausgewaschen. Der Toast liegt ausserdem frei über dem Inhalt, nicht auf einer
 * Panel-Fläche – er braucht eine eigene, deckende Grundfarbe. (1:1 aus ../wealth)
 */
const toneStyles: Record<ToastMessage['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200',
  error: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-orange-400/50 dark:bg-[#3d2800] dark:text-orange-300',
  info: 'border-surfaceBorder bg-panel text-content dark:border-white/10 dark:bg-[#2e2e38]',
}

const toneIcons: Record<ToastMessage['tone'], typeof Check> = {
  success: Check, error: AlertCircle, warning: AlertTriangle, info: Info,
}

export default function ToastStack() {
  const { toasts, removeToast } = useToast()
  const navigate = useNavigate()

  return (
    <div className="fixed right-6 top-[70px] z-[9999] flex w-[360px] flex-col gap-2">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onRemove={removeToast} onNavigate={navigate} />)}
    </div>
  )
}

function ToastItem({ toast, onRemove, onNavigate }: { toast: ToastMessage; onRemove: (id: string) => void; onNavigate: (to: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const Icon = toneIcons[toast.tone]
  const isClickable = !!toast.to

  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 10)
    const close = setTimeout(() => setClosing(true), toast.durationMs)
    const remove = setTimeout(() => onRemove(toast.id), toast.durationMs + 300)
    return () => { clearTimeout(enter); clearTimeout(close); clearTimeout(remove) }
  }, [toast, onRemove])

  const baseClass = `overflow-hidden rounded-lg border px-4 py-3 text-sm shadow-sm transition-all duration-300 flex items-center gap-2.5 ${toneStyles[toast.tone]} ${visible && !closing ? 'max-h-40 opacity-100 translate-x-0' : 'max-h-0 opacity-0 translate-x-4'}`

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!toast.to) return
          onNavigate(toast.to)
          onRemove(toast.id)
        }}
        className={`${baseClass} w-full text-left hover:brightness-95 cursor-pointer`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="break-words">{toast.message}</span>
      </button>
    )
  }

  return (
    <div className={baseClass}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="break-words">{toast.message}</span>
    </div>
  )
}
