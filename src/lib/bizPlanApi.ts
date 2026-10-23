import { supabase, isOffline } from './supabase'
import type { Basis, CheckMark, DocStatus, FieldRow, FieldStatus, HistoryData, OpenData, ReqStatus, ReqType, RequestRow, Value } from './bizPlan'

// ─────────────────────────────────────────────────────────────────────────────
// 신보 뉴본펭귄 사업계획서 — 서버 호출 (0146)
//
//  표를 직접 읽거나 쓰지 않습니다. bizplan_* 서버 함수만 부릅니다.
//  누가 무엇을 할 수 있는지는 **서버가** 정합니다(참여자 · 담당/검토) — 화면에서
//  단추를 숨기는 것은 편의일 뿐, 막는 것은 서버입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type BizPlanFail = 'missing' | 'denied' | 'offline' | 'invalid' | 'other'

export class BizPlanError extends Error {
  kind: BizPlanFail
  constructor(kind: BizPlanFail, message: string) {
    super(message)
    this.kind = kind
  }
}

const MESSAGES: Record<Exclude<BizPlanFail, 'invalid'>, string> = {
  missing: '사업계획서 기능이 아직 서버에 준비되지 않았습니다 (PROPOSAL_0146_bizplan.sql 실행 필요).',
  denied: '사업계획서는 참여자로 등록된 계정만 열 수 있습니다. 대표님(관리자)께 참여자 등록을 요청해 주세요.',
  offline: '인터넷 연결이 불안정합니다. 잠시 뒤 다시 시도해 주세요. 적던 글은 그대로 있습니다.',
  other: '잠시 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.',
}

function classify(e: { code?: string; message?: string } | null | undefined): BizPlanError {
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  if (code === 'PGRST202' || /Could not find the function|does not exist/i.test(msg)) return new BizPlanError('missing', MESSAGES.missing)
  //  서버가 까닭을 한국어로 돌려주는 거절(담당만 · 참여자만) — 그 문장을 그대로 보여 줍니다
  if (code === '42501') return new BizPlanError('denied', msg || MESSAGES.denied)
  if (code === '22023') return new BizPlanError('invalid', msg || '입력 형식이 올바르지 않습니다.')
  if (isOffline(e)) return new BizPlanError('offline', MESSAGES.offline)
  return new BizPlanError('other', msg ? `${MESSAGES.other} (${msg.slice(0, 120)})` : MESSAGES.other)
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new BizPlanError('missing', '서버가 연결되지 않은 환경입니다. 실제 운영 주소에서 열어 주세요.')
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw classify(e as { message?: string })
  }
  if (res.error) throw classify(res.error)
  return res.data as T
}

/** 메뉴에 단추를 보일지 — 참여자인가(서버 판단). 함수가 없으면(SQL 전) 'missing'.
 *  계정마다 한 번만 묻습니다(로그아웃 뒤 다른 계정이면 다시). */
let roleOnce: { uid: string; p: Promise<'editor' | 'reviewer' | null | 'missing'> } | null = null
export function myRole(uid: string): Promise<'editor' | 'reviewer' | null | 'missing'> {
  if (!roleOnce || roleOnce.uid !== uid) {
    const p = call<string | null>('bizplan_my_role', {})
      .then((r) => (r === 'editor' || r === 'reviewer' ? r : null))
      .catch((e: BizPlanError) => {
        roleOnce = null
        return e.kind === 'missing' ? ('missing' as const) : null
      })
    roleOnce = { uid, p }
  }
  return roleOnce.p
}

export const openPlan = () => call<OpenData>('bizplan_open', {})

export interface SaveResult {
  ok: boolean
  conflict?: boolean
  unchanged?: boolean
  revision?: number
  field: FieldRow
}
export const saveField = (p: {
  key: string
  value: Value | null
  status: FieldStatus | null
  basis: Basis | null
  reason: string
  expectedRev: number
  requestId?: string | null
}) =>
  call<SaveResult>('bizplan_save_field', {
    p_key: p.key,
    p_value: p.value,
    p_status: p.status,
    p_basis: p.basis,
    p_reason: p.reason,
    p_expected_rev: p.expectedRev,
    p_request_id: p.requestId ?? null,
  })

export const createRequest = (p: { key: string; label: string; type: ReqType; body: string; suggestion: string }) =>
  call<RequestRow>('bizplan_request_create', { p_key: p.key, p_label: p.label, p_type: p.type, p_body: p.body, p_suggestion: p.suggestion })

export const updateRequest = (id: string, status: Exclude<ReqStatus, '접수'>, note: string) =>
  call<RequestRow>('bizplan_request_update', { p_id: id, p_status: status, p_note: note })

export const setCheck = (key: string, mark: CheckMark | null, note = '') =>
  call<{ ok: boolean; at: string }>('bizplan_check', { p_key: key, p_mark: mark, p_note: note })

export const setDocStatus = (status: Exclude<DocStatus, '제출본 확정'>, note: string) =>
  call<{ ok: boolean }>('bizplan_doc_set', { p_status: status, p_note: note })

export const createVersion = (label: string, note: string, submission: boolean) =>
  call<{ ok: boolean; id: number; label: string }>('bizplan_version_create', { p_label: label, p_note: note, p_submission: submission })

export interface VersionFull {
  id: number
  label: string
  note: string
  is_submission: boolean
  snapshot: Record<string, { value: Value; status: FieldStatus; basis: Basis; rev: number }>
  doc_status: string
  created_by: string
  created_at: string
}
export const getVersion = (id: number) => call<VersionFull>('bizplan_version_get', { p_id: id })

export const history = (key: string | null) => call<HistoryData>('bizplan_history', { p_key: key })

export interface MemberInfo {
  profile_id: string
  name: string
  account_role: string
  title: string
  role: 'editor' | 'reviewer'
  active: boolean
  added_by: string
  added_at: string
}
export interface MembersData {
  members: MemberInfo[]
  candidates: { profile_id: string; name: string; account_role: string }[]
}
export const membersList = () => call<MembersData>('bizplan_members_list', {})
export const memberSet = (profile: string, role: 'editor' | 'reviewer', title: string, active: boolean) =>
  call<{ ok: boolean }>('bizplan_member_set', { p_profile: profile, p_role: role, p_title: title, p_active: active })
