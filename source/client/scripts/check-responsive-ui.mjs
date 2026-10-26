import {chromium} from 'playwright'
import {mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'

const browser=await chromium.launch({headless:true,channel:'msedge'})
await mkdir('artifacts/responsive',{recursive:true})
const longName='Người học có tên hiển thị rất dài để kiểm tra bố cục trên điện thoại'
const longToken='GrammarQuest'.repeat(14)
const lesson={id:1,topicSlug:'basic-tenses',title:'Bài học có tên dài trên thiết bị di động',summary:longToken,theory:longToken,difficulty:'BEGINNER',ordinalNo:1,published:true}
const question={id:9,lessonId:1,prompt:longToken,optionA:longToken,optionB:'B',optionC:'C',optionD:'D',correctOption:'A',explanation:longToken,questionType:'MCQ',acceptedAnswer:null,active:true,published:true,ownerId:2}
const classroom={id:1,name:longName,joinCode:'ABC123',teacherId:2,teacherName:longName,members:[{id:3,username:longToken,displayName:longName,role:'LEARNER'}],assignments:[]}
const findings=[]
try{
  for(const [role,path,name] of [['ADMIN','/admin?tab=users','admin-users'],['ADMIN','/admin?tab=content','admin-content'],['TEACHER','/teacher/questions','teacher-questions'],['TEACHER','/teacher/curriculum','teacher-curriculum'],['TEACHER','/classes/1?view=members','members'],[null,'/login','login'],[null,'/register','register']]){
    const context=await browser.newContext(),page=await context.newPage(),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/v1/**',route=>{
      const p=new URL(route.request().url()).pathname
      let data=[]
      if(p.endsWith('/auth/me'))return role?route.fulfill({json:{id:2,username:'fixture',displayName:longName,role,totalXp:0,level:1,xpInLevel:0}}):route.fulfill({status:401,json:{message:'Unauthenticated'}})
      if(p.endsWith('/auth/csrf'))data={token:'test'}
      else if(p.endsWith('/admin/users'))data=[{id:3,username:longToken,displayName:longName,role:'LEARNER',totalXp:0,locked:false,createdAt:new Date().toISOString()}]
      else if(p.endsWith('/admin/content'))data={lessons:[lesson],questions:[question]}
      else if(p.endsWith('/admin/study-content'))data={lessons:[],questions:[],examQuestions:[]}
      else if(p.endsWith('/teacher/questions'))data=[question]
      else if(p.endsWith('/teacher/curriculum'))data={topics:[{slug:'basic-tenses',title:longName,description:longToken,outcome:longToken,sortOrder:1,planetStyle:'aqua',published:true}],lessons:[lesson],questions:[question]}
      else if(p.endsWith('/classes'))data=[classroom]
      else if(p.endsWith('/classes/1'))data=classroom
      else if(p.endsWith('/lessons'))data=[lesson]
      return route.fulfill({json:data})
    })
    await page.routeWebSocket('**/api/ws-system',ws=>ws.onMessage(raw=>{
      const m=JSON.parse(raw);if(!m.requestId)return
      const payload=m.action==='CLASS_OPEN'?{classroom,messages:[]}:m.action==='CLASS_LESSONS'?[lesson]:m.action==='EXAM_LIST'?[]:{}
      ws.send(JSON.stringify({requestId:m.requestId,action:m.action==='CLASS_OPEN'?'CLASS_SNAPSHOT':m.action.startsWith('CLASS_')?'CLASS_DATA':m.action==='CLIENT_ACTIVITY'?'ACTIVITY_UPDATED':'EXAM_DATA',payload}))
    }))
    await page.goto(`http://localhost:5175${path}`)
    await page.locator(role?'main':'form').waitFor()
    if(role==='ADMIN')await page.locator('tbody tr').first().waitFor()
    if(name==='teacher-questions')await page.locator('.question-item-row').waitFor()
    if(name==='members')await page.locator('.member-row').first().waitFor()
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:844})
      const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}))
      findings.push({name,...overflow,errors:[...errors]})
      if(width===320)await page.screenshot({path:`artifacts/responsive/${name}-320.png`,fullPage:true})
    }
    if(name==='teacher-questions'){
      await page.setViewportSize({width:390,height:844})
      assert.equal(await page.locator('.sidebar').evaluate(el=>el.inert),true,'Closed mobile sidebar cannot receive focus')
      await page.getByRole('button',{name:'Mở menu',exact:true}).click()
      await page.waitForFunction(()=>document.body.style.overflow==='hidden')
      const support=page.locator('.support-bubble')
      const bubbleBox=await support.boundingBox()
      assert.ok(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.backdrop'),{x:bubbleBox.x+bubbleBox.width/2,y:bubbleBox.y+bubbleBox.height/2}),'Menu backdrop covers support widget')
      const sidebarLinks=page.locator('.sidebar a')
      await sidebarLinks.last().focus()
      await page.keyboard.press('Tab')
      assert.equal(await sidebarLinks.first().evaluate(el=>el===document.activeElement),true,'Tab stays within navigation')
      await page.keyboard.press('Escape')
      await page.waitForFunction(()=>!document.querySelector('.sidebar').classList.contains('open'))
      findings.push({name:'menu-escape',closed:!(await page.locator('.sidebar').evaluate(el=>el.classList.contains('open')))})
      assert.equal(await page.getByRole('button',{name:'Mở menu',exact:true}).evaluate(el=>el===document.activeElement),true,'Focus returns to menu trigger')
      assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','Closing menu restores page scroll')
      await page.getByRole('button',{name:'Kiểm tra lớp',exact:true}).click()
      await page.locator('.modal-backdrop').waitFor()
      assert.ok(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.modal-backdrop'),{x:bubbleBox.x+bubbleBox.width/2,y:bubbleBox.y+bubbleBox.height/2}),'Modal covers support widget')
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile exam modal fits viewport')
      await page.screenshot({path:'artifacts/responsive/teacher-exam-modal-390.png',fullPage:true})
    }
    await context.close()
  }
  console.log(JSON.stringify(findings,null,2))
  if(process.env.ASSERT_RESPONSIVE!=='false'){
    for(const finding of findings){if('width' in finding)assert.ok(finding.width<=finding.viewport+1,`${finding.name}: ${finding.width} > ${finding.viewport}`);if('closed' in finding)assert.ok(finding.closed,'Escape closes mobile navigation');if(finding.errors)assert.deepEqual(finding.errors,[])}
  }
}finally{await browser.close()}

