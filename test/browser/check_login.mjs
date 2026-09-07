import { chromium, EXEC } from './_pw.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  로그인이 막히는 자리들 — 0102
//
//  대표님 신고: 「아이디·비밀번호 맞게 넣는데 왜 안 들어가지지?」
//
//  들여다보니 **아무 말도 하지 않는 자리**가 있었습니다. 비밀번호가 맞아
//  로그인은 되는데 사용자 정보(profiles) 한 줄이 없으면, 화면이 그대로
//  로그인 창으로 되돌아옵니다. 오류도 안내도 없습니다. 쓰는 분은 자기가
//  비밀번호를 잘못 친 줄 알고 몇 번이고 다시 칩니다.
//
//  여기서 재는 것:
//   ① 비밀번호가 틀리면 → 「이메일 또는 비밀번호가 올바르지 않습니다」
//   ② 승인 전이면 → 「아직 관리자 승인 전입니다」
//   ③ 로그인은 됐는데 사용자 정보가 없으면 → **무엇을 해야 하는지** 말한다
//   ④ 통신이 안 되는 것은 계정 문제와 **다르게** 말한다
//   ⑤ 이메일 대문자로 쳐도 로그인된다 (폰 자판이 첫 글자를 올립니다)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:4173'
let pass = 0
let fail = 0
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d && !c ? ` — ${d}` : ''}`)
  if (c) pass += 1
  else { fail += 1; process.exitCode = 1 }
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const b = await chromium.launch({ executablePath: EXEC })
const UID = '00000000-0000-0000-0000-0000000000a1'

/**
 * 로그인 서버 흉내.
 *  mode: 'ok' | 'badpw' | 'unconfirmed'
 *  profile: 프로필 한 줄 (null 이면 「없음」, 'offline' 이면 못 닿음)
 */
async function open(mode, profile, { w = 1280 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } })
  const sent = []
  //  ⚠ Playwright 는 **나중에 등록한 route 가 이깁니다.** 그래서 포괄 route 를
  //    먼저 걸어 두고, 그 뒤에 자세한 route 를 겁니다. 반대로 하면 포괄 쪽이
  //    로그인 요청까지 가로채서 「아무 일도 안 일어나는」 검사가 됩니다.
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }))
  await ctx.route('**/auth/v1/token**', (r) => {
    const body = r.request().postDataJSON() ?? {}
    sent.push(body)
    if (mode === 'badpw') {
      return r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials',
          error_code: 'invalid_credentials', msg: 'Invalid login credentials', message: 'Invalid login credentials' }) })
    }
    if (mode === 'unconfirmed') {
      return r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Email not confirmed',
          error_code: 'email_not_confirmed', msg: 'Email not confirmed', message: 'Email not confirmed' }) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: 't', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
      user: { id: UID, aud: 'authenticated', email: 'beonemirae@naver.com', app_metadata: {}, user_metadata: {} },
    }) })
  })
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    if (url.includes('/profiles')) {
      if (profile === 'offline') return r.abort('failed')
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const rows = profile ? [profile] : []
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(single ? (rows[0] ?? null) : rows) })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 })
  await p.waitForTimeout(400)
  return { ctx, p, sent }
}

async function fill(p, email, pw) {
  await p.fill('#login-email', email)
  await p.fill('#login-password', pw)
  await p.getByRole('button', { name: '로그인' }).click()
  await p.waitForTimeout(2500)
}

// ── ① 비밀번호가 틀렸을 때 ──────────────────────────────────────────────────
{
  const { ctx, p } = await open('badpw', null)
  await fill(p, 'beonemirae@naver.com', 'not-the-password')
  const t = flat(await p.textContent('body'))
  ok(/이메일 또는 비밀번호가 올바르지 않습니다/.test(t), '비밀번호가 틀리면 그렇게 말한다', t.slice(0, 90))
  ok(!/undefined|Invalid login credentials/.test(t), '영문 원문이 그대로 보이지 않는다')
  await ctx.close()
}

// ── ② 아직 승인 전일 때 ─────────────────────────────────────────────────────
{
  const { ctx, p } = await open('unconfirmed', null)
  await fill(p, 'beonemirae@naver.com', 'whatever')
  const t = flat(await p.textContent('body'))
  ok(/관리자 승인 전/.test(t), '승인 전이면 「관리자 승인 전」이라고 말한다', t.slice(0, 90))
  //  ⚠ 메일함을 뒤지게 만들면 안 됩니다 — 눌러도 아무 일이 안 일어납니다(0041).
  ok(!/이메일 인증이 완료되지/.test(t), '메일 인증을 하라고 하지 않는다')
  await ctx.close()
}

// ── ③ 로그인은 됐는데 사용자 정보가 없을 때 (이번 신고의 핵심) ──────────────
{
  const { ctx, p } = await open('ok', null)
  await fill(p, 'beonemirae@naver.com', 'right-password')
  const t = flat(await p.textContent('body'))
  ok((await p.locator('[data-login-stuck="no-profile"]').count()) === 1,
    '**로그인 화면으로 조용히 되돌아가지 않는다**', t.slice(0, 120))
  ok(/계정 정보를 찾지 못했습니다/.test(t), '무슨 일이 일어났는지 말한다')
  ok(/비밀번호는 맞습니다/.test(t), '비밀번호 탓이 아니라고 분명히 말한다')
  ok(/beonemirae@naver\.com/.test(t), '어느 계정인지 보여 준다')
  ok(/사용자 관리에서 계정을 다시 만들어야 합니다/.test(t), '관리자가 무엇을 해야 하는지 적어 준다')
  ok((await p.locator('[data-login-retry]').count()) === 1, '다시 시도할 수 있다')
  ok(/로그아웃/.test(t), '다른 계정으로 바꿀 길이 있다 (공용 PC)')
  await ctx.close()
}

// ── ④ 통신이 안 될 때는 **다르게** 말한다 ───────────────────────────────────
//
//   ⚠ supabase 는 통신이 끊기면 몇 초에 걸쳐 **다시 시도**합니다. 그 사이에
//     「계정 정보가 없습니다」를 띄우면 멀쩡한 계정을 고장 났다고 말하는
//     셈입니다 — 그래서 먼저 「확인하는 중」이 보여야 하고, 판정은 그 뒤에
//     나와야 합니다.
{
  const { ctx, p } = await open('ok', 'offline')
  await p.fill('#login-email', 'beonemirae@naver.com')
  await p.fill('#login-password', 'right-password')
  await p.getByRole('button', { name: '로그인' }).click()
  await p.waitForTimeout(900)
  ok((await p.locator('[data-login-checking]').count()) === 1,
    '**다시 시도하는 동안에는 「확인하는 중」** (성급하게 고장 났다고 하지 않음)',
    flat(await p.textContent('body')).slice(-120))
  ok((await p.locator('[data-login-stuck]').count()) === 0, '판정을 아직 내리지 않음')

  await p.locator('[data-login-stuck="offline"]').waitFor({ state: 'visible', timeout: 30000 })
  const t = flat(await p.textContent('body'))
  ok(true, '다시 시도가 끝나면 통신 문제라고 말한다')
  ok(/통신이 안 됩니다/.test(t) && /비밀번호 문제가 아닙니다/.test(t), '통신 탓이라고 분명히 말한다')
  ok(!/계정 정보를 찾지 못했습니다/.test(t), '계정이 고장 났다고 말하지 않는다')
  await ctx.close()
}

// ── ⑤ 정상 로그인 · 이메일 대문자 ───────────────────────────────────────────
{
  const profile = {
    id: UID, email: 'beonemirae@naver.com', name: '송대표', role: 'admin',
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  const { ctx, p, sent } = await open('ok', profile)
  //  ⚠ 폰 자판이 첫 글자를 대문자로 올려 줍니다. 본인은 맞게 쳤다고 생각하는데
  //    서버에는 소문자로 저장돼 있어 「비밀번호가 틀렸다」만 봅니다.
  await fill(p, '  Beonemirae@Naver.com ', 'right-password')
  ok(sent[0]?.email === 'beonemirae@naver.com', '대문자로 쳐도 소문자로 맞춰 보낸다', JSON.stringify(sent[0]?.email))
  await p.waitForTimeout(1200)
  ok(!p.url().endsWith('/login'), '정상 계정은 업무 화면으로 들어간다', p.url())
  await ctx.close()
}

// ── ⑥ 중지·승인대기 계정은 이유를 말하고 로그아웃할 길이 있다 ───────────────
for (const [label, patch, want] of [
  ['승인 대기', { active: false, approved_at: null }, /승인을 기다리는 중입니다/],
  ['중지된 계정', { active: false, approved_at: '2026-01-01T00:00:00Z' }, /비활성화된 계정입니다/],
]) {
  const profile = {
    id: UID, email: 'beonemirae@naver.com', name: '송대표', role: 'admin',
    font_scale: 'normal', client_id: null, created_at: '2026-01-01T00:00:00Z', ...patch,
  }
  const { ctx, p } = await open('ok', profile)
  await fill(p, 'beonemirae@naver.com', 'right-password')
  await p.waitForTimeout(1200)
  const t = flat(await p.textContent('body'))
  ok(want.test(t), `${label} — 이유를 말한다`, t.slice(0, 90))
  ok(/로그아웃/.test(t), `${label} — 다른 계정으로 바꿀 길이 있다`)
  await ctx.close()
}

await b.close()
console.log(`\ncheck_login OK=${pass} FAIL=${fail}`)
