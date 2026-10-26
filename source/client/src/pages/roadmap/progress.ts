import type { StudyCourse, StudyHistoryEntry } from './types'

export function summarizeStudyProgress(course: StudyCourse) {
  const total = course.levels.reduce((n, level) => n + level.lessonCount, 0)
  const completed = course.levels.reduce((n, level) => n + level.completedCount, 0)
  const passedLevels = course.levels.filter(level => level.passed).length
  const nextLevel = course.levels.find(level => level.unlocked && !level.passed) || course.levels.at(-1)
  const nextModule = nextLevel?.modules.find(module => module.unlocked && (!module.passed || module.completedCount < module.lessonCount))
  const nextLesson = nextModule?.lessons.find(lesson => lesson.status !== 'COMPLETED')
  const params = new URLSearchParams()
  if (nextLevel) params.set('planet', `level-${nextLevel.id}`)
  if (nextModule) params.set('module', nextModule.id)
  if (nextLesson) params.set('lesson', nextLesson.id)
  return { total, completed, passedLevels, percent: total ? Math.round(completed / total * 100) : 0,
    nextLevel, nextModule, nextLesson, nextPath: params.size ? `/roadmap?${params}` : '/roadmap' }
}

export const studyKindName = { LESSON: 'Bài học', MODULE_REVIEW: 'Ôn tập module', MODULE_TEST: 'Kiểm tra module', LEVEL_REVIEW: 'Ôn tập level', LEVEL_TEST: 'Kiểm tra level' }
export const studyStatusName = { IN_PROGRESS: 'Đang làm', COMPLETED: 'Hoàn thành', PASSED: 'Đạt', FAILED: 'Chưa đạt' }
export function studyHistoryPath(entry: StudyHistoryEntry) {
  return `/roadmap?${new URLSearchParams({ planet: `level-${entry.levelId}`, ...(entry.kind.startsWith('MODULE_') ? { module: entry.referenceId } : {}), attempt: String(entry.id) })}`
}
