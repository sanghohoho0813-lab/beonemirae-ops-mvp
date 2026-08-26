import { useMemo } from 'react'
import { Headset } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PortalSheet } from '../PortalSheet'
import { outstandingOf, paidTotalOf } from '../../lib/selectors'
import { won, prettyDate } from '../../lib/format'
import { CLIENT_TEL } from '../../lib/brand'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 정산 서랍 (0089)
//
//  대표님: 「상세 영수증/세금계산서 기능이 현재 없다면 fake 버튼을 만들지
//  않는다」
//
//  ⚠ 결제 단추를 만들지 않았습니다. 결제 연동이 없습니다. 누르면 아무 일도
//    안 일어나는 단추는 「고장」으로 읽힙니다. 대신 **무엇을 할 수 있는지**를
//    적습니다 — 상담센터로 문의하시는 길입니다.
//
//  ⚠ 「입금일」은 실제 입금 기록(payment_receipts)에서만 옵니다.
//    청구서에 적힌 예정일을 입금일처럼 보여 주지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE: Record<string, string> = {
  '입금 완료': 'bg-emerald-50 text-emerald-600',
  '부분 입금': 'bg-amber-50 text-amber-700',
  미납: 'bg-rose-50 text-rose-500',
}

export function BillingDrawer({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: Client
  onClose: () => void
}) {
  const { data } = useData()

  const rows = useMemo(() => {
    return data.payments
      .filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
      .map((p) => {
        const paid = paidTotalOf(data, p)
        const rest = outstandingOf(data, p)
        const label = rest <= 0 ? '입금 완료' : paid > 0 ? '부분 입금' : '미납'
        //  실제 입금 기록에서 마지막 입금일을 찾습니다.
        const last = (data.receipts ?? [])
          .filter((r) => r.paymentId === p.id)
          .map((r) => r.receivedOn)
          .sort()
          .pop()
        return { p, paid, rest, label, last }
      })
      .sort((a, b) => b.p.billingMonth.localeCompare(a.p.billingMonth))
  }, [data, client.id])

  const owed = rows.reduce((a, r) => a + r.rest, 0)
  const recent = rows.slice(0, 6)
  const thisRow = rows[0]

  return (
    <PortalSheet
      name="billing"
      kind="drawer"
      open={open}
      onClose={onClose}
      title="정산 현황"
      subtitle={`${client.name} · 월별 청구 금액과 입금 상태입니다`}
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          {/*  ⚠ 결제 단추 대신 **실제로 되는 길**을 답니다. */}
          <p className="t-muted min-w-0 flex-1 break-keep">
            지금은 이 화면에서 결제하실 수 없습니다.
          </p>
          <a
            href={`tel:${CLIENT_TEL}`}
            className="flex min-h-[2.75rem] shrink-0 items-center gap-2 rounded-2xl bg-navy-50 px-4 text-[1.02rem] font-extrabold text-navy-700 transition hover:bg-navy-100"
          >
            <Headset size={17} strokeWidth={2.5} /> {CLIENT_TEL}
          </a>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p data-billing-empty className="t-body break-keep rounded-2xl bg-navy-50 px-5 py-5 leading-snug text-navy-500">
          아직 청구 내역이 없습니다. 수거 실적이 쌓이면 월별 청구·입금 현황이 여기에 표시됩니다.
        </p>
      ) : (
        <>
          <div className="card grid grid-cols-1 gap-px overflow-hidden bg-navy-100 sm:grid-cols-2">
            <div className="bg-white px-5 py-4">
              <p className="t-muted break-keep">이번 청구 ({thisRow.p.billingMonth})</p>
              <p data-bill-latest className="mt-0.5 break-keep text-[1.5rem] font-extrabold leading-tight text-navy-900">
                {won(thisRow.p.amount)}
              </p>
              <span className={`pill mt-1.5 ${TONE[thisRow.label]}`}>{thisRow.label}</span>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="t-muted break-keep">아직 안 내신 금액</p>
              {/*  ⚠ 0원이면 빨갛게 적지 않습니다 — 다 내신 것은 좋은 소식입니다. */}
              <p
                data-bill-owed
                className={`mt-0.5 break-keep text-[1.5rem] font-extrabold leading-tight ${
                  owed > 0 ? 'text-rose-500' : 'text-emerald-600'
                }`}
              >
                {owed > 0 ? won(owed) : '없음'}
              </p>
            </div>
          </div>

          <h3 className="t-body mb-2.5 mt-5 break-keep font-extrabold text-navy-900">최근 6개월</h3>
          <ul data-billing-rows className="divide-y divide-navy-100 rounded-2xl bg-white ring-1 ring-navy-100">
            {recent.map((r) => (
              <li key={r.p.id} data-billing-row={r.p.billingMonth} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <b className="t-body shrink-0 tabular-nums text-navy-900">{r.p.billingMonth}</b>
                  <span className={`pill shrink-0 ${TONE[r.label]}`}>{r.label}</span>
                  <b className="t-body ml-auto shrink-0 tabular-nums text-navy-900">{won(r.p.amount)}</b>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="t-muted break-keep text-navy-500">입금 {won(r.paid)}</span>
                  {r.rest > 0 && (
                    <span className="t-muted break-keep text-rose-500">남은 금액 {won(r.rest)}</span>
                  )}
                  {/*  ⚠ 입금일은 **실제 입금 기록이 있을 때만** 적습니다. */}
                  {r.last && (
                    <span className="t-muted ml-auto shrink-0 break-keep text-navy-500">
                      {prettyDate(r.last)} 입금
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PortalSheet>
  )
}
