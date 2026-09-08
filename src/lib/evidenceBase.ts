import type { AppData, CollectionEvent, Schedule } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 실증 표본 — 「무엇을 세고 무엇을 빼는가」를 한 곳에서 정합니다 (0106)
//
//  이전 검토에서 재현된 불일치: 취소된 수거 기록 30건만 있을 때 준비도는
//  「준비됨」, 성과 집계는 유효 표본 0건. 두 화면이 서로 다른 기준으로
//  세고 있었기 때문입니다 (readiness 는 events 전부, performance 는 「수거
//  완료 · 취소 아님 · 실증 시작 이후」).
//
//  여기서 정한 기준을 준비도 · 성과 · 브리핑 인쇄 · 내보내기가 **같이** 씁니다.
//
//  ── 표본 분류 ──────────────────────────────────────────────────────────────
//   field      실제 현장 입력. 성과의 근거가 되는 유일한 것
//   demo       시연 세션 중 만든 기록 (demo_session_id)
//   practice   실증 시작일 **이전** 입력 — 연습·시험 입력으로 봅니다
//   reverted   완료를 취소한 기록 — 세지 않되, 「취소 후 재입력」 지표에는 씁니다
//   not-done   수거 완료가 아닌 기록(취소 이벤트 자체 등)
//
//  ⚠ 「시연 표식이 없다」는 이유만으로 현장 데이터라고 단정하지 않습니다.
//    실증 시작일이 없으면 practice 를 가를 수 없어, 그 사실을 breadth 에
//    적습니다(startUnset). 이관된 과거 실적은 collection_events 가 아니라
//    schedules.origin = 'migrated' 와 client_monthly_actuals 로 들어오므로
//    여기 표본에는 원래 없습니다 — 커버리지 분모에서도 뺍니다.
//
//  ── 「30건」은 내부 표시 기준입니다 ────────────────────────────────────────
//   신보 공식 기준도, 통계적 대표성 기준도 아닙니다. 그래서 건수 하나로
//   「실증 완료」를 만들지 않고, **운영 기간 · 참여 병원·기사 수 · 입력
//   커버리지 · 누락률**을 함께 냅니다. 하루에 한 사람이 30건을 넣은 것과
//   3주 동안 기사 셋이 병원 열 곳에서 30건을 넣은 것은 다른 일입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type SampleClass = 'field' | 'demo' | 'practice' | 'reverted' | 'not-done'

