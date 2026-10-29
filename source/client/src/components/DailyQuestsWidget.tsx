import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Flame,
  Gift,
  Heart,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { useDailyQuests } from '../app/DailyQuestsContext'
import type { DailyQuest } from '../types'
import './DailyQuestsWidget.css'

const icons: Record<string, typeof Sparkles> = {
  BookOpen,
  CheckCircle2,
  Heart,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
}
const tiers: Record<string, { label: string; className: string; order: number }> = {
  EASY: { label: 'Dễ', className: 'easy', order: 0 },
  MEDIUM: { label: 'Vừa', className: 'medium', order: 1 },
  HARD: { label: 'Khó', className: 'hard', order: 2 },
}

function questDestination(quest: DailyQuest, bossHref: string | null) {
  if (quest.category === 'ARENA') return '/arena'
  if (quest.category === 'BOSS') return bossHref
  return '/practice'
}

export function DailyQuestsWidget({ bossHref = null }: { bossHref?: string | null }) {
  const { user } = useAuth()
  const { data, loading, refreshing, error, actionError, pending, refresh, claim, replace } =
    useDailyQuests()
  const [toast, setToast] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])
  if (user?.role !== 'LEARNER') return null

  async function receive(id: number | 'milestone', reward: number) {
    setToast('')
    if ((await claim(id)) && mounted.current) {
      setToast(
        id === 'milestone'
          ? `Đã mở Rương Tinh Tú! +${reward} EXP và duy trì chuỗi hôm nay.`
          : `Đã nhận +${reward} EXP. Tiếp tục chinh phục nhé!`,
      )
    }
  }

  const quests = [...(data?.quests ?? [])].sort(
    (a, b) => (tiers[a.tier]?.order ?? 3) - (tiers[b.tier]?.order ?? 3),
  )
  const milestone = data?.milestone
  const streak = data?.streak
  const totalReward =
    quests.reduce((sum, quest) => sum + quest.rewardXp, 0) + (milestone?.rewardXp ?? 0)
  const claimedReward =
    quests.reduce((sum, quest) => sum + (quest.claimed ? quest.rewardXp : 0), 0) +
    (milestone?.claimed ? milestone.rewardXp : 0)
  const completed = milestone?.completedQuests ?? 0
  const total = milestone?.totalQuests ?? 0
  const progress = total > 0 ? Math.min(100, (completed / total) * 100) : 0

  return (
    <div className="daily-quests-area" id="daily-quests">
      <section className="dq-panel" aria-labelledby="daily-quests-title" aria-busy={loading}>
        <header className="dq-header">
          <div className="dq-header-line">
            <span className="dq-eyebrow">
              <Sparkles size={14} /> TRẠM NHIỆM VỤ
            </span>
            <button
              type="button"
              className="dq-refresh"
              onClick={() => void refresh()}
              disabled={refreshing || pending !== null}
              aria-label="Làm mới nhiệm vụ"
            >
              <RefreshCw size={16} className={refreshing ? 'dq-spin' : ''} />
            </button>
          </div>
          <div className="dq-heading-row">
            <h2 id="daily-quests-title">Nhiệm vụ hằng ngày</h2>
            {data && (
              <span className={`dq-count ${milestone?.allCompleted ? 'is-complete' : ''}`}>
                <CheckCircle2 size={14} />
                {completed}/{total}
              </span>
            )}
          </div>
          <p>Một chút nỗ lực mỗi ngày, một bước tiến xa hơn.</p>
          {data && quests.length > 0 && (
            <div className="dq-reward-summary">
              <span>
                <Zap size={15} />
                <strong>{claimedReward}</strong> / {totalReward} EXP đã nhận
              </span>
              <span>
                {completed === total
                  ? 'Hoàn thành mục tiêu!'
                  : `${total - completed} nhiệm vụ đang chờ`}
              </span>
            </div>
          )}
        </header>
        {actionError && (
          <div className="dq-message error" role="alert">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="dq-loading" role="status">
            <span className="sr-only">Đang tải nhiệm vụ hôm nay</span>
            {[0, 1, 2].map((i) => (
              <div className="dq-skeleton" key={i}>
                <i />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        ) : !data ? (
          <div className="dq-empty" role="alert">
            <Target size={30} />
            <strong>Chưa tải được nhiệm vụ</strong>
            <p>{error || 'Vui lòng thử lại sau ít phút.'}</p>
            <button
              className="dq-button primary"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw size={15} /> Thử lại
            </button>
          </div>
        ) : quests.length === 0 ? (
          <div className="dq-empty">
            <Sparkles size={30} />
            <strong>Trạm nhiệm vụ đang chuẩn bị</strong>
            <p>Chưa có nhiệm vụ hôm nay. Quay lại sau để tiếp tục hành trình nhé.</p>
            <button
              className="dq-button secondary"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              Tải lại nhiệm vụ
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="dq-message error" role="alert">
                {error}
                <button onClick={() => void refresh()} disabled={refreshing}>
                  Thử lại
                </button>
              </div>
            )}
            <div className="dq-list">
              {quests.map((quest) => {
                const tier = tiers[quest.tier] ?? { label: quest.tier, className: 'medium' }
                const Icon = icons[quest.icon] ?? Sparkles
                const percent =
                  quest.targetCount > 0
                    ? Math.max(0, Math.min(100, (quest.currentProgress / quest.targetCount) * 100))
                    : 0
                const destination = questDestination(quest, bossHref)
                const receiving = pending === quest.id
                return (
                  <article
                    key={quest.id}
                    className={`dq-task ${tier.className} ${quest.claimed ? 'is-claimed' : quest.completed ? 'is-ready' : ''}`}
                  >
                    <div className="dq-task-top">
                      <span className="dq-task-icon">
                        <Icon size={21} />
                      </span>
                      <div className="dq-task-copy">
                        <div className="dq-task-labels">
                          <span className="dq-tier">{tier.label}</span>
                          <span className="dq-task-reward">+{quest.rewardXp} EXP</span>
                        </div>
                        <h3>{quest.title}</h3>
                        <p>{quest.description}</p>
                      </div>
                    </div>
                    <div className="dq-progress-label">
                      <span>
                        {quest.claimed
                          ? 'Đã nhận thưởng'
                          : quest.completed
                            ? 'Hoàn thành · Sẵn sàng nhận thưởng'
                            : 'Đang thực hiện'}
                      </span>
                      <strong>
                        {quest.currentProgress}/{quest.targetCount}
                      </strong>
                    </div>
                    <div
                      className="dq-progress"
                      role="progressbar"
                      aria-label={`Tiến độ: ${quest.title}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percent)}
                      aria-valuetext={`${quest.currentProgress} trên ${quest.targetCount}`}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <div className="dq-task-footer">
                      {!quest.completed && !quest.claimed && (
                        <button
                          type="button"
                          className="dq-button secondary dq-replace"
                          disabled={pending !== null || refreshing}
                          title="Đổi sang nhiệm vụ cùng độ khó; tiến độ bắt đầu lại từ 0"
                          onClick={async () => {
                            setToast('')
                            if (await replace(quest.id)) {
                              if (mounted.current) setToast('Đã đổi nhiệm vụ mới. Tiến độ bắt đầu từ 0.')
                            }
                          }}
                        >
                          <RefreshCw size={15} className={receiving ? 'dq-spin' : ''} />
                          {receiving ? 'Đang đổi…' : 'Đổi nhiệm vụ'}
                        </button>
                      )}
                      {quest.claimed ? (
                        <span className="dq-claimed">
                          <CheckCircle2 size={15} /> Đã nhận
                        </span>
                      ) : quest.completed ? (
                        <button
                          className="dq-button primary"
                          disabled={pending !== null}
                          onClick={() => void receive(quest.id, quest.rewardXp)}
                          aria-label={`Nhận ${quest.rewardXp} EXP: ${quest.title}`}
                        >
                          {receiving ? (
                            <LoaderCircle size={15} className="dq-spin" />
                          ) : (
                            <Gift size={15} />
                          )}{' '}
                          {receiving ? 'Đang nhận…' : `Nhận +${quest.rewardXp} EXP`}
                        </button>
                      ) : destination ? (
                        <Link className="dq-button secondary" to={destination}>
                          Đi thực hiện <ArrowRight size={15} />
                        </Link>
                      ) : (
                        <span className="dq-task-hint">Vào bài học đã mở để thử thách Boss.</span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>


          </>
        )}
        <div className="dq-toast" role="status" aria-live="polite" aria-atomic="true">
          {toast && (
            <>
              <Sparkles size={17} />
              <span>{toast}</span>
            </>
          )}
        </div>
      </section>

      <aside className="dq-rewards-column" aria-label="Ph?n th??ng v? chu?i h?c t?p">
            {!loading && quests.length > 0 && milestone && (
              <div
                className={`dq-chest ${milestone.claimed ? 'is-claimed' : milestone.allCompleted ? 'is-ready' : ''}`}
              >
                <div className="dq-chest-intro">
                  <span className="dq-chest-icon">
                    {milestone.claimed ? <ShieldCheck size={29} /> : <Gift size={29} />}
                  </span>
                  <div>
                    <span className="dq-eyebrow">PHẦN THƯỞNG HOÀN THÀNH</span>
                    <h3>Rương Tinh Tú</h3>
                    <span className="dq-chest-reward">
                      +{milestone.rewardXp} EXP <i /> Duy trì chuỗi ngày
                    </span>
                  </div>
                </div>
                <div className="dq-chest-dots" aria-hidden="true">
                  {quests.map((quest, index) => (
                    <span className={quest.completed ? 'is-done' : ''} key={quest.id}>
                      {quest.completed ? <Check size={13} /> : index + 1}
                    </span>
                  ))}
                </div>
                <div
                  className="dq-progress"
                  role="progressbar"
                  aria-label="Tiến độ mở Rương Tinh Tú"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p>
                  {milestone.claimed
                    ? 'Rương đã mở! Hẹn bạn tiếp tục hành trình vào ngày mai.'
                    : milestone.allCompleted
                      ? 'Bạn đã hoàn thành mọi nhiệm vụ. Phần thưởng đang chờ!'
                      : `Hoàn thành ${total}/${total} nhiệm vụ để mở rương. Hiện tại: ${completed}/${total}.`}
                </p>
                {milestone.claimed ? (
                  <span className="dq-chest-done">
                    <CheckCircle2 size={17} /> Đã mở rương hôm nay
                  </span>
                ) : (
                  <button
                    className="dq-button chest"
                    disabled={!milestone.allCompleted || pending !== null}
                    onClick={() => void receive('milestone', milestone.rewardXp)}
                  >
                    {pending === 'milestone' ? (
                      <LoaderCircle size={17} className="dq-spin" />
                    ) : milestone.allCompleted ? (
                      <Gift size={17} />
                    ) : (
                      <LockKeyhole size={17} />
                    )}{' '}
                    {pending === 'milestone'
                      ? 'Đang mở rương…'
                      : milestone.allCompleted
                        ? `Mở rương +${milestone.rewardXp} EXP`
                        : 'Rương đang khóa'}
                  </button>
                )}
              </div>
            )}

      {streak && (
        <section
          className={`dq-streak ${streak.completedToday ? 'is-complete' : ''}`}
          aria-labelledby="daily-streak-title"
        >
          <div className="dq-streak-heading">
            <span className="dq-flame">
              <Flame size={25} />
            </span>
            <div>
              <span className="dq-eyebrow">GIỮ NHỊP HỌC TẬP</span>
              <h2 id="daily-streak-title">Mỗi ngày một bước tiến</h2>
            </div>
          </div>
          <div className="dq-streak-metrics">
            <div>
              <strong>
                {streak.currentStreak}
                <small> ngày</small>
              </strong>
              <span>Chuỗi hiện tại</span>
            </div>
            <div>
              <strong>
                <Trophy size={18} />
                {streak.longestStreak}
                <small> ngày</small>
              </strong>
              <span>Kỷ lục của bạn</span>
            </div>
          </div>
          <div className={`dq-streak-status ${streak.completedToday ? 'is-done' : ''}`}>
            {streak.completedToday ? <CheckCircle2 size={17} /> : <Flame size={17} />}
            <span>
              {streak.completedToday ? 'Đã duy trì chuỗi hôm nay' : 'Mở rương hôm nay để giữ chuỗi'}
            </span>
          </div>
          <p>
            Hoàn thành nhiệm vụ và mở rương mỗi ngày để nối dài chuỗi. Đăng nhập thôi chưa được tính
            là một ngày hoàn thành.
          </p>
        </section>
      )}
      </aside>
    </div>
  )
}
