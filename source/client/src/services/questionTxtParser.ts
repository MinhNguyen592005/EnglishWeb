import type { TeacherQuestion } from '../types'

export interface ParsedQuestionDraft {
  prompt: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctOption: 'A' | 'B' | 'C' | 'D' | ''
  explanation: string
  questionType: 'MCQ' | 'FILL_BLANK' | 'ERROR_CORRECTION' | 'REWRITE'
  acceptedAnswer: string
  autoCompletedFields: string[]
  errors: string[]
}

export const SAMPLE_TXT_BY_TYPE: Record<'MCQ' | 'FILL_BLANK' | 'ERROR_CORRECTION' | 'REWRITE' | 'ALL', string> = {
  FILL_BLANK: `[ĐIỀN TỪ]
Câu 1: She _____ (go) to school by bus every day.
Đáp án: goes
Giải thích: Chủ ngữ "She" là ngôi thứ 3 số ít thì hiện tại đơn, động từ "go" thêm -es thành "goes".

Câu 2: They have lived in Hanoi _____ 2015. | since

Câu 3: Look! He [is playing] football in the yard.
Giải thích: Thì hiện tại tiếp diễn diễn tả hành động đang xảy ra (dấu hiệu "Look!").

Câu 4: I would travel around the world if I _____ (be) rich.
Đáp án mẫu: were
`,

  ERROR_CORRECTION: `[SỬA LỖI]
Câu 1: She go to school by bus yesterday morning.
Đáp án: go -> went
Giải thích: Dấu hiệu "yesterday morning" chỉ thì quá khứ đơn, nên động từ "go" phải sửa thành "went".

Câu 2: There is many interesting books on the shelf.
Sửa thành: is -> are
Giải thích: "many interesting books" là danh từ số nhiều nên phải dùng "There are".

Câu 3: He don't like drinking hot coffee in the morning. | don't -> doesn't

Câu 4: Tìm lỗi sai trong câu: She has bought this house since two years.
Đáp án: since -> for
`,

  REWRITE: `[VIẾT LẠI CÂU]
Câu 1: It started raining two hours ago.
Gợi ý: It has _____
Đáp án: It has been raining for two hours.
Giải thích: Chuyển đổi từ quá khứ đơn (started + V-ing) sang hiện tại hoàn thành tiếp diễn (has been + V-ing).

Câu 2: Because the traffic was heavy, we arrived at the meeting late.
Viết lại: Due to heavy traffic, we arrived at the meeting late.
Giải thích: Cấu trúc tương đương: Because + mệnh đề = Due to + cụm danh từ.

Câu 3: This is the first time I have ever eaten sushi.
=> I have never eaten sushi before.
Giải thích: Cấu trúc: This is the first time S + have/has + V3/ed = S + have/has never + V3/ed + before.
`,

  MCQ: `[TRẮC NGHIỆM]
Câu 1: She ___ to school every day.
A. go
*B. goes
C. going
D. gone
Giải thích: Chủ ngữ ngôi thứ 3 số ít ở thì hiện tại đơn đi với "goes".

Câu 2: They have lived in this city ___ 2010.
A. for
B. in
C. since
D. at
Đáp án: C
Giải thích: "since" đi với mốc thời gian trong thì hiện tại hoàn thành.

Câu 3: Which word has the underlined part pronounced differently?
A. watched    B. stopped    C. booked    *D. decided
`,

  ALL: `=== [ĐIỀN TỪ] ===
Câu 1: She _____ (study) English every night. | studies
Câu 2: They have been friends [since] childhood.

=== [SỬA LỖI] ===
Câu 3: She don't know the right answer. | don't -> doesn't
Câu 4: He bought three apple at the market yesterday.
Đáp án: apple -> apples

=== [VIẾT LẠI CÂU] ===
Câu 5: She is too young to drive a car.
Gợi ý: She is not old _____
Đáp án: She is not old enough to drive a car.
Giải thích: Cấu trúc: too + adj + to V = not + adj (trái nghĩa) + enough + to V.

=== [TRẮC NGHIỆM] ===
Câu 6: What time ___ the train leave tomorrow?
A. do    *B. does    C. is    D. has
Giải thích: Thì hiện tại đơn diễn tả lịch trình tàu xe, chủ ngữ số ít dùng "does".
`
}

