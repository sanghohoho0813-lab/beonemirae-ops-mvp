import { useState } from 'react'
import { Check, Clock, X, Send, Wallet } from 'lucide-react'
import { useData } from '../context/DataContext'
import type { LeadStage, SalesLead } from '../types'
import type { NextAction } from '../lib/insights'
import { findLead } from '../lib/sales'
import { thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 추천 1건의 영업 진행상태 컨트롤 — 추천 → 제안 → 수락 / 보류 / 미전환
//  · 담당자가 누른 것만 기록됩니다(자동 진행 없음).
//  · 수락 건에만 실제 매출 입력란이 나타나며, 예상 매출과 나란히 구분 표시합니다.
// ─────────────────────────────────────────────────────────────────────────────

export const STAGE_STYLE: Record<LeadStage, string> = {
  추천: 'bg-navy-100 text-navy-500',
  제안: 'bg-sky-50 text-sky-700',
  수락: 'bg-teal-50 text-teal-700',
  보류: 'bg-amber-50 text-amber-700',
  미전환: 'bg-navy-100 text-navy-400',
}

const CHOICES: { stage: LeadStage; label: string; icon: typeof Check }[] = [
  { stage: '제안', label: '고객 제안', icon: Send },
  { stage: '수락', label: '수락', icon: Check },
  { stage: '보류', label: '보류', icon: Clock },
  { stage: '미전환', label: '미전환', icon: X },
]

/** 만원 단위 숫자 → 원. 입력 편의를 위해 만원 단위로 받습니다. */
const toWon = (manwon: string) => Math.round(Number(manwon) * 10000)

function RevenueInput({ lead }: { lead: SalesLead }) {
  const { setLeadRevenue } = useData()
  const [draft, setDraft] = useState(lead.actualRevenue == null ? '' : String(lead.actualRevenue / 10000))

  const save = () => {
    const v = draft.trim()
    setLeadRevenue(lead.id, v === '' ? null : toWon(v))
  }

  return (
    <div className="mt-3 rounded-2xl bg-teal-50/70 p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="t-muted font-bold">예상 매출</p>
          <p className="t-body font-extrabold text-navy-500">
            {lead.estValue > 0 ? `${(lead.estValue / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` : '—'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="t-muted font-bold">실제 매출</p>
          <p className="t-body font-extrabold text-teal-700">
            {lead.actualRevenue == null
              ? '미입력'
              : `${(lead.actualRevenue / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            className="field-input pr-14"
            placeholder="실제 매출 입력"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[0.9rem] font-bold text-navy-400">
            만원
          </span>
        </div>
        <button className="btn-primary shrink-0" onClick={save}>
          <Wallet size={17} strokeWidth={2.4} /> 매출 기록
        </button>
      </div>
      <p className="t-muted mt-2">
        실제 청구·입금된 금액을 입력하세요. 예상 매출은 추천 시점의 참고값이며 실적으로 집계되지 않습니다.
      </p>
    </div>
  )
}

/** 추천 카드 하단에 붙는 영업 진행상태 컨트롤 */
export function LeadStageControl({ action, month = thisMonth() }: { action: NextAction; month?: string }) {
  const { data, setLeadStage } = useData()
  const lead = findLead(data, action, month)
  const stage: LeadStage = lead?.stage ?? '추천'

  return (
    <div className="mt-3 rounded-2xl bg-navy-50/70 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="t-muted font-bold text-navy-500">영업 진행</span>
        <span className={`pill ${STAGE_STYLE[stage]}`}>{stage}</span>
        {lead?.demoSessionId && <span className="pill bg-amber-50 text-amber-700">시연 기록</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {CHOICES.map((c) => {
          const Icon = c.icon
          const active = stage === c.stage
          return (
            <button
              key={c.stage}
              onClick={() => setLeadStage(action, c.stage, month)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[0.9rem] font-bold transition active:scale-[0.97] ${
                active ? 'bg-navy-900 text-white' : 'bg-white text-navy-600 hover:bg-navy-100'
              }`}
            >
              <Icon size={15} strokeWidth={2.6} /> {c.label}
            </button>
          )
        })}
      </div>
      {stage === '수락' && lead && <RevenueInput lead={lead} />}
      {lead && lead.history.length > 1 && (
        <p className="t-muted mt-2.5">
          이력:{' '}
          {lead.history
            .map((h) => `${h.stage}(${h.at.slice(5, 10).replace('-', '/')})`)
            .join(' → ')}
        </p>
      )}
    </div>
  )
}
