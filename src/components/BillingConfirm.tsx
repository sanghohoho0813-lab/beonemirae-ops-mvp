import { useState } from 'react'
import { CheckCircle2, FileText, Loader2, ReceiptText, Undo2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { billingStateFor, type Invoice } from '../lib/billing'
import { won } from '../lib/format'
import type { AppData, Client } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 청구 확정
//
//  여기가 예전에 끊겨 있던 자리입니다. 정산 금액이 나와도 그것을 '받을 돈'
//  으로 옮기는 길이 화면에 없어서, 미수금 화면은 비어 있고 대시보드의 미수금
//  합계도 0원으로 나왔습니다. 그래서 이사님은 엑셀의 「정산완료 / 미수금」
//  칸을 계속 손으로 관리하셔야 했습니다.
//
//  월말에 자동으로 만들지 않습니다. 사무실이 정산을 눈으로 확인한 뒤 누릅니다
//  — 청구는 병원에 보내는 금액이라, 사람이 한 번 보고 확정하는 편이 맞습니다.
//
//  누르면 그 순간의 정산·명세서가 통째로 굳습니다. 그래서
//   · 나중에 단가를 바꿔도 이미 확정한 청구와 명세서는 그대로입니다
//   · 확정 뒤에 들어온 수거는 기존 청구에 섞이지 않고 「추가 청구」로 잡힙니다
//   · 청구할 것이 남지 않으면 버튼이 잠깁니다 (같은 달 중복 청구 차단)
// ─────────────────────────────────────────────────────────────────────────────

export function BillingConfirmCard({
  data,
  client,
  month,
  onOpenInvoice,
}: {
  data: AppData
  client: Client
  month: string
  /** 그 청구의 거래명세서를 엽니다 (확정 당시 굳혀 둔 내용 그대로) */
  onOpenInvoice: (invoice: Invoice) => void
}) {
  const { confirmBilling, cancelPayment } = useData()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const st = billingStateFor(data, client.id, month)

  async function confirm() {
    const label = st.nextKind === '추가' ? '추가 청구' : '청구'
    if (
      !window.confirm(
        `${client.name} ${month.replace('-', '년 ')}월 ${label}\n` +
          `금액 ${won(st.pendingAmount)} (수거 ${st.pending.collections}건 · 공급 ${st.pending.supplies}건)\n\n` +
          '확정하면 이 금액과 거래명세서가 그대로 고정됩니다. 이후 단가를 바꾸거나 ' +
          '수거가 더 들어와도 이 청구는 바뀌지 않습니다. 진행할까요?',
      )
    ) {
      return
    }
    setBusy(true)
    const r = await confirmBilling(client.id, month)
    setBusy(false)
    setMsg({ ok: r.ok, text: r.ok ? `${label}를 확정했습니다 — ${won(st.pendingAmount)}` : (r.error ?? '확정하지 못했습니다.') })
    if (r.ok) setTimeout(() => setMsg(null), 5000)
  }

  function cancel(id: string, amount: number) {
    const reason = window.prompt(
      `이 청구(${won(amount)})를 취소합니다.\n` +
        '기록은 지우지 않고 「취소」로 남습니다. 사유를 적어 주세요.',
      '',
    )
    if (reason === null) return
    cancelPayment(id, reason.trim())
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReceiptText size={19} strokeWidth={2.3} className="shrink-0 text-navy-500" />
        <p className="t-card min-w-0 flex-1 break-keep text-navy-900">청구</p>
        <button
          className="btn-navy shrink-0 disabled:opacity-40"
          disabled={!st.canConfirm || busy}
          onClick={() => void confirm()}
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} strokeWidth={2.4} />}
          {st.nextKind === '추가' ? '추가 청구 확정' : '청구 확정'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="kpi-box min-w-0 rounded-2xl bg-navy-50 px-3.5 py-3">
          <p className="t-muted">이미 청구한 금액</p>
          <p className="t-stat mt-1 tabular-nums text-navy-900">{won(st.billedAmount)}</p>
          <p className="t-muted mt-0.5">{st.bills.length}건</p>
        </div>
        <div className="kpi-box min-w-0 rounded-2xl bg-navy-50 px-3.5 py-3">
          <p className="t-muted">아직 청구하지 않은 금액</p>
          <p className={`t-stat mt-1 tabular-nums ${st.canConfirm ? 'text-teal-600' : 'text-navy-400'}`}>
            {won(st.pendingAmount)}
          </p>
          <p className="t-muted mt-0.5">
            수거 {st.pending.collections}건 · 공급 {st.pending.supplies}건
          </p>
        </div>
      </div>

      {!st.canConfirm && st.bills.length > 0 && (
        <p className="t-muted mt-3 break-keep">이 달은 청구를 마쳤습니다. 수거가 더 들어오면 추가 청구를 만들 수 있습니다.</p>
      )}
      {!st.canConfirm && st.bills.length === 0 && st.pending.collections + st.pending.supplies > 0 && (
        <p className="t-muted mt-3 break-keep">
          이 달에 나간 것은 무상 물품뿐이라 청구할 금액이 없습니다. (박스·기저귀비닐은 매출에 잡히지
          않습니다)
        </p>
      )}
      {!st.canConfirm && st.bills.length === 0 && st.pending.collections + st.pending.supplies === 0 && (
        <p className="t-muted mt-3 break-keep">이 달에는 아직 청구할 수거·공급이 없습니다.</p>
      )}
      {st.hasLegacyBill && (
        <p className="t-muted mt-3 break-keep rounded-2xl bg-amber-50 px-3.5 py-2.5 text-amber-700">
          이 기능 이전에 만들어진 청구가 섞여 있습니다. 그 청구가 어느 수거를 덮었는지 알 수 없어, 남은
          금액이 실제와 다를 수 있습니다.
        </p>
      )}

      {st.bills.length > 0 && (
        <ul className="mt-3 space-y-2">
          {st.bills.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-navy-50 px-3.5 py-3">
              <span className="t-label shrink-0 text-navy-500">{p.snapshot?.kind ?? '청구'}</span>
              <span className="t-cell min-w-0 flex-1 tabular-nums font-bold text-navy-900">{won(p.amount)}</span>
              <span className="t-muted shrink-0">{p.status}</span>
              {/*
                청구가 여러 건이면(정기 + 추가) 명세서도 건마다 따로 나갑니다.
                위쪽 「거래명세서」 버튼 하나로는 마지막 것만 열리므로, 줄마다
                그 청구의 명세서를 열 수 있게 둡니다.
              */}
              {p.snapshot?.invoice && (
                <button
                  className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[1rem] font-bold text-navy-500 transition hover:bg-navy-100"
                  onClick={() => onOpenInvoice(p.snapshot!.invoice)}
                >
                  <FileText size={14} className="mr-1 inline -translate-y-px" />
                  명세서
                </button>
              )}
              {p.status !== '입금완료' && (
                <button
                  className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[1rem] font-bold text-navy-500 transition hover:bg-navy-100"
                  onClick={() => cancel(p.id, p.amount)}
                >
                  <Undo2 size={14} className="mr-1 inline -translate-y-px" />
                  취소
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <p
          className={`t-body mt-3 break-keep rounded-2xl px-3.5 py-2.5 font-bold ${
            msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}