export const SAMPLE_QUESTION_TXT = SAMPLE_TXT_BY_TYPE.ALL

function expandInlineOptions(lines: string[]): string[] {
  const result: string[] = []
  const optionRegex = /(?:^|\s+)(\*?\(?[A-Da-d]\)?\*?\s*[.):\]])\s+/g

  for (const line of lines) {
    const trimmed = line.trim()
    const matches = [...trimmed.matchAll(optionRegex)]
    if (matches.length > 1) {
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!
        const end = i + 1 < matches.length ? matches[i + 1].index! : trimmed.length
        const segment = trimmed.slice(start, end).trim()
        if (segment) result.push(segment)
      }
    } else {
      result.push(line)
    }
  }
  return result
}

function detectSectionHeader(line: string): TeacherQuestion['questionType'] | null {
  const norm = line.toLowerCase().trim()
  if (norm.includes('[điền từ]') || norm.includes('[dien tu]') || norm.includes('[fill_blank]') || norm.includes('dạng: điền từ') || norm.includes('type: fill_blank')) {
    return 'FILL_BLANK'
  }
  if (norm.includes('[sửa lỗi]') || norm.includes('[sua loi]') || norm.includes('[error_correction]') || norm.includes('dạng: sửa lỗi') || norm.includes('type: error_correction') || norm.includes('tìm lỗi sai')) {
    return 'ERROR_CORRECTION'
  }
  if (norm.includes('[viết lại câu]') || norm.includes('[viet lai cau]') || norm.includes('[rewrite]') || norm.includes('dạng: viết lại') || norm.includes('type: rewrite')) {
    return 'REWRITE'
  }
  if (norm.includes('[trắc nghiệm]') || norm.includes('[trac nghiem]') || norm.includes('[mcq]') || norm.includes('dạng: trắc nghiệm') || norm.includes('type: mcq')) {
    return 'MCQ'
  }
  return null
}

function cleanAnswerText(val: string): string {
  let cleaned = val.trim()
  // Strip outer quotes if any
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  // Strip trailing punctuation like . or ; for short answers, but keep for full sentences if not redundant
  if (cleaned.endsWith('.') && cleaned.split(/\s+/).length < 5) {
    cleaned = cleaned.slice(0, -1).trim()
  }
  return cleaned
}

export function validateParsedQuestion(q: ParsedQuestionDraft): string[] {
  const errors: string[] = []
  const trimmedPrompt = q.prompt.trim()
  if (!trimmedPrompt) {
    errors.push('Thiếu nội dung đề bài câu hỏi')
  } else if (trimmedPrompt.length > 500) {
    errors.push(`Đề bài vượt quá 500 ký tự (hiện có ${trimmedPrompt.length} ký tự)`)
  }

  if (q.questionType === 'MCQ') {
    if (!q.optionA.trim()) errors.push('Thiếu phương án A')
    if (!q.optionB.trim()) errors.push('Thiếu phương án B')
    if (!q.optionC.trim()) errors.push('Thiếu phương án C')
    if (!q.optionD.trim()) errors.push('Thiếu phương án D')
    if (!q.correctOption || !['A', 'B', 'C', 'D'].includes(q.correctOption)) {
      errors.push('Chưa xác định đáp án đúng (A/B/C/D)')
    }
  } else {
    const trimmedAns = q.acceptedAnswer.trim()
    if (!trimmedAns) {
      errors.push(`Thiếu đáp án mẫu cho dạng ${q.questionType === 'FILL_BLANK' ? 'Điền từ' : q.questionType === 'ERROR_CORRECTION' ? 'Sửa lỗi' : 'Viết lại câu'}`)
    } else if (trimmedAns.length > 255) {
      errors.push(`Đáp án mẫu vượt quá 255 ký tự (hiện có ${trimmedAns.length} ký tự)`)
    }
  }

  if (!q.explanation.trim()) {
    errors.push('Thiếu phần giải thích chi tiết')
  }

  return errors
}

