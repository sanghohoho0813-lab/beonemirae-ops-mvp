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

/**
 * 0142 안정화 — 이 계정에 없다고(404) 확인된 모델. 같은 서버가 살아 있는 동안 기억해 두고
 *  다음 호출은 바로 대신 모델로 갑니다(매번 404 를 한 번씩 치르지 않게).
 */
const MISSING_MODELS = new Set<string>()
/** 검사용 — 기억을 비웁니다 */
export const resetGeminiMemo = () => MISSING_MODELS.clear()

/** 「잠깐 바쁨」으로 보는 응답 — 한 번만 다시 보냅니다 (같은 시간 한도 안에서) */
const TRANSIENT = new Set([500, 503])
const TRANSIENT_WAIT_MS = 700

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

  const canFallback = !!o.fallbackModel && o.fallbackModel !== o.model
  let used = canFallback && MISSING_MODELS.has(o.model) ? o.fallbackModel! : o.model
  let res: Response
  let body: GeminiBody | null
  try {
    ;({ res, body } = await send(used))
    if (res.status === 404 && canFallback && used === o.model) {
      MISSING_MODELS.add(o.model)
      used = o.fallbackModel!
      ;({ res, body } = await send(used))
    }
    //  Gemini 무료 사용량에서 가끔 오는 「잠깐 바쁨(503)」— 짧게 쉬고 한 번만 다시 (시간 한도 그대로)
    if (TRANSIENT.has(res.status) && !ctl.signal.aborted) {
      await new Promise((r) => setTimeout(r, TRANSIENT_WAIT_MS))
      if (!ctl.signal.aborted) ({ res, body } = await send(used))
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
//   request_plan 요청 처리 계획 (0142) — 요청 글 + 시스템 자료(그날 차량별 방문 · 사무실 재고 · 이 병원 이력)로
//                「원하는 것 · 처리 순서 · 주의 · 구체 회신」. 병원 이름 · 기사 이름은 보내지 않음
//
//  0142 — 대표님: 「AI 버튼이 너무 간단한 업무만 돕는다. 누가 봐도 와! 하게 디테일까지 관여해서」.
//   · 브리핑: 차량별 남은 방문 · 오래 기다린 요청까지 보고, 할 일마다 「언제 · 어느 화면」을 붙임
//   · 메모 정리: 메모에서 수거량 · 가져온 용기 · 주고 온 자재 · 인계 상태를 뽑아 **수거 입력 칸 채우기 제안**
//   · 요청 처리 계획: 위
//   ⚠ 숫자는 여전히 받은 글 · 받은 자료에 있는 것만. 칸 채우기 · 일정 · 회신은 모두 **담당자가 눌러야** 반영.
//
//  ⚠ 셋 다 **제안**입니다. 저장 · 전송 · 상태 변경을 하는 코드가 없습니다 — 담당자가 고르고 고쳐 씁니다.
//  ⚠ 결과는 엄격하게 검사합니다(프롬프트만 믿지 않음). 받은 글에 없는 숫자 · 확정 약속 · 범위 밖 값이면
//    **실패**로 돌려보냅니다 — 고정 문구로 갈아끼워 성공처럼 보이게 하지 않습니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════


export const ASSIST_TASKS = ['briefing', 'field_note', 'dunning', 'request_plan'] as const
export type AssistTask = (typeof ASSIST_TASKS)[number]

/** ai_calls.kind — 병원 요청 분석(request_triage)과 섞이지 않게 따로 */
export const ASSIST_KIND: Record<AssistTask, string> = {
  briefing: 'today_briefing',
  field_note: 'field_note',
  dunning: 'dunning_draft',
  request_plan: 'request_plan',
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
  /** 0142 — 차량별 오늘 남은 방문 (차량 이름 · 곳 수). 기사 이름은 보내지 않음 */
  vehicles: { label: string; left: number }[]
  /** 0142 — 처리 전 요청 중 가장 오래 기다린 시간(시간 단위) · 하루 넘게 기다린 건수 */
  oldestOpenHours: number | null
  staleRequests: number
}

/** 브리핑 할 일마다 붙는 「어느 화면」 — 화면이 단추로 바꿉니다 */
export const BRIEF_GO = ['요청함', '오늘 일정', '수거 입력', '방문 계획', '미수금'] as const
export const BRIEF_WHEN = ['지금', '오전', '오후', '마감 전'] as const

export interface BriefingOutput {
  headline: string
  items: { title: string; detail: string; when: (typeof BRIEF_WHEN)[number] | null; go: (typeof BRIEF_GO)[number] | null }[]
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
  //  0142 — 없어도 됩니다(옛 화면). 있으면 모양을 확인합니다.
  const vehicles: BriefingInput['vehicles'] = []
  if (o.vehicles != null) {
    if (!Array.isArray(o.vehicles) || o.vehicles.length > 12) return bad('차량별 남은 방문 형식이 맞지 않습니다')
    for (const v of o.vehicles) {
      const x = (v ?? {}) as Record<string, unknown>
      const label = isStr(x.label) ? x.label.trim().slice(0, 30) : ''
      const left = int(x.left, 500)
      if (!label || left == null) return bad('차량별 남은 방문 형식이 맞지 않습니다')
      vehicles.push({ label, left })
    }
  }
  const oldestOpenHours = o.oldestOpenHours == null ? null : int(o.oldestOpenHours, 24 * 365)
  if (o.oldestOpenHours != null && oldestOpenHours == null) return bad('가장 오래 기다린 요청 시간이 맞지 않습니다')
  const staleRequests = o.staleRequests == null ? 0 : int(o.staleRequests, 100_000)
  if (staleRequests == null) return bad('오래 기다린 요청 수가 맞지 않습니다')
  return { ok: true, value: { date, ...(got as Omit<BriefingInput, 'date' | 'requestKinds' | 'vehicles' | 'oldestOpenHours' | 'staleRequests'>), requestKinds: kinds, vehicles, oldestOpenHours, staleRequests } }
}

export const BRIEFING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 대표의 아침 업무 보조다.',
  '아래 「오늘 운영 숫자」만 보고, 대표가 오늘 할 일을 우선순위대로 3~4가지, 구체적으로 정리한다.',
  '우선순위 기준: 긴급 요청 → 오래 기다린 요청 → 오늘 남은 방문(차량별로 몰린 곳) → 다음 방문이 안 잡힌 거래처 → 지난 청구 미수. 0 인 항목은 쓰지 않는다.',
  '각 할 일에는 왜 지금 해야 하는지(숫자 근거)와 무엇을 하면 되는지를 적고, 언제 할지와 어느 화면에서 할지를 고른다.',
  '차량별 남은 방문이 한 차량에 몰려 있으면 그 차량 이름과 곳 수를 들어 말한다.',
  ...COMMON_RULES,
  '- 거래처 이름은 받지 않았으므로 쓰지 않는다. 「~곳」 「~건」처럼 숫자로만 말한다.',
  '',
  `언제(when)는 다음 중 하나: ${BRIEF_WHEN.map((k) => `"${k}"`).join(', ')}`,
  `어느 화면(go)은 다음 중 하나: ${BRIEF_GO.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "headline": "오늘을 한 문장으로 (40자 안팎)",',
  '  "items": [{ "title": "할 일 (20자 안팎)", "detail": "왜(숫자 근거) · 무엇을 (80자 안팎)", "when": "언제", "go": "어느 화면" }],',
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
    ...(b.vehicles.length ? [`차량별 오늘 남은 방문: ${b.vehicles.map((v) => `${v.label} ${v.left}곳`).join(' · ')}`] : []),
    ...(b.oldestOpenHours != null ? [`처리 전 요청 중 가장 오래 기다린 것: ${b.oldestOpenHours}시간 · 하루(24시간) 넘게 기다린 요청 ${b.staleRequests}건`] : []),
  ].join('\n')
}

export function parseBriefing(raw: string, message: string): Ok<BriefingOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const headline = isStr(o.headline) ? o.headline.trim() : ''
  if (!headline || headline.length > 120) return bad('브리핑 첫 문장이 없거나 너무 깁니다')
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 4) return bad('먼저 챙길 일은 1~4개여야 합니다')
  const items: BriefingOutput['items'] = []
  for (const it of o.items) {
    const t = (it ?? {}) as Record<string, unknown>
    const title = isStr(t.title) ? t.title.trim() : ''
    const detail = isStr(t.detail) ? t.detail.trim() : ''
    if (!title || title.length > 60 || detail.length > 200) return bad('먼저 챙길 일 형식이 맞지 않습니다')
    //  언제 · 어느 화면 — 빠지면 없음(null), 범위 밖이면 실패
    const when = t.when == null || t.when === '' ? null : (BRIEF_WHEN as readonly string[]).includes(t.when as string) ? (t.when as BriefingOutput['items'][number]['when']) : undefined
    const go = t.go == null || t.go === '' ? null : (BRIEF_GO as readonly string[]).includes(t.go as string) ? (t.go as BriefingOutput['items'][number]['go']) : undefined
    if (when === undefined) return bad(`할 일의 「언제」가 범위 밖입니다: ${String(t.when).slice(0, 12)}`)
    if (go === undefined) return bad(`할 일의 「화면」이 범위 밖입니다: ${String(t.go).slice(0, 12)}`)
    items.push({ title, detail, when, go })
  }
  const note = isStr(o.note) ? o.note.trim() : ''
  if (note.length > 160) return bad('덧붙인 말이 너무 깁니다')
  const all = [headline, note, ...items.flatMap((x) => [x.title, x.detail])].join('\n')
  //  「1순위 · 2순위 · 3가지」 같은 차례 숫자는 허용
  const inv = inventedNumbers(all, message, ['1', '2', '3', '4'])
  if (inv.length) return bad(`브리핑에 받은 숫자에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('브리핑이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { headline, items, note } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ② 현장 메모 정리
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_MAX = 600
export const FOLLOW_KINDS = ['추가수거', '자재·용기', '일정 확인', '병원 연락', '기타'] as const
/** 수거 입력의 「가져온 용기」 칸 이름 (화면과 같은 글) */
export const CONTAINER_LABELS = ['골판지 전용박스', '합성수지 전용용기', '전용 봉투', '기타'] as const
/** 수거 입력의 「처리장 인계 상태」 */
export const HANDOVERS = ['수거 완료', '인계 대기', '인계 완료'] as const

/** 0142 — 메모에서 뽑은 「수거 입력 칸 채우기」 제안 (담당자가 눌러야 칸에 들어감) */
export interface FieldFill {
  amountKg: number | null
  containers: { label: (typeof CONTAINER_LABELS)[number]; qty: number }[]
  supplied: { item: string; qty: number }[]
  handover: (typeof HANDOVERS)[number] | null
}

export interface FieldNoteOutput {
  summary: string
  issues: string[]
  followups: { kind: (typeof FOLLOW_KINDS)[number]; text: string }[]
  cleaned: string
  fill: FieldFill
}

export interface FieldNoteInput {
  memo: string
  /** 「주고 온 자재」 규격 이름 (화면 목록 그대로) — 없으면 자재 칸은 채우지 않음 */
  items: string[]
}

export function readFieldNote(v: unknown): Ok<FieldNoteInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const memo = isStr(o.memo) ? scrub(o.memo.trim()).slice(0, FIELD_MAX) : ''
  if (memo.length < 4) return bad('정리할 메모가 너무 짧습니다 (4자 이상)')
  const items = o.items == null ? [] : strArr(o.items, 40, 30)
  if (!items) return bad('자재 규격 목록 형식이 맞지 않습니다')
  return { ok: true, value: { memo, items } }
}

export const FIELD_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 업무 보조다.',
  '현장 기사가 수거하면서 급하게 적은 메모를 읽고, 사무실이 바로 쓸 수 있게 정리한다.',
  '그리고 메모에 적힌 값으로 「수거 입력」 칸을 채울 수 있게 뽑는다:',
  '  · amountKg — 수거량(kg). 메모에 kg 숫자가 있을 때만. 없으면 null',
  `  · containers — 병원에서 가져온 용기 수. 칸 이름은 다음 중에서만: ${CONTAINER_LABELS.map((k) => `"${k}"`).join(', ')}`,
  '  · supplied — 병원에 두고 온(새로 준) 자재. item 은 아래 「자재 규격 목록」의 이름 그대로만. 규격이 분명하지 않으면 넣지 않는다',
  `  · handover — 처리장 인계 상태. 다음 중 하나 또는 null: ${HANDOVERS.map((k) => `"${k}"`).join(', ')}`,
  '  「깨졌다 · 교체 필요」처럼 아직 주지 않은 것은 supplied 에 넣지 않고 후속 조치로 둔다.',
  ...COMMON_RULES,
  '- 메모에 없는 후속 조치는 만들지 않는다. 메모가 말한 것만 「후속 조치 제안」으로 옮긴다.',
  '- 칸에 들어간 숫자(수거량 · 개수)는 정리본(cleaned)에 다시 쓰지 않는다 — 정리본은 특이사항만.',
  '',
  `후속 조치 종류는 다음 중에서만: ${FOLLOW_KINDS.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "summary": "메모 요약 한 문장",',
  '  "issues": ["확인할 특이사항 짧게 (없으면 빈 배열, 최대 4개)"],',
  '  "followups": [{ "kind": "종류 하나", "text": "무엇을 (짧게)" }],',
  '  "cleaned": "수거 기록의 특이사항 칸에 넣을 깔끔한 한두 문장",',
  '  "fill": { "amountKg": 숫자 또는 null, "containers": [{ "label": "칸 이름", "qty": 숫자 }], "supplied": [{ "item": "규격 이름", "qty": 숫자 }], "handover": "인계 상태" 또는 null }',
  '}',
].join('\n')

export const fieldMessage = (f: FieldNoteInput | string) => {
  const x = typeof f === 'string' ? { memo: f, items: [] } : f
  return [
    '현장 메모:', '"""', x.memo, '"""',
    `자재 규격 목록: ${x.items.length ? x.items.join(' · ') : '없음 (자재 칸은 채우지 않음)'}`,
  ].join('\n')
}

const EMPTY_FILL: FieldFill = { amountKg: null, containers: [], supplied: [], handover: null }

/** 칸 채우기 제안 검사 — 숫자는 메모에 있는 것만 · 이름은 정해진 목록에서만 */
function readFill(v: unknown, memo: string, items: string[]): Ok<FieldFill> | Bad {
  if (v == null) return { ok: true, value: EMPTY_FILL }
  if (typeof v !== 'object' || Array.isArray(v)) return bad('칸 채우기 형식이 맞지 않습니다')
  const o = v as Record<string, unknown>
  const nums = new Set(numbersIn(memo).map((x) => String(Number(x))))
  const fromMemo = (n: number) => nums.has(String(n))
  let amountKg: number | null = null
  if (o.amountKg != null) {
    const n = typeof o.amountKg === 'number' && Number.isFinite(o.amountKg) && o.amountKg > 0 && o.amountKg <= 100_000 ? o.amountKg : null
    if (n == null) return bad('수거량 형식이 맞지 않습니다')
    if (!fromMemo(n)) return bad(`수거량(${n})이 메모에 없는 숫자라 쓰지 않았습니다`)
    amountKg = n
  }
  const qtyOk = (q: unknown): q is number => typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= 10_000
  const containers: FieldFill['containers'] = []
  if (o.containers != null) {
    if (!Array.isArray(o.containers) || o.containers.length > CONTAINER_LABELS.length) return bad('가져온 용기 형식이 맞지 않습니다')
    for (const c of o.containers) {
      const x = (c ?? {}) as Record<string, unknown>
      const label = isStr(x.label) ? x.label.trim() : ''
      if (!(CONTAINER_LABELS as readonly string[]).includes(label)) return bad(`가져온 용기 칸 이름이 범위 밖입니다: ${label.slice(0, 12)}`)
      if (!qtyOk(x.qty)) return bad('가져온 용기 수가 맞지 않습니다')
      if (!fromMemo(x.qty)) return bad(`가져온 용기 수(${x.qty})가 메모에 없는 숫자라 쓰지 않았습니다`)
      if (containers.some((y) => y.label === label)) return bad('가져온 용기 칸이 겹칩니다')
      containers.push({ label: label as FieldFill['containers'][number]['label'], qty: x.qty })
    }
  }
  const supplied: FieldFill['supplied'] = []
  if (o.supplied != null) {
    if (!Array.isArray(o.supplied) || o.supplied.length > 8) return bad('주고 온 자재 형식이 맞지 않습니다')
    for (const c of o.supplied) {
      const x = (c ?? {}) as Record<string, unknown>
      const item = isStr(x.item) ? x.item.trim() : ''
      if (!items.includes(item)) return bad(`주고 온 자재 규격이 목록에 없습니다: ${item.slice(0, 16)}`)
      if (!qtyOk(x.qty)) return bad('주고 온 자재 수가 맞지 않습니다')
      if (!fromMemo(x.qty)) return bad(`주고 온 자재 수(${x.qty})가 메모에 없는 숫자라 쓰지 않았습니다`)
      if (supplied.some((y) => y.item === item)) return bad('주고 온 자재 규격이 겹칩니다')
      supplied.push({ item, qty: x.qty })
    }
  }
  let handover: FieldFill['handover'] = null
  if (o.handover != null && o.handover !== '') {
    if (!(HANDOVERS as readonly string[]).includes(o.handover as string)) return bad(`인계 상태가 범위 밖입니다: ${String(o.handover).slice(0, 12)}`)
    handover = o.handover as FieldFill['handover']
  }
  return { ok: true, value: { amountKg, containers, supplied, handover } }
}

export function parseFieldNote(raw: string, memo: string, items: string[] = []): Ok<FieldNoteOutput> | Bad {
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
  const fill = readFill(o.fill, memo, items)
  if (!fill.ok) return fill
  return { ok: true, value: { summary, issues, followups, cleaned, fill: fill.value } }
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
//  ④ 요청 처리 계획 (0142) — 요청 글 + 시스템 자료 → 원하는 것 · 처리 순서 · 주의 · 구체 회신
//
//   화면이 보내는 것: 요청 글(전화번호 등 가림) · 요청 종류 · 급함 표시 · 오늘 · 방문 날짜 후보와 근거 ·
//     그날 차량별 방문 수(차량 이름만 · 기사 이름 없음) · 시스템 추천 차량 · 사무실 재고 4칸 ·
//     자재 규격 목록(규격 → 재고 칸) · 이 병원 이력(최근 수거일 · 다음 방문 · 90일 방문 · 90일 긴급 · 미수 개월).
//   ⚠ 병원 이름 · 요청자 이름 · 기사 이름은 보내지 않습니다.
//   ⚠ AI 는 자료를 **읽고 계획을 세울 뿐**입니다. 재고가 충분한지 같은 셈은 화면이 다시 합니다(AI 를 믿지 않음).
//   ⚠ 회신에는 차량 이름 · 내부 재고 숫자를 쓰지 않고, 확정 약속도 하지 않습니다(검사로 막음).
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_MAX = 800
const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface PlanInput {
  request: string
  kind: string | null
  urgent: boolean
  today: string
  target: { date: string; why: string }
  vehicles: { label: string; visits: number; regular: boolean; alreadyThere: boolean }[]
  pick: string | null
  stock: { name: string; qty: number }[]
  items: { name: string; stock: string | null }[]
  history: { lastVisit: string | null; nextVisit: string | null; visits90: number; urgent90: number; overdueMonths: number }
}

export interface PlanOutput {
  asks: { what: string; qty: number | null; item: string | null }[]
  when: string
  steps: { title: string; detail: string }[]
  watch: string[]
  reply: string
}

const dayOrNull = (v: unknown): string | null | undefined => (v == null || v === '' ? null : isStr(v) && DAY.test(v) ? v : undefined)

export function readPlan(v: unknown): Ok<PlanInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const request = isStr(o.request) ? scrub(o.request.trim()).slice(0, PLAN_MAX) : ''
  if (request.length < 4) return bad('요청 글이 너무 짧습니다 (4자 이상)')
  const kind = isStr(o.kind) && (REQUEST_KINDS as readonly string[]).includes(o.kind) ? o.kind : null
  const today = isStr(o.today) && DAY.test(o.today) ? o.today : null
  if (!today) return bad('오늘 날짜가 맞지 않습니다')
  const t = (o.target ?? {}) as Record<string, unknown>
  if (!isStr(t.date) || !DAY.test(t.date) || !isStr(t.why) || t.why.length > 40) return bad('방문 날짜 후보가 맞지 않습니다')
  const vehicles: PlanInput['vehicles'] = []
  if (!Array.isArray(o.vehicles) || o.vehicles.length > 12) return bad('차량 목록 형식이 맞지 않습니다')
  for (const x of o.vehicles) {
    const y = (x ?? {}) as Record<string, unknown>
    const label = isStr(y.label) ? y.label.trim().slice(0, 30) : ''
    const visits = int(y.visits, 500)
    if (!label || visits == null) return bad('차량 목록 형식이 맞지 않습니다')
    vehicles.push({ label, visits, regular: y.regular === true, alreadyThere: y.alreadyThere === true })
  }
  const pick = o.pick == null || o.pick === '' ? null : isStr(o.pick) && vehicles.some((x) => x.label === o.pick) ? o.pick : undefined
  if (pick === undefined) return bad('추천 차량이 차량 목록에 없습니다')
  const stock: PlanInput['stock'] = []
  if (!Array.isArray(o.stock) || o.stock.length > 8) return bad('재고 형식이 맞지 않습니다')
  for (const x of o.stock) {
    const y = (x ?? {}) as Record<string, unknown>
    const name = isStr(y.name) ? y.name.trim().slice(0, 20) : ''
    const qty = int(y.qty, 1_000_000)
    if (!name || qty == null) return bad('재고 형식이 맞지 않습니다')
    stock.push({ name, qty })
  }
  const items: PlanInput['items'] = []
  if (o.items != null) {
    if (!Array.isArray(o.items) || o.items.length > 40) return bad('자재 규격 목록 형식이 맞지 않습니다')
    for (const x of o.items) {
      const y = (x ?? {}) as Record<string, unknown>
      const name = isStr(y.name) ? y.name.trim().slice(0, 30) : ''
      const st = y.stock == null ? null : isStr(y.stock) && stock.some((z) => z.name === y.stock) ? y.stock : undefined
      if (!name || st === undefined) return bad('자재 규격 목록 형식이 맞지 않습니다')
      items.push({ name, stock: st })
    }
  }
  const h = (o.history ?? {}) as Record<string, unknown>
  const lastVisit = dayOrNull(h.lastVisit)
  const nextVisit = dayOrNull(h.nextVisit)
  const visits90 = int(h.visits90, 1000)
  const urgent90 = int(h.urgent90, 1000)
  const overdueMonths = int(h.overdueMonths, 120)
  if (lastVisit === undefined || nextVisit === undefined || visits90 == null || urgent90 == null || overdueMonths == null) return bad('이 병원 이력 형식이 맞지 않습니다')
  return {
    ok: true,
    value: { request, kind, urgent: o.urgent === true, today, target: { date: t.date, why: t.why.trim() }, vehicles, pick, stock, items, history: { lastVisit, nextVisit, visits90, urgent90, overdueMonths } },
  }
}

/** 'YYYY-MM-DD' → 「10월 17일」 (AI 가 같은 날을 말로 쓸 수 있게 · 숫자 근거도 함께) */
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

export const PLAN_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 요청 처리 보조다.',
  '병원 요청 하나를 받아, 담당자가 처음부터 끝까지 처리할 수 있게 「처리 계획」을 세운다.',
  '1) asks — 요청 글에서 병원이 원하는 것을 하나씩 뽑는다 (무엇 · 수량 · 자재면 「자재 규격 목록」의 이름 그대로, 아니면 null). 최대 5개.',
  '2) when — 병원이 언제를 원하는지 짧게 (예: 「내일 오전」). 말이 없으면 「날짜 언급 없음」.',
  '3) steps — 아래 「시스템 자료」(방문 날짜 후보 · 그날 차량별 방문 · 추천 차량 · 사무실 재고 · 이 병원 이력)를 근거로 담당자가 할 일을 순서대로 3~5단계로 쓴다.',
  '   각 단계 detail 에는 어떤 자료를 보고 그렇게 하는지 숫자로 밝힌다 (예: 「그날 의료폐기물 1톤 B 방문 2곳 — 가장 여유」 「합성수지 전용용기 재고 360개 — 10개 충분」).',
  '4) watch — 이력에서 눈여겨볼 점(최근 90일 긴급 요청이 잦음 · 다음 방문이 없음 · 미수 개월 등)이 있으면 0~3개. 없으면 빈 배열.',
  '5) reply — 병원에 보낼 회신. 받은 내용을 하나씩 짚고, 언제 · 무엇을 어떻게 진행하려는지 구체적으로 3~5문장 존댓말.',
  '   단 담당자 확정 전이므로 「방문하겠습니다 · 배차했습니다 · 준비해 드리겠습니다」 같은 확정 약속은 하지 않는다 (「~로 일정을 확인하고 있습니다」 「확정되면 다시 안내드리겠습니다」).',
  '   회신에는 차량 이름 · 사무실 재고 숫자 · 내부 사정을 쓰지 않는다. 날짜는 「10월 17일」처럼 쓴다.',
  ...COMMON_RULES,
  '- 병원 이름 · 기사 이름은 받지 않았으므로 쓰지 않는다.',
  '',
  '답 형식:',
  '{',
  '  "asks": [{ "what": "원하는 것 (짧게)", "qty": 숫자 또는 null, "item": "자재 규격 이름" 또는 null }],',
  '  "when": "언제를 원하는지",',
  '  "steps": [{ "title": "할 일 (20자 안팎)", "detail": "근거 숫자와 함께 무엇을 (80자 안팎)" }],',
  '  "watch": ["주의할 점"],',
  '  "reply": "병원에 보낼 회신"',
  '}',
].join('\n')

export function planMessage(p: PlanInput): string {
  const h = p.history
  return [
    `오늘: ${p.today} (${md(p.today)})`,
    `병원이 고른 요청 종류: ${p.kind ?? '없음'} · 「급함」 표시: ${p.urgent ? '있음' : '없음'}`,
    '요청 글:',
    '"""',
    p.request,
    '"""',
    '',
    '[시스템 자료 — 숫자는 여기 있는 것만 쓴다]',
    `방문 날짜 후보: ${p.target.date} (${md(p.target.date)}) — ${p.target.why}`,
    `그날 차량별 방문: ${p.vehicles.length ? p.vehicles.map((v) => `${v.label} ${v.visits}곳${v.regular ? ' (늘 가던 차량)' : ''}${v.alreadyThere ? ' (그날 이미 이 병원 방문 예정)' : ''}`).join(' · ') : '차량 정보 없음'}`,
    `시스템 추천 차량: ${p.pick ?? '없음'}`,
    `사무실 재고: ${p.stock.map((x) => `${x.name} ${x.qty}개`).join(' · ') || '정보 없음'}`,
    `자재 규격 목록 (규격 → 재고 칸): ${p.items.length ? p.items.map((x) => `${x.name}${x.stock ? ` → ${x.stock}` : ''}`).join(' · ') : '없음'}`,
    `이 병원 이력: 최근 수거 ${h.lastVisit ? `${h.lastVisit} (${md(h.lastVisit)})` : '기록 없음'} · 다음 방문 ${h.nextVisit ? `${h.nextVisit} (${md(h.nextVisit)})` : '잡힌 것 없음'} · 최근 90일 방문 ${h.visits90}번 · 최근 90일 긴급 요청 ${h.urgent90}번 · 지난 청구 미수 ${h.overdueMonths}개월`,
  ].join('\n')
}

export function parsePlan(raw: string, message: string, input: PlanInput): Ok<PlanOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  if (!Array.isArray(o.asks) || o.asks.length < 1 || o.asks.length > 5) return bad('원하는 것은 1~5개여야 합니다')
  const reqNums = new Set(numbersIn(input.request).map((x) => String(Number(x))))
  const itemNames = input.items.map((x) => x.name)
  const asks: PlanOutput['asks'] = []
  for (const a of o.asks) {
    const x = (a ?? {}) as Record<string, unknown>
    const what = isStr(x.what) ? x.what.trim() : ''
    if (!what || what.length > 40) return bad('원하는 것 형식이 맞지 않습니다')
    let qty: number | null = null
    if (x.qty != null) {
      if (typeof x.qty !== 'number' || !Number.isInteger(x.qty) || x.qty <= 0 || x.qty > 100_000) return bad('원하는 수량 형식이 맞지 않습니다')
      if (!reqNums.has(String(x.qty))) return bad(`원하는 수량(${x.qty})이 요청 글에 없는 숫자라 쓰지 않았습니다`)
      qty = x.qty
    }
    const item = x.item == null || x.item === '' ? null : isStr(x.item) && itemNames.includes(x.item.trim()) ? x.item.trim() : undefined
    if (item === undefined) return bad(`자재 규격이 목록에 없습니다: ${String(x.item).slice(0, 16)}`)
    asks.push({ what, qty, item })
  }
  const when = isStr(o.when) ? o.when.trim() : ''
  if (!when || when.length > 40) return bad('희망 시점이 없거나 너무 깁니다')
  if (!Array.isArray(o.steps) || o.steps.length < 2 || o.steps.length > 6) return bad('처리 순서는 2~6단계여야 합니다')
  const steps: PlanOutput['steps'] = []
  for (const st of o.steps) {
    const x = (st ?? {}) as Record<string, unknown>
    const title = isStr(x.title) ? x.title.trim() : ''
    const detail = isStr(x.detail) ? x.detail.trim() : ''
    if (!title || title.length > 50 || detail.length > 220) return bad('처리 순서 형식이 맞지 않습니다')
    steps.push({ title, detail })
  }
  const watch = strArr(o.watch, 3, 140)
  if (!watch) return bad('주의할 점 형식이 맞지 않습니다')
  const reply = isStr(o.reply) ? o.reply.trim() : ''
  if (!reply || reply.length > 500) return bad('회신이 없거나 너무 깁니다')

  //  숫자 — 전부 받은 글 · 자료에 있는 것만 (차례 숫자 1~6 허용)
  const all = [when, reply, ...asks.map((a) => a.what), ...steps.flatMap((x) => [x.title, x.detail]), ...watch].join('\n')
  const inv = inventedNumbers(all, message, ['1', '2', '3', '4', '5', '6'])
  if (inv.length) return bad(`처리 계획에 받은 자료에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  const okUnits = new Set(unitTokens(message))
  const invU = [...new Set(unitTokens(all).filter((x) => !okUnits.has(x)))]
  if (invU.length) return bad(`처리 계획에 받은 자료에 없는 표현(${invU.join(', ')})이 있어 쓰지 않았습니다`)
  //  회신 — 병원에 가는 글: 요청 글 · 날짜 숫자만 · 차량 이름 · 재고 숫자 없음 · 확정 약속 없음
  const replySource = [input.request, input.today, md(input.today), input.target.date, md(input.target.date)].join('\n')
  if (input.vehicles.some((v) => reply.includes(v.label))) return bad('회신에 차량 이름이 들어가 쓰지 않았습니다 (내부 정보)')
  const invR = inventedNumbers(reply, replySource)
  if (invR.length) return bad(`회신에 요청 글 · 날짜에 없는 숫자(${invR.join(', ')})가 있어 쓰지 않았습니다 (내부 숫자는 회신에 쓰지 않음)`)
  if (PROMISE.test(all)) return bad('처리 계획이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { asks, when, steps, watch, reply } }
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
    return { ok: true, value: { system: FIELD_PROMPT, message: fieldMessage(r.value), parse: (raw) => parseFieldNote(raw, r.value.memo, r.value.items) } }
  }
  if (task === 'request_plan') {
    const r = readPlan(input)
    if (!r.ok) return r
    const message = planMessage(r.value)
    return { ok: true, value: { system: PLAN_PROMPT, message, parse: (raw) => parsePlan(raw, message, r.value) } }
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
