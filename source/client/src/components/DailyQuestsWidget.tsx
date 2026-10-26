import { useEffect, useState } from 'react'
import {
  BookOpen,
  Check,
  CheckCircle2,
  Flame,
  Gift,
  Heart,
  School,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap
} from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'
import { useSystemSocket } from '../app/SystemSocketContext'
import type { DailyQuest, DailyQuestOverview } from '../types'
import './DailyQuestsWidget.css'

export function DailyQuestsWidget({ onStreakUpdate }: { onStreakUpdate?: (streak: number) => void }) {
  const { setUser } = useAuth()
  const { subscribe } = useSystemSocket()
  const [revision,setRevision]=useState(0)
  useEffect(()=>subscribe(message=>{if(message.action==='ROADMAP_PROGRESS_CHANGED')setRevision(v=>v+1)}),[subscribe])
  const [data, setData] = useState<DailyQuestOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [claimingMilestone, setClaimingMilestone] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.dailyQuests()
      .then(res => {
        if (!active) return
        setData(res)
        if (onStreakUpdate && res.streak) {
          onStreakUpdate(res.streak.currentStreak)
        }
      })
      .catch(err => {
        if (!active) return
        setError(err.message || 'Không thể tải nhiệm vụ hàng ngày')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [onStreakUpdate,revision])

  function showToast(msg: string) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  async function handleClaimQuest(quest: DailyQuest) {
    if (claimingId !== null || quest.claimed || !quest.completed) return
    setClaimingId(quest.id)
    try {
      const res = await api.claimDailyQuest(quest.id)
      setUser(res.profile)
      setData(prev => {
        if (!prev) return prev
        const updated = prev.quests.map(q => q.id === quest.id ? { ...q, claimed: true } : q)
        return { ...prev, quests: updated }
      })
      showToast(`+${quest.rewardXp} EXP đã được cộng vào tài khoản! ⭐`)
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setClaimingId(null)
    }
  }

  async function handleClaimMilestone() {
    if (claimingMilestone || !data?.milestone.allCompleted || data?.milestone.claimed) return
    setClaimingMilestone(true)
    try {
      const res = await api.claimDailyMilestone()
      setUser(res.profile)
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          milestone: res.milestone,
          streak: res.streak
        }
      })
      if (onStreakUpdate) {
        onStreakUpdate(res.streak.currentStreak)
      }
      showToast(`Mở Rương Tinh Tú thành công: +${res.milestone.rewardXp} EXP · Chuỗi ${res.streak.currentStreak} ngày! 🔥🎁`)
    } catch (e) {
      showToast((e as Error).message)
    } finally {
      setClaimingMilestone(false)
    }
  }

  function getQuestIcon(iconName: string, tier: string) {
    const cls = `daily-quest-icon ${tier.toLowerCase()}`
    switch (iconName) {
      case 'BookOpen': return <div className={cls}><BookOpen size={20}/></div>
      case 'Zap': return <div className={cls}><Zap size={20}/></div>
      case 'Swords': return <div className={cls}><Swords size={20}/></div>
      case 'Trophy': return <div className={cls}><Trophy size={20}/></div>
      case 'Target': return <div className={cls}><Target size={20}/></div>
      case 'Heart': return <div className={cls}><Heart size={20}/></div>
      case 'School': return <div className={cls}><School size={20}/></div>
      case 'CheckCircle2': return <div className={cls}><CheckCircle2 size={20}/></div>
      default: return <div className={cls}><Sparkles size={20}/></div>
    }
  }

  function getTierLabel(tier: string) {
    switch (tier) {
      case 'EASY': return 'Dễ'
      case 'MEDIUM': return 'Trung bình'
      case 'HARD': return 'Thử thách'
      default: return tier
    }
  }

  if (loading) {
    return (
      <div className="daily-quests-card">
        <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
          Đang nạp nhiệm vụ không gian...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const { quests, milestone, streak } = data

  return (
    <div className="daily-quests-card">
      {toastMessage && (
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '16px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#ffffff',
          padding: '0.45rem 0.9rem',
          borderRadius: '8px',
          fontSize: '0.82rem',
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <Sparkles size={16}/> {toastMessage}
        </div>
      )}

      <div className="daily-quests-header">
        <div className="daily-quests-header-left">
          <div className="daily-quests-icon-wrap">
            <Sparkles size={22}/>
          </div>
          <div className="daily-quests-title-block">
            <h3>NHIỆM VỤ HÀNG NGÀY</h3>
            <p>Làm mới lúc 00:00 (UTC+7) · Thưởng nhiệm vụ tối đa {quests.reduce((sum,q)=>sum+q.rewardXp,0)+milestone.rewardXp} EXP/ngày</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {streak && (
            <span className="streak-pill" title={`Chuỗi học liên tục: ${streak.currentStreak} ngày`}>
              <Flame size={16}/> {streak.currentStreak} ngày
            </span>
          )}
          <span className={`daily-quests-badge ${milestone.allCompleted ? 'all-done' : ''}`}>
            {milestone.completedQuests}/{milestone.totalQuests} Hoàn thành
          </span>
        </div>
      </div>

      <div className="daily-quests-list">
        {quests.map(quest => {
          const percent = Math.min(100, Math.round((quest.currentProgress / quest.targetCount) * 100))
          return (
            <div
              key={quest.id}
              className={`daily-quest-item ${quest.completed ? 'completed' : ''} ${quest.claimed ? 'claimed' : ''}`}
            >
              <div className="daily-quest-left">
                {getQuestIcon(quest.icon, quest.tier)}
                <div className="daily-quest-details">
                  <div className="daily-quest-details-top">
                    <span className={`daily-quest-tier-tag ${quest.tier.toLowerCase()}`}>
                      {getTierLabel(quest.tier)}
                    </span>
                    <span className="daily-quest-name">{quest.title}</span>
                  </div>
                  <p className="daily-quest-desc">{quest.description}</p>
                  <div className="daily-quest-progress-bar">
                    <div className="daily-quest-progress-track">
                      <div
                        className={`daily-quest-progress-fill ${percent === 100 ? 'full' : ''}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="daily-quest-progress-text">
                      {quest.currentProgress}/{quest.targetCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="daily-quest-action">
                {quest.claimed ? (
                  <span className="quest-claimed-chip">
                    <Check size={14}/> Đã nhận
                  </span>
                ) : quest.completed ? (
                  <button
                    className="quest-claim-btn"
                    disabled={claimingId === quest.id}
                    onClick={() => handleClaimQuest(quest)}
                  >
                    <Gift size={15}/> {claimingId === quest.id ? 'Đang nhận...' : `+${quest.rewardXp} EXP`}
                  </button>
                ) : (
                  <span className="quest-in-progress-chip">
                    +{quest.rewardXp} EXP
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="muted">Đạt ít nhất 80% một bài học, ôn tập hoặc kiểm tra để tự động giữ chuỗi ngày học; không cần nhận rương.</p>
      <div className="daily-milestone-box">
        <div className="daily-milestone-left">
          <div className="daily-milestone-icon">
            <Gift size={24}/>
          </div>
          <div className="daily-milestone-text">
            <h4>RƯƠNG TINH TÚ NGÀY (+{milestone.rewardXp} EXP)</h4>
            <p>
              {milestone.claimed
                ? '✦ Bạn đã nhận thưởng rương hôm nay!'
                : milestone.allCompleted
                ? '✦ Chúc mừng! Bạn đã hoàn thành trọn vẹn 3 nhiệm vụ ngày, mở rương ngay!'
                : `Hoàn thành 3/3 nhiệm vụ hôm nay để mở rương (hiện tại: ${milestone.completedQuests}/3).`}
            </p>
          </div>
        </div>

        <div className="daily-milestone-right">
          {milestone.claimed ? (
            <span className="quest-claimed-chip" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
              <Check size={16}/> Đã nhận rương
            </span>
          ) : milestone.allCompleted ? (
            <button
              className="milestone-claim-btn"
              disabled={claimingMilestone}
              onClick={handleClaimMilestone}
            >
              <Gift size={17}/> {claimingMilestone ? 'Đang mở...' : `Mở Rương (+${milestone.rewardXp} EXP) 🌟`}
            </button>
          ) : (
            <span className="quest-in-progress-chip" style={{ fontWeight: 700 }}>
              Cần {milestone.totalQuests - milestone.completedQuests} nhiệm vụ nữa
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
