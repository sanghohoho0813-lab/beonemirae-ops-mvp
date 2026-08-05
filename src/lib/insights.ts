import type { AppData, Client } from '../types'
import { thisMonth, today, dateStr } from './format'
import { clientSchedules, clientMaterials, clientOutstanding } from './ops'

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 기반 "다음 행동 추천" · "추가 매출 기회" 파생 로직
//
//  · 현재 축적된 운영 데이터(수거이력·자재공급·청구)만으로 계산하는 규칙 기반 로직입니다.
//    학습형 AI 모델이 아니며, 판단 근거(reason/metrics)를 항상 함께 노출합니다.
//  · AppData 스키마를 바꾸지 않고 계산만 하므로 self-heal/migration 과 충돌하지 않습니다.
//  · 배출자 교육 이력은 아직 저장 스키마가 없어 거래처 id 기반 결정적 파생값을 사용합니다.
//    (실제 적용 시 education 테이블로 대체 — 화면에 '시연 파생' 표기)
// ─────────────────────────────────────────────────────────────────────────────

/** 추천 행동 구분 */
export type NextActionKind = '추가수거' | '소모품공급' | '배출자교육' | '정기수거' | '관리필요'

export interface ActionMetric {
  label: string
  value: string
}

export interface NextAction {
  clientId: string
  clientName: string
  kind: NextActionKind
  /** 추천 제목 (예: 추가 수거 제안) */
  title: string
  /** 판단 근거 한 줄 */
  reason: string
  /** 실행 버튼 라벨 */
  cta: string
  /** 정렬 우선순위 (높을수록 먼저) */
  priority: number
  /** 예상 추가 매출 (원) — 0 이면 매출 기회가 아닌 관리 항목 */
  estValue: number
  /** 근거 지표 */
  metrics: ActionMetric[]
}

/** 수거주기 문자열 → 평균 간격(일). 예: '주 2회' → 3.5 */
export function cycleDays(cycle: string): number {
  const n = Number(cycle.match(/\d+/)?.[0] ?? 1)
  if (cycle.includes('주')) return Math.max(1, Math.round((7 / Math.max(1, n)) * 10) / 10)
  if (cycle.includes('월')) return Math.max(1, Math.round((30 / Math.max(1, n)) * 10) / 10)
  if (cycle.includes('일')) return Math.max(1, n)
  return 7
}

/** 이번 달 실제 청구액 ÷ 수거량으로 구한 kg당 평균 단가 (데이터 부족 시 기준 단가) */
export function unitPricePerKg(data: AppData, month = thisMonth()): number {
  const billed = data.payments.filter((p) => p.billingMonth === month).reduce((s, p) => s + p.amount, 0)
  const kg = data.schedules
    .filter((s) => s.date.startsWith(month) && s.status === '완료' && s.actualAmount != null)
    .reduce((s, x) => s + (x.actualAmount ?? 0), 0)
  if (billed > 0 && kg > 0) return Math.round(billed / kg)
  return 1_200 // 기준 단가 (데이터 부족 시 표시용)
}

/** 소모품 예상 단가 (기준값 · 실제 계약단가로 대체 예정) */
const SUPPLY_UNIT_PRICE = 3_500
/** 배출자 교육 1회 예상 단가 (기준값) */
const EDUCATION_PRICE = 150_000

const dayMs = 24 * 60 * 60 * 1000
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / dayMs)
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

/** 거래처 id 기반 결정적 해시 (시연 파생값 생성용) */
function seedOf(id: string): number {
  return [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0)
}

