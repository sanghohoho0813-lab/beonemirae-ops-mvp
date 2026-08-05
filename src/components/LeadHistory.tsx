import { ArrowRight } from 'lucide-react'
import type { AppData } from '../types'
import { LEAD_KIND_LABEL, leadsOfClient } from '../lib/sales'
import { STAGE_STYLE } from './LeadStage'

// ─────────────────────────────────────────────────────────────────────────────
// 거래처별 영업 전환 이력 — 추천 → 제안 → 수락 → 실제 매출을 한 줄로.
//  간단한 이력 표시만 하고 CRM 기능은 만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const won = (v: number) => `${(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원`

export function ClientLeadHistory({ data, clientId }: { data: AppData; clientId: string }) {
  const leads = leadsOfClient(data, clientId)
  if (leads.length === 0) {
    return (
      <div className="card p-5">
        <p className="t-body text-navy-400">
          아직 기록된 영업 진행이 없습니다. 위 「다음 행동 추천」에서 고객 제안·수락을 기록하면 여기에 쌓입니다.
        </p>
      </div>
    )
  }

  const accepted = leads.filter((l) => l.stage === '수락')
  const actualTotal = accepted.reduce((s, l) => s + (l.actualRevenue ?? 0), 0)
  const entered = accepted.filter((l) => l.actualRevenue != null).length

  return (
    <div className="card overflow-hidden">
      {/* 합계 — 예상과 실제를 나란히 (혼동 방지) */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-navy-100 px-5 py-4">
        <div>
          <p className="t-muted font-bold">기록된 추천</p>
          <p className="t-kpi-sm mt-0.5 text-navy-900">{leads.length}건</p>
        </div>
        <div>
          <p className="t-muted font-bold">수락</p>
          <p className="t-kpi-sm mt-0.5 text-navy-900">{accepted.length}건</p>
        </div>
        <div>
          <p className="t-muted font-bold">실제 추가매출</p>
          <p className="t-kpi-sm mt-0.5 text-teal-600">
            {entered === 0 ? '미입력' : won(actualTotal)}
          </p>
        </div>
      </div>

      <div className="divide-y divide-navy-50">
        {leads.map((l) => (
          <div key={l.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-navy-50 text-navy-600">{LEAD_KIND_LABEL[l.kind] ?? l.kind}</span>
              <p className="t-body min-w-0 break-keep font-bold text-navy-900">{l.title}</p>
              <span className={`pill ${STAGE_STYLE[l.stage]}`}>{l.stage}</span>
              {l.demoSessionId && <span className="pill bg-amber-50 text-amber-700">시연 기록</span>}
              <span className="t-muted ml-auto whitespace-nowrap">{l.month}</span>
            </div>

            {/* 진행 흐름 */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {l.history.map((h, i) => (
                <span key={`${h.stage}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRight size={14} className="text-navy-300" strokeWidth={2.6} />}
                  <span className="t-muted font-bold text-navy-600">
                    {h.stage}
                    <span className="ml-1 font-medium text-navy-400">{h.at.slice(5, 10).replace('-', '/')}</span>
                  </span>
                </span>
              ))}
            </div>

            {/* 예상 vs 실제 */}
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="t-muted">
                예상 매출 <span className="font-bold text-navy-500">{l.estValue > 0 ? won(l.estValue) : '—'}</span>
              </span>
              <span className="t-muted">
                실제 매출{' '}
                <span className={`font-extrabold ${l.actualRevenue == null ? 'text-navy-400' : 'text-teal-600'}`}>
                  {l.actualRevenue == null ? (l.stage === '수락' ? '미입력' : '—') : won(l.actualRevenue)}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
