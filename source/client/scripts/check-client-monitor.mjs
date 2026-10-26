import {chromium,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

const browser=await chromium.launch({headless:true,channel:'msedge'})
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],actions=[]
let socket
const now=Date.now()
let clients=Array.from({length:12},(_,i)=>({sessionId:`client-${String(i+1).padStart(2,'0')}-session`,userId:i+10,username:`student${i+1}`,currentActivity:i%3===0?'PRACTICING':'READING_LESSON_1',page:'/roadmap',topic:'Các thì cơ bản',lesson:'Hiện tại đơn',idleSeconds:i%2?95:12,lastInteractionAt:now-12000,lastPongAt:now,connectedAt:now-240000,activeAttemptId:i%3===0?100+i:null,allocatedQuestions:i%3===0?10:0,attemptAllocatedAt:now-120000,examAllocatedAt:0,arenaAllocatedAt:0,messagesReceived:25+i,messagesSent:50+i}))
const telemetry=()=>({connections:clients.length,activeSockets:clients.length,ram:145,heapCommitted:256,heapMax:4096,activeSnapshots:4,clients,events:[{id:1,time:new Date(now).toISOString(),level:'INFO',message:'Client connected'}],queue:[],alerts:[{key:'idle2',level:'WARNING',message:'Client không thao tác lâu',sessionId:'client-02-session'}]})
const push=()=>socket.send(JSON.stringify({action:'STATS_UPDATE',data:telemetry()}))
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname
  let data=[]
  if(path.endsWith('/auth/me'))data={id:1,username:'admin',displayName:'Admin',role:'ADMIN',totalXp:0,level:1,xpInLevel:0}
  else if(path.endsWith('/admin/business'))data={finishedMatches:0,days:[]}
  return route.fulfill({json:data})
})
await page.routeWebSocket('**/api/ws-system',ws=>{
  socket=ws
  ws.onMessage(raw=>{
    const m=JSON.parse(raw);actions.push(m)
    if(m.action==='SYSTEM_MONITOR_WATCH')push()
    if(m.action==='SYSTEM_DISCONNECT'){clients=clients.filter(c=>c.sessionId!==m.payload.sessionId);push()}
    if(m.requestId)ws.send(JSON.stringify({requestId:m.requestId,action:m.action==='SYSTEM_REMIND'||m.action==='SYSTEM_DISCONNECT'?'SYSTEM_ACTION_RESULT':m.action==='ADMIN_REPORTS_WATCH'?'WORKSPACE_DATA':m.action==='CLIENT_ACTIVITY'?'ACTIVITY_UPDATED':'SYSTEM_MONITOR_DATA',payload:m.action==='ADMIN_REPORTS_WATCH'?{reports:[],overview:{users:12,classes:1,openReports:0,questions:50}}:{}}))
  })
})
try{
  await page.goto('http://localhost:5175/admin')
  const directory=page.getByRole('region',{name:'Danh sách client'}),detail=page.getByRole('region',{name:'Chi tiết client'})
  await expect(directory.locator('.client-list-item')).toHaveCount(8)
  await page.getByRole('button',{name:'Trang client sau'}).click()
  await expect(directory.locator('.client-list-item')).toHaveCount(4)
  await page.getByRole('button',{name:/^Không thao tác/}).click()
  await expect(directory.locator('.client-list-item')).toHaveCount(6)
  await page.getByRole('button',{name:/^Cần chú ý/}).click()
  await expect(directory.locator('.client-list-item')).toHaveCount(1)
  await directory.locator('.client-list-item').click()
  await expect(detail.getByRole('heading',{name:'student2',exact:true})).toBeVisible()
  await detail.getByText('Thông tin kỹ thuật',{exact:true}).click()
  await expect(detail.getByText('client-02-session',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:/^Tất cả/}).click()
  await page.getByRole('textbox',{name:'Tìm client'}).fill('student1')
  await expect(directory.locator('.client-list-item')).toHaveCount(4)
  push()
  await expect(page.getByRole('textbox',{name:'Tìm client'})).toBeFocused()
  await expect(page.getByRole('textbox',{name:'Tìm client'})).toHaveValue('student1')
  await page.getByRole('textbox',{name:'Tìm client'}).fill('no-match')
  await expect(directory.getByText('Không tìm thấy client phù hợp')).toBeVisible()
  await directory.getByRole('button',{name:'Xóa bộ lọc'}).click()
  await page.getByRole('button',{name:'Xem client student1, tab client-0',exact:true}).click()
  page.once('dialog',dialog=>dialog.accept('Tiếp tục học nhé'))
  await detail.getByRole('button',{name:'Gửi lời nhắc',exact:true}).click()
  await expect(detail.getByRole('status')).toContainText('Đã gửi lời nhắc')
  assert.equal(actions.find(m=>m.action==='SYSTEM_REMIND').payload.sessionId,'client-01-session')
  const logs=page.locator('.monitor-disclosure')
  assert.equal(await logs.evaluate(el=>el.open),false,'Network logs start collapsed')
  await logs.locator('summary').click()
  await expect(page.getByRole('log',{name:'Nhật ký mạng'})).toContainText('Client connected')
  await mkdir('artifacts/client-monitor',{recursive:true})
  await page.locator('.client-monitor').screenshot({path:'artifacts/client-monitor/desktop.png'})
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Client monitor fits mobile viewport')
  }
  await page.setViewportSize({width:390,height:844})
  await detail.screenshot({path:'artifacts/client-monitor/mobile-detail.png'})
  page.once('dialog',dialog=>dialog.accept())
  await detail.getByRole('button',{name:'Ngắt kết nối',exact:true}).click()
  await expect(detail.getByRole('heading',{name:'Client đã ngắt kết nối',exact:true})).toBeVisible()
  assert.deepEqual(errors,[])
  console.log('PASS: client filters, search, pagination, inline details, reminder and disconnect, log disclosure, live removal and mobile layout')
}finally{await browser.close()}
