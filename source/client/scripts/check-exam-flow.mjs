import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = [],
  submissions = [],
  edits = []
const questions = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i + 1}`,
  questionType: i === 1 || i === 11 ? 'FILL_BLANK' : 'MCQ',
  options: i === 1 || i === 11 ? [] : ['A', 'B', 'C', 'D'],
  ...(i === 1 || i === 11 ? { acceptedAnswer: 'since' } : { correct: 1 }),
}))
async function fixture(owner) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  let exam = {
    id: 500,
    classId: 90,
    title: 'Mixed exam',
    version: 1,
    revision: 1,
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    closed: false,
    owner,
    questions: questions.map((q) => {
      if (owner) return { ...q }
      const { correct, acceptedAnswer, ...safe } = q
      return safe
    }),
    answers: {},
    submitted: false,
    ...(owner
      ? {
          ranking: Array.from({ length: 23 }, (_, i) => ({
            userId: i + 100,
            username: `student${i}`,
            displayName: `Student ${i + 1}`,
            correctCount: 0,
            answeredCount: 0,
            status: 'NOT_STARTED',
          })),
        }
      : {}),
  }
  const profile = {
    id: owner ? 1 : 80,
    username: owner ? 'teacher' : 'student',
    displayName: owner ? 'Teacher' : 'Minh Anh',
    role: owner ? 'TEACHER' : 'LEARNER',
    totalXp: 0,
    level: 1,
    xpInLevel: 0,
  }
  await context.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/results'))
      return route.fulfill({
        json: Array.from({ length: 24 }, (_, i) => ({
          userId: i + 100,
          displayName: `Student ${i + 1}`,
          status: i === 23 ? 'IN_PROGRESS' : 'WON',
          correctCount: 8,
          totalQuestions: 10,
          passed: true,
          completedAt: i === 23 ? null : new Date().toISOString(),
          completedCount: i === 23 ? 0 : 2,
          attemptCount: i === 23 ? 1 : 3,
          latestAttempt: { status: 'IN_PROGRESS', completedAt: null },
        })),
      })
    const data = path.endsWith('/auth/me')
      ? profile
      : path.endsWith('/classes/90')
        ? {
            id: 90,
            name: 'English 10A',
            teacherId: 1,
            teacherName: 'Teacher',
            joinCode: 'CLASS90',
            members: [],
            assignments: owner
              ? Array.from({ length: 23 }, (_, i) => ({
                  id: i + 1,
                  title: `Homework ${i + 1}`,
                  instructions: '',
                  lessonTitle: 'Unit',
                  dueAt: exam.endsAt,
                  status: 'PUBLISHED',
                  passPercent: 80,
                }))
              : [],
          }
        : path.endsWith('/materials') || path.endsWith('/my-results')
          ? []
          : path.endsWith('/daily-quests')
            ? { quests: [], milestone: {}, streak: { currentStreak: 0 } }
            : {}
    return route.fulfill({ json: data })
  })
  await context.routeWebSocket('**/api/ws-system', (socket) =>
    socket.onMessage(async (raw) => {
      const m = JSON.parse(String(raw))
      if (!m.requestId) return
      let data = {}
      if (m.action === 'EXAM_LIST')
        data = Array.from({ length: 12 }, (_, i) => ({
          id: 500 + i,
          title: `Exam ${i + 1}`,
          endsAt: exam.endsAt,
          closed: false,
        }))
      if (m.action === 'EXAM_OPEN' || m.action === 'EXAM_SYNC') data = exam
      if (m.action === 'EXAM_ANSWER') {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (m.payload.questionId === 'q11') {
          socket.send(
            JSON.stringify({
              action: 'ERROR',
              requestId: m.requestId,
              payload: { code: 'SAVE_FAILED', message: 'Temporary autosave failure' },
            }),
          )
          return
        }
        exam = {
          ...exam,
          revision: exam.revision + 1,
          answers: {
            ...exam.answers,
            [m.payload.questionId]: m.payload.answer ?? m.payload.option,
          },
        }
        data = exam
      }
      if (m.action === 'EXAM_SUBMIT') {
        submissions.push(m.payload)
        exam = { ...exam, revision: exam.revision + 1, answers: m.payload.answers, submitted: true }
        data = exam
      }
      if (m.action === 'EXAM_EDIT') {
        edits.push(m.payload)
        exam = { ...exam, ...m.payload, version: 2, revision: exam.revision + 1 }
        data = exam
      }
      socket.send(
        JSON.stringify({
          action: m.action.startsWith('EXAM_') ? 'EXAM_DATA' : 'ACTIVITY_UPDATED',
          requestId: m.requestId,
          payload: data,
        }),
      )
    }),
  )
  return {
    context,
    page,
    expire: () => {
      exam = { ...exam, endsAt: new Date(Date.now() - 1000).toISOString(), closed: true }
    },
  }
}
try {
  await mkdir('artifacts/exam-flow', { recursive: true })
  const learner = await fixture(false),
    page = learner.page
  await page.goto('http://localhost:5173/classes/90?view=exams')
  await expect(page.locator('.exam-list-card')).toHaveCount(10)
  await page.locator('.exam-list-card').first().click()
  await expect(page.locator('.live-exam-question')).toHaveCount(10)
  await page.locator('.live-exam-question').nth(0).getByRole('radio').nth(1).check()
  await page.locator('.live-exam-question').nth(1).getByRole('textbox').fill('since')
  await page.locator('.live-exam-body .list-pagination button').last().click()
  await expect(page.locator('.live-exam-question')).toHaveCount(2)
  await page.locator('.live-exam-question').nth(0).getByRole('radio').nth(2).check()
  await page.locator('.live-exam-question').nth(1).getByRole('textbox').fill('latest text')
  await page.locator('.live-exam-body > button.button.primary').click()
  await expect.poll(() => submissions.length).toBe(1)
  assert.deepEqual(submissions[0].answers, { q0: 1, q1: 'since', q10: 2, q11: 'latest text' })
  await expect(
    page.locator('.live-exam-question').first().getByRole('radio').first(),
  ).toBeDisabled()
  await expect(page.locator('.live-exam .error-banner')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/exam-flow/learner.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  learner.expire()
  await expect(page.locator('.live-exam-question')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('.exam-list-card').first()).toBeDisabled()
  await page.reload()
  await expect(page.locator('.exam-list-card').first()).toBeDisabled()
  await expect(page.locator('.live-exam-question')).toHaveCount(0)
  await learner.context.close()
  const teacher = await fixture(true),
    tp = teacher.page
  await tp.goto('http://localhost:5173/classes/90?view=exams')
  await tp.locator('.exam-list-card').first().click()
  await expect(tp.locator('.live-exam-body tbody tr')).toHaveCount(10)
  await tp.locator('.live-exam-body .list-pagination button').last().click()
  await expect(tp.locator('.live-exam-body tbody tr').first()).toContainText('Student 11')
  teacher.expire()
  await tp.reload()
  await expect(tp.locator('.exam-list-card').first()).toBeEnabled()
  await tp.locator('.exam-list-card').first().click()
  await expect(tp.locator('.live-exam-body tbody tr')).toHaveCount(10)
  await tp.locator('.live-exam-body .button-row button').first().click()
  await expect(tp.locator('.live-exam-editor .live-exam-question')).toHaveCount(10)
  await tp.locator('.live-exam-editor .list-pagination button').last().click()
  await expect(tp.locator('.live-exam-editor .live-exam-question')).toHaveCount(2)
  await tp.locator('.live-exam-editor textarea').first().fill('Edited question 11')
  await tp.locator('.live-exam-editor button:not([type])').last().click()
  await expect.poll(() => edits.length).toBe(1)
  assert.equal(edits[0].questions.length, 12)
  assert.equal(edits[0].questions[10].prompt, 'Edited question 11')
  assert.equal(edits[0].questions[0].prompt, 'Question 1')
  await tp.goto('http://localhost:5173/classes/90?view=assignments')
  await expect(tp.locator('.class-assignment-card')).toHaveCount(10)
  await tp.locator('.class-panel .list-pagination button').last().click()
  await expect(tp.locator('.class-assignment-card').first()).toContainText('Homework 11')
  await tp.goto('http://localhost:5173/classes/90?view=grades&assignmentId=1')
  const assignmentPicker = tp.getByRole('combobox', { name: 'Chọn bài tập', exact: true })
  await expect(assignmentPicker.locator('option')).toHaveCount(24)
  await expect(tp.locator('.grades-assignment-card')).toHaveCount(0)
  await assignmentPicker.selectOption('21')
  await expect(tp.locator('.class-grade-detail-heading')).toContainText('Homework 21')
  await assignmentPicker.selectOption('1')
  await tp.getByRole('tab', { name: /Đã có điểm/ }).click()
  await expect(assignmentPicker).toHaveValue('1')
  await expect(tp.locator('.class-table tbody tr')).toHaveCount(10)
  await expect(tp.locator('.class-table th')).toHaveText([
    'Học viên',
    'Số lượt nộp',
    'Điểm cao nhất',
    'Kết quả',
  ])
  await expect(tp.locator('.class-table tbody tr').first().locator('td')).toHaveText([
    'Student 1',
    '2 lượt',
    '8/10',
    'Đạt',
  ])
  await expect(tp.locator('.class-table .assignment-history')).toHaveCount(0)
  await expect(tp.locator('.class-grade-summary')).toContainText('23 học viên')
  await expect(tp.locator('.class-grade-summary')).not.toContainText('lượt nộp')
  await tp.locator('.class-table-wrap + .list-pagination button').last().click()
  await expect(tp.locator('.class-table tbody tr').first()).toContainText('Student 11')
  await tp.locator('.class-table-wrap + .list-pagination button').last().click()
  await expect(tp.locator('.class-table tbody tr')).toHaveCount(3)
  await expect(tp.locator('.class-table')).not.toContainText('Student 24')
  await assignmentPicker.selectOption('21')
  await expect(tp.locator('.class-table tbody tr').first()).toContainText('Student 1')
  await expect(tp.locator('.class-table-wrap + .list-pagination')).toContainText('Trang 1 / 3')
  await expect(tp.locator('.class-panel > .list-pagination')).toHaveCount(1)
  await tp.screenshot({ path: 'artifacts/exam-flow/grade-dropdown.png', fullPage: true })
  const downloading = tp.waitForEvent('download')
  await tp.getByRole('button', { name: 'Xuất CSV' }).click()
  const csvStream = await (await downloading).createReadStream()
  let csv = ''
  for await (const chunk of csvStream) csv += chunk.toString('utf8')
  assert.ok(csv.includes('"Số lượt nộp","Điểm cao nhất","Kết quả"'))
  assert.ok(csv.includes('"Student 1","2","8/10","Đạt"'))
  assert.ok(!csv.includes('Student 24'))
  await teacher.context.close()
  assert.deepEqual(errors, [])
  console.log(
    'PASS: 12 questions across pages; optimistic selection; failed text autosave still submitted atomically; teacher ranking and editor pagination',
  )
} finally {
  await browser.close()
}
