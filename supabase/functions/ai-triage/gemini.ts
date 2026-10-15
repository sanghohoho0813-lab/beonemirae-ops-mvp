// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — Google Gemini 설정 (OpenAI 호환 주소로 부름 · provider.ts 의 chatJson)
//
//  Google 문서(ai.google.dev/gemini-api/docs/openai)대로:
//   · 주소  https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
//   · 인증  Authorization: Bearer <Gemini API 키>   (AI Studio 키는 AIza… 로 시작)
//   · 모양  OpenAI Chat Completions 그대로
//  JSON 은 문서에 나온 구조화 출력(json_schema)으로 받습니다 — 받은 뒤에도 triage.parseTriage 가
//  다시 엄격하게 검사합니다(값 범위 · 빠진 칸 · 길이). 이 스키마는 그 검사의 앞단일 뿐입니다.
//  pickAi — Secret 으로 회사 · 모델 · 주소 고르기 (index.ts)
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════

import { REQUEST_KINDS, URGENCIES } from './triage.ts'

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
/** 모델 목록의 「안정(Stable)」 중 가장 빠르고 싼 모델 — 바꾸려면 AI_MODEL */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite'

/** AI Studio 에서 받은 Gemini 키 모양 */
export const looksLikeGeminiKey = (k: string) => k.startsWith('AIza')

/** 결과 모양 — triage.ts SYSTEM_PROMPT 가 요구하는 그 칸들 */
export const TRIAGE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'request_triage',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...REQUEST_KINDS] },
        also_kinds: { type: 'array', items: { type: 'string', enum: [...REQUEST_KINDS] } },
        urgency: { type: 'string', enum: [...URGENCIES] },
        summary: { type: 'string' },
        points: { type: 'array', items: { type: 'string' } },
        draft: { type: 'string' },
        basis: { type: 'string' },
      },
      required: ['kind', 'also_kinds', 'urgency', 'summary', 'points', 'draft', 'basis'],
      additionalProperties: false,
    },
  },
} as const

export type AiProvider = 'gemini' | 'anthropic' | 'openai'

/**
 * Secret 값으로 어느 회사 · 어느 모델 · 어느 주소로 부를지 — index.ts 가 한 번 부릅니다.
 *  AI_PROVIDER 가 있으면 그것, 없으면 키 모양(AIza… = gemini · sk-ant-… = anthropic · 그 밖 = openai).
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
    (provider === 'gemini' ? GEMINI_URL : provider === 'anthropic' ? '' : 'https://api.openai.com/v1/chat/completions')
  return { provider, model, url }
}
