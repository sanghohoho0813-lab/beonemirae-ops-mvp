import type { AppData, Client } from '../types'
import { isValidBizNo, normalizeBizNo } from './taxInvoice'
import {
  SUPPLY_ITEMS,
  diaperVatPctOf,
  hasOwnPrice,
  monthlyFeeOf,
  priceOf,
  type ItemKey,
} from './billing'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처 단가 점검
//
//  거래처에 단가를 넣지 않으면 기본 단가(의료 950원/kg)로 조용히 청구됩니다.
//  계약이 860원인데 950원으로 명세서가 나가도 화면 어디에도 표시가 없었고,
//  단가를 확인하려면 거래처를 하나씩 열어 「단가」 창을 띄워야 했습니다.
//  거래처가 스무 곳이면 스무 번입니다.
//
//  월말 청구 화면이 그 달의 기본단가 항목을 표시해 자동 확정에서 빼 주지만,
//  그건 이미 청구할 때가 되어서야 나옵니다. 그 사이 대시보드 매출·손익·
//  거래처 리포트는 계속 틀린 단가로 계산됩니다.
//
//  여기서는 계산을 새로 만들지 않습니다. 정산이 쓰는 priceOf / monthlyFeeOf /
//  hasOwnPrice 를 그대로 읽어, 「이 거래처가 지금 어떻게 청구되는지」를
//  한 줄로 옮겨 적을 뿐입니다. 정산과 다른 답이 나오면 안 되기 때문입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 한 줄 정산 조건 — 화면에 그대로 나갑니다 */
export interface PriceTerm {
  /** '의료폐기물' · '일회용기저귀' */
  label: string
  /** '950원/kg' · '월정액 9,000,000원' */
  value: string
  /** 거래처에 직접 넣은 값인지 (false = 기본 단가로 청구 중) */
  own: boolean
}

export interface PaidSupply {
  key: ItemKey
  label: string
  price: number
  own: boolean
}

/** 정산방식 — 실제 거래처 11곳에서 확인된 네 가지 */
export type PriceMode = '월정액' | 'kg단가' | '혼합' | '수거구분없음'

export interface PriceRow {
  clientId: string
  clientName: string
  type: string
  mode: PriceMode
  terms: PriceTerm[]
  /** 유상으로 파는 물품 (박스 개당 정산 거래처 포함) */
  paidSupplies: PaidSupply[]
  /** 지정폐기물 부가세 별도 % (0 = 없음) */
  diaperVatPct: number
  /** 계약 단가를 넣지 않아 기본 단가로 청구되는 수거 구분 */
  onDefault: string[]
  /** 세금계산서를 발행하려면 채워야 하는 것 (없으면 발행 목록에서 빠집니다) */
  taxMissing: string[]
  /** 결제일이 있는지 — 연체를 일 단위로 판정할 수 있는 근거 */
  hasDueDay: boolean
  /**
   * 월정액인데 「배출 없는 달에도 청구할지」를 아무도 안 정했음 (0044).
   *
   *  정하지 않으면 수거가 0건인 달에 서버가 확정을 거부합니다. 900만원짜리
   *  계약이 그 달만 엑셀로 넘어갑니다. `false` 는 「아니오로 정했다」는
   *  뜻이 아니라 기본값일 수도 있어서, 정한 시각이 있는지로 봅니다.
   */
  flatPolicyUndecided: boolean
  /** 지금 정해져 있는 값 (정한 적 없으면 기본값 false 입니다) */
  flatWhenEmpty: boolean
  /** 지금 이 거래처에서 막혀 있는 일 — 화면에 그대로 나갑니다 */
  blocked: string[]
  /** 확정 청구가 있었던 달 수 — 실제로 돈이 오간 곳부터 고치도록 */
  billedMonths: number
  /** 이 거래처의 완료 수거 건수 (전체 기간) */
  collections: number
}

export interface PriceAudit {
  rows: PriceRow[]
  /** 기본 단가로 청구되는 거래처 */
  onDefault: PriceRow[]
  /** 그중 이미 청구가 나간 적이 있는 곳 — 가장 먼저 확인해야 합니다 */
  onDefaultBilled: PriceRow[]
  /** 세금계산서 정보가 빠진 거래처 */
  taxMissing: PriceRow[]
  /** 그중 이미 청구가 나간 곳 — 이번 달 발행에서 바로 걸립니다 */
  taxMissingBilled: PriceRow[]
  /** 월정액인데 빈 달 정책을 아무도 안 정한 거래처 (0044) */
  flatUndecided: PriceRow[]
  /** 그중 이미 청구가 나간 곳 — 다음 빈 달에 바로 막힙니다 */
  flatUndecidedBilled: PriceRow[]
  /** 무엇이든 확인이 필요한 거래처 */
  needsCheck: PriceRow[]
  total: number
}

/** 세금계산서를 발행하려면 채워야 하는 것 */
function taxMissingOf(c: Client): string[] {
  const miss: string[] = []
  const digits = normalizeBizNo(c.bizNo)
  if (!digits) miss.push('사업자등록번호')
  else if (!isValidBizNo(digits)) miss.push('사업자등록번호 오타')
  if (!c.vatMode) miss.push('부가세 처리 방식')
  return miss
}

const wonUnit = (n: number, unit: string) => `${n.toLocaleString('ko-KR')}원/${unit}`

