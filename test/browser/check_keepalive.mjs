//  서버 유지 신호 (/api/keepalive) — Supabase 무료 프로젝트 일시정지 막기
//
//   브라우저를 띄우지 않습니다. 함수(api/keepalive.ts)를 그대로 불러 가짜 서버 응답으로 잽니다.
//   잽니다: 기록 함수(app_ping)가 있으면 ok · 없으면 로그인 전용 함수로 DB 까지(reached · needs_sql) ·
//           일시정지(540)면 503 으로 실패를 알림 · 못 닿으면 503 · 설정이 없으면 500 ·
//           답에 주소 · 키가 없음 · 공개 키만 씀 · GET 만 · 한 번에 3번.
import handler, { PINGS, ping, stateOf } from '../../api/keepalive.ts'

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const URL_ = 'https://test-local.supabase.co'
const KEY = 'test-anon-key'

/** 가짜 Supabase — fn 이름별 응답 코드. 부른 기록을 남깁니다 */
function fake(map) {
  const calls = []
  const f = async (url, init) => {
    const fn = String(url).split('/rpc/')[1]
    calls.push({ url: String(url), fn, method: init?.method, headers: init?.headers, body: init?.body })
    const status = typeof map === 'function' ? map(fn, calls.length) : map[fn]
    if (status === 'throw') throw new TypeError('fetch failed')
    return new Response('{}', { status })
  }
  return { f, calls }
}
async function run(map, env = { VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY }, method = 'GET') {
  const { f, calls } = fake(map)
  const realFetch = globalThis.fetch
  const realEnv = { ...process.env }
  globalThis.fetch = f
  for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) delete process.env[k]
  Object.assign(process.env, env)
  try {
    const res = await handler(new Request('https://app.example/api/keepalive', { method }))
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, text, calls, headers: res.headers }
  } finally {
    globalThis.fetch = realFetch
    for (const k of Object.keys(process.env)) if (!(k in realEnv)) delete process.env[k]
    Object.assign(process.env, realEnv)
  }
}

// ── 1. 기록 함수가 있음 (PROPOSAL_0151 뒤) ─────────────────────────────────
{
  const r = await run({ app_ping: 200 })
  ok(r.status === 200 && r.body.ok === true && r.body.state === 'ok' && r.body.needs_sql === false, '1 app_ping 이 돌면 ok', JSON.stringify(r.body))
  ok(r.calls.length === PINGS && PINGS === 3 && r.calls.every((c) => c.fn === 'app_ping'), '1 한 번에 3번 부름 (공식 문서의 「하루에 요청 몇 번」)')
  ok(r.calls.every((c) => c.method === 'POST' && c.headers.apikey === KEY && c.headers.Authorization === `Bearer ${KEY}` && c.body === '{}'), '1 공개 키(anon)로 · 인자 없이')
  ok(r.calls.every((c) => c.url.startsWith(`${URL_}/rest/v1/rpc/`)), '1 설정된 서버의 rpc 만 부름')
  ok(r.headers.get('cache-control') === 'no-store', '1 답을 캐시하지 않음 (매번 실제로 감)')
  ok(!r.text.includes(KEY) && !r.text.includes('supabase.co'), '1 답에 키 · 서버 주소가 없음', r.text)
  ok(typeof r.body.at === 'string' && !Number.isNaN(Date.parse(r.body.at)), '1 답에 시각')
}

// ── 2. 기록 함수가 아직 없음 — 로그인 전용 함수로 DB 까지 ────────────────────
{
  const r = await run({ app_ping: 404, app_schema_version: 401 })
  ok(r.status === 200 && r.body.ok === true && r.body.state === 'reached' && r.body.needs_sql === true, '2 app_ping 없음 → DB 가 「권한 없음」이라 답함 = reached · needs_sql', JSON.stringify(r.body))
  ok(r.calls.filter((c) => c.fn === 'app_ping').length === 1 && r.calls.filter((c) => c.fn === 'app_schema_version').length === 3, '2 없는 함수는 한 번만 묻고, 나머지는 로그인 전용 함수로')
  const r2 = await run({ app_ping: 404, app_schema_version: 403 })
  ok(r2.body.state === 'reached', '2 403 도 DB 가 답한 것')
  const r3 = await run({ app_ping: 404, app_schema_version: 404 })
  ok(r3.status === 503 && r3.body.ok === false && r3.body.state === 'down', '2 둘 다 없음(404) — DB 까지 갔다고 말하지 않음 (실패로 알림)', JSON.stringify(r3.body))
}

// ── 3. 일시정지 · 못 닿음 — 부른 쪽이 실패로 알게 503 ─────────────────────────
{
  const r = await run({ app_ping: 540 })
  ok(r.status === 503 && r.body.ok === false && r.body.state === 'paused', '3 일시정지(540) → 503 · state paused (부른 쪽이 실패로 앎)', JSON.stringify(r.body))
  ok(r.calls.length === 1, '3 일시정지면 더 부르지 않음')
  const r2 = await run({ app_ping: 503 })
  ok(r2.status === 503 && r2.body.state === 'down', '3 서버 응답 없음(503) → down')
  const r3 = await run({ app_ping: 'throw' })
  ok(r3.status === 503 && r3.body.ok === false && r3.body.state === 'down', '3 통신이 터져도 답은 함 (503 · down)')
  const r4 = await run((fn, n) => (n === 1 ? 503 : 200))
  ok(r4.status === 200 && r4.body.state === 'ok', '3 처음 한 번 실패해도 뒤에 닿으면 ok')
}

// ── 4. 설정 · 요청 방식 ────────────────────────────────────────────────────
{
  const r = await run({ app_ping: 200 }, {})
  ok(r.status === 500 && r.body.state === 'not_configured' && r.calls.length === 0, '4 서버 주소 · 키가 없으면 아무 데도 안 부르고 not_configured')
  const r2 = await run({ app_ping: 200 }, { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY })
  ok(r2.status === 200 && r2.body.state === 'ok', '4 VITE_ 없는 이름으로 넣어도 됨')
  const r3 = await run({ app_ping: 200 }, undefined, 'POST')
  ok(r3.status === 405 && r3.calls.length === 0, '4 GET 만 받음 (POST 는 405 · 아무 데도 안 부름)')
  const r4 = await run({ app_ping: 200 }, { VITE_SUPABASE_URL: `${URL_}//`, VITE_SUPABASE_ANON_KEY: KEY })
  ok(r4.calls.every((c) => c.url === `${URL_}/rest/v1/rpc/app_ping`), '4 주소 끝의 / 는 정리')
}

// ── 5. 작은 조각 ──────────────────────────────────────────────────────────
ok(stateOf(200) === 'ok' && stateOf(204) === 'ok' && stateOf(401) === 'reached' && stateOf(403) === 'reached' && stateOf(404) === 'down' && stateOf(540) === 'paused' && stateOf(500) === 'down', '5 응답 코드 → 상태')
{
  const { f, calls } = fake({ app_ping: 200 })
  const r = await ping(URL_, KEY, f)
  ok(r.state === 'ok' && r.needsSql === false && calls.length === 3, '5 ping() 만 따로 불러도 같음')
}
