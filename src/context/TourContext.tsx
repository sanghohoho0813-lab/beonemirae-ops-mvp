import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { tourFor, markTourSeen, stepsFor, TOURS, type Tour, type TourId, type TourStep } from '../lib/tour'
import { useAuth } from './AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 제품 투어 실행 상태
//  화면 어디서든 "사용 방법 보기"를 눌러 시작할 수 있어야 하므로 전역으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  진행 중인 투어를 **기억합니다** (0110)
//
//   새로고침 · 라우트 이동 · 뒤로가기로 컴포넌트가 다시 그려져도 몇 단계까지
//   왔는지는 남아야 합니다. 심사 자리에서 새로고침 한 번에 1단계로 돌아가면
//   그 자리에서 시연이 끝납니다.
//
//  ── 어디까지 기억하는가 ──────────────────────────────────────────────────
//
//   sessionStorage   같은 탭에서만 · 탭을 닫으면 사라집니다
//   2시간            그 뒤에는 이어 주지 않습니다 (어제 켜 둔 투어가 오늘
//                    아침에 되살아나면 그게 더 놀랍습니다)
//   심사 시연만      역할 투어(staff·field·client)는 **예전 그대로** 새로고침하면
//                    끝납니다. 매일 쓰는 분들의 동작을 바꾸지 않기 위해서입니다.
//                    여기 배열에 한 줄 더하면 그때 확장됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const RUN_KEY = 'beonemirae-ops:tour-run'
const PERSISTED: TourId[] = ['demo']
const RUN_MAX_MS = 2 * 60 * 60 * 1000

interface SavedRun {
  id: TourId
  index: number
  at: number
}

function saveRun(id: TourId, index: number): void {
  if (!PERSISTED.includes(id)) return
  try {
    sessionStorage.setItem(RUN_KEY, JSON.stringify({ id, index, at: Date.now() } satisfies SavedRun))
  } catch {
    /* 저장이 막혀 있어도 투어는 그대로 돕니다 — 기억만 못 할 뿐입니다 */
  }
}

function clearRun(): void {
  try {
    sessionStorage.removeItem(RUN_KEY)
  } catch {
    /* noop */
  }
}

function loadRun(): SavedRun | null {
  try {
    const raw = sessionStorage.getItem(RUN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<SavedRun>
    if (!v.id || !PERSISTED.includes(v.id)) return null
    if (typeof v.at !== 'number' || Date.now() - v.at > RUN_MAX_MS) return null
    return { id: v.id, index: Math.max(0, Math.trunc(v.index ?? 0)), at: v.at }
  } catch {
    return null
  }
}

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
  /**
   * 특정 단계로 바로 맞춥니다 (0110).
   *
   *  ⚠ 화면 이동(뒤로가기·앞으로가기·직접 클릭)을 따라가는 데 씁니다.
   *    투어가 사용자를 끌고 오는 대신 **사용자를 따라갑니다.**
   */
  goToStep: (i: number) => void
  /** 이 사용자 역할에 맞는 투어 */
  myTour: Tour
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  //  새로고침 직후 이어받을 것이 있는가 — 첫 렌더에서 한 번만 봅니다.
  const restored = useMemo(() => {
    const r = loadRun()
    if (!r) return null
    const t = TOURS[r.id]
    if (!t) return null
    const s = stepsFor(t, window.innerWidth)
    if (s.length === 0) return null
    return { tour: t, steps: s, index: Math.min(r.index, s.length - 1) }
  }, [])
  const [active, setActive] = useState<Tour | null>(restored?.tour ?? null)
  const [steps, setSteps] = useState<TourStep[]>(restored?.steps ?? [])
  const [index, setIndex] = useState(restored?.index ?? 0)

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

  const goToStep = useCallback(
    (i: number) => setIndex((cur) => (i >= 0 && i < steps.length && i !== cur ? i : cur)),
    [steps.length],
  )

  //  지금 어디까지 왔는지 적어 둡니다. 끝나면 지웁니다.
  useEffect(() => {
    if (active) saveRun(active.id, index)
    else clearRun()
  }, [active, index])

  const value = useMemo<TourContextValue>(
    () => ({ active, steps, index, start, next, prev, stop, goToStep, myTour }),
    [active, steps, index, start, next, prev, stop, goToStep, myTour],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour 는 TourProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
