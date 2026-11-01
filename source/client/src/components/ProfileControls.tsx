import { Award, Check, LoaderCircle, Lock, Save, Shield } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'
import { useRealtimeRefresh } from '../services/realtimeRefresh'
import type { Profile, PvpCosmeticItem, PvpCosmeticsResponse } from '../types'

export function DisplayNameEditor({ user }: { user: Profile }) {
  const { setUser } = useAuth()
  const id = useId()
  const [name, setName] = useState(user.displayName)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!dirty) setName(user.displayName)
  }, [user.displayName, dirty])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const displayName = name.trim()
    setError('')
    setNotice('')
    if (displayName.length < 2 || displayName.length > 120) {
      setError('Tên hiển thị cần có từ 2 đến 120 ký tự.')
      return
    }
    setSaving(true)
    try {
      const profile = await api.updateProfile(displayName)
      setUser((current) =>
        current?.id === profile.id ? { ...current, displayName: profile.displayName } : current,
      )
      setName(profile.displayName)
      setDirty(false)
      setNotice('Đã cập nhật tên hiển thị.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="profile-name-form" onSubmit={save} noValidate aria-label="Đổi tên hiển thị">
      <label htmlFor={id}>Tên hiển thị</label>
      <div className="profile-name-fields">
        <input
          id={id}
          name="displayName"
          autoComplete="nickname"
          value={name}
          minLength={2}
          maxLength={120}
          required
          disabled={saving}
          aria-describedby={`${id}-hint`}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
            setError('')
            setNotice('')
          }}
        />
        <button className="button primary" disabled={saving || name.trim() === user.displayName}>
          {saving ? <LoaderCircle size={17} className="profile-spinner" /> : <Save size={17} />}
          {saving ? 'Đang lưu…' : 'Lưu tên hiển thị'}
        </button>
      </div>
      <small id={`${id}-hint`} className="muted">
        Từ 2 đến 120 ký tự. Tên này xuất hiện trên hồ sơ, lớp học và bảng xếp hạng.
      </small>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
    </form>
  )
}

export function useProfileCosmetics() {
  const { user, setUser } = useAuth()
  const [data, setData] = useState<PvpCosmeticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const revision = useRef(0)
  const equipping = useRef(false)
  const reload = useCallback(async () => {
    if (equipping.current) return
    const version = ++revision.current
    setLoading(true)
    setError('')
    try {
      const result = await api.arenaCosmetics()
      if (revision.current === version) setData(result)
    } catch (e) {
      if (revision.current === version) setError((e as Error).message)
    } finally {
      if (revision.current === version) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
    return () => {
      revision.current++
    }
  }, [reload])
  useRealtimeRefresh(reload)

  async function equip(item: PvpCosmeticItem) {
    if (!item.unlocked || equipping.current) return
    equipping.current = true
    const version = ++revision.current
    setBusy(item.code)
    setError('')
    setNotice('')
    try {
      const result = await api.arenaEquipCosmetic(item.code)
      // Merge only the changed fields so a concurrent name edit is preserved.
      setUser((current) =>
        current?.id === result.profile.id
          ? {
              ...current,
              equippedFrame: result.equippedFrame,
              equippedBadge: result.equippedBadge,
            }
          : current,
      )
      if (revision.current === version) {
        setData(result)
        setNotice(`Đã trang bị ${item.name}.`)
      }
    } catch (e) {
      if (revision.current === version) setError((e as Error).message)
    } finally {
      equipping.current = false
      if (revision.current === version) {
        setBusy(null)
        setLoading(false)
      }
    }
  }

  const frame = data?.items.find((item) => item.code === user?.equippedFrame)
  const badgeCode = user?.equippedBadge ?? data?.equippedBadge
  const badge = data?.items.find((item) => item.code === badgeCode)
  return { data, loading, busy, error, notice, reload, equip, frame, badge }
}

export function ProfileCosmetics({
  cosmetics,
}: {
  cosmetics: ReturnType<typeof useProfileCosmetics>
}) {
  const { user } = useAuth()
  const { data, loading, busy, error, notice, reload, equip } = cosmetics
  return (
    <section className="profile-wardrobe" aria-labelledby="profile-wardrobe-title">
      <div className="profile-section-heading">
        <div>
          <span className="section-label">PHẦN THƯỞNG PVP</span>
          <h2 id="profile-wardrobe-title">Khung & huy hiệu của bạn</h2>
          <p className="muted">
            Trang bị phần thưởng đã mở khóa để thể hiện thành tích trên hồ sơ và đấu trường.
          </p>
        </div>
        <Link className="text-link" to="/arena">
          Tới đấu trường
        </Link>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button secondary"
            disabled={loading || Boolean(busy)}
            onClick={() => void reload()}
          >
            Thử lại
          </button>
        </div>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {loading && !data && <p role="status">Đang tải bộ sưu tập…</p>}
      {data && (
        <div className="profile-cosmetic-grid">
          {(['FRAME', 'BADGE'] as const).map((type) => (
            <section className="card profile-section" key={type}>
              <h3>{type === 'FRAME' ? 'Khung ảnh đại diện' : 'Huy hiệu'}</h3>
              <div className="profile-owned-items">
                {data.items
                  .filter((item) => item.type === type)
                  .map((item) => {
                    const selected =
                      item.code ===
                      (type === 'FRAME'
                        ? (user?.equippedFrame ?? data.equippedFrame)
                        : (user?.equippedBadge ?? data.equippedBadge))
                    return (
                      <article
                        key={item.code}
                        className={`profile-owned-item ${selected ? 'selected' : ''} ${item.unlocked ? '' : 'locked'}`}
                      >
                        {type === 'FRAME' ? (
                          <span
                            className={`avatar profile-item-avatar ${item.cssClass}`}
                            aria-hidden="true"
                          >
                            {user?.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        ) : (
                          <span
                            className={`profile-item-badge ${item.cssClass}`}
                            aria-hidden="true"
                          >
                            <Award size={24} />
                          </span>
                        )}
                        <div className="profile-item-copy">
                          <strong>{item.name}</strong>
                          <small>{item.description}</small>
                          {!item.unlocked && (
                            <small className="profile-unlock-progress">
                              <Lock size={12} /> Chưa mở khóa · {item.currentProgress}/
                              {item.unlockThreshold}
                            </small>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`button ${selected || !item.unlocked ? 'secondary' : 'primary'} profile-equip-button`}
                          disabled={!item.unlocked || Boolean(busy) || selected}
                          aria-label={`${selected ? 'Đang trang bị' : item.unlocked ? 'Trang bị' : 'Chưa mở khóa'} ${item.name}`}
                          onClick={() => void equip(item)}
                        >
                          {busy === item.code ? (
                            <LoaderCircle size={15} className="profile-spinner" />
                          ) : selected ? (
                            <Check size={15} />
                          ) : item.unlocked ? (
                            type === 'FRAME' ? (
                              <Shield size={15} />
                            ) : (
                              <Award size={15} />
                            )
                          ) : (
                            <Lock size={15} />
                          )}
                          {busy === item.code
                            ? 'Đang lưu…'
                            : selected
                              ? 'Đang dùng'
                              : item.unlocked
                                ? 'Trang bị'
                                : 'Đã khóa'}
                        </button>
                      </article>
                    )
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
