import { chromium, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const password=process.env.DEMO_PASSWORD
if(!password)throw new Error('DEMO_PASSWORD is required')
const output=fileURLToPath(new URL('../../../statics/results/arena-match-real.png',import.meta.url))
const mobileOutput=fileURLToPath(new URL('../../../statics/results/arena-chat-mobile.png',import.meta.url))
const browser=await chromium.launch({channel:'msedge',headless:true})
async function player(username,viewport={width:1200,height:850}){
  const context=await browser.newContext({viewport})
  const page=await context.newPage()
  const received=[]
  const sent=[]
  page.on('websocket',socket=>{
    socket.on('framereceived',frame=>received.push(String(frame.payload)))
    socket.on('framesent',frame=>sent.push(String(frame.payload)))
  })
  await page.goto('http://127.0.0.1:5173/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button',{name:'Đăng nhập'}).click()
  await page.waitForURL('**/dashboard')
  const mine=page.waitForResponse(r=>r.url().endsWith('/api/v1/arena/mine'))
  await page.goto('http://127.0.0.1:5173/arena')
  if((await (await mine).json()).id)await page.locator('.arena-banner').waitFor()
  return {context,page,received,sent}
}
const first=await player('learner_one')
const second=await player('learner_two',{width:390,height:844})
try{
  for(const {page} of [first,second]){
    const waiting=page.getByRole('button',{name:'Rời phòng'})
    if(await waiting.count())await waiting.click()
    const playing=page.getByRole('button',{name:'Rời trận'})
    if(await playing.count()){page.once('dialog',dialog=>dialog.accept());await playing.click()}
  }
  await first.page.getByRole('button',{name:'Tạo phòng'}).click()
  await first.page.locator('.arena-banner').waitFor()
  const code=(await first.page.locator('.arena-banner .section-label').innerText()).replace('PHÒNG ','').trim()
  await expect.poll(()=>second.sent.filter(frame=>frame.startsWith('SUBSCRIBE')).length,{timeout:10000}).toBeGreaterThan(0)
  second.sent.length=0
  await second.page.getByLabel('Mã phòng').fill(code)
  await second.page.getByRole('button',{name:'Tham gia'}).click()
  await expect.poll(()=>second.sent.filter(frame=>frame.startsWith('SUBSCRIBE')).length,{timeout:10000}).toBeGreaterThan(0)
  await first.page.getByText('Linh',{exact:true}).waitFor({timeout:10000})
  const roomId=(await (await first.page.request.get('http://127.0.0.1:5173/api/v1/arena/mine')).json()).id
  const outsider=await player('teacher_demo')
  try{
    const forbidden=await outsider.page.request.get(`http://127.0.0.1:5173/api/v1/arena/rooms/${roomId}/messages`)
    if(forbidden.status()!==403)throw new Error(`Outsider read arena chat: HTTP ${forbidden.status()}`)
  }finally{await outsider.context.close()}
  const before='Chào, mình đã vào phòng!'
  second.received.length=0
  await first.page.getByRole('textbox',{name:'Tin nhắn phòng đấu'}).fill(before)
  await first.page.getByRole('button',{name:'Gửi tin nhắn'}).click()
  await expect.poll(()=>second.received.some(frame=>frame.startsWith('MESSAGE')&&frame.includes(`"roomId":${roomId}`)),{timeout:5000}).toBe(true)
  await second.page.locator('.arena-chat-list').getByText(before,{exact:true}).waitFor({timeout:10000})
  await second.page.reload()
  await second.page.locator('.arena-chat-list').getByText(before,{exact:true}).waitFor({timeout:10000})
  await first.page.getByRole('button',{name:'Tôi sẵn sàng'}).click()
  await second.page.getByRole('button',{name:'Tôi sẵn sàng'}).click()
  if(!second.sent.some(frame=>frame.startsWith('SEND')&&frame.includes('"action":"READY"')))throw new Error('Ready action did not use STOMP SEND')
  await first.page.getByRole('button',{name:'Bắt đầu trận'}).click()
  await first.page.locator('.arena-question').waitFor()
  await second.page.locator('.arena-question').waitFor()
  const during='Chúc bạn may mắn!'
  await second.page.getByRole('textbox',{name:'Tin nhắn phòng đấu'}).fill(during)
  await second.page.getByRole('button',{name:'Gửi tin nhắn'}).click()
  if(!second.sent.some(frame=>frame.startsWith('SEND')&&frame.includes('"action":"CHAT"')))throw new Error('Arena chat did not use STOMP SEND')
  await first.page.locator('.arena-chat-list').getByText(during,{exact:true}).waitFor({timeout:10000})
  await second.page.screenshot({path:mobileOutput,fullPage:true})
  await first.page.locator('.arena-option').first().click()
  if(await first.page.getByText('Đáp án đúng:').count())throw new Error('Correct answer revealed too soon')
  await second.page.locator('.arena-option').last().click()
  await first.page.getByText('CÂU 2/10').waitFor({timeout:10000})
  await first.page.screenshot({path:output,fullPage:true})
  first.page.once('dialog',dialog=>dialog.accept())
  await first.page.getByRole('button',{name:'Rời trận'}).click()
  await second.page.getByRole('heading',{name:'Bạn thắng!'}).waitFor({timeout:10000})
  if(await second.page.locator('.arena-chat').count())throw new Error('Arena chat is still visible after match')
  const csrf=(await (await first.page.request.get('http://127.0.0.1:5173/api/v1/auth/csrf')).json()).token
  const late=await first.page.request.post(`http://127.0.0.1:5173/api/v1/arena/rooms/${roomId}/messages`,{headers:{'X-XSRF-TOKEN':csrf},data:{body:'Tin gửi sau trận'}})
  if(late.status()!==409)throw new Error(`Finished room accepted chat: HTTP ${late.status()}`)
  console.log('PASS: two browser profiles chat before/during match, persisted history, outsider denied, match flow')
}finally{await first.context.close();await second.context.close();await browser.close()}
