import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
const profile={id:80,username:'teacher',displayName:'Teacher',role:'TEACHER',level:1,totalXp:0}
const members=Array.from({length:23},(_,i)=>({id:i+100,username:`student${i+1}`,displayName:`Student ${i+1}`}))
const classroom={id:90,name:'English 10A',teacherId:80,teacherName:'Teacher',joinCode:'CLASS90',members,assignments:[]}
const material={id:31,name:'Unit 1',description:'Present simple',archived:false,questionCount:1,updatedAt:'2026-10-27',questions:[{id:301,prompt:'She ___ to school.',questionType:'MCQ',optionA:'go',optionB:'goes',optionC:'going',optionD:'gone',correctOption:'B',explanation:'Present simple'}]}
const exams=Array.from({length:13},(_,i)=>({id:i+1,title:`Exam ${i+1}`,endsAt:'2027-01-01T00:00:00Z',closed:false}))
await context.route('**/api/v1/**',route=>{
 const path=new URL(route.request().url()).pathname
 const data=path.endsWith('/auth/me')?profile:path.endsWith('/teacher/materials/31')?material:path.endsWith('/teacher/materials')?[material]:path.endsWith('/classes/90')?classroom:path.endsWith('/overview')?{totalStudents:23}:{}
 return route.fulfill({json:data})
})
await context.routeWebSocket('**/api/ws-system',socket=>socket.onMessage(raw=>{
 const m=JSON.parse(String(raw))
 if(m.action==='EXAM_LIST')socket.send(JSON.stringify({action:'EXAM_DATA',requestId:m.requestId,payload:exams}))
}))
try{
 await mkdir('artifacts/classroom',{recursive:true})
 await page.goto('http://localhost:5173/classes/90?view=assignments')
 await expect(page.locator('#new-assignment')).toHaveCount(0)
 await page.locator('[aria-controls="new-assignment"]').click()
 await expect(page.locator('#new-assignment')).toBeVisible()
 await page.getByRole('radio').check()
 await expect(page.locator('.material-delivery-fields input').first()).toHaveValue('Unit 1')
 await page.locator('[aria-controls="new-assignment"]').click()
 await expect(page.locator('#new-assignment')).toHaveCount(0)
 await page.goto('http://localhost:5173/classes/90?view=members')
 await expect(page.locator('.class-table tbody tr')).toHaveCount(10)
 await page.locator('.list-pagination button').last().click()
 await expect(page.locator('.class-table tbody tr').first()).toContainText('Student 11')
 await page.locator('.class-member-search input').fill('student23')
 await expect(page.locator('.class-table tbody tr')).toHaveCount(1)
 await expect(page.locator('.list-pagination strong')).toContainText('1 / 1')
 await page.screenshot({path:'artifacts/classroom/members.png',fullPage:true})
 await page.goto('http://localhost:5173/classes/90?view=exams')
 await expect(page.locator('.exam-list-card')).toHaveCount(10)
 await page.locator('.live-exam .list-pagination button').last().click()
 await expect(page.locator('.exam-list-card')).toHaveCount(3)
 await page.locator('[aria-controls="new-class-exam"]').click()
 await expect(page.locator('#new-class-exam')).toBeVisible()
 await page.getByRole('radio').check()
 await expect(page.locator('.material-delivery-fields input').first()).toHaveValue('Unit 1')
 await page.screenshot({path:'artifacts/classroom/exams.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:'artifacts/classroom/exams-mobile.png',fullPage:true})
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Mobile overflow')
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS: assignment open/close/select; members 10/page and search; exams 10/page and create form; mobile no overflow')
}finally{await browser.close()}
