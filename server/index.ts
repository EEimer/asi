import { Elysia, t, type Context } from 'elysia'
import { cors } from '@elysiajs/cors'
import { getAllSummaries, getSummariesPage, getSummariesCount, getSummaryById, getSummariesByVideoId, createSummary, updateSummaryMeta, updateSummaryDone, updateSummaryError, updateSummaryAuthor, updateSummaryLang, resetSummaryForRetry, deleteSummary, deleteAllSummaries, getSummarizedVideoIds, getSummaryChat, saveSummaryChat, clearSummaryChat } from './db/summaries'
import { getAllNotes, createNote, updateNote, markNoteDone, deleteNote, deleteAllNotes } from './db/notes'
import { getAllCustomPrompts, createCustomPrompt, updateCustomPrompt, deleteCustomPrompt } from './db/customPrompts'
import { getAllPredictions, insertPredictions, insertManualPrediction, deletePrediction, deletePredictionsBySummary, deleteAllPredictions } from './db/predictions'
import { extractSummaryMeta } from './services/tableParser'
import { getSettings, updateSettings, resetSettings } from './db/settings'
import { fetchSubscriptionFeed, invalidateFeedCache, fetchVideoMeta, downloadSubtitles, extractVideoId } from './services/youtube'
import { fetchXMeta, fetchXContent, extractXId } from './services/xcom'
import { getAllXSummaries, getXSummaryById, createXSummary, updateXSummaryDone, updateXSummaryError, resetXSummaryForRetry, deleteXSummary } from './db/xSummaries'
import { summarizeTranscript } from './services/summarizer'
import { answerSummaryQuestion } from './services/chat'
import { loadSettings } from './config'
import { clearAllTts, deleteTtsBySummary, ensureTtsStorage, getOrGenerateTts, getTtsIndex, resolveTtsFilePath } from './services/tts'
import { sendAudioToTelegram } from './services/telegram'
import { setApiConcurrency } from './services/retry'
import { DEFAULT_SETTINGS, type ChatMessage, type ProcessingEvent, type SummaryDetail, type TtsModel, type TtsVoice } from '../shared/types'
import { existsSync } from 'node:fs'

const port = Number(process.env.PORT ?? 8788)

// SSE: Processing event bus
type EventListener = (event: ProcessingEvent) => void
const listeners = new Set<EventListener>()
ensureTtsStorage()
setApiConcurrency(loadSettings().apiConcurrency)

function emitEvent(event: ProcessingEvent) {
  for (const listener of listeners) listener(event)
}

function emitStep(summaryId: string, videoTitle: string, step: ProcessingEvent['step'], message: string) {
  emitEvent({ summaryId, videoTitle, step, message, timestamp: new Date().toISOString() })
}

function jsonError(set: Context['set'], message: string, status = 404) {
  set.status = status
  return { error: message }
}

const X_PROMPT = 'Fasse den folgenden Tweet-Inhalt kurz auf Deutsch zusammen. Falls nötig erkläre den Kontext. Kein Titel, keine Einleitung, direkt zur Sache. Maximal 3-4 Sätze.'

async function processXSummary(id: string, tweetUrl: string, model: string) {
  const label = tweetUrl
  try {
    emitStep(id, label, 'metadata', 'Tweet wird geladen...')
    const meta = await fetchXMeta(tweetUrl)
    const title = meta.title || tweetUrl

    emitStep(id, title, 'transcript', 'Tweet-Inhalt wird extrahiert...')
    const content = await fetchXContent(tweetUrl)

    emitStep(id, title, 'summarizing', `KI-Zusammenfassung läuft (${model})...`)
    const summary = await summarizeTranscript(content, model, (msg) => {
      emitStep(id, title, 'summarizing', msg)
    }, undefined, X_PROMPT)

    updateXSummaryDone(id, content, meta.channel || '', summary)
    emitStep(id, title, 'done', 'Fertig!')
    console.log(`[x done] ${title}`)
  } catch (e: any) {
    console.error(`[x error] ${id}: ${e.message}`)
    updateXSummaryError(id, e.message ?? 'Unknown error')
    emitStep(id, label, 'error', e.message ?? 'Unbekannter Fehler')
  }
}

