import type { ReactNode } from 'react'
import { cn } from '../utils'
import { modelLabel, type ChatRole } from '../../shared/types'

interface ChatBubbleProps {
  role: ChatRole
  /** Modell, das die Antwort erzeugt hat. Nur bei Assistant-Bubbles sichtbar. */
  model?: string
  children: ReactNode
}

export function ChatBubble({ role, model, children }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'ml-auto items-end')}>
      {!isUser && model && (
        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border text-violet-700 border-violet-200 bg-violet-50">
          {modelLabel(model)}
        </span>
      )}
      <div
        className={cn(
          'rounded-xl px-4 py-3 text-sm',
          isUser
            ? 'border border-primary/20 bg-primary/10 text-slate-800'
            : 'border border-slate-200 bg-white text-slate-700',
        )}
      >
        {children}
      </div>
    </div>
  )
}
