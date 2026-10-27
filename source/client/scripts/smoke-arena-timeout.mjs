import { request } from '@playwright/test'
const password = process.env.DEMO_PASSWORD
if (!password) throw new Error('DEMO_PASSWORD is required')
async function client(username) {
  const context = await request.newContext({ baseURL: 'http://127.0.0.1:5173' })
  const token = (await (await context.get('/api/v1/auth/csrf')).json()).token
  const login = await context.post('/api/v1/auth/login', {
    data: { username, password },
    headers: { 'X-XSRF-TOKEN': token },
  })
  if (!login.ok()) throw new Error(`${username} login failed`)
  return {
    context,
    async call(method, path, data) {
      const response = await context.fetch(`/api/v1${path}`, {
        method,
        headers: { 'X-XSRF-TOKEN': token },
        ...(data === undefined ? {} : { data }),
      })
      if (!response.ok())
        throw new Error(`${username} ${path}: ${response.status()} ${await response.text()}`)
      return response.json()
    },
  }
}
const host = await client('learner_one'),
  guest = await client('learner_two')
try {
  const me = await host.call('GET', '/auth/me')
  const room = await host.call('POST', '/arena/rooms')
  const joined = await guest.call('POST', '/arena/join', { code: room.code })
  await host.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  await guest.call('POST', `/arena/rooms/${room.id}/ready`, { ready: true })
  await host.call('POST', `/arena/rooms/${room.id}/start`)
  await new Promise((resolve) => setTimeout(resolve, 9000))
  const paused = await host.call('GET', `/arena/rooms/${room.id}`)
  if (paused.pausedUserId !== joined.guestId) throw new Error('Guest was not marked disconnected')
  await new Promise((resolve) => setTimeout(resolve, 31000))
  const finished = await host.call('GET', `/arena/rooms/${room.id}`)
  if (finished.status !== 'FINISHED' || finished.winnerId !== me.id)
    throw new Error('30-second reconnect timeout did not award host the win')
  console.log('PASS: disconnected player forfeits after 30-second reconnect window')
} finally {
  await host.context.dispose()
  await guest.context.dispose()
}
