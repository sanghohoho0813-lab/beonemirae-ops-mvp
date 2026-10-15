// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage · Gemini 길 — 키 모양으로 고르기 · 보내는 요청 · 오류 문구
//
//   가짜인 것은 「Google 주소」 하나(이 파일이 띄우는 작은 서버)입니다. 보내는 쪽(geminiJson ·
//   pickAi)은 배포되는 코드 그대로입니다. 이 검사는 「Gemini 가 실제로 답했다」를 증명하지
//   않습니다 — 그것은 키 등록 · 배포 뒤 발표 화면의 「지금 AI 연결 확인」으로 합니다.
//
//  실행(저장소 맨 위에서): deno test --config supabase/functions/ai-triage/deno.json --allow-net --allow-env --allow-read supabase/test/gemini_adapter_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { GEMINI_BASE, GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, geminiJson, pickAi } from '../functions/ai-triage/gemini.ts'
import { ProviderError } from '../functions/ai-triage/provider.ts'
import { parseTriage } from '../functions/ai-triage/triage.ts'

const KEY = 'AQ.Ab8RN6TESTTESTTESTTESTTESTTESTTESTTEST'
const OLD_KEY = 'AIzaSyTEST0000000000000000000000000000'
const GOOD = '{"kind":"긴급수거","also_kinds":["소모품"],"urgency":"높음","summary":"보관 공간이 빨리 차 내일 오전 수거와 용기를 요청했습니다.","points":["내일 오전 수거 희망","63L 용기 요청"],"draft":"요청 확인했습니다. 원하신 시점에 방문 가능한지 확인한 뒤 안내드리겠습니다.","basis":"공간이 찼다고 써서 긴급도 높음"}'

type Seen = { path: string; headers: Headers; body: Record<string, unknown> }
let seen: Seen[] = []
let mode = 'ok'

