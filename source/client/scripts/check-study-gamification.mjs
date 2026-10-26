// Run Vite on port 5175 first. The API and WebSocket are isolated fixtures.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL||'msedge'})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()
const errors=[]
page.on('pageerror',error=>errors.push(error.message))
let lessonPassed=false,modulePassed=false,nextId=1
const profile={id:7,username:'alice',displayName:'Alice',role:'LEARNER',totalXp:0,level:1,xpInLevel:0,placementEligible:false}
const makeAttempt=(kind,referenceId)=>({id:nextId++,kind,referenceId,title:kind==='LESSON'?'Bài mẫu':'Module nền tảng',levelId:1,status:'IN_PROGRESS',requiredCorrect:kind==='LESSON'?3:8,totalQuestions:kind==='LESSON'?3:10,answers:{},questions:Array.from({length:kind==='LESSON'?3:10},(_,i)=>({id:`q${i}`,prompt:`Câu hỏi ${i+1}`,options:['Đáp án A','Đáp án B','Đáp án C','Đáp án D'],lessonId:'1.1',lessonTitle:'Bài mẫu',moduleTitle:'Module nền tảng'}))})
let active=makeAttempt('LESSON','1.1')
const attempts=new Map([[active.id,active]])
const course=()=>({levels:[{id:1,title:'Nền tảng',outcome:'Nắm kiến thức nền tảng',planetStyle:'mint',unlocked:true,passed:false,examReady:false,completedCount:lessonPassed?1:0,lessonCount:2,modules:[
  {id:'m1',levelId:1,ordinalNo:1,title:'Module nền tảng',unlocked:true,passed:modulePassed,lockReason:null,completedCount:lessonPassed?1:0,lessonCount:1,lessons:[{id:'1.1',title:'Bài mẫu',ordinalNo:1,status:lessonPassed?'COMPLETED':'IN_PROGRESS'}]},
  {id:'m2',levelId:1,ordinalNo:2,title:'Module kế tiếp',unlocked:modulePassed,passed:false,lockReason:'Đạt kiểm tra module nền tảng',completedCount:0,lessonCount:1,lessons:[{id:'2.1',title:'Bài tiếp theo',ordinalNo:1,status:'NOT_STARTED'}]}
]}]})
const lesson=()=>({id:'1.1',title:'Bài mẫu',levelId:1,moduleId:'m1',moduleTitle:'Module nền tảng',completed:lessonPassed,nextLessonId:null,attempt:active,content:{objective:'Hiểu bài',prerequisites:[],sections:[],examples:[],mistakes:[],application:'Đặt câu',summary:'Ôn lại bài'}})
await page.route('**/api/v1/**',route=>{
  const path=new URL(route.request().url()).pathname
  return route.fulfill({json:path.endsWith('/auth/me')?profile:path.endsWith('/daily-quests')?{quests:[],milestone:{totalQuests:3,completedQuests:0,allCompleted:false,claimed:false,rewardXp:50},streak:{currentStreak:lessonPassed?1:0,longestStreak:1,completedToday:lessonPassed}}:[]})
})
await page.routeWebSocket('**/api/ws-system',ws=>ws.onMessage(raw=>{
  const message=JSON.parse(raw)
  if(!message.requestId)return
  const p=message.payload||{}
  let payload
  switch(message.action){
    case 'ACCOUNT_GET':payload=profile;break
    case 'ROADMAP_OPEN':payload=course();break
    case 'ROADMAP_LESSON':payload=lesson();break
    case 'ROADMAP_START':{
      const attempt=makeAttempt(p.kind,p.referenceId);attempts.set(attempt.id,attempt)
      if(p.kind==='LESSON')active=attempt
      payload=attempt;break
    }
    case 'ROADMAP_ATTEMPT':payload=attempts.get(p.attemptId);break
    case 'ROADMAP_SAVE':payload=attempts.get(p.attemptId);break
    case 'ROADMAP_SUBMIT':{
      const a=attempts.get(p.attemptId)
      a.answers=p.answers;a.correctCount=a.questions.filter(q=>p.answers[q.id]==='A').length
      const passed=a.correctCount>=a.requiredCorrect
      a.status=passed?(a.kind==='LESSON'?'COMPLETED':'PASSED'):'FAILED'
      a.awardedXp=passed?(a.kind==='LESSON'?20:50):0
      a.questions=a.questions.map(q=>({...q,correctOption:'A',answer:p.answers[q.id],correct:p.answers[q.id]==='A',explanation:'Giải thích mẫu'}))
      if(passed){if(a.kind==='LESSON')lessonPassed=true;else modulePassed=true;profile.totalXp+=a.awardedXp;profile.xpInLevel=profile.totalXp}
      payload=a
      ws.send(JSON.stringify({action:'ROADMAP_PROGRESS_CHANGED',payload:{changed:true}}))
      break
    }
    default:payload={}
  }
  ws.send(JSON.stringify({action:message.action.startsWith('ROADMAP_')?'ROADMAP_COURSE_DATA':'ACCOUNT_DATA',requestId:message.requestId,payload}))
}))
try{
  await page.goto('http://127.0.0.1:5175/roadmap?planet=level-1&module=m1&lesson=1.1')
  await expect(page.getByText('Đạt ít nhất 3/3 câu (80%) để hoàn thành. Thưởng lần đầu: 20 EXP.',{exact:true})).toBeVisible()
  for(const article of await page.locator('.study-question').all())await article.getByRole('radio').nth(1).check()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Chưa đạt · Hãy ôn và làm lại'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Bài tiếp theo'})).toHaveCount(0)
  await page.getByRole('button',{name:'Làm lại',exact:true}).click()
  for(const article of await page.locator('.study-question').all())await article.getByRole('radio').nth(0).check()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Đã hoàn thành bài học'})).toBeVisible()
  await expect(page.getByText('+20 EXP',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Quay lại module',exact:true}).last().click()
  await expect(page.getByRole('button',{name:/MODULE 2/})).toBeDisabled()
  await expect(page.getByRole('heading',{name:'Kiểm tra module',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Kiểm tra module',exact:true}).click()
  await expect(page.locator('.study-question')).toHaveCount(10)
  for(const article of await page.locator('.study-question').all())await article.getByRole('radio').nth(0).check()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Đã vượt qua module'})).toBeVisible()
  await expect(page.getByText('+50 EXP',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Quay lại lộ trình',exact:true}).last().click()
  await expect(page.getByRole('button',{name:/MODULE 2/})).toBeEnabled()
  assert.deepEqual(errors,[])
  console.log('PASS: failed lessons remain incomplete, retry awards EXP, module exam gates the next module, and results show awarded EXP')
}finally{await context.close();await browser.close()}
