import type { AppData, Schedule } from '../types'
import { supplyNeedsFor } from './supplyNeeds'
import { confoundingIn, type Confounding, type OpsChange } from './opsChanges'
import { isFieldSchedule } from './evidenceBase'

// ─────────────────────────────────────────────────────────────────────────────
// AX 증거 — 네 문장을 숫자로 만들 수 있는가
//
//   ① 같은 업무를 더 적은 시간으로 처리했다      → lib/performance.ts (이미 있음)
//   ② 기존 병원에서 새 상품매출이 실제 발생했다  → 여기 salesAx
//   ③ 같은 기사·차량으로 더 많은 거래처를 봤다   → 여기 capacityAx
//   ④ 병원이 전화·카톡 대신 직접 쓰기 시작했다   → 여기 customerAx
//
// ── 이 파일이 지키는 것 ──────────────────────────────────────────────────────
//
//  1. **새 표를 만들지 않습니다.** 전부 이미 저장돼 있는 것으로 셉니다 —
//     product_orders · product_order_items · payments.snapshot.orderIds ·
//     payment_receipts · client_requests.source · schedules · materials.
//     같은 뜻의 값을 「보여 주려고」 다시 저장하지 않습니다.
//
//  2. **주문요청 ≠ 매출, 전달 ≠ 입금.** 네 단계를 절대 한 숫자로 합치지
//     않습니다. 주문이 들어온 것과 돈이 들어온 것은 다른 일입니다.
//
//         주문 접수 → 전달 완료 → 청구 확정 → 입금 완료
//
//  3. **셀 수 없으면 null 입니다.** 0 으로 바꾸지 않습니다. 0 은 「해 봤는데
//     없었다」이고 null 은 「아직 못 셌다」입니다 — 심사 자리에서 이 둘을
//     섞으면 그때부터 모든 숫자를 의심받습니다.
//
//  4. **표본 수를 값과 함께 냅니다.** 3건짜리 숫자를 회사 성과처럼 키우지
//     않기 위해서입니다. 화면은 samples 를 보고 「측정 중」을 붙입니다.
//
//  5. **거리·시간은 계산하지 않습니다.** 거래처 좌표가 없습니다
//     (lib/routeEfficiency.ts 와 같은 원칙). 지어낸 km 는 판단을 망칩니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 숫자를 성과로 말해도 되는가 */
export type AxState =
  | 'ok' // 표본이 충분합니다
  | 'measuring' // 셌지만 표본이 적습니다 — 참고값
  | 'none' // 아직 셀 것이 없습니다
  | 'not-countable' // 이 자료로는 셀 수 없습니다 (무엇이 있어야 하는지 basis 에)

export const AX_STATE_LABEL: Record<AxState, string> = {
  ok: '측정값',
  measuring: '측정 중 (참고값)',
  none: '아직 없음',
  'not-countable': '이 화면에서는 셀 수 없음',
}

/** 이만큼은 있어야 「측정값」이라고 부릅니다 (그 아래는 참고값) */
export const AX_MIN_SAMPLES = 5

export interface AxNumber {
  key: string
  label: string
  unit: string
  /** null = 아직 못 셈. 0 과 다릅니다 */
  value: number | null
  /** 이 숫자가 몇 건에서 나왔는가 */
  samples: number
  state: AxState
  /** 어떻게 셌는지 한 줄 — 화면에 그대로 나갑니다 */
  basis: string
}

function num(
  key: string,
  label: string,
  unit: string,
  value: number | null,
  samples: number,
  basis: string,
): AxNumber {
  const state: AxState =
    value == null ? 'not-countable' : samples === 0 ? 'none' : samples < AX_MIN_SAMPLES ? 'measuring' : 'ok'
  return { key, label, unit, value, samples, state, basis }
}

// ── 기간 ─────────────────────────────────────────────────────────────────────
export interface AxPeriod {
  from: string
  to: string
}

const inPeriod = (d: string | null | undefined, p: AxPeriod) => !!d && d.slice(0, 10) >= p.from && d.slice(0, 10) <= p.to

// ═══ ② 매출 AX ═══════════════════════════════════════════════════════════════

/** 주문 하나가 어디까지 갔는가 — 네 단계는 절대 합치지 않습니다 */
export interface OrderStage {
  orderId: string
  clientId: string
  /** 주문이 들어온 날 */
  requestedOn: string
  ordered: true
  delivered: boolean
  /** 이 주문이 실제 확정 청구에 담겼는가 (payments.snapshot.orderIds) */
  billed: boolean
  /** 그 청구가 입금까지 끝났는가 */
  paid: boolean
  /** 이 주문의 판매액 · 원가 (주문 시점 단가로 굳어 있습니다) */
  revenue: number
  cost: number
  /** 병원이 직접 올렸는가 */
  fromPortal: boolean
  /** 이 주문의 품목 중 그 시점에 추천되고 있던 것 (추천과 같은 키) */
  matchedNeeds: string[]
  itemStockKeys: string[]
}

const STOCK_KEYS: string[] = ['corrugated_box', 'plastic_container', 'bag', 'needle_box']

/**
 * 주문 품목 하나를 **추천과 같은 키**로 바꿉니다.
 *
 *  ⚠ 추천(supplyNeeds)과 주문이 서로 다른 키를 쓰면 전환율이 통째로
 *    틀립니다 — 같은 물건인데 안 겹치는 것으로 세게 됩니다.
 *    키를 만드는 규칙은 두 곳이 **같아야** 합니다.
 *      재고 네 칸       stockKey 그대로
 *      재고 안 두는 상품 `product:<상품 id>`
 *  둘 다 아니면(상품 id 도 없으면) 무엇인지 알 수 없어 세지 않습니다.
 */
function needKeyOfItem(it: { stockKey: string | null; productId: string | null }): string | null {
  if (it.stockKey && STOCK_KEYS.includes(it.stockKey)) return it.stockKey
  if (it.productId) return `product:${it.productId}`
  return null
}

/**
 * 그 주문일 시점의 추천을 **다시 계산**합니다.
 *
 *  추천을 따로 저장해 두지 않았습니다 — 그리고 저장할 필요도 없습니다.
 *  supplyNeedsFor 는 「그날까지의 자재 공급 기록」만 보는 결정적 함수라,
 *  그날 이후 기록을 빼고 다시 돌리면 **그날 화면에 떠 있던 추천이 그대로**
 *  나옵니다. 같은 뜻의 값을 새 표에 또 저장하지 않는 쪽을 골랐습니다.
 *
 *  ⚠ 그날 이후에 들어온 공급 기록은 반드시 빼야 합니다. 안 빼면 「그날은
 *    아직 몰랐던 것」을 알고 있었던 것처럼 계산하게 됩니다.
 */
