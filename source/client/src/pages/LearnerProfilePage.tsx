import { ArrowRight, Award, Clock3, Flame, Rocket, Swords, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useLearningRefresh } from '../app/useLearningRefresh'
import { Layout } from '../components/Layout'
import { ErrorState, Loading } from '../components/States'
import { api } from '../services/api'
import type { Attempt } from '../types'
import { useStudyCourse, useStudyHistory } from './roadmap/useStudyProgress'
import { studyHistoryPath, studyKindName, studyStatusName, summarizeStudyProgress } from './roadmap/progress'

export function LearnerProfilePage() {
  const { user } = useAuth()
  const {revision,reload:reloadLearning}=useLearningRefresh()
  const course = useStudyCourse(), history = useStudyHistory()
  const [legacyHistory, setLegacyHistory] = useState<Attempt[] | null>(null)
  const [streak, setStreak] = useState<{currentStreak:number;longestStreak:number;completedToday:boolean} | null>(null)
  const [legacyError, setLegacyError] = useState('')
  const [streakError,setStreakError]=useState('')
  useEffect(() => {
    let active = true
    api.history().then(data => { if (active) setLegacyHistory(data) }).catch(e => { if (active) setLegacyError(e.message) })
    return () => { active = false }
  }, [])
  useEffect(()=>{
    let active=true
    api.dailyStreak().then(data=>{if(active){setStreak(data);setStreakError('')}}).catch(e=>{if(active)setStreakError(e.message)})
    return()=>{active=false}
  },[revision])
  const progress = course.data ? summarizeStudyProgress(course.data) : null
  return <Layout title="Hồ sơ">
    <div className="page-heading"><div><span className="section-label">HỒ SƠ PHI HÀNH GIA</span><h1>{user?.displayName}</h1><p>Tên đăng nhập: {user?.username}</p></div><div className="heading-icon"><Rocket size={38}/></div></div>
    <section className="card feature-card" aria-label="Tiến độ học tập"><h2>Tiến độ lộ trình</h2>{course.error ? <ErrorState message={course.error} retry={course.reload}/> : !progress ? <Loading/> : <><p><strong>{progress.completed}/{progress.total} bài học hoàn thành · {progress.percent}%</strong></p><div className="progress-track"><div style={{width:`${progress.percent}%`}}/></div><p>{progress.passedLevels}/{course.data!.levels.length} level đã vượt qua</p><Link className="button primary" to={progress.nextPath}>Tiếp tục lộ trình <ArrowRight size={18}/></Link></>}</section>
    <div className="profile-grid"><div style={{display:'grid',gap:20,alignContent:'start'}}>
      <section className="card profile-stat"><Trophy size={28}/><strong>Cấp tài khoản {user?.level}</strong><p>{user?.totalXp} EXP tích lũy</p><div className="progress-track xp"><div style={{width:`${(user?.xpInLevel || 0)/10}%`}}/></div><small>{user?.xpInLevel}/1.000 EXP trong cấp này</small></section>
      <section className="card profile-stat"><Swords size={28} color="#4b57c9"/><strong>Hạng {user?.pvpRankTitle || 'Đồng'} · {user?.pvpElo ?? 1000} ELO</strong><p>Thắng {user?.pvpWins ?? 0} · Thua {user?.pvpLosses ?? 0} · Hòa {user?.pvpDraws ?? 0}</p><small><Award size={13} style={{display:'inline',verticalAlign:'middle'}}/> Đỉnh ELO: {user?.pvpPeakElo ?? 1000} · <Link to="/arena">Khung &amp; Bảng xếp hạng</Link></small></section>
      <section className="card profile-stat"><Flame size={28} color="#f59e0b"/>{streakError?<ErrorState message={streakError} retry={reloadLearning}/>:!streak?<Loading/>:<><strong>Chuỗi {streak.currentStreak} ngày</strong><p>Kỷ lục: {streak.longestStreak} ngày liên tiếp</p><small>{streak.completedToday ? '✓ Đã duy trì chuỗi hôm nay' : 'Đạt ít nhất 80% một bài học, ôn tập hoặc kiểm tra để giữ chuỗi hôm nay.'}</small></>}</section>
    </div><div style={{display:'grid',gap:20,alignContent:'start'}}>
      <section className="card profile-history"><h2>Lịch sử học lộ trình</h2>{history.error ? <ErrorState message={history.error} retry={history.reload}/> : !history.data ? <Loading/> : history.data.length ? history.data.map(entry => <Link to={studyHistoryPath(entry)} key={entry.id} className="history-row"><div className="card-icon purple"><Clock3 size={20}/></div><div><strong>{studyKindName[entry.kind]} · {entry.title}</strong><span>{entry.status === 'IN_PROGRESS' ? 'Đang làm' : `${entry.correctCount}/${entry.totalQuestions} câu đúng · ${studyStatusName[entry.status]}`}</span><small>Level {entry.levelId} · {new Date(entry.submittedAt || entry.createdAt).toLocaleString('vi-VN')}</small></div><ArrowRight size={18}/></Link>) : <div className="empty-state">Chưa có lượt học nào. <Link to="/roadmap">Bắt đầu lộ trình</Link></div>}<small>20 lượt gần nhất</small></section>
      <section className="card profile-history"><h2>Lịch sử luyện tập và bài giao</h2>{!legacyHistory ? legacyError ? <ErrorState message={legacyError}/> : <Loading/> : legacyHistory.length ? legacyHistory.map(entry => <Link to={entry.status === 'IN_PROGRESS' ? `/attempts/${entry.id}` : `/attempts/${entry.id}/result`} key={entry.id} className="history-row"><div className="card-icon purple"><Clock3 size={20}/></div><div><strong>{entry.kind === 'PRACTICE' ? 'Luyện tập' : entry.kind === 'CHAPTER_BOSS' ? 'Boss cuối chương' : 'Boss bài học'}</strong><span>{entry.correctCount}/{entry.totalQuestions} câu đúng · {entry.status === 'IN_PROGRESS' ? 'Đang làm' : entry.status === 'WON' ? 'Hoàn thành' : 'Chưa đạt'}</span></div><ArrowRight size={18}/></Link>) : <p>Chưa có lượt luyện tập hoặc bài giao.</p>}</section>
    </div></div>
  </Layout>
}
