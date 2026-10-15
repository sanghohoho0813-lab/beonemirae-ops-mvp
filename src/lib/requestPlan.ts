// ─────────────────────────────────────────────────────────────────────────────
// 요청 처리 계획 (0142 · 신보 발표 STEP 1) — AI 에 보낼 자료 · AI 결과를 시스템 자료로 다시 맞춰 보기
//
//  대표님: 「AI 버튼이 너무 간단한 업무만 돕는다 — 누가 봐도 와! 하게 디테일까지 관여해서」.
//
//   AI 가 하는 일: 요청 글에서 원하는 것(무엇 · 수량 · 자재 규격)을 뽑고, 아래 자료를 근거로
//     처리 순서 · 주의할 점 · 구체 회신을 씁니다(서버 ai-triage · task request_plan).
//   시스템이 하는 일(이 파일): AI 에 줄 자료를 **실제 운영 자료에서** 모으고, AI 가 뽑은 자재를
//     사무실 재고에 다시 맞춰 「충분 · 부족」을 직접 셉니다 — 재고 셈은 AI 를 믿지 않습니다.
//
//  ⚠ 병원 이름 · 요청자 · 기사 이름은 보내지 않습니다(차량 이름만).
// ─────────────────────────────────────────────────────────────────────────────

import type { AppData, OfficeStock } from '../types'
import { SUPPLY_ITEMS, type StockBucket } from './billing'
import { STOCK_KEYS } from './collection'
import { dispatchHint, type DispatchHint } from './dispatchHint'
import { dunningList } from './dunning'
import { today } from './format'

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export interface PlanReq {
  id: string
  clientId: string
  type: string
  content: string
  urgent: boolean
  desiredDate?: string | null
}

export interface ClientHistory {
  lastVisit: string | null
  nextVisit: string | null
  visits90: number
  urgent90: number
  overdueMonths: number
}

/** 이 병원 이력 — 완료된 수거 · 잡힌 방문 · 최근 90일 긴급 요청 · 미수 개월 (모두 운영 자료 그대로) */
export function clientHistory(data: AppData, clientId: string, now = today()): ClientHistory {
  const from = addDays(now, -90)
  const live = data.schedules.filter((s) => s.clientId === clientId && !s.canceledAt)
  const done = live.filter((s) => s.status === '완료' && s.date <= now).sort((a, b) => b.date.localeCompare(a.date))
  const next = live.filter((s) => s.status !== '완료' && s.date >= now).sort((a, b) => a.date.localeCompare(b.date))[0]
  const urgent90 = data.requests.filter(
    (r) => r.clientId === clientId && (r.urgent || r.kind === '긴급수거') && (r.createdAt ?? '').slice(0, 10) >= from,
  ).length
  const dun = dunningList(data, now).find((r) => r.clientId === clientId)
  return {
    lastVisit: done[0]?.date ?? null,
    nextVisit: next?.date ?? null,
    visits90: done.filter((s) => s.date >= from).length,
    urgent90,
    overdueMonths: dun ? dun.monthsOld : 0,
  }
}

const stockName = (b: StockBucket | undefined) => STOCK_KEYS.find((k) => k.key === b)?.label ?? null

/** AI 에 보낼 자료 — 요청 글 + 그날 차량별 방문 + 사무실 재고 + 자재 규격 + 이 병원 이력 */
export function planInput(data: AppData, req: PlanReq, hint: DispatchHint = dispatchHint(data, req), now = today()) {
  const stock = data.officeStock as OfficeStock
  return {
    request: req.content,
    kind: req.type,
    urgent: req.urgent,
    today: now,
    target: { date: hint.date, why: hint.why },
    vehicles: hint.loads.map((l) => ({ label: l.vehicleName, visits: l.visits, regular: l.regular, alreadyThere: l.alreadyThere })),
    pick: hint.pick?.vehicleName ?? null,
    stock: STOCK_KEYS.map((k) => ({ name: k.label, qty: Math.max(0, Math.round(stock?.[k.key] ?? 0)) })),
    items: SUPPLY_ITEMS.map((i) => ({ name: i.label, stock: stockName(i.bucket) })),
    history: clientHistory(data, req.clientId, now),
  }
}

export type PlanResult = {
  asks: { what: string; qty: number | null; item: string | null }[]
  when: string
  steps: { title: string; detail: string }[]
  watch: string[]
  reply: string
  model: string
}

export interface StockLine {
  item: string
  qty: number | null
  stockName: string | null
  have: number | null
  /** 수량을 모르면 null */
  enough: boolean | null
  billable: boolean
}

/** AI 가 뽑은 자재를 사무실 재고에 **시스템이 다시** 맞춰 봅니다 */
export function stockCheck(data: AppData, asks: PlanResult['asks']): StockLine[] {
  const stock = data.officeStock as OfficeStock
  const out: StockLine[] = []
  for (const a of asks) {
    if (!a.item) continue
    const def = SUPPLY_ITEMS.find((i) => i.label === a.item)
    if (!def) continue
    const key = STOCK_KEYS.find((k) => k.key === def.bucket)?.key
    const have = key ? Math.max(0, Math.round(stock?.[key] ?? 0)) : null
    out.push({
      item: def.label,
      qty: a.qty,
      stockName: stockName(def.bucket),
      have,
      enough: have == null || a.qty == null ? null : have >= a.qty,
      billable: def.billable,
    })
  }
  return out
}
