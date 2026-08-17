import { useEffect, useState, useRef } from 'react'
import { ChevronUp, ChevronDown, Terminal, Loader2, Check, AlertCircle, Sparkles, FileText, Download, Volume2 } from 'lucide-react'
import type { ProcessingEvent, ProcessingStep } from '../../shared/types'
import { useToast } from '../store/toastStore'
import { Card } from './ui'

const stepIcons: Record<ProcessingStep, typeof Check> = {
  queued: Download,
  metadata: Download,
  transcript: FileText,
  summarizing: Sparkles,
  done: Check,
  error: AlertCircle,
  tts_generating: Volume2,
  tts_cached: Check,
  tts_done: Check,
  tts_error: AlertCircle,
}

const stepColors: Record<ProcessingStep, string> = {
  queued: 'text-dim',
  metadata: 'text-primary',
  transcript: 'text-warning',
  summarizing: 'text-accent',
  done: 'text-success',
  error: 'text-danger',
  tts_generating: 'text-primary',
  tts_cached: 'text-tertiary',
  tts_done: 'text-success',
  tts_error: 'text-danger',
}

export default function ProcessingConsole() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ProcessingEvent[]>([])
  // Nur der Setter wird gebraucht: abgeschlossene Jobs werden einmalig entfernt.
  const [, setDismissed] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()
  const toastedRef = useRef(new Set<string>())
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout>
    // Die Ref beim Betreten festhalten: beim Aufräumen zeigt dismissTimers.current
    // womöglich schon auf eine andere Map, dann bliebe hier ein Timer stehen.
    const timers = dismissTimers.current

    function connect() {
      es = new EventSource('/api/events')
      es.onmessage = (e) => {
        try {
          const event: ProcessingEvent = JSON.parse(e.data)
          setEvents(prev => [...prev.slice(-200), event])

          if (event.step === 'done' && !toastedRef.current.has(event.summaryId)) {
            toastedRef.current.add(event.summaryId)
            addToast(`${event.videoTitle} – Zusammenfassung fertig!`, 'success', 4000, `/summaries/${event.summaryId}`)
          }
          if (event.step === 'error' && !toastedRef.current.has(event.summaryId)) {
            toastedRef.current.add(event.summaryId)
            addToast(`Fehler: ${event.message}`, 'error', 5000)
          }

          if (event.step === 'done' || event.step === 'error') {
            if (!dismissTimers.current.has(event.summaryId)) {
              const timer = setTimeout(() => {
                setDismissed(prev => new Set(prev).add(event.summaryId))
                setEvents(prev => prev.filter(ev => ev.summaryId !== event.summaryId))
                dismissTimers.current.delete(event.summaryId)
              }, 4000)
              dismissTimers.current.set(event.summaryId, timer)
            }
          }
        } catch {}
      }
      es.onerror = () => { es?.close(); retryTimer = setTimeout(connect, 3000) }
    }

    connect()
    return () => {
      es?.close()
      clearTimeout(retryTimer)
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [addToast])

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [events, open])

  const activeJobs = new Set<string>()
  for (const e of events) {
    if (e.step === 'done' || e.step === 'error' || e.step === 'tts_done' || e.step === 'tts_cached' || e.step === 'tts_error') activeJobs.delete(e.summaryId)
    else activeJobs.add(e.summaryId)
  }
  const isActive = activeJobs.size > 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="mx-auto max-w-7xl px-4">
        <Card className="border-b-0 rounded-t-xl overflow-hidden">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-rowHover transition-colors">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-dim" />
              <span className="text-xs font-medium text-muted">Processing Console</span>
              {isActive && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              {isActive && <span className="text-[10px] text-primary font-medium">{activeJobs.size} aktiv</span>}
              {events.length > 0 && <span className="text-[10px] text-dim">{events.length} Events</span>}
            </div>
            {open ? <ChevronDown className="w-4 h-4 text-dim" /> : <ChevronUp className="w-4 h-4 text-dim" />}
          </button>

          {open && (
            <div ref={scrollRef} className="border-t border-surfaceBorderSoft max-h-60 overflow-y-auto bg-inputBg font-mono text-xs">
              {events.length === 0 && <p className="text-dim p-4 text-center">Noch keine Events. Fasse ein Video zusammen um hier den Fortschritt zu sehen.</p>}
              {events.map((e, i) => {
                const Icon = stepIcons[e.step]
                const spinning = !['done', 'error', 'tts_done', 'tts_cached', 'tts_error'].includes(e.step)
                return (
                  <div key={i} className="flex items-start gap-2 px-4 py-1.5 border-b border-surfaceBorderSoft/50 row-interactive">
                    <span className="text-[10px] text-dim shrink-0 mt-0.5 tabular-nums">{new Date(e.timestamp).toLocaleTimeString('de-DE')}</span>
                    {spinning ? <Loader2 className={`w-3 h-3 animate-spin shrink-0 mt-0.5 ${stepColors[e.step]}`} /> : <Icon className={`w-3 h-3 shrink-0 mt-0.5 ${stepColors[e.step]}`} />}
                    <span className="text-muted truncate">{e.videoTitle && <span className="text-content font-medium">{e.videoTitle.slice(0, 50)}</span>} {e.message}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
