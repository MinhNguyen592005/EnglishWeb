// Socket giả lập cho kiểm thử trình duyệt; SQL/transaction thật nằm ở ClassroomSocketIntegrationTest.
import {chromium} from 'playwright'
import {mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,channel:'msedge'})
const errors=[],rest=[],actions=[],socketPaths=[]
const sockets=new Map()
let classroom=null,messages=[],results=[],attempt=null
const student={id:2,username:'alice',displayName:'Alice',role:'LEARNER'}
function snapshot(entry){
  if(entry.watch==='list')return {classes:classroom&&(entry.user.id===1||classroom.members.some(m=>m.id===entry.user.id))?[{...classroom,memberCount:classroom.members.length}]:[]}
  const data={classroom:structuredClone(classroom),messages:structuredClone(messages)}
  if(entry.results){data.assignmentId=1;data.results=structuredClone(results)}return data
}
function broadcast(){for(const entry of sockets.values()){
  if(!entry.watch)continue
  if(entry.watch==='class'&&entry.user.id!==1&&!classroom.members.some(m=>m.id===entry.user.id)){
    entry.watch=null;entry.ws.send(JSON.stringify({action:'CLASS_ERROR',payload:{message:'Bạn không còn là thành viên lớp học'}}));continue
  }
  entry.ws.send(JSON.stringify({action:'CLASS_UPDATE',payload:snapshot(entry)}))
}}
async function pageFor(user){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  page.on('dialog',dialog=>dialog.accept('Test report'))
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname
    if(path.includes('/classes')||path.endsWith('/lessons'))rest.push(path)
    return route.fulfill({json:path.endsWith('/auth/me')?{...user,totalXp:0,level:1,xpInLevel:0}:[]})
  })
  await page.routeWebSocket('**/ws',ws=>{socketPaths.push('/ws');ws.close()})
  await page.routeWebSocket('**/api/ws-system',ws=>{
    socketPaths.push('/api/ws-system')
    const entry={ws,user,watch:null,results:false};sockets.set(user.id,entry)
    ws.onMessage(raw=>{
      const m=JSON.parse(raw);actions.push(m.action);const p=m.payload||{};let action='CLASS_DATA',payload={}
      switch(m.action){
        case 'AUTH':case 'CLIENT_INTERACTION':return
        case 'CLIENT_ACTIVITY':action='ACTIVITY_UPDATED';break
        case 'ACCOUNT_GET':action='ACCOUNT_DATA';payload={...user,totalXp:0,level:1,xpInLevel:0};break
        case 'CLASS_LIST':entry.watch='list';entry.results=false;action='CLASS_SNAPSHOT';payload=snapshot(entry);break
        case 'CLASS_OPEN':case 'CLASS_RESULTS':case 'CLASS_CLOSE_RESULTS':entry.watch='class';entry.results=m.action==='CLASS_RESULTS';action='CLASS_SNAPSHOT';payload=snapshot(entry);break
        case 'CLASS_UNWATCH':entry.watch=null;break
        case 'CLASS_LESSONS':payload=[{id:1,title:'Lesson one'}];break
        case 'CLASS_CREATE':classroom={id:1,name:p.name,joinCode:'LIVE123',teacherId:1,teacherName:'Teacher',members:[],assignments:[]};payload=classroom;broadcast();break
        case 'CLASS_JOIN':classroom.members=[student];payload=classroom;broadcast();break
        case 'CLASS_RENAME':classroom.name=p.name;payload=classroom;broadcast();break
        case 'CLASS_CHAT':{const msg={id:messages.length+1,userId:user.id,displayName:user.displayName,body:p.body,createdAt:new Date().toISOString()};messages.push(msg);payload=msg;broadcast();break}
        case 'CLASS_ASSIGN':{const a={...p,id:1,lessonTitle:'Lesson one',status:'PUBLISHED'};classroom.assignments=[a];payload=a;broadcast();break}
        case 'CLASS_UPDATE_ASSIGNMENT':classroom.assignments=[{...classroom.assignments[0],...p}];payload=classroom.assignments[0];broadcast();break
        case 'CLASS_START_ASSIGNMENT':attempt={id:9,kind:'PRACTICE',status:'IN_PROGRESS',lessonId:1,totalQuestions:1,requiredCorrect:1,correctCount:0,bossHp:0,awardedXp:0,questions:[{ordinalNo:1,questionType:'MCQ',prompt:'Socket assignment question',options:['Answer A','Answer B','Answer C','Answer D'],answer:null}]};payload=attempt;results=[{userId:2,displayName:'Alice',attemptId:9,status:'IN_PROGRESS',correctCount:0,totalQuestions:1,completedAt:null,passed:false}];broadcast();break
        case 'GET_ATTEMPT':action='ATTEMPT_DATA';payload=attempt;break
        case 'SUBMIT_ANSWER':action='ANSWER_RESULT';payload={ordinalNo:1,correct:true,correctOption:'A',explanation:'Correct',correctCount:1,bossHp:0,finished:true,won:true,awardedXp:0};results=[{...results[0],correctCount:1,status:'WON',passed:true,completedAt:new Date().toISOString()}];broadcast();break
        case 'CLASS_REMOVE_MEMBER':classroom.members=[];payload={removed:true};broadcast();break
        case 'EXAM_LIST':action='EXAM_DATA';payload=[];break
        case 'EXAM_UNWATCH':action='EXAM_DATA';break
      }
      if(m.requestId)ws.send(JSON.stringify({action,payload:structuredClone(payload),requestId:m.requestId}))
    })
  })
  await page.goto('http://localhost:5175/classes')
  return page
}
try{
  const teacher=await pageFor({id:1,username:'teacher',displayName:'Teacher',role:'TEACHER'})
  await teacher.getByRole('textbox',{name:'Tên lớp',exact:true}).fill('English socket class')
  await teacher.getByRole('button',{name:'Tạo lớp',exact:true}).click()
  await teacher.getByRole('heading',{name:'English socket class',exact:true}).waitFor()
  const alice=await pageFor(student)
  await alice.getByRole('textbox',{name:'Mã lớp',exact:true}).fill('LIVE123')
  await alice.getByRole('button',{name:'Tham gia',exact:true}).click()
  await teacher.locator('.class-members').getByText('Alice',{exact:true}).waitFor()
  await teacher.getByRole('textbox',{name:'Tên lớp',exact:true}).fill('Renamed live class')
  await teacher.getByRole('button',{name:'Đổi tên lớp',exact:true}).click()
  await alice.getByRole('heading',{name:'Renamed live class',exact:true}).waitFor()
  await alice.getByRole('textbox',{name:'Tin nhắn lớp',exact:true}).fill('Hello through shared socket')
  await alice.locator('.chat-panel').getByRole('button',{name:'Gửi',exact:true}).click()
  await teacher.getByText('Hello through shared socket',{exact:true}).waitFor()
  const form=teacher.locator('.class-new-assignment')
  await form.locator('input').nth(0).fill('Live homework')
  await form.locator('select').selectOption('1')
  await form.locator('input[type=datetime-local]').fill('2030-01-01T12:00')
  await form.getByRole('button',{name:'Giao bài',exact:true}).click()
  await alice.locator('.class-assignments').getByText('Live homework',{exact:true}).waitFor()
  await teacher.getByRole('button',{name:'Kết quả',exact:true}).click()
  await alice.getByRole('button',{name:'Làm bài',exact:true}).click()
  await alice.getByRole('radio',{name:/Answer A/}).check()
  await alice.getByRole('button',{name:'Xác nhận đáp án',exact:true}).click()
  await teacher.locator('.class-results').getByText('1/1 · Đạt',{exact:true}).waitFor()
  await alice.goto('http://localhost:5175/classes/1')
  await alice.getByRole('heading',{name:'Renamed live class',exact:true}).waitFor()
  await teacher.locator('.class-assignments').getByRole('button',{name:'Sửa',exact:true}).click()
  await teacher.getByRole('dialog').locator('select').selectOption('CLOSED')
  await teacher.getByRole('dialog').getByRole('button',{name:'Lưu',exact:true}).click()
  await alice.waitForFunction(()=>document.querySelector('.class-assignments button')?.disabled)
  await teacher.locator('.class-members').getByRole('button',{name:'Xóa khỏi lớp',exact:true}).click()
  await alice.getByRole('alert').getByText('Bạn không còn là thành viên lớp học',{exact:true}).waitFor()
  await teacher.locator('.class-results').getByText('0/0 học viên đã nộp · 0 đạt',{exact:true}).waitFor()
  assert.equal(await alice.locator('.chat-panel').count(),0)
  assert.deepEqual(rest,[]);assert.deepEqual(errors,[])
  assert.equal(socketPaths.filter(path=>path==='/ws').length,0)
  await mkdir('artifacts/role-views',{recursive:true})
  await teacher.screenshot({path:'artifacts/role-views/classroom-websocket.png',fullPage:true})
  console.log('PASS: create/join, member and rename push, chat, assignment start/answer/live results, close, removal; zero classroom REST or STOMP sockets')
  console.log([...new Set(actions)].join(', '))
}finally{await browser.close()}