export function needsAsOf(data: AppData, clientId: string, on: string) {
  const past: AppData = {
    ...data,
    materials: (data.materials ?? []).filter((m) => m.date <= on),
    //  ⚠ 일정도 통째로 비웁니다.
    //
    //   추천 문구에는 「다음 수거 ○월 ○일」이 붙는데, 그 예정이 **그날
    //   실제로 잡혀 있었는지**는 알 방법이 없습니다(만든 시각을 안 남깁니다).
    //   그래서 되짚을 때는 아예 모르는 것으로 둡니다 — 몰랐던 것을 알았던
    //   것처럼 세지 않기 위해서입니다.
    //   전환율 계산에 쓰는 것은 **어떤 품목이 추천됐는가**뿐이라 결과는
    //   달라지지 않습니다(다음 수거일은 문구와 정렬에만 씁니다).
    schedules: [],
    //  ⚠ 추천은 이제 **전달 완료한 주문**도 사용 이력으로 봅니다(그게 실제로
    //    병원에 들어간 물량이니까요). 되짚을 때 그날 이후 전달분이 섞이면,
    //    그날은 아직 안 받은 물건을 「이미 받았다」로 세게 됩니다.
    productOrders: (data.productOrders ?? []).filter(
      (o) => !o.deliveredAt || o.deliveredAt.slice(0, 10) <= on,
    ),
  }
  return supplyNeedsFor(past, clientId, on)
}

function paidFully(paymentId: string, amount: number, data: AppData, status: string): boolean {
  if (status === '입금완료') return true
  const got = (data.receipts ?? [])
    .filter((r) => r.paymentId === paymentId)
    .reduce((s, r) => s + r.amount, 0)
  return amount > 0 && got >= amount
}

export function orderStages(data: AppData, period: AxPeriod): OrderStage[] {
  const orders = (data.productOrders ?? []).filter(
    (o) => o.status !== '취소' && inPeriod(o.requestedAt, period),
  )
  //  주문 id → 그 주문을 담은 확정 청구 (취소된 청구는 담은 것으로 치지 않습니다)
  const billedBy = new Map<string, { id: string; amount: number; status: string }>()
  for (const p of data.payments ?? []) {
    if (p.canceledAt) continue
    for (const oid of p.snapshot?.orderIds ?? []) {
      billedBy.set(oid, { id: p.id, amount: p.amount, status: p.status })
    }
  }

  return orders.map((o): OrderStage => {
    const revenue = o.items.reduce((s, it) => s + it.unitPrice * it.qty, 0)
    const cost = o.items.reduce((s, it) => s + it.unitCost * it.qty, 0)
    const bill = billedBy.get(o.id)
    const requestedOn = o.requestedAt.slice(0, 10)
    const itemStockKeys = [...new Set(o.items.map(needKeyOfItem).filter((k): k is string => !!k))]
    const wasNeeded = new Set(needsAsOf(data, o.clientId, requestedOn).needs.map((n) => n.key))
    return {
      orderId: o.id,
      clientId: o.clientId,
      requestedOn,
      ordered: true,
      delivered: o.status === '전달완료' && !!o.deliveredAt,
      billed: !!bill,
      paid: !!bill && paidFully(bill.id, bill.amount, data, bill.status),
      revenue,
      cost,
      fromPortal: o.source === 'portal',
      matchedNeeds: itemStockKeys.filter((k) => wasNeeded.has(k)),
      itemStockKeys,
    }
  })
}

export interface SalesAx {
  period: AxPeriod
  stages: OrderStage[]
  /** 단계별 건수 — 합치지 않습니다 */
  funnel: { ordered: number; delivered: number; billed: number; paid: number }
  numbers: AxNumber[]
}

/**
 * 추천 → 주문 전환율.
 *
 *  분모를 「추천이 떠 있던 병원×품목」으로 잡습니다. 추천은 날마다 조금씩
 *  바뀌므로, **기간 안을 7일 간격으로 되짚어** 한 번이라도 떠 있던 조합을
 *  모읍니다. 이 재현 주기는 화면에 그대로 적습니다 — 분모를 어떻게 세었는지
 *  모르면 전환율은 아무 뜻이 없습니다.
 */
export const RECALL_STEP_DAYS = 7

