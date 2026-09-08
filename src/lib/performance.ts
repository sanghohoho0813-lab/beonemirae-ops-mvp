import type { AppData, BaselineMetrics, CollectionEvent } from '../types'
import { INPUT_SESSION_MAX_MS, INPUT_SESSION_MIN_MS } from '../types'
import { today } from './format'
import {
  BREADTH_RULE,
  breadthCheck,
  daysInclusive,
  evidenceSample,
  localDateOf,
  type EvidenceBreadth,
} from './evidenceBase'
import { confoundingIn, type Confounding, type OpsChange } from './opsChanges'
import { summarizeExcelChecks, type ExcelCheck, type ExcelSummary, EXCEL_MIN_DAYS } from './excelCheck'

// ─────────────────────────────────────────────────────────────────────────────
// AX 도입 성과 측정 (1단계 실증)
//
//  목적: "도입 전보다 업무 효율이 실제로 얼마나 좋아졌는가"를 근거 있는 숫자로
//        제시하기 위한 계산 레이어입니다.
//
//  원칙
//   1) 도입 전 값(before)은 사용자가 입력한 baseline 만 사용합니다. 없으면 null.
//   2) 도입 후 값(after)은 실제 수거 입력 이벤트(CollectionEvent)에서만 산출합니다.
//   3) 표본이 부족하면 개선율을 만들어내지 않고 'measuring'(측정 중) 으로 둡니다.
//   4) 모든 지표는 출처(조사 응답 / 추정 / 시스템 측정 / 파생 / 증빙 대조)를 함께 반환합니다.
//
//  ── 0106 에서 바로잡은 것 ────────────────────────────────────────────────
//   A. **서로 다른 범위를 견주지 않습니다.** 도입 전 「배차·일정·엑셀 정리
//      전체 사무시간 ÷ 방문 수」와 도입 후 「입력 화면 진입 → 저장」은 다른
//      일입니다. 입력 소요시간은 입력 소요시간으로만 보여 주고(비교 기준
//      없음), 사무업무 시간은 도입 후 **같은 범위 조사값**이 들어와야 견줍니다.
//   B. 「반복 입력 1회」는 시스템 안의 구조값입니다. 엑셀·카톡까지 포함한
//      실제 재입력은 하루 한 줄 확인(lib/excelCheck.ts)이 쌓여야 셉니다.
//   C. 표본 분류는 lib/evidenceBase.ts 한 곳입니다. 준비도·성과·인쇄가 같이 씁니다.
//   D. 30건은 내부 표시 기준입니다. 운영 기간·참여 병원·기사·커버리지·누락률을
//      함께 내고, 그것들이 기준을 넘어야 「대표 성과값」이라 부릅니다.
//   F. 지표 이름을 계산 대상에 맞췄습니다 — 「누락·재확인 건수」가 아니라
//      「완료 취소 후 재입력 건수」입니다.
//   ⑤ 비교 구간에 차량·인력·거점·계약·단가 변화가 겹치면 「AX 단독 효과
//      분리 불가 · 복합 개선」을 붙입니다 (lib/opsChanges.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** 지표 값의 출처 — 업무조사 응답 · 추정 · 시스템 자동 측정 · 증빙 대조를 가릅니다 */
export type MetricSource = 'survey' | 'estimate' | 'demo' | 'measured' | 'derived' | 'verified' | 'none'

export const SOURCE_LABEL: Record<MetricSource, string> = {
  survey: '업무 조사 응답',
  estimate: '직접 입력 (추정)',
  demo: '시연용 예시값',
  measured: '시스템 자동 측정',
  derived: '파생 계산',
  verified: '증빙 대조',
  none: '값 없음',
}

/** 지표 상태 — 가짜 개선율을 만들지 않기 위한 구분 */
export type MetricStatus =
  | 'ok' // 같은 범위의 기준값 + 측정값 모두 확보 → 개선율 산출
  | 'need-baseline' // 도입 전 기준값 미입력
  | 'measuring' // 측정 중 (표본·응답 부족, 또는 도입 후 조사 미실시)
  | 'not-measured' // 이 단계에서 자동 측정 항목이 없음
  | 'no-comparable' // 측정값은 있으나 같은 범위의 비교 기준이 없어 개선율을 보류

export const STATUS_LABEL: Record<MetricStatus, string> = {
  ok: '측정 완료',
  'need-baseline': '기준값 입력 필요',
  measuring: '측정 중',
  'not-measured': '자동 측정 항목 없음',
  'no-comparable': '측정값만 (비교 기준 없음)',
}

