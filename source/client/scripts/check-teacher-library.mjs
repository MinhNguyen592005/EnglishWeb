// Deterministic FE contract checks. No real teacher content or classes are created.
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { SAMPLE_TXT_BY_TYPE } from '../src/services/questionTxtParser.ts'

const base = process.env.TEACHER_UI_BASE || 'http://127.0.0.1:5175'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
const page = await context.newPage()
const errors = [],
  assignments = [],
  exams = [],
  saved = []
page.on('pageerror', (e) => errors.push(e.message))
const profile = {
  id: 80,
  username: 'teacher_preview',
  displayName: 'Cô Minh Anh',
  role: 'TEACHER',
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
}
const classroom = {
  id: 90,
  name: 'Tiếng Anh 10A',
  joinCode: 'CLASS90',
  teacherId: 80,
  teacherName: 'Cô Minh Anh',
  memberCount: 24,
  members: [],
  assignments: [],
}
let materials = []
let detail
let failList = false
let failStatus = 503
let materialListCalls = 0
const due = new Date(Date.now() + 86400000)
const localDue = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 16)
await context.route('**/api/v1/**', async (route) => {
  const path = new URL(route.request().url()).pathname,
    method = route.request().method()
  const json = (data) => route.fulfill({ json: data })
  if (path === '/api/v1/auth/me') return json(profile)
  if (path === '/api/v1/notifications')
    return json({ items: [], unreadCount: 0, nextBeforeId: null })
  if (path === '/api/v1/auth/csrf') return json({ token: 'fixture-csrf' })
  if (path === '/api/v1/classes') return json([classroom])
  if (path === '/api/v1/classes/90') return json(classroom)
  if (path === '/api/v1/classes/90/overview')
    return json({
      classId: 90,
      totalStudents: 24,
      totalAssignments: assignments.length,
      activeAssignments: assignments.length,
      submittedAssignments: 0,
      submissionRate: 0,
      averageScore: null,
      passedRate: null,
      overdueAssignments: 0,
      upcomingAssignments: 0,
      lastActivityAt: null,
    })
  if (path === '/api/v1/teacher/materials' && method === 'GET') {
    materialListCalls++
    return failList
      ? route.fulfill({
          status: failStatus,
          json: {
            code: failStatus === 404 ? 'NOT_FOUND' : 'SERVER_ERROR',
            message:
              failStatus === 404 ? 'Không tìm thấy tài nguyên' : 'Không tải được kho thử nghiệm',
          },
        })
      : json(materials)
  }
  if (path === '/api/v1/teacher/materials' && method === 'POST') {
    const body = route.request().postDataJSON()
    saved.push(body)
    assert.equal(body.lessonId, undefined)
    detail = {
      id: 31,
      ...body,
      questionCount: body.questions.length,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: body.questions.map((question, i) => ({ ...question, id: 301 + i, active: true })),
    }
    materials = [detail]
    return json(detail)
  }
  if (path === '/api/v1/teacher/materials/31') return json(detail)
  if (path === '/api/v1/teacher/materials/31/archive') {
    detail = { ...detail, archived: route.request().postDataJSON().archived }
    materials = [detail]
    return json(detail)
  }
  if (path === '/api/v1/classes/90/assignments') {
    const body = route.request().postDataJSON()
    assignments.push(body)
    classroom.assignments.push({ id: 400, ...body, lessonTitle: detail.name, status: 'PUBLISHED' })
    return json({ id: 400, ...body })
  }
  if (path === '/api/v1/teacher/materials/31/live-exams') {
    exams.push(route.request().postDataJSON())
    return json({ examId: 500, classId: 90, questionsCount: detail.questionCount })
  }
  throw new Error(`Unexpected request (roadmap must not be requested): ${method} ${path}`)
})
await context.routeWebSocket('**/api/ws-system', (socket) =>
  socket.onMessage((raw) => {
    const message = JSON.parse(String(raw))
    if (message.action === 'EXAM_LIST')
      socket.send(
        JSON.stringify({ action: 'EXAM_DATA', requestId: message.requestId, payload: [] }),
      )
  }),
)
try {
  await mkdir('artifacts/teacher-library', { recursive: true })
  await page.goto(`${base}/teacher/questions`)
  await expect(
    page.getByRole('heading', { name: 'Chưa có nội dung để giao bài tập/kiểm tra' }),
  ).toBeVisible()
  await expect(page.locator('.tm-card')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/teacher-library/empty-library.png', fullPage: true })
  await page.goto(`${base}/classes/90?view=assignments`)
  await page.getByRole('button', { name: /Giao b\u00e0i t\u1eadp m\u1edbi/ }).click()
  await expect(
    page.getByText('Chưa có nội dung để giao bài tập/kiểm tra', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Bài học', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/teacher-library/empty-class.png', fullPage: true })
  await page.getByRole('link', { name: 'Tạo bộ bài đầu tiên' }).click()
  await expect(page.getByRole('heading', { name: 'Tạo bộ bài từ file .txt' })).toBeVisible()
  await expect(page.getByText('Bài học áp dụng cho bộ câu hỏi')).toHaveCount(0)
  await expect(
    page.getByRole('combobox', { name: 'Dạng câu hỏi mặc định khi nạp file' }),
  ).toHaveCount(0)
  // Format examples and the raw-text playground never populate or save the real import.
  await page.getByRole('button', { name: 'Xem mẫu định dạng .txt', exact: true }).click()
  let playground = page.getByRole('dialog', { name: 'Xem mẫu & thử phân tích' })
  await expect(playground.getByRole('button', { name: /Lưu/ })).toHaveCount(0)
  await playground.getByLabel('Dạng mẫu muốn xem').selectOption('REWRITE')
  await expect(playground.getByLabel('Nội dung mẫu định dạng hợp lệ')).toHaveValue(
    SAMPLE_TXT_BY_TYPE.REWRITE,
  )
  await playground.getByRole('button', { name: 'Thử văn bản của bạn' }).click()
  await playground.getByLabel('Văn bản muốn kiểm tra').fill(SAMPLE_TXT_BY_TYPE.ALL)
  await playground.getByRole('button', { name: 'Phân tích thử', exact: true }).click()
  await expect(playground.getByRole('status')).toContainText('6 khối · 6 câu hợp lệ')
  await expect(page.locator('.parsed-questions-list')).toHaveCount(0)
  assert.equal(saved.length, 0)
  await playground.getByRole('button', { name: 'Đóng công cụ', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lưu bộ bài', exact: true })).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({
    name: 'unit-1.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(SAMPLE_TXT_BY_TYPE.ALL),
  })
  await expect(page.locator('.parsed-questions-list')).toBeVisible()
  await page.getByRole('button', { name: 'Thử phân tích văn bản', exact: true }).click()
  playground = page.getByRole('dialog', { name: 'Xem mẫu & thử phân tích' })
  await playground
    .getByLabel('Văn bản muốn kiểm tra')
    .fill('This is an unrelated runtime log, not a question.')
  await playground.getByRole('button', { name: 'Phân tích thử', exact: true }).click()
  await expect(playground.getByRole('status')).toContainText('0 câu hợp lệ')
  await expect(playground.getByRole('button', { name: /Lưu/ })).toHaveCount(0)
  await playground.getByRole('button', { name: 'Đóng công cụ', exact: true }).click()
  await expect(page.locator('.parsed-question-card')).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Lưu bộ bài', exact: true }).first()).toBeDisabled()
  await expect(
    page.getByText('Chưa có tên bộ bài. Vui lòng nhập tên ở phía trên để lưu.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.batch-save-info strong')).toContainText('Câu hỏi hợp lệ:')
  await page.getByRole('button', { name: 'Nhập tên bộ bài', exact: true }).click()
  await expect(page.getByLabel('Tên bộ bài')).toBeFocused()
  await page.getByLabel('Tên bộ bài').fill('Ôn tập Unit 1')
  await expect(page.getByRole('button', { name: 'Lưu bộ bài', exact: true }).first()).toBeEnabled()
  await page.getByRole('button', { name: 'Lưu bộ bài', exact: true }).first().click()
  await expect(page.locator('.tm-card')).toHaveCount(1)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].name, 'Ôn tập Unit 1')
  assert.equal(saved[0].questions.length, 6)
  assert.deepEqual(
    [...new Set(saved[0].questions.map((question) => question.questionType))].sort(),
    ['ERROR_CORRECTION', 'FILL_BLANK', 'MCQ', 'REWRITE'],
  )
  await page.screenshot({ path: 'artifacts/teacher-library/desktop.png', fullPage: true })
  await expect(page.getByRole('button', { name: 'Giao bài tập', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tạo kiểm tra', exact: true })).toHaveCount(0)
  assert.equal(assignments.length, 0)
  assert.equal(exams.length, 0)
  const compactRow = await page.locator('.tm-card').boundingBox()
  assert.ok(compactRow.height < 180, 'Library rows should be compact on desktop')
  await page.goto(`${base}/classes/90?view=assignments`)
  await page.getByRole('button', { name: /Giao b\u00e0i t\u1eadp m\u1edbi/ }).click()
  const chooseMaterial = () => page.getByRole('radio', { name: /Ôn tập Unit 1/ })
  await expect(chooseMaterial()).toBeVisible()
  await chooseMaterial().check()
  await expect(page.getByLabel('Tên bài tập hiển thị trong lớp')).toHaveValue('Ôn tập Unit 1')
  // Library changes made in another tab become visible without leaving the classroom.
  await page.getByLabel('Tên bài tập hiển thị trong lớp').fill('My unsaved title')
  detail = { ...detail, updatedAt: new Date(Date.now() + 10000).toISOString() }
  materials = [detail, { ...detail, id: 32, name: 'Bộ mới từ tab khác', questionCount: 8 }]
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'grammarquest:teacher-materials-changed',
        newValue: 'updated',
      }),
    ),
  )
  await expect(page.getByRole('radio', { name: /Bộ mới từ tab khác/ })).toBeVisible()
  await expect(page.getByLabel('Tên bài tập hiển thị trong lớp')).toHaveValue('My unsaved title')
  const callsBeforeRefresh = materialListCalls
  await page.getByRole('button', { name: 'Tải lại dữ liệu', exact: true }).click()
  await expect(chooseMaterial()).toBeVisible()
  assert.ok(materialListCalls > callsBeforeRefresh, 'Classroom refresh must also reload materials')
  await page.getByLabel('Hạn nộp bài').fill(localDue)
  await page.screenshot({ path: 'artifacts/teacher-library/class-delivery.png', fullPage: true })
  await page.getByRole('button', { name: 'Giao bài cho lớp' }).click()
  await expect(page.locator('.success-banner')).toContainText('Đã giao bài tập cho lớp thành công.')
  assert.equal(assignments.length, 1)
  assert.equal(assignments[0].materialId, 31)
  assert.equal(assignments[0].title, 'My unsaved title')
  assert.equal(assignments[0].lessonId, undefined)
  await page.goto(`${base}/classes/90?view=exams`)
  await page.getByRole('button', { name: /T\u1ea1o ki\u1ec3m tra m\u1edbi/ }).click()
  await chooseMaterial().check()
  await expect(page.getByLabel('Tên bài kiểm tra')).toHaveValue('Ôn tập Unit 1')
  await page.getByLabel('Hạn làm bài').fill(localDue)
  await page.getByRole('button', { name: 'Tạo bài kiểm tra', exact: true }).click()
  await expect(page.locator('.success-banner')).toContainText(
    'Đã tạo bài kiểm tra cho lớp thành công.',
  )
  assert.equal(exams.length, 1)
  materials = [detail]
  await page.goto(`${base}/teacher/questions`)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.tm-card')).toHaveCount(1)
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Mobile library must not overflow',
  )
  await page.screenshot({ path: 'artifacts/teacher-library/mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Lưu trữ Ôn tập Unit 1' }).click()
  await expect(page.locator('.tm-card')).toHaveCount(0)
  await page.goto(`${base}/classes/90?view=assignments`)
  await page.getByRole('button', { name: /Giao b\u00e0i t\u1eadp m\u1edbi/ }).click()
  await expect(
    page.getByText('Chưa có nội dung để giao bài tập/kiểm tra', { exact: true }),
  ).toBeVisible()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Mobile classroom must not overflow',
  )
  failList = true
  await page.goto(`${base}/teacher/questions`)
  await expect(page.getByRole('alert')).toContainText('Không tải được kho thử nghiệm')
  await expect(page.locator('.tm-empty .material-spin')).toHaveCount(0)
  // The classroom overview must work even if the optional material library is unavailable.
  const callsBeforeOverview = materialListCalls
  await page.goto(`${base}/classes/90?view=overview`)
  await expect(page.getByRole('heading', { name: 'Tiếng Anh 10A', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  assert.equal(materialListCalls, callsBeforeOverview)
  await page.goto(`${base}/classes/90?view=assignments`)
  await page.getByRole('button', { name: /Giao b\u00e0i t\u1eadp m\u1edbi/ }).click()
  await expect(page.getByText('Chưa tải được nội dung để giao bài', { exact: true })).toBeVisible()
  await expect(page.locator('.class-workspace > .error-banner')).toHaveCount(0)
  failStatus = 404
  await page.goto(`${base}/teacher/questions`)
  await expect(page.getByRole('alert')).toContainText('Kho học liệu chưa sẵn sàng trên máy chủ')
  await expect(page.locator('.tm-empty .material-spin')).toHaveCount(0)
  failList = false
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: library/class workflows, desktop/mobile, 404 and 503 recovery, stopped error spinner, overview isolated from library errors.',
  )
} finally {
  await context.close()
  await browser.close()
}
