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

/**
 * 알림 등급.
 *
 *  · 오류      넣을 수 없는 줄 — 반드시 봐야 합니다
 *  · 확인 필요 파일에 있는데 뜻을 정할 수 없는 것 — 반드시 봐야 합니다
 *  · 안내      뜻은 알지만 일부러 옮기지 않는 것 — 보기만 하면 됩니다
 *
 *  세 번째가 필요한 이유: 정산 시트 맨 끝 「미수금」 표시는 **11개 파일 전부**
 *  에 있습니다. 어느 달 청구인지가 파일에 없어 미수금을 만들 수 없다는 사실은
 *  알려 드려야 하지만, 이것을 「확인 필요」로 세면 어떤 파일도 "이상 없음"이
 *  될 수 없습니다. 그러면 정작 진짜 확인할 것이 묻힙니다.
 */
export type IssueLevel = '오류' | '확인 필요' | '안내'
export type RowStatus = '등록 예정' | '건너뜀' | '충돌' | '오류'

export interface ImportIssue {
  level: IssueLevel
  /** 파일 어디에서 나온 것인지 — 사람이 엑셀을 열어 확인할 수 있게 */
  where: string
  what: string
  hint?: string
  /**
   * 같은 이유로 여러 줄이 나올 때 묶는 이름.
   *
   *  더원요양병원 파일은 「확인 필요」가 8줄인데 그중 6줄이 "이 달은 수거
   *  날짜가 없다" 로 똑같습니다. 달마다 한 줄씩 늘어서, 실제로 판단할 것은
   *  3가지인데 화면은 8가지처럼 보였습니다. 몇 년치를 올리면 수십 줄이 됩니다.
   *
   *  같은 group 끼리 한 줄로 접고, 눌러서 펼쳐 보게 합니다. 내용은 하나도
   *  줄이지 않습니다 — 접어 두기만 합니다.
   */
  group?: string
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
  /**
   * 거래명세서에 적힌 상호.
   *
   *  정산 시트의 이름은 칸 폭에 맞춰 잘려 있는 일이 있습니다 — 실제로
   *  서울인화 파일은 정산 시트가 「서울인화스포츠마취통증」이고 명세서에만
   *  「서울인화스포츠마취통증의학과의원」 전체가 적혀 있었습니다.
   *  반대로 오남한양 파일은 명세서에 법인명(「의료법인 한양의료재단」)이
   *  적혀 있어 사업장명과 아예 다릅니다. 그래서 합치지 않고 따로 들고 있다가,
   *  한쪽이 다른 쪽의 앞부분일 때만(= 잘린 것이 분명할 때만) 긴 쪽을 씁니다.
   */
  nameOnInvoice: string | null
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
  /** 옮기지 않는다고 알려만 주는 것 — 판정을 막지 않습니다 */
  info: number
}

// ── 엑셀의 품목 이름 → 시스템 품목 ──────────────────────────────────────────
//
//  실제 거래처 파일 11개를 전수 확인해 보면 같은 품목이 파일마다 다르게
//  적혀 있습니다.
//
//   · "합성수지 2L" (더원 정산) = "2L 합성수지" (본브릿지 정산) =
//     "2리터 합성수지" (원가 줄) = "합성수지용기" + 규격 "2L / 개" (남양주백 명세서)
//   · "의료폐기물" = "의료폐기물 수집/운반" (남양주백·신세계·해올 명세서)
//   · "의료폐기물 35L box" (온케어) = "의료폐기물 1box (30L)" (인화) —
//     박스 개당 정산 거래처의 매출 품목
//
//  그래서 이름을 한 곳(resolveItem)에서 뜻으로 풉니다. 용량 숫자를 읽어
//  아는 규격(박스 79·63·35·30·12·4L, 합성수지 2·5·10·20L)에만 붙이고,
//  처음 보는 규격·이름은 비슷하다고 합치지 않고 null → 「확인 필요」입니다.

