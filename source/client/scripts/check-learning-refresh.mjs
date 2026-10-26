// Isolated API/socket fixtures. Start Vite on port 5175 before running.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL||'msedge'})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()
await page.clock.install({time:new Date('2026-10-26T16:59:58Z')}) // 23:59:58 UTC+7
let fail=true,day=0,completed=false,questCalls=0,socket
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
const profile={id:7,username:'alice',displayName:'Alice',role:'LEARNER',totalXp:0,level:1,xpInLevel:0,placementEligible:false}
const course={levels:[{id:1,title:'Nền tảng',outcome:'Học ngữ pháp',planetStyle:'mint',unlocked:true,passed:false,examReady:false,completedCount:0,lessonCount:1,modules:[{id:'m1',title:'Module 1',ordinalNo:1,levelId:1,unlocked:true,passed:false,lockReason:null,completedCount:0,lessonCount:1,lessons:[{id:'1.1',title:'Bài mẫu',ordinalNo:1,status:'NOT_STARTED'}]}]}]}
await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/auth/me'))return route.fulfill({json:profile})
  if(path.endsWith('/daily-quests')){
    questCalls++
    if(fail)return route.fulfill({status:503,json:{message:'Mất kết nối tạm thời'}})
    return route.fulfill({json:{quests:[{id:day+1,code:'QUALITY',tier:'EASY',title:day?'Nhiệm vụ ngày mới':'Nhiệm vụ trước nửa đêm',description:'Học một bài',category:'PRACTICE',targetType:'QUALITY_STUDY',targetCount:1,currentProgress:0,rewardXp:20,icon:'Target',completed:false,claimed:false}],milestone:{totalQuests:1,completedQuests:0,allCompleted:false,claimed:false,rewardXp:50},streak:{currentStreak:completed?1:0,longestStreak:1,completedToday:completed}}})
  }
  if(path.endsWith('/daily-quests/streak'))return route.fulfill({json:{currentStreak:completed?1:0,longestStreak:1,completedToday:completed}})
  return route.fulfill({json:[]})
})
await page.routeWebSocket('**/api/ws-system',ws=>{
  socket=ws
  ws.onMessage(raw=>{
    const m=JSON.parse(raw);if(!m.requestId)return
    ws.send(JSON.stringify({requestId:m.requestId,action:m.action.startsWith('ROADMAP_')?'ROADMAP_COURSE_DATA':'ACCOUNT_DATA',payload:m.action==='ROADMAP_OPEN'?course:m.action==='ROADMAP_HISTORY'?[]:profile}))
  })
})
const changed=()=>socket.send(JSON.stringify({action:'ROADMAP_PROGRESS_CHANGED',payload:{changed:true}}))
try{
  await page.goto('http://127.0.0.1:5175/dashboard')
  await expect(page.getByRole('button',{name:'Thử lại nhiệm vụ',exact:true})).toBeVisible()
  fail=false
  await page.getByRole('button',{name:'Thử lại nhiệm vụ',exact:true}).click()
  await expect(page.getByText('Nhiệm vụ trước nửa đêm',{exact:true})).toBeVisible()
  fail=true;changed()
  await expect(page.getByRole('button',{name:'Thử lại nhiệm vụ',exact:true})).toBeVisible()
  await expect(page.getByText('Nhiệm vụ trước nửa đêm',{exact:true})).toBeVisible()
  fail=false
  await page.getByRole('button',{name:'Thử lại nhiệm vụ',exact:true}).click()
  await expect(page.getByRole('button',{name:'Thử lại nhiệm vụ',exact:true})).toHaveCount(0)
  day=1
  await page.clock.runFor(3000)
  await expect(page.getByText('Nhiệm vụ ngày mới',{exact:true})).toBeVisible()
  const before=questCalls
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect.poll(()=>questCalls).toBeGreaterThan(before)
  await page.goto('http://127.0.0.1:5175/profile')
  await expect(page.getByText('Đạt ít nhất 80% một bài học, ôn tập hoặc kiểm tra để giữ chuỗi hôm nay.',{exact:true})).toBeVisible()
  await expect(page.getByText('Chưa hoàn thành rương hôm nay',{exact:true})).toHaveCount(0)
  completed=true;changed()
  await expect(page.getByText('✓ Đã duy trì chuỗi hôm nay',{exact:true})).toBeVisible()
  completed=false
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Chuỗi 0 ngày',{exact:true})).toBeVisible()
  assert.deepEqual(errors,[])
  console.log('PASS: quest error recovery, UTC+7 midnight rollover, focus refresh and realtime profile streak')
}finally{await context.close();await browser.close()}
