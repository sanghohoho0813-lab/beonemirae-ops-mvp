import type { AppData, Client, Payment, VatMode } from '../types'
import type { Invoice } from './billing'

// ─────────────────────────────────────────────────────────────────────────────
// 세금계산서 발행 자료
//
//  매달 청구를 확정하고 거래명세서를 뽑은 뒤, 이사님은 홈택스를 열어
//  거래처마다 전자세금계산서를 발행합니다. 그때 필요한 값이 시스템에 한
//  칸도 없어서 **세금계산서용 엑셀을 따로 유지**하고, 금액을 거기에 옮겨
//  적어 홈택스에 넣었습니다.
//
//  ── 자동으로 정하지 않는 것 ────────────────────────────────────────────
//
//   부가세. 지금 저장된 청구액이 공급가액인지 부가세가 든 합계인지는
//   계약마다 다릅니다. 실제 엑셀 11개에서 부가세가 적힌 곳은 목동현대웰
//   (지정폐기물 10% 별도) 한 곳뿐이었고 나머지는 아무 표기가 없었습니다.
//   임의로 10% 를 붙이거나 1/11 로 역산하면 틀린 세금계산서가 나갑니다.
//   그래서 거래처의 vat_mode 를 사람이 정할 때까지 「확인 필요」로 둡니다.
//
//   확정하지 않은 정산. 대상은 **확정된 청구(payments)** 뿐입니다. 아직
//   확정하지 않은 달의 추정 금액으로 세금계산서를 끊으면 안 됩니다.
//
//  여기서 만든 표는 홈택스에 붙여 넣는 **참고 자료**입니다. 시스템이
//  발행하지 않습니다. 세액 반올림이 세무대리인 기준과 다를 수 있어
//  화면에 그 사실을 함께 적습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 사업자등록번호 — 숫자만 남깁니다 */
export function normalizeBizNo(v: string | undefined | null): string {
  return (v ?? '').replace(/[^0-9]/g, '')
}

