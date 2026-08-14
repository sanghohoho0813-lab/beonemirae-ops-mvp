import type { AppData } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 갈 곳 없는 입금
//
//  취소한 청구는 「청구한 적 없는 것」으로 셉니다 — 매출에도 미수금에도
//  들어가지 않습니다. 그런데 그 청구에 입금 기록이 달려 있으면, **실제로
//  받은 돈이 어느 합계에도 잡히지 않습니다.** 매출도 아니고 미수금도
//  아니고 입금액도 아닌 상태가 됩니다.
//
//  0037 부터는 입금이 있는 청구를 취소할 수 없습니다(서버가 막습니다).
//  하지만 그 전에 만들어진 자료에는 있을 수 있고, 통장 파일을 다시 맞추다
//  보면 사람이 순서를 거꾸로 밟을 수도 있습니다.
//
//  자동으로 고치지 않습니다
//
//   취소가 맞는지, 입금이 맞는지는 통장을 봐야 압니다. 시스템이 한쪽으로
//   되돌리면 둘 중 하나는 틀립니다. 그래서 찾아서 그대로 보여 주고, 어느
//   쪽을 되돌릴지는 사람이 정합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface StrandedReceipt {
  paymentId: string
  clientId: string
  clientName: string
  billingMonth: string
  /** 취소한 청구의 금액 */
  billed: number
  /** 그 청구에 남아 있는 입금 합계 */
  paid: number
}

/** 취소된 청구에 달려 있는 입금 — 받은 돈이 어느 합계에도 안 잡히는 건 */
export function strandedReceipts(data: AppData): StrandedReceipt[] {
  const byPayment = new Map<string, number>()
  for (const r of data.receipts ?? []) {
    byPayment.set(r.paymentId, (byPayment.get(r.paymentId) ?? 0) + r.amount)
  }
  //  그만둔 거래처의 청구도 그대로 봅니다 — 돈은 남아 있습니다.
  const name = new Map(
    [...data.clients, ...(data.retiredClients ?? [])].map((c) => [c.id, c.name]),
  )
  const out: StrandedReceipt[] = []
  for (const p of data.payments) {
    if (p.status !== '취소') continue
    const paid = byPayment.get(p.id) ?? 0
    if (paid <= 0) continue
    out.push({
      paymentId: p.id,
      clientId: p.clientId,
      clientName: name.get(p.clientId) ?? '거래처',
      billingMonth: p.billingMonth,
      billed: p.amount,
      paid,
    })
  }
  return out.sort((a, b) => b.paid - a.paid)
}

/** 갈 곳 없는 입금의 합계 */
export function strandedTotal(data: AppData): number {
  return strandedReceipts(data).reduce((s, r) => s + r.paid, 0)
}