function termsOf(client: Client): { terms: PriceTerm[]; onDefault: string[]; mode: PriceMode } {
  const terms: PriceTerm[] = []
  const onDefault: string[] = []
  let flat = 0
  let perKg = 0

  const add = (waste: 'medical' | 'diaper', label: string) => {
    const fee = monthlyFeeOf(client, waste)
    if (fee != null) {
      //  월정액은 거래처에 직접 넣어야만 생기는 값입니다 — 기본값이 없습니다.
      terms.push({ label, value: `월정액 ${fee.toLocaleString('ko-KR')}원`, own: true })
      flat += 1
      return
    }
    const p = priceOf(client, waste)
    const own = hasOwnPrice(client, waste)
    terms.push({ label, value: p.sale == null ? '판매단가 없음' : wonUnit(p.sale, 'kg'), own })
    perKg += 1
    if (!own) onDefault.push(label)
  }

  if (client.collectsMedicalWaste) add('medical', '의료폐기물')
  if (client.collectsDiaper) add('diaper', '일회용기저귀')

  const mode: PriceMode =
    terms.length === 0 ? '수거구분없음' : flat > 0 && perKg > 0 ? '혼합' : flat > 0 ? '월정액' : 'kg단가'
  return { terms, onDefault, mode }
}

function paidSuppliesOf(client: Client): PaidSupply[] {
  const out: PaidSupply[] = []
  for (const it of SUPPLY_ITEMS) {
    const p = priceOf(client, it.key)
    if (p.sale == null || p.sale <= 0) continue
    out.push({
      key: it.key,
      label: it.label,
      price: p.sale,
      //  기본 단가표에 판매가가 있는 품목(합성수지 2·5·20L)은 거래처에
      //  안 넣어도 유상으로 잡힙니다. 그건 「기본값」으로 표시합니다.
      own: hasOwnPrice(client, it.key),
    })
  }
  return out
}

export function auditPricing(data: AppData): PriceAudit {
  const billedByClient = new Map<string, Set<string>>()
  for (const p of data.payments) {
    if (p.status === '취소') continue
    const s = billedByClient.get(p.clientId)
    if (s) s.add(p.billingMonth)
    else billedByClient.set(p.clientId, new Set([p.billingMonth]))
  }
  const doneByClient = new Map<string, number>()
  for (const s of data.schedules) {
    if (s.status !== '완료') continue
    doneByClient.set(s.clientId, (doneByClient.get(s.clientId) ?? 0) + 1)
  }

  const rows: PriceRow[] = data.clients.map((c) => {
    const { terms, onDefault, mode } = termsOf(c)
    const taxMissing = taxMissingOf(c)
    //  월정액이 있는 곳만 해당합니다. kg 단가 거래처는 수거가 0건이면
    //  청구할 금액 자체가 없으므로 정할 것도 없습니다.
    const flatPolicyUndecided = (mode === '월정액' || mode === '혼합') && !c.flatFeePolicyAt
    const blocked: string[] = []
    if (onDefault.length > 0) blocked.push(`${onDefault.join('·')} 기본 단가로 청구 중`)
    if (taxMissing.length > 0) blocked.push(`세금계산서 못 만듦 (${taxMissing.join('·')})`)
    if (flatPolicyUndecided) blocked.push('배출 없는 달 청구 여부 미정')
    return {
      clientId: c.id,
      clientName: c.name,
      type: c.type,
      mode,
      terms,
      paidSupplies: paidSuppliesOf(c),
      diaperVatPct: diaperVatPctOf(c),
      onDefault,
      taxMissing,
      hasDueDay: c.paymentDueDay != null,
      flatPolicyUndecided,
      flatWhenEmpty: !!c.flatFeeWhenEmpty,
      blocked,
      billedMonths: billedByClient.get(c.id)?.size ?? 0,
      collections: doneByClient.get(c.id) ?? 0,
    }
  })

  //  고쳐야 할 곳이 위로. 청구가 이미 나간 곳 → 수거가 있는 곳 → 나머지.
  //  「단가가 틀린 채 청구된다」가 「세금계산서를 못 끊는다」보다 급합니다 —
  //  앞은 병원에 틀린 금액이 나가는 일이고, 뒤는 발행이 미뤄지는 일입니다.
  //  「배출 없는 달 정책 미정」은 세금계산서와 같은 무게로 둡니다 — 둘 다
  //  「그 달에 못 끝낸다」는 이야기이고, 틀린 금액이 나가는 일보다는 뒤입니다.
  const weight = (r: PriceRow) =>
    r.onDefault.length > 0 ? 2 : r.taxMissing.length > 0 || r.flatPolicyUndecided ? 1 : 0
  rows.sort((a, b) => {
    const wa = weight(a)
    const wb = weight(b)
    if (wa !== wb) return wb - wa
    if (a.billedMonths !== b.billedMonths) return b.billedMonths - a.billedMonths
    if (a.collections !== b.collections) return b.collections - a.collections
    return a.clientName.localeCompare(b.clientName, 'ko')
  })

  const onDefault = rows.filter((r) => r.onDefault.length > 0)
  const taxMissing = rows.filter((r) => r.taxMissing.length > 0)
  const flatUndecided = rows.filter((r) => r.flatPolicyUndecided)
  return {
    rows,
    onDefault,
    onDefaultBilled: onDefault.filter((r) => r.billedMonths > 0),
    taxMissing,
    taxMissingBilled: taxMissing.filter((r) => r.billedMonths > 0),
    flatUndecided,
    flatUndecidedBilled: flatUndecided.filter((r) => r.billedMonths > 0),
    needsCheck: rows.filter((r) => r.blocked.length > 0),
    total: rows.length,
  }
}

/** 화면·검색에 쓰는 한 줄 요약 */
export function termSummary(row: PriceRow): string {
  const parts = row.terms.map((t) => `${t.label} ${t.value}`)
  if (row.diaperVatPct > 0) parts.push(`지정 부가세 ${row.diaperVatPct}% 별도`)
  return parts.join(' · ') || '수거 구분이 지정되지 않았습니다'
}
