import db from './database'

export interface Prediction {
  id: string
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  author: string
  assetName: string
  direction: string
  ifCases: string
  priceTarget: string
  createdAt: string
}

const LIST_QUERY = `SELECT id, summary_id AS summaryId, video_title AS videoTitle, video_url AS videoUrl, channel_name AS channelName, author, asset_name AS assetName, direction, if_cases AS ifCases, price_target AS priceTarget, replace(created_at,' ','T')||'Z' AS createdAt FROM predictions ORDER BY created_at DESC`

export function getAllPredictions(): Prediction[] {
  return db.query(LIST_QUERY).all() as Prediction[]
}

export interface PredictionRow {
  asset: string
  direction: string
  ifCases: string
  priceTarget: string
}

export function insertPredictions(summaryId: string, videoTitle: string, videoUrl: string, channelName: string, author: string, rows: PredictionRow[]) {
  const stmt = db.prepare('INSERT INTO predictions (id, summary_id, video_title, video_url, channel_name, author, asset_name, direction, if_cases, price_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const row of rows) {
    const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    stmt.run(id, summaryId, videoTitle, videoUrl, channelName, author, row.asset, row.direction, row.ifCases, row.priceTarget)
  }
}

export function deletePrediction(id: string): boolean {
  const result = db.query('DELETE FROM predictions WHERE id = ?').run(id)
  return result.changes > 0
}

export function deletePredictionsBySummary(summaryId: string) {
  db.query('DELETE FROM predictions WHERE summary_id = ?').run(summaryId)
}

export function deleteAllPredictions(): number {
  const result = db.query('DELETE FROM predictions').run()
  return result.changes
}
