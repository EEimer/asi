import { useEffect, useState, useRef } from 'react'
import { ChevronUp, ChevronDown, Terminal, Loader2, Check, AlertCircle, Sparkles, FileText, Download } from 'lucide-react'
import type { ProcessingEvent, ProcessingStep } from '../../shared/types'
import { useToast } from '../store/toastStore'

const stepIcons: Record<ProcessingStep, typeof Check> = {
  queued: Download, metadata: Download, transcript: FileText, summarizing: Sparkles, done: Check, error: AlertCircle,
}

const stepColors: Record<ProcessingStep, string> = {
  queued: 'text-slate-400',
  metadata: 'text-blue-500',
  transcript: 'text-amber-500',
  summarizing: 'text-purple-500',
  done: 'text-emerald-500',
  error: 'text-rose-500',
}

export default function ProcessingConsole() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ProcessingEvent[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()
  const toastedRef = useRef(new Set<string>())
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource('/api/events')
      es.onmessage = (e) => {
        try {
          const event: ProcessingEvent = JSON.parse(e.data)
          setEvents(prev => [...prev.slice(-200), event])

          if (event.step === 'done' && !toastedRef.current.has(event.summaryId)) {
            toastedRef.current.add(event.summaryId)
            addToast(`${event.videoTitle} – Zusammenfassung fertig!`, 'success', 4000)
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
      for (const t of dismissTimers.current.values()) clearTimeout(t)
    }
  }, [addToast])

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [events, open])

  const activeJobs = new Set<string>()
  for (const e of events) {
    if (e.step === 'done' || e.step === 'error') activeJobs.delete(e.summaryId)
    else activeJobs.add(e.summaryId)
  }
  const isActive = activeJobs.size > 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30">
      <div className="mx-auto max-w-5xl px-4">
        <div className="bg-white border border-b-0 border-slate-200 rounded-t-xl shadow-lg overflow-hidden">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">Processing Console</span>
              {isActive && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              {isActive && <span className="text-[10px] text-primary font-medium">{activeJobs.size} aktiv</span>}
              {events.length > 0 && <span className="text-[10px] text-slate-400">{events.length} Events</span>}
            </div>
            {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
          </button>

          {open && (
            <div ref={scrollRef} className="border-t border-slate-100 max-h-60 overflow-y-auto bg-slate-50 font-mono text-xs">
              {events.length === 0 && <p className="text-slate-400 p-4 text-center">Noch keine Events. Fasse ein Video zusammen um hier den Fortschritt zu sehen.</p>}
              {events.map((e, i) => {
                const Icon = stepIcons[e.step]
                const spinning = e.step !== 'done' && e.step !== 'error'
                return (
                  <div key={i} className="flex items-start gap-2 px-4 py-1.5 border-b border-slate-100/50 hover:bg-slate-100/50">
                    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5 tabular-nums">{new Date(e.timestamp).toLocaleTimeString('de-DE')}</span>
                    {spinning ? <Loader2 className={`w-3 h-3 animate-spin shrink-0 mt-0.5 ${stepColors[e.step]}`} /> : <Icon className={`w-3 h-3 shrink-0 mt-0.5 ${stepColors[e.step]}`} />}
                    <span className="text-slate-500 truncate">{e.videoTitle && <span className="text-slate-700 font-medium">{e.videoTitle.slice(0, 50)}</span>} {e.message}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
