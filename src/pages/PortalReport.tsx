import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, EmptyState } from '../components/ui'
import { MonthlyReportView } from '../components/MonthlyReport'
import { clientMonthlyReport } from '../lib/insights'
import { thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 월간 운영 리포트
//
//  내부에서 이미 쓰던 clientMonthlyReport 를 그대로 병원에게 보여줍니다.
//  병원이 따로 정리하던 배출량·수거횟수·용기 공급 내역을 매달 직접 확인할 수
//  있게 되는 것이 이 화면의 목적입니다.
// ─────────────────────────────────────────────────────────────────────────────

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function PortalReport() {
  const { data } = useData()
  const [month, setMonth] = useState(thisMonth())
  const client = data.clients[0]
  const report = useMemo(() => (client ? clientMonthlyReport(data, client, month) : null), [data, client, month])
  const current = thisMonth()

  if (!client || !report) {
    return (
      <PageShell>
        <EmptyState icon="🏥" title="연결된 병원 정보를 찾을 수 없습니다" />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="t-page break-keep text-navy-900">월간 운영 리포트</h1>
          <p className="t-body mt-2.5 break-keep font-medium text-navy-400">
            {client.name} · 수거·배출량·용기 공급 내역
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-navy-500 shadow-sm transition hover:text-navy-900"
            title="이전 달"
          >
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
          <span className="t-card min-w-[7.5rem] whitespace-nowrap text-center text-navy-900">
            {month.replace('-', '년 ')}월
          </span>
          <button
            onClick={() => setMonth((m) => (m >= current ? m : shiftMonth(m, 1)))}
            disabled={month >= current}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-navy-500 shadow-sm transition hover:text-navy-900 disabled:opacity-40"
            title="다음 달"
          >
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <MonthlyReportView report={report} />
    </PageShell>
  )
}