function shift(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface NeedConversion {
  /** 기간 안에 한 번이라도 추천이 떠 있던 (병원×품목) 조합 수 */
  recommended: number
  /** 그중 실제 주문으로 이어진 조합 수 */
  converted: number
  /** 되짚어 본 시점 수 */
  checkpoints: number
}

export function needConversion(data: AppData, period: AxPeriod): NeedConversion {
  const clients = (data.clients ?? []).map((c) => c.id)
  const seen = new Set<string>()
  let checkpoints = 0
  for (let d = period.from; d <= period.to; d = shift(d, RECALL_STEP_DAYS)) {
    checkpoints += 1
    for (const cid of clients) {
      for (const n of needsAsOf(data, cid, d).needs) seen.add(`${cid}|${n.key}`)
    }
  }
  const orderedPairs = new Set<string>()
  for (const o of data.productOrders ?? []) {
    if (o.status === '취소') continue
    if (!inPeriod(o.requestedAt, period)) continue
    for (const it of o.items) {
      const k = needKeyOfItem(it)
      if (k) orderedPairs.add(`${o.clientId}|${k}`)
    }
  }
  let converted = 0
  for (const k of seen) if (orderedPairs.has(k)) converted += 1
  return { recommended: seen.size, converted, checkpoints }
}

export interface RecoAdoption {
  /** 노출 기록 표를 읽을 수 있었는가 (판 106) */
  available: boolean
  shown: number
  adopted: number
  ruleVersions: string[]
}

/**
 * 노출 → 채택. 병원 화면에 추천이 떠 있던 기록(recommendation_views)과, 그 뒤
 * 같은 병원의 주문에 그 품목이 담겼는지를 봅니다.
 *
 *  ⚠ 노출 이전의 주문은 채택이 아닙니다. 「보고 나서」 주문한 것만 셉니다.
 */
export function recommendationAdoption(data: AppData, period: AxPeriod): RecoAdoption {
  const views = data.recommendationViews
  if (views === undefined) return { available: false, shown: 0, adopted: 0, ruleVersions: [] }
  const firstShown = new Map<string, string>()
  const versions = new Set<string>()
  for (const v of views) {
    if (v.action !== 'shown' || !inPeriod(v.shownOn, period)) continue
    if (v.ruleVersion) versions.add(v.ruleVersion)
    for (const it of v.items) {
      const k = `${v.clientId}|${it.key}`
      const cur = firstShown.get(k)
      if (!cur || v.shownAt < cur) firstShown.set(k, v.shownAt)
    }
  }
  const adopted = new Set<string>()
  for (const o of data.productOrders ?? []) {
    if (o.status === '취소' || o.canceledAt) continue
    if (!inPeriod(o.requestedAt, period)) continue
    for (const it of o.items) {
      const key = needKeyOfItem(it)
      if (!key) continue
      const k = `${o.clientId}|${key}`
      const at = firstShown.get(k)
      if (at && o.requestedAt >= at) adopted.add(k)
    }
  }
  return { available: true, shown: firstShown.size, adopted: adopted.size, ruleVersions: [...versions].sort() }
}

export function salesAx(data: AppData, period: AxPeriod): SalesAx {
  const stages = orderStages(data, period)
  const delivered = stages.filter((s) => s.delivered)
  const billed = stages.filter((s) => s.billed)
  const paid = stages.filter((s) => s.paid)

  //  ⚠ 매출은 **전달 완료**부터 셉니다. 주문만 들어온 것은 매출이 아닙니다.
  const revenue = delivered.reduce((s, x) => s + x.revenue, 0)
  const cost = delivered.reduce((s, x) => s + x.cost, 0)
  const paidRevenue = paid.reduce((s, x) => s + x.revenue, 0)

  const buyers = new Set(delivered.map((s) => s.clientId))
  //  재구매 — 기간과 무관하게 **그 거래처의 두 번째 이후 주문**입니다.
  //  한 번은 호의이고 두 번째부터가 매출입니다.
  const firstOrderOf = new Map<string, string>()
  for (const o of (data.productOrders ?? []).filter((x) => x.status !== '취소')) {
    const cur = firstOrderOf.get(o.clientId)
    if (!cur || o.requestedAt < cur) firstOrderOf.set(o.clientId, o.requestedAt)
  }
  const repeatBuyers = new Set(
    delivered.filter((s) => {
      const first = firstOrderOf.get(s.clientId)
      const order = (data.productOrders ?? []).find((o) => o.id === s.orderId)
      return !!first && !!order && order.requestedAt > first
    }).map((s) => s.clientId),
  )

  //  전체 매출 대비 — 분모는 **확정된 수거 청구액**입니다. 소모품 매출과
  //  수거 매출을 같은 칸에 더하지 않고, 비중만 냅니다.
  const collectRevenue = (data.payments ?? [])
    .filter((p) => !p.canceledAt && p.status !== '취소' && inPeriod(`${p.billingMonth}-01`, {
      from: period.from.slice(0, 7) + '-01',
      to: period.to,
    }))
    .reduce((s, p) => s + p.amount, 0)

  const conv = needConversion(data, period)
  const itemsCounted = stages.reduce((s, x) => s + x.itemStockKeys.length, 0)
  const itemsMatched = stages.reduce((s, x) => s + x.matchedNeeds.length, 0)

  //  ── 실제 노출 기록 (판 106) — 「병원이 실제로 봤다」는 이것뿐입니다 ────
  //   되짚어 계산한 일치(needHit)와 다릅니다. 노출 기록이 없으면 채택률을
  //   내지 않고 「표 없음」이라고 말합니다. 과거 노출을 소급해 만들지 않습니다.
  const reco = recommendationAdoption(data, period)

  //  청구 확정 · 입금 — 전달 완료 매출과 **따로** 둡니다.
  const billedRevenue = billed.reduce((s, x) => s + x.revenue, 0)

  const numbers: AxNumber[] = [
    num('orders', '주문 건수', '건', stages.length, stages.length, '취소하지 않은 소모품 주문 (요청일 기준)'),
    num('deliveredOrders', '전달 완료 주문', '건', delivered.length, stages.length,
      '주문 중 실제로 전달까지 끝난 건 — **여기서부터 매출입니다**'),
    num('revenue', '소모품 판매매출', '원', delivered.length ? revenue : 0, delivered.length,
      '전달 완료 주문의 주문시점 판매단가 × 수량. 주문만 들어온 건은 넣지 않습니다'),
    num('cost', '판매 원가', '원', delivered.length ? cost : 0, delivered.length,
      '같은 주문의 주문시점 매입단가 × 수량'),
    num('profit', '판매 매출총이익 (매출 − 원가)', '원', delivered.length ? revenue - cost : 0, delivered.length,
      '판매매출 − 판매원가 (전달 완료 기준). ⚠ 운영비(인건비·유류비 등)를 뺀 이익이 아닙니다 — 그것은 통계 → 경영 요약에 있습니다'),
    num('billedRevenue', '청구 확정에 담긴 금액', '원', billed.length ? billedRevenue : 0, billed.length,
      '전달 완료 주문 중 확정 청구(월말 청구)에 실제로 들어간 것의 판매액. 매출 ≠ 청구입니다'),
    num('paidRevenue', '입금까지 끝난 금액', '원', paid.length ? paidRevenue : 0, paid.length,
      '⚠ 청구 ≠ 입금입니다. 그 주문이 담긴 청구가 실제로 입금 완료된 것만'),
    num('buyers', '구매 병원 수', '곳', buyers.size, delivered.length, '전달 완료 주문이 있는 서로 다른 거래처'),
    num('repeatBuyers', '재구매 병원 수', '곳', repeatBuyers.size, delivered.length,
      '그 거래처의 첫 주문이 아닌 주문을 받은 병원 — 한 번은 호의, 두 번째부터가 매출'),
    num('perClient', '병원당 추가매출', '원', buyers.size ? Math.round(revenue / buyers.size) : null, buyers.size,
      '판매매출 ÷ 구매 병원 수. 구매한 병원이 없으면 계산하지 않습니다'),
    num('shareOfRevenue', '수거 청구액 대비 소모품 매출', '%',
      collectRevenue > 0 ? Math.round((revenue / collectRevenue) * 1000) / 10 : null,
      delivered.length,
      '소모품 판매매출 ÷ 같은 기간 확정 수거 청구액. 두 매출을 한 칸에 더하지 않고 비중만 냅니다'),
    num('needHit', '주문 품목과 추천 규칙의 일치 비율', '%',
      itemsCounted > 0 ? Math.round((itemsMatched / itemsCounted) * 1000) / 10 : null,
      itemsCounted,
      '주문 하나하나를 그 주문일 시점 규칙으로 되짚어 계산한 「일치」입니다. ⚠ 병원이 추천을 실제로 봤다는 증거가 아닙니다 — 그것은 아래 「노출 뒤 채택」입니다'),
    num('needConversion', '추천 규칙 일치 → 주문 (되짚어 계산)', '%',
      conv.recommended > 0 ? Math.round((conv.converted / conv.recommended) * 1000) / 10 : null,
      conv.recommended,
      `기간 안을 ${RECALL_STEP_DAYS}일 간격(${conv.checkpoints}개 시점)으로 되짚어 규칙상 추천됐을 `
        + `병원×품목 ${conv.recommended}쌍 중 주문으로 이어진 ${conv.converted}쌍. 노출 기록이 아니라 규칙 재계산입니다`),
    num('recoShown', '실제로 화면에 뜬 추천 (병원×품목)', '쌍', reco.available ? reco.shown : null, reco.shown,
      reco.available
        ? `추천이 병원 화면에 실제로 떠 있던 순간의 기록 (규칙 판 ${reco.ruleVersions.join(', ') || '—'})`
        : '노출 기록 표가 아직 없습니다 (PROPOSAL_0106 실행 후 쌓입니다). 과거 노출은 소급해 만들지 않습니다'),
    num('recoAdopted', '노출 뒤 주문에 담긴 추천', '쌍', reco.available ? reco.adopted : null, reco.shown,
      '노출 기록이 남은 병원×품목 중, 그 뒤에 취소되지 않은 주문에 담긴 것'),
    num('recoAdoptRate', '추천 노출 → 채택률', '%',
      reco.available && reco.shown > 0 ? Math.round((reco.adopted / reco.shown) * 1000) / 10 : null,
      reco.shown,
      '노출 뒤 채택 ÷ 노출. 이것이 「고객이 추천을 보고 주문했다」에 가장 가까운 숫자입니다'),
  ]

  return {
    period,
    stages,
    funnel: { ordered: stages.length, delivered: delivered.length, billed: billed.length, paid: paid.length },
    numbers,
  }
}

// ═══ ④ 고객 AX ═══════════════════════════════════════════════════════════════

export interface CustomerAx {
  period: AxPeriod
  numbers: AxNumber[]
  /** 포털을 실제로 쓴 거래처 id */
  portalClientIds: string[]
}

export function customerAx(
  data: AppData,
  period: AxPeriod,
  /** 관리자 화면이 읽어 온 활성 병원 계정 수. 못 읽으면 넘기지 않습니다 */
  accounts?: number | null,
): CustomerAx {
  const reqs = (data.requests ?? []).filter((r) => inPeriod(r.createdAt, period))
  const portalReqs = reqs.filter((r) => r.source === 'portal')
  const orders = (data.productOrders ?? []).filter(
    (o) => o.status !== '취소' && inPeriod(o.requestedAt, period),
  )
  const portalOrders = orders.filter((o) => o.source === 'portal')

  //  「포털을 썼다」의 정의 — 병원이 **직접 올린 기록이 있는 것**입니다.
  //  로그인만 하고 아무것도 안 한 것은 쓴 것이 아닙니다. 그리고 로그인
  //  기록은 이 화면이 볼 수 있는 자료가 아닙니다(계정 목록은 관리 화면).
  const uses = new Map<string, number>()
  for (const r of portalReqs) uses.set(r.clientId, (uses.get(r.clientId) ?? 0) + 1)
  for (const o of portalOrders) uses.set(o.clientId, (uses.get(o.clientId) ?? 0) + 1)
  const repeat = [...uses.values()].filter((n) => n >= 2).length
  //  ── 여러 주에 걸친 사용 — 같은 날 두 번은 「정착」이 아닙니다 ───────────
  //   병원마다 사용한 ISO 주(월요일 시작)를 모아, 2주 이상이면 정착으로 봅니다.
  const weeksOf = new Map<string, Set<string>>()
  const addWeek = (cid: string, iso: string) => {
    const w = isoWeekOf(iso)
    if (!w) return
    const cur = weeksOf.get(cid) ?? new Set<string>()
    cur.add(w)
    weeksOf.set(cid, cur)
  }
  for (const r of portalReqs) addWeek(r.clientId, r.createdAt)
  for (const o of portalOrders) addWeek(o.clientId, o.requestedAt)
  const multiWeek = [...weeksOf.values()].filter((s) => s.size >= 2).length
  //  전화·카톡으로 온 요청을 직원이 접수해 둔 것 — 이것이 없으면 「포털 비율」은
  //  분모가 빠진 숫자입니다. 100% 는 대개 「나머지를 기록하지 않았다」입니다.
  const staffReqs = reqs.length - portalReqs.length
  //  ── 접수 → 처리 시각 ───────────────────────────────────────────────────
  //   handled_at 은 처음 처리(회신·상태 변경)한 시각이고 덮어쓰지 않습니다.
  //   ⚠ 「첫 응답」과 「완료」를 따로 적는 칸은 없습니다 — 있는 것만 셉니다.
  const lagsH = reqs
    .filter((r) => r.handledAt)
    .map((r) => (new Date(r.handledAt as string).getTime() - new Date(r.createdAt).getTime()) / 3600000)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b)
  const medianH = lagsH.length
    ? Math.round((lagsH.length % 2 ? lagsH[(lagsH.length - 1) / 2] : (lagsH[lagsH.length / 2 - 1] + lagsH[lagsH.length / 2]) / 2) * 10) / 10
    : null

  const buyers = new Set(orders.filter((o) => o.status === '전달완료').map((o) => o.clientId))

  //  재구매 — 그 거래처의 **첫 주문이 아닌** 주문을 받은 병원.
  //  기간을 넘어서 봅니다(첫 주문이 기간 앞에 있을 수 있습니다).
  const firstOrderOf2 = new Map<string, string>()
  for (const o of (data.productOrders ?? []).filter((x) => x.status !== '취소')) {
    const cur = firstOrderOf2.get(o.clientId)
    if (!cur || o.requestedAt < cur) firstOrderOf2.set(o.clientId, o.requestedAt)
  }
  const repeatBuyerSet = new Set(
    orders
      .filter((o) => o.status === '전달완료' && o.requestedAt > (firstOrderOf2.get(o.clientId) ?? o.requestedAt))
      .map((o) => o.clientId),
  )

  const numbers: AxNumber[] = [
    num('portalRequests', '포털 수거요청 건수', '건', portalReqs.length, reqs.length,
      '병원 담당자가 포털에서 직접 올린 요청 (전화·카톡 대행 접수 제외)'),
    num('portalOrders', '포털 물품 요청 건수', '건', portalOrders.length, orders.length,
      '병원이 포털에서 직접 담아 보낸 소모품 주문'),
    num('staffRequests', '직원이 대신 접수한 요청 (전화·카톡)', '건', staffReqs, reqs.length,
      '전화·카톡으로 온 요청을 직원이 시스템에 적어 둔 것. 이것이 있어야 아래 비율의 분모가 됩니다'),
    num('portalShare', '전체 요청 중 포털 비율', '%',
      reqs.length > 0 && staffReqs > 0 ? Math.round((portalReqs.length / reqs.length) * 1000) / 10 : null,
      reqs.length,
      staffReqs === 0 && reqs.length > 0
        ? '⚠ 전화·카톡 접수가 한 건도 기록되지 않아 비율을 내지 않습니다 — 포털만 세면 100% 로 보이지만 그건 나머지를 안 적은 것입니다'
        : '포털 요청 ÷ (포털 + 직원 접수). 전화·카톡 접수를 같이 적어야 뜻이 있는 숫자입니다'),
    num('portalClients', '포털을 실제로 쓴 병원 수', '곳', uses.size, portalReqs.length + portalOrders.length,
      '포털에서 요청이나 주문을 한 번이라도 올린 서로 다른 거래처'),
    num('repeatPortalClients', '두 번 이상 쓴 병원 수', '곳', repeat, uses.size,
      '한 번은 시켜서 해 본 것일 수 있습니다 — 두 번째부터가 습관입니다'),
    num('multiWeekPortalClients', '2주 이상에 걸쳐 쓴 병원 수', '곳', multiWeek, uses.size,
      '서로 다른 주(월요일 시작)에 포털을 쓴 병원. 같은 날 두 번은 정착이 아닙니다'),
    num('responseHours', '요청 접수 → 처리 (중앙값)', '시간', medianH, lagsH.length,
      '요청 올린 시각 → 담당자가 처음 처리(회신·상태 변경)한 시각. ⚠ 첫 응답과 완료를 따로 적는 칸은 없습니다 — 처리 시각 하나로만 셉니다'),
    num('buyerClients', '주문한 병원 수', '곳', buyers.size, orders.length, '전달 완료된 주문이 있는 거래처'),
    num('repeatBuyerClients', '두 번 이상 산 병원 수', '곳', repeatBuyerSet.size, buyers.size,
      '그 거래처의 첫 주문이 아닌 주문을 받은 병원'),
    num('repeatRate', '재구매율', '%',
      buyers.size > 0 ? Math.round((repeatBuyerSet.size / buyers.size) * 1000) / 10 : null,
      buyers.size,
      '두 번 이상 산 병원 ÷ 산 병원. 산 병원이 없으면 계산하지 않습니다 (0으로 나누지 않습니다)'),
    //  ⚠ 계정 수는 **관리자만** 볼 수 있습니다 (profiles RLS: 본인 또는 관리자).
    //    이 계산 함수는 계정 목록을 안 받으므로 여기서는 못 셉니다.
    //    화면이 관리자로 읽어 오면 그 값을 넣어 줍니다 — 0 이라고 적지 않습니다.
    num('accounts', '활성 병원 계정 수', '개', accounts ?? null, accounts != null ? accounts : 0,
      accounts != null
        ? '역할이 「병원 담당자」이고 사용 중인 계정 수'
        : '계정 목록은 **관리자 계정에서만** 볼 수 있습니다 (사무실 계정에서는 세지 않습니다)'),
  ]

  return { period, numbers, portalClientIds: [...uses.keys()] }
}

