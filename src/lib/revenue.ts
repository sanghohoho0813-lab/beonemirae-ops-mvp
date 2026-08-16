import type { AppData } from '../types'
import { settlementFor } from './billing'
import { outstandingTotal } from './selectors'
import { thisMonth } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 회사 매출 — 한 달에 하나의 값
//
//  전에는 같은 달의 매출이 화면마다 달랐습니다.
//
//   경영 요약 · 통계   완료된 수거 기록 × 지금 단가로 **다시 계산**한 값
//   미수금 · 월말 청구 **확정한 청구**의 합계
//   엑셀 월 실적       저장은 했는데 회사 매출에는 **안 들어감**
//
//  그래서 명세서에 날짜가 없어 월 합계만 넘어온 거래처(오남한양·남양주백)는
//  회사 매출에서 통째로 빠졌습니다. 대표님이 보시는 매출이 실제보다
//  작았습니다.
//
//  ── 규칙: 거래처 × 월 마다 딱 하나 ────────────────────────────────────
//
//   1. 직접입력·조정   사람이 사유를 적어 넣은 값 (0038)
//   2. 확정            그 달 확정한 청구 합계 (취소 제외)
//   3. Excel 실적      가져온 월 합계
//   4. 추정            완료된 수거·공급 × 단가 (아직 확정 전)
//
//   위에서부터 처음 만나는 것 하나만 씁니다. 회사 월 매출은 거래처별
//   채택값의 합입니다. **한 거래처의 한 달은 어느 경우에도 한 번만
//   더해집니다** — 중복 집계가 구조적으로 불가능합니다.
//
//   화면은 채택한 출처를 그대로 표시합니다. 추정을 실제처럼 보여 주지
//   않습니다.
//
//  ── 진행 중인 달은 평균에 넣지 않습니다 ────────────────────────────────
//
//   8월 15일에 8월 매출은 아직 절반입니다. 그 달을 평균에 넣으면 월평균이
//   실제보다 낮게 나오고, 거기에 12를 곱한 예상 연매출은 더 낮아집니다.
//   그래서 평균과 예상은 **끝난 달**만 씁니다.
//
//  ── 예상 연매출은 예측이 아닙니다 ──────────────────────────────────────
//
//   「최근 끝난 N개월 실제 평균 × 12」입니다. N 과 쓴 기간을 화면에 그대로
//   적습니다. 근거가 모자라면(끝난 달 3개 미만) 계산하지 않습니다 — 한 달
//   실적으로 연매출을 말하면 틀린 숫자가 경영 판단에 들어갑니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 달 이 거래처의 매출이 어디서 온 값인지 */
export type RevenueSource = '직접입력' | '확정' | 'Excel 실적' | '추정'

/** 출처 우선순위 — 위에서부터 처음 만나는 것 하나만 */
export const SOURCE_ORDER: RevenueSource[] = ['직접입력', '확정', 'Excel 실적', '추정']

export const SOURCE_WHY: Record<RevenueSource, string> = {
  직접입력: '사람이 사유를 적어 직접 넣은 금액입니다',
  확정: '그 달 확정한 청구 금액입니다 — 병원에 나간 금액과 같습니다',
  'Excel 실적': '엑셀 정산 시트에서 가져온 그 달 합계입니다',
  추정: '완료된 수거·공급을 지금 단가로 계산한 값입니다 — 아직 확정 전입니다',
}

export interface ClientMonthRevenue {
  clientId: string
  clientName: string
  month: string
  amount: number
  source: RevenueSource
  /** 직접입력일 때의 사유 */
  reason?: string
  /** 직접입력이 다른 값을 덮고 있으면, 덮인 값과 그 출처 */
  replaced?: { amount: number; source: RevenueSource }
}

export interface MonthRevenue {
  month: string
  total: number
  rows: ClientMonthRevenue[]
  /** 출처별 합계 — 이 달 숫자가 무엇으로 이루어졌는지 */
  bySource: Record<RevenueSource, number>
  /** 아직 끝나지 않은 달인가 (이번 달) */
  partial: boolean
}

