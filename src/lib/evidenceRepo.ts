import { supabase } from './supabase'
import type { AiCallRecord, CoachMissionRow, DayCloseRecord, DispatchDecision, RecommendationView } from '../types'
import type { OpsChange, OpsChangeKind, OpsChangeStatus } from './opsChanges'
import type { AfterSurvey } from './performance'

// ─────────────────────────────────────────────────────────────────────────────
// 0106 실증 기록 — 읽고 쓰는 함수
//
//  전부 판 106 의 표를 씁니다. 화면은 useSchemaAtLeast(106) 으로 먼저 가리고,
//  여기서는 표가 없으면 그대로 오류를 던집니다 (조용히 빈 값으로 바꾸지
//  않습니다 — loadAppData 의 soft 읽기가 「없음」과 「모름」을 갈라 줍니다).
// ─────────────────────────────────────────────────────────────────────────────

function need() {
  if (!supabase) throw new Error('Supabase 연결이 설정되지 않았습니다.')
  return supabase
}

type Row = Record<string, unknown>

const s = (v: unknown, d = '') => (v == null ? d : String(v))
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

// ── 운영 변화 기록 ──────────────────────────────────────────────────────────
export function toOpsChange(r: Row): OpsChange {
  return {
    id: s(r.id),
    kind: s(r.kind, 'other') as OpsChangeKind,
    title: s(r.title),
    status: s(r.status, 'planned') as OpsChangeStatus,
    effectiveOn: r.effective_on ? s(r.effective_on).slice(0, 10) : null,
    note: s(r.note),
    createdAt: s(r.created_at),
    createdByName: s(r.created_name),
  }
}

export async function createOpsChange(input: {
  kind: OpsChangeKind
  title: string
  status: OpsChangeStatus
  effectiveOn: string | null
  note: string
  createdName: string
}): Promise<void> {
  const sb = need()
  const { error } = await sb.from('ops_changes').insert({
    kind: input.kind,
    title: input.title.trim(),
    status: input.status,
    effective_on: input.effectiveOn,
    note: input.note.trim(),
    created_name: input.createdName,
  })
  if (error) throw new Error(error.message)
}

export async function updateOpsChange(
  id: string,
  patch: { status?: OpsChangeStatus; effectiveOn?: string | null; note?: string; title?: string },
): Promise<void> {
  const sb = need()
  const row: Row = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) row.status = patch.status
  if (patch.effectiveOn !== undefined) row.effective_on = patch.effectiveOn
  if (patch.note !== undefined) row.note = patch.note.trim()
  if (patch.title !== undefined) row.title = patch.title.trim()
  const { error } = await sb.from('ops_changes').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

// ── 추천 노출 · 채택 ─────────────────────────────────────────────────────────
export function toRecoView(r: Row): RecommendationView {
  const items = Array.isArray(r.items) ? (r.items as Row[]) : []
  return {
    id: s(r.id),
    clientId: s(r.client_id),
    shownOn: s(r.shown_on).slice(0, 10),
    shownAt: s(r.shown_at),
    viewerRole: s(r.viewer_role),
    items: items.map((it) => ({ key: s(it.key), label: s(it.label), suggestQty: Number(it.suggestQty ?? 0) })),
    ruleVersion: s(r.rule_version),
    action: (s(r.action, 'shown') as RecommendationView['action']),
    orderId: r.order_id ? s(r.order_id) : null,
  }
}

/**
 * 「지금 이 병원 화면에 이 추천이 떠 있다」를 남깁니다.
 *  ⚠ 같은 병원·같은 날·같은 규칙 판은 하루 한 번만 남깁니다 (화면이 다시
 *    그려질 때마다 쌓이지 않게). 그 판단은 부르는 쪽이 합니다.
 */
export async function logRecommendationView(input: {
  clientId: string
  shownOn: string
  viewerRole: string
  items: { key: string; label: string; suggestQty: number }[]
  ruleVersion: string
  action?: 'shown' | 'ordered' | 'dismissed'
  orderId?: string | null
}): Promise<void> {
  const sb = need()
  const { error } = await sb.from('recommendation_views').insert({
    client_id: input.clientId,
    shown_on: input.shownOn,
    viewer_role: input.viewerRole,
    items: input.items,
    rule_version: input.ruleVersion,
    action: input.action ?? 'shown',
    order_id: input.orderId ?? null,
  })
  if (error) throw new Error(error.message)
}

