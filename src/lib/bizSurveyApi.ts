import { supabase, isOffline } from './supabase'
import type { Answers, Respondent, ResponseRow } from './bizSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 뉴본펭귄 사전 설문 — 서버 호출 (0144 · 0145)
//
//  표를 직접 읽거나 쓰지 않습니다. 서버 함수(biz_survey_*)만 부릅니다.
//   · 답하는 분: 로그인한 대표·관리자 · 사무실(이사님) 계정 — 답지 하나를 같이 씀 (0145)
//   · 관리 화면: 로그인한 대표·관리자(또는 지정된 설문 관리자)만 (0144)
//  0144 의 초대 링크(열쇠) 함수는 서버에 남아 있지만 화면에서는 쓰지 않습니다.
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
  missing: '설문 기능이 아직 서버에 준비되지 않았습니다 (PROPOSAL_0145_newborn_survey_inapp.sql 실행 필요).',
  link: '설문을 열 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
  denied: '대표님 · 이사님 계정에서만 열 수 있습니다.',
  offline: '인터넷 연결이 불안정합니다. 작성한 내용은 이 폰에 보관해 두었다가 다시 저장합니다.',
  other: '잠시 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.',
}

function classify(e: { code?: string; message?: string } | null | undefined): SurveyError {
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  if (code === 'PGRST202' || /Could not find the function|does not exist/i.test(msg)) return new SurveyError('missing', MESSAGES.missing)
  if (code === '28000' || /링크가 올바르지 않거나 만료/.test(msg)) return new SurveyError('link', MESSAGES.link)
  if (code === '42501' || /설문 관리자만|계정만|permission denied/i.test(msg)) return new SurveyError('denied', MESSAGES.denied)
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
  answers: Answers
  status: 'draft' | 'submitted'
  updated_at: string | null
  submitted_at: string | null
  first_submitted_at: string | null
  edited_by: string
  edited_role: string
}

/** 앱 안에서 바로 — 로그인한 대표님 · 이사님이 같은 답지 하나를 열고 · 저장하고 · 제출 (0145) */
export const myOpen = () => call<OpenResult>('biz_survey_my_open', {})
export const mySave = (answers: Answers) => call<{ updated_at: string }>('biz_survey_my_save', { p_answers: answers })
export const mySubmit = (answers: Answers) =>
  call<{ updated_at: string; submitted_at: string }>('biz_survey_my_submit', { p_answers: answers })

/** 바뀐 질문만 서버에서 끼워 넣기 — 두 분이 동시에 열어도 서로 답을 지우지 않음 (0145 · 동시 작성 보호).
 *  submit=true 면 끼워 넣고 그대로 제출. 서버에 합쳐진 답 전체를 돌려받습니다. */
export const myPatch = (set: Answers, unset: string[], submit = false) =>
  call<OpenResult>('biz_survey_my_patch', { p_set: set, p_unset: unset, p_submit: submit })

export interface RevisionRow {
  id: string
  respondent: Respondent
  submitted_at: string
}
export interface AdminData {
  responses: ResponseRow[]
  revisions: RevisionRow[]
}

/** 관리 화면 — 0144 함수 그대로 (공동 답지는 'ceo' 줄) */
export const adminLoad = () => call<AdminData>('biz_survey_admin_load', {})
