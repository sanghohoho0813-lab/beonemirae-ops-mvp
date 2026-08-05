import { useNavigate } from 'react-router-dom'
import {
  PlusCircle,
  ArrowRight,
  CalendarCheck,
  History,
  Boxes,
  Building2,
  PieChart,
  FileText,
  Receipt,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "한 번 입력, 여러 업무 자동 연결" — 제품의 대표 메시지 시각화
//  현장에서 수거 완료를 1회 입력하면 아래 업무들이 자동으로 이어집니다.
//  각 항목은 실제로 반영되는 화면으로 이동합니다.
// ─────────────────────────────────────────────────────────────────────────────

const LINKED = [
  { label: '오늘 일정 완료', icon: CalendarCheck, to: '/today' },
  { label: '수거이력 생성', icon: History, to: '/history' },
  { label: '거래처 활동 기록', icon: Building2, to: '/clients' },
  { label: '자재 재고 반영', icon: Boxes, to: '/materials' },
  { label: '통계·KPI 갱신', icon: PieChart, to: '/stats' },
  { label: '수거대장 초안', icon: FileText, to: '/reports' },
  { label: '월간 명세 초안', icon: Receipt, to: '/receivables' },
]

export function AutoLinkFlow({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
        {/* 입력 (시작점) */}
        <button
          onClick={() => navigate('/collection')}
          className="pressable flex shrink-0 items-center gap-3 rounded-2xl bg-teal-500 px-5 py-4 text-left text-white shadow-sm transition hover:bg-teal-600"
        >
          <PlusCircle size={26} strokeWidth={2.2} className="shrink-0" />
          <span className="leading-tight">
            <span className="block text-[0.6875rem] font-semibold text-teal-50">현장 직원이</span>
            <span className="block text-[0.9375rem] font-extrabold">수거 완료 1회 입력</span>
          </span>
        </button>

        <ArrowRight size={22} className="hidden shrink-0 text-navy-300 lg:block" strokeWidth={2.4} />

        {/* 자동 연결되는 업무들 */}
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[0.75rem] font-extrabold uppercase tracking-wider text-teal-600 lg:hidden">
            ↓ 자동 연결
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {LINKED.map(({ label, icon: Icon, to }) => (
              <button
                key={label}
                onClick={() => navigate(to)}
                className="pressable flex items-center gap-2 rounded-xl bg-navy-50 px-2.5 py-2.5 text-left transition hover:bg-teal-50"
              >
                <Icon size={15} className="shrink-0 text-teal-600" strokeWidth={2.3} />
                <span className="min-w-0 truncate text-[0.75rem] font-bold text-navy-700">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!compact && (
        <p className="border-t border-navy-100 px-4 py-3 text-xs leading-snug text-navy-400 sm:px-5">
          기존에는 수거 후 일정·대장·자재·명세를 각각 따로 기록했습니다. 지금은 현장에서 한 번만 입력하면 위 업무가
          자동으로 연결되어, 반복 입력과 누락을 줄입니다.
        </p>
      )}
    </div>
  )
}
