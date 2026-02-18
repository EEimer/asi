import db from './database'
import type { Summary, SummaryListItem } from '../../shared/types'

const LIST_QUERY = `SELECT id, video_id AS videoId, video_url AS videoUrl, video_title AS videoTitle, channel_name AS channelName, thumbnail_url AS thumbnailUrl, lang, summary, status, error_message AS errorMessage, replace(created_at,' ','T')||'Z' AS createdAt FROM summaries ORDER BY created_at DESC`

const DETAIL_QUERY = `SELECT id, video_id AS videoId, video_url AS videoUrl, video_title AS videoTitle, channel_name AS channelName, thumbnail_url AS thumbnailUrl, lang, transcript, summary, custom_prompt AS customPrompt, status, error_message AS errorMessage, replace(created_at,' ','T')||'Z' AS createdAt FROM summaries WHERE id = ?`

export function getAllSummaries(): SummaryListItem[] {
  return db.query(LIST_QUERY).all() as SummaryListItem[]
}

export function getSummaryById(id: string): Summary | null {
  return db.query(DETAIL_QUERY).get(id) as Summary | null
}

export function getSummarizedVideoIds(): Map<string, string> {
  const rows = db.query('SELECT video_id, id FROM summaries WHERE status != ?').all('error') as { video_id: string; id: string }[]
  return new Map(rows.map(r => [r.video_id, r.id]))
}

export function createSummary(videoId: string, videoUrl: string, lang: string, title = '', channel = '', thumbnail = ''): string {
  const id = `${Date.now()}_${videoId}`
  db.query('INSERT INTO summaries (id, video_id, video_url, lang, video_title, channel_name, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, videoId, videoUrl, lang, title, channel, thumbnail)
  return id
}

export function updateSummaryMeta(id: string, title: string, channel: string, thumbnail: string) {
  db.query('UPDATE summaries SET video_title = ?, channel_name = ?, thumbnail_url = ? WHERE id = ?').run(title, channel, thumbnail, id)
}

export function updateSummaryDone(id: string, transcript: string, summary: string, prompt: string) {
  db.query('UPDATE summaries SET transcript = ?, summary = ?, custom_prompt = ?, status = ? WHERE id = ?').run(transcript, summary, prompt, 'done', id)
}

export function updateSummaryError(id: string, errorMessage: string) {
  db.query('UPDATE summaries SET error_message = ?, status = ? WHERE id = ?').run(errorMessage, 'error', id)
}

export function deleteSummary(id: string): boolean {
  const result = db.query('DELETE FROM summaries WHERE id = ?').run(id)
  return result.changes > 0
}