// ── 거래처별 운영 지표 ───────────────────────────────────────────────────────
export interface ClientSignals {
  client: Client
  /** 완료된 수거 건수 (전체) */
  doneCount: number
  /** 최근 수거일 */
  lastDate: string | null
  /** 다음 수거 예상일 (수거주기 기반) */
  predictedDate: string | null
  /** 예상 수거일까지 남은 일수 (음수면 초과) */
  dday: number | null
  /** 최근 14일 수거량 합계 (kg) */
  recentKg: number
  /** 그 이전 14일 수거량 합계 (kg) */
  prevKg: number
  /** 최근 14일 1회 평균 수거량 */
  recentAvgKg: number
  /**
   * 배출량 증감률 (%) — 최근 14일 합계 vs 직전 14일 합계.
   * 건별 평균이 아닌 기간 합계로 비교해, 폐기물 종류 구성 차이에 흔들리지 않게 합니다.
   */
  growthPct: number
  /** 이번 달 자재 공급 수량 합 */
  suppliedUnits: number
  /** 지난달 자재 공급 수량 합 */
  prevSuppliedUnits: number
  /** 이번 달 추가요청 여부 */
  hasAdditionalRequest: boolean
  /** 미수금 */
  outstanding: number
  /** 마지막 배출자 교육 경과 개월 (시연 파생) */
  educationMonthsAgo: number
}

export function clientSignals(data: AppData, client: Client, month = thisMonth()): ClientSignals {
  const t = today()
  const done = clientSchedules(data, client.id)
    .filter((s) => s.status === '완료' && s.actualAmount != null)
    .sort((a, b) => b.date.localeCompare(a.date))

  const lastDate = done[0]?.date ?? null
  const gap = cycleDays(client.collectionCycle)
  const predictedDate = lastDate ? addDays(lastDate, Math.round(gap)) : null
  const dday = predictedDate ? daysBetween(t, predictedDate) : null

  // 배출량 추세 — 최근 14일 합계 vs 직전 14일 합계
  //  (건별 평균은 의료폐기물/기저귀 구성비에 크게 흔들리므로 기간 합계로 비교)
  const w0 = addDays(t, -14)
  const w1 = addDays(t, -28)
  const sumKg = (rows: typeof done) => rows.reduce((s, x) => s + (x.actualAmount ?? 0), 0)
  const recentRows = done.filter((s) => s.date > w0)
  const prevRows = done.filter((s) => s.date > w1 && s.date <= w0)
  const recentKg = sumKg(recentRows)
  const prevKg = sumKg(prevRows)
  const growthPct = prevKg > 0 ? Math.round(((recentKg - prevKg) / prevKg) * 100) : 0
  const recentAvgKg = recentRows.length ? Math.round(recentKg / recentRows.length) : 0

  const mats = clientMaterials(data, client.id)
  const unitsOf = (m: (typeof mats)[number]) => m.boxCount + m.needleBoxCount + Math.round(m.vinylCount / 2)
  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const suppliedUnits = mats.filter((m) => m.date.startsWith(month)).reduce((s, m) => s + unitsOf(m), 0)
  const prevSuppliedUnits = mats.filter((m) => m.date.startsWith(prevMonth)).reduce((s, m) => s + unitsOf(m), 0)
  const hasAdditionalRequest = mats.some((m) => m.isAdditionalRequest && m.date.startsWith(month))

  // 배출자 교육: 법정 주기 2년 — 실제 이력 스키마 도입 전까지 id 기반 결정적 파생값
  const educationMonthsAgo = 6 + (seedOf(client.id) % 22)

  return {
    client,
    doneCount: done.length,
    lastDate,
    predictedDate,
    dday,
    recentKg,
    prevKg,
    recentAvgKg,
    growthPct,
    suppliedUnits,
    prevSuppliedUnits,
    hasAdditionalRequest,
    outstanding: clientOutstanding(data, client.id),
    educationMonthsAgo,
  }
}

// ── 거래처별 다음 행동 추천 ──────────────────────────────────────────────────
/**
 * 축적된 수거·자재·청구 데이터를 규칙에 대입해 다음 행동을 제안합니다.
 * 각 추천은 판단 근거(reason·metrics)를 함께 반환합니다.
 */
