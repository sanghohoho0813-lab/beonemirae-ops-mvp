// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — Supabase 대시보드 편집기에 붙여 넣는 한 파일짜리 판 (자동 생성 · 손으로 고치지 않음)
//
//   만든 곳: scripts/bundle_ai_triage.py ← supabase/functions/ai-triage/*.ts (내용 그대로)
//   붙여 넣는 곳: Supabase 대시보드 › Edge Functions › ai-triage (이름이 꼭 ai-triage)
//   키: Edge Functions › Secrets 의 AI_API_KEY (AQ.… · AIza… 이면 Gemini)
//   ⚠ 이 판에는 Claude 연결(anthropic.ts)이 없습니다 — Gemini · OpenAI 호환 키만 됩니다.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ─── provider.ts ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 모델 호출 어댑터 (OpenAI 호환 Chat Completions)
//
//  ⚠ SDK 없이 fetch 한 번입니다. 다른 회사 모델로 바꿀 때는 이 파일의 함수
//    하나만 갈아 끼우면 됩니다 (입력: system · user 글 / 출력: 글 · 모델명 · 토큰 수).
//  ⚠ API 키는 서버 Secret(AI_API_KEY)에서만 옵니다. 브라우저 · 저장소에 없습니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사가 가짜 fetch 로 이 파일을 시험합니다.
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderErrorCode = 'timeout' | 'http' | 'network' | 'format'

export class ProviderError extends Error {
  code: ProviderErrorCode
  status: number | null
  constructor(code: ProviderErrorCode, message: string, status: number | null = null) {
    super(message)
    this.code = code
    this.status = status
  }
}

export interface ModelReply {
  text: string
  /** 실제로 답한 모델 이름 (응답에 적힌 값 — 없으면 요청한 이름) */
  model: string
  usage: { input: number | null; output: number | null }
}

export interface ChatOptions {
  apiKey: string
  /** 기본 https://api.openai.com/v1/chat/completions — OpenAI 호환 주소면 무엇이든 */
  url: string
  model: string
  system: string
  user: string
  timeoutMs: number
  /** null 이면 보내지 않습니다 (temperature 를 받지 않는 모델용) */
  temperature: number | null
  fetchImpl?: typeof fetch
}

/** 오류 문구에 키 조각이 섞여 나가지 않게 (OpenAI sk-… · Google AIza… · AQ.…) */
export const redact = (s: string) =>
  s
    .replace(/sk-[A-Za-z0-9_*-]{4,}/g, 'sk-***')
    .replace(/AIza[A-Za-z0-9_-]{4,}/g, 'AIza***')
    .replace(/AQ\.[A-Za-z0-9_.-]{4,}/g, 'AQ.***')
    .slice(0, 200)

export async function chatJson(o: ChatOptions): Promise<ModelReply> {
  const f = o.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs)
  let res: Response
  try {
    res = await f(o.url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({
        model: o.model,
        ...(o.temperature == null ? {} : { temperature: o.temperature }),
        //  JSON 객체로만 답하게 — 그래도 서버가 다시 엄격하게 검사합니다(triage.parseTriage).
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: o.system },
          { role: 'user', content: o.user },
        ],
      }),
    })
  } catch (e) {
    clearTimeout(timer)
    if (ctl.signal.aborted) throw new ProviderError('timeout', `AI 응답 시간 초과 (${Math.round(o.timeoutMs / 1000)}초)`)
    throw new ProviderError('network', `AI 서버에 연결하지 못했습니다 (${redact(String(e))})`)
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? ''
    const what =
      res.status === 401 ? 'AI 키가 올바르지 않습니다'
      : res.status === 429 ? 'AI 사용량 한도에 걸렸습니다'
      : res.status === 404 ? 'AI 모델 이름을 찾지 못했습니다 (AI_MODEL 확인)'
      : 'AI 서버 오류'
    throw new ProviderError('http', `${what} (${res.status})${msg ? ` — ${redact(msg)}` : ''}`, res.status)
  }
  const b = body as {
    model?: string
    choices?: { message?: { content?: unknown } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  } | null
  const text = b?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new ProviderError('format', 'AI 응답이 비어 있습니다')
  return {
    text,
    model: typeof b?.model === 'string' && b.model ? b.model : o.model,
    usage: { input: b?.usage?.prompt_tokens ?? null, output: b?.usage?.completion_tokens ?? null },
  }
}

// ─── triage.ts ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 순수 로직 (프롬프트 · 개인정보 가림 · 엄격한 결과 검사)
//
//  ⚠ 이 파일은 Deno 전용 기능을 쓰지 않습니다 — 같은 파일을 Node 검사
//    (test/ai/check_ai_triage_core.mjs)가 그대로 불러 시험합니다.
//
//  ── 역할 나눔 (비원미래 AX 의 AI 기준) ────────────────────────────────────
//   Rule / DB = 사실과 계산 (일정 · 배차 · 재고 · 정산 — 여기서 손대지 않음)
//   LLM       = 비정형 문장의 이해 · 요약 · 분류 · 문장 작성 (이 함수)
//
//  ── AI 가 하는 것 ────────────────────────────────────────────────────────
//   병원 요청 글 하나 → 요청 종류 · 긴급도 · 요약 · 핵심 요구사항 · 회신 초안 · 근거
//
//  ── AI 가 절대 하지 않는 것 ──────────────────────────────────────────────
//   일정 확정 · 배차 · 상태 변경 · 회신 전송 · 수거량 · 재고 · 정산 변경 · DB 수정.
//   이 함수에는 그런 쓰기 코드가 **없습니다.** 쓰는 곳은 ai_calls(호출 기록) 하나뿐입니다.
// ═══════════════════════════════════════════════════════════════════════════

/** 시스템 요청 종류 — client_requests.kind CHECK 값 그대로 (src/types RequestKind) */
export const REQUEST_KINDS = ['긴급수거', '추가수거', '소모품', '교육·자료', '기타'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]

/** 화면이 그대로 표시하는 긴급도 세 단계 */
export const URGENCIES = ['높음', '보통', '낮음'] as const
export type Urgency = (typeof URGENCIES)[number]

/** 모델에 보내는 요청 글 최대 길이 (그 뒤는 자릅니다) */
export const MAX_CONTENT = 2000

