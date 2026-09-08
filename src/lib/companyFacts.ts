// ─────────────────────────────────────────────────────────────────────────────
// 회사 사실 — 출처와 확인 상태를 값과 떼어 놓지 않습니다 (0106)
//
//  심사 자료에 들어가는 숫자는 「어디서 나온 값인가」가 값 자체만큼
//  중요합니다. 사업계획서에 적은 실적, 대표님이 말씀하신 전언, 전망,
//  시스템이 센 값, 원본 서류로 확인한 값은 **전부 다른 무게**입니다.
//  같은 칸에 섞으면 심사 자리에서 하나가 흔들릴 때 전부 흔들립니다.
//
//  ── 지키는 것 ────────────────────────────────────────────────────────────
//  ⚠ 이 파일은 값을 **바꾸지 않습니다.** 대표님이 주신 그대로 적고, 확인
//    상태만 덧붙입니다. 신고서·확인서 원본을 본 적이 없으면 「원본 미확인」
//    입니다 — 본 것처럼 적지 않습니다.
//  ⚠ 거래처 수는 시스템에 등록된 수와 **따로** 둡니다. 맞추려고 거래처를
//    만들어 넣지 않습니다.
//  ⚠ 전망은 전망입니다. 확정 실적과 같은 줄에 두지 않습니다.
//  ⚠ 매출 성장 전체를 AX 효과라고 적지 않습니다 — 성장은 회사가 한 일이고,
//    AX 가 바꾼 것은 측정 결과 칸에서 따로 말합니다.
// ─────────────────────────────────────────────────────────────────────────────

export type FactStatus =
  | 'plan_doc' // 기존 사업계획서에 실적으로 기재
  | 'user_reported' // 대표님이 전달한 수치·설명 (원본 미확인)
  | 'forecast' // 전망 — 확정 실적 아님
  | 'ops_doc' // 기존 운영자료(업무 조사표 등)와 대조됨
  | 'planned' // 검토·계획 중 — 확정 아님
  | 'unverified' // 원본 서류를 확인하지 못함
  | 'not_entered' // 아직 값 없음

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  plan_doc: '사업계획서 기재',
  user_reported: '대표 전달 · 원본 미확인',
  forecast: '전망 (확정 아님)',
  ops_doc: '운영자료와 대조',
  planned: '검토 중 (미확정)',
  unverified: '원본 미확인',
  not_entered: '미입력',
}

export type FactGroup = 'sales' | 'scale' | 'assets' | 'bottleneck' | 'plan' | 'ip'

export interface CompanyFact {
  key: string
  group: FactGroup
  label: string
  value: string
  status: FactStatus
  /** 숫자로 셀 수 있는 값이면 원 단위 (매출) 또는 개수 — 화면이 계산에 씁니다 */
  amount?: number
  /** 어디서 온 값인가 — 한 줄 */
  source: string
  /** 심사 자리에서 미리 알아야 할 것 */
  note?: string
  /** 대표님이 원본으로 확인해 주셔야 하는 것 — 있으면 「확인 요청」 목록에 오릅니다 */
  toConfirm?: string
}

