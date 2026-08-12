import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { AppData } from '../types'
import { rollupFor } from '../lib/billing'
import { thisMonth, won, wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 이번 달 경영 요약
//
//  엑셀에서 전체 거래처 파일을 따로 열어 합계를 내던 부분입니다.
//  거래처별 정산이 자동으로 계산되므로 합계도 자동으로 나옵니다.
//
//  새 화면을 만들지 않고 통계 안에 넣었습니다 —
//  대표가 매출·이익을 보러 들어오는 곳이 이미 여기입니다.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

function recentMonths(from: string, n = 6): string[] {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
}

export function MonthlyBusiness({ data }: { data: AppData }) {
  const [month, setMonth] = useState(thisMonth)
  const months = useMemo(() => recentMonths(thisMonth()), [])
  const r = useMemo(() => rollupFor(data, month), [data, month])

  return (
    <section className="mb-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="min-w-0 flex-1 text-[1.08rem] font-semibold text-navy-500">경영 요약</h2>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="field-input w-auto py-1.5"
          aria-label="집계 월"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '년 ')}월
            </option>
          ))}
        </select>
      </div>

      {r.rows.length === 0 ? (
        <div className="card px-5 py-8 text-center">
          <p className="t-body break-keep text-navy-500">이 달에는 집계할 수거·공급이 없습니다.</p>
        </div>
      ) : (
        <>
          <div data-tour="business-summary" className="card mb-3 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-navy-100 sm:grid-cols-4">
              <Cell label="매출" v={r.revenue} />
              <Cell label="처리비" v={-r.disposalCost} />
              <Cell label="자재비" v={-r.materialCost} />
              <Cell
                label="기여이익"
                v={r.profit}
                tone={r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                sub={r.margin != null ? `${Math.round(r.margin * 100)}%` : undefined}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-navy-100 px-5 py-3">
              <p className="t-card text-navy-900">거래처별 수익성</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left">
                <thead className="t-label bg-navy-50 text-navy-500">
                  <tr>
                    <th className="px-4 py-2.5">거래처</th>
                    <th className="px-4 py-2.5 text-right">매출</th>
                    <th className="px-4 py-2.5 text-right">직접원가</th>
                    <th className="px-4 py-2.5 text-right">기여이익</th>
                    <th className="px-4 py-2.5 text-right">기여이익률</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="t-cell divide-y divide-navy-50">
                  {r.rows.map((s) => (
                    <tr key={s.clientId} className="transition hover:bg-navy-50">
                      <td className="px-4 py-2.5 font-bold text-navy-800">
                        <Link to={`/clients/${s.clientId}`} className="hover:underline">
                          {s.clientName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-700">{won(s.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">-{won(s.cost)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                          s.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {won(s.profit)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">
                        {s.margin != null ? `${Math.round(s.margin * 100)}%` : '—'}
                      </td>
                      <td className="pr-3 text-right">
                        <Link to={`/clients/${s.clientId}`} aria-label={`${s.clientName} 정산`}>
                          <ChevronRight size={16} className="text-navy-300" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="t-muted mt-2 break-keep px-1">
            완료된 수거와 공급 기록으로 계산한 값입니다. 거래처 단가를 정하지 않은 항목은 기본 단가를 씁니다.
          </p>
        </>
      )}
    </section>
  )
}

function Cell({ label, v, tone = 'text-navy-900', sub }: { label: string; v: number; tone?: string; sub?: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="t-label text-navy-500">{label}</p>
      <p className={`t-kpi-sm mt-0.5 tabular-nums ${tone}`}>{wonShort(v)}</p>
      {sub && <p className="t-muted mt-0.5">{sub}</p>}
    </div>
  )
}
