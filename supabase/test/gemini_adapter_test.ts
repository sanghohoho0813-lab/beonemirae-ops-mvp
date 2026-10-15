// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage · Gemini 길 — 키 모양으로 고르기 · 보내는 요청 · 오류 문구
//
//   가짜인 것은 「Google 주소」 하나(이 파일이 띄우는 작은 서버)입니다. 보내는 쪽(chatJson ·
//   pickAi · TRIAGE_RESPONSE_FORMAT)은 배포되는 코드 그대로입니다. 이 검사는 「Gemini 가 실제로
//   답했다」를 증명하지 않습니다 — 그것은 키 등록 · 배포 뒤 발표 화면의 「지금 AI 연결 확인」으로 합니다.
//
//  실행(저장소 맨 위에서): deno test --config supabase/functions/ai-triage/deno.json --allow-net --allow-env --allow-read supabase/test/gemini_adapter_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { GEMINI_DEFAULT_MODEL, GEMINI_URL, TRIAGE_RESPONSE_FORMAT, pickAi } from '../functions/ai-triage/gemini.ts'
import { chatJson, ProviderError } from '../functions/ai-triage/provider.ts'
import { parseTriage, REQUEST_KINDS, URGENCIES } from '../functions/ai-triage/triage.ts'

const KEY = 'AIzaSyTEST0000000000000000000000000000'
const GOOD = '{"kind":"긴급수거","also_kinds":["소모품"],"urgency":"높음","summary":"보관 공간이 빨리 차 내일 오전 수거와 용기를 요청했습니다.","points":["내일 오전 수거 희망","63L 용기 요청"],"draft":"요청 확인했습니다. 원하신 시점에 방문 가능한지 확인한 뒤 안내드리겠습니다.","basis":"공간이 찼다고 써서 긴급도 높음"}'

type Seen = { headers: Headers; body: Record<string, unknown> }
let seen: Seen[] = []
let mode = 'ok'