/** 병원 화면에서 쓰는 이름 — 모델이 「소모품」을 「자재·용기 요청」으로 이해하게 */
const KIND_HINT: Record<RequestKind, string> = {
  긴급수거: '긴급수거 (예상보다 빨리 찼을 때 · 빨리 와 달라는 수거)',
  추가수거: '추가수거 (정기 일정 외 한 번 더 수거)',
  소모품: '소모품 (자재·용기 요청 — 박스 · 봉투 · 바늘통 등)',
  '교육·자료': '교육·자료 (교육 · 증빙 · 서류 요청)',
  기타: '기타 (위에 해당하지 않는 문의 · 요청)',
}

export const SYSTEM_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 담당자의 업무 보조다.',
  '병원이 보낸 요청 글 하나를 읽고, 담당자가 빨리 이해하고 회신할 수 있도록 정리한다.',
  '너는 결정하지 않는다. 최종 판단 · 일정 확정 · 회신은 담당자가 한다.',
  '',
  '반드시 지킬 것:',
  '1. 요청 글에 없는 사실을 만들어내지 않는다.',
  '2. 수거 가능 여부를 확정하지 않는다. 「확인 후 안내」로 쓴다.',
  '3. 날짜 · 시간을 회사가 확정한 것처럼 쓰지 않는다. 병원이 원한 시점은 「원하신 시점」으로만 다시 말한다.',
  '4. 차량 배정 · 기사 · 도착 시각을 말하지 않는다.',
  '5. 자재 · 용기 재고가 있다고 가정하지 않는다. 「준비 가능 여부를 확인」으로 쓴다.',
  '6. 비용 · 단가 · 계약 조건을 말하지 않는다.',
  '7. 요청 글에 없는 숫자를 회신 초안에 쓰지 않는다.',
  '8. 애매하면 「확인 필요」라고 쓴다.',
  '9. 사람 이름 · 연락처 · 환자 정보는 요약과 초안에 다시 적지 않는다.',
  '',
  '좋은 초안 예: 「요청 확인했습니다. 내일 오전 방문 가능 여부를 확인한 뒤 안내드리겠습니다.」',
  '나쁜 초안 예: 「내일 오전 10시에 방문하겠습니다.」 (확정 약속 · 요청에 없는 시각)',
  '',
  '요청 종류는 아래 다섯 가지 값 중에서만 고른다:',
  ...REQUEST_KINDS.map((k) => `- "${k}": ${KIND_HINT[k]}`),
  '한 글에 두 가지가 섞이면 가장 중요한 것을 kind 에, 나머지를 also_kinds 에 넣는다.',
  '',
  '긴급도는 "높음" · "보통" · "낮음" 중 하나:',
  '- 높음: 보관 공간이 찼거나 곧 차서 빠른 수거가 필요하다고 쓴 경우, 오늘·내일처럼 급한 시점을 요청한 경우',
  '- 보통: 이번 주 안 등 일반적인 일정 요청',
  '- 낮음: 급하지 않은 문의 · 다음 방문 때 함께 처리해도 되는 요청',
  '- 판단이 애매하면 "보통"으로 하고 basis 에 「확인 필요」를 적는다.',
  '',
  '답은 아래 JSON 객체 하나로만 한다 (설명 문장 · 코드 블록 없이):',
  '{',
  '  "kind": "다섯 가지 중 하나",',
  '  "also_kinds": ["함께 들어 있는 다른 종류 (없으면 빈 배열)"],',
  '  "urgency": "높음 | 보통 | 낮음",',
  '  "summary": "요청 내용 요약 1~2문장",',
  '  "points": ["핵심 요구사항 짧게 (최대 4개)"],',
  '  "draft": "담당자가 고쳐 쓸 회신 초안 2~3문장, 존댓말, 확정 약속 없이",',
  '  "basis": "종류와 긴급도를 그렇게 본 근거 한 문장"',
  '}',
].join('\n')

export interface TriageRequest {
  content: string
  /** 병원이 고른 종류 (DB 값). 없으면 null */
  kind: string | null
  /** 병원이 「급함」 표시를 했는가 */
  urgent: boolean
  /** 병원이 적은 희망일 (YYYY-MM-DD). 없으면 null */
  desiredDate: string | null
}

export interface TriageOutput {
  kind: RequestKind
  alsoKinds: RequestKind[]
  urgency: Urgency
  summary: string
  points: string[]
  draft: string
  basis: string
}

/**
 * 모델에 보내기 전에 가립니다 — 전화번호 · 주민등록번호 · 메일.
 *  ⚠ 요청 분류에 필요 없는 정보입니다. 병원명 · 요청자 이름은 애초에 보내지 않습니다.
 */
