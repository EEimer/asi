import { existsSync } from 'fs'

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

export function isXUrl(url: string): boolean {
  return /https?:\/\/(www\.)?(x\.com|twitter\.com)/.test(url)
}

export function extractXId(url: string): string {
  const match = url.match(/\/status\/(\d+)/)
  return match?.[1] ?? url
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

interface OembedResult {
  text: string
  author: string
  username: string
}

async function fetchViaOembed(url: string): Promise<OembedResult | null> {
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    )
    if (!res.ok) return null
    const j = await res.json() as any

    // Extract tweet text from blockquote HTML
    const pMatch = (j.html as string ?? '').match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const rawText = pMatch ? stripHtml(pMatch[1]) : ''
    const author = j.author_name ?? ''
    const usernameMatch = (j.author_url as string ?? '').match(/twitter\.com\/([^/]+)$/)
    const username = usernameMatch?.[1] ?? ''

    if (!rawText) return null
    return { text: rawText, author, username }
  } catch { return null }
}

async function fetchViaYtDlp(url: string): Promise<{ description: string; uploader: string; thumbnail: string } | null> {
  const proc = Bun.spawn(
    [YT_DLP, '--dump-json', '--skip-download', '--no-playlist', url],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const killTimer = setTimeout(() => proc.kill(), 20_000)
  const stdout = await new Response(proc.stdout).text()
  await proc.exited
  clearTimeout(killTimer)
  try {
    const j = JSON.parse(stdout.trim())
    return {
      description: j.description ?? j.title ?? '',
      uploader: j.uploader ?? j.uploader_id ?? '',
      thumbnail: j.thumbnail ?? j.thumbnails?.at(-1)?.url ?? '',
    }
  } catch { return null }
}

export async function fetchXMeta(url: string): Promise<{ title: string; channel: string; thumbnail: string }> {
  const [oembed, ytdlp] = await Promise.allSettled([
    fetchViaOembed(url),
    fetchViaYtDlp(url),
  ])

  const o = oembed.status === 'fulfilled' ? oembed.value : null
  const yt = ytdlp.status === 'fulfilled' ? ytdlp.value : null

  return {
    title: o?.text?.slice(0, 120) ?? yt?.description?.slice(0, 120) ?? url,
    channel: o?.username ?? o?.author ?? yt?.uploader ?? '',
    thumbnail: yt?.thumbnail ?? '',
  }
}

export async function fetchXContent(url: string): Promise<string> {
  const [oResult, ytResult] = await Promise.allSettled([
    fetchViaOembed(url),
    fetchViaYtDlp(url),
  ])

  const o = oResult.status === 'fulfilled' ? oResult.value : null
  const yt = ytResult.status === 'fulfilled' ? ytResult.value : null

  const oText = o?.text ? `@${o.username} (${o.author}):\n${o.text}` : null
  const ytText = yt?.description || null

  // yt-dlp often has the untruncated full text; prefer whichever is longer
  if (oText && ytText) return ytText.length > oText.length ? ytText : oText
  if (ytText) return ytText
  if (oText) return oText

  throw new Error('Tweet-Inhalt konnte nicht extrahiert werden. Der Tweet könnte privat oder gelöscht sein.')
}
