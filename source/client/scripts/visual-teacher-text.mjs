import { chromium, request } from '@playwright/test'

const password=process.env.DEMO_PASSWORD
if(!password)throw new Error('DEMO_PASSWORD is required')
const baseURL='http://127.0.0.1:5173'
async function api(username){
  const context=await request.newContext({baseURL})
  const token=(await (await context.get('/api/v1/auth/csrf')).json()).token
  const login=await context.post('/api/v1/auth/login',{data:{username,password},headers:{'X-XSRF-TOKEN':token}})
  if(login.status()!==200)throw new Error(`${username} login failed`)
  return {context,async call(method,path,data){const response=await context.fetch(`/api/v1${path}`,{method,headers:{'X-XSRF-TOKEN':token},...(data===undefined?{}:{data})});if(!response.ok())throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);return response.json()}}
}
const teacher=await api('teacher_demo'),learner=await api('learner_one')
const browser=await chromium.launch({channel:'msedge',headless:true})
async function login(page,username){await page.goto(`${baseURL}/login`);await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.getByRole('button',{name:'Đăng nhập'}).click();await page.waitForURL('**/dashboard')}
try{
  const cls=await teacher.call('POST','/classes',{name:`Bài chữ ${Date.now()}`})
  await learner.call('POST','/classes/join',{code:cls.joinCode})
  const assignment=await teacher.call('POST',`/classes/${cls.id}/assignments`,{title:'Thử câu trả lời chữ',lessonId:1,instructions:'Trả lời bằng văn bản',passPercent:80,dueAt:new Date(Date.now()+86400000).toISOString()})
  const teacherPage=await browser.newPage()
  await login(teacherPage,'teacher_demo')
  await teacherPage.goto(`${baseURL}/teacher/questions`)
  await teacherPage.getByLabel('Dạng câu hỏi').selectOption('REWRITE')
  await teacherPage.getByLabel('Đáp án mẫu để chấm tự động').waitFor()
  const page=await browser.newPage()
  await login(page,'learner_one')
  await page.goto(`${baseURL}/classes/${cls.id}`)
  await page.getByRole('button',{name:'Làm bài'}).click()
  await page.waitForURL('**/attempts/*')
  const attemptId=Number(new URL(page.url()).pathname.split('/').at(-1))
  const attempt=await learner.call('GET',`/attempts/${attemptId}`)
  const textIndex=attempt.questions.findIndex(q=>q.questionType!=='MCQ')
  if(textIndex<0)throw new Error('Assignment did not include a teacher text question')
  for(let i=0;i<textIndex;i++){
    if(attempt.questions[i].questionType==='MCQ')await page.locator('.answer-option').first().click()
    else await page.getByRole('textbox',{name:'Câu trả lời của bạn'}).fill('had')
    await page.getByRole('button',{name:'Xác nhận đáp án'}).click()
    await page.getByRole('button',{name:'Câu tiếp theo'}).click()
  }
  await page.getByRole('textbox',{name:'Câu trả lời của bạn'}).waitFor()
  await page.getByRole('textbox',{name:'Câu trả lời của bạn'}).fill('HAD.')
  await page.getByRole('button',{name:'Xác nhận đáp án'}).click()
  await page.getByText('Chính xác!').waitFor()
  console.log(`PASS: teacher question type form and learner text answer in assignment #${assignment.id}`)
}finally{await browser.close();await teacher.context.dispose();await learner.context.dispose()}
