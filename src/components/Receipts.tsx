import { useState } from 'react'
import { Banknote, Loader2, Plus, Trash2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { receiptsOf } from '../lib/ops'
import { today, won } from '../lib/format'
import { Modal } from './Modal'
import type { ReceiptMethod } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 입금 기록 (부분입금)
//
//  청구 100만원에 30만원이 먼저 들어오고 나중에 70만원이 들어오는 것이
//  실제 업무입니다. 예전에는 「입금완료 / 미수금」 두 상태뿐이라, 30만원을
//  받은 사실이나 70만원을 못 받은 사실 중 하나가 반드시 사라졌습니다.
//
//  실제 거래처 파일에서 확인했습니다 — 서울인화 거래명세서에 「미납금액」
//  이월 줄이 있습니다.
//
//  저장은 서버 함수 한 번으로 합니다(0026). 입금 저장 + 청구 상태 갱신 +
//  감사기록이 한 트랜잭션이라, 중간에 끊겨도 반쪽 상태가 남지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const METHODS: ReceiptMethod[] = ['계좌이체', '카드', '현금', '기타']

export function ReceiptPanel({
  paymentId,
  billed,
  paid,
  canceled,
}: {
  paymentId: string
  /** 청구금액 */
  billed: number
  /** 지금까지 받은 금액 */
  paid: number
  canceled: boolean
}) {
  const { data, addReceipt, removeReceipt } = useData()
  const rows = receiptsOf(data, paymentId)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const remaining = Math.max(0, billed - paid)

  //  기본값은 「오늘 · 남은 금액 전부」입니다. 대부분 한 번에 다 들어오므로
  //  그대로 저장하면 되고, 부분입금일 때만 금액을 고치면 됩니다.
  const [form, setForm] = useState({ receivedOn: today(), amount: '', method: '계좌이체' as ReceiptMethod, memo: '' })

  /*
    이번 저장이 「같은 저장」인지 알려 주는 표 (0042).

     서버에는 들어갔는데 응답이 오는 길에 통신이 끊기면 화면에는 「저장하지
     못했습니다」가 뜹니다. 담당자는 당연히 다시 누릅니다. 그때 서버가
     구분하지 못하면 **입금이 두 번 기록되고 미수금이 그만큼 적게 보입니다.**
     (격리 DB 에서 재현했습니다 — 30만원 두 번이 60만원이 됐습니다)

     막는 방법이 「같은 금액을 막는 것」이면 안 됩니다. 병원이 오전·오후에
     같은 금액을 나눠 보내는 일이 실제로 있고 그건 두 줄이 맞습니다.

     그래서 **저장 창을 열 때 표를 하나 만들고**, 실패해서 다시 눌러도 같은
     표를 냅니다. 성공하면 창을 닫으므로 다음 입금은 새 표를 받습니다.
  */
  const [requestId, setRequestId] = useState('')

  function openAdd() {
    setForm({ receivedOn: today(), amount: String(remaining), method: '계좌이체', memo: '' })
    setRequestId(crypto.randomUUID())
    setErr(null)
    setOpen(true)
  }

  async function save() {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('입금액을 넣어 주세요.')
      return
    }
    if (amount > remaining) {
      setErr(`남은 금액(${won(remaining)})보다 많습니다. 초과 입금은 저장되지 않습니다.`)
      return
    }
    setBusy(true)
    setErr(null)
    const r = await addReceipt({
      paymentId,
      receivedOn: form.receivedOn,
      amount,
      method: form.method,
      memo: form.memo.trim(),
      requestId,
    })
    setBusy(false)
    if (r.ok) setOpen(false)
    else setErr(r.error ?? '저장하지 못했습니다.')
  }

  return (
    <div data-receipts={paymentId} className="rounded-2xl bg-navy-50/60 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-navy-600">
          <Banknote size={17} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-body break-keep font-extrabold text-navy-900">
            입금 {won(paid)} / 청구 {won(billed)}
          </p>
          <p className="t-muted break-keep">
            {canceled ? (
              '취소된 청구입니다 — 받을 돈이 아닙니다.'
            ) : remaining > 0 ? (
              <>
                남은 미수금 <b className="text-rose-600">{won(remaining)}</b>
                {paid > 0 ? ' · 부분입금 상태입니다' : ''}
              </>
            ) : (
              '완납되었습니다.'
            )}
          </p>
        </div>
        {!canceled && remaining > 0 && (
          <button data-add-receipt className="btn-navy shrink-0" onClick={openAdd}>
            <Plus size={16} strokeWidth={2.5} /> 입금 기록
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.id}
              data-receipt-row={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3.5 py-2.5"
            >
              <span className="t-body shrink-0 font-bold tabular-nums text-navy-800">{r.receivedOn}</span>
              <span className="t-body shrink-0 font-extrabold tabular-nums text-navy-900">{won(r.amount)}</span>
              <span className="pill shrink-0 bg-navy-50 text-navy-500">{r.method}</span>
              <span className="t-muted min-w-0 flex-1 break-keep text-navy-400">
                {r.memo}
                {r.actorName ? `${r.memo ? ' · ' : ''}${r.actorName}` : ''}
              </span>
              <button
                onClick={() => {
                  //  돈 기록입니다 — 지우면 청구 상태도 함께 돌아갑니다.
                  //  무엇이 되돌아가는지 적어 두고 물어봅니다.
                  if (
                    window.confirm(
                      `${r.receivedOn} 입금 ${won(r.amount)} 기록을 지울까요?\n` +
                        '이 청구의 미수금이 그만큼 다시 늘어납니다. 감사기록에는 남습니다.',
                    )
                  ) {
                    void removeReceipt(r.id)
                  }
                }}
                title="입금 기록 삭제"
                aria-label="입금 기록 삭제"
                className="shrink-0 rounded-xl p-2 text-navy-300 transition hover:bg-rose-50 hover:text-rose-500"
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title="입금 기록"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost flex-1" onClick={() => setOpen(false)}>
              취소
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null} 저장
            </button>
          </>
        }
      >
        <p className="t-muted break-keep">
          청구 {won(billed)} · 이미 받은 {won(paid)} · 남은 <b className="text-rose-600">{won(remaining)}</b>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="r-date">
              입금일 *
            </label>
            <input
              id="r-date"
              type="date"
              max={today()}
              className="field-input"
              value={form.receivedOn}
              onChange={(e) => setForm({ ...form, receivedOn: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="r-amount">
              입금액 (원) *
            </label>
            <input
              id="r-amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={remaining}
              className="field-input text-right"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="field-label">결제수단</label>
          <div className="grid grid-cols-4 gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setForm({ ...form, method: m })}
                className={`rounded-2xl px-2 py-3 text-[1.02rem] font-extrabold transition ${
                  form.method === m ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="r-memo">
            메모
          </label>
          <input
            id="r-memo"
            className="field-input"
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
            placeholder="예: 기업은행 입금 · 세금계산서 발행 완료"
          />
        </div>
        {err && <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{err}</p>}
      </Modal>
    </div>
  )
}