export interface MetricRow {
  key: string
  label: string
  unit: string
  before: number | null
  after: number | null
  /** 낮을수록 좋은 지표인지 (처리량은 higher) */
  betterWhen: 'lower' | 'higher'
  status: MetricStatus
  /** 개선율(%) — status==='ok' 일 때만 값이 있습니다. */
  changePct: number | null
  beforeSource: MetricSource
  afterSource: MetricSource | null
  /** 심사자가 숫자의 근거를 이해할 수 있도록 하는 측정 기준 설명 */
  basis: string
  /** 표본 수 등 부가 설명 (없으면 빈 문자열) */
  note: string
  /** 이 지표 산출에 쓰인 '실제 현장' 표본 수 (시연 세션 기록 제외) */
  fieldSamples: number
  /** 실제 현장 표본 수에 따른 실증 단계 (내부 표시 기준) */
  tier: EvidenceTier
  /** 개선율을 크게 강조해도 되는지 — 현장 표본·폭이 내부 기준을 넘고 복합 개선이 아닐 때만 */
  emphasis: boolean
  /** 이 지표가 사용한 데이터 출처 (시연 / 실제 현장 / 혼합) */
  provenance: ProvenanceKind
  /** 비교 구간에 차량·인력·거점 변화가 겹쳐 AX 단독 효과를 가를 수 없음 */
  confounded: boolean
}

/** 1회 입력으로 자동 반영된 업무 건수 */
export interface AutoLinkBreakdown {
  schedule: number
  history: number
  clientActivity: number
  material: number
  stock: number
  request: number
  stats: number
  document: number
  total: number
}

export const AUTO_LINK_LABEL: Record<Exclude<keyof AutoLinkBreakdown, 'total'>, string> = {
  schedule: '일정 반영',
  history: '수거이력 생성',
  clientActivity: '거래처 활동 반영',
  material: '자재 공급 반영',
  stock: '재고 차감',
  request: '병원 요청 자동 종료',
  stats: '통계·KPI 반영',
  document: '수거대장·명세 초안',
}

/** 입력 처리시간 집계 결과 (시스템 측정값) */
export interface InputDurationStat {
  samples: number
  excluded: number
  medianMin: number | null
  avgMin: number | null
}

export interface PeriodRange {
  from: string
  to: string
  label: string
  days: number
}

/** 도입 후 **같은 범위** 조사값 — 판 106 의 performance_baselines.after_* */
export interface AfterSurvey {
  adminMinutesPerCollection: number | null
  monthlyDocHours: number | null
  surveyedOn: string | null
  source: 'survey' | 'estimate' | null
  note: string
}

/** 계산에 같이 넣을 수 있는 것 — 화면이 읽어 온 만큼만 넘깁니다 */
export interface PerformanceExtras {
  /** 엑셀 병행 확인 응답 (관리자만 읽을 수 있습니다) */
  excelChecks?: ExcelCheck[]
  /** 운영 변화 기록. undefined = 표가 없어 모름, [] = 기록 없음 */
  changes?: OpsChange[]
  /** 도입 후 같은 범위 조사값 */
  afterSurvey?: AfterSurvey | null
}

export interface PerformanceSummary {
  period: PeriodRange
  experimentStart: string | null
  experimentDay: number | null
  /** 집계 대상 이벤트 (기간 내 · 실증 시작 이후 · 취소되지 않은 수거 완료 · 시연 포함) */
  events: CollectionEvent[]
  /** 위 이벤트 중 시연 세션이 아닌 '실제 현장' 기록만 */
  fieldEvents: CollectionEvent[]
  /** 기간 내 취소(재입력) 건수 */
  revertedCount: number
  /** 실증 시작일 이전에 넣은 연습 입력 건수 (세지 않습니다) */
  practiceCount: number
  collectionCount: number
  fieldCount: number
  demoCount: number
  tier: EvidenceTier
  activeDays: number
  autoLink: AutoLinkBreakdown
  duration: InputDurationStat
  fieldDuration: InputDurationStat
  metrics: MetricRow[]
  /** 개선율이 나온 지표 수 / 전체 · 측정값이라도 있는 지표 수 */
  ready: { confirmed: number; measured: number; total: number }
  emphasized: number
  /** 표본의 폭 — 건수만으로 실증 완료를 말하지 않기 위한 것 */
  breadth: EvidenceBreadth
  breadthOk: boolean
  breadthGaps: string[]
  /** 비교 구간의 복합 개선 여부 */
  confounding: Confounding
  /** 엑셀 병행 확인 요약 (응답을 못 읽었으면 null) */
  excel: ExcelSummary | null
  afterSurvey: AfterSurvey | null
}

// ── 날짜 유틸 (로컬 기준, YYYY-MM-DD 문자열 비교) ────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + delta)
  return toDateStr(dt)
}

/** 두 날짜 사이의 일수 (양끝 포함) */
export function daysBetween(from: string, to: string): number {
  return daysInclusive(from, to)
}