// ── 배차 제안 결정 ──────────────────────────────────────────────────────────
export function toDispatchDecision(r: Row): DispatchDecision {
  const p = (r.proposal ?? {}) as Row
  return {
    id: s(r.id),
    date: s(r.date).slice(0, 10),
    vehicleId: s(r.vehicle_id),
    vehicleName: s(r.vehicle_name),
    proposal: {
      stops: Array.isArray(p.stops) ? (p.stops as unknown[]).map((x) => String(x)) : [],
      loadRate: Number(p.loadRate ?? 0),
      urgentCount: Number(p.urgentCount ?? 0),
      materialCount: Number(p.materialCount ?? 0),
      rule: s(p.rule),
    },
    decision: s(r.decision, 'applied') as DispatchDecision['decision'],
    reason: s(r.reason),
    decidedName: s(r.decided_name),
    createdAt: s(r.created_at),
  }
}

export async function recordDispatchDecision(input: {
  date: string
  vehicleId: string
  vehicleName: string
  proposal: DispatchDecision['proposal']
  decision: DispatchDecision['decision']
  reason: string
  decidedName: string
}): Promise<void> {
  const sb = need()
  const { error } = await sb.from('dispatch_decisions').upsert(
    {
      date: input.date,
      vehicle_id: input.vehicleId,
      vehicle_name: input.vehicleName,
      proposal: input.proposal,
      decision: input.decision,
      reason: input.reason.trim(),
      decided_name: input.decidedName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date,vehicle_id' },
  )
  if (error) throw new Error(error.message)
}

// ── 마감 기록 (계기판 · 대기시간 포함) ─────────────────────────────────────
export function toDayCloseRecord(r: Row): DayCloseRecord {
  return {
    profileId: s(r.profile_id),
    who: s(r.profile_name),
    date: s(r.date).slice(0, 10),
    note: s(r.note),
    closedAt: s(r.closed_at),
    summary: (r.summary ?? {}) as DayCloseRecord['summary'],
    odometerStart: n(r.odometer_start),
    odometerEnd: n(r.odometer_end),
    facilityWaitMin: n(r.facility_wait_min),
    facilityTrips: n(r.facility_trips),
  }
}

// ── 도입 후 같은 범위 조사값 ────────────────────────────────────────────────
export function toAfterSurvey(r: Row): AfterSurvey | null {
  //  칸 자체가 없는 서버(판 106 이전)는 undefined 로 오므로 null 이 아니라 「없음」입니다.
  if (!('after_admin_minutes_per_collection' in r)) return null
  return {
    adminMinutesPerCollection: n(r.after_admin_minutes_per_collection),
    monthlyDocHours: n(r.after_monthly_doc_hours),
    surveyedOn: r.after_surveyed_on ? s(r.after_surveyed_on).slice(0, 10) : null,
    source: (r.after_source as 'survey' | 'estimate' | null) ?? null,
    note: s(r.after_note),
  }
}

export async function saveAfterSurvey(input: AfterSurvey): Promise<void> {
  const sb = need()
  const { error } = await sb
    .from('performance_baselines')
    .update({
      after_admin_minutes_per_collection: input.adminMinutesPerCollection,
      after_monthly_doc_hours: input.monthlyDocHours,
      after_surveyed_on: input.surveyedOn,
      after_source: input.source,
      after_note: input.note,
    })
    .eq('id', 1)
  if (error) throw new Error(error.message)
}

// ── AI 호출 기록 ─────────────────────────────────────────────────────────────
export function toAiCall(r: Row): AiCallRecord {
  return {
    id: s(r.id),
    kind: s(r.kind),
    requestId: r.request_id ? s(r.request_id) : null,
    ok: Boolean(r.ok),
    error: s(r.error),
    ms: n(r.ms),
    model: s(r.model),
    actorName: s(r.actor_name),
    edited: Boolean(r.edited),
    createdAt: s(r.created_at),
  }
}

/** 서버가 허용하는 값 — supabase/functions/ai-triage/triage.ts 와 같아야 합니다 */
export const TRIAGE_KINDS = ['긴급수거', '추가수거', '소모품', '교육·자료', '기타'] as const
export const TRIAGE_URGENCIES = ['높음', '보통', '낮음'] as const

export interface TriageResult {
  /** 요청 종류 — 시스템 RequestKind 값 */
  kind: string
  /** 한 글에 함께 든 다른 종류 (예: 긴급수거 + 소모품) */
  alsoKinds: string[]
  /** 높음 · 보통 · 낮음 */
  urgency: string
  summary: string
  /** 핵심 요구사항 (최대 4) */
  points: string[]
  draft: string
  basis: string
  /** 실제로 답한 모델 이름 */
  model: string
}

export type TriageOutcome =
  | { ok: true; result: TriageResult; ms: number; callId: string | null; logged: boolean }
  | { ok: false; error: string; ms: number; callId: string | null }

/** 서버가 돌려준 성공 결과를 한 번 더 확인합니다 — 형식이 틀리면 성공으로 치지 않습니다 */
function asTriage(v: unknown): TriageResult | null {
  const r = v as Partial<TriageResult> | null
  if (!r || typeof r !== 'object') return null
  const str = (x: unknown) => typeof x === 'string' && x.trim().length > 0
  if (!str(r.kind) || !(TRIAGE_KINDS as readonly string[]).includes(r.kind as string)) return null
  if (!str(r.urgency) || !(TRIAGE_URGENCIES as readonly string[]).includes(r.urgency as string)) return null
  if (!str(r.summary) || !str(r.draft) || !str(r.basis)) return null
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : [])
  return {
    kind: r.kind as string,
    alsoKinds: arr(r.alsoKinds),
    urgency: r.urgency as string,
    summary: r.summary as string,
    points: arr(r.points),
    draft: r.draft as string,
    basis: r.basis as string,
    model: typeof r.model === 'string' ? r.model : '',
  }
}