interface BlockParseInput {
  blockText: string
  currentSectionType: TeacherQuestion['questionType'] | null
  defaultQuestionType: TeacherQuestion['questionType']
}

function parseBlock({ blockText, currentSectionType, defaultQuestionType }: BlockParseInput): ParsedQuestionDraft {
  const rawLines = blockText.split('\n').map(l => l.trim()).filter(Boolean)
  const lines = expandInlineOptions(rawLines)

  let prompt = ''
  let optionA = ''
  let optionB = ''
  let optionC = ''
  let optionD = ''
  let correctOption: 'A' | 'B' | 'C' | 'D' | '' = ''
  let explanation = ''
  let acceptedAnswer = ''
  const autoCompletedFields: string[] = []
  let detectedType: TeacherQuestion['questionType'] | null = currentSectionType

  const promptLines: string[] = []
  let inExplanation = false
  let hintLine = ''

  const isOptionLine = (line: string) =>
    /^\s*\*?\(?[A-Da-d]\)?\*?\s*[.):\]]\s+/i.test(line)

  const isAnswerLine = (line: string) =>
    /^(?:đáp án mẫu|đáp án đúng|đáp án|dap an mau|dap an|đa|da|answer|ans|key|sửa thành|sua thanh|viết lại câu|viết lại|rewrite)\s*[:.]?\s*/i.test(line)

  const isExplanationLine = (line: string) =>
    /^(?:giải thích|giai thich|lời giải|loi giai|gt|explanation|explain)\s*[:.]?\s*/i.test(line)

  const isHintLine = (line: string) =>
    /^(?:gợi ý|goi y|hint|bắt đầu bằng|bat dau bang|start with|dùng từ|dung tu)\s*[:.]?\s*/i.test(line)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for inline type tags like [ĐIỀN TỪ] or Dạng: Sửa lỗi
    const inlineType = detectSectionHeader(line)
    if (inlineType) {
      detectedType = inlineType
      // If the line only contains the header, skip it
      if (/^(=+\s*)?\[?[a-zA-ZÀ-ỹ\s_]+\]?(\s*=+)?$/i.test(line) || /^dạng:\s*[a-zA-ZÀ-ỹ\s_]+$/i.test(line)) {
        continue
      }
    }

    if (inExplanation) {
      explanation += (explanation ? ' ' : '') + line
      continue
    }

    if (isExplanationLine(line)) {
      inExplanation = true
      explanation = line.replace(/^(?:giải thích|giai thich|lời giải|loi giai|gt|explanation|explain)\s*[:.]?\s*/i, '').trim()
      continue
    }

    if (isHintLine(line)) {
      const hintContent = line.replace(/^(?:gợi ý|goi y|hint|bắt đầu bằng|bat dau bang|start with|dùng từ|dung tu)\s*[:.]?\s*/i, '').trim()
      if (hintContent) {
        hintLine = hintContent
      }
      continue
    }

    if (isAnswerLine(line)) {
      const ansVal = line.replace(/^(?:đáp án mẫu|đáp án đúng|đáp án|dap an mau|dap an|đa|da|answer|ans|key|sửa thành|sua thanh|viết lại câu|viết lại|rewrite)\s*[:.]?\s*/i, '').trim()
      const letterMatch = ansVal.match(/^[*(\[]?([A-Da-d])[*\])]?$/)
      if (letterMatch) {
        correctOption = letterMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D'
      } else {
        // Check if answer line has "wrong -> right" or "wrong => right"
        if (ansVal.includes('->') || ansVal.includes('=>') || ansVal.includes('→')) {
          const parts = ansVal.split(/(?:->|=>|→)/).map(s => s.trim())
          if (parts.length >= 2) {
            const wrongWord = cleanAnswerText(parts[0])
            const rightWord = cleanAnswerText(parts[1])
            acceptedAnswer = rightWord
            if (!detectedType) detectedType = 'ERROR_CORRECTION'
            if (!explanation) {
              explanation = `Lỗi sai: "${wrongWord}" -> Sửa thành: "${rightWord}".`
              autoCompletedFields.push('explanation')
            }
          } else {
            acceptedAnswer = cleanAnswerText(ansVal)
          }
        } else if (ansVal.includes('(sửa từ') || ansVal.includes('(sua tu')) {
          // e.g. "goes (sửa từ go)"
          const m = ansVal.match(/^(.*?)\s*\((?:sửa từ|sua tu)\s*(.*?)\)/i)
          if (m) {
            acceptedAnswer = cleanAnswerText(m[1])
            if (!detectedType) detectedType = 'ERROR_CORRECTION'
            if (!explanation) {
              explanation = `Lỗi sai: "${m[2].trim()}" -> Sửa thành: "${acceptedAnswer}".`
              autoCompletedFields.push('explanation')
            }
          } else {
            acceptedAnswer = cleanAnswerText(ansVal)
          }
        } else {
          acceptedAnswer = cleanAnswerText(ansVal)
        }
      }
      continue
    }

    if (isOptionLine(line)) {
      const optMatch = line.match(/^\s*(\*?)\(?([A-Da-d])\)?(\*?)\s*[.):\]]\s*(.*)$/i) ||
                       line.match(/^\s*(\*?)\[([A-Da-d])\](\*?)\s*[.):]?\s*(.*)$/i)
      if (optMatch) {
        const hasStar = optMatch[1] === '*' || optMatch[3] === '*' || /\*\s*$/.test(optMatch[4])
        const letter = optMatch[2].toUpperCase()
        const content = optMatch[4].replace(/\*\s*$/, '').trim()

        if (hasStar) {
          correctOption = letter as 'A' | 'B' | 'C' | 'D'
          if (!autoCompletedFields.includes('correctOption')) {
            autoCompletedFields.push('correctOption')
          }
        }

        if (letter === 'A') optionA = content
        else if (letter === 'B') optionB = content
        else if (letter === 'C') optionC = content
        else if (letter === 'D') optionD = content
        continue
      }
    }

    // Check if line contains inline pipe separator: "prompt | answer"
    if (line.includes('|') && !optionA && !optionB) {
      const pipeIdx = line.indexOf('|')
      const beforePipe = line.slice(0, pipeIdx).trim()
      const afterPipe = line.slice(pipeIdx + 1).trim()
      if (beforePipe) promptLines.push(beforePipe)
      if (afterPipe) {
        if (afterPipe.includes('->') || afterPipe.includes('=>') || afterPipe.includes('→')) {
          const parts = afterPipe.split(/(?:->|=>|→)/).map(s => s.trim())
          if (parts.length >= 2) {
            const wrongWord = cleanAnswerText(parts[0])
            const rightWord = cleanAnswerText(parts[1])
            acceptedAnswer = rightWord
            if (!detectedType) detectedType = 'ERROR_CORRECTION'
            if (!explanation) {
              explanation = `Lỗi sai: "${wrongWord}" -> Sửa thành: "${rightWord}".`
              autoCompletedFields.push('explanation')
            }
          } else {
            acceptedAnswer = cleanAnswerText(afterPipe)
          }
        } else {
          acceptedAnswer = cleanAnswerText(afterPipe)
        }
      }
      continue
    }

    if (!optionA && !optionB && !optionC && !optionD) {
      promptLines.push(line)
    }
  }

  // Combine and clean up prompt
  let rawPrompt = promptLines.join(' ')
  // Strip leading question number e.g. "Câu 1:", "1.", "Question 1:"
  rawPrompt = rawPrompt
    .replace(/^(?:câu|question|q|bài)\s*\d+[\s:.)]\s*/i, '')
    .replace(/^\d+[\s:.)]\s*/, '')
    .trim()

  // Strip leading section/type header tags from prompt if still present
  rawPrompt = rawPrompt
    .replace(/^\[(điền từ|dien tu|fill_blank|sửa lỗi|sua loi|error_correction|viết lại câu|viet lai cau|rewrite|trắc nghiệm|trac nghiem|mcq)\]\s*[:.-]?\s*/i, '')
    .replace(/^dạng:\s*[a-zA-ZÀ-ỹ\s_]+[:.-]?\s*/i, '')
    .trim()

  // Check for inline bracketed answer e.g. "She [goes] to school every day."
  if (!acceptedAnswer && rawPrompt.includes('[') && rawPrompt.includes(']')) {
    const bracketMatch = rawPrompt.match(/\[([^\]]+)\]/)
    if (bracketMatch) {
      const inside = bracketMatch[1].trim()
      // Only extract if it's not a single option letter like [A]
      if (!/^[A-Da-d]$/.test(inside) && !inside.includes('___')) {
        acceptedAnswer = cleanAnswerText(inside)
        rawPrompt = rawPrompt.replace(/\[([^\]]+)\]/, '_____')
        autoCompletedFields.push('acceptedAnswer')
        if (!detectedType) detectedType = 'FILL_BLANK'
      }
    }
  }

  // If there was a hint line in REWRITE, merge it into prompt
  if (hintLine) {
    if (!rawPrompt.toLowerCase().includes(hintLine.toLowerCase())) {
      rawPrompt += ` (Gợi ý: ${hintLine})`
    }
    if (!detectedType) detectedType = 'REWRITE'
  }

  // Check for inline rewrite indicator in prompt: e.g. "The weather was bad => Because..."
  if ((rawPrompt.includes('=>') || rawPrompt.includes('->') || rawPrompt.includes('→')) && !optionA && !optionB) {
    if (!detectedType) detectedType = 'REWRITE'
  }

  prompt = rawPrompt.trim()

  // If options exist, check if acceptedAnswer was an option text
  if (!correctOption && acceptedAnswer && (optionA || optionB || optionC || optionD)) {
    const normAns = acceptedAnswer.toLowerCase().trim()
    if (optionA && optionA.toLowerCase().trim() === normAns) {
      correctOption = 'A'
      if (!autoCompletedFields.includes('correctOption')) autoCompletedFields.push('correctOption')
    } else if (optionB && optionB.toLowerCase().trim() === normAns) {
      correctOption = 'B'
      if (!autoCompletedFields.includes('correctOption')) autoCompletedFields.push('correctOption')
    } else if (optionC && optionC.toLowerCase().trim() === normAns) {
      correctOption = 'C'
      if (!autoCompletedFields.includes('correctOption')) autoCompletedFields.push('correctOption')
    } else if (optionD && optionD.toLowerCase().trim() === normAns) {
      correctOption = 'D'
      if (!autoCompletedFields.includes('correctOption')) autoCompletedFields.push('correctOption')
    }
  }

  // Determine Question Type using priority rules
  let finalType: TeacherQuestion['questionType']

  if (optionA && optionB && optionC && optionD) {
    finalType = 'MCQ'
  } else if (detectedType) {
    finalType = detectedType
  } else {
    // Smart Heuristics
    const lowerPrompt = prompt.toLowerCase()
    const hasArrow = prompt.includes('=>') || prompt.includes('->') || prompt.includes('→') || prompt.includes('⟹')
    const hasRewriteKeywords = lowerPrompt.includes('viết lại') || lowerPrompt.includes('rewrite') || lowerPrompt.includes('start with') || lowerPrompt.includes('dùng từ')
    const hasErrorKeywords = lowerPrompt.includes('tìm lỗi') || lowerPrompt.includes('sửa lỗi') || lowerPrompt.includes('mistake') || lowerPrompt.includes('error')
    const hasBlank = prompt.includes('___') || prompt.includes('...') || prompt.includes('(   )') || /\([a-zA-Z\s]{1,15}\)/.test(prompt)

    if (hasArrow || hasRewriteKeywords || (acceptedAnswer.split(/\s+/).length >= 5 && !hasBlank)) {
      finalType = 'REWRITE'
      autoCompletedFields.push('questionType')
    } else if (hasErrorKeywords) {
      finalType = 'ERROR_CORRECTION'
      autoCompletedFields.push('questionType')
    } else if (hasBlank) {
      finalType = 'FILL_BLANK'
      autoCompletedFields.push('questionType')
    } else {
      finalType = defaultQuestionType
      autoCompletedFields.push('questionType')
    }
  }

  // Auto-complete explanation if missing
  if (!explanation.trim()) {
    if (finalType === 'MCQ' && correctOption) {
      const optText = correctOption === 'A' ? optionA : correctOption === 'B' ? optionB : correctOption === 'C' ? optionC : optionD
      explanation = `Đáp án đúng là ${correctOption}${optText ? ` (${optText})` : ''}.`
      autoCompletedFields.push('explanation')
    } else if (finalType === 'FILL_BLANK' && acceptedAnswer) {
      explanation = `Từ/cụm từ cần điền vào chỗ trống là: "${acceptedAnswer}".`
      autoCompletedFields.push('explanation')
    } else if (finalType === 'ERROR_CORRECTION' && acceptedAnswer) {
      explanation = `Phương án sửa lỗi chính xác là: "${acceptedAnswer}".`
      autoCompletedFields.push('explanation')
    } else if (finalType === 'REWRITE' && acceptedAnswer) {
      explanation = `Câu viết lại hoàn chỉnh là: "${acceptedAnswer}".`
      autoCompletedFields.push('explanation')
    }
  }

  const draft: ParsedQuestionDraft = {
    prompt,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    explanation,
    questionType: finalType,
    acceptedAnswer,
    autoCompletedFields,
    errors: []
  }

  draft.errors = validateParsedQuestion(draft)
  return draft
}

