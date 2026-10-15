// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — Claude 호출 어댑터 (Anthropic 공식 SDK)
//
//  provider.ts(OpenAI 호환)와 같은 모양으로 돌려줍니다 — 입력: system · user 글 /
//  출력: 글 · 실제로 답한 모델 · 토큰 수. 결과 검사(triage.parseTriage) · 기록 · 권한은
//  handler.ts 가 그대로 합니다. 여기서는 부르고, 실패하면 까닭을 한국어로 적을 뿐입니다.
//
//  ⚠ API 키는 서버 Secret(AI_API_KEY)에서만 옵니다. 브라우저 · 저장소에 없습니다.
//  ⚠ 기본 모델 claude-opus-5-5 (AI_MODEL 로 바꿈) · 생각 깊이(effort) low —
//    요청 한 건을 읽고 나누는 일이라 짧게, 시연 중에 오래 기다리지 않게.
//  ⚠ 안전 분류기가 요청을 거절하면(stop_reason refusal) 서버가 Anthropic 권장 모델로
//    한 번 더 돌립니다(fallbacks: "default"). 그래도 거절이면 실패로 기록합니다.
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from 'npm:@anthropic-ai/sdk@0.130.0'
import { ProviderError, type ModelReply } from './provider.ts'

export interface ClaudeOptions {
  apiKey: string
  /** 비우면 Anthropic 기본 주소 — 시험 때만 다른 주소를 넣습니다 */
  baseURL?: string
  model: string
  system: string
  user: string
  timeoutMs: number
}

/** 오류 문구에 키 조각이 섞여 나가지 않게 */
const redact = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_*-]{4,}/g, 'sk-ant-***').replace(/sk-[A-Za-z0-9_*-]{4,}/g, 'sk-***').slice(0, 200)

export async function claudeJson(o: ClaudeOptions): Promise<ModelReply> {
  //  재시도 없음 — 화면이 35초까지 기다리므로 서버는 한 번만 부르고 실패를 바로 알립니다
  const client = new Anthropic({ apiKey: o.apiKey, ...(o.baseURL ? { baseURL: o.baseURL } : {}), timeout: o.timeoutMs, maxRetries: 0 })
  let res: Anthropic.Beta.BetaMessage
  try {
    res = await client.beta.messages.create({
      model: o.model,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: o.system,
      messages: [{ role: 'user', content: o.user }],
    })
  } catch (e) {
    const detail = e instanceof Anthropic.APIError ? redact(e.message) : redact(String(e))
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError('timeout', `AI 응답 시간 초과 (${Math.round(o.timeoutMs / 1000)}초)`)
    if (e instanceof Anthropic.APIConnectionError) throw new ProviderError('network', `AI 서버에 연결하지 못했습니다 (${detail})`)
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError('http', `AI 키가 올바르지 않습니다 (401) — ${detail}`, 401)
    if (e instanceof Anthropic.PermissionDeniedError) throw new ProviderError('http', `이 키로는 이 모델을 쓸 수 없습니다 (403) — ${detail}`, 403)
    if (e instanceof Anthropic.NotFoundError) throw new ProviderError('http', `AI 모델 이름을 찾지 못했습니다 (AI_MODEL 확인) (404) — ${detail}`, 404)
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError('http', `AI 사용량 한도에 걸렸습니다 (429) — ${detail}`, 429)
    if (e instanceof Anthropic.BadRequestError) throw new ProviderError('http', `AI 요청 형식 오류 (400) — ${detail}`, 400)
    if (e instanceof Anthropic.APIError) throw new ProviderError('http', `AI 서버 오류 (${e.status ?? '?'}) — ${detail}`, typeof e.status === 'number' ? e.status : null)
    throw new ProviderError('network', `AI 호출 실패 (${detail})`)
  }
  if (res.stop_reason === 'refusal') {
    throw new ProviderError('format', 'AI 가 이 요청의 분석을 거절했습니다 — 담당자가 직접 확인해 주세요')
  }
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
  if (!text) throw new ProviderError('format', res.stop_reason === 'max_tokens' ? 'AI 응답이 길이 제한에서 잘렸습니다' : 'AI 응답이 비어 있습니다')
  return {
    text,
    model: res.model || o.model,
    usage: { input: res.usage?.input_tokens ?? null, output: res.usage?.output_tokens ?? null },
  }
}
