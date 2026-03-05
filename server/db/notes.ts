import db from './database'

export interface Note {
  id: string
  title: string
  text: string
  isTodo: boolean
  isDone: boolean
  createdAt: string
  updatedAt: string
}

const LIST_QUERY = `SELECT id, title, text, is_todo AS isTodo, is_done AS isDone, replace(created_at,' ','T')||'Z' AS createdAt, replace(updated_at,' ','T')||'Z' AS updatedAt FROM notes WHERE is_done = 0 ORDER BY updated_at DESC`

export function getAllNotes(): Note[] {
  return db.query(LIST_QUERY).all() as Note[]
}

export function createNote(title: string, text: string, isTodo: boolean): Note {
  const id = `note_${Date.now()}`
  db.query('INSERT INTO notes (id, title, text, is_todo, is_done) VALUES (?, ?, ?, ?, 0)').run(id, title, text, isTodo ? 1 : 0)
  return db.query(`SELECT id, title, text, is_todo AS isTodo, is_done AS isDone, replace(created_at,' ','T')||'Z' AS createdAt, replace(updated_at,' ','T')||'Z' AS updatedAt FROM notes WHERE id = ?`).get(id) as Note
}

export function updateNote(id: string, title: string, text: string, isTodo: boolean): boolean {
  const result = db.query("UPDATE notes SET title = ?, text = ?, is_todo = ?, updated_at = datetime('now') WHERE id = ?").run(title, text, isTodo ? 1 : 0, id)
  return result.changes > 0
}

export function markNoteDone(id: string): boolean {
  const result = db.query("UPDATE notes SET is_done = 1, updated_at = datetime('now') WHERE id = ?").run(id)
  return result.changes > 0
}

export function deleteNote(id: string): boolean {
  const result = db.query('DELETE FROM notes WHERE id = ?').run(id)
  return result.changes > 0
}

export function deleteAllNotes(): number {
  const result = db.query('DELETE FROM notes').run()
  return result.changes
}
