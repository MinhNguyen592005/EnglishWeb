import { CheckCircle2, FileText, FlaskConical, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parseQuestionsFromTxt, SAMPLE_TXT_BY_TYPE, type ParsedQuestionDraft } from '../services/questionTxtParser'
import type { TeacherQuestion } from '../types'
import './QuestionFormatPlayground.css'

type Format = TeacherQuestion['questionType'] | 'ALL'
const formats: { value: Format; label: string }[] = [
  { value: 'ALL', label: 'Tổng hợp 4 dạng' },
  { value: 'MCQ', label: 'Trắc nghiệm (MCQ)' },
  { value: 'FILL_BLANK', label: 'Điền từ (FILL_BLANK)' },
  { value: 'ERROR_CORRECTION', label: 'Sửa lỗi (ERROR_CORRECTION)' },
  { value: 'REWRITE', label: 'Viết lại câu (REWRITE)' }
]

export function QuestionFormatPlayground({ initialMode, initialFormat, onClose }: {
  initialMode: 'sample' | 'raw'
  initialFormat: Format
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState(initialMode)
  const [format, setFormat] = useState<Format>(initialFormat)
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[] | null>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const sample = SAMPLE_TXT_BY_TYPE[format]
  const fallback = format === 'ALL' ? 'FILL_BLANK' : format
  const valid = drafts?.filter(draft => !draft.errors.length).length ?? 0

  function changeMode(next: 'sample' | 'raw') {
    setMode(next)
    setDrafts(null)
  }

  return <dialog ref={dialog} className="question-format-dialog" aria-labelledby="question-format-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="qf-heading">
      <div><span className="qf-eyebrow">CÔNG CỤ ĐỊNH DẠNG .TXT</span><h2 id="question-format-title">Xem mẫu & thử phân tích</h2></div>
      <button type="button" aria-label="Đóng công cụ định dạng" onClick={onClose}><X size={21}/></button>
    </header>
    <nav className="qf-tabs" aria-label="Công cụ thử định dạng">
      <button type="button" aria-pressed={mode === 'sample'} onClick={() => changeMode('sample')}><FileText size={16}/> Xem mẫu hợp lệ</button>
      <button type="button" aria-pressed={mode === 'raw'} onClick={() => changeMode('raw')}><FlaskConical size={16}/> Thử văn bản của bạn</button>
    </nav>
    <p className="qf-notice">Khu vực thử định dạng · Không lưu vào kho và không thay đổi nội dung bộ bài đang nhập.</p>
    <label className="qf-format-label">{mode === 'sample' ? 'Dạng mẫu muốn xem' : 'Dạng mặc định khi không có tiêu đề nhóm'}
      <select value={format} onChange={event => { setFormat(event.target.value as Format); setDrafts(null) }}>
        {formats.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
    {mode === 'sample' ? <section className="qf-sample">
      <p>Mẫu có sẵn đề bài, đáp án và giải thích. Bạn có thể đối chiếu với file của mình.</p>
      <textarea aria-label="Nội dung mẫu định dạng hợp lệ" readOnly value={sample} spellCheck={false}/>
    </section> : <section className="qf-raw">
      <label htmlFor="question-format-input">Văn bản muốn kiểm tra</label>
      <textarea id="question-format-input" value={text} onChange={event => { setText(event.target.value); setDrafts(null) }} placeholder="Tự nhập hoặc dán text để kiểm tra cách parser tách câu và nhận diện định dạng…" spellCheck={false}/>
      <div className="qf-actions">
        <button type="button" className="button primary" disabled={!text.trim()} onClick={() => setDrafts(parseQuestionsFromTxt(text, fallback))}><Play size={15}/> Phân tích thử</button>
        <button type="button" className="button secondary" disabled={!text} onClick={() => { setText(''); setDrafts(null) }}>Xóa văn bản thử</button>
      </div>
      {drafts && <div className="qf-results">
        <p role="status"><CheckCircle2 size={17}/> Nhận diện {drafts.length} khối · {valid} câu hợp lệ</p>
        {valid === 0 && <p className="qf-warning">Chưa có câu hỏi hợp lệ. Hãy đối chiếu với mẫu hoặc bổ sung các thông tin được báo thiếu bên dưới.</p>}
        {drafts.map((draft, index) => <details key={index} open={draft.errors.length > 0}>
          <summary>Khối {index + 1} · {draft.questionType} · {draft.errors.length ? 'Cần bổ sung' : 'Hợp lệ'}</summary>
          <p>{draft.prompt}</p>
          {draft.errors.length > 0 ? <ul>{draft.errors.map((error, errorIndex) => <li key={errorIndex}>{error}</li>)}</ul> : <p className="qf-answer">Đáp án: {draft.questionType === 'MCQ' ? draft.correctOption : draft.acceptedAnswer}</p>}
        </details>)}
      </div>}
    </section>}
    <footer className="qf-footer"><span>Để tạo bộ bài, quay lại vùng nhập file hoặc dán nội dung chính.</span><button type="button" className="button secondary" onClick={onClose}>Đóng công cụ</button></footer>
  </dialog>
}
