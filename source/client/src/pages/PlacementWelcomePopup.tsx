import { ArrowLeft, ArrowRight, Check, Clock3, Rocket, Sparkles, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const questions = [
  {
    id: 'age',
    title: 'Bạn thuộc nhóm tuổi nào?',
    hint: 'Một chút về bạn trước khi cất cánh.',
    icon: UsersRound,
    options: ['Dưới 18.', '18–24.', 'Từ 25 trở lên.'],
  },
  {
    id: 'experience',
    title: 'Bạn thấy trình độ hiện tại của mình thế nào?',
    hint: 'Chọn điều gần với cảm nhận của bạn nhất nhé.',
    icon: Sparkles,
    options: ['Mới bắt đầu.', 'Biết một chút.', 'Đã có nền tảng.'],
  },
  {
    id: 'time',
    title: 'Bạn dự định học bao lâu mỗi ngày?',
    hint: 'Một chút mỗi ngày, một hành trình thật xa.',
    icon: Clock3,
    options: ['Dưới 30 phút.', '30–60 phút.', 'Trên 1 giờ.'],
  },
]

export function PlacementWelcomePopup({ onContinue }: { onContinue: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const moving = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const questionTitle = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(0)
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [choices, setChoices] = useState<Record<string, string>>({})
  const question = questions[step]
  const StepIcon = question.icon
  const lastStep = step === questions.length - 1
  useEffect(() => {
    const element = dialog.current!
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      timers.current.forEach(clearTimeout)
      element.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    dialog.current?.scrollTo({ top: 0 })
    questionTitle.current?.focus({ preventScroll: true })
  }, [step])
  function goTo(next: number) {
    if (moving.current || closing.current || next < 0 || next >= questions.length) return
    moving.current = true
    setDirection(next > step ? 'forward' : 'backward')
    setPhase('out')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timers.current.push(
      setTimeout(
        () => {
          setStep(next)
          setPhase('in')
          timers.current.push(
            setTimeout(
              () => {
                moving.current = false
                setPhase('idle')
              },
              reduced ? 0 : 280,
            ),
          )
        },
        reduced ? 0 : 150,
      ),
    )
  }
  function advance() {
    if (moving.current) return
    if (lastStep) finish()
    else goTo(step + 1)
  }
  function finish() {
    if (closing.current) return
    closing.current = true
    setChoices({})
    onContinue()
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="card placement-welcome-dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled])',
        )
        const first = controls[0],
          last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          finish()
      }}
    >
      <button
        autoFocus
        className="placement-welcome-close"
        type="button"
        aria-label="Đóng chào mừng và làm bài kiểm tra"
        onClick={finish}
      >
        <X size={21} />
      </button>
      <header className="placement-welcome-hero">
        <div className="placement-welcome-brand">
          <Rocket size={16} /> GRAMMAR QUEST <span>HÀNH TRÌNH MỚI</span>
        </div>
        <h1 id="welcome-title">Chào mừng bạn đến với hành trình học tiếng Anh! 👋</h1>
        <p id="welcome-description">Cùng làm quen một chút trước khi bắt đầu nhé.</p>
        <span className="placement-welcome-star star-one" aria-hidden="true">
          ✦
        </span>
        <span className="placement-welcome-star star-two" aria-hidden="true">
          ✧
        </span>
      </header>
      <div className="placement-welcome-content">
        <div className="placement-welcome-progress">
          <span role="status" aria-live="polite">
            Bước {step + 1} / {questions.length}
          </span>
          <span>Làm quen cùng bạn</span>
        </div>
        <div className="placement-welcome-tracks" aria-hidden="true">
          {questions.map((item, index) => (
            <span key={item.id} className={index <= step ? 'active' : ''}>
              <i />
            </span>
          ))}
        </div>
        <section
          key={question.id}
          className={`placement-welcome-step ${direction}`}
          data-phase={phase}
          aria-labelledby={`welcome-question-${question.id}`}
        >
          <div className={`placement-welcome-step-icon step-${question.id}`} aria-hidden="true">
            <StepIcon size={25} />
            <span>✦</span>
          </div>
          <h2 ref={questionTitle} id={`welcome-question-${question.id}`} tabIndex={-1}>
            {question.title}
          </h2>
          <p className="placement-welcome-hint">{question.hint}</p>
          <fieldset className="placement-welcome-question" disabled={phase !== 'idle'}>
            <legend className="sr-only">{question.title}</legend>
            <div className="placement-welcome-options">
              {question.options.map((option, index) => (
                <label
                  key={option}
                  className={`placement-welcome-option ${choices[question.id] === option ? 'selected' : ''}`}
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name={`welcome-${question.id}`}
                    value={option}
                    checked={choices[question.id] === option}
                    onChange={() =>
                      setChoices((current) => ({ ...current, [question.id]: option }))
                    }
                  />
                  <span className={`placement-welcome-letter letter-${index}`} aria-hidden="true">
                    {'ABC'[index]}
                  </span>
                  <span>{option}</span>
                  <span className="placement-welcome-check" aria-hidden="true">
                    {choices[question.id] === option && <Check size={15} />}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <div className="placement-welcome-actions">
          <button
            type="button"
            className="placement-welcome-back"
            disabled={step === 0 || phase !== 'idle'}
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeft size={17} />
            Quay lại
          </button>
          <button
            type="button"
            className="placement-welcome-skip"
            disabled={phase !== 'idle'}
            onClick={advance}
          >
            Bỏ qua câu này
          </button>
          <button
            type="button"
            className="button primary placement-welcome-confirm"
            disabled={phase !== 'idle'}
            onClick={advance}
          >
            {lastStep ? 'Xác nhận và làm bài kiểm tra' : 'Tiếp tục'}
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="placement-welcome-note">
          Không bắt buộc chọn. Level bắt đầu được xác định bằng bài kiểm tra đầu vào.
        </p>
      </div>
    </dialog>,
    document.body,
  )
}
