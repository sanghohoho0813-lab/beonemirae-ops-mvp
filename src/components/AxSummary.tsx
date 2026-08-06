import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Zap } from 'lucide-react'
import type { AppData } from '../types'
import { axHighlights, autoPerInput, provenanceOf } from '../lib/performance'
import { salesFunnel } from '../lib/sales'

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 상단 'AX 성과 요약' — 정책자금 심사자가 5초 안에 이해하도록
//
//   업무 자동화 → 데이터 축적 → 추천 → 실제 제안 → 수락 → 추가 매출
//
//  · 숫자는 크게, 설명은 짧게. 근거가 없으면 '실증 중'으로 두고 만들지 않습니다.
//  · 예상 매출은 이 카드에 넣지 않습니다(실제 매출과 섞이지 않도록).
// ─────────────────────────────────────────────────────────────────────────────

const PROVENANCE_STYLE: Record<string, string> = {
  field: 'bg-teal-50 text-teal-700',
  mixed: 'bg-amber-50 text-amber-700',
  demo: 'bg-amber-50 text-amber-700',
  none: 'bg-navy-100 text-navy-500',
}

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

  const revenueText =
    f.accepted === 0 ? '—' : f.revenuePending === f.accepted ? '미입력' : won(f.actualRevenue)

  return (
    <section className="card overflow-hidden">
      {/* 헤더 — 심사용 한 줄 설명 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-navy-900 px-5 py-4 sm:px-6">
        <Zap size={20} className="shrink-0 text-teal-300" strokeWidth={2.6} />
        <p className="t-card w-full min-w-0 break-keep text-white sm:w-auto sm:flex-1">
          현장 업무를 자동화하고, 축적된 병원 데이터로 추가 수거·소모품·교육 기회를 발굴해 실제 매출 전환까지
          추적합니다
        </p>
        <span className={`pill shrink-0 ${PROVENANCE_STYLE[prov.kind]}`}>{prov.label}</span>
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
        <p className="t-body mt-3 font-bold text-navy-500">
          {f.conversionPct != null ? (
            <>
              제안 → 수락 전환율 <span className="text-teal-600">{f.conversionPct}%</span>
              <span className="ml-1.5 font-medium text-navy-400">
                · 실제 매출만 집계 (예상 매출 제외)
              </span>
            </>
          ) : (
            <span className="text-navy-400">전환율 실증 중 — 기록된 제안 {f.proposed}건 (3건 이상부터 산출)</span>
          )}
        </p>
      </div>

      {/* 2) 운영효율 대표 지표 — 한 줄 압축 */}
      <div className="mt-5 grid gap-px bg-navy-100 sm:grid-cols-2 xl:grid-cols-4">
        {hi.map((h) => (
          <div key={h.key} className="bg-white px-5 py-4">
            <p className="t-muted font-bold">{h.label}</p>
            <p className="t-kpi-sm mt-1 break-keep text-navy-900">
              <span className="text-navy-400">{h.before}</span>
              <span className="mx-1.5 text-navy-300">→</span>
              <span className={h.measuring ? 'text-navy-400' : 'text-teal-600'}>{h.after}</span>
            </p>
            <p className={`t-muted mt-1 font-bold ${h.measuring ? 'text-navy-400' : 'text-teal-600'}`}>
              {h.changeText}
            </p>
          </div>
        ))}
        <div className="bg-white px-5 py-4">
          <p className="t-muted font-bold">자동 처리</p>
          <p className="t-kpi-sm mt-1 break-keep text-navy-900">
            {auto.avg == null ? <span className="text-navy-400">측정 중</span> : <>1건 입력 → {auto.avg}건</>}
          </p>
          <p className="t-muted mt-1 font-bold text-navy-500">
            {auto.avg == null ? '수거 입력 없음' : `수거 ${auto.count}건 · 자동 ${auto.total}건`}
          </p>
        </div>
      </div>

      <Link
        to="/performance"
        className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 py-4 text-[1rem] font-bold text-navy-600 transition hover:bg-navy-50"
      >
        AX 도입 성과 자세히 보기 <ChevronRight size={18} />
      </Link>
    </section>
  )
}
