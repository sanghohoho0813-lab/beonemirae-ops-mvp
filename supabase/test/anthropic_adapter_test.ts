// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage · Claude 어댑터(anthropic.ts) — 공식 SDK 가 실제로 보내는 요청 · 받는 응답
//
//   가짜인 것은 「Anthropic 주소」 하나(이 파일이 띄우는 작은 서버)입니다. SDK 는 진짜라
//   헤더 · 본문 · 오류 분류가 배포될 때와 같습니다. 이 검사는 「외부 AI 가 실제로 답했다」를
//   증명하지 않습니다 — 그것은 키 등록 · 배포 뒤 발표 가이드의 「AI 연결 확인」으로 합니다.
//
//  실행(저장소 맨 위에서): deno test --config supabase/functions/ai-triage/deno.json --allow-net --allow-env --allow-read supabase/test/anthropic_adapter_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { claudeJson } from '../functions/ai-triage/anthropic.ts'
import { ProviderError } from '../functions/ai-triage/provider.ts'

type Seen = { headers: Headers; body: Record<string, unknown> }
let seen: Seen | null = null
let mode = 'ok'

const server = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const body = (await req.json()) as Record<string, unknown>
  seen = { headers: req.headers, body }
  const j = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
  const err = (status: number, type: string, message: string) => j(status, { type: 'error', error: { type, message } })
  if (mode === '401') return err(401, 'authentication_error', 'invalid x-api-key')
  if (mode === '404') return err(404, 'not_found_error', 'model: no-such-model')
  if (mode === '429') return err(429, 'rate_limit_error', 'slow down')
  if (mode === 'slow') { await new Promise((r) => setTimeout(r, 1500)); }
  const content = mode === 'refusal' ? [] : [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text: '{"kind":"긴급수거","also_kinds":["소모품"],"urgency":"높음","summary":"요약","points":["a"],"draft":"초안","basis":"근거"}' },
  ]
  return j(200, {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content,
    stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: 321, output_tokens: 87 },
  })
})
const base = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`
const call = (timeoutMs = 5000) => claudeJson({ apiKey: 'sk-ant-test-0000000000', baseURL: base, model: 'claude-opus-5-5', system: 'SYS', user: 'USER', timeoutMs })
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m) }

Deno.test('정상 — 공식 SDK 헤더 · 본문 · 응답 읽기', async () => {
  mode = 'ok'
  const r = await call()
  assert(r.text.startsWith('{"kind":"긴급수거"'), '텍스트 블록만 모아 읽음 (생각 블록은 건너뜀)')
  assert(r.model === 'claude-opus-5-5' && r.usage.input === 321 && r.usage.output === 87, '모델 · 토큰 수')
  const h = seen!.headers, b = seen!.body
  assert(h.get('x-api-key') === 'sk-ant-test-0000000000', 'x-api-key 헤더')
  assert(!!h.get('anthropic-version'), 'anthropic-version 헤더')
  assert((h.get('anthropic-beta') ?? '').includes('server-side-fallback-2026-07-01'), '거절 시 권장 모델로 다시 (beta 헤더)')
  assert(b.fallbacks === 'default', 'fallbacks: default')
  assert(b.model === 'claude-opus-5-5' && b.system === 'SYS', '모델 · 시스템 글')
  assert(JSON.stringify(b.messages) === JSON.stringify([{ role: 'user', content: 'USER' }]), '사용자 글 하나')
  assert(!('temperature' in b), 'temperature 를 보내지 않음 (이 모델은 400)')
  assert((b.output_config as { effort?: string })?.effort === 'low', 'effort low')
  assert(!('betas' in b), 'betas 는 본문이 아니라 헤더로')
})

for (const [m, code, re] of [['401', 401, /AI 키가 올바르지 않습니다 \(401\)/], ['404', 404, /모델 이름을 찾지 못했습니다/], ['429', 429, /사용량 한도/]] as const) {
  Deno.test(`실패 ${m} — 까닭을 그대로 · 키 조각 없음`, async () => {
    mode = m
    try { await call(); throw new Error('성공하면 안 됨') } catch (e) {
      assert(e instanceof ProviderError && e.status === code && re.test(e.message), `분류: ${String(e)}`)
      assert(!/sk-ant-test-0000000000/.test(String((e as Error).message)), '키가 문구에 없음')
    }
  })
}

Deno.test('거절(refusal) — 실패로 (가짜 결과 없음)', async () => {
  mode = 'refusal'
  try { await call(); throw new Error('성공하면 안 됨') } catch (e) {
    assert(e instanceof ProviderError && /거절/.test(e.message), String(e))
  }
})

Deno.test('시간 초과 — timeout 으로 분류', async () => {
  mode = 'slow'
  try { await call(300); throw new Error('성공하면 안 됨') } catch (e) {
    assert(e instanceof ProviderError && e.code === 'timeout', String(e))
  }
})

Deno.test({ name: '끝 — 서버 닫기', sanitizeOps: false, sanitizeResources: false, fn: async () => { await server.shutdown() } })
