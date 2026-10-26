import { useCallback, useEffect, useState } from 'react'
import { useSystemSocket } from './SystemSocketContext'

const DAY_MS=86_400_000, STUDY_OFFSET_MS=7*60*60*1000
export function nextStudyDayDelay(now=Date.now()) {
  return DAY_MS-((now+STUDY_OFFSET_MS)%DAY_MS)+50
}

/** Refresh at UTC+7 midnight and after returning from sleep, offline mode or another tab. */
export function useLearningRefresh() {
  const { subscribe,connected }=useSystemSocket()
  const [revision,setRevision]=useState(0)
  const reload=useCallback(()=>setRevision(value=>value+1),[])
  useEffect(()=>subscribe(message=>{
    if(['ROADMAP_PROGRESS_CHANGED','ACCOUNT_UPDATE'].includes(message.action))reload()
  }),[subscribe,reload])
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>
    const schedule=()=>{timer=setTimeout(()=>{reload();schedule()},nextStudyDayDelay())}
    const resume=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);reload();schedule()}}
    schedule()
    window.addEventListener('focus',resume)
    window.addEventListener('online',resume)
    document.addEventListener('visibilitychange',resume)
    return()=>{clearTimeout(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}
  },[reload])
  useEffect(()=>{if(connected)reload()},[connected,reload])
  return {revision,reload}
}
