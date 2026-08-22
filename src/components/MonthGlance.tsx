import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { AppData } from '../types'
import { rollupFor } from '../lib/billing'
import { dunningSummary } from '../lib/dunning'
import { monthlyCollected, outstandingTotal } from '../lib/selectors'
import { thisMonth, weight, wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 이번 달 경영현황 (요약)
//
//  전에는 이 숫자들이 흩어져 있었습니다 — 수거량은 제목 옆 알약, 미수금은
//  체크리스트 카드 아래 링크, 매출·이익은 통계 화면에만. 같은 질문("이번 달
//  장사는 어떤가")에 답하는 숫자인데 세 군데를 봐야 했습니다. 한 줄로 모읍니다.
//
//  계산은 새로 만들지 않았습니다. 정산에 쓰는 rollupFor 를 그대로 씁니다 —
//  대시보드 숫자와 정산 화면 숫자가 어긋나면 둘 다 못 믿게 됩니다.
//
//  폰에서는 네 칸이 다 들어가지 않습니다. 매출과 영업이익만 남기고
//  나머지는 통계 화면에서 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

export function MonthGlance({ data }: { data: AppData }) {
  const month = thisMonth()
  const r = useMemo(() => rollupFor(data, month), [data, month])
  const collected = useMemo(() => monthlyCollected(data), [data])
  const kg = collected.의료폐기물 + collected.일회용기저귀
  const unpaid = outstandingTotal(data)
  //  미수금 총액만 보면 「이번 달 것이 아직 안 들어왔다」와 「석 달째
  //  안 들어온다」가 구분되지 않습니다. 밀린 곳 수를 한 줄로 붙입니다.
  const overdue = useMemo(() => dunningSummary(data), [data])

  const cells = [
    //  숫자마다 무엇이 포함되는지 한 줄로 적습니다. 대표님은 DB 가 아니라
    //  이 숫자를 보고 판단하므로, 무엇이 빠졌는지 모르는 숫자는 위험합니다.
    {
      key: 'kg', label: '수거량', value: weight(kg), tone: 'text-navy-900', mobile: false,
      sub: '완료된 수거 기록만',
    },
    {
      key: 'rev', label: '매출', value: wonShort(r.revenue), tone: 'text-navy-900', mobile: true,
      sub: '확정 청구 + 미확정 정산',
    },
    {
      key: 'profit',
      //  처리비·자재비만 뺀 값입니다 — 운송비·인건비는 시스템에 없습니다.
      //  「영업이익」이라고 적으면 대표님이 실제보다 높은 이익으로 읽습니다.
      label: '기여이익',
      value: wonShort(r.profit),
      tone: r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600',
      sub: (r.margin != null ? `${Math.round(r.margin * 100)}% · ` : '') + '운송비·인건비 제외',
      mobile: true,
    },
    {
      key: 'unpaid',
      label: '미수금',
      value: wonShort(unpaid),
      tone: unpaid > 0 ? 'text-amber-700' : 'text-navy-900',
      mobile: false,
      sub:
        overdue.rows.length > 0
          ? `밀린 곳 ${overdue.rows.length}곳 · ${wonShort(overdue.total)}`
          : '확정 청구 중 미입금액',
    },
  ]

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 lg:grid-cols-4 lg:divide-y-0">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`kpi-box px-4 py-3.5 ${c.mobile ? '' : 'hidden lg:block'}`}
          >
            <p className="t-label text-navy-500">{c.label}</p>
            <p className={`t-stat mt-1 tabular-nums ${c.tone}`}>{c.value}</p>
            {c.sub && <p className="t-muted mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>
      <Link
        to="/stats"
        className="flex items-center justify-center gap-1 border-t border-navy-100 py-3 text-[1.05rem] font-bold text-navy-600 transition hover:bg-navy-50 active:bg-navy-50"
      >
        거래처별 수익성 · 월 정산 <ChevronRight size={17} />
      </Link>
    </div>
  )
}
