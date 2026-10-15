// ─────────────────────────────────────────────────────────────────────────────
//  대시보드 붙여넣기 판(docs/deploy/ai-triage-dashboard.ts) — 처음부터 끝까지 한 번
//
//   가짜 Supabase(로그인 · profiles · client_requests · clients · ai_calls)와 가짜 Gemini 를 띄우고,
//   붙여넣기 판을 진짜 Deno 프로세스로 돌려 HTTP 요청 하나를 보냅니다.
//   확인: Gemini 로 감 · x-goog-api-key · 결과 200 · ai_calls 기록 · 키 없음/실패 까닭.
//   ⚠ 실제 Google 이 답하는지는 증명하지 않습니다 — 발표 화면 「지금 AI 연결 확인」으로 합니다.
//
//  실행(저장소 맨 위에서):
//   deno run --config supabase/functions/ai-triage/deno.json -A supabase/test/dashboard_bundle_smoke.ts
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'AQ.Ab8RN6SMOKESMOKESMOKESMOKESMOKE'
const GOOD = '{"kind":"긴급수거","also_kinds":["소모품"],"urgency":"높음","summary":"보관 공간이 빨리 차 내일 오전 수거와 용기 10개를 요청했습니다.","points":["내일 오전 수거 희망","63L 용기 10개"],"draft":"요청 확인했습니다. 원하신 시점에 방문 가능한지와 용기 준비 가능 여부를 확인한 뒤 안내드리겠습니다.","basis":"빨리 찼다고 써서 긴급도 높음"}'
const inserts: Record<string, unknown>[] = []
let geminiSeen: { path: string; key: string | null } | null = null
let geminiMode = 'ok'

const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const sb = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const u = new URL(req.url)
  if (u.pathname === '/auth/v1/user') return j({ id: 'u1', aud: 'authenticated', email: 'a@x', app_metadata: {}, user_metadata: {} })
  if (u.pathname === '/rest/v1/profiles') return j({ role: 'admin', active: true, name: '대표' })
  if (u.pathname === '/rest/v1/client_requests') {
    return j({ id: '5b0e0140-0000-4000-8000-0000000000aa', client_id: 'c1', content: '폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전 수거 부탁드리고 63L 용기도 10개 부탁드립니다.', kind: '긴급수거', urgent: true, desired_date: null, demo_session_id: null })
  }
  if (u.pathname === '/rest/v1/clients') return j({ is_demo_generated: true })
  if (u.pathname === '/rest/v1/ai_calls' && req.method === 'POST') {
    const b = await req.json()
    inserts.push(Array.isArray(b) ? b[0] : b)
    return j({ id: `call-${inserts.length}` }, 201)
  }
  return j({ message: `없는 주소 ${u.pathname}` }, 404)
})
const gm = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  await req.json()
  geminiSeen = { path: new URL(req.url).pathname, key: req.headers.get('x-goog-api-key') }
  if (geminiMode === 'badkey') return j({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, 400)
  return j({ candidates: [{ content: { parts: [{ text: GOOD }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 120 }, modelVersion: 'gemini-2.5-flash-lite' })
})
const sbUrl = `http://127.0.0.1:${(sb.addr as Deno.NetAddr).port}`
const gmUrl = `http://127.0.0.1:${(gm.addr as Deno.NetAddr).port}/v1beta`

let fails = 0
const ok = (c: unknown, m: string, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${c ? '' : ` — ${d}`}`); if (!c) fails++ }

async function runBundle(env: Record<string, string>, port: number) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['run', '--config', 'supabase/functions/ai-triage/deno.json', '-A', 'docs/deploy/ai-triage-dashboard.ts'],
    env: { SUPABASE_URL: sbUrl, SUPABASE_ANON_KEY: 'anon', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, ...env },
    stdout: 'piped', stderr: 'piped',
  })
  const child = cmd.spawn()
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/`, { method: 'OPTIONS' }).then((r) => r.body?.cancel()); break } catch { await new Promise((r) => setTimeout(r, 150)) }
  }
  const call = async () => {
    const r = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: '5b0e0140-0000-4000-8000-0000000000aa' }) })
    return { status: r.status, body: await r.json() as Record<string, unknown> }
  }
  return { child, call }
}

{
  const { child, call } = await runBundle({ AI_API_KEY: KEY, AI_API_URL: gmUrl }, 18741)
  const r = await call()
  ok(r.status === 200 && r.body.ok === true, '① 붙여넣기 판 → 200 · 성공', JSON.stringify(r.body).slice(0, 200))
  ok(geminiSeen?.path === '/v1beta/models/gemini-2.5-flash-lite:generateContent' && geminiSeen?.key === KEY, '① Gemini 기본 모델 · x-goog-api-key 로 감', JSON.stringify(geminiSeen))
  const res = r.body.result as Record<string, unknown> | undefined
  ok(res?.kind === '긴급수거' && res?.urgency === '높음' && res?.model === 'gemini-2.5-flash-lite', '① 결과 — 긴급수거 · 긴급도 높음 · 모델 이름', String(JSON.stringify(res)).slice(0, 160))
  ok(inserts.length === 1 && inserts[0].ok === true && inserts[0].kind === 'request_triage_demo', '① ai_calls 에 시연 호출로 기록', String(JSON.stringify(inserts[0])).slice(0, 160))
  geminiMode = 'badkey'
  const bad = await call()
  ok(bad.status >= 400 && /AI 키가 올바르지 않습니다 \(400\)/.test(String(bad.body.error)) && !String(bad.body.error).includes(KEY), '② 키 오류 — 까닭 그대로 · 키 조각 없음', JSON.stringify(bad.body).slice(0, 160))
  ok(inserts.length === 2 && inserts[1].ok === false, '② 실패도 ai_calls 에 기록')
  child.kill(); await child.status
}
{
  const { child, call } = await runBundle({ AI_API_KEY: '' }, 18742)
  const r = await call()
  ok(r.status >= 400 && /AI_API_KEY/.test(String(r.body.error)), '③ 키를 안 넣었으면 — 「AI_API_KEY 가 서버에 등록되지 않았습니다」', JSON.stringify(r.body).slice(0, 160))
  child.kill(); await child.status
}

await sb.shutdown(); await gm.shutdown()
console.log(`\n붙여넣기 판 — 실패 ${fails}`)
Deno.exit(fails ? 1 : 0)