async function processSummary(id: string, videoUrl: string, lang: string, model: string, knownTitle: string, knownChannel: string, customPrompt?: string, detail: SummaryDetail = 'long') {
  const label = knownTitle || videoUrl
  try {
    emitStep(id, label, 'metadata', 'Video-Metadaten werden geladen...')
    const meta = await fetchVideoMeta(videoUrl)
    const videoId = extractVideoId(videoUrl)
    const title = meta.title !== 'Unknown' ? meta.title : knownTitle || 'Unknown'
    const channel = meta.channel && meta.channel !== 'Unknown' ? meta.channel : knownChannel || ''
    const thumbnail = meta.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    updateSummaryMeta(id, title, channel, thumbnail)

    emitStep(id, title, 'transcript', `Untertitel werden heruntergeladen (${lang}, en)...`)
    const { text, usedLang } = await downloadSubtitles(videoUrl, lang)
    if (usedLang !== lang) {
      emitStep(id, title, 'transcript', `Kein '${lang}' gefunden, verwende '${usedLang}'`)
      updateSummaryLang(id, usedLang)
    }

    const settings = loadSettings()
    // Ein Custom Prompt sticht den Detailgrad — er bringt seine eigene Struktur mit.
    const prompt = customPrompt ?? (detail === 'short' ? settings.shortSummaryPrompt : settings.summaryPrompt)
    const detailLabel = detail === 'short' ? 'kurz' : 'lang'
    emitStep(id, title, 'summarizing', `KI-Zusammenfassung läuft (${model}, ${detailLabel})...`)
    const summary = await summarizeTranscript(text, model, (msg) => {
      emitStep(id, title, 'summarizing', msg)
    }, { title, channel }, prompt)
    updateSummaryDone(id, text, summary, prompt)

    const { author } = extractSummaryMeta(summary)
    if (author) {
      updateSummaryAuthor(id, author)
      console.log(`[author] ${author} for ${title}`)
    }

    emitStep(id, title, 'done', 'Fertig!')
    console.log(`[done] ${title}`)
  } catch (e: any) {
    console.error(`[error] ${id}: ${e.message}`)
    updateSummaryError(id, e.message ?? 'Unknown error')
    emitStep(id, label, 'error', e.message ?? 'Unbekannter Fehler')
  }
}

