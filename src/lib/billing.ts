import type { AppData, Client, MaterialSupply, Payment } from '../types'

/** 'YYYY-MM-DD' → 'YYYY-MM' */
const monthOf = (date: string) => date.slice(0, 7)


// ─────────────────────────────────────────────────────────────────────────────
// 거래처 정산
//
//  실제로 쓰던 엑셀(「2026년 정산금 세부내역」 / 「2026 거래명세서」)의 계산을
//  그대로 옮긴 것입니다. 화면을 새로 만든 게 아니라, 현장에서 이미 입력한
//  수거·공급 데이터를 그 계산에 그대로 물린 것입니다.
//
//  엑셀에서 확인한 구조 (2월 실제값으로 검산 완료)
//
//    매출  의료폐기물 kg × 950
//          + 합성수지 2L·5L·20L 개수 × 판매단가      → 「의료폐기물 합계」
//          + 지정폐기물(일회용기저귀) kg × 660        → 「지정폐기물 합계」
//                                                    = 전체매출 6,698,400
//    원가  의료폐기물 소각비   kg × 350
//          + 기저귀 소각비     kg × 200
//          + 기저귀 부가세     kg × 20
//          + 공급한 물품 전체 × 매입단가              = 2,773,650
//    영업이익 = 전체매출 - 원가                        = 3,924,750
//
//  중요한 점 두 가지
//
//   1) 박스(63·30·12·4L)와 기저귀비닐은 거래명세서에 없습니다.
//      무상으로 주는 물품이라 매출에 안 잡히고 원가에만 잡힙니다.
//      합성수지(2·5·20L)만 유상이라 매출·원가 양쪽에 들어갑니다.
//   2) 폐기물은 kg 단가, 물품은 개당 단가입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 정산 품목 키 — 화면·저장·계산에서 공통으로 쓰는 식별자 */
export type ItemKey =
  | 'medical'      // 의료폐기물 (kg)
  | 'diaper'       // 일회용기저귀 = 지정폐기물 (kg)
  | 'plastic2'     // 2L 합성수지 전용용기
  | 'plastic5'     // 5L 합성수지 전용용기
  | 'plastic20'    // 20L 합성수지 전용용기
  | 'box63'        // 63L 골판지 전용박스
  | 'box30'        // 30L 골판지 전용박스
  | 'box12'        // 12L 골판지 전용박스
  | 'box4'         // 4L 골판지 전용박스
  | 'diaperBag40'  // 기저귀 전용 비닐 40L

export type ItemUnit = 'kg' | '개'

/** 재고 차감 대상 — office_stock 은 4칸이므로 품목을 그 칸에 대응시킵니다 */
export type StockBucket = 'corrugatedBox' | 'plasticContainer' | 'bag' | 'needleBox'

export interface ItemDef {
  key: ItemKey
  label: string
  short: string
  unit: ItemUnit
  /** 폐기물(수거로 발생) / 물품(공급으로 발생) */
  kind: 'waste' | 'supply'
  /** 물품일 때 어느 재고에서 빠지는지 */
  bucket?: StockBucket
  /** 거래명세서에 매출로 올라가는 품목인지 (무상 공급은 false) */
  billable: boolean
}

/**
 * 품목 정의.
 * 이 목록과 아래 기본 단가는 비원미래 엑셀에서 그대로 가져온 값입니다.
 * 다른 고객사는 거래처별 단가에서 덮어 씁니다.
 */