export type PeriodPreset = 'last7' | 'thisMonth' | 'all' | 'custom'

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'last7', label: '최근 7일' },
  { value: 'thisMonth', label: '이번 달' },
  { value: 'all', label: '실증 전체' },
  { value: 'custom', label: '기간 지정' },
]

/** 프리셋 → 실제 기간. 'all' 은 실증 시작일부터 오늘까지(미설정이면 최근 90일). */
export function resolvePeriod(
  preset: PeriodPreset,
  experimentStart: string | null,
  custom?: { from: string; to: string },
): PeriodRange {
  const t = today()
  if (preset === 'custom' && custom?.from && custom?.to) {
    const from = custom.from <= custom.to ? custom.from : custom.to
    const to = custom.from <= custom.to ? custom.to : custom.from
    return { from, to, label: `${from} ~ ${to}`, days: daysBetween(from, to) }
  }
  if (preset === 'last7') {
    const from = addDays(t, -6)
    return { from, to: t, label: '최근 7일', days: 7 }
  }
  if (preset === 'thisMonth') {
    const from = `${t.slice(0, 7)}-01`
    return { from, to: t, label: '이번 달', days: daysBetween(from, t) }
  }
  const from = experimentStart ?? addDays(t, -89)
  return {
    from,
    to: t,
    label: experimentStart ? '실증 전체' : '최근 90일',
    days: daysBetween(from, t),
  }
}

// ── 자동 연결 건수 ───────────────────────────────────────────────────────────
/**
 * 수거 입력 1건이 자동으로 처리한 업무 건수를 이벤트 기록에서 그대로 셉니다.
 * (추정치가 아니라, 실제로 그 입력이 바꾼 대상만 셉니다.)
 */
export function autoLinkOf(events: CollectionEvent[]): AutoLinkBreakdown {
  const b: AutoLinkBreakdown = {
    schedule: 0, history: 0, clientActivity: 0, material: 0, stock: 0, request: 0, stats: 0, document: 0, total: 0,
  }
  for (const e of events) {
    b.schedule += 1
    b.history += 1
    b.clientActivity += 1
    b.stats += 1
    b.document += 1
    if (e.materialIds.length > 0) {
      b.material += e.materialIds.length
      b.stock += 1
    }
    b.request += e.requestUpdates.length
  }
  b.total = b.schedule + b.history + b.clientActivity + b.material + b.stock + b.request + b.stats + b.document
  return b
}

// ── 입력 처리시간 (시스템 측정값) ────────────────────────────────────────────
export function durationStat(events: CollectionEvent[]): InputDurationStat {
  const all = events.map((e) => e.inputDurationMs).filter((v): v is number => typeof v === 'number' && v > 0)
  const kept = all.filter((v) => v >= INPUT_SESSION_MIN_MS && v <= INPUT_SESSION_MAX_MS)
  if (kept.length === 0) {
    return { samples: 0, excluded: all.length, medianMin: null, avgMin: null }
  }
  const mins = kept.map((v) => v / 60000).sort((a, b) => a - b)
  const mid = Math.floor(mins.length / 2)
  const median = mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
  const avg = mins.reduce((s, v) => s + v, 0) / mins.length
  return {
    samples: kept.length,
    excluded: all.length - kept.length,
    medianMin: Math.round(median * 10) / 10,
    avgMin: Math.round(avg * 10) / 10,
  }
}

/** 개선율(%) — betterWhen 에 따라 부호를 맞춥니다. 항상 "좋아진 정도"가 양수. */
function improvement(before: number, after: number, betterWhen: 'lower' | 'higher'): number | null {
  if (!Number.isFinite(before) || before === 0) return null
  const raw = betterWhen === 'lower' ? ((before - after) / before) * 100 : ((after - before) / before) * 100
  return Math.round(raw * 10) / 10
}

/**
 * 표본이 이 수 이상일 때 측정값을 냅니다.
 *  0107 — 3 이었던 것을 1 로. 실제로 잰 값은 표본이 작아도 「초기 측정」으로 보여 주고,
 *  표본 수를 옆에 적습니다. 임의의 건수 기준으로 숫자를 감추지 않습니다.
 */
export const MIN_SAMPLES = 1
/** 취소 후 재입력 건수는 단기 표본에서 '0건' 이 과장되기 쉬워 더 많은 표본을 요구합니다. */
export const MIN_REWORK_EVENTS = 10
/** 하루 처리 건수를 회사 값으로 보려면 완료 일정의 이만큼이 시스템 입력이어야 합니다 */
export const MIN_COVERAGE_PCT = BREADTH_RULE.coveragePct

