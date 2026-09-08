import type { AppData } from '../types'
import { TIER_FIELD } from './performance'
import { AX_MIN_SAMPLES } from './axEvidence'
import { AI_SPEC_ORDER } from './aiSpecs'
import { thisMonth } from './format'
import { shiftMonth } from './revenue'
import { BREADTH_RULE, BREADTH_RULE_NOTE, breadthCheck, breadthLine, evidenceSample, isFieldSchedule } from './evidenceBase'
import { COMPANY_FACTS, FACT_STATUS_LABEL } from './companyFacts'

// ─────────────────────────────────────────────────────────────────────────────
//  실증 준비 상태 — 「지금 무엇을 보여 줄 수 있고, 무엇은 사람이 확인해야 하는가」
//
//  0096 에서 「심사 준비도」로 만들었던 것을 0106 에서 두 갈래로 나눕니다.
//
//   system   시스템이 **지금 데이터로** 확인할 수 있는 것 — 표본·기준값·주소·
//            단가·운영비·매출 단계·포털 사용
//   company  **사람이 서류로** 확인해야 하는 기업 증빙 — 매출·특허·벤처확인·
//            전담부서·저작권. 시스템은 값을 보관만 하고 확인 상태를 적습니다.
//
//  ── 지키는 것 ────────────────────────────────────────────────────────────
//  1. 전부 실데이터에서 계산합니다. 저장하지 않고 지어내지 않습니다.
//  2. 점수를 만들지 않습니다. 「합격 점검표」처럼 읽히지 않게 — 외부 SW 매출·
//     저작권 건수·AI 연결 수를 공식 필수요건처럼 적지 않습니다.
//  3. 표본은 lib/evidenceBase.ts 의 **같은 기준**으로 셉니다. 성과 화면·인쇄물과
//     숫자가 어긋날 수 없습니다.
//  4. 30건은 내부 표시 기준입니다. 건수 하나로 「준비됨」이 되지 않고, 운영
//     기간·병원·기사·커버리지·누락률을 함께 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

export type ReadyState =
  | 'ok'        // 지금 그대로 보여 줄 수 있음
  | 'partial'   // 시작은 됐지만 아직 모자람
  | 'missing'   // 비어 있음
  | 'manual'    // 시스템이 확인할 수 없음 — 사람이 서류로 확인

export const READY_LABEL: Record<ReadyState, string> = {
  ok: '준비됨',
  partial: '채우는 중',
  missing: '비어 있음',
  manual: '사람이 확인',
}

export type ReadyGroup = 'system' | 'company'

export const READY_GROUP_LABEL: Record<ReadyGroup, string> = {
  system: '시스템이 지금 데이터로 확인하는 것',
  company: '사람이 서류로 확인해야 하는 기업 증빙',
}

export interface ReadyItem {
  key: string
  group: ReadyGroup
  label: string
  state: ReadyState
  /** 지금 값 — 「12/30건」처럼 그대로 */
  value: string
  /** 왜 필요한가 — 한 문장 */
  why: string
  /** 어디서 채우는가 */
  where: { to: string; label: string } | null
  /** 부가 설명 (없으면 빈 문자열) */
  note: string
}

const RECENT_COST_MONTHS = 3

