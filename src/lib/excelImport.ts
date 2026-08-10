import type { CellValue, Sheet } from './xlsx'
import type { ItemKey } from './billing'
import type { AppData, Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 기존 거래처 엑셀 가져오기 — 읽고, 따져 보고, 확인받은 것만 넣습니다
//
//  업체마다 몇 년치 기록이 엑셀에 들어 있습니다. 그것을 시스템으로 옮기되,
//  **추측해서 조용히 넣지 않는 것**이 이 파일의 전부입니다.
//
//  엑셀에는 두 종류의 기록이 섞여 있습니다.
//
//   1) 날짜가 있는 것 — 거래명세서의 줄들("8월 5일 의료폐기물 472kg").
//      이것은 그대로 수거 기록으로 만들 수 있습니다.
//
//   2) 날짜가 없는 것 — 정산 시트의 월별 합계("2월 의료폐기물 1,644kg").
//      한 달 치가 한 칸에 뭉쳐 있어, 언제 몇 번에 나눠 수거했는지 알 수
//      없습니다. 이것을 "2월 1일에 1,644kg 수거" 같은 식으로 만들어 넣으면
//      있지도 않았던 수거일이 기록으로 남습니다. 그래서 **만들지 않고**
//      「확인 필요」로 따로 보여 줍니다 — 월 정산 대조에는 그대로 씁니다.
//
//  금액도 다시 계산해 봅니다. 엑셀에 적힌 금액과 수량 × 단가가 다르면
//  그 줄은 「오류」로 빼 둡니다. 맞춰 보지 않고 넣으면 나중에 정산이
//  어긋나는데 원인을 찾을 수 없습니다.
//
//  원본 파일은 읽기만 합니다. 어떤 경우에도 수정하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type IssueLevel = '오류' | '확인 필요'
export type RowStatus = '등록 예정' | '건너뜀' | '충돌' | '오류'

export interface ImportIssue {
  level: IssueLevel
  /** 파일 어디에서 나온 것인지 — 사람이 엑셀을 열어 확인할 수 있게 */
  where: string
  what: string
  hint?: string
}

export interface PlannedCollection {
  kind: '수거'
  date: string
  wasteType: '의료폐기물' | '일회용기저귀'
  kg: number
  /** 엑셀에 적힌 금액 (검증용 — 시스템은 단가로 다시 계산합니다) */
  amount: number
  where: string
  status: RowStatus
  reason?: string
  /** 날짜를 그 줄에서 직접 읽었는지, 윗줄에서 이어받았는지 */
  dateFrom?: '직접' | '윗줄'
}

export interface PlannedSupply {
  kind: '자재'
  date: string
  items: Partial<Record<ItemKey, number>>
  amount: number
  where: string
  status: RowStatus
  reason?: string
  dateFrom?: '직접' | '윗줄'
}

export type PlannedRow = PlannedCollection | PlannedSupply

/** 월별 합계 — 등록하지 않고, 가져오기 뒤 대조에만 씁니다 */
export interface MonthlyTotal {
  month: string
  medicalKg: number
  diaperKg: number
  revenue: number
  cost: number
  profit: number
  /** 이 달에 날짜가 있는 기록이 있는가 */
  hasDated: boolean
}

export interface ClientProfile {
  name: string
  contractStart: string | null
  contractEnd: string | null
  paymentTerms: string
  paymentDueDay: number | null
  pricing: Record<string, { sale: number | null; cost: number | null }>
}

export interface ImportPlan {
  fileName: string
  year: number | null
  client: ClientProfile | null
  rows: PlannedRow[]
  monthly: MonthlyTotal[]
  issues: ImportIssue[]
}

export interface PlanCounts {
  willImport: number
  skip: number
  conflict: number
  error: number
  needsCheck: number
}

// ── 엑셀의 품목 이름 → 시스템 품목 ──────────────────────────────────────────
//
//  이름이 조금씩 다릅니다("의료폐기물 " 뒤 공백, "의료기관일회용기저귀").
//  아는 이름만 받고, 모르는 이름은 조용히 버리지 않고 「확인 필요」로 올립니다.
const WASTE_ALIAS: { re: RegExp; type: '의료폐기물' | '일회용기저귀' }[] = [
  { re: /^의료폐기물$/, type: '의료폐기물' },
  { re: /기저귀/, type: '일회용기저귀' },
  { re: /^지정폐기물$/, type: '일회용기저귀' },
]
const SUPPLY_ALIAS: { re: RegExp; key: ItemKey }[] = [
  { re: /^2\s*L?\s*(리터)?\s*합성수지$/, key: 'plastic2' },
  { re: /^5\s*L?\s*(리터)?\s*합성수지$/, key: 'plastic5' },
  { re: /^20\s*L?\s*(리터)?\s*합성수지$/, key: 'plastic20' },
  { re: /^63\s*(리터|L)\s*박스$/, key: 'box63' },
  { re: /^30\s*(리터|L)\s*박스$/, key: 'box30' },
  { re: /^12\s*(리터|L)\s*박스$/, key: 'box12' },
  { re: /^4\s*(리터|L)\s*박스$/, key: 'box4' },
  { re: /기저귀비닐/, key: 'diaperBag40' },
]

const txt = (v: CellValue): string => (v === null || v === undefined ? '' : String(v).trim())
const num = (v: CellValue): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, '')))) {
    return Number(v.replace(/,/g, ''))
  }
  return null
}
const isDate = (v: CellValue): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** 정산 시트의 A열 라벨로 행을 찾습니다 (행 번호를 박아 두면 다른 파일에서 깨집니다) */
function rowByLabel(rows: CellValue[][], re: RegExp): CellValue[] | null {
  for (const r of rows) if (re.test(txt(r?.[0]))) return r
  return null
}

