import type { AppData, CoachMissionRow } from '../types'
import type { UserRole } from '../context/AuthContext'
import { AX_MIN_SAMPLES, axEvidence, type AxEvidence, type AxNumber, type AxPeriod } from './axEvidence'
import { BREADTH_RULE, evidenceSample, isFieldSchedule, localDateOf } from './evidenceBase'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// AX Coach — 「지금 무엇을 하면 증거가 생기는가」 (0108)
//
//  이 파일은 **성과를 계산하지 않습니다.** 성과는 lib/axEvidence.ts 와
//  lib/performance.ts 가 이미 계산합니다. 여기서 하는 일은 셋뿐입니다.
//
//   ① 네 갈래 증거가 **얼마나 쌓였는지** 셉니다 (실증 자료 준비도)
//   ② 가장 모자란 갈래를 채울 **오늘 할 수 있는 실제 업무**를 고릅니다
//   ③ 그 업무가 **실제로 일어났는지**를 기존 기록으로 확인합니다
//
//  ── 지키는 것 ────────────────────────────────────────────────────────────
//
//  1. **증거 숫자를 새로 만들지 않습니다.** 준비도는 axEvidence 가 낸
//     AxNumber 를 그대로 읽어 「목표 대비 얼마나 찼는가」만 셉니다. 같은 값을
//     두 곳에서 따로 계산하면 언젠가 두 숫자가 갈라집니다.
//
//  2. **「완료」 단추로는 아무것도 완료되지 않습니다.** Mission 이 끝났다는
//     판정은 오직 **실제 업무 기록**(수거 이벤트 · 포털 요청 · 주문 전달 ·
//     입금 · 마감 · 거래처 값)이 발행 시각 **뒤에** 생겼는지로 합니다.
//     사람이 누른 것은 「업무하러 갔다」는 사실뿐입니다.
//
//  3. **준비도는 성과가 아닙니다.** 「자료가 얼마나 쌓였는가」입니다. 46% 는
//     46% 좋아졌다는 뜻이 아닙니다 — 화면에도 그렇게 적습니다.
//
//  4. **못 센 것은 0 이 아닙니다.** 항목마다 `have = null`(아직 못 셈)과
//     `have = 0`(세 봤더니 없음)을 가릅니다. 준비도 진행률로는 둘 다 0 이지만
//     화면 문구가 다릅니다.
//
//  5. **목표값을 새로 지어내지 않습니다.** 30건 · 14일 · 5곳 · 2명 · 80% 는
//     lib/evidenceBase.ts 의 BREADTH_RULE 그대로이고, 5건은 axEvidence 의
//     AX_MIN_SAMPLES(측정 중 → 측정값) 그대로입니다.
//
//  6. **가짜 업무를 만들라고 하지 않습니다.** 포털 요청은 **병원이** 올려야
//     세고(`source === 'portal'`), 시험 주문·연습 입력으로 증거를 만들지
//     않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceArea = 'work' | 'sales' | 'capacity' | 'customer'

/** 화면에 쓰는 쉬운 이름 — 영어를 앞에 내세우지 않습니다 */
export const AREA_LABEL: Record<EvidenceArea, string> = {
  work: '업무 활용',
  sales: '매출 증거',
  capacity: '운영 확장',
  customer: '병원 직접사용',
}

/** 이 갈래가 증명하려는 문장 (AX_EVIDENCE_ROADMAP.md 의 네 문장) */
export const AREA_SENTENCE: Record<EvidenceArea, string> = {
  work: '같은 일을 더 적은 시간과 반복입력으로 했는가',
  sales: '기존 병원에서 실제 상품매출이 생겼는가',
  capacity: '같은 기사·차량으로 더 많은 거래처를 봤는가',
  customer: '병원이 전화·카톡 대신 직접 쓰기 시작했는가',
}

/** 자세한 것은 성과 화면 어디를 보면 되는가 */
export const AREA_ANCHOR: Record<EvidenceArea, string> = {
  work: '/performance?tab=basis#ax-work',
  sales: '/performance?tab=basis#ax-sales',
  capacity: '/performance?tab=basis#ax-capacity',
  customer: '/performance?tab=basis#ax-customer',
}

// ═══ ① 실증 자료 준비도 ═══════════════════════════════════════════════════════

export interface CoverageItem {
  key: string
  /** 쉬운 말 이름 */
  label: string
  /** 지금 값. **null = 아직 못 셈** (0 = 세 봤더니 없음) */
  have: number | null
  /** 이만큼 있어야 이 항목은 다 찬 것으로 봅니다 */
  need: number
  unit: string
  /** 0~1. 못 센 것도 진행은 0 입니다 — 다만 화면 문구가 다릅니다 */
  ratio: number
  /** 이 숫자가 어디서 왔는가 (한 줄) */
  from: string
}

export type CoverageState = 'none' | 'low' | 'building' | 'enough'

export const COVERAGE_SAY: Record<CoverageState, string> = {
  none: '아직 기록이 없어요',
  low: '기록이 더 필요해요',
  building: '쌓이는 중이에요',
  enough: '충분히 쌓였어요',
}

export interface AreaCoverage {
  area: EvidenceArea
  label: string
  /** 0~100 (반올림) */
  pct: number
  state: CoverageState
  /** 「포털 요청 기록이 아직 부족해요」 — 가장 모자란 항목으로 만든 한 줄 */
  say: string
  items: CoverageItem[]
  /** 가장 모자란 항목 (다 찼으면 null) */
  weakest: CoverageItem | null
}

