import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { tourFor, markTourSeen, type Tour } from '../lib/tour'
import { useAuth } from './AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 실행 상태
//  화면 어디서든 "사용 방법 보기"를 눌러 시작할 수 있어야 하므로 전역으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

interface TourContextValue {
  /** 현재 실행 중인 투어 (없으면 null) */
  active: Tour | null
  index: number
  start: (tour?: Tour) => void
  next: () => void
  prev: () => void
  /** 건너뛰기 / 종료 — 어느 쪽이든 본 것으로 기록합니다 */
  stop: () => void
  /** 이 사용자 역할에 맞는 투어 */
  myTour: Tour
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  const [active, setActive] = useState<Tour | null>(null)
  const [index, setIndex] = useState(0)

  const myTour = useMemo(() => tourFor(role), [role])

  const start = useCallback(
    (tour?: Tour) => {
      setIndex(0)
      setActive(tour ?? myTour)
    },
    [myTour],
  )

  const stop = useCallback(() => {
    if (active) markTourSeen(active.id)
    setActive(null)
    setIndex(0)
  }, [active])

  const next = useCallback(() => {
    if (!active) return
    setIndex((i) => {
      if (i + 1 >= active.steps.length) {
        markTourSeen(active.id)
        setActive(null)
        return 0
      }
      return i + 1
    })
  }, [active])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  const value = useMemo<TourContextValue>(
    () => ({ active, index, start, next, prev, stop, myTour }),
    [active, index, start, next, prev, stop, myTour],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour 는 TourProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
