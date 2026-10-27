import { ClipboardList, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import type { Classroom, Lesson, TeacherQuestion } from '../types'

type Props = {
  questions: TeacherQuestion[]
  classes: Classroom[]
  lessons: Lesson[]
  onClose: () => void
  onCreated: (classId: number) => void
}

export function TeacherAssignmentDialog({
  questions,
  classes,
  lessons,
  onClose,
  onCreated,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [classId, setClassId] = useState(classes[0]?.id ?? 0)
  const [lessonId, setLessonId] = useState(questions[0]?.lessonId ?? 0)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [deadline, setDeadline] = useState('')
  const [passPercent, setPassPercent] = useState(80)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const dueAt = new Date(deadline)
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      setError('Hạn nộp phải ở tương lai.')
      return
    }
    if (
      !classId ||
      !lessonId ||
      !title.trim() ||
      !questions.length ||
      questions.length > 30 ||
      questions.some((q) => !q.active)
    ) {
      setError('Chọn lớp, bài học, tên bài và từ 1 đến 30 câu hỏi đang sử dụng.')
      return
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await api.createAssignment(classId, {
        title: title.trim(),
        lessonId,
        instructions: instructions.trim(),
        passPercent,
        dueAt: dueAt.toISOString(),
        questionIds: questions.map((q) => q.id),
      })
      onCreated(classId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="teacher-assignment-dialog"
      aria-labelledby="teacher-assignment-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <header className="panel-heading">
        <h2 id="teacher-assignment-title">
          <ClipboardList size={21} /> Giao bài tập cho lớp
        </h2>
        <button
          type="button"
          className="text-button"
          aria-label="Đóng cửa sổ giao bài"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <p className="muted">Giao đúng bộ câu hỏi đã chọn. Học sinh làm bài và nộp trước hạn.</p>
      <form className="form-grid" onSubmit={submit}>
        <label className="full-span">
          Lớp nhận bài
          <select
            required
            value={classId || ''}
            onChange={(e) => setClassId(Number(e.target.value))}
            disabled={busy}
          >
            <option value="">Chọn lớp học</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.memberCount ?? 0} thành viên
              </option>
            ))}
          </select>
        </label>
        {!classes.length && (
          <p className="full-span muted">
            Bạn chưa có lớp để giao bài. <Link to="/classes">Tạo lớp học</Link> rồi quay lại kho.
          </p>
        )}
        <label className="full-span">
          Tên bài tập
          <input
            autoFocus
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="Ví dụ: Bài tập ôn thì hiện tại đơn"
          />
        </label>
        <label className="full-span">
          Bài học chính
          <select
            required
            value={lessonId || ''}
            onChange={(e) => setLessonId(Number(e.target.value))}
            disabled={busy}
          >
            <option value="">Chọn bài học</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </select>
        </label>
        <label className="full-span">
          Hướng dẫn làm bài (không bắt buộc)
          <textarea
            maxLength={1000}
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Hạn nộp bài
          <input
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Tỷ lệ đạt (%)
          <input
            type="number"
            min={1}
            max={100}
            required
            value={passPercent}
            onChange={(e) => setPassPercent(Number(e.target.value))}
            disabled={busy}
          />
        </label>
        <details className="full-span teacher-assignment-preview" open>
          <summary>Bộ câu hỏi đã chọn · {questions.length} câu</summary>
          <ol>
            {questions.map((q) => (
              <li key={q.id}>{q.prompt}</li>
            ))}
          </ol>
        </details>
        <p className="full-span muted teacher-assignment-note">
          Nội dung được giữ nguyên tại thời điểm giao. Mỗi lượt làm có 15 phút theo cấu hình bài tập
          lớp hiện tại.
        </p>
        {error && (
          <div className="full-span error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="button-row full-span">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            className="button primary"
            disabled={busy || !classes.length || !questions.length || questions.length > 30}
          >
            {busy ? (
              <LoaderCircle size={16} className="teacher-question-spin" />
            ) : (
              <ClipboardList size={16} />
            )}
            {busy ? 'Đang giao bài…' : 'Giao bài tập'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
