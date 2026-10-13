import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ClipboardList, FileBarChart, Headset, ReceiptText, ScrollText } from 'lucide-react'
import { CLIENT_TEL } from '../lib/brand'
import { usePortalSheet } from '../lib/portalSheet'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
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
  //  ⚠ 0085 — 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  //    예전의 `data.clients[0]` 은 직원 계정에서 **첫 병원**을 골랐습니다.
  const { client, path } = usePortalClient()
  const { open } = usePortalSheet()
  const navigate = useNavigate()

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
      {/*  포털 1차 고도화 — 「정산·증빙」. 정산 내역 아래에 증빙자료를 함께
           둡니다. 둘 다 원무·행정 담당이 월말에 한 번에 찾는 것입니다. */}
      <div>
        <h1 className="t-page break-keep text-navy-900">정산·증빙</h1>
        <p className="t-body mt-2 break-keep text-navy-500">
          월별 청구 금액과 입금 상태, 인증·실사에 쓰실 증빙자료입니다.
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
        <SectionTitle>정산 내역</SectionTitle>
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

      {/*  ── 증빙자료 ── 예전에는 홈의 「증빙자료」 카드(서랍)였습니다. 같은
           내용을 여기로 모았습니다. 서랍(?do=docs)은 예전 링크를 위해 남겨 둡니다. */}
      <section data-pb-docs>
        <SectionTitle>증빙자료</SectionTitle>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {[
            {
              key: 'history',
              icon: ClipboardList,
              title: '수거 이력',
              desc: '날짜·수거량·용기·처리장 인계까지 그대로 나옵니다.',
              onClick: () => navigate(path('history')),
            },
            {
              key: 'report',
              icon: FileBarChart,
              title: '월간 배출 리포트',
              desc: '달별 배출량과 수거 횟수를 한 장으로. 인쇄 · PDF 저장이 됩니다.',
              onClick: () => open('report'),
            },
          ].map((x) => {
            const Icon = x.icon
            return (
              <li key={x.key}>
                <button
                  type="button"
                  data-pb-doc={x.key}
                  onClick={x.onClick}
                  className="card flex w-full items-start gap-3.5 p-4 text-left transition hover:bg-navy-50/60 sm:p-5"
                >
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
                    <Icon size={21} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-body block break-keep font-extrabold text-navy-900">{x.title}</span>
                    <span className="t-muted mt-0.5 block break-keep leading-snug">{x.desc}</span>
                  </span>
                  <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" className="mt-2.5 shrink-0 text-navy-400" />
                </button>
              </li>
            )
          })}
        </ul>

        {client && (client.contractStart || client.contractEnd) && (
          <p data-pb-contract className="t-body mt-3 flex flex-wrap items-center gap-2 break-keep text-navy-700">
            <ScrollText size={18} strokeWidth={2.4} aria-hidden="true" className="shrink-0 text-navy-500" />
            계약 기간 ·{' '}
            {[client.contractStart ? `${client.contractStart} 부터` : null, client.contractEnd ? `${client.contractEnd} 까지` : null]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}

        {/*  ⚠ 없는 것을 있는 척하지 않습니다 — 법정 서식 수거대장 자동 발급과
             올바로 연동은 아직입니다. 필요하시면 담당자가 보내 드립니다. */}
        <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-4 ring-1 ring-amber-100">
          <p className="t-body break-keep font-extrabold text-amber-900">아직 준비되지 않은 자료</p>
          <p className="t-muted mt-1 break-keep leading-snug text-amber-900">
            법정 서식 수거대장 자동 발급과 올바로 시스템 연동은 개발 중입니다. 지금 필요하시면 상담센터로
            말씀해 주시면 담당자가 보내 드립니다.
          </p>
          <a
            href={`tel:${CLIENT_TEL}`}
            className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-2xl bg-white px-4 text-[1.02rem] font-extrabold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100"
          >
            <Headset size={17} strokeWidth={2.5} aria-hidden="true" /> {CLIENT_TEL}
          </a>
        </div>
      </section>
    </PageShell>
  )
}
