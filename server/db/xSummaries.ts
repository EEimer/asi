import db from './database'
import type { XSummary } from '../../shared/types'

function row(r: any): XSummary {
  return {
    id: r.id,
    tweetId: r.tweet_id,
    tweetUrl: r.tweet_url,
    author: r.author,
    tweetText: r.tweet_text,
    summary: r.summary,
    status: r.status,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }
}

export function getAllXSummaries(): XSummary[] {
  return (db.query('SELECT * FROM x_summaries ORDER BY created_at DESC').all() as any[]).map(row)
}

export function getXSummaryById(id: string): XSummary | null {
  const r = db.query('SELECT * FROM x_summaries WHERE id = ?').get(id) as any
  return r ? row(r) : null
}

export function createXSummary(tweetId: string, tweetUrl: string): string {
  const id = `x_${Date.now()}_${tweetId}`
  db.query('INSERT INTO x_summaries (id, tweet_id, tweet_url) VALUES (?, ?, ?)').run(id, tweetId, tweetUrl)
  return id
}

export function updateXSummaryDone(id: string, tweetText: string, author: string, summary: string) {
  db.query('UPDATE x_summaries SET tweet_text = ?, author = ?, summary = ?, status = ? WHERE id = ?')
    .run(tweetText, author, summary, 'done', id)
}

export function updateXSummaryError(id: string, errorMessage: string) {
  db.query('UPDATE x_summaries SET status = ?, error_message = ? WHERE id = ?')
    .run('error', errorMessage, id)
}

export function resetXSummaryForRetry(id: string) {
  db.query("UPDATE x_summaries SET status = 'processing', error_message = '', summary = '' WHERE id = ?").run(id)
}

export function deleteXSummary(id: string): boolean {
  const res = db.query('DELETE FROM x_summaries WHERE id = ?').run(id)
  return res.changes > 0
}