export const ITEMS: ItemDef[] = [
  { key: 'medical', label: '의료폐기물', short: '의료', unit: 'kg', kind: 'waste', billable: true },
  { key: 'diaper', label: '일회용기저귀', short: '기저귀', unit: 'kg', kind: 'waste', billable: true },
  { key: 'plastic2', label: '2L 합성수지', short: '2L', unit: '개', kind: 'supply', bucket: 'plasticContainer', billable: true },
  { key: 'plastic5', label: '5L 합성수지', short: '5L', unit: '개', kind: 'supply', bucket: 'plasticContainer', billable: true },
  { key: 'plastic20', label: '20L 합성수지', short: '20L', unit: '개', kind: 'supply', bucket: 'plasticContainer', billable: true },
  { key: 'box63', label: '63L 박스', short: '63L', unit: '개', kind: 'supply', bucket: 'corrugatedBox', billable: false },
  { key: 'box30', label: '30L 박스', short: '30L', unit: '개', kind: 'supply', bucket: 'corrugatedBox', billable: false },
  { key: 'box12', label: '12L 박스', short: '12L', unit: '개', kind: 'supply', bucket: 'corrugatedBox', billable: false },
  { key: 'box4', label: '4L 박스', short: '4L', unit: '개', kind: 'supply', bucket: 'corrugatedBox', billable: false },
  { key: 'diaperBag40', label: '기저귀비닐 40L', short: '비닐40L', unit: '개', kind: 'supply', bucket: 'bag', billable: false },
]

export const ITEM_BY_KEY: Record<ItemKey, ItemDef> = Object.fromEntries(
  ITEMS.map((i) => [i.key, i]),
) as Record<ItemKey, ItemDef>

export const SUPPLY_ITEMS = ITEMS.filter((i) => i.kind === 'supply')
export const WASTE_ITEMS = ITEMS.filter((i) => i.kind === 'waste')

/** 품목별 수량 (자재 공급 기록에 그대로 저장) */
export type ItemCounts = Partial<Record<ItemKey, number>>

/** 한 품목의 단가 — 판매(매출)와 매입(원가)을 따로 둡니다 */
export interface ItemPrice {
  /** 판매단가. null = 무상 공급 (매출에 잡히지 않음) */
  sale: number | null
  /** 매입·처리 단가. 폐기물은 kg 당 소각비, 물품은 개당 매입가 */
  cost: number | null
}

export type PriceTable = Partial<Record<ItemKey, ItemPrice>>

/**
 * 기본 단가 (비원미래 엑셀 기준).
 * 거래처에 단가를 넣지 않았을 때의 출발점이며, 화면에서 「기본값」으로 표시됩니다.
 * 임의로 만든 숫자가 아니라 실제 엑셀에 적혀 있던 값입니다.
 */
export const DEFAULT_PRICES: PriceTable = {
  medical: { sale: 950, cost: 350 },       // 소각비 350
  diaper: { sale: 660, cost: 220 },        // 소각비 200 + 부가세 20
  plastic2: { sale: 3000, cost: 985 },
  plastic5: { sale: 5000, cost: 1639 },
  plastic20: { sale: 7000, cost: 3399 },
  box63: { sale: null, cost: 1045 },       // 무상 공급
  box30: { sale: null, cost: 594 },
  box12: { sale: null, cost: 341 },
  box4: { sale: null, cost: 220 },
  diaperBag40: { sale: null, cost: 149 },
}

/** 이 거래처에 적용할 단가 (거래처 설정 → 없으면 기본값) */
export function priceOf(client: Client | undefined, key: ItemKey): ItemPrice {
  const own = client?.pricing?.[key]
  const base = DEFAULT_PRICES[key] ?? { sale: null, cost: null }
  if (!own) return base
  return {
    sale: own.sale === undefined ? base.sale : own.sale,
    cost: own.cost === undefined ? base.cost : own.cost,
  }
}

/** 거래처가 단가를 직접 정했는지 (화면에서 「기본값」 배지를 붙일 판단용) */
export function hasOwnPrice(client: Client | undefined, key: ItemKey): boolean {
  return client?.pricing?.[key] != null
}

// ── 자재 공급 기록에서 품목별 수량 읽기 ──────────────────────────────────────
//
// items 가 있으면 그대로 씁니다. 없으면(이 기능 이전에 저장된 기록) 기존
// 3칸(boxCount / vinylCount / needleBoxCount)을 대표 규격으로 옮겨 읽습니다.
// 옛 기록도 정산에서 빠지지 않게 하기 위한 것이며, 추정이므로 화면에서
// 「규격 미상」으로 구분해 보여 줍니다.

