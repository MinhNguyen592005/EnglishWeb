import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
const page = await context.newPage(),
  errors = [],
  forbidden = []
page.on('pageerror', (e) => errors.push(e.message))
const profile = {
  id: 80,
  username: 'student',
  displayName: 'Minh Anh',
  role: 'LEARNER',
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
}
const due = new Date(Date.now() + 86400000).toISOString()
const classroom = {
  id: 90,
  name: 'English 10A',
  teacherId: 1,
  teacherName: 'Teacher',
  joinCode: 'CLASS90',
  members: [profile],
  assignments: [
    {
      id: 301,
      title: 'Unit 1',
      lessonTitle: 'Present simple',
      instructions: 'Complete all questions.',
      passPercent: 80,
      dueAt: due,
      status: 'PUBLISHED',
      lessonId: null,
    },
    {
      id: 302,
      title: 'Closed homework',
      lessonTitle: 'Unit 2',
      instructions: '',
      passPercent: 80,
      dueAt: due,
      status: 'CLOSED',
      lessonId: null,
    },
    {
      id: 303,
      title: 'Submitted homework',
      lessonTitle: 'Unit 3',
      instructions: '',
      passPercent: 80,
      dueAt: due,
      status: 'PUBLISHED',
      lessonId: null,
    },
  ],
}
let startCount = 0
const results = [
  {
    assignmentId: 303,
    userId: 80,
    displayName: 'Minh Anh',
    attemptId: 500,
    status: 'WON',
    correctCount: 7,
    totalQuestions: 10,
    completedAt: new Date().toISOString(),
    passed: false,
    submitDeadlineAt: due,
  },
]
let attempt = {
  id: 501,
  kind: 'PRACTICE',
  classId: 90,
  status: 'IN_PROGRESS',
  lessonId: null,
  totalQuestions: 2,
  requiredCorrect: 2,
  correctCount: 0,
  bossHp: 0,
  awardedXp: 0,
  questions: [
    {
      ordinalNo: 1,
      questionType: 'MCQ',
      prompt: 'She ___ coffee.',
      options: ['likes', 'like', 'liked', 'liking'],
      answer: null,
      correct: null,
      correctOption: null,
      explanation: null,
    },
    {
      ordinalNo: 2,
      questionType: 'MCQ',
      prompt: 'They ___ students.',
      options: ['are', 'is', 'was', 'am'],
      answer: null,
      correct: null,
      correctOption: null,
      explanation: null,
    },
  ],
}
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  const json = (data) => route.fulfill({ json: data })
  if (path.endsWith('/auth/me')) return json(profile)
  if (path.endsWith('/auth/csrf')) return json({ token: 'fixture-csrf' })
  if (path === '/api/v1/classes/90') return json(classroom)
  if (path === '/api/v1/classes/90/my-results') return json(results)
  if (path === '/api/v1/classes/90/assignments/301/start') {
    startCount++
    assert.equal(route.request().method(), 'POST')
    if (!results.find((r) => r.assignmentId === 301))
      results.push({
        assignmentId: 301,
        userId: 80,
        attemptId: 501,
        status: 'IN_PROGRESS',
        correctCount: 0,
        totalQuestions: 2,
        submitDeadlineAt: new Date(Date.now() + 900000).toISOString(),
        passed: false,
      })
    return json(attempt)
  }
  if (path.endsWith('/daily-quests'))
    return json({ quests: [], milestone: {}, streak: { currentStreak: 0 } })
  forbidden.push(path)
  return route.fulfill({
    status: 403,
    json: { message: 'Teacher-only endpoint must not be called' },
  })
})
await context.routeWebSocket('**/api/ws-system', (socket) =>
  socket.onMessage((raw) => {
    const m = JSON.parse(String(raw))
    if (!m.requestId) return
    let action = 'ACTIVITY_UPDATED',
      data = {}
    if (m.action === 'GET_ATTEMPT') {
      action = 'ATTEMPT_DATA'
      data = attempt
    }
    if (m.action === 'ACCOUNT_GET') {
      action = 'ACCOUNT_DATA'
      data = profile
    }
    if (m.action === 'SUBMIT_ANSWER') {
      action = 'ANSWER_RESULT'
      const q = attempt.questions.find((q) => q.ordinalNo === m.payload.ordinalNo)
      q.answer = m.payload.option
      q.correct = true
      q.correctOption = 'A'
      q.explanation = 'Correct answer.'
      attempt.correctCount = attempt.questions.filter((q) => q.answer).length
      const finished = attempt.correctCount === 2
      if (finished) {
        attempt.status = 'WON'
        Object.assign(
          results.find((r) => r.assignmentId === 301),
          { status: 'WON', correctCount: 2, completedAt: new Date().toISOString(), passed: true },
        )
      }
      data = {
        ordinalNo: q.ordinalNo,
        correct: true,
        correctOption: 'A',
        explanation: q.explanation,
        correctCount: attempt.correctCount,
        bossHp: 0,
        finished,
        won: finished,
        awardedXp: 0,
      }
    }
    if (m.action === 'EXAM_LIST') {
      action = 'EXAM_DATA'
      data = []
    }
    socket.send(JSON.stringify({ action, requestId: m.requestId, payload: data }))
  }),
)
try {
  await mkdir('artifacts/learner-classroom', { recursive: true })
  await page.goto('http://localhost:5173/classes/90?view=grades')
  await expect(page.locator('.learner-work-item')).toHaveCount(3)
  await expect(page.locator('.class-table')).toHaveCount(0)
  await expect(page.locator('.class-material-composer')).toHaveCount(0)
  await expect(page.locator('.class-tabs button')).toHaveCount(4)
  await expect(page.locator('.learner-work-result')).toContainText('7/10')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/learner-classroom/grades.png', fullPage: true })
  await page.locator('.class-tabs button').first().click()
  const unit = page
    .locator('.learner-work-item')
    .filter({ has: page.getByRole('heading', { name: 'Unit 1', exact: true }) })
  await unit.locator('button').click()
  await expect(page).toHaveURL(/attempts\/501$/)
  await expect(page.locator('.breadcrumb a')).toHaveAttribute(
    'href',
    '/classes/90?view=assignments',
  )
  await expect(page.locator('.boss-panel')).toHaveCount(0)
  for (let i = 0; i < 2; i++) {
    await page.locator('input[name=answer]').first().check()
    await page.locator('.question-actions button').click()
    await expect(page.locator('.feedback')).toBeVisible()
    await page.locator('.question-actions button').click()
  }
  await expect(page).toHaveURL(/attempts\/501\/result$/)
  await expect(page.locator('.result-stats > div')).toHaveCount(1)
  await expect(page.locator('.result-actions a')).toHaveAttribute(
    'href',
    '/classes/90?view=assignments',
  )
  await page.reload()
  await expect(page.locator('.result-stats > div')).toHaveCount(1)
  await expect(page.locator('.result-actions a')).toHaveAttribute(
    'href',
    '/classes/90?view=assignments',
  )
  await page.goto('http://localhost:5173/classes/90')
  await expect(page.locator('.learner-work-item')).toHaveCount(3)
  await expect(page.locator('.learner-work-result').first()).toContainText('2/2')
  assert.equal(startCount, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/learner-classroom/mobile.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  attempt = {
    ...attempt,
    id: 700,
    kind: 'LESSON_BOSS',
    classId: null,
    bossHp: 0,
    awardedXp: 50,
    status: 'WON',
  }
  await page.goto('http://localhost:5173/attempts/700/result')
  await expect(page.locator('.result-stats > div')).toHaveCount(3)
  await expect(page.locator('.result-actions a')).toHaveAttribute('href', '/roadmap')
  // A failed class attempt cannot open solutions, including after reloading its result URL.
  attempt = {
    ...attempt,
    id: 501,
    classId: 90,
    kind: 'PRACTICE',
    status: 'LOST',
    correctCount: 0,
    questions: attempt.questions.map((q) => ({
      ...q,
      correct: false,
      correctOption: null,
      explanation: null,
    })),
  }
  await page.goto('http://localhost:5173/attempts/501/result')
  await expect(page.locator('.result-actions button')).toBeDisabled()
  await expect(page.locator('.review-list')).toHaveCount(0)
  const submittedAt = new Date().toISOString()
  const first = {
    attemptId: 501,
    correctCount: 0,
    totalQuestions: 2,
    completedAt: submittedAt,
    eligible: true,
    passed: false,
  }
  const best = { ...first, attemptId: 502, correctCount: 2, passed: true }
  const latest = { ...first, attemptId: 503 }
  Object.assign(
    results.find((r) => r.assignmentId === 301),
    {
      ...latest,
      assignmentId: 301,
      passed: true,
      status: 'LOST',
      firstAttempt: first,
      bestAttempt: best,
      latestAttempt: latest,
      attemptCount: 3,
      completedCount: 3,
      firstPassedAt: submittedAt,
      history: [
        first,
        best,
        latest,
        { ...latest, attemptId: 504, completedAt: null, status: 'IN_PROGRESS' },
      ],
    },
  )
  await page.goto('http://localhost:5173/classes/90')
  const retained = page
    .locator('.learner-work-item')
    .filter({ has: page.getByRole('heading', { name: 'Unit 1', exact: true }) })
  await expect(retained.locator('.learner-work-state')).toHaveText('Đã đạt')
  await expect(retained.locator('.assignment-score-summary')).toContainText('2/2')
  await retained.locator('summary').click()
  await expect(retained.locator('.assignment-history li')).toHaveCount(3)
  await expect(retained.locator('.assignment-history a')).toHaveCount(3)
  // Once that learner has passed, older failed attempts may reveal solutions too.
  attempt.questions = attempt.questions.map((q) => ({
    ...q,
    correctOption: 'A',
    explanation: 'Unlocked solution',
  }))
  await page.goto('http://localhost:5173/attempts/501/result')
  await expect(page.locator('.result-actions button')).toBeEnabled()
  await page.locator('.result-actions button').click()
  await expect(page.locator('.review-list')).toContainText('Unlocked solution')
  assert.deepEqual(forbidden, [])
  assert.deepEqual(errors, [])
  console.log(
    'PASS: learner tabs and own results only; no teacher APIs/actions; start, answer, submit, results; mobile',
  )
} catch (error) {
  console.error({ errors, forbidden, page: await page.locator('body').innerText() })
  throw error
} finally {
  await browser.close()
}
