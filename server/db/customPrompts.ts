import db from './database'

export interface CustomPrompt {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

const SELECT_FIELDS = `id, title, text, replace(created_at,' ','T')||'Z' AS createdAt, replace(updated_at,' ','T')||'Z' AS updatedAt`

export function getAllCustomPrompts(): CustomPrompt[] {
  return db.query(`SELECT ${SELECT_FIELDS} FROM custom_prompts ORDER BY updated_at DESC`).all() as CustomPrompt[]
}

export function createCustomPrompt(title: string, text: string): CustomPrompt {
  const id = `cprompt_${Date.now()}`
  db.query('INSERT INTO custom_prompts (id, title, text) VALUES (?, ?, ?)').run(id, title, text)
  return db.query(`SELECT ${SELECT_FIELDS} FROM custom_prompts WHERE id = ?`).get(id) as CustomPrompt
}

export function updateCustomPrompt(id: string, title: string, text: string): boolean {
  const result = db.query("UPDATE custom_prompts SET title = ?, text = ?, updated_at = datetime('now') WHERE id = ?").run(title, text, id)
  return result.changes > 0
}

export function deleteCustomPrompt(id: string): boolean {
  const result = db.query('DELETE FROM custom_prompts WHERE id = ?').run(id)
  return result.changes > 0
}
