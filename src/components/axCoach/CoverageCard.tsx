import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown } from 'lucide-react'
import type { AreaCoverage } from '../../lib/axCoach'
import { AREA_ANCHOR, COVERAGE_SAY, AREA_SENTENCE } from '../../lib/axCoach'

// ─────────────────────────────────────────────────────────────────────────────
//  갈래 한 칸 — 이름 · 큰 숫자 · 쉬운 말 한 줄. 그 이상은 눌러야 나옵니다.
//
//   ⚠ 한 칸에 네 가지 넘게 넣지 않습니다. 대표님·이사님·기사님이 폰에서
//     보는 화면이라, 첫 눈에 읽히지 않으면 그다음부터 안 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

const BAR: Record<AreaCoverage['state'], string> = {
  none: 'bg-navy-200',
  low: 'bg-amber-400',
  building: 'bg-sky-500',
  enough: 'bg-teal-500',
}
const TEXT: Record<AreaCoverage['state'], string> = {
  none: 'text-navy-400',
  low: 'text-amber-700',
  building: 'text-sky-700',
  enough: 'text-teal-700',
}

export function CoverageCard({ a, detail = true }: { a: AreaCoverage; detail?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-coach-area={a.area} data-coach-state={a.state} className="card p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-m-1 flex min-h-[3rem] w-[calc(100%+0.5rem)] items-start gap-3 rounded-2xl p-1 text-left transition hover:bg-navy-50"
      >
        <span className="min-w-0 flex-1">
          <span className="t-card block text-navy-900">{a.label}</span>
          <span data-coach-say className={`t-body mt-1 block break-keep font-bold ${TEXT[a.state]}`}>{a.say}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <b data-coach-pct={a.area} className="t-kpi-sm tabular-nums text-navy-900">{a.pct}%</b>
          <ChevronDown size={18} className={`mt-1 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-navy-100">
        <div className={`h-full rounded-full ${BAR[a.state]}`} style={{ width: `${Math.max(a.pct, a.pct > 0 ? 4 : 0)}%` }} />
      </div>

      {open && (
        <div data-coach-items={a.area} className="mt-4 space-y-2.5 border-t border-navy-50 pt-3.5">
          <p className="t-muted break-keep">이 칸이 답하려는 것: {AREA_SENTENCE[a.area]}</p>
          {a.items.map((i) => (
            <div key={i.key} data-coach-item={i.key} className="rounded-2xl bg-navy-50 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <b className="t-body min-w-0 break-keep text-navy-800">{i.label}</b>
                <span className="t-body shrink-0 font-extrabold tabular-nums text-navy-900">
                  {/*  ⚠ 못 센 것은 0 이 아닙니다 — 문구를 다르게 둡니다. */}
                  {i.have == null ? <span className="text-navy-400">아직 못 셈</span> : `${i.have}${i.unit}`}
                  <span className="t-caption ml-1 font-bold text-navy-500">/ {i.need}{i.unit}</span>
                </span>
              </div>
              <p className="t-caption mt-1 break-keep text-navy-500">{i.from}</p>
            </div>
          ))}
          <p className="t-caption break-keep text-navy-500">
            {a.state === 'enough' ? COVERAGE_SAY.enough : '목표 수치는 성과 화면이 쓰는 내부 표시 기준과 같은 값입니다 — 여기서 따로 정하지 않습니다.'}
          </p>
          {/*  쌓인 자료로 나온 **결과**는 성과 화면에 있습니다. 여기서는 겹쳐 적지
               않고 그 자리로 보냅니다 (성과 화면이 안 열리는 기사님에게는 없습니다). */}
          {detail && (
            <Link
              data-coach-detail={a.area}
              to={AREA_ANCHOR[a.area]}
              className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl px-1 text-[1.02rem] font-bold text-teal-700 hover:underline"
            >
              성과 화면에서 이 칸 자세히 보기 <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