export function nextActionsFor(data: AppData, client: Client, month = thisMonth()): NextAction[] {
  const s = clientSignals(data, client, month)
  const price = unitPricePerKg(data, month)
  const out: NextAction[] = []

  // 1) 추가 수거 — 수거량이 늘고 있는데 예상 수거시점이 임박했거나 이미 지난 경우
  //    (현재 수거주기로는 보관기한 내 처리가 빠듯할 가능성)
  const pickupDue = s.dday !== null && s.dday <= 5
  const overdue = s.dday !== null && s.dday <= 0
  if (s.doneCount >= 2 && ((s.growthPct >= 8 && pickupDue) || (overdue && s.growthPct > 0))) {
    const expected = Math.max(s.recentAvgKg, 1)
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '추가수거',
      title: '추가 수거 제안',
      reason: `최근 2주 배출량 ${s.growthPct}% 증가 · 예상 수거시점 ${overdue ? '도래' : `D-${s.dday}`}`,
      cta: '추가 수거 제안',
      priority: 100 + Math.max(0, s.growthPct),
      estValue: expected * price,
      metrics: [
        { label: '최근 2주', value: `${s.recentKg.toLocaleString('ko-KR')}kg` },
        { label: '직전 2주', value: `${s.prevKg.toLocaleString('ko-KR')}kg` },
        { label: '예상 수거일', value: s.predictedDate ?? '—' },
      ],
    })
  }

  // 2) 소모품 공급 — 추가요청이 있었거나, 사용량 증가 / 보관창고 협소
  const supplyGrew = s.prevSuppliedUnits > 0 && s.suppliedUnits > s.prevSuppliedUnits
  if (s.hasAdditionalRequest || supplyGrew || (client.storageSize === '작음' && s.suppliedUnits === 0)) {
    const qty = Math.max(6, Math.round((s.suppliedUnits || 10) * 0.5))
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '소모품공급',
      title: '소모품 공급 제안',
      reason: s.hasAdditionalRequest
        ? '이번 달 자재 추가요청 접수 — 다음 수거 시 동시 공급 권장'
        : supplyGrew
          ? `전용용기 사용량 증가 (전월 ${s.prevSuppliedUnits} → 이번 달 ${s.suppliedUnits})`
          : '보관창고 협소 · 이번 달 공급 이력 없음',
      cta: '소모품 공급 제안',
      priority: s.hasAdditionalRequest ? 90 : 70,
      estValue: qty * SUPPLY_UNIT_PRICE,
      metrics: [
        { label: '이번 달 공급', value: `${s.suppliedUnits}개` },
        { label: '전월 공급', value: `${s.prevSuppliedUnits}개` },
        { label: '보관창고', value: client.storageSize },
      ],
    })
  }

  // 3) 배출자 교육 — 법정 주기(2년) 도래 임박
  if (s.educationMonthsAgo >= 20) {
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '배출자교육',
      title: '배출자 교육 제안',
      reason: `교육 이력 ${s.educationMonthsAgo}개월 경과 — 법정 주기(2년) 도래 임박`,
      cta: '배출자 교육 제안',
      priority: 60,
      estValue: EDUCATION_PRICE,
      metrics: [
        { label: '최근 교육', value: `${s.educationMonthsAgo}개월 전` },
        { label: '법정 주기', value: '2년' },
      ],
    })
  }

  // 4) 관리 필요 — 수거량 급감(누락 가능성) 또는 미수금
  if (s.growthPct <= -25 && s.prevKg > 0) {
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '관리필요',
      title: '배출량 급감 확인',
      reason: `최근 2주 배출량 ${Math.abs(s.growthPct)}% 감소 — 배출 누락·용기 부족 여부 확인 권장`,
      cta: '담당자 확인',
      priority: 80,
      estValue: 0,
      metrics: [
        { label: '최근 2주', value: `${s.recentKg.toLocaleString('ko-KR')}kg` },
        { label: '직전 2주', value: `${s.prevKg.toLocaleString('ko-KR')}kg` },
      ],
    })
  } else if (s.outstanding > 0) {
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '관리필요',
      title: '미수금 확인',
      reason: '입금이 확인되지 않은 청구 건이 있습니다',
      cta: '미수금 확인',
      priority: 40,
      estValue: 0,
      metrics: [{ label: '미수금', value: `${s.outstanding.toLocaleString('ko-KR')}원` }],
    })
  }

  // 5) 위 조건에 해당하지 않으면 정기 수거 일정 안내
  if (out.length === 0 && s.dday !== null) {
    out.push({
      clientId: client.id,
      clientName: client.name,
      kind: '정기수거',
      title: '정기 수거 예정',
      reason: `수거주기 ${client.collectionCycle} 기준 다음 수거 ${s.dday <= 0 ? '도래' : `D-${s.dday}`}`,
      cta: '일정 확인',
      priority: 10,
      estValue: 0,
      metrics: [
        { label: '최근 수거', value: s.lastDate ?? '—' },
        { label: '예상 수거일', value: s.predictedDate ?? '—' },
      ],
    })
  }

  return out.sort((a, b) => b.priority - a.priority)
}