export const COMPANY_FACTS: CompanyFact[] = [
  // ── 매출 ─────────────────────────────────────────────────────────────────
  {
    key: 'rev2023', group: 'sales', label: '2023년 매출', value: '1.19억원', amount: 119_000_000,
    status: 'plan_doc', source: '기존 사업계획서 실적 기재',
  },
  {
    key: 'rev2024', group: 'sales', label: '2024년 매출', value: '3.62억원', amount: 362_000_000,
    status: 'plan_doc', source: '기존 사업계획서 실적 기재',
  },
  {
    key: 'rev2025', group: 'sales', label: '2025년 매출', value: '5.8억원', amount: 580_000_000,
    status: 'plan_doc', source: '기존 사업계획서 실적 기재',
  },
  {
    key: 'rev2026h1', group: 'sales', label: '2026년 상반기 매출 (1기 부가세 신고 기준)', value: '4억 5,300만원', amount: 453_000_000,
    status: 'user_reported', source: '대표 전달 (2026-09)',
    note: '이번 작업에서 신고서 원본까지 확인한 수치가 아닙니다.',
    toConfirm: '2026년 1기 부가가치세 신고서(과세표준) 사본',
  },
  {
    key: 'rev2026ann', group: 'sales', label: '2026년 연환산 매출', value: '9.06억원', amount: 906_000_000,
    status: 'forecast', source: '상반기 4.53억원 × 2 (단순 연환산)',
    note: '전망입니다. 하반기 실적이 아니라 상반기를 두 배 한 값이라 확정 실적과 같은 줄에 적지 않습니다.',
  },
  {
    key: 'rev2026f', group: 'sales', label: '2026년 연말 매출', value: '9억원 초과 예상',
    status: 'forecast', source: '대표 전망',
    note: '전망이며 확정 실적이 아닙니다. 확정 실적과 같은 줄에 적지 않습니다.',
  },
  // ── 규모 ─────────────────────────────────────────────────────────────────
  {
    key: 'clients', group: 'scale', label: '거래처 수', value: '약 53곳', amount: 53,
    status: 'user_reported', source: '대표 전달 (2026-09)',
    note: '시스템에 등록된 거래처 수와는 별도로 둡니다. 맞추려고 거래처를 만들어 넣지 않습니다.',
    toConfirm: '거래처 계약 목록 (엑셀) — 시스템 등록과 대조',
  },
  {
    key: 'vehicles', group: 'assets', label: '차량', value: '5대 (3.5톤 1대 · 1톤 4대)',
    status: 'ops_doc', source: '운영이사 업무 조사표 (2026-08) — 9844(3.5톤) · 5506 · 7432 · 6730 · 9188',
    note: '대표 전달 「총 5대, 3.5톤 포함」과 일치합니다.',
  },
  {
    key: 'vehiclePlan', group: 'plan', label: '3.5톤 차량 추가', value: '도입 검토 중',
    status: 'planned', source: '대표 전달 (2026-09)',
    note: '도입일·비용 미확정. 적용되면 「운영 변화 기록」에 적용일을 적어야 성과와 분리됩니다.',
  },
  // ── 병목 ─────────────────────────────────────────────────────────────────
  {
    key: 'facilityWait', group: 'bottleneck', label: '처리시설 이동·인계 대기', value: '상황에 따라 3~4시간에 이르기도',
    status: 'user_reported', source: '대표 설명 (2026-09)',
    note: '운행별 기록으로 검증한 평균값이 아닙니다. 오늘 업무 마감에 대기시간 칸을 두어 실측을 시작합니다.',
  },
  {
    key: 'capacityNeed', group: 'bottleneck', label: '필요한 것', value: '매출·거래처 증가에 대응할 운송능력과 운영자금',
    status: 'user_reported', source: '대표 설명 (2026-09)',
  },
  // ── 계획 ─────────────────────────────────────────────────────────────────
  {
    key: 'relocation', group: 'plan', label: '본사 이전 (폐기물 집하 후 대형 차량 운송)', value: '적극 검토 중',
    status: 'planned', source: '대표 전달 (2026-09)',
    note: '공간 계약 완료 여부 · 의료폐기물 보관·적환 허가 범위 · 실제 운영 가능 여부 · 이전일 · 비용 전부 미확인. 완료된 것으로 적지 않습니다.',
    toConfirm: '해당 공간의 계약서 · 허가 범위(보관·적환) · 예정일 · 비용',
  },
  {
    key: 'funding', group: 'plan', label: '신규 매출 · 자금 계획', value: '미입력',
    status: 'not_entered', source: '—',
    note: '계획 수치가 정해지면 출처와 함께 넣습니다. 그전에는 비워 둡니다.',
  },
  // ── 지식재산 · 인증 ──────────────────────────────────────────────────────
  {
    key: 'patent', group: 'ip', label: '특허', value: '출원 10-2026-0101187 (의료폐기물 수거·운반 경로 최적화 시스템)',
    status: 'unverified', source: '기존 자료 (앱 내 특허 구성요소 매핑)',
    note: '출원이며 등록이 아닙니다. 출원서·출원번호 통지서 원본은 이번 작업에서 확인하지 못했습니다.',
    toConfirm: '특허 출원 통지서 사본 · 심사 청구 여부',
  },
  {
    key: 'rnd', group: 'ip', label: '연구개발전담부서', value: '설립 이력 있음 (2026.04 표기)',
    status: 'unverified', source: '기존 자료 (앱 내 연혁)',
    toConfirm: '전담부서 인정서 사본 · 유효 기간',
  },
  {
    key: 'venture', group: 'ip', label: '벤처기업확인 (혁신성장유형)', value: '2026-08-05 통과',
    status: 'user_reported', source: '기존 대화 (대표 전달)',
    note: '확인서 원본은 이번 작업에서 확인하지 못했습니다.',
    toConfirm: '벤처기업확인서 사본 · 유효 기간',
  },
]

export function factsOf(group: FactGroup): CompanyFact[] {
  return COMPANY_FACTS.filter((f) => f.group === group)
}

/** 대표님이 원본으로 확인해 주셔야 하는 것만 */
export function factsToConfirm(): CompanyFact[] {
  return COMPANY_FACTS.filter((f) => !!f.toConfirm)
}


/** 억 단위 표기 — 5.8억원 · 4.53억원 */
export function eok(amount: number): string {
  const v = amount / 100_000_000
  return `${Number.isInteger(v) ? v : Math.round(v * 100) / 100}억원`
}

/** 요약 화면의 「기업 성장 현황」 — 값·전년 대비·연환산을 출처와 함께 */
export function growthSummary() {
  const f = (k: string) => COMPANY_FACTS.find((x) => x.key === k)
  const r24 = f('rev2024')?.amount ?? null
  const r25 = f('rev2025')?.amount ?? null
  const yoyPct = r24 && r25 ? Math.round(((r25 - r24) / r24) * 100) : null
  return {
    rev2025: f('rev2025') ?? null,
    yoyPct,
    rev2026h1: f('rev2026h1') ?? null,
    annualized: f('rev2026ann') ?? null,
    clients: f('clients') ?? null,
  }
}