export function readinessOf(data: AppData): ReadyItem[] {
  const items: ReadyItem[] = []

  // ── ① 도입 후 실측 표본 — 성과 화면과 **같은 기준**으로 셉니다 ────────────
  const sample = evidenceSample(data)
  const fieldEvents = sample.field.length
  const b = sample.breadth
  const bc = breadthCheck(fieldEvents, b)
  items.push({
    key: 'fieldSamples',
    group: 'system',
    label: '현장 수거입력 표본 (건수 · 기간 · 참여 · 커버리지)',
    state: bc.ok ? 'ok' : fieldEvents > 0 ? 'partial' : 'missing',
    value: breadthLine(fieldEvents, b),
    why: `「도입 후」 값은 전부 여기서 나옵니다. 건수(${TIER_FIELD}건)뿐 아니라 입력한 날 ${BREADTH_RULE.operatingDays}일 · 병원 ${BREADTH_RULE.clients}곳 · 기사 ${BREADTH_RULE.drivers}명 · 커버리지 ${BREADTH_RULE.coveragePct}% 를 넘어야 대표 성과값이라 부릅니다.`,
    where: { to: '/collection', label: '수거 입력' },
    note: bc.ok
      ? `내부 표시 기준을 넘었습니다. ${BREADTH_RULE_NOTE}`
      : `아직 모자란 것: ${bc.gaps.join(' · ')}.${sample.practice.length > 0 ? ` 실증 시작일 이전 연습 입력 ${sample.practice.length}건은 세지 않았습니다.` : ''}${b.startUnset ? ' 실증 시작일이 없어 연습 입력을 가르지 못합니다 — 설정에서 시작일을 정해 주세요.' : ''} ${BREADTH_RULE_NOTE}`,
  })

  // ── ② 도입 전 기준값 — 출처가 답할 수 있는 값인가 ───────────────────────
  const bl = data.baseline
  const filled = [
    bl.adminMinutesPerCollection, bl.repeatEntriesPerCollection,
    bl.monthlyDocHours, bl.monthlyReworkCount, bl.dailyCapacity,
  ].filter((v) => v != null).length
  items.push({
    key: 'baseline',
    group: 'system',
    label: '도입 전 기준값',
    state: filled === 0 ? 'missing' : bl.source === 'survey' ? 'ok' : 'partial',
    value: `${filled} / 5개 입력 · 출처 ${bl.source === 'survey' ? '업무 조사 응답' : bl.source === 'demo' ? '시연용 예시값' : '직접 입력(추정)'}`,
    why: '기준값이 없으면 개선율 자체가 없습니다. 출처가 「조사 응답」이 아니면 「이 숫자 어디서 났습니까」에 약합니다.',
    where: { to: '/settings', label: '설정 → 도입 전 기준값' },
    note: bl.source === 'survey'
      ? '운영이사 실측 조사(차량 5대 · 요일별 방문·거리 원문 보존)가 근거입니다. 도입 후 **같은 범위** 조사값이 들어와야 사무시간을 견줍니다.'
      : '설정 화면에 「업무 조사 값으로 채우기」 단추가 있습니다 — 원문이 함께 저장됩니다.',
  })

  // ── ③ 거래처 주소 — 이동거리 계산의 첫 단추 ────────────────────────────
  const activeClients = (data.clients ?? []).filter((c) => !c.isDemoGenerated)
  const withAddr = activeClients.filter((c) => (c.address ?? '').trim() !== '').length
  items.push({
    key: 'address',
    group: 'system',
    label: '거래처 주소',
    state: withAddr === activeClients.length && activeClients.length > 0
      ? 'ok' : withAddr > 0 ? 'partial' : 'missing',
    value: `${withAddr} / ${activeClients.length}곳 (시스템 등록 기준)`,
    why: '이동거리 절감은 물류업에서 가장 강한 숫자인데, 주소 → 좌표 → 거리 순서라 주소가 첫 단추입니다. 그전까지는 계기판 km 로 잽니다.',
    where: { to: '/clients', label: '거래처 정리' },
    note: '검증된 주소 제안서(PROPOSAL_ADDR_pilot.sql)가 준비돼 있습니다 — 미확정은 확인 후 추가.',
  })

  // ── ④ 상품 단가 ──────────────────────────────────────────────────────────
  const products = (data.products ?? []).filter((p) => p.active !== false)
  const priced = products.filter((p) => (p.salePrice ?? 0) > 0).length
  items.push({
    key: 'productPrice',
    group: 'system',
    label: '소모품 상품 단가',
    state: products.length === 0 ? 'missing' : priced === products.length ? 'ok' : priced > 0 ? 'partial' : 'missing',
    value: products.length === 0 ? '등록된 상품 없음' : `단가 입력 ${priced} / ${products.length}종`,
    why: '단가 0원인 상품은 병원 화면에 아예 안 뜹니다. 신규 매출이 0인 것이 시스템 문제가 아니라 단가 미등록 때문일 수 있습니다.',
    where: { to: '/supplies', label: '소모품 주문 → 상품' },
    note: '',
  })

  // ── ⑤ 운영비 ─────────────────────────────────────────────────────────────
  const now = thisMonth()
  const recent = [0, 1, 2].map((n) => shiftMonth(now, -n))
  const costMonths = new Set((data.operatingCosts ?? []).map((c) => c.month))
  const costFilled = recent.filter((m) => costMonths.has(m)).length
  items.push({
    key: 'costs',
    group: 'system',
    label: `월 운영비 입력 (최근 ${RECENT_COST_MONTHS}개월)`,
    state: costFilled === RECENT_COST_MONTHS ? 'ok' : costFilled > 0 ? 'partial' : 'missing',
    value: `${costFilled} / ${RECENT_COST_MONTHS}개월`,
    why: '운영비가 없으면 「방문 1건당 운영비」와 운영비 반영 이익이 계산되지 않습니다. 매출 숫자만으로는 사업성을 말하기 어렵습니다.',
    where: { to: '/stats', label: '통계 → 경영 요약' },
    note: '인건비 · 유류비 · 차량 유지비 · 임차료·수수료 · 기타 5칸입니다.',
  })

  // ── ⑥ 신규 매출 4단계 — 주문 ≠ 매출, 전달 ≠ 입금 ────────────────────────
  const orders = (data.productOrders ?? []).filter((o) => !o.canceledAt)
  const orderIdsInPayments = new Set(
    (data.payments ?? []).flatMap((p) => (p.snapshot as { orderIds?: string[] } | null)?.orderIds ?? []),
  )
  const delivered = orders.filter((o) => o.deliveredAt != null).length
  const billed = orders.filter((o) => orderIdsInPayments.has(o.id)).length
  items.push({
    key: 'newRevenue',
    group: 'system',
    label: '소모품 신규 매출 (주문→전달→청구)',
    state: billed > 0 ? 'ok' : orders.length > 0 ? 'partial' : 'missing',
    value: `주문 ${orders.length} · 전달 ${delivered} · 청구 반영 ${billed}건`,
    why: '「새로운 매출원」 주장은 실제 청구·입금 1건이 슬라이드 열 장보다 강합니다. 주문은 매출이 아닙니다.',
    where: { to: '/supplies', label: '소모품 주문' },
    note: '단계별로 따로 셉니다. 추천→주문 연결은 노출 기록(판 106)이 있을 때만 「채택」이라 부릅니다.',
  })

  // ── ⑦ 병원 포털 실사용 ───────────────────────────────────────────────────
  const portalReqs = (data.requests ?? []).filter((r) => r.source === 'portal' && !r.demoSessionId).length
  const inquiries = (data.inquiries ?? []).filter((q) => !q.demoSessionId).length
  const portalUse = portalReqs + inquiries
  items.push({
    key: 'portalUse',
    group: 'system',
    label: '병원 포털 실사용 (요청·문의)',
    state: portalUse >= AX_MIN_SAMPLES ? 'ok' : portalUse > 0 ? 'partial' : 'missing',
    value: `요청 ${portalReqs}건 · 문의 ${inquiries}건`,
    why: '「병원이 전화·카톡 대신 직접 쓴다」는 기록이 있어야 말할 수 있습니다. 전화·카톡 접수도 같이 기록돼야 비율이 됩니다.',
    where: { to: '/requests', label: '고객 요청' },
    note: '병원 담당자에게 포털 계정을 드리고 첫 요청을 포털로 받는 것이 시작입니다. 여러 주에 걸친 반복 사용은 성과 화면에서 따로 셉니다.',
  })

  // ── ⑦-2 이번 달 「시스템 안에서 끝난」 거래처 — 엑셀은 대조에만 쓰는가 ────
  //  목표: 수거 → 자재 → 정산이 시스템에서 끝나고 엑셀은 대조·검토에만. 달성
  //  여부를 거래처 단위로 셉니다. 「완료 수거가 있는 곳」이 분모입니다 — 이번 달
  //  안 간 곳까지 넣으면 못 끝낸 것처럼 보입니다.
  //  ⚠ 자재는 「기록이 있는 곳」만 셉니다. 자재를 안 준 달은 기록이 없는 것이
  //    정상이라, 자재를 조건에 넣지 않고 정보로만 적습니다.
  //  ⚠ 청구 확정은 월말에 합니다. 월중에는 0 이 정상이므로 note 에 적습니다.
  {
    const month = thisMonth()
    const doneThisMonth = (data.schedules ?? []).filter(
      (s) => s.status === '완료' && !s.canceledAt && isFieldSchedule(s) && s.date.startsWith(month),
    )
    const entered = new Set(sample.field.map((e) => e.scheduleId))
    const clientsDone = new Set(doneThisMonth.map((s) => s.clientId))
    const clientsEntered = new Set(doneThisMonth.filter((s) => entered.has(s.id)).map((s) => s.clientId))
    const clientsAllEntered = [...clientsDone].filter((cid) => doneThisMonth.filter((s) => s.clientId === cid).every((s) => entered.has(s.id)))
    const clientsMaterial = new Set((data.materials ?? []).filter((m) => m.date.startsWith(month) && clientsDone.has(m.clientId)).map((m) => m.clientId))
    const clientsBilled = new Set(
      (data.payments ?? []).filter((p) => p.billingMonth === month && !p.canceledAt && p.status !== '취소' && clientsDone.has(p.clientId)).map((p) => p.clientId),
    )
    const n = clientsDone.size
    const closed = clientsAllEntered.filter((cid) => clientsBilled.has(cid)).length
    items.push({
      key: 'systemClosed',
      group: 'system',
      label: `이번 달 수거 → 자재 → 정산을 시스템 안에서 끝낸 거래처 (${month})`,
      state: n === 0 ? 'missing' : closed === n ? 'ok' : 'partial',
      value: n === 0
        ? '이번 달 완료 수거가 있는 거래처 없음'
        : `완료 수거 ${n}곳 중 전부 시스템 입력 ${clientsAllEntered.length}곳 · 자재 기록 ${clientsMaterial.size}곳 · 청구 확정 ${clientsBilled.size}곳 → 끝난 곳 ${closed}곳`,
      why: '목표는 선택한 거래처의 수거·자재·정산을 시스템에서 끝내고 엑셀은 대조·검토에만 쓰는 것입니다. 이 줄이 「전부」가 되면 그 달은 엑셀 없이 닫힌 것입니다.',
      where: { to: '/billing', label: '월말 청구' },
      note: `「끝난 곳」 = 완료 수거가 전부 시스템 입력이고 이번 달 청구가 확정된 곳. 청구 확정은 월말에 하므로 월중에는 0 이 정상입니다. 일부만 입력된 곳 ${clientsEntered.size - clientsAllEntered.length}곳.`,
    })
  }

  // ── ⑧ AI — 개수는 목표가 아닙니다 ───────────────────────────────────────
  const aiCalls = data.aiCalls
  items.push({
    key: 'ai',
    group: 'system',
    label: 'AI 실제 사용 기록',
    state: aiCalls && aiCalls.length > 0 ? 'partial' : 'missing',
    value: aiCalls == null
      ? `호출 기록 표 없음 · 설계된 자리 ${AI_SPEC_ORDER.length}곳 중 연결 0곳`
      : `호출 ${aiCalls.length}건 (성공 ${aiCalls.filter((c) => c.ok).length}) · 설계된 자리 ${AI_SPEC_ORDER.length}곳`,
    why: '「어디가 AI입니까」에는 연결 개수가 아니라 **입력·결과·담당자 수정·실패·처리시간 기록**으로 답합니다. 개수를 목표로 삼지 않습니다.',
    where: { to: '/requests', label: '고객 요청 → AI 요청 정리' },
    note: '요청 정리 1곳의 서버 함수와 화면 연결이 준비돼 있습니다. 키 발급·배포 전에는 화면이 「아직 연결 전」이라고 말하고, 가짜 결과를 만들지 않습니다.',
  })

  // ── 기업 증빙 — 사람이 서류로 확인 ────────────────────────────────────────
  const fact = (key: string) => COMPANY_FACTS.find((f) => f.key === key)
  const factItem = (key: string, why: string): ReadyItem | null => {
    const f = fact(key)
    if (!f) return null
    return {
      key: `fact:${f.key}`,
      group: 'company',
      label: f.label,
      state: f.status === 'not_entered' ? 'missing' : 'manual',
      value: `${f.value} · ${FACT_STATUS_LABEL[f.status]}`,
      why,
      where: null,
      note: [f.note, f.toConfirm ? `확인할 서류: ${f.toConfirm}` : ''].filter(Boolean).join(' '),
    }
  }
  for (const it of [
    factItem('rev2026h1', '최근 실적은 심사에서 가장 먼저 보는 숫자입니다. 신고서 사본이 있어야 「확인된 값」이 됩니다.'),
    factItem('clients', '거래처 수는 시스템 등록 수와 별도입니다 — 계약 목록과 대조해야 합니다.'),
    factItem('patent', '출원과 등록은 다릅니다. 출원 통지서로 「출원 중」을 증빙합니다.'),
    factItem('venture', '벤처기업확인은 확인서 원본으로만 증빙됩니다.'),
    factItem('rnd', '전담부서는 인정서와 유효 기간으로 증빙됩니다.'),
    factItem('relocation', '허가 범위·계약이 확인되기 전에는 「검토 중」으로만 적습니다.'),
    factItem('funding', '계획 수치가 없으면 비워 둡니다 — 만들어 넣지 않습니다.'),
  ]) if (it) items.push(it)

  items.push({
    key: 'ip',
    group: 'company',
    label: 'SW 저작권 등록',
    state: 'manual',
    value: '접수 여부는 시스템이 확인할 수 없습니다',
    why: '있으면 도움이 되지만 필수요건이 아닙니다. 접수증만 있어도 「진행 중」으로 쓸 수 있습니다.',
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
