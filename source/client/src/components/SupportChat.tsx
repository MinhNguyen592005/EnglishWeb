import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import './SupportChat.css'

type Message={id:number;senderId:number|null;senderType:'USER'|'ADMIN'|'BOT';senderName:string;body:string;createdAt:string}
type Conversation={id:number;userId:number;username:string;displayName:string;lastMessageId:number;messages:Message[]}
type Thread={id:number;userId:number;username:string;displayName:string;lastMessageId:number;updatedAt:string;preview:string;lastSenderType:string}

function ConversationPanel({threadId}:{threadId?:number}){
  const {user}=useAuth(),{request,subscribe,connected}=useSystemSocket()
  const [conversation,setConversation]=useState<Conversation|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const scroll=useRef<HTMLDivElement>(null),alive=useRef(true),pending=useRef<{body:string;key:string}|null>(null)
  const apply=useCallback((next:Conversation)=>{
    if(!alive.current||(threadId!==undefined&&next.id!==threadId))return
    setConversation(old=>old&&old.id===next.id&&old.lastMessageId>next.lastMessageId?old:next)
  },[threadId])
  useEffect(()=>{
    alive.current=true
    const off=subscribe(message=>{if(message.action==='SUPPORT_UPDATE')apply(message.payload as Conversation)})
    return()=>{alive.current=false;off();void request('SUPPORT_UNWATCH','SUPPORT_DATA').catch(()=>{})}
  },[apply,request,subscribe])
  useEffect(()=>{
    if(!connected)return
    let active=true;setError('')
    request<Conversation>('SUPPORT_OPEN','SUPPORT_DATA',threadId?{threadId}:{}).then(data=>{if(active)apply(data)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[connected,threadId,request,apply])
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight},[conversation?.lastMessageId])
  async function send(event:FormEvent){
    event.preventDefault();const body=text.trim();if(!body||busy||!connected||!conversation)return
    const draft=pending.current?.body===body?pending.current:{body,key:crypto.randomUUID()};pending.current=draft
    setBusy(true);setError('')
    try{
      const data=await request<Conversation>('SUPPORT_SEND','SUPPORT_DATA',{threadId:conversation.id,body,clientMessageId:draft.key})
      if(alive.current){apply(data);setText('');pending.current=null}
    }catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}
  }
  return <div className="support-conversation">
    <div className="support-connection" role="status">{connected?'● Đã kết nối trực tiếp':'Đang kết nối lại…'}{user?.role==='ADMIN'&&conversation&&` · ${conversation.displayName} (${conversation.username}) · #${conversation.userId}`}</div>
    <div className="support-messages" ref={scroll} role="log" aria-live="polite" aria-label="Tin nhắn hỗ trợ">
      {!conversation&&!error&&<p className="muted">Đang tải hội thoại…</p>}
      {conversation?.messages.map(message=><article key={message.id} className={`support-message ${message.senderId===user?.id?'mine':''} ${message.senderType.toLowerCase()}`}>
        <strong>{message.senderType==='BOT'?'Trợ lý tự động':message.senderType==='ADMIN'?`Quản trị viên · ${message.senderName}`:message.senderName}</strong>
        <p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</time>
      </article>)}
    </div>
    {error&&<p className="support-error" role="alert">{error}</p>}
    <form className="support-compose" onSubmit={send}>
      <label className="sr-only" htmlFor="support-message-input">Nội dung hỗ trợ</label>
      <textarea id="support-message-input" maxLength={1000} rows={2} disabled={busy} value={text} onChange={e=>setText(e.target.value)} placeholder={user?.role==='ADMIN'?'Nhập phản hồi cho người dùng…':'Mô tả sự cố bạn gặp…'} required/>
      <button className="button primary" type="submit" disabled={!connected||!conversation||busy||!text.trim()} aria-label="Gửi tin nhắn hỗ trợ"><Send size={18}/></button>
    </form>
    <small className="support-footnote">100 tin gần nhất · Trợ lý trả lời theo hướng dẫn có sẵn, không tự sửa dữ liệu.</small>
  </div>
}

