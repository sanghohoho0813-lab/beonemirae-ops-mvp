import { useNavigate } from 'react-router-dom'
import { Package, GraduationCap, AlertCircle, ChevronRight, Truck, type LucideIcon } from 'lucide-react'
import type { NextAction, NextActionKind, OpportunitySummary } from '../lib/insights'
import { wonShort } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 이번 달 추가 매출 기회 — 축적된 운영 데이터로 도출한 다음 행동 추천
//  화면에는 "거래처 → 추천 행동 → 근거 1줄 → 실행 버튼"만 남기고,
//  상세 근거 지표는 거래처 상세 화면에서 보여줍니다.
// ─────────────────────────────────────────────────────────────────────────────

export const actionMeta: Record<NextActionKind, { icon: LucideIcon; chip: string; dot: string }> = {
  추가수거: { icon: Truck, chip: 'bg-teal-50 text-teal-700', dot: 'bg-teal-500' },
  소모품공급: { icon: Package, chip: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  배출자교육: { icon: GraduationCap, chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  관리필요: { icon: AlertCircle, chip: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500' },
  정기수거: { icon: Truck, chip: 'bg-navy-100 text-navy-600', dot: 'bg-navy-400' },
}

/** 추천 1건 — 거래처명 / 추천 행동 / 근거 1줄 / 실행 버튼 */
export function ActionRow({ action, onAct }: { action: NextAction; onAct?: () => void }) {
  const navigate = useNavigate()
  const meta = actionMeta[action.kind]
  const Icon = meta.icon
  const act = () => (onAct ? onAct() : navigate(`/clients/${action.clientId}`))

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3.5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}>
          <Icon size={21} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-keep text-[1.0625rem] font-bold leading-snug text-navy-900">{action.clientName}</p>
          <p className="mt-1 break-keep text-[1.125rem] font-extrabold leading-snug text-navy-800">{action.title}</p>
          <p className="mt-1.5 break-keep text-[0.9375rem] leading-snug text-navy-500">
            {action.reason}
            {action.estValue > 0 && (
              <span className="whitespace-nowrap font-bold text-teal-600"> · 예상 +{wonShort(action.estValue)}</span>
            )}
          </p>
        </div>
        <button
          onClick={act}
          className="pressable hidden shrink-0 whitespace-nowrap rounded-xl bg-navy-900 px-4 py-2.5 text-[0.85rem] font-bold text-white transition hover:bg-navy-800 2xl:block"
        >
          {action.cta}
        </button>
      </div>
      <button
        onClick={act}
        className="pressable mt-3 w-full rounded-xl bg-navy-900 px-4 py-3 text-[0.9rem] font-bold text-white transition hover:bg-navy-800 2xl:hidden"
      >
        {action.cta}
      </button>
    </div>
  )
}

/** 대시보드용 추가 매출 기회 카드 — 합계 + 상위 추천 3건 */
export function OpportunityPanel({ summary, limit = 3 }: { summary: OpportunitySummary; limit?: number }) {
  const navigate = useNavigate()
  const top = summary.groups
    .flatMap((g) => g.actions)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      {/* 합계 — 가장 먼저 보여야 할 숫자 */}
      <div className="border-b border-navy-100 px-5 py-5">
        <p className="text-[1rem] font-bold text-navy-500">이번 달 추가 매출 기회</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="break-keep text-[2.25rem] font-extrabold leading-none tracking-tight text-teal-600">
            +{wonShort(summary.totalValue)}
          </p>
          <p className="text-[1.125rem] font-bold text-navy-400">{summary.totalCount}건</p>
        </div>
      </div>

      {/* 상위 추천 */}
      <div className="flex-1 divide-y divide-navy-50">
        {top.length === 0 ? (
          <p className="px-5 py-8 text-center text-[1rem] text-navy-400">
            현재 데이터 기준 추가 매출 기회가 없습니다.
          </p>
        ) : (
          top.map((a, i) => <ActionRow key={`${a.clientId}-${a.kind}-${i}`} action={a} />)
        )}
      </div>

      <button
        onClick={() => navigate('/clients')}
        className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 py-4 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-50"
      >
        전체 보기 <ChevronRight size={18} />
      </button>
      <p className="border-t border-navy-100 px-5 py-3 break-keep text-[0.875rem] leading-snug text-navy-400">
        축적된 수거·자재·청구 데이터로 도출한 추천이며, 금액은 시연용 예상값입니다.
      </p>
    </div>
  )
}
