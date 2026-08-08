import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { tourFor, markTourSeen, stepsFor, type Tour, type TourStep } from '../lib/tour'
import { useAuth } from './AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 실행 상태
//  화면 어디서든 "사용 방법 보기"를 눌러 시작할 수 있어야 하므로 전역으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

interface TourContextValue {
  /** 현재 실행 중인 투어 (없으면 null) */
  active: Tour | null
  /** 시작할 때의 화면 폭으로 고른 단계 목록 (폰은 더 짧습니다) */
  steps: TourStep[]
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
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)

  const myTour = useMemo(() => tourFor(role), [role])

  const start = useCallback(
    (tour?: Tour) => {
      const t = tour ?? myTour
      setIndex(0)
      // 시작 시점의 폭으로 한 번만 고릅니다. 중간에 바뀌면 단계가 어긋납니다.
      setSteps(stepsFor(t, window.innerWidth))
      setActive(t)
    },
    [myTour],
  )

  // 끝낼 때는 steps 까지 비웁니다.
  // active 만 지우면 steps[0] 이 그대로 남아, 투어를 소비하는 쪽에서
  // "아직 1단계가 있다"고 오해할 수 있습니다. 실제로 그 때문에 투어를 닫은
  // 뒤에도 화면이 1단계 경로로 되돌아가는 문제가 있었습니다.
  const stop = useCallback(() => {
    if (active) markTourSeen(active.id)
    setActive(null)
    setSteps([])
    setIndex(0)
  }, [active])

  const next = useCallback(() => {
    if (!active) return
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        markTourSeen(active.id)
        setActive(null)
        setSteps([])
        return 0
      }
      return i + 1
    })
  }, [active, steps.length])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  const value = useMemo<TourContextValue>(
    () => ({ active, steps, index, start, next, prev, stop, myTour }),
    [active, steps, index, start, next, prev, stop, myTour],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour 는 TourProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
