import type { AppData } from '../types'
import { classifyEvent, daysInclusive, localDateOf } from './evidenceBase'
import { AFTER_SURVEY, SURVEY_TAKEN_ON, SURVEY_TASKS, WEEKS_PER_MONTH, surveyTotals } from './opsSurvey'
import { summarizeTrials, type Trial, type TrialSummary } from './trials'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 발표용 성과 요약 (IR) — 「확인된 것만, 아주 쉽게」 (0137)
//
//  대표님: 「/performance 의 상세 실증·근거 구조는 절대 삭제하거나 단순화하지
//  마라. 신용보증기금 IR 에서 직접 보여주기에는 정보가 너무 많다 — 발표 시연용
//  Performance Summary 를 별도로 만든다. 심사위원이 5~10초 안에 「도입 전 어떤
//  문제가 있었고, 실제로 무엇을 측정했고, 현재 어디까지 검증됐는지」.」
//
//  ⚠ 새 계산을 만들지 않습니다. /performance 와 **같은 원천 · 같은 함수**를
//    씁니다 — 두 화면의 숫자가 갈리면 발표장에서 「어느 쪽이 맞습니까」가 됩니다.
//      도입 전 하루 사무업무  ← opsSurvey.surveyTotals (운영이사 업무조사 답변 그대로)
//      동일 업무 Before→After ← trials.summarizeTrials (업무 재현시험 실측, 과제별 중앙값)
//      실제 사용 증거        ← 운영 DB 기록 (수거 입력 · 병원 요청 · 병원 문의)
//                               분류는 evidenceBase.classifyEvent 그대로
//
//  ── 지키는 것 ───────────────────────────────────────────────────────────
//  ⚠ 지표는 최대 4개. 값이 없으면 숫자를 만들지 않고 「측정 전 / 측정 예정」.
//  ⚠ 목표값 · 예시값(46% · 19% · 시연 기준값) · 출처 미확정 값(월 105톤 ·
//    거래처 49곳/53곳) · 매출은 이 화면에 **들어올 길이 없습니다** — 아래
//    함수는 그런 값을 읽지 않습니다.
//  ⚠ 절감률(%)을 내지 않습니다. 재현시험의 「몇 분 → 몇 분」만 그대로 적습니다
//    (실험실 값을 회사 전체 절감률로 읽게 만들지 않으려고).
//  ⚠ 시연 자료(demo_session_id · 시연용 거래처) · 취소된 입력 · 실증 시작일
//    이전 연습 입력은 세지 않습니다. 뺀 건수는 함께 돌려줍니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 「최근 30일」 */
export const IR_WINDOW_DAYS = 30

/** 이름으로는 사람을 가를 수 없는 자리표시 — 사람 수에 넣지 않습니다 */
const PLACEHOLDER_NAMES = new Set(['', '(이름 미기록)', '병원 담당자', '담당자'])

export interface IrBaseline {
  minH: number
  maxH: number
  takenOn: string
  /** 무엇을 더한 값인지 — 답변 원문 그대로 */
  parts: { label: string; quote: string }[]
}

export type IrTrial =
  /** 재현시험을 읽을 수 없음 (시연 모드 · 권한 · 읽기 실패) — 숫자 대신 까닭 */
  | { state: 'unavailable'; reason: string }
  /** 아직 한 번도 안 함 */
  | { state: 'none' }
  | {
      state: 'measured'
      /** 표본이 가장 많은 과제 (같으면 최근에 잰 과제) */
      main: TrialSummary
      /** 그 밖의 과제 — 작게 */
      others: TrialSummary[]
      /** 모든 과제의 재현시험 횟수 합 */
      total: number
    }

export type IrUsage =
  | { state: 'unavailable'; reason: string }
  | {
      state: 'ok'
      /** 센 기간 (최근 30일과 실증 기간이 겹치는 구간). 실증 시작 전이면 null */
      window: { from: string; to: string } | null
      users: number
      staffUsers: number
      clientUsers: number
      records: number
      byKind: { collections: number; requests: number; inquiries: number }
      excluded: { demo: number; reverted: number }
    }

