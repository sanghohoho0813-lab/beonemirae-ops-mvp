import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useData } from '../context/DataContext'
import { revenueSummary } from '../lib/revenue'
import { wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 경영 매출 — 대표가 화면을 열자마자 보는 네 숫자
//
//  올해 누적매출 · 월평균 매출 · 예상 연매출 · 현재 미수금
//
//  숫자마다 아래에 한 줄로 무엇인지 적습니다. 특히
//
//   월평균     **끝난 달만** 씁니다. 진행 중인 이번 달을 넣으면 평균이
//              실제보다 낮아지고, 거기에 12 를 곱한 예상은 더 낮아집니다.
//   예상 연매출 예측이 아니라 「최근 끝난 N개월 평균 × 12」입니다. 산식과
//              쓴 기간을 그대로 적습니다. 근거가 모자라면 계산하지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function RevenueKpis() {
  const { data } = useData()
  const s = useMemo(() => revenueSummary(data), [data])
  const year = new Date().getFullYear()

  //  확정 신고가 올해를 덮고 있으면 그것이 기준입니다 — 시스템 집계는
  //  거래처가 다 들어오기 전이라 실제의 몇 분의 일입니다.
  const d = s.declared

  const cells = [
    {
      key: 'ytd',
      label: `${year}년 누적매출`,
      value: wonShort(s.ytd),
      tone: 'text-navy-900',
      sub: d
        ? d.label
        : s.ytdMonths > 0
          ? `${s.ytdMonths}개월치${s.ytdPartial ? ' · 이번 달은 진행 중' : ''}`
          : '아직 집계된 달이 없습니다',
    },
    {
      key: 'avg',
      label: '월평균 매출',
      value: s.average == null ? '—' : wonShort(s.average),
      tone: 'text-navy-900',
      sub: d
        ? `신고액 ÷ ${d.months}개월`
        : s.average == null
          ? `끝난 달 ${s.averageMonths.length}개월 — 3개월이 쌓이면 계산합니다`
          : `끝난 ${s.averageMonths.length}개월 평균 · 진행 중인 달 제외`,
    },
    {
      key: 'proj',
      label: '예상 연매출',
      value: s.projection == null ? '—' : wonShort(s.projection),
      tone: 'text-teal-600',
      sub: s.formula,
    },
    {
      key: 'unpaid',
      label: '현재 미수금',
      value: wonShort(s.outstanding),
      tone: s.outstanding > 0 ? 'text-rose-500' : 'text-navy-900',
      sub: '확정 청구 중 아직 못 받은 돈',
    },
  ]

  return (
    <div className="card overflow-hidden" data-revenue-kpis>
      <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 lg:grid-cols-4 lg:divide-y-0">
        {cells.map((c) => (
          <div key={c.key} data-revenue-kpi={c.key} className="kpi-box px-4 py-3.5">
            <p className="t-label text-navy-500">{c.label}</p>
            <p className={`t-stat mt-1 tabular-nums ${c.tone}`}>{c.value}</p>
            <p className="t-muted mt-0.5 break-keep leading-snug">{c.sub}</p>
          </div>
        ))}
      </div>
      {/*  신고 기간 뒤의 달은 **더하지 않고** 따로 적습니다. 전체 자료와
          일부 자료를 더하면 「그 달에 매출이 급감했다」로 읽힙니다. */}
      {d && d.afterLabel !== '' && (
        <p data-revenue-after className="t-muted border-t border-navy-100 px-4 py-2.5 break-keep">
          {d.afterLabel}은 아직 신고 전이라 시스템 집계로 <b className="text-navy-600">{wonShort(d.afterTotal)}</b>{' '}
          입니다 — <b className="text-navy-600">거래처가 아직 다 들어오지 않아 실제보다 적습니다.</b> 위 누적매출에
          더하지 않았습니다.
        </p>
      )}
      <Link
        to="/revenue"
        data-revenue-more
        className="flex items-center gap-1 border-t border-navy-100 px-4 py-2.5 text-[1rem] font-bold text-navy-500 transition hover:bg-navy-50"
      >
        월별 추이 · 거래처별 매출 · 직접입력
        <ChevronRight size={15} strokeWidth={2.6} className="ml-auto" />
      </Link>
    </div>
  )
}
