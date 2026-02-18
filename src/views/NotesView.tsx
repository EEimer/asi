import { useEffect, useState } from 'react'
import { fetchNotes, createNoteApi, updateNoteApi, deleteNoteApi } from '../api/endpoints'
import type { Note } from '../../shared/types'
import { Plus, Pencil, Trash2, Loader2, StickyNote } from 'lucide-react'
import { Modal, ModalFooter } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'

export default function NotesView() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try { setNotes(await fetchNotes()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function openNew() {
    setEditNote(null)
    setTitle('')
    setText('')
    setModalOpen(true)
  }

  function openEdit(note: Note) {
    setEditNote(note)
    setTitle(note.title)
    setText(note.text)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      if (editNote) {
        await updateNoteApi(editNote.id, title.trim(), text.trim())
        setNotes(prev => prev.map(n => n.id === editNote.id ? { ...n, title: title.trim(), text: text.trim(), updatedAt: new Date().toISOString() } : n))
      } else {
        const created = await createNoteApi(title.trim(), text.trim())
        setNotes(prev => [created, ...prev])
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

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Notizen</h2>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Neue Notiz
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <StickyNote className="w-10 h-10 mb-3" />
          <p className="text-sm">Noch keine Notizen</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {notes.map(n => (
            <div key={n.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(n)}>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    {n.title}
                    <span className="font-normal text-slate-400"> — {new Date(n.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {n.updatedAt !== n.createdAt && <span className="font-normal text-[10px] text-slate-400 ml-1 italic">(bearbeitet)</span>}
                  </h3>
                  {n.text && <p className="text-xs text-slate-500 mt-1 line-clamp-3 whitespace-pre-wrap">{n.text}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(n)} className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-colors" title="Bearbeiten">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(n.id)} className="p-2 text-slate-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors" title="Löschen">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editNote ? 'Notiz bearbeiten' : 'Neue Notiz'}>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Titel"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault() }}
          />
          <textarea
            placeholder="Notiz..."
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 resize-y"
          />
        </div>
        <ModalFooter>
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editNote ? 'Speichern' : 'Erstellen'}
          </button>
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
