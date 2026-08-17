import { useEffect, useState } from 'react'
import { fetchNotes, createNoteApi, updateNoteApi, markNoteDoneApi, deleteNoteApi } from '../api/endpoints'
import type { Note } from '../../shared/types'
import { Plus, Pencil, Trash2, StickyNote, CheckCircle2 } from 'lucide-react'
import { Modal, ModalFooter } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { Button, Card, Input, Textarea, SkeletonList } from '../components/ui'

export default function NotesView() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [isTodo, setIsTodo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const loaded = await fetchNotes()
      setNotes(loaded.map(n => ({ ...n, isTodo: !!n.isTodo, isDone: !!n.isDone })))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openNew() {
    setEditNote(null)
    setTitle('')
    setText('')
    setIsTodo(true)
    setModalOpen(true)
  }

  function openEdit(note: Note) {
    setEditNote(note)
    setTitle(note.title)
    setText(note.text)
    setIsTodo(note.isTodo)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!title.trim() && !text.trim()) return
    setSaving(true)
    try {
      if (editNote) {
        await updateNoteApi(editNote.id, title.trim(), text.trim(), isTodo)
        setNotes(prev => prev.map(n => n.id === editNote.id ? { ...n, title: title.trim(), text: text.trim(), isTodo, updatedAt: new Date().toISOString() } : n))
      } else {
        const created = await createNoteApi(title.trim(), text.trim(), isTodo)
        setNotes(prev => [{ ...created, isTodo: !!created.isTodo, isDone: !!created.isDone }, ...prev])
      }
      setModalOpen(false)
    } catch (e: any) { alert(`Fehler: ${e.message}`) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await deleteNoteApi(id)
    setNotes(prev => prev.filter(n => n.id !== id))
    setDeleteTarget(null)
  }

  async function handleDone(id: string) {
    await markNoteDoneApi(id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  if (loading) return <SkeletonList count={3} />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-content">Notizen</h2>
        <Button size="sm" onClick={openNew}><Plus className="w-3.5 h-3.5" /> Neue Notiz</Button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-dim">
          <StickyNote className="w-10 h-10 mb-3" />
          <p className="text-sm">Noch keine Notizen</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {notes.map(n => (
            <Card key={n.id} className="card-interactive">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(n)}>
                  <h3 className="font-semibold text-content text-sm">
                    {n.title || 'Ohne Titel'}
                    <span className="font-normal text-dim"> — {new Date(n.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {n.updatedAt !== n.createdAt && <span className="font-normal text-[10px] text-dim ml-1 italic">(bearbeitet)</span>}
                    {n.isTodo ? (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-warning bg-warning/10 border border-warning/30 rounded-full">TODO</span>
                    ) : (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-sky bg-sky/10 border border-sky/30 rounded-full">INFO</span>
                    )}
                  </h3>
                  {n.text && <p className="text-xs text-content/70 mt-1 whitespace-pre-wrap break-words">{n.text}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {!!n.isTodo && (
                    <Button size="xs" variant="ghost" iconOnly onClick={() => handleDone(n.id)} title="Done" className="text-dim hoverable:text-success">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" iconOnly onClick={() => openEdit(n)} title="Bearbeiten" className="text-dim hoverable:text-primary">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="xs" variant="ghost" iconOnly onClick={() => setDeleteTarget(n.id)} title="Löschen" className="text-dim hoverable:text-danger">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editNote ? 'Notiz bearbeiten' : 'Neue Notiz'}>
        <div className="space-y-3">
          <Input
            type="text"
            placeholder="Titel"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault() }}
          />
          <Textarea
            placeholder="Notiz..."
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            className="resize-y"
          />
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={isTodo}
              onChange={e => setIsTodo(e.target.checked)}
              className="w-4 h-4 rounded-sm border-surfaceBorder text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            TODO
          </label>
        </div>
        <ModalFooter>
          <Button variant="cancel" outline onClick={() => setModalOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || (!title.trim() && !text.trim())} loading={saving}>
            {editNote ? 'Speichern' : 'Erstellen'}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Notiz löschen"
        description="Möchtest du diese Notiz wirklich löschen?"
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  )
}