export function scrub(text: string): string {
  return text
    .replace(/\b\d{6}\s*-\s*[1-4]\d{6}\b/g, '[주민번호 가림]')
    .replace(/(?:\+?82[-\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[전화번호 가림]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[메일 가림]')
}

/** 모델에 보내는 사용자 메시지 — 이것이 AI 가 읽는 **전부**입니다 (ai_calls.input 에 그대로 남김) */
export function buildUserMessage(r: TriageRequest): string {
  const kind = r.kind && (REQUEST_KINDS as readonly string[]).includes(r.kind) ? r.kind : null
  const body = scrub(r.content.trim()).slice(0, MAX_CONTENT)
  return [
    `병원이 고른 요청 종류: ${kind ?? '없음'}`,
    `병원의 「급함」 표시: ${r.urgent ? '있음' : '없음'}`,
    `병원이 적은 희망일: ${r.desiredDate ?? '없음'}`,
    '요청 글:',
    '"""',
    body,
    '"""',
  ].join('\n')
}

/** 회사 확정 약속처럼 읽히는 표현 — 초안에 있으면 쓰지 않습니다 */
export const PROMISE = /(확정|배차|배정|예약|접수\s*완료)\s*(되었|됐|했|하였)습니다|(방문|수거|도착|출발)(하겠습니다|해\s*드리겠습니다|드리겠습니다)|(가져다|갖다|보내|준비해)\s*드리겠습니다/

export const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((x) => x.replace(/,/g, ''))

/**
 * 숫자 + 단위 (「10시」 · 「10개」 · 「63L」).
 *  ⚠ 숫자만 보면 요청의 「10개」가 초안의 「10시」를 통과시킵니다 — 단위까지 같아야
 *    「요청에 있던 말」입니다.
 */
const UNIT = /(\d+(?:[.,]\d+)*)\s*(시|분|월|일|만\s*원|원|개|kg|킬로|톤|L|ℓ|리터|박스|봉투|회|번|차례|대|명|곳|%)/g
export const unitTokens = (s: string): string[] =>
  [...s.matchAll(UNIT)].map((m) => `${Number(m[1].replace(/,/g, ''))}${m[2].replace(/\s+/g, '')}`)

export const isStr = (v: unknown): v is string => typeof v === 'string'

export type ParseResult =
  | { ok: true; result: TriageOutput }
  | { ok: false; error: string; parsed?: unknown }

/**
 * 모델이 돌려준 글을 엄격하게 검사합니다.
 *
 *  ⚠ 필드가 빠지거나 값이 범위 밖이면 **실패**입니다. 「기타」·「보통」으로
 *    조용히 바꿔 성공처럼 보이게 하지 않습니다.
 *  ⚠ 초안에 요청 글에 없는 숫자가 있거나 확정 약속처럼 쓰였으면 실패입니다.
 *    고정 문구로 갈아끼우지 않습니다 — 담당자가 다시 시도하거나 직접 씁니다.
 *
 * @param source 모델에 보낸 요청 정보 — 「요청 글에 있던 숫자」를 가리는 기준
 */
export function parseTriage(raw: string, source: TriageRequest): ParseResult {
  let v: unknown
  try {
    v = JSON.parse(raw.trim())
  } catch {
    return { ok: false, error: 'AI 응답이 JSON 이 아닙니다' }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'AI 응답이 JSON 객체가 아닙니다' }
  const o = v as Record<string, unknown>
  const missing = ['kind', 'urgency', 'summary', 'draft', 'basis'].filter((k) => !isStr(o[k]) || !(o[k] as string).trim())
  if (missing.length) return { ok: false, error: `AI 응답에 빠진 항목: ${missing.join(', ')}`, parsed: v }

  const kind = (o.kind as string).trim()
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `요청 종류 값이 범위 밖입니다: ${kind.slice(0, 20)}`, parsed: v }
  const urgency = (o.urgency as string).trim()
  if (!(URGENCIES as readonly string[]).includes(urgency)) return { ok: false, error: `긴급도 값이 범위 밖입니다: ${urgency.slice(0, 20)}`, parsed: v }

  const alsoRaw = o.also_kinds ?? o.alsoKinds ?? []
  if (!Array.isArray(alsoRaw) || !alsoRaw.every(isStr)) return { ok: false, error: 'also_kinds 형식이 맞지 않습니다', parsed: v }
  const also = [...new Set(alsoRaw.map((x) => x.trim()))].filter((x) => x && x !== kind)
  const badAlso = also.filter((x) => !(REQUEST_KINDS as readonly string[]).includes(x))
  if (badAlso.length) return { ok: false, error: `함께 든 요청 종류 값이 범위 밖입니다: ${badAlso.join(', ').slice(0, 30)}`, parsed: v }

  const pointsRaw = o.points ?? []
  if (!Array.isArray(pointsRaw) || !pointsRaw.every(isStr)) return { ok: false, error: 'points 형식이 맞지 않습니다', parsed: v }
  const points = pointsRaw.map((x) => x.trim()).filter(Boolean)
  if (points.length > 4 || points.some((x) => x.length > 120)) return { ok: false, error: '핵심 요구사항이 너무 많거나 깁니다', parsed: v }

  const summary = (o.summary as string).trim()
  const draft = (o.draft as string).trim()
  const basis = (o.basis as string).trim()
  if (summary.length > 300) return { ok: false, error: '요약이 너무 깁니다 (300자 초과)', parsed: v }
  if (draft.length > 600) return { ok: false, error: '회신 초안이 너무 깁니다 (600자 초과)', parsed: v }
  if (basis.length > 300) return { ok: false, error: '근거가 너무 깁니다 (300자 초과)', parsed: v }

  //  ── 지어낸 숫자 · 확정 약속 막기 (프롬프트만 믿지 않습니다) ─────────────
  const allowed = new Set([...numbersIn(source.content), ...numbersIn(source.desiredDate ?? '')])
  //  날짜 2026-10-15 → 10 · 15 도 「있던 숫자」로 봅니다 (「10월 15일」로 다시 말하는 것은 괜찮음)
  for (const n of numbersIn(source.desiredDate ?? '')) for (const p of n.split('-')) allowed.add(String(Number(p)))
  const invented = numbersIn(draft).filter((x) => !allowed.has(x) && !allowed.has(String(Number(x))))
  if (invented.length) return { ok: false, error: `회신 초안에 요청 글에 없는 숫자(${[...new Set(invented)].join(', ')})가 있어 쓰지 않았습니다`, parsed: v }
  const allowedUnits = new Set(unitTokens(source.content))
  const dd = (source.desiredDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dd) { allowedUnits.add(`${Number(dd[2])}월`); allowedUnits.add(`${Number(dd[3])}일`) }
  const inventedUnits = unitTokens(draft).filter((x) => !allowedUnits.has(x))
  if (inventedUnits.length) return { ok: false, error: `회신 초안에 요청 글에 없는 표현(${[...new Set(inventedUnits)].join(', ')})이 있어 쓰지 않았습니다`, parsed: v }
  if (PROMISE.test(draft)) return { ok: false, error: '회신 초안이 회사의 확정 약속처럼 쓰여 쓰지 않았습니다', parsed: v }

  return {
    ok: true,
    result: { kind: kind as RequestKind, alsoKinds: also as RequestKind[], urgency: urgency as Urgency, summary, points, draft, basis },
  }
}

// ─── gemini.ts ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — Google Gemini 호출 (Gemini API 기본 REST · generateContent)
//
//  Google 문서(ai.google.dev/gemini-api/docs/api-key)대로:
//   · 주소  https://generativelanguage.googleapis.com/v1beta/models/<모델>:generateContent
//   · 인증  x-goog-api-key: <키>   — AI Studio 의 새 키(AQ.…)와 옛 키(AIza…) 모두 이 헤더
//     (새 AQ. 키는 Authorization: Bearer 로 보내면 401 로 거절된다는 보고가 많아 쓰지 않습니다)
//  JSON 은 responseMimeType: application/json 으로 받고, 받은 뒤 triage.parseTriage 가
//  다시 엄격하게 검사합니다(값 범위 · 빠진 칸 · 길이).
//  기본 모델은 이전 세대에서 가장 싼 gemini-2.5-flash-lite(무료 등급 있음). Google 이 그 모델을
//  내려 404 가 나면 같은 시간 안에서 한 번만 gemini-3.1-flash-lite(안정)로 다시 부릅니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════


export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
/** 이전 세대 · 가장 싼 모델 (무료 등급 있음) — 바꾸려면 AI_MODEL */
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash-lite'
/** 위 모델을 못 찾을 때(404) 한 번만 — Google 모델 목록의 「안정」 · 싼 모델 */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite'

/** AI Studio 에서 받은 Gemini 키 모양 — 새 키 AQ.… · 옛 키 AIza… */
export const looksLikeGeminiKey = (k: string) => k.startsWith('AQ.') || k.startsWith('AIza')

export type AiProvider = 'gemini' | 'anthropic' | 'openai'

/**
 * Secret 값으로 어느 회사 · 어느 모델 · 어느 주소로 부를지 — index.ts 가 한 번 부릅니다.
 *  AI_PROVIDER 가 있으면 그것, 없으면 키 모양(AQ.… · AIza… = gemini · sk-ant-… = anthropic · 그 밖 = openai).
 */
export function pickAi(env: { key?: string; provider?: string; model?: string; url?: string }): {
  provider: AiProvider
  model: string
  url: string
} {
  const key = (env.key ?? '').trim()
  const p = (env.provider ?? '').trim().toLowerCase()
  const provider: AiProvider =
    p === 'gemini' || p === 'google' || (!p && looksLikeGeminiKey(key)) ? 'gemini'
    : p === 'anthropic' || p === 'claude' || (!p && key.startsWith('sk-ant-')) ? 'anthropic'
    : 'openai'
  const model = (env.model ?? '').trim() ||
    (provider === 'gemini' ? GEMINI_DEFAULT_MODEL : provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-4o-mini')
  const url = (env.url ?? '').trim() ||
    (provider === 'gemini' ? GEMINI_BASE : provider === 'anthropic' ? '' : 'https://api.openai.com/v1/chat/completions')
  return { provider, model, url }
}

export interface GeminiOptions {
  apiKey: string
  /** 기본 GEMINI_BASE (…/v1beta) — 시험 때만 바꿈 */
  base: string
  model: string
  /** 404(모델 없음)일 때 한 번만 이 모델로. 없으면 다시 부르지 않음 */
  fallbackModel?: string | null
  system: string
  user: string
  timeoutMs: number
  /** null 이면 보내지 않음 */
  temperature: number | null
  fetchImpl?: typeof fetch
}

type GeminiBody = {
  candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  modelVersion?: string
  error?: { code?: number; message?: string; status?: string }
}

export async function geminiJson(o: GeminiOptions): Promise<ModelReply> {
  const f = o.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs)
  const timeoutErr = () => new ProviderError('timeout', `AI 응답 시간 초과 (${Math.round(o.timeoutMs / 1000)}초)`)

  const send = async (model: string): Promise<{ res: Response; body: GeminiBody | null }> => {
    let res: Response
    try {
      res = await f(`${o.base.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: o.system }] },
          contents: [{ role: 'user', parts: [{ text: o.user }] }],
          generationConfig: {
            ...(o.temperature == null ? {} : { temperature: o.temperature }),
            //  JSON 으로만 답하게 — 그래도 서버가 다시 엄격하게 검사합니다(triage.parseTriage).
            responseMimeType: 'application/json',
          },
        }),
      })
    } catch (e) {
      if (ctl.signal.aborted) throw timeoutErr()
      throw new ProviderError('network', `AI 서버에 연결하지 못했습니다 (${redact(String(e))})`)
    }
    let body: GeminiBody | null = null
    try {
      body = (await res.json()) as GeminiBody
    } catch {
      if (ctl.signal.aborted) throw timeoutErr()
      body = null
    }
    return { res, body }
  }

  let used = o.model
  let res: Response
  let body: GeminiBody | null
  try {
    ;({ res, body } = await send(used))
    if (res.status === 404 && o.fallbackModel && o.fallbackModel !== used) {
      used = o.fallbackModel
      ;({ res, body } = await send(used))
    }
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const msg = typeof body?.error?.message === 'string' ? body.error.message : ''
    const st = typeof body?.error?.status === 'string' ? body.error.status : ''
    const keyBad = res.status === 401 || (res.status === 400 && /api[ _-]?key|API_KEY_INVALID/i.test(`${msg} ${st}`))
    const what =
      keyBad ? 'AI 키가 올바르지 않습니다'
      : res.status === 403 ? 'AI 키에 이 모델을 쓸 권한이 없습니다 (키 · 프로젝트 설정 확인)'
      : res.status === 429 ? 'AI 사용량 한도에 걸렸습니다'
      : res.status === 404 ? 'AI 모델 이름을 찾지 못했습니다 (AI_MODEL 확인)'
      : res.status === 503 ? 'AI 서버가 바쁩니다 — 잠시 뒤 다시 눌러 주세요'
      : 'AI 서버 오류'
    throw new ProviderError('http', `${what} (${res.status})${msg ? ` — ${redact(msg)}` : ''}`, res.status)
  }

  if (body?.promptFeedback?.blockReason) {
    throw new ProviderError('format', `AI 가 이 요청의 분석을 거절했습니다 (${redact(body.promptFeedback.blockReason)})`)
  }
  const cand = body?.candidates?.[0]
  //  생각 조각(thought)은 빼고 답 글만
  const text = (cand?.content?.parts ?? [])
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
  if (!text.trim()) {
    const why = cand?.finishReason && cand.finishReason !== 'STOP' ? ` (${redact(cand.finishReason)})` : ''
    throw new ProviderError('format', `AI 응답이 비어 있습니다${why}`)
  }
  return {
    text,
    model: typeof body?.modelVersion === 'string' && body.modelVersion ? body.modelVersion : used,
    usage: { input: body?.usageMetadata?.promptTokenCount ?? null, output: body?.usageMetadata?.candidatesTokenCount ?? null },
  }
}

// ─── assist.ts ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 업무 보조 AI 세 가지 (0141 · 신보 발표 · 실제 Gemini 호출)
//
//   briefing    오늘 브리핑      — 대시보드 숫자(건수 · 금액)만 읽고 「오늘 먼저 챙길 일」 셋
//   field_note  현장 메모 정리   — 기사님이 적은 메모를 사무실이 바로 쓸 수 있게 정리
//   dunning     독촉 문자 초안   — 병원 이름 · 금액은 **보내지 않고** 자리표시자({병원명} · {금액})로
//
//  ⚠ 셋 다 **제안**입니다. 저장 · 전송 · 상태 변경을 하는 코드가 없습니다 — 담당자가 고르고 고쳐 씁니다.
//  ⚠ 결과는 엄격하게 검사합니다(프롬프트만 믿지 않음). 받은 글에 없는 숫자 · 확정 약속 · 범위 밖 값이면
//    **실패**로 돌려보냅니다 — 고정 문구로 갈아끼워 성공처럼 보이게 하지 않습니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════


export const ASSIST_TASKS = ['briefing', 'field_note', 'dunning'] as const
export type AssistTask = (typeof ASSIST_TASKS)[number]

/** ai_calls.kind — 병원 요청 분석(request_triage)과 섞이지 않게 따로 */
export const ASSIST_KIND: Record<AssistTask, string> = {
  briefing: 'today_briefing',
  field_note: 'field_note',
  dunning: 'dunning_draft',
}

type Ok<T> = { ok: true; value: T }
type Bad = { ok: false; error: string }
const bad = (error: string): Bad => ({ ok: false, error })

const COMMON_RULES = [
  '반드시 지킬 것:',
  '- 받은 글에 없는 사실 · 숫자를 만들어내지 않는다. 숫자는 받은 글에 있는 것만 그대로 쓴다.',
  '- 회사가 확정한 것처럼 약속하지 않는다 (「방문하겠습니다」 「배차했습니다」 금지). 확인이 필요하면 「확인 필요」로 쓴다.',
  '- 사람 이름 · 연락처를 새로 적지 않는다.',
  '- 답은 JSON 객체 하나로만 한다 (설명 문장 · 코드 블록 없이).',
]

/** 원 단위 금액 → 「1억 1,871만 원」 (AI 가 읽기 쉬운 말 — 원래 숫자도 함께 보냅니다) */
export function wonWords(n: number): string {
  const v = Math.round(n)
  if (v < 10_000) return `${v.toLocaleString('en-US')}원`
  const eok = Math.floor(v / 100_000_000)
  const man = Math.floor((v % 100_000_000) / 10_000)
  return [eok ? `${eok}억` : '', man ? `${man.toLocaleString('en-US')}만` : ''].filter(Boolean).join(' ') + ' 원'
}

const int = (v: unknown, max = 1e12): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null

/** 결과 글 전체에서 받은 글에 없는 숫자 · 단위 표현을 찾습니다 */
function inventedNumbers(out: string, source: string, extra: string[] = []): string[] {
  const allowed = new Set([...numbersIn(source), ...extra])
  for (const n of numbersIn(source)) allowed.add(String(Number(n)))
  return [...new Set(numbersIn(out).filter((x) => !allowed.has(x) && !allowed.has(String(Number(x)))))]
}

function parseJson(raw: string): Ok<Record<string, unknown>> | Bad {
  let v: unknown
  try {
    v = JSON.parse(raw.trim())
  } catch {
    return bad('AI 응답이 JSON 이 아닙니다')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('AI 응답이 JSON 객체가 아닙니다')
  return { ok: true, value: v as Record<string, unknown> }
}

const strArr = (v: unknown, max: number, each: number): string[] | null => {
  if (v == null) return []
  if (!Array.isArray(v) || !v.every(isStr)) return null
  const a = v.map((x) => x.trim()).filter(Boolean)
  return a.length <= max && a.every((x) => x.length <= each) ? a : null
}

// ─────────────────────────────────────────────────────────────────────────────
//  ① 오늘 브리핑
// ─────────────────────────────────────────────────────────────────────────────

export interface BriefingInput {
  date: string
  visitsPlanned: number
  visitsDone: number
  openRequests: number
  urgentRequests: number
  /** 처리 전 요청 — 종류별 건수 */
  requestKinds: Record<string, number>
  /** 다음 방문이 안 잡힌 거래처 수 */
  unscheduledClients: number
  /** 지난달 이전 청구가 남은 거래처 수 · 금액(원) */
  overdueClients: number
  overdueAmount: number
}

export interface BriefingOutput {
  headline: string
  items: { title: string; detail: string }[]
  note: string
}

export function readBriefing(v: unknown): Ok<BriefingInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const date = isStr(o.date) && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null
  const nums = ['visitsPlanned', 'visitsDone', 'openRequests', 'urgentRequests', 'unscheduledClients', 'overdueClients', 'overdueAmount'] as const
  const got: Record<string, number> = {}
  for (const k of nums) {
    const n = int(o[k])
    if (n == null) return bad(`브리핑 숫자가 맞지 않습니다 (${k})`)
    got[k] = n
  }
  const kinds: Record<string, number> = {}
  const rk = (o.requestKinds ?? {}) as Record<string, unknown>
  if (typeof rk !== 'object' || Array.isArray(rk)) return bad('요청 종류별 건수 형식이 맞지 않습니다')
  for (const [k, c] of Object.entries(rk)) {
    if (!(REQUEST_KINDS as readonly string[]).includes(k)) return bad(`모르는 요청 종류: ${k.slice(0, 12)}`)
    const n = int(c, 100_000)
    if (n == null) return bad('요청 종류별 건수가 맞지 않습니다')
    if (n > 0) kinds[k] = n
  }
  if (!date) return bad('브리핑 날짜가 맞지 않습니다')
  return { ok: true, value: { date, ...(got as Omit<BriefingInput, 'date' | 'requestKinds'>), requestKinds: kinds } }
}

export const BRIEFING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 대표의 아침 업무 보조다.',
  '아래 「오늘 운영 숫자」만 보고, 대표가 오늘 먼저 챙길 일을 우선순위대로 최대 3가지 정리한다.',
  '우선순위 기준: 긴급 요청 → 오늘 남은 방문 → 처리 전 요청 → 다음 방문이 안 잡힌 거래처 → 지난 청구 미수. 0 인 항목은 쓰지 않는다.',
  ...COMMON_RULES,
  '- 거래처 이름은 받지 않았으므로 쓰지 않는다. 「~곳」 「~건」처럼 숫자로만 말한다.',
  '',
  '답 형식:',
  '{',
  '  "headline": "오늘을 한 문장으로 (40자 안팎)",',
  '  "items": [{ "title": "먼저 챙길 일 (20자 안팎)", "detail": "왜 · 무엇을 (60자 안팎)" }],',
  '  "note": "덧붙일 한 마디 (없으면 빈 글)"',
  '}',
].join('\n')

export function briefingMessage(b: BriefingInput): string {
  const kinds = Object.entries(b.requestKinds).map(([k, n]) => `${k} ${n}건`).join(', ') || '없음'
  return [
    `오늘 날짜: ${b.date}`,
    `오늘 예정 방문: ${b.visitsPlanned}곳 (완료 ${b.visitsDone}곳 · 남은 ${Math.max(0, b.visitsPlanned - b.visitsDone)}곳)`,
    `처리 전 병원 요청: ${b.openRequests}건 (그중 긴급 ${b.urgentRequests}건)`,
    `처리 전 요청 종류: ${kinds}`,
    `다음 방문이 안 잡힌 거래처: ${b.unscheduledClients}곳`,
    `지난달 이전 청구가 남은 거래처: ${b.overdueClients}곳 · 금액 ${wonWords(b.overdueAmount)} (${b.overdueAmount.toLocaleString('en-US')}원)`,
  ].join('\n')
}

export function parseBriefing(raw: string, message: string): Ok<BriefingOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const headline = isStr(o.headline) ? o.headline.trim() : ''
  if (!headline || headline.length > 120) return bad('브리핑 첫 문장이 없거나 너무 깁니다')
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 3) return bad('먼저 챙길 일은 1~3개여야 합니다')
  const items: BriefingOutput['items'] = []
  for (const it of o.items) {
    const t = (it ?? {}) as Record<string, unknown>
    const title = isStr(t.title) ? t.title.trim() : ''
    const detail = isStr(t.detail) ? t.detail.trim() : ''
    if (!title || title.length > 60 || detail.length > 160) return bad('먼저 챙길 일 형식이 맞지 않습니다')
    items.push({ title, detail })
  }
  const note = isStr(o.note) ? o.note.trim() : ''
  if (note.length > 160) return bad('덧붙인 말이 너무 깁니다')
  const all = [headline, note, ...items.flatMap((x) => [x.title, x.detail])].join('\n')
  //  「1순위 · 2순위 · 3가지」 같은 차례 숫자는 허용
  const inv = inventedNumbers(all, message, ['1', '2', '3'])
  if (inv.length) return bad(`브리핑에 받은 숫자에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('브리핑이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { headline, items, note } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ② 현장 메모 정리
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_MAX = 600
export const FOLLOW_KINDS = ['추가수거', '자재·용기', '일정 확인', '병원 연락', '기타'] as const

export interface FieldNoteOutput {
  summary: string
  issues: string[]
  followups: { kind: (typeof FOLLOW_KINDS)[number]; text: string }[]
  cleaned: string
}

export function readFieldNote(v: unknown): Ok<{ memo: string }> | Bad {
  const memo = isStr((v as { memo?: unknown } | null)?.memo) ? scrub(((v as { memo: string }).memo).trim()).slice(0, FIELD_MAX) : ''
  if (memo.length < 4) return bad('정리할 메모가 너무 짧습니다 (4자 이상)')
  return { ok: true, value: { memo } }
}

export const FIELD_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 업무 보조다.',
  '현장 기사가 수거하면서 급하게 적은 메모를 읽고, 사무실이 바로 쓸 수 있게 정리한다.',
  ...COMMON_RULES,
  '- 메모에 없는 후속 조치는 만들지 않는다. 메모가 말한 것만 「후속 조치 제안」으로 옮긴다.',
  '',
  `후속 조치 종류는 다음 중에서만: ${FOLLOW_KINDS.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "summary": "메모 요약 한 문장",',
  '  "issues": ["확인할 특이사항 짧게 (없으면 빈 배열, 최대 4개)"],',
  '  "followups": [{ "kind": "종류 하나", "text": "무엇을 (짧게)" }],',
  '  "cleaned": "수거 기록의 특이사항 칸에 넣을 깔끔한 한두 문장"',
  '}',
].join('\n')

export const fieldMessage = (memo: string) => ['현장 메모:', '"""', memo, '"""'].join('\n')

export function parseFieldNote(raw: string, memo: string): Ok<FieldNoteOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const summary = isStr(o.summary) ? o.summary.trim() : ''
  const cleaned = isStr(o.cleaned) ? o.cleaned.trim() : ''
  if (!summary || summary.length > 200) return bad('메모 요약이 없거나 너무 깁니다')
  if (!cleaned || cleaned.length > 300) return bad('정리본이 없거나 너무 깁니다')
  const issues = strArr(o.issues, 4, 100)
  if (!issues) return bad('특이사항 형식이 맞지 않습니다')
  if (o.followups != null && !Array.isArray(o.followups)) return bad('후속 조치 형식이 맞지 않습니다')
  const followups: FieldNoteOutput['followups'] = []
  for (const f of (o.followups as unknown[] | undefined) ?? []) {
    const x = (f ?? {}) as Record<string, unknown>
    const kind = isStr(x.kind) ? x.kind.trim() : ''
    const text = isStr(x.text) ? x.text.trim() : ''
    if (!(FOLLOW_KINDS as readonly string[]).includes(kind)) return bad(`후속 조치 종류가 범위 밖입니다: ${kind.slice(0, 12)}`)
    if (!text || text.length > 100) return bad('후속 조치 글이 없거나 너무 깁니다')
    followups.push({ kind: kind as FieldNoteOutput['followups'][number]['kind'], text })
  }
  if (followups.length > 3) return bad('후속 조치는 3개까지입니다')
  const all = [summary, cleaned, ...issues, ...followups.map((f) => f.text)].join('\n')
  const inv = inventedNumbers(all, memo)
  if (inv.length) return bad(`정리본에 메모에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  const okUnits = new Set(unitTokens(memo))
  const invU = [...new Set(unitTokens(all).filter((x) => !okUnits.has(x)))]
  if (invU.length) return bad(`정리본에 메모에 없는 표현(${invU.join(', ')})이 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('정리본이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { summary, issues, followups, cleaned } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ③ 독촉 문자 초안 — 병원 이름 · 금액은 보내지 않음
// ─────────────────────────────────────────────────────────────────────────────

export const DUNNING_TONES = ['soft', 'firm'] as const
export interface DunningInput {
  months: number
  oldestMonth: string
  tone: (typeof DUNNING_TONES)[number]
}

export function readDunning(v: unknown): Ok<DunningInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const months = int(o.months, 120)
  if (!months) return bad('밀린 개월 수가 맞지 않습니다')
  if (!isStr(o.oldestMonth) || !/^\d{4}-\d{2}$/.test(o.oldestMonth)) return bad('가장 오래된 청구월이 맞지 않습니다 (YYYY-MM)')
  const tone = (DUNNING_TONES as readonly string[]).includes(o.tone as string) ? (o.tone as DunningInput['tone']) : null
  if (!tone) return bad('말투가 맞지 않습니다 (soft · firm)')
  return { ok: true, value: { months, oldestMonth: o.oldestMonth, tone } }
}

export const DUNNING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」가 거래 병원에 보낼 미납 안내 문자의 초안을 쓴다.',
  '병원 이름은 반드시 {병원명}, 미납 금액은 반드시 {금액} 이라는 글자 그대로 둔다 (실제 값은 담당자 화면에서 채운다).',
  '반드시 지킬 것:',
  '- 법적 조치 · 연체 이자 · 거래 중단 같은 위협을 쓰지 않는다. 계좌번호 · 전화번호 · 날짜 기한을 새로 만들지 않는다.',
  '- 받은 글에 없는 숫자를 쓰지 않는다.',
  '- 4~6문장, 존댓말. 문자로 보내기 좋게 짧게.',
  '- 답은 JSON 객체 하나로만: { "message": "문자 초안" }',
].join('\n')

export function dunningMessageInput(d: DunningInput): string {
  const [y, m] = d.oldestMonth.split('-').map(Number)
  return [
    `밀린 기간: ${y}년 ${m}월 청구분부터 ${d.months}개월`,
    `말투: ${d.tone === 'soft' ? '부드럽고 정중하게 (처음 안내)' : '정중하지만 분명하게 (여러 번 안내한 뒤)'}`,
  ].join('\n')
}

export function parseDunning(raw: string, input: string): Ok<{ message: string }> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const message = isStr(j.value.message) ? j.value.message.trim() : ''
  if (!message || message.length > 500) return bad('문자 초안이 없거나 너무 깁니다')
  if (!message.includes('{병원명}') || !message.includes('{금액}')) return bad('문자 초안에 {병원명} · {금액} 자리가 없어 쓰지 않았습니다')
  const inv = inventedNumbers(message.replace(/\{[^}]*\}/g, ''), input)
  if (inv.length) return bad(`문자 초안에 받은 글에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (/법적|소송|고소|연체\s*이자|거래\s*중단|압류/.test(message)) return bad('문자 초안에 위협하는 표현이 있어 쓰지 않았습니다')
  return { ok: true, value: { message } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  한 곳에서 고르기
// ─────────────────────────────────────────────────────────────────────────────

export interface AssistPlan {
  system: string
  message: string
  parse(raw: string): Ok<unknown> | Bad
}

export function planAssist(task: AssistTask, input: unknown): Ok<AssistPlan> | Bad {
  if (task === 'briefing') {
    const r = readBriefing(input)
    if (!r.ok) return r
    const message = briefingMessage(r.value)
    return { ok: true, value: { system: BRIEFING_PROMPT, message, parse: (raw) => parseBriefing(raw, message) } }
  }
  if (task === 'field_note') {
    const r = readFieldNote(input)
    if (!r.ok) return r
    return { ok: true, value: { system: FIELD_PROMPT, message: fieldMessage(r.value.memo), parse: (raw) => parseFieldNote(raw, r.value.memo) } }
  }
  const r = readDunning(input)
  if (!r.ok) return r
  const message = dunningMessageInput(r.value)
  return { ok: true, value: { system: DUNNING_PROMPT, message, parse: (raw) => parseDunning(raw, message) } }
}

// ─── handler.ts ────────────────────────────────────────────────────────────
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

  //  ── 4. 모델 호출 ─────────────────────────────────────────────────────
  let reply: ModelReply
  try {
    reply = await d.callModel(SYSTEM_PROMPT, input)
  } catch (e) {
    const error = e instanceof ProviderError ? e.message : `AI 호출 실패 (${String(e).slice(0, 120)})`
    const status = e instanceof ProviderError && e.code === 'timeout' ? 504 : 502
    const callId = await log({ output: null, model: d.model, ok: false, error })
    return { status, body: { error, callId, ms: d.now() - t0 } }
  }

  //  ── 5. 결과 검사 — 깨졌거나 빠졌으면 실패 ───────────────────────────────
  const parsed = parseTriage(reply.text, source)
  if (!parsed.ok) {
    const callId = await log({
      output: { raw: reply.text.slice(0, 2000), usage: reply.usage },
      model: reply.model,
      ok: false,
      error: parsed.error,
    })
    return { status: 502, body: { error: parsed.error, callId, ms: d.now() - t0 } }
  }

  const result: TriageOutput & { model: string } = { ...parsed.result, model: reply.model }
  const callId = await log({ output: { ...parsed.result, usage: reply.usage }, model: reply.model, ok: true, error: '' })
  return { status: 200, body: { ok: true, result, callId, logged: callId != null, ms: d.now() - t0, demo: req.demo } }
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
  let reply: ModelReply
  try {
    reply = await d.callModel(system, message)
  } catch (e) {
    const error = e instanceof ProviderError ? e.message : `AI 호출 실패 (${String(e).slice(0, 120)})`
    const status = e instanceof ProviderError && e.code === 'timeout' ? 504 : 502
    const callId = await log({ output: null, model: d.model, ok: false, error })
    return { status, body: { error, callId, ms: d.now() - t0 } }
  }
  const parsed = parse(reply.text)
  if (!parsed.ok) {
    const callId = await log({ output: { raw: reply.text.slice(0, 2000), usage: reply.usage }, model: reply.model, ok: false, error: parsed.error })
    return { status: 502, body: { error: parsed.error, callId, ms: d.now() - t0 } }
  }
  const callId = await log({ output: { ...(parsed.value as object), usage: reply.usage }, model: reply.model, ok: true, error: '' })
  return { status: 200, body: { ok: true, task, result: { ...(parsed.value as object), model: reply.model }, callId, logged: callId != null, ms: d.now() - t0 } }
}

// ─── index.ts ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  Edge Function: ai-triage — 병원 요청 AI 분석 (업무 보조)
//
//  고객 요청 화면 「AI 요청 분석」이 부릅니다:
//    supabase.functions.invoke('ai-triage', { body: { requestId } })
//  0141 — 업무 보조 AI 도 같은 함수입니다(배포 한 번):
//    { task: 'briefing' | 'field_note' | 'dunning', input: {...} }  → handler.ts handleAssist · assist.ts
//
//  처리 흐름 · 권한 · 기록 규칙은 handler.ts, 프롬프트 · 결과 검사는 triage.ts,
//  모델 호출은 gemini.ts(Google) · anthropic.ts(Claude) · provider.ts(OpenAI 호환) 에 있습니다. 이 파일은 Supabase 와 fetch 를 이어 줄 뿐입니다.
//
//  ── Secret (supabase secrets set …) ───────────────────────────────────
//   AI_API_KEY      필수. 모델 회사 API 키 — 서버에만 둡니다(브라우저 · 저장소 금지)
//   AI_PROVIDER     선택. gemini | anthropic | openai — 비우면 키 모양으로 고름
//                         (AQ.… · AIza… = gemini · sk-ant-… = anthropic · 그 밖 = openai)
//   AI_MODEL        선택. 기본 gemini=gemini-2.5-flash-lite · anthropic=claude-opus-5-5 · openai=gpt-4o-mini
//   AI_API_URL      선택. gemini: 기본 https://generativelanguage.googleapis.com/v1beta (시험 때만 바꿈)
//                         openai: 기본 https://api.openai.com/v1/chat/completions (OpenAI 호환 주소면 무엇이든)
//                         anthropic: 비우면 Anthropic 기본 주소 (시험 때만 바꿈)
//   AI_TEMPERATURE  선택. gemini · openai · 기본 0.2 · 빈 값이면 보내지 않음 (temperature 를 안 받는 모델)
//   SUPABASE_URL · SUPABASE_ANON_KEY 는 Supabase 가 자동으로 넣어 줍니다.
//
//  ⚠ 사용자의 로그인 토큰으로 DB 를 읽고 씁니다(관리자 권한 키를 쓰지 않음) —
//    RLS 가 그대로 걸립니다. 직원이 못 읽는 것은 이 함수도 못 읽습니다.
//  배포 · 시험 절차: 같은 폴더 README.md
// ═══════════════════════════════════════════════════════════════════════════


const KEY0 = (Deno.env.get('AI_API_KEY') ?? '').trim()
const { provider: PROVIDER, model: MODEL, url: API_URL } = pickAi({
  key: KEY0,
  provider: Deno.env.get('AI_PROVIDER'),
  model: Deno.env.get('AI_MODEL'),
  url: Deno.env.get('AI_API_URL'),
})
const TEMP_RAW = Deno.env.get('AI_TEMPERATURE')
const TEMPERATURE = TEMP_RAW === '' ? null : Number.isFinite(Number(TEMP_RAW ?? '0.2')) ? Number(TEMP_RAW ?? '0.2') : 0.2
//  화면은 35초까지 기다립니다 — 서버가 먼저 끝내고 실패를 기록하도록 20초.
const MODEL_TIMEOUT_MS = 20_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return json({ error: 'POST 만 받습니다' }, 405)

  try {
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let body: unknown = null
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const key = KEY0

    const deps: TriageDeps = {
      getUser: async () => {
        if (!token) return null
        const { data } = await sb.auth.getUser(token)
        return data.user ? { id: data.user.id } : null
      },
      getProfile: async (id) => {
        const { data } = await sb.from('profiles').select('role, active, name').eq('id', id).maybeSingle()
        return data ? { role: String(data.role), active: Boolean(data.active), name: String(data.name ?? '') } : null
      },
      getRequest: async (id) => {
        //  ⚠ 필요한 칸만 읽습니다 — 병원명 · 요청자 이름은 읽지도 않습니다.
        const { data } = await sb
          .from('client_requests')
          .select('id, client_id, content, kind, urgent, desired_date, demo_session_id')
          .eq('id', id)
          .maybeSingle()
        if (!data) return null
        let demo = !!data.demo_session_id
        if (!demo) {
          const { data: c } = await sb.from('clients').select('is_demo_generated').eq('id', data.client_id).maybeSingle()
          demo = !!c?.is_demo_generated
        }
        return {
          id: String(data.id),
          content: String(data.content ?? ''),
          kind: data.kind ? String(data.kind) : null,
          urgent: Boolean(data.urgent),
          desiredDate: data.desired_date ? String(data.desired_date).slice(0, 10) : null,
          demo,
        }
      },
      insertCall: async (row) => {
        const { data, error } = await sb.from('ai_calls').insert(row).select('id').maybeSingle()
        if (error) {
          console.error('ai_calls 기록 실패', error.message)
          return null
        }
        return data ? String(data.id) : null
      },
      callModel: (system, user) =>
        PROVIDER === 'anthropic'
          ? Promise.reject(new ProviderError('http', 'Claude 키는 대시보드 붙여넣기 판에서 쓰지 않습니다 — Gemini 키(AQ.… · AIza…)를 넣거나 CLI 로 배포해 주세요'))
          : PROVIDER === 'gemini'
          ? geminiJson({
              apiKey: key, base: API_URL, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS, temperature: TEMPERATURE,
              //  기본 모델을 Google 이 내렸을 때(404)만 한 번 — AI_MODEL 을 직접 정했으면 그대로
              fallbackModel: MODEL === GEMINI_DEFAULT_MODEL ? GEMINI_FALLBACK_MODEL : null,
            })
          : chatJson({ apiKey: key, url: API_URL, model: MODEL, system, user, timeoutMs: MODEL_TIMEOUT_MS, temperature: TEMPERATURE }),
      hasKey: key.length > 0,
      model: MODEL,
      now: () => Date.now(),
    }
    //  0141 — task 가 있으면 업무 보조 AI(오늘 브리핑 · 현장 메모 · 독촉 문자), 없으면 병원 요청 분석
    const task = (body as { task?: unknown } | null)?.task
    const res = typeof task === 'string' && task !== 'triage' ? await handleAssist(body, deps) : await handleTriage(body, deps)
    return json(res.body, res.status)
  } catch (e) {
    return json({ error: `처리 실패: ${String(e).slice(0, 200)}` }, 500)
  }
})
