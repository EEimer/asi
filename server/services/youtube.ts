import { mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { YouTubeVideo } from '../../shared/types'
import { loadSettings } from '../config'

function cookieArgs(): string[] {
  const { cookieBrowser } = loadSettings()
  return ['--cookies-from-browser', cookieBrowser]
}

export function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/)
  return match?.[1] ?? url
}

let feedCache: YouTubeVideo[] = []
let feedFetchedAt = 0
let feedFetching: Promise<void> | null = null
let feedExhausted = false
const FEED_TTL_MS = 5 * 60 * 1000

async function fetchChannelName(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
    if (!res.ok) return ''
    const data = await res.json() as any
    return data.author_name ?? ''
  } catch { return '' }
}

async function refreshFeedCache(targetCount: number) {
  const previousCount = feedCache.length
  const proc = Bun.spawn(
    ['yt-dlp', '--flat-playlist', '--dump-json', ...cookieArgs(), '--playlist-end', String(targetCount), ':ytsubs'],
    { stdout: 'pipe', stderr: 'pipe' },
  )

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  await proc.exited

  if (proc.exitCode !== 0) throw new Error(`yt-dlp feed error: ${stderr.slice(0, 500)}`)

  const seen = new Set<string>()
  const videos: YouTubeVideo[] = []
  for (const line of stdout.trim().split('\n')) {
    if (!line.trim()) continue
    try {
      const j = JSON.parse(line)
      const id = j.id ?? ''
      if (seen.has(id)) continue
      const liveStatus = j.live_status ?? ''
      if (liveStatus === 'is_upcoming' || liveStatus === 'is_live' || liveStatus === 'post_live') continue
      if (!j.duration && j.live_status !== 'was_live') continue
      seen.add(id)
      videos.push({
        id,
        title: j.title ?? 'Untitled',
        channel: j.channel ?? j.uploader ?? '',
        channelUrl: j.channel_url ?? j.uploader_url ?? '',
        thumbnail: j.thumbnails?.at(-1)?.url ?? `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        duration: j.duration ?? 0,
        durationFormatted: formatDuration(j.duration ?? 0),
        uploadDate: formatUploadDate(j.upload_date ?? ''),
        url: j.url ? `https://www.youtube.com/watch?v=${id}` : j.webpage_url ?? '',
      })
    } catch {}
  }

  // Fetch channel names via oEmbed (parallel, fast)
  const needsChannel = videos.filter(v => !v.channel)
  if (needsChannel.length) {
    const results = await Promise.all(needsChannel.map(v => fetchChannelName(v.id)))
    needsChannel.forEach((v, i) => { if (results[i]) v.channel = results[i] })
  }

  feedCache = videos
  feedFetchedAt = Date.now()
  feedExhausted = videos.length < targetCount
}

export async function fetchSubscriptionFeed(offset = 0, limit = 30): Promise<{ videos: YouTubeVideo[]; total: number; hasMore: boolean }> {
  const needed = offset + limit
  const cacheStale = Date.now() - feedFetchedAt > FEED_TTL_MS

  if (feedCache.length < needed || (cacheStale && offset === 0)) {
    if (!feedFetching) {
      const target = Math.max(needed, feedCache.length + 30)
      feedFetching = refreshFeedCache(target).finally(() => { feedFetching = null })
    }
    await feedFetching
  }

  const slice = feedCache.slice(offset, offset + limit)
  const hasMore = !feedExhausted || offset + limit < feedCache.length
  return { videos: slice, total: feedCache.length, hasMore }
}

export function invalidateFeedCache() {
  feedCache = []
  feedFetchedAt = 0
  feedExhausted = false
}

export async function fetchVideoMeta(videoUrl: string): Promise<{ title: string; channel: string; thumbnail: string }> {
  const proc = Bun.spawn(
    ['yt-dlp', '--dump-json', '--skip-download', ...cookieArgs(), videoUrl],
    { stdout: 'pipe', stderr: 'pipe' },
  )

  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  if (proc.exitCode !== 0) return { title: 'Unknown', channel: 'Unknown', thumbnail: '' }

  try {
    const j = JSON.parse(stdout)
    return {
      title: j.title ?? 'Unknown',
      channel: j.channel ?? j.uploader ?? 'Unknown',
      thumbnail: j.thumbnail ?? j.thumbnails?.at(-1)?.url ?? '',
    }
  } catch {
    return { title: 'Unknown', channel: 'Unknown', thumbnail: '' }
  }
}

export async function downloadSubtitles(videoUrl: string, lang: string): Promise<{ text: string; usedLang: string }> {
  const langs = [lang, ...(lang !== 'en' ? ['en'] : [])]

  for (const tryLang of langs) {
    const tmpDir = `/tmp/asi_subs_${Date.now()}_${tryLang}`
    mkdirSync(tmpDir, { recursive: true })

    for (const flag of ['--write-auto-sub', '--write-sub']) {
      const proc = Bun.spawn(
        ['yt-dlp', flag, '--sub-lang', tryLang, '--skip-download', '--sub-format', 'srt', ...cookieArgs(), '-o', `${tmpDir}/%(id)s.%(ext)s`, videoUrl],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      await proc.exited

      const files = readdirSync(tmpDir).filter(f => f.endsWith('.srt'))
      if (files.length) {
        const srtContent = readFileSync(join(tmpDir, files[0]), 'utf-8')
        rmSync(tmpDir, { recursive: true, force: true })
        return { text: srtToText(srtContent), usedLang: tryLang }
      }
    }

    rmSync(tmpDir, { recursive: true, force: true })
  }

  throw new Error(`No subtitles found (tried: ${langs.join(', ')})`)
}

function srtToText(srt: string): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const line of srt.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || /^\d+$/.test(trimmed) || trimmed.includes('-->')) continue
    const clean = trimmed.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    if (clean && !seen.has(clean)) { seen.add(clean); lines.push(clean) }
  }
  return lines.join('\n')
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatUploadDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw
  return `${raw.slice(6, 8)}.${raw.slice(4, 6)}.${raw.slice(0, 4)}`
}