/** 전체 거래처의 추천을 우선순위 순으로 (대시보드용) */
export function allNextActions(data: AppData, month = thisMonth()): NextAction[] {
  return data.clients
    .flatMap((c) => nextActionsFor(data, c, month))
    .sort((a, b) => b.priority - a.priority)
}

// ── 이번 달 추가 매출 기회 ───────────────────────────────────────────────────
export interface OpportunityGroup {
  kind: NextActionKind
  label: string
  count: number
  estValue: number
  actions: NextAction[]
}

export interface OpportunitySummary {
  groups: OpportunityGroup[]
  totalCount: number
  totalValue: number
  /** 매출 기회가 아닌 관리 필요 항목 */
  watchCount: number
}

/**
 * 추천을 매출 기회(추가수거·소모품·교육)와 관리 항목으로 묶어 집계합니다.
 * 금액은 실제 청구 데이터에서 산출한 단가 × 예상 수량으로, 확정 매출이 아닌 '기회' 값입니다.
 */
export function revenueOpportunities(data: AppData, month = thisMonth()): OpportunitySummary {
  const actions = allNextActions(data, month)
  const defs: { kind: NextActionKind; label: string }[] = [
    { kind: '추가수거', label: '추가 수거' },
    { kind: '소모품공급', label: '소모품 공급' },
    { kind: '배출자교육', label: '배출자 교육' },
  ]
  const groups = defs.map(({ kind, label }) => {
    const items = actions.filter((a) => a.kind === kind)
    return {
      kind,
      label,
      count: items.length,
      estValue: items.reduce((s, a) => s + a.estValue, 0),
      actions: items,
    }
  })
  return {
    groups,
    totalCount: groups.reduce((s, g) => s + g.count, 0),
    totalValue: groups.reduce((s, g) => s + g.estValue, 0),
    watchCount: actions.filter((a) => a.kind === '관리필요').length,
  }
}

// ── 병원별 월간 운영 리포트 ──────────────────────────────────────────────────
export interface MonthlyReport {
  client: Client
  month: string
  /** 이번 달 총 수거량 (kg) */
  totalKg: number
  /** 전월 같은 기간(1일~같은 일자) 수거량 — 진행 중인 달을 공정하게 비교하기 위함 */
  prevKg: number
  /** 전월 동기 대비 증감률 (%) */
  changePct: number
  /** 비교 기준이 '전월 동기'인지 (달이 끝나지 않은 경우 true) */
  partialMonth: boolean
  /** 수거 횟수 */
  visits: number
  /** 폐기물 유형별 수거량 */
  byWaste: { type: string; kg: number; count: number }[]
  /** 자재·소모품 공급 내역 */
  supplies: { type: string; count: number }[]
  /** 긴급수거 건수 */
  urgentCount: number
  /** 관리 특이사항 */
  notes: string[]
  /** 배출자 교육 상태 */
  education: { monthsAgo: number; needed: boolean }
  /** 다음 수거 예상일 */
  nextPredicted: string | null
  /** 이 거래처의 다음 행동 추천 */
  actions: NextAction[]
}

