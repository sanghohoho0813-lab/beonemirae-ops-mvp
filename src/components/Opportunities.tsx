import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  Package,
  GraduationCap,
  AlertCircle,
  ChevronRight,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { NextAction, NextActionKind, OpportunitySummary } from '../lib/insights'
import { wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 이번 달 추가 매출 기회 — 축적된 운영 데이터로 도출한 다음 행동 추천
//  · 추천은 규칙 기반이며, 판단 근거(reason)를 항상 함께 보여줍니다.
//  · 금액은 실제 청구 데이터에서 산출한 단가 × 예상 수량으로 계산한 '기회' 값입니다.
// ─────────────────────────────────────────────────────────────────────────────

export const actionMeta: Record<NextActionKind, { icon: LucideIcon; chip: string; dot: string }> = {
  추가수거: { icon: Truck, chip: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  소모품공급: { icon: Package, chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  배출자교육: { icon: GraduationCap, chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  관리필요: { icon: AlertCircle, chip: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500' },
  정기수거: { icon: Truck, chip: 'bg-navy-100 text-navy-600', dot: 'bg-navy-400' },
}

/** 추천 1건 행 — 병원명 + 근거 + 실행 버튼 */
export function ActionRow({ action, onAct }: { action: NextAction; onAct?: () => void }) {
  const navigate = useNavigate()
  const meta = actionMeta[action.kind]
  const Icon = meta.icon
  return (
    <div className="rounded-2xl px-3 py-2.5 transition hover:bg-navy-50">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}>
          <Icon size={17} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <p className="min-w-0 break-keep text-[0.875rem] font-bold leading-snug text-navy-900">
              {action.clientName}
            </p>
            <span className={`pill ${meta.chip}`}>{action.kind}</span>
            {action.estValue > 0 && (
              <span className="whitespace-nowrap text-[0.8125rem] font-extrabold text-teal-600">
                +{wonShort(action.estValue)}
              </span>
            )}
          </div>
          <p className="mt-0.5 break-keep text-[0.75rem] leading-snug text-navy-500">{action.reason}</p>
        </div>
        {/* 데스크톱: 우측 정렬 버튼 */}
        <button
          onClick={() => (onAct ? onAct() : navigate(`/clients/${action.clientId}`))}
          className="pressable hidden shrink-0 whitespace-nowrap rounded-xl bg-navy-900 px-3 py-2 text-[0.75rem] font-bold text-white transition hover:bg-navy-800 sm:block"
        >
          {action.cta}
        </button>
      </div>
      {/* 모바일: 아래 전체폭 버튼 */}
      <button
        onClick={() => (onAct ? onAct() : navigate(`/clients/${action.clientId}`))}
        className="pressable mt-2 w-full rounded-xl bg-navy-900 px-3 py-2 text-[0.75rem] font-bold text-white transition hover:bg-navy-800 sm:hidden"
      >
        {action.cta}
      </button>
    </div>
  )
}

export function OpportunityPanel({ summary, limit = 5 }: { summary: OpportunitySummary; limit?: number }) {
  const navigate = useNavigate()
  const top = summary.groups.flatMap((g) => g.actions).sort((a, b) => b.priority - a.priority).slice(0, limit)

  return (
    <div className="card overflow-hidden">
      {/* 합계 */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-navy-100 px-4 py-4 sm:px-5">
        <div>
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-navy-400">
            <TrendingUp size={14} className="text-teal-600" /> 데이터 기반 추천 · 이번 달
          </p>
          <p className="mt-1 text-[1.625rem] font-extrabold leading-none tracking-tight text-navy-900">
            +{wonShort(summary.totalValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.8125rem] font-semibold text-navy-400">추천 건수</p>
          <p className="mt-1 text-lg font-extrabold text-navy-900">
            {summary.totalCount}
            <span className="ml-0.5 text-sm font-bold text-navy-400">건</span>
          </p>
        </div>
      </div>

      {/* 유형별 집계 */}
      <div className="grid grid-cols-3 divide-x divide-navy-100 border-b border-navy-100">
        {summary.groups.map((g) => {
          const meta = actionMeta[g.kind]
          const Icon = meta.icon
          return (
            <div key={g.kind} className="px-3 py-3 text-center">
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl ${meta.chip}`}>
                <Icon size={16} strokeWidth={2.3} />
              </span>
              <p className="mt-1.5 truncate text-[0.6875rem] font-semibold text-navy-400">{g.label}</p>
              <p className="mt-0.5 text-[0.9375rem] font-extrabold text-navy-900">
                {g.count}
                <span className="text-[0.75rem] font-bold text-navy-400">건</span>
              </p>
              <p className="truncate text-[0.6875rem] font-bold text-teal-600">+{wonShort(g.estValue)}</p>
            </div>
          )
        })}
      </div>

      {/* 상위 추천 */}
      <div className="space-y-0.5 p-2">
        {top.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-navy-400">
            현재 데이터 기준으로 도출된 추가 매출 기회가 없습니다.
          </p>
        ) : (
          top.map((a, i) => <ActionRow key={`${a.clientId}-${a.kind}-${i}`} action={a} />)
        )}
      </div>

      <button
        onClick={() => navigate('/clients')}
        className="flex w-full items-center justify-center gap-1 border-t border-navy-100 py-3 text-[0.8125rem] font-bold text-navy-500 transition hover:bg-navy-50"
      >
        전체 거래처 추천 보기 <ChevronRight size={15} />
      </button>
    </div>
  )
}
