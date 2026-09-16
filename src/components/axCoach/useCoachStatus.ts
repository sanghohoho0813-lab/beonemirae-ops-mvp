import { useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { coachMissions, coverageOf, earliestRecord } from '../../lib/axCoach'
import { today } from '../../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
//  오늘 상태 한 덩어리 (0121)
//
//   「오늘 몇 개를 받았고 그중 몇 개가 **실제 기록으로** 확인됐는지, 그래서
//    지금 준비도가 몇 %인지」 — 화면 세 곳이 같은 값을 써야 하므로 한 자리에
//    둡니다 (사이드바 단추 · 첫 화면 줄 · AX 코치 화면).
//
//   ⚠ done 은 「했다고 누른 수」가 아닙니다. 실제 업무기록이 생겨서 코치가
//     확인한 수입니다 — 이 시스템에 「했다」 단추는 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachStatus {
  /** 실증 자료 준비도 (%) */
  pct: number
  /** 오늘 아직 남은 일 */
  todo: number
  /** 오늘 실제 기록으로 확인된 일 */
  done: number
  /** 오늘 받은 일 전체 */
  total: number
  /** 이 역할이 코치를 볼 수 있는가 */
  canSee: boolean
}

export function useCoachStatus(): CoachStatus {
  const { data } = useData()
  const { role } = useAuth()
  const t = today()

  return useMemo(() => {
    const start = data.experiment?.startDate ?? earliestRecord(data) ?? t
    const cov = coverageOf(data, { from: start <= t ? start : t, to: t })
    const m = coachMissions(data, cov, { role: role ?? 'office', today: t, issued: data.coachMissions })
    return {
      pct: cov.pct,
      todo: m.todo.length,
      done: m.done.length,
      total: m.todo.length + m.done.length,
      canSee: role === 'admin' || role === 'office',
    }
  }, [data, role, t])
}
