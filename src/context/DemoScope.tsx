import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DataContext, useData } from './DataContext'
import { usePresenter } from './PresenterContext'
import { hidePresenterDemo, scopePresenterDemo } from '../lib/demoScope'

/**
 * 거르지 않은 자료 (0143) — 시연 요청을 만들고 다시 찾는 쪽(usePrepareDemo)은 거른 자료를 보면
 *  방금 넣은 요청을 못 찾을 수 있어 바깥 자료를 그대로 씁니다.
 */
const RawData = createContext<ReturnType<typeof useData> | null>(null)
// eslint-disable-next-line react-refresh/only-export-components
export function useRawData() {
  const raw = useContext(RawData)
  const scoped = useData()
  return raw ?? scoped
}

// ─────────────────────────────────────────────────────────────────────────────
//  시연 흔적은 시연 안에서만 (0142) — 업무 화면에는 「시연용 병원」 기록을 거른 자료를 줍니다.
//
//   · 시연 중(안내 카드 켜짐) → 이번 시연(since) 뒤의 시연 병원 기록만 (0143 · 지난 연습 흔적 없음)
//   · 발표 시작 화면(/presentation) → 받은 자료 그대로 (준비 상태가 시연 병원을 봄)
//   · 그 밖의 화면 → hidePresenterDemo (DB 는 그대로 · 지우지 않음)
//   ⚠ 저장 · 다시 읽기 같은 기능은 바깥 DataProvider 의 것을 그대로 씁니다 — 자료만 거릅니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DemoScope({ children }: { children: ReactNode }) {
  const outer = useData()
  const { active, since, demoRequestId } = usePresenter()
  const { pathname } = useLocation()
  const value = useMemo(() => {
    //  시연 중 — 이번 시연 뒤의 시연 병원 기록만 (지난 연습 흔적 없음 · 0143)
    if (active) {
      const data = scopePresenterDemo(outer.data, since, demoRequestId)
      return data === outer.data ? outer : { ...outer, data }
    }
    //  발표 시작 화면 — 준비 상태가 시연 병원을 봐야 해서 그대로
    if (pathname === '/presentation') return outer
    //  업무 화면 — 시연 병원과 그 기록은 안 보임
    const data = hidePresenterDemo(outer.data)
    return data === outer.data ? outer : { ...outer, data }
  }, [outer, active, since, demoRequestId, pathname])
  return (
    <RawData.Provider value={outer}>
      <DataContext.Provider value={value}>{children}</DataContext.Provider>
    </RawData.Provider>
  )
}