// ═══ ③ 확장 AX ═══════════════════════════════════════════════════════════════

export interface VehicleLoad {
  vehicleId: string
  vehicleName: string
  /** 요일(0=일) → 그 요일에 실제로 다녀온 곳 수의 목록 (날짜별) */
  byWeekday: { weekday: number; days: number; visits: number; max: number; avg: number }[]
  visits: number
  days: number
}

export interface CapacityAx {
  period: AxPeriod
  numbers: AxNumber[]
  vehicles: VehicleLoad[]
  /** 기사 이름 → 처리 건수 */
  byDriver: { name: string; visits: number; days: number }[]
}

const weekdayOfDate = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

export function capacityAx(data: AppData, period: AxPeriod): CapacityAx {
  const done: Schedule[] = (data.schedules ?? []).filter(
    (s) => s.status === '완료' && !s.canceledAt && s.date >= period.from && s.date <= period.to,
  )

  // ── 차량별 · 요일별 ──
  const vehicles: VehicleLoad[] = (data.vehicles ?? []).map((v) => {
    const mine = done.filter((s) => s.vehicleId === v.id)
    const byWeekday = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
      const rows = mine.filter((s) => weekdayOfDate(s.date) === wd)
      const perDay = new Map<string, number>()
      for (const s of rows) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1)
      const counts = [...perDay.values()]
      return {
        weekday: wd,
        days: counts.length,
        visits: rows.length,
        max: counts.length ? Math.max(...counts) : 0,
        avg: counts.length ? Math.round((rows.length / counts.length) * 10) / 10 : 0,
      }
    })
    const dayset = new Set(mine.map((s) => s.date))
    return { vehicleId: v.id, vehicleName: v.name, byWeekday, visits: mine.length, days: dayset.size }
  })

  // ── 기사별 ──
  //  기록에 이름이 없는 건은 **누구 것인지 모릅니다.** 차량 기본 기사로
  //  채워 넣지 않습니다 — 대차로 나간 날이 그대로 틀린 사람 실적이 됩니다.
  const drivers = new Map<string, { visits: number; days: Set<string> }>()
  for (const s of done) {
    const n = (s.driverName ?? '').trim()
    if (!n) continue
    const cur = drivers.get(n) ?? { visits: 0, days: new Set<string>() }
    cur.visits += 1
    cur.days.add(s.date)
    drivers.set(n, cur)
  }
  const byDriver = [...drivers.entries()]
    .map(([name, v]) => ({ name, visits: v.visits, days: v.days.size }))
    .sort((a, b) => b.visits - a.visits)

  // ── 하루 방문 곳 수 ──
  const perDay = new Map<string, number>()
  for (const s of done) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1)
  const dayCounts = [...perDay.values()]
  const avgPerDay = dayCounts.length
    ? Math.round((done.length / dayCounts.length) * 10) / 10
    : null
  const maxPerDay = dayCounts.length ? Math.max(...dayCounts) : null

  const urgent = done.filter((s) => s.origin === 'field' && !s.bookedAt).length
  const additional = (data.materials ?? []).filter(
    (m) => m.isAdditionalRequest && m.date >= period.from && m.date <= period.to,
  ).length

  //  ── 차량 운행일당 수거량 — 차량×날짜 한 칸이 「운행일」입니다 ────────────
  const vehicleDays = new Set(done.filter((s) => s.vehicleId).map((s) => `${s.vehicleId}|${s.date}`))
  const kgDone = done.reduce((s, x) => s + (x.actualAmount ?? 0), 0)
  const kgKnown = done.filter((x) => x.actualAmount != null).length
  const kgPerVehicleDay = vehicleDays.size > 0 && kgKnown > 0 ? Math.round(kgDone / vehicleDays.size) : null

  //  ── 방문 1건당 운영비 — 운영비를 넣은 달만 셉니다 ─────────────────────
  //   운영비는 달 단위이고 방문은 날 단위입니다. 운영비가 있는 달의 완료 방문만
  //   분모로 씁니다. 없는 달을 0 원으로 치지 않습니다.
  const costByMonth = new Map<string, number>()
  for (const c of data.operatingCosts ?? []) costByMonth.set(c.month, (costByMonth.get(c.month) ?? 0) + c.amount)
  let costSum = 0
  let costVisits = 0
  let costMonths = 0
  for (const [month, amount] of costByMonth) {
    if (month < period.from.slice(0, 7) || month > period.to.slice(0, 7)) continue
    const visits = done.filter((s) => s.date.slice(0, 7) === month).length
    if (visits === 0) continue
    costSum += amount
    costVisits += visits
    costMonths += 1
  }
  const costPerVisit = costVisits > 0 ? Math.round(costSum / costVisits) : null

  //  ── 계기판 · 처리시설 대기 (판 106 마감 기록) ─────────────────────────
  //   좌표가 없어 거리를 계산하지 못하던 것을 **계기판**으로 시작합니다.
  const closes = data.dayCloses
  const closesIn = (closes ?? []).filter((c) => c.date >= period.from && c.date <= period.to)
  const kmRows = closesIn.filter((c) => c.odometerStart != null && c.odometerEnd != null && (c.odometerEnd as number) >= (c.odometerStart as number))
  const kmTotal = kmRows.reduce((s, c) => s + ((c.odometerEnd as number) - (c.odometerStart as number)), 0)
  const kmPerDay = kmRows.length > 0 ? Math.round(kmTotal / kmRows.length) : null
  const waits = closesIn.map((c) => c.facilityWaitMin).filter((v): v is number => v != null).sort((a, b) => a - b)
  const waitMedian = waits.length
    ? (waits.length % 2 ? waits[(waits.length - 1) / 2] : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2))
    : null
  const noCloseTable = closes === undefined

  //  ── 수용여력 ──
  //   같은 차·같은 요일에 **실제로 해낸 최대치**와 최근 평균의 차이입니다.
  //   「몇 곳 더 받을 수 있다」고 단정하지 않습니다 — 관측된 최대치일 뿐,
  //   그날 폐기물 양·거리·교통은 여기에 안 들어 있습니다.
  let headroom = 0
  let headroomSamples = 0
  for (const v of vehicles) {
    for (const w of v.byWeekday) {
      if (w.days < 2) continue // 두 번은 가 봐야 「그 요일의 그 차」입니다
      headroomSamples += 1
      headroom += Math.max(0, w.max - w.avg)
    }
  }

  const numbers: AxNumber[] = [
    num('visits', '완료한 방문', '건', done.length, done.length, '기간 내 완료 처리된 수거 일정 (무른 방문 제외)'),
    num('activeDays', '실제 나간 날', '일', dayCounts.length, dayCounts.length, '한 건이라도 완료한 날'),
    num('avgPerDay', '하루 방문 병원 수 (평균)', '곳', avgPerDay, dayCounts.length,
      '완료 방문 ÷ 실제 나간 날. 안 나간 날은 나누는 데 넣지 않습니다'),
    num('maxPerDay', '하루 최대 방문', '곳', maxPerDay, dayCounts.length, '기간 안에서 실제로 해낸 하루 최대치'),
    num('drivers', '기사별 처리건수를 셀 수 있는 사람', '명', byDriver.length, done.length,
      '기록에 기사 이름이 남은 건만. 이름이 없는 건은 차량 기본 기사로 채우지 않습니다'),
    num('urgentVisits', '예정에 없던 수거', '건', urgent, done.length,
      '사람이 날짜를 잡지 않았는데 현장에서 완료된 건 (긴급·추가 방문)'),
    num('additionalSupply', '추가 요청 자재공급', '건', additional, additional,
      '자재공급 기록에 「추가요청」으로 표시된 건'),
    num('headroom', '관측 최대 대비 여유 (합계)', '곳',
      headroomSamples > 0 ? Math.round(headroom * 10) / 10 : null, headroomSamples,
      '차량×요일마다 (그 요일 최대 정차 수 − 평균). ⚠ 거리·시간은 계산하지 않습니다 — '
        + '거래처 좌표가 없습니다. 「몇 곳 더 받을 수 있다」가 아니라 「예전에 이만큼은 해냈다」입니다'),
    num('kgPerVehicleDay', '차량 운행일당 수거량', 'kg', kgPerVehicleDay, vehicleDays.size,
      `완료 방문의 실제 수거량 합 ÷ 차량×날짜(운행일) 수. 수거량이 적힌 건 ${kgKnown}/${done.length}건 — 비어 있는 건은 0 으로 치지 않고 뺐습니다`),
    num('costPerVisit', '방문 1건당 운영비', '원', costPerVisit, costVisits,
      costMonths > 0
        ? `운영비를 넣은 ${costMonths}개월의 월 운영비 합 ÷ 그 달들의 완료 방문 수. 운영비가 없는 달은 넣지 않습니다`
        : '이 기간에 운영비가 입력된 달이 없습니다 — 통계 → 경영 요약에서 월 운영비를 넣으면 계산됩니다'),
    num('kmPerDay', '운행거리 (계기판, 마감 1건당)', 'km', noCloseTable ? null : kmPerDay, kmRows.length,
      noCloseTable
        ? '마감 기록에 계기판 칸이 아직 없습니다 (PROPOSAL_0106 실행 후 기사님 마감에서 쌓입니다). 지도 API 전까지는 계기판으로 잽니다'
        : '기사님이 오늘 업무 마감에 적은 도착 계기판 − 출발 계기판의 평균. 적지 않은 날은 세지 않습니다'),
    num('facilityWaitMin', '처리시설 대기 (중앙값)', '분', noCloseTable ? null : waitMedian, waits.length,
      noCloseTable
        ? '마감 기록에 대기시간 칸이 아직 없습니다 (PROPOSAL_0106 실행 후). 「3~4시간」은 아직 전언이며 실측이 아닙니다'
        : '기사님이 마감에 적은 처리시설 이동·인계 대기시간의 중앙값. 전언(3~4시간)과 견주는 실측입니다'),
  ]

  return { period, numbers, vehicles, byDriver }
}

