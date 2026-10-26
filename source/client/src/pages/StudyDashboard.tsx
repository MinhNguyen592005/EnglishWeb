import { ArrowRight, BookOpen, ChevronRight, Rocket, Star, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { DailyQuestsWidget } from '../components/DailyQuestsWidget'
import { ErrorState, Loading } from '../components/States'
import { useStudyCourse } from './roadmap/useStudyProgress'
import { summarizeStudyProgress } from './roadmap/progress'

export function StudyDashboard() {
  const { user } = useAuth()
  const { data: course, error, reload } = useStudyCourse()
  if (!course) return <Layout title="Tổng quan">{error ? <ErrorState message={error} retry={reload}/> : <Loading/>}</Layout>
  const progress = summarizeStudyProgress(course)
  const { nextLevel, nextModule, nextLesson } = progress
  const finished = course.levels.length > 0 && course.levels.every(level => level.passed)
  return <Layout title="Tổng quan">
    <div className="page-heading"><div><span className="section-label">TRẠM CHỈ HUY</span><h1>Chào {user?.displayName}! <span className="wave">✦</span></h1><p>Một bài học nhỏ hôm nay sẽ đưa bạn đến hành tinh lớn hơn.</p></div><div className="heading-icon"><Rocket size={38}/></div></div>
    {error && <ErrorState message={error} retry={reload}/>}
    <div className="dashboard-grid"><div className="primary-column">
      <section className="hero-card"><div><span className="hero-kicker">HÀNH TRÌNH HIỆN TẠI</span><h2>Chinh phục ngữ pháp</h2><p>{progress.passedLevels}/{course.levels.length} level đã vượt qua</p><div className="hero-progress"><span>{progress.completed}/{progress.total} bài học hoàn thành</span><strong>{progress.percent}%</strong></div><div className="progress-track"><div style={{width:`${progress.percent}%`}}/></div><Link className="button white" to="/roadmap">Xem lộ trình <ArrowRight size={18}/></Link></div><div className="hero-planet"><span>✦</span><div className="planet"/></div></section>
      <DailyQuestsWidget/>
      <section className="card current-card"><div className="card-title-row"><div className="card-icon purple"><BookOpen size={22}/></div><span className="tag">{nextLesson ? 'BÀI HỌC TIẾP THEO' : finished ? 'LỘ TRÌNH CỦA BẠN' : 'THỬ THÁCH TIẾP THEO'}</span></div><h3>{nextLesson?.title || (finished ? 'Đã vượt qua các level hiện có' : nextModule&&!nextModule.passed?`Kiểm tra module ${nextModule.ordinalNo}`:`Kiểm tra cuối level ${nextLevel?.id || ''}`)}</h3><p>{nextModule?.title || (finished ? 'Bạn có thể ôn lại các bài học và kiểm tra đã hoàn thành.' : `${nextLevel?.title || ''} · Đạt ít nhất 8/10 để vượt level.`)}</p><Link className="button primary" to={progress.nextPath}>{nextLesson ? 'Tiếp tục học' : finished ? 'Ôn lại lộ trình' : 'Xem bài kiểm tra'} <ArrowRight size={18}/></Link></section>
    </div><aside className="secondary-column">
      <section className="card stat-card"><div className="card-title-row"><div className="card-icon amber"><Star size={22}/></div><span>KINH NGHIỆM TÍCH LŨY</span></div><h3>Cấp tài khoản {user?.level}</h3><p>{user?.xpInLevel} / 1.000 EXP để lên cấp</p><div className="progress-track xp"><div style={{width:`${(user?.xpInLevel || 0)/10}%`}}/></div><div className="stat-split"><span>Tổng EXP</span><strong>{user?.totalXp}</strong></div></section>
      <section className="card goal-card"><div className="card-title-row"><div className="card-icon mint"><Target size={22}/></div><span>ĐÍCH ĐẾN</span></div><h3>Kiểm tra cuối level</h3><p>Đạt bài học và kiểm tra module, sau đó đạt ít nhất 8/10 câu kiểm tra để mở level tiếp theo.</p><Link to="/roadmap">Xem lộ trình <ChevronRight size={17}/></Link></section>
    </aside></div>
  </Layout>
}
