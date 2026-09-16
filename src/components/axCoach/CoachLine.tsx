import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'
import { useCoachStatus } from './useCoachStatus'

// ─────────────────────────────────────────────────────────────────────────────
//  첫 화면 한 줄 — 「오늘 할 일 N개 중 M개 확인됨 · 준비도 N%」 (0108 · 0121)
//
//   ⚠ 0108 에는 띠를 작게, 오늘 나갈 차 **아래**에 두었습니다. 그런데 그
//     자리가 페이지 절반 아래(1880px)라 아무도 못 봤습니다. 0121 에서
//     「오늘 처리할 업무」 맨 위로 올립니다 — 오늘 무엇을 하면 자료가 쌓이는지
//     알려 주는 줄이므로, 오늘 할 일 목록보다 뒤에 있을 이유가 없습니다.
//     여전히 **한 줄**입니다. 아래 일정을 밀어내지 않도록 크게 만들지 않습니다.
//
//   ⚠ 「확인됨」입니다. 「완료」가 아닙니다 — 눌러서 끝나는 것이 아니라
//     실제 업무기록이 생겨야 확인되기 때문입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function CoachLine({ className = '' }: { className?: string }) {
  const { pct, todo, done, total, canSee } = useCoachStatus()

  if (!canSee) return null
  if (total === 0) return null

  return (
    <Link
      to="/ax-coach"
      data-coach-line
      className={`flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-card transition hover:bg-navy-50 ${className}`}
    >
      <Compass size={17} className="shrink-0 text-teal-600" />
      <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-bold text-navy-700">
        AX 코치 — 오늘 할 일 {total}개 중 <span className="text-teal-700">{done}개 확인됨</span>
        {todo > 0 && <span className="text-navy-500"> · {todo}개 남음</span>}
        <span className="text-navy-500"> · 실증 자료 준비도 {pct}%</span>
      </span>
      {/*  준비도 막대 — 넓은 화면에서만. 폰에서는 줄이 두 줄로 접힙니다. */}
      <span aria-hidden className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-navy-100 sm:block">
        <span
          className="block h-full rounded-full bg-teal-500"
          style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
        />
      </span>
      <ArrowRight size={15} className="shrink-0 text-navy-400" strokeWidth={2.6} />
    </Link>
  )
}
