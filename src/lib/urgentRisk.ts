import type { AppData, Client, ClientRequest, Schedule } from '../types'
import { today } from './format'
import { addDays } from './performance'
import { isPending } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 긴급 전화가 오기 전에 알아채기
//
//  지금까지 시스템은 긴급수거를 **세기만** 했습니다. 거래처 화면에 「긴급수거
//  3건」, 월간 리포트에 「긴급수거 3건 대응 완료」. 왜 생겼는지, 다음 달에
//  안 생기게 하려면 무엇을 해야 하는지는 어디에도 없었습니다.
//
//  긴급수거는 사고가 아니라 **신호**입니다. 병원이 급하게 전화를 건다는 것은
//  대개 하나를 뜻합니다 — **정해 둔 주기가 실제 배출량을 못 따라간다.**
//  그 신호를 읽으면 다음 달 긴급 전화를 미리 없앨 수 있습니다.
//
// ── 무엇을 근거로 삼는가 ────────────────────────────────────────────────────
//
//   · 최근 90일 안에 그 거래처가 올린 **긴급수거·추가수거 요청 건수**
//   · 그 거래처의 **실제 방문 간격** (완료된 수거 날짜 사이의 중앙값)
//   · 다음 방문이 잡혀 있는지, 잡혀 있다면 며칠 뒤인지
//
//  전부 이미 쌓여 있는 기록입니다. 새로 입력받는 것이 없습니다.
//
// ── 지키는 것 ───────────────────────────────────────────────────────────────
//
//  ⚠ **주기를 시스템이 바꾸지 않습니다.** 「긴급이 두 번 왔으니 주 2회로」를
//    자동으로 하면, 계약에 없는 방문이 매주 나가고 헛걸음이 쌓입니다.
//    계약은 계약입니다. 여기서는 **사실만 적고**, 「그럼 주 2회로」는 대표님이
//    누르십니다(방문 예약, 0058).
//
//  ⚠ **잘했다/못했다를 매기지 않습니다.** 긴급이 잦은 것은 병원 사정일 수도
//    있습니다. 점수를 매기면 그 숫자로 사람을 평가하게 됩니다.
//
//  ⚠ **없는 날짜를 지어내지 않습니다.** 「다음 긴급 예상일」 같은 값은 만들지
//    않습니다. 근거가 모자라면 아무 말도 하지 않습니다 — 매번 뜨는 경고는
//    곧 배경이 되고, 진짜 위험한 줄이 그 안에 묻힙니다.
//
//  ⚠ 그만둔 거래처·거래 중이 아닌 곳은 보지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 되돌아보는 기간 (일) */
export const LOOKBACK_DAYS = 90

/** 이 횟수 이상 급한 요청이 왔을 때만 신호로 봅니다 */
export const MIN_REQUESTS = 2

/**
 * 다음 방문이 이보다 멀면 「비어 있다」고 봅니다.
 *
 *  실제 방문 간격이 7일인 곳에 다음 방문이 12일 뒤면, 그 사이에 병원이
 *  전화를 겁니다. 간격의 1.5배를 넘는 공백을 그렇게 봅니다.
 */
export const GAP_FACTOR = 1.5

export type RiskLevel = '반복' | '한 번'

export interface UrgentRisk {
  clientId: string
  clientName: string
  /** 최근 90일 급한 요청 건수 (긴급수거 + 추가수거) */
  requests: number
  /** 그중 긴급수거 */
  urgentRequests: number
  /** 가장 최근 급한 요청 날짜 */
  lastRequestDate: string
  /** 실제 방문 간격 중앙값 (일). 근거가 모자라면 null */
  medianGap: number | null
  /** 90일 안 완료 방문 횟수 */
  visits: number
  /** 다음에 잡혀 있는 방문 날짜. 없으면 null */
  nextVisit: string | null
  /** 오늘부터 다음 방문까지 며칠. 방문이 없으면 null */
  nextInDays: number | null
  /**
   * 다음 방문까지가 평소 간격보다 **많이 비어 있는가.**
   * 간격을 모르면 false — 모르는 것을 위험이라고 하지 않습니다.
   */
  gapAhead: boolean
  /** 잡혀 있는 방문이 아예 없는가 */
  noNextVisit: boolean
  level: RiskLevel
  /** 화면에 그대로 적는 근거 한 줄 */
  reason: string
}

/** 'YYYY-MM-DD' 두 날짜 사이의 일수 */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * 완료된 방문 사이의 간격 중앙값.
 *
 *  평균이 아니라 중앙값입니다 — 명절 뒤 한 번 길게 벌어진 값에 끌려가면
 *  「원래 이만큼 뜸하다」로 잘못 읽습니다.
 *  간격을 두 개 이상 못 구하면 null 입니다. 한 번 다녀온 곳의 「간격」은
 *  존재하지 않는데, 억지로 값을 만들면 그 위의 판단이 전부 흔들립니다.
 */
