import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [],
  rest = [],
  actions = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/api/v1/**', (route) => {
  const path = new URL(route.request().url()).pathname
  if (path.includes('/arena')) rest.push(path)
  return route.fulfill({
    json: path.endsWith('/auth/me')
      ? {
          id: 1,
          username: 'alice',
          displayName: 'Alice',
          role: 'LEARNER',
          totalXp: 0,
          level: 1,
          xpInLevel: 0,
        }
      : [],
  })
})
let socket,
  room = null
let messages = []
const send = (action, payload) => socket.send(JSON.stringify({ action, payload }))
await page.routeWebSocket('**/api/ws-system', (ws) => {
  socket = ws
  ws.onMessage((raw) => {
    const message = JSON.parse(raw)
    actions.push(message.action)
    let action = 'ARENA_DATA',
      payload = {}
    switch (message.action) {
      case 'AUTH':
        return
      case 'ACCOUNT_GET':
        action = 'ACCOUNT_DATA'
        payload = {
          id: 1,
          username: 'alice',
          displayName: 'Alice',
          role: 'LEARNER',
          totalXp: 0,
          level: 1,
          xpInLevel: 0,
        }
        break
      case 'CLIENT_INTERACTION':
        return
      case 'CLIENT_ACTIVITY':
        action = 'ACTIVITY_UPDATED'
        break
      case 'QUEUE_CANCEL':
      case 'QUEUE_STATUS':
        action = 'MATCHMAKING_UPDATE'
        payload = { status: 'IDLE' }
        break
      case 'ARENA_HISTORY':
        payload = []
        break
      case 'ARENA_OPEN':
        payload = room || {}
        break
      case 'ARENA_MESSAGES':
        payload = messages
        break
      case 'ARENA_CREATE':
        room = {
          id: 7,
          code: 'ABC123',
          status: 'WAITING',
          stateVersion: 1,
          hostId: 1,
          guestId: 2,
          hostName: 'Alice',
          guestName: 'Bob',
          hostReady: false,
          guestReady: true,
          hostScore: 0,
          guestScore: 0,
          currentRound: 0,
          questionLimit: 10,
          deadlineAt: null,
          winnerId: null,
          isHost: true,
        }
        payload = room
        break
      case 'ARENA_READY':
        room = { ...room, hostReady: true, stateVersion: 2 }
        payload = room
        break
      case 'ARENA_START':
        room = {
          ...room,
          status: 'IN_PROGRESS',
          stateVersion: 3,
          currentRound: 1,
          deadlineAt: new Date(Date.now() + 20000).toISOString(),
          question: {
            roundNo: 1,
            prompt: 'Choose the correct answer',
            options: ['Answer A', 'Answer B', 'Answer C', 'Answer D'],
          },
        }
        payload = room
        break
      case 'ARENA_ANSWER':
        room = { ...room, myAnswer: 'A', stateVersion: 4 }
        payload = room
        break
      case 'ARENA_CHAT':
        messages = [
          {
            id: 1,
            roomId: 7,
            userId: 1,
            displayName: 'Alice',
            body: message.payload.body,
            createdAt: new Date().toISOString(),
          },
        ]
        payload = messages[0]
        send('ARENA_MESSAGES_UPDATE', { roomId: 7, messages })
        break
      case 'ARENA_LEAVE':
        room = { ...room, status: 'FINISHED', stateVersion: 7, winnerId: 2 }
        payload = room
        break
    }
    if (message.requestId)
      ws.send(JSON.stringify({ action, payload, requestId: message.requestId }))
  })
})
try {
  await page.goto('http://localhost:5175/arena')
  await page.getByRole('heading', { name: 'Đấu trường PvP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Tạo phòng', exact: true }).click()
  await page.getByRole('button', { name: 'Tôi sẵn sàng', exact: true }).click()
  await page.getByRole('button', { name: 'Bắt đầu trận', exact: true }).click()
  await page.getByRole('button', { name: /Answer A/ }).click()
  await page.getByText(/Đã gửi đáp án/).waitFor()
  room = {
    ...room,
    stateVersion: 5,
    currentRound: 2,
    myAnswer: null,
    question: { roundNo: 2, prompt: 'Server pushed round two', options: ['A2', 'B2', 'C2', 'D2'] },
  }
  send('ARENA_ROOM_UPDATE', room)
  await page.getByText('Server pushed round two', { exact: true }).waitFor()
  await page
    .getByRole('textbox', { name: 'Tin nhắn phòng đấu', exact: true })
    .fill('Hello via socket')
  await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
  await page.getByText('Hello via socket', { exact: true }).waitFor()
  await page.waitForTimeout(2200)
  if (rest.length) throw new Error(`Unexpected PvP REST calls: ${rest.join(',')}`)
  if (errors.length) throw new Error(errors.join('\n'))
  await mkdir('artifacts/role-views', { recursive: true })
  await page.screenshot({ path: 'artifacts/role-views/arena-websocket.png', fullPage: true })
  console.log(
    'PASS: create/ready/start/answer, unsolicited round push, chat push; zero PvP REST requests',
  )
  console.log([...new Set(actions)].join(', '))
} finally {
  await browser.close()
}
