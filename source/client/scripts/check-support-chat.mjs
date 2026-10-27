// UI regression with mocked API/socket. Backend privacy/persistence are tested separately with MySQL.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({headless:true,channel:'msedge'})
const base=process.env.SUPPORT_UI_URL||'http://127.0.0.1:5175'
const errors=[],entries=[]
const student={id:2,username:'alice',displayName:'Alice',role:'LEARNER',totalXp:0,level:1,xpInLevel:0}
const admin={id:1,username:'admin',displayName:'Admin',role:'ADMIN',totalXp:0,level:1,xpInLevel:0}
const conversation={id:21,userId:2,username:'alice',displayName:'Alice',lastMessageId:1,messages:[{id:1,senderId:null,senderType:'BOT',senderName:'Server',body:'Chào bạn! Hãy mô tả sự cố để được hỗ trợ.',createdAt:new Date().toISOString()}]}
let human=false
function add(senderId,senderType,body){conversation.lastMessageId++;conversation.messages.push({id:conversation.lastMessageId,senderId,senderType,senderName:senderType==='ADMIN'?'Admin':senderType==='USER'?'Alice':'Server',body,createdAt:new Date().toISOString()})}
function changed(){for(const entry of entries){
  if(entry.watch===21)entry.ws.send(JSON.stringify({action:'SUPPORT_UPDATE',payload:conversation}))
  if(entry.user.id===1)entry.ws.send(JSON.stringify({action:'SUPPORT_THREAD_CHANGED',payload:{threadId:21}}))
  if(entry.user.id===2)entry.ws.send(JSON.stringify({action:'SUPPORT_NOTIFICATION',payload:{threadId:21,lastMessageId:conversation.lastMessageId}}))
}}
async function open(user,path){
  const context=await browser.newContext(),page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/v1/**',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/auth/me')?user:[]}))
  await page.routeWebSocket('**/api/ws-system',ws=>{
    const entry={user,ws,watch:null};entries.push(entry)
    ws.onClose(()=>{const index=entries.indexOf(entry);if(index>=0)entries.splice(index,1)})
    ws.onMessage(raw=>{
      const message=JSON.parse(raw);let action='SUPPORT_DATA',payload={ok:true}
      switch(message.action){
        case 'AUTH':case 'CLIENT_INTERACTION':return
        case 'CLIENT_ACTIVITY':action='ACTIVITY_UPDATED';break
        case 'ACCOUNT_GET':action='ACCOUNT_DATA';payload=user;break
        case 'SUPPORT_OPEN':entry.watch=21;payload=conversation;break
        case 'SUPPORT_UNWATCH':entry.watch=null;break
        case 'SUPPORT_LIST':payload=[{...conversation,messages:undefined,preview:conversation.messages.at(-1).body,lastSenderType:conversation.messages.at(-1).senderType,updatedAt:new Date().toISOString()}];break
        case 'SUPPORT_SEND':
          add(user.id,user.role==='ADMIN'?'ADMIN':'USER',message.payload.body)
          if(user.role==='ADMIN')human=true
          else if(!human)add(null,'BOT','Mình đã ghi nhận sự cố kết nối. Quản trị viên có thể trả lời tại đây.')
          changed();payload=conversation;break
      }
      if(message.requestId)ws.send(JSON.stringify({action,requestId:message.requestId,payload}))
    })
  })
  await page.goto(base+path);return page
}
try{
  const learner=await open(student,'/profile')
  await learner.getByRole('button',{name:'Mở chat hỗ trợ',exact:true}).click()
  const popup=learner.getByRole('region',{name:'Hỗ trợ và báo cáo sự cố'})
  await popup.getByText('Chào bạn! Hãy mô tả sự cố để được hỗ trợ.',{exact:true}).waitFor()
  await popup.getByRole('textbox',{name:'Nội dung hỗ trợ'}).fill('Tôi không kết nối được với server')
  await popup.getByRole('button',{name:'Gửi tin nhắn hỗ trợ'}).click()
  await popup.getByText('Mình đã ghi nhận sự cố kết nối. Quản trị viên có thể trả lời tại đây.',{exact:true}).waitFor()
  await mkdir('artifacts/role-views',{recursive:true})
  await learner.screenshot({path:'artifacts/role-views/support-chat.png',fullPage:true})
  await popup.getByRole('button',{name:'Đóng chat hỗ trợ'}).click()
  await popup.waitFor({state:'detached'})
  const moderator=await open(admin,'/admin?tab=support')
  await moderator.getByRole('button').filter({hasText:'Alice'}).click()
  const adminLog=moderator.getByRole('log',{name:'Tin nhắn hỗ trợ'})
  await adminLog.getByText('Tôi không kết nối được với server',{exact:true}).waitFor()
  await moderator.getByRole('textbox',{name:'Nội dung hỗ trợ'}).fill('Admin đã nhận và đang kiểm tra giúp bạn.')
  await moderator.getByRole('button',{name:'Gửi tin nhắn hỗ trợ'}).click()
  await adminLog.getByText('Admin đã nhận và đang kiểm tra giúp bạn.',{exact:true}).waitFor()
  await learner.locator('.support-bubble b').waitFor()
  await learner.getByRole('button',{name:'Mở chat hỗ trợ',exact:true}).click()
  await popup.getByText('Admin đã nhận và đang kiểm tra giúp bạn.',{exact:true}).waitFor()
  await popup.getByRole('textbox',{name:'Nội dung hỗ trợ'}).fill('Cảm ơn, tôi sẽ đợi phản hồi.')
  await popup.getByRole('button',{name:'Gửi tin nhắn hỗ trợ'}).click()
  await adminLog.getByText('Cảm ơn, tôi sẽ đợi phản hồi.',{exact:true}).waitFor()
  await moderator.screenshot({path:'artifacts/role-views/support-inbox.png',fullPage:true})
  await learner.setViewportSize({width:390,height:844})
  const bounds=await popup.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=844)
  await learner.screenshot({path:'artifacts/role-views/support-mobile.png',fullPage:true})
  await popup.getByRole('textbox').focus();await learner.keyboard.press('Escape');await popup.waitFor({state:'detached'})
  assert.deepEqual(errors,[])
  console.log('PASS: support bubble, bot reply, admin inbox/reply, unread badge, retained history, mobile bounds and Escape close.')
}finally{await browser.close()}