const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const body = (await req.json()) as Record<string, unknown>
  seen.push({ headers: req.headers, body })
  const j = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  //  Google 호환 주소는 오류를 [{ error }] 배열로 줄 때가 있습니다
  const gErr = (status: number, s: string, message: string) => j(status, [{ error: { code: status, message, status: s } }])
  if (mode === 'badkey') return gErr(400, 'INVALID_ARGUMENT', `API key not valid. Please pass a valid API key. (${KEY})`)
  if (mode === '403') return gErr(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project')
  if (mode === '404') return gErr(404, 'NOT_FOUND', 'models/no-such-model is not found for API version v1beta')
  if (mode === '429') return gErr(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).')
  if (mode === '503') return gErr(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.')
  if (mode === 'schema-no' && seen.length === 1) return gErr(400, 'INVALID_ARGUMENT', 'Invalid JSON payload received. Unknown name "json_schema" at response_format')
  if (mode === 'other400') return gErr(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.')
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500))
  return j(200, {
    id: 'chatcmpl-test', object: 'chat.completion', model: GEMINI_DEFAULT_MODEL,
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: GOOD } }],
    usage: { prompt_tokens: 512, completion_tokens: 96, total_tokens: 608 },
  })
})
const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/v1beta/openai/chat/completions`
//  index.ts 가 Gemini 일 때 넘기는 것과 같은 모양
const call = (timeoutMs = 5000) => chatJson({
  apiKey: KEY, url, model: GEMINI_DEFAULT_MODEL, system: 'SYS', user: 'USER', timeoutMs, temperature: 0.2,
  responseFormat: TRIAGE_RESPONSE_FORMAT, fallbackFormat: { type: 'json_object' }, extra: { reasoning_effort: 'low' },
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

Deno.test('키 모양으로 고르기 — AIza… 는 Gemini · 주소 · 기본 모델', () => {
  const g = pickAi({ key: `  ${KEY}\n` })
  assert(g.provider === 'gemini' && g.url === GEMINI_URL && g.model === GEMINI_DEFAULT_MODEL, JSON.stringify(g))
  assert(GEMINI_URL === 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'Google 문서의 주소')
  assert(pickAi({ key: KEY, model: ' gemini-3.8-flash ' }).model === 'gemini-3.8-flash', 'AI_MODEL 로 바꿈')
  assert(pickAi({ key: 'x', provider: 'Gemini' }).provider === 'gemini', 'AI_PROVIDER=gemini')
  assert(pickAi({ key: 'sk-ant-abc' }).provider === 'anthropic', 'sk-ant- 는 Claude')
  assert(pickAi({ key: 'sk-proj-abc' }).provider === 'openai', '그 밖은 OpenAI 호환')
  assert(pickAi({ key: KEY, provider: 'openai' }).provider === 'openai', 'AI_PROVIDER 가 키 모양보다 먼저')
  assert(pickAi({ key: KEY, url: 'https://proxy.example/v1/chat/completions' }).url === 'https://proxy.example/v1/chat/completions', 'AI_API_URL 로 바꿈')
})

Deno.test('정상 — Bearer 키 · 구조화 출력 스키마 · 생각 짧게 · 결과 검사 통과', async () => {
  mode = 'ok'
  seen = []
  const r = await call()
  assert(seen.length === 1, '한 번만 부름')
  const h = seen[0].headers, b = seen[0].body
  assert(h.get('authorization') === `Bearer ${KEY}`, 'Authorization: Bearer 키')
  assert(b.model === GEMINI_DEFAULT_MODEL && b.temperature === 0.2 && b.reasoning_effort === 'low', '모델 · temperature · reasoning_effort')
  const rf = b.response_format as { type: string; json_schema: { schema: { properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }>; required: string[] } } }
  assert(rf.type === 'json_schema', 'json_schema')
  assert(JSON.stringify(rf.json_schema.schema.properties.kind.enum) === JSON.stringify(REQUEST_KINDS), '종류 다섯 값 그대로')
  assert(JSON.stringify(rf.json_schema.schema.properties.urgency.enum) === JSON.stringify(URGENCIES), '긴급도 세 값 그대로')
  assert(rf.json_schema.schema.required.length === 7, '일곱 칸 모두 필수')
  assert(JSON.stringify(b.messages) === JSON.stringify([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }]), 'system · user 글')
  assert(r.model === GEMINI_DEFAULT_MODEL && r.usage.input === 512 && r.usage.output === 96, '모델 · 토큰 수')
  const p = parseTriage(r.text, { content: '폐기물이 예상보다 빨리 찼습니다.', kind: null, urgent: true, desiredDate: null })
  assert(p.ok, `결과 검사 통과: ${JSON.stringify(p)}`)
})

Deno.test('구조화 출력을 거절하면 — 같은 시간 안에서 json_object 로 한 번만 다시', async () => {
  mode = 'schema-no'
  seen = []
  const r = await call()
  assert(r.text === GOOD, '두 번째에 받은 진짜 응답')
  assert(seen.length === 2, `두 번 부름 (${seen.length})`)
  assert((seen[1].body.response_format as { type: string }).type === 'json_object', '두 번째는 json_object')
  assert(!('reasoning_effort' in seen[1].body), '두 번째는 추가 칸 없이')
})

Deno.test('그 밖의 400 은 다시 보내지 않고 그대로 실패', async () => {
  const e = await fail('other400')
  assert(e.status === 400 && /AI 서버 오류 \(400\)/.test(e.message) && seen.length === 1, e.message)
})

for (const [m, code, re] of [
  ['badkey', 400, /AI 키가 올바르지 않습니다 \(400\)/],
  ['403', 403, /권한이 없습니다/],
  ['404', 404, /모델 이름을 찾지 못했습니다/],
  ['429', 429, /사용량 한도/],
  ['503', 503, /바쁩니다/],
] as const) {
  Deno.test(`실패 ${m} — 까닭을 그대로 · 키 조각 없음 · 다시 보내지 않음`, async () => {
    const e = await fail(m)
    assert(e.code === 'http' && e.status === code && re.test(e.message), e.message)
    assert(seen.length === 1, '한 번만')
  })
}

Deno.test('시간 초과 — timeout 으로 분류', async () => {
  const e = await fail('slow')
  assert(e.code === 'timeout', e.message)
})

Deno.test({ name: '끝 — 서버 닫기', sanitizeOps: false, sanitizeResources: false, fn: async () => { await server.shutdown() } })
