import { useMemo, useState } from 'react'
import { Check, ReceiptText} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { FilterChip, EmptyState } from '../components/ui'
import { Stagger, StaggerItem } from '../components/motion'
import { PaymentBadge } from '../components/Badge'
import { outstandingTotal } from '../lib/selectors'
import { won } from '../lib/format'
import type { PaymentStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 미수금 관리 — 거래처별 청구금액 / 입금상태 / 미수금 합계 / 입금완료 처리
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS: Array<PaymentStatus | '전체'> = ['전체', '미수금', '확인필요', '입금완료']

export function Receivables() {
  const { data, clientById, markPaid, updatePayment } = useData()
  const [filter, setFilter] = useState<PaymentStatus | '전체'>('미수금')

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

  const outstanding = outstandingTotal(data)
  const billedTotal = data.payments.reduce((s, p) => s + p.amount, 0)
  const collected = billedTotal - outstanding

  return (
    <div>
      <PageHeader title="미수금 관리" subtitle="거래처별 청구 · 입금 현황" />

      {/* 미수금 요약 — 하나의 카드로 압축 */}
      <div className="card mb-5 p-5">
        <p className="text-[1.03rem] font-semibold text-navy-400">미수금 합계</p>
        <p className="mt-1 text-[1.9rem] font-extrabold leading-none tracking-tight text-rose-500">{won(outstanding)}</p>
        <p className="mt-1.5 text-[0.98rem] text-navy-400">입금완료 외 전체 청구</p>
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

      {list.length === 0 ? (
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

                {p.status !== '입금완료' && (
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
                      onClick={() => markPaid(p.id)}
                    >
                      <Check size={16} strokeWidth={2.6} /> 입금완료 처리
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