// ═══ ① 업무 AX — 당일 입력 ═══════════════════════════════════════════════════
//
//   파일럿 측정항목에 「당일 입력률」이 있습니다. 화면과 하루 한 줄 기록이
//   **같은 정의**를 써야 두 숫자를 나란히 놓을 수 있습니다. 그래서 여기서
//   한 번만 정의합니다.
//
//    당일 입력 = 다녀온 날(schedules.date)과 입력이 서버에 남은 날
//                (completed_at 을 한국 시간으로 본 날)이 같은 것
//
//   ⚠ 「그날 안에 넣었나」는 업무가 하루 안에 닫혔는가입니다. 다음 날 아침에
//     몰아 넣으면 그날 저녁에 이사님이 확인할 것이 없습니다 — 그게 예전
//     방식(퇴근 후 카톡·엑셀)과 같아지는 지점입니다.

/** ISO 시각을 한국 시간 기준 날짜로 */
export function kstDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export interface WorkAx {
  period: AxPeriod
  numbers: AxNumber[]
  /** 며칠 만에 입력했는가 → 건수 (0 = 당일) */
  lagHistogram: { lagDays: number; count: number }[]
}

export function workAx(data: AppData, period: AxPeriod): WorkAx {
  //  ⚠ 이관(migrated)·시연·시드 일정은 뺍니다 — 성과·준비 상태와 같은 제외 기준(0106 A).
  //    이관 자료는 입력 시각이 옮긴 날이라 「당일 입력」이 아닙니다.
  const done = (data.schedules ?? []).filter(
    (s) =>
      isFieldSchedule(s) &&
      s.status === '완료' &&
      !s.canceledAt &&
      s.date >= period.from &&
      s.date <= period.to &&
      !!s.completedAt,
  )
  const lags: number[] = []
  for (const s of done) {
    const entered = kstDate(s.completedAt as string)
    if (!entered) continue
    const lag = Math.round(
      (new Date(`${entered}T00:00:00Z`).getTime() - new Date(`${s.date}T00:00:00Z`).getTime()) / 86400000,
    )
    //  ⚠ 음수(다녀오기 전에 입력)는 있을 수 없는 값입니다. 0 으로 눌러
    //    당일처럼 세면 안 됩니다 — 그런 기록이 있으면 그것 자체가 문제입니다.
    lags.push(lag)
  }
  const sameDay = lags.filter((n) => n === 0).length
  const byNextDay = lags.filter((n) => n <= 1 && n >= 0).length
  const odd = lags.filter((n) => n < 0).length

  const hist = new Map<number, number>()
  for (const n of lags) hist.set(n, (hist.get(n) ?? 0) + 1)

  const numbers: AxNumber[] = [
    num('entered', '입력이 끝난 수거', '건', lags.length, lags.length,
      '완료 처리되고 입력 시각이 남은 건 (무른 방문 제외)'),
    num('sameDayRate', '당일 입력 완료율', '%',
      lags.length > 0 ? Math.round((sameDay / lags.length) * 1000) / 10 : null, lags.length,
      '다녀온 날과 입력한 날(한국 시간)이 같은 건의 비율 — 파일럿 「당일 입력률」과 같은 정의입니다'),
    num('nextDayRate', '다음 날까지 입력한 비율', '%',
      lags.length > 0 ? Math.round((byNextDay / lags.length) * 1000) / 10 : null, lags.length,
      '당일 + 다음 날. 당일률과 이 값의 차이가 「저녁에 몰아 넣는 습관」의 크기입니다'),
    num('oddLag', '다녀오기 전에 입력된 건', '건', odd, lags.length,
      '있을 수 없는 값입니다. 0 이 아니면 날짜를 잘못 넣은 기록이 있다는 뜻이라 그대로 셉니다'),
  ]

  return {
    period,
    numbers,
    lagHistogram: [...hist.entries()].map(([lagDays, count]) => ({ lagDays, count })).sort((a, b) => a.lagDays - b.lagDays),
  }
}

