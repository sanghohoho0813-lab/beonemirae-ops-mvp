/**
 * PILOT 배지 (0122) — 이번 주 Pilot 거래처를 알아보는 작은 표식.
 *  현장에는 따로 「Pilot 모드」가 없습니다. 이 배지 하나가 전부이고, 나머지
 *  흐름은 평소와 같습니다.
 */
export function PilotBadge({ className = '' }: { className?: string }) {
  return (
    <span
      data-pilot-badge
      className={`shrink-0 rounded-lg bg-violet-50 px-2 py-0.5 text-[0.85rem] font-extrabold tracking-wide text-violet-700 ${className}`}
    >
      PILOT
    </span>
  )
}
