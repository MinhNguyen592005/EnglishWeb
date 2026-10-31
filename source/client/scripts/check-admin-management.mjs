import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
let reportSocket
page.on('pageerror', (error) => errors.push(error.message))
const users = Array.from({ length: 13 }, (_, i) => ({
  id: i + 10,
  username: `user${i}`,
  displayName: `Người dùng ${i}`,
  role: ['ADMIN', 'TEACHER', 'LEARNER'][i % 3],
  totalXp: i * 350,
  locked: i === 3,
  createdAt: '2026-10-29T08:00:00Z',
}))
const reports = Array.from({ length: 13 }, (_, i) => ({
  id: i + 1,
  source: ['ARENA', 'USER'][i % 2],
  reason: 'inappropriate language',
  status: 'OPEN',
  decision: null,
  createdAt: `2026-10-29T08:${String(i).padStart(2, '0')}:00Z`,
  accusedId: i + 10,
  accusedName: `Người dùng ${i}`,
  reporterId: 80,
  messageBody:
    'Nội dung được báo cáo cần giáo viên và quản trị viên xem xét để giữ môi trường học tập an toàn.',
}))
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  return route.fulfill({
    json: path.endsWith('/auth/me')
      ? { id: 1, username: 'admin', displayName: 'Admin', role: 'ADMIN', totalXp: 0, level: 1 }
      : path.endsWith('/admin/users')
        ? users
        : {},
  })
})
await context.routeWebSocket('**/api/ws-system', (ws) => {
  reportSocket = ws
  ws.onMessage((raw) => {
    const message = JSON.parse(String(raw))
    if (message.action === 'ADMIN_REPORTS_WATCH')
      ws.send(
        JSON.stringify({
          action: 'WORKSPACE_DATA',
          requestId: message.requestId,
          payload: { reports, overview: { users: 13, openReports: 13 } },
        }),
      )
    if (message.action === 'SYSTEM_MONITOR_WATCH')
      ws.send(
        JSON.stringify({
          action: 'SYSTEM_MONITOR_DATA',
          requestId: message.requestId,
          payload: {},
        }),
      )
  })
})
try {
  await mkdir('artifacts/admin', { recursive: true })
  await page.goto('http://localhost:5174/admin?tab=users')
  await expect(page.locator('.users-table tbody tr')).toHaveCount(10)
  await page.getByRole('tab', { name: /Giáo viên/ }).click()
  await expect(page.locator('.users-table tbody tr')).toHaveCount(4)
  await page.getByRole('searchbox', { name: 'Tìm tài khoản' }).fill('user1')
  await expect(page.locator('.users-table tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Xóa tìm kiếm tài khoản' }).click()
  await page.getByRole('tab', { name: /Tất cả/ }).click()
  await page.screenshot({ path: 'artifacts/admin/accounts-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'artifacts/admin/accounts-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('http://localhost:5174/admin?tab=reports')
  await expect(page.locator('.report-card')).toHaveCount(10)
  await page.locator('.list-pagination button').last().click()
  await expect(page.locator('.report-card')).toHaveCount(3)
  await page.getByRole('textbox', { name: 'Tìm báo cáo' }).fill('Người dùng 12')
  await expect(page.locator('.report-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Xem xét', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Khóa tài khoản', exact: true }),
  ).toBeVisible()
  reports[12].status = 'RESOLVED'
  reportSocket.send(
    JSON.stringify({
      action: 'WORKSPACE_UPDATE',
      payload: { kind: 'REPORTS', data: { reports, overview: { users: 13, openReports: 12 } } },
    }),
  )
  await expect(page.getByRole('dialog')).toContainText('Đã xử lý')
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Khóa tài khoản', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.getByRole('textbox', { name: 'Tìm báo cáo' }).fill('')
  await expect(page.locator('.report-card')).toHaveCount(10)
  await page.screenshot({ path: 'artifacts/admin/reports-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'artifacts/admin/reports-mobile.png', fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'PASS: account filters/search, report pagination/search/detail/actions, desktop/mobile no overflow',
  )
} finally {
  await browser.close()
}