// ── 실증 단계 (실제 현장 표본 수 기준 · 내부 표시 기준) ─────────────────────
// 계산이 가능하다는 것과, 그 숫자를 대표 성과값으로 내세워도 된다는 것은 다릅니다.
// ⚠ 아래 건수는 **내부 표시 기준**입니다. 신보 공식 기준이나 통계적 대표성을
//   보장하는 숫자가 아닙니다. 그래서 건수만으로 마지막 단계에 올려 두지 않고
//   폭(breadth)까지 넘어야 「대표 성과값」이라 부릅니다.

export const TIER_ACCUMULATING = 10
export const TIER_FIELD = 30

export type EvidenceTier = 'none' | 'initial' | 'accumulating' | 'field'

export const TIER_LABEL: Record<EvidenceTier, string> = {
  none: '현장 데이터 없음',
  initial: '초기 실증',
  accumulating: '실증 데이터 축적 중',
  field: `현장 ${TIER_FIELD}건 이상 (내부 기준)`,
}

export const TIER_DESC: Record<EvidenceTier, string> = {
  none: '실제 현장 입력 기록이 아직 없습니다',
  initial: `현장 사용 초기 단계입니다. 숫자는 참고값이며 현장 ${TIER_ACCUMULATING}건 이상부터 측정값으로 봅니다`,
  accumulating: `표본을 모으는 중입니다. 현장 ${TIER_FIELD}건 이상이고 기간·병원·기사·커버리지 조건을 넘으면 대표 성과값으로 제시합니다`,
  field: `현장 ${TIER_FIELD}건을 넘었습니다 (내부 표시 기준). 기간·병원·기사·커버리지까지 넘어야 대표 성과값입니다`,
}

export const TIER_STEPS: { tier: EvidenceTier; range: string }[] = [
  { tier: 'none', range: '0건' },
  { tier: 'initial', range: `1~${TIER_ACCUMULATING - 1}건` },
  { tier: 'accumulating', range: `${TIER_ACCUMULATING}~${TIER_FIELD - 1}건` },
  { tier: 'field', range: `${TIER_FIELD}건 이상` },
]

export function evidenceTierOf(fieldSamples: number): EvidenceTier {
  if (fieldSamples <= 0) return 'none'
  if (fieldSamples < TIER_ACCUMULATING) return 'initial'
  if (fieldSamples < TIER_FIELD) return 'accumulating'
  return 'field'
}

/** 다음 단계까지 남은 실제 현장 표본 수 (최종 단계면 null) */
export function tierProgress(fieldSamples: number): {
  tier: EvidenceTier
  label: string
  desc: string
  nextAt: number | null
  remaining: number | null
} {
  const tier = evidenceTierOf(fieldSamples)
  const nextAt = tier === 'none' ? 1 : tier === 'initial' ? TIER_ACCUMULATING : tier === 'accumulating' ? TIER_FIELD : null
  return {
    tier,
    label: TIER_LABEL[tier],
    desc: TIER_DESC[tier],
    nextAt,
    remaining: nextAt == null ? null : Math.max(0, nextAt - fieldSamples),
  }
}

/** 실제 현장 / 시연 건수 조합 → 출처 구분 */
function provenanceKind(field: number, demo: number): ProvenanceKind {
  if (field + demo === 0) return 'none'
  if (field === 0) return 'demo'
  if (demo === 0) return 'field'
  return 'mixed'
}

/** 기준값의 출처 → 지표 출처 */
function baselineSource(b: BaselineMetrics): MetricSource {
  if (b.source === 'survey') return 'survey'
  if (b.source === 'demo') return 'demo'
  return 'estimate'
}

// ── 지표 ─────────────────────────────────────────────────────────────────────
interface BuildInput {
  baseline: BaselineMetrics
  period: PeriodRange
  events: CollectionEvent[]
  revertedCount: number
  activeDays: number
  duration: InputDurationStat
  autoLink: AutoLinkBreakdown
  fieldCount: number
  demoCount: number
  fieldDuration: InputDurationStat
  breadth: EvidenceBreadth
  breadthOk: boolean
  confounded: boolean
  excel: ExcelSummary | null
  afterSurvey: AfterSurvey | null
}

