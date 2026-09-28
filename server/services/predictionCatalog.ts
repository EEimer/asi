/**
 * Katalog aller Prognosen: die übernommenen aus der predictions-Tabelle plus
 * die, die in einer Zusammenfassung stecken, aber nie in die Glaskugel
 * übernommen wurden. Letztere werden bei jedem Aufruf frisch aus dem
 * Summary-Text geparst – es wird nichts gespeichert.
 */

import db from '../db/database'
import { getAllPredictions } from '../db/predictions'
import { extractPredictions } from './tableParser'
import type { Prediction } from '../../shared/types'

interface SummarySource {
  id: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
  summary: string
  createdAt: string
}

const SOURCE_SELECT = `
  SELECT id, video_title AS videoTitle, video_url AS videoUrl, channel_name AS channelName,
         author, summary, replace(created_at,' ','T')||'Z' AS createdAt
  FROM summaries
  WHERE status = 'done' AND summary IS NOT NULL AND summary != ''`

const SOURCE_QUERY = `${SOURCE_SELECT} ORDER BY created_at DESC`
const SOURCE_SINCE_QUERY = `${SOURCE_SELECT} AND created_at >= datetime('now', ?) ORDER BY created_at DESC`

/* Lockerer Schlüssel: das Kursziel wird vor dem Übernehmen oft noch editiert,
   ein Vergleich über alle vier Felder würde solche Zeilen doppelt zeigen.
   Preis: zwei Prognosen zum selben Asset mit gleicher Richtung in einem Video
   fallen zusammen – seltener Fall, den Dopplungen wären lästiger. */
function key(summaryId: string, asset: string, direction: string): string {
  return [summaryId, asset, direction].map(v => v.trim().toLowerCase()).join('||')
}

/**
 * `sinceMonths` grenzt auf die letzten N Monate ein – nach dem Zeitpunkt der
 * Zusammenfassung, nicht nach dem Upload-Datum des Videos (das steht nicht in
 * der Datenbank). Ohne Wert kommt der ganze Bestand.
 */
export function getPredictionCatalog(sinceMonths?: number): Prediction[] {
  const saved = getAllPredictions(sinceMonths).map(p => ({ ...p, saved: true }))
  const savedKeys = new Set(saved.map(p => key(p.summaryId, p.assetName, p.direction)))

  const sources = (sinceMonths
    ? db.query(SOURCE_SINCE_QUERY).all(`-${sinceMonths} months`)
    : db.query(SOURCE_QUERY).all()) as SummarySource[]
  const derived: Prediction[] = []

  for (const s of sources) {
    let index = 0
    for (const row of extractPredictions(s.summary)) {
      const k = key(s.id, row.asset, row.direction)
      if (savedKeys.has(k)) continue
      savedKeys.add(k)
      derived.push({
        /* Kein DB-Eintrag, also auch keine echte ID – der Key muss nur innerhalb
           der Liste stabil und eindeutig sein (React-key, Add-Button-State). */
        id: `derived_${s.id}_${index++}`,
        summaryId: s.id,
        videoTitle: s.videoTitle,
        videoUrl: s.videoUrl,
        channelName: s.channelName,
        author: s.author ?? '',
        assetName: row.asset,
        direction: row.direction,
        ifCases: row.ifCases,
        priceTarget: row.priceTarget,
        createdAt: s.createdAt,
        saved: false,
      })
    }
  }

  return [...saved, ...derived].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
