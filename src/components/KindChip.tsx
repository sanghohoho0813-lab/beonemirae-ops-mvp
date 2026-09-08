// ─────────────────────────────────────────────────────────────────────────────
// 숫자의 성격 — 네 가지만 (0107)
//
//   실적          회사가 실제로 낸 결과 (사업계획서 기재 · 대표 전달)
//   초기 측정     시스템이 실제로 잰 값. 표본이 작을 수 있음
//   업무 재현시험 같은 일을 두 방식으로 해 본 실험실 값
//   예상·목표     아직 일어나지 않은 것
//
//  숫자 바로 옆에 붙이고, 인쇄에도 그대로 나옵니다. 긴 경고문 대신 이 넉 자입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type NumKind = '실적' | '초기 측정' | '업무 재현시험' | '예상·목표'

const STYLE: Record<NumKind, string> = {
  실적: 'bg-navy-100 text-navy-700',
  '초기 측정': 'bg-teal-50 text-teal-700',
  '업무 재현시험': 'bg-sky-50 text-sky-700',
  '예상·목표': 'bg-amber-50 text-amber-700',
}

export function KindChip({ kind, className = '' }: { kind: NumKind; className?: string }) {
  return (
    <span
      data-kind={kind}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.92rem] font-extrabold leading-tight ${STYLE[kind]} ${className}`}
    >
      {kind}
    </span>
  )
}