const BOX_SIZES = new Set([79, 63, 35, 30, 12, 4])
const PLASTIC_SIZES = new Set([2, 5, 10, 20])

type Resolved =
  | { kind: 'waste'; type: '의료폐기물' | '일회용기저귀' }
  | { kind: 'supply'; key: ItemKey }
  | null

/**
 * 품목 이름(+ 규격 칸)을 시스템 품목으로 풉니다.
 * 확실하지 않으면 null — 절대 비슷한 것으로 합치지 않습니다.
 */
export function resolveItem(rawLabel: string, rawSpec = ''): Resolved {
  //  공백을 정리하고 "리터"→L 로 통일합니다. 뜻은 바꾸지 않습니다.
  const norm = (s: string) => s.replace(/리터/g, 'L').replace(/\s+/g, ' ').trim()
  const label = norm(rawLabel)
  const spec = norm(rawSpec)
  if (!label) return null

  //  기저귀 부속품 먼저 — "기저귀" 만 보고 폐기물로 오인하면 안 됩니다.
  if (/기저귀\s*비닐/.test(label)) return { kind: 'supply', key: 'diaperBag40' }
  if (/기저귀\s*박스/.test(label)) return { kind: 'supply', key: 'diaperBoxM' }
  if (/봉투형\s*용기/.test(label)) {
    const size = Number(/(\d+)\s*L/i.exec(label)?.[1] ?? /(\d+)\s*L/i.exec(spec)?.[1] ?? '')
    return size === 12 ? { kind: 'supply', key: 'pouch12' } : null
  }

  //  합성수지 용기 — "2L 합성수지" / "합성수지 2L" / "합성수지용기"+규격 "2L / 개"
  if (/합성수지/.test(label)) {
    const size = Number(/(\d+)\s*L/i.exec(label)?.[1] ?? /(\d+)\s*L/i.exec(spec)?.[1] ?? '')
    if (PLASTIC_SIZES.has(size)) return { kind: 'supply', key: `plastic${size}` as ItemKey }
    return null // 모르는 규격 — 확인 필요
  }

  //  박스 — "63L 박스" / "의료폐기물 35L box" / "의료폐기물 1box (30L)"
  if (/박스|box/i.test(label)) {
    //  "1box (30L)" 처럼 개수(1)와 규격(30L)이 같이 있으면 L 붙은 쪽만 봅니다.
    const size = Number(/(\d+)\s*L/i.exec(label)?.[1] ?? /(\d+)\s*L/i.exec(spec)?.[1] ?? '')
    if (BOX_SIZES.has(size)) return { kind: 'supply', key: `box${size}` as ItemKey }
    return null
  }

  //  폐기물 — 박스·용기 표기가 없는 것만
  if (/^의료\s*폐기물(\s*수집\s*\/?\s*운반)?$/.test(label)) return { kind: 'waste', type: '의료폐기물' }
  if (/^지정\s*폐기물$/.test(label)) return { kind: 'waste', type: '일회용기저귀' }
  if (/기저귀/.test(label) && !/부가세/.test(label)) return { kind: 'waste', type: '일회용기저귀' }

  return null
}

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

  //  ── 시트를 구역으로 나눕니다 ─────────────────────────────────────────
  //
  //  11개 실제 파일이 전부 같은 뼈대입니다.
  //
  //   2행        거래처 정보 (이름·계약일·결제일 · 박스정산 거래처는 물량 kg)
  //   3행~       [매출 구역]  품목별 단가(D)·월정액(E)와 월별 수량·금액
  //   ── 경계 ──  「의료폐기물 합계」「전체매출」「…소각비용」 중 먼저 나오는 줄
  //   …          [원가 구역]  소각비·「물품사용」 아래 물품별 매입단가
  //   「영업이익」 끝
  //
  //  행 번호를 박지 않고 경계 라벨로 나눕니다. 구역 안의 품목은 이름으로
  //  풀고(resolveItem), 모르는 이름은 「확인 필요」로 올립니다.
  const labelAt = (r: number) => txt(rows[r]?.[0])
  const findRow = (re: RegExp, from = 0) => {
    for (let r = from; r < rows.length; r++) if (re.test(labelAt(r))) return r
    return -1
  }
  const profitRow = findRow(/^영업이익/)
  const revenueEnd = (() => {
    for (let r = 2; r < rows.length; r++) {
      if (/합계$|^전체매출$|소각비용/.test(labelAt(r)) || (profitRow >= 0 && r >= profitRow)) return r
    }
    return rows.length
  })()
  const goodsRow = findRow(/^물품사용$/)

  const pricing: ClientProfile['pricing'] = {}
  const put = (key: string, side: 'sale' | 'cost', v: number | null) => {
    if (v === null) return
    const cur = pricing[key] ?? { sale: null, cost: null }
    pricing[key] = { ...cur, [side]: v }
  }
  //  원가는 엑셀에 음수로 적혀 있습니다(-350). 시스템은 양수로 씁니다.
  const pos = (n: number | null) => (n === null ? null : Math.abs(n))

  //  [매출 구역] — D열 단가(kg 또는 개당), E열 월정액
  let diaperSaleRow = -1
  for (let r = 2; r < revenueEnd; r++) {
    const label = labelAt(r)
    if (!label) continue
    const unitPrice = num(rows[r]?.[3] ?? null)
    const flatFee = num(rows[r]?.[4] ?? null)

    //  부가세 줄 — 지정폐기물 단가의 몇 % 인지 확인해서 규칙으로 저장합니다.
    //  (목동현대웰: 지정 480원 + 부가세 48원 = 정확히 10%)
    if (/부가세/.test(label)) {
      if (unitPrice === null || unitPrice === 0) continue // 부가세 없음 (더원·해올)
      const base = diaperSaleRow >= 0 ? num(rows[diaperSaleRow]?.[3] ?? null) : null
      const pct = base ? Math.round((unitPrice / base) * 1000) / 10 : null
      if (pct !== null && Number.isInteger(pct) && pct > 0 && pct <= 20) {
        put('diaperVatPct', 'sale', pct)
      } else {
        plan.issues.push({
          level: '확인 필요',
          where: `${sheet.name} ${r + 1}행`,
          what: `부가세 단가 ${unitPrice}원을 지정폐기물 단가의 몇 %인지 정하지 못했습니다`,
          hint: '부가세 별도 거래처면 단가 설정에서 %를 직접 넣어 주세요.',
        })
      }
      continue
    }

    const hit = resolveItem(label)
    if (!hit) {
      if (unitPrice !== null || flatFee !== null) {
        plan.issues.push({
          level: '확인 필요',
          where: `${sheet.name} ${r + 1}행`,
          group: '모르는 품목',
          what: `모르는 품목 「${label}」 (단가 ${unitPrice ?? flatFee ?? '?'}원)`,
          hint: '시스템에 같은 품목이 없어 단가를 옮기지 않았습니다.',
        })
      }
      continue
    }
    if (hit.kind === 'waste') {
      const key = hit.type === '의료폐기물' ? 'medical' : 'diaper'
      if (key === 'diaper') diaperSaleRow = r
      put(key, 'sale', unitPrice)
      //  월정액 (E열) — 오남한양 900만, 해올 의료 130만 + 지정 300만
      if (flatFee !== null && flatFee > 0) put(key === 'medical' ? 'medicalMonthly' : 'diaperMonthly', 'sale', flatFee)
    } else {
      //  박스·용기 매출 단가 (박스 개당 정산 거래처 포함)
      put(hit.key, 'sale', unitPrice)
    }
  }

  //  [원가 구역] — 소각비 (kg) 와 물품 매입단가 (개당)
  put('medical', 'cost', pos(num(rowByLabel(rows, /^의료폐기물소각비용$/)?.[3] ?? null)))
  const diaperBurn = pos(num(rowByLabel(rows, /소각비용.*기저귀|기저귀.*소각/)?.[3] ?? null))
  const diaperVatCost = pos(num(rowByLabel(rows, /^기저귀 부가세$/)?.[3] ?? null))
  if (diaperBurn !== null || diaperVatCost !== null) {
    put('diaper', 'cost', (diaperBurn ?? 0) + (diaperVatCost ?? 0))
  }
  if (goodsRow >= 0 && profitRow > goodsRow) {
    for (let r = goodsRow + 1; r < profitRow; r++) {
      const label = labelAt(r)
      if (!label) continue
      const cost = pos(num(rows[r]?.[3] ?? null))
      if (cost === null) continue
      const hit = resolveItem(label, txt(rows[r]?.[1]))
      if (hit && hit.kind === 'supply') put(hit.key, 'cost', cost)
      else if (!hit) {
        plan.issues.push({
          level: '확인 필요',
          where: `${sheet.name} ${r + 1}행`,
          group: '모르는 품목',
          what: `모르는 물품 「${label}」 (매입가 ${cost}원)`,
          hint: '시스템에 같은 품목이 없어 매입단가를 옮기지 않았습니다.',
        })
      }
    }
  }

  //  결제일 규칙. 「익월20일」처럼 숫자가 있으면 그 날, 「익월 말일」이면 말일입니다.
  //
  //   말일을 31 로 둡니다. 청구 계산(dueDateOf)이 그 달의 마지막 날로 잘라
  //   주므로(9월이면 30일, 2월이면 28일) 뜻이 정확히 같습니다. 실제 파일로
  //   확인했습니다 — 해올·신세계의 「익월 말일」 계약에서 8월분 결제기한이
  //   명세서에 2026년 9월 30일로 적혀 있고, 계산 결과도 같습니다.
  //
  //   11개 중 4개 파일이 「익월 말일」이라 이것을 못 읽으면 매번 사람이
  //   결제기한을 손으로 넣어야 했습니다.
  const terms = txt(info[5])
  const dueRaw = /(\d{1,2})\s*일/.exec(terms)?.[1]
  const due = dueRaw ?? (/말\s*일/.test(terms) ? '31' : undefined)
  plan.client = {
    name,
    nameOnInvoice: null,
    contractStart: isDate(info[1]) ? info[1] : null,
    contractEnd: isDate(info[2]) ? info[2] : null,
    paymentTerms: terms,
    paymentDueDay: due ? Number(due) : null,
    pricing,
  }

  if (terms && !due) {
    plan.issues.push({
      level: '확인 필요',
      where: `${sheet.name} F2`,
      what: `결제조건 "${terms}" 에서 결제일을 읽지 못했습니다`,
      hint: '「익월20일」처럼 날짜가 들어 있어야 결제기한을 자동으로 채웁니다. 지금은 비워 둡니다.',
    })
  }

  // ── 월별 합계 ──────────────────────────────────────────────────────────
  //
  //  매출: 「전체매출」 줄이 있으면 그것, 없으면 「의료폐기물 합계」+「지정폐기물
  //  합계」, 그것도 없으면(오남한양 — 월정액 한 줄뿐) 매출 구역 줄들의 합.
  //  kg: 박스 개당 정산 거래처는 합계 줄의 수량이 kg 가 아니라 박스 수입니다.
  //  실제 kg 는 2행(거래처 줄)의 물량 칸에 따로 적혀 있어 그쪽을 먼저 봅니다.
  const medical = rowByLabel(rows, /^의료폐기물 합계$/)
  const diaper = rowByLabel(rows, /^지정폐기물 합계$/)
  const revenue = rowByLabel(rows, /^전체매출$/)
  const profit = rowByLabel(rows, /^영업이익/)
  const burnMed = rowByLabel(rows, /^의료폐기물소각비용$/)
  const burnDia = rowByLabel(rows, /소각비용.*기저귀|기저귀.*소각/)
  const vat = rowByLabel(rows, /^기저귀 부가세$/)
  const goods = rowByLabel(rows, /^물품사용$/)
  //  매출 구역에서 의료폐기물(kg) 줄을 기억해 둡니다 — kg 대체 출처.
  const medicalRow = (() => {
    for (let r = 2; r < revenueEnd; r++) {
      const hit = resolveItem(labelAt(r))
      if (hit?.kind === 'waste' && hit.type === '의료폐기물') return rows[r]
    }
    return null
  })()

  for (const { month, qtyCol, amtCol } of months) {
    //  이 달에 물량(수량)이 한 칸이라도 있는가 — 없으면 아직 일이 없던 달입니다.
    //  월정액 파일은 금액 수식이 12월까지 채워져 있어 금액만 보면 속습니다.
    let anyQty = false
    for (let r = 1; r < rows.length; r++) {
      const q = num(rows[r]?.[qtyCol] ?? null)
      if (q !== null && q !== 0) { anyQty = true; break }
    }
    if (!anyQty) continue
    let rev = num(revenue?.[amtCol] ?? null)
    if (rev === null) {
      const m = num(medical?.[amtCol] ?? null)
      const d = num(diaper?.[amtCol] ?? null)
      if (m !== null || d !== null) rev = (m ?? 0) + (d ?? 0)
    }
    if (rev === null) {
      //  합계 줄이 아예 없는 파일 — 매출 구역 금액을 그대로 더합니다.
      let sum = 0
      let any = false
      for (let r = 2; r < revenueEnd; r++) {
        const v = num(rows[r]?.[amtCol] ?? null)
        if (v !== null) { sum += v; any = true }
      }
      rev = any ? sum : 0
    }
    //  kg — 2행 물량이 있으면 그것(박스 정산 거래처), 없으면 합계 줄 수량.
    const infoKg = num(info[qtyCol] ?? null)
    const mKg = infoKg ?? num(medical?.[qtyCol] ?? null) ?? num(medicalRow?.[qtyCol] ?? null) ?? 0
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
      level: '안내',
      where: `${sheet.name} AE2`,
      what: `정산 상태가 「${status}」 로 적혀 있습니다`,
      hint: '어느 달의 청구인지가 파일에 없어 미수금으로 만들지 않았습니다. 옮긴 뒤 「청구 확정」에서 직접 잡아 주세요.',
    })
  }
}

