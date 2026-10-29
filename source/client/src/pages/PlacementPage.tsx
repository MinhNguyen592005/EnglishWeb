import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { usePlacement, type PlacementState } from '../app/PlacementContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { LogOut, Rocket, UserRound } from 'lucide-react'
import { api } from '../services/api'
import { PlacementWelcomePopup } from './PlacementWelcomePopup'
import { useRegistrationWelcome } from '../app/RegistrationWelcomeContext'
import { ErrorState, Loading } from '../components/States'
import './roadmap/study.css'
import './placement.css'

type Exam = PlacementState & {
  attemptId?: number
  questions?: { id: string; level: number; prompt: string; options: string[] }[]
  answers?: Record<string, string>
}
export function PlacementPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const welcome = useRegistrationWelcome()
  const { request, connected } = useSystemSocket()
  const placement = usePlacement()
  const [exam, setExam] = useState<Exam | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [saving, setSaving] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [version, setVersion] = useState(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pendingAnswers = useRef(new Map<string, { option: string; revision: number }>())
  const revision = useRef(0)
  useEffect(() => {
    if (!user?.placementEligible || welcome.visible) return
    let active = true
    request<Exam>('PLACEMENT_OPEN', 'PLACEMENT_DATA')
      .then((data) => {
        if (active) {
          setExam(data)
          setAnswers(data.answers ?? {})
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [request, user?.id, user?.placementEligible, version, welcome.visible])
  useEffect(() => {
    if (placement.data?.status === 'COMPLETED') {
      setExam(placement.data)
      setAnswers({})
      pendingAnswers.current.clear()
    }
  }, [placement.data])
  useEffect(() => {
    if (connected && exam?.attemptId)
      for (const [id, value] of pendingAnswers.current)
        saveAnswer(exam.attemptId, id, value.option, value.revision)
  }, [connected, exam?.attemptId])
  function saveAnswer(
    attemptId: number,
    questionId: string,
    option: string,
    answerRevision: number,
  ) {
    setSaving((v) => v + 1)
    queue.current = queue.current
      .catch(() => {})
      .then(() =>
        request<Exam>('PLACEMENT_SAVE', 'PLACEMENT_DATA', { attemptId, questionId, option }),
      )
      .then((data) => {
        if (pendingAnswers.current.get(questionId)?.revision === answerRevision)
          pendingAnswers.current.delete(questionId)
        if (!pendingAnswers.current.size) setSaveError('')
        if (data.status === 'COMPLETED') {
          setExam(data)
          setAnswers({})
          pendingAnswers.current.clear()
          placement.accept(data)
        }
      })
      .catch((e) => {
        setSaveError(e.message)
      })
      .finally(() => setSaving((v) => v - 1))
  }
  function choose(questionId: string, option: string) {
    if (!exam?.attemptId || busy) return
    setAnswers((old) => ({ ...old, [questionId]: option }))
    setError('')
    const nextRevision = ++revision.current
    pendingAnswers.current.set(questionId, { option, revision: nextRevision })
    // Each write saves one answer; serialize writes so quick edits keep their order.
    saveAnswer(exam.attemptId, questionId, option, nextRevision)
  }
  async function submit() {
    const missing = exam?.questions?.flatMap((q, i) => (answers[q.id] ? [] : [i + 1])) ?? []
    if (missing.length) {
      setError(`Bạn chưa trả lời câu: ${missing.join(', ')}. Hãy trả lời đủ 10 câu trước khi nộp.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await queue.current
      const result = await request<Exam>('PLACEMENT_SUBMIT', 'PLACEMENT_DATA', {
        attemptId: exam?.attemptId,
        answers,
      })
      setExam(result)
      setAnswers({})
      placement.accept(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      await api.logout()
      setUser(null)
      navigate('/login', { replace: true })
    } catch (e) {
      setLogoutError((e as Error).message)
      setLoggingOut(false)
    }
  }
  if (!user?.placementEligible) return <Navigate to="/roadmap" replace />
  return (
    <main className="placement-shell">
      <header className="placement-header">
        <div className="placement-brand">
          <Rocket size={26} />
          <span>Grammar Quest</span>
        </div>
        <div className="placement-account">
          <UserRound size={19} aria-hidden="true" />
          <div>
            <small>Đã đăng nhập</small>
            <strong title={`@${user.username}`}>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={loggingOut || busy}
            onClick={logout}
          >
            <LogOut size={16} />
            {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </header>
      {logoutError && (
        <div className="placement-page error-banner" role="alert">
          {logoutError}
        </div>
      )}
      <div className="placement-page">
        {welcome.visible ? (
          <>
            <section className="card placement-welcome-background" aria-hidden="true">
              <h2>Kiểm tra đầu vào</h2>
              <p>10 câu hỏi để tìm level bắt đầu của bạn.</p>
            </section>
            <PlacementWelcomePopup onContinue={welcome.dismiss} />
          </>
        ) : exam?.status === 'COMPLETED' ? (
          <section className="card placement-result" aria-label="Kết quả kiểm tra đầu vào">
            <h1>{exam.correctCount}/10 câu đúng</h1>
            <p>{exam.message}</p>
            <Link className="button primary" to={exam.startPath!}>
              Bắt đầu học
            </Link>
          </section>
        ) : !exam ? (
          error ? (
            <ErrorState
              message={error}
              retry={() => {
                setError('')
                setVersion((v) => v + 1)
              }}
            />
          ) : (
            <Loading />
          )
        ) : (
          <section className="study-quiz" aria-label="Kiểm tra đầu vào">
            <div className="card study-quiz-heading">
              <h1>Kiểm tra đầu vào</h1>
              <p>
                Trả lời 10 câu để xác định level bắt đầu. Bạn có thể sửa lựa chọn trước khi nộp bài.
              </p>
              <div className="hero-progress">
                <span>Đã trả lời</span>
                <strong>{Object.keys(answers).length}/10</strong>
              </div>
              <div className="progress-track">
                <div style={{ width: `${Object.keys(answers).length * 10}%` }} />
              </div>
              <p role="status" className="muted">
                {saving
                  ? 'Đang lưu câu trả lời…'
                  : saveError
                    ? 'Chưa lưu được thay đổi. Giữ trang mở và kết nối lại hoặc nộp bài khi đã trả lời đủ.'
                    : 'Câu trả lời được lưu tự động.'}
              </p>
              {saveError && (
                <div className="error-banner" role="alert">
                  {saveError}
                </div>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              {exam.questions?.map((q, i) => (
                <article className="card study-question" key={q.id}>
                  <span className="tag">CÂU {i + 1}</span>
                  <h3>{q.prompt}</h3>
                  <fieldset className="option-list" disabled={busy || !connected}>
                    <legend className="sr-only">Lựa chọn câu {i + 1}</legend>
                    {q.options.map((option, j) => {
                      const letter = 'ABCD'[j]
                      return (
                        <label
                          className={`answer-option ${answers[q.id] === letter ? 'chosen' : ''}`}
                          key={letter}
                        >
                          <input
                            type="radio"
                            name={`placement-${q.id}`}
                            value={letter}
                            checked={answers[q.id] === letter}
                            onChange={() => choose(q.id, letter)}
                          />
                          <span className="option-letter">{letter}</span>
                          <span>{option}</span>
                        </label>
                      )
                    })}
                  </fieldset>
                </article>
              ))}
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <div className="card study-actions">
                <span>{Object.keys(answers).length}/10 câu đã trả lời</span>
                <button type="submit" className="button primary" disabled={busy || !connected}>
                  {busy ? 'Đang nộp…' : 'Nộp bài'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
