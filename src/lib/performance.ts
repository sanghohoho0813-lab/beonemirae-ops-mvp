import type { AppData, BaselineMetrics, CollectionEvent } from '../types'
import { INPUT_SESSION_MAX_MS, INPUT_SESSION_MIN_MS } from '../types'
import { today } from './format'

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
//   4) 모든 지표는 출처(기준값 / 시스템 측정 / 파생 계산)를 함께 반환합니다.
//
//  Supabase 이전 시: 아래 순수함수는 그대로 두고 입력(AppData)만 서버 조회 결과로
//  바꾸면 됩니다. 계산에 브라우저 API 의존이 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 지표 값의 출처 */
export type MetricSource = 'baseline' | 'measured' | 'derived'

export const SOURCE_LABEL: Record<MetricSource, string> = {
  baseline: '사용자 입력 기준값',
  measured: '시스템 자동 측정',
  derived: '파생 계산',
}

/** 지표 상태 — 가짜 개선율을 만들지 않기 위한 구분 */
export type MetricStatus =
  | 'ok' // 기준값 + 측정값 모두 확보 → 개선율 산출
  | 'need-baseline' // 도입 전 기준값 미입력
  | 'measuring' // 측정 중 (표본 부족)
  | 'not-measured' // 이 단계에서 자동 측정 항목이 없음

export const STATUS_LABEL: Record<MetricStatus, string> = {
  ok: '측정 완료',
  'need-baseline': '기준값 입력 필요',
  measuring: '측정 중',
  'not-measured': '자동 측정 예정',
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
  // ── v6: 심사 제출 전 신뢰성 점검 ──
  /** 이 지표 산출에 쓰인 '실제 현장' 표본 수 (시연 세션 기록 제외) */
  fieldSamples: number
  /** 실제 현장 표본 수에 따른 실증 단계 */
  tier: EvidenceTier
  /** 개선율을 크게 강조해도 되는지 — 현장 표본이 대표성 기준을 넘을 때만 true */
  emphasis: boolean
  /** 이 지표가 사용한 데이터 출처 (시연 / 실제 현장 / 혼합) */
  provenance: ProvenanceKind
}

/** 1회 입력으로 자동 반영된 업무 건수 */
export interface AutoLinkBreakdown {
  schedule: number // 수거일정 반영 (신규 생성 또는 완료 처리)
  history: number // 수거이력·감사기록 생성
  clientActivity: number // 거래처 활동 반영
  material: number // 자재 공급 이력 생성
  stock: number // 사무실 재고 차감
  request: number // 병원 요청 자동 종료
  stats: number // 통계·KPI 반영
  document: number // 수거대장·월간 명세 초안 반영
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
  samples: number // 집계에 사용한 표본 수
  excluded: number // 이상치로 제외한 표본 수
  medianMin: number | null // 중앙값(분)
  avgMin: number | null // 평균(분)
}

export interface PeriodRange {
  from: string // YYYY-MM-DD (포함)
  to: string // YYYY-MM-DD (포함)
  label: string
  days: number
}

export interface PerformanceSummary {
  period: PeriodRange
  /** 실증 시작일 (미설정이면 null) */
  experimentStart: string | null
  /** 실증 시작 후 경과일수 (미설정이면 null) */
  experimentDay: number | null
  /** 집계 대상 이벤트 (기간 내 · 실증 시작 이후 · 취소되지 않은 수거 완료) */
  events: CollectionEvent[]
  /** 위 이벤트 중 시연 세션이 아닌 '실제 현장' 기록만 */
  fieldEvents: CollectionEvent[]
  /** 기간 내 취소(재입력) 건수 */
  revertedCount: number
  collectionCount: number
  /** 실제 현장 수거 입력 건수 (실증 단계 판정 기준) */
  fieldCount: number
  /** 시연 세션 중 기록된 수거 입력 건수 */
  demoCount: number
  /** 실제 현장 표본 수 기준 실증 단계 */
  tier: EvidenceTier
  activeDays: number
  autoLink: AutoLinkBreakdown
  duration: InputDurationStat
  /** 실제 현장 기록만으로 산출한 입력 처리시간 */
  fieldDuration: InputDurationStat
  metrics: MetricRow[]
  /** 확보된 지표 수 / 전체 지표 수 */
  ready: { confirmed: number; total: number }
  /** 개선율을 대표 성과값으로 강조해도 되는 지표 수 */
  emphasized: number
}

