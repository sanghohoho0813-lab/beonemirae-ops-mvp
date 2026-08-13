import { useRef } from 'react'
import { Printer, X } from 'lucide-react'
import type { AppData } from '../types'
import { liveBills, type Invoice } from '../lib/billing'
import { won } from '../lib/format'
import { usePrintIsolate } from '../lib/usePrintIsolate'
import { useHistoryDismiss } from '../lib/useHistoryDismiss'
import { InvoiceSheet } from './InvoiceView'

// ─────────────────────────────────────────────────────────────────────────────
// 월말 명세서 한 번에
//
//  여기가 이사님이 엑셀을 못 놓는 마지막 자리였습니다.
//
//   확정까지는 시스템에서 하는데, **병원에 보낼 명세서**는 거래처 화면에
//   하나씩 들어가 달을 고르고 명세서를 열고 인쇄해야 나왔습니다. 열여덟
//   곳이면 열여덟 번입니다. 그래서 거래명세서 시트가 들어 있는 엑셀을
//   계속 함께 굴리게 됩니다.
//
//   확정한 청구의 명세서를 한 화면에 이어 붙여 **한 번에 인쇄**합니다.
//   병원마다 A4 한 장씩 끊어집니다(break-after: page).
//
//  다시 계산하지 않습니다
//
//   확정할 때 굳혀 둔 명세서(snapshot.invoice)를 그대로 씁니다. 단가를
//   바꾼 뒤에 뽑아도 병원에 이미 보낸 종이와 같은 내용이 나옵니다.
//   확정하지 않은 달은 여기 나오지 않습니다 — 확정 전 금액을 문서로
//   내보내면 나중에 숫자가 달라집니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 그 달에 확정된 청구의 명세서 — 확정 순서대로 */
export function confirmedInvoices(data: AppData, month: string): Invoice[] {
  const all = [...data.clients, ...(data.retiredClients ?? [])]
  const out: { at: string; name: string; invoice: Invoice }[] = []
  for (const c of all) {
    for (const p of liveBills(data, c.id, month)) {
      const inv = p.snapshot?.invoice
      if (inv) out.push({ at: p.snapshot!.confirmedAt, name: c.name, invoice: inv })
    }
  }
  //  거래처 이름 순 — 봉투에 넣는 순서와 같게 두면 손이 덜 갑니다.
  out.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.at.localeCompare(b.at))
  return out.map((x) => x.invoice)
}

export function InvoiceBatch({
  invoices,
  month,
  onClose,
}: {
  invoices: Invoice[]
  month: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePrintIsolate(ref, true)
  useHistoryDismiss(true, onClose)
  const total = invoices.reduce((s, i) => s + i.total, 0)

  return (
    <div
      ref={ref}
      data-invoice-batch
      className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 print:static print:bg-white"
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-navy-900 px-4 py-3 text-white print:hidden sm:px-6">
        <p className="t-body min-w-0 flex-1 break-keep font-bold">
          {month.replace('-', '년 ')}월 거래명세서 {invoices.length}장 · 합계 {won(total)}
        </p>
        <button
          onClick={() => window.print()}
          data-batch-print
          className="shrink-0 rounded-full bg-white px-4 py-2 text-[1.02rem] font-extrabold text-navy-900 transition hover:bg-navy-100"
        >
          <Printer size={16} strokeWidth={2.5} className="mr-1 inline -translate-y-px" />
          {invoices.length}장 한 번에 인쇄 · PDF 저장
        </button>
        <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded-full p-2 hover:bg-white/15">
          <X size={19} />
        </button>
      </div>

      <p className="mx-auto max-w-[52rem] px-4 pt-3 text-[1.0rem] leading-relaxed text-navy-200 print:hidden">
        확정할 때 굳혀 둔 명세서를 그대로 뽑습니다 — 지금 단가를 바꿔도 이미 확정한 내용은 바뀌지 않습니다. 병원마다
        A4 한 장씩 끊어집니다.
      </p>

      {invoices.map((inv, i) => (
        <div
          key={`${inv.clientId}|${inv.month}|${i}`}
          data-batch-sheet={inv.clientId}
          className="break-after-page"
        >
          <InvoiceSheet invoice={inv} />
        </div>
      ))}
    </div>
  )
}