// ═══ 한 화면에 필요한 묶음 ════════════════════════════════════════════════════

export interface AxEvidence {
  period: AxPeriod
  work: WorkAx
  sales: SalesAx
  customer: CustomerAx
  capacity: CapacityAx
}

export function axEvidence(data: AppData, period: AxPeriod, accounts?: number | null): AxEvidence {
  return {
    period,
    work: workAx(data, period),
    sales: salesAx(data, period),
    customer: customerAx(data, period, accounts),
    capacity: capacityAx(data, period),
  }
}

// ═══ 도입 전 → 현재 → 변화 ═══════════════════════════════════════════════════
//
//  ⚠ 여기서 제일 조심할 것은 **Before 를 만들어 내는 것**입니다.
//
//   「도입 전 포털 비율은 당연히 0% 아니냐」는 맞는 말처럼 들리지만, 그건
//   추정이지 측정이 아닙니다. 대신 **같은 계산을 도입일 앞 기간에 그대로**
//   돌립니다. 그 기간에 기록이 하나도 없으면 「도입 전 기록 없음」이라고
//   적습니다 — 0 이라고 적지 않습니다.
//
//   비교 기간은 **길이를 맞춥니다.** 도입 후 30일과 도입 전 90일을 견주면
//   건수는 당연히 도입 전이 많습니다. 같은 길이여야 견줄 수 있습니다.