const nameMapOf = (data: AppData) =>
  new Map([...data.clients, ...(data.retiredClients ?? [])].map((c) => [c.id, c.name]))

/**
 * 그 달, 그 거래처의 매출 후보들.
 *  값이 0 이하인 후보는 「없는 것」으로 봅니다 — 0원짜리 확정 청구는
 *  만들어지지 않고, 엑셀 0원 줄은 그 달 거래가 없었다는 뜻입니다.
 */
function candidatesOf(
  data: AppData,
  clientId: string,
  month: string,
): Array<{ source: RevenueSource; amount: number; reason?: string }> {
  const out: Array<{ source: RevenueSource; amount: number; reason?: string }> = []

  const ov = (data.revenueOverrides ?? []).find((o) => o.clientId === clientId && o.month === month)
  //  조정은 0원도 뜻이 있습니다 — 「이 달은 매출이 없다」를 사람이 확인한 것.
  if (ov) out.push({ source: '직접입력', amount: ov.amount, reason: ov.reason })

  const billed = data.payments
    .filter((p) => p.clientId === clientId && p.billingMonth === month && p.status !== '취소')
    .reduce((s, p) => s + p.amount, 0)
  if (billed > 0) out.push({ source: '확정', amount: billed })

  const xl = (data.monthlyActuals ?? []).find((m) => m.clientId === clientId && m.month === month)
  if (xl && xl.revenue > 0) out.push({ source: 'Excel 실적', amount: Math.round(xl.revenue) })

  const est = settlementFor(data, clientId, month)
  if (est.revenue > 0) out.push({ source: '추정', amount: Math.round(est.revenue) })

  return out
}

/** 그 달 회사 매출 — 거래처마다 하나씩만 채택해 더합니다 */
export function monthRevenue(data: AppData, month: string): MonthRevenue {
  const names = nameMapOf(data)
  const rows: ClientMonthRevenue[] = []
  const bySource: Record<RevenueSource, number> = {
    직접입력: 0, 확정: 0, 'Excel 실적': 0, 추정: 0,
  }

  for (const [clientId, clientName] of names) {
    const cands = candidatesOf(data, clientId, month)
    if (cands.length === 0) continue
    //  우선순위대로 하나만
    const picked = SOURCE_ORDER.map((s) => cands.find((c) => c.source === s)).find(Boolean)!
    //  조정이 무엇을 덮고 있는지 — 화면이 그대로 보여 줍니다
    const under = picked.source === '직접입력' ? cands.find((c) => c.source !== '직접입력') : undefined

    rows.push({
      clientId,
      clientName,
      month,
      amount: picked.amount,
      source: picked.source,
      reason: picked.reason,
      replaced: under ? { amount: under.amount, source: under.source } : undefined,
    })
    bySource[picked.source] += picked.amount
  }

  rows.sort((a, b) => b.amount - a.amount || a.clientName.localeCompare(b.clientName, 'ko'))
  return {
    month,
    total: rows.reduce((s, r) => s + r.amount, 0),
    rows,
    bySource,
    partial: month >= thisMonth(),
  }
}

/** 'YYYY-MM' 을 n 개월 뒤로 (음수면 과거) */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export interface MonthPoint {
  month: string
  total: number
  partial: boolean
}

/** 최근 n 개월 추이 (오래된 달부터) */
export function revenueTrend(data: AppData, n = 12, from = thisMonth()): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = shiftMonth(from, -i)
    const r = monthRevenue(data, m)
    out.push({ month: m, total: r.total, partial: r.partial })
  }
  return out
}

