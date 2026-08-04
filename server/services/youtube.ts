import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { YouTubeVideo } from '../../shared/types'
import { loadSettings } from '../config'

const COOKIE_BROWSER_PATHS: Record<string, string[]> = {
  chrome: [
    '/Applications/Google Chrome.app',
    `${process.env.HOME}/Applications/Google Chrome.app`,
  ],
  safari: [
    '/Applications/Safari.app',
    `${process.env.HOME}/Applications/Safari.app`,
  ],
  firefox: [
    '/Applications/Firefox.app',
    `${process.env.HOME}/Applications/Firefox.app`,
  ],
  edge: [
    '/Applications/Microsoft Edge.app',
    `${process.env.HOME}/Applications/Microsoft Edge.app`,
  ],
  brave: [
    '/Applications/Brave Browser.app',
    `${process.env.HOME}/Applications/Brave Browser.app`,
  ],
}

function isBrowserInstalled(browser: string): boolean {
  return (COOKIE_BROWSER_PATHS[browser] ?? []).some(path => existsSync(path))
}

function resolveCookieBrowser(): string | null {
  const { cookieBrowser } = loadSettings()
  if (cookieBrowser && isBrowserInstalled(cookieBrowser)) return cookieBrowser
  for (const browser of Object.keys(COOKIE_BROWSER_PATHS)) {
    if (isBrowserInstalled(browser)) return browser
  }
  return null
}

const YT_DLP = (() => {
  const candidates = [
    process.env.YT_DLP_PATH,
    `${process.env.HOME}/Library/Python/3.14/bin/yt-dlp`,
    `${process.env.HOME}/Library/Python/3.13/bin/yt-dlp`,
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
  ].filter(Boolean) as string[]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return 'yt-dlp'
})()

const DENO_BIN = (() => {
  const candidates = [
    `${process.env.HOME}/.deno/bin/deno`,
    '/usr/local/bin/deno',
    '/opt/homebrew/bin/deno',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
})()

function ytdlpBaseArgs(): string[] {
  const args: string[] = []
  if (DENO_BIN) {
    args.push('--js-runtimes', `deno:${DENO_BIN}`, '--remote-components', 'ejs:github')
  }
  args.push('--impersonate', 'chrome-136')
  return args
}

function cookieArgs(browser: string): string[] {
  if (!isBrowserInstalled(browser)) return []
  return ['--cookies-from-browser', browser]
}

const HTTP_TIMEOUT_MS = 15_000

// Harte Obergrenze für einen yt-dlp-Aufruf.
//
// `proc.kill()` allein genügt nicht: mit `--js-runtimes deno:…` startet yt-dlp
// einen Deno-Subprozess, der die stdout-Pipe erbt. Stirbt nur yt-dlp, bleibt die
// Pipe durch das Enkelkind offen und `new Response(proc.stdout).text()` wartet
// ewig auf EOF. Darum wird zusätzlich gegen eine Deadline gerannt und das
// Leseergebnis notfalls verworfen.
async function runYtDlp(args: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })

  const collect = (async () => {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    await proc.exited
    return { exitCode: proc.exitCode ?? -1, stdout, stderr }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`yt-dlp timeout nach ${Math.round(timeoutMs / 1000)}s`)),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([collect, deadline])
  } finally {
    clearTimeout(timer)
    if (proc.exitCode === null) proc.kill('SIGKILL')
  }
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
const FEED_REFRESH_TIMEOUT_MS = 3 * 60 * 1000

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} nach ${Math.round(ms / 1000)}s abgebrochen (Timeout)`)),
      ms,
    )
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>
}

async function fetchOembedMeta(videoId: string): Promise<{ title: string; channel: string; thumbnail: string }> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    if (!res.ok) return { title: '', channel: '', thumbnail: '' }
    const data = await res.json() as any
    return {
      title: data.title ?? '',
      channel: data.author_name ?? '',
      thumbnail: data.thumbnail_url ?? '',
    }
  } catch {
    return { title: '', channel: '', thumbnail: '' }
  }
}

async function fetchChannelIds(): Promise<{ id: string; name: string; url: string }[]> {
  const settings = loadSettings()
  const candidates = [settings.cookieBrowser, ...Object.keys(COOKIE_BROWSER_PATHS)]
    .filter((value, index, self) => typeof value === 'string' && self.indexOf(value) === index)
    .filter(browser => isBrowserInstalled(browser)) as string[]

  if (!candidates.length) {
    throw new Error('Kein installierter Browser mit YouTube-Cookies gefunden. Bitte wähle in den Einstellungen einen installierten Browser wie Chrome, Safari, Firefox oder Edge aus.')
  }

  let lastError: string | null = null
  for (const browser of candidates) {
    const browserArgs = cookieArgs(browser)
    if (browserArgs.length === 0) continue

    let stdout: string
    try {
      const res = await runYtDlp(
        [YT_DLP, ...ytdlpBaseArgs(), '--flat-playlist', '--dump-json', '--skip-download', ...browserArgs, 'https://www.youtube.com/feed/channels'],
        30_000,
      )
      if (res.exitCode !== 0) {
        lastError = `browser=${browser} error=${res.stderr.slice(0, 500)}`
        continue
      }
      stdout = res.stdout
    } catch (e: any) {
      lastError = `browser=${browser} ${e?.message ?? 'unbekannter Fehler'}`
      continue
    }

    const channels: { id: string; name: string; url: string }[] = []
    const seen = new Set<string>()
    for (const line of stdout.split('\n').filter(l => l.trim())) {
      try {
        const j = JSON.parse(line)
        const id = j.channel_id ?? j.id ?? ''
        if (!id || seen.has(id)) continue
        seen.add(id)
        channels.push({ id, name: j.channel ?? j.title ?? '', url: j.channel_url ?? j.url ?? '' })
      } catch {}
    }
    if (channels.length) return channels
    lastError = `browser=${browser} no channels found`
  }

  throw new Error(`yt-dlp subs error: ${lastError ?? 'kein lauffähiger Browser gefunden'}`)
}

async function fetchRssFeed(channelId: string, channelName: string, channelUrl: string): Promise<YouTubeVideo[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const xml = await res.text()
    const entries: YouTubeVideo[] = []
    const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
    for (const block of entryBlocks) {
      const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? ''
      if (!id) continue
      const title = block.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'Untitled'
      const published = block.match(/<published>([^<]+)<\/published>/)?.[1] ?? ''
      const thumbnail = block.match(/url="([^"]+)"[^/]*\/>/)?.[1] ?? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
      const publishedAt = published ? Math.floor(new Date(published).getTime() / 1000) : undefined
      const uploadDate = published ? formatUploadDate(published.slice(0, 10).replace(/-/g, '')) : ''
      entries.push({
        id,
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        channel: channelName,
        channelUrl,
        thumbnail,
        duration: 0,
        durationFormatted: '',
        uploadDate,
        publishedAt,
        url: `https://www.youtube.com/watch?v=${id}`,
      })
    }
    return entries
  } catch { return [] }
}