export type CompareState =
  | 'ok' // 앞뒤 다 잼
  | 'no-start' // 도입일이 설정돼 있지 않음
  | 'no-before' // 도입 전 기간에 기록이 없음
  | 'no-after' // 도입 후 기간에 아직 기록이 없음

export interface CompareRow {
  key: string
  label: string
  unit: string
  before: number | null
  after: number | null
  beforeSamples: number
  afterSamples: number
  /** 낮을수록 좋은 지표인가 */
  betterWhen: 'higher' | 'lower'
  basis: string
}

export interface AxCompare {
  state: CompareState
  reason: string
  before: AxPeriod | null
  after: AxPeriod | null
  rows: CompareRow[]
  /** 도입 후 구간에 차량·인력·거점·계약·단가 변화가 겹쳤는가 */
  confounding: Confounding
}

/** 견줄 지표 — 좋아진 것만 고르지 않습니다. 나빠질 수 있는 것(당일 입력 전 입력 · 실패 기록)도 같은 기준으로 올립니다 */
const COMPARE_KEYS: { area: 'work' | 'sales' | 'customer' | 'capacity'; key: string; betterWhen: 'higher' | 'lower' }[] = [
  { area: 'work', key: 'sameDayRate', betterWhen: 'higher' },
  { area: 'work', key: 'oddLag', betterWhen: 'lower' },
  { area: 'sales', key: 'revenue', betterWhen: 'higher' },
  { area: 'sales', key: 'deliveredOrders', betterWhen: 'higher' },
  { area: 'customer', key: 'portalShare', betterWhen: 'higher' },
  { area: 'customer', key: 'portalClients', betterWhen: 'higher' },
  { area: 'customer', key: 'responseHours', betterWhen: 'lower' },
  { area: 'capacity', key: 'avgPerDay', betterWhen: 'higher' },
  { area: 'capacity', key: 'kgPerVehicleDay', betterWhen: 'higher' },
  { area: 'capacity', key: 'costPerVisit', betterWhen: 'lower' },
]

