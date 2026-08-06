import type { ScheduleStatus, WasteType, PaymentStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 상태/구분 뱃지 — pale, 차분한 pill 형태
//  · 의료폐기물: pale red / 일회용기저귀: teal
//  · 지연/긴급은 과하지 않게 상태만 명확히
// ─────────────────────────────────────────────────────────────────────────────

export function WasteBadge({ type }: { type: WasteType }) {
  const styles =
    type === '의료폐기물' ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-600'
  const dot = type === '의료폐기물' ? 'bg-rose-400' : 'bg-teal-500'
  return (
    <span className={`pill min-w-0 !shrink !whitespace-normal ${styles}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-keep">{type}</span>
    </span>
  )
}

const statusStyles: Record<ScheduleStatus, string> = {
  예정: 'bg-navy-100 text-navy-500',
  완료: 'bg-emerald-50 text-emerald-600',
  지연: 'bg-amber-50 text-amber-600',
  긴급: 'bg-rose-50 text-rose-500',
}

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  return <span className={`pill ${statusStyles[status]}`}>{status}</span>
}

const paymentStyles: Record<PaymentStatus, string> = {
  입금완료: 'bg-emerald-50 text-emerald-600',
  미수금: 'bg-rose-50 text-rose-500',
  확인필요: 'bg-amber-50 text-amber-600',
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`pill ${paymentStyles[status]}`}>{status}</span>
}