function SupportBubble(){
  const {subscribe}=useSystemSocket(),[open,setOpen]=useState(false),[unread,setUnread]=useState(0)
  const isOpen=useRef(open),lastReply=useRef(0),trigger=useRef<HTMLButtonElement>(null);isOpen.current=open
  useEffect(()=>subscribe(message=>{
    if(message.action!=='SUPPORT_NOTIFICATION')return
    const data=message.payload as {lastMessageId:number}
    if(data.lastMessageId<=lastReply.current)return
    lastReply.current=data.lastMessageId
    if(!isOpen.current)setUnread(n=>Math.min(99,n+1))
  }),[subscribe])
  function toggle(){setOpen(value=>!value);setUnread(0)}
  function close(){setOpen(false);trigger.current?.focus()}
  return <div className="support-widget">
    {open&&<section className="support-popup" aria-label="Hỗ trợ và báo cáo sự cố" onKeyDown={e=>{if(e.key==='Escape')close()}}>
      <header><div><strong>Hỗ trợ & báo cáo sự cố</strong><small>Trợ lý tự động và quản trị viên</small></div><button className="support-close" type="button" onClick={close} aria-label="Đóng chat hỗ trợ"><X size={20}/></button></header>
      <ConversationPanel/>
    </section>}
    <button ref={trigger} className="support-bubble" type="button" onClick={toggle} aria-expanded={open} aria-label={open?'Thu nhỏ chat hỗ trợ':'Mở chat hỗ trợ'}><MessageCircle size={25}/><span>Hỗ trợ</span>{unread>0&&!open&&<b>{unread}</b>}</button>
  </div>
}

export function SupportChatWidget(){const {user}=useAuth();return user&&user.role!=='ADMIN'?<SupportBubble key={`${user.id}:${user.role}`}/>:null}

export function SupportInbox(){
  const {request,subscribe,connected}=useSystemSocket()
  const [threads,setThreads]=useState<Thread[]>([]),[selected,setSelected]=useState<number|null>(null),[error,setError]=useState('')
  const reload=useCallback(()=>request<Thread[]>('SUPPORT_LIST','SUPPORT_DATA').then(data=>{setThreads(data);setError('')}),[request])
  useEffect(()=>{
    if(!connected)return
    let active=true,timer:ReturnType<typeof setTimeout>|undefined
    const load=()=>{void request<Thread[]>('SUPPORT_LIST','SUPPORT_DATA').then(data=>{if(active){setThreads(data);setError('')}}).catch(e=>{if(active)setError(e.message)})}
    load()
    const off=subscribe(message=>{if(message.action==='SUPPORT_THREAD_CHANGED'){clearTimeout(timer);timer=setTimeout(load,200)}})
    return()=>{active=false;off();clearTimeout(timer)}
  },[connected,request,subscribe])
  return <section className="card feature-card"><div className="panel-heading"><div><h2>Hộp thư hỗ trợ</h2><p className="muted">100 hội thoại cập nhật gần nhất. Chọn người dùng để trả lời trực tiếp.</p></div><button className="button secondary" disabled={!connected} onClick={()=>void reload().catch(e=>setError(e.message))}>Làm mới</button></div>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="support-inbox"><nav className="support-thread-list" aria-label="Hội thoại hỗ trợ">
      {threads.map(thread=><button type="button" key={thread.id} className={selected===thread.id?'selected':''} onClick={()=>setSelected(thread.id)}><strong>{thread.displayName}</strong><small>{thread.username} · User #{thread.userId}</small><p>{thread.preview}</p><small>{thread.lastSenderType==='ADMIN'?'Đã phản hồi':'Chờ Admin xem'} · {new Date(thread.updatedAt).toLocaleString('vi-VN')}</small></button>)}
      {!threads.length&&<p className="muted">Chưa có hội thoại hỗ trợ.</p>}
    </nav><div className="support-inbox-chat">{selected?<ConversationPanel key={selected} threadId={selected}/>:<p className="support-empty">Chọn hội thoại bên trái để xem lịch sử và trả lời.</p>}</div></div>
  </section>
}
