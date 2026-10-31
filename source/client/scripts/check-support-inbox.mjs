import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const threads = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  userId: i + 10,
  username: `student${i}`,
  displayName: `Học viên ${i + 1}`,
  lastMessageId: 1,
  updatedAt: '2026-10-29T08:30:00Z',
  preview: 'Em cần hỗ trợ về bài tập trong lớp học ạ.',
  lastSenderType: i === 2 ? 'ADMIN' : 'USER',
  status: i === 2 ? 'CLOSED' : 'OPEN',
}))
let conversation = {
  ...threads[0],
  messages: [
    {
      id: 1,
      senderId: 10,
      senderType: 'USER',
      senderName: 'Học viên 1',
      body: 'Chào thầy cô, em chưa tìm thấy bài tập của lớp. Nhờ thầy cô kiểm tra giúp em ạ.',
      createdAt: '2026-10-29T08:30:00Z',
    },
  ],
}
await context.route('**/api/v1/**', (route) =>
  route.fulfill({
    json: { id: 1, username: 'admin', displayName: 'Admin', role: 'ADMIN', totalXp: 0, level: 1 },
  }),
)
await context.routeWebSocket('**/api/ws-system', (ws) =>
  ws.onMessage((raw) => {
    const m = JSON.parse(String(raw))
    let payload
    if (m.action === 'SUPPORT_LIST') payload = threads
    else if (m.action === 'SUPPORT_OPEN') payload = conversation
    else if (m.action === 'SUPPORT_SEND') {
      conversation = {
        ...conversation,
        lastMessageId: 2,
        messages: [
          ...conversation.messages,
          {
            id: 2,
            senderId: 1,
            senderType: 'ADMIN',
            senderName: 'Admin',
            body: m.payload.body,
            createdAt: '2026-10-29T08:31:00Z',
          },
        ],
      }
      payload = conversation
    } else if (m.action === 'SUPPORT_STATUS')
      payload = { ...conversation, status: m.payload.status }
    else if (m.action === 'SUPPORT_UNWATCH') payload = {}
    if (payload)
      ws.send(JSON.stringify({ action: 'SUPPORT_DATA', requestId: m.requestId, payload }))
  }),
)
try {
  await page.goto('http://localhost:5174/admin?tab=support')
  await expect(page.locator('.support-thread-item')).toHaveCount(12)
  await page.getByRole('tab', { name: /Đã trả lời/ }).click()
  await expect(page.locator('.support-thread-item')).toHaveCount(1)
  await page.getByRole('tab', { name: /Tất cả/ }).click()
  await page.getByRole('textbox', { name: 'Tìm hội thoại' }).fill('student0')
  await expect(page.locator('.support-thread-item')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Tìm hội thoại' }).fill('')
  await page.locator('.support-thread-item').first().click()
  await expect(page.locator('.support-message')).toHaveCount(1)
  await page
    .getByRole('textbox', { name: 'Nội dung hỗ trợ' })
    .fill('Em vào tab Bài tập của lớp nhé. Thầy cô sẽ kiểm tra thêm cho em.')
  await page.getByRole('button', { name: 'Gửi tin nhắn hỗ trợ' }).click()
  await expect(page.locator('.support-message')).toHaveCount(2)
  await page.getByRole('button', { name: 'Thông tin hội thoại', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Trạng thái hội thoại' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Trạng thái hội thoại' }).selectOption('IN_PROGRESS')
  await page.getByRole('button', { name: 'Đóng thông tin hội thoại' }).click()
  await mkdir('artifacts/admin', { recursive: true })
  await page.screenshot({ path: 'artifacts/admin/support-desktop.png', fullPage: true })
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `overflow ${width}`,
    ).toBe(true)
    await expect(page.getByRole('textbox', { name: 'Nội dung hỗ trợ' })).toBeVisible()
  }
  await page.screenshot({ path: 'artifacts/admin/support-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Quay lại danh sách hội thoại' }).click()
  await expect(page.locator('.support-thread-list')).toBeVisible()
  await expect(page.locator('.support-inbox-chat')).toBeHidden()
  expect(errors).toEqual([])
  console.log(
    'PASS: inbox filters/search, open/reply/status/details, mobile back, no overflow 1440/1024/768/390',
  )
} finally {
  await browser.close()
}