const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const body = (await req.json()) as Record<string, unknown>
  const path = new URL(req.url).pathname
  seen.push({ path, headers: req.headers, body })
  const j = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  const gErr = (status: number, s: string, message: string) => j(status, { error: { code: status, message, status: s } })
  if (mode === 'badkey') return gErr(400, 'INVALID_ARGUMENT', `API key not valid. Please pass a valid API key. (${KEY})`)
  if (mode === '401') return gErr(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.')
  if (mode === '403') return gErr(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project')
  if (mode === '404' || (mode === '404-first' && path.includes(GEMINI_DEFAULT_MODEL))) {
    return gErr(404, 'NOT_FOUND', 'models/x is not found for API version v1beta')
  }
  if (mode === '429') return gErr(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).')
  if (mode === '503') return gErr(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.')
  if (mode === 'blocked') return j(200, { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 10 } })
  if (mode === 'empty') return j(200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] })
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500))
  const m = decodeURIComponent(path.split('/models/')[1].split(':')[0])
  return j(200, {
    candidates: [{
      content: { role: 'model', parts: [{ text: '생각 조각', thought: true }, { text: GOOD.slice(0, 40) }, { text: GOOD.slice(40) }] },
      finishReason: 'STOP',
    }],
    usageMetadata: { promptTokenCount: 512, candidatesTokenCount: 96, totalTokenCount: 608 },
    modelVersion: m,
  })
})
const base = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/v1beta`
//  index.ts 가 Gemini 일 때 넘기는 것과 같은 모양
const call = (timeoutMs = 5000, key = KEY) => geminiJson({
  apiKey: key, base, model: GEMINI_DEFAULT_MODEL, fallbackModel: GEMINI_FALLBACK_MODEL,
  system: 'SYS', user: 'USER', timeoutMs, temperature: 0.2,
})
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m) }
const fail = async (m: string): Promise<ProviderError> => {
  mode = m
  seen = []
  try { await call(m === 'slow' ? 300 : 5000) } catch (e) {
    assert(e instanceof ProviderError, String(e))
    assert(!String((e as Error).message).includes(KEY), `키가 문구에 없음: ${(e as Error).message}`)
    return e as ProviderError
  }
  throw new Error('성공하면 안 됨')
}

Deno.test('키 모양으로 고르기 — AQ.… · AIza… 는 Gemini · 기본 주소 · 싼 모델', () => {
  const g = pickAi({ key: `  ${KEY}\n` })
  assert(g.provider === 'gemini' && g.url === GEMINI_BASE && g.model === 'gemini-2.5-flash-lite', JSON.stringify(g))
  assert(GEMINI_BASE === 'https://generativelanguage.googleapis.com/v1beta', 'Google 기본 주소')
  assert(pickAi({ key: OLD_KEY }).provider === 'gemini', '옛 키 AIza… 도 Gemini')
  assert(pickAi({ key: KEY, model: ' gemini-3.1-flash-lite ' }).model === 'gemini-3.1-flash-lite', 'AI_MODEL 로 바꿈')
  assert(pickAi({ key: 'x', provider: 'Gemini' }).provider === 'gemini', 'AI_PROVIDER=gemini')
  assert(pickAi({ key: 'sk-ant-abc' }).provider === 'anthropic', 'sk-ant- 는 Claude')
  assert(pickAi({ key: 'sk-proj-abc' }).provider === 'openai', '그 밖은 OpenAI 호환')
  assert(pickAi({ key: KEY, provider: 'openai' }).provider === 'openai', 'AI_PROVIDER 가 키 모양보다 먼저')
})

Deno.test('정상 — x-goog-api-key 헤더 · generateContent · JSON 모드 · 답 글만 모아 결과 검사 통과', async () => {
  mode = 'ok'
  seen = []
  const r = await call()
  assert(seen.length === 1, '한 번만 부름')
  const s = seen[0]
  assert(s.path === `/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`, s.path)
  assert(s.headers.get('x-goog-api-key') === KEY, 'x-goog-api-key 헤더')
  assert(!s.headers.get('authorization'), 'Authorization 헤더는 보내지 않음 (새 AQ. 키가 거절됨)')
  const b = s.body as { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[]; generationConfig: Record<string, unknown> }
  assert(b.systemInstruction.parts[0].text === 'SYS', 'system 글')
  assert(b.contents.length === 1 && b.contents[0].role === 'user' && b.contents[0].parts[0].text === 'USER', 'user 글 하나')
  assert(b.generationConfig.responseMimeType === 'application/json' && b.generationConfig.temperature === 0.2, 'JSON 모드 · temperature')
  assert(!('thinkingConfig' in b.generationConfig), '생각 설정은 보내지 않음 (모델 기본)')
  assert(r.text === GOOD, '생각 조각은 빼고 답 글만 이어 붙임')
  assert(r.model === GEMINI_DEFAULT_MODEL && r.usage.input === 512 && r.usage.output === 96, '모델 · 토큰 수')
  const p = parseTriage(r.text, { content: '폐기물이 예상보다 빨리 찼습니다.', kind: null, urgent: true, desiredDate: null })
  assert(p.ok, `결과 검사 통과: ${JSON.stringify(p)}`)
})

Deno.test('옛 키(AIza…)도 같은 헤더로', async () => {
  mode = 'ok'
  seen = []
  await call(5000, OLD_KEY)
  assert(seen[0].headers.get('x-goog-api-key') === OLD_KEY, 'x-goog-api-key')
})

Deno.test('기본 모델이 없어졌으면(404) — 같은 시간 안에서 한 번만 안정 모델로', async () => {
  mode = '404-first'
  seen = []
  const r = await call()
  assert(seen.length === 2, `두 번 부름 (${seen.length})`)
  assert(seen[1].path === `/v1beta/models/${GEMINI_FALLBACK_MODEL}:generateContent`, seen[1].path)
  assert(r.model === GEMINI_FALLBACK_MODEL && r.text === GOOD, '실제로 답한 모델 이름을 그대로')
})

Deno.test('둘 다 404 면 그대로 실패 (세 번째는 없음)', async () => {
  const e = await fail('404')
  assert(e.status === 404 && /모델 이름을 찾지 못했습니다/.test(e.message) && seen.length === 2, `${e.message} · ${seen.length}`)
})

for (const [m, code, re] of [
  ['badkey', 400, /AI 키가 올바르지 않습니다 \(400\)/],
  ['401', 401, /AI 키가 올바르지 않습니다 \(401\)/],
  ['403', 403, /권한이 없습니다/],
  ['429', 429, /사용량 한도/],
  ['503', 503, /바쁩니다/],
] as const) {
  Deno.test(`실패 ${m} — 까닭을 그대로 · 키 조각 없음 · 다시 보내지 않음`, async () => {
    const e = await fail(m)
    assert(e.code === 'http' && e.status === code && re.test(e.message), e.message)
    assert(seen.length === 1, '한 번만')
  })
}

Deno.test('거절(차단) · 빈 응답 — 실패로 (가짜 결과 없음)', async () => {
  const b = await fail('blocked')
  assert(b.code === 'format' && /거절/.test(b.message), b.message)
  const e = await fail('empty')
  assert(e.code === 'format' && /비어 있습니다 \(MAX_TOKENS\)/.test(e.message), e.message)
})

Deno.test('시간 초과 — timeout 으로 분류', async () => {
  const e = await fail('slow')
  assert(e.code === 'timeout', e.message)
})

Deno.test({ name: '끝 — 서버 닫기', sanitizeOps: false, sanitizeResources: false, fn: async () => { await server.shutdown() } })
