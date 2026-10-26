import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { useSystemSocket } from '../app/SystemSocketContext'

export type StudyModerationData = {
  lessons: {id:string;title:string;moduleId:string;levelId:number;published:boolean;content:Record<string,unknown>}[]
  questions: {id:string;lessonId:string;prompt:string;options:string[];correctOption:string;explanation:string;published:boolean}[]
  examQuestions: {id:string;moduleId:string;prompt:string;options:string;correctOption:string;explanation:string;published:boolean}[]
}

function ContentValue({value}:{value:unknown}) {
  if(value === null || value === undefined) return null
  if(typeof value === 'string' || typeof value === 'number') return <p style={{whiteSpace:'pre-wrap'}}>{String(value)}</p>
  if(Array.isArray(value)) return <>{value.map((item,i)=><div key={i}><ContentValue value={item}/></div>)}</>
  if(typeof value === 'object') return <>{Object.values(value).map((item,i)=><ContentValue key={i} value={item}/>)}</>
  return null
}

export function AdminStudyContent({filter}:{filter:string}) {
  const {subscribe,connected}=useSystemSocket()
  const [data,setData]=useState<StudyModerationData|null>(null)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [limit,setLimit]=useState(50)
  const reload=useCallback(()=>api.adminStudyContent().then(setData),[])
  useEffect(()=>{
    let active=true
    const load=()=>api.adminStudyContent().then(value=>{if(active){setData(value);setError('')}}).catch(e=>{if(active)setError(e.message)})
    void load()
    const stop=subscribe(message=>{if(message.action==='CURRICULUM_CHANGED')void load()})
    return()=>{active=false;stop()}
  },[subscribe,connected])
  useEffect(()=>setLimit(50),[filter])
  const matches=(value:string)=>value.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  async function publish(kind:'LESSON'|'QUESTION'|'EXAM_QUESTION',id:string,published:boolean,lessonId?:string) {
    if(!published && !window.confirm('Ẩn nội dung này? Lượt làm mới sẽ không dùng nội dung đã ẩn. Ẩn bài bắt buộc có thể tạm ngừng tiến độ module cho đến khi mở lại.'))return
    setBusy(true);setError('');setNotice('')
    try{await api.adminPublishStudyContent({kind,id,lessonId,published});await reload();setNotice('Đã cập nhật kiểm duyệt lộ trình.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  const questions=data?[...data.questions.map(q=>({...q,scope:q.lessonId,kind:'QUESTION' as const})),...data.examQuestions.map(q=>({...q,lessonId:undefined,scope:q.moduleId,kind:'EXAM_QUESTION' as const}))].filter(q=>matches(`${q.id} ${q.scope} ${q.prompt}`)):[]
  return <>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p className="success-banner" role="status">{notice}</p>}
    <section className="card feature-card"><h2>Kiểm duyệt lộ trình 5 level</h2><p>Quản lý nội dung đang dùng trong lộ trình học mới. Lượt làm đã tạo giữ nguyên đề và lịch sử. Bài bị ẩn vẫn giữ vị trí bắt buộc trong tiến độ.</p>
      {!data?<p>Đang tải nội dung…</p>:<div className="table-wrap"><table><thead><tr><th>Bài học</th><th>Phạm vi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.lessons.filter(l=>matches(`${l.id} ${l.title} ${l.moduleId}`)).map(l=><tr key={l.id}><td><strong>{l.id} · {l.title}</strong><details><summary>Xem nội dung</summary><ContentValue value={l.content}/></details></td><td>Level {l.levelId} · {l.moduleId}</td><td>{l.published?'Đang mở':'Đã ẩn'}</td><td><button className="button secondary" disabled={busy} onClick={()=>void publish('LESSON',l.id,!l.published)}>{l.published?'Ẩn':'Mở lại'}</button></td></tr>)}</tbody></table></div>}
    </section>
    <section className="card feature-card"><h2>Câu hỏi lộ trình và kiểm tra module / level</h2><p>{questions.length} câu phù hợp. Câu bị ẩn được loại khỏi lượt làm mới; ngân hàng quá ít câu có thể chưa tạo được bài kiểm tra.</p><div className="table-wrap"><table><thead><tr><th>Câu hỏi</th><th>Phạm vi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{questions.slice(0,limit).map(q=><tr key={`${q.kind}-${q.scope}-${q.id}`}><td><strong>{q.id} · {q.prompt}</strong><details><summary>Đáp án / giải thích</summary><p>{typeof q.options==='string'?q.options:q.options.join(' · ')}</p><p>{q.correctOption} · {q.explanation}</p></details></td><td>{q.kind==='QUESTION'?'Luyện tập':'Kiểm tra'} · {q.scope}</td><td>{q.published?'Đang mở':'Đã ẩn'}</td><td><button className="button secondary" disabled={busy} onClick={()=>void publish(q.kind,q.id,!q.published,q.lessonId)}>{q.published?'Ẩn':'Mở lại'}</button></td></tr>)}</tbody></table></div>{questions.length>limit&&<button className="button secondary" onClick={()=>setLimit(n=>n+50)}>Xem thêm 50 câu</button>}</section>
  </>
}
