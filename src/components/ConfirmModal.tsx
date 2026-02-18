import { Modal, ModalFooter } from './Modal'

type ConfirmModalProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
  variant?: 'danger' | 'warning' | 'primary'
}

const variantClasses = {
  primary: 'bg-primary text-white hover:bg-primary/90 border-primary',
  danger: 'bg-danger text-white hover:bg-danger/90 border-danger',
  warning: 'bg-warning text-white hover:bg-warning/90 border-warning',
}

export function ConfirmModal({ open, title, description, confirmLabel, cancelLabel = 'Abbrechen', onConfirm, onClose, variant = 'danger' }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} escapeConfirms onConfirm={onClose}>
      {description && <p className="text-sm text-slate-600">{description}</p>}
      <ModalFooter>
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${variantClasses[variant]}`}>
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  )
}
