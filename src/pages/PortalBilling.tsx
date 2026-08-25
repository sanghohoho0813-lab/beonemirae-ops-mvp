import { useMemo } from 'react'
import { ReceiptText } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { outstandingOf, paidTotalOf } from '../lib/selectors'
import { won, prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원이 보는 정산 내역 (0083)
//
//  대표님: 「이번 단계에서 PG 결제 시스템까지 구현할 필요는 없다. 다만 향후
//  카드결제 또는 자동결제 기능을 추가할 수 있도록 UI와 데이터 구조를 확장
//  가능하게 설계한다.」
//
//  ⚠ **결제 단추를 만들지 않았습니다.** 누르면 아무 일도 안 일어나는 단추는
//    「고장」으로 읽힙니다. 결제가 실제로 붙는 날 그 자리에 넣습니다.
//    지금은 「무엇이 얼마이고 얼마가 남았는가」를 정확히 보여 주는 데까지
//    합니다 — 병원이 전화로 물어보던 것이 바로 이것입니다.
//
//  ⚠ 숫자는 **내부 화면과 같은 함수**로 계산합니다(outstandingOf).
//    병원 화면만 따로 계산하면 언젠가 두 숫자가 어긋나고, 그때 병원은
//    저희를 믿지 않게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = {
  '입금 완료': 'bg-emerald-50 text-emerald-600',
  '부분 입금': 'bg-amber-50 text-amber-700',
  미납: 'bg-rose-50 text-rose-500',
}

export function PortalBilling() {
  const { data } = useData()
  const client = data.clients[0]

  const rows = useMemo(() => {
    if (!client) return []
    return data.payments
      .filter((p) => p.clientId === client.id && p.status !== '취소' && !p.canceledAt)
      .map((p) => {
        const paid = paidTotalOf(data, p)
        const rest = outstandingOf(data, p)
        const label = rest <= 0 ? '입금 완료' : paid > 0 ? '부분 입금' : '미납'
        return { p, paid, rest, label }
      })
      .sort((a, b) => b.p.billingMonth.localeCompare(a.p.billingMonth))
  }, [data, client])

  const owed = rows.reduce((a, r) => a + r.rest, 0)
  const billed = rows.reduce((a, r) => a + r.p.amount, 0)

  return (
    <PageShell>
      <div>
        <h1 className="t-page break-keep text-navy-900">정산 내역</h1>
        <p className="t-body mt-2 break-keep text-navy-500">
          월별 청구 금액과 입금 상태입니다. 궁금한 점은 문의하기에서 남겨 주세요.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="card kpi-box p-4 sm:p-5">
            <p className="t-muted break-keep">청구 건수</p>
            <p data-pb-count className="t-stat mt-1.5 text-navy-900">{rows.length}건</p>
          </div>
          <div className="card kpi-box p-4 sm:p-5">
            <p className="t-muted break-keep">누적 청구액</p>
            <p data-pb-billed className="t-stat mt-1.5 text-navy-900">{won(billed)}</p>
          </div>
          <div className="card kpi-box p-4 sm:p-5">
            <p className="t-muted break-keep">아직 안 내신 금액</p>
            {/*  ⚠ 0원이면 빨갛게 적지 않습니다 — 다 내신 것은 좋은 소식입니다. */}
            <p data-pb-owed className={`t-stat mt-1.5 ${owed > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              {owed > 0 ? won(owed) : '없음'}
            </p>
          </div>
        </div>
      )}

      <section>
        <SectionTitle>월별 내역</SectionTitle>
        {rows.length === 0 ? (
          <LoadGate
            loadingTitle="정산 내역을 불러오는 중입니다"
            empty={
              <EmptyState
                icon={ReceiptText}
                title="아직 청구 내역이 없습니다"
                subtitle="수거 실적이 쌓이면 월별 청구·입금 현황이 여기에 표시됩니다."
              />
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map(({ p, paid, rest, label }) => (
              <li key={p.id} data-pb-row={p.billingMonth} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <p className="t-card min-w-0 break-keep text-navy-900">{p.billingMonth} 청구</p>
                  <span className={`pill ${STATUS_TONE[label]}`}>{label}</span>
                  <p className="ml-auto shrink-0 text-[1.2rem] font-extrabold tabular-nums text-navy-900">
                    {won(p.amount)}
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                  <p className="t-muted break-keep">
                    입금 <b className="text-navy-800">{won(paid)}</b>
                  </p>
                  <p className="t-muted break-keep">
                    남은 금액{' '}
                    <b className={rest > 0 ? 'text-rose-500' : 'text-emerald-600'}>
                      {rest > 0 ? won(rest) : '없음'}
                    </b>
                  </p>
                  {p.paidAt && <p className="t-muted break-keep">납부일 {prettyDate(p.paidAt)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*  ⚠ 결제 수단이 아직 없다는 것을 **분명히** 적습니다. 없는 기능을
           있는 것처럼 두면 병원이 여기서 결제를 기다립니다. */}
      <p data-pb-nopay className="t-muted break-keep rounded-2xl bg-navy-50 px-4 py-3.5 leading-snug">
        지금은 이 화면에서 결제하실 수 없습니다. 입금은 기존과 같이 계좌이체로 진행되며,
        여기서는 청구·입금 상태만 확인하실 수 있습니다.
      </p>
    </PageShell>
  )
}
