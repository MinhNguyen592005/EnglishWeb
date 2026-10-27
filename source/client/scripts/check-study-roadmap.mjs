// Real browser + real socket. Only a newly created study_ui_* fixture is changed.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const base=process.env.STUDY_UI_BASE||'http://127.0.0.1:5173'
const schema=process.env.STUDY_UI_DATABASE||'grammar_quest'
if(schema!=='grammar_quest')throw new Error('This smoke test only supports the grammar_quest development database')
if(!process.env.DB_USERNAME||!process.env.DB_PASSWORD)throw new Error('Load source/server/.env.local.ps1 before running')
const username=`study_ui_${randomUUID().replaceAll('-','').slice(0,12)}`,password='StudyBrowser123!'
function sql(query){
  const result=spawnSync('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',[
    `--host=${process.env.DB_HOST||'localhost'}`,`--port=${process.env.DB_PORT||'3306'}`,`--user=${process.env.DB_USERNAME}`,`--database=${schema}`,'--batch','--raw','--skip-column-names',`--execute=${query}`
  ],{encoding:'utf8',windowsHide:true,env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD}})
  if(result.status!==0)throw new Error('Could not prepare/read the isolated UI test fixture')
  return result.stdout.trim()
}
const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL||'msedge'})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
let fixtureId
try{
  const csrf=await(await context.request.get(`${base}/api/v1/auth/csrf`)).json()
  const response=await context.request.post(`${base}/api/v1/auth/register`,{headers:{'X-XSRF-TOKEN':csrf.token},data:{username,displayName:'Kiểm tra lộ trình',password}})
  assert.equal(response.status(),201);fixtureId=(await response.json()).id
  // Exercise unchanged legacy-user roadmap rules; placement has its own smoke test.
  sql(`DELETE FROM study_entry_profiles WHERE user_id=${Number(fixtureId)}; UPDATE users SET placement_eligible=FALSE WHERE id=${Number(fixtureId)}`)
  const page=await context.newPage(),errors=[],messages=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('websocket',ws=>ws.on('framereceived',frame=>{try{const message=JSON.parse(frame.payload.toString());messages.push(message);const a=message.payload?.attempt||message.payload;if(message.action==='ROADMAP_COURSE_DATA'&&a?.status==='IN_PROGRESS'){assert.equal(a.correctCount,undefined);for(const q of a.questions){assert.equal(q.correctOption,undefined);assert.equal(q.correct,undefined);assert.equal(q.explanation,undefined)}}}catch(error){errors.push(error.message)}}))
  await page.goto(`${base}/login`)
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
  await page.waitForURL('**/dashboard')
  await page.goto(`${base}/roadmap`)
  await page.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  assert.equal(await page.locator('.planet-button').count(),5)
  assert.equal(await page.locator('.planet-button:disabled').count(),4)
  assert.equal(await page.locator('.study-module-tab:disabled').count(),3)
  await page.goto(`${base}/roadmap?planet=level-1&module=l1-m2`)
  await page.locator('.study-module-locked').waitFor()
  assert.equal(await page.locator('.study-module-detail').count(),0)
  await page.goto(`${base}/roadmap?planet=level-1&module=l1-m2&lesson=2.1`)
  await page.getByText(/Hoàn thành toàn bộ bài học trong module/).waitFor()
  await page.goto(`${base}/roadmap`)
  await page.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  await page.locator('.study-module-tab').first().click()
  await page.getByRole('button',{name:'Bắt đầu',exact:true}).first().click()
  await page.getByRole('heading',{name:'Trật tự từ trong câu',exact:true,level:1}).waitFor()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'chưa trả lời'}).waitFor()
  let detail=messages.filter(m=>m.action==='ROADMAP_COURSE_DATA'&&m.payload?.content).at(-1).payload
  let attemptId=detail.attempt.id
  let questions=JSON.parse(sql(`SELECT questions_json FROM study_attempts WHERE id=${Number(attemptId)} AND user_id=${Number(fixtureId)}`))
  await page.locator('.study-question').first().getByRole('radio').nth(0).check()
  await page.locator('.study-question').first().getByRole('radio').nth(1).check()
  await page.getByText('Đã lưu câu trả lời',{exact:true}).waitFor()
  await page.reload();await page.getByRole('heading',{name:'Trật tự từ trong câu',exact:true,level:1}).waitFor()
  assert.equal(await page.locator('.study-question').first().getByRole('radio').nth(1).isChecked(),true)
  for(let i=0;i<questions.length;i++)await page.locator('.study-question').nth(i).getByRole('radio').nth(questions[i].correctOption==='A'?1:0).check()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  await page.getByRole('heading',{name:'Đã hoàn thành bài học',exact:true}).waitFor()
  await page.getByText('Đúng 0/3 câu.',{exact:false}).waitFor()
  assert.equal(await page.locator('.study-question .feedback').count(),3)
  await page.getByRole('button',{name:'Làm lại',exact:true}).click()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).waitFor()
  assert.equal(await page.locator('.study-question input:checked').count(),0)
  await page.getByRole('button',{name:'Quay lại module',exact:true}).first().click()
  await page.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  assert.match(await page.locator('.roadmap-chapter-progress strong').textContent(),/^1\/18$/)
  assert.equal(await page.locator('.study-module-tab:disabled').count(),3)
  // Complete only the remaining first-module fixtures and check the exact boundary.
  sql(`INSERT INTO study_progress(user_id,lesson_id,completed_at) SELECT ${Number(fixtureId)},l.id,CURRENT_TIMESTAMP(6) FROM study_lessons l WHERE l.module_id='l1-m1' ON DUPLICATE KEY UPDATE completed_at=CURRENT_TIMESTAMP(6)`)
  await page.reload();await page.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  assert.equal(await page.locator('.study-module-tab:disabled').count(),2)
  await page.locator('.study-module-tab').nth(1).click()
  await page.locator('.study-module-detail').waitFor()
  assert.equal(await page.locator('.study-module-tab').nth(2).isDisabled(),true)
  // Finish only this disposable user's remaining lesson fixtures; server rules are
  // exercised through actual submissions in StudyRoadmapIntegrationTest.
  sql(`INSERT INTO study_progress(user_id,lesson_id,completed_at) SELECT ${Number(fixtureId)},l.id,CURRENT_TIMESTAMP(6) FROM study_lessons l JOIN study_modules m ON m.id=l.module_id WHERE m.level_id=1 ON DUPLICATE KEY UPDATE completed_at=CURRENT_TIMESTAMP(6)`)
  await page.reload();await page.getByRole('button',{name:'Kiểm tra lên level',exact:true}).waitFor()
  await page.getByRole('button',{name:'Kiểm tra lên level',exact:true}).click()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).waitFor()
  async function answerExam(right){
    const id=Number(new URL(page.url()).searchParams.get('attempt'))
    const qs=JSON.parse(sql(`SELECT questions_json FROM study_attempts WHERE id=${id} AND user_id=${Number(fixtureId)}`))
    assert.equal(qs.length,10);assert.equal(new Set(qs.map(q=>q.moduleTitle)).size,4)
    for(let i=0;i<qs.length;i++){const choice=i<right?'ABCD'.indexOf(qs[i].correctOption):qs[i].correctOption==='A'?1:0;await page.locator('.study-question').nth(i).getByRole('radio').nth(choice).check()}
    await page.getByRole('button',{name:'Nộp bài',exact:true}).click()
  }
  await answerExam(7)
  await page.getByRole('heading',{name:'Chưa đạt bài kiểm tra level',exact:true}).waitFor()
  await page.getByRole('button',{name:'Quay lại lộ trình',exact:true}).last().click()
  await page.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  assert.equal(await page.locator('.planet-button:disabled').count(),4)
  await page.getByRole('button',{name:'Kiểm tra lên level',exact:true}).click()
  await page.getByRole('button',{name:'Nộp bài',exact:true}).waitFor()
  const second=await context.newPage();await second.goto(`${base}/roadmap`)
  await second.getByRole('heading',{name:'Khám phá 5 hành tinh ngữ pháp',exact:true}).waitFor()
  await answerExam(8)
  await page.getByRole('heading',{name:'Đã vượt qua level!',exact:true}).waitFor()
  await second.locator('.planet-button').nth(1).waitFor({state:'visible'})
  await second.waitForFunction(()=>document.querySelectorAll('.planet-button:disabled').length===3)
  await second.locator('.planet-button').nth(1).click()
  await second.getByRole('heading',{name:'Ngữ pháp thông dụng',exact:true}).waitFor()
  await mkdir('artifacts/study-roadmap',{recursive:true})
  await second.screenshot({path:'artifacts/study-roadmap/desktop-level2.png',fullPage:true})
  await second.setViewportSize({width:390,height:844})
  await second.screenshot({path:'artifacts/study-roadmap/mobile-level2.png',fullPage:true})
  assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Mobile must not overflow horizontally')
  await second.locator('.study-module-tab').first().click()
  await second.getByRole('button',{name:'Bắt đầu',exact:true}).first().click()
  await second.getByRole('heading',{name:'Hiện tại đơn',exact:true,level:1}).waitFor()
  await second.screenshot({path:'artifacts/study-roadmap/mobile-lesson.png',fullPage:true})
  assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Lesson must not overflow horizontally')
  assert.deepEqual(errors,[])
  console.log('PASS: five planets; draft editing/reload; no answer leak; zero-score lesson completion; retries preserve progress; 7/10 locked; 8/10 unlocks across tabs; desktop/mobile.')
}finally{
  await context.close();await browser.close()
  if(Number.isSafeInteger(fixtureId)&&/^study_ui_[a-f0-9]{12}$/.test(username)){
    const guard=`SELECT id FROM users WHERE id=${fixtureId} AND username='${username}'`
    assert.equal(Number(sql(guard)),fixtureId)
    sql(`DELETE FROM study_entry_attempts WHERE user_id=${fixtureId}; DELETE FROM study_entry_profiles WHERE user_id=${fixtureId}; DELETE FROM study_attempts WHERE user_id=${fixtureId}; DELETE FROM study_progress WHERE user_id=${fixtureId}; DELETE FROM study_enrollments WHERE user_id=${fixtureId}; DELETE FROM users WHERE id=${fixtureId} AND username='${username}'`)
  }
}
