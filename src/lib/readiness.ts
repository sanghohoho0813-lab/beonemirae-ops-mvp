import type { AppData } from '../types'
import { TIER_FIELD } from './performance'
import { AX_MIN_SAMPLES } from './axEvidence'
import { AI_SPEC_ORDER } from './aiSpecs'
import { thisMonth } from './format'
import { shiftMonth } from './revenue'

// ─────────────────────────────────────────────────────────────────────────────
//  심사 준비도 — 「심사장에서 보여 줄 수 있는 상태인가」를 시스템이 스스로 점검 (0096)
//
//  대표님: 「일단 싹다 개선해보자. 심사위원들이 인정할 수 밖에 없도록.」
//
//  0095 분석에서 나온 빈칸들을 문서로 두지 않고 **화면**으로 만듭니다.
//  문서는 읽고 잊히지만, 화면은 열 때마다 지금 값으로 다시 점검합니다.
//
//  ── 지키는 것 ────────────────────────────────────────────────────────────
//
//  1. **전부 실데이터에서 계산합니다.** 이 파일은 아무것도 저장하지 않고,
//     지어내지 않습니다. 준비가 안 됐으면 안 됐다고 나옵니다 — 그게 이
//     화면의 존재 이유입니다.
//  2. **점수를 만들지 않습니다.** 「준비도 73%」 같은 합성 숫자는 가중치를
//     저희 마음대로 정했다는 뜻입니다. 항목별 상태와 개수만 셉니다.
//  3. 항목마다 **왜 심사에 필요한지**와 **어디서 채우는지**를 함께 적습니다.
//     상태만 빨갛게 띄우면 「그래서 뭘 하라고」가 없습니다.
//  4. 시스템이 확인할 수 없는 것(저작권 접수 등)은 확인할 수 없다고
//     적습니다 — 억지로 자동 점검인 척하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type ReadyState =
  | 'ok'        // 심사에서 그대로 보여 줄 수 있음
  | 'partial'   // 시작은 됐지만 아직 모자람
  | 'missing'   // 비어 있음 — 지금은 보여 줄 것이 없음
  | 'manual'    // 시스템이 확인할 수 없음 — 사람이 확인

export const READY_LABEL: Record<ReadyState, string> = {
  ok: '준비됨',
  partial: '채우는 중',
  missing: '비어 있음',
  manual: '시스템 확인 불가',
}

export interface ReadyItem {
  key: string
  /** 항목 이름 */
  label: string
  state: ReadyState
  /** 지금 값 — 「12/30건」처럼 그대로 */
  value: string
  /** 심사에서 왜 필요한가 — 한 문장 */
  why: string
  /** 어디서 채우는가 */
  where: { to: string; label: string } | null
  /** 부가 설명 (없으면 빈 문자열) */
  note: string
}

const RECENT_COST_MONTHS = 3

