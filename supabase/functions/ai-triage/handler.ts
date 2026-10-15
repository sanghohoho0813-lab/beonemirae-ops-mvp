// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 처리 흐름 (권한 → 요청 읽기 → 모델 호출 → 검사 → 기록)
//
//  ⚠ DB · 모델 호출은 전부 deps 로 받습니다. 실제 배포(index.ts)는 Supabase ·
//    fetch 를 넣고, Node 검사는 가짜를 넣습니다 — 흐름 자체는 같은 코드입니다.
//
//  ── 서버가 지키는 것 ─────────────────────────────────────────────────────
//   · 로그인 + 사용 중인 관리자 · 사무실 계정만 (병원 · 현장 · 익명은 거부)
//     — 화면 단추를 숨기는 것과 **따로** 서버에서 다시 봅니다.
//   · 요청 글은 브라우저가 보낸 글이 아니라 **DB 의 그 요청**을 읽습니다.
//     아무 글이나 보내 AI 를 쓰는 통로가 되지 않게 하고, 「실제 병원 요청」만
//     분석했다는 것을 보장합니다.
//   · 모델에 보내는 것은 요청 글(전화번호 등 가림) · 병원이 고른 종류 · 급함
//     표시 · 희망일뿐입니다. 병원명 · 요청자 · 매출 · 미수 · 이력은 보내지 않습니다.
//   · 호출마다 ai_calls 에 한 줄 — 성공도 실패도. 기록은 서버가 남깁니다.
//   · 시연 요청(demo_session_id · 시연용 거래처)에 대한 호출은 kind 를
//     'request_triage_demo' 로 남겨 운영 실적과 섞이지 않게 합니다.
//   · 이 흐름에는 요청 상태 · 회신 · 일정 · 재고 · 정산을 바꾸는 코드가 없습니다.
// ═══════════════════════════════════════════════════════════════════════════

import { SYSTEM_PROMPT, buildUserMessage, parseTriage, type TriageOutput } from './triage.ts'
import { ProviderError, type ModelReply } from './provider.ts'
import { ASSIST_KIND, ASSIST_TASKS, planAssist, type AssistTask } from './assist.ts'

export const KIND_REAL = 'request_triage'
export const KIND_DEMO = 'request_triage_demo'

export interface StoredRequest {
  id: string
  content: string
  kind: string | null
  urgent: boolean
  desiredDate: string | null
  /** 시연 세션 요청이거나 시연용 거래처의 요청 */
  demo: boolean
}

export interface AiCallRow {
  kind: string
  request_id: string | null
  input: string
  output: unknown
  model: string
  ok: boolean
  error: string
  ms: number
  actor_id: string
  actor_name: string
}

export interface TriageDeps {
  getUser(): Promise<{ id: string } | null>
  getProfile(id: string): Promise<{ role: string; active: boolean; name: string } | null>
  getRequest(id: string): Promise<StoredRequest | null>
  insertCall(row: AiCallRow): Promise<string | null>
  callModel(system: string, user: string): Promise<ModelReply>
  /** AI_API_KEY 가 서버 Secret 에 있는가 */
  hasKey: boolean
  /** 설정된 모델 이름 (응답에 모델명이 없을 때 · 키가 없을 때 기록용) */
  model: string
  now(): number
}

export interface TriageResponse {
  status: number
  body: Record<string, unknown>
}

const STAFF = ['admin', 'office']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 결과 검사에 걸렸을 때 한 번 더 물어도 되는 시간 (0142 · 안정화).
 *  ⚠ 첫 답이 이보다 오래 걸렸으면 다시 묻지 않습니다 — 모델 한 번이 최대 20초라, 다시 물으면
 *    화면이 기다리는 시간(45초)을 넘길 수 있습니다. 넘기면 화면은 「시간 초과」인데 서버는 성공을
 *    기록하는, 서로 다른 말을 하게 됩니다.
 */
export const RETRY_BUDGET_MS = 12_000

/** 다시 물을 때 덧붙이는 말 — 걸린 까닭을 그대로 알려 줍니다 */
export const retryNote = (message: string, why: string) =>
  `${message}\n\n[앞의 답은 쓰이지 못했습니다 — 까닭: ${why}]\n같은 규칙을 지켜 처음부터 다시 답한다. 숫자는 위에 있는 것만 쓴다.`

