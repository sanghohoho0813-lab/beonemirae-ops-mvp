import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { MetricCard, FilterChip, EmptyState } from '../components/ui'
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

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="미수금 합계" value={won(outstanding)} tone="rose" hint="입금완료 외 전체 청구" />
        <MetricCard label="입금 완료" value={won(collected)} tone="emerald" />
        <MetricCard label="총 청구액" value={won(billedTotal)} tone="navy" />
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
        <EmptyState icon="💳" title="조건에 맞는 청구 내역이 없어요" subtitle="다른 필터를 선택해 보세요." />
      ) : (
        <Stagger className="space-y-2.5">
          {list.map((p) => {
            const client = clientById(p.clientId)
            return (
              <StaggerItem key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-navy-900">{client?.name ?? '알 수 없음'}</span>
                      <PaymentBadge status={p.status} />
                    </div>
                    <p className="mt-1 t-caption">
                      {p.billingMonth} 청구 · {p.method}
                      {p.memo && ` · ${p.memo}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-lg font-extrabold text-navy-900">{won(p.amount)}</p>
                </div>

                {p.status !== '입금완료' && (
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary flex-1 py-3.5" onClick={() => markPaid(p.id)}>
                      ✓ 입금완료 처리
                    </button>
                    {p.status === '미수금' && (
                      <button className="btn-ghost" onClick={() => updatePayment(p.id, { status: '확인필요' })}>
                        확인필요
                      </button>
                    )}
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
