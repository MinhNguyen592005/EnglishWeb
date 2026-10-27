import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const password = process.env.DEMO_PASSWORD
if (!password) throw new Error('DEMO_PASSWORD is required')
const output = fileURLToPath(new URL('../artifacts/legacy/', import.meta.url))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
async function login(page, username) {
  await page.goto('http://127.0.0.1:5173/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await page.waitForURL(username === 'admin_demo' ? '**/admin' : '**/dashboard', { timeout: 15000 })
}
try {
  const teacher = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await login(teacher, 'teacher_demo')
  await teacher.goto('http://127.0.0.1:5173/teacher')
  await teacher.getByRole('heading', { name: 'Quản lý giảng dạy' }).waitFor()
  await teacher.getByRole('heading', { name: 'Nhiệm vụ gần đây' }).waitFor()
  await teacher.screenshot({ path: `${output}teacher-dashboard.png`, fullPage: true })
  await teacher.goto('http://127.0.0.1:5173/classes')
  await teacher.getByRole('heading', { name: 'Lớp học' }).waitFor()
  await teacher.screenshot({ path: `${output}classes-teacher.png`, fullPage: true })
  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await login(admin, 'admin_demo')
  await admin.goto('http://127.0.0.1:5173/admin')
  await admin.getByRole('heading', { name: 'Bảng điều khiển quản trị' }).waitFor()
  await admin.getByText('teacher_demo').waitFor()
  await admin.getByRole('tab', { name: 'Nội dung' }).click()
  await admin.getByRole('heading', { name: 'Tạo bài học nháp' }).waitFor()
  await admin.getByRole('heading', { name: 'Thêm câu hỏi nháp' }).waitFor()
  await admin.screenshot({ path: `${output}admin-real.png`, fullPage: true })
  const learner = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await login(learner, 'learner_two')
  await learner.goto('http://127.0.0.1:5173/arena')
  await learner.getByRole('heading', { name: 'Đấu trường PvP' }).waitFor()
  await learner.screenshot({ path: `${output}arena-mobile.png`, fullPage: true })
  console.log('PASS: teacher dashboard/classes, admin content, arena browser views')
} finally {
  await browser.close()
}
