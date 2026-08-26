import type { AppData, Client } from '../types'
import { today, thisMonth } from './format'
import { clientSchedules } from './ops'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면의 「분석」 칸 — **규칙 기반입니다. AI 가 아닙니다** (0086)
//
//  대표님 브리프: 「실제 AI API가 연결되어 있지 않으면 fake AI 결과를 생성하지
//  않는다. 현재는 규칙 기반 insight라도 괜찮다 … 실제 분석 방식이 rules
//  기반이라면 코드상 명확히 구분한다.」
//
//  그래서 이 파일에는 모형도, 확률도, 「AI가 예측했습니다」도 없습니다.
//  전부 **뺄셈과 나눗셈**입니다. 화면에도 그렇게 적습니다 —
//  「수거 기록에서 계산했습니다」.
//
//  ⚠ 알림(portalNotices)과 하는 일이 다릅니다.
//      알림   지금 **해야 할 일**   — 「내일 수거 예정」 「미납이 있습니다」
//      분석   지난 것의 **흐름**    — 「이번 달 배출량이 평소보다 18% 많습니다」
//    둘을 섞으면 둘 다 잔소리가 됩니다.
//
//  ⚠ 각 항목은 **근거 숫자를 반드시 함께** 들고 다닙니다(basis). 근거를 못
//    적는 문장은 만들지 않습니다 — 대표님: 「근거 없는 AI 추천은 금지한다」.
//
//  ⚠ 표본이 모자라면 **아무 말도 하지 않습니다.** 수거 두 번 하고
//    「증가 추세입니다」라고 하는 것은 분석이 아니라 우연입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type InsightTone = 'flat' | 'up' | 'down' | 'note'

export interface PortalInsight {
  key: string
  tone: InsightTone
  /** 한 줄 결론 */
  title: string
  /** 이 결론이 나온 **계산** — 병원이 직접 검산할 수 있게 숫자를 그대로 */
  basis: string
}

/** 표본이 이보다 적으면 추세를 말하지 않습니다 */
const MIN_MONTHS = 3
/** 이보다 작은 차이는 「비슷합니다」입니다 — 오차 범위에 가깝습니다 */
const FLAT_PCT = 10

const monthOf = (iso: string) => iso.slice(0, 7)
const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface PortalInsightResult {
  items: PortalInsight[]
  /**
   * 자료가 모자라 아직 아무것도 말할 수 없을 때의 사유.
   *
   *  ⚠ 빈 칸을 그냥 두면 병원은 「고장났나」로 읽습니다. 「왜 아직 없는지」를
   *    적어 두면 기다릴 수 있습니다.
   */
  why: string | null
}

