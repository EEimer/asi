import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { marked } from 'marked'
import { fetchSummaryChat, sendSummaryChatMessage, resetSummaryChat } from '../api/endpoints'
import { DEFAULT_SETTINGS, type ChatMessage } from '../../shared/types'
import { ChatBubble } from './ChatBubble'
import { ChatComposer } from './ChatComposer'
import { ConfirmModal } from './ConfirmModal'
import { useToast } from '../store/toastStore'
import { Button } from './ui'

interface SummaryChatProps {
  summaryId: string
  /** Bereits gerendertes Markdown der Zusammenfassung — die erste Bubble. */
  summaryHtml: string
  summaryModel: string
}

/** Modell für die nächste Anfrage: zuletzt benutztes, sonst das der Zusammenfassung. */
function lastUsedModel(messages: ChatMessage[], fallback: string): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].model) return messages[i].model!
  }
  return fallback || DEFAULT_SETTINGS.openaiModel
}

export function SummaryChat({ summaryId, summaryHtml, summaryModel }: SummaryChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState(summaryModel || DEFAULT_SETTINGS.openaiModel)
  const [resetOpen, setResetOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchSummaryChat(summaryId)
      .then(items => {
        if (!active) return
        setMessages(items)
        setModel(lastUsedModel(items, summaryModel))
      })
      .catch(() => { /* leerer Chat ist ein gültiger Startzustand */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [summaryId, summaryModel])

  // Ans Ende scrollen — am Container statt via scrollIntoView, sonst springt
  // zusätzlich die ganze Seite.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pendingQuestion, loading])

  const renderedMessages = useMemo(
    () => messages.map(m => ({
      ...m,
      html: m.role === 'assistant' ? marked.parse(m.content, { async: false }) as string : '',
    })),
    [messages],
  )

  async function handleSend() {
    const question = draft.trim()
    if (!question || sending) return
    setDraft('')
    setPendingQuestion(question)
    setSending(true)
    try {
      const updated = await sendSummaryChatMessage(summaryId, question, model)
      setMessages(updated)
    } catch (e: any) {
      // Frage zurück ins Feld — aber nur, wenn dort nicht schon die nächste steht.
      setDraft(current => current.trim() ? current : question)
      addToast(e?.message ?? 'Chat-Anfrage fehlgeschlagen', 'error', 5000)
    } finally {
      setPendingQuestion(null)
      setSending(false)
    }
  }

  async function handleReset() {
    setResetOpen(false)
    try {
      await resetSummaryChat(summaryId)
      setMessages([])
      setModel(summaryModel || DEFAULT_SETTINGS.openaiModel)
    } catch (e: any) {
      addToast(e?.message ?? 'Chat konnte nicht zurückgesetzt werden', 'error', 5000)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-content">Chat</h2>
        <Button size="sm" variant="cancel" outline onClick={() => setResetOpen(true)} disabled={sending || messages.length === 0}>
          <RotateCcw className="w-3.5 h-3.5" /> Zurücksetzen
        </Button>
      </div>

      <div ref={listRef} className="flex flex-col gap-3 min-h-[55vh] max-h-[65vh] overflow-y-auto bg-inputBg rounded-sm p-4">
        <ChatBubble role="assistant" model={summaryModel}>
          <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        </ChatBubble>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-dim">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verlauf wird geladen...
          </div>
        )}

        {renderedMessages.map(m => (
          <ChatBubble key={m.id} role={m.role} model={m.model}>
            {m.role === 'assistant'
              ? <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: m.html }} />
              : <p className="whitespace-pre-wrap">{m.content}</p>}
          </ChatBubble>
        ))}

        {pendingQuestion && (
          <>
            <ChatBubble role="user">
              <p className="whitespace-pre-wrap">{pendingQuestion}</p>
            </ChatBubble>
            <ChatBubble role="assistant" model={model}>
              <Loader2 className="w-4 h-4 animate-spin text-dim" />
            </ChatBubble>
          </>
        )}
      </div>

      <ChatComposer
        model={model}
        onModelChange={setModel}
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        disabled={sending}
      />

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Chat zurücksetzen"
        description="Der gespeicherte Verlauf wird gelöscht. Die Zusammenfassung bleibt erhalten."
        confirmLabel="Zurücksetzen"
        variant="danger"
      />
    </div>
  )
}
