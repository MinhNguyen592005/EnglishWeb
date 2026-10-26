import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'

const browser=await chromium.launch({headless:true,channel:'msedge'})
const sockets=[],errors=[]
const question={id:9,lessonId:1,prompt:'Moderation test question',optionA:'A',optionB:'B',optionC:'C',optionD:'D',correctOption:'A',explanation:'Explanation',questionType:'MCQ',acceptedAnswer:null,active:true,adminBlocked:false}
const lesson={id:'1.1',title:'Study moderation lesson',moduleId:'l1-m1',levelId:1,published:true,content:{objective:'Read this theory',sections:[{title:'Theory',body:'Course content'}]}}
const studyQuestion={id:'q1',lessonId:'1.1',prompt:'Embedded study question',options:['A','B','C','D'],correctOption:'A',explanation:'Study explanation',published:true}
const examQuestion={id:'exam-1',moduleId:'l1-m1',prompt:'Module exam question',options:'["A","B","C","D"]',correctOption:'B',explanation:'Exam explanation',published:true}
const broadcast=()=>sockets.forEach(ws=>ws.send(JSON.stringify({action:'CURRICULUM_CHANGED',payload:{changed:true}})))
async function open(role,path){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/v1/**',async route=>{
    const p=new URL(route.request().url()).pathname,method=route.request().method()
    let data=[]
    if(p.endsWith('/auth/csrf'))data={token:'test-csrf'}
    else if(p.endsWith('/auth/me'))data={id:role==='ADMIN'?1:2,username:role.toLowerCase(),displayName:role,role,totalXp:0,level:1,xpInLevel:0}
    else if(p.endsWith('/admin/study-content')){
      if(method==='PATCH'){
        const body=route.request().postDataJSON()
        const target=body.kind==='LESSON'?lesson:body.kind==='QUESTION'?studyQuestion:examQuestion
        target.published=body.published;data={published:body.published};broadcast()
      }else data={lessons:[lesson],questions:[studyQuestion],examQuestions:[examQuestion]}
    }else if(p.endsWith('/admin/content'))data={lessons:[],questions:[{...question,ownerId:2,published:!question.adminBlocked}]}
    else if(p.endsWith('/admin/questions/9/publication')){question.adminBlocked=!route.request().postDataJSON().published;data={id:9};broadcast()}
    else if(p.endsWith('/teacher/questions'))data=[question]
    else if(p.endsWith('/teacher/curriculum'))data={topics:[],lessons:[],questions:[]}
    else if(p.endsWith('/classes'))data=[]
    return route.fulfill({json:data})
  })
  await page.routeWebSocket('**/api/ws-system',ws=>{
    sockets.push(ws)
    ws.onMessage(raw=>{const m=JSON.parse(raw);if(m.requestId)ws.send(JSON.stringify({action:m.action==='CLIENT_ACTIVITY'?'ACTIVITY_UPDATED':'WORKSPACE_DATA',requestId:m.requestId,payload:{}}))})
  })
  await page.goto(`http://localhost:5175${path}`)
  return page
}
try{
  const admin=await open('ADMIN','/admin?tab=content'),otherAdmin=await open('ADMIN','/admin?tab=content'),teacher=await open('TEACHER','/teacher/questions')
  await admin.getByRole('heading',{name:'Kiểm duyệt lộ trình 5 level',exact:true}).waitFor()
  const row=page=>page.getByRole('row').filter({hasText:'Moderation test question'})
  await teacher.getByRole('button',{name:'L\u01b0u tr\u1eef',exact:true}).waitFor()
  await row(otherAdmin).getByRole('button',{name:'\u1ea8n',exact:true}).waitFor()
  await row(admin).getByRole('button',{name:'Ẩn',exact:true}).click()
  await teacher.getByRole('button',{name:'Bị admin chặn',exact:true}).waitFor()
  assert.equal(await teacher.getByRole('button',{name:'Bị admin chặn',exact:true}).isDisabled(),true)
  await row(otherAdmin).getByRole('button',{name:'Mở',exact:true}).waitFor()
  await row(admin).getByRole('button',{name:'Mở',exact:true}).click()
  await teacher.getByRole('button',{name:'Lưu trữ',exact:true}).waitFor()
  for(const title of ['Study moderation lesson','Embedded study question','Module exam question']){
    const target=admin.getByRole('row').filter({hasText:title})
    admin.once('dialog',dialog=>dialog.accept())
    await target.getByRole('button',{name:'Ẩn',exact:true}).click()
    await otherAdmin.getByRole('row').filter({hasText:title}).getByRole('button',{name:'Mở lại',exact:true}).waitFor()
    await target.getByRole('button',{name:'Mở lại',exact:true}).click()
  }
  await admin.setViewportSize({width:390,height:844})
  await mkdir('artifacts/role-views',{recursive:true})
  await admin.screenshot({path:'artifacts/role-views/admin-moderation-mobile.png',fullPage:true})
  assert.deepEqual(errors,[])
  console.log('PASS: admin blocks/unblocks private questions; teacher and second admin synchronize; study lesson, practice and exam question moderation synchronize; mobile page renders without runtime errors')
}finally{await browser.close()}
