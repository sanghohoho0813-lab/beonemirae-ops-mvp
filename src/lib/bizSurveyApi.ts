import { supabase, isOffline } from './supabase'
import type { Answers, Respondent, ResponseRow } from './bizSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 사전 설문 — 서버 호출 (0144)
//
//  표를 직접 읽거나 쓰지 않습니다. 서버 함수(biz_survey_*)만 부릅니다.
//   · 응답자: 링크 열쇠(token)로만 — 로그인 없이 자기 답지 하나만
//   · 관리자: 로그인한 대표·관리자(또는 지정된 설문 관리자)만
//  열쇠는 서버에 해시로만 남고, 링크 만들 때 한 번만 돌려받습니다.
// ─────────────────────────────────────────────────────────────────────────────

export type SurveyFail = 'missing' | 'link' | 'denied' | 'offline' | 'other'

export class SurveyError extends Error {
  kind: SurveyFail
  constructor(kind: SurveyFail, message: string) {
    super(message)
    this.kind = kind
  }
}

const MESSAGES: Record<SurveyFail, string> = {
  missing: '설문 기능이 아직 서버에 준비되지 않았습니다 (PROPOSAL_0144_biz_survey.sql 실행 필요).',
  link: '설문 링크가 올바르지 않거나 만료되었습니다. 담당자에게 새 링크를 요청해 주세요.',
  denied: '설문 관리자만 볼 수 있습니다.',
  offline: '인터넷 연결이 불안정합니다. 작성한 내용은 이 폰에 보관해 두었다가 다시 저장합니다.',
  other: '잠시 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.',
}

function classify(e: { code?: string; message?: string } | null | undefined): SurveyError {
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  if (code === 'PGRST202' || /Could not find the function|does not exist/i.test(msg)) return new SurveyError('missing', MESSAGES.missing)
  if (code === '28000' || /링크가 올바르지 않거나 만료/.test(msg)) return new SurveyError('link', MESSAGES.link)
  if (code === '42501' || /설문 관리자만|permission denied/i.test(msg)) return new SurveyError('denied', MESSAGES.denied)
  if (isOffline(e)) return new SurveyError('offline', MESSAGES.offline)
  return new SurveyError('other', msg ? `${MESSAGES.other} (${msg.slice(0, 80)})` : MESSAGES.other)
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new SurveyError('missing', '서버가 연결되지 않은 환경입니다. 실제 운영 주소에서 열어 주세요.')
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw classify(e as { message?: string })
  }
  if (res.error) throw classify(res.error)
  return res.data as T
}

export interface OpenResult {
  respondent: Respondent
  answers: Answers
  status: 'draft' | 'submitted'
  updated_at: string | null
  submitted_at: string | null
  first_submitted_at: string | null
  expires_at: string | null
}

export const openSurvey = (token: string) => call<OpenResult>('biz_survey_open', { p_token: token })
export const saveSurvey = (token: string, answers: Answers) =>
  call<{ updated_at: string }>('biz_survey_save', { p_token: token, p_answers: answers })
export const submitSurvey = (token: string, answers: Answers) =>
  call<{ updated_at: string; submitted_at: string }>('biz_survey_submit', { p_token: token, p_answers: answers })

export interface InviteRow {
  id: string
  respondent: Respondent
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}
export interface RevisionRow {
  id: string
  respondent: Respondent
  submitted_at: string
}
export interface AdminData {
  responses: ResponseRow[]
  invites: InviteRow[]
  revisions: RevisionRow[]
}

export const adminLoad = () => call<AdminData>('biz_survey_admin_load', {})
export const issueInvite = (respondent: Respondent, days: number) =>
  call<{ id: string; respondent: Respondent; token: string; expires_at: string }>('biz_survey_issue_invite', {
    p_respondent: respondent,
    p_days: days,
  })
export const revokeInvite = (id: string) => call<null>('biz_survey_revoke_invite', { p_id: id })

/** 응답자에게 보낼 주소 */
export function surveyLink(token: string): string {
  return `${window.location.origin}/survey/${token}`
}
