import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { Pagination, PAGE_SIZE } from './Pagination'
import type { Assignment, MyAssignmentResult } from '../types'
import './LearnerClasswork.css'
import { AssignmentAttemptHistory } from './AssignmentAttemptHistory'

export function LearnerClasswork({
  classId,
  assignments,
  showResults,
}: {
  classId: number
  assignments: Assignment[]
  showResults: boolean
}) {
  const navigate = useNavigate()
  const [results, setResults] = useState<MyAssignmentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [startingId, setStartingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  const starting = useRef(false)
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    api
      .myClassResults(classId)
      .then((data) => {
        if (active) setResults(data)
      })
      .catch((e) => {
        if (active) setLoadError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [classId, assignments, revision])
  useEffect(() => {
    setPage(1)
  }, [query, showResults, classId])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const byAssignment = new Map(results.map((result) => [result.assignmentId, result]))
  const submitted = results.filter(
    (result) => (result.completedCount ?? (result.status !== 'IN_PROGRESS' ? 1 : 0)) > 0,
  )
  const available = assignments.filter(
    (item) => item.status === 'PUBLISHED' && new Date(item.dueAt).getTime() > now,
  )
  const filtered = assignments.filter((item) =>
    `${item.title} ${item.instructions}`
      .toLocaleLowerCase('vi-VN')
      .includes(query.toLocaleLowerCase('vi-VN')),
  )
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)))
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function start(assignmentId: number) {
    if (starting.current) return
    starting.current = true
    setStartingId(assignmentId)
    setActionError('')
    try {
      const attempt = await api.startClassAssignment(classId, assignmentId)
      navigate(`/attempts/${attempt.id}`)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      starting.current = false
      setStartingId(null)
    }
  }

  return (
    <section className="card learner-classwork">
      <header className="learner-work-heading">
        <div>
          <span className="learner-work-eyebrow">KHÔNG GIAN HỌC VIÊN</span>
          <h2>{showResults ? 'Kết quả học tập của bạn' : 'Bài tập được giao'}</h2>
          <p>
            {showResults
              ? 'Điểm tốt nhất đúng hạn là điểm chính thức. Bạn có thể xem lại mọi lượt làm.'
              : 'Xem yêu cầu của giáo viên và hoàn thành bài trước hạn.'}
          </p>
        </div>
        <span className="learner-work-count">{assignments.length} bài tập</span>
      </header>
      <div className="learner-work-summary">
        <span>
          <strong>{available.length}</strong>Bài đang mở
        </span>
        <span>
          <strong>{loading ? '—' : submitted.length}</strong>Đã nộp bài
        </span>
        <span>
          <strong>{loading ? '—' : results.filter((result) => result.passed).length}</strong>Bài đạt
          yêu cầu
        </span>
      </div>
      <label className="learner-work-search">
        <Search size={16} />
        <input
          type="search"
          aria-label="Tìm bài tập của tôi"
          placeholder="Tìm tên bài tập…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {loadError && (
        <div className="error-banner" role="alert">
          {loadError}
          <button
            type="button"
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={15} />
            Thử lại
          </button>
        </div>
      )}
      {actionError && (
        <div className="error-banner" role="alert">
          {actionError}
        </div>
      )}
      {loading && (
        <p className="learner-work-loading" role="status">
          <LoaderCircle size={16} />
          Đang tải trạng thái bài làm của bạn…
        </p>
      )}
      <div className="learner-work-list">
        {rows.map((item) => {
          const result = byAssignment.get(item.id)
          const open = item.status === 'PUBLISHED' && new Date(item.dueAt).getTime() > now
          const completed = !!result && result.status !== 'IN_PROGRESS'
          const resume =
            !!result &&
            result.status === 'IN_PROGRESS' &&
            (!result.submitDeadlineAt || new Date(result.submitDeadlineAt).getTime() > now) &&
            open
          return (
            <article className="learner-work-item" key={item.id}>
              <div className="learner-work-item-top">
                <span
                  className={`learner-work-state ${result?.passed ? 'passed' : completed ? 'submitted' : resume ? 'progress' : ''}`}
                >
                  {result?.passed
                    ? 'Đã đạt'
                    : completed
                      ? result.passed
                        ? 'Đã nộp · Đạt'
                        : 'Đã nộp · Chưa đạt'
                      : resume
                        ? 'Đang làm'
                        : !open
                          ? item.status === 'CLOSED'
                            ? 'Đã đóng'
                            : 'Quá hạn'
                          : 'Chưa nộp'}
                </span>
                <small>#{item.id}</small>
              </div>
              <h3>{item.title}</h3>
              {item.instructions && (
                <p className="learner-work-instructions">{item.instructions}</p>
              )}
              <div className="learner-work-meta">
                <span>
                  <CalendarDays size={14} />
                  Hạn {new Date(item.dueAt).toLocaleString('vi-VN')}
                </span>
                <span>
                  <Target size={14} />
                  Yêu cầu {item.passPercent}%
                </span>
              </div>
              {result?.history && (
                <>
                  <div className="assignment-score-summary">
                    <span>
                      Chính thức{' '}
                      <strong>
                        {result.bestAttempt
                          ? `${result.bestAttempt.correctCount}/${result.bestAttempt.totalQuestions}`
                          : 'Chưa có'}
                      </strong>
                    </span>
                    <span>
                      Lần đầu{' '}
                      <strong>
                        {result.firstAttempt
                          ? `${result.firstAttempt.correctCount}/${result.firstAttempt.totalQuestions}`
                          : 'Chưa nộp'}
                      </strong>
                    </span>
                    <span>
                      Gần nhất{' '}
                      <strong>
                        {result.latestAttempt?.completedAt
                          ? `${result.latestAttempt.correctCount}/${result.latestAttempt.totalQuestions}`
                          : 'Chưa nộp'}
                      </strong>
                    </span>
                  </div>
                  <AssignmentAttemptHistory result={result} learner />
                </>
              )}
              {completed && (
                <div className="learner-work-result">
                  <span>
                    <CheckCircle2 size={15} />
                    Đúng{' '}
                    <strong>
                      {result.correctCount}/{result.totalQuestions}
                    </strong>{' '}
                    câu ·{' '}
                    {result.totalQuestions
                      ? Math.round((result.correctCount / result.totalQuestions) * 100)
                      : 0}
                    %
                  </span>
                  {result.completedAt && (
                    <small>Nộp {new Date(result.completedAt).toLocaleString('vi-VN')}</small>
                  )}
                </div>
              )}
              {result?.status === 'IN_PROGRESS' && !resume && (
                <p className="learner-work-expired">
                  Lượt làm trước chưa nộp và đã hết thời gian.
                  {open ? ' Bạn có thể bắt đầu lượt mới.' : ''}
                </p>
              )}
              <footer>
                <span>
                  <Clock3 size={14} />
                  {resume && result?.submitDeadlineAt
                    ? `Nộp trước ${new Date(result.submitDeadlineAt).toLocaleTimeString('vi-VN')}`
                    : 'Tối đa 15 phút / lượt · Nộp trước hạn'}
                </span>
                <div>
                  {completed && (
                    <Link className="button secondary" to={`/attempts/${result.attemptId}/result`}>
                      Xem bài làm
                      <ArrowRight size={15} />
                    </Link>
                  )}
                  {open ? (
                    <button
                      type="button"
                      className="button primary"
                      disabled={startingId !== null || loading || !!loadError}
                      onClick={() => void start(item.id)}
                    >
                      {startingId === item.id ? (
                        <LoaderCircle size={15} />
                      ) : (
                        <ClipboardList size={15} />
                      )}{' '}
                      {startingId === item.id
                        ? 'Đang mở bài…'
                        : resume
                          ? 'Tiếp tục làm bài'
                          : completed
                            ? 'Làm lại'
                            : 'Làm bài tập'}
                    </button>
                  ) : (
                    !completed && (
                      <span className="learner-work-closed">
                        <LockKeyhole size={14} />
                        Không còn nhận bài
                      </span>
                    )
                  )}
                </div>
              </footer>
            </article>
          )
        })}
      </div>
      {!rows.length && (
        <div className="learner-work-empty">
          <ClipboardList size={28} />
          <h3>{query ? 'Không tìm thấy bài tập' : 'Chưa có bài tập được giao'}</h3>
          <p>
            {query
              ? 'Thử tìm bằng tên bài khác.'
              : 'Bài tập sẽ xuất hiện ở đây khi giáo viên giao cho lớp.'}
          </p>
        </div>
      )}
      {filtered.length > 0 && (
        <Pagination total={filtered.length} page={currentPage} onPageChange={setPage} />
      )}
    </section>
  )
}
