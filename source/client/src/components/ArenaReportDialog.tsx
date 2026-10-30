import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, Send, ShieldAlert, X } from 'lucide-react'
import './ArenaReportDialog.css'

const reasons = [
  'Ngôn ngữ xúc phạm, quấy rối',
  'Spam hoặc quảng cáo',
  'Sử dụng bot / auto click',
  'Gian lận, can thiệp trận đấu',
  'Tên hoặc ảnh đại diện không phù hợp',
  'Lý do khác',
]

type Props = {
  opponentName: string
  roomCode: string
  connected: boolean
  onSubmit: (reason: string) => Promise<void>
  onClose: () => void
}

export function ArenaReportDialog({ opponentName, roomCode, connected, onSubmit, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [selected, setSelected] = useState<string[]>([])
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const summary = selected.length
    ? `Lý do: ${reasons.filter((reason) => selected.includes(reason)).join('; ')}`
    : ''
  const reason = [summary, details.trim() ? `Nội dung bổ sung: ${details.trim()}` : '']
    .filter(Boolean)
    .join('\n')
  const tooLong = reason.length > 500

  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function close() {
    if (!submitting.current) onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    if (!selected.length) {
      setError('Vui lòng chọn ít nhất một lý do báo cáo.')
      return
    }
    if (tooLong || !connected) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await onSubmit(reason)
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể gửi báo cáo. Vui lòng thử lại.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="arena-report-dialog"
      aria-labelledby="arena-report-title"
      aria-describedby="arena-report-description"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <header className="arena-report-header">
        <div className="arena-report-heading">
          <ShieldAlert size={24} />
          <div>
            <h2 id="arena-report-title">Báo cáo người chơi</h2>
            <p>
              {opponentName} · Phòng {roomCode}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary"
          aria-label="Đóng báo cáo"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <form onSubmit={submit} className="arena-report-form" aria-busy={busy}>
        <p id="arena-report-description">
          Chọn lý do và cung cấp thêm thông tin để quản trị viên xem xét.
        </p>
        <fieldset disabled={busy}>
          <legend>
            Lý do báo cáo <span>(có thể chọn nhiều)</span>
          </legend>
          <div className="arena-report-options">
            {reasons.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, option]
                        : current.filter((item) => item !== option),
                    )
                    setError('')
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="arena-report-details" htmlFor="arena-report-details">
          Nội dung bổ sung <span>(không bắt buộc)</span>
          <textarea
            id="arena-report-details"
            rows={4}
            maxLength={500}
            disabled={busy}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Mô tả hành vi hoặc tình huống bạn gặp trong trận đấu…"
            aria-describedby="arena-report-limit"
            aria-invalid={tooLong}
          />
        </label>
        <small
          id="arena-report-limit"
          className={tooLong ? 'arena-report-limit exceeded' : 'arena-report-limit'}
          aria-live="polite"
        >
          {reason.length}/500 ký tự cho toàn bộ báo cáo
          {tooLong ? ' · Vui lòng rút ngắn nội dung.' : ''}
        </small>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {!connected && (
          <div className="error-banner" role="alert">
            Mất kết nối máy chủ. Vui lòng chờ kết nối lại để gửi báo cáo.
          </div>
        )}
        <footer className="arena-report-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={close}>
            Hủy
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !connected || !selected.length || tooLong}
          >
            {busy ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
            {busy ? 'Đang gửi…' : 'Gửi báo cáo'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
