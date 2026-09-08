// ─────────────────────────────────────────────────────────────────────────────
// 운영 변화 기록 — 무엇이 언제 바뀌었는가 (0106)
//
//  차량이 커지거나 거점이 바뀌면 AX 와 무관하게 처리량·거리·대기시간이
//  달라집니다. 그 변화를 전부 AX 효과로 세면 심사 자리에서 첫 반박에
//  무너집니다. 그래서 **변화의 적용일과 상태**를 따로 적어 두고, 성과
//  비교 구간에 그런 변화가 겹치면 「AX 단독 효과 분리 불가 · 복합 개선」
//  이라고 화면이 스스로 말하게 합니다.
//
//  ── 지키는 것 ────────────────────────────────────────────────────────────
//  ⚠ 계획(planned)은 계획입니다. 저장했다고 현재 운영 데이터가 바뀌지
//    않습니다 — 여기 기록은 성과 화면의 **주석**일 뿐 어떤 집계도 고치지
//    않습니다.
//  ⚠ 적용일이 없는 계획은 비교 구간에 겹치는지 판단하지 않습니다.
//  ⚠ 표가 아직 없으면(판 106 이전) 「변화 기록 없음 (기록 기능은 SQL 실행
//    후)」로 표시합니다 — 「변화 없음」이라고 적지 않습니다. 모르는 것과
//    없는 것은 다릅니다.
// ─────────────────────────────────────────────────────────────────────────────

export type OpsChangeKind =
  | 'ax_start' // AX 사용 시작
  | 'feature' // 주요 기능 적용
  | 'vehicle' // 차량 추가·교체
  | 'staff' // 기사·인력 변화
  | 'base' // 거점 이전
  | 'contract' // 거래처·계약 변화
  | 'price' // 단가 변화
  | 'other'

export type OpsChangeStatus = 'planned' | 'applied'

export interface OpsChange {
  id: string
  kind: OpsChangeKind
  title: string
  status: OpsChangeStatus
  /** 적용일(적용됨) 또는 예정일(계획). 계획에 날짜가 없으면 null */
  effectiveOn: string | null
  note: string
  createdAt: string
  createdByName: string
}

export const OPS_CHANGE_KINDS: { kind: OpsChangeKind; label: string; hint: string }[] = [
  { kind: 'ax_start', label: 'AX 사용 시작', hint: '이 시스템으로 실제 업무를 시작한 날' },
  { kind: 'feature', label: '주요 기능 적용', hint: '예: 병원 포털 개통, 오늘 업무 마감 시작' },
  { kind: 'vehicle', label: '차량 추가·교체', hint: '예: 3.5톤 추가 — 처리량이 AX 와 무관하게 달라집니다' },
  { kind: 'staff', label: '기사·인력 변화', hint: '예: 기사 1명 입사·퇴사' },
  { kind: 'base', label: '거점 이전', hint: '본사·차고지 이전 — 거리·대기시간이 달라집니다' },
  { kind: 'contract', label: '거래처·계약 변화', hint: '예: 거래처 5곳 신규 계약, 큰 거래처 해지' },
  { kind: 'price', label: '단가 변화', hint: '단가표 개정 — 매출이 AX 와 무관하게 달라집니다' },
  { kind: 'other', label: '기타', hint: '' },
]

export const OPS_CHANGE_KIND_LABEL: Record<OpsChangeKind, string> = Object.fromEntries(
  OPS_CHANGE_KINDS.map((k) => [k.kind, k.label]),
) as Record<OpsChangeKind, string>

export const OPS_CHANGE_STATUS_LABEL: Record<OpsChangeStatus, string> = {
  planned: '계획',
  applied: '적용됨',
}

/** AX 와 무관하게 결과를 바꾸는 종류 — 비교 구간에 겹치면 「복합 개선」 */
export const CONFOUNDING_KINDS: OpsChangeKind[] = ['vehicle', 'staff', 'base', 'contract', 'price']

export interface Confounding {
  /** 판단 가능한가 — 표가 없어 기록을 못 읽었으면 false */
  known: boolean
  /** 구간에 겹치는 적용된 변화 */
  overlapping: OpsChange[]
  /** 한 줄 설명 — 화면·인쇄물이 그대로 씁니다 */
  note: string
}

/**
 * 비교 구간에 적용된 변화가 겹치는가.
 *
 *  changes 가 undefined 면 「모름」입니다(표가 없거나 못 읽음). null 로 넘기지
 *  않고 undefined 로 넘기는 이유는 빈 배열([])과 갈라 두기 위해서입니다 —
 *  []는 「기록해 봤는데 없다」이고 undefined 는 「기록 자체가 없다」입니다.
 */
export function confoundingIn(
  changes: OpsChange[] | undefined,
  from: string,
  to: string,
): Confounding {
  if (changes === undefined) {
    return { known: false, overlapping: [], note: '운영 변화 기록이 없습니다 (기록 기능은 SQL 실행 후) — 차량·거점·인력 변화가 있었는지 알 수 없습니다.' }
  }
  const overlapping = changes.filter(
    (c) =>
      c.status === 'applied' &&
      CONFOUNDING_KINDS.includes(c.kind) &&
      !!c.effectiveOn &&
      c.effectiveOn >= from &&
      c.effectiveOn <= to,
  )
  if (overlapping.length === 0) {
    return { known: true, overlapping, note: '이 구간에 기록된 차량·인력·거점·계약·단가 변화가 없습니다.' }
  }
  const names = overlapping.map((c) => `${OPS_CHANGE_KIND_LABEL[c.kind]} · ${c.title} (${c.effectiveOn})`).join(', ')
  return {
    known: true,
    overlapping,
    note: `AX 단독 효과 분리 불가 · 복합 개선 — 이 구간에 ${names} 이(가) 함께 있었습니다.`,
  }
}