async function fetchDurationMap(browserArgs: string[]): Promise<{ durations: Map<string, { duration: number; durationFormatted: string }>; shortIds: Set<string> }> {
  const durations = new Map<string, { duration: number; durationFormatted: string }>()
  const shortIds = new Set<string>()
  try {
    const { stdout } = await runYtDlp(
      [YT_DLP, ...ytdlpBaseArgs(), '--flat-playlist', '--dump-json', '--skip-download', ...browserArgs, '--playlist-end', '200', ':ytsubs'],
      30_000,
    )
    for (const line of stdout.split('\n').filter(l => l.trim())) {
      try {
        const j = JSON.parse(line)
        if (!j.id) continue
        const isShort = (j.url ?? j.webpage_url ?? '').includes('/shorts/') || (j.duration > 0 && j.duration <= 60)
        if (isShort) { shortIds.add(j.id); continue }
        if (j.duration) durations.set(j.id, { duration: j.duration, durationFormatted: j.duration_string ?? formatDuration(j.duration) })
      } catch {}
    }
  } catch {}
  return { durations, shortIds }
}

async function refreshFeedCache(_targetCount: number) {
  const settings = loadSettings()
  const browser = (() => {
    const candidates = [settings.cookieBrowser, ...Object.keys(COOKIE_BROWSER_PATHS)]
      .filter((v, i, s) => typeof v === 'string' && s.indexOf(v) === i)
      .filter(b => isBrowserInstalled(b)) as string[]
    return candidates[0] ?? null
  })()
  const browserArgs = browser ? cookieArgs(browser) : []

  const [channels, { durations: durationMap, shortIds }] = await Promise.all([
    fetchChannelIds(),
    browserArgs.length ? fetchDurationMap(browserArgs) : Promise.resolve({ durations: new Map(), shortIds: new Set<string>() }),
  ])
  if (!channels.length) throw new Error('No subscribed channels found')

  const BATCH = 20
  const allVideos: YouTubeVideo[] = []
  for (let i = 0; i < channels.length; i += BATCH) {
    const batch = channels.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(c => fetchRssFeed(c.id, c.name, c.url)))
    for (const vids of results) allVideos.push(...vids)
  }

  const seen = new Set<string>()
  const videos: YouTubeVideo[] = []
  for (const v of allVideos) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    if (shortIds.has(v.id)) continue
    const dur = durationMap.get(v.id)
    if (dur) { v.duration = dur.duration; v.durationFormatted = dur.durationFormatted }
    if (v.duration <= 60) continue
    videos.push(v)
  }
  videos.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))

  feedCache = videos
  feedFetchedAt = Date.now()
  feedExhausted = true
}