// ── 2. 거래명세서 시트 — 날짜가 있는 기록 ───────────────────────────────────

function readInvoiceSheet(sheet: Sheet, plan: ImportPlan) {
  const rows = sheet.rows
  //  이 시트에서 만든 줄만 제목·합계 검산에 씁니다 (명세서 시트가 여러 개일 수 있음)
  const rowStart = plan.rows.length
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
  const col = { date: 0, item: 1, spec: 2, qty: 3, price: 5, amount: 6, vat: -1 }
  //  단가 칸이 「단가 (월정액)」인 파일이 있습니다(해올요양병원) — 그 명세서의
  //  금액 줄은 수량×단가가 아니라 월정액입니다. 검산 방식이 달라집니다.
  let priceIsFlat = false
  const line = rows[head] ?? []
  for (let c = 0; c < line.length; c++) {
    const t = txt(line[c])
    if (/월\/일/.test(t)) col.date = c
    else if (/^품목$/.test(t)) col.item = c
    else if (/규격/.test(t)) col.spec = c
    else if (/^수량$/.test(t)) col.qty = c
    else if (/^단가/.test(t)) {
      col.price = c
      if (/월정액/.test(t)) priceIsFlat = true
    } else if (/공급가액/.test(t)) col.amount = c
    else if (/^세액$/.test(t)) col.vat = c
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

  //  이 명세서에 적힌 상호 — 「주식회사 비원미래」(공급자)가 적힌 줄의
  //  A열이 공급받는 자(병원)입니다. 행 번호를 박지 않기 위해 이 짝으로 찾습니다.
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const line = (rows[r] ?? []).map(txt)
    if (line.some((c) => /비원미래/.test(c)) && txt(rows[r]?.[0])) {
      if (plan.client && !plan.client.nameOnInvoice) plan.client.nameOnInvoice = txt(rows[r][0])
      break
    }
  }

  //  오늘 — 미래 날짜 가드용. 실제 파일에서 연도가 밀려 적힌 명세서를
  //  봤습니다(서울인화 「2025년 12월~」 명세서의 날짜가 2026-12 로 적힘).
  //  아직 오지 않은 날짜의 수거를 기록으로 만들면 안 됩니다.
  const today = new Date().toISOString().slice(0, 10)
  //  월정액 검산용 — 정산 시트에서 읽은 이 거래처의 월정액.
  const feeOf = (type: '의료폐기물' | '일회용기저귀'): number | null => {
    const v = plan.client?.pricing[type === '의료폐기물' ? 'medicalMonthly' : 'diaperMonthly']?.sale
    return typeof v === 'number' && v > 0 ? v : null
  }
  //  명세서에 월정액 줄이 있으면 「적힌 합계」 검산에 넣습니다 (아래).
  let flatFeeSum = 0
  let lastSpec = ''

  for (let r = head + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const first = txt(row[col.date])
    if (/합계/.test(first) || /거래조건/.test(first)) {
      lastDate = null
      continue
    }
    //  미납금액 이월 줄(서울인화) — 청구가 아니라 지난달 잔액입니다.
    //  0 이면 지나가고, 값이 있으면 미수금은 손으로 잡도록 알립니다.
    if (/미납/.test(first)) {
      const carried = num(row[col.amount] ?? null) ?? 0
      if (carried !== 0) {
        plan.issues.push({
          level: '확인 필요',
          where: `${sheet.name} ${r + 1}행`,
          what: `미납금액 ${Math.round(carried).toLocaleString()}원이 이월돼 있습니다`,
          hint: '이월 미수금은 자동으로 만들지 않습니다. 「청구·미수금」에서 직접 확인해 주세요.',
        })
      }
      lastDate = null
      continue
    }

    const label = txt(row[col.item])
    const ownSpec = txt(row[col.spec])
    if (label) {
      lastItem = label
      lastSpec = ownSpec
    } else if (ownSpec) {
      //  라벨은 윗줄 것("합성수지 (니들통)")을 이어받고 규격(5L)만 바뀌는
      //  줄이 실제 파일에 있습니다(서울본브릿지 명세서 28~31행).
      lastSpec = ownSpec
    }
    //  요약·차감 줄은 품목이 아닙니다.
    if (/합계|물품사용내역|물품공급/.test(lastItem)) continue
    if (/무상제공/.test(lastItem)) {
      const off = num(row[col.amount] ?? null) ?? 0
      if (off !== 0) {
        plan.issues.push({
          level: '확인 필요',
          where: `${sheet.name} ${r + 1}행`,
          what: `「${lastItem}」 ${Math.round(off).toLocaleString()}원 — 무상 차감 줄입니다`,
          hint: '이 명세서의 물품 줄은 청구가 아니라 참고 표기입니다. 옮기지 않았습니다.',
        })
      }
      continue
    }
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
        group: '날짜가 비어 있는 줄',
        what: `${lastItem || '품목 미상'} ${qty} — 날짜가 비어 있습니다`,
        hint: '언제 수거했는지 알 수 없어 기록으로 만들지 않았습니다.',
      })
      continue
    }

    const hit = resolveItem(lastItem, lastSpec)
    const price = num(row[col.price] ?? null) ?? 0
    const supplied = num(row[col.amount] ?? null) ?? 0
    const vatCell = col.vat >= 0 ? (num(row[col.vat] ?? null) ?? 0) : 0
    //  세액 칸이 있으면(부가세 별도 — 목동현대웰) 청구 총액은 공급가+세액입니다.
    const amount = supplied + vatCell

    //  미래 날짜 — 만들지 않습니다.
    if (date > today) {
      plan.rows.push({
        kind: '수거', date, wasteType: '의료폐기물', kg: qty, amount, where, dateFrom,
        status: '오류',
        reason: `아직 오지 않은 날짜입니다 (오늘 ${today}). 원본의 연도를 확인해 주세요.`,
      })
      continue
    }

    //  월정액 줄 — 단가 칸이 「월정액」이거나, 금액이 정산 시트의 월정액과
    //  정확히 같으면 수량×단가 검산 대상이 아닙니다. kg 기록만 가져오고
    //  요금은 청구 확정에서 월정액 규칙으로 계산됩니다.
    const wasteType = hit?.kind === 'waste' ? hit.type : null
    const flatFee = wasteType ? feeOf(wasteType) : null
    const isFlatLine = wasteType && flatFee !== null && (priceIsFlat || supplied === flatFee || supplied === 0)
    if (isFlatLine) {
      if (supplied !== 0 && supplied !== flatFee) {
        plan.issues.push({
          level: '확인 필요', where,
          what: `월정액 줄 금액 ${Math.round(supplied).toLocaleString()}원이 정산 시트의 월정액 ${flatFee.toLocaleString()}원과 다릅니다`,
          hint: '어느 쪽이 맞는지 확인한 뒤 가져오세요.',
        })
      }
      if (supplied === flatFee) flatFeeSum += supplied
      plan.rows.push({
        kind: '수거', date, wasteType: wasteType!, kg: qty, amount: 0, where, dateFrom, status: '등록 예정',
      })
      continue
    }

    //  금액 검증 — 수량 × 단가가 적힌 공급가액과 다르면 넣지 않습니다.
    if (price > 0 && Math.round(qty * price) !== Math.round(supplied)) {
      plan.rows.push({
        kind: '수거',
        date,
        wasteType: wasteType ?? '의료폐기물',
        kg: qty,
        amount,
        where,
        dateFrom,
        status: '오류',
        reason: `수량×단가 ${Math.round(qty * price).toLocaleString()}원 ≠ 적힌 금액 ${Math.round(supplied).toLocaleString()}원`,
      })
      continue
    }
    //  세액 칸 검산 — 공급가의 몇 % 인지 (반올림 1원 단위까지)
    if (vatCell !== 0) {
      const pct = plan.client?.pricing.diaperVatPct?.sale
      if (typeof pct === 'number' && Math.round((supplied * pct) / 100) !== Math.round(vatCell)) {
        plan.issues.push({
          level: '확인 필요', where,
          what: `세액 ${Math.round(vatCell).toLocaleString()}원이 공급가 ${Math.round(supplied).toLocaleString()}원의 ${pct}% 와 다릅니다`,
          hint: '세율이 바뀌었는지 원본을 확인해 주세요.',
        })
      }
    }

    if (wasteType) {
      plan.rows.push({
        kind: '수거',
        date,
        wasteType,
        kg: qty,
        amount,
        where,
        dateFrom,
        status: '등록 예정',
      })
      continue
    }
    if (hit && hit.kind === 'supply') {
      const cur = supplyByDate.get(date) ?? { items: {}, amount: 0, where: [], from: dateFrom }
      cur.items[hit.key] = (cur.items[hit.key] ?? 0) + qty
      cur.amount += amount
      cur.where.push(where)
      supplyByDate.set(date, cur)
      continue
    }
    plan.issues.push({
      level: '확인 필요',
      where,
      group: '모르는 품목',
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
  const first = plan.rows.slice(rowStart).find((r) => r.status === '등록 예정')
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
  //  월정액 줄은 kg 기록으로만 가져오고 금액은 0 으로 두므로,
  //  「적힌 합계」와 맞추려면 명세서에 적혀 있던 월정액을 더해야 합니다.
  const summed =
    plan.rows.slice(rowStart).filter((r) => r.status === '등록 예정').reduce((s, r) => s + r.amount, 0) +
    flatFeeSum
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
  //  명세서 시트는 하나가 아닐 수 있습니다 — 실제로 서울인화 파일에는
  //  「2026 거래명세서」와 「2026 거래명세서 (2)」(지난 분기 몫)가 함께 있습니다.
  //  하나만 읽으면 나머지는 소리 없이 사라지므로 전부 읽습니다.
  const invoices = sheets.filter(
    (s) => /명세서/.test(s.name) || /거래명세서/.test(txt(s.rows[0]?.[0])),
  )

  if (settlement) readSettlementSheet(settlement, plan)
  else
    plan.issues.push({
      level: '확인 필요',
      where: fileName,
      what: '정산 시트를 찾지 못했습니다',
      hint: '거래처 정보·계약·단가를 가져오지 못했습니다.',
    })

  if (invoices.length) for (const inv of invoices) readInvoiceSheet(inv, plan)
  else
    plan.issues.push({
      level: '확인 필요',
      where: fileName,
      what: '거래명세서 시트를 찾지 못했습니다',
      hint: '날짜가 있는 기록이 없어 수거·자재는 가져오지 못했습니다.',
    })

  //  ── 상호 맞춰 보기 ─────────────────────────────────────────────────
  //
  //  정산 시트의 이름과 명세서의 상호가 다를 수 있습니다. 실제 파일 두 가지
  //  경우를 봤고, 둘을 다르게 다룹니다.
  //
  //   · 한쪽이 다른 쪽의 앞부분  = 칸 폭에 맞춰 잘린 것입니다.
  //     (서울인화: 「…마취통증」 ⊂ 「…마취통증의학과의원」) → 긴 쪽을 씁니다.
  //   · 아예 다름               = 법인명과 사업장명일 수 있습니다.
  //     (오남한양병원 vs 의료법인 한양의료재단) → 합치지 않고 확인 필요로
  //     올립니다. 어느 쪽이 거래처 이름인지는 사람이 정할 일입니다.
  if (plan.client?.nameOnInvoice) {
    const a = plan.client.name.replace(/\s/g, '')
    const b = plan.client.nameOnInvoice.replace(/\s/g, '')
    if (a !== b) {
      if (b.startsWith(a)) {
        plan.client.name = plan.client.nameOnInvoice
      } else if (!a.startsWith(b)) {
        plan.issues.push({
          level: '확인 필요',
          where: fileName,
          what: `정산 시트는 「${plan.client.name}」, 거래명세서는 「${plan.client.nameOnInvoice}」 입니다`,
          hint: '법인명과 사업장명일 수 있어 한쪽으로 합치지 않았습니다. 거래처 이름을 직접 확인해 주세요.',
        })
      }
    }
  }

  //  날짜가 있는 달을 표시하고, 없는 달은 왜 못 넣는지 알려 줍니다.
  const dated = new Set(plan.rows.filter((r) => r.status !== '오류').map((r) => r.date.slice(0, 7)))
  for (const m of plan.monthly) {
    m.hasDated = dated.has(m.month)
    if (!m.hasDated) {
      plan.issues.push({
        level: '확인 필요',
        //  달마다 한 줄씩 늘어나므로 묶어 둡니다. 화면에서 한 줄로 접힙니다.
        group: '수거 날짜가 없는 달',
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
    info: plan.issues.filter((i) => i.level === '안내').length,
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