export function parseQuestionsFromTxt(
  rawText: string,
  defaultQuestionType: TeacherQuestion['questionType'] = 'FILL_BLANK'
): ParsedQuestionDraft[] {
  if (!rawText || !rawText.trim()) return []

  const normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  const lines = normalized.split('\n')
  const blocks: { text: string; sectionType: TeacherQuestion['questionType'] | null }[] = []

  let currentSectionType: TeacherQuestion['questionType'] | null = null
  let currentBlockLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Check if line is a section header like === [ĐIỀN TỪ] ===
    const sectionHeaderType = detectSectionHeader(trimmed)
    const isDedicatedHeaderLine = sectionHeaderType && (
      /^(=+\s*)?\[?[a-zA-ZÀ-ỹ\s_]+\]?(\s*=+)?$/i.test(trimmed) ||
      /^dạng:\s*[a-zA-ZÀ-ỹ\s_]+$/i.test(trimmed) ||
      /^#+\s*[a-zA-ZÀ-ỹ\s_]+$/i.test(trimmed)
    )

    if (isDedicatedHeaderLine) {
      if (currentBlockLines.some(l => l.trim())) {
        blocks.push({ text: currentBlockLines.join('\n').trim(), sectionType: currentSectionType })
        currentBlockLines = []
      }
      currentSectionType = sectionHeaderType
      continue
    }

    // Check if line starts a new question
    const isNewQuestionHeader =
      /^(?:câu|question|q|bài)\s*\d+[\s:.)]/i.test(trimmed) ||
      (/^\d+[\s:.)]\s+/i.test(trimmed) && !/^[A-Da-d][.)]/i.test(trimmed))

    if (isNewQuestionHeader && currentBlockLines.some(l => l.trim())) {
      blocks.push({ text: currentBlockLines.join('\n').trim(), sectionType: currentSectionType })
      currentBlockLines = [line]
    } else {
      currentBlockLines.push(line)
    }
  }

  if (currentBlockLines.some(l => l.trim())) {
    blocks.push({ text: currentBlockLines.join('\n').trim(), sectionType: currentSectionType })
  }

  // If no explicit question headers found, fallback to splitting by double newlines
  if (blocks.length <= 1 && normalized.includes('\n\n')) {
    const rawBlocks = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)
    return rawBlocks.map(b => {
      const sectionType = detectSectionHeader(b)
      return parseBlock({ blockText: b, currentSectionType: sectionType, defaultQuestionType })
    })
  }

  return blocks.map(b =>
    parseBlock({
      blockText: b.text,
      currentSectionType: b.sectionType,
      defaultQuestionType
    })
  )
}
