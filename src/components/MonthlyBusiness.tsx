import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { AppData } from '../types'
import { thisMonth, won, wonShort } from '../lib/format'
import type { Settlement } from '../lib/billing'
import { allocate, ALLOC_LABEL, ALLOC_WHY, monthlyPnl, type AllocatedRow, type AllocBasis } from '../lib/pnl'
import { OperatingCostPanel } from './OperatingCostPanel'

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
  const [basis, setBasis] = useState<AllocBasis>('visits')
  const months = useMemo(() => recentMonths(thisMonth()), [])
  const pnl = useMemo(() => monthlyPnl(data, month), [data, month])
  const r = pnl.rollup
  const alloc = useMemo(() => allocate(data, month, basis), [data, month, basis])
  const hasProduct = r.productRevenue > 0 || r.productCost > 0
  //  매입가를 안 넣은 품목 — 거래처별로 흩어져 있어 전사 화면에서는 합쳐서
  //  한 번만 적습니다(같은 물건을 여러 병원에 팔면 줄이 여러 개가 됩니다).
  const noCost = useMemo(
    () => [...new Set(r.rows.flatMap((s) => s.productNoCost))].sort(),
    [r.rows],
  )
  //  배부가 없는 달에는 기여이익률만 보여 주므로 두 종류의 줄을 함께 다룹니다.
  const allocatedOf = (s: Settlement | AllocatedRow) => ('allocated' in s ? s.allocated : 0)
  const opProfitOf = (s: Settlement | AllocatedRow) => ('operatingProfit' in s ? s.operatingProfit : 0)

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
          {/*  소모품을 판 달에는 매입 원가 칸을 함께 띄웁니다. 안 그러면
               화면에 적힌 뺄셈(매출 − 처리비 − 자재비)이 기여이익과 맞지
               않아 대표님이 「어디서 이만큼 빠졌지」를 손으로 찾게 됩니다.
               판 적이 없는 달에는 지금까지처럼 네 칸입니다. */}
          <div data-tour="business-summary" className="card mb-3 overflow-hidden">
            <div
              className={`grid grid-cols-2 divide-x divide-navy-100 ${
                hasProduct ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
              }`}
            >
              <Cell label="매출" v={r.revenue} />
              <Cell label="처리비" v={-r.disposalCost} />
              <Cell label="자재비" v={-r.materialCost} />
              {hasProduct && <Cell label="소모품 원가" v={-r.productCost} data-rollup-productcost />}
              <Cell
                label="기여이익"
                v={r.profit}
                tone={r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                sub={r.margin != null ? `${Math.round(r.margin * 100)}%` : undefined}
                //  폰에서는 두 칸씩 놓이므로 홀수가 되는 다섯 번째 칸이
                //  반쪽으로 남습니다. 제일 중요한 숫자를 반쪽으로 두지 않습니다.
                className={hasProduct ? 'col-span-2 sm:col-span-1' : undefined}
              />
            </div>
          </div>

          {noCost.length > 0 && (
            <p
              data-rollup-nocost
              className="t-muted mb-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 text-amber-700"
            >
              <b>매입가가 없어 원가 0원으로 잡힌 소모품이 있습니다 — {noCost.join(' · ')}.</b> 판 값만
              들어가고 산 값이 안 빠져서 이 품목은 <b>이익률 100%</b> 로 보입니다. 실제보다 남는 것처럼
              보이는 숫자이니, 「소모품 → 상품」에서 매입가를 넣어 주세요.
            </p>
          )}

          {/* 운영비 → 영업이익. 넣지 않은 달은 계산하지 않습니다 */}
          <div className="mb-3 card overflow-hidden" data-pnl-summary>
            <div className="grid grid-cols-2 divide-x divide-navy-100 sm:grid-cols-3">
              <Cell label="기여이익" v={r.profit} />
              <Cell
                label="운영비"
                v={pnl.operatingCost == null ? 0 : -pnl.operatingCost}
                empty={pnl.operatingCost == null}
              />
              <Cell
                label="영업이익"
                v={pnl.operatingProfit ?? 0}
                empty={pnl.operatingProfit == null}
                tone={(pnl.operatingProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                sub={
                  pnl.operatingMargin != null
                    ? `${Math.round(pnl.operatingMargin * 100)}%`
                    : undefined
                }
              />
            </div>
            {pnl.operatingCost == null && (
              <p className="break-keep border-t border-navy-100 bg-amber-50/60 px-5 py-3 text-[1.02rem] leading-relaxed text-navy-600">
                <b className="text-amber-700">운영비를 넣지 않아 영업이익을 계산하지 않았습니다.</b> 0원으로 두면
                기여이익이 그대로 영업이익처럼 보여 이익을 부풀리게 됩니다. 아래에 그 달 실제 지출을 넣어 주세요.
              </p>
            )}
          </div>

          <div className="mb-3">
            <OperatingCostPanel pnl={pnl} />
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-navy-100 px-5 py-3">
              <p className="t-card min-w-0 flex-1 text-navy-900">거래처별 수익성</p>
              {alloc && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="t-label text-navy-400">배부 기준</span>
                  {(['visits', 'kg'] as AllocBasis[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      data-alloc-basis={b}
                      onClick={() => setBasis(b)}
                      className={`rounded-xl px-2.5 py-1.5 text-[0.98rem] font-bold transition ${
                        basis === b ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                      }`}
                    >
                      {ALLOC_LABEL[b]}
                    </button>
                  ))}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left">
                <thead className="t-label bg-navy-50 text-navy-500">
                  <tr>
                    <th className="px-4 py-2.5">거래처</th>
                    <th className="px-4 py-2.5 text-right">매출</th>
                    <th className="px-4 py-2.5 text-right">직접원가</th>
                    <th className="px-4 py-2.5 text-right">기여이익</th>
                    {alloc ? (
                      <>
                        <th className="px-4 py-2.5 text-right">배부 운영비<span className="ml-1 font-normal text-navy-400">추정</span></th>
                        <th className="px-4 py-2.5 text-right">영업이익<span className="ml-1 font-normal text-navy-400">추정</span></th>
                      </>
                    ) : (
                      <th className="px-4 py-2.5 text-right">기여이익률</th>
                    )}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="t-cell divide-y divide-navy-50">
                  {(alloc ? alloc.rows : r.rows).map((s) => (
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
                      {alloc ? (
                        <>
                          <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">
                            -{won(allocatedOf(s))}
                          </td>
                          <td
                            data-alloc-profit={s.clientId}
                            className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                              opProfitOf(s) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {won(opProfitOf(s))}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-2.5 text-right tabular-nums text-navy-500">
                          {s.margin != null ? `${Math.round(s.margin * 100)}%` : '—'}
                        </td>
                      )}
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

          {alloc && (
            <p data-alloc-note className="t-muted mt-2 break-keep px-1">
              <b className="text-navy-500">배부 운영비·영업이익은 추정치입니다.</b> 회사 운영비 {won(alloc.total)}을
              「{ALLOC_LABEL[alloc.basis]}」으로 나눈 값입니다 — {ALLOC_WHY[alloc.basis]} 이 값은 청구서·거래명세서에는
              들어가지 않습니다.
            </p>
          )}
          <p className="t-muted mt-2 break-keep px-1">
            매출·처리비·자재비는 완료된 수거와 공급 기록으로 계산한 값입니다. 거래처 단가를 정하지 않은 항목은 기본 단가를 씁니다.
          </p>
        </>
      )}
    </section>
  )
}

function Cell({
  label,
  v,
  tone = 'text-navy-900',
  sub,
  empty = false,
  className,
  ...rest
}: {
  label: string
  v: number
  tone?: string
  sub?: string
  /** 아직 값이 없어 계산하지 않은 칸 — 0원으로 보여 주지 않습니다 */
  empty?: boolean
  className?: string
} & Record<`data-${string}`, unknown>) {
  return (
    <div className={`px-4 py-3.5 ${className ?? ''}`} {...rest}>
      <p className="t-label text-navy-500">{label}</p>
      <p className={`t-kpi-sm mt-0.5 tabular-nums ${empty ? 'text-navy-300' : tone}`}>
        {empty ? '미입력' : wonShort(v)}
      </p>
      {sub && <p className="t-muted mt-0.5">{sub}</p>}
    </div>
  )
}
