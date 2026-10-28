import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Compass,
  Flame,
  Swords,
  Target,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { Layout } from '../components/Layout'
import { DailyQuestsWidget } from '../components/DailyQuestsWidget'
import { sortLessons, topicName } from './RoadmapPage'
import type { Lesson } from '../types'
import './dashboard-home.css'

export function DashboardHome({ lessons }: { lessons: Lesson[] }) {
  const { user } = useAuth()
  const ordered = sortLessons(lessons)
  const done = lessons.filter((lesson) => lesson.status === 'COMPLETED').length
  const percent = lessons.length ? Math.round((done / lessons.length) * 100) : 0
  const current = ordered.find((lesson) => lesson.status === 'AVAILABLE')
  const bossLesson = current ?? ordered.find((lesson) => lesson.status !== 'LOCKED')
  const pendingTopic = [...new Set(ordered.map((lesson) => lesson.topicSlug))].find((slug) => {
    const chapter = ordered.filter((lesson) => lesson.topicSlug === slug)
    return chapter.every((lesson) => lesson.status === 'COMPLETED') && !chapter[0].chapterCompleted
  })
  const pendingName =
    ordered.find((lesson) => lesson.topicSlug === pendingTopic)?.topicTitle ||
    (pendingTopic ? topicName(pendingTopic) : '')
  const nextHref = current
    ? `/lessons/${current.id}`
    : pendingTopic
      ? `/roadmap?planet=${pendingTopic}#${pendingTopic}`
      : '/roadmap'
  const level = user?.level ?? 1
  const xp = user?.xpInLevel ?? 0
  const remaining = Math.max(0, level * 1000 - (user?.totalXp ?? 0))

  return (
    <Layout title="Tổng quan">
      <div className="dashboard-home">
        <header className="home-heading">
          <div>
            <span className="home-eyebrow">KHÔNG GIAN HỌC TẬP</span>
            <h1>Chào {user?.displayName || user?.username}!</h1>
            <p>Tiếp tục bài học, hoàn thành mục tiêu của hôm nay.</p>
          </div>
          <Link className="home-text-link" to="/roadmap">
            Lộ trình của bạn <ArrowRight size={16} />
          </Link>
        </header>

        <section className="home-stats" aria-label="Tiến độ học tập">
          <div>
            <span>
              <BookOpen size={16} />
              Bài học hoàn thành
            </span>
            <strong>
              {done}
              <small> / {lessons.length}</small>
            </strong>
            <p>{lessons.length ? `${percent}% hành trình` : 'Chưa có dữ liệu bài học'}</p>
          </div>
          <div>
            <span>
              <Target size={16} />
              Cấp độ hiện tại
            </span>
            <strong>Cấp {level}</strong>
            <p>{(user?.totalXp ?? 0).toLocaleString('vi-VN')} XP tích lũy</p>
          </div>
          <div>
            <span>
              <Flame size={16} />
              Mục tiêu tiếp theo
            </span>
            <strong>
              {remaining.toLocaleString('vi-VN')}
              <small>XP</small>
            </strong>
            <p>Để đạt cấp {level + 1}</p>
          </div>
        </section>

        <div className="home-columns">
          <div className="home-main">
            <section className="home-next-lesson">
              <div className="home-section-top">
                <span className="home-eyebrow">{current ? 'TIẾP TỤC HỌC' : 'BƯỚC TIẾP THEO'}</span>
                <span className="home-lesson-label">
                  <BookOpen size={14} />
                  {current ? 'Bài học trong lộ trình' : 'Lộ trình cá nhân'}
                </span>
              </div>
              <h2>
                {current?.title ||
                  (pendingTopic
                    ? pendingName
                    : lessons.length
                      ? 'Bạn đã hoàn thành các bài hiện có'
                      : 'Bắt đầu hành trình học')}
              </h2>
              <p>
                {current?.summary ||
                  (pendingTopic
                    ? 'Hoàn thành thử thách chương để tiếp tục hành trình.'
                    : 'Khám phá các chủ đề và chọn bài học phù hợp với bạn.')}
              </p>
              <div className="home-lesson-footer">
                <span>Học theo nhịp của bạn</span>
                <Link to={nextHref} className="home-primary">
                  {current
                    ? 'Tiếp tục học'
                    : pendingTopic
                      ? 'Xem thử thách chương'
                      : 'Khám phá lộ trình'}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </section>

            <section className="home-progress-card">
              <div className="home-section-top">
                <h2>Tiến độ của bạn</h2>
                <span>Cấp {level}</span>
              </div>
              <div className="home-xp-label">
                <strong>
                  {xp.toLocaleString('vi-VN')} <small>/ 1.000 XP</small>
                </strong>
                <span>{Math.round(Math.min(100, xp / 10))}%</span>
              </div>
              <div
                className="home-progress-track"
                role="progressbar"
                aria-label="XP trong cấp hiện tại"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, xp / 10)}
              >
                <span style={{ width: `${Math.min(100, xp / 10)}%` }} />
              </div>
              <p>
                XP từ bài học và phần thưởng nhiệm vụ giúp bạn tăng cấp. ELO PvP được tính riêng.
              </p>
            </section>

            <section className="home-quick-section">
              <h2>Chọn cách luyện hôm nay</h2>
              <div className="home-quick-links">
                <Link to="/practice">
                  <BookOpen size={20} />
                  <div>
                    <strong>Luyện tập</strong>
                    <span>Ôn kiến thức, luyện câu hỏi</span>
                  </div>
                  <ArrowRight size={16} />
                </Link>
                <Link to="/arena">
                  <Swords size={20} />
                  <div>
                    <strong>Đấu trường</strong>
                    <span>So tài cùng người chơi khác</span>
                  </div>
                  <ArrowRight size={16} />
                </Link>
                <Link to="/roadmap">
                  <Compass size={20} />
                  <div>
                    <strong>Lộ trình học</strong>
                    <span>Xem các chủ đề và tiến độ</span>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </section>

            <details className="home-quest-guide" open>
              <summary>
                <span>
                  <CheckCircle2 size={18} />
                  Nhiệm vụ hằng ngày hoạt động thế nào?
                </span>
                <ChevronDown size={16} />
              </summary>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>Nhận 3 mục tiêu mỗi ngày</strong>
                    <p>
                      Mỗi người có một nhiệm vụ dễ, vừa và khó, chọn từ luyện tập, Boss hoặc PvP.
                      Nhiệm vụ không yêu cầu tham gia lớp học.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Thực hiện và nhận XP</strong>
                    <p>
                      Tiến độ tự ghi nhận khi bạn học hoặc thi đấu. Hoàn thành rồi bấm nhận thưởng:
                      30, 50 hoặc 70 XP theo độ khó.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Mở rương để giữ chuỗi</strong>
                    <p>
                      Hoàn thành cả 3 nhiệm vụ để mở rương +100 XP. Mở rương mỗi ngày giúp nối dài
                      chuỗi; chỉ đăng nhập chưa được tính.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="home-guide-note">
                Nhiệm vụ đổi khi sang ngày mới theo giờ máy chủ. Nhận thưởng nhiệm vụ và mở rương là
                hai thao tác riêng.
              </p>
            </details>
          </div>
          <aside className="home-daily">
            <DailyQuestsWidget bossHref={bossLesson ? `/lessons/${bossLesson.id}` : null} />
          </aside>
        </div>
      </div>
    </Layout>
  )
}
