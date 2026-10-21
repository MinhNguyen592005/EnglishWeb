import { useEffect, useState } from 'react'
import { api } from '../services/api'
export function BusinessOverview() {
  const [data,setData]=useState<{days:{date:string;registrations:number;classes:number;matches:number}[];finishedMatches:number}|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{api.adminBusiness().then(setData).catch(e=>setError(e.message))},[])
  if(error) return <p role="alert">{error}</p>
  if(!data) return <p>Đang tải số liệu ứng dụng…</p>
  return <section className="card feature-card"><h2>Hoạt động ứng dụng · 14 ngày</h2><p>Tổng trận hoàn tất: {data.finishedMatches}. Ngày theo database; trận được nhóm theo ngày tạo phòng.</p><div className="business-charts">{([['registrations','Đăng ký mới'],['classes','Lớp mới'],['matches','Trận đã hoàn tất']] as const).map(([key,label])=>{
    const max=Math.max(1,...data.days.map(day=>day[key]))
    return <figure key={key}><figcaption>{label}</figcaption><div className="business-bars" role="img" aria-label={label}>{data.days.map(day=><div key={day.date} title={`${day.date}: ${day[key]}`}><span style={{height:`${day[key]/max*100}%`}}/><small>{day[key]}</small></div>)}</div><small>{data.days[0]?.date} → {data.days[data.days.length-1]?.date}</small></figure>
  })}</div><details><summary>Bảng số liệu</summary><table><thead><tr><th>Ngày</th><th>Đăng ký</th><th>Lớp</th><th>Trận hoàn tất</th></tr></thead><tbody>{data.days.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.registrations}</td><td>{d.classes}</td><td>{d.matches}</td></tr>)}</tbody></table></details></section>
}