export async function handleTriage(body: unknown, d: TriageDeps): Promise<TriageResponse> {
  //  ── 1. 누구인가 — 로그인 · 역할 · 사용 중 ─────────────────────────────
  const user = await d.getUser()
  if (!user) return { status: 401, body: { error: '로그인이 필요합니다' } }
  const me = await d.getProfile(user.id)
  if (!me || !me.active || !STAFF.includes(me.role)) {
    return { status: 403, body: { error: '비원미래 내부 담당자(관리자 · 사무실)만 쓸 수 있습니다' } }
  }

  //  ── 2. 어떤 요청인가 — DB 에서 읽습니다 ───────────────────────────────
  const requestId = (body as { requestId?: unknown } | null)?.requestId
  if (typeof requestId !== 'string' || !UUID.test(requestId)) {
    return { status: 400, body: { error: '요청 번호(requestId)가 없습니다' } }
  }
  const req = await d.getRequest(requestId)
  if (!req) return { status: 404, body: { error: '요청을 찾을 수 없습니다' } }
  if (!req.content.trim()) return { status: 400, body: { error: '요청 글이 비어 있어 분석할 것이 없습니다' } }

  const source = { content: req.content, kind: req.kind, urgent: req.urgent, desiredDate: req.desiredDate }
  const input = buildUserMessage(source)
  const t0 = d.now()
  const log = async (row: Omit<AiCallRow, 'kind' | 'request_id' | 'input' | 'ms' | 'actor_id' | 'actor_name'>) => {
    try {
      return await d.insertCall({
        kind: req.demo ? KIND_DEMO : KIND_REAL,
        request_id: req.id,
        input,
        ms: d.now() - t0,
        actor_id: user.id,
        actor_name: me.name,
        ...row,
      })
    } catch {
      return null
    }
  }

  //  ── 3. 키가 없으면 — 가짜 결과 없이 실패로 기록 ─────────────────────────
  if (!d.hasKey) {
    const error = 'AI_API_KEY 가 서버에 등록되지 않았습니다 (연결 전)'
    const callId = await log({ output: null, model: '', ok: false, error })
    return { status: 503, body: { error, callId, ms: d.now() - t0 } }
  }

  //  ── 4. 모델 호출 · 5. 결과 검사 ──────────────────────────────────────
  //   0142 안정화 — 검사에 걸리면(지어낸 숫자 · 확정 약속 · 빠진 칸) 까닭을 알려 주고 **한 번만** 다시
  //   묻습니다(시간이 남았을 때만 · RETRY_BUDGET_MS). 둘째도 걸리면 실패 그대로 — 고쳐 주지 않습니다.
  //   첫 번째 실패도 기록합니다.
  let ask = input
  for (let attempt = 1; ; attempt++) {
    let reply: ModelReply
    try {
      reply = await d.callModel(SYSTEM_PROMPT, ask)
    } catch (e) {
      const error = e instanceof ProviderError ? e.message : `AI 호출 실패 (${String(e).slice(0, 120)})`
      const status = e instanceof ProviderError && e.code === 'timeout' ? 504 : 502
      const callId = await log({ output: null, model: d.model, ok: false, error })
      return { status, body: { error, callId, ms: d.now() - t0 } }
    }
    const parsed = parseTriage(reply.text, source)
    if (!parsed.ok) {
      const callId = await log({
        output: { raw: reply.text.slice(0, 2000), usage: reply.usage, attempt },
        model: reply.model,
        ok: false,
        error: parsed.error,
      })
      if (attempt < 2 && d.now() - t0 <= RETRY_BUDGET_MS) {
        ask = retryNote(input, parsed.error)
        continue
      }
      return { status: 502, body: { error: parsed.error, callId, ms: d.now() - t0 } }
    }
    const result: TriageOutput & { model: string } = { ...parsed.result, model: reply.model }
    const callId = await log({ output: { ...parsed.result, usage: reply.usage, attempt }, model: reply.model, ok: true, error: '' })
    return { status: 200, body: { ok: true, result, callId, logged: callId != null, ms: d.now() - t0, demo: req.demo } }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  업무 보조 AI 세 가지 (0141) — 오늘 브리핑 · 현장 메모 정리 · 독촉 문자 초안
//   body: { task: 'briefing' | 'field_note' | 'dunning', input: {...} }
//   · 권한 · 키 · 기록 규칙은 위(요청 분석)와 같습니다. 기록 kind 만 다릅니다(assist.ts ASSIST_KIND).
//   · 입력은 assist.ts 가 모양을 엄격하게 봅니다 — 브리핑은 숫자만, 독촉은 병원 이름 · 금액 없이.
//   · 이 흐름에도 저장 · 전송 · 상태를 바꾸는 코드가 없습니다.
// ═══════════════════════════════════════════════════════════════════════════
export async function handleAssist(body: unknown, d: Omit<TriageDeps, 'getRequest'>): Promise<TriageResponse> {
  const user = await d.getUser()
  if (!user) return { status: 401, body: { error: '로그인이 필요합니다' } }
  const me = await d.getProfile(user.id)
  if (!me || !me.active || !STAFF.includes(me.role)) {
    return { status: 403, body: { error: '비원미래 내부 담당자(관리자 · 사무실)만 쓸 수 있습니다' } }
  }
  const b = (body ?? {}) as { task?: unknown; input?: unknown }
  const task = b.task as AssistTask
  if (!(ASSIST_TASKS as readonly string[]).includes(task as string)) {
    return { status: 400, body: { error: `모르는 AI 작업입니다: ${String(b.task).slice(0, 20)}` } }
  }
  const plan = planAssist(task, b.input)
  if (!plan.ok) return { status: 400, body: { error: plan.error } }
  const { system, message, parse } = plan.value

  const t0 = d.now()
  const log = async (row: Omit<AiCallRow, 'kind' | 'request_id' | 'input' | 'ms' | 'actor_id' | 'actor_name'>) => {
    try {
      return await d.insertCall({ kind: ASSIST_KIND[task], request_id: null, input: message, ms: d.now() - t0, actor_id: user.id, actor_name: me.name, ...row })
    } catch {
      return null
    }
  }
  if (!d.hasKey) {
    const error = 'AI_API_KEY 가 서버에 등록되지 않았습니다 (연결 전)'
    const callId = await log({ output: null, model: '', ok: false, error })
    return { status: 503, body: { error, callId, ms: d.now() - t0 } }
  }
  //  0142 — 결과 검사에 걸리면 **한 번만** 다시 묻습니다. 걸린 까닭을 그대로 알려 주고 같은 규칙으로.
  //   ⚠ 고쳐 주거나 고정 문구로 바꾸지 않습니다 — 두 번째도 걸리면 실패를 그대로 돌려보냅니다.
  //   ⚠ 두 번 다 기록합니다(첫 번째는 실패로).
  let ask = message
  for (let attempt = 1; ; attempt++) {
    let reply: ModelReply
    try {
      reply = await d.callModel(system, ask)
    } catch (e) {
      const error = e instanceof ProviderError ? e.message : `AI 호출 실패 (${String(e).slice(0, 120)})`
      const status = e instanceof ProviderError && e.code === 'timeout' ? 504 : 502
      const callId = await log({ output: null, model: d.model, ok: false, error })
      return { status, body: { error, callId, ms: d.now() - t0 } }
    }
    const parsed = parse(reply.text)
    if (!parsed.ok) {
      const callId = await log({ output: { raw: reply.text.slice(0, 2000), usage: reply.usage, attempt }, model: reply.model, ok: false, error: parsed.error })
      if (attempt < 2 && d.now() - t0 <= RETRY_BUDGET_MS) {
        ask = retryNote(message, parsed.error)
        continue
      }
      return { status: 502, body: { error: parsed.error, callId, ms: d.now() - t0 } }
    }
    const callId = await log({ output: { ...(parsed.value as object), usage: reply.usage, attempt }, model: reply.model, ok: true, error: '' })
    return { status: 200, body: { ok: true, task, result: { ...(parsed.value as object), model: reply.model }, callId, logged: callId != null, ms: d.now() - t0 } }
  }
}
