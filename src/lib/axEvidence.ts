import type { AppData, Schedule } from '../types'
import { supplyNeedsFor, type StockKey } from './supplyNeeds'

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
  /** 이 주문의 품목 중 그 시점에 추천되고 있던 것 */
  matchedNeeds: StockKey[]
  itemStockKeys: StockKey[]
}

const STOCK_KEYS: StockKey[] = ['corrugated_box', 'plastic_container', 'bag', 'needle_box']
const isStockKey = (k: string | null): k is StockKey => !!k && (STOCK_KEYS as string[]).includes(k)

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
    const itemStockKeys = [...new Set(o.items.map((it) => it.stockKey).filter(isStockKey))]
    const wasNeeded = new Set(needsAsOf(data, o.clientId, requestedOn).needs.map((n) => n.stockKey))
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
      for (const n of needsAsOf(data, cid, d).needs) seen.add(`${cid}|${n.stockKey}`)
    }
  }
  const orderedPairs = new Set<string>()
  for (const o of data.productOrders ?? []) {
    if (o.status === '취소') continue
    if (!inPeriod(o.requestedAt, period)) continue
    for (const it of o.items) {
      if (isStockKey(it.stockKey)) orderedPairs.add(`${o.clientId}|${it.stockKey}`)
    }
  }
  let converted = 0
  for (const k of seen) if (orderedPairs.has(k)) converted += 1
  return { recommended: seen.size, converted, checkpoints }
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

  const numbers: AxNumber[] = [
    num('orders', '주문 건수', '건', stages.length, stages.length, '취소하지 않은 소모품 주문 (요청일 기준)'),
    num('deliveredOrders', '전달 완료 주문', '건', delivered.length, stages.length,
      '주문 중 실제로 전달까지 끝난 건 — **여기서부터 매출입니다**'),
    num('revenue', '소모품 판매매출', '원', delivered.length ? revenue : 0, delivered.length,
      '전달 완료 주문의 주문시점 판매단가 × 수량. 주문만 들어온 건은 넣지 않습니다'),
    num('cost', '판매 원가', '원', delivered.length ? cost : 0, delivered.length,
      '같은 주문의 주문시점 매입단가 × 수량'),
    num('profit', '실제 판매이익', '원', delivered.length ? revenue - cost : 0, delivered.length,
      '판매매출 − 판매원가 (전달 완료 기준)'),
    num('paidRevenue', '입금까지 끝난 금액', '원', paid.length ? paidRevenue : 0, paid.length,
      '⚠ 전달 ≠ 입금입니다. 그 주문이 담긴 청구가 실제로 입금 완료된 것만'),
    num('buyers', '구매 병원 수', '곳', buyers.size, delivered.length, '전달 완료 주문이 있는 서로 다른 거래처'),
    num('repeatBuyers', '재구매 병원 수', '곳', repeatBuyers.size, delivered.length,
      '그 거래처의 첫 주문이 아닌 주문을 받은 병원 — 한 번은 호의, 두 번째부터가 매출'),
    num('perClient', '병원당 추가매출', '원', buyers.size ? Math.round(revenue / buyers.size) : null, buyers.size,
      '판매매출 ÷ 구매 병원 수. 구매한 병원이 없으면 계산하지 않습니다'),
    num('shareOfRevenue', '수거 청구액 대비 소모품 매출', '%',
      collectRevenue > 0 ? Math.round((revenue / collectRevenue) * 1000) / 10 : null,
      delivered.length,
      '소모품 판매매출 ÷ 같은 기간 확정 수거 청구액. 두 매출을 한 칸에 더하지 않고 비중만 냅니다'),
    num('needHit', '주문 품목 중 추천에 있던 비율', '%',
      itemsCounted > 0 ? Math.round((itemsMatched / itemsCounted) * 1000) / 10 : null,
      itemsCounted,
      '주문 하나하나를 **그 주문일 시점으로 되돌려** 추천을 다시 계산해, 그때 추천에 있던 품목의 비율'),
    num('needConversion', '추천 → 주문 전환율', '%',
      conv.recommended > 0 ? Math.round((conv.converted / conv.recommended) * 1000) / 10 : null,
      conv.recommended,
      `기간 안을 ${RECALL_STEP_DAYS}일 간격(${conv.checkpoints}개 시점)으로 되짚어 한 번이라도 추천이 떠 있던 `
        + `병원×품목 ${conv.recommended}쌍 중 실제 주문으로 이어진 ${conv.converted}쌍`),
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

export function customerAx(data: AppData, period: AxPeriod): CustomerAx {
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

  const buyers = new Set(orders.filter((o) => o.status === '전달완료').map((o) => o.clientId))

  const numbers: AxNumber[] = [
    num('portalRequests', '포털 수거요청 건수', '건', portalReqs.length, reqs.length,
      '병원 담당자가 포털에서 직접 올린 요청 (전화·카톡 대행 접수 제외)'),
    num('portalOrders', '포털 물품 요청 건수', '건', portalOrders.length, orders.length,
      '병원이 포털에서 직접 담아 보낸 소모품 주문'),
    num('portalShare', '전체 요청 중 포털 비율', '%',
      reqs.length > 0 ? Math.round((portalReqs.length / reqs.length) * 1000) / 10 : null,
      reqs.length,
      '포털 요청 ÷ 전체 요청. 이 값이 오르는 것이 「전화·카톡 대신 쓰기 시작했다」입니다'),
    num('portalClients', '포털을 실제로 쓴 병원 수', '곳', uses.size, portalReqs.length + portalOrders.length,
      '포털에서 요청이나 주문을 한 번이라도 올린 서로 다른 거래처'),
    num('repeatPortalClients', '두 번 이상 쓴 병원 수', '곳', repeat, uses.size,
      '한 번은 시켜서 해 본 것일 수 있습니다 — 두 번째부터가 습관입니다'),
    num('buyerClients', '주문한 병원 수', '곳', buyers.size, orders.length, '전달 완료된 주문이 있는 거래처'),
    //  ⚠ 계정 수는 이 자료로 못 셉니다. 0 이라고 적으면 「계정이 없다」는
    //    거짓말이 됩니다. 못 센다고 그대로 적습니다.
    num('accounts', '활성 병원 계정 수', '개', null, 0,
      '계정 목록(profiles)은 관리자 화면에서만 봅니다 — 이 화면 자료에는 없어 세지 않습니다'),
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
  ]

  return { period, numbers, vehicles, byDriver }
}

// ═══ 한 화면에 필요한 묶음 ════════════════════════════════════════════════════

export interface AxEvidence {
  period: AxPeriod
  sales: SalesAx
  customer: CustomerAx
  capacity: CapacityAx
}

export function axEvidence(data: AppData, period: AxPeriod): AxEvidence {
  return {
    period,
    sales: salesAx(data, period),
    customer: customerAx(data, period),
    capacity: capacityAx(data, period),
  }
}

/** 화면이 「지금 가장 약한 증거」를 한 줄로 말할 수 있게 */
export function weakestEvidence(e: AxEvidence): { area: string; why: string } {
  const score = (ns: AxNumber[]) => ns.filter((n) => n.state === 'ok').length
  const rows = [
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
