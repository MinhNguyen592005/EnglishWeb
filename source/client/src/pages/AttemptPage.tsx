import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Heart,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import type { AnswerResult, Attempt } from '../types'
import './classroom-attempt.css'

export function AttemptPage() {
  const { request, connected } = useSystemSocket()
  const { id } = useParams()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AnswerResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const navigate = useNavigate()
  const { reload } = useAuth()
  useEffect(() => {
    if (!attempt) return
    // Cập nhật trạng thái kết quả ngay khi nộp xong, dù URL chưa đổi.
    request('CLIENT_ACTIVITY', 'ACTIVITY_UPDATED', {
      path: `/attempts/${attempt.id}${attempt.status === 'IN_PROGRESS' ? '' : '/result'}`,
    }).catch(() => {})
  }, [attempt?.id, attempt?.status, request])
  useEffect(() => {
    if (!connected) return
    let active = true
    setAttempt(null)
    setError('')
    setFeedback(null)
    setSelected(null)
    request<Attempt>('GET_ATTEMPT', 'ATTEMPT_DATA', { attemptId: Number(id) })
      .then((data) => {
        if (active) setAttempt(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [id, request, connected])
  if (!attempt)
    return <Layout title="Thử thách">{error ? <ErrorState message={error} /> : <Loading />}</Layout>
  const current = feedback
    ? attempt.questions.find((q) => q.ordinalNo === feedback.ordinalNo)
    : attempt.questions.find((q) => !q.answer)
  if (!current || (attempt.status !== 'IN_PROGRESS' && !feedback))
    return <AttemptResult attempt={attempt} />
  const isClassWork = attempt.classId != null
  const isBoss = !isClassWork && attempt.kind !== 'PRACTICE'
  const answered = attempt.questions.filter((q) => q.answer).length
  async function submit() {
    if (!selected?.trim() || !id) return
    setBusy(true)
    setActionError('')
    try {
      const response = await request<AnswerResult>('SUBMIT_ANSWER', 'ANSWER_RESULT', {
        attemptId: Number(id),
        ordinalNo: current!.ordinalNo,
        option: selected,
      })
      setFeedback(response)
      setAttempt(
        (prev) =>
          prev && {
            ...prev,
            correctCount: response.correctCount,
            bossHp: response.bossHp,
            status: response.finished ? (response.won ? 'WON' : 'LOST') : prev.status,
            awardedXp: response.awardedXp,
            questions: prev.questions.map((q) =>
              q.ordinalNo === current!.ordinalNo
                ? {
                    ...q,
                    answer: selected,
                    correct: response.correct,
                    correctOption: response.correctOption,
                    explanation: response.explanation,
                  }
                : q,
            ),
          },
      )
      if (response.finished) await reload().catch(() => {})
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function next() {
    setFeedback(null)
    setSelected(null)
    if (feedback?.finished) navigate(`/attempts/${attempt!.id}/result`)
  }
  const options = ['A', 'B', 'C', 'D']
  return (
    <Layout title={isClassWork ? 'Bài tập lớp' : isBoss ? 'Đánh boss' : 'Luyện tập'}>
      <div className="breadcrumb">
        <Link
          to={
            isClassWork
              ? `/classes/${attempt.classId}?view=assignments`
              : isBoss
                ? '/roadmap'
                : '/practice'
          }
        >
          <ArrowLeft size={16} /> {isClassWork ? 'Về lớp học' : 'Quay lại'}
        </Link>
        <span>Thử thách #{attempt.id}</span>
      </div>
      <div className="quiz-heading">
        <div>
          <span className="section-label">
            {isClassWork ? 'BÀI TẬP ĐƯỢC GIAO' : isBoss ? 'THỬ THÁCH BOSS' : 'LUYỆN TẬP NGỮ PHÁP'}
          </span>
          <h1>
            {isClassWork
              ? 'Bài tập của lớp'
              : isBoss
                ? attempt.kind === 'CHAPTER_BOSS'
                  ? 'Boss cuối chương'
                  : 'Boss bài học'
                : 'Trạm luyện tập'}
          </h1>
          <p>
            Câu {current.ordinalNo} / {attempt.totalQuestions} ·{' '}
            {isClassWork
              ? `Cần đúng ${attempt.requiredCorrect} câu để mở lời giải`
              : isBoss
                ? `Cần đúng ${attempt.requiredCorrect} câu`
                : 'Xem lời giải sau mỗi câu'}
          </p>
        </div>
        <div className="score-chip">
          <CheckCircle2 size={20} /> {attempt.correctCount} câu đúng
        </div>
      </div>
      <div className={`quiz-grid ${isClassWork ? 'classroom-quiz-grid' : ''}`}>
        <div className="primary-column">
          <div className="quiz-progress">
            <span>Tiến độ hoàn thành</span>
            <strong>
              {answered}/{attempt.totalQuestions}
            </strong>
            <div className="progress-track">
              <div style={{ width: `${(answered / attempt.totalQuestions) * 100}%` }} />
            </div>
          </div>
          <section className="card question-card">
            <div className="question-meta">
              <span className="tag">CÂU {current.ordinalNo}</span>
              <span>
                {current.questionType === 'MCQ'
                  ? isBoss
                    ? 'Boss trạm'
                    : 'Trắc nghiệm'
                  : { FILL_BLANK: 'Điền từ', ERROR_CORRECTION: 'Sửa lỗi', REWRITE: 'Viết lại câu' }[
                      current.questionType
                    ]}
              </span>
            </div>
            <h2>{current.prompt}</h2>
            {current.questionType === 'MCQ' ? (
              <fieldset disabled={!!feedback || busy || !connected} className="option-list">
                <legend className="sr-only">Chọn một đáp án</legend>
                {current.options.map((option, index) => {
                  const letter = options[index]
                  const state = feedback
                    ? letter === feedback.correctOption
                      ? 'right'
                      : letter === selected
                        ? feedback.correct
                          ? 'right'
                          : 'wrong'
                        : ''
                    : letter === selected
                      ? 'chosen'
                      : ''
                  return (
                    <label key={letter} className={`answer-option ${state}`}>
                      <input
                        type="radio"
                        name="answer"
                        value={letter}
                        checked={selected === letter}
                        onChange={() => setSelected(letter)}
                      />
                      <span className="option-letter">{letter}</span>
                      <span>{option}</span>
                      {feedback && letter === feedback.correctOption && (
                        <CheckCircle2 className="option-status" size={20} />
                      )}
                    </label>
                  )
                })}
              </fieldset>
            ) : (
              <label className="text-answer-label">
                Câu trả lời của bạn
                <textarea
                  aria-label="Câu trả lời của bạn"
                  required
                  maxLength={255}
                  disabled={!!feedback || busy || !connected}
                  value={selected || ''}
                  onChange={(e) => setSelected(e.target.value)}
                  placeholder="Nhập câu trả lời bằng tiếng Anh"
                />
              </label>
            )}
            {feedback && (
              <div
                className={`feedback ${feedback.correct ? 'correct' : 'incorrect'}`}
                role="status"
              >
                <div>
                  {feedback.correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                  <strong>{feedback.correct ? 'Chính xác!' : 'Chưa chính xác'}</strong>
                </div>
                {current.questionType !== 'MCQ' && feedback.correctOption && (
                  <p>
                    Đáp án mẫu: <strong>{feedback.correctOption}</strong>
                  </p>
                )}
                <p>
                  {feedback.explanation ||
                    (isClassWork
                      ? 'Đáp án và giải thích chỉ mở sau khi bạn đạt yêu cầu bài tập.'
                      : 'Lời giải chi tiết sẽ được mở sau khi hoàn thành boss.')}
                </p>
              </div>
            )}
            {actionError && (
              <div className="error-banner" role="alert">
                {actionError}
              </div>
            )}
            <div className="question-actions">
              {feedback ? (
                <button className="button primary" onClick={next}>
                  {feedback.finished ? 'Xem kết quả' : 'Câu tiếp theo'} <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!selected || busy || !connected}
                  onClick={submit}
                >
                  {busy ? 'Đang chấm...' : 'Xác nhận đáp án'} <ArrowRight size={18} />
                </button>
              )}
            </div>
          </section>
        </div>
        {!isClassWork && (
          <aside className="secondary-column">
            <section className="card boss-panel">
              <div className="boss-art">
                <div className="boss-head">
                  <span>● ●</span>
                  <div>▃</div>
                </div>
                <div className="boss-body" />
              </div>
              <h3>{isBoss ? 'Robot canh trạm' : 'Bạn đang tiến bộ!'}</h3>
              <p>
                {isBoss
                  ? 'Trả lời đúng để giảm năng lượng của boss.'
                  : 'Tập trung vào từng câu và đọc kỹ lời giải.'}
              </p>
              {isBoss && (
                <>
                  <div className="hp-label">
                    <Heart size={18} /> Năng lượng boss <strong>{attempt.bossHp}/100</strong>
                  </div>
                  <div className="progress-track hp">
                    <div style={{ width: `${attempt.bossHp}%` }} />
                  </div>
                  <small>Hoàn thành đủ {attempt.totalQuestions} câu để nhận kết quả.</small>
                </>
              )}
            </section>
          </aside>
        )}
      </div>
    </Layout>
  )
}

export function ResultRoute() {
  const { request, connected } = useSystemSocket()
  const { id } = useParams()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!connected) return
    let active = true
    setAttempt(null)
    setError('')
    request<Attempt>('GET_ATTEMPT', 'ATTEMPT_DATA', { attemptId: Number(id) })
      .then((data) => {
        if (active) setAttempt(data)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [id, request, connected])
  return !attempt ? (
    <Layout title="Kết quả">{error ? <ErrorState message={error} /> : <Loading />}</Layout>
  ) : attempt.status === 'IN_PROGRESS' ? (
    <Navigate to={`/attempts/${attempt.id}`} replace />
  ) : (
    <AttemptResult attempt={attempt} />
  )
}
function AttemptResult({ attempt }: { attempt: Attempt }) {
  const [review, setReview] = useState(false)
  const wrong = attempt.questions.filter((q) => q.correct === false)
  const isClassWork = attempt.classId != null
  const isBoss = !isClassWork && attempt.kind !== 'PRACTICE'
  const canReview = !isClassWork || attempt.questions.some((q) => q.correctOption != null)
  const won = attempt.status === 'WON'
  const title = isClassWork
    ? 'Đã hoàn thành bài tập!'
    : isBoss
      ? won
        ? 'Bạn đã vượt qua trạm!'
        : 'Chưa vượt qua trạm'
      : 'Hoàn thành luyện tập!'
  return (
    <Layout title="Kết quả">
      <div className="result-wrap">
        <div className={`result-emblem ${won ? 'success' : 'retry'}`}>
          {isClassWork ? (
            <CheckCircle2 size={42} />
          ) : won ? (
            <Trophy size={42} />
          ) : (
            <RotateCcw size={40} />
          )}
        </div>
        <span className="section-label">
          {isClassWork ? 'KẾT QUẢ LƯỢT LÀM NÀY' : 'KẾT QUẢ CHÍNH THỨC'}
        </span>
        <h1>{title}</h1>
        <p>
          {isClassWork
            ? canReview
              ? 'Bạn đã đạt yêu cầu. Đáp án và giải thích đã được mở.'
              : `Cần đúng ${attempt.requiredCorrect} câu để đạt yêu cầu và mở lời giải. Điểm tốt nhất trước hạn được giữ lại.`
            : isBoss
              ? won
                ? 'Một trạm mới đã được mở trên hành trình của bạn.'
                : `Cần đúng ít nhất ${attempt.requiredCorrect} câu. Hãy ôn lại và thử lần nữa.`
              : 'Xem lại những câu chưa đúng để củng cố kiến thức.'}
        </p>
        <div className={`result-stats ${isClassWork ? 'classroom-result-stats' : ''}`}>
          <div>
            <strong>
              {attempt.correctCount}/{attempt.totalQuestions}
            </strong>
            <span>Câu đúng</span>
          </div>
          {!isClassWork && (
            <>
              <div>
                <strong>{isBoss ? attempt.bossHp : '—'}</strong>
                <span>{isBoss ? 'HP boss còn lại' : 'HP boss'}</span>
              </div>
            </>
          )}
          {!isClassWork && (
            <div>
              <strong>+{attempt.awardedXp}</strong>
              <span>EXP nhận được</span>
            </div>
          )}
        </div>
        {isBoss && won && attempt.awardedXp === 0 && (
          <p className="muted">Phần thưởng lần đầu đã được nhận ở lượt trước.</p>
        )}
        <div className="result-actions">
          <Link
            className="button primary"
            to={isClassWork ? `/classes/${attempt.classId}?view=assignments` : '/roadmap'}
          >
            {isClassWork ? 'Về lớp học' : 'Về lộ trình'} <ArrowRight size={18} />
          </Link>
          <button
            className="button secondary"
            disabled={!canReview}
            onClick={() => setReview(!review)}
          >
            {review ? 'Ẩn lời giải' : 'Xem lại câu hỏi'}
          </button>
        </div>
      </div>
      {review && canReview && (
        <div className="review-list">
          <h2>{wrong.length ? `${wrong.length} câu cần ôn lại` : 'Bạn đã trả lời đúng tất cả'}</h2>
          {(wrong.length ? wrong : attempt.questions).map((q) => (
            <article className="card review-card" key={q.ordinalNo}>
              <span className="tag">CÂU {q.ordinalNo}</span>
              <h3>{q.prompt}</h3>
              <p>
                Bạn trả lời:{' '}
                <strong>
                  {q.questionType === 'MCQ'
                    ? `${q.answer} — ${q.options[['A', 'B', 'C', 'D'].indexOf(q.answer || '')]}`
                    : q.answer}
                </strong>
              </p>
              <p>
                Đáp án đúng:{' '}
                <strong>
                  {q.questionType === 'MCQ'
                    ? `${q.correctOption} — ${q.options[['A', 'B', 'C', 'D'].indexOf(q.correctOption || '')]}`
                    : q.correctOption}
                </strong>
              </p>
              <div className="feedback correct">
                <p>{q.explanation}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  )
}
