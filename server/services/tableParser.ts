/**
 * Extracts structured prediction data and author from AI summary text.
 * Looks for JSON code blocks with prediction arrays and the "Hauptsprecher" metadata line.
 */

export interface PredictionRow {
  asset: string
  direction: string
  ifCases: string
  priceTarget: string
}

export interface SummaryMeta {
  author: string
  predictions: PredictionRow[]
}

export function extractSummaryMeta(summaryText: string): SummaryMeta {
  return {
    author: extractAuthor(summaryText),
    predictions: extractPredictions(summaryText),
  }
}

function extractAuthor(text: string): string {
  const patterns = [
    /\*\*Hauptsprecher\s*\/?\s*Interviewpartner:\*\*\s*(.+)/i,
    /\*\*Hauptsprecher:\*\*\s*(.+)/i,
    /\*\*Interviewpartner:\*\*\s*(.+)/i,
    /-\s*\*\*Hauptsprecher[^:]*:\*\*\s*(.+)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].replace(/\*+/g, '').replace(/\[.*?\]/g, '').trim()
    }
  }

  return ''
}

export function extractPredictions(summaryText: string): PredictionRow[] {
  const results: PredictionRow[] = []

  results.push(...parseJsonBlocks(summaryText))

  if (results.length === 0) {
    results.push(...parseFallbackTables(summaryText))
  }

  const seen = new Set<string>()
  return results.filter(r => {
    if (!r.asset) return false
    const key = `${r.asset}|${r.direction}|${r.priceTarget}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseJsonBlocks(text: string): PredictionRow[] {
  const rows: PredictionRow[] = []

  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g
  let match
  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (typeof item !== 'object' || !item) continue
        const name = item.name ?? item.asset ?? item.Name ?? item.Asset ?? ''
        if (!name) continue
        rows.push({
          asset: String(name).trim(),
          direction: String(item.direction ?? item.Direction ?? item.richtung ?? '').trim(),
          ifCases: String(item.if_cases ?? item.ifCases ?? item.if_case ?? item.bedingung ?? '').trim(),
          priceTarget: String(item.price_target ?? item.priceTarget ?? item.target ?? item.kursziel ?? item.ziel ?? '').trim(),
        })
      }
    } catch {
      // not valid JSON, skip
    }
  }

  if (rows.length === 0) {
    const inlineRegex = /\[[\s\S]*?\{[\s\S]*?"name"[\s\S]*?\}[\s\S]*?\]/g
    let inlineMatch
    while ((inlineMatch = inlineRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(inlineMatch[0])
        const items = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of items) {
          if (typeof item !== 'object' || !item) continue
          const name = item.name ?? item.asset ?? ''
          if (!name) continue
          rows.push({
            asset: String(name).trim(),
            direction: String(item.direction ?? '').trim(),
            ifCases: String(item.if_cases ?? item.ifCases ?? '').trim(),
            priceTarget: String(item.price_target ?? item.priceTarget ?? item.target ?? '').trim(),
          })
        }
      } catch {}
    }
  }

  return rows
}

/** Legacy fallback: still parse Markdown/HTML tables from older summaries */
function parseFallbackTables(text: string): PredictionRow[] {
  const rows: PredictionRow[] = []
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes('|') && !isSeparator(line)) {
      const nextLine = (lines[i + 1] ?? '').trim()
      if (isSeparator(nextLine)) {
        const headers = splitRow(line).map(h => h.toLowerCase())
        const colMap = mapColumns(headers)
        if (colMap) {
          i += 2
          while (i < lines.length) {
            const bodyLine = lines[i].trim()
            if (!bodyLine.includes('|') || isSeparator(bodyLine)) break
            const cells = splitRow(bodyLine)
            const asset = cells[colMap.asset] ?? ''
            const direction = cells[colMap.direction] ?? ''
            const target = cells[colMap.target] ?? ''
            if (asset) rows.push({ asset: clean(asset), direction: clean(direction), ifCases: '', priceTarget: clean(target) })
            i++
          }
          continue
        }
      }
    }
    i++
  }

  const tableRegex = /<table[\s\S]*?<\/table>/gi
  let tableMatch
  while ((tableMatch = tableRegex.exec(text)) !== null) {
    const table = tableMatch[0]
    const headerCells = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => stripTags(m[1]).trim().toLowerCase())
    const colMap = mapColumns(headerCells)
    if (!colMap) continue
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let isFirst = true
    let trMatch
    while ((trMatch = trRegex.exec(table)) !== null) {
      if (isFirst) { isFirst = false; continue }
      const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripTags(m[1]).trim())
      const asset = cells[colMap.asset] ?? ''
      const direction = cells[colMap.direction] ?? ''
      const target = cells[colMap.target] ?? ''
      if (asset) rows.push({ asset: clean(asset), direction: clean(direction), ifCases: '', priceTarget: clean(target) })
    }
  }

  return rows
}

function isSeparator(line: string): boolean {
  const stripped = line.replace(/\|/g, '').replace(/[-: ]/g, '')
  return line.includes('|') && line.includes('-') && stripped.length === 0
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

function mapColumns(headers: string[]): { asset: number; direction: number; target: number } | null {
  let asset = -1, direction = -1, target = -1
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (/\b(name|asset|instrument|ticker)\b/i.test(h) && asset === -1) asset = i
    else if (/\b(long|short|direction|richtung)\b/i.test(h) && direction === -1) direction = i
    else if (/\b(target|price|preis|if.case|kurs|prognos|ziel)\b/i.test(h) && target === -1) target = i
  }
  if (asset === -1) return null
  if (direction === -1) direction = asset + 1 < headers.length ? asset + 1 : asset
  if (target === -1) target = direction + 1 < headers.length ? direction + 1 : direction
  return { asset, direction, target }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function clean(s: string): string {
  return s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim()
}