/**
 * 병원 요청 하나를 AI 로 분석합니다 (서버 함수 ai-triage · 0138).
 *
 *  ⚠ 보내는 것은 **요청 번호뿐**입니다. 요청 글은 서버가 DB 에서 직접 읽습니다
 *    — 아무 글이나 AI 에 보내는 통로가 되지 않게.
 *  ⚠ 결과를 저장하거나 회신을 보내거나 상태를 바꾸지 않습니다. 초안을 보여 줄 뿐입니다.
 *  ⚠ 호출 기록(ai_calls)은 **서버가** 남깁니다(성공 · 실패 모두). 서버에 닿지
 *    못한 경우(함수 미배포 · 네트워크 · 시간 초과)만 여기서 실패를 한 줄 남깁니다.
 *    가짜 결과를 만들지 않습니다.
 */
export async function aiTriageRequest(input: {
  requestId: string
  actorName: string
  /** 시연 요청이면 true — 서버에 닿지 못한 실패 기록도 운영 실적과 섞이지 않게 */
  demo?: boolean
  /** 서버가 먼저 끝내도록 (서버의 모델 제한 20초) 넉넉히 — 기본 35초 */
  timeoutMs?: number
}): Promise<TriageOutcome> {
  const sb = need()
  const t0 = Date.now()
  let errorMsg = ''
  let callId: string | null = null
  let reached = false
  try {
    const { data, error } = await sb.functions.invoke('ai-triage', {
      body: { requestId: input.requestId },
      timeout: input.timeoutMs ?? 35_000,
    })
    if (error) {
      //  서버가 답은 했는데 실패(4xx·5xx) — 서버의 이유와 기록 번호를 읽습니다.
      const ctx = (error as { context?: unknown }).context
      if (ctx && typeof (ctx as Response).json === 'function') {
        const b = (await (ctx as Response).clone().json().catch(() => null)) as { error?: string; message?: string; callId?: string | null } | null
        if (b && 'callId' in b) {
          reached = true
          callId = b.callId ?? null
        }
        throw new Error(b?.error || b?.message || `서버 함수 오류 (${(ctx as Response).status})`)
      }
      throw new Error(error.message || 'AI 함수 호출 실패')
    }
    reached = true
    const d = (data ?? {}) as { ok?: boolean; result?: unknown; callId?: string | null; logged?: boolean; error?: string }
    callId = d.callId ?? null
    if (d.error) throw new Error(d.error)
    const result = asTriage(d.result)
    if (!result) throw new Error('AI 응답 형식이 맞지 않습니다')
    return { ok: true, result, ms: Date.now() - t0, callId, logged: d.logged !== false && callId != null }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : '알 수 없는 오류'
  }
  const ms = Date.now() - t0
  //  서버에 닿지 못했으면 서버 기록이 없습니다 — 그 시도를 여기서 실패로 남깁니다.
  if (!reached) {
    try {
      const { data } = await sb
        .from('ai_calls')
        .insert({
          kind: input.demo ? 'request_triage_demo' : 'request_triage',
          request_id: input.requestId,
          input: '',
          output: null,
          model: '',
          ok: false,
          error: `서버 함수에 닿지 못했습니다 — ${errorMsg}`.slice(0, 500),
          ms,
          actor_name: input.actorName,
        })
        .select('id')
        .maybeSingle()
      callId = data ? String((data as Row).id) : null
    } catch {
      callId = null
    }
  }
  return { ok: false, error: errorMsg, ms, callId }
}