export interface RevenueSummary {
  /** 올해 1월부터 이번 달까지의 합 */
  ytd: number
  /** 올해 몇 개월치가 들어 있는지 (값이 있는 달) */
  ytdMonths: number
  /** 이번 달이 아직 진행 중이라 ytd 에 절반만 들어 있는가 */
  ytdPartial: boolean
  /** 끝난 달만의 월평균. 근거가 모자라면 null */
  average: number | null
  /** 평균에 쓴 달 (오래된 달부터) */
  averageMonths: string[]
  /** 월평균 × 12. 평균이 없으면 null */
  projection: number | null
  /** 예상 연매출 산식 — 화면에 그대로 적습니다 */
  formula: string
  /** 지금 못 받은 돈 */
  outstanding: number
  /** 이번 달까지의 추이 */
  trend: MonthPoint[]
  /**
   * 확정 신고를 바탕으로 한 올해 숫자 (없으면 null).
   *
   *  있으면 `ytd`·`average`·`projection` 이 **이 값 기준**으로 계산됩니다.
   *  없으면 지금까지처럼 시스템 집계만 씁니다.
   */
  declared: DeclaredBasis | null
}

/**
 * 국세청에 **확정 신고**한 기간이 올해에 있으면, 그 기간의 매출은
 * 시스템 집계 대신 신고액을 씁니다.
 *
 *  왜 이렇게 하는가 —
 *   거래처가 아직 시스템에 다 들어오지 않았습니다. 그래서 시스템이 스스로
 *   센 올해 매출은 실제의 몇 분의 일입니다(실측: 상반기 시스템 약 2,800만원
 *   대 실제 신고 4억 5,387만원). 그 숫자를 「올해 누적매출」이라고 크게
 *   띄우면 대표님이 회사를 실제의 6분의 1로 보게 됩니다.
 *
 *  지키는 선 —
 *   · **사람이 확정으로 확인한 신고만** 씁니다. 확정 전 값은 안 씁니다.
 *   · 신고액을 6으로 나눠 월별 막대를 채우지 **않습니다** — 우리에게 없는
 *     월별 내역을 지어내는 것이 됩니다. 막대그래프는 시스템 값 그대로입니다.
 *   · 신고 기간 **뒤의** 달은 섞지 않고 따로 보여 줍니다. 전체 자료(4.5억)와
 *     일부 자료(수백만원)를 더하면 「7월에 매출이 90% 줄었다」로 읽힙니다.
 */
export interface DeclaredBasis {
  /** 확정 신고로 덮은 기간의 매출 합 */
  total: number
  /** 그 기간의 개월 수 */
  months: number
  /** 'YYYY-MM' — 덮은 마지막 달 */
  lastMonth: string
  /** 화면에 그대로 나가는 근거 */
  label: string
  /** 신고 기간 뒤부터 지금까지 시스템이 센 값 (섞지 않고 따로) */
  afterTotal: number
  /** 그 기간 표시 — '7~8월' */
  afterLabel: string
}

/** 평균을 내려면 끝난 달이 최소 몇 개 있어야 하는가 */
export const MIN_MONTHS_FOR_AVERAGE = 3
/** 평균에 쓰는 최대 개월 수 */
export const AVERAGE_WINDOW = 6

/**
 * 대표가 보는 경영 숫자.
 *
 *  월평균 — **끝난 달**만 씁니다. 진행 중인 달을 넣으면 평균이 실제보다
 *  낮아지고, 거기에 12 를 곱한 예상 연매출은 더 낮아집니다.
 *  매출이 0 인 달(거래가 없던 달)은 평균에서 뺍니다 — 시스템을 쓰기 전의
 *  빈 달까지 세면 평균이 반토막 납니다.
 */