new Elysia()
  .use(cors({ origin: true, allowedHeaders: ['Content-Type'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))

  // SSE: Live processing events
  .get('/api/events', () => {
    let cleanupFn: (() => void) | null = null
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const send = (event: ProcessingEvent) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch {}
        }
        listeners.add(send)
        const keepalive = setInterval(() => {
          try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch {}
        }, 15000)
        cleanupFn = () => { listeners.delete(send); clearInterval(keepalive) }
        controller.enqueue(encoder.encode(': connected\n\n'))
      },
      cancel() { cleanupFn?.() },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
  })

  // Settings (before dynamic :id routes!)
  .get('/api/settings', () => {
    const saved = getSettings()
    return { ...DEFAULT_SETTINGS, ...saved }
  })

  .put('/api/settings', ({ body }) => {
    updateSettings(body)
    // Limiter sofort nachziehen, sonst greift der neue Wert erst nach Neustart.
    if (body.apiConcurrency !== undefined) setApiConcurrency(body.apiConcurrency)
    return { ok: true }
  }, { body: t.Object({
    summaryPrompt: t.Optional(t.String()),
    shortSummaryPrompt: t.Optional(t.String()),
    defaultLang: t.Optional(t.String()),
    cookieBrowser: t.Optional(t.String()),
    openaiModel: t.Optional(t.String()),
    blockedChannels: t.Optional(t.Array(t.String())),
    ttsModel: t.Optional(t.String()),
    ttsVoice: t.Optional(t.String()),
    ttsInstructions: t.Optional(t.String()),
    apiConcurrency: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
  }) })

  // YouTube Feed (paginated)
  .get('/api/youtube/feed', async ({ query, set }) => {
    try {
      const offset = Number(query.offset) || 0
      const limit = Number(query.limit) || 30
      const includeBlocked = query.includeBlocked === '1' || query.includeBlocked === 'true'
      const { videos, total, hasMore } = await fetchSubscriptionFeed(offset, limit)
      const summarized = getSummarizedVideoIds()
      if (includeBlocked) {
        return { videos: videos.map(v => ({ ...v, alreadySummarized: summarized.has(v.id), summaryId: summarized.get(v.id) ?? null })), total, hasMore }
      }
      const blockedRaw = loadSettings().blockedChannels.map(c => c.replace(/^@/, '').toLowerCase())
      const blocked = new Set(blockedRaw)
      const filtered = videos.filter(v => {
        if (blocked.has(v.channel.toLowerCase())) return false
        const handle = v.channelUrl?.split('/').pop()?.replace(/^@/, '').toLowerCase() ?? ''
        if (handle && blocked.has(handle)) return false
        return true
      })
      return { videos: filtered.map(v => ({ ...v, alreadySummarized: summarized.has(v.id), summaryId: summarized.get(v.id) ?? null })), total, hasMore }
    } catch (e: any) {
      const message = e?.message || 'YouTube-Feed konnte nicht geladen werden.'
      return jsonError(set, message, 500)
    }
  }, { query: t.Object({ offset: t.Optional(t.String()), limit: t.Optional(t.String()), includeBlocked: t.Optional(t.String()) }) })

  .post('/api/youtube/feed/refresh', () => {
    invalidateFeedCache()
    return { ok: true }
  })

  // Summaries CRUD
  .get('/api/summaries', () => getAllSummaries())

  .get('/api/summaries/paged', ({ query }) => {
    const offset = Number(query.offset) || 0
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20))
    const items = getSummariesPage(offset, limit)
    const total = getSummariesCount()
    return { items, total, hasMore: offset + items.length < total }
  }, { query: t.Object({ offset: t.Optional(t.String()), limit: t.Optional(t.String()) }) })

  .post('/api/summaries', ({ body }) => {
    const videoId = extractVideoId(body.videoUrl)
    const settings = loadSettings()
    const lang = body.lang ?? settings.defaultLang
    const model = body.model ?? settings.openaiModel
    const title = body.videoTitle ?? ''
    const channel = body.channelName ?? ''
    const thumbnail = body.thumbnailUrl ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    const detail: SummaryDetail = body.detail === 'short' ? 'short' : 'long'
    const id = createSummary(videoId, body.videoUrl, lang, model, title, channel, thumbnail, detail)
    emitStep(id, title || body.videoUrl, 'queued', 'In Warteschlange...')
    processSummary(id, body.videoUrl, lang, model, title, channel, body.customPrompt, detail)
    return { id, status: 'processing' }
  }, { body: t.Object({
    videoUrl: t.String(),
    videoTitle: t.Optional(t.String()),
    channelName: t.Optional(t.String()),
    thumbnailUrl: t.Optional(t.String()),
    lang: t.Optional(t.String()),
    model: t.Optional(t.String()),
    customPrompt: t.Optional(t.String()),
    detail: t.Optional(t.Union([t.Literal('short'), t.Literal('long')])),
  }) })

  .get('/api/videos/:videoId/summaries', ({ params }) => {
    return getSummariesByVideoId(params.videoId)
  })

  .get('/api/summaries/:id', ({ params, set }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    return summary
  })

  .put('/api/summaries/:id/author', ({ params, body }) => {
    updateSummaryAuthor(params.id, body.author)
    return { ok: true }
  }, { body: t.Object({ author: t.String() }) })

  .post('/api/summaries/:id/retry', ({ params, set }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    const ok = resetSummaryForRetry(params.id)
    if (!ok) return jsonError(set, 'Retry failed', 400)
    emitStep(summary.id, summary.videoTitle || summary.videoUrl, 'queued', 'Retry gestartet...')
    processSummary(summary.id, summary.videoUrl, summary.lang || loadSettings().defaultLang, summary.model || loadSettings().openaiModel, summary.videoTitle || '', summary.channelName || '', undefined, summary.detail === 'short' ? 'short' : 'long')
    return { ok: true, id: summary.id, status: 'processing' }
  })

  // Nachfrage-Chat zu einer Zusammenfassung
  .get('/api/summaries/:id/chat', ({ params, set }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    return getSummaryChat(params.id)
  })

  .post('/api/summaries/:id/chat', async ({ body, params, set }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')

    const question = body.question.trim()
    if (!question) return jsonError(set, 'Frage ist leer', 400)

    const model = body.model || summary.model || loadSettings().openaiModel
    const history = getSummaryChat(params.id)
    const now = new Date().toISOString()

    try {
      const answer = await answerSummaryQuestion({
        model,
        videoTitle: summary.videoTitle,
        channelName: summary.channelName,
        transcript: summary.transcript ?? '',
        summary: summary.summary ?? '',
        history,
        question,
      })

      const messages: ChatMessage[] = [
        ...history,
        { id: `msg_${Date.now()}_user`, role: 'user', content: question, createdAt: now },
        { id: `msg_${Date.now()}_assistant`, role: 'assistant', content: answer, model, createdAt: new Date().toISOString() },
      ]
      saveSummaryChat(params.id, messages)
      return messages
    } catch (e: any) {
      const message = e?.message ?? 'Chat-Anfrage fehlgeschlagen'
      console.error(`[chat error] ${params.id}: ${message}`)
      return jsonError(set, message, 500)
    }
  }, { body: t.Object({ question: t.String(), model: t.Optional(t.String()) }) })

  .delete('/api/summaries/:id/chat', ({ params, set }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    clearSummaryChat(params.id)
    return { ok: true }
  })

  .delete('/api/summaries/:id', ({ params, set }) => {
    deletePredictionsBySummary(params.id)
    deleteTtsBySummary(params.id)
    const ok = deleteSummary(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  .get('/api/tts/index', () => getTtsIndex())

  .post('/api/tts/generate', async ({ body, set }) => {
    const summary = getSummaryById(body.summaryId)
    const label = summary?.videoTitle || body.summaryId
    const settings = loadSettings()
    const requestedModel = (body.model ?? settings.ttsModel) as TtsModel
    const requestedVoice = (body.voice ?? settings.ttsVoice) as TtsVoice
    const requestedInstructions = body.instructions ?? settings.ttsInstructions

    emitStep(body.summaryId, label, 'tts_generating', `TTS wird erstellt (${requestedModel}, ${requestedVoice})...`)
    try {
      const result = await getOrGenerateTts({
        summaryId: body.summaryId,
        text: body.text,
        model: requestedModel,
        voice: requestedVoice,
        instructions: requestedInstructions,
        forceRegenerate: body.forceRegenerate ?? false,
        onProgress: (msg) => emitStep(body.summaryId, label, 'tts_generating', msg),
      })
      if (result.cached) emitStep(body.summaryId, label, 'tts_cached', `TTS Cache-Hit (${result.model}, ${result.voice})`)
      else emitStep(body.summaryId, label, 'tts_done', `TTS erstellt (${result.model}, ${result.voice})`)

      if (body.sendToTelegram) {
        const filePath = resolveTtsFilePath(result.summaryId, result.variantKey)
        emitStep(body.summaryId, label, 'tts_generating', 'Sende TTS an Telegram...')
        await sendAudioToTelegram({
          filePath,
          caption: `${label} (${result.model}, ${result.voice})`,
          title: label,
        })
        emitStep(body.summaryId, label, 'tts_done', 'TTS an Telegram gesendet')
      }
      return result
    } catch (e: any) {
      const message = e?.message ?? 'TTS-Fehler'
      emitStep(body.summaryId, label, 'tts_error', message)
      return jsonError(set, message, 500)
    }
  }, {
    body: t.Object({
      summaryId: t.String(),
      text: t.String(),
      model: t.Optional(t.String()),
      voice: t.Optional(t.String()),
      instructions: t.Optional(t.String()),
      forceRegenerate: t.Optional(t.Boolean()),
      sendToTelegram: t.Optional(t.Boolean()),
    }),
  })

  .get('/api/tts/:summaryId/:variantKey', ({ params, set }) => {
    const summaryId = decodeURIComponent(params.summaryId)
    const variantKey = decodeURIComponent(params.variantKey)
    const filePath = resolveTtsFilePath(summaryId, variantKey)
    if (!existsSync(filePath)) return jsonError(set, 'Not found')
    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    })
  })

  // Predictions
  .get('/api/predictions', () => getAllPredictions())

  .post('/api/predictions', ({ body }) => {
    const rows = body.predictions.map(p => ({
      asset: p.name,
      direction: p.direction,
      ifCases: p.if_cases,
      priceTarget: p.price_target,
    }))
    insertPredictions(body.summaryId, body.videoTitle, body.videoUrl, body.channelName, body.author, rows)
    return { ok: true, added: rows.length }
  }, { body: t.Object({
    summaryId: t.String(),
    videoTitle: t.String(),
    videoUrl: t.String(),
    channelName: t.String(),
    author: t.String(),
    predictions: t.Array(t.Object({
      name: t.String(),
      direction: t.String(),
      if_cases: t.String(),
      price_target: t.String(),
    })),
  }) })

  .post('/api/predictions/manual', ({ body }) => {
    const id = insertManualPrediction(body.author ?? '', body.videoTitle ?? '', body.asset, body.direction, body.ifCases ?? '', body.priceTarget ?? '')
    return { ok: true, id }
  }, { body: t.Object({
    asset: t.String(),
    direction: t.String(),
    ifCases: t.Optional(t.String()),
    priceTarget: t.Optional(t.String()),
    author: t.Optional(t.String()),
    videoTitle: t.Optional(t.String()),
  }) })

  .delete('/api/predictions/:id', ({ params, set }) => {
    const ok = deletePrediction(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  // Custom Prompts CRUD
  .get('/api/custom-prompts', () => getAllCustomPrompts())

  .post('/api/custom-prompts', ({ body }) => {
    return createCustomPrompt(body.title, body.text)
  }, { body: t.Object({ title: t.String(), text: t.String() }) })

  .put('/api/custom-prompts/:id', ({ params, body, set }) => {
    const ok = updateCustomPrompt(params.id, body.title, body.text)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  }, { body: t.Object({ title: t.String(), text: t.String() }) })

  .delete('/api/custom-prompts/:id', ({ params, set }) => {
    const ok = deleteCustomPrompt(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  // Notes CRUD
  .get('/api/notes', () => getAllNotes())

  .post('/api/notes', ({ body }) => {
    return createNote(body.title ?? '', body.text ?? '', body.isTodo ?? true)
  }, { body: t.Object({ title: t.Optional(t.String()), text: t.Optional(t.String()), isTodo: t.Optional(t.Boolean()) }) })

  .put('/api/notes/:id', ({ params, body, set }) => {
    const ok = updateNote(params.id, body.title ?? '', body.text ?? '', body.isTodo ?? true)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  }, { body: t.Object({ title: t.Optional(t.String()), text: t.Optional(t.String()), isTodo: t.Optional(t.Boolean()) }) })

  .put('/api/notes/:id/done', ({ params, set }) => {
    const ok = markNoteDone(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  .delete('/api/notes/:id', ({ params, set }) => {
    const ok = deleteNote(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  // Danger zone: reset tables
  .delete('/api/reset/summaries', () => {
    deleteAllPredictions()
    const deleted = deleteAllSummaries()
    clearAllTts()
    return { ok: true, deleted }
  })

  .delete('/api/reset/notes', () => {
    const deleted = deleteAllNotes()
    return { ok: true, deleted }
  })

  .delete('/api/reset/predictions', () => {
    const deleted = deleteAllPredictions()
    return { ok: true, deleted }
  })

  .delete('/api/reset/settings', () => {
    resetSettings()
    return { ok: true }
  })

  // X.com summaries
  .get('/api/x', () => getAllXSummaries())

  .post('/api/x', ({ body }) => {
    const settings = loadSettings()
    const model = settings.openaiModel
    const tweetId = extractXId(body.tweetUrl)
    const id = createXSummary(tweetId, body.tweetUrl)
    emitStep(id, body.tweetUrl, 'queued', 'In Warteschlange...')
    processXSummary(id, body.tweetUrl, model)
    return { id, status: 'processing' }
  }, { body: t.Object({ tweetUrl: t.String() }) })

  .post('/api/x/:id/retry', ({ params, set }) => {
    const summary = getXSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    resetXSummaryForRetry(params.id)
    const settings = loadSettings()
    emitStep(summary.id, summary.tweetUrl, 'queued', 'Retry gestartet...')
    processXSummary(summary.id, summary.tweetUrl, settings.openaiModel)
    return { ok: true, id: summary.id, status: 'processing' }
  })

  .post('/api/x/:id/translate', async ({ params, set }) => {
    const summary = getXSummaryById(params.id)
    if (!summary) return jsonError(set, 'Not found')
    const settings = loadSettings()
    const content = await fetchXContent(summary.tweetUrl)
    const translation = await summarizeTranscript(
      content,
      settings.openaiModel,
      undefined,
      undefined,
      'Übersetze den folgenden Text vollständig und wörtlich ins Deutsche. Keine Zusammenfassung, exakte Übersetzung.',
    )
    return { translation }
  })

  .delete('/api/x/:id', ({ params, set }) => {
    const ok = deleteXSummary(params.id)
    if (!ok) return jsonError(set, 'Not found')
    return { ok: true }
  })

  .all('/api/*', ({ set }) => { set.status = 404; return { error: 'Not found' } })
  .listen({ port, hostname: '0.0.0.0' })

console.log(`[asi-server] listening on http://localhost:${port}`)
