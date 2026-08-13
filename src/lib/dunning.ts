import type { AppData, Payment } from '../types'
import { dueDateOf } from './billing'
import { today as todayKst } from './format'
import { outstandingOf } from './selectors'

// ─────────────────────────────────────────────────────────────────────────────
// 미수금 연체 · 독촉 대상
//
//  통장 대사까지는 시스템이 하는데, 그다음이 비어 있었습니다.
//  「누구한테 전화해야 하나」를 고르는 일은 여전히 눈으로 했습니다.
//  미수금 화면은 청구월 순으로만 늘어놓아서, 석 달 밀린 500만원과
//  어제 청구한 500만원이 똑같이 보였습니다.
//
//  여기서 만들지 않는 것
//
//   · 없는 날짜를 만들지 않습니다. 실제 엑셀 11개에는 결제조건·결제일이
//     한 곳에도 적혀 있지 않았습니다. 그래서 「기한 며칠 지남」은 거래처에
//     결제일(paymentDueDay)을 직접 넣은 경우에만 계산하고, 나머지는
//     **청구월이 몇 달 지났는지**라는 사실만 셉니다. 엑셀 미수금 대장이
//     하던 것과 같은 방식입니다.
//   · 자동으로 문자를 보내지 않습니다. 문구만 만들어 두고, 보낼지 말지와
//     보내는 방법은 사람이 정합니다. 돈 이야기라 자동으로 나가면 안 됩니다.
//   · 취소한 청구, 이미 다 받은 청구는 대상이 아닙니다(outstandingOf 기준 —
//     부분입금을 뺀 실제 남은 금액).
// ─────────────────────────────────────────────────────────────────────────────

/** 청구월이 몇 달 지났는지 — 'YYYY-MM' 두 개의 개월 차이 */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  if (!fy || !fm || !ty || !tm) return 0
  return (ty - fy) * 12 + (tm - fm)
}

/** 두 날짜(YYYY-MM-DD) 사이의 일수 — 시간대 영향을 받지 않도록 UTC 자정 기준 */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/**
 * 연체 구간.
 *  이번 달에 청구한 건은 아직 밀린 것이 아닙니다(`이번달`).
 *  지난달 이전 청구가 남아 있으면 그때부터 독촉 대상으로 봅니다.
 */
export type AgeBucket = '이번달' | '1개월' | '2개월' | '3개월이상'

export function bucketOf(monthsOld: number): AgeBucket {
  if (monthsOld <= 0) return '이번달'
  if (monthsOld === 1) return '1개월'
  if (monthsOld === 2) return '2개월'
  return '3개월이상'
}

export const BUCKET_ORDER: AgeBucket[] = ['3개월이상', '2개월', '1개월', '이번달']

export const BUCKET_LABEL: Record<AgeBucket, string> = {
  이번달: '이번 달 청구',
  '1개월': '1개월 경과',
  '2개월': '2개월 경과',
  '3개월이상': '3개월 이상',
}

export interface AgedBill {
  paymentId: string
  billingMonth: string
  /** 부분입금을 뺀 남은 금액 */
  outstanding: number
  /** 청구액 전체 (일부만 받은 건을 구분해 보여 주기 위함) */
  amount: number
  /** 계약 결제기한 — 거래처에 결제일이 있을 때만 */
  dueDate: string | null
  /** 결제기한이 지난 일수. 기한을 모르면 null (0 이하면 아직 기한 전) */
  daysPastDue: number | null
  /** 청구월 경과 개월 수 */
  monthsOld: number
  bucket: AgeBucket
}

/** 청구 한 건의 연체 상태 */
export function ageOf(data: AppData, payment: Payment, today = todayKst()): AgedBill {
  const rest = outstandingOf(data, payment)
  const client = data.clients.find((c) => c.id === payment.clientId)
    ?? data.retiredClients?.find((c) => c.id === payment.clientId)
  const dueDate = dueDateOf(payment.billingMonth, client?.paymentDueDay)
  const monthsOld = monthsBetween(payment.billingMonth, today.slice(0, 7))
  return {
    paymentId: payment.id,
    billingMonth: payment.billingMonth,
    outstanding: rest,
    amount: payment.amount,
    dueDate,
    daysPastDue: dueDate ? daysBetween(dueDate, today) : null,
    monthsOld,
    bucket: bucketOf(monthsOld),
  }
}

export interface DunningRow {
  clientId: string
  clientName: string
  manager: string
  phone: string
  bills: AgedBill[]
  /** 남은 미수 합계 */
  total: number
  /** 가장 오래된 미수 청구월 */
  oldestMonth: string
  monthsOld: number
  /** 계약 결제기한 기준 최장 연체일 (결제일을 넣은 거래처만) */
  daysPastDue: number | null
  bucket: AgeBucket
}

/**
 * 독촉 대상 — 거래처별로 묶은 미수금.
 *
 *  이번 달에 청구한 건만 남은 거래처는 빠집니다. 아직 결제기한이
 *  오지도 않은 곳에 전화하게 만들면 안 됩니다. 다만 거래처에 결제일을
 *  넣어 둔 경우에는 그 기한이 실제로 지났으면 이번 달 청구라도 넣습니다.
 */
