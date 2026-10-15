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

import { ProviderError, redact, type ModelReply } from './provider.ts'

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
