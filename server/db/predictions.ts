import db from './database'

export interface Prediction {
  id: string
  summaryId: string
  videoTitle: string
  videoUrl: string
  channelName: string
  assetName: string
  direction: string
  target: string
  createdAt: string
}

const LIST_QUERY = `SELECT id, summary_id AS summaryId, video_title AS videoTitle, video_url AS videoUrl, channel_name AS channelName, asset_name AS assetName, direction, target, replace(created_at,' ','T')||'Z' AS createdAt FROM predictions ORDER BY created_at DESC`

export function getAllPredictions(): Prediction[] {
  return db.query(LIST_QUERY).all() as Prediction[]
}

export function insertPredictions(summaryId: string, videoTitle: string, videoUrl: string, channelName: string, rows: { asset: string; direction: string; target: string }[]) {
  const stmt = db.prepare('INSERT INTO predictions (id, summary_id, video_title, video_url, channel_name, asset_name, direction, target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const row of rows) {
    const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    stmt.run(id, summaryId, videoTitle, videoUrl, channelName, row.asset, row.direction, row.target)
  }
}

export function deletePredictionsBySummary(summaryId: string) {
  db.query('DELETE FROM predictions WHERE summary_id = ?').run(summaryId)
}
