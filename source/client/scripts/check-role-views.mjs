// UI smoke test với API/socket giả lập; không thay thế integration test MySQL.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL||'msedge'})
await mkdir('artifacts/role-views',{recursive:true})
const now=Date.now()
const classroom={id:1,name:'English A1',joinCode:'ABC123',teacherId:1,teacherName:'Cô Lan',memberCount:1,members:[{id:2,username:'student',displayName:'Học viên Minh',role:'LEARNER'}],assignments:[{id:1,title:'Ôn tập câu điều kiện',lessonTitle:'Câu điều kiện loại 1',lessonId:1,instructions:'Làm bài trước thứ Sáu',passPercent:80,dueAt:new Date(now+86400000).toISOString(),status:'PUBLISHED'}]}
async function open(role,path){
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/v1/**',route=>{
    const url=new URL(route.request().url()),p=url.pathname
    let data=[]
    if(p.endsWith('/auth/me'))data={id:1,username:role.toLowerCase(),displayName:'Cô Lan',role,totalXp:1250,level:2,xpInLevel:250}
    else if(p.endsWith('/admin/overview'))data={users:25,classes:4,openReports:2,questions:150}
    else if(p.endsWith('/admin/business'))data={finishedMatches:12,days:Array.from({length:14},(_,i)=>({date:`2026-10-${String(i+5).padStart(2,'0')}`,registrations:i%5,classes:i%3,matches:i%4}))}
    else if(p.endsWith('/admin/users'))data=[{id:1,username:'teacher',displayName:'Cô Lan',role:'TEACHER',locked:false,totalXp:1250,createdAt:new Date(now).toISOString()}]
    else if(p.endsWith('/admin/content'))data={lessons:[],questions:[]}
    else if(p.endsWith('/teacher/curriculum'))data={topics:[],lessons:[],questions:[]}
    else if(p.endsWith('/classes'))data=[classroom]
    else if(p.endsWith('/classes/1'))data=classroom
    return route.fulfill({json:data})
  })
  await page.routeWebSocket('**/api/ws-system',ws=>ws.onMessage(raw=>{
    const message=JSON.parse(raw)
    if(message.requestId){
      const snapshot=message.action==='CLASS_LIST'?{classes:[classroom]}:{classroom,messages:[]}
      const action=['CLASS_LIST','CLASS_OPEN','CLASS_RESULTS','CLASS_CLOSE_RESULTS'].includes(message.action)?'CLASS_SNAPSHOT':message.action.startsWith('CLASS_')?'CLASS_DATA':'EXAM_DATA'
      ws.send(JSON.stringify({action,payload:message.action==='CLASS_LESSONS'||message.action==='EXAM_LIST'?[]:snapshot,requestId:message.requestId}))
    }
    if(message.action==='AUTH')ws.send(JSON.stringify({action:'STATS_UPDATE',data:{connections:2,activeSockets:3,ram:145,heapCommitted:256,heapMax:4096,activeSnapshots:1,clients:[{sessionId:'test-socket-1',userId:2,username:'student',currentActivity:'LESSON_BOSS',page:'/attempts/9',topic:'Câu điều kiện',lesson:'Câu điều kiện loại 1',lastInteractionAt:now-90000,idleSeconds:90,activeAttemptId:9,allocatedQuestions:5,lastPongAt:now}],events:[{id:1,time:new Date(now).toISOString(),level:'INFO',message:"User 'student' mở socket"},{id:2,time:new Date(now).toISOString(),level:'WARNING',message:'Client nhàn rỗi 90 giây'}]}}))
  }))
  await page.routeWebSocket('**/ws',()=>{})
  await page.goto(`http://localhost:5175${path}`)
  return {page,context,errors}
}
try{
  for(const [role,path,file,heading] of [
    ['ADMIN','/system','system','Quản trị ứng dụng'],
    ['ADMIN','/admin','admin','Quản trị ứng dụng'],
    ['TEACHER','/classes?view=grades','teacher','Bảng điểm']
  ]){
    const {page,context,errors}=await open(role,path)
    await page.getByRole('heading',{name:heading,exact:true}).waitFor()
    if(file==='system'){
      await page.getByRole('heading',{name:'Quản lý Client',exact:true}).waitFor()
      if(new URL(page.url()).pathname!=='/admin')throw new Error('Legacy system route must redirect to admin')
      if(await page.locator('.sidebar').count()!==1)throw new Error('Merged admin must use learner-style sidebar')
    }
    if(file==='admin')await page.getByText('Hoạt động ứng dụng · 14 ngày',{exact:true}).waitFor()
    if(file==='teacher'){
      await page.getByRole('link',{name:/English A1/}).click()
      await page.getByRole('heading',{name:'English A1',exact:true}).waitFor()
      if(await page.locator('.class-members').isVisible())throw new Error('Grades should not show members panel')
      if(await page.locator('.chat-panel').isVisible())throw new Error('Grades should not show chat panel')
    }
    await page.screenshot({path:`artifacts/role-views/${file}.png`,fullPage:true})
    if(file==='system'){
      await page.setViewportSize({width:390,height:844})
      await page.screenshot({path:'artifacts/role-views/system-mobile.png',fullPage:true})
      if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw new Error('Mobile system overflows viewport')
    }
    if(errors.length)throw new Error(errors.join('\n'))
    console.log(`PASS ${role} ${path}`)
    await context.close()
  }
}finally{await browser.close()}
