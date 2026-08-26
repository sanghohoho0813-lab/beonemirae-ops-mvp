import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useData } from '../../context/DataContext'
import { PortalSheet, ChoiceGrid } from '../PortalSheet'
import { MonthlyReportView } from '../MonthlyReport'
import { clientMonthlyReport } from '../../lib/insights'
import { thisMonth, weight } from '../../lib/format'
import { clientSchedules } from '../../lib/ops'
import type { Client } from '../../types'

// ─────────────────────────────────────────────────────────────────────────────
// 월간 배출 리포트 창 (0089)
//
//  대표님: 「카드 클릭 시 Dashboard 위에 large modal … 이번 달 / 지난 달 /
//  3개월 / 6개월」
//
//  ⚠ 「이번 달·지난 달」은 이미 있는 월간 리포트를 그대로 씁니다
//    (clientMonthlyReport — 내부 화면과 **같은 계산**입니다).
//  ⚠ 「3개월·6개월」은 월간 리포트가 아니라 **여러 달 합계**입니다.
//    같은 화면에 다른 뜻을 섞지 않고, 그 구간에서는 합계와 달별 표만
//    보여 줍니다. 억지로 월간 리포트 모양을 만들면 「어느 달 것인가」가
//    흐려집니다.
// ─────────────────────────────────────────────────────────────────────────────

const RANGES = [
  { value: 'this', label: '이번 달' },
  { value: 'last', label: '지난 달' },
  { value: '3', label: '최근 3개월' },
  { value: '6', label: '최근 6개월' },
]

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ReportSheet({
  open,
  client,
  onClose,
}: {
  open: boolean
  client: Client
  onClose: () => void
}) {
  const { data } = useData()
  const [range, setRange] = useState('this')

  const month = range === 'last' ? shiftMonth(thisMonth(), -1) : thisMonth()
  const single = range === 'this' || range === 'last'

  const report = useMemo(
    () => (single ? clientMonthlyReport(data, client, month) : null),
    [single, data, client, month],
  )

  //  ── 여러 달 합계 ────────────────────────────────────────────────────────
  const span = useMemo(() => {
    if (single) return null
    const n = Number(range)
    const months: string[] = []
    for (let i = n - 1; i >= 0; i -= 1) months.push(shiftMonth(thisMonth(), -i))
    const done = clientSchedules(data, client.id).filter((s) => s.status === '완료')
    const rows = months.map((m) => {
      const mine = done.filter((s) => s.date.startsWith(m))
      return {
        month: m,
        visits: mine.length,
        //  ⚠ 무게가 안 적힌 수거는 kg 합계에서 뺍니다. 0 으로 세면
        //    「줄었다」는 거짓말이 됩니다. 대신 횟수에는 그대로 셉니다.
        kg: mine.reduce((a, s) => a + (s.actualAmount ?? 0), 0),
        unweighed: mine.filter((s) => s.actualAmount == null).length,
      }
    })
    return {
      rows,
      visits: rows.reduce((a, r) => a + r.visits, 0),
      kg: rows.reduce((a, r) => a + r.kg, 0),
      unweighed: rows.reduce((a, r) => a + r.unweighed, 0),
    }
  }, [single, range, data, client.id])

  return (
    <PortalSheet
      name="report"
      kind="wide"
      open={open}
      onClose={onClose}
      title="월간 배출 리포트"
      subtitle={`${client.name} · 수거 기록에서 그대로 집계했습니다`}
      footer={
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="t-muted min-w-0 flex-1 break-keep">
            인증·실사에 그대로 쓰실 수 있습니다.
          </p>
          <button
            data-drawer-print
            onClick={() => window.print()}
            className="flex min-h-[2.75rem] shrink-0 items-center gap-2 rounded-2xl bg-navy-50 px-4 text-[1.02rem] font-extrabold text-navy-700 transition hover:bg-navy-100"
          >
            <Printer size={17} strokeWidth={2.5} /> 인쇄 · PDF 저장
          </button>
        </div>
      }
    >
      <div className="mb-4">
        <ChoiceGrid name="range" items={RANGES} value={range} onPick={setRange} />
      </div>

      {single && report && <MonthlyReportView report={report} />}

      {!single && span && (
        <div data-report-span>
          <div className="card grid grid-cols-1 gap-px overflow-hidden bg-navy-100 sm:grid-cols-2">
            <div className="bg-white px-5 py-4">
              <p className="t-muted break-keep">총 수거량</p>
              <p className="mt-0.5 break-keep text-[1.6rem] font-extrabold leading-tight text-navy-900">
                {weight(span.kg)}
              </p>
              {/*  ⚠ 무게가 안 적힌 건이 있으면 **그렇다고 말합니다.**
                   합계만 보여 주면 병원은 그것을 전부로 읽습니다. */}
              {span.unweighed > 0 && (
                <p className="t-muted mt-1 break-keep">
                  무게가 기록되지 않은 수거 {span.unweighed}건은 합계에서 빠져 있습니다
                </p>
              )}
            </div>
            <div className="bg-white px-5 py-4">
              <p className="t-muted break-keep">수거 횟수</p>
              <p className="mt-0.5 break-keep text-[1.6rem] font-extrabold leading-tight text-navy-900">
                {span.visits}회
              </p>
            </div>
          </div>

          <div className="card mt-3 divide-y divide-navy-50">
            {span.rows.map((r) => (
              <div key={r.month} data-span-row={r.month} className="flex items-center gap-3 px-5 py-3.5">
                <b className="t-body w-[5.5rem] shrink-0 tabular-nums text-navy-900">{r.month}</b>
                <span className="t-body min-w-0 flex-1 break-keep tabular-nums text-navy-700">
                  {r.visits > 0 ? `${weight(r.kg)} · ${r.visits}회` : '수거 없음'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PortalSheet>
  )
}