export interface Coverage {
  period: AxPeriod
  /** 실증 시작일. null 이면 「언제부터가 실증인지」를 모릅니다 */
  experimentStart: string | null
  pct: number
  areas: AreaCoverage[]
  /** 못 센 항목 수 — 자료를 못 읽은 것과 기록이 없는 것을 가르는 데 씁니다 */
  uncounted: number
}

function item(
  key: string,
  label: string,
  have: number | null,
  need: number,
  unit: string,
  from: string,
): CoverageItem {
  const ratio = have == null || need <= 0 ? 0 : Math.min(1, Math.max(0, have / need))
  return { key, label, have, need, unit, ratio, from }
}

const pick = (ns: AxNumber[], key: string): AxNumber | undefined => ns.find((n) => n.key === key)
/** 값이 null 이면 못 센 것입니다 — 0 으로 바꾸지 않습니다 */
const val = (n: AxNumber | undefined): number | null => (n ? n.value : null)
/** 표본 수는 「몇 건에서 나왔나」이므로 늘 셀 수 있습니다 */
const smp = (n: AxNumber | undefined): number => (n ? n.samples : 0)

function stateOf(pct: number, anyRecord: boolean): CoverageState {
  if (pct >= 100) return 'enough'
  if (!anyRecord || pct === 0) return 'none'
  return pct >= 50 ? 'building' : 'low'
}

function areaOf(area: EvidenceArea, items: CoverageItem[]): AreaCoverage {
  const pct = items.length === 0 ? 0 : Math.round((items.reduce((s, i) => s + i.ratio, 0) / items.length) * 100)
  const anyRecord = items.some((i) => (i.have ?? 0) > 0)
  const state = stateOf(pct, anyRecord)
  const unfilled = items.filter((i) => i.ratio < 1).sort((a, b) => a.ratio - b.ratio)
  const weakest = unfilled[0] ?? null
  const say = weakest ? `${weakest.label} 기록이 아직 부족해요` : COVERAGE_SAY.enough
  return { area, label: AREA_LABEL[area], pct, state, say, items, weakest }
}

/**
 * 같은 자료 · 같은 기간이면 한 번만 셉니다.
 *
 *  ⚠ 재 봤습니다 (거래처 100곳 · 일정 5,200건 · 1년): `coverageOf` 한 번에
 *    192ms 입니다. 첫 화면 한 줄 · 코치 화면 · 7일 리포트가 **같은 기간**을
 *    각자 세면 화면 한 번에 세 번입니다.
 *
 *    순수 함수라 같은 입력이면 같은 답입니다. 자료를 다시 읽으면 `data` 가
 *    새 객체가 되므로 그때 저절로 버려집니다 (WeakMap). 값을 저장해 두는
 *    것이 아니라 **같은 계산을 두 번 하지 않는 것**뿐입니다.
 */
const COVERAGE_CACHE = new WeakMap<AppData, Map<string, Coverage>>()

/**
 * 네 갈래가 얼마나 찼는가.
 *
 *  ⚠ 여기서 새로 세는 숫자는 하나도 없습니다. axEvidence() 와
 *    evidenceSample() 이 낸 값을 목표와 견줄 뿐입니다.
 */
export function coverageOf(data: AppData, period: AxPeriod, ev?: AxEvidence): Coverage {
  //  증거를 밖에서 넘겨받은 경우는 부른 쪽이 기간을 이미 정해 온 것이라
  //  그대로 셉니다 (기간과 증거가 어긋나면 캐시가 거짓말을 하게 됩니다).
  if (ev) return computeCoverage(data, period, ev)
  const key = `${period.from}~${period.to}`
  let byPeriod = COVERAGE_CACHE.get(data)
  if (!byPeriod) {
    byPeriod = new Map()
    COVERAGE_CACHE.set(data, byPeriod)
  }
  const hit = byPeriod.get(key)
  if (hit) return hit
  const made = computeCoverage(data, period)
  byPeriod.set(key, made)
  return made
}

