import { call } from './bizPlanApi'
import type { Decider, DecisionRow, StrategyModel } from './bizStrategy'

// ─────────────────────────────────────────────────────────────────────────────
// 사업화전략 · 3개년 매출 검토 — 서버 호출 (0148)
//
//  누가 무엇을 할 수 있는지는 서버가 정합니다:
//   · 열기 — 사업계획서 참여자
//   · 모델 자료 고치기 · 반영 요청 만들기 — 사업계획 담당
//   · 결정 남기기 — 「검토」 참여자(대표님 · 이사님)
//  반영 요청은 기존 수정요청으로만 남고, 사업계획서 본문은 담당이 요청함에서 반영합니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyRow {
  model: StrategyModel
  rev: number
  assump_rev: number
  updated_at: string
  updated_by: string
}
export interface DecisionLogRow {
  id: number
  key: string
  name: string
  title: string
  choice: string
  custom: unknown
  note: string
  assump_rev: number | null
  basis: Record<string, string> | null
  at: string
}
export interface StepLogRow {
  id: number
  step: string
  assump_rev: number | null
  detail: Record<string, unknown>
  actor_name: string
  at: string
}
export interface RevisionRow {
  id: number
  rev: number
  assump_rev: number
  sections: string[]
  reason: string
  actor_name: string
  at: string
}
export interface StrategyOpen {
  api: number
  me: { id: string; name: string; title: string; role: 'editor' | 'reviewer' | null }
  is_decider: boolean
  deciders: Decider[]
  /** 제출 전 점검(0147)이 보는 접수월 — 작성일 칸, 없으면 이번 달 */
  preflight_month: string
  strategy: StrategyRow | null
  decisions: (DecisionRow & { basis: Record<string, string> })[]
  decision_log: DecisionLogRow[]
  log: StepLogRow[]
  revisions: RevisionRow[]
}

export const strategyOpen = () => call<StrategyOpen>('bizplan_strategy_open', {})

export type SaveModelResult =
  | { ok: true; unchanged?: boolean; rev: number; assump_rev: number; assumption_changed?: boolean; sections?: string[]; stale_decisions?: number }
  | { ok: false; conflict: true; rev: number; assump_rev: number; model: StrategyModel; updated_by: string; updated_at: string }

export const strategySave = (model: StrategyModel, expectedRev: number, reason: string) =>
  call<SaveModelResult>('bizplan_strategy_save', { p_model: model, p_expected_rev: expectedRev, p_reason: reason })

export const decide = (p: { key: string; choice: string; custom: unknown; note: string; assumpRev: number; basis: Record<string, string> }) =>
  call<{ ok: true; agreed: boolean; decision: DecisionRow }>('bizplan_decide', {
    p_key: p.key, p_choice: p.choice, p_custom: p.custom ?? null, p_note: p.note, p_assump_rev: p.assumpRev, p_basis: p.basis,
  })

export interface ProposeItem {
  key: string
  label: string
  req_type: '숫자 변경' | '문장 수정' | '내용 추가'
  body: string
  suggestion: string
  value: unknown
  decisions: string[]
}
export const propose = (assumpRev: number, items: ProposeItem[], note: string) =>
  call<{ ok: true; requests: { key: string; request_id: string }[]; assump_rev: number }>('bizplan_strategy_propose', {
    p_assump_rev: assumpRev, p_items: items, p_note: note,
  })

export interface UsageMonth {
  month: string
  collections: number
  field_inputs: number
  inputters: number
  avg_input_sec: number | null
  timed_inputs: number
  requests_portal: number
  requests_staff: number
  requests_done: number
  supply_orders: number
}
export const usageStats = (months = 12) => call<{ from: string; months: UsageMonth[]; note: string }>('bizplan_usage_stats', { p_months: months })

export const revisionGet = (id: number) =>
  call<{ id: number; rev: number; assump_rev: number; sections: string[]; before_model: StrategyModel | null; after_model: StrategyModel; reason: string; actor_name: string; at: string }>(
    'bizplan_strategy_revision_get', { p_id: id },
  )
