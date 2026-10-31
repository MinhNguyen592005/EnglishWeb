import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const days = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-10-${String(i + 16).padStart(2, '0')}`,
  registrations: (i * 7) % 17,
  classes: i % 4,
  matches: (i * 3) % 11,
}))
const clients = ['student01', 'teacher01', 'student02'].map((username, i) => ({
  username,
  sessionId: `session-${i}`,
  userId: i + 10,
  currentActivity: 'IN_CLASSROOM',
  page: '/classes/90',
  topic: '',
  lesson: '',
  lastInteractionAt: Date.now(),
  idleSeconds: i === 2 ? 90 : 0,
  lastPongAt: Date.now(),
  connectedAt: Date.now(),
  messagesReceived: 12,
  messagesSent: 15,
  activeAttemptId: null,
  allocatedQuestions: 0,
}))
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  return route.fulfill({
    json: path.endsWith('/auth/me')
      ? { id: 1, username: 'admin', displayName: 'Admin', role: 'ADMIN', totalXp: 0, level: 1 }
      : path.endsWith('/admin/business')
        ? { days, finishedMatches: 286 }
        : {},
  })
})
await context.routeWebSocket('**/api/ws-system', (ws) => {
  ws.onMessage((raw) => {
    const message = JSON.parse(String(raw))
    if (message.action === 'ADMIN_REPORTS_WATCH')
      ws.send(
        JSON.stringify({
          action: 'WORKSPACE_DATA',
          requestId: message.requestId,
          payload: { reports: [], overview: { users: 1248, openReports: 3 } },
        }),
      )
    if (message.action === 'SYSTEM_MONITOR_WATCH') {
      ws.send(
        JSON.stringify({
          action: 'SYSTEM_MONITOR_DATA',
          requestId: message.requestId,
          payload: {},
        }),
      )
      ws.send(
        JSON.stringify({
          action: 'STATS_UPDATE',
          data: {
            connections: 18,
            activeSockets: 24,
            ram: 148,
            heapCommitted: 512,
            heapMax: 1024,
            activeSnapshots: 7,
            clients,
            events: [],
            queue: [],
            alerts: [],
            capacity: {
              reservedSockets: 24,
              maxSockets: 500,
              maxSocketsPerAccount: 3,
              activeRequests: 2,
              maxConcurrentRequests: 100,
              rejectedRequests: 0,
              rejectedConnections: 0,
            },
          },
        }),
      )
    }
  })
})
try {
  await page.goto('http://localhost:5174/admin')
  await expect(page.getByRole('heading', { name: 'Tổng quan hệ thống' })).toBeVisible()
  await expect(page.locator('.admin-kpi-card')).toHaveCount(2)
  await expect(page.locator('.biz-chart')).toHaveCount(3)
  await expect(page.locator('.monitor-metric').first()).toContainText('24')
  await page.locator('.monitor-client-row').nth(1).click()
  await expect(page.locator('#monitor-selected-client h2')).toHaveText('teacher01')
  const list = await page.locator('.monitor-clients').boundingBox()
  const detail = await page.locator('.monitor-detail').boundingBox()
  expect(detail.x).toBeGreaterThan(list.x + list.width)
  await expect(page.locator('.monitor-client-row.selected')).toHaveCount(1)
  await page.locator('.monitor-connection-details summary').click()
  await expect(page.locator('.client-detail-grid')).toBeVisible()
  await page.getByRole('button', { name: 'Bỏ chọn client' }).click()
  await expect(page.locator('.monitor-client-row.selected')).toHaveCount(0)
  await expect(page.locator('.monitor-select-placeholder')).toBeVisible()
  await page.locator('.monitor-client-row').nth(1).click()
  await mkdir('artifacts/admin', { recursive: true })
  await page.screenshot({ path: 'artifacts/admin/overview-desktop.png', fullPage: true })
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `overflow at ${width}`,
    ).toBe(true)
  }
  await page.screenshot({ path: 'artifacts/admin/overview-mobile.png', fullPage: true })
  await page.getByRole('link', { name: 'Xem báo cáo', exact: true }).click()
  await expect(page).toHaveURL(/tab=reports/)
  expect(errors).toEqual([])
  console.log(
    'PASS: overview data, two KPI cards, three charts, telemetry, reports link, no overflow at 1440/1024/768/390',
  )
} finally {
  await browser.close()
}