function computeCoverage(data: AppData, period: AxPeriod, ev?: AxEvidence): Coverage {
  const e = ev ?? axEvidence(data, period)
  const sample = evidenceSample(data, { from: period.from, to: period.to })
  const b = sample.breadth

  // ── ① 업무 활용 ────────────────────────────────────────────────────────────
  const work = areaOf('work', [
    item('fieldInputs', '현장에서 입력한 수거', sample.field.length, BREADTH_RULE.samples, '건', '수거 입력 기록 (시연·연습·취소 제외)'),
    item('inputDays', '입력한 날', b.operatingDays, BREADTH_RULE.operatingDays, '일', '현장 입력이 하루라도 있었던 날'),
    item('enteredRate', '다녀온 일정을 입력한 비율', b.coverage.pct, BREADTH_RULE.coveragePct, '%', '완료 일정 중 수거 입력이 남은 비율'),
    item('entered', '입력이 끝난 수거', val(pick(e.work.numbers, 'entered')), AX_MIN_SAMPLES, '건', '완료 처리되고 입력 시각이 남은 건 (당일 입력률의 분모)'),
  ])

  // ── ② 매출 증거 — 네 단계를 절대 합치지 않습니다 ──────────────────────────
  const sales = areaOf('sales', [
    item('orders', '소모품 주문', val(pick(e.sales.numbers, 'orders')), AX_MIN_SAMPLES, '건', '취소하지 않은 주문 (아직 매출이 아닙니다)'),
    item('delivered', '실제 전달 완료', val(pick(e.sales.numbers, 'deliveredOrders')), AX_MIN_SAMPLES, '건', '전달까지 끝난 주문 — 매출은 여기서부터'),
    item('billed', '청구까지 확정', smp(pick(e.sales.numbers, 'billedRevenue')), 1, '건', '그 주문이 확정 청구에 담긴 건'),
    item('paid', '입금까지 완료', smp(pick(e.sales.numbers, 'paidRevenue')), 1, '건', '그 청구가 실제 입금까지 끝난 건'),
    item('repeatBuyers', '두 번 이상 산 병원', val(pick(e.sales.numbers, 'repeatBuyers')), 1, '곳', '첫 주문이 아닌 주문이 있는 거래처'),
  ])

  // ── ③ 운영 확장 ────────────────────────────────────────────────────────────
  const capacity = areaOf('capacity', [
    item('visits', '완료한 방문', val(pick(e.capacity.numbers, 'visits')), BREADTH_RULE.samples, '건', '완료 처리된 수거 일정 (무른 방문 제외)'),
    item('activeDays', '실제 나간 날', val(pick(e.capacity.numbers, 'activeDays')), BREADTH_RULE.operatingDays, '일', '한 건이라도 완료한 날'),
    item('drivers', '기사별로 셀 수 있는 사람', val(pick(e.capacity.numbers, 'drivers')), BREADTH_RULE.drivers, '명', '일정에 기사 이름이 적힌 건만'),
    item('kgPerVehicleDay', '차량 운행일당 수거량을 잰 날', smp(pick(e.capacity.numbers, 'kgPerVehicleDay')), AX_MIN_SAMPLES, '일', '차량 × 날짜로 센 운행일'),
  ])

  // ── ④ 병원 직접사용 ────────────────────────────────────────────────────────
  //   ⚠ 직원이 대신 넣은 요청은 여기 없습니다. 병원이 올린 것(source=portal)만입니다.
  const pReq = val(pick(e.customer.numbers, 'portalRequests'))
  const pOrd = val(pick(e.customer.numbers, 'portalOrders'))
  const portalTotal = pReq == null && pOrd == null ? null : (pReq ?? 0) + (pOrd ?? 0)
  const customer = areaOf('customer', [
    item('portalUse', '병원이 직접 올린 요청·주문', portalTotal, AX_MIN_SAMPLES, '건', '포털에서 병원이 직접 올린 것만 (직원 대신 접수는 제외)'),
    item('portalClients', '포털을 쓴 병원', val(pick(e.customer.numbers, 'portalClients')), 2, '곳', '한 번이라도 포털로 올린 서로 다른 거래처'),
    item('repeatPortal', '두 번 이상 쓴 병원', val(pick(e.customer.numbers, 'repeatPortalClients')), 1, '곳', '한 번은 시켜서 해 본 것일 수 있습니다 — 두 번째부터가 습관'),
    item('responseHours', '접수 → 처리 시간을 잰 건', smp(pick(e.customer.numbers, 'responseHours')), AX_MIN_SAMPLES, '건', '처리 시각이 남은 요청'),
  ])

  const areas = [work, sales, capacity, customer]
  //  네 문장은 같은 무게입니다 — 어느 하나가 비면 나머지로 메울 수 없습니다.
  const pct = Math.round(areas.reduce((s, a) => s + a.pct, 0) / areas.length)
  const uncounted = areas.reduce((s, a) => s + a.items.filter((i) => i.have == null).length, 0)

  return { period, experimentStart: sample.experimentStart, pct, areas, uncounted }
}

// ═══ ② Mission ═══════════════════════════════════════════════════════════════

export type MissionStatus = 'todo' | 'waiting' | 'verified'

/** 무엇으로 「실제로 했다」를 확인하는가 */
export type VerifyKind =
  /** 발행 시각 **뒤에** 새 기록이 생겼는가 */
  | 'event'
  /** 비어 있던 값이 채워졌는가 (기록의 상태 변화) */
  | 'state'

export interface CoachMission {
  key: string
  area: EvidenceArea
  /** 이 일이 채우는 준비도 항목 */
  fills: string
  title: string
  why: string
  actionLabel: string
  to: string
  /** 무엇이 남아야 확인되는가 — 사람 말로 */
  expected: string
  verifyKind: VerifyKind
  /** 대상이 정해지는 일이면 그 기록 id (없으면 null) */
  targetId: string | null
  targetName: string
  /** 클수록 먼저 */
  priority: number
  /** 이 역할이 할 수 있는 일인가 */
  roles: UserRole[]
}

export interface MissionVerification {
  verified: boolean
  /** 확인된 기록의 시각 (ISO 또는 날짜) */
  at: string | null
  /** 무엇을 보고 확인했는가 — 화면에 그대로 나갑니다 */
  what: string
}

export interface MissionCard extends CoachMission {
  status: MissionStatus
  /** 발행(업무하러 가기를 누른) 기록 — 없으면 null */
  issued: CoachMissionRow | null
  verification: MissionVerification
}

const STAFF: UserRole[] = ['admin', 'office']
const FIELD_TOO: UserRole[] = ['admin', 'office', 'field']

/**
 * 일의 기본 모양 — 제목에 붙는 건수만 그때그때 채웁니다.
 *
 *  ⚠ 이 목록이 따로 있는 이유: **발행한 뒤에는 오늘의 대상이 사라져도 카드가
 *    남아야 합니다.** 오늘 갈 곳을 다 다녀오면 「오늘 갈 병원 2곳」 후보는
 *    사라지는데, 그 순간 카드까지 없어지면 「✓ 실제 업무기록을 확인했어요」를
 *    볼 자리가 없습니다 — 한 일이 확인되는 것을 보는 것이 이 화면의 전부입니다.
 */