/** 123-45-67890 꼴로 */
export function formatBizNo(v: string | undefined | null): string {
  const d = normalizeBizNo(v)
  if (d.length !== 10) return d
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/**
 * 사업자등록번호 검사 (국세청 검증식).
 *  오타 한 글자를 잡아 줍니다 — 번호가 틀리면 세금계산서가 반려됩니다.
 *  가중치 1,3,7,1,3,7,1,3,5 를 곱해 더하고, 9번째 자리 × 5 의 십의 자리를
 *  더한 뒤 10 으로 나눈 나머지를 10 에서 뺀 값이 마지막 자리와 같아야 합니다.
 */
export function isValidBizNo(v: string | undefined | null): boolean {
  const d = normalizeBizNo(v)
  if (d.length !== 10) return false
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * w[i]
  sum += Math.floor((Number(d[8]) * 5) / 10)
  return (10 - (sum % 10)) % 10 === Number(d[9])
}

export interface TaxRow {
  paymentId: string
  clientId: string
  clientName: string
  billingMonth: string
  /** 청구액 (확정된 금액 그대로) */
  billed: number
  /** 사업자등록번호 (하이픈 포함) */
  bizNo: string
  bizCeo: string
  bizType: string
  bizItem: string
  taxEmail: string
  vatMode: VatMode | null
  /** 공급가액 · 세액 · 합계 — 확인이 필요하면 전부 null */
  supply: number | null
  vat: number | null
  total: number | null
  /** 자동으로 계산하지 못한 이유 (없으면 발행 가능) */
  blockers: string[]
}

export interface TaxInvoiceList {
  month: string
  /** 바로 발행할 수 있는 것 */
  ready: TaxRow[]
  /** 사람이 먼저 확인해야 하는 것 */
  needsCheck: TaxRow[]
  /** ready 의 합계 */
  supplyTotal: number
  vatTotal: number
  grandTotal: number
}

/** 확정 청구의 스냅샷에 이미 들어 있는 세액 (부가세 별도 계약의 지정폐기물) */
function vatInsideOf(payment: Payment): number {
  const snap = payment.snapshot as { invoice?: Invoice } | null | undefined
  const v = snap?.invoice?.vatTotal
  return typeof v === 'number' ? v : 0
}

function amountsFor(
  mode: VatMode,
  billed: number,
): { supply: number; vat: number; total: number } {
  if (mode === '면세') return { supply: billed, vat: 0, total: billed }
  if (mode === '포함') {
    //  합계에서 역산합니다. 공급가액을 반올림하고 세액을 차액으로 두면
    //  공급가액 + 세액이 청구액과 정확히 같아집니다 — 1원도 어긋나지
    //  않아야 통장·미수금과 맞습니다.
    const supply = Math.round(billed / 1.1)
    return { supply, vat: billed - supply, total: billed }
  }
  //  '별도' — 청구액이 공급가액입니다.
  const vat = Math.round(billed / 10)
  return { supply: billed, vat, total: billed + vat }
}

export function taxInvoiceList(data: AppData, month: string): TaxInvoiceList {
  const byId = new Map<string, Client>()
  for (const c of [...data.clients, ...(data.retiredClients ?? [])]) byId.set(c.id, c)

  const ready: TaxRow[] = []
  const needsCheck: TaxRow[] = []

  for (const p of data.payments) {
    if (p.billingMonth !== month) continue
    //  취소한 청구는 세금계산서 대상이 아닙니다.
    if (p.status === '취소') continue
    const c = byId.get(p.clientId)
    const blockers: string[] = []

    const bizDigits = normalizeBizNo(c?.bizNo)
    if (!bizDigits) blockers.push('사업자등록번호 없음')
    else if (!isValidBizNo(bizDigits)) blockers.push('사업자등록번호가 형식에 맞지 않음')
    if (!c?.vatMode) blockers.push('부가세 처리 방식 미지정')

    //  청구액 안에 이미 세액이 들어 있는 계약(목동현대웰 지정폐기물 10%)은
    //  전체를 공급가액으로 보거나 전부 역산하는 것 둘 다 틀립니다.
    //  섞여 있으므로 사람이 나눠 주어야 합니다.
    const inside = vatInsideOf(p)
    if (inside > 0) {
      blockers.push(`청구액에 세액 ${inside.toLocaleString('ko-KR')}원이 이미 포함됨 — 직접 나눠 주세요`)
    }

    const base = {
      paymentId: p.id,
      clientId: p.clientId,
      clientName: c?.name ?? '(삭제된 거래처)',
      billingMonth: p.billingMonth,
      billed: p.amount,
      bizNo: formatBizNo(c?.bizNo),
      bizCeo: c?.bizCeo ?? '',
      bizType: c?.bizType ?? '',
      bizItem: c?.bizItem ?? '',
      taxEmail: c?.taxEmail ?? '',
      vatMode: c?.vatMode ?? null,
    }

    if (blockers.length > 0) {
      needsCheck.push({ ...base, supply: null, vat: null, total: null, blockers })
      continue
    }
    const m = amountsFor(c!.vatMode!, p.amount)
    ready.push({ ...base, ...m, blockers: [] })
  }

  const sort = (a: TaxRow, b: TaxRow) => a.clientName.localeCompare(b.clientName, 'ko')
  ready.sort(sort)
  needsCheck.sort(sort)

  return {
    month,
    ready,
    needsCheck,
    supplyTotal: ready.reduce((s, r) => s + (r.supply ?? 0), 0),
    vatTotal: ready.reduce((s, r) => s + (r.vat ?? 0), 0),
    grandTotal: ready.reduce((s, r) => s + (r.total ?? 0), 0),
  }
}

/** 엑셀에 그대로 붙여 넣을 수 있게 — 탭으로 나눈 표 */
export function taxRowsToTsv(rows: TaxRow[]): string {
  const head = ['거래처', '사업자등록번호', '대표자', '업태', '종목', '이메일', '공급가액', '세액', '합계']
  const body = rows.map((r) =>
    [
      r.clientName,
      r.bizNo,
      r.bizCeo,
      r.bizType,
      r.bizItem,
      r.taxEmail,
      String(r.supply ?? ''),
      String(r.vat ?? ''),
      String(r.total ?? ''),
    ].join('\t'),
  )
  return [head.join('\t'), ...body].join('\n')
}
