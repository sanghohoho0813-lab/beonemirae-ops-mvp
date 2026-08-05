import type { AppData, LeadStage, SalesLead } from '../types'
import { allNextActions, type NextAction, type NextActionKind } from './insights'
import { thisMonth } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 매출 전환 실증
//
//  "데이터 기반 추천 → 실제 제안 → 수락 → 실제 매출" 흐름을 집계합니다.
//
//  원칙
//   1) 추천 건수는 현재 추천 로직(nextActionsFor)이 산출한 실제 건수입니다.
//   2) 제안·수락·보류·미전환은 담당자가 기록한 것만 셉니다(자동 진행 없음).
//   3) 예상 매출과 실제 매출은 끝까지 분리합니다. 실제 매출은 수락 건에 직접
//      입력된 값만 합산하며, 미입력(null)은 0원으로 취급하지 않고 '미입력'입니다.
//   4) 제안 표본이 적으면 전환율을 만들지 않고 '실증 중'으로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 전환율을 표시하기 위한 최소 제안 건수 — 1~2건으로 100%를 만들지 않기 위함 */
export const MIN_PROPOSALS_FOR_RATE = 3

/** 심사 설명용 추천 유형 4종 (관리필요 → '운영관리') */
export const LEAD_KINDS: { kind: NextActionKind; label: string }[] = [
  { kind: '추가수거', label: '추가 수거' },
  { kind: '소모품공급', label: '소모품 공급' },
  { kind: '배출자교육', label: '배출자 교육' },
  { kind: '관리필요', label: '운영관리' },
]

export const LEAD_KIND_LABEL: Record<string, string> = Object.fromEntries(
  LEAD_KINDS.map((k) => [k.kind, k.label]),
)

/** 추천 1건의 안정 식별 키. 추천은 매달 재산출되므로 월 단위로 구분합니다. */
export function leadKey(clientId: string, kind: string, month: string): string {
  return `${clientId}::${kind}::${month}`
}

export function leadKeyOf(action: NextAction, month = thisMonth()): string {
  return leadKey(action.clientId, action.kind, month)
}

/** 이 추천에 기록된 영업 진행상태 (없으면 undefined = 아직 '추천' 단계) */
export function findLead(data: AppData, action: NextAction, month = thisMonth()): SalesLead | undefined {
  const key = leadKeyOf(action, month)
  return (data.leads ?? []).find((l) => l.key === key)
}

/** 이 추천의 현재 단계 (기록이 없으면 '추천') */
export function stageOf(data: AppData, action: NextAction, month = thisMonth()): LeadStage {
  return findLead(data, action, month)?.stage ?? '추천'
}

/** 이력에 해당 단계가 한 번이라도 기록되었는지 */
export function reached(lead: SalesLead, stage: LeadStage): boolean {
  return lead.stage === stage || lead.history.some((h) => h.stage === stage)
}

/** '제안까지 갔는가' — 수락은 제안을 거친 것으로 봅니다. */
export function wasProposed(lead: SalesLead): boolean {
  return reached(lead, '제안') || reached(lead, '수락')
}

// ── 유형별 집계 ──────────────────────────────────────────────────────────────
export interface KindFunnel {
  kind: NextActionKind
  label: string
  recommended: number
  proposed: number
  accepted: number
  /** 예상 매출 합계 (추천 시점 값) */
  estValue: number
  /** 실제 매출 합계 — 입력된 값만 */
  actualRevenue: number
  /** 실제 매출이 입력된 수락 건 수 */
  revenueEntered: number
}

export interface SalesFunnel {
  month: string
  /** 이번 달 추천 건수 (추천 로직 산출) */
  recommended: number
  /** 실제 제안 건수 (담당자 기록) */
  proposed: number
  accepted: number
  held: number // 보류
  lost: number // 미전환
  /** 제안 → 수락 전환율(%) — 표본 부족 시 null */
  conversionPct: number | null
  /** 실제 추가 매출 합계 (입력된 값만) */
  actualRevenue: number
  /** 수락 건 중 실제 매출이 아직 입력되지 않은 건수 */
  revenuePending: number
  /** 수락 건의 예상 매출 합계 (실제 매출과 구분해 표시) */
  acceptedEstValue: number
  byKind: KindFunnel[]
  /** 시연 세션 중 기록된 건이 포함되어 있는지 */
  hasDemoRecords: boolean
  /** 표본이 충분한지 — false 면 화면에서 '실증 중'으로 표시 */
  rateReady: boolean
  leads: SalesLead[]
}

/**
 * 이번 달 추천 + 기록된 영업 진행상태를 합쳐 퍼널을 만듭니다.
 * 추천은 매달 재산출되므로 해당 월 키를 가진 lead 만 집계 대상입니다.
 */
export function salesFunnel(data: AppData, month = thisMonth()): SalesFunnel {
  const actions = allNextActions(data, month)
  const leads = (data.leads ?? []).filter((l) => l.month === month)

  const byKind: KindFunnel[] = LEAD_KINDS.map(({ kind, label }) => {
    const acts = actions.filter((a) => a.kind === kind)
    const ls = leads.filter((l) => l.kind === kind)
    const accepted = ls.filter((l) => l.stage === '수락')
    return {
      kind,
      label,
      recommended: acts.length,
      proposed: ls.filter(wasProposed).length,
      accepted: accepted.length,
      estValue: acts.reduce((s, a) => s + a.estValue, 0),
      actualRevenue: accepted.reduce((s, l) => s + (l.actualRevenue ?? 0), 0),
      revenueEntered: accepted.filter((l) => l.actualRevenue != null).length,
    }
  })

  const accepted = leads.filter((l) => l.stage === '수락')
  const proposed = leads.filter(wasProposed).length
  const conversionPct =
    proposed >= MIN_PROPOSALS_FOR_RATE ? Math.round((accepted.length / proposed) * 1000) / 10 : null

  return {
    month,
    recommended: actions.length,
    proposed,
    accepted: accepted.length,
    held: leads.filter((l) => l.stage === '보류').length,
    lost: leads.filter((l) => l.stage === '미전환').length,
    conversionPct,
    actualRevenue: accepted.reduce((s, l) => s + (l.actualRevenue ?? 0), 0),
    revenuePending: accepted.filter((l) => l.actualRevenue == null).length,
    acceptedEstValue: accepted.reduce((s, l) => s + l.estValue, 0),
    byKind,
    hasDemoRecords: leads.some((l) => !!l.demoSessionId),
    rateReady: proposed >= MIN_PROPOSALS_FOR_RATE,
    leads,
  }
}

/** 특정 거래처의 영업 전환 이력 (최신순) */
export function leadsOfClient(data: AppData, clientId: string): SalesLead[] {
  return (data.leads ?? [])
    .filter((l) => l.clientId === clientId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
