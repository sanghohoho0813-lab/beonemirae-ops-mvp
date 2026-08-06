import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { AppData } from '../types'
import { LEAD_KIND_LABEL, MIN_PROPOSALS_FOR_RATE, salesFunnel, type SalesFunnel } from '../lib/sales'
import { ProvenanceBadge } from './DataBadge'
import { thisMonth } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 매출 전환 현황 — 추천 → 제안 → 수락 → 실제 매출
//  · 추천 건수는 추천 로직 산출값, 나머지는 담당자가 기록한 값만 집계합니다.
//  · 예상 매출과 실제 매출을 분리해 표시하고, 표본이 적으면 전환율을 만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const won = (v: number) => `${v.toLocaleString('ko-KR')}원`

/** 퍼널 4단계 숫자 줄 */
function FunnelRow({ f }: { f: SalesFunnel }) {
  const steps = [
    { label: '추천 발생', value: `${f.recommended}건`, tone: 'text-navy-900' },
    { label: '실제 제안', value: `${f.proposed}건`, tone: 'text-navy-900' },
    { label: '수락', value: `${f.accepted}건`, tone: 'text-navy-900' },
    {
      label: '실제 추가매출',
      value: f.accepted === 0 ? '—' : f.revenuePending === f.accepted ? '미입력' : won(f.actualRevenue),
      tone: 'text-teal-600',
    },
  ]
  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex min-w-0 items-end gap-2">
          {i > 0 && <ArrowRight size={20} className="mb-2 shrink-0 text-navy-300" strokeWidth={2.6} />}
          <div className="min-w-0">
            <p className="t-muted font-bold">{s.label}</p>
            <p className={`t-kpi-sm mt-0.5 break-keep ${s.tone}`}>{s.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 전환율 — 표본이 적으면 숫자를 만들지 않습니다.
 * 계산되더라도 실제 현장 제안이 부족하면 강조하지 않고 '참고값'으로 둡니다.
 */
function ConversionLine({ f }: { f: SalesFunnel }) {
  if (f.conversionPct == null) {
    return (
      <p className="t-body font-bold text-navy-400">
        전환율 실증 중 — 제안 {f.proposed}건 (전환율은 {MIN_PROPOSALS_FOR_RATE}건 이상부터 산출)
      </p>
    )
  }
  // 실제 현장 제안이 기준을 넘을 때만 색으로 강조합니다.
  const confirmed = f.fieldProposed >= MIN_PROPOSALS_FOR_RATE
  return (
    <div>
      <p className={`t-body font-extrabold ${confirmed ? 'text-navy-900' : 'text-navy-500'}`}>
        제안 → 수락 전환율{' '}
        <span className={confirmed ? 'text-teal-600' : 'text-navy-500'}>{f.conversionPct}%</span>
        <span className="ml-1.5 font-bold text-navy-400">
          (제안 {f.proposed}건 중 수락 {f.accepted}건)
        </span>
      </p>
      {!confirmed && (
        <p className="t-muted mt-1 break-keep font-bold text-navy-400">
          시연 기록이 포함된 참고값입니다 — 실제 현장 제안 {f.fieldProposed}건 ·{' '}
          {MIN_PROPOSALS_FOR_RATE}건 이상부터 실증 전환율로 표시합니다
        </p>
      )}
    </div>
  )
}

/** AX 성과 페이지용 전체 패널 — 유형별 실적 포함 */
export function SalesFunnelPanel({ data, month = thisMonth() }: { data: AppData; month?: string }) {
  // 심사자가 '실제 현장에서 기록된 영업 성과'만 따로 볼 수 있게 합니다.
  const [fieldOnly, setFieldOnly] = useState(false)
  const f = salesFunnel(data, month, { fieldOnly })
  const anyRecord = f.proposed + f.accepted + f.held + f.lost > 0

  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        {/* 데이터 출처 표시 + 실제 현장만 보기 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-navy-50 pb-4">
          <ProvenanceBadge kind={fieldOnly ? 'field' : f.provenance} />
          <p className="t-muted min-w-0 break-keep font-bold text-navy-500">
            실제 현장 제안 {f.fieldProposed}건 · 수락 {f.fieldAccepted}건 / 시연 제안 {f.demoProposed}건 ·
            수락 {f.demoAccepted}건
          </p>
          <button
            onClick={() => setFieldOnly((v) => !v)}
            className={`ml-auto shrink-0 rounded-full px-3.5 py-2 text-[0.87rem] font-extrabold transition ${
              fieldOnly ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
            }`}
          >
            실제 현장 데이터만 보기
          </button>
        </div>
        <FunnelRow f={f} />
        <div className="mt-4 space-y-2">
          <ConversionLine f={f} />
          {/* 예상 매출과 실제 매출을 반드시 분리해 표시 */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <p className="t-body text-navy-500">
              수락 건 예상 매출{' '}
              <span className="font-bold text-navy-600">{f.acceptedEstValue > 0 ? won(f.acceptedEstValue) : '—'}</span>
              <span className="t-muted ml-1">(추천 시점 참고값)</span>
            </p>
            <p className="t-body text-navy-500">
              실제 입력된 매출{' '}
              <span className="font-extrabold text-teal-600">
                {f.accepted === 0 ? '—' : f.revenuePending === f.accepted ? '미입력' : won(f.actualRevenue)}
              </span>
              {f.revenuePending > 0 && <span className="t-muted ml-1">· 매출 미입력 {f.revenuePending}건</span>}
            </p>
          </div>
        </div>
        <p className="t-muted mt-4 break-keep">
          [추천 로직 산출] 추천 발생 건수 · [담당자 기록] 제안·수락·보류·미전환 · [담당자 입력] 실제 매출.
          전환율은 기록된 제안/수락만으로 계산하며 임의의 성공률을 만들지 않습니다. 추천 건수는 추천 로직이
          산출하는 값이라 시연/현장 구분 대상이 아니며 「실제 현장 데이터만 보기」에서도 동일합니다.
          {fieldOnly
            ? ' 현재 시연 세션 중 기록된 영업건은 제외하고 집계 중입니다.'
            : f.hasDemoRecords
              ? ' 이 기간에는 시연 세션 중 기록된 건이 포함되어 있습니다.'
              : ''}
        </p>
      </div>

      {/* 유형별 추천 → 전환 실적 */}
      <div className="card overflow-hidden">
        <div className="border-b border-navy-100 px-5 py-4">
          <p className="t-card text-navy-900">추천 유형별 전환 실적</p>
        </div>
        <div className="divide-y divide-navy-50">
          {f.byKind.map((k) => (
            <div key={k.kind} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
              <span className="pill min-w-[6.5rem] justify-center bg-navy-50 text-navy-600">{k.label}</span>
              <span className="t-body text-navy-500">
                추천 <span className="font-extrabold text-navy-900">{k.recommended}건</span>
              </span>
              <span className="t-body text-navy-500">
                제안 <span className="font-extrabold text-navy-900">{k.proposed}건</span>
              </span>
              <span className="t-body text-navy-500">
                수락 <span className="font-extrabold text-navy-900">{k.accepted}건</span>
              </span>
              <span className="t-body ml-auto text-navy-500">
                실제 매출{' '}
                <span className={`font-extrabold ${k.revenueEntered === 0 ? 'text-navy-400' : 'text-teal-600'}`}>
                  {k.accepted === 0 ? '—' : k.revenueEntered === 0 ? '미입력' : won(k.actualRevenue)}
                </span>
              </span>
            </div>
          ))}
        </div>
        {!anyRecord && (
          <p className="t-body border-t border-navy-100 px-5 py-4 text-navy-400">
            아직 기록된 영업 진행이 없습니다. 거래처 상세의 「다음 행동 추천」에서 고객 제안·수락을 기록하면 실적이
            집계됩니다.
          </p>
        )}
      </div>
    </div>
  )
}

export { LEAD_KIND_LABEL }