function buildMetrics(i: BuildInput): MetricRow[] {
  const { baseline, events, revertedCount, activeDays, duration, autoLink, fieldCount, demoCount, fieldDuration, breadth, breadthOk, confounded, excel, afterSurvey } = i
  const rows: MetricRow[] = []
  const bSrc = baselineSource(baseline)

  type Input = Omit<MetricRow, 'changePct' | 'status' | 'tier' | 'emphasis' | 'provenance' | 'confounded'> & {
    status?: MetricStatus
    demoSamples?: number
    /** 비교가 뜻이 있는 지표인가 (복합 개선 표시는 비교 지표에만) */
    comparable?: boolean
  }

  const push = ({ demoSamples, comparable = true, ...r }: Input) => {
    let status: MetricStatus = r.status ?? 'ok'
    let changePct: number | null = null
    if (status === 'ok') {
      if (r.before == null && r.after == null) status = 'measuring'
      else if (r.before == null) status = 'no-comparable'
      else if (r.after == null) status = 'measuring'
      else {
        changePct = improvement(r.before, r.after, r.betterWhen)
        status = changePct == null ? 'measuring' : 'ok'
      }
    }
    const tier = evidenceTierOf(r.fieldSamples)
    const provenance = provenanceKind(r.fieldSamples, demoSamples ?? demoCount)
    const isConfounded = comparable && status === 'ok' && confounded
    rows.push({
      ...r,
      status,
      changePct,
      tier,
      provenance,
      confounded: isConfounded,
      //  「대표 성과값」의 조건 — 전부 만족할 때뿐입니다.
      //   1) 같은 범위의 기준값과 측정값으로 개선율이 나왔다
      //   2) 실제 현장 표본이 내부 기준(TIER_FIELD) 이상이고 시연 기록이 섞이지 않았다
      //   3) 운영 기간·병원·기사·커버리지 폭이 내부 기준을 넘었다
      //   4) 비교 구간에 차량·인력·거점 변화가 겹치지 않았다
      emphasis: status === 'ok' && tier === 'field' && provenance === 'field' && breadthOk && !isConfounded,
    })
  }

  // 1) 수거 1건 입력 소요시간 — 측정값만. 도입 전 사무시간과 범위가 달라 개선율을 내지 않습니다.
  push({
    key: 'inputTime',
    label: '수거 1건 입력 소요시간',
    unit: '분',
    before: null,
    after: duration.samples >= MIN_SAMPLES ? duration.medianMin : null,
    betterWhen: 'lower',
    beforeSource: 'none',
    afterSource: 'measured',
    comparable: false,
    fieldSamples: fieldDuration.samples,
    demoSamples: duration.samples - fieldDuration.samples,
    basis:
      '수거 입력 화면 진입 → 저장 완료의 실제 경과시간(중앙값). 20초 미만(오조작·테스트)과 30분 초과(화면 방치)는 제외. ' +
      '⚠ 도입 전 「수거 1건 사무업무 시간」(배차·일정·엑셀 정리 전체)과 범위가 달라 개선율을 내지 않습니다 — 입력 소요시간은 입력 소요시간입니다.',
    note:
      duration.samples > 0
        ? `측정 표본 ${duration.samples}건 (실제 현장 ${fieldDuration.samples}건)${duration.excluded ? ` · 이상치 ${duration.excluded}건 제외` : ''}${duration.samples < MIN_SAMPLES ? ` · ${MIN_SAMPLES}건 이상부터 산출` : ''}`
        : `아직 측정된 입력이 없습니다 (최소 ${MIN_SAMPLES}건 필요)`,
  })

  // 2) 수거 1건 사무업무 시간 — 같은 범위(배차·일정·엑셀 정리)로 도입 후에 다시 조사한 값과만 견줍니다.
  //    ⚠ 0107 — 출처가 추정(직접 입력)이면 값은 보존하되 **실측 비교에서 뺍니다.** 추정끼리 견준
  //      0% 는 측정이 아닙니다.
  const afterIsEstimate = afterSurvey?.source === 'estimate'
  const afterAdmin = afterIsEstimate ? null : afterSurvey?.adminMinutesPerCollection ?? null
  push({
    key: 'adminTime',
    label: '수거 1건 사무업무 시간 (같은 범위)',
    unit: '분',
    before: baseline.adminMinutesPerCollection,
    after: afterAdmin,
    betterWhen: 'lower',
    beforeSource: bSrc,
    afterSource: afterAdmin == null ? null : 'survey',
    fieldSamples: fieldCount,
    basis:
      '도입 전: 하루 사무시간(배차 일정관리 · 수거 일정관리 · 수거내역·거래명세서 엑셀 정리) ÷ 하루 방문 수. ' +
      '도입 후: **같은 세 가지 일**을 같은 방법으로 다시 조사한 값. 입력 화면 시간으로 대신하지 않습니다.',
    note:
      afterAdmin == null
        ? afterIsEstimate && afterSurvey?.adminMinutesPerCollection != null
          ? `도입 후 값 ${afterSurvey.adminMinutesPerCollection}분은 추정(직접 입력)이라 실측 비교에서 제외했습니다 — 이사님 같은 범위 조사가 들어오면 견줍니다.`
          : '도입 후 같은 범위 조사가 아직 없습니다 — 설정 → 「도입 후 같은 범위 조사값」에 넣으면 여기서 견줍니다.'
        : `도입 후 조사 ${afterSurvey?.surveyedOn ?? '(날짜 미기재)'} · 출처 업무 조사 응답`,
  })

  // 3) 같은 정보를 다시 적는 횟수 — 시스템 안 1회는 구조값. 엑셀·카톡 재입력은 확인 응답으로만 셉니다.
  const excelAfter = excel && excel.enough && fieldCount > 0 ? Math.round((1 + excel.reentries / fieldCount) * 100) / 100 : null
  push({
    key: 'repeatEntry',
    label: '같은 정보를 다시 적는 횟수 (엑셀·카톡 포함)',
    unit: '회',
    before: baseline.repeatEntriesPerCollection,
    after: excelAfter,
    betterWhen: 'lower',
    beforeSource: bSrc,
    afterSource: excelAfter == null ? null : 'measured',
    fieldSamples: fieldCount,
    basis:
      '시스템 안에서는 1회 입력으로 일정·이력·거래처·자재·통계·문서 초안에 반영됩니다 — 이것은 구조이지 측정이 아닙니다. ' +
      `도입 후 값 = 1 + (기간 안 「엑셀·카톡에 다시 적었다」고 답한 건수 ÷ 현장 수거 입력 건수). 응답한 날이 ${EXCEL_MIN_DAYS}일 이상일 때만 냅니다.`,
    note:
      excel == null
        ? '외부(엑셀·카톡) 재입력 확인 응답을 읽지 못했습니다 (관리자 계정에서만 읽습니다).'
        : excel.respondedDays === 0
          ? '외부 재입력 여부가 아직 확인되지 않았습니다 — 첫 화면 「오늘 엑셀에 다시 적은 것」에 답이 쌓이면 셉니다.'
          : `응답 ${excel.respondedDays}일 · 다시 적은 날 ${excel.daysWithReentry}일 · ${excel.reentries}건${excel.reasons.length ? ` · 이유: ${excel.reasons.slice(0, 3).map((r) => r.text).join(', ')}` : ''}${excel.enough ? '' : ` · ${EXCEL_MIN_DAYS}일 이상부터 산출`}`,
  })

  // 4) 월간 문서·정산 정리 시간 — 자동 측정 항목이 없습니다. 같은 범위 조사값이 있을 때만 견줍니다.
  const afterDoc = afterIsEstimate ? null : afterSurvey?.monthlyDocHours ?? null
  push({
    key: 'docHours',
    label: '월간 문서·정산 정리 시간 (같은 범위)',
    unit: '시간',
    before: baseline.monthlyDocHours,
    after: afterDoc,
    betterWhen: 'lower',
    beforeSource: bSrc,
    afterSource: afterDoc == null ? null : 'survey',
    status: afterDoc == null && baseline.monthlyDocHours != null ? 'not-measured' : undefined,
    fieldSamples: fieldCount,
    basis: '수거대장·명세·정산 정리 시간은 자동 측정 항목이 없습니다. 도입 후 같은 범위 조사값이 들어오면 견줍니다. 문서 초안 자동 생성 건수는 참고값입니다.',
    note: `기간 내 자동 생성된 문서 초안 ${autoLink.document}건${afterDoc != null ? ` · 도입 후 조사 ${afterSurvey?.surveyedOn ?? ''}` : ''}`,
  })

  // 5) 완료 취소 후 재입력 건수 — 측정값만. 도입 전 「누락·재확인 건수」와 뜻이 달라 견주지 않습니다.
  const enoughRework = events.length + revertedCount >= MIN_REWORK_EVENTS
  push({
    key: 'rework',
    label: '완료 취소 후 재입력 건수',
    unit: '건',
    before: null,
    after: enoughRework ? revertedCount : null,
    betterWhen: 'lower',
    beforeSource: 'none',
    afterSource: 'measured',
    comparable: false,
    fieldSamples: fieldCount,
    basis:
      "기간 내 '완료 취소 후 재입력' 이벤트 수를 실측합니다. ⚠ 도입 전 기준값 「월 누락·재확인 건수」는 전화 재확인·빠뜨린 기록까지 포함한 다른 범위라 개선율을 내지 않습니다.",
    note: !enoughRework
      ? `수거 입력 ${MIN_REWORK_EVENTS}건 이상부터 산출 (현재 ${events.length + revertedCount}건)`
      : baseline.monthlyReworkCount == null
        ? `기간 내 취소 후 재입력 ${revertedCount}건`
        : `기간 내 취소 후 재입력 ${revertedCount}건 · 참고: 도입 전 월 누락·재확인 ${baseline.monthlyReworkCount}건 (다른 범위, 견주지 않음)`,
  })

  // 6) 하루 처리 건수 — 회사 전체 값입니다. 완료 일정의 대부분이 시스템 입력일 때만 견줍니다.
  const coverageOk = breadth.coverage.pct != null && breadth.coverage.pct >= MIN_COVERAGE_PCT
  const dailyAfter = activeDays >= 2 && coverageOk ? Math.round((events.length / activeDays) * 10) / 10 : null
  push({
    key: 'dailyCount',
    label: '하루 처리 건수 (회사 전체)',
    unit: '건',
    before: baseline.dailyCapacity,
    after: dailyAfter,
    betterWhen: 'higher',
    beforeSource: bSrc,
    afterSource: dailyAfter == null ? null : 'measured',
    fieldSamples: fieldCount,
    basis:
      `기간 내 수거 입력 건수 ÷ 입력이 발생한 일수. 도입 전 값이 회사 전체 방문 수라, 완료 일정 중 시스템 입력 비율(커버리지)이 ${MIN_COVERAGE_PCT}% 이상이고 이틀 이상 기록이 있어야 냅니다 — 한 사람만 쓰는 동안의 값은 회사 값이 아닙니다.`,
    note:
      activeDays === 0
        ? '입력 발생일 없음'
        : `입력 발생일 ${activeDays}일 · 완료 ${events.length}건 (실제 현장 ${fieldCount}건) · 커버리지 ${breadth.coverage.pct == null ? '—' : `${breadth.coverage.pct}%`}${!coverageOk ? ` (${MIN_COVERAGE_PCT}% 이상부터 산출)` : ''}`,
  })

  return rows
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
export function performanceSummary(
  data: AppData,
  preset: PeriodPreset,
  custom?: { from: string; to: string },
  extras: PerformanceExtras = {},
): PerformanceSummary {
  const baseline = data.baseline
  const experimentStart = data.experiment?.startDate ?? null
  const period = resolvePeriod(preset, experimentStart, custom)

  //  실증 시작일 이후 & 기간 내만 (시작일 미설정이면 기간 조건만). 분류는 evidenceBase 한 곳.
  const lower = experimentStart && experimentStart > period.from ? experimentStart : period.from
  const sample = evidenceSample(data, { from: lower, to: period.to })
  const fieldEvents = sample.field
  const events = [...fieldEvents, ...sample.demo].sort((a, b) => a.at.localeCompare(b.at))
  const revertedCount = sample.reverted.length
  const activeDays = new Set(events.map((e) => localDateOf(e.at))).size
  const fieldCount = fieldEvents.length
  const demoCount = sample.demo.length

  const autoLink = autoLinkOf(events)
  const duration = durationStat(events)
  const fieldDuration = durationStat(fieldEvents)
  const breadth = sample.breadth
  const bc = breadthCheck(fieldCount, breadth)
  const confounding = confoundingIn(extras.changes, lower, period.to)
  const excel = extras.excelChecks ? summarizeExcelChecks(extras.excelChecks, lower, period.to) : null
  const afterSurvey = extras.afterSurvey ?? null

  const metrics = buildMetrics({
    baseline, period, events, revertedCount, activeDays, duration, autoLink, fieldCount, demoCount, fieldDuration,
    breadth, breadthOk: bc.ok, confounded: confounding.overlapping.length > 0, excel, afterSurvey,
  })

  return {
    period,
    experimentStart,
    experimentDay: experimentStart ? daysBetween(experimentStart, today()) : null,
    events,
    fieldEvents,
    revertedCount,
    practiceCount: sample.practice.length,
    collectionCount: events.length,
    fieldCount,
    demoCount,
    tier: evidenceTierOf(fieldCount),
    activeDays,
    autoLink,
    duration,
    fieldDuration,
    metrics,
    ready: {
      confirmed: metrics.filter((m) => m.status === 'ok').length,
      measured: metrics.filter((m) => m.after != null).length,
      total: metrics.length,
    },
    emphasized: metrics.filter((m) => m.emphasis).length,
    breadth,
    breadthOk: bc.ok,
    breadthGaps: bc.gaps,
    confounding,
    excel,
    afterSurvey,
  }
}

// ── 데이터 출처 구분 (실제 현장 / 시연) ─────────────────────────────────────
export type ProvenanceKind = 'none' | 'demo' | 'mixed' | 'field'

export interface Provenance {
  kind: ProvenanceKind
  label: string
  fieldEvents: number
  demoEvents: number
  fieldLeads: number
  demoLeads: number
}

export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  none: '데이터 없음',
  demo: '시연 데이터',
  mixed: '시연 + 실제 현장 데이터',
  field: '실제 현장 데이터',
}

