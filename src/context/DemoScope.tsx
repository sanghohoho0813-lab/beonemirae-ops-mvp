import { useMemo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DataContext, useData } from './DataContext'
import { usePresenter } from './PresenterContext'
import { hidePresenterDemo } from '../lib/demoScope'

// ─────────────────────────────────────────────────────────────────────────────
//  시연 흔적은 시연 안에서만 (0142) — 업무 화면에는 「시연용 병원」 기록을 거른 자료를 줍니다.
//
//   · 시연 중(안내 카드 켜짐) · 발표 시작 화면(/presentation) → 받은 자료 그대로
//   · 그 밖의 화면 → hidePresenterDemo (DB 는 그대로 · 지우지 않음)
//   ⚠ 저장 · 다시 읽기 같은 기능은 바깥 DataProvider 의 것을 그대로 씁니다 — 자료만 거릅니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DemoScope({ children }: { children: ReactNode }) {
  const outer = useData()
  const { active } = usePresenter()
  const { pathname } = useLocation()
  const presenting = active || pathname === '/presentation'
  const value = useMemo(() => {
    if (presenting) return outer
    const data = hidePresenterDemo(outer.data)
    return data === outer.data ? outer : { ...outer, data }
  }, [outer, presenting])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
