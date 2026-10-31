// Deterministic UI checks. Backend authorization/publication is covered by the MySQL integration test.
import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const base = process.env.STUDY_MANAGEMENT_UI_BASE || 'http://127.0.0.1:5174'
const errors = []
const content = {
  objective: 'Understand sentence order',
  sections: [{ title: 'Theory', body: 'Subject, verb, object.' }],
  examples: [],
  mistakes: [],
  prerequisites: [],
  application: 'Write a sentence.',
  summary: 'Remember word order.',
}
const makeLesson = (id) => ({
  id,
  title: `Lesson ${id}`,
  archived: false,
  content,
  questions: [
    {
      id: `${id}-q1`,
      prompt: 'Choose the correct sentence.',
      options: ['She reads.', 'Reads she.', 'She read.', 'She reading.'],
      correctOption: 'A',
      explanation: 'Use the correct verb form.',
    },
  ],
})
let live = {
  id: 'l1-m1',
  levelId: 1,
  ordinalNo: 1,
  title: 'Sentence structure',
  archived: false,
  lessons: [makeLesson('1.1'), makeLesson('1.2')],
}
const drafts = []
const profiles = {
  teacher: {
    id: 20,
    username: 'teacher',
    displayName: 'Teacher',
    role: 'TEACHER',
    level: 1,
    totalXp: 0,
  },
  admin: { id: 1, username: 'admin', displayName: 'Admin', role: 'ADMIN', level: 1, totalXp: 0 },
}
async function session(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const profile = profiles[role]
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const data = method !== 'GET' ? route.request().postDataJSON() : null
    const json = (value) => route.fulfill({ json: value })
    if (path.endsWith('/auth/me')) return json(profile)
    if (path.endsWith('/auth/csrf')) return json({ token: 'test-token' })
    if (path.endsWith('/notifications'))
      return json({ items: [], unreadCount: 0, nextBeforeId: null })
    if (path === '/api/v1/study-management')
      return json({
        levels: [
          { id: 1, title: 'Foundation', outcome: 'Build a strong foundation.' },
          { id: 2, title: 'Next level', outcome: 'Continue learning.' },
        ],
        modules: [{ ...live, lessonCount: live.lessons.length, version: 1 }],
        drafts: drafts
          .filter((d) => role === 'admin' || d.authorId === profile.id)
          .map((d) => ({ ...d, title: d.payload.title })),
      })
    if (path.endsWith('/modules/l1-m1/history'))
      return json([{ version: 1, createdAt: '2026-10-30T08:00:00Z', authorName: 'Admin' }])
    if (path.endsWith('/modules/l1-m1')) return json(live)
    if (path.endsWith('/drafts') && method === 'POST') {
      const payload = data.moduleId
        ? structuredClone(live)
        : {
            id: 'new-module',
            levelId: data.levelId,
            ordinalNo: 2,
            title: 'Module mới',
            archived: false,
            lessons: [],
          }
      const draft = {
        id: drafts.length + 1,
        moduleId: payload.id,
        authorId: profile.id,
        authorName: profile.displayName,
        baseVersion: data.moduleId ? 1 : 0,
        version: 1,
        status: 'DRAFT',
        payload,
        note: '',
        updatedAt: new Date().toISOString(),
      }
      drafts.unshift(draft)
      return json(draft)
    }
    const match = path.match(/\/drafts\/(\d+)(?:\/(\w+))?$/)
    if (match) {
      const draft = drafts.find((d) => d.id === Number(match[1]))
      if (match[2] === 'delete') {
        drafts.splice(drafts.indexOf(draft), 1)
        return json({ deleted: true })
      }
      if (method === 'GET') return json(draft)
      if (method === 'PUT') {
        draft.payload = data.payload
        draft.version++
        return json(draft)
      }
      const states = {
        submit: 'SUBMITTED',
        return: 'RETURNED',
        withdraw: 'DRAFT',
        publish: 'PUBLISHED',
        discard: 'DISCARDED',
      }
      draft.status = states[match[2]]
      draft.note = data.note
      draft.version++
      if (match[2] === 'publish') live = structuredClone(draft.payload)
      return json(draft)
    }
    return json({})
  })
  await context.routeWebSocket('**/api/ws-system', (socket) => socket.onMessage(() => {}))
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/${role === 'admin' ? 'admin' : 'teacher'}/journeys`)
  await expect(page.getByRole('heading', { name: 'Quản lý hành trình', exact: true })).toBeVisible()
  return { context, page }
}
try {
  const teacher = await session('teacher')
  const page = teacher.page
  await page.getByRole('button', { name: 'Soạn thay đổi' }).click()
  await page.getByLabel('Tên module', { exact: true }).fill('Teacher proposal')
  await page.evaluate(() => window.dispatchEvent(new Event('grammarquest:server-data-changed')))
  await expect(page.getByLabel('Tên module', { exact: true })).toHaveValue('Teacher proposal')
  await page.getByRole('button', { name: /Đưa bài 2 lên/ }).click()
  await expect(page.locator('.cm-lessons li').first()).toContainText('Lesson 1.2')
  await page.getByRole('button', { name: /Câu hỏi \(/ }).click()
  await expect(page.locator('.cm-tabs button[aria-pressed=true]')).toHaveText(/Câu hỏi/)
  await page.getByLabel('Nội dung câu hỏi', { exact: true }).fill('Edited question')
  await page.getByRole('button', { name: 'Xem trước học sinh' }).click()
  await expect(page.locator('.cm-preview')).toContainText('Edited question')
  await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  expect(live.title).toBe('Sentence structure')
  await expect(page.getByRole('button', { name: 'Lưu & xuất bản' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Lưu & gửi duyệt' }).click()
  await expect(page.getByRole('button', { name: 'Rút về chỉnh sửa' })).toBeVisible()
  await expect(page.getByLabel('Tên module', { exact: true })).toBeDisabled()

  const admin = await session('admin')
  await admin.page.locator('.cm-draft-list button').first().click()
  await admin.page.getByLabel('Ghi chú / Lý do yêu cầu chỉnh sửa').fill('Please check the lesson.')
  await admin.page.getByRole('button', { name: 'Yêu cầu chỉnh sửa' }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('grammarquest:server-data-changed')))
  await expect(page.getByLabel('Tên module', { exact: true })).toBeEnabled()
  await expect(page.locator('.cm-editor')).toContainText('Please check the lesson.')
  await page.getByRole('button', { name: 'Lưu & gửi duyệt' }).click()
  await admin.page.evaluate(() =>
    window.dispatchEvent(new Event('grammarquest:server-data-changed')),
  )
  await expect(admin.page.getByRole('button', { name: 'Yêu cầu chỉnh sửa' })).toBeVisible()
  admin.page.once('dialog', (dialog) => dialog.accept())
  await admin.page.getByRole('button', { name: 'Lưu & xuất bản' }).click()
  await expect(admin.page.getByRole('status').filter({ hasText: 'Đã xuất bản.' })).toBeVisible()
  expect(live.title).toBe('Teacher proposal')
  expect(live.lessons[0].id).toBe('1.2')

  await mkdir('artifacts/study-management', { recursive: true })
  await admin.page.screenshot({
    path: 'artifacts/study-management/admin-desktop.png',
    fullPage: true,
  })
  await admin.page.getByRole('button', { name: 'Xem & lịch sử' }).click()
  await expect(admin.page.getByRole('dialog')).toContainText('Lịch sử xuất bản')
  const dialogBounds = await admin.page.getByRole('dialog').boundingBox()
  expect(Math.abs(dialogBounds.x + dialogBounds.width / 2 - 720)).toBeLessThan(3)
  expect(Math.abs(dialogBounds.y + dialogBounds.height / 2 - 500)).toBeLessThan(3)
  await admin.page.getByRole('button', { name: 'Khôi phục vào nháp' }).click()
  await expect(admin.page.getByRole('button', { name: 'Lưu & gửi duyệt' })).toBeVisible()
  await admin.page.getByLabel('Hành trình / Level').selectOption('2')
  await admin.page.getByRole('button', { name: 'Thêm module' }).click()
  expect(drafts[0].payload.levelId).toBe(2)
  await admin.page.getByRole('button', { name: 'Thêm bài học' }).click()
  await expect(admin.page.getByLabel('Tên bài học', { exact: true })).toHaveValue('Bài học mới')
  await admin.page.getByRole('button', { name: 'Xem trước học sinh' }).click()
  await admin.page.setViewportSize({ width: 390, height: 844 })
  expect(await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  )
  await admin.page.screenshot({
    path: 'artifacts/study-management/admin-mobile.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/study-management/teacher-mobile.png', fullPage: true })
  admin.page.once('dialog', (dialog) => dialog.accept())
  await admin.page.getByRole('button', { name: 'Xóa module chưa xuất bản' }).click()
  await expect(admin.page.getByRole('heading', { name: 'Chọn module để bắt đầu' })).toBeVisible()
  await page.getByRole('button', { name: 'Soạn thay đổi' }).click()
  await page.getByRole('button', { name: 'Lưu & gửi duyệt' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Xóa đề xuất', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Chọn module để bắt đầu' })).toBeVisible()
  expect(live.title).toBe('Teacher proposal')
  expect(errors).toEqual([])
  console.log(
    'PASS: teacher drafting, lesson order, question editing, preview, return/resubmit, admin publish, new module/lesson, desktop/mobile layouts',
  )
} finally {
  await browser.close()
}