export function provenanceOf(data: AppData, events?: CollectionEvent[]): Provenance {
  const evs = events ?? (() => { const s = evidenceSample(data); return [...s.field, ...s.demo] })()
  const leads = data.leads ?? []
  const fieldEvents = evs.filter((e) => !e.demoSessionId).length
  const demoEvents = evs.length - fieldEvents
  const fieldLeads = leads.filter((l) => !l.demoSessionId).length
  const demoLeads = leads.length - fieldLeads
  const kind = provenanceKind(fieldEvents + fieldLeads, demoEvents + demoLeads)
  return { kind, label: PROVENANCE_LABEL[kind], fieldEvents, demoEvents, fieldLeads, demoLeads }
}

// ── 대시보드 상단 요약용 대표 지표 ──────────────────────────────────────────
export interface AxHighlight {
  key: string
  label: string
  before: string
  after: string
  measuring: boolean
  changeText: string
  emphasis: boolean
  tier: EvidenceTier
  provenance: ProvenanceKind
  fieldSamples: number
}

/** 개선율 문구 — '96.7% 단축' 처럼 방향까지 붙여 반환합니다. */
function changeLabel(m: MetricRow): string {
  if (m.changePct == null) return ''
  const dir =
    m.changePct > 0 ? (m.betterWhen === 'lower' ? '단축' : '증가') : m.betterWhen === 'lower' ? '증가' : '감소'
  return `${Math.abs(m.changePct)}% ${dir}`
}

