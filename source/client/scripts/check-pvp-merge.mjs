import {chromium,expect} from '@playwright/test'
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext()
const page=await context.newPage()
const errors=[],actions=[]
page.on('pageerror',e=>errors.push(e.message))
const profile={id:1,username:'alice',displayName:'Alice',role:'LEARNER',level:1,totalXp:0,xpInLevel:0,pvpElo:1000}
let room={id:55,code:'MATCH1',status:'CONFIRMING',stateVersion:1,hostId:1,guestId:2,hostName:'Alice',guestName:'Bob',isHost:true,hostReady:false,guestReady:false,hostScore:0,guestScore:0,currentRound:0,questionLimit:10,confirmDeadlineAt:new Date(Date.now()+120000).toISOString()}
await context.route('**/api/v1/**',route=>{
 const path=new URL(route.request().url()).pathname
 return route.fulfill({json:path.endsWith('/auth/me')?profile:{streak:{currentStreak:0},quests:[],milestone:{}}})
})
await context.routeWebSocket('**/api/ws-system',socket=>socket.onMessage(raw=>{
 const m=JSON.parse(String(raw));actions.push(m.action)
 if(!m.requestId)return
 let data={}
 if(m.action==='ARENA_OPEN')data=room
 if(m.action==='ARENA_HISTORY')data=[]
 if(m.action.startsWith('QUEUE_'))data={status:'IDLE'}
 if(m.action==='ARENA_CONFIRM'){room={...room,hostReady:true,stateVersion:2};data=room}
 if(m.action==='ARENA_DECLINE'){room={...room,status:'CANCELLED',stateVersion:3};data=room}
 socket.send(JSON.stringify({action:m.action.startsWith('QUEUE_')?'MATCHMAKING_UPDATE':m.action.startsWith('ARENA_')?'ARENA_DATA':'ACTIVITY_UPDATED',requestId:m.requestId,payload:data}))
}))
try{
 await page.goto('http://localhost:5173/arena')
 await expect(page.locator('.pvp-confirm-card')).toBeVisible()
 await page.locator('.pvp-confirm-card .button.primary').click()
 await expect(page.locator('.pvp-confirm-card .button.primary')).toBeDisabled()
 if(!actions.includes('ARENA_CONFIRM'))throw Error('Confirmation not sent')
 await page.locator('.pvp-confirm-card .button.secondary').click()
 await expect(page.locator('.pvp-confirm-card')).toHaveCount(0)
 if(!actions.includes('ARENA_DECLINE'))throw Error('Decline not sent')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS: merged Arena renders, confirms via ARENA_CONFIRM, declines via ARENA_DECLINE')
}finally{await browser.close()}
