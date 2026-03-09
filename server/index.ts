import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { getAllSummaries, getSummariesPage, getSummariesCount, getSummaryById, getSummariesByVideoId, createSummary, updateSummaryMeta, updateSummaryDone, updateSummaryError, updateSummaryAuthor, updateSummaryLang, resetSummaryForRetry, deleteSummary, deleteAllSummaries, getSummarizedVideoIds } from './db/summaries'
import { getAllNotes, createNote, updateNote, markNoteDone, deleteNote, deleteAllNotes } from './db/notes'
import { getAllPredictions, insertPredictions, deletePrediction, deletePredictionsBySummary, deleteAllPredictions } from './db/predictions'
import { extractSummaryMeta } from './services/tableParser'
import { getSettings, updateSettings, resetSettings } from './db/settings'
import { fetchSubscriptionFeed, invalidateFeedCache, fetchVideoMeta, downloadSubtitles, extractVideoId } from './services/youtube'
import { summarizeTranscript } from './services/summarizer'
import { loadSettings } from './config'
import { clearAllTts, deleteTtsBySummary, ensureTtsStorage, getOrGenerateTts, getTtsIndex, resolveTtsFilePath } from './services/tts'
import { sendAudioToTelegram } from './services/telegram'
import { DEFAULT_SETTINGS, type ProcessingEvent, type TtsModel, type TtsVoice } from '../shared/types'
import { existsSync } from 'node:fs'

const port = Number(process.env.PORT ?? 8788)

// SSE: Processing event bus
type EventListener = (event: ProcessingEvent) => void
const listeners = new Set<EventListener>()
ensureTtsStorage()

function emitEvent(event: ProcessingEvent) {
  for (const listener of listeners) listener(event)
}

function emitStep(summaryId: string, videoTitle: string, step: ProcessingEvent['step'], message: string) {
  emitEvent({ summaryId, videoTitle, step, message, timestamp: new Date().toISOString() })
}

async function processSummary(id: string, videoUrl: string, lang: string, model: string, knownTitle: string, knownChannel: string) {
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
    const { text: transcript, usedLang } = await downloadSubtitles(videoUrl, lang)
    if (usedLang !== lang) {
      emitStep(id, title, 'transcript', `Kein '${lang}' gefunden, verwende '${usedLang}'`)
      updateSummaryLang(id, usedLang)
    }

    emitStep(id, title, 'summarizing', `KI-Zusammenfassung läuft (${model})...`)
    const settings = loadSettings()
    const summary = await summarizeTranscript(transcript, model, (msg) => {
      emitStep(id, title, 'summarizing', msg)
    }, { title, channel })
    updateSummaryDone(id, transcript, summary, settings.summaryPrompt)

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

const app = new Elysia()
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
    return { ok: true }
  }, { body: t.Object({
    summaryPrompt: t.Optional(t.String()),
    defaultLang: t.Optional(t.String()),
    cookieBrowser: t.Optional(t.String()),
    openaiModel: t.Optional(t.String()),
    blockedChannels: t.Optional(t.Array(t.String())),
    ttsModel: t.Optional(t.String()),
    ttsVoice: t.Optional(t.String()),
    ttsInstructions: t.Optional(t.String()),
  }) })

  // YouTube Feed (paginated)
  .get('/api/youtube/feed', async ({ query }) => {
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
    const id = createSummary(videoId, body.videoUrl, lang, model, title, channel, thumbnail)
    emitStep(id, title || body.videoUrl, 'queued', 'In Warteschlange...')
    processSummary(id, body.videoUrl, lang, model, title, channel)
    return { id, status: 'processing' }
  }, { body: t.Object({
    videoUrl: t.String(),
    videoTitle: t.Optional(t.String()),
    channelName: t.Optional(t.String()),
    thumbnailUrl: t.Optional(t.String()),
    lang: t.Optional(t.String()),
    model: t.Optional(t.String()),
  }) })

  .get('/api/videos/:videoId/summaries', ({ params }) => {
    return getSummariesByVideoId(params.videoId)
  })

  .get('/api/summaries/:id', ({ params }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return summary
  })

  .put('/api/summaries/:id/author', ({ params, body }) => {
    updateSummaryAuthor(params.id, body.author)
    return { ok: true }
  }, { body: t.Object({ author: t.String() }) })

  .post('/api/summaries/:id/retry', ({ params }) => {
    const summary = getSummaryById(params.id)
    if (!summary) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    const ok = resetSummaryForRetry(params.id)
    if (!ok) return new Response(JSON.stringify({ error: 'Retry failed' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    emitStep(summary.id, summary.videoTitle || summary.videoUrl, 'queued', 'Retry gestartet...')
    processSummary(summary.id, summary.videoUrl, summary.lang || loadSettings().defaultLang, summary.model || loadSettings().openaiModel, summary.videoTitle || '', summary.channelName || '')
    return { ok: true, id: summary.id, status: 'processing' }
  })

  .delete('/api/summaries/:id', ({ params }) => {
    deletePredictionsBySummary(params.id)
    deleteTtsBySummary(params.id)
    const ok = deleteSummary(params.id)
    if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return { ok: true }
  })

  .get('/api/tts/index', () => getTtsIndex())

  .post('/api/tts/generate', async ({ body }) => {
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
      return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
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

  .get('/api/tts/:summaryId/:variantKey', ({ params }) => {
    const summaryId = decodeURIComponent(params.summaryId)
    const variantKey = decodeURIComponent(params.variantKey)
    const filePath = resolveTtsFilePath(summaryId, variantKey)
    if (!existsSync(filePath)) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }
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

  .delete('/api/predictions/:id', ({ params }) => {
    const ok = deletePrediction(params.id)
    if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return { ok: true }
  })

  // Notes CRUD
  .get('/api/notes', () => getAllNotes())

  .post('/api/notes', ({ body }) => {
    return createNote(body.title ?? '', body.text ?? '', body.isTodo ?? true)
  }, { body: t.Object({ title: t.Optional(t.String()), text: t.Optional(t.String()), isTodo: t.Optional(t.Boolean()) }) })

  .put('/api/notes/:id', ({ params, body }) => {
    const ok = updateNote(params.id, body.title ?? '', body.text ?? '', body.isTodo ?? true)
    if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return { ok: true }
  }, { body: t.Object({ title: t.Optional(t.String()), text: t.Optional(t.String()), isTodo: t.Optional(t.Boolean()) }) })

  .put('/api/notes/:id/done', ({ params }) => {
    const ok = markNoteDone(params.id)
    if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    return { ok: true }
  })

  .delete('/api/notes/:id', ({ params }) => {
    const ok = deleteNote(params.id)
    if (!ok) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
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

  .all('/api/*', ({ set }) => { set.status = 404; return { error: 'Not found' } })
  .listen({ port, hostname: '0.0.0.0' })

console.log(`[asi-server] listening on http://localhost:${port}`)