export function clientMonthlyReport(data: AppData, client: Client, month = thisMonth()): MonthlyReport {
  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const all = clientSchedules(data, client.id)
  const done = all.filter((s) => s.status === '완료' && s.date.startsWith(month))
  const totalKg = done.reduce((s, x) => s + (x.actualAmount ?? 0), 0)

  // 진행 중인 달을 전월 '전체'와 비교하면 항상 급감으로 보이므로,
  // 이번 달이 아직 끝나지 않았다면 전월 같은 기간(1일~같은 일자)까지만 비교합니다.
  const t = today()
  const isCurrentMonth = t.startsWith(month)
  const dayOfMonth = Number(t.slice(8, 10))
  const lastDayOfPrev = new Date(Number(prevMonth.slice(0, 4)), Number(prevMonth.slice(5, 7)), 0).getDate()
  const cutoffDay = isCurrentMonth ? Math.min(dayOfMonth, lastDayOfPrev) : lastDayOfPrev
  const prevCutoff = `${prevMonth}-${String(cutoffDay).padStart(2, '0')}`
  const prevKg = all
    .filter((s) => s.status === '완료' && s.date.startsWith(prevMonth) && s.date <= prevCutoff)
    .reduce((s, x) => s + (x.actualAmount ?? 0), 0)
  const changePct = prevKg > 0 ? Math.round(((totalKg - prevKg) / prevKg) * 100) : 0

  const wasteTypes = [...new Set(done.map((s) => s.wasteType))]
  const byWaste = wasteTypes.map((type) => {
    const rows = done.filter((s) => s.wasteType === type)
    return { type, kg: rows.reduce((s, x) => s + (x.actualAmount ?? 0), 0), count: rows.length }
  })

  const mats = data.materials.filter((m) => m.clientId === client.id && m.date.startsWith(month))
  const supplies = [
    { type: '골판지 전용박스', count: mats.reduce((s, m) => s + m.boxCount, 0) },
    { type: '전용 봉투(비닐)', count: mats.reduce((s, m) => s + m.vinylCount, 0) },
    { type: '합성수지 바늘통', count: mats.reduce((s, m) => s + m.needleBoxCount, 0) },
  ].filter((x) => x.count > 0)

  const urgentCount = all.filter((s) => s.date.startsWith(month) && s.status === '긴급').length

  const signals = clientSignals(data, client, month)
  const notes: string[] = []
  if (urgentCount > 0) notes.push(`긴급수거 ${urgentCount}건 대응 완료`)
  if (mats.some((m) => m.isAdditionalRequest)) notes.push('자재 추가요청 접수 및 공급 완료')
  const cmpLabel = isCurrentMonth ? '전월 동기 대비' : '전월 대비'
  if (changePct >= 15) notes.push(`${cmpLabel} 배출량 ${changePct}% 증가 — 수거주기 조정 검토 권장`)
  if (changePct <= -15) notes.push(`${cmpLabel} 배출량 ${Math.abs(changePct)}% 감소 — 배출 현황 확인 권장`)
  if (signals.outstanding > 0) notes.push('미입금 청구 건 확인 필요')
  if (notes.length === 0) notes.push('특이사항 없이 정상 운영되었습니다')

  return {
    client,
    month,
    totalKg,
    prevKg,
    changePct,
    partialMonth: isCurrentMonth,
    visits: done.length,
    byWaste,
    supplies,
    urgentCount,
    notes,
    education: { monthsAgo: signals.educationMonthsAgo, needed: signals.educationMonthsAgo >= 20 },
    nextPredicted: signals.predictedDate,
    actions: nextActionsFor(data, client, month),
  }
}