export async function fetchSubscriptionFeed(offset = 0, limit = 30): Promise<{ videos: YouTubeVideo[]; total: number; hasMore: boolean }> {
  const cacheStale = Date.now() - feedFetchedAt > FEED_TTL_MS

  if (feedCache.length === 0 || (cacheStale && offset === 0)) {
    if (!feedFetching) {
      // Deadline um den kompletten Refresh: bleibt er trotz aller Einzel-
      // Timeouts hängen, würde `feedFetching` sonst nie wieder auf null gesetzt
      // und *jeder* weitere Feed-Request wartet für immer auf diese eine Promise.
      feedFetching = withDeadline(refreshFeedCache(0), FEED_REFRESH_TIMEOUT_MS, 'Feed-Refresh')
        .finally(() => { feedFetching = null })
    }
    await feedFetching
  }

  const slice = feedCache.slice(offset, offset + limit)
  const hasMore = offset + limit < feedCache.length
  return { videos: slice, total: feedCache.length, hasMore }
}

export function invalidateFeedCache() {
  feedCache = []
  feedFetchedAt = 0
  feedExhausted = false
}

export async function fetchVideoMeta(videoUrl: string): Promise<{ title: string; channel: string; thumbnail: string }> {
  const videoId = extractVideoId(videoUrl)
  const fallbackThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  const oembed = await fetchOembedMeta(videoId)

  const browser = resolveCookieBrowser()
  const proc = Bun.spawn(
    [YT_DLP, ...ytdlpBaseArgs(), '--dump-json', '--skip-download', ...(browser ? cookieArgs(browser) : []), videoUrl],
    { stdout: 'pipe', stderr: 'pipe' },
  )

  const stdout = await new Response(proc.stdout).text()
  await proc.exited

  if (proc.exitCode !== 0) {
    return {
      title: oembed.title || 'Unknown',
      channel: oembed.channel || '',
      thumbnail: oembed.thumbnail || fallbackThumb,
    }
  }

  try {
    const j = JSON.parse(stdout)
    return {
      title: j.title ?? oembed.title ?? 'Unknown',
      channel: j.channel ?? j.uploader ?? oembed.channel ?? '',
      thumbnail: j.thumbnail ?? j.thumbnails?.at(-1)?.url ?? oembed.thumbnail ?? fallbackThumb,
    }
  } catch {
    return {
      title: oembed.title || 'Unknown',
      channel: oembed.channel || '',
      thumbnail: oembed.thumbnail || fallbackThumb,
    }
  }
}

export async function downloadSubtitles(videoUrl: string, lang: string): Promise<{ text: string; usedLang: string }> {
  const langs = [lang, ...(lang !== 'en' ? ['en'] : [])]
  const browser = resolveCookieBrowser()

  for (const tryLang of langs) {
    const tmpDir = `/tmp/asi_subs_${Date.now()}_${tryLang}`
    mkdirSync(tmpDir, { recursive: true })

    const cookieStrategies: string[][] = browser ? [cookieArgs(browser), []] : [[]]

    for (const extraArgs of cookieStrategies) {
      for (const flag of ['--write-auto-sub', '--write-sub']) {
        const proc = Bun.spawn(
          [YT_DLP, ...ytdlpBaseArgs(), flag, '--sub-lang', tryLang, '--skip-download', ...extraArgs, '-o', `${tmpDir}/%(id)s.%(ext)s`, videoUrl],
          { stdout: 'pipe', stderr: 'pipe' },
        )
        await proc.exited

        const files = readdirSync(tmpDir).filter(f =>
          f.endsWith('.srt') || f.endsWith('.vtt') || f.endsWith('.json3'),
        )
        if (files.length) {
          const rawContent = readFileSync(join(tmpDir, files[0]), 'utf-8')
          rmSync(tmpDir, { recursive: true, force: true })
          return { text: subtitlesToText(rawContent), usedLang: tryLang }
        }
      }
    }

    rmSync(tmpDir, { recursive: true, force: true })
  }

  throw new Error(`No subtitles found (tried: ${langs.join(', ')})`)
}

function subtitlesToText(srt: string): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const line of srt.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || /^\d+$/.test(trimmed) || trimmed.includes('-->')) continue
    if (/^(WEBVTT|NOTE|Kind:|Language:)/i.test(trimmed)) continue
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