const MISSION_SPECS: Record<string, Omit<CoachMission, 'priority' | 'targetId' | 'targetName' | 'key'>> = {
  'collect-today': {
    area: 'work', fills: 'fieldInputs',
    title: '오늘 다녀온 병원은 그 자리에서 바로 입력해 주세요',
    why: '다녀온 날 안에 입력한 기록이 쌓여야 업무시간이 줄었는지 확인할 수 있어요.',
    actionLabel: '수거 입력으로', to: '/collection',
    expected: '오늘 날짜의 수거 완료 기록', verifyKind: 'event', roles: FIELD_TOO,
  },
  'catch-up-entry': {
    area: 'work', fills: 'enteredRate',
    title: '다녀왔는데 입력이 빠진 방문을 채워 주세요',
    why: '완료 표시만 있고 수거 입력이 없으면, 실제로 얼마나 쓰고 있는지 셀 수 없어요.',
    actionLabel: '수거 입력으로', to: '/collection',
    expected: '그 방문의 수거 입력', verifyKind: 'event', roles: FIELD_TOO,
  },
  'portal-request': {
    area: 'customer', fills: 'portalUse',
    title: '병원 1곳에서 포털로 직접 요청을 올리게 해 주세요',
    why: '전화·카톡 대신 시스템을 쓰기 시작했는지 보는 기록이에요. 직원이 대신 넣은 것은 세지 않습니다.',
    actionLabel: '거래처 연락처 보기', to: '/clients',
    expected: '병원이 포털에서 직접 올린 요청 또는 물품 주문', verifyKind: 'event', roles: STAFF,
  },
  'order-deliver': {
    area: 'sales', fills: 'delivered',
    title: '들어온 주문을 실제 전달까지 처리해 주세요',
    why: '주문은 아직 매출이 아니에요. 전달이 끝나야 매출로 셉니다.',
    actionLabel: '주문 보기', to: '/supplies',
    expected: '그 주문의 전달 완료 기록', verifyKind: 'event', roles: STAFF,
  },
  'payment-match': {
    area: 'sales', fills: 'paid',
    title: '입금 확인이 안 된 청구를 통장 내역과 맞춰 주세요',
    why: '전달까지 끝난 것과 돈이 들어온 것은 다른 일이에요. 입금까지 맞춰야 마지막 칸이 채워집니다.',
    actionLabel: '통장 입금 대사로', to: '/bank',
    expected: '그 청구의 입금 완료', verifyKind: 'event', roles: STAFF,
  },
  'day-close': {
    area: 'capacity', fills: 'activeDays',
    title: '오늘 업무 마감을 찍어 주세요',
    why: '나간 날과 운행 기록이 남아야 「같은 차로 더 많이 다녔는가」를 셀 수 있어요.',
    actionLabel: '오늘 일정으로', to: '/today',
    expected: '오늘 날짜의 업무 마감 기록', verifyKind: 'event', roles: FIELD_TOO,
  },
  'material-record': {
    area: 'work', fills: 'fieldInputs',
    title: '병원에 전달한 용기·봉투를 수거 입력에서 함께 적어 주세요',
    why: '한 번 입력으로 재고·정산까지 자동으로 이어지는지 보는 기록이에요.',
    actionLabel: '수거 입력으로', to: '/collection',
    expected: '최근 자재 공급 기록', verifyKind: 'event', roles: FIELD_TOO,
  },
  'client-info': {
    area: 'work', fills: 'enteredRate',
    title: '오늘 방문하는 병원의 빠진 기본정보를 확인해 주세요',
    why: '주소·전화가 비어 있으면 기사님이 현장에서 막혀 입력이 밀려요.',
    actionLabel: '거래처 보기', to: '/clients',
    expected: '그 병원의 주소·전화가 채워진 상태', verifyKind: 'state', roles: STAFF,
  },
}

/** 업무 중요도 — 돈과 현장이 먼저입니다 */
const IMPORTANCE: Record<string, number> = {
  'collect-today': 1,
  'catch-up-entry': 0.85,
  'payment-match': 0.8,
  'order-deliver': 0.75,
  'portal-request': 0.7,
  'day-close': 0.6,
  'material-record': 0.5,
  'client-info': 0.45,
}

/**
 * 「이 기록이 발행 시각 뒤에 생겼는가」를 **실제 시각**으로 견줍니다.
 *
 *  ⚠ 글자끼리 견주면 틀립니다. 서버는 `2026-09-12T04:00:00+00:00` 처럼 UTC 로
 *    주는데 「오늘 0시」는 한국 시간입니다. 새벽에 넣은 기록(한국 01시 =
 *    UTC 전날 16시)이 글자 비교에서는 「오늘보다 앞」으로 밀려납니다.
 */
const atMs = (iso: string | null | undefined): number => {
  if (!iso) return Number.NaN
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? Number.NaN : ms
}
/** 그 기록이 기준 시각 뒤인가 (읽을 수 없는 시각은 「아니다」) */
const after = (iso: string | null | undefined, since: string): boolean => {
  const a = atMs(iso)
  const b = atMs(since)
  if (Number.isNaN(a)) return false
  if (Number.isNaN(b)) return true
  return a >= b
}
/** 오늘 0시 (그 기기의 시간대 기준) */
const startOfToday = (t: string) => {
  const [y, m, d] = t.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString()
}

