import type React from 'react'
import { useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  title?: string | React.ReactNode
  description?: string
  onClose: () => void
  children: React.ReactNode
  size?: 'default' | 'large'
  escapeConfirms?: boolean
  onConfirm?: () => void
}

export function Modal({ open, title, description, onClose, children, size = 'default', escapeConfirms, onConfirm }: ModalProps) {
  const pointerDownOnOverlayRef = useRef(false)

  const handleCloseAttempt = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeConfirms && onConfirm) onConfirm()
        else handleCloseAttempt()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, escapeConfirms, onConfirm, handleCloseAttempt])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) pointerDownOnOverlayRef.current = true }}
      onClick={e => { if (e.target === e.currentTarget && pointerDownOnOverlayRef.current) handleCloseAttempt() }}
    >
      <div
        className={cn('max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl', size === 'large' ? 'max-w-6xl' : 'max-w-md')}
        onMouseDown={() => { pointerDownOnOverlayRef.current = false }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {typeof title === 'string' ? <h3 className="text-lg font-semibold text-slate-900">{title}</h3> : title}
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={handleCloseAttempt} aria-label="Schließen" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function ModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
}
