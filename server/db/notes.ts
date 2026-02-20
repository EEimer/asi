import db from './database'

export interface Note {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

const LIST_QUERY = `SELECT id, title, text, replace(created_at,' ','T')||'Z' AS createdAt, replace(updated_at,' ','T')||'Z' AS updatedAt FROM notes ORDER BY updated_at DESC`

export function getAllNotes(): Note[] {
  return db.query(LIST_QUERY).all() as Note[]
}

export function createNote(title: string, text: string): Note {
  const id = `note_${Date.now()}`
  db.query('INSERT INTO notes (id, title, text) VALUES (?, ?, ?)').run(id, title, text)
  return db.query(`SELECT id, title, text, replace(created_at,' ','T')||'Z' AS createdAt, replace(updated_at,' ','T')||'Z' AS updatedAt FROM notes WHERE id = ?`).get(id) as Note
}

export function updateNote(id: string, title: string, text: string): boolean {
  const result = db.query("UPDATE notes SET title = ?, text = ?, updated_at = datetime('now') WHERE id = ?").run(title, text, id)
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