/** ISO 시각 → ISO 주 (YYYY-Www, 월요일 시작). 못 읽으면 빈 문자열 */
export function isoWeekOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const daysBetweenIso = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000) + 1

export function axCompare(
  data: AppData,
  experimentStart: string | null,
  today: string,
  changes: OpsChange[] | undefined = data.opsChanges,
): AxCompare {
  if (!experimentStart) {
    return {
      state: 'no-start',
      reason: '도입일(실증 시작일)이 설정돼 있지 않아 「도입 전」을 가를 수 없습니다. 설정에서 시작일을 정해 주세요.',
      before: null,
      after: null,
      rows: [],
      confounding: confoundingIn(changes, today, today),
    }
  }
  const after: AxPeriod = { from: experimentStart, to: today }
  const span = Math.max(daysBetweenIso(after.from, after.to), 1)
  const before: AxPeriod = { from: shift(experimentStart, -span), to: shift(experimentStart, -1) }
  //  ⚠ 도입 후 구간에 차량·거점·인력 변화가 겹치면 아래 표는 「복합 개선」입니다.
  //    AX 효과라고 단독으로 말하지 않습니다.
  const confounding = confoundingIn(changes, after.from, after.to)

  const b = axEvidence(data, before)
  const a = axEvidence(data, after)
  const pick = (e: AxEvidence, area: string, key: string) =>
    (area === 'work' ? e.work.numbers : area === 'sales' ? e.sales.numbers : area === 'customer' ? e.customer.numbers : e.capacity.numbers)
      .find((n) => n.key === key)

  const rows: CompareRow[] = []
  for (const c of COMPARE_KEYS) {
    const nb = pick(b, c.area, c.key)
    const na = pick(a, c.area, c.key)
    if (!nb || !na) continue
    rows.push({
      key: `${c.area}.${c.key}`,
      label: na.label,
      unit: na.unit,
      before: nb.value,
      after: na.value,
      beforeSamples: nb.samples,
      afterSamples: na.samples,
      betterWhen: c.betterWhen,
      basis: na.basis,
    })
  }

  const beforeAny = rows.some((r) => r.beforeSamples > 0)
  const afterAny = rows.some((r) => r.afterSamples > 0)
  const state: CompareState = !afterAny ? 'no-after' : !beforeAny ? 'no-before' : 'ok'

  //  ⚠ 도입 전 기간에 **이 시스템의 기록이 통째로 없으면** 그 칸을 0 으로
  //    두면 안 됩니다.
  //
  //     0 원 → 135,000원 (＋135,000원)
  //
  //    이렇게 적히면 「우리가 135,000원을 만들었다」로 읽힙니다. 하지만 그
  //    기간은 엑셀·카톡으로 일하던 때라 시스템에 아무것도 안 남았을 뿐이고,
  //    실제로 0 이었는지는 **모릅니다**. 모르는 것은 null 입니다.
  //
  //    반대로 그 기간에 시스템을 쓴 흔적이 있으면(다른 지표에 표본이 있으면)
  //    그때의 0 은 **재 봤더니 0** 이므로 그대로 둡니다.
  if (!beforeAny) {
    for (const r of rows) r.before = null
  }
  const reason =
    state === 'no-after'
      ? `도입 후(${after.from} ~ ${after.to})에 아직 기록이 없습니다. 파일럿이 시작되면 채워집니다.`
      : state === 'no-before'
        ? `도입 전(${before.from} ~ ${before.to})에 이 시스템의 기록이 없습니다. `
          + '그 기간은 엑셀·카톡으로 일하던 때라 시스템에 남은 것이 없습니다 — 0 이라고 적지 않습니다.'
        : `도입 전 ${span}일과 도입 후 ${span}일을 같은 계산으로 견줍니다.`

  return { state, reason, before, after, rows, confounding }
}

/** 화면이 「지금 가장 약한 증거」를 한 줄로 말할 수 있게 */
export function weakestEvidence(e: AxEvidence): { area: string; why: string } {
  const score = (ns: AxNumber[]) => ns.filter((n) => n.state === 'ok').length
  const rows = [
    { area: '업무 AX (당일 입력)', n: score(e.work.numbers), total: e.work.numbers.length },
    { area: '매출 AX', n: score(e.sales.numbers), total: e.sales.numbers.length },
    { area: '고객 AX', n: score(e.customer.numbers), total: e.customer.numbers.length },
    { area: '확장 AX', n: score(e.capacity.numbers), total: e.capacity.numbers.length },
  ].sort((a, b) => a.n - b.n)
  const w = rows[0]
  return { area: w.area, why: `측정값으로 확정된 지표 ${w.n}/${w.total}개` }
}

/** 주문 하나가 어디까지 갔는지 사람 말로 */
export function stageLabel(s: OrderStage): string {
  if (s.paid) return '입금 완료'
  if (s.billed) return '청구 확정'
  if (s.delivered) return '전달 완료'
  return '주문 접수'
}

export const ORDER_STAGE_ORDER = ['주문 접수', '전달 완료', '청구 확정', '입금 완료'] as const
