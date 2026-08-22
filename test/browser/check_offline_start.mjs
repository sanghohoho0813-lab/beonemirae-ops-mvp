import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0079 — 신호가 없는 곳에서 **앱을 켰을 때**
//
//   기사님이 지하 보관실에서 앱을 엽니다. 예전에는 「로그인해 주세요」가
//   떴습니다 — 토큰은 멀쩡히 있는데도요. 기사님은 자기가 로그아웃된 줄 알고,
//   비밀번호를 모르면 거기서 아무것도 못 하고 사무실에 전화합니다.
//   **통신 문제를 로그인 문제로 잘못 말한** 것이었습니다.
//
//   ⚠ 서버가 「없다」고 **답한** 것과 서버에 **닿지 못한** 것은 다릅니다.
//     앞은 계정 문제(로그인 화면이 맞습니다), 뒤는 통신 문제입니다.
//     이 검사는 둘을 실제로 갈라 봅니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const b = await chromium.launch({ executablePath: EXEC })

function baseState(role = 'field') {
  return { reqs: 0, writes: [], profile: W.profileFor(role),
    schedules: [{ id: 't1', date: T, client_id: F.clients[0].id, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }] }
}

async function open(state, mode) {
  //  mode: 'on' | 'off' | 'no-profile'
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  const net = { mode }
  //  ⚠ 나중에 등록한 라우트가 이깁니다 — 끊김 흉내는 여기서 답니다.
  await ctx.route('**/rest/v1/**', async (r) => {
    if (net.mode === 'off') return r.abort('internetdisconnected')
    if (net.mode === 'no-profile' && /\/profiles/.test(r.request().url())) {
      //  서버가 **닿아서** 「없다」고 답한 경우 — 이건 계정 문제입니다
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    }
    return r.fallback()
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 90)))
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  //  ⚠ 신호가 끊겼을 때는 세션 확인이 늦게 끝납니다 (토큰 갱신을 한 번
  //    시도하다 실패합니다). 「로그인 상태를 확인하는 중…」에서 재면 아직
  //    아무 판단도 안 난 상태를 재는 것이라 헛됩니다. 판단이 날 때까지 봅니다.
  await p.waitForFunction(() => !/로그인 상태를 확인하는 중/.test(document.body.innerText ?? ''),
    null, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, net, errs }
}

const look = (p) => p.evaluate(() => {
  const body = (document.body.innerText ?? '').replace(/\s+/g, ' ').trim()
  return { path: location.pathname, len: body.length,
    offline: !!document.querySelector('[data-auth-offline]'),
    로그인화면: /회사에서 발급받은 계정으로 로그인/.test(body),
    말해줌: /통신이 안 됩니다/.test(body),
    안심: /로그아웃된 것이 아닙니다/.test(body),
    다시단추: !!document.querySelector('[data-auth-offline-retry]'),
    오늘일정: /오늘 일정/.test(body), head: body.slice(0, 90) }
})

// ── ① 신호 없이 앱을 켬 ────────────────────────────────────────────────────
{
  const s = await open(baseState(), 'off')
  const r = await look(s.p)
  ok(!r.로그인화면, '① **로그인 화면으로 튕기지 않음**', r.head)
  ok(r.offline, '① 통신 안 됨 화면이 뜸')
  ok(r.말해줌, '① 무슨 일인지 말해 줌')
  ok(r.안심, '① **「로그아웃된 것이 아닙니다」라고 안심시킴**')
  ok(r.다시단추, '① 다시 시도할 수 있음')
  ok(r.len > 40, '① 하얀 화면이 아님', `${r.len}자`)
  ok(s.errs.length === 0, '① 터진 오류 없음', s.errs[0] ?? '')

  //  ── ② 신호가 돌아오면 그대로 이어서 일합니다 ────────────────────────────
  s.net.mode = 'on'
  await s.p.locator('[data-auth-offline-retry]').dispatchEvent('click')
  await s.p.waitForTimeout(6000)
  const r2 = await look(s.p)
  ok(!r2.offline, '② **다시 시도하면 통신 안 됨 화면이 사라짐**')
  ok(r2.오늘일정, '② **다시 로그인하지 않고 오늘 일정으로 이어짐**', r2.head)
  await s.ctx.close()
}

// ── ③ 서버가 「계정 없다」고 답한 경우는 로그인 화면이 맞습니다 ────────────
//
//   ⚠ 이 검사가 없으면, 위 고침이 **모든 로그인 실패를 통신 문제로 덮는**
//     쪽으로 잘못 넓어져도 아무도 모릅니다. 갈라져 있는지 확인합니다.
{
  const s = await open(baseState(), 'no-profile')
  const r = await look(s.p)
  ok(!r.offline, '③ 계정이 없으면 통신 안 됨 화면이 **아님**')
  ok(r.로그인화면 || r.path === '/login', '③ **계정이 없으면 로그인 화면으로 감**', `${r.path} · ${r.head.slice(0, 40)}`)
  await s.ctx.close()
}

// ── ④ 다른 역할도 같습니다 ─────────────────────────────────────────────────
for (const role of ['office', 'admin']) {
  const s = await open(baseState(role), 'off')
  const r = await look(s.p)
  ok(!r.로그인화면 && r.offline, `④ ${role} — 신호 없이 켜도 로그인으로 안 튕김`)
  await s.ctx.close()
}

await b.close()
