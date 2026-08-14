import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, CircleDashed, Clock } from 'lucide-react'
import { monthProgress, type ProgressStep, type StepState } from '../lib/monthProgress'
import { useData } from '../context/DataContext'
import { won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 월 마감 진행상황 — 「이번 달 어디까지 했지」
//
//  여섯 단계가 세 화면에 흩어져 있어서, 어디서 멈췄는지 알려면 화면을
//  돌아다녀야 했습니다. 한 자리에서 봅니다.
//
//  칠하지 않는 것
//
//   명세서를 보냈는지, 홈택스에 발행했는지는 시스템에 남지 않습니다.
//   그것을 초록색 「끝」으로 칠하면 안 한 일을 했다고 믿게 됩니다.
//   그 둘은 「준비됨」까지만 말하고, 모른다는 사실을 그대로 적습니다.
// ─────────────────────────────────────────────────────────────────────────────

const STYLE: Record<StepState, { chip: string; ring: string; icon: typeof Check }> = {
  남음: { chip: 'bg-navy-800 text-white', ring: 'border-navy-200', icon: Clock },
  확인: { chip: 'bg-amber-100 text-amber-700', ring: 'border-amber-200', icon: AlertTriangle },
  준비됨: { chip: 'bg-sky-100 text-sky-700', ring: 'border-sky-200', icon: Check },
  끝: { chip: 'bg-teal-100 text-teal-700', ring: 'border-teal-200', icon: Check },
  '해당 없음': { chip: 'bg-navy-50 text-navy-400', ring: 'border-navy-100', icon: CircleDashed },
}

function StepCard({ step, order }: { step: ProgressStep; order: number }) {
  const s = STYLE[step.state]
  const Icon = s.icon
  const faded = step.state === '해당 없음'
  return (
    <div
      data-progress-step={step.key}
      className={`card flex flex-col gap-2 border p-4 ${s.ring} ${faded ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-[0.92rem] font-black text-navy-400">
          {order}
        </span>
        <span className="min-w-0 flex-1 break-keep font-bold text-navy-900">{step.label}</span>
        <span
          data-progress-state={step.key}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.95rem] font-bold ${s.chip}`}
        >
          <Icon size={13} strokeWidth={2.6} />
          {step.state}
        </span>
      </div>

      <p className="break-keep text-[1.05rem] font-bold leading-snug text-navy-800">{step.detail}</p>

      {step.todo && (
        <p className="break-keep text-[0.98rem] leading-snug text-navy-500">{step.todo}</p>
      )}

      {/*  숫자가 어디서 온 값인지 — 추정과 실제를 섞지 않기 위해 늘 적습니다 */}
      <p data-progress-source={step.key} className="break-keep text-[0.94rem] leading-snug text-navy-300">
        출처 · {step.source}
      </p>

      <Link
        to={step.to}
        data-progress-link={step.key}
        className="mt-auto inline-flex items-center gap-1 self-start rounded-full bg-navy-50 px-3 py-1.5 text-[0.98rem] font-bold text-navy-600 transition hover:bg-navy-100"
      >
        {step.linkLabel}
        <ArrowRight size={14} strokeWidth={2.6} />
      </Link>
    </div>
  )
}

export function MonthProgressPanel({ month }: { month: string }) {
  const { data } = useData()
  const p = monthProgress(data, month)

  return (
    <section data-progress-panel>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="break-keep text-[1.03rem] font-semibold text-navy-400">
              {month.replace('-', '년 ')}월 마감 진행상황
            </p>
            <p data-progress-headline className="mt-1 break-keep text-[1.25rem] font-extrabold leading-snug text-navy-900">
              {p.next
                ? `다음 할 일 — ${p.next.label}`
                : '이 달에 시스템이 확인할 수 있는 일은 모두 끝났습니다'}
            </p>
            {p.next && <p className="mt-0.5 break-keep text-[1.02rem] text-navy-500">{p.next.detail}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[1.03rem] font-semibold text-navy-400">남은 단계 없음</p>
            <p data-progress-count className="mt-0.5 text-2xl font-extrabold tabular-nums text-navy-900">
              {p.done}
              <span className="text-base text-navy-300"> / {p.steps.length}</span>
            </p>
          </div>
        </div>

        {/*  돈 세 줄 — 확정한 금액과 실제로 받은 돈은 다른 숫자입니다 */}
        <div className="mt-3.5 grid grid-cols-3 gap-2.5 border-t border-navy-100 pt-3.5" data-progress-money>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">확정 청구</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-navy-900">{won(p.billed)}</p>
          </div>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">받은 돈</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-emerald-600">{won(p.collected)}</p>
          </div>
          <div>
            <p className="text-[0.98rem] font-semibold text-navy-400">못 받은 돈</p>
            <p className="mt-0.5 break-all text-[1.1rem] font-extrabold tabular-nums text-rose-500">{won(p.outstanding)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {p.steps.map((s, i) => (
          <StepCard key={s.key} step={s} order={i + 1} />
        ))}
      </div>

      <p className="mt-2 break-keep px-1 text-[0.96rem] leading-snug text-navy-400">
        명세서를 병원에 보냈는지, 홈택스에 세금계산서를 발행했는지는 시스템에 기록이 남지 않습니다. 그래서 그
        두 단계는 「준비됨」까지만 표시하고 끝났다고 말하지 않습니다.
      </p>
    </section>
  )
}
