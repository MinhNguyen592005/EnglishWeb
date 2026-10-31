import { request } from './api'
import type { StudyContent } from '../pages/roadmap/types'

export type CourseQuestion = {
  id: string
  prompt: string
  options: string[]
  correctOption: string
  explanation: string
}
export type CourseLesson = {
  id: string
  title: string
  archived: boolean
  content: StudyContent
  questions: CourseQuestion[]
}
export type ModuleContent = {
  id: string
  levelId: number
  ordinalNo: number
  title: string
  archived: boolean
  lessons: CourseLesson[]
}
export type ModuleSummary = Omit<ModuleContent, 'lessons'> & {
  version: number
  lessonCount: number
}
export type DraftStatus = 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'PUBLISHED' | 'DISCARDED'
export type DraftSummary = {
  id: number
  moduleId: string
  authorId: number
  authorName: string
  version: number
  status: DraftStatus
  title: string
  updatedAt: string
}
export type CourseDraft = Omit<DraftSummary, 'title'> & {
  baseVersion: number
  payload: ModuleContent
  note: string
}
export type RelatedLesson = { id: string; title: string; moduleTitle: string }
export type CourseWorkspace = {
  levels: { id: number; title: string; outcome: string }[]
  modules: ModuleSummary[]
  drafts: DraftSummary[]
  lessons: RelatedLesson[]
}
export type ModuleVersion = { version: number; createdAt: string; authorName: string }
const base = '/study-management'
export const studyManagement = {
  workspace: () => request<CourseWorkspace>(base),
  module: (id: string) => request<ModuleContent>(`${base}/modules/${encodeURIComponent(id)}`),
  history: (id: string) =>
    request<ModuleVersion[]>(`${base}/modules/${encodeURIComponent(id)}/history`),
  create: (levelId: number, moduleId?: string, restoreVersion?: number) =>
    request<CourseDraft>(`${base}/drafts`, {
      method: 'POST',
      body: JSON.stringify({ levelId, moduleId, restoreVersion }),
    }),
  draft: (id: number) => request<CourseDraft>(`${base}/drafts/${id}`),
  save: (draft: CourseDraft, payload: ModuleContent) =>
    request<CourseDraft>(`${base}/drafts/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: draft.version, payload }),
    }),
  action: (draft: CourseDraft, action: string, note = '') =>
    request<CourseDraft>(`${base}/drafts/${draft.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: draft.version, note }),
    }),
  remove: (draft: CourseDraft) =>
    request<{ deleted: boolean }>(`${base}/drafts/${draft.id}/delete`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: draft.version }),
    }),
}
export const newCourseId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
export function blankLesson(): CourseLesson {
  return {
    id: newCourseId('b'),
    title: 'Bài học mới',
    archived: false,
    content: {
      objective: '',
      prerequisites: [],
      sections: [{ title: '', body: '' }],
      examples: [],
      mistakes: [],
      application: '',
      summary: '',
    },
    questions: [],
  }
}