export function dunningList(data: AppData, today = todayKst()): DunningRow[] {
  const byClient = new Map<string, AgedBill[]>()
  for (const p of data.payments) {
    const bill = ageOf(data, p, today)
    if (bill.outstanding <= 0) continue
    const overdue = bill.monthsOld >= 1 || (bill.daysPastDue != null && bill.daysPastDue > 0)
    if (!overdue) continue
    const arr = byClient.get(p.clientId)
    if (arr) arr.push(bill)
    else byClient.set(p.clientId, [bill])
  }

  const rows: DunningRow[] = []
  for (const [clientId, bills] of byClient) {
    bills.sort((a, b) => a.billingMonth.localeCompare(b.billingMonth))
    const client = data.clients.find((c) => c.id === clientId)
      ?? data.retiredClients?.find((c) => c.id === clientId)
    const late = bills.map((b) => b.daysPastDue).filter((d): d is number => d != null && d > 0)
    const monthsOld = Math.max(...bills.map((b) => b.monthsOld))
    rows.push({
      clientId,
      clientName: client?.name ?? '(삭제된 거래처)',
      manager: client?.manager ?? '',
      phone: client?.phone ?? '',
      bills,
      total: bills.reduce((s, b) => s + b.outstanding, 0),
      oldestMonth: bills[0].billingMonth,
      monthsOld,
      daysPastDue: late.length > 0 ? Math.max(...late) : null,
      bucket: bucketOf(monthsOld),
    })
  }

  //  오래 밀린 곳부터, 같은 구간이면 금액이 큰 곳부터.
  rows.sort((a, b) => b.monthsOld - a.monthsOld || b.total - a.total)
  return rows
}

/**
 * 화면에 쓰는 한 줄 설명.
 *  결제일을 넣어 둔 거래처는 「기한 12일 지남」처럼 정확히 말하고,
 *  그렇지 않으면 청구월 경과만 말합니다 — 없는 기한을 지어내지 않습니다.
 */
export function ageLabel(row: Pick<DunningRow, 'daysPastDue' | 'monthsOld' | 'oldestMonth'>): string {
  if (row.daysPastDue != null && row.daysPastDue > 0) return `결제기한 ${row.daysPastDue}일 지남`
  if (row.monthsOld >= 1) return `${row.oldestMonth} 청구 · ${row.monthsOld}개월 경과`
  return `${row.oldestMonth} 청구`
}

export interface DunningSummary {
  rows: DunningRow[]
  total: number
  /** 구간별 합계 — 3개월 이상이 얼마인지가 대표가 먼저 보는 숫자입니다 */
  byBucket: Array<{ bucket: AgeBucket; count: number; amount: number }>
  /** 결제일을 넣지 않아 기한 판정을 못 하는 거래처 수 */
  noDueDayCount: number
}

export function dunningSummary(data: AppData, today = todayKst()): DunningSummary {
  const rows = dunningList(data, today)
  const byBucket = BUCKET_ORDER.map((bucket) => {
    const hit = rows.filter((r) => r.bucket === bucket)
    return { bucket, count: hit.length, amount: hit.reduce((s, r) => s + r.total, 0) }
  }).filter((b) => b.count > 0)
  return {
    rows,
    total: rows.reduce((s, r) => s + r.total, 0),
    byBucket,
    noDueDayCount: rows.filter((r) => r.daysPastDue == null).length,
  }
}

/**
 * 독촉 문구.
 *
 *  사실만 적습니다 — 거래처명, 청구월별 남은 금액, 합계.
 *  계좌번호는 넣지 않습니다. 시스템에 저장된 값이 아니라서 지어내면
 *  엉뚱한 계좌로 돈이 갑니다. 이미 낸 곳이 있을 수 있으니 마지막 줄에
 *  「입금하셨다면 알려 달라」를 항상 붙입니다.
 */
export function dunningMessage(row: DunningRow, sender = '주식회사 비원미래'): string {
  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
  const lines = row.bills.map((b) => {
    const [y, m] = b.billingMonth.split('-')
    const part = b.outstanding < b.amount ? ` (청구 ${won(b.amount)} 중 남은 금액)` : ''
    return `· ${y}년 ${Number(m)}월분 ${won(b.outstanding)}${part}`
  })
  const head = `[${sender}] ${row.clientName} 담당자님 안녕하세요.`
  const body =
    row.bills.length === 1
      ? `아래 폐기물 처리비가 아직 입금 확인되지 않았습니다.`
      : `아래 폐기물 처리비 ${row.bills.length}건이 아직 입금 확인되지 않았습니다.`
  const sum = row.bills.length > 1 ? [`합계 ${won(row.total)}`] : []
  return [
    head,
    body,
    ...lines,
    ...sum,
    '',
    '확인 부탁드립니다. 이미 입금하셨다면 말씀해 주시면 바로 확인하겠습니다.',
  ].join('\n')
}