/**
 * 살아 있는 주문.
 *  ⚠ 취소는 **두 가지로** 들어옵니다 — 상태가 '취소' 이거나 취소 시각이 찍혀
 *    있거나. axEvidence.orderStages 와 같은 기준을 씁니다.
 */
const liveOrders = (data: AppData) =>
  (data.productOrders ?? []).filter((o) => o.status !== '취소' && !o.canceledAt)

/**
 * 오늘 할 수 있는 실제 업무 후보를 만듭니다.
 *
 *  ⚠ **데이터에 실제 대상이 있을 때만** 후보가 됩니다. 「포털 요청을 받아
 *    보세요」는 늘 띄울 수 있지만, 「주문 1건을 전달까지」는 전달 안 된 주문이
 *    실제로 있어야 띄웁니다. 할 수 없는 일을 시키면 그다음부터 아무도 안 봅니다.
 */
export function missionCandidates(
  data: AppData,
  cov: Coverage,
  opts: { role: UserRole; today?: string } = { role: 'admin' },
): CoachMission[] {
  const t = opts.today ?? today()
  const out: CoachMission[] = []
  const byArea = new Map(cov.areas.map((a) => [a.area, a]))
  const gapOf = (a: EvidenceArea) => Math.max(0, 1 - (byArea.get(a)?.pct ?? 0) / 100)
  const itemOf = (a: EvidenceArea, key: string) => byArea.get(a)?.items.find((i) => i.key === key) ?? null
  const clientName = new Map((data.clients ?? []).map((c) => [c.id, c.name]))

  /** 기본 모양에 오늘의 건수·대상만 얹습니다 */
  const add = (
    key: string,
    over: { title?: string; why?: string; expected?: string; targetId?: string | null; targetName?: string; to?: string },
    weight: { today: number; fillWeight?: number },
  ) => {
    const spec = MISSION_SPECS[key]
    if (!spec) return
    const gap = gapOf(spec.area)
    const priority = Math.round(gap * (weight.fillWeight ?? 1) * weight.today * (IMPORTANCE[key] ?? 0.5) * 1000) / 1000
    if (priority <= 0) return
    out.push({
      ...spec,
      key,
      targetId: over.targetId ?? null,
      targetName: over.targetName ?? '',
      title: over.title ?? spec.title,
      why: over.why ?? spec.why,
      expected: over.expected ?? spec.expected,
      to: over.to ?? spec.to,
      priority,
    })
  }

  // ── 1. 오늘 갈 곳을 다녀온 자리에서 바로 입력 ───────────────────────────
  const pendingToday = (data.schedules ?? []).filter(
    (s) => s.date === t && s.status !== '완료' && !s.canceledAt && isFieldSchedule(s),
  )
  if (pendingToday.length > 0) {
    add('collect-today', { title: `오늘 갈 병원 ${pendingToday.length}곳, 다녀온 자리에서 바로 입력해 주세요` }, { today: 1 })
  }

  // ── 2. 다녀왔는데 입력이 빠진 방문 채우기 ────────────────────────────────
  const missingEntry = schedulesMissingEntry(data, cov.period)
  if (missingEntry.length > 0) {
    const first = missingEntry[0]
    add(
      'catch-up-entry',
      {
        title: `다녀왔는데 입력이 빠진 방문이 ${missingEntry.length}건 있어요`,
        expected: `${clientName.get(first.clientId) ?? '그 병원'} ${first.date} 방문의 수거 입력`,
        targetId: first.id,
        targetName: clientName.get(first.clientId) ?? '',
      },
      { today: 1 },
    )
  }

  // ── 3. 병원이 직접 올리게 ────────────────────────────────────────────────
  const portalItem = itemOf('customer', 'portalUse')
  if (portalItem && portalItem.ratio < 1) add('portal-request', {}, { today: 0.8 })

  // ── 4. 들어온 주문을 전달까지 ────────────────────────────────────────────
  const undelivered = liveOrders(data).filter((o) => !o.deliveredAt)
  if (undelivered.length > 0) {
    const o = undelivered[0]
    add(
      'order-deliver',
      {
        title: `들어온 주문 ${undelivered.length}건, 실제 전달까지 처리해 주세요`,
        expected: `${clientName.get(o.clientId) ?? '그 병원'} 주문의 전달 완료 기록`,
        targetId: o.id,
        targetName: clientName.get(o.clientId) ?? '',
      },
      { today: 1 },
    )
  }

  // ── 5. 입금 맞추기 ───────────────────────────────────────────────────────
  const unpaid = (data.payments ?? []).filter((p) => !p.canceledAt && !p.paidAt && p.amount > 0)
  if (unpaid.length > 0) {
    const p = unpaid[0]
    add(
      'payment-match',
      {
        //  ⚠ 오늘 할 일은 **한 건**입니다. 「648건 있어요」라고 적으면 오늘
        //    할 일이 아니라 밀린 더미로 읽혀서 아예 손을 못 댑니다.
        title: '입금된 청구 1건을 통장 내역과 맞춰 주세요',
        why: `전달까지 끝난 것과 돈이 들어온 것은 다른 일이에요. 지금 입금 확인이 안 된 청구가 ${unpaid.length}건 남아 있고, 오늘은 한 건만 맞추면 됩니다.`,
        expected: `${clientName.get(p.clientId) ?? '그 병원'} ${p.billingMonth} 청구의 입금 완료`,
        targetId: p.id,
        targetName: clientName.get(p.clientId) ?? '',
      },
      { today: 1 },
    )
  }

  // ── 6. 오늘 업무 마감 ────────────────────────────────────────────────────
  //   ⚠ 마감 기록 표가 없으면(판 106 이전) 확인할 방법이 없으므로 내지 않습니다.
  if (data.dayCloses !== undefined) {
    const doneToday = (data.schedules ?? []).some((s) => s.date === t && s.status === '완료' && !s.canceledAt && isFieldSchedule(s))
    const closedToday = (data.dayCloses ?? []).some((c) => c.date === t)
    if (doneToday && !closedToday) add('day-close', {}, { today: 1 })
  }

  // ── 7. 전달한 자재 기록 ──────────────────────────────────────────────────
  const recentFrom = shiftDays(t, -6)
  const suppliedRecently = (data.materials ?? []).some((m) => m.date >= recentFrom && m.date <= t)
  const collectedRecently = (data.events ?? []).some(
    (e) => e.action === '수거 완료' && !e.reverted && !e.demoSessionId && localDateOf(e.at) >= recentFrom,
  )
  if (collectedRecently && !suppliedRecently) add('material-record', {}, { today: 0.7 })

  // ── 8. 오늘 방문하는 병원의 빠진 정보 ────────────────────────────────────
  const todayClients = new Set(pendingToday.map((s) => s.clientId))
  const needInfo = (data.clients ?? []).find(
    (c) => todayClients.has(c.id) && !c.isDemoGenerated && (!(c.address ?? '').trim() || !(c.phone ?? '').trim()),
  )
  if (needInfo) {
    add(
      'client-info',
      {
        title: `${needInfo.name}의 빠진 기본정보를 한 번 확인해 주세요`,
        targetId: needInfo.id,
        targetName: needInfo.name,
        to: `/clients/${needInfo.id}`,
      },
      { today: 1 },
    )
  }

  return out
    .filter((m) => m.roles.includes(opts.role))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
}

