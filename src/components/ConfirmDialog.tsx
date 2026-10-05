import { useEffect, useRef } from 'react'

/**
 * 되돌릴 수 없는 작업 앞에 한 번 묻는다.
 *
 * 삭제와 답변 지우기는 취소가 없다. window.confirm으로도 되지만, 그러면
 * 무엇이 지워지는지 화면에서 설명할 자리가 없다.
 */
interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  /** 확인 버튼 모양. 되돌릴 수 없는 승인처럼 삭제가 아닌 경우 button-primary 를 쓴다. */
  confirmClassName?: string
  /** 처리 중. 버튼을 잠가 두 번 눌리지 않게 한다. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '삭제',
  confirmClassName = 'button button-danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog-title">{title}</h2>
        {description ? <p className="dialog-description">{description}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={confirmClassName}
            ref={confirmRef}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
