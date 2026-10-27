import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const sockets = new Map(),
  answers = new Map(),
  actions = [],
  errors = [],
  examRest = []
let exam = null,
  revision = 1
const learners = [
  { id: 2, username: 'alice', displayName: 'Alice' },
  { id: 3, username: 'bob', displayName: 'Bob' },
]
function view(user) {
  const base = { ...structuredClone(exam), revision, owner: user.id === 1 }
  if (user.id === 1)
    base.ranking = learners
      .map((u) => ({
        userId: u.id,
        username: u.username,
        displayName: u.displayName,
        correctCount:
          answers.get(u.id)?.[exam.questions[0].id] === exam.questions[0].correct ? 1 : 0,
        answeredCount: answers.has(u.id) ? 1 : 0,
        status: answers.has(u.id) ? 'WORKING' : 'NOT_STARTED',
      }))
      .sort((a, b) => b.correctCount - a.correctCount)
  else {
    base.questions.forEach((q) => delete q.correct)
    base.answers = answers.get(user.id) || {}
    base.submitted = false
  }
  return base
}
function broadcast() {
  for (const { ws, user } of sockets.values())
    ws.send(JSON.stringify({ action: 'EXAM_UPDATE', payload: view(user) }))
}
async function pageFor(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('exam')) examRest.push(path)
    let data = []
    if (path.endsWith('/auth/me')) data = { ...user, totalXp: 0, level: 1, xpInLevel: 0 }
    else if (path.endsWith('/classes/1'))
      data = {
        id: 1,
        name: 'English live class',
        joinCode: 'LIVE123',
        teacherId: 1,
        teacherName: 'Teacher',
        members: learners.map((u) => ({ ...u, role: 'LEARNER' })),
        assignments: [],
      }
    return route.fulfill({ json: data })
  })
  await page.routeWebSocket('**/api/ws-system', (ws) => {
    sockets.set(user.id, { ws, user })
    ws.onMessage((raw) => {
      const m = JSON.parse(raw)
      actions.push(m.action)
      let payload = {},
        action = 'EXAM_DATA'
      switch (m.action) {
        case 'AUTH':
        case 'CLIENT_INTERACTION':
          return
        case 'CLIENT_ACTIVITY':
          action = 'ACTIVITY_UPDATED'
          break
        case 'CLASS_OPEN':
          action = 'CLASS_SNAPSHOT'
          payload = {
            classroom: {
              id: 1,
              name: 'English live class',
              joinCode: 'LIVE123',
              teacherId: 1,
              teacherName: 'Teacher',
              members: learners.map((u) => ({ ...u, role: 'LEARNER' })),
              assignments: [],
            },
            messages: [],
          }
          break
        case 'CLASS_LESSONS':
          action = 'CLASS_DATA'
          payload = []
          break
        case 'CLASS_UNWATCH':
          action = 'CLASS_DATA'
          break
        case 'EXAM_LIST':
          payload = exam ? [exam] : []
          break
        case 'EXAM_CREATE':
          exam = { ...m.payload, id: 7, version: 1, revision: ++revision }
          payload = view(user)
          break
        case 'EXAM_OPEN':
        case 'EXAM_SYNC':
          payload = view(user)
          break
        case 'EXAM_ANSWER':
          answers.set(user.id, {
            ...answers.get(user.id),
            [m.payload.questionId]: m.payload.option,
          })
          revision++
          payload = view(user)
          broadcast()
          break
        case 'EXAM_EDIT':
          exam = { ...exam, ...m.payload, version: exam.version + 1 }
          revision++
          payload = view(user)
          broadcast()
          break
      }
      if (m.requestId) ws.send(JSON.stringify({ action, payload, requestId: m.requestId }))
    })
  })
  await page.goto('http://localhost:5175/classes/1')
  await page.getByRole('heading', { name: 'Kiểm tra của lớp', exact: true }).waitFor()
  return page
}
try {
  const teacher = await pageFor({
    id: 1,
    username: 'teacher',
    displayName: 'Teacher',
    role: 'TEACHER',
  })
  await teacher.getByRole('button', { name: '+ Tạo kiểm tra', exact: true }).click()
  const editor = teacher.locator('.live-exam-editor')
  await editor.getByLabel('Tên kiểm tra', { exact: true }).fill('Grammar live test')
  await editor.getByLabel('Câu 1', { exact: true }).fill('Choose the original answer')
  for (const [i, label] of ['A', 'B', 'C', 'D'].entries())
    await editor.getByLabel(`Lựa chọn ${label}`, { exact: true }).fill(`Answer ${i}`)
  await editor.getByRole('button', { name: 'Lưu và đồng bộ', exact: true }).click()
  await teacher.getByRole('columnheader', { name: 'Điểm /10', exact: true }).waitFor()
  const alice = await pageFor({ ...learners[0], role: 'LEARNER' }),
    bob = await pageFor({ ...learners[1], role: 'LEARNER' })
  for (const page of [alice, bob])
    await page
      .locator('.live-exam-list')
      .getByRole('button', { name: /Grammar live test/ })
      .click()
  await Promise.all([
    alice.getByRole('radio', { name: 'A. Answer 0', exact: true }).check(),
    bob.getByRole('radio', { name: 'B. Answer 1', exact: true }).check(),
  ])
  await teacher.waitForFunction(() =>
    document.querySelector('.live-exam tbody tr')?.textContent.includes('Alice'),
  )
  await teacher.getByRole('button', { name: 'Sửa đề / Đáp án', exact: true }).click()
  await editor.locator('textarea').first().fill('Teacher edited this question live')
  await editor.getByLabel('Đáp án đúng', { exact: true }).selectOption('1')
  await editor.getByRole('button', { name: 'Lưu và đồng bộ', exact: true }).click()
  for (const page of [alice, bob]) {
    await page.getByText('1. Teacher edited this question live', { exact: true }).waitFor()
    await page.getByText(/Giáo viên vừa cập nhật đề/).waitFor()
  }
  await teacher.waitForFunction(() =>
    document.querySelector('.live-exam tbody tr')?.textContent.includes('Bob'),
  )
  assert.equal(
    await alice.getByRole('radio', { name: 'A. Answer 0', exact: true }).isChecked(),
    true,
  )
  assert.equal(await bob.getByRole('radio', { name: 'B. Answer 1', exact: true }).isChecked(), true)
  await alice.waitForTimeout(5100)
  assert.ok(
    actions.includes('EXAM_SYNC'),
    'Students periodically synchronize through the shared socket',
  )
  assert.equal(examRest.length, 0)
  assert.deepEqual(errors, [])
  await mkdir('artifacts/role-views', { recursive: true })
  await teacher.screenshot({ path: 'artifacts/role-views/live-exam-teacher.png', fullPage: true })
  await alice.setViewportSize({ width: 390, height: 844 })
  await alice.screenshot({
    path: 'artifacts/role-views/live-exam-student-mobile.png',
    fullPage: true,
  })
  console.log(
    'PASS: teacher creates exam; two students answer; ranking updates; live edits preserve selections without reload; no exam REST calls',
  )
  console.log([...new Set(actions)].join(', '))
} finally {
  await browser.close()
}
