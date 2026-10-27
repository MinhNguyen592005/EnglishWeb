import {
  AlertCircle,
  CheckCircle2,
  FileText,
  PlusCircle,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import {
  parseQuestionsFromTxt,
  validateParsedQuestion,
  type ParsedQuestionDraft,
} from '../services/questionTxtParser'
import type { TeacherQuestion } from '../types'
import './TxtQuestionImporter.css'
import { QuestionFormatPlayground } from './QuestionFormatPlayground'

interface LessonItem {
  id: number
  title: string
}

interface TxtQuestionImporterProps {
  lessons: LessonItem[]
  defaultLessonId?: number
  onSaveBatch: (lessonId: number, questions: ParsedQuestionDraft[]) => Promise<void>
  busy?: boolean
  commonCurriculumMode?: boolean
  materialMode?: boolean
  saveDisabled?: boolean
  saveDisabledReason?: string
  onCompleteSaveDetails?: () => void
  initialQuestions?: ParsedQuestionDraft[]
}

const typeLabels: Record<TeacherQuestion['questionType'], string> = {
  MCQ: 'Trắc nghiệm (MCQ)',
  FILL_BLANK: 'Điền từ khuyết',
  ERROR_CORRECTION: 'Sửa lỗi sai',
  REWRITE: 'Viết lại câu',
}

export function TxtQuestionImporter({
  lessons,
  defaultLessonId = 0,
  onSaveBatch,
  busy = false,
  commonCurriculumMode = false,
  materialMode = false,
  saveDisabled = false,
  saveDisabledReason = 'Vui lòng hoàn thành thông tin bộ bài trước khi lưu.',
  onCompleteSaveDetails,
  initialQuestions = [],
}: TxtQuestionImporterProps) {
  const [lessonId, setLessonId] = useState<number>(defaultLessonId)
  const [questions, setQuestions] = useState<ParsedQuestionDraft[]>(initialQuestions)
  const [isDragging, setIsDragging] = useState(false)
  const [parseError, setParseError] = useState('')
  const [playground, setPlayground] = useState<'sample' | 'raw' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveStatusId = useId()

  const processText = (text: string) => {
    setParseError('')
    const fallbackType: TeacherQuestion['questionType'] = commonCurriculumMode
      ? 'MCQ'
      : 'FILL_BLANK'
    const drafts = parseQuestionsFromTxt(text, fallbackType)
    if (drafts.length === 0) {
      setParseError(
        'Không nhận diện được câu hỏi nào từ nội dung vừa nhập. Hãy kiểm tra định dạng hoặc bấm "Xem mẫu định dạng .txt".',
      )
    }

    // In common curriculum mode, ensure only MCQ with A,B,C,D are valid
    if (commonCurriculumMode) {
      drafts.forEach((d) => {
        if (d.questionType !== 'MCQ') {
          d.errors.push('Câu hỏi chung của hệ thống chỉ hỗ trợ dạng trắc nghiệm 4 phương án (MCQ)')
        }
      })
    }

    setQuestions(drafts)
  }

  const handleFile = async (file: File) => {
    try {
      const text = await file.text()
      processText(text)
    } catch (err) {
      setParseError('Không thể đọc file: ' + (err as Error).message)
    }
  }

  const handlePaste = async (e: ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0]
      if (file.name.endsWith('.txt') || file.type.includes('text')) {
        e.preventDefault()
        await handleFile(file)
        return
      }
    }

    const text = e.clipboardData.getData('text')
    if (text && text.trim()) {
      e.preventDefault()
      processText(text)
    }
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      await handleFile(file)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFile(e.target.files[0])
      e.target.value = ''
    }
  }

  const handleQuestionFieldChange = (index: number, patch: Partial<ParsedQuestionDraft>) => {
    setQuestions((prev) => {
      const next = [...prev]
      const updated = { ...next[index], ...patch }
      const errors = validateParsedQuestion(updated)
      if (commonCurriculumMode && updated.questionType !== 'MCQ') {
        errors.push('Câu hỏi chung của hệ thống chỉ hỗ trợ dạng trắc nghiệm 4 phương án (MCQ)')
      }
      updated.errors = errors
      next[index] = updated
      return next
    })
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const validQuestionsCount = questions.filter((q) => q.errors.length === 0).length
  const hasErrors = questions.some((q) => q.errors.length > 0)

  const handleSave = async () => {
    if (busy || saveDisabled || (!materialMode && !lessonId) || questions.length === 0 || hasErrors)
      return
    try {
      await onSaveBatch(lessonId, questions)
    } catch (error) {
      setParseError((error as Error).message)
      return
    }
    setQuestions([])
  }

  return (
    <div className="importer-card">
      {!materialMode && (
        <div className="form-grid" style={{ marginBottom: 16 }}>
          {!materialMode && (
            <label>
              Bài học áp dụng cho bộ câu hỏi
              <select
                required
                value={lessonId}
                onChange={(e) => setLessonId(Number(e.target.value))}
                style={{ fontWeight: 600, borderColor: lessonId ? '#aeb6ff' : undefined }}
              >
                <option value={0}>-- Vui lòng chọn bài học --</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {commonCurriculumMode && (
            <label>
              Dạng câu hỏi
              <input disabled value="Trắc nghiệm 4 phương án (MCQ)" />
            </label>
          )}
        </div>
      )}

      <div
        className={`importer-dropzone ${isDragging ? 'dragging' : ''}`}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        tabIndex={0}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".txt,text/plain"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <div className="dropzone-icon">
          <Upload size={26} />
        </div>
        <div className="dropzone-instructions">
          <strong>Kéo & thả file .txt hoặc dán nội dung câu hỏi tại đây</strong>
          <p>
            Hỗ trợ <strong>Ctrl+V</strong> dán trực tiếp file .txt từ máy tính, dán đoạn văn bản đã
            copy, kéo-thả file, hoặc bấm nút bên dưới. Hệ thống tự động nhận diện dạng câu hỏi, bóc
            tách đề bài, đáp án mẫu và tự điền giải thích nếu thiếu.
          </p>
        </div>
        <div className="dropzone-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText size={18} /> Chọn file .txt từ máy
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setPlayground('sample')}
          >
            <Sparkles size={18} /> Xem mẫu định dạng .txt
          </button>
          <button type="button" className="button secondary" onClick={() => setPlayground('raw')}>
            Thử phân tích văn bản
          </button>
        </div>
      </div>

      {playground && (
        <QuestionFormatPlayground
          initialMode={playground}
          initialFormat={commonCurriculumMode ? 'MCQ' : 'ALL'}
          onClose={() => setPlayground(null)}
        />
      )}

      {parseError && (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          <AlertCircle
            size={18}
            style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }}
          />
          {parseError}
        </div>
      )}

      {questions.length > 0 && (
        <div className="preview-container">
          <div className="preview-header">
            <div className="preview-summary">
              <strong>Bảng xem trước & Tự động hoàn thiện ({questions.length} câu)</strong>
              <small>
                {validQuestionsCount}/{questions.length} câu đã hợp lệ sẵn sàng lưu.
                {hasErrors && ' Vui lòng hoàn thiện các trường còn cảnh báo màu đỏ bên dưới.'}
              </small>
            </div>
            {(materialMode || lessonId > 0) && !hasErrors && (
              <button
                type="button"
                className="button primary"
                disabled={busy || saveDisabled}
                title={saveDisabled ? saveDisabledReason : undefined}
                aria-describedby={saveStatusId}
                onClick={handleSave}
              >
                <CheckCircle2 size={18} />{' '}
                {materialMode ? 'Lưu bộ bài' : `Lưu toàn bộ ${questions.length} câu vào bài học`}
              </button>
            )}
          </div>

          <div className="parsed-questions-list">
            {questions.map((q, idx) => {
              const isValid = q.errors.length === 0
              const typeClass = q.questionType.toLowerCase()
              return (
                <div
                  key={idx}
                  className={`parsed-question-card ${isValid ? 'valid' : 'has-error'}`}
                >
                  <div className="question-card-top">
                    <div className="badge-group">
                      <strong>Câu #{idx + 1}</strong>
                      <span className={`badge-type ${typeClass}`}>
                        {typeLabels[q.questionType]}
                      </span>
                      <span className={`badge-status ${isValid ? 'valid' : 'error'}`}>
                        {isValid ? '✓ Hợp lệ' : '⚠️ Cần bổ sung'}
                      </span>
                      {q.autoCompletedFields.includes('explanation') && (
                        <span
                          className="badge-auto"
                          title="Hệ thống đã tự tạo câu giải thích theo đáp án"
                        >
                          ✨ Đã tự điền giải thích
                        </span>
                      )}
                      {q.autoCompletedFields.includes('acceptedAnswer') && (
                        <span
                          className="badge-auto"
                          title="Hệ thống đã tự bóc tách đáp án mẫu từ nội dung trong ngoặc vuông []"
                        >
                          🎯 Tự bóc tách đáp án
                        </span>
                      )}
                      {q.autoCompletedFields.includes('correctOption') && (
                        <span
                          className="badge-auto"
                          title="Hệ thống đã tự nhận diện đáp án đúng từ dấu sao hoặc nội dung so khớp"
                        >
                          🎯 Tự suy luận đáp án
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => handleDeleteQuestion(idx)}
                      title="Xóa câu này khỏi bộ câu hỏi"
                    >
                      <Trash2 size={16} /> Xóa câu này
                    </button>
                  </div>

                  {q.errors.length > 0 && (
                    <div className="error-list" style={{ marginBottom: 12 }}>
                      {q.errors.map((err, errIdx) => (
                        <span key={errIdx} className="error-chip">
                          • {err}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="form-grid">
                    <label className="full-span">
                      Đề bài
                      <textarea
                        required
                        maxLength={500}
                        rows={2}
                        value={q.prompt}
                        onChange={(e) => handleQuestionFieldChange(idx, { prompt: e.target.value })}
                        placeholder="Nhập nội dung đề bài..."
                      />
                    </label>

                    {!commonCurriculumMode && (
                      <label>
                        Dạng câu hỏi
                        <select
                          value={q.questionType}
                          onChange={(e) =>
                            handleQuestionFieldChange(idx, {
                              questionType: e.target.value as ParsedQuestionDraft['questionType'],
                            })
                          }
                          style={{ fontWeight: 600 }}
                        >
                          <option value="FILL_BLANK">Điền từ khuyết (FILL_BLANK)</option>
                          <option value="ERROR_CORRECTION">Sửa lỗi sai (ERROR_CORRECTION)</option>
                          <option value="REWRITE">Viết lại câu (REWRITE)</option>
                          <option value="MCQ">Trắc nghiệm 4 lựa chọn (MCQ)</option>
                        </select>
                      </label>
                    )}

                    {q.questionType === 'MCQ' ? (
                      <>
                        <label>
                          Đáp án đúng
                          <select
                            value={q.correctOption}
                            onChange={(e) =>
                              handleQuestionFieldChange(idx, {
                                correctOption: e.target
                                  .value as ParsedQuestionDraft['correctOption'],
                              })
                            }
                            style={{ fontWeight: 700, color: 'var(--primary-strong)' }}
                          >
                            <option value="">-- Chọn đáp án đúng --</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </label>

                        {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map(
                          (optKey, optIdx) => {
                            const letter = String.fromCharCode(65 + optIdx)
                            const isCorrect = q.correctOption === letter
                            return (
                              <label key={optKey}>
                                Phương án {letter} {isCorrect ? '(Đáp án đúng ⭐)' : ''}
                                <input
                                  required
                                  maxLength={255}
                                  value={q[optKey]}
                                  onChange={(e) =>
                                    handleQuestionFieldChange(idx, { [optKey]: e.target.value })
                                  }
                                  style={
                                    isCorrect
                                      ? {
                                          borderColor: 'var(--primary)',
                                          background: 'var(--primary-soft)',
                                        }
                                      : undefined
                                  }
                                />
                              </label>
                            )
                          },
                        )}
                      </>
                    ) : (
                      <label className="full-span">
                        Đáp án mẫu để chấm tự động
                        <input
                          required
                          maxLength={255}
                          value={q.acceptedAnswer}
                          onChange={(e) =>
                            handleQuestionFieldChange(idx, { acceptedAnswer: e.target.value })
                          }
                          placeholder={
                            q.questionType === 'FILL_BLANK'
                              ? 'Ví dụ: goes hoặc have been living...'
                              : q.questionType === 'ERROR_CORRECTION'
                                ? 'Ví dụ: went hoặc are (phần đã sửa đúng)...'
                                : 'Nhập câu viết lại hoàn chỉnh...'
                          }
                        />
                        <small style={{ color: 'var(--muted)', marginTop: 4 }}>
                          Máy chủ bỏ qua chữ hoa, khoảng trắng thừa và dấu câu cuối
                        </small>
                      </label>
                    )}

                    <label className="full-span">
                      Giải thích chi tiết
                      <textarea
                        required
                        rows={2}
                        value={q.explanation}
                        onChange={(e) =>
                          handleQuestionFieldChange(idx, { explanation: e.target.value })
                        }
                        placeholder="Giải thích vì sao đáp án này đúng..."
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="batch-save-bar">
            <div className="batch-save-info">
              <strong>
                {saveDisabled || hasErrors || (!materialMode && !lessonId)
                  ? 'Câu hỏi hợp lệ:'
                  : 'Sẵn sàng lưu'}{' '}
                {validQuestionsCount}/{questions.length} câu hỏi
              </strong>
              <span id={saveStatusId} aria-live="polite">
                {saveDisabled
                  ? saveDisabledReason
                  : !materialMode && !lessonId
                    ? 'Vui lòng chọn Bài học ở trên để hoàn tất việc lưu.'
                    : hasErrors
                      ? 'Vui lòng bổ sung các ô còn thiếu trước khi lưu.'
                      : `Tất cả câu hỏi đã hoàn thiện hợp lệ và sẽ được thêm vào kho câu hỏi.`}
              </span>
              {saveDisabled && onCompleteSaveDetails && (
                <button type="button" className="text-button" onClick={onCompleteSaveDetails}>
                  Nhập tên bộ bài
                </button>
              )}
            </div>
            <button
              type="button"
              className="button primary"
              disabled={
                busy ||
                saveDisabled ||
                (!materialMode && !lessonId) ||
                questions.length === 0 ||
                hasErrors
              }
              title={saveDisabled ? saveDisabledReason : undefined}
              aria-describedby={saveStatusId}
              onClick={handleSave}
              style={{ minWidth: 220 }}
            >
              <PlusCircle size={18} />{' '}
              {materialMode ? 'Lưu bộ bài' : `Lưu toàn bộ ${questions.length} câu hỏi`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