export function itemsOf(m: MaterialSupply): ItemCounts {
  if (m.items && Object.keys(m.items).length > 0) return m.items
  const legacy: ItemCounts = {}
  if (m.boxCount) legacy.box63 = m.boxCount
  if (m.vinylCount) legacy.diaperBag40 = m.vinylCount
  if (m.needleBoxCount) legacy.plastic2 = m.needleBoxCount
  return legacy
}

/** 규격이 기록되지 않은(이전 방식) 공급인지 */
export function isLegacySupply(m: MaterialSupply): boolean {
  return !m.items || Object.keys(m.items).length === 0
}

/** 품목별 수량 → 재고 4칸 차감량 */
export function stockDeltaOf(items: ItemCounts): Record<StockBucket, number> {
  const out: Record<StockBucket, number> = {
    corrugatedBox: 0,
    plasticContainer: 0,
    bag: 0,
    needleBox: 0,
  }
  for (const [k, n] of Object.entries(items)) {
    const def = ITEM_BY_KEY[k as ItemKey]
    if (def?.bucket && n) out[def.bucket] += n
  }
  return out
}

// ── 월 정산 ──────────────────────────────────────────────────────────────────

export interface SettlementLine {
  key: ItemKey
  label: string
  unit: ItemUnit
  qty: number
  salePrice: number | null
  costPrice: number | null
  /** 매출 (무상이면 0) */
  revenue: number
  /** 원가 */
  cost: number
  billable: boolean
}

export interface Settlement {
  clientId: string
  clientName: string
  month: string // YYYY-MM
  /** 수거 (폐기물) */
  wasteLines: SettlementLine[]
  /** 물품 공급 */
  supplyLines: SettlementLine[]
  /** 유상 물품 매출 */
  supplyRevenue: number
  /** 수거 매출 */
  wasteRevenue: number
  revenue: number
  /** 처리비 (소각비 등) */
  disposalCost: number
  /** 자재 원가 (유상·무상 모두 포함) */
  materialCost: number
  cost: number
  profit: number
  /** 영업이익률 (매출 0 이면 null) */
  margin: number | null
  /** 집계에 쓴 수거 건수 */
  collections: number
  /** 집계에 쓴 공급 건수 */
  supplies: number
  /** 규격이 기록되지 않은 공급이 섞여 있는지 */
  hasLegacySupply: boolean
}

/** 완료된 수거만 집계합니다 (예정은 매출이 아닙니다) */
/**
 * 이미 청구한 수거·공급을 빼고 계산하기 위한 제외 목록.
 * 청구를 확정하면 그 청구가 덮은 id 들이 여기에 들어옵니다.
 */
export interface BilledIds {
  scheduleIds?: string[]
  materialIds?: string[]
}

function completedIn(data: AppData, clientId: string, month: string, billed?: BilledIds) {
  const skip = new Set(billed?.scheduleIds ?? [])
  return data.schedules.filter(
    (s) =>
      s.clientId === clientId &&
      s.status === '완료' &&
      monthOf(s.date) === month &&
      !skip.has(s.id),
  )
}

//  거래처를 정리해도 그 달의 청구서는 다시 뽑을 수 있어야 합니다.
//  활성 목록만 뒤지면 단가를 못 찾아 명세서가 0원으로 나옵니다.
function findClient(data: AppData, clientId: string) {
  return (
    data.clients.find((c) => c.id === clientId) ??
    data.retiredClients?.find((c) => c.id === clientId)
  )
}

function suppliesIn(data: AppData, clientId: string, month: string, billed?: BilledIds) {
  const skip = new Set(billed?.materialIds ?? [])
  return data.materials.filter(
    (m) => m.clientId === clientId && monthOf(m.date) === month && !skip.has(m.id),
  )
}

/**
 * 월 정산.
 *
 *  billed 를 주면 이미 청구한 수거·공급을 빼고 계산합니다. 청구를 확정한
 *  뒤에 들어온 추가 수거만 모아 「추가 청구」를 만들 때 씁니다 — 확정한
 *  청구에 뒤늦게 섞여 금액이 바뀌는 일이 없어야 하기 때문입니다.
 */
