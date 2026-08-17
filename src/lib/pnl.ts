import type { AppData, CostCategoryName, OperatingCost, WasteType } from '../types'
import { rollupFor, type MonthlyRollup, type Settlement } from './billing'
import { isDone } from './scheduleLive'

// ─────────────────────────────────────────────────────────────────────────────
// 월 손익 — 기여이익에서 영업이익까지
//
//  지금까지의 「기여이익」은 매출 − 처리비 − 자재비 였습니다. 기사 인건비와
//  유류비가 빠져 있어 실제보다 큽니다. 그 이익률로 단가를 정하면 남는 줄
//  알았던 거래처가 실제로는 적자일 수 있습니다.
//
//  무엇이 실제 값이고 무엇이 추정인지
//
//   매출·처리비·자재비   완료된 수거·공급 기록과 거래처 단가로 계산 (실제)
//   운영비               대표님이 넣은 그 달 실제 지출 (실제 · 0030)
//   영업이익             위 둘의 뺄셈 (실제)
//   거래처별 배부        회사 운영비를 거래처에 나눈 값 (**추정**)
//
//  지키는 것
//
//   · 운영비를 넣지 않은 달은 영업이익을 **계산하지 않습니다**(null).
//     0원으로 두면 「영업이익 = 기여이익」이 되어 이익을 부풀립니다.
//   · 배부는 기준을 반드시 함께 돌려줍니다. 화면이 그 기준을 그대로
//     적습니다 — 어떻게 나눈 값인지 모르면 쓸 수 없는 숫자입니다.
//   · 배부 결과는 정산서·거래명세서·청구에 들어가지 않습니다. 계약은
//     계약이고, 배부는 회사 내부의 판단 재료입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 운영비 항목 — DB check 제약과 같은 목록 (0030) */
export const COST_CATEGORIES = [
  '인건비',
  '유류비',
  '차량 유지비',
  '임차료·수수료',
  '기타 운영비',
] as const

export type CostCategory = CostCategoryName

/** 항목마다 무엇을 넣는 자리인지 — 화면에 그대로 씁니다 */
export const COST_HINT: Record<CostCategory, string> = {
  인건비: '기사·사무 급여 · 4대보험 · 상여',
  유류비: '경유 · 요소수 · 통행료',
  '차량 유지비': '보험 · 정비 · 검사 · 리스/할부',
  '임차료·수수료': '사무실·차고지 임차료 · 지급수수료 · 통신비',
  '기타 운영비': '위에 넣기 어려운 나머지',
}

/** 거래처에 운영비를 나누는 기준 */
export type AllocBasis = 'visits' | 'kg'

export const ALLOC_LABEL: Record<AllocBasis, string> = {
  visits: '방문 횟수 비중',
  kg: '수거량(kg) 비중',
}

export const ALLOC_WHY: Record<AllocBasis, string> = {
  visits:
    '차가 한 번 가는 데 드는 비용(기사 시간·유류)이 운영비의 큰 부분이라, 방문이 잦은 곳에 더 많이 나눕니다.',
  kg: '처리·운반 부담이 무게에 비례한다고 보고 나눕니다. 적은 양을 자주 가는 곳은 실제보다 적게 잡힙니다.',
}

/** 거래처 한 곳의 배부 결과 (추정) */
export interface AllocatedRow extends Settlement {
  /** 이 거래처에 나눈 운영비 (추정) */
  allocated: number
  /** 기여이익 − 배부 운영비 (추정) */
  operatingProfit: number
  /** 배부의 근거가 된 값 (방문 횟수 또는 kg) */
  weight: number
  /** 전체 대비 비중 (0~1) */
  share: number
}

export interface MonthlyPnl {
  month: string
  /** 매출·직접비·기여이익 (실제 기록) */
  rollup: MonthlyRollup
  /** 그 달 운영비 항목 */
  costs: OperatingCost[]
  /** 운영비 합계. 입력이 없으면 null */
  operatingCost: number | null
  /** 영업이익 = 기여이익 − 운영비. 운영비 입력이 없으면 null */
  operatingProfit: number | null
  /** 영업이익률. 매출이 0이거나 운영비 입력이 없으면 null */
  operatingMargin: number | null
  /** 아직 넣지 않은 항목 (화면에서 「이만큼 빠져 있습니다」로 씁니다) */
  missing: CostCategory[]
}

