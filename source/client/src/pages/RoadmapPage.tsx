import type { Difficulty, Lesson } from '../types'
export { StudyRoadmap as Roadmap } from './roadmap/StudyRoadmap'

const topicDetails: Record<string, { title: string; description: string; outcome: string }> = {
  'basic-tenses': {
    title: 'Nền tảng các thì',
    description: 'Xác định thời điểm của hành động trước khi ghép câu dài hơn.',
    outcome: 'Dùng đúng thì hiện tại và quá khứ trong tình huống quen thuộc.',
  },
  conditionals: {
    title: 'Câu điều kiện',
    description: 'Từ quy luật có thật đến giả định về hiện tại và quá khứ.',
    outcome: 'Chọn đúng cấu trúc if theo khả năng xảy ra của sự việc.',
  },
  'passive-voice': {
    title: 'Câu bị động',
    description: 'Đổi trọng tâm câu và chọn đúng dạng be theo thì.',
    outcome: 'Viết câu bị động ở hiện tại, quá khứ, tương lai và hiện tại hoàn thành.',
  },
  'relative-clauses': {
    title: 'Mệnh đề quan hệ',
    description: 'Nối thông tin về người, vật, nơi chốn và thời gian.',
    outcome: 'Dùng đúng đại từ quan hệ và dấu phẩy trong câu phức.',
  },
}
const topicOrder = ['basic-tenses', 'conditionals', 'passive-voice', 'relative-clauses']
const difficulties: { value: Difficulty; label: string; note: string }[] = [
  { value: 'BEGINNER', label: 'Cơ bản', note: 'Nhận diện và dùng đúng cấu trúc' },
  { value: 'INTERMEDIATE', label: 'Trung cấp', note: 'Phân biệt các trường hợp gần nhau' },
  { value: 'ADVANCED', label: 'Nâng cao', note: 'Vận dụng trong câu phức và ngữ cảnh' },
]
export const difficultyName = (value: Difficulty) =>
  difficulties.find((item) => item.value === value)?.label || 'Cơ bản'
export const topicName = (slug: string) => topicDetails[slug]?.title || slug.replaceAll('-', ' ')
export const sortLessons = (lessons: Lesson[]) =>
  [...lessons].sort((a, b) => {
    const aOrder = topicOrder.indexOf(a.topicSlug),
      bOrder = topicOrder.indexOf(b.topicSlug)
    return (
      (a.topicSortOrder ?? (aOrder < 0 ? topicOrder.length : aOrder)) -
        (b.topicSortOrder ?? (bOrder < 0 ? topicOrder.length : bOrder)) ||
      a.topicSlug.localeCompare(b.topicSlug) ||
      a.ordinalNo - b.ordinalNo
    )
  })