export function readinessOf(data: AppData): ReadyItem[] {
  const items: ReadyItem[] = []

  // ── ① 도입 후 실측 표본 — 모든 성과 숫자의 원천 ─────────────────────────
  //  시연 세션에서 만든 기록은 세지 않습니다 — 심사에서 「시연 데이터
  //  아닙니까」가 첫 반박입니다.
  const fieldEvents = (data.events ?? []).filter((e) => !e.demoSessionId).length
  items.push({
    key: 'fieldSamples',
    label: '현장 수거입력 표본',
    state: fieldEvents >= TIER_FIELD ? 'ok' : fieldEvents > 0 ? 'partial' : 'missing',
    value: `${fieldEvents} / ${TIER_FIELD}건`,
    why: `「도입 후」 값은 전부 여기서 나옵니다. ${TIER_FIELD}건 미만이면 성과 화면이 「측정 중」으로 나갑니다.`,
    where: { to: '/collection', label: '수거 입력' },
    note: fieldEvents >= TIER_FIELD
      ? '대표 성과값 산출 기준을 넘었습니다.'
      : '수거 때마다 현장에서 입력하면 하루 평균 방문 수 기준 이틀이면 넘습니다.',
  })

  // ── ② 도입 전 기준값 — 출처가 답할 수 있는 값인가 ───────────────────────
  const b = data.baseline
  const filled = [
    b.adminMinutesPerCollection, b.repeatEntriesPerCollection,
    b.monthlyDocHours, b.monthlyReworkCount, b.dailyCapacity,
  ].filter((v) => v != null).length
  items.push({
    key: 'baseline',
    label: '도입 전 기준값',
    state: filled === 0 ? 'missing' : b.source === 'survey' ? 'ok' : 'partial',
    value: `${filled} / 5개 입력 · 출처 ${b.source === 'survey' ? '실제 업무 조사' : b.source === 'demo' ? '시연용 예시값' : '직접 입력(추정)'}`,
    why: '기준값이 없으면 개선율 자체가 없습니다. 출처가 「조사」가 아니면 「이 숫자 어디서 났습니까」에 약합니다.',
    where: { to: '/settings', label: '설정 → 도입 전 기준값' },
    note: b.source === 'survey'
      ? '이사님 실측 조사(차량 5대 · 요일별 방문·거리 원문 보존)가 근거입니다.'
      : '설정 화면에 「업무 조사 값으로 채우기」 단추가 있습니다 — 원문이 함께 저장됩니다.',
  })

  // ── ③ 거래처 주소 — 이동거리 절감 계산의 첫 단추 ────────────────────────
  //  시연용 확장 거래처는 빼고 셉니다 — 심사에는 실제 거래처만 냅니다.
  const activeClients = (data.clients ?? []).filter((c) => !c.isDemoGenerated)
  const withAddr = activeClients.filter((c) => (c.address ?? '').trim() !== '').length
  items.push({
    key: 'address',
    label: '거래처 주소',
    state: withAddr === activeClients.length && activeClients.length > 0
      ? 'ok' : withAddr > 0 ? 'partial' : 'missing',
    value: `${withAddr} / ${activeClients.length}곳`,
    why: '이동거리 절감은 물류업 심사에서 가장 강한 숫자인데, 주소 → 좌표 → 거리 순서라 주소가 첫 단추입니다.',
    where: { to: '/clients', label: '거래처' },
    note: '검증된 주소 제안서(PROPOSAL_ADDR_pilot.sql)가 준비돼 있습니다 — 미확정 3곳은 확인 후 추가.',
  })

  // ── ④ 상품 단가 — 소모품 매출이 0인 구조적 이유일 수 있음 ───────────────
  const products = (data.products ?? []).filter((p) => p.active !== false)
  const priced = products.filter((p) => (p.salePrice ?? 0) > 0).length
  items.push({
    key: 'productPrice',
    label: '소모품 상품 단가',
    state: products.length === 0 ? 'missing' : priced === products.length ? 'ok' : priced > 0 ? 'partial' : 'missing',
    value: products.length === 0 ? '등록된 상품 없음' : `단가 입력 ${priced} / ${products.length}종`,
    why: '단가 0원인 상품은 병원 화면에 아예 안 뜹니다. 신규 매출이 0인 것이 시스템 문제가 아니라 단가 미등록 때문일 수 있습니다.',
    where: { to: '/supplies', label: '소모품 주문 → 상품' },
    note: '',
  })

  // ── ⑤ 운영비 — 매출만 있고 이익이 없으면 「돈은 벌었습니까」에 답 못 함 ──
  const now = thisMonth()
  const recent = [0, 1, 2].map((n) => shiftMonth(now, -n))
  const costMonths = new Set((data.operatingCosts ?? []).map((c) => c.month))
  const costFilled = recent.filter((m) => costMonths.has(m)).length
  items.push({
    key: 'costs',
    label: `월 운영비 입력 (최근 ${RECENT_COST_MONTHS}개월)`,
    state: costFilled === RECENT_COST_MONTHS ? 'ok' : costFilled > 0 ? 'partial' : 'missing',
    value: `${costFilled} / ${RECENT_COST_MONTHS}개월`,
    why: '운영비가 없으면 영업이익이 계산되지 않습니다. 매출 숫자만으로는 사업성 심사를 못 넘습니다.',
    where: { to: '/stats', label: '통계 → 경영 요약' },
    note: '인건비 · 유류비 · 차량 유지비 · 임차료·수수료 · 기타 5칸입니다.',
  })

  // ── ⑥ 신규 매출 4단계 — 주문 ≠ 매출, 전달 ≠ 입금 ────────────────────────
  //  단계를 합치지 않습니다(axEvidence 원칙). 심사에서 「입금까지 간 것」만
  //  매출이라 부를 수 있습니다.
  //  취소된 주문은 세지 않습니다. 전달·청구는 시각으로 판정합니다 —
  //  상태 글자는 화면 사정으로 바뀔 수 있지만 시각은 남습니다.
  const orders = (data.productOrders ?? []).filter((o) => !o.canceledAt)
  const orderIdsInPayments = new Set(
    (data.payments ?? []).flatMap((p) => (p.snapshot as { orderIds?: string[] } | null)?.orderIds ?? []),
  )
  const delivered = orders.filter((o) => o.deliveredAt != null).length
  const billed = orders.filter((o) => orderIdsInPayments.has(o.id)).length
  items.push({
    key: 'newRevenue',
    label: '소모품 신규 매출 (주문→전달→청구)',
    state: billed > 0 ? 'ok' : orders.length > 0 ? 'partial' : 'missing',
    value: `주문 ${orders.length} · 전달 ${delivered} · 청구 반영 ${billed}건`,
    why: '「새로운 매출원」 주장은 실제 청구·입금 1건이 슬라이드 열 장보다 강합니다.',
    where: { to: '/supplies', label: '소모품 주문' },
    note: '주문은 매출이 아닙니다 — 단계별로 따로 셉니다.',
  })

  // ── ⑦ 병원 포털 실사용 — 「고객이 직접 쓴다」의 증거 ────────────────────
  const portalReqs = (data.requests ?? []).filter((r) => r.source === 'portal' && !r.demoSessionId).length
  const inquiries = (data.inquiries ?? []).filter((q) => !q.demoSessionId).length
  const portalUse = portalReqs + inquiries
  items.push({
    key: 'portalUse',
    label: '병원 포털 실사용 (요청·문의)',
    state: portalUse >= AX_MIN_SAMPLES ? 'ok' : portalUse > 0 ? 'partial' : 'missing',
    value: `요청 ${portalReqs}건 · 문의 ${inquiries}건`,
    why: '「병원이 전화·카톡 대신 직접 쓴다」는 이 시스템 혁신성의 핵심 논거인데, 기록이 있어야 말할 수 있습니다.',
    where: { to: '/requests', label: '고객 요청' },
    note: '병원 담당자에게 포털 계정을 드리고 첫 요청을 포털로 받는 것이 시작입니다.',
  })

  // ── ⑧ AI 연결 — 정직하게: 아직 0곳 ──────────────────────────────────────
  items.push({
    key: 'ai',
    label: 'AI 실제 연결',
    state: 'missing',
    value: `0 / ${AI_SPEC_ORDER.length}곳 연결`,
    why: '「어디가 AI입니까」는 혁신성 심사의 첫 질문입니다. 지금 답은 「붙일 자리와 데이터 구조까지 설계 완료, 연결 0곳」입니다.',
    where: { to: '/roadmap', label: '활용 계획 → AI 자리' },
    note: '요청 정리 1곳의 서버 함수 코드와 배포 절차가 준비돼 있습니다(EDGE_ai_triage) — 키 발급과 배포만 남았습니다.',
  })

  // ── ⑨ SW 지식재산권 — 시스템이 확인할 수 없는 항목 ──────────────────────
  items.push({
    key: 'ip',
    label: 'SW 저작권 등록',
    state: 'manual',
    value: '접수 여부는 시스템이 확인할 수 없습니다',
    why: '혁신성장유형 심사에서 지식재산권은 배점 항목인 경우가 많습니다. 접수증만 있어도 「진행 중」으로 쓸 수 있습니다.',
    where: null,
    note: '등록 신청서용 자료(개발 기간 · 규모 · 구조)가 docs/COPYRIGHT_FILING_0096.md 에 정리돼 있습니다.',
  })

  return items
}

/** 상태별 개수 — 점수 대신 사실만 셉니다 */
export function readinessCounts(items: ReadyItem[]) {
  const n = (s: ReadyState) => items.filter((i) => i.state === s).length
  return { ok: n('ok'), partial: n('partial'), missing: n('missing'), manual: n('manual'), total: items.length }
}
