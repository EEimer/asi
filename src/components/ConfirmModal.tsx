import { Modal, ModalFooter } from './Modal'
import { Button } from './ui'

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

export function ConfirmModal({ open, title, description, confirmLabel, cancelLabel = 'Abbrechen', onConfirm, onClose, variant = 'danger' }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} escapeConfirms onConfirm={onClose}>
      {description && <p className="text-sm text-muted">{description}</p>}
      <ModalFooter>
        <Button variant="cancel" outline onClick={onClose}>{cancelLabel}</Button>
        <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
      </ModalFooter>
    </Modal>
  )
}
