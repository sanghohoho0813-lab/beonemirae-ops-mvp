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
  /** 기본 { type: 'json_object' } — Gemini 는 json_schema (gemini.ts) */
  responseFormat?: unknown
  /** 서버가 응답 모양 · 추가 칸을 400 으로 거절했을 때 한 번만 이 모양으로 · 추가 칸 없이 다시 (같은 시간 안에서) */
  fallbackFormat?: unknown
  /** 본문에 더 붙일 칸 (예: Gemini reasoning_effort) */
  extra?: Record<string, unknown>
  fetchImpl?: typeof fetch
}

/** 오류 문구에 키 조각이 섞여 나가지 않게 (OpenAI sk-… · Google AIza…) */
const redact = (s: string) =>
  s.replace(/sk-[A-Za-z0-9_*-]{4,}/g, 'sk-***').replace(/AIza[A-Za-z0-9_-]{4,}/g, 'AIza***').slice(0, 200)

/** 오류 본문에서 문구 — OpenAI 는 { error }, Gemini 호환 주소는 [{ error }] 로 올 때가 있음 */
const errMessage = (body: unknown): string => {
  const b = (Array.isArray(body) ? body[0] : body) as { error?: { message?: unknown } } | null
  return typeof b?.error?.message === 'string' ? b.error.message : ''
}

/** 400 중에서 「응답 모양 · 생각 설정을 못 받는다」는 거절만 — 키 · 모델 오류는 다시 보내지 않음 */
const shapeRejected = (status: number, msg: string) =>
  status === 400 && /response_format|json_schema|json_object|schema|mime|reasoning|thinking/i.test(msg) && !/api[ _-]?key/i.test(msg)

export async function chatJson(o: ChatOptions): Promise<ModelReply> {
  const f = o.fetchImpl ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs)
  const send = async (format: unknown, extra: Record<string, unknown>): Promise<{ res: Response; body: unknown }> => {
    let res: Response
    try {
      res = await f(o.url, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify({
          model: o.model,
          ...(o.temperature == null ? {} : { temperature: o.temperature }),
          ...extra,
          //  JSON 객체로만 답하게 — 그래도 서버가 다시 엄격하게 검사합니다(triage.parseTriage).
          response_format: format,
          messages: [
            { role: 'system', content: o.system },
            { role: 'user', content: o.user },
          ],
        }),
      })
    } catch (e) {
      if (ctl.signal.aborted) throw new ProviderError('timeout', `AI 응답 시간 초과 (${Math.round(o.timeoutMs / 1000)}초)`)
      throw new ProviderError('network', `AI 서버에 연결하지 못했습니다 (${redact(String(e))})`)
    }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      if (ctl.signal.aborted) throw new ProviderError('timeout', `AI 응답 시간 초과 (${Math.round(o.timeoutMs / 1000)}초)`)
      body = null
    }
    return { res, body }
  }
  let res: Response
  let body: unknown
  try {
    ;({ res, body } = await send(o.responseFormat ?? { type: 'json_object' }, o.extra ?? {}))
    if (!res.ok && o.fallbackFormat !== undefined && shapeRejected(res.status, errMessage(body))) {
      ;({ res, body } = await send(o.fallbackFormat, {}))
    }
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const msg = errMessage(body)
    const what =
      res.status === 401 || (res.status === 400 && /api[ _-]?key/i.test(msg)) ? 'AI 키가 올바르지 않습니다'
      : res.status === 403 ? 'AI 키에 이 모델을 쓸 권한이 없습니다 (키 · 프로젝트 설정 확인)'
      : res.status === 429 ? 'AI 사용량 한도에 걸렸습니다'
      : res.status === 404 ? 'AI 모델 이름을 찾지 못했습니다 (AI_MODEL 확인)'
      : res.status === 503 ? 'AI 서버가 바쁩니다 — 잠시 뒤 다시 눌러 주세요'
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
