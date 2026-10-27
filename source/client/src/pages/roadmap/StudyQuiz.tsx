import { ArrowRight, CheckCircle2, RotateCcw, Trophy, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSystemSocket } from '../../app/SystemSocketContext'
import type { StudyAttempt } from './types'

export function StudyQuiz({
  attempt,
  onAttempt,
  onBack,
  onNext,
  backLabel,
}: {
  attempt: StudyAttempt
  onAttempt: (a: StudyAttempt) => void
  onBack: () => void
  onNext?: () => void
  backLabel?: string
}) {
  const { request, connected } = useSystemSocket()
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [dirty, setDirty] = useState(false)
  const retryKey = useRef(crypto.randomUUID())
  const submitted = attempt.status !== 'IN_PROGRESS'
  const isExam = attempt.kind === 'LEVEL_TEST'
  const answered = attempt.questions.filter((q) => answers[q.id]).length
  useEffect(() => {
    if (!dirty || submitted || busy || !connected) return
    let active = true
    const timer = setTimeout(() => {
      setSaved('Đang lưu…')
      request('ROADMAP_SAVE', 'ROADMAP_COURSE_DATA', { attemptId: attempt.id, answers })
        .then(() => {
          if (active) setSaved('Đã lưu câu trả lời')
        })
        .catch((e) => {
          if (active) setSaved(e.message)
        })
    }, 700)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [answers, attempt.id, busy, connected, dirty, request, submitted])
  async function submit() {
    if (answered !== attempt.totalQuestions) {
      setError(
        `Còn ${attempt.totalQuestions - answered} câu chưa trả lời. Hãy hoàn thành trước khi nộp.`,
      )
      document
        .getElementById(`study-question-${attempt.questions.find((q) => !answers[q.id])?.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    setError('')
    try {
      onAttempt(
        await request<StudyAttempt>('ROADMAP_SUBMIT', 'ROADMAP_COURSE_DATA', {
          attemptId: attempt.id,
          answers,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function retry() {
    setBusy(true)
    setError('')
    try {
      onAttempt(
        await request<StudyAttempt>('ROADMAP_START', 'ROADMAP_COURSE_DATA', {
          kind: attempt.kind,
          referenceId: attempt.referenceId,
          requestKey: retryKey.current,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className="study-quiz"
      aria-label={isExam ? 'Kiểm tra cuối level' : 'Luyện tập bài học'}
    >
      <div className="card study-quiz-heading">
        <span className="section-label">
          {isExam
            ? 'KIỂM TRA CUỐI LEVEL'
            : attempt.kind === 'LESSON'
              ? 'LUYỆN TẬP CỦNG CỐ'
              : attempt.kind.endsWith('TEST')
                ? 'KIỂM TRA MODULE'
                : 'ÔN TẬP'}
        </span>
        <h2>{attempt.kind === 'LESSON' ? 'Áp dụng kiến thức vừa học' : attempt.title}</h2>
        <p>
          {isExam
            ? '10 câu tổng hợp từ các module. Đúng ít nhất 8/10 câu để vượt level.'
            : attempt.kind === 'LESSON'
              ? 'Trả lời đủ và nhấn “Nộp bài” để hoàn thành bài học, bất kể điểm số.'
              : 'Trả lời các câu hỏi để ôn lại kiến thức. Kết quả giúp bạn xác định phần cần luyện thêm.'}
        </p>
        {!submitted && (
          <>
            <div className="hero-progress">
              <span>Đã trả lời</span>
              <strong>
                {answered}/{attempt.totalQuestions}
              </strong>
            </div>
            <div className="progress-track">
              <div style={{ width: `${(answered / attempt.totalQuestions) * 100}%` }} />
            </div>
            <p className="muted">
              Bạn có thể sửa đáp án trước khi nộp. Đáp án đúng và giải thích chỉ hiện sau khi nộp.
            </p>
            <small role="status">{saved}</small>
          </>
        )}
      </div>
      {submitted && (
        <div
          className={`card study-result ${attempt.status === 'FAILED' ? 'needs-review' : 'completed'}`}
          role="status"
        >
          {attempt.status === 'FAILED' ? (
            <RotateCcw size={32} />
          ) : isExam ? (
            <Trophy size={32} />
          ) : (
            <CheckCircle2 size={32} />
          )}
          <div>
            <h2>
              {isExam
                ? attempt.status === 'PASSED'
                  ? 'Đã vượt qua level!'
                  : 'Chưa đạt bài kiểm tra level'
                : attempt.kind === 'LESSON'
                  ? 'Đã hoàn thành bài học'
                  : 'Đã hoàn thành lượt ôn tập / kiểm tra'}
            </h2>
            <p>
              Đúng {attempt.correctCount}/{attempt.totalQuestions} câu.
              {isExam
                ? attempt.status === 'PASSED'
                  ? attempt.levelId === 5
                    ? ' Bạn đã chinh phục cả 5 level.'
                    : ' Hành tinh tiếp theo đã được mở.'
                  : ' Cần ít nhất 8 câu đúng. Bạn có thể ôn tập và làm lại.'
                : ' Xem giải thích từng câu bên dưới.'}
            </p>
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {attempt.questions.map((q, index) => (
          <article className="card study-question" key={q.id} id={`study-question-${q.id}`}>
            <div className="question-meta">
              <span className="tag">CÂU {index + 1}</span>
              <span>{q.moduleTitle}</span>
            </div>
            <h3>{q.prompt}</h3>
            <fieldset disabled={submitted || busy || !connected} className="option-list">
              <legend className="sr-only">Đáp án câu {index + 1}</legend>
              {q.options.map((option, i) => {
                const letter = 'ABCD'[i]
                const state = submitted
                  ? q.correctOption === letter
                    ? 'right'
                    : q.answer === letter
                      ? 'wrong'
                      : ''
                  : answers[q.id] === letter
                    ? 'chosen'
                    : ''
                return (
                  <label key={letter} className={`answer-option ${state}`}>
                    <input
                      type="radio"
                      name={`study-${attempt.id}-${q.id}`}
                      checked={answers[q.id] === letter}
                      value={letter}
                      onChange={() => {
                        setAnswers((old) => ({ ...old, [q.id]: letter }))
                        setDirty(true)
                        setSaved('')
                        setError('')
                      }}
                    />
                    <span className="option-letter">{letter}</span>
                    <span>{option}</span>
                  </label>
                )
              })}
            </fieldset>
            {submitted && (
              <div className={`feedback ${q.correct ? 'correct' : 'incorrect'}`}>
                <div>
                  {q.correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                  <strong>{q.correct ? 'Đúng' : 'Sai'}</strong>
                </div>
                <p>
                  Bạn chọn: {q.answer} — {q.options['ABCD'.indexOf(q.answer || '')]}
                </p>
                <p>
                  Đáp án đúng: {q.correctOption} —{' '}
                  {q.options['ABCD'.indexOf(q.correctOption || '')]}
                </p>
                <p>{q.explanation}</p>
              </div>
            )}
          </article>
        ))}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="card study-actions">
          {submitted ? (
            <>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !connected}
                onClick={retry}
              >
                <RotateCcw size={17} />
                {busy ? 'Đang tạo…' : 'Làm lại'}
              </button>
              {onNext && (
                <button type="button" className="button primary" onClick={onNext}>
                  Bài tiếp theo <ArrowRight size={17} />
                </button>
              )}
              <button type="button" className="button secondary" onClick={() => onBack()}>
                {backLabel ?? (attempt.kind === 'LESSON' ? 'Quay lại module' : 'Quay lại lộ trình')}
              </button>
            </>
          ) : (
            <>
              <span>
                {answered}/{attempt.totalQuestions} câu đã trả lời
              </span>
              <button type="submit" className="button primary" disabled={busy || !connected}>
                {busy ? 'Đang nộp…' : 'Nộp bài'} <ArrowRight size={17} />
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  )
}
