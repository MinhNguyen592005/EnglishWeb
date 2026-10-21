// Không mock HTTP/WebSocket: kết nối Spring Boot/MySQL tạm do FullRealtimeIntegrationTest cấp.
import {chromium} from 'playwright'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
let fixture
for(let i=0;i<120;i++){try{fixture=JSON.parse(await readFile('artifacts/real-backend/connection.json','utf8'));break}catch{await new Promise(r=>setTimeout(r,500))}}
if(!fixture)throw new Error('Run Maven with RUN_FULL_REALTIME_TEST=true and RUN_BROWSER_REALTIME_TEST=true first')
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5177','--strictPort'],{env:{...process.env,VITE_SERVER_PROXY:fixture.base},windowsHide:true,stdio:'pipe'})
let browser
try{
  for(let i=0;i<40;i++){try{if((await fetch('http://localhost:5177')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
  browser=await chromium.launch({headless:true,channel:'msedge'})
  const context=await browser.newContext(),page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await context.addInitScript(()=>{
    const original=WebSocket.prototype.send,dropped=new Set()
    WebSocket.prototype.send=function(data){
      try{const message=JSON.parse(data);if(['GET_ROADMAP','GET_ATTEMPT','VIEW_LESSON_THEORY'].includes(message.action)&&!dropped.has(message.action)){dropped.add(message.action);this.close(4002,'test disconnect before response');return}}catch{}
      return original.call(this,data)
    }
  })
  await page.goto('http://localhost:5177/login')
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(fixture.username)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(fixture.password)
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
  await page.waitForURL('**/dashboard')
  await page.goto('http://localhost:5177/roadmap')
  await page.getByRole('heading',{name:'Du hành qua các hành tinh ngữ pháp',exact:true}).waitFor({timeout:20000})
  const attempt=await page.evaluate(async()=>{
    const lessons=await (await fetch('/api/v1/lessons',{credentials:'include'})).json()
    const lesson=lessons.find(l=>l.status==='AVAILABLE');if(!lesson)throw new Error('No available lesson')
    const csrf=await(await fetch('/api/v1/auth/csrf',{credentials:'include'})).json()
    const response=await fetch('/api/v1/attempts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-XSRF-TOKEN':csrf.token},body:JSON.stringify({kind:'PRACTICE',lessonId:lesson.id})})
    if(!response.ok)throw new Error(await response.text());return response.json()
  })
  await page.goto(`http://localhost:5177/attempts/${attempt.id}`)
  await page.getByRole('heading',{name:'Trạm luyện tập',exact:true}).waitFor({timeout:20000})
  await page.getByRole('radio').first().check()
  await page.getByRole('button',{name:'Xác nhận đáp án',exact:true}).click()
  await page.locator('.feedback').waitFor()
  const second=await context.newPage();await second.goto('http://localhost:5177/profile');await second.getByRole('heading',{name:fixture.username,exact:true}).waitFor()
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click()
  await page.waitForURL('**/login');await second.waitForURL('**/login',{timeout:10000})
  await second.getByRole('alert').getByText('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  await mkdir('artifacts/role-views',{recursive:true});await second.screenshot({path:'artifacts/role-views/real-session-logout.png',fullPage:true})
  await writeFile('artifacts/real-backend/result.json',JSON.stringify({passed:true}))
  console.log('PASS REAL BACKEND: login, roadmap and attempt recover after dropped requests; answer persisted; logout closes another tab')
}catch(error){await writeFile('artifacts/real-backend/result.json',JSON.stringify({passed:false,error:String(error)}));throw error}
finally{if(browser)await browser.close();vite.kill()}
