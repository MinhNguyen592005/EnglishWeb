import { Clock3, MessageCircle, Send, Swords, Trophy, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../app/AuthContext'
import { useSystemSocket } from '../app/SystemSocketContext'
import { Layout } from '../components/Layout'
import type { ArenaHistory, ArenaMessage, ArenaRoom } from '../types'
type QueueState={status:'IDLE'|'WAITING'|'MATCHED'|'ERROR';level?:number;queuedAt?:number;allowedGap?:number;room?:ArenaRoom;message?:string}

export function ArenaPage(){
  const {request,subscribe,connected}=useSystemSocket()
  const [queue,setQueue]=useState<QueueState>({status:'IDLE'})
  const [queueNow,setQueueNow]=useState(Date.now())
  const queueWaiting=queue.status==='WAITING'
  const {user}=useAuth()
  const [room,setRoom]=useState<ArenaRoom|null>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [messages,setMessages]=useState<ArenaMessage[]|null>(null),[chatText,setChatText]=useState(''),[chatBusy,setChatBusy]=useState(false)
  const [history,setHistory]=useState<ArenaHistory[]>([]),[notice,setNotice]=useState('')
  const chatList=useRef<HTMLDivElement>(null)
  const roomRef=useRef(room)
  roomRef.current=room
  useEffect(()=>subscribe(message=>{
    if(message.action==='ARENA_ROOM_UPDATE') {
      const next=message.payload as ArenaRoom
      setRoom(current=>current?.id===next.id&&current.stateVersion<=next.stateVersion?next:current)
      return
    }
    if(message.action==='ARENA_MESSAGES_UPDATE') {
      const update=message.payload as {roomId:number;messages:ArenaMessage[]}
      if(roomRef.current?.id===update.roomId)setMessages(update.messages)
      return
    }
    if(message.action==='ARENA_ERROR') {setError((message.payload as {message:string}).message);return}
    if(message.action!=='MATCHMAKING_UPDATE')return
    const update=message.payload as QueueState
    if(!update||!['IDLE','WAITING','MATCHED','ERROR'].includes(update.status))return
    setQueue(update)
    if(update.status==='ERROR')setError(update.message||'Không thể tìm trận')
    if(update.status==='MATCHED'&&update.room){setRoom(update.room);setNotice('Đã tìm thấy đối thủ phù hợp. Trận đấu bắt đầu!');request('QUEUE_CANCEL','MATCHMAKING_UPDATE').catch(()=>{})}
  }),[subscribe,request])
  useEffect(()=>{if(!connected){setQueue({status:'IDLE'});return}request<QueueState>('QUEUE_STATUS','MATCHMAKING_UPDATE').then(setQueue).catch(()=>{})},[connected,request])
  // Đồng hồ hiển thị tại client; không gửi bất kỳ request polling nào.
  useEffect(()=>{const timer=setInterval(()=>setQueueNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  async function findMatch(){setBusy(true);setError('');setNotice('');try{setQueue(await request<QueueState>('QUEUE_JOIN','MATCHMAKING_UPDATE'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function cancelMatch(){setBusy(true);try{setQueue(await request<QueueState>('QUEUE_CANCEL','MATCHMAKING_UPDATE'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  useEffect(()=>()=>{request('QUEUE_CANCEL','MATCHMAKING_UPDATE').catch(()=>{});request('ARENA_UNWATCH','ARENA_DATA').catch(()=>{})},[request])
  useEffect(()=>{request('CLIENT_ACTIVITY','ACTIVITY_UPDATED',{path:'/arena'}).catch(()=>{})},[request,room?.id,room?.status])
  useEffect(()=>{
    if(!connected)return
    let active=true
    request<ArenaRoom|Record<string,never>>('ARENA_OPEN','ARENA_DATA',roomRef.current?{roomId:roomRef.current.id}:{})
      .then(data=>{if(active&&'id' in data)setRoom(data as ArenaRoom)}).catch(e=>{if(active)setError(e.message)})
    request<ArenaHistory[]>('ARENA_HISTORY','ARENA_DATA').then(data=>{if(active)setHistory(data)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[connected,request])
  useEffect(()=>{
    if(!connected||!room?.id)return
    let active=true
    setMessages(null)
    request<ArenaRoom>('ARENA_OPEN','ARENA_DATA',{roomId:room.id})
      .then(next=>{if(active)setRoom(current=>current?.id===next.id&&current.stateVersion<=next.stateVersion?next:current)}).catch(e=>{if(active)setError(e.message)})
    request<ArenaMessage[]>('ARENA_MESSAGES','ARENA_DATA',{roomId:room.id})
      .then(data=>{if(active)setMessages(data)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[connected,room?.id,request])
  useEffect(()=>{if(room?.status==='FINISHED')request<ArenaHistory[]>('ARENA_HISTORY','ARENA_DATA').then(setHistory).catch(e=>setError(e.message))},[room?.status,request])
  useEffect(()=>{if(chatList.current)chatList.current.scrollTop=chatList.current.scrollHeight},[messages?.at(-1)?.id])
  async function act(body:Record<string,unknown>){
    setBusy(true);setError('')
    const {action,...payload}=body
    try{const next=await request<ArenaRoom>(`ARENA_${action}`,'ARENA_DATA',payload);setRoom(current=>current?.id===next.id&&current.stateVersion>next.stateVersion?current:next)}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  async function join(e:FormEvent){e.preventDefault();await act({action:'JOIN',code})}
  async function leaveWaiting(){if(!room)return;setBusy(true);setError('');try{await request('ARENA_LEAVE','ARENA_DATA',{roomId:room.id});setRoom(null);setMessages(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function sendMessage(e:FormEvent){e.preventDefault();if(!room||!chatText.trim())return;setChatBusy(true);setError('');try{await request('ARENA_CHAT','ARENA_DATA',{roomId:room.id,body:chatText});setChatText('')}catch(e){setError((e as Error).message)}finally{setChatBusy(false)}}
  async function reportMessage(messageId:number){if(!room)return;const reason=window.prompt('Lý do báo cáo tin nhắn (tối đa 500 ký tự):');if(!reason?.trim())return;setError('');try{await request('ARENA_REPORT','ARENA_DATA',{roomId:room.id,messageId,reason});setNotice('Đã gửi báo cáo cho quản trị viên.')}catch(e){setError((e as Error).message)}}
  async function reportOpponent(){if(!room)return;const targetId=room.isHost?room.guestId:room.hostId;if(!targetId)return;const reason=window.prompt('Lý do báo cáo đối thủ (tối đa 500 ký tự):');if(!reason?.trim())return;try{await request('REPORT_USER','REPORT_DATA',{targetId,contextType:'ARENA',contextId:room.id,reason});setNotice('Đã gửi báo cáo đối thủ cho quản trị viên.')}catch(e){setError((e as Error).message)}}
  const seconds=room?.deadlineAt?Math.max(0,Math.ceil((new Date(room.deadlineAt).getTime()-queueNow)/1000)):0
  const myReady=room&&(room.isHost?room.hostReady:room.guestReady)
  const canChat=room&&['WAITING','IN_PROGRESS'].includes(room.status)
  const chat=room&&canChat&&<section className="card feature-card arena-chat"><h2><MessageCircle size={21}/> Chat phòng đấu</h2><div className="arena-chat-list" ref={chatList} role="log" aria-label="Lịch sử chat phòng đấu">{messages===null?<p className="muted">Đang tải tin nhắn...</p>:messages.length?messages.map(m=><div className={`arena-chat-message ${m.userId===user?.id?'mine':''}`} key={m.id}><div><strong>{m.displayName}</strong><time>{new Date(m.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.body}</p>{m.userId!==user?.id&&<button className="text-button" onClick={()=>reportMessage(m.id)}>Báo cáo</button>}</div>):<p className="muted">Chưa có tin nhắn. Hãy chào đối thủ!</p>}</div><form className="arena-chat-form" onSubmit={sendMessage}><input aria-label="Tin nhắn phòng đấu" required maxLength={1000} value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Nhắn cho đối thủ..."/><button className="button primary" disabled={chatBusy||!chatText.trim()} aria-label="Gửi tin nhắn"><Send size={18}/></button></form></section>
  return <Layout title="Đấu trường"><div className="page-heading"><div><span className="section-label">THỬ THÁCH HAI NGƯỜI</span><h1>Đấu trường PvP</h1><p>Hai người chơi cùng 10 câu hỏi, mỗi câu 20 giây. Máy chủ chấm điểm và giữ thời gian.</p></div><div className="heading-icon"><Swords/></div></div>{error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="success-banner" role="status">{notice}</div>}{room?.guestId&&<button className="text-button" disabled={!connected} onClick={reportOpponent}>Báo cáo đối thủ</button>}
    {!room?<><section className="card feature-card matchmaking-card"><div className="card-icon purple"><Swords/></div><h2>Tìm đối thủ cùng cấp</h2><p>Cấp của bạn: <strong>{queue.level??user?.level}</strong>. Ưu tiên cùng cấp, sau 15 giây mở rộng ±1 cấp, sau 30 giây tối đa ±2 cấp. Cả hai người phải phù hợp phạm vi tìm kiếm của nhau.</p>{queueWaiting?<><p className="tag" role="status">Đang tìm trận · {Math.max(0,Math.floor((queueNow-(queue.queuedAt||queueNow))/1000))} giây · Chênh lệch tối đa {queue.allowedGap??0} cấp</p><p className="muted">Bạn có thể hủy bất cứ lúc nào. Ghép thành công sẽ tự bắt đầu trận.</p><button className="button secondary" disabled={busy} onClick={cancelMatch}>Hủy tìm trận</button></>:<button className="button primary" disabled={busy||!connected} onClick={findMatch}>Tìm trận PvP</button>}</section><h2 className="section-heading">Hoặc đấu riêng bằng mã phòng</h2><div className="feature-grid"><section className="card feature-card"><div className="card-icon purple"><Swords/></div><h2>Tạo phòng đấu</h2><p className="muted">Chia sẻ mã phòng cho người chơi thứ hai.</p><button className="button primary" disabled={busy||queueWaiting} onClick={()=>act({action:'CREATE'})}>Tạo phòng</button></section><section className="card feature-card"><div className="card-icon mint"><UsersRound/></div><h2>Vào phòng</h2><form className="inline-form" onSubmit={join}><input aria-label="Mã phòng" required maxLength={12} value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Nhập mã phòng"/><button className="button primary" disabled={busy||queueWaiting}>Tham gia</button></form></section></div></>:<>
      <section className="card arena-banner"><div><span className="section-label">PHÒNG {room.code}</span><h2>{room.status==='WAITING'?'Đang chờ người chơi':room.status==='IN_PROGRESS'?`Vòng ${room.currentRound}/${room.questionLimit}`:room.status==='CANCELLED'?'Phòng đã hủy':'Trận đấu kết thúc'}</h2></div><div className="arena-score"><div><strong>{room.hostName}</strong><span>{room.hostScore} điểm</span></div><Swords/><div><strong>{room.guestName||'Chờ đối thủ'}</strong><span>{room.guestScore} điểm</span></div></div></section>
      {room.status==='WAITING'&&<><section className="card feature-card"><h2>Chuẩn bị trận đấu</h2><p>Chia sẻ mã <strong>{room.code}</strong>. Cả hai người chơi cần chọn sẵn sàng.</p><div className="ready-list"><span>{room.hostName}: {room.hostReady?'Sẵn sàng':'Chưa sẵn sàng'}</span><span>{room.guestName||'Chờ người chơi'}: {room.guestReady?'Sẵn sàng':'Chưa sẵn sàng'}</span></div><div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>act({action:'READY',roomId:room.id,ready:!myReady})}>{myReady?'Hủy sẵn sàng':'Tôi sẵn sàng'}</button>{room.isHost&&<button className="button primary" disabled={busy||!room.guestId||!room.hostReady||!room.guestReady} onClick={()=>act({action:'START',roomId:room.id})}>Bắt đầu trận</button>}<button className="button secondary" disabled={busy} onClick={leaveWaiting}>Rời phòng</button></div></section>{chat}</>}
      {room.status==='IN_PROGRESS'&&<div className="arena-grid"><section className="card feature-card"><div className="panel-heading"><span className="tag">CÂU {room.currentRound}/{room.questionLimit}</span><span className={`timer ${seconds<=5?'urgent':''}`}><Clock3 size={18}/> {room.pausedUserId?'Tạm dừng':`${seconds}s`}</span></div>{room.pausedUserId&&<div className="error-banner" role="status">{room.pausedUserId===user?.id?'Đang kết nối lại trận đấu...':'Đối thủ mất kết nối. Chờ tối đa 30 giây để họ trở lại.'}</div>}{room.question&&<><h2 className="arena-question">{room.question.prompt}</h2><div className="arena-options">{room.question.options.map((option,i)=>{const letter='ABCD'[i];return <button disabled={busy||!!room.myAnswer||seconds===0||!!room.pausedUserId} className={`arena-option ${room.myAnswer===letter?'chosen':''}`} key={letter} onClick={()=>act({action:'ANSWER',roomId:room.id,roundNo:room.currentRound,option:letter})}><strong>{letter}</strong>{option}</button>})}</div></>}{room.myAnswer&&<p className="success-banner">Đã gửi đáp án. {room.opponentAnswered?'Đối thủ đã trả lời.':'Đang chờ đối thủ hoặc hết giờ.'}</p>}</section><aside className="arena-side"><section className="card feature-card"><h2>Diễn biến</h2>{room.lastResult?<div className="round-result"><strong>Vòng {room.lastResult.roundNo}</strong><p>Đáp án đúng: {room.lastResult.correctOption}</p><p>{room.lastResult.explanation}</p></div>:<p className="muted">Đáp án chỉ hiện khi cả hai đã trả lời hoặc hết giờ.</p>}<button className="button secondary" onClick={()=>{if(window.confirm('Rời trận sẽ bị xử thua. Tiếp tục?'))act({action:'LEAVE',roomId:room.id})}}>Rời trận</button></section>{chat}</aside></div>}
      {room.status==='FINISHED'&&<section className="card feature-card arena-finish"><Trophy size={45}/><h2>{room.winnerId===null?'Hòa!':room.winnerId===user?.id?'Bạn thắng!':'Bạn thua!'}</h2><p>{room.hostName} {room.hostScore} – {room.guestScore} {room.guestName}</p>{room.lastResult&&<p>Đáp án vòng cuối: {room.lastResult.correctOption} · {room.lastResult.explanation}</p>}<button className="button primary" onClick={()=>setRoom(null)}>Tạo trận khác</button></section>}
      {room.status==='CANCELLED'&&<section className="card feature-card"><p>Phòng đã hủy.</p><button className="button primary" onClick={()=>setRoom(null)}>Quay lại đấu trường</button></section>}
    </>}{history.length>0&&<section className="card feature-card"><h2>Lịch sử trận đấu</h2>{history.map(match=><div className="assignment-row" key={match.id}><div><strong>{match.hostName} {match.hostScore} – {match.guestScore} {match.guestName}</strong><small>{new Date(match.createdAt).toLocaleString('vi-VN')} · Phòng {match.code}</small></div><span className="tag">{match.winnerId===null?'Hòa':match.winnerId===user?.id?'Thắng':'Thua'}</span></div>)}</section>}</Layout>
}
