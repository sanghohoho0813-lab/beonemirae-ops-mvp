import type { ScheduleStatus, WasteType, PaymentStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 상태/구분 뱃지 모음
// ─────────────────────────────────────────────────────────────────────────────

export function WasteBadge({ type }: { type: WasteType }) {
  const styles =
    type === '의료폐기물'
      ? 'bg-rose-50 text-rose-600 ring-rose-100'
      : 'bg-teal-50 text-teal-700 ring-teal-100'
  const dot = type === '의료폐기물' ? 'bg-rose-500' : 'bg-teal-500'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {type}
    </span>
  )
}

const statusStyles: Record<ScheduleStatus, string> = {
  예정: 'bg-navy-50 text-navy-600 ring-navy-100',
  완료: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  지연: 'bg-amber-50 text-amber-600 ring-amber-100',
  긴급: 'bg-red-50 text-red-600 ring-red-100',
}

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusStyles[status]}`}>
      {status}
    </span>
  )
}

const paymentStyles: Record<PaymentStatus, string> = {
  입금완료: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  미수금: 'bg-red-50 text-red-600 ring-red-100',
  확인필요: 'bg-amber-50 text-amber-600 ring-amber-100',
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${paymentStyles[status]}`}>
      {status}
    </span>
  )
}