export function settlementFor(
  data: AppData,
  clientId: string,
  month: string,
  billed?: BilledIds,
): Settlement {
  const client = findClient(data, clientId)
  const scheds = completedIn(data, clientId, month, billed)
  const sups = suppliesIn(data, clientId, month, billed)

  // 폐기물 — 완료된 수거의 실제 수거량(kg)
  const kg: Record<'medical' | 'diaper', number> = { medical: 0, diaper: 0 }
  for (const s of scheds) {
    const key = s.wasteType === '의료폐기물' ? 'medical' : 'diaper'
    kg[key] += s.actualAmount ?? 0
  }

  // 물품 — 공급 기록의 품목별 합계
  const counts: ItemCounts = {}
  for (const m of sups) {
    for (const [k, n] of Object.entries(itemsOf(m))) {
      counts[k as ItemKey] = (counts[k as ItemKey] ?? 0) + (n ?? 0)
    }
  }

  const line = (key: ItemKey, qty: number): SettlementLine => {
    const def = ITEM_BY_KEY[key]
    const p = priceOf(client, key)
    const revenue = def.billable && p.sale != null ? qty * p.sale : 0
    const cost = p.cost != null ? qty * p.cost : 0
    return {
      key,
      label: def.label,
      unit: def.unit,
      qty,
      salePrice: def.billable ? p.sale : null,
      costPrice: p.cost,
      revenue,
      cost,
      billable: def.billable,
    }
  }

  const wasteLines = WASTE_ITEMS
    .filter((d) => kg[d.key as 'medical' | 'diaper'] > 0)
    .map((d) => line(d.key, kg[d.key as 'medical' | 'diaper']))

  const supplyLines = SUPPLY_ITEMS
    .filter((d) => (counts[d.key] ?? 0) > 0)
    .map((d) => line(d.key, counts[d.key] ?? 0))

  const wasteRevenue = wasteLines.reduce((a, l) => a + l.revenue, 0)
  const supplyRevenue = supplyLines.reduce((a, l) => a + l.revenue, 0)
  const disposalCost = wasteLines.reduce((a, l) => a + l.cost, 0)
  const materialCost = supplyLines.reduce((a, l) => a + l.cost, 0)

  const revenue = wasteRevenue + supplyRevenue
  const cost = disposalCost + materialCost
  const profit = revenue - cost

  return {
    clientId,
    clientName: client?.name ?? '',
    month,
    wasteLines,
    supplyLines,
    supplyRevenue,
    wasteRevenue,
    revenue,
    disposalCost,
    materialCost,
    cost,
    profit,
    margin: revenue > 0 ? profit / revenue : null,
    collections: scheds.length,
    supplies: sups.length,
    hasLegacySupply: sups.some(isLegacySupply),
  }
}

/** 전체 거래처 합계 — 대표가 보는 월간 경영 요약 */
export interface MonthlyRollup {
  month: string
  revenue: number
  disposalCost: number
  materialCost: number
  cost: number
  profit: number
  margin: number | null
  rows: Settlement[]
}

export function rollupFor(data: AppData, month: string): MonthlyRollup {
  //  그만둔 거래처도 넣습니다. 빼 버리면 거래를 정리한 순간 지난달 매출이
  //  같이 줄어듭니다 — 이미 청구한 돈인데도요. 그 달에 실적이 없으면
  //  아래 filter 에서 어차피 빠집니다.
  const rows = [...data.clients, ...(data.retiredClients ?? [])]
    .map((c) => settlementFor(data, c.id, month))
    .filter((s) => s.revenue > 0 || s.cost > 0)
    .sort((a, b) => b.profit - a.profit)

  const revenue = rows.reduce((a, r) => a + r.revenue, 0)
  const disposalCost = rows.reduce((a, r) => a + r.disposalCost, 0)
  const materialCost = rows.reduce((a, r) => a + r.materialCost, 0)
  const cost = disposalCost + materialCost
  const profit = revenue - cost
  return {
    month,
    revenue,
    disposalCost,
    materialCost,
    cost,
    profit,
    margin: revenue > 0 ? profit / revenue : null,
    rows,
  }
}

