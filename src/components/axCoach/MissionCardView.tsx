import { ArrowRight, CheckCircle2, Clock3, Loader2 } from 'lucide-react'
import type { MissionCard } from '../../lib/axCoach'
import { AREA_LABEL } from '../../lib/axCoach'

// ─────────────────────────────────────────────────────────────────────────────
//  오늘 할 일 한 칸.
//
//   ⚠ **「완료」 단추가 없습니다.** 단추는 「업무하러 가기」 하나뿐입니다.
//     다 했다는 판정은 실제 업무 기록이 생겼을 때 시스템이 합니다.
//   ⚠ 한 칸에 제목 · 왜 · 단추 셋만 둡니다. 확인되면 그 줄이 하나 더 붙습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function MissionCardView({
  m,
  no,
  busy,
  onGo,
}: {
  m: MissionCard
  no: number
  busy: boolean
  onGo: (m: MissionCard) => void
}) {
  const done = m.status === 'verified'
  return (
    <li
      data-coach-mission={m.key}
      data-coach-mission-status={m.status}
      className={`card p-5 sm:p-6 ${done ? 'bg-teal-50/50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[1.05rem] font-extrabold ${
            done ? 'bg-teal-500 text-white' : 'bg-navy-900 text-white'
          }`}
        >
          {done ? <CheckCircle2 size={20} strokeWidth={2.4} /> : no}
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-card break-keep text-navy-900">{m.title}</p>
          <p className="t-body mt-1.5 break-keep text-navy-600">
            <span className="font-extrabold text-navy-500">왜? </span>
            {m.why}
          </p>
        </div>
      </div>

      {done ? (
        <p data-coach-verified={m.key} className="t-body mt-4 flex items-start gap-2 break-keep rounded-2xl bg-white px-4 py-3 font-bold text-teal-700">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" strokeWidth={2.4} />
          <span>실제 업무기록을 확인했어요 — {m.verification.what}</span>
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              data-coach-go={m.key}
              onClick={() => onGo(m)}
              disabled={busy}
              className="btn-navy min-h-[3rem] px-6"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <>{m.actionLabel} <ArrowRight size={18} strokeWidth={2.4} /></>}
            </button>
            <span className="pill bg-navy-100 text-navy-600">{AREA_LABEL[m.area]}</span>
          </div>
          {m.status === 'waiting' && (
            <p data-coach-waiting={m.key} className="t-body mt-3 flex items-start gap-2 break-keep font-bold text-navy-500">
              <Clock3 size={18} className="mt-0.5 shrink-0" strokeWidth={2.4} />
              <span>업무하러 가셨습니다. {m.expected}이(가) 남으면 여기서 확인됩니다 — 누르는 것으로는 확인되지 않습니다.</span>
            </p>
          )}
        </>
      )}
    </li>
  )
}