/**
 * 심사자에게 5초 안에 보여줄 운영효율 대표 지표 (최대 3개).
 *  측정값만 있는 지표(비교 기준 없음)는 개선율 없이 측정값을 그대로 보여 줍니다.
 */
export function axHighlights(data: AppData, extras: PerformanceExtras = {}): AxHighlight[] {
  const s = performanceSummary(data, 'all', undefined, extras)
  const pick = ['inputTime', 'dailyCount', 'repeatEntry']
  const rows: AxHighlight[] = pick
    .map((k) => s.metrics.find((m) => m.key === k))
    .filter((m): m is MetricRow => !!m)
    .map((m) => ({
      key: m.key,
      label: m.label,
      before: m.before == null ? '—' : `${m.before}${m.unit}`,
      after: m.after == null ? '측정 중' : `${m.after}${m.unit}`,
      measuring: m.status !== 'ok' && m.status !== 'no-comparable',
      emphasis: m.emphasis,
      tier: m.tier,
      provenance: m.provenance,
      fieldSamples: m.fieldSamples,
      changeText:
        m.status === 'ok'
          ? m.confounded
            ? `${changeLabel(m)} · 복합 개선 (AX 단독 효과 분리 불가)`
            : m.emphasis
              ? changeLabel(m)
              : `${changeLabel(m)} · ${m.provenance === 'demo' ? '시연 데이터 기준' : TIER_LABEL[m.tier]}`
          : m.status === 'no-comparable'
            ? '측정값만 · 비교 기준 없음'
            : m.status === 'need-baseline'
              ? '기준값 입력 필요'
              : '실증 중',
    }))
  return rows
    .sort((a, b) => Number(b.emphasis) - Number(a.emphasis) || Number(a.measuring) - Number(b.measuring))
    .slice(0, 3)
}

