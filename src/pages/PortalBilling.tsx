import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronRight, ClipboardList, FileBarChart, Headset, ReceiptText, ScrollText } from 'lucide-react'
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

  //  포털 2차 — 처음에는 **최근 6개월**만. 3년치를 다 늘어놓으니 화면이 7,500px
  //  이 되어 아래의 증빙자료를 아무도 못 찾았습니다. 「안 낸 달」은 접지 않습니다.
  const [showAll, setShowAll] = useState(false)
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

      {/*  ── 포털 2차 — 지금 상태 한 장 ──────────────────────────────────────
           원무·행정 담당이 이 화면에서 제일 먼저 묻는 것은 「낼 돈이 남았나」
           하나입니다. 그것을 크게, 색과 **글자**로 함께 말합니다. */}
      {rows.length > 0 && (
        <section
          data-pb-summary
          className={`card overflow-hidden ${owed > 0 ? 'ring-1 ring-rose-200' : 'ring-1 ring-emerald-200'}`}
        >
          <div className={`flex items-start gap-4 px-5 py-5 sm:px-6 ${owed > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
            <span
              aria-hidden="true"
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${
                owed > 0 ? 'bg-rose-600' : 'bg-emerald-600'
              }`}
            >
              {owed > 0 ? <ReceiptText size={24} strokeWidth={2.3} /> : <CheckCircle2 size={24} strokeWidth={2.3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`t-label ${owed > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
                {owed > 0 ? '아직 안 내신 금액' : '미납 없음'}
              </p>
              <p
                data-pb-owed
                className={`mt-1 break-keep text-[1.75rem] font-extrabold leading-tight tabular-nums ${
                  owed > 0 ? 'text-rose-700' : 'text-emerald-800'
                }`}
              >
                {owed > 0 ? won(owed) : '모두 입금 확인되었습니다'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-navy-50">
            <div className="px-5 py-3.5 sm:px-6">
              <p className="t-muted break-keep">청구 건수</p>
              <p data-pb-count className="t-body mt-0.5 font-extrabold tabular-nums text-navy-900">{rows.length}건</p>
            </div>
            <div className="px-5 py-3.5 sm:px-6">
              <p className="t-muted break-keep">누적 청구액</p>
              <p data-pb-billed className="t-body mt-0.5 break-keep font-extrabold tabular-nums text-navy-900">{won(billed)}</p>
            </div>
          </div>
        </section>
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
          <>
          <ul className="space-y-2.5">
            {rows
              .filter((r, i) => showAll || i < 6 || r.rest > 0)
              .map(({ p, paid, rest, label }) => (
              <li key={p.id} data-pb-row={p.billingMonth} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <p className="t-card min-w-0 break-keep text-navy-900">
                    {/^\d{4}-\d{2}$/.test(p.billingMonth)
                      ? `${Number(p.billingMonth.slice(0, 4))}년 ${Number(p.billingMonth.slice(5, 7))}월`
                      : p.billingMonth}{' '}
                    청구
                  </p>
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
          {!showAll && rows.filter((r, i) => !(i < 6 || r.rest > 0)).length > 0 && (
            <button
              type="button"
              data-pb-more
              onClick={() => setShowAll(true)}
              className="mt-3 flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[1.05rem] font-bold text-navy-700 shadow-card ring-1 ring-cardline transition hover:bg-navy-50"
            >
              이전 내역 더 보기 ({rows.filter((r, i) => !(i < 6 || r.rest > 0)).length}건)
            </button>
          )}
          </>
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
