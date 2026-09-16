import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { useCoachStatus } from './useCoachStatus'

// ─────────────────────────────────────────────────────────────────────────────
//  사이드바 맨 위 AX 코치 단추 (0121)
//
//   왜 생겼는가 — 0110 에서 목차를 여섯 묶음으로 정리하면서 「AX·심사」가
//   접힌 채로 시작하게 됐고, 그 바람에 **AX 코치로 들어가는 단추가 첫 화면
//   어디에도 보이지 않게** 됐습니다. 첫 화면 한 줄은 있었지만 페이지 절반
//   아래(1880px 지점)라 눈에 띄지 않았습니다. 기능이 아니라 문이 묻힌 것입니다.
//
//   그래서 묶음 **밖에** 둡니다. 메뉴 한 줄이 아니라 상태 단추입니다 —
//   여섯 묶음 구조는 그대로 두고, 오늘 상태를 이고 있는 자리 하나를 더합니다.
//
//   ⚠ 「N개 중 M개 확인됨」입니다. 「완료」가 아닙니다 — 눌러서 끝나는 것이
//     아니라 실제 업무기록이 생겨야 확인되기 때문입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function CoachPin() {
  const { pct, done, total, canSee } = useCoachStatus()
  if (!canSee) return null

  return (
    <Link
      to="/ax-coach"
      data-coach-pin
      className="mx-3 mb-2 block rounded-2xl bg-white/5 px-4 py-3.5 ring-1 ring-white/10 transition hover:bg-white/10"
    >
      <div className="flex items-center gap-2.5">
        <Compass size={18} className="shrink-0 text-teal-300" strokeWidth={2.3} />
        <span className="min-w-0 flex-1 break-keep text-[1.08rem] font-extrabold text-white">AX 코치</span>
        <span data-coach-pin-pct className="shrink-0 text-[1.12rem] font-black tabular-nums text-teal-300">
          {pct}%
        </span>
      </div>
      {/*  준비도 막대 — 실제 업무기록이 쌓일수록 자동으로 올라갑니다 */}
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-teal-400 transition-[width] duration-500"
          style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
        />
      </div>
      <p data-coach-pin-today className="mt-2 break-keep text-[1rem] font-bold leading-snug text-navy-200">
        {total === 0 ? '오늘 드릴 일이 없습니다' : `오늘 할 일 ${total}개 중 ${done}개 확인됨`}
      </p>
    </Link>
  )
}
