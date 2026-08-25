import { useNavigate } from 'react-router-dom'
import { PlusCircle, ArrowRight, ArrowDown } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "한 번 입력, 여러 업무 자동 연결" — 제품의 대표 메시지
//  현장에서 수거 완료를 1회 입력하면 아래 업무가 자동으로 이어집니다.
// ─────────────────────────────────────────────────────────────────────────────

const LINKED = [
  { label: '오늘 일정', to: '/today' },
  { label: '수거이력', to: '/history' },
  { label: '거래처', to: '/clients' },
  { label: '자재', to: '/materials' },
  { label: '통계', to: '/stats' },
  { label: '대장·명세', to: '/reports' },
]

export function AutoLinkFlow() {
  const navigate = useNavigate()

  return (
    <div className="card overflow-hidden p-5 sm:p-7">
      <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:items-center xl:gap-7">
        {/* 시작점 — 수거 완료 1회 입력 */}
        <button
          onClick={() => navigate('/collection')}
          className="pressable flex min-w-0 shrink-0 items-center gap-3.5 rounded-2xl bg-teal-500 px-6 py-5 text-left text-white shadow-sm transition hover:bg-teal-600"
        >
          <PlusCircle size={30} strokeWidth={2.2} className="shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[1.07rem] font-semibold text-teal-50">현장에서</span>
            <span className="block break-keep text-[1.35rem] font-extrabold">수거 완료 1회 입력</span>
          </span>
        </button>

        <ArrowRight size={28} className="hidden shrink-0 text-navy-400 xl:block" strokeWidth={2.4} />
        <ArrowDown size={24} className="mx-auto shrink-0 text-navy-400 xl:hidden" strokeWidth={2.4} />

        {/* 자동으로 이어지는 업무 */}
        <div data-tour="core1" className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          {LINKED.map(({ label, to }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="pressable rounded-xl bg-navy-50 px-2 py-3.5 text-center text-[1.02rem] font-bold text-navy-700 transition hover:bg-teal-50 hover:text-teal-700 sm:px-3 sm:text-[1.12rem]"
            >
              <span className="block leading-snug [word-break:keep-all] [overflow-wrap:anywhere]">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