/** 담당자가 AI 초안을 고쳐 썼다는 표시 */
export async function markAiCallEdited(callId: string, note: string): Promise<void> {
  const sb = need()
  const { error } = await sb.from('ai_calls').update({ edited: true, edited_note: note.slice(0, 500) }).eq('id', callId)
  if (error) throw new Error(error.message)
}

// ── AX Coach 발행 이력 (0108) ───────────────────────────────────────────────
//
//  ⚠ 여기 남는 것은 **발행했다는 사실**뿐입니다. 수거·주문·입금 기록은
//    원래 자리에 그대로 있고, 이 표는 그것을 가리키기만 합니다(target_id).
//    같은 값을 두 곳에 저장하면 언젠가 두 숫자가 갈라집니다.

export function toCoachMission(r: Row): CoachMissionRow {
  return {
    id: s(r.id),
    missionKey: s(r.mission_key),
    area: s(r.evidence_area),
    issuedOn: s(r.issued_on).slice(0, 10),
    issuedAt: s(r.issued_at),
    issuedName: s(r.issued_name),
    issuedRole: s(r.issued_role),
    targetId: r.target_id == null ? null : s(r.target_id),
    verifiedAt: r.verified_at == null ? null : s(r.verified_at),
    verifiedWhat: s(r.verified_what),
  }
}

/**
 * 「업무하러 가기」를 눌렀을 때 — 오늘 이 일을 받았다는 기록.
 *
 *  ⚠ 이것은 **완료가 아닙니다.** 확인은 실제 업무 기록으로만 합니다.
 *    하루 한 번만 남습니다 (issued_on × mission_key × issued_by 유일).
 */
export async function issueCoachMission(input: {
  missionKey: string
  area: string
  issuedOn: string
  issuedName: string
  issuedRole: string
  targetId: string | null
}): Promise<CoachMissionRow | null> {
  const sb = need()
  const { data, error } = await sb
    .from('ax_coach_missions')
    .insert({
      mission_key: input.missionKey,
      evidence_area: input.area,
      issued_on: input.issuedOn,
      issued_name: input.issuedName,
      issued_role: input.issuedRole,
      target_id: input.targetId,
    })
    .select('*')
    .maybeSingle()
  //  오늘 이미 받은 일이면 유일 색인이 막습니다 — 오류가 아니라 「이미 있음」입니다.
  if (error) {
    if (error.code === '23505') return null
    throw new Error(error.message)
  }
  return data ? toCoachMission(data as Row) : null
}

/**
 * 실제 업무 기록이 확인됐다고 적어 둡니다.
 *
 *  ⚠ 화면은 이 값을 **믿고 보여 주지 않습니다.** 볼 때마다 기존 업무
 *    기록으로 다시 확인합니다 — 이 칸은 나중에 「그때 무엇으로 확인했나」를
 *    되짚기 위한 기록입니다. 지워져도 화면은 그대로 확인합니다.
 */
export async function markCoachMissionVerified(id: string, what: string): Promise<void> {
  const sb = need()
  const { error } = await sb
    .from('ax_coach_missions')
    .update({ verified_at: new Date().toISOString(), verified_what: what.slice(0, 300) })
    .eq('id', id)
    .is('verified_at', null)
  if (error) throw new Error(error.message)
}
