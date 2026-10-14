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

/** 오류 문구에 키 조각이 섞여 나가지 않게 */
const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_*-]{4,}/g, 'sk-***').slice(0, 200)

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