// ── 날짜 유틸 (로컬 기준, YYYY-MM-DD 문자열 비교) ────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** ISO 타임스탬프 → 로컬 날짜 문자열 */
function eventDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : toDateStr(d)
}

export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + delta)
  return toDateStr(dt)
}

/** 두 날짜 사이의 일수 (양끝 포함) */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  const a = new Date(y1, (m1 ?? 1) - 1, d1 ?? 1).getTime()
  const b = new Date(y2, (m2 ?? 1) - 1, d2 ?? 1).getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
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
    schedule: 0,
    history: 0,
    clientActivity: 0,
    material: 0,
    stock: 0,
    request: 0,
    stats: 0,
    document: 0,
    total: 0,
  }
  for (const e of events) {
    b.schedule += 1 // 신규 일정 생성 또는 기존 일정 완료 처리
    b.history += 1 // 수거이력·감사기록
    b.clientActivity += 1 // 거래처 최근 활동·다음 행동 추천 갱신
    b.stats += 1 // 통계·KPI 집계 반영
    b.document += 1 // 수거대장·월간 명세 초안 반영
    if (e.materialIds.length > 0) {
      b.material += e.materialIds.length
      b.stock += 1 // 사무실 재고 차감
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

/** 표본이 이 수 이상일 때만 '측정 완료'로 봅니다 (한두 건으로 개선율을 만들지 않음). */
export const MIN_SAMPLES = 3
/** 누락·재확인율은 단기 표본에서 '0건 = 100% 감소'로 과장되기 쉬워 더 많은 표본을 요구합니다. */
export const MIN_REWORK_EVENTS = 10

// ── 실증 단계 (실제 현장 표본 수 기준) ──────────────────────────────────────
// 계산이 가능하다는 것과, 그 숫자를 대표 성과값으로 내세워도 된다는 것은 다릅니다.
// 시연 데이터나 표본 몇 건으로 나온 개선율이 '확정 성과'처럼 보이지 않도록,
// 실제 현장 기록 건수에 따라 화면 상태가 단계적으로 바뀌게 합니다.

/** 이 건수 미만은 '초기 실증' — 참고값으로만 봅니다. */
export const TIER_ACCUMULATING = 10
/** 이 건수 이상부터 개선율을 대표 성과값으로 강조합니다. */
export const TIER_FIELD = 30

export type EvidenceTier = 'none' | 'initial' | 'accumulating' | 'field'

export const TIER_LABEL: Record<EvidenceTier, string> = {
  // 시연 기록은 있어도 현장 기록이 0건일 수 있으므로 '현장'을 명시합니다.
  none: '현장 데이터 없음',
  initial: '초기 실증',
  accumulating: '실증 데이터 축적 중',
  field: '현장 실증 지표',
}

export const TIER_DESC: Record<EvidenceTier, string> = {
  none: '실제 현장 입력 기록이 아직 없습니다',
  initial: `현장 사용 초기 단계입니다. 개선율은 참고값이며 현장 ${TIER_ACCUMULATING}건 이상부터 실증값으로 봅니다`,
  accumulating: `표본을 모으는 중입니다. 현장 ${TIER_FIELD}건 이상부터 대표 성과값으로 제시합니다`,
  field: '실제 현장 데이터로 확보된 대표 성과값입니다',
}

/** 화면에 단계 진행을 그대로 보여주기 위한 순서 정의 */
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

// ── 지표 5종 ─────────────────────────────────────────────────────────────────
function buildMetrics(
  baseline: BaselineMetrics,
  period: PeriodRange,
  events: CollectionEvent[],
  revertedCount: number,
  activeDays: number,
  duration: InputDurationStat,
  autoLink: AutoLinkBreakdown,
  fieldCount: number,
  demoCount: number,
  fieldDuration: InputDurationStat,
): MetricRow[] {
  const rows: MetricRow[] = []
  const monthFactor = period.days / 30 // 월 기준 기준값을 기간 길이에 맞춰 환산

  type Input = Omit<MetricRow, 'changePct' | 'status' | 'tier' | 'emphasis' | 'provenance'> & {
    status?: MetricStatus
    /** 이 지표의 시연 표본 수 (기본값: 전체 시연 수거 입력 건수) */
    demoSamples?: number
  }

  const push = ({ demoSamples, ...r }: Input) => {
    let status: MetricStatus = r.status ?? 'ok'
    let changePct: number | null = null
    if (!status || status === 'ok') {
      if (r.before == null) status = 'need-baseline'
      else if (r.after == null) status = 'measuring'
      else {
        changePct = improvement(r.before, r.after, r.betterWhen)
        status = changePct == null ? 'measuring' : 'ok'
      }
    }
    const tier = evidenceTierOf(r.fieldSamples)
    const provenance = provenanceKind(r.fieldSamples, demoSamples ?? demoCount)
    rows.push({
      ...r,
      status,
      changePct,
      tier,
      provenance,
      // 개선율을 대표 성과값으로 강조하는 조건은 두 가지를 모두 만족할 때뿐입니다.
      //  1) 실제 현장 표본이 대표성 기준(TIER_FIELD) 이상
      //  2) 집계에 시연 기록이 섞여 있지 않음
      // 시연 기록이 남아 있으면 '설정 > 시연 상태 초기화'로 분리한 뒤 확정됩니다.
      emphasis: status === 'ok' && tier === 'field' && provenance === 'field',
    })
  }

  // 1) 수거 1건 처리 후 행정업무 소요시간
  push({
    key: 'adminTime',
    label: '수거 1건 행정업무 시간',
    unit: '분',
    before: baseline.adminMinutesPerCollection,
    after: duration.samples >= MIN_SAMPLES ? duration.medianMin : null,
    betterWhen: 'lower',
    beforeSource: 'baseline',
    afterSource: 'measured',
    // 처리시간 지표의 현장 표본은 '이상치를 걸러낸 뒤 남은 실제 현장 입력' 건수입니다.
    fieldSamples: fieldDuration.samples,
    demoSamples: duration.samples - fieldDuration.samples,
    basis: '수거 입력 화면 진입 시각 → 저장 완료 시각의 실제 경과시간(중앙값). 20초 미만(오조작·테스트)과 30분 초과(화면 방치) 표본은 제외.',
    note:
      duration.samples > 0
        ? `측정 표본 ${duration.samples}건 (실제 현장 ${fieldDuration.samples}건)${
            duration.excluded ? ` · 이상치 ${duration.excluded}건 제외` : ''
          }${duration.samples < MIN_SAMPLES ? ` · ${MIN_SAMPLES}건 이상부터 산출` : ''}`
        : `아직 측정된 입력이 없습니다 (최소 ${MIN_SAMPLES}건 필요)`,
  })

  // 2) 동일 정보 반복 입력 횟수 — 구조상 1회 입력이므로 실제 사용 기록이 있을 때만 표시
  push({
    key: 'repeatEntry',
    label: '동일 정보 반복 입력',
    unit: '회',
    before: baseline.repeatEntriesPerCollection,
    after: events.length > 0 ? 1 : null,
    betterWhen: 'lower',
    beforeSource: 'baseline',
    afterSource: 'derived',
    fieldSamples: fieldCount,
    basis: '수거 완료 1건당 실제 입력 횟수. 현재 시스템은 1회 입력으로 일정·이력·거래처·자재·통계·문서 초안에 자동 반영됩니다.',
    note:
      events.length > 0
        ? `기간 내 수거 입력 ${events.length}건 모두 1회 입력 (실제 현장 ${fieldCount}건)`
        : '기간 내 수거 입력 없음',
  })

  // 3) 월간 문서 작성시간 — 자동 측정 항목이 아직 없으므로 개선율을 만들지 않습니다.
  push({
    key: 'docHours',
    label: '월간 문서 작성시간',
    unit: '시간',
    before: baseline.monthlyDocHours,
    after: null,
    betterWhen: 'lower',
    beforeSource: 'baseline',
    afterSource: null,
    status: 'not-measured',
    fieldSamples: fieldCount,
    basis: '수거대장·명세 작성시간은 현재 자동 측정 항목이 없습니다. 문서 초안 자동 생성 건수만 참고값으로 제공합니다.',
    note: `기간 내 자동 생성된 문서 초안 ${autoLink.document}건`,
  })

  // 4) 누락·재확인 발생 건수 — 취소(재입력) 이벤트를 실측값으로 사용
  const reworkBefore = baseline.monthlyReworkCount == null ? null : Math.round(baseline.monthlyReworkCount * monthFactor * 10) / 10
  push({
    key: 'rework',
    label: '누락·재확인 건수',
    unit: '건',
    before: reworkBefore,
    // 표본이 적으면 '재입력 0건 = 100% 감소' 같은 과장이 나오므로 산출하지 않습니다.
    after: events.length + revertedCount >= MIN_REWORK_EVENTS ? revertedCount : null,
    betterWhen: 'lower',
    beforeSource: 'baseline',
    afterSource: 'measured',
    fieldSamples: fieldCount,
    basis: `기간 내 '완료 취소 후 재입력' 건수를 실측합니다. 도입 전 값은 월 기준이라 기간(${period.days}일)에 맞춰 환산했습니다.`,
    note:
      events.length + revertedCount < MIN_REWORK_EVENTS
        ? `수거 입력 ${MIN_REWORK_EVENTS}건 이상부터 산출 (현재 ${events.length + revertedCount}건)`
        : baseline.monthlyReworkCount == null
          ? `기간 내 재입력 ${revertedCount}건`
          : `도입 전 월 ${baseline.monthlyReworkCount}건 → ${period.days}일 환산 ${reworkBefore}건 · 실측 ${revertedCount}건`,
  })

  // 5) 하루 처리 건수 — 입력이 있었던 날 기준
  push({
    key: 'dailyCount',
    label: '하루 처리 건수',
    unit: '건',
    before: baseline.dailyCapacity,
    after: activeDays >= 2 ? Math.round((events.length / activeDays) * 10) / 10 : null,
    betterWhen: 'higher',
    beforeSource: 'baseline',
    afterSource: 'measured',
    fieldSamples: fieldCount,
    basis: '기간 내 수거 완료 건수 ÷ 실제 입력이 발생한 일수. 이틀 이상 사용 기록이 있어야 산출합니다.',
    note:
      activeDays > 0
        ? `입력 발생일 ${activeDays}일 · 완료 ${events.length}건 (실제 현장 ${fieldCount}건)`
        : '입력 발생일 없음',
  })

  return rows
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
export function performanceSummary(
  data: AppData,
  preset: PeriodPreset,
  custom?: { from: string; to: string },
): PerformanceSummary {
  const baseline = data.baseline
  const experimentStart = data.experiment?.startDate ?? null
  const period = resolvePeriod(preset, experimentStart, custom)

  // 실증 시작일 이후 & 기간 내 이벤트만 집계 (시작일 미설정이면 기간 조건만 적용)
  const lower = experimentStart && experimentStart > period.from ? experimentStart : period.from
  const inRange = (e: CollectionEvent) => {
    const d = eventDate(e.at)
    return !!d && d >= lower && d <= period.to
  }

  const all = (data.events ?? []).filter((e) => e.action === '수거 완료' && inRange(e))
  const events = all.filter((e) => !e.reverted)
  const revertedCount = all.filter((e) => e.reverted).length
  const activeDays = new Set(events.map((e) => eventDate(e.at))).size

  // 시연 세션 중 만들어진 기록과 실제 현장 기록을 분리합니다.
  // 실증 단계·개선율 강조 여부는 '실제 현장' 건수만으로 판정합니다.
  const fieldEvents = events.filter((e) => !e.demoSessionId)
  const fieldCount = fieldEvents.length
  const demoCount = events.length - fieldCount

  const autoLink = autoLinkOf(events)
  const duration = durationStat(events)
  const fieldDuration = durationStat(fieldEvents)
  const metrics = buildMetrics(
    baseline,
    period,
    events,
    revertedCount,
    activeDays,
    duration,
    autoLink,
    fieldCount,
    demoCount,
    fieldDuration,
  )

  return {
    period,
    experimentStart,
    experimentDay: experimentStart ? daysBetween(experimentStart, today()) : null,
    events,
    fieldEvents,
    revertedCount,
    collectionCount: events.length,
    fieldCount,
    demoCount,
    tier: evidenceTierOf(fieldCount),
    activeDays,
    autoLink,
    duration,
    fieldDuration,
    metrics,
    ready: { confirmed: metrics.filter((m) => m.status === 'ok').length, total: metrics.length },
    emphasized: metrics.filter((m) => m.emphasis).length,
  }
}

// ── 데이터 출처 구분 (실제 현장 / 시연) ─────────────────────────────────────
// 심사자가 '성과 확정'으로 오해하지 않도록, 집계에 쓰인 데이터가 실제 현장
// 기록인지 시연 세션 기록인지 명시합니다.
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
  const evs = events ?? (data.events ?? []).filter((e) => e.action === '수거 완료' && !e.reverted)
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
  /** 근거가 확보되지 않아 숫자를 만들지 않는 경우 true */
  measuring: boolean
  changeText: string
  /** 개선율을 크게 강조해도 되는지 (실제 현장 표본 충분) */
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
 * 근거가 확보된 지표(status='ok')를 우선 노출하고, 없으면 '실증 중'으로 둡니다.
 * 개선율이 계산되더라도 실제 현장 표본이 부족하면 강조하지 않고 단계를 표시합니다.
 */
export function axHighlights(data: AppData): AxHighlight[] {
  const s = performanceSummary(data, 'all')
  const pick = ['adminTime', 'repeatEntry', 'rework']
  const rows: AxHighlight[] = pick
    .map((k) => s.metrics.find((m) => m.key === k))
    .filter((m): m is MetricRow => !!m)
    .map((m) => ({
      key: m.key,
      label: m.label,
      before: m.before == null ? '—' : `${m.before}${m.unit}`,
      after: m.after == null ? '측정 중' : `${m.after}${m.unit}`,
      measuring: m.status !== 'ok',
      emphasis: m.emphasis,
      tier: m.tier,
      provenance: m.provenance,
      fieldSamples: m.fieldSamples,
      changeText:
        m.status === 'ok'
          ? // 표본이 부족하면 퍼센트를 단독으로 두지 않고 '무엇을 근거로 나온 값인지'를 붙입니다.
            m.emphasis
            ? changeLabel(m)
            : `${changeLabel(m)} · ${m.provenance === 'demo' ? '시연 데이터 기준' : TIER_LABEL[m.tier]}`
          : m.status === 'need-baseline'
            ? '기준값 입력 필요'
            : '실증 중',
    }))
  // 대표 성과값(강조 가능) → 계산됨 → 측정 중 순
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
  return { ...tierProgress(s.fieldCount), fieldCount: s.fieldCount, demoCount: s.demoCount }
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
