import { AlertCircle, CheckCircle2, FileText, HelpCircle, PlusCircle, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import {
  parseQuestionsFromTxt,
  SAMPLE_TXT_BY_TYPE,
  validateParsedQuestion,
  type ParsedQuestionDraft
} from '../services/questionTxtParser'
import type { TeacherQuestion } from '../types'
import './TxtQuestionImporter.css'

interface LessonItem {
  id: number
  title: string
}

type DefaultTypeOption = 'AUTO' | 'FILL_BLANK' | 'ERROR_CORRECTION' | 'REWRITE' | 'MCQ'

interface TxtQuestionImporterProps {
  lessons: LessonItem[]
  defaultLessonId?: number
  defaultQuestionType?: TeacherQuestion['questionType']
  onSaveBatch: (lessonId: number, questions: ParsedQuestionDraft[]) => Promise<void>
  busy?: boolean
  commonCurriculumMode?: boolean
}

const typeLabels: Record<TeacherQuestion['questionType'], string> = {
  MCQ: 'Trắc nghiệm (MCQ)',
  FILL_BLANK: 'Điền từ khuyết',
  ERROR_CORRECTION: 'Sửa lỗi sai',
  REWRITE: 'Viết lại câu'
}

export function TxtQuestionImporter({
  lessons,
  defaultLessonId = 0,
  defaultQuestionType = 'FILL_BLANK',
  onSaveBatch,
  busy = false,
  commonCurriculumMode = false
}: TxtQuestionImporterProps) {
  const [lessonId, setLessonId] = useState<number>(defaultLessonId)
  const [selectedType, setSelectedType] = useState<DefaultTypeOption>(
    commonCurriculumMode ? 'MCQ' : defaultQuestionType || 'AUTO'
  )
  const [rawText, setRawText] = useState('')
  const [questions, setQuestions] = useState<ParsedQuestionDraft[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [parseError, setParseError] = useState('')
  const [showRawText, setShowRawText] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processText = (text: string, typeOpt: DefaultTypeOption = selectedType) => {
    setParseError('')
    const fallbackType: TeacherQuestion['questionType'] =
      typeOpt === 'AUTO' ? 'FILL_BLANK' : typeOpt
    const drafts = parseQuestionsFromTxt(text, fallbackType)
    if (drafts.length === 0) {
      setParseError('Không nhận diện được câu hỏi nào từ nội dung vừa nhập. Hãy kiểm tra định dạng hoặc bấm "Dùng thử mẫu .txt".')
    }

    // In common curriculum mode, ensure only MCQ with A,B,C,D are valid
    if (commonCurriculumMode) {
      drafts.forEach(d => {
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
      setRawText(text)
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
      setRawText(text)
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

  const handleLoadSample = (typeToLoad: DefaultTypeOption = selectedType) => {
    const key = typeToLoad === 'AUTO' ? 'ALL' : typeToLoad
    const sample = SAMPLE_TXT_BY_TYPE[key] || SAMPLE_TXT_BY_TYPE.ALL
    setRawText(sample)
    processText(sample, typeToLoad)
  }

  const handleTypeChange = (newType: DefaultTypeOption) => {
    setSelectedType(newType)
    if (rawText.trim()) {
      processText(rawText, newType)
    }
  }

  const handleQuestionFieldChange = (index: number, patch: Partial<ParsedQuestionDraft>) => {
    setQuestions(prev => {
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
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  const validQuestionsCount = questions.filter(q => q.errors.length === 0).length
  const hasErrors = questions.some(q => q.errors.length > 0)

  const handleSave = async () => {
    if (!lessonId || questions.length === 0 || hasErrors) return
    await onSaveBatch(lessonId, questions)
    setRawText('')
    setQuestions([])
    setShowRawText(false)
  }

  return (
    <div className="importer-card">
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <label>
          Bài học áp dụng cho bộ câu hỏi
          <select
            required
            value={lessonId}
            onChange={e => setLessonId(Number(e.target.value))}
            style={{ fontWeight: 600, borderColor: lessonId ? '#aeb6ff' : undefined }}
          >
            <option value={0}>-- Vui lòng chọn bài học --</option>
            {lessons.map(l => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>

        {!commonCurriculumMode ? (
          <label>
            Dạng câu hỏi mặc định khi nạp file
            <select
              value={selectedType}
              onChange={e => handleTypeChange(e.target.value as DefaultTypeOption)}
              style={{ fontWeight: 600 }}
            >
              <option value="AUTO">✨ Tự động nhận diện (Điền từ / Sửa lỗi / Viết lại / Trắc nghiệm)</option>
              <option value="FILL_BLANK">Điền từ khuyết (FILL_BLANK)</option>
              <option value="ERROR_CORRECTION">Sửa lỗi sai (ERROR_CORRECTION)</option>
              <option value="REWRITE">Viết lại câu (REWRITE)</option>
              <option value="MCQ">Trắc nghiệm 4 lựa chọn (MCQ)</option>
            </select>
          </label>
        ) : (
          <label>
            Dạng câu hỏi
            <input disabled value="Trắc nghiệm 4 phương án (MCQ)" style={{ background: '#f8fafc' }} />
          </label>
        )}
      </div>

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
            Hỗ trợ <strong>Ctrl+V</strong> dán trực tiếp file .txt từ máy tính, dán đoạn văn bản đã copy, kéo-thả file, hoặc bấm nút bên dưới. Hệ thống tự động nhận diện dạng câu hỏi, bóc tách đề bài, đáp án mẫu và tự điền giải thích nếu thiếu.
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
            onClick={() => handleLoadSample(selectedType)}
            title="Nạp mẫu văn bản chuẩn để thử nghiệm tính năng"
          >
            <Sparkles size={18} /> Thử mẫu .txt ({selectedType === 'AUTO' ? 'Tổng hợp 4 dạng' : typeLabels[selectedType as TeacherQuestion['questionType']] || selectedType})
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowGuide(!showGuide)}
          >
            <HelpCircle size={18} /> {showGuide ? 'Ẩn hướng dẫn cú pháp' : 'Xem cú pháp .txt mẫu'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setShowRawText(!showRawText)}
          >
            {showRawText ? 'Ẩn ô văn bản thô' : 'Mở ô chỉnh văn bản thô'}
          </button>
        </div>

        {showGuide && (
          <div className="syntax-guide-box" onClick={e => e.stopPropagation()}>
            <div className="syntax-guide-title">
              <Sparkles size={16} /> Hướng dẫn cú pháp file .txt chuẩn cho từng dạng câu hỏi:
            </div>
            <div className="syntax-guide-list">
              <div>
                <strong>1. Điền từ (FILL_BLANK):</strong> Viết <code>{'She _____ (go) to school. | goes'}</code> hoặc viết gọn nhúng đáp án <code>{'She [goes] to school.'}</code> (hệ thống tự đổi thành chỗ trống và lấy đáp án "goes"), hoặc dùng dòng <code>{'Đáp án: goes'}</code>.
              </div>
              <div>
                <strong>2. Sửa lỗi sai (ERROR_CORRECTION):</strong> Viết <code>{'She go to school. | go -> goes'}</code> hoặc dùng dòng <code>{'Đáp án: go -> went'}</code> hoặc <code>{'Sửa thành: goes'}</code>.
              </div>
              <div>
                <strong>3. Viết lại câu (REWRITE):</strong> Viết câu gốc, có thể thêm gợi ý <code>{'Gợi ý: It has _____'}</code> và dòng <code>{'Đáp án: It has been raining...'}</code>, hoặc viết ngắn gọn dạng <code>{'Câu gốc => Câu viết lại'}</code>.
              </div>
              <div>
                <strong>4. Trắc nghiệm (MCQ):</strong> Đầy đủ 4 phương án <code>{'A. / B. / C. / D.'}</code>, đánh dấu <code>{'*B.'}</code> ở đáp án đúng hoặc thêm dòng <code>{'Đáp án: B'}</code>.
              </div>
              <div>
                <strong>5. Tiêu đề nhóm (tùy chọn):</strong> Bạn có thể phân chia các phần bằng <code>{'=== [ĐIỀN TỪ] ==='}</code>, <code>{'=== [SỬA LỖI] ==='}</code>, <code>{'=== [VIẾT LẠI CÂU] ==='}</code>, <code>{'=== [TRẮC NGHIỆM] ==='}</code>.
              </div>
            </div>
          </div>
        )}

        {showRawText && (
          <div className="raw-textarea-wrap" onClick={e => e.stopPropagation()}>
            <label>Nội dung văn bản thô (có thể chỉnh sửa trực tiếp rồi bấm Phân tích lại):</label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Dán nội dung câu hỏi định dạng văn bản .txt tại đây..."
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => processText(rawText)}
              >
                Phân tích lại văn bản
              </button>
              {rawText && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setRawText('')
                    setQuestions([])
                  }}
                >
                  Xóa dữ liệu nhập
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {parseError && (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          <AlertCircle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
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
            {lessonId > 0 && !hasErrors && (
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={handleSave}
              >
                <CheckCircle2 size={18} /> Lưu toàn bộ {questions.length} câu vào bài học
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
                        <span className="badge-auto" title="Hệ thống đã tự tạo câu giải thích theo đáp án">
                          ✨ Đã tự điền giải thích
                        </span>
                      )}
                      {q.autoCompletedFields.includes('acceptedAnswer') && (
                        <span className="badge-auto" title="Hệ thống đã tự bóc tách đáp án mẫu từ nội dung trong ngoặc vuông []">
                          🎯 Tự bóc tách đáp án
                        </span>
                      )}
                      {q.autoCompletedFields.includes('correctOption') && (
                        <span className="badge-auto" title="Hệ thống đã tự nhận diện đáp án đúng từ dấu sao hoặc nội dung so khớp">
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
                        onChange={e => handleQuestionFieldChange(idx, { prompt: e.target.value })}
                        placeholder="Nhập nội dung đề bài..."
                      />
                    </label>

                    {!commonCurriculumMode && (
                      <label>
                        Dạng câu hỏi
                        <select
                          value={q.questionType}
                          onChange={e =>
                            handleQuestionFieldChange(idx, {
                              questionType: e.target.value as ParsedQuestionDraft['questionType']
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
                            onChange={e =>
                              handleQuestionFieldChange(idx, {
                                correctOption: e.target.value as ParsedQuestionDraft['correctOption']
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

                        {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((optKey, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx)
                          const isCorrect = q.correctOption === letter
                          return (
                            <label key={optKey}>
                              Phương án {letter} {isCorrect ? '(Đáp án đúng ⭐)' : ''}
                              <input
                                required
                                maxLength={255}
                                value={q[optKey]}
                                onChange={e => handleQuestionFieldChange(idx, { [optKey]: e.target.value })}
                                style={isCorrect ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)' } : undefined}
                              />
                            </label>
                          )
                        })}
                      </>
                    ) : (
                      <label className="full-span">
                        Đáp án mẫu để chấm tự động
                        <input
                          required
                          maxLength={255}
                          value={q.acceptedAnswer}
                          onChange={e => handleQuestionFieldChange(idx, { acceptedAnswer: e.target.value })}
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
                        onChange={e => handleQuestionFieldChange(idx, { explanation: e.target.value })}
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
              <strong>Sẵn sàng lưu {validQuestionsCount}/{questions.length} câu hỏi</strong>
              <span>
                {!lessonId
                  ? 'Vui lòng chọn Bài học ở trên để hoàn tất việc lưu.'
                  : hasErrors
                  ? 'Vui lòng bổ sung các ô còn thiếu trước khi lưu.'
                  : `Tất cả câu hỏi đã hoàn thiện hợp lệ và sẽ được thêm vào kho câu hỏi.`}
              </span>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={busy || !lessonId || questions.length === 0 || hasErrors}
              onClick={handleSave}
              style={{ minWidth: 220 }}
            >
              <PlusCircle size={18} /> Lưu toàn bộ {questions.length} câu hỏi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