export interface EvidencePeriod {
  from: string
  to: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** ISO 시각 → 로컬 날짜 (YYYY-MM-DD). 못 읽으면 빈 문자열 */
export function localDateOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function classifyEvent(e: CollectionEvent, experimentStart: string | null): SampleClass {
  if (e.action !== '수거 완료') return 'not-done'
  if (e.reverted) return 'reverted'
  if (e.demoSessionId) return 'demo'
  const d = localDateOf(e.at)
  if (experimentStart && d && d < experimentStart) return 'practice'
  return 'field'
}

/** 일정 한 줄이 「실제 현장 기록」으로 셀 수 있는 것인가 (이관·시연·시드 제외) */
export function isFieldSchedule(s: Schedule): boolean {
  return s.origin !== 'demo' && s.origin !== 'migrated' && s.origin !== 'seed'
}

export interface EvidenceBreadth {
  /** 현장 입력이 있었던 서로 다른 날 수 */
  operatingDays: number
  firstDay: string | null
  lastDay: string | null
  /** 첫 입력일 ~ 마지막 입력일 (양끝 포함). 없으면 0 */
  spanDays: number
  /** 현장 입력이 있는 서로 다른 거래처 수 */
  clients: number
  /** 기록에 기사 이름이 남은 서로 다른 사람 수 */
  drivers: number
  /** 기사 이름을 알 수 없는 현장 입력 건수 (차량 기본 기사로 채우지 않습니다) */
  driversUnknown: number
  /**
   * 입력 커버리지 — 완료된 실제 일정 중 이 시스템 입력(이벤트)이 붙은 비율.
   *  done: 완료된 실제 일정 수 · entered: 그중 이벤트가 있는 수 · pct: null = 일정 없음
   */
  coverage: { done: number; entered: number; pct: number | null }
  /**
   * 데이터 누락률 — 완료된 실제 일정 중 실제 수거량 또는 완료 시각이 비어 있는 비율.
   */
  missing: { done: number; lacking: number; pct: number | null }
  /** 출처(origin)가 적히지 않은 완료 일정 수 — 현장으로 세되 그 사실을 적습니다 */
  originUnknown: number
  /** 실증 시작일이 없어 연습 입력을 가를 수 없는 상태 */
  startUnset: boolean
}

export interface EvidenceSample {
  period: EvidencePeriod | null
  experimentStart: string | null
  field: CollectionEvent[]
  demo: CollectionEvent[]
  practice: CollectionEvent[]
  reverted: CollectionEvent[]
  breadth: EvidenceBreadth
}

/** 「대표 성과값」이라 부르기 위한 **내부 표시 기준** — 공식 기준이 아닙니다 */
export const BREADTH_RULE = {
  /** 현장 표본 건수 */
  samples: 30,
  /** 현장 입력이 있었던 날 수 */
  operatingDays: 14,
  /** 서로 다른 거래처 수 */
  clients: 5,
  /** 서로 다른 기사 수 */
  drivers: 2,
  /** 입력 커버리지(%) */
  coveragePct: 80,
} as const

export const BREADTH_RULE_NOTE =
  '내부 표시 기준입니다 — 신용보증기금 공식 기준이나 통계적 대표성을 뜻하지 않습니다. ' +
  '하루에 한 사람이 넣은 30건을 회사 전체의 확정 성과로 부르지 않기 위한 최소 조건입니다.'

const inRange = (d: string, p: EvidencePeriod | null) => !p || (d >= p.from && d <= p.to)

/**
 * 표본을 분류하고 폭(breadth)을 셉니다.
 *
 *  period 가 없으면 전체 기간입니다. 실증 시작일은 data.experiment 에서
 *  읽고, 그 이전 입력은 practice 로 분류합니다.
 */
export function evidenceSample(data: AppData, period: EvidencePeriod | null = null): EvidenceSample {
  const experimentStart = data.experiment?.startDate ?? null
  const field: CollectionEvent[] = []
  const demo: CollectionEvent[] = []
  const practice: CollectionEvent[] = []
  const reverted: CollectionEvent[] = []

  for (const e of data.events ?? []) {
    const cls = classifyEvent(e, experimentStart)
    if (cls === 'not-done') continue
    //  연습(실증 시작 전)은 기간과 무관하게 셉니다 — 「몇 건을 세지 않았는가」를 알리는 값이라서.
    //  기간을 실증 시작일부터 잡으면 연습은 늘 기간 밖이라 0 이 되어 버립니다.
    if (cls === 'practice') { practice.push(e); continue }
    const d = localDateOf(e.at)
    if (!d || !inRange(d, period)) continue
    if (cls === 'field') field.push(e)
    else if (cls === 'demo') demo.push(e)
    else reverted.push(e)
  }

  //  ── 폭 ───────────────────────────────────────────────────────────────────
  const days = new Set<string>()
  const clients = new Set<string>()
  const drivers = new Set<string>()
  let driversUnknown = 0
  const byId = new Map((data.schedules ?? []).map((s) => [s.id, s]))
  for (const e of field) {
    days.add(localDateOf(e.at))
    clients.add(e.clientId)
    const name = (byId.get(e.scheduleId)?.driverName ?? '').trim()
    if (name) drivers.add(name)
    else driversUnknown += 1
  }
  const sortedDays = [...days].sort()
  const firstDay = sortedDays[0] ?? null
  const lastDay = sortedDays[sortedDays.length - 1] ?? null
  const spanDays = firstDay && lastDay ? daysInclusive(firstDay, lastDay) : 0

  //  ── 커버리지 · 누락 — 완료된 **실제** 일정 기준 ─────────────────────────
  const eventSchedules = new Set(field.map((e) => e.scheduleId))
  let done = 0
  let entered = 0
  let lacking = 0
  let originUnknown = 0
  for (const s of data.schedules ?? []) {
    if (s.status !== '완료' || s.canceledAt) continue
    if (!isFieldSchedule(s)) continue
    if (!inRange(s.date, period)) continue
    if (experimentStart && s.date < experimentStart) continue
    done += 1
    if (s.origin == null) originUnknown += 1
    if (eventSchedules.has(s.id)) entered += 1
    if (s.actualAmount == null || !s.completedAt) lacking += 1
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

  return {
    period,
    experimentStart,
    field,
    demo,
    practice,
    reverted,
    breadth: {
      operatingDays: days.size,
      firstDay,
      lastDay,
      spanDays,
      clients: clients.size,
      drivers: drivers.size,
      driversUnknown,
      coverage: { done, entered, pct: pct(entered, done) },
      missing: { done, lacking, pct: pct(lacking, done) },
      originUnknown,
      startUnset: !experimentStart,
    },
  }
}

export function daysInclusive(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  const a = new Date(y1, (m1 ?? 1) - 1, d1 ?? 1).getTime()
  const b = new Date(y2, (m2 ?? 1) - 1, d2 ?? 1).getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

/** 내부 표시 기준을 넘는가 — 넘지 못한 조건을 사람 말로 함께 돌려줍니다 */
export function breadthCheck(fieldCount: number, b: EvidenceBreadth): { ok: boolean; gaps: string[] } {
  const gaps: string[] = []
  if (fieldCount < BREADTH_RULE.samples) gaps.push(`현장 표본 ${fieldCount}/${BREADTH_RULE.samples}건`)
  if (b.operatingDays < BREADTH_RULE.operatingDays) gaps.push(`입력한 날 ${b.operatingDays}/${BREADTH_RULE.operatingDays}일`)
  if (b.clients < BREADTH_RULE.clients) gaps.push(`병원 ${b.clients}/${BREADTH_RULE.clients}곳`)
  if (b.drivers < BREADTH_RULE.drivers) gaps.push(`기사 ${b.drivers}/${BREADTH_RULE.drivers}명`)
  if (b.coverage.pct == null) gaps.push('완료 일정 없음 (커버리지 계산 불가)')
  else if (b.coverage.pct < BREADTH_RULE.coveragePct) gaps.push(`입력 커버리지 ${b.coverage.pct}% (기준 ${BREADTH_RULE.coveragePct}%)`)
  return { ok: gaps.length === 0, gaps }
}

/** 폭을 한 줄로 — 화면·인쇄물이 같은 문장을 씁니다 */
export function breadthLine(fieldCount: number, b: EvidenceBreadth): string {
  const parts = [
    `현장 ${fieldCount}건`,
    `입력한 날 ${b.operatingDays}일`,
    `병원 ${b.clients}곳`,
    b.drivers > 0 ? `기사 ${b.drivers}명` : '기사 이름 기록 없음',
    b.coverage.pct == null ? '커버리지 —' : `입력 커버리지 ${b.coverage.pct}%`,
    b.missing.pct == null ? '누락률 —' : `누락률 ${b.missing.pct}%`,
  ]
  return parts.join(' · ')
}
