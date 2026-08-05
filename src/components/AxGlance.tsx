import { Link } from 'react-router-dom'
import { ChevronRight, Gauge } from 'lucide-react'
import type { AppData } from '../types'
import { performanceGlance } from '../lib/performance'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 하단 'AX 실증 현황' 카드 (핵심 3개보다 작게)
//  실제 측정된 값만 보여주고, 없으면 '측정 중 / 기준값 입력 필요'로 표시합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function AxGlanceCard({ data }: { data: AppData }) {
  const g = performanceGlance(data)

  const items = [
    {
      label: '실증 경과',
      value: g.experimentDay != null ? `${g.experimentDay}일차` : '시작일 미설정',
      muted: g.experimentDay == null,
    },
    { label: '자동 처리', value: `${g.autoTotal.toLocaleString('ko-KR')}건`, muted: g.autoTotal === 0 },
    {
      label: '평균 입력시간',
      value: g.avgInputMin != null ? `${g.avgInputMin}분` : '측정 중',
      muted: g.avgInputMin == null,
    },
    {
      label: '측정지표',
      value: `${g.ready.confirmed}/${g.ready.total} 확보`,
      muted: g.ready.confirmed === 0,
    },
  ]

  return (
    <Link
      to="/performance"
      className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
        <Gauge size={21} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="t-card text-navy-900">AX 실증 현황</p>
        <p className="t-muted mt-0.5">
          {g.baselineFilled === 0 ? '도입 전 기준값 입력 필요' : `도입 전 기준값 ${g.baselineFilled}/5개 입력됨`}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <p className="t-muted font-bold">{it.label}</p>
            <p className={`t-body mt-0.5 font-extrabold ${it.muted ? 'text-navy-400' : 'text-navy-900'}`}>{it.value}</p>
          </div>
        ))}
      </div>
      <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.95rem] font-bold text-teal-600">
        성과 보기 <ChevronRight size={17} />
      </span>
    </Link>
  )
}
