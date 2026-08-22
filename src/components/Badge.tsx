import type { ScheduleStatus, WasteType, PaymentStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 상태/구분 뱃지 — pale, 차분한 pill 형태
//
//  · 의료폐기물: pale red / 일회용기저귀: 청록(accent)
//  · 지연/긴급은 과하지 않게 상태만 명확히
//
//  일회용기저귀는 원래 `teal-50/600` 이었는데, 이 프로젝트의 `teal` 은 이름과
//  달리 **파란색**입니다(tailwind.config.js: teal-500 = #3182f6). 버튼·링크·
//  선택 상태가 전부 같은 파랑이라, 폰에서 보면 화면에 흰색·파랑·빨강 셋뿐인
//  것처럼 보였습니다. 두 폐기물 구분도 한눈에 갈라지지 않았습니다.
//
//  실제 청록 계열인 `accent` 팔레트가 이미 있는데 공개 홈페이지에서만 쓰고
//  있었습니다. 업무 화면에서도 "파랑이 아닌 두 번째 색"으로 씁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function WasteBadge({ type }: { type: WasteType }) {
  const styles =
    //  ⚠ 0069 — rose-500 은 rose-50 바탕에서 대비 3.3:1 입니다. 목록에
    //    거래처마다 하나씩 붙어 이 화면 흐린 글자의 대부분이었습니다.
    type === '의료폐기물' ? 'bg-rose-50 text-rose-700' : 'bg-accent-50 text-accent-800'
  const dot = type === '의료폐기물' ? 'bg-rose-400' : 'bg-accent-500'
  return (
    <span className={`pill min-w-0 !shrink !whitespace-normal ${styles}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-keep">{type}</span>
    </span>
  )
}

const statusStyles: Record<ScheduleStatus, string> = {
  예정: 'bg-navy-100 text-navy-600',
  완료: 'bg-emerald-50 text-emerald-700',
  지연: 'bg-amber-50 text-amber-700',
  긴급: 'bg-rose-50 text-rose-700',
}

export function StatusBadge({ status }: { status: ScheduleStatus }) {
  return <span className={`pill ${statusStyles[status]}`}>{status}</span>
}

const paymentStyles: Record<PaymentStatus, string> = {
  입금완료: 'bg-emerald-50 text-emerald-600',
  미수금: 'bg-rose-50 text-rose-500',
  확인필요: 'bg-amber-50 text-amber-700',
  //  취소한 청구는 지우지 않고 남겨 둡니다. 눈에 띄되 살아 있는 청구와
  //  헷갈리지 않도록 회색으로 둡니다.
  취소: 'bg-navy-100 text-navy-400 line-through',
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`pill ${paymentStyles[status]}`}>{status}</span>
}