export interface IrNext {
  key: 'vehicle' | 'ceoSales' | 'portal'
  label: string
  /** 무엇을 재는가 — 한 줄 */
  how: string
  /** recording = 원천 기록이 쌓이기 시작함 (값은 아직 내지 않음) */
  status: 'planned' | 'recording'
  /** 쌓인 기록 — 실제 건수만. 없으면 null */
  note: string | null
}

/**
 * 도입 후 답변 (0141) — 잰 값이 아니라 **답변**입니다. 줄어든 양은 두 답변에서 계산한 **최소치**만:
 *   하루: 도입 전 최소(minH) − 도입 후 최대(30분)  ·  한 달: 하루 × 주 6일 × 4.345주
 */
export interface IrAfter {
  takenOn: string
  who: string
  /** 도입 후 하루 사무업무 — 「○분 이내」 */
  afterMaxMin: number
  /** 하루 줄어든 시간 — 최소치(시간) */
  cutMinH: number
  /** 한 달 줄어든 시간 — 최소치(시간) · 계산식 */
  monthCutMinH: number
  daysPerWeek: number
  field: { who: string; beforeMinMin: number; afterMin: number; quote: string }
}

export interface IrSummary {
  asOf: string
  baseline: IrBaseline
  after: IrAfter
  trial: IrTrial
  usage: IrUsage
  /** 실증 기간 — 설정의 실증 시작일 ~ 오늘. 시작일이 없으면 days = null */
  pilot: { startDate: string | null; days: number | null }
  next: IrNext[]
}

export interface IrInput {
  /** 운영 DB 에서 읽은 자료인가 (시연 모드면 false) */
  live: boolean
  /**
   * 업무 재현시험. null = 읽지 못함 / 읽을 수 없는 계정.
   *  [] = 읽었는데 아직 없음 — 둘을 섞지 않습니다.
   */
  trials: Trial[] | null
  /** trials 가 null 일 때 그 까닭 */
  trialsReason?: string
  /** 읽지 못한 표 (repo.missingParts 중 해당하는 것) */
  unreadable?: string[]
  todayStr?: string
}

/** 'YYYY-MM-DD' 에 n 일 더하기 (날짜 글자만 다룹니다 — 시간대와 무관) */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) + n * 86_400_000)
  return t.toISOString().slice(0, 10)
}

function pickMain(sums: TrialSummary[], trials: Trial[]): TrialSummary {
  const latest = (task: string) =>
    trials.filter((t) => t.task === task).reduce((a, t) => (t.date > a ? t.date : a), '')
  return [...sums].sort((a, b) => b.n - a.n || latest(b.task).localeCompare(latest(a.task)))[0]
}