export function revenueSummary(data: AppData, now = thisMonth()): RevenueSummary {
  const year = now.slice(0, 4)
  const trend = revenueTrend(data, 12, now)

  //  ── 확정 신고가 올해를 덮고 있는가 ──────────────────────────────────────
  //   사람이 「확정」이라고 확인해 준 신고만 봅니다. 확정 전 값은 안 씁니다.
  const declaredFilings = (data.taxFilings ?? [])
    .filter((f) => f.confirmedAt != null && f.periodFrom.slice(0, 4) === year)
    .filter((f) => f.periodTo.slice(0, 7) <= now)
    .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))

  let declared: DeclaredBasis | null = null
  if (declaredFilings.length > 0) {
    const last = declaredFilings[declaredFilings.length - 1]
    const lastMonth = last.periodTo.slice(0, 7)
    const total = declaredFilings.reduce((sum, f) => sum + f.baseTotal, 0)
    //  실제 개월 수를 셉니다 — 반기라고 6 을 박지 않습니다.
    const months = declaredFilings.reduce((sum, f) => {
      const a = Number(f.periodFrom.slice(0, 4)) * 12 + Number(f.periodFrom.slice(5, 7))
      const b = Number(f.periodTo.slice(0, 4)) * 12 + Number(f.periodTo.slice(5, 7))
      return sum + (b - a + 1)
    }, 0)

    //  신고 기간 **뒤의** 달 — 더하지 않고 따로 셉니다.
    const afterMonths: string[] = []
    let mm = shiftMonth(lastMonth, 1)
    while (mm <= now) {
      afterMonths.push(mm)
      mm = shiftMonth(mm, 1)
    }
    const afterTotal = afterMonths.reduce((sum, x) => sum + monthRevenue(data, x).total, 0)

    declared = {
      total,
      months,
      lastMonth,
      label:
        declaredFilings.length === 1
          ? `${year}년 ${Number(last.periodFrom.slice(5, 7)) <= 6 ? '상반기' : '하반기'} 국세청 신고 기준 (확정)`
          : `${year}년 국세청 신고 기준 ${months}개월 (확정)`,
      afterTotal,
      afterLabel: afterMonths.length
        ? afterMonths.length === 1
          ? `${Number(afterMonths[0].slice(5, 7))}월`
          : `${Number(afterMonths[0].slice(5, 7))}~${Number(afterMonths[afterMonths.length - 1].slice(5, 7))}월`
        : '',
    }
  }

  //  올해 누적 — 1월부터 이번 달까지
  const ytdPoints: MonthPoint[] = []
  for (let m = 1; m <= Number(now.slice(5, 7)); m += 1) {
    const mm = `${year}-${String(m).padStart(2, '0')}`
    const r = monthRevenue(data, mm)
    ytdPoints.push({ month: mm, total: r.total, partial: r.partial })
  }
  const ytd = ytdPoints.reduce((s, p) => s + p.total, 0)
  const withValue = ytdPoints.filter((p) => p.total > 0)

  //  평균 — 이번 달을 뺀, 값이 있는 최근 달들
  const closed = revenueTrend(data, AVERAGE_WINDOW + 1, shiftMonth(now, -1))
    .filter((p) => !p.partial && p.total > 0)
    .slice(-AVERAGE_WINDOW)

  const enough = closed.length >= MIN_MONTHS_FOR_AVERAGE
  const average = enough
    ? Math.round(closed.reduce((s, p) => s + p.total, 0) / closed.length)
    : null
  const projection = average == null ? null : average * 12

  const formula = enough
    ? `최근 끝난 ${closed.length}개월(${closed[0].month} ~ ${closed[closed.length - 1].month}) 실제 평균 × 12`
    : `끝난 달이 ${closed.length}개월뿐입니다 — ${MIN_MONTHS_FOR_AVERAGE}개월이 쌓이면 계산합니다`

  //  ── 확정 신고가 있으면 그것이 기준입니다 ────────────────────────────────
  //   숫자 셋(누적·월평균·예상)을 **한 출처로만** 냅니다. 4.5억(전체 자료)과
  //   수백만원(일부 자료)을 섞으면 어느 쪽도 아닌 값이 나옵니다.
  if (declared) {
    const dAvg = declared.months > 0 ? Math.round(declared.total / declared.months) : null
    return {
      ytd: declared.total,
      ytdMonths: declared.months,
      ytdPartial: false,
      average: dAvg,
      averageMonths: [],
      projection: dAvg == null ? null : dAvg * 12,
      formula: `${declared.label} 월평균 × 12`,
      outstanding: outstandingTotal(data),
      trend,
      declared,
    }
  }

  return {
    ytd,
    ytdMonths: withValue.length,
    ytdPartial: ytdPoints.some((p) => p.partial && p.total > 0),
    average,
    averageMonths: closed.map((p) => p.month),
    projection,
    formula,
    outstanding: outstandingTotal(data),
    trend,
    declared: null,
  }
}
