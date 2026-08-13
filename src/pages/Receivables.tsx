import { useMemo, useState } from 'react'
import { Check, ReceiptText} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { FilterChip, EmptyState } from '../components/ui'
import { Stagger, StaggerItem } from '../components/motion'
import { PaymentBadge } from '../components/Badge'
import { outstandingTotal, outstandingOf, paidTotalOf } from '../lib/selectors'
import { won, today } from '../lib/format'
import type { PaymentStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 미수금 관리 — 거래처별 청구금액 / 입금상태 / 미수금 합계 / 입금완료 처리
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: Array<PaymentStatus | '전체'> = ['전체', '미수금', '확인필요', '입금완료', '취소']

export function Receivables() {
  const { data, clientById, markPaid, updatePayment } = useData()
  const [filter, setFilter] = useState<PaymentStatus | '전체'>('미수금')
  const [error, setError] = useState<string | null>(null)

  const months = useMemo(
    () => Array.from(new Set(data.payments.map((p) => p.billingMonth))).sort().reverse(),
    [data.payments],
  )
  const [month, setMonth] = useState<string>('전체')

  const list = useMemo(() => {
    return data.payments
      .filter((p) => (filter === '전체' ? true : p.status === filter))
      .filter((p) => (month === '전체' ? true : p.billingMonth === month))
      .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || b.amount - a.amount)
  }, [data.payments, filter, month])

  //  돈 기록입니다 — 누구의 얼마를 오늘 날짜로 넣는지 한 번 보여 주고
  //  확인을 받습니다. 실제 입금일이 오늘이 아니면 거래처 화면의 「입금
  //  기록」으로 날짜를 넣어야 합니다.
  async function confirmPaid(id: string, name: string, month: string, rest: number) {
    if (
      !window.confirm(
        `${name} ${month} 청구 · 남은 ${won(rest)}\n\n` +
          `오늘(${today()}) 받은 것으로 입금 기록을 남깁니다.\n` +
          '실제 입금일이 다르면 거래처 화면의 「입금 기록」에서 날짜를 넣어 주세요.',
      )
    ) {
      return
    }
    const r = await markPaid(id)
    if (!r.ok) setError(r.error ?? '기록하지 못했습니다.')
  }

  //  부분입금을 뺀 실제 못 받은 돈 — 화면마다 다른 값이 나오지 않도록
  //  계산은 selectors 한 곳만 씁니다.
  const paidOf = (p: (typeof data.payments)[number]) => paidTotalOf(data, p)
  const restOf = (p: (typeof data.payments)[number]) => outstandingOf(data, p)
  const outstanding = outstandingTotal(data)
  //  취소한 청구는 청구한 적 없는 것으로 셉니다. 안 그러면 '입금 완료' 가
  //  받지도 않은 돈만큼 부풀려집니다.
  const billedTotal = data.payments
    .filter((p) => p.status !== '취소')
    .reduce((s, p) => s + p.amount, 0)
  //  실제로 들어온 돈 — 부분입금까지 더합니다.
  const collected = data.payments
    .filter((p) => p.status !== '취소')
    .reduce((s, p) => s + paidTotalOf(data, p), 0)

  return (
    <div>
      <PageHeader title="미수금 관리" subtitle="거래처별 청구 · 입금 현황" />

      {error && (
        <div data-pay-error className="card mb-4 border-rose-200 bg-rose-50/60 p-4 text-[1.05rem] font-semibold text-rose-600">
          {error}
        </div>
      )}

      {/* 미수금 요약 — 하나의 카드로 압축 */}
      <div className="card mb-5 p-5">
        <p className="text-[1.03rem] font-semibold text-navy-400">미수금 합계</p>
        <p className="mt-1 text-[1.9rem] font-extrabold leading-none tracking-tight text-rose-500">{won(outstanding)}</p>
        <p className="mt-1.5 text-[0.98rem] text-navy-400">부분입금을 뺀 실제 못 받은 금액</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-navy-100 pt-3">
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">입금 완료</p>
            <p className="mt-0.5 text-base font-extrabold text-emerald-600">{won(collected)}</p>
          </div>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">총 청구액</p>
            <p className="mt-0.5 text-base font-extrabold text-navy-800">{won(billedTotal)}</p>
          </div>
        </div>
      </div>

      {/* 상태 필터 칩 */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </FilterChip>
        ))}
      </div>
      {/* 청구월 필터 칩 (가로 스크롤) */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip active={month === '전체'} onClick={() => setMonth('전체')}>
          전체 청구월
        </FilterChip>
        {months.map((m) => (
          <FilterChip key={m} active={month === m} onClick={() => setMonth(m)}>
            {m}
          </FilterChip>
        ))}
      </div>

      {data.payments.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="아직 청구 내역이 없습니다"
          subtitle="수거 실적이 쌓이면 거래처별 청구·입금 현황이 여기에 표시됩니다."
        />
      ) : list.length === 0 ? (
        <EmptyState icon={ReceiptText} title="조건에 맞는 청구 내역이 없어요" subtitle="다른 필터를 선택해 보세요." />
      ) : (
        <Stagger className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:items-start">
          {list.map((p) => {
            const client = clientById(p.clientId)
            return (
              <StaggerItem key={p.id} className="card p-4">
                {/* 업체명 — 항상 최우선, 첫 줄 전체를 사용해 잘리지 않게 */}
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-extrabold text-navy-900">{client?.name ?? '알 수 없음'}</span>
                  <PaymentBadge status={p.status} />
                </div>
                {/* 금액 + 청구 정보 */}
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="t-caption">
                    {p.billingMonth} 청구 · {p.method}
                    {p.memo && ` · ${p.memo}`}
                  </p>
                  <p className="shrink-0 text-right text-lg font-extrabold text-navy-900">{won(p.amount)}</p>
                </div>

                {/*
                  부분입금이 있으면 받은 돈과 남은 돈을 함께 보여 줍니다.
                  청구액만 보이면 30만원이 들어온 100만원 청구가 아직 100만원
                  받을 것처럼 읽힙니다.
                */}
                {paidOf(p) > 0 && restOf(p) > 0 && (
                  <p data-partial={p.id} className="mt-1 text-right text-[1.0rem] font-semibold text-navy-500">
                    받음 {won(paidOf(p))} · <b className="text-rose-500">남은 {won(restOf(p))}</b>
                  </p>
                )}

                {/* 취소한 청구는 더 손대지 않습니다 — 기록으로만 남습니다 */}
                {restOf(p) > 0 && p.status !== '취소' && (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    {p.status === '미수금' && (
                      <button
                        className="rounded-full bg-navy-50 px-4 py-2 text-[1.08rem] font-bold text-navy-500 transition active:scale-95"
                        onClick={() => updatePayment(p.id, { status: '확인필요' })}
                      >
                        확인필요
                      </button>
                    )}
                    <button
                      className="flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-2 text-[1.08rem] font-bold text-white shadow-sm transition active:scale-95"
                      data-mark-paid={p.id}
                      onClick={() => void confirmPaid(p.id, client?.name ?? '거래처', p.billingMonth, restOf(p))}
                    >
                      <Check size={16} strokeWidth={2.6} />
                      {paidOf(p) > 0 ? `남은 ${won(restOf(p))} 입금 처리` : '입금완료 처리'}
                    </button>
                  </div>
                )}
              </StaggerItem>
            )
          })}
        </Stagger>
      )}
    </div>
  )
}