// ── 거래명세서 ───────────────────────────────────────────────────────────────
//
// 엑셀 「2026 거래명세서」와 같은 구성입니다.
//  · 수거일자별로 의료폐기물(kg) 과 그날 함께 공급한 유상 물품(개) 을 한 줄씩
//  · 일회용기저귀는 일자별 kg
//  · 무상 공급 물품은 매출이 아니므로 명세서에 올리지 않습니다 (비고에만 표기)

export interface InvoiceLine {
  date: string
  itemKey: ItemKey
  label: string
  unit: ItemUnit
  qty: number
  price: number
  amount: number
  note: string
}

export interface Invoice {
  clientId: string
  clientName: string
  manager: string
  month: string
  /** 거래기간 */
  from: string
  to: string
  /** 발행일 (월 마지막 날) */
  issuedAt: string
  /** 결제기한 */
  dueDate: string | null
  paymentTerms: string
  medicalLines: InvoiceLine[]
  diaperLines: InvoiceLine[]
  medicalSubtotal: number
  diaperSubtotal: number
  medicalKg: number
  diaperKg: number
  total: number
  /** 무상으로 공급한 물품 (매출 아님 — 참고 표기용) */
  freeSupplies: { label: string; qty: number; unit: ItemUnit }[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 해당 월의 마지막 날 (YYYY-MM-DD) */
export function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad(new Date(y, m, 0).getDate())}`
}

/**
 * 명세서에 적을 '오늘까지' 의 마지막 날.
 *
 *  달이 끝나기 전에 명세서를 뽑는 일이 있습니다(중간 확인·선청구). 그때
 *  월말 날짜를 그대로 적으면 아직 오지 않은 날짜가 발행일자·거래일자로
 *  나갑니다. 8월 10일에 뽑았는데 "발행일자 2026년 8월 31일 · 거래일자
 *  8월 1일 ~ 31일" 이라고 적힌 문서가 병원에 갑니다. 지난 달 명세서는
 *  그대로 월말입니다.
 */
function throughToday(month: string): string {
  const end = lastDayOf(month)
  const d = new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return today < end && today.slice(0, 7) === month ? today : end
}

/**
 * 결제기한 계산.
 * 거래처의 결제일 규칙(`paymentDueDay`)을 씁니다. 예: 20 → 익월 20일.
 * 규칙이 없으면 null (명세서에 「거래처와 협의」로 표시).
 */
export function dueDateOf(month: string, dueDay: number | null | undefined): string | null {
  if (!dueDay) return null
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 1) // m 은 1-base 이므로 이미 다음 달
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  const day = Math.min(dueDay, last)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(day)}`
}