/** 다녀왔다고 표시됐는데 수거 입력이 없는 일정 (오래된 것부터) */
export function schedulesMissingEntry(data: AppData, period: AxPeriod) {
  const start = data.experiment?.startDate ?? null
  const entered = new Set(
    (data.events ?? [])
      .filter((e) => e.action === '수거 완료' && !e.reverted)
      .map((e) => e.scheduleId),
  )
  return (data.schedules ?? [])
    .filter(
      (s) =>
        s.status === '완료' &&
        !s.canceledAt &&
        isFieldSchedule(s) &&
        s.date >= period.from &&
        s.date <= period.to &&
        (!start || s.date >= start) &&
        !entered.has(s.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ═══ ③ 실제로 했는가 — 기록으로만 확인 ═══════════════════════════════════════

/**
 * Mission 이 실제로 이루어졌는지 **기존 업무 기록**으로 확인합니다.
 *
 *  `since` 는 「업무하러 가기」를 누른 시각입니다. 그 **뒤에** 생긴 기록만
 *  봅니다 — 그러지 않으면 예전 기록이 오늘 한 일처럼 셉니다.
 *  누른 기록이 없으면 오늘 0시부터 봅니다.
 *
 *  ⚠ 사람이 「완료」를 눌러 이 함수의 답이 바뀌는 길은 없습니다.
 */
export function verifyMission(
  m: Pick<CoachMission, 'key' | 'targetId'>,
  data: AppData,
  since: string,
  now: string = today(),
): MissionVerification {
  const sinceDate = since.slice(0, 10)
  const no: MissionVerification = { verified: false, at: null, what: '' }
  const name = new Map((data.clients ?? []).map((c) => [c.id, c.name]))

  switch (m.key) {
    case 'collect-today': {
      //  오늘 다녀오고 **오늘 안에** 입력된 건만 — 그것이 당일 입력입니다.
      const hit = (data.events ?? []).find((e) => {
        if (e.action !== '수거 완료' || e.reverted || e.demoSessionId) return false
        if (!after(e.at, since)) return false
        const entered = localDateOf(e.at)
        const sched = (data.schedules ?? []).find((s) => s.id === e.scheduleId)
        const visited = sched?.date ?? entered
        return entered === now && visited === now
      })
      return hit
        ? { verified: true, at: hit.at, what: `${hit.clientName} 수거 완료를 다녀온 날 안에 입력했습니다` }
        : no
    }
    case 'catch-up-entry': {
      const hit = (data.events ?? []).find(
        (e) =>
          e.action === '수거 완료' &&
          !e.reverted &&
          !e.demoSessionId &&
          after(e.at, since) &&
          (m.targetId ? e.scheduleId === m.targetId : true),
      )
      return hit ? { verified: true, at: hit.at, what: `${hit.clientName} 방문의 수거 입력이 들어왔습니다` } : no
    }
    case 'portal-request': {
      //  ⚠ 병원이 올린 것만입니다. 직원이 대신 접수한 것(source='staff')은 세지 않습니다.
      const req = (data.requests ?? []).find((r) => r.source === 'portal' && !r.demoSessionId && after(r.createdAt, since))
      if (req) return { verified: true, at: req.createdAt, what: `${req.clientName || name.get(req.clientId) || '병원'}이 포털에서 직접 요청을 올렸습니다` }
      const ord = liveOrders(data).find((o) => o.source === 'portal' && after(o.requestedAt, since))
      return ord
        ? { verified: true, at: ord.requestedAt, what: `${name.get(ord.clientId) ?? '병원'}이 포털에서 직접 주문했습니다` }
        : no
    }
    case 'order-deliver': {
      const hit = liveOrders(data).find(
        (o) => after(o.deliveredAt, since) && (m.targetId ? o.id === m.targetId : true),
      )
      return hit
        ? { verified: true, at: hit.deliveredAt, what: `${name.get(hit.clientId) ?? '병원'} 주문이 전달 완료로 기록됐습니다` }
        : no
    }
    case 'payment-match': {
      const hit = (data.payments ?? []).find(
        (p) => after(p.paidAt, since) && !p.canceledAt && (m.targetId ? p.id === m.targetId : true),
      )
      return hit
        ? { verified: true, at: hit.paidAt, what: `${name.get(hit.clientId) ?? '병원'} ${hit.billingMonth} 청구가 입금 완료됐습니다` }
        : no
    }
    case 'day-close': {
      const hit = (data.dayCloses ?? []).find((c) => c.date === now && after(c.closedAt, since))
      return hit ? { verified: true, at: hit.closedAt, what: `${hit.who || '기사님'}이 오늘 업무를 마감했습니다` } : no
    }
    case 'material-record': {
      //  자재 공급은 날짜(YYYY-MM-DD)까지만 남습니다 — 날 단위로 견줍니다.
      const hit = (data.materials ?? []).find((s) => s.date >= sinceDate)
      if (hit) return { verified: true, at: hit.date, what: `${name.get(hit.clientId) ?? '병원'} 자재 공급이 기록됐습니다` }
      const ev = (data.events ?? []).find(
        (e) => e.action === '수거 완료' && !e.reverted && after(e.at, since) && e.materialIds.length > 0,
      )
      return ev ? { verified: true, at: ev.at, what: `${ev.clientName} 수거 입력에서 자재가 함께 기록됐습니다` } : no
    }
    case 'client-info': {
      //  비어 있던 값이 채워졌는가 — 기록의 상태 변화로 확인합니다.
      const c = (data.clients ?? []).find((x) => x.id === m.targetId)
      if (!c) return no
      const filled = !!(c.address ?? '').trim() && !!(c.phone ?? '').trim()
      return filled ? { verified: true, at: null, what: `${c.name}의 주소·전화가 채워졌습니다` } : no
    }
    default:
      return no
  }
}

/**
 * 오늘 보여 줄 Mission — 최대 3개.
 *
 *  발행 이력이 있으면 그 시각부터, 없으면 오늘 0시부터 확인합니다.
 *  이미 확인된 것은 3개 자리를 차지하지 않고 따로 보여 줍니다.
 */
export function coachMissions(
  data: AppData,
  cov: Coverage,
  opts: { role: UserRole; today?: string; issued?: CoachMissionRow[] | undefined; max?: number },
): { todo: MissionCard[]; done: MissionCard[]; historyAvailable: boolean } {
  const t = opts.today ?? today()
  const max = opts.max ?? 3
  const rows = opts.issued
  const historyAvailable = rows !== undefined
  const mine = (rows ?? []).filter((r) => r.issuedOn === t)
  const recent = rows ?? []

  const candidates = missionCandidates(data, cov, { role: opts.role, today: t })

  //  ⚠ **오늘 발행된 일은 후보에서 빠져도 카드를 남깁니다.**
  //    오늘 갈 곳을 다 다녀오면 「오늘 갈 병원 2곳」 후보는 사라집니다. 그때
  //    카드까지 없어지면 방금 한 일이 확인되는 것을 볼 자리가 없어집니다 —
  //    그것을 보려고 이 화면에 돌아오는 것인데도.
  const extra: CoachMission[] = mine
    .filter((r) => !candidates.some((c) => c.key === r.missionKey))
    .map((r) => {
      const spec = MISSION_SPECS[r.missionKey]
      if (!spec) return null
      return { ...spec, key: r.missionKey, targetId: r.targetId, targetName: '', priority: 0 }
    })
    .filter((m): m is CoachMission => !!m && m.roles.includes(opts.role))

  const cards = [...candidates, ...extra].map((m): MissionCard => {
    const issued = mine.find((r) => r.missionKey === m.key) ?? null
    const since = issued?.issuedAt ?? startOfToday(t)
    const verification = verifyMission(m, data, since, t)
    //  같은 일을 며칠째 발행만 하고 못 채우고 있으면 뒤로 물립니다 —
    //  똑같은 카드가 매일 맨 위에 있으면 화면을 아예 안 보게 됩니다.
    const stale = recent.filter((r) => r.missionKey === m.key && !r.verifiedAt && r.issuedOn < t).length
    const priority = stale >= 2 ? Math.round(m.priority * 0.6 * 1000) / 1000 : m.priority
    return {
      ...m,
      priority,
      issued,
      verification,
      status: verification.verified ? 'verified' : issued ? 'waiting' : 'todo',
    }
  })

  const done = cards.filter((c) => c.status === 'verified')
  const todo = cards
    .filter((c) => c.status !== 'verified')
    //  발행됐지만 오늘 할 대상이 사라진 일(priority 0)은 목록 맨 뒤로 갑니다.
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
    .slice(0, max)
  return { todo, done, historyAvailable }
}

// ═══ ④ 최근 7일 / 14일 ═══════════════════════════════════════════════════════

export interface CoachReport {
  days: number
  period: AxPeriod
  /** 이 기간 전체가 실증 시작일보다 앞이면 기록 없음입니다 */
  beforeStart: boolean
  /** 기간 안에 실제로 일어난 것 — 없으면 null (못 셈) */
  lines: { label: string; value: number | null; unit: string }[]
  /** 준비도 변화 — 기간 시작 전까지의 자료로 잰 값 → 지금 */
  pctBefore: number | null
  pctNow: number
  /** 이번에 새로 확인된 것 (0 → 값이 생긴 항목) */
  gained: string[]
  /** 아직 비어 있는 것 */
  missing: string[]
  /** 다음 기간에 먼저 채울 것 (가장 약한 두 갈래) */
  next: string[]
  /** 발행된 Mission 중 실제로 확인된 것 — 이력 표가 없으면 null */
  missionsVerified: number | null
  missionsIssued: number | null
}

/**
 * 최근 N일 리포트.
 *
 *  ⚠ 없는 숫자를 만들지 않습니다. 실증 시작일 앞의 기간은 「기록 없음」이고,
 *    0 은 「그 기간에 세 봤더니 없었다」일 때만 씁니다.
 */
export function coachReport(
  data: AppData,
  days: number,
  opts: {
    today?: string
    issued?: CoachMissionRow[] | undefined
    /**
     * 오늘 화면이 **방금 확인한** 일의 키들.
     *
     *  ⚠ 확인 메모(verified_at)는 화면이 확인한 뒤에 적히므로, 적히기 전
     *    잠깐은 「위 카드는 ✓ 인데 아래 리포트는 0건」이 됩니다. 보는 사람에게는
     *    둘 중 하나가 틀린 것으로 보입니다. 오늘 것은 화면의 판정을 그대로 씁니다.
     */
    verifiedTodayKeys?: string[]
  } = {},
): CoachReport {
  const t = opts.today ?? today()
  const start = data.experiment?.startDate ?? null
  const from = shiftDays(t, -(days - 1))
  const period: AxPeriod = { from, to: t }
  const beforeStart = !!start && t < start

  const ev = axEvidence(data, period)
  const sample = evidenceSample(data, { from, to: t })
  const n = (ns: AxNumber[], key: string) => val(pick(ns, key))

  const lines = beforeStart
    ? []
    : [
        { label: '실제 업무를 한 날', value: n(ev.capacity.numbers, 'activeDays'), unit: '일' },
        { label: '수거 완료', value: n(ev.capacity.numbers, 'visits'), unit: '건' },
        { label: '현장에서 입력한 수거', value: sample.field.length, unit: '건' },
        { label: '병원이 직접 올린 요청·주문', value: (n(ev.customer.numbers, 'portalRequests') ?? 0) + (n(ev.customer.numbers, 'portalOrders') ?? 0), unit: '건' },
        { label: '상품 전달 완료', value: n(ev.sales.numbers, 'deliveredOrders'), unit: '건' },
        { label: '입금까지 끝난 청구', value: smp(pick(ev.sales.numbers, 'paidRevenue')), unit: '건' },
      ]

  //  준비도는 실증 시작일부터 오늘까지 누적으로 봅니다.
  //  「일주일 전에는 얼마였나」는 같은 계산을 그날까지로 끊어서 냅니다 —
  //  따로 저장해 둔 값이 아니라 그 자리에서 다시 셉니다.
  const cumFrom = start ?? earliestRecord(data) ?? from
  const now = coverageOf(data, { from: cumFrom, to: t })
  const cutoff = shiftDays(from, -1)
  const hadBefore = cutoff >= cumFrom
  const before = hadBefore ? coverageOf(data, { from: cumFrom, to: cutoff }) : null

  const gained: string[] = []
  const missingNow: string[] = []
  for (const a of now.areas) {
    const b = before?.areas.find((x) => x.area === a.area) ?? null
    for (const it of a.items) {
      const was = b?.items.find((x) => x.key === it.key) ?? null
      const hadNone = !was || (was.have ?? 0) === 0
      if (hadNone && (it.have ?? 0) > 0) gained.push(`${a.label} — ${it.label} ${it.have}${it.unit}`)
      if ((it.have ?? 0) === 0) missingNow.push(`${a.label} — ${it.label}`)
    }
  }

  const weakest = [...now.areas].sort((x, y) => x.pct - y.pct).slice(0, 2)
  const next = weakest.map((a) => `${a.label}: ${a.weakest ? a.weakest.label : '충분'}`)

  const issuedRows = opts.issued
  const inRange = (issuedRows ?? []).filter((r) => r.issuedOn >= from && r.issuedOn <= t)
  const liveToday = new Set(opts.verifiedTodayKeys ?? [])
  const verifiedCount = inRange.filter((r) => !!r.verifiedAt || (r.issuedOn === t && liveToday.has(r.missionKey))).length

  return {
    days,
    period,
    beforeStart,
    lines,
    pctBefore: before ? before.pct : null,
    pctNow: now.pct,
    gained,
    missing: missingNow,
    next,
    missionsIssued: issuedRows === undefined ? null : inRange.length,
    missionsVerified: issuedRows === undefined ? null : verifiedCount,
  }
}

/** 이 시스템에 남은 가장 이른 업무 기록 날짜 (없으면 null) */
export function earliestRecord(data: AppData): string | null {
  const days: string[] = []
  for (const e of data.events ?? []) {
    const d = localDateOf(e.at)
    if (d) days.push(d)
  }
  for (const s of data.schedules ?? []) if (isFieldSchedule(s)) days.push(s.date)
  days.sort()
  return days[0] ?? null
}

export function shiftDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
