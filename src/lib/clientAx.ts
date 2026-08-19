import type { AppData } from '../types'
import { supplyNeedsFor, type SupplyNeed } from './supplyNeeds'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 한 곳의 「지금 아는 것」
//
//  ⚠ 이 파일이 **하지 않는 것**부터 적습니다.
//
//   「이 병원에 이것을 파세요」라고 하지 않습니다. 근거 없는 영업추천은
//   한 번만 틀려도 그다음부터 화면의 모든 숫자를 안 믿게 만듭니다.
//   여기 있는 것은 전부 **이미 일어난 일**입니다 —
//   무엇을 얼마나 가져갔고, 언제 마지막이었고, 포털을 쓰는가.
//   그걸 보고 무엇을 할지는 사람이 정합니다.
//
//  새 표를 만들지 않습니다. materials · product_orders · client_requests ·
//  schedules 로만 셉니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 얼마나 자주 사 가는가 — 이 정도는 있어야 「자주」라고 부릅니다 */
export const REPEAT_MIN_TIMES = 2

export interface BoughtItem {
  key: string
  label: string
  /** 전달 완료 기준 — 주문만 한 것은 안 셉니다 */
  times: number
  qty: number
  lastOn: string
}

export interface ClientAx {
  clientId: string
  /** 추천 계산 결과 그대로 (근거 문구 포함) */
  needs: SupplyNeed[]
  /** 추천을 못 하는 이유 (있으면) */
  needsBlocked: string
  /** 전달 완료 기준 · 많이 사 간 순 */
  bought: BoughtItem[]
  /** 자주 사는 품목 (2번 이상) */
  repeat: BoughtItem[]
  /** 다음에 필요할 것으로 보이는 날 — 가장 이른 것 */
  nextNeedOn: string | null
  /** 다음 방문 예정 */
  nextVisitOn: string | null
  /** 포털을 실제로 쓴 적이 있는가 (직접 올린 요청·주문) */
  usesPortal: boolean
  portalRequests: number
  portalOrders: number
  phoneRequests: number
  /** 예정에 없던 방문 (사람이 날짜를 안 잡았는데 현장에서 완료) */
  unplannedVisits: number
  /** 추가요청으로 표시된 자재공급 */
  additionalSupplies: number
  /** 최근 요청 몇 건 (새것 먼저) */
  recentRequests: { id: string; kind: string; content: string; status: string; source: string; createdAt: string }[]
  /** 이 거래처에서 실제로 발생한 소모품 판매 (전달 완료 기준) */
  productRevenue: number
  /** 그중 입금까지 끝난 금액 */
  paidRevenue: number
}

const LOOKBACK_DAYS = 180

function shift(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function clientAx(data: AppData, clientId: string, today: string): ClientAx {
  const from = shift(today, -LOOKBACK_DAYS)

  const needs = supplyNeedsFor(data, clientId, today)

  // ── 무엇을 사 갔는가 (전달 완료만) ────────────────────────────────────────
  //   주문만 한 것은 안 셉니다 — 아직 그 병원에 간 물건이 아닙니다.
  const delivered = (data.productOrders ?? []).filter(
    (o) => o.clientId === clientId && o.status === '전달완료' && !!o.deliveredAt,
  )
  const boughtMap = new Map<string, BoughtItem>()
  let productRevenue = 0
  for (const o of delivered) {
    const on = (o.deliveredAt as string).slice(0, 10)
    for (const it of o.items) {
      productRevenue += it.unitPrice * it.qty
      const key = it.productId ?? `${it.name}|${it.spec}`
      const cur = boughtMap.get(key) ?? {
        key,
        label: `${it.name}${it.spec ? ` ${it.spec}` : ''}`,
        times: 0,
        qty: 0,
        lastOn: on,
      }
      cur.times += 1
      cur.qty += it.qty
      if (on > cur.lastOn) cur.lastOn = on
      boughtMap.set(key, cur)
    }
  }
  const bought = [...boughtMap.values()].sort((a, b) => b.qty - a.qty)
  const repeat = bought.filter((b) => b.times >= REPEAT_MIN_TIMES)

  //  입금까지 끝난 금액 — 전달 ≠ 입금입니다.
  const billedBy = new Map<string, { amount: number; status: string; id: string }>()
  for (const p of data.payments ?? []) {
    if (p.canceledAt) continue
    for (const oid of p.snapshot?.orderIds ?? []) billedBy.set(oid, { amount: p.amount, status: p.status, id: p.id })
  }
  let paidRevenue = 0
  for (const o of delivered) {
    const bill = billedBy.get(o.id)
    if (!bill) continue
    const got = (data.receipts ?? []).filter((r) => r.paymentId === bill.id).reduce((s, r) => s + r.amount, 0)
    const paid = bill.status === '입금완료' || (bill.amount > 0 && got >= bill.amount)
    if (paid) paidRevenue += o.items.reduce((s, it) => s + it.unitPrice * it.qty, 0)
  }

  // ── 포털을 쓰는가 ─────────────────────────────────────────────────────────
  const reqs = (data.requests ?? []).filter((r) => r.clientId === clientId && r.createdAt.slice(0, 10) >= from)
  const portalRequests = reqs.filter((r) => r.source === 'portal').length
  const phoneRequests = reqs.length - portalRequests
  const portalOrders = (data.productOrders ?? []).filter(
    (o) => o.clientId === clientId && o.source === 'portal' && o.status !== '취소',
  ).length

  // ── 예정에 없던 방문 ──────────────────────────────────────────────────────
  const visits = (data.schedules ?? []).filter(
    (s) => s.clientId === clientId && s.status === '완료' && !s.canceledAt && s.date >= from && s.date <= today,
  )
  const unplannedVisits = visits.filter((s) => s.origin === 'field' && !s.bookedAt).length
  const additionalSupplies = (data.materials ?? []).filter(
    (m) => m.clientId === clientId && m.isAdditionalRequest && m.date >= from && m.date <= today,
  ).length

  const nextVisitOn =
    (data.schedules ?? [])
      .filter((s) => s.clientId === clientId && s.status !== '완료' && !s.canceledAt && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null

  const nextNeedOn =
    needs.needs
      .map((n) => n.dueOn)
      .filter((d): d is string => !!d)
      .sort()[0] ?? null

  return {
    clientId,
    needs: needs.needs,
    needsBlocked: needs.blocked,
    bought,
    repeat,
    nextNeedOn,
    nextVisitOn,
    usesPortal: portalRequests > 0 || portalOrders > 0,
    portalRequests,
    portalOrders,
    phoneRequests,
    unplannedVisits,
    additionalSupplies,
    recentRequests: reqs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        content: r.content,
        status: r.status,
        source: r.source,
        createdAt: r.createdAt,
      })),
    productRevenue,
    paidRevenue,
  }
}