export function irSummary(data: AppData, input: IrInput): IrSummary {
  const asOf = input.todayStr ?? today()

  //  ── ① 도입 전 하루 사무업무 — 운영이사 업무조사 답변 그대로 ─────────────
  const t = surveyTotals()
  const baseline: IrBaseline = {
    minH: t.dailyAdminMinH,
    maxH: t.dailyAdminMaxH,
    takenOn: SURVEY_TAKEN_ON,
    parts: SURVEY_TASKS.map((x) => ({ label: x.label, quote: x.quote })),
  }

  //  ── ② 동일 업무 Before → After — 업무 재현시험 실측만 ───────────────────
  let trial: IrTrial
  if (!input.live) trial = { state: 'unavailable', reason: '시연 모드에서는 실제 재현시험 기록을 읽지 않습니다' }
  else if (input.trials == null) trial = { state: 'unavailable', reason: input.trialsReason ?? '재현시험 기록을 읽지 못했습니다' }
  else {
    const sums = summarizeTrials(input.trials)
    if (sums.length === 0) trial = { state: 'none' }
    else {
      const main = pickMain(sums, input.trials)
      trial = {
        state: 'measured',
        main,
        others: sums.filter((s) => s.task !== main.task),
        total: sums.reduce((s, x) => s + x.n, 0),
      }
    }
  }

  //  ── 실증 기간 ─────────────────────────────────────────────────────────
  const startDate = data.experiment?.startDate ?? null
  const pilotDays = startDate && startDate <= asOf ? daysInclusive(startDate, asOf) : startDate ? 0 : null

  //  ── ③ 실제 사용 증거 — 운영 DB 기록, 시연·취소·연습 제외 ─────────────────
  const demoClients = new Set(data.clients.filter((c) => c.isDemoGenerated).map((c) => c.id))
  const unreadable = input.unreadable ?? []
  let usage: IrUsage
  if (!input.live) {
    usage = { state: 'unavailable', reason: '시연 모드입니다 — 운영 계정으로 들어오면 실제 기록을 셉니다' }
  } else if (unreadable.length > 0) {
    //  ⚠ 못 읽은 표가 있으면 0 이라고 적지 않습니다 (그건 「없다」가 아니라 「모른다」).
    usage = { state: 'unavailable', reason: `읽지 못한 자료가 있어 세지 않았습니다 — ${unreadable.join(' · ')}` }
  } else {
    const from30 = addDays(asOf, -(IR_WINDOW_DAYS - 1))
    const from = startDate && startDate > from30 ? startDate : from30
    const window = from <= asOf ? { from, to: asOf } : null
    const inWin = (d: string) => !!window && !!d && d >= window.from && d <= window.to

    const staff = new Set<string>()
    const clientsUsers = new Set<string>()
    const excluded = { demo: 0, reverted: 0 }

    //  수거 입력 — 이름만 남은 옛 기록도 같은 사람으로 묶이게 이름 → id 를 먼저 모읍니다.
    const schedById = new Map(data.schedules.map((s) => [s.id, s]))
    const nameToId = new Map<string, string>()
    for (const e of data.events ?? []) {
      const n = (e.actorName ?? '').trim()
      if (e.actorId && n) nameToId.set(n, e.actorId)
    }
    let collections = 0
    for (const e of data.events ?? []) {
      const cls = classifyEvent(e, startDate)
      if (cls === 'not-done' || cls === 'practice') continue
      if (!inWin(localDateOf(e.at))) continue
      if (cls === 'demo' || demoClients.has(e.clientId)) { excluded.demo += 1; continue }
      if (cls === 'reverted') { excluded.reverted += 1; continue }
      collections += 1
      const name = ((e.actorName ?? '').trim() || (schedById.get(e.scheduleId)?.driverName ?? '').trim())
      const key = e.actorId ?? (name && nameToId.get(name)) ?? (PLACEHOLDER_NAMES.has(name) ? '' : `name:${name}`)
      if (key) staff.add(key)
    }

    //  병원 요청 — 전화로 받아 직원이 올린 것도 실제 업무 기록입니다.
    let requests = 0
    for (const r of data.requests ?? []) {
      const d = localDateOf(r.createdAt)
      const handled = r.handledAt ? localDateOf(r.handledAt) : ''
      if (!inWin(d) && !inWin(handled)) continue
      if (r.demoSessionId || demoClients.has(r.clientId)) { if (inWin(d)) excluded.demo += 1; continue }
      if (inWin(d)) {
        requests += 1
        //  병원 사람 — 포털에서 직접 올린 것만 (직원이 대신 올린 것의 이름은 병원 담당자 이름일 수 있음)
        const n = (r.requesterName ?? '').trim()
        if (r.source === 'portal' && !PLACEHOLDER_NAMES.has(n)) clientsUsers.add(`${r.clientId}|${n}`)
      }
      //  처리한 직원 (profile id)
      if (r.handledBy && inWin(handled)) staff.add(r.handledBy)
    }

    //  병원 문의
    let inquiries = 0
    for (const q of data.inquiries ?? []) {
      const d = localDateOf(q.createdAt)
      const handled = q.handledAt ? localDateOf(q.handledAt) : ''
      if (!inWin(d) && !inWin(handled)) continue
      if (q.demoSessionId || demoClients.has(q.clientId)) { if (inWin(d)) excluded.demo += 1; continue }
      if (inWin(d)) {
        inquiries += 1
        const n = (q.askedByName ?? '').trim()
        if (!PLACEHOLDER_NAMES.has(n)) clientsUsers.add(`${q.clientId}|${n}`)
      }
      if (q.handledBy && inWin(handled)) staff.add(q.handledBy)
    }

    usage = {
      state: 'ok',
      window,
      users: staff.size + clientsUsers.size,
      staffUsers: staff.size,
      clientUsers: clientsUsers.size,
      records: collections + requests + inquiries,
      byKind: { collections, requests, inquiries },
      excluded,
    }
  }

  //  ── ④ 다음에 검증할 사업효과 — 목표값을 쓰지 않습니다 ───────────────────
  const w = usage.state === 'ok' ? usage.window : null
  const inW = (d: string) => !!w && !!d && d >= w.from && d <= w.to
  const runLogs = input.live
    ? (data.dayCloses ?? []).filter(
        (c) => inW(c.date) && ((c.odometerStart != null && c.odometerEnd != null) || c.facilityWaitMin != null),
      ).length
    : 0
  const portalReqs = input.live
    ? (data.requests ?? []).filter((r) => r.source === 'portal' && !r.demoSessionId && !demoClients.has(r.clientId) && inW(localDateOf(r.createdAt)))
    : []
  const portalClients = new Set(portalReqs.map((r) => r.clientId)).size

  const next: IrNext[] = [
    {
      key: 'vehicle',
      label: '차량 생산시간',
      how: '업무 마감 때 적는 운행 기록(계기판 · 처리시설 대기)으로 차량 1대의 하루를 잽니다',
      status: runLogs > 0 ? 'recording' : 'planned',
      note: runLogs > 0 ? `운행 기록 ${runLogs}건 쌓이는 중` : null,
    },
    {
      key: 'ceoSales',
      label: '대표 신규영업시간',
      how: '운영 확인 · 재정리에 쓰던 시간이 신규 영업으로 옮겨 갔는지 봅니다',
      status: 'planned',
      note: null,
    },
    {
      key: 'portal',
      label: '병원 포털 사용률',
      how: '포털 계정이 있는 병원 중 실제로 포털에서 요청한 병원의 비율',
      status: portalReqs.length > 0 ? 'recording' : 'planned',
      note: portalReqs.length > 0 ? `병원 ${portalClients}곳 · 포털 요청 ${portalReqs.length}건 쌓이는 중` : null,
    },
  ]

  //  ── ①′ 도입 후 답변 (0141) — 최소치만 계산 ──────────────────────────────
  const r1 = (n: number) => Math.round(n * 10) / 10
  const cutMinH = Math.max(0, r1(baseline.minH - AFTER_SURVEY.admin.afterMaxMin / 60))
  const daysPerWeek = Math.min(...SURVEY_TASKS.map((x) => x.daysPerWeek))
  const after: IrAfter = {
    takenOn: AFTER_SURVEY.takenOn,
    who: AFTER_SURVEY.admin.who,
    afterMaxMin: AFTER_SURVEY.admin.afterMaxMin,
    cutMinH,
    monthCutMinH: Math.floor(cutMinH * daysPerWeek * WEEKS_PER_MONTH),
    daysPerWeek,
    field: { ...AFTER_SURVEY.field },
  }

  return {
    asOf,
    baseline,
    after,
    trial,
    usage,
    pilot: { startDate, days: pilotDays },
    next,
  }
}
