import { chromium } from 'playwright'
import { expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// Mocked browser checks complement NotificationIntegrationTest's real MySQL/HTTP/WebSocket checks.
const base = process.env.NOTIFICATION_UI_URL || 'http://127.0.0.1:5173'
await mkdir('artifacts', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = [],
  actions = [],
  requests = [],
  sockets = new Set()
const dueAt = new Date(Date.now() + 3600000).toISOString()
const profile = {
  id: 2,
  username: 'alice',
  displayName: 'Học sinh An',
  role: 'LEARNER',
  totalXp: 10,
  level: 1,
  xpInLevel: 10,
  placementEligible: false,
}
const assignments = Array.from({ length: 12 }, (_, index) => ({
  id: 12 - index,
  title: `Bài tập ${12 - index}`,
  instructions: 'Hoàn thành các câu hỏi trước hạn.',
  passPercent: 80,
  dueAt,
  status: 'PUBLISHED',
}))
const classroom = {
  id: 1,
  name: 'Tiếng Anh 10A',
  teacherId: 1,
  teacherName: 'Cô Mai',
  joinCode: 'ABC123',
  members: [{ ...profile }],
  assignments,
}
const exam = {
  id: 7,
  classId: 1,
  title: 'Kiểm tra thì hiện tại',
  endsAt: dueAt,
  closed: false,
  version: 1,
  revision: 1,
  owner: false,
  questions: [{ id: 'q1', prompt: 'Choose A', options: ['A', 'B', 'C', 'D'] }],
  answers: {},
  submitted: false,
}
const notification = (id, extra) => ({
  id,
  kind: 'ADMIN_ACTION',
  title: 'Lời nhắc từ quản trị viên',
  message: 'Bạn nhớ tuân thủ nội quy và tiếp tục học nhé!',
  createdAt: new Date().toISOString(),
  readAt: null,
  classId: null,
  assignmentId: null,
  examId: null,
  className: null,
  teacherName: null,
  workTitle: null,
  dueAt: null,
  available: true,
  ...extra,
})
let items = [
  notification(3, {
    kind: 'ASSIGNMENT',
    title: 'Bạn có bài tập mới',
    classId: 1,
    assignmentId: 1,
    className: classroom.name,
    teacherName: classroom.teacherName,
    workTitle: 'Bài tập 1',
    dueAt,
  }),
  notification(2, {
    kind: 'LIVE_EXAM',
    title: 'Bạn có bài kiểm tra trực tiếp',
    classId: 1,
    examId: 7,
    className: classroom.name,
    teacherName: classroom.teacherName,
    workTitle: exam.title,
    dueAt,
  }),
  notification(1, {}),
]
const broadcast = () => {
  for (const socket of sockets)
    socket.send(JSON.stringify({ action: 'NOTIFICATIONS_CHANGED', payload: { refresh: true } }))
}

async function prepare(context) {
  await context.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    requests.push(`${request.method()} ${path}`)
    let data = []
    if (path.endsWith('/auth/me')) data = profile
    else if (path.endsWith('/auth/csrf')) data = { token: 'test-csrf' }
    else if (path === '/api/v1/notifications')
      data = { items, unreadCount: items.filter((item) => !item.readAt).length, nextBeforeId: null }
    else if (path.endsWith('/notifications/read-all')) {
      items = items.map((item) => ({ ...item, readAt: new Date().toISOString() }))
      data = { ok: true }
      broadcast()
    } else if (/\/notifications\/\d+\/read$/.test(path)) {
      const id = Number(path.split('/').at(-2))
      items = items.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      )
      data = items.find((item) => item.id === id)
      broadcast()
    } else if (path === '/api/v1/classes/1') data = classroom
    else if (path === '/api/v1/classes') data = [{ ...classroom, memberCount: 1 }]
    else if (path === '/api/v1/daily-quests')
      data = { quests: [], streak: { currentStreak: 0 }, milestone: {} }
    return route.fulfill({ json: data })
  })
  await context.routeWebSocket('**/api/ws-system', (ws) => {
    sockets.add(ws)
    ws.onClose(() => sockets.delete(ws))
    ws.onMessage((raw) => {
      const message = JSON.parse(raw)
      actions.push(message.action)
      let action = 'CLASS_DATA',
        payload = {}
      if (message.action === 'CLASS_LIST') {
        action = 'CLASS_SNAPSHOT'
        payload = { classes: [{ ...classroom, memberCount: 1 }] }
      } else if (message.action === 'CLASS_OPEN') {
        action = 'CLASS_SNAPSHOT'
        payload = { classroom, messages: [] }
      } else if (message.action === 'EXAM_LIST') {
        action = 'EXAM_DATA'
        payload = [exam]
      } else if (['EXAM_OPEN', 'EXAM_SYNC'].includes(message.action)) {
        action = 'EXAM_DATA'
        payload = exam
      } else if (message.action === 'EXAM_UNWATCH') action = 'EXAM_DATA'
      else if (message.action === 'ACCOUNT_GET') {
        action = 'ACCOUNT_DATA'
        payload = profile
      } else if (message.action === 'CLIENT_ACTIVITY') action = 'ACTIVITY_UPDATED'
      if (message.requestId)
        ws.send(JSON.stringify({ action, payload, requestId: message.requestId }))
    })
  })
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await prepare(context)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/classes`)
  const bell = page.getByRole('button', { name: /^Thông báo(?:, \d+ chưa đọc)?$/ })
  await expect(bell).toHaveAttribute('aria-label', 'Thông báo, 3 chưa đọc')
  await bell.click()
  const dialog = page.getByRole('dialog', { name: 'Thông báo', exact: true })
  await expect(dialog.locator('.notification-item')).toHaveCount(3)
  assert.equal(
    items.filter((item) => !item.readAt).length,
    3,
    'Opening the bell must not mark items read',
  )
  await page.screenshot({ path: 'artifacts/notifications-desktop.png', fullPage: true })
  await dialog.getByRole('button', { name: /Bạn có bài tập mới/ }).click()
  await expect(page).toHaveURL(/view=assignments&assignmentId=1/)
  await expect(page.locator('.learner-work-item.is-notification-target h3')).toHaveText('Bài tập 1')
  assert.ok(
    !requests.some((request) => request.endsWith('/start')),
    'Opening a notification must not start an assignment',
  )
  await expect(bell).toHaveAttribute('aria-label', 'Thông báo, 2 chưa đọc')
  await bell.click()
  await dialog.getByRole('button', { name: /Bạn có bài kiểm tra trực tiếp/ }).click()
  await expect(page).toHaveURL(/view=exams&examId=7/)
  await expect(page.getByRole('button', { name: 'Bắt đầu làm bài', exact: true })).toBeVisible()
  assert.ok(
    !actions.includes('EXAM_OPEN'),
    'Exam notification must show a preview before opening the exam',
  )
  await page.getByRole('button', { name: 'Bắt đầu làm bài', exact: true }).click()
  await expect(page.locator('.live-exam-body')).toBeVisible()
  assert.ok(actions.includes('EXAM_OPEN'))
  await bell.click()
  await dialog.getByRole('button', { name: /Lời nhắc từ quản trị viên/ }).click()
  await expect(dialog.locator('.notification-detail')).toContainText('tuân thủ nội quy')
  await expect(page.locator('.notification-dot')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(bell).toBeFocused()

  const second = await context.newPage()
  second.on('pageerror', (error) => errors.push(error.message))
  await second.goto(`${base}/classes`)
  await expect(second.getByRole('button', { name: 'Thông báo', exact: true })).toBeVisible()
  items.unshift(notification(4, { title: 'Thông báo mới sau khi đăng nhập' }))
  broadcast()
  await expect(bell).toHaveAttribute('aria-label', 'Thông báo, 1 chưa đọc')
  await expect(second.getByRole('button', { name: /^Thông báo(?:, \d+ chưa đọc)?$/ })).toHaveAttribute(
    'aria-label',
    'Thông báo, 1 chưa đọc',
  )
  await bell.click()
  await dialog.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click()
  await expect(second.locator('.notification-dot')).toHaveCount(0)
  await expect(page.locator('.notification-dot')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/notifications-mobile.png', fullPage: true })
  const box = await dialog.boundingBox()
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 390,
    'Mobile notification panel must fit the viewport',
  )
  const bellBox = await bell.boundingBox()
  const tasksBox = await page.getByRole('button', { name: 'Mở nhiệm vụ' }).boundingBox()
  assert.ok(
    bellBox && tasksBox && bellBox.x >= tasksBox.x + tasksBox.width,
    'Bell must not overlap the tasks button on mobile',
  )
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'No horizontal overflow on mobile',
  )
  await page.reload()
  await expect(page.locator('.notification-dot')).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: unread dot, read semantics, assignment/exam previews, admin messages, cross-tab refresh, persistence, mobile layout',
  )
} finally {
  await browser.close()
}
