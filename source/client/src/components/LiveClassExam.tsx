import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSystemSocket } from '../app/SystemSocketContext'
import './LiveClassExam.css'

type Question={id:string;prompt:string;options:string[];correct?:number}
type Rank={userId:number;username:string;displayName:string;correctCount:number;answeredCount:number;status:string}
type Exam={id:number;classId:number;title:string;version:number;revision:number;endsAt:string;closed:boolean;owner:boolean;questions:Question[];ranking?:Rank[];answers?:Record<string,number>;submitted?:boolean;correctCount?:number}
type Listing={id:number;title:string;endsAt:string;closed:boolean}
type Draft={id?:number;version?:number;title:string;endsAt:string;closed:boolean;questions:Question[]}
const question=():Question=>({id:crypto.randomUUID(),prompt:'',options:['','','',''],correct:0})
const localDate=(value:string)=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
const status=(s:string)=>({NOT_STARTED:'Chưa bắt đầu',WORKING:'Đang làm',SUBMITTED:'Đã nộp',EXPIRED:'Hết giờ'}[s]||s)

export function LiveClassExam({classId,isOwner}:{classId:number;isOwner:boolean}) {
  const {request,subscribe,connected}=useSystemSocket()
  const [list,setList]=useState<Listing[]>([]),[exam,setExam]=useState<Exam|null>(null),[draft,setDraft]=useState<Draft|null>(null)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[now,setNow]=useState(Date.now())
  const current=useRef<Exam|null>(null),mounted=useRef(true)
  const apply=useCallback((next:Exam)=>{
    if(!mounted.current||next.classId!==classId)return
    const old=current.current
    if(old?.id===next.id&&(old.revision>next.revision||(old.revision===next.revision&&old.closed&&!next.closed)))return
    if(old?.id===next.id&&next.version>old.version&&!next.owner)setNotice('Giáo viên vừa cập nhật đề. Nội dung mới đã được áp dụng; hãy kiểm tra lại các lựa chọn của bạn.')
    current.current=next;setExam(next)
  },[classId])
  const load=useCallback(()=>request<Listing[]>('EXAM_LIST','EXAM_DATA',{classId}).then(data=>{if(mounted.current)setList(data)}),[classId,request])
  useEffect(()=>{
    mounted.current=true
    const off=subscribe(message=>{
      if(message.action==='EXAM_UPDATE') {const next=message.payload as Exam;if(next.id===current.current?.id)apply(next)}
      if(message.action==='EXAM_ERROR'){setError((message.payload as {message:string}).message);current.current=null;setExam(null)}
    })
    return()=>{mounted.current=false;off();current.current=null;request('EXAM_UNWATCH','EXAM_DATA').catch(()=>{})}
  },[request,subscribe,apply])
  useEffect(()=>{
    if(!connected)return
    const sync=()=>{
      load().catch(e=>{if(mounted.current)setError(e.message)})
      // Client gửi trạng thái định kỳ; heartbeat này không giả làm tương tác người dùng.
      const id=current.current?.id
      if(id)request<Exam>('EXAM_SYNC','EXAM_DATA',{examId:id}).then(next=>{if(current.current?.id===id)apply(next)}).catch(e=>{if(mounted.current)setError(e.message)})
    }
    sync();const timer=setInterval(sync,5000);return()=>clearInterval(timer)
  },[connected,load,request,apply])
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  async function open(id:number){setBusy(true);setError('');setNotice('');try{const next=await request<Exam>('EXAM_OPEN','EXAM_DATA',{examId:id});apply(next)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function save(e:FormEvent){e.preventDefault();if(!draft)return;setBusy(true);setError('');try{const next=await request<Exam>(draft.id?'EXAM_EDIT':'EXAM_CREATE','EXAM_DATA',{...draft,classId,examId:draft.id,endsAt:new Date(draft.endsAt).toISOString()});apply(next);setDraft(null);await load();setNotice('Đã lưu đề và đồng bộ đến học sinh. Điểm được tính theo đáp án mới nhất.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function answer(questionId:string,option:number){const active=current.current;if(!active||saving)return;setSaving(true);setError('');try{const next=await request<Exam>('EXAM_ANSWER','EXAM_DATA',{examId:active.id,version:active.version,questionId,option});if(current.current?.id===active.id)apply(next)}catch(e){setError((e as Error).message);request<Exam>('EXAM_SYNC','EXAM_DATA',{examId:active.id}).then(next=>{if(current.current?.id===active.id)apply(next)}).catch(()=>{})}finally{setSaving(false)}}
  async function submit(){if(!exam||!window.confirm('Nộp bài? Sau khi nộp bạn không thể đổi đáp án.'))return;setSaving(true);setError('');try{apply(await request<Exam>('EXAM_SUBMIT','EXAM_DATA',{examId:exam.id,version:exam.version}));setNotice('Đã nộp bài. Giáo viên đã nhận được kết quả.')}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
  function edit(){if(!exam)return;setDraft({id:exam.id,version:exam.version,title:exam.title,endsAt:localDate(exam.endsAt),closed:exam.closed,questions:structuredClone(exam.questions)})}
  function changeQuestion(index:number,patch:Partial<Question>){if(!draft)return;setDraft({...draft,questions:draft.questions.map((q,i)=>i===index?{...q,...patch}:q)})}
  const remaining=exam?Math.max(0,Math.ceil((new Date(exam.endsAt).getTime()-now)/1000)):0
  const readonly=!!exam&&(exam.closed||exam.submitted||remaining===0)
  return <section className="card feature-card live-exam">
    <div className="panel-heading"><div><span className="section-label">KIỂM TRA TRỰC TIẾP</span><h2>Kiểm tra của lớp</h2><p className="muted">{isOwner?'Theo dõi điểm trực tiếp · Sửa đề và đồng bộ đến cả lớp.':'Lựa chọn được tự động lưu qua WebSocket. Không cần tải lại trang.'}</p></div><span className={`tag ${connected?'':'muted'}`}>{connected?'● Đã kết nối':'Đang kết nối lại…'}</span></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="success-banner" role="status">{notice}</div>}
    <div className="live-exam-list">{list.map(item=><button className={`button ${exam?.id===item.id?'primary':'secondary'}`} disabled={busy||!connected} key={item.id} onClick={()=>open(item.id)}>{item.title} · {item.closed||new Date(item.endsAt).getTime()<=now?'Đã đóng':'Đang mở'}</button>)}{!list.length&&<p className="muted">Chưa có bài kiểm tra trực tiếp.</p>}{isOwner&&<button className="button secondary" onClick={()=>setDraft({title:'',endsAt:localDate(new Date(Date.now()+3600000).toISOString()),closed:false,questions:[question()]})}>+ Tạo kiểm tra</button>}</div>
    {exam&&<div className="live-exam-body"><div className="panel-heading"><div><h3>{exam.title}</h3><p className="muted">Phiên bản {exam.version} · {exam.closed?'Đã đóng':`Còn ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`} · {exam.questions.length} câu</p></div><div className="button-row">{exam.owner&&<button className="button secondary" onClick={edit}>Sửa đề / Đáp án</button>}<button className="button secondary" onClick={()=>{current.current=null;setExam(null);setDraft(null);request('EXAM_UNWATCH','EXAM_DATA').catch(()=>{})}}>Đóng màn hình</button></div></div>
      {exam.owner?<><p className="muted">Bảng xếp hạng cập nhật khoảng mỗi giây. Điểm /10 được server chấm lại khi đáp án thay đổi, kể cả bài đã nộp.</p><div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Học sinh</th><th>Đã trả lời</th><th>Đúng</th><th>Điểm /10</th><th>Trạng thái</th></tr></thead><tbody>{exam.ranking?.map((r,i)=><tr key={r.userId}><td>{i+1}</td><td><strong>{r.displayName}</strong><small>#{r.userId} · {r.username}</small></td><td>{r.answeredCount}/{exam.questions.length}</td><td>{r.correctCount}</td><td><strong>{(10*r.correctCount/exam.questions.length).toFixed(2)}</strong></td><td>{status(r.status)}</td></tr>)}</tbody></table></div></>:<>
        <p className="muted">{exam.submitted?'Bạn đã nộp bài.':saving?'Đang gửi đáp án…':`Đã lưu ${Object.keys(exam.answers||{}).length}/${exam.questions.length} câu.`} {exam.closed&&`Kết quả: ${exam.correctCount??0}/${exam.questions.length} câu đúng.`}</p>
        {exam.questions.map((q,i)=><fieldset className="live-exam-question" key={q.id} disabled={readonly||saving||!connected}><legend>{i+1}. {q.prompt}</legend>{q.options.map((option,index)=><label className={`live-exam-option ${exam.answers?.[q.id]===index?'selected':''}`} key={index}><input type="radio" name={`exam-${exam.id}-${q.id}`} checked={exam.answers?.[q.id]===index} onChange={()=>answer(q.id,index)}/><span>{String.fromCharCode(65+index)}. {option}</span></label>)}</fieldset>)}
        {!readonly&&<button className="button primary" disabled={saving||!connected} onClick={submit}>Nộp bài kiểm tra</button>}
      </>}
    </div>}
    {draft&&<form className="live-exam-editor" onSubmit={save}><h3>{draft.id?'Chỉnh sửa đề trực tiếp':'Tạo bài kiểm tra'}</h3><p className="muted">Giữ nguyên ID khi sửa câu. Xóa câu sẽ loại cả đáp án và điểm của câu đó. Lưu đề sẽ chấm lại toàn bộ bài làm.</p><div className="form-grid"><label>Tên kiểm tra<input required maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>Hạn làm bài<input required type="datetime-local" value={draft.endsAt} onChange={e=>setDraft({...draft,endsAt:e.target.value})}/></label><label>Trạng thái<select value={String(draft.closed)} onChange={e=>setDraft({...draft,closed:e.target.value==='true'})}><option value="false">Đang mở</option><option value="true">Đóng kiểm tra</option></select></label></div>
      {draft.questions.map((q,i)=><div className="live-exam-question" key={q.id}><label>Câu {i+1}<textarea aria-label={`Câu ${i+1}`} required maxLength={500} value={q.prompt} onChange={e=>changeQuestion(i,{prompt:e.target.value})}/></label><div className="form-grid">{q.options.map((option,index)=><label key={index}>Lựa chọn {String.fromCharCode(65+index)}<input required maxLength={160} value={option} onChange={e=>changeQuestion(i,{options:q.options.map((o,j)=>j===index?e.target.value:o)})}/></label>)}<label>Đáp án đúng<select aria-label="Đáp án đúng" value={q.correct??0} onChange={e=>changeQuestion(i,{correct:Number(e.target.value)})}>{q.options.map((_,index)=><option value={index} key={index}>{String.fromCharCode(65+index)}</option>)}</select></label></div><button type="button" className="text-button" disabled={draft.questions.length===1} onClick={()=>setDraft({...draft,questions:draft.questions.filter((_,j)=>j!==i)})}>Xóa câu {i+1}</button></div>)}
      <div className="button-row"><button type="button" className="button secondary" disabled={draft.questions.length>=30} onClick={()=>setDraft({...draft,questions:[...draft.questions,question()]})}>+ Thêm câu</button><button type="button" className="button secondary" onClick={()=>setDraft(null)}>Hủy</button><button className="button primary" disabled={busy||!connected}>Lưu và đồng bộ</button></div>
    </form>}
  </section>
}