export function invoiceFor(
  data: AppData,
  clientId: string,
  month: string,
  billed?: BilledIds,
): Invoice {
  const client = findClient(data, clientId)
  const scheds = completedIn(data, clientId, month, billed).slice().sort((a, b) => a.date.localeCompare(b.date))
  const sups = suppliesIn(data, clientId, month, billed).slice().sort((a, b) => a.date.localeCompare(b.date))

  const medicalLines: InvoiceLine[] = []
  const diaperLines: InvoiceLine[] = []

  for (const s of scheds) {
    const key: ItemKey = s.wasteType === '의료폐기물' ? 'medical' : 'diaper'
    const p = priceOf(client, key)
    const qty = s.actualAmount ?? 0
    if (qty <= 0 || p.sale == null) continue
    const row: InvoiceLine = {
      date: s.date,
      itemKey: key,
      label: ITEM_BY_KEY[key].label,
      unit: 'kg',
      qty,
      price: p.sale,
      amount: qty * p.sale,
      note: (s as { isAdditional?: boolean }).isAdditional ? '추가 수거' : '',
    }
    ;(key === 'medical' ? medicalLines : diaperLines).push(row)
  }

  // 유상 물품 — 공급한 날짜에 매출로 올립니다
  const freeMap = new Map<ItemKey, number>()
  for (const m of sups) {
    for (const [k, n] of Object.entries(itemsOf(m))) {
      const key = k as ItemKey
      const def = ITEM_BY_KEY[key]
      if (!def || !n) continue
      if (!def.billable) {
        freeMap.set(key, (freeMap.get(key) ?? 0) + n)
        continue
      }
      const p = priceOf(client, key)
      if (p.sale == null) continue
      medicalLines.push({
        date: m.date,
        itemKey: key,
        label: def.label,
        unit: def.unit,
        qty: n,
        price: p.sale,
        amount: n * p.sale,
        note: m.isAdditionalRequest ? '추가 요청' : '',
      })
    }
  }

  medicalLines.sort((a, b) => a.date.localeCompare(b.date) || a.itemKey.localeCompare(b.itemKey))
  diaperLines.sort((a, b) => a.date.localeCompare(b.date))

  const medicalSubtotal = medicalLines.reduce((a, l) => a + l.amount, 0)
  const diaperSubtotal = diaperLines.reduce((a, l) => a + l.amount, 0)

  return {
    clientId,
    clientName: client?.name ?? '',
    manager: client?.manager ?? '',
    month,
    from: `${month}-01`,
    to: throughToday(month),
    issuedAt: throughToday(month),
    dueDate: dueDateOf(month, client?.paymentDueDay),
    paymentTerms: client?.paymentTerms ?? '',
    medicalLines,
    diaperLines,
    medicalSubtotal,
    diaperSubtotal,
    medicalKg: medicalLines.filter((l) => l.itemKey === 'medical').reduce((a, l) => a + l.qty, 0),
    diaperKg: diaperLines.reduce((a, l) => a + l.qty, 0),
    total: medicalSubtotal + diaperSubtotal,
    freeSupplies: [...freeMap.entries()].map(([k, qty]) => ({
      label: ITEM_BY_KEY[k].label,
      qty,
      unit: ITEM_BY_KEY[k].unit,
    })),
  }
}

// ── 자재 사용량 비교 ─────────────────────────────────────────────────────────
//
// 엑셀에서 거래처별로 따로 세던 「박스사용량 / 합성수지사용량」에 대응합니다.
// 예측이 아니라 지난 몇 달 평균과 이번 달을 나란히 놓고 보는 것뿐입니다.

export interface UsageRow {
  key: ItemKey
  label: string
  unit: ItemUnit
  current: number
  average: number
  /** 평균 대비 증감률. 평균이 0 이면 null */
  delta: number | null
  flag: 'high' | 'low' | 'normal'
}

/** 급증·급감 판단 기준 (평균 대비) */
const HIGH = 0.3
const LOW = -0.3

/** 이번 달 공급량 vs 직전 N개월 평균 */
export function usageComparison(
  data: AppData,
  clientId: string,
  month: string,
  months = 3,
): UsageRow[] {
  const prev: string[] = []
  const [y, m] = month.split('-').map(Number)
  for (let i = 1; i <= months; i++) {
    const d = new Date(y, m - 1 - i, 1)
    prev.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }

  const sumFor = (mo: string): ItemCounts => {
    const out: ItemCounts = {}
    for (const s of suppliesIn(data, clientId, mo)) {
      for (const [k, n] of Object.entries(itemsOf(s))) {
        out[k as ItemKey] = (out[k as ItemKey] ?? 0) + (n ?? 0)
      }
    }
    return out
  }

  const cur = sumFor(month)
  const past = prev.map(sumFor)
  // 공급이 아예 없던 달은 평균에서 빼지 않습니다 —
  // "안 줬다"도 사용량 정보이고, 빼면 평균이 실제보다 높게 나옵니다.
  const rows: UsageRow[] = []
  for (const def of SUPPLY_ITEMS) {
    const current = cur[def.key] ?? 0
    const avg = past.reduce((a, p) => a + (p[def.key] ?? 0), 0) / (past.length || 1)
    if (current === 0 && avg === 0) continue
    const delta = avg > 0 ? (current - avg) / avg : null
    rows.push({
      key: def.key,
      label: def.label,
      unit: def.unit,
      current,
      average: Math.round(avg * 10) / 10,
      delta,
      flag: delta == null ? 'normal' : delta >= HIGH ? 'high' : delta <= LOW ? 'low' : 'normal',
    })
  }
  return rows
}

