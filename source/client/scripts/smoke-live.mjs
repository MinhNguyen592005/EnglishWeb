import { chromium, request } from '@playwright/test'

const password=process.env.DEMO_PASSWORD
if(!password)throw new Error('DEMO_PASSWORD is required')
const baseURL='http://127.0.0.1:5173'
const teacher=await request.newContext({baseURL})
const csrf=(await (await teacher.get('/api/v1/auth/csrf')).json()).token
const login=await teacher.post('/api/v1/auth/login',{data:{username:'teacher_demo',password},headers:{'X-XSRF-TOKEN':csrf}})
if(login.status()!==200)throw new Error(`Teacher login failed: ${login.status()}`)
const classes=await (await teacher.get('/api/v1/classes')).json()
const cls=classes.find(c=>c.name.startsWith('Test lớp'))
if(!cls)throw new Error('Run smoke-community.mjs first')
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
  const page=await browser.newPage()
  const sent=[]
  page.on('websocket',socket=>socket.on('framesent',frame=>sent.push(String(frame.payload))))
  await page.goto(`${baseURL}/login`)
  await page.locator('#username').fill('learner_one')
  await page.locator('#password').fill(password)
  await page.getByRole('button',{name:'Đăng nhập'}).click()
  await page.waitForURL('**/dashboard')
  await page.evaluate(()=>{
    window.liveEvents=[]
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`,'v12.stomp')
    window.liveSocket=ws
    ws.onopen=()=>ws.send('CONNECT\naccept-version:1.2\nheart-beat:0,0\n\n\0')
    ws.onmessage=e=>{
      for(const frame of String(e.data).split('\0')){
        if(frame.startsWith('CONNECTED')){window.liveConnected=true;ws.send('SUBSCRIBE\nid:classes\ndestination:/user/queue/classes\nack:auto\n\n\0')}
        if(frame.startsWith('MESSAGE'))window.liveEvents.push(frame)
      }
    }
  })
  await page.waitForFunction(()=>window.liveConnected,{timeout:10000})
  const response=await teacher.post(`/api/v1/classes/${cls.id}/messages`,{headers:{'X-XSRF-TOKEN':csrf},data:{body:`WebSocket check ${Date.now()}`}})
  if(response.status()!==200)throw new Error(`Message send failed: ${response.status()} ${await response.text()}`)
  await page.waitForFunction(id=>window.liveEvents.some(f=>f.includes(`"classId":${id}`)),cls.id,{timeout:10000})
  await page.goto(`${baseURL}/classes/${cls.id}`)
  await page.getByRole('heading',{name:'Chat lớp'}).waitFor()
  const started=Date.now()
  while(!sent.some(frame=>frame.startsWith('SUBSCRIBE')&&frame.includes('destination:/user/queue/actions'))){if(Date.now()-started>10000)throw new Error('Class action subscription missing');await new Promise(resolve=>setTimeout(resolve,100))}
  const text=`STOMP class chat ${Date.now()}`
  await page.getByRole('textbox',{name:'Tin nhắn lớp'}).fill(text)
  await page.getByRole('button',{name:'Gửi'}).click()
  await page.locator('.chat-list').getByText(text,{exact:true}).waitFor()
  if(!sent.some(frame=>frame.startsWith('SEND')&&frame.includes('destination:/app/classes/message')))throw new Error('Class chat did not use STOMP SEND')
  console.log('PASS: authenticated STOMP subscription and class chat SEND across clients')
}finally{await browser.close();await teacher.dispose()}