export function portalInsights(
  data: AppData,
  client: Client,
  now = today(),
): PortalInsightResult {
  const out: PortalInsight[] = []
  const done = clientSchedules(data, client.id).filter(
    (s) => s.status === '완료' && s.date <= now,
  )

  //  ⚠ 무게가 안 적힌 수거는 추세 계산에서 **뺍니다.** 0 으로 세면
  //    「배출량이 줄었습니다」라는 거짓말이 됩니다.
  const weighed = done.filter((s) => s.actualAmount != null && s.actualAmount > 0)

  const ym = thisMonth()
  const byMonth = new Map<string, { kg: number; visits: number }>()
  for (const s of weighed) {
    const k = monthOf(s.date)
    const cur = byMonth.get(k) ?? { kg: 0, visits: 0 }
    cur.kg += s.actualAmount ?? 0
    cur.visits += 1
    byMonth.set(k, cur)
  }

  //  ── ① 이번 달 배출량이 평소와 얼마나 다른가 ────────────────────────────
  //     ⚠ 이번 달은 **아직 안 끝났습니다.** 지난달들의 「전체 합계」와 이번 달
  //       「지금까지」를 비교하면 언제나 「줄었습니다」가 나옵니다. 그래서
  //       비교 대상을 **지난 달들의 같은 날짜까지**로 잘라 맞춥니다.
  const dayOfMonth = Number(now.slice(8, 10))
  const past = [...byMonth.keys()].filter((k) => k < ym).sort().slice(-6)
  if (past.length >= MIN_MONTHS) {
    const clipped = past.map((k) => {
      const kg = weighed
        .filter((s) => monthOf(s.date) === k && Number(s.date.slice(8, 10)) <= dayOfMonth)
        .reduce((a, s) => a + (s.actualAmount ?? 0), 0)
      return kg
    })
    const avg = clipped.reduce((a, b) => a + b, 0) / clipped.length
    const cur = byMonth.get(ym)?.kg ?? 0
    if (avg > 0 && cur > 0) {
      const pct = Math.round(((cur - avg) / avg) * 100)
      const tone: InsightTone = Math.abs(pct) < FLAT_PCT ? 'flat' : pct > 0 ? 'up' : 'down'
      out.push({
        key: 'trend',
        tone,
        title:
          tone === 'flat'
            ? '이번 달 배출량은 평소와 비슷합니다'
            : tone === 'up'
              ? `이번 달 배출량이 평소보다 ${pct}% 많습니다`
              : `이번 달 배출량이 평소보다 ${Math.abs(pct)}% 적습니다`,
        basis:
          `이번 달 ${Math.round(cur).toLocaleString('ko-KR')}kg · ` +
          `지난 ${past.length}개월 같은 기간 평균 ${Math.round(avg).toLocaleString('ko-KR')}kg ` +
          `(매달 ${dayOfMonth}일까지로 맞춰 비교했습니다)`,
      })
    }
  }

  //  ── ② 수거 간격이 고른가 ────────────────────────────────────────────────
  //     ⚠ 「주 2회」로 계약했는데 실제로 9일에 한 번 오고 있으면, 그건 병원이
  //       **먼저 알아야 할** 사실입니다. 저희가 감출 이유가 없습니다.
  const recent = done.slice(0, 9).map((s) => s.date).sort()
  if (recent.length >= 4) {
    const gaps: number[] = []
    for (let i = 1; i < recent.length; i++) {
      gaps.push(
        Math.round(
          (new Date(recent[i]).getTime() - new Date(recent[i - 1]).getTime()) / 86_400_000,
        ),
      )
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const spread = Math.max(...gaps) - Math.min(...gaps)
    out.push({
      key: 'rhythm',
      tone: spread <= 3 ? 'flat' : 'note',
      title:
        spread <= 3
          ? `평균 ${Math.round(mean)}일 간격으로 고르게 수거되고 있습니다`
          : `수거 간격이 ${Math.min(...gaps)}~${Math.max(...gaps)}일로 들쭉날쭉합니다`,
      basis: `최근 수거 ${recent.length}건의 간격을 잰 값입니다 (평균 ${Math.round(mean)}일${
        client.collectionCycle ? ` · 계약 수거주기 ${client.collectionCycle}` : ''
      })`,
    })
  }

  //  ── ③ 지난달 대비 수거 횟수 ─────────────────────────────────────────────
  const lastYm = prevMonth(ym)
  const a = byMonth.get(lastYm)
  const b = byMonth.get(prevMonth(lastYm))
  if (a && b && a.visits !== b.visits) {
    out.push({
      key: 'visits',
      tone: a.visits > b.visits ? 'up' : 'down',
      title: `${lastYm.slice(5)}월 수거 횟수는 ${a.visits}회로, 전달보다 ${
        Math.abs(a.visits - b.visits)
      }회 ${a.visits > b.visits ? '많았습니다' : '적었습니다'}`,
      basis: `${prevMonth(lastYm).slice(5)}월 ${b.visits}회 → ${lastYm.slice(5)}월 ${a.visits}회 (완료된 수거만 셌습니다)`,
    })
  }

  //  ── ④ 배출자 교육 ──────────────────────────────────────────────────────
  //     ⚠ 안 적혀 있으면 「안 했다」가 아니라 **모른다**입니다. 그렇게 적습니다.
  if (client.educationAt) {
    const months = Math.floor(
      (new Date(now).getTime() - new Date(client.educationAt).getTime()) / 86_400_000 / 30.4,
    )
    if (months >= 10) {
      out.push({
        key: 'edu',
        tone: 'note',
        title: `배출자 교육을 받으신 지 ${months}개월 되었습니다`,
        basis: `마지막 교육일 ${client.educationAt} 기준입니다. 교육이 필요하시면 문의하기로 남겨 주세요.`,
      })
    }
  }

  if (out.length > 0) return { items: out, why: null }

  //  ── 말할 것이 없을 때 ──────────────────────────────────────────────────
  //     빈 칸에 아무 말이나 채우지 않습니다. **왜** 아직 없는지만 적습니다.
  const why =
    done.length === 0
      ? '아직 수거 기록이 없습니다. 첫 수거가 끝나면 여기에 배출량 추이가 표시됩니다.'
      : weighed.length === 0
        ? '수거는 있었지만 무게가 기록된 건이 아직 없어 추이를 계산할 수 없습니다.'
        : `추이를 말하려면 최소 ${MIN_MONTHS}개월치 기록이 필요합니다. 지금은 ${byMonth.size}개월치입니다.`
  return { items: out, why }
}
