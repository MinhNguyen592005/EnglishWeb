// Real registration, authenticated sockets and a disposable placement_ui_* learner.
import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const base=process.env.STUDY_UI_BASE||'http://127.0.0.1:5173'
const schema=process.env.STUDY_UI_DATABASE||'grammar_quest'
if(schema!=='grammar_quest'||!process.env.DB_USERNAME||!process.env.DB_PASSWORD)throw new Error('Load the local development DB configuration first')
const username=`placement_ui_${randomUUID().replaceAll('-','').slice(0,12)}`,password='PlacementBrowser123!'
function sql(query){
  const result=spawnSync('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',[
    `--host=${process.env.DB_HOST||'localhost'}`,`--port=${process.env.DB_PORT||'3306'}`,`--user=${process.env.DB_USERNAME}`,`--database=${schema}`,'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names',`--execute=${query}`
  ],{encoding:'utf8',windowsHide:true,env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD}})
  if(result.status!==0)throw new Error('Could not access isolated placement UI fixture')
  return result.stdout.trim()
}
const browser=await chromium.launch({channel:process.env.UI_BROWSER_CHANNEL||'msedge',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
context.setDefaultTimeout(15000)
context.setDefaultNavigationTimeout(60000)
await context.addInitScript(()=>{
  const send=WebSocket.prototype.send
  WebSocket.prototype.send=function(data){
    if(window.__dropNextPlacementSave&&typeof data==='string'&&JSON.parse(data).action==='PLACEMENT_SAVE'){
      window.__dropNextPlacementSave=false;this.close();return
    }
    return send.call(this,data)
  }
})
let fixtureId
try{
  const page=await context.newPage(),errors=[],messages=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('websocket',ws=>ws.on('framereceived',frame=>{
    try{const m=JSON.parse(frame.payload.toString());messages.push(m);if(m.action==='PLACEMENT_DATA'){
      for(const q of m.payload?.questions??[]){assert.equal(q.correctOption,undefined);assert.equal(q.explanation,undefined)}
      if(m.payload?.status==='COMPLETED')for(const key of ['questions','answers','correctOption','explanation'])assert.equal(m.payload[key],undefined)
    }}catch(e){errors.push(e.message)}
  }))
  await page.goto(`${base}/register`,{waitUntil:'domcontentloaded'})
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username)
  await page.getByLabel('Tên hiển thị',{exact:true}).fill('Kiểm tra đầu vào UI')
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Đăng ký',exact:true}).click()
  await page.waitForURL('**/placement')
  const popup=page.getByRole('dialog',{name:'Chào mừng bạn đến với hành trình học tiếng Anh! 👋',exact:true})
  await popup.waitFor()
  fixtureId=Number(sql(`SELECT id FROM users WHERE username='${username}'`));assert.ok(Number.isSafeInteger(fixtureId)&&fixtureId>0)
  assert.equal(await page.locator('.study-question,.sidebar,.mobile-nav,.support-widget').count(),0)
  assert.equal(Number(sql(`SELECT COUNT(*) FROM study_entry_attempts WHERE user_id=${fixtureId}`)),0)
  assert.equal(await popup.getByRole('button',{name:'Tiếp tục',exact:true}).isEnabled(),true)
  await mkdir('artifacts/placement',{recursive:true})
  await page.screenshot({path:'artifacts/placement/desktop-welcome.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:'artifacts/placement/mobile-welcome.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  assert.equal(await popup.locator('input:not([type=radio]),textarea,select').count(),0)
  await popup.getByText('18–24.',{exact:true}).click()
  await popup.getByRole('button',{name:'Tiếp tục',exact:true}).click()
  await popup.getByRole('heading',{name:'Bạn thấy trình độ hiện tại của mình thế nào?',exact:true}).waitFor()
  await page.waitForFunction(()=>document.querySelector('.placement-welcome-step')?.getAttribute('data-phase')==='idle')
  await popup.getByText('Đã có nền tảng.',{exact:true}).click()
  await popup.getByRole('button',{name:'Tiếp tục',exact:true}).click()
  await popup.getByRole('heading',{name:'Bạn dự định học bao lâu mỗi ngày?',exact:true}).waitFor()
  await page.waitForFunction(()=>document.querySelector('.placement-welcome-step')?.getAttribute('data-phase')==='idle')
  await popup.getByText('Trên 1 giờ.',{exact:true}).click()
  await popup.getByRole('button',{name:'Xác nhận và làm bài kiểm tra',exact:true}).click()
  await page.locator('.study-question').nth(9).waitFor()
  assert.equal(await page.locator('.placement-welcome,.sidebar,.mobile-nav,.support-widget').count(),0)
  assert.equal(sql(`SELECT onboarding_json IS NULL AND placement_accepted_at IS NULL FROM study_entry_profiles WHERE user_id=${fixtureId}`),'1')
  await page.setViewportSize({width:1440,height:1000})
  assert.equal(await page.locator('.study-question').count(),10)
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Bạn chưa trả lời câu: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10'}).waitFor()
  const initial=messages.findLast(m=>m.action==='PLACEMENT_DATA'&&m.payload?.questions)?.payload
  assert.ok(initial);assert.equal(new Set(initial.questions.map(q=>q.id)).size,10)
  assert.deepEqual([1,2,3,4,5].map(level=>initial.questions.filter(q=>q.level===level).length),[3,3,2,1,1])
  await page.locator('.study-question').first().getByRole('radio').nth(0).check()
  await page.locator('.study-question').first().getByRole('radio').nth(1).check()
  await page.waitForFunction(()=>!document.querySelector('.study-quiz-heading [role=status]')?.textContent.includes('Đang lưu'))
  assert.equal(JSON.parse(sql(`SELECT answers_json FROM study_entry_attempts WHERE user_id=${fixtureId}`))[initial.questions[0].id],'B')
  // Drop one draft frame before it reaches the server; reconnect must retry it.
  await page.evaluate(()=>{window.__dropNextPlacementSave=true})
  await page.locator('.study-question').first().getByRole('radio').nth(2).check()
  await page.getByText('Chưa lưu được thay đổi.',{exact:false}).waitFor()
  await page.waitForFunction(()=>document.querySelector('.study-quiz-heading [role=status]')?.textContent==='Câu trả lời được lưu tự động.'&&!document.querySelector('.study-question fieldset')?.disabled)
  assert.equal(JSON.parse(sql(`SELECT answers_json FROM study_entry_attempts WHERE user_id=${fixtureId}`))[initial.questions[0].id],'C')
  await page.locator('.study-question').first().getByRole('radio').nth(1).check()
  await page.waitForFunction(()=>!document.querySelector('.study-quiz-heading [role=status]')?.textContent.includes('Đang lưu'))
  await page.reload();await page.locator('.study-question').nth(9).waitFor()
  const resumed=messages.findLast(m=>m.action==='PLACEMENT_DATA'&&m.payload?.questions)?.payload
  assert.equal(resumed.attemptId,initial.attemptId);assert.deepEqual(resumed.questions,initial.questions)
  assert.equal(await page.locator('.study-question').first().getByRole('radio').nth(1).isChecked(),true)
  await page.goto(`${base}/roadmap?planet=level-5&module=l5-m1`)
  await page.waitForURL('**/placement');await page.locator('.study-question').nth(9).waitFor()
  const second=await context.newPage();await second.goto(`${base}/placement`);await second.locator('.study-question').nth(9).waitFor()
  const questions=JSON.parse(sql(`SELECT questions_json FROM study_entry_attempts WHERE user_id=${fixtureId}`))
  for(let i=0;i<10;i++){const choice=i<9?'ABCD'.indexOf(questions[i].correctOption):questions[i].correctOption==='A'?1:0;await page.locator('.study-question').nth(i).getByRole('radio').nth(choice).check()}
  await mkdir('artifacts/placement',{recursive:true})
  await page.screenshot({path:'artifacts/placement/desktop-exam.png',fullPage:true})
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await page.getByRole('heading',{name:'9/10 câu đúng',exact:true}).waitFor()
  await second.getByRole('heading',{name:'9/10 câu đúng',exact:true}).waitFor()
  assert.equal(await page.locator('.study-question,input[type=radio],.feedback').count(),0)
  assert.equal(await page.locator('.placement-result').getByRole('link').count(),1)
  await page.getByText('Bạn đã vượt qua Level 1 và Level 2 trong bài kiểm tra đầu vào. Bạn sẽ bắt đầu học từ Level 3.',{exact:true}).waitFor()
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:'artifacts/placement/mobile-result.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
  await page.reload();await page.getByRole('heading',{name:'9/10 câu đúng',exact:true}).waitFor()
  assert.equal(await page.locator('.study-question').count(),0)
  await page.getByRole('link',{name:'Bắt đầu học',exact:true}).click()
  await page.waitForURL(/planet=level-3&module=/)
  await page.locator('.study-module-detail').waitFor()
  assert.equal(await page.locator('.planet-button:disabled').count(),2)
  assert.equal(await page.locator('.study-module-tab:disabled').count(),5)
  assert.equal(Number(sql(`SELECT COUNT(*) FROM study_progress WHERE user_id=${fixtureId}`)),0)
  await page.locator('.planet-button').nth(0).click()
  await page.waitForURL(/planet=level-1$/)
  await page.waitForFunction(()=>document.querySelector('.planet-button')?.getAttribute('aria-pressed')==='true')
  assert.equal(await page.locator('.study-module-tab:disabled').count(),0)
  await page.locator('.study-module-tab').last().click()
  await page.getByRole('button',{name:'Bắt đầu',exact:true}).first().click()
  await page.locator('.study-theory').waitFor()
  const lockedLesson=sql('SELECT l.id FROM study_lessons l JOIN study_modules m ON m.id=l.module_id WHERE m.level_id=4 ORDER BY m.ordinal_no,l.ordinal_no LIMIT 1')
  await page.goto(`${base}/roadmap?planet=level-4&module=l4-m1&lesson=${encodeURIComponent(lockedLesson)}`)
  await page.getByRole('alert').filter({hasText:/level trước/}).waitFor()
  await page.goto(`${base}/roadmap?planet=level-3`)
  await page.locator('.study-module-tab').first().click()
  await page.getByRole('button',{name:'Bắt đầu',exact:true}).first().click()
  await page.locator('.study-theory').waitFor()
  const lessonPath=new URL(page.url()).pathname+new URL(page.url()).search
  await page.getByRole('button',{name:'Đăng xuất',exact:true}).click()
  await page.waitForURL('**/login')
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
  await page.waitForURL(`${base}${lessonPath}`);await page.locator('.study-theory').waitFor()
  assert.equal(Number(sql(`SELECT COUNT(*) FROM study_entry_attempts WHERE user_id=${fixtureId}`)),1)
  assert.deepEqual(errors,[])
  console.log('PASS: registration-only welcome popup; choices never persisted; desktop/mobile; registration redirect; 3/3/2/1/1; no answer leak; missing answers; dropped draft retries after reconnect; draft edits/reload; 9/10 => Level 3; minimal result across tabs/reload; review access; server lock; login resumes lesson.')
}finally{
  await context.close();await browser.close()
  // Registration may finish even if the UI fails; locate only our exact random fixture.
  if(!fixtureId)fixtureId=Number(sql(`SELECT id FROM users WHERE username='${username}'`))
  if(Number.isSafeInteger(fixtureId)&&fixtureId>0&&/^placement_ui_[a-f0-9]{12}$/.test(username)){
    assert.equal(Number(sql(`SELECT id FROM users WHERE id=${fixtureId} AND username='${username}'`)),fixtureId)
    sql(`DELETE FROM study_entry_attempts WHERE user_id=${fixtureId}; DELETE FROM study_entry_profiles WHERE user_id=${fixtureId}; DELETE FROM study_attempts WHERE user_id=${fixtureId}; DELETE FROM study_progress WHERE user_id=${fixtureId}; DELETE FROM study_enrollments WHERE user_id=${fixtureId}; DELETE FROM users WHERE id=${fixtureId} AND username='${username}'`)
  }
}
