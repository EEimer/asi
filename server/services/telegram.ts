import { basename } from 'node:path'
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../config'

async function resolveChatId(token: string): Promise<string> {
  if (TELEGRAM_CHAT_ID.trim()) return TELEGRAM_CHAT_ID.trim()

  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
  if (!updatesRes.ok) {
    throw new Error(`Telegram getUpdates failed (${updatesRes.status})`)
  }
  const updates = await updatesRes.json() as {
    ok: boolean
    result?: Array<{ message?: { chat?: { id?: number | string } } }>
    description?: string
  }
  if (!updates.ok) throw new Error(updates.description || 'Telegram getUpdates failed')

  const lastChatId = updates.result
    ?.slice()
    .reverse()
    .map(item => item.message?.chat?.id)
    .find(id => id !== undefined && id !== null)

  if (lastChatId === undefined || lastChatId === null) {
    throw new Error('No Telegram chat found. Open your bot and send /start, or set TELEGRAM_CHAT_ID.')
  }
  return String(lastChatId)
}

export async function sendAudioToTelegram(input: {
  filePath: string
  caption: string
  title: string
}) {
  const token = TELEGRAM_BOT_TOKEN.trim()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured')

  const chatId = await resolveChatId(token)
  const form = new FormData()
  form.set('chat_id', chatId)
  form.set('caption', input.caption.slice(0, 1024))
  form.set('title', input.title.slice(0, 64))
  form.set('audio', Bun.file(input.filePath), basename(input.filePath))

  const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Telegram sendAudio ${res.status}: ${text.slice(0, 300)}`)
  }
  const payload = await res.json() as { ok: boolean; description?: string }
  if (!payload.ok) throw new Error(payload.description || 'Telegram sendAudio failed')
}
