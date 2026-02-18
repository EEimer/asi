import { useEffect, useState } from 'react'
import { useToast, type ToastMessage } from '../store/toastStore'
import { Check, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const toneStyles: Record<ToastMessage['tone'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-slate-200 bg-white text-slate-700',
}

const toneIcons: Record<ToastMessage['tone'], typeof Check> = {
  success: Check, error: AlertCircle, warning: AlertTriangle, info: Info,
}

export default function ToastStack() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed right-6 top-[70px] z-[9999] flex w-[360px] flex-col gap-2">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />)}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const Icon = toneIcons[toast.tone]

  useEffect(() => {
    const enter = setTimeout(() => setVisible(true), 10)
    const close = setTimeout(() => setClosing(true), toast.durationMs)
    const remove = setTimeout(() => onRemove(toast.id), toast.durationMs + 300)
    return () => { clearTimeout(enter); clearTimeout(close); clearTimeout(remove) }
  }, [toast, onRemove])

  return (
    <div className={`overflow-hidden rounded-lg border px-4 py-3 text-sm shadow-sm transition-all duration-300 flex items-center gap-2.5 ${toneStyles[toast.tone]} ${visible && !closing ? 'max-h-40 opacity-100 translate-x-0' : 'max-h-0 opacity-0 translate-x-4'}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="break-words">{toast.message}</span>
    </div>
  )
}