export function visitGapOf(schedules: Schedule[], clientId: string, from: string, to: string): number | null {
  const dates = [
    ...new Set(
      schedules
        .filter((s) => s.clientId === clientId && s.status === '완료' && s.date >= from && s.date <= to)
        .map((s) => s.date),
    ),
  ].sort()
  if (dates.length < 3) return null
  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]))
  return median(gaps)
}

/** 급한 요청인가 — 병원이 「지금 와 주세요」라고 부른 것 */
const isUrgentKind = (r: ClientRequest) => r.kind === '긴급수거' || r.kind === '추가수거'

/**
 * 긴급이 반복되는 거래처.
 *
 *  많이 급한 순으로 돌려줍니다. 근거가 모자란 곳은 아예 안 넣습니다.
 */
export function urgentRisks(data: AppData, now = today()): UrgentRisk[] {
  const from = addDays(now, -LOOKBACK_DAYS)
  //  그만둔 거래처는 보지 않습니다 — 이제 갈 일이 없는 곳입니다.
  //  (그만둔 곳은 data.retiredClients 에 따로 있고 여기 섞이지 않습니다.)
  const clients = new Map<string, Client>(data.clients.map((c) => [c.id, c]))
  const reqs = (data.requests ?? []).filter(
    (r) => isUrgentKind(r) && r.createdAt.slice(0, 10) >= from && clients.has(r.clientId),
  )

  const byClient = new Map<string, ClientRequest[]>()
  for (const r of reqs) {
    const cur = byClient.get(r.clientId) ?? []
    cur.push(r)
    byClient.set(r.clientId, cur)
  }

  const out: UrgentRisk[] = []
  for (const [clientId, rs] of byClient) {
    const c = clients.get(clientId)!
    if (rs.length < MIN_REQUESTS) continue

    const dates = rs.map((r) => r.createdAt.slice(0, 10)).sort()
    const lastRequestDate = dates[dates.length - 1]
    const urgentRequests = rs.filter((r) => r.kind === '긴급수거').length

    const done = data.schedules.filter(
      (s) => s.clientId === clientId && s.status === '완료' && s.date >= from && s.date <= now,
    )
    const medianGap = visitGapOf(data.schedules, clientId, from, now)

    //  앞으로 잡혀 있는 방문 — 오늘 것도 「앞으로」에 넣습니다.
    const next = data.schedules
      .filter((s) => s.clientId === clientId && isPending(s) && s.date >= now)
      .map((s) => s.date)
      .sort()[0]
    const nextInDays = next ? daysBetween(now, next) : null
    const gapAhead = medianGap != null && nextInDays != null && nextInDays > medianGap * GAP_FACTOR

    const level: RiskLevel = rs.length >= 3 || urgentRequests >= 2 ? '반복' : '한 번'

    //  근거를 문장으로 만들어 둡니다. 화면이 이 말을 그대로 적습니다 —
    //  화면마다 다르게 풀어 쓰면 같은 사실이 다른 말로 보입니다.
    const parts = [`최근 ${LOOKBACK_DAYS}일 급한 요청 ${rs.length}건`]
    if (urgentRequests > 0) parts.push(`그중 긴급 ${urgentRequests}건`)
    parts.push(medianGap != null ? `실제 방문 간격 ${medianGap}일` : '방문 간격은 기록이 모자라 계산 안 함')
    if (!next) parts.push('앞으로 잡힌 방문 없음')
    else parts.push(`다음 방문 ${next}${nextInDays === 0 ? ' (오늘)' : ` (${nextInDays}일 뒤)`}`)

    out.push({
      clientId,
      clientName: c.name,
      requests: rs.length,
      urgentRequests,
      lastRequestDate,
      medianGap,
      visits: new Set(done.map((s) => s.date)).size,
      nextVisit: next ?? null,
      nextInDays,
      gapAhead,
      noNextVisit: !next,
      level,
      reason: parts.join(' · '),
    })
  }

  //  급한 순 — ① 앞으로 방문이 아예 없는 곳 ② 다음 방문이 평소보다 먼 곳
  //  ③ 요청이 많은 곳. 실제로 먼저 손대야 하는 순서입니다.
  return out.sort(
    (a, b) =>
      Number(b.noNextVisit) - Number(a.noNextVisit) ||
      Number(b.gapAhead) - Number(a.gapAhead) ||
      b.requests - a.requests ||
      a.clientName.localeCompare(b.clientName, 'ko'),
  )
}

/**
 * 화면 맨 위에 띄울지 — **지금 손대야 하는 것만** 셉니다.
 *
 *  급한 요청이 반복됐는데 앞이 비어 있는 곳입니다. 요청은 잦았지만 다음
 *  방문이 제때 잡혀 있으면 지금 할 일이 없습니다 — 그것까지 띄우면 매일
 *  같은 줄이 떠 있게 되고, 사람은 곧 그것을 안 보게 됩니다.
 */
export function urgentActionable(risks: UrgentRisk[]): UrgentRisk[] {
  return risks.filter((r) => r.noNextVisit || r.gapAhead)
}
