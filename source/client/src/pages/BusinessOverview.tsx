import { useEffect, useState, type CSSProperties } from 'react'
import { api } from '../services/api'
import './BusinessOverview.css'
import { useRealtimeRefresh } from '../services/realtimeRefresh'

type Day = { date: string; registrations: number; classes: number; matches: number }
const CHARTS = [
  { key: 'registrations', label: 'Đăng ký mới', tone: 'indigo' },
  { key: 'classes', label: 'Lớp mới', tone: 'teal' },
  { key: 'matches', label: 'Trận đã hoàn tất', tone: 'amber' },
] as const
// '2026-10-14' -> '14/10'; giữ nguyên nếu định dạng khác dự kiến
const shortDate = (value: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[2]}/${match[1]}` : value
}

export function BusinessOverview() {
  const [data, setData] = useState<{ days: Day[]; finishedMatches: number } | null>(null)
  const [error, setError] = useState('')
  useRealtimeRefresh(() =>
    api
      .adminBusiness()
      .then((value) => {
        setData(value)
        setError('')
      })
      .catch((e) => setError(e.message)),
  )
  useEffect(() => {
    api
      .adminBusiness()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])
  if (error)
    return (
      <p className="error-banner" role="alert">
        {error}
      </p>
    )
  if (!data) return <p className="muted">Đang tải số liệu ứng dụng…</p>
  const first = data.days[0]?.date,
    last = data.days[data.days.length - 1]?.date
  return (
    <section className="card feature-card business-overview">
      <div className="panel-heading">
        <div>
          <span className="section-label">HOẠT ĐỘNG ỨNG DỤNG</span>
          <h2>Xu hướng trong 14 ngày</h2>
          <p className="muted">Đăng ký mới, lớp học và hoạt động thi đấu.</p>
        </div>
        <span className="tag">Tổng trận hoàn tất: {data.finishedMatches}</span>
      </div>
      <div className="biz-charts">
        {CHARTS.map(({ key, label, tone }) => {
          const max = Math.max(1, ...data.days.map((day) => day[key]))
          const total = data.days.reduce((sum, day) => sum + day[key], 0)
          return (
            <figure className={`biz-chart biz-${tone}`} key={key}>
              <figcaption>
                <span>{label}</span>
                <strong>{total}</strong>
              </figcaption>
              <div
                className="biz-bars"
                role="img"
                aria-label={`${label}: tổng ${total} trong ${data.days.length} ngày`}
              >
                {data.days.map((day) => (
                  <div
                    className="biz-col"
                    key={day.date}
                    title={`${day.date}: ${day[key]}`}
                    style={{ '--v': `${(day[key] / max) * 100}%` } as CSSProperties}
                  >
                    {day[key] > 0 && <b>{day[key]}</b>}
                    <span className={day[key] ? '' : 'zero'} />
                  </div>
                ))}
              </div>
              <div className="biz-axis">
                <small>{first && shortDate(first)}</small>
                <small>{last && shortDate(last)}</small>
              </div>
            </figure>
          )
        })}
      </div>
      <details className="biz-details">
        <summary>Bảng số liệu</summary>
        <p className="muted">Ngày theo database; trận được nhóm theo ngày tạo phòng.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Đăng ký</th>
                <th>Lớp</th>
                <th>Trận hoàn tất</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.registrations}</td>
                  <td>{d.classes}</td>
                  <td>{d.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
