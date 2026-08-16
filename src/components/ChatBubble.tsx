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
        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border text-accent border-accent/30 bg-accent/10">
          {modelLabel(model)}
        </span>
      )}
      <div
        className={cn(
          'rounded-xl px-4 py-3 text-sm',
          isUser
            ? 'border border-primary/20 bg-primary/10 text-content'
            : 'border border-surfaceBorder bg-panel text-content',
        )}
      >
        {children}
      </div>
    </div>
  )
}
