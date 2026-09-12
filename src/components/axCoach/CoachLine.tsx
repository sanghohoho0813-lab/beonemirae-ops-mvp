import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { coachMissions, coverageOf, earliestRecord } from '../../lib/axCoach'
import { today } from '../../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
//  첫 화면 한 줄 — 「오늘 할 일 N개 · 준비도 N%」 (0108)
//
//   ⚠ 띠를 크게 두지 않습니다. 이 자리 위에 있는 것은 오늘 나갈 차이고,
//     그것이 밀리면 안 됩니다. 한 줄이고, 오늘 할 일이 없으면 아예 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function CoachLine({ className = '' }: { className?: string }) {
  const { data } = useData()
  const { role } = useAuth()
  const t = today()

  const info = useMemo(() => {
    const start = data.experiment?.startDate ?? earliestRecord(data) ?? t
    const cov = coverageOf(data, { from: start <= t ? start : t, to: t })
    const m = coachMissions(data, cov, { role: role ?? 'office', today: t, issued: data.coachMissions })
    return { pct: cov.pct, todo: m.todo.length, done: m.done.length }
  }, [data, role, t])

  if (role !== 'admin' && role !== 'office') return null
  if (info.todo === 0 && info.done === 0) return null

  return (
    <Link
      to="/ax-coach"
      data-coach-line
      className={`flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-card transition hover:bg-navy-50 ${className}`}
    >
      <Compass size={17} className="shrink-0 text-teal-600" />
      <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-bold text-navy-700">
        AX 코치 — 오늘 할 일 {info.todo}개
        {info.done > 0 && <span className="text-teal-700"> · 오늘 확인된 것 {info.done}개</span>}
        <span className="text-navy-500"> · 실증 자료 준비도 {info.pct}%</span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-navy-400" strokeWidth={2.6} />
    </Link>
  )
}