/** 머리글에서 「N월」 칸을 찾아 (수량 열, 금액 열) 로 돌려줍니다 */
function monthColumns(header: CellValue[]): { month: number; qtyCol: number; amtCol: number }[] {
  const out: { month: number; qtyCol: number; amtCol: number }[] = []
  for (let c = 0; c < header.length; c++) {
    const m = /^(\d{1,2})월$/.exec(txt(header[c]))
    if (m) out.push({ month: Number(m[1]), qtyCol: c - 1, amtCol: c })
  }
  return out
}

// ── 1. 정산 시트 — 거래처 · 계약 · 단가 · 월별 합계 ─────────────────────────

function readSettlementSheet(sheet: Sheet, plan: ImportPlan) {
  const rows = sheet.rows
  const header = rows[0] ?? []
  const months = monthColumns(header)
  if (!months.length) {
    plan.issues.push({
      level: '오류',
      where: `${sheet.name} 머리글`,
      what: '월별 칸(1월~12월)을 찾지 못했습니다',
      hint: '첫 줄에 「1월」「2월」… 이 있어야 어느 칸이 어느 달인지 알 수 있습니다.',
    })
    return
  }

  const year = Number(/(\d{4})/.exec(sheet.name)?.[1] ?? '') || plan.year
  if (!year) {
    plan.issues.push({
      level: '오류',
      where: sheet.name,
      what: '연도를 알 수 없습니다',
      hint: '시트 이름에 「2026」처럼 연도가 있어야 몇 년 기록인지 정할 수 있습니다.',
    })
    return
  }
  plan.year = year

  // 거래처 줄 — 머리글 바로 아래
  const info = rows[1] ?? []
  const name = txt(info[0])
  if (!name) {
    plan.issues.push({ level: '오류', where: `${sheet.name} 2행`, what: '거래처 이름이 비어 있습니다' })
    return
  }

  const price = (re: RegExp, col = 3) => num(rowByLabel(rows, re)?.[col] ?? null)
  const pricing: ClientProfile['pricing'] = {}
  const put = (key: ItemKey, sale: number | null, cost: number | null) => {
    if (sale === null && cost === null) return
    pricing[key] = { sale, cost }
  }
  //  원가는 엑셀에 음수로 적혀 있습니다(-350). 시스템은 양수로 씁니다.
  const pos = (n: number | null) => (n === null ? null : Math.abs(n))

  put('medical', price(/^의료폐기물$/), pos(price(/^의료폐기물소각비용$/)))
  //  기저귀 원가는 소각비 + 부가세 두 줄로 나뉘어 있습니다.
  const diaperCost = pos(price(/소각비용.*기저귀|기저귀.*소각/))
  const diaperVat = pos(price(/^기저귀 부가세$/))
  put('diaper', price(/^지정폐기물$/), diaperCost === null && diaperVat === null ? null : (diaperCost ?? 0) + (diaperVat ?? 0))
  put('plastic2', price(/^합성수지 ?2L$/), pos(price(/^2리터 합성수지$/)))
  put('plastic5', price(/^합성수지 ?5L$/), pos(price(/^5리터 합성수지$/)))
  put('plastic20', price(/^합성수지 ?20L$/), pos(price(/^20리터 합성수지$/)))
  put('box63', null, pos(price(/^63리터 박스$/)))
  put('box30', null, pos(price(/^30리터 박스$/)))
  put('box12', null, pos(price(/^12리터 박스$/)))
  put('box4', null, pos(price(/^4리터 박스$/)))
  put('diaperBag40', null, pos(price(/기저귀비닐/)))

  const due = /(\d{1,2})\s*일/.exec(txt(info[5]))?.[1]
  plan.client = {
    name,
    contractStart: isDate(info[1]) ? info[1] : null,
    contractEnd: isDate(info[2]) ? info[2] : null,
    paymentTerms: txt(info[5]),
    paymentDueDay: due ? Number(due) : null,
    pricing,
  }

  if (txt(info[5]) && !due) {
    plan.issues.push({
      level: '확인 필요',
      where: `${sheet.name} F2`,
      what: `결제조건 "${txt(info[5])}" 에서 결제일을 읽지 못했습니다`,
      hint: '「익월20일」처럼 날짜가 들어 있어야 결제기한을 자동으로 채웁니다. 지금은 비워 둡니다.',
    })
  }

  // 월별 합계
  const medical = rowByLabel(rows, /^의료폐기물 합계$/)
  const diaper = rowByLabel(rows, /^지정폐기물 합계$/)
  const revenue = rowByLabel(rows, /^전체매출$/)
  const profit = rowByLabel(rows, /^영업이익/)
  const burnMed = rowByLabel(rows, /^의료폐기물소각비용$/)
  const burnDia = rowByLabel(rows, /소각비용.*기저귀|기저귀.*소각/)
  const vat = rowByLabel(rows, /^기저귀 부가세$/)
  const goods = rowByLabel(rows, /^물품사용$/)

  for (const { month, qtyCol, amtCol } of months) {
    const rev = num(revenue?.[amtCol] ?? null) ?? 0
    const mKg = num(medical?.[qtyCol] ?? null) ?? 0
    const dKg = num(diaper?.[qtyCol] ?? null) ?? 0
    if (rev === 0 && mKg === 0 && dKg === 0) continue
    const cost =
      Math.abs(num(burnMed?.[amtCol] ?? null) ?? 0) +
      Math.abs(num(burnDia?.[amtCol] ?? null) ?? 0) +
      Math.abs(num(vat?.[amtCol] ?? null) ?? 0) +
      Math.abs(num(goods?.[amtCol] ?? null) ?? 0)
    plan.monthly.push({
      month: `${year}-${String(month).padStart(2, '0')}`,
      medicalKg: mKg,
      diaperKg: dKg,
      revenue: rev,
      cost,
      profit: num(profit?.[amtCol] ?? null) ?? 0,
      hasDated: false,
    })
  }

  const status = txt(info[30])
  if (status) {
    plan.issues.push({
      level: '확인 필요',
      where: `${sheet.name} AE2`,
      what: `정산 상태가 「${status}」 로 적혀 있습니다`,
      hint: '어느 달의 청구인지가 파일에 없어 미수금으로 만들지 않았습니다. 옮긴 뒤 「청구 확정」에서 직접 잡아 주세요.',
    })
  }
}

