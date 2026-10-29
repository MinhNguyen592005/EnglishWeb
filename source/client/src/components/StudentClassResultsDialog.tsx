import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { api } from '../services/api'
import type { AssignmentResult, Classroom } from '../types'
import './StudentClassResultsDialog.css'
import { useRealtimeRefresh } from '../services/realtimeRefresh'

type Props = {
  classroom: Classroom
  student: NonNullable<Classroom['members']>[number]
  onClose: () => void
}

const percent = (correct: number, total: number) => total > 0 ? Math.round(correct / total * 100) : 0
const dateLabel = (value: string) => new Date(value).toLocaleString('vi-VN')

export function StudentClassResultsDialog({ classroom, student, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [results, setResults] = useState<Record<number, AssignmentResult | undefined>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useRealtimeRefresh(() => setRevision((value) => value + 1))
  const assignments = classroom.assignments || []

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

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all(assignments.map(async (assignment) => {
      const rows = await api.assignmentResults(classroom.id, assignment.id)
      return [assignment.id, rows.find((row) => row.userId === student.id)] as const
    })).then((entries) => {
      if (active) setResults(Object.fromEntries(entries))
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Không thể tải kết quả học viên.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [classroom.id, classroom.assignments, student.id, revision])

  const completed = assignments.flatMap((assignment) => {
    const result = results[assignment.id]
    const attempt = result?.bestAttempt ?? result?.history?.filter((item) => item.completedAt).sort((a, b) => percent(b.correctCount, b.totalQuestions) - percent(a.correctCount, a.totalQuestions))[0] ?? (result?.completedAt ? result : undefined)
    return attempt ? [{ assignment, result, attempt }] : []
  })
  const average = completed.length ? Math.round(completed.reduce((sum, item) => sum + percent(item.attempt.correctCount, item.attempt.totalQuestions), 0) / completed.length) : null

  return (
    <dialog ref={dialog} className="student-results-dialog" aria-labelledby="student-results-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <header className="student-results-header">
        <div><span className="student-results-eyebrow">HỒ SƠ HỌC TẬP · {classroom.name}</span><h2 id="student-results-title">{student.displayName}</h2><p>@{student.username} · Kết quả bài tập trong lớp</p></div>
        <button type="button" className="button secondary" autoFocus aria-label="Đóng kết quả học viên" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="student-results-body">
        {loading ? <p role="status">Đang tải kết quả học viên…</p> : error ? <div className="error-banner" role="alert">{error}<button className="button secondary" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /> Thử lại</button></div> : <>
          <div className="student-results-summary">
            <div><strong>{completed.length}/{assignments.length}</strong><span>Bài đã nộp</span></div>
            <div><strong>{average === null ? '—' : `${average}%`}</strong><span>Trung bình điểm tốt nhất</span></div>
            <div><strong>{completed.filter((item) => item.attempt.passed).length}</strong><span>Bài đạt yêu cầu</span></div>
          </div>
          {!assignments.length ? <p className="student-results-empty">Lớp chưa có bài tập được giao.</p> : <div className="student-results-list">{assignments.map((assignment) => {
            const result = results[assignment.id]
            const best = completed.find((item) => item.assignment.id === assignment.id)?.attempt
            const history = result?.history ?? (result ? [result] : [])
            return <article className="student-result-item" key={assignment.id}>
              <div className="student-result-heading"><h3>{assignment.title}</h3><span className={`student-result-status ${best ? best.passed ? 'passed' : 'failed' : ''}`}>{best ? best.passed ? 'Đạt' : 'Chưa đạt' : result?.status === 'IN_PROGRESS' ? 'Đang làm' : 'Chưa nộp'}</span></div>
              <p>Hạn nộp: {dateLabel(assignment.dueAt)} · Ngưỡng đạt: {assignment.passPercent}%</p>
              {best && <p><strong>Điểm tốt nhất: {percent(best.correctCount, best.totalQuestions)}%</strong> · Đúng {best.correctCount}/{best.totalQuestions} câu</p>}
              {history.length > 0 && <details><summary>Lịch sử làm bài ({result?.attemptCount ?? history.length} lượt)</summary><ol>{history.map((attempt) => <li key={attempt.attemptId}><span>{attempt.completedAt ? dateLabel(attempt.completedAt) : 'Đang làm bài'}</span><strong>{attempt.completedAt ? `${percent(attempt.correctCount, attempt.totalQuestions)}% · ${attempt.correctCount}/${attempt.totalQuestions} câu đúng` : 'Chưa nộp'}</strong></li>)}</ol></details>}
            </article>
          })}</div>}
        </>}
      </div>
      <footer><button type="button" className="button secondary" onClick={onClose}>Đóng</button></footer>
    </dialog>
  )
}
