import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { systemSocketUrl } from '../services/systemSocket'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Profile } from '../types'
import './AccountNotices.css'

type Message = { action: string; requestId?: string; payload?: unknown; data?: unknown }
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; message: string; sent: boolean; expected: string }
type SocketContext = {
  connected: boolean
  request: <T>(action: string, expected: string, payload?: unknown) => Promise<T>
  subscribe: (listener: (message: Message) => void) => () => void
}
const Context = createContext<SocketContext | null>(null)

export function SystemSocketProvider({ children }: { children: ReactNode }) {
  const { user,setUser,setReloadHandler } = useAuth()
  const userRef=useRef(user);userRef.current=user
  const navigate=useNavigate()
  const [accountNotice,setAccountNotice]=useState('')
  const [reportNotices,setReportNotices]=useState<{key:string;text:string;title:string}[]>([])
  const receivedReports=useRef(new Set<string>())
  const location = useLocation()
  const route = useRef({ path: location.pathname, topicSlug: new URLSearchParams(location.search).get('planet') || '' })
  route.current = { path: location.pathname, topicSlug: new URLSearchParams(location.search).get('planet') || '' }
  const [connected, setConnected] = useState(false)
  const [socketNotice,setSocketNotice]=useState('')
  const [systemNotice,setSystemNotice]=useState('')
  const [securityNotice,setSecurityNotice]=useState('')
  const [idleReminder,setIdleReminder]=useState('')
  const socket = useRef<WebSocket | null>(null)
  const pending = useRef(new Map<string, Pending>())
  const listeners = useRef(new Set<(message: Message) => void>())
  const request = useCallback(<T,>(action: string, expected: string, payload?: unknown) => new Promise<T>((resolve, reject) => {
    if(pending.current.size>=100){reject(new Error('Đang có quá nhiều yêu cầu chờ xử lý. Vui lòng đợi.'));return}
    const requestId = crypto.randomUUID()
    const timer = setTimeout(() => {
      pending.current.delete(requestId)
      reject(new Error('Máy chủ chưa phản hồi. Hãy thử lại.'))
    }, 15000)
    const entry: Pending = { resolve: value => resolve(value as T), reject, timer,
      message: JSON.stringify({ action, payload, requestId }), sent: false, expected }
    pending.current.set(requestId, entry)
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(entry.message)
      entry.sent = true
    }
  }), [])
  const subscribe = useCallback((listener: (message: Message) => void) => {
    listeners.current.add(listener)
    return () => { listeners.current.delete(listener) }
  }, [])

  useEffect(()=>{setReloadHandler(()=>request<Profile>('ACCOUNT_GET','ACCOUNT_DATA'));return()=>setReloadHandler(null)},[request,setReloadHandler])

  useEffect(() => {
    if (!user) return
    receivedReports.current.clear();setReportNotices([]);setAccountNotice('');setSystemNotice('')
    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    function rejectPending() {
      pending.current.forEach(entry => { clearTimeout(entry.timer); entry.reject(new Error('Kết nối đã đóng. Hãy thử lại.')) })
      pending.current.clear()
    }
    function connect() {
      if (disposed) return
      const current = new WebSocket(systemSocketUrl())
      socket.current = current
      current.onopen = () => {
        if (disposed) { current.close(); return }
        current.send(JSON.stringify({ action: 'AUTH', payload: { role: 'GUEST' } }))
        current.send(JSON.stringify({ action: 'CLIENT_ACTIVITY', payload: route.current }))
        setConnected(true)
        setSocketNotice('')
        setIdleReminder('')
        // Yêu cầu từ trang có thể đến trước handshake: gửi sau onopen.
        pending.current.forEach(entry => { if (!entry.sent) { current.send(entry.message); entry.sent = true } })
      }
      current.onmessage = event => {
        if (disposed) return
        let message: Message
        try { message = JSON.parse(event.data) } catch { return }
        if (!message || typeof message.action !== 'string') return
        if(message.action==='ROADMAP_PROGRESS_CHANGED') {
          void request<Profile>('ACCOUNT_GET','ACCOUNT_DATA').then(profile=>{if(profile.id===userRef.current?.id)setUser(profile)}).catch(()=>{})
        }
        if(message.action==='ACCOUNT_UPDATE') {
          const profile=message.payload as Profile
          if(profile?.id===userRef.current?.id&&['ADMIN','TEACHER','LEARNER'].includes(profile.role)&&Number.isFinite(profile.totalXp)){
            const changed=profile.role!==userRef.current.role
            userRef.current=profile;setUser(profile)
            if(changed){setIdleReminder('');setAccountNotice(`Quyền tài khoản đã được cập nhật thành ${profile.role}.`);navigate(profile.role==='ADMIN'?'/admin':profile.role==='TEACHER'?'/teacher':'/dashboard',{replace:true})}
          }
        }
        if(message.action==='ACCOUNT_LOCKED'){
          setSocketNotice((message.payload as {message:string}).message);setUser(null)
        }
        if(['REPORT_SUBMITTED','REPORT_RECEIVED','REPORT_DECISION'].includes(message.action)){
          const data=message.payload as {source:string;reportId:number;message:string;decision?:string;recipient?:string},key=`${message.action}:${data.source}:${data.reportId}`
          if(typeof data.message==='string'&&!receivedReports.current.has(key)){
            if(receivedReports.current.size>=200)receivedReports.current.delete(receivedReports.current.values().next().value!)
            receivedReports.current.add(key);setReportNotices(old=>[...old,{key,text:data.message,title:message.action==='REPORT_SUBMITTED'?'Đã tiếp nhận báo cáo':message.action==='REPORT_DECISION'?'Kết quả xử lý báo cáo':'Thông báo báo cáo'}].slice(-3))
            if(message.action==='REPORT_DECISION'&&data.decision==='LOCK'&&data.recipient==='TARGET')setSocketNotice(data.message)
          }
        }
        if(message.action==='SECURITY_WARNING'||(message.action==='SECURITY_INCIDENT'&&userRef.current?.role==='ADMIN')) {
          const data=message.payload as {message?:unknown;id?:number;username?:string}
          if(typeof data?.message==='string')setSecurityNotice(message.action==='SECURITY_INCIDENT'?`Cảnh báo #${data.id} · ${data.username||'Chưa đăng nhập'}: ${data.message}`:data.message)
        }
        if(message.action==='SYSTEM_NOTICE') {
          const text=(message.payload as {message?:unknown})?.message
          if(typeof text==='string')setSystemNotice(text)
        }
        if(message.action==='IDLE_REMINDER' && userRef.current?.role!=='ADMIN') {
          const text=(message.payload as {message?:unknown})?.message
          if(typeof text==='string')setIdleReminder(text)
        }
        const entry = message.requestId ? pending.current.get(message.requestId) : undefined
        if (entry && (message.action === entry.expected || message.action === 'ERROR')) {
          clearTimeout(entry.timer)
          pending.current.delete(message.requestId!)
          if (message.action === 'ERROR') entry.reject(new Error((message.payload as {message?: string})?.message || 'Không thể tải dữ liệu'))
          else entry.resolve(message.payload)
        }
        listeners.current.forEach(listener => listener(message))
      }
      current.onerror = () => current.close()
      current.onclose = event => {
        if (disposed) return
        socket.current = null
        setConnected(false)
        rejectPending()
        if(event.code===1013){setSocketNotice('Máy chủ đã đạt giới hạn kết nối. Đang chờ kết nối lại…');retry=setTimeout(connect,5000+Math.random()*5000);return}
        if(event.code===4006){setSocketNotice('Quản trị viên đã ngắt kết nối này. Tải lại trang để kết nối lại.');return}
        if(event.code===4004||event.code===1008){setSocketNotice('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');setUser(null);return}
        if(event.code===4005){setSocketNotice('Bạn gửi đáp án quá nhanh. Đang chờ 10 giây để kết nối lại.');retry=setTimeout(connect,10000);return}
        if(event.code===4001 || event.code===4003) {
          setSocketNotice(old=>old||(event.code===4001?'Phiên bị ngắt vì không thao tác 15 phút. Tải lại trang để kết nối.':'Tài khoản/socket bị chặn vì lý do bảo mật.'))
          window.dispatchEvent(new CustomEvent('grammarquest:socket-stopped',{detail:event.code===4001?'Phiên bị ngắt vì không thao tác 15 phút. Tải lại trang để kết nối.':'Tài khoản/socket bị chặn vì lý do bảo mật.'}))
          if(event.code===4003) window.dispatchEvent(new Event('grammarquest:unauthenticated'))
          return
        }
        retry = setTimeout(connect, 3000)
      }
    }
    // Cấp phát tài nguyên: một socket duy nhất mỗi tab, dùng chung mọi trang.
    connect()
    return () => {
      disposed = true
      clearTimeout(retry)
      setConnected(false)
      setIdleReminder('')
      setSystemNotice('')
      setSecurityNotice('')
      // Thu hồi tài nguyên: đóng socket, xóa bộ chờ và timer khi đăng xuất/unmount.
      const current = socket.current
      socket.current = null
      current?.close()
      rejectPending()
    }
  }, [user?.id])

  useEffect(() => {
    setIdleReminder('')
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ action: 'CLIENT_ACTIVITY', payload: route.current }))
  }, [location.pathname, location.search])

  useEffect(() => {
    let lastSent = 0
    function interaction(event: Event) {
      // Chỉ ghi nhận thao tác người dùng; telemetry/heartbeat không reset thời gian nhàn rỗi.
      if (!event.isTrusted || document.visibilityState !== 'visible') return
      setIdleReminder('')
      const now = Date.now()
      if (now - lastSent < 3000 || socket.current?.readyState !== WebSocket.OPEN) return
      lastSent = now
      socket.current.send(JSON.stringify({ action: 'CLIENT_INTERACTION' }))
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    events.forEach(name => window.addEventListener(name, interaction, { passive: true, capture: true }))
    return () => events.forEach(name => window.removeEventListener(name, interaction, true))
  }, [])

  const adminReminder=<>{securityNotice&&<aside className="system-notice security-notice" role="alert"><div><strong>Cảnh báo hoạt động bất thường</strong><p>{securityNotice}</p>{user?.role==='ADMIN'&&<a href="/admin?tab=overview#security-incidents">Xem và xử lý cảnh báo</a>}</div><button className="system-notice-close" aria-label="Đóng cảnh báo bảo mật" onClick={()=>setSecurityNotice('')}>×</button></aside>}{systemNotice?<aside className="system-notice" role="status" aria-live="polite">
    <div><strong>Lời nhắc từ quản trị viên</strong><p>{systemNotice}</p></div>
    <button type="button" className="system-notice-close" aria-label="Đóng lời nhắc từ quản trị viên" onClick={()=>setSystemNotice('')}>×</button>
  </aside>:null}</>
  return <Context.Provider value={{ connected, request, subscribe }}>{adminReminder}{socketNotice&&<div className="error-banner" role="alert">{socketNotice}</div>}{accountNotice&&<div className="success-banner" role="status">{accountNotice}</div>}{children}{user&&reportNotices.length>0&&<div className="account-report-notices" aria-live="polite">{reportNotices.map(item=><aside className="card" role="status" key={item.key}><strong>Thông báo báo cáo</strong><p>{item.text}</p><button className="text-button" onClick={()=>setReportNotices(old=>old.filter(n=>n.key!==item.key))}>Đã hiểu</button></aside>)}</div>}{idleReminder&&<aside className="idle-reminder" role="status" aria-live="polite"><span className="idle-reminder-icon" aria-hidden="true">✨</span><div><strong>Tiếp tục hành trình nhé!</strong><p>{idleReminder}</p></div><button type="button" aria-label="Đóng lời nhắc" onClick={()=>{
    setIdleReminder('')
    if(socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify({action:'CLIENT_INTERACTION'}))
  }}>×</button></aside>}</Context.Provider>
}
export function useSystemSocket() {
  const context = useContext(Context)
  if (!context) throw new Error('SystemSocketProvider is missing')
  return context
}
