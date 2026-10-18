import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Hospital} from 'lucide-react'
import { useData } from '../context/DataContext'
import { usePortalClient } from '../lib/portalClient'
import { PageShell, EmptyState } from '../components/ui'
import { LoadGate } from '../components/LoadState'
import { MonthlyReportView } from '../components/MonthlyReport'
import { PortalPageHead } from '../components/portal/PortalUi'
import { clientMonthlyReport } from '../lib/insights'
import { thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 월간 배출 리포트
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
  //  ⚠ 0085 — 「어느 병원인가」는 한 곳에서 정합니다(lib/portalClient.ts).
  //    예전의 `data.clients[0]` 은 직원 계정에서 **첫 병원**을 골랐습니다.
  const { client } = usePortalClient()
  const report = useMemo(() => (client ? clientMonthlyReport(data, client, month) : null), [data, client, month])
  const current = thisMonth()

  if (!client || !report) {
    return (
      <PageShell>
        <LoadGate
          loadingTitle="병원 정보를 불러오는 중입니다"
          empty={<EmptyState icon={Hospital} title="연결된 병원 정보를 찾을 수 없습니다" />}
        />
      </PageShell>
    )
  }

  return (
    <PageShell className="!space-y-4">
      {/*  포털 3차 시안 — 앱처럼 「제목 + 달 넘기기」 흰 띠.
           ⚠ 폰에서 제목이 세로로 한 글자씩 늘어지던 일(옆 달 고르기가 자리를 다
             가져감)이 다시 안 생기도록, 달 넘기기는 제목 **아래 줄**에 둡니다. */}
      <PortalPageHead title="월간 배출 리포트" sub={<>{client.name} · 수거·배출량·용기 공급 내역</>}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy-500 ring-1 ring-inset ring-navy-200 transition hover:text-navy-900"
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
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-navy-500 ring-1 ring-inset ring-navy-200 transition hover:text-navy-900 disabled:opacity-40"
            title="다음 달"
          >
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
        </div>
      </PortalPageHead>

      {/*  포털 4차 — 회색 바탕 위 흰 카드 한 장 안에 리포트를 둡니다(안쪽 칸이 바탕에 묻히지 않게). */}
      <div className="p-card">
        <MonthlyReportView report={report} />
      </div>
    </PageShell>
  )
}