/** 수거 1건 입력이 자동으로 처리한 후속업무 평균 건수 (실측) */
export function autoPerInput(data: AppData): {
  count: number
  total: number
  avg: number | null
  fieldCount: number
  demoCount: number
  provenance: ProvenanceKind
} {
  const s = performanceSummary(data, 'all')
  return {
    count: s.collectionCount,
    total: s.autoLink.total,
    avg: s.collectionCount > 0 ? Math.round((s.autoLink.total / s.collectionCount) * 10) / 10 : null,
    fieldCount: s.fieldCount,
    demoCount: s.demoCount,
    provenance: provenanceKind(s.fieldCount, s.demoCount),
  }
}

/** 대시보드·성과 페이지가 공유하는 실증 단계 요약 (실제 현장 수거 입력 기준) */
export function evidenceStatus(data: AppData) {
  const s = performanceSummary(data, 'all')
  return { ...tierProgress(s.fieldCount), fieldCount: s.fieldCount, demoCount: s.demoCount, breadth: s.breadth, breadthOk: s.breadthOk, breadthGaps: s.breadthGaps }
}

/** 대시보드 카드용 초경량 요약 (실증 전체 기준) */
export function performanceGlance(data: AppData) {
  const s = performanceSummary(data, 'all')
  return {
    experimentDay: s.experimentDay,
    autoTotal: s.autoLink.total,
    avgInputMin: s.duration.samples >= MIN_SAMPLES ? s.duration.medianMin : null,
    samples: s.duration.samples,
    ready: s.ready,
    baselineFilled: Object.values({
      a: data.baseline.adminMinutesPerCollection,
      b: data.baseline.repeatEntriesPerCollection,
      c: data.baseline.monthlyDocHours,
      d: data.baseline.monthlyReworkCount,
      e: data.baseline.dailyCapacity,
    }).filter((v) => v != null).length,
  }
}
