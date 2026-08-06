import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Zap } from 'lucide-react'
import type { AppData } from '../types'
import { axHighlights, autoPerInput, evidenceStatus, provenanceOf } from '../lib/performance'
import { MIN_PROPOSALS_FOR_RATE, salesFunnel } from '../lib/sales'
import { ProvenanceBadge, TierBadge } from './DataBadge'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 상단 'AX 성과 요약' — 정책자금 심사자가 5초 안에 이해하도록
//
//   업무 자동화 → 데이터 축적 → 추천 → 실제 제안 → 수락 → 추가 매출
//
//  · 숫자는 크게, 설명은 짧게. 근거가 없으면 '실증 중'으로 두고 만들지 않습니다.
//  · 예상 매출은 이 카드에 넣지 않습니다(실제 매출과 섞이지 않도록).
// ─────────────────────────────────────────────────────────────────────────────

const won = (v: number) => `${v.toLocaleString('ko-KR')}원`

/** 퍼널 한 칸 */
function Step({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="t-muted font-bold">{label}</p>
      <p className={`t-kpi mt-1 break-keep ${accent ? 'text-teal-600' : 'text-navy-900'}`}>{value}</p>
    </div>
  )
}

export function AxSummaryCard({ data }: { data: AppData }) {
  const f = salesFunnel(data)
  const hi = axHighlights(data)
  const auto = autoPerInput(data)
  const prov = provenanceOf(data)
  const ev = evidenceStatus(data)

  const revenueText =
    f.accepted === 0 ? '—' : f.revenuePending === f.accepted ? '미입력' : won(f.actualRevenue)

  return (
    <section className="card overflow-hidden">
      {/* 헤더 — 심사용 한 줄 설명 + 데이터 출처·실증 단계 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-navy-900 px-5 py-4 sm:px-6">
        <Zap size={20} className="shrink-0 text-teal-300" strokeWidth={2.6} />
        <p className="t-card w-full min-w-0 break-keep text-white sm:w-auto sm:flex-1">
          현장 업무를 자동화하고, 축적된 병원 데이터로 추가 수거·소모품·교육 기회를 발굴해 실제 매출 전환까지
          추적합니다
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge kind={prov.kind} />
          <TierBadge tier={ev.tier} />
        </div>
      </div>

      {/* 1) 매출 전환 퍼널 — 가장 크게 */}
      <div className="px-5 pb-1 pt-5 sm:px-6">
        <p className="t-label text-navy-500">데이터 기반 추천 → 실제 매출 전환</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-4">
          {[
            { label: '추천 발생', value: `${f.recommended}건`, accent: false },
            { label: '실제 제안', value: `${f.proposed}건`, accent: false },
            { label: '수락', value: `${f.accepted}건`, accent: false },
            { label: '실제 추가매출', value: revenueText, accent: true },
          ].map((s, i) => (
            <div key={s.label} className="flex min-w-0 items-end gap-2">
              {i > 0 && <ArrowRight size={26} className="mb-3 shrink-0 text-navy-300" strokeWidth={2.8} />}
              <Step label={s.label} value={s.value} accent={s.accent} />
            </div>
          ))}
        </div>
        {/* 전환율 — 실제 현장 제안이 충분할 때만 숫자를 강조합니다. */}
        <p className="t-body mt-3 font-bold text-navy-500">
          {f.conversionPct == null ? (
            <span className="text-navy-400">전환율 실증 중 — 기록된 제안 {f.proposed}건 (3건 이상부터 산출)</span>
          ) : f.fieldProposed >= MIN_PROPOSALS_FOR_RATE ? (
            <>
              제안 → 수락 전환율 <span className="text-teal-600">{f.conversionPct}%</span>
              <span className="ml-1.5 font-medium text-navy-400">· 실제 매출만 집계 (예상 매출 제외)</span>
            </>
          ) : (
            <span className="text-navy-400">
              제안 → 수락 전환율 {f.conversionPct}% · 시연 기록 포함 참고값 (실제 현장 제안{' '}
              {f.fieldProposed}건 · {MIN_PROPOSALS_FOR_RATE}건 이상부터 실증값)
            </span>
          )}
        </p>
      </div>

      {/* 2) 운영효율 대표 지표 — 한 줄 압축.
             개선율은 실제 현장 표본이 충분한 지표(emphasis)만 색으로 강조합니다. */}
      <div className="mt-5 grid gap-px bg-navy-100 sm:grid-cols-2 xl:grid-cols-4">
        {hi.map((h) => (
          <div key={h.key} className="flex flex-col bg-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="t-muted min-w-0 break-keep font-bold">{h.label}</p>
              <ProvenanceBadge kind={h.provenance} compact />
            </div>
            <p className="t-kpi-sm mt-1 break-keep text-navy-900">
              <span className="text-navy-400">{h.before}</span>
              <span className="mx-1.5 text-navy-300">→</span>
              {/* '측정 중' 같은 상태 문구는 숫자보다 작게 — 좁은 칸에서 줄바꿈되지 않도록 */}
              <span
                className={`${h.measuring ? 'text-[0.6em] text-navy-400' : h.emphasis ? 'text-teal-600' : 'text-navy-900'}`}
              >
                {h.after}
              </span>
            </p>
            <p
              className={`t-muted mt-auto break-keep pt-1 font-bold ${
                h.emphasis ? 'text-teal-600' : 'text-navy-400'
              }`}
            >
              {h.changeText}
            </p>
          </div>
        ))}
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="t-muted min-w-0 break-keep font-bold">자동 처리</p>
            <ProvenanceBadge kind={auto.provenance} compact />
          </div>
          <p className="t-kpi-sm mt-1 break-keep text-navy-900">
            {auto.avg == null ? (
              <span className="text-[0.6em] text-navy-400">측정 중</span>
            ) : (
              <>
                1건 <span className="text-[0.6em] text-navy-400">입력 →</span> {auto.avg}건
              </>
            )}
          </p>
          <p className="t-muted mt-auto break-keep pt-1 font-bold text-navy-500">
            {auto.avg == null
              ? '수거 입력 없음'
              : `수거 ${auto.count}건 (현장 ${auto.fieldCount}건) · 자동 ${auto.total}건`}
          </p>
        </div>
      </div>

      {/* 표본이 부족하면 화면에서 먼저 밝힙니다 — 확정 성과처럼 보이지 않도록 */}
      {ev.tier !== 'field' && (
        <p className="t-muted break-keep border-t border-navy-100 px-5 py-3 text-navy-500 sm:px-6">
          {ev.desc}. 실제 현장 사용 데이터가 쌓일수록 성과지표가 자동 갱신됩니다.
        </p>
      )}

      <Link
        to="/performance"
        className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 py-4 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-50"
      >
        AX 도입 성과 자세히 보기 <ChevronRight size={18} />
      </Link>
    </section>
  )
}
