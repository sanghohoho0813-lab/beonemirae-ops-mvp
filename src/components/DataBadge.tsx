import { CheckCircle2, FlaskConical, Layers, Minus, type LucideIcon } from 'lucide-react'
import type { EvidenceTier, ProvenanceKind } from '../lib/performance'
import { PROVENANCE_LABEL, TIER_LABEL, TIER_STEPS } from '../lib/performance'

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 출처 / 실증 단계 배지
//
//  심사자가 숫자를 볼 때 "이게 실제 실증값인지 시연값인지" 헷갈리지 않도록
//  성과 카드·매출 전환 카드 어디서나 같은 모양·같은 색으로 표시합니다.
//
//   시연 데이터            앰버 + 플라스크
//   시연 + 실제 현장 데이터  앰버 + 레이어
//   실제 현장 데이터        틸 + 체크
//   데이터 없음            회색 + 대시
// ─────────────────────────────────────────────────────────────────────────────

const PROVENANCE_STYLE: Record<ProvenanceKind, { cls: string; icon: LucideIcon }> = {
  field: { cls: 'bg-teal-50 text-teal-700', icon: CheckCircle2 },
  mixed: { cls: 'bg-amber-50 text-amber-700', icon: Layers },
  demo: { cls: 'bg-amber-100 text-amber-800', icon: FlaskConical },
  none: { cls: 'bg-navy-100 text-navy-500', icon: Minus },
}

/** 데이터 출처 배지 — 숫자 옆에 항상 붙여 시연값 오해를 막습니다. */
export function ProvenanceBadge({
  kind,
  compact = false,
  className = '',
}: {
  kind: ProvenanceKind
  /** 좁은 카드에서는 짧은 라벨을 씁니다 */
  compact?: boolean
  className?: string
}) {
  // 데이터 자체가 없는 칸에 '없음' 배지를 또 붙이면 소음이 됩니다.
  // 값이 '측정 중'으로 이미 표시되므로 배지는 생략합니다.
  if (kind === 'none' && compact) return null
  const { cls, icon: Icon } = PROVENANCE_STYLE[kind]
  const label = compact
    ? { field: '현장', mixed: '시연+현장', demo: '시연', none: '없음' }[kind]
    : PROVENANCE_LABEL[kind]
  return (
    <span className={`pill ${cls} ${className}`}>
      <Icon size={13} strokeWidth={2.8} />
      {label}
    </span>
  )
}

// 단계가 올라갈수록 색이 확정 쪽으로 이동합니다 (회색 → 앰버 → 블루 → 그린).
const TIER_STYLE: Record<EvidenceTier, string> = {
  none: 'bg-navy-100 text-navy-500',
  initial: 'bg-amber-50 text-amber-700',
  accumulating: 'bg-teal-50 text-teal-700',
  field: 'bg-emerald-50 text-emerald-700',
}

/** 실증 단계 배지 — 실제 현장 표본 수에 따라 자동으로 바뀝니다. */
export function TierBadge({ tier, className = '' }: { tier: EvidenceTier; className?: string }) {
  return <span className={`pill ${TIER_STYLE[tier]} ${className}`}>{TIER_LABEL[tier]}</span>
}

/**
 * 실증 단계 진행 표시 — 현장 데이터가 쌓일수록 화면 상태가 바뀌는 것을 보여줍니다.
 * 표본이 적은데 확정 성과처럼 보이지 않도록, 현재 위치를 명시합니다.
 */
export function TierProgress({
  tier,
  fieldCount,
  remaining,
  nextAt,
  desc,
}: {
  tier: EvidenceTier
  fieldCount: number
  remaining: number | null
  nextAt: number | null
  desc: string
}) {
  const idx = TIER_STEPS.findIndex((s) => s.tier === tier)
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="t-card text-navy-900">실증 단계</p>
        <TierBadge tier={tier} />
        <p className="t-body ml-auto font-bold text-navy-500">
          실제 현장 수거 입력 <span className="font-extrabold text-navy-900">{fieldCount}건</span>
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {TIER_STEPS.map((s, i) => {
          const done = i <= idx
          return (
            <div
              key={s.tier}
              className={`rounded-2xl px-4 py-3 transition ${
                i === idx ? 'bg-navy-900 text-white' : done ? 'bg-navy-50 text-navy-600' : 'bg-navy-50/60 text-navy-400'
              }`}
            >
              <p className="t-body break-keep font-extrabold">{TIER_LABEL[s.tier]}</p>
              <p className={`t-muted mt-0.5 ${i === idx ? 'text-navy-200' : ''}`}>{s.range}</p>
            </div>
          )
        })}
      </div>

      <p className="t-body mt-4 break-keep font-bold text-navy-500">
        {desc}
        {remaining != null && nextAt != null && remaining > 0 && (
          <span className="ml-1 text-navy-400">
            · 다음 단계까지 {remaining}건 남음 (현장 {nextAt}건)
          </span>
        )}
      </p>
    </div>
  )
}
