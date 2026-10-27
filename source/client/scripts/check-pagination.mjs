import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const items = Array.from({ length: 23 }, (_, i) => ({
  id: i + 1,
  name: `Unit ${i + 1}`,
  description: '',
  archived: false,
  questionCount: 8,
  updatedAt: '2026-10-27',
  createdAt: '2026-10-27',
}))
await context.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  const json = path.endsWith('/auth/me')
    ? { id: 80, username: 'preview', displayName: 'Teacher', role: 'TEACHER', level: 1, totalXp: 0 }
    : path.endsWith('/teacher/materials')
      ? items
      : path.endsWith('/classes')
        ? items.map((item) => ({
            ...item,
            teacherName: 'Teacher',
            memberCount: 0,
            joinCode: `CODE${item.id}`,
          }))
        : {}
  return route.fulfill({ json })
})
await context.routeWebSocket('**/api/ws-system', () => {})
try {
  await page.goto('http://localhost:5173/teacher/questions')
  await expect(page.locator('.tm-card')).toHaveCount(10)
  await page.locator('.list-pagination button').last().click()
  await expect(page.locator('.tm-card h2').first()).toHaveText('Unit 11')
  await page.locator('.list-pagination button').last().click()
  await expect(page.locator('.tm-card')).toHaveCount(3)
  await expect(page.locator('.list-pagination button').last()).toBeDisabled()
  await page.locator('.tm-search input').fill('Unit 23')
  await expect(page.locator('.tm-card')).toHaveCount(1)
  await expect(page.locator('.list-pagination strong')).toHaveText('Trang 1 / 1')
  await page.locator('.tm-search input').fill('absent')
  await expect(page.locator('.tm-card')).toHaveCount(0)
  await expect(page.locator('.list-pagination')).toHaveCount(0)
  await page.goto('http://localhost:5173/classes')
  await expect(page.locator('.class-card')).toHaveCount(10)
  await page.locator('.list-pagination button').last().click()
  await expect(page.locator('.class-card h3').first()).toHaveText('Unit 11')
  console.log('PASS: library 10/10/3, boundaries, filter reset, empty search, classes 10 per page')
} finally {
  await browser.close()
}
