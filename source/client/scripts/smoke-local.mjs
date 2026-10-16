import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

if (!process.env.DEMO_PASSWORD) throw new Error('DEMO_PASSWORD is required in the environment')
const output = fileURLToPath(new URL('../../../statics/results/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173/login')
  await page.getByLabel('Tên đăng nhập').fill('learner_one')
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.getByRole('heading', { name: /Chào Minh/ }).waitFor({ timeout: 15000 })
  await page.screenshot({ path: `${output}dashboard-real.png`, fullPage: true })

  await page.getByRole('link', { name: 'Lộ trình' }).first().click()
  await page.getByRole('heading', { name: 'Trạm Câu điều kiện' }).waitFor()
  await page.getByRole('link', { name: 'Bắt đầu' }).first().click()
  await page.getByRole('heading', { name: 'Câu điều kiện loại 0' }).waitFor()
  await page.getByRole('button', { name: /Luyện tập 10 câu/ }).click()
  await page.getByRole('heading', { name: 'Trạm luyện tập' }).waitFor()
  for (let i = 0; i < 10; i++) {
    await page.locator('.answer-option').first().click()
    await page.getByRole('button', { name: /Xác nhận đáp án/ }).click()
    await page.locator('.feedback').waitFor()
    await page.getByRole('button', { name: i === 9 ? /Xem kết quả/ : /Câu tiếp theo/ }).click()
  }
  await page.getByRole('heading', { name: 'Hoàn thành luyện tập!' }).waitFor()
  await page.screenshot({ path: `${output}practice-result-real.png`, fullPage: true })
  console.log('PASS: learner login, roadmap, lesson, 10 answers, persisted result')
} finally {
  await browser.close()
}