// ── 계약 ─────────────────────────────────────────────────────────────────────

/** 계약 만료까지 남은 일수 (없으면 null) */
export function daysToContractEnd(client: Client, today: string): number | null {
  if (!client.contractEnd) return null
  const a = new Date(today + 'T00:00:00')
  const b = new Date(client.contractEnd + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** 계약 상태 — 상세 화면 배지용 */
export function contractState(
  client: Client,
  today: string,
): { label: string; tone: 'navy' | 'amber' | 'rose' | 'teal' } | null {
  const d = daysToContractEnd(client, today)
  if (d == null) return null
  if (d < 0) return { label: '계약 만료', tone: 'rose' }
  if (d <= 30) return { label: `만료 ${d}일 전`, tone: 'rose' }
  if (d <= 90) return { label: `만료 ${d}일 전`, tone: 'amber' }
  return { label: `~ ${client.contractEnd}`, tone: 'teal' }
}

// ─────────────────────────────────────────────────────────────────────────────
// 청구 확정
//
//  사무실이 월 정산을 눈으로 확인한 뒤 「청구 확정」을 누르면, 그 순간의
//  정산·명세서 내용이 그대로 굳습니다. 굳히는 이유는 하나입니다 — 이미
//  병원에 보낸 금액이 나중에 바뀌면 안 되기 때문입니다.
//
//  지금은 단가를 바꾸면 지난달 명세서 금액까지 같이 바뀝니다(실측: 7월
//  100kg 수거가 95,000원 → 단가를 1,500원으로 바꾸자 같은 7월이 150,000원).
//  청구를 확정해 두면 그 청구와 그 달의 명세서는 흔들리지 않습니다.
//
//  확정 뒤에 그 달의 수거가 더 들어오면, 기존 청구는 그대로 두고 남은 것만
//  모아 「추가 청구」로 냅니다. 그래서 스냅샷에 '이 청구가 덮은 id' 를
//  함께 담아 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 청구 확정 시점에 굳혀 두는 내용 */
export interface BillingSnapshot {
  /** 확정 시각 (ISO) */
  confirmedAt: string
  /** 이 청구가 덮은 수거 id — 다음 청구는 이걸 빼고 계산합니다 */
  scheduleIds: string[]
  /** 이 청구가 덮은 자재 공급 id */
  materialIds: string[]
  /** 확정 당시의 거래명세서 (나중에 그대로 다시 뽑을 수 있습니다) */
  invoice: Invoice
  /** 확정 당시의 손익 (매출·원가·이익) */
  revenue: number
  cost: number
  profit: number
  /** 정기 청구인지, 확정 뒤 추가분에 대한 청구인지 */
  kind: '정기' | '추가'
}

/** 취소되지 않은 청구만 — 취소한 청구는 없는 것으로 봅니다 */
export function liveBills(data: AppData, clientId: string, month: string): Payment[] {
  return data.payments.filter(
    (p) => p.clientId === clientId && p.billingMonth === month && p.status !== '취소',
  )
}

/** 그 달에 이미 청구한 수거·공급 id 를 모읍니다 */
export function billedIdsOf(data: AppData, clientId: string, month: string): BilledIds {
  const scheduleIds: string[] = []
  const materialIds: string[] = []
  for (const p of liveBills(data, clientId, month)) {
    const snap = p.snapshot
    if (!snap) continue
    scheduleIds.push(...(snap.scheduleIds ?? []))
    materialIds.push(...(snap.materialIds ?? []))
  }
  return { scheduleIds, materialIds }
}

/** 청구 화면이 알아야 할 것 — 얼마를 청구했고, 아직 얼마가 남았는가 */
export interface BillingState {
  /** 이미 확정한 청구 (취소분 제외) */
  bills: Payment[]
  /** 이미 청구한 금액 합계 */
  billedAmount: number
  /** 아직 청구하지 않은 수거·공급으로 계산한 정산 */
  pending: Settlement
  /** 지금 확정하면 만들어질 청구 금액 */
  pendingAmount: number
  /** 확정할 것이 남아 있는가 */
  canConfirm: boolean
  /** 이번에 만들 청구의 종류 */
  nextKind: '정기' | '추가'
  /**
   * 스냅샷이 없는 옛 청구가 섞여 있는가.
   * 그런 청구는 무엇을 덮었는지 알 수 없어 남은 금액을 정확히 못 셉니다.
   */
  hasLegacyBill: boolean
}

export function billingStateFor(data: AppData, clientId: string, month: string): BillingState {
  const bills = liveBills(data, clientId, month)
  const billedAmount = bills.reduce((a, p) => a + p.amount, 0)
  const billed = billedIdsOf(data, clientId, month)
  const pending = settlementFor(data, clientId, month, billed)
  const hasLegacyBill = bills.some((p) => !p.snapshot)
  return {
    bills,
    billedAmount,
    pending,
    pendingAmount: pending.revenue,
    //  남은 수거·공급이 있어야 확정할 수 있습니다. 없으면 버튼이 잠깁니다
    //  (같은 달을 두 번 청구하는 것을 이걸로 막습니다).
    canConfirm: pending.collections + pending.supplies > 0,
    nextKind: bills.length > 0 ? '추가' : '정기',
    hasLegacyBill,
  }
}

/**
 * 지금 확정하면 어떤 청구가 되는지 만들어 봅니다 (저장은 하지 않습니다).
 * 화면 미리보기와 실제 저장이 같은 함수를 쓰도록 여기 한 곳에 둡니다.
 */
export function buildBillingSnapshot(
  data: AppData,
  clientId: string,
  month: string,
  now: string,
): { snapshot: BillingSnapshot; amount: number } | null {
  const state = billingStateFor(data, clientId, month)
  if (!state.canConfirm) return null
  const billed = billedIdsOf(data, clientId, month)
  const invoice = invoiceFor(data, clientId, month, billed)
  const skipS = new Set(billed.scheduleIds ?? [])
  const skipM = new Set(billed.materialIds ?? [])
  const snapshot: BillingSnapshot = {
    confirmedAt: now,
    scheduleIds: data.schedules
      .filter((s) => s.clientId === clientId && s.status === '완료' && s.date.slice(0, 7) === month && !skipS.has(s.id))
      .map((s) => s.id),
    materialIds: data.materials
      .filter((m) => m.clientId === clientId && m.date.slice(0, 7) === month && !skipM.has(m.id))
      .map((m) => m.id),
    invoice,
    revenue: state.pending.revenue,
    cost: state.pending.cost,
    profit: state.pending.profit,
    kind: state.nextKind,
  }
  return { snapshot, amount: state.pending.revenue }
}

/**
 * 그 달의 거래명세서.
 *
 *  청구를 확정했으면 확정 당시에 굳혀 둔 명세서를 그대로 돌려줍니다.
 *  아직 확정 전이면 지금 값으로 계산합니다. 청구가 여러 건(정기 + 추가)이면
 *  각각의 명세서가 있으므로, 여기서는 가장 최근 것을 돌려줍니다 — 화면은
 *  청구 목록에서 원하는 건을 골라 열 수 있습니다.
 */
export function invoiceForBilled(data: AppData, clientId: string, month: string): Invoice {
  const bills = liveBills(data, clientId, month).filter((p) => p.snapshot?.invoice)
  if (bills.length === 0) return invoiceFor(data, clientId, month)
  const last = bills[bills.length - 1]
  return last.snapshot!.invoice
}
