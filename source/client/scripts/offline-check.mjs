import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/login')
  await page.getByLabel('Tên đăng nhập').fill('test_learner')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('not-a-real-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  const message = await page.getByRole('alert').textContent({ timeout: 10000 })
  if (!message?.includes('Không kết nối được máy chủ Grammar Quest'))
    throw new Error(`Unexpected offline feedback: ${message}`)
  console.log('Offline feedback visible:', message.trim())
} finally {
  await browser.close()
}
