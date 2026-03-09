import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
  to?: string
}

interface ToastStore {
  toasts: ToastMessage[]
  addToast: (message: string, tone?: ToastTone, durationMs?: number, to?: string) => void
  removeToast: (id: string) => void
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, tone = 'info', durationMs = 3200, to) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set(s => ({ toasts: [...s.toasts, { id, message, tone, durationMs, to }] }))
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