/** 그 달의 회사 손익 */
export function monthlyPnl(data: AppData, month: string): MonthlyPnl {
  const rollup = rollupFor(data, month)
  const costs = (data.operatingCosts ?? [])
    .filter((c) => c.month === month)
    .sort((a, b) => COST_CATEGORIES.indexOf(a.category) - COST_CATEGORIES.indexOf(b.category))

  const entered = new Set(costs.map((c) => c.category))
  const missing = COST_CATEGORIES.filter((c) => !entered.has(c))

  //  한 항목도 넣지 않았으면 영업이익을 만들지 않습니다.
  //  (0원으로 두면 기여이익이 그대로 영업이익이 되어 이익을 부풀립니다)
  const hasAny = costs.length > 0
  const operatingCost = hasAny ? costs.reduce((s, c) => s + c.amount, 0) : null
  const operatingProfit = operatingCost == null ? null : rollup.profit - operatingCost

  return {
    month,
    rollup,
    costs,
    operatingCost,
    operatingProfit,
    operatingMargin:
      operatingProfit == null || rollup.revenue <= 0 ? null : operatingProfit / rollup.revenue,
    missing,
  }
}

/** 그 달 거래처별 방문 횟수 / 수거량 — 배부의 근거값 */
function weightsOf(data: AppData, month: string, basis: AllocBasis): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of data.schedules) {
    if (!s.date.startsWith(month) || !isDone(s)) continue
    const add = basis === 'visits' ? 1 : (s.actualAmount ?? 0)
    out.set(s.clientId, (out.get(s.clientId) ?? 0) + add)
  }
  return out
}

/**
 * 회사 운영비를 거래처에 나눕니다 — **추정치입니다.**
 *
 *  운영비는 회사 전체에 대해 발생하므로 어느 거래처 몫인지 원래는 알 수
 *  없습니다. 그래도 「어느 병원이 실제로 남는가」를 보려면 나눠 봐야
 *  합니다. 대신 기준을 밝히고, 이 값은 청구·명세서에 넣지 않습니다.
 *
 *  운영비 입력이 없는 달에는 빈 목록을 돌려줍니다 — 0원을 나눠 봐야
 *  기여이익과 같은 값이 나올 뿐입니다.
 */
export function allocate(
  data: AppData,
  month: string,
  basis: AllocBasis,
): { rows: AllocatedRow[]; basis: AllocBasis; total: number } | null {
  const pnl = monthlyPnl(data, month)
  if (pnl.operatingCost == null || pnl.rollup.rows.length === 0) return null

  const w = weightsOf(data, month, basis)
  const sum = pnl.rollup.rows.reduce((s, r) => s + (w.get(r.clientId) ?? 0), 0)

  //  근거값이 하나도 없으면(그 달 완료 수거가 없으면) 나누지 않습니다.
  //  매출 비중으로 나누면 모든 거래처가 똑같은 이익률로 보여 적자를 못 찾습니다.
  if (sum <= 0) return null

  const rows: AllocatedRow[] = pnl.rollup.rows.map((r) => {
    const weight = w.get(r.clientId) ?? 0
    const share = weight / sum
    const allocated = Math.round(pnl.operatingCost! * share)
    return { ...r, allocated, operatingProfit: r.profit - allocated, weight, share }
  })
  rows.sort((a, b) => a.operatingProfit - b.operatingProfit) // 적자부터 위로
  return { rows, basis, total: pnl.operatingCost }
}

/** 폐기물 구분별 그 달 완료 수거량 — 화면 보조 */
export function monthKgByType(data: AppData, month: string): Record<WasteType, number> {
  const out: Record<WasteType, number> = { 의료폐기물: 0, 일회용기저귀: 0 }
  for (const s of data.schedules) {
    if (!s.date.startsWith(month) || !isDone(s)) continue
    out[s.wasteType] += s.actualAmount ?? 0
  }
  return out
}
