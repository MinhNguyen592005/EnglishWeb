import { Gift, Info, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { DailyQuestsWidget } from '../components/DailyQuestsWidget'
import { useLessons } from './LearningPages'
import { sortLessons } from './RoadmapPage'
import './quests-page.css'

export function QuestsPage() {
  return <Navigate to="/dashboard" state={{ openQuests: true }} replace />
}

export function QuestsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { data } = useLessons()
  const ordered = sortLessons(data ?? [])
  const bossLesson =
    ordered.find((lesson) => lesson.status === 'AVAILABLE') ??
    ordered.find((lesson) => lesson.status !== 'LOCKED')

  useEffect(() => {
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    element?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className="quests-dialog"
      aria-labelledby="quests-dialog-title"
      aria-describedby="quests-dialog-description"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
        }
        if (event.target instanceof Element && event.target.closest('a[href]')) onClose()
      }}
    >
      <header className="quests-dialog-header">
        <span className="quests-dialog-icon"><Gift size={25} /></span>
        <div>
          <h1 id="quests-dialog-title">Nhiệm vụ của bạn</h1>
          <p id="quests-dialog-description">Hoàn thành mục tiêu, nhận XP và giữ nhịp học tập.</p>
        </div>
        <button type="button" className="quests-dialog-close" onClick={onClose} aria-label="Đóng nhiệm vụ" autoFocus>
          <X size={20} />
        </button>
      </header>
      <div className="quests-dialog-content">
        <DailyQuestsWidget bossHref={bossLesson ? `/lessons/${bossLesson.id}` : null} />
        <details className="quests-dialog-guide">
          <summary><Info size={16} /> Cách nhận thưởng và giữ chuỗi</summary>
          <p>Hoàn thành các nhiệm vụ rồi bấm nhận thưởng cho từng mục. Hoàn thành cả 3 nhiệm vụ để mở rương và duy trì chuỗi ngày học.</p>
          <p>Nhiệm vụ đổi khi sang ngày mới theo giờ máy chủ. Nhận thưởng nhiệm vụ và mở rương là hai thao tác riêng.</p>
        </details>
      </div>
    </dialog>
  )
}