// ── 2. 거래명세서 시트 — 날짜가 있는 기록 ───────────────────────────────────

function readInvoiceSheet(sheet: Sheet, plan: ImportPlan) {
  const rows = sheet.rows
  //  머리글(월/일 · 품목 · 수량 · 단가 · 공급가액)이 있는 줄을 찾습니다.
  let head = -1
  for (let r = 0; r < rows.length; r++) {
    const line = (rows[r] ?? []).map(txt).join('|')
    if (/월\/일/.test(line) && /품목/.test(line) && /공급가액/.test(line)) {
      head = r
      break
    }
  }
  if (head < 0) {
    plan.issues.push({
      level: '확인 필요',
      where: sheet.name,
      what: '거래명세서의 표 머리글을 찾지 못했습니다',
      hint: '이 시트에서는 날짜가 있는 기록을 가져오지 못했습니다.',
    })
    return
  }
  const col = { date: 0, item: 1, qty: 3, price: 5, amount: 6 }
  const line = rows[head] ?? []
  for (let c = 0; c < line.length; c++) {
    const t = txt(line[c])
    if (/월\/일/.test(t)) col.date = c
    else if (/^품목$/.test(t)) col.item = c
    else if (/^수량$/.test(t)) col.qty = c
    else if (/^단가$/.test(t)) col.price = c
    else if (/공급가액/.test(t)) col.amount = c
  }

  //  제목의 연월과 실제 거래일자가 다른 경우가 있습니다(제목만 안 고친 파일).
  //  이런 것을 임의로 맞추면 안 됩니다 — 그대로 보여 드립니다.
  const title = txt(rows[0]?.[0])
  const titleYm = /(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(title)

  let lastItem = ''
  //  한 번 방문한 날의 줄들은 첫 줄에만 날짜가 적혀 있습니다. 아래 줄은
  //  같은 날 것이라 비워 두는 것이 엑셀의 관행입니다(이 파일에서는 20L
  //  합성수지 줄의 비고에 "8월5일 입고" 라고 따로 적혀 있어 확인됩니다).
  //  그래서 날짜를 윗줄에서 이어받되, 어느 줄이 직접 적힌 것이고 어느
  //  줄이 이어받은 것인지 표시해 미리보기에 그대로 보여 줍니다 —
  //  이어받은 것을 직접 적힌 것처럼 보이게 하지는 않습니다.
  //  합계 줄을 만나면 묶음이 끝난 것이므로 이어받기를 끊습니다.
  let lastDate: string | null = null
  const supplyByDate = new Map<
    string,
    { items: Partial<Record<ItemKey, number>>; amount: number; where: string[]; from: '직접' | '윗줄' }
  >()

  for (let r = head + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const first = txt(row[col.date])
    if (/합계/.test(first) || /거래조건/.test(first)) {
      lastDate = null
      continue
    }

    const label = txt(row[col.item])
    if (label) lastItem = label
    const qty = num(row[col.qty] ?? null)
    if (!qty) continue // 0 이거나 빈 줄

    const own = isDate(row[col.date]) ? (row[col.date] as string) : null
    if (own) lastDate = own
    const date = own ?? lastDate
    const dateFrom: '직접' | '윗줄' = own ? '직접' : '윗줄'
    const where = `${sheet.name} ${r + 1}행`
    if (!date) {
      plan.issues.push({
        level: '확인 필요',
        where,
        what: `${lastItem || '품목 미상'} ${qty} — 날짜가 비어 있습니다`,
        hint: '언제 수거했는지 알 수 없어 기록으로 만들지 않았습니다.',
      })
      continue
    }

    const price = num(row[col.price] ?? null) ?? 0
    const amount = num(row[col.amount] ?? null) ?? 0
    //  금액 검증 — 수량 × 단가가 적힌 금액과 다르면 넣지 않습니다.
    if (price > 0 && Math.round(qty * price) !== Math.round(amount)) {
      plan.rows.push({
        kind: '수거',
        date,
        wasteType: '의료폐기물',
        kg: qty,
        amount,
        where,
        dateFrom,
        status: '오류',
        reason: `수량×단가 ${Math.round(qty * price).toLocaleString()}원 ≠ 적힌 금액 ${Math.round(amount).toLocaleString()}원`,
      })
      continue
    }

    const waste = WASTE_ALIAS.find((a) => a.re.test(lastItem.replace(/\s+/g, '')))
    if (waste) {
      plan.rows.push({
        kind: '수거',
        date,
        wasteType: waste.type,
        kg: qty,
        amount,
        where,
        dateFrom,
        status: '등록 예정',
      })
      continue
    }
    const supply = SUPPLY_ALIAS.find((a) => a.re.test(lastItem.replace(/\s+/g, ' ').trim()))
    if (supply) {
      const cur = supplyByDate.get(date) ?? { items: {}, amount: 0, where: [], from: dateFrom }
      cur.items[supply.key] = (cur.items[supply.key] ?? 0) + qty
      cur.amount += amount
      cur.where.push(where)
      supplyByDate.set(date, cur)
      continue
    }
    plan.issues.push({
      level: '확인 필요',
      where,
      what: `모르는 품목 「${lastItem}」 ${qty}`,
      hint: '시스템에 같은 품목이 없어 옮기지 않았습니다.',
    })
  }

  for (const [date, s] of supplyByDate) {
    plan.rows.push({
      kind: '자재', date, items: s.items, amount: s.amount,
      where: s.where.join(', '), dateFrom: s.from, status: '등록 예정',
    })
  }

  //  제목과 실제 날짜가 어긋나는지
  const first = plan.rows.find((r) => r.status === '등록 예정')
  if (titleYm && first) {
    const ym = `${titleYm[1]}-${String(Number(titleYm[2])).padStart(2, '0')}`
    if (first.date.slice(0, 7) !== ym) {
      plan.issues.push({
        level: '확인 필요',
        where: `${sheet.name} 제목`,
        what: `제목은 「${title}」 인데 거래일자는 ${first.date} 입니다`,
        hint: '실제 날짜를 그대로 씁니다. 제목이 잘못된 것이라면 원본을 확인해 주세요.',
      })
    }
  }

  //  명세서 합계와 줄 합이 맞는지
  const stated = (() => {
    for (const row of rows) {
      const i = (row ?? []).findIndex((c) => /^합계금액$/.test(txt(c)))
      if (i >= 0) {
        for (let c = i + 1; c < (row ?? []).length; c++) {
          const n = num(row[c] ?? null)
          if (n) return n
        }
      }
    }
    return null
  })()
  const summed = plan.rows.filter((r) => r.status === '등록 예정').reduce((s, r) => s + r.amount, 0)
  if (stated !== null && Math.round(stated) !== Math.round(summed)) {
    plan.issues.push({
      level: '확인 필요',
      where: `${sheet.name} 합계금액`,
      what: `적힌 합계 ${Math.round(stated).toLocaleString()}원 ≠ 줄 합계 ${Math.round(summed).toLocaleString()}원`,
      hint: '차이가 나는 이유를 확인한 뒤 가져오세요.',
    })
  }
}

/** 엑셀 전체를 읽어 「무엇을 넣을 수 있는가」를 만듭니다. DB 는 보지 않습니다. */
export function analyzeWorkbook(sheets: Sheet[], fileName: string): ImportPlan {
  const plan: ImportPlan = { fileName, year: null, client: null, rows: [], monthly: [], issues: [] }
  if (!sheets.length) {
    plan.issues.push({ level: '오류', where: fileName, what: '시트가 없습니다' })
    return plan
  }

  const settlement = sheets.find((s) => /정산/.test(s.name)) ?? sheets.find((s) => /계약일/.test((s.rows[0] ?? []).map(txt).join('|')))
  const invoice = sheets.find((s) => /명세서/.test(s.name)) ?? sheets.find((s) => /거래명세서/.test(txt(s.rows[0]?.[0])))

  if (settlement) readSettlementSheet(settlement, plan)
  else
    plan.issues.push({
      level: '확인 필요',
      where: fileName,
      what: '정산 시트를 찾지 못했습니다',
      hint: '거래처 정보·계약·단가를 가져오지 못했습니다.',
    })

  if (invoice) readInvoiceSheet(invoice, plan)
  else
    plan.issues.push({
      level: '확인 필요',
      where: fileName,
      what: '거래명세서 시트를 찾지 못했습니다',
      hint: '날짜가 있는 기록이 없어 수거·자재는 가져오지 못했습니다.',
    })

  //  날짜가 있는 달을 표시하고, 없는 달은 왜 못 넣는지 알려 줍니다.
  const dated = new Set(plan.rows.filter((r) => r.status !== '오류').map((r) => r.date.slice(0, 7)))
  for (const m of plan.monthly) {
    m.hasDated = dated.has(m.month)
    if (!m.hasDated) {
      plan.issues.push({
        level: '확인 필요',
        where: `${m.month} 정산`,
        what: `매출 ${Math.round(m.revenue).toLocaleString()}원 · 의료폐기물 ${m.medicalKg.toLocaleString()}kg · 기저귀 ${m.diaperKg.toLocaleString()}kg`,
        hint: '이 달은 엑셀에 수거 날짜가 없어(월 합계만 있음) 수거 기록으로 만들지 않았습니다. 월 정산 대조에는 그대로 씁니다.',
      })
    }
  }
  return plan
}

// ── 3. 이미 있는 데이터와 맞춰 보기 ─────────────────────────────────────────

/**
 * 같은 거래처·같은 날짜의 기록이 이미 있으면 덮어쓰지 않습니다.
 *  · 값까지 같으면 「건너뜀」 (두 번 넣지 않습니다)
 *  · 값이 다르면 「충돌」 — 어느 쪽이 맞는지는 사람이 정할 일입니다
 */
export function reconcile(plan: ImportPlan, data: AppData, clientId: string): ImportPlan {
  const rows = plan.rows.map((row) => {
    if (row.status === '오류') return row
    if (row.kind === '수거') {
      const hit = data.schedules.find(
        (s) => s.clientId === clientId && s.date === row.date && s.wasteType === row.wasteType && s.status === '완료',
      )
      if (!hit) return { ...row, status: '등록 예정' as RowStatus, reason: undefined }
      if ((hit.actualAmount ?? 0) === row.kg) {
        return { ...row, status: '건너뜀' as RowStatus, reason: '같은 날 같은 수거량이 이미 있습니다' }
      }
      return {
        ...row,
        status: '충돌' as RowStatus,
        reason: `이미 있는 기록은 ${(hit.actualAmount ?? 0).toLocaleString()}kg, 엑셀은 ${row.kg.toLocaleString()}kg`,
      }
    }
    const hit = data.materials.find((m) => m.clientId === clientId && m.date === row.date)
    if (!hit) return { ...row, status: '등록 예정' as RowStatus, reason: undefined }
    const same = Object.entries(row.items).every(([k, v]) => (hit.items?.[k as ItemKey] ?? 0) === v)
    if (same) return { ...row, status: '건너뜀' as RowStatus, reason: '같은 날 같은 공급이 이미 있습니다' }
    return { ...row, status: '충돌' as RowStatus, reason: '같은 날 다른 공급 기록이 이미 있습니다' }
  })
  return { ...plan, rows }
}

export function planCounts(plan: ImportPlan): PlanCounts {
  return {
    willImport: plan.rows.filter((r) => r.status === '등록 예정').length,
    skip: plan.rows.filter((r) => r.status === '건너뜀').length,
    conflict: plan.rows.filter((r) => r.status === '충돌').length,
    error: plan.rows.filter((r) => r.status === '오류').length + plan.issues.filter((i) => i.level === '오류').length,
    needsCheck: plan.issues.filter((i) => i.level === '확인 필요').length,
  }
}

/** 거래처에 넣을 값 (계약·단가). 이미 값이 있으면 덮어쓰지 않습니다. */
export function clientPatch(profile: ClientProfile, existing: Client | undefined): Partial<Client> {
  const patch: Partial<Client> = {}
  if (profile.contractStart && !existing?.contractStart) patch.contractStart = profile.contractStart
  if (profile.contractEnd && !existing?.contractEnd) patch.contractEnd = profile.contractEnd
  if (profile.paymentTerms && !existing?.paymentTerms) patch.paymentTerms = profile.paymentTerms
  if (profile.paymentDueDay && !existing?.paymentDueDay) patch.paymentDueDay = profile.paymentDueDay
  if (Object.keys(profile.pricing).length && !existing?.pricing) patch.pricing = profile.pricing
  return patch
}
