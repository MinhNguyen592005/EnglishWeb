import { useCallback, useEffect, useState } from 'react'
import { useSystemSocket } from '../../app/SystemSocketContext'
import type { StudyCourse, StudyHistoryEntry } from './types'

function useStudyData<T>(action: 'ROADMAP_OPEN' | 'ROADMAP_HISTORY') {
  const { request, connected, subscribe } = useSystemSocket()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => subscribe(message => {
    if (['ROADMAP_PROGRESS_CHANGED', 'PLACEMENT_COMPLETED', 'CURRICULUM_CHANGED'].includes(message.action)) reload()
  }), [subscribe, reload])
  useEffect(() => {
    if (!connected) return
    let active = true
    setError('')
    request<T>(action, 'ROADMAP_COURSE_DATA').then(result => { if (active) setData(result) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [action, request, connected, revision])
  return { data, error, reload }
}
export const useStudyCourse = () => useStudyData<StudyCourse>('ROADMAP_OPEN')
export const useStudyHistory = () => useStudyData<StudyHistoryEntry[]>('ROADMAP_HISTORY')
