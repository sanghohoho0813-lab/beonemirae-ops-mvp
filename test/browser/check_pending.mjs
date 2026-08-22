import { chromium, EXEC } from './_pw.mjs'
const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000c9'
const out = []
const ok = (c, m, d='') => { out.push(`${c?' OK ':'FAIL'} | ${m}${d?` — ${d}`:''}`); if(!c) process.exitCode=1 }

const b = await chromium.launch({ executablePath: EXEC })

async function visit(profile, label, shot) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } })
  await ctx.route('**/rest/v1/**', (r) => {
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = r.request().url().includes('/profiles') ? (single ? profile : [profile]) : []
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now()/1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  const text = (await p.textContent('body')) ?? ''
  await p.screenshot({ path: `${SHOT}/${shot}`, fullPage: true })
  await ctx.close()
  return text
}

const base = { id: UID, email: 'newstaff@naver.com', name: '김현장', role: 'field', font_scale: 'normal', client_id: null }

const pending = await visit({ ...base, active: false, approved_at: null }, '승인 대기', 'pending-screen.png')
ok(/승인을 기다리는 중입니다/.test(pending), '승인 대기 → 「승인을 기다리는 중입니다」')
ok(/가입 신청이 접수되었습니다/.test(pending), '신청이 접수되었다고 안내')
ok(!/비활성화된 계정/.test(pending), '「비활성화된 계정」으로 잘못 안내하지 않음')
ok(/로그아웃/.test(pending), '로그아웃 버튼이 있음 (공용 PC 에서 막히지 않게)')

const suspended = await visit({ ...base, active: false, approved_at: '2026-01-01T00:00:00Z' }, '중지', 'suspended-screen.png')
ok(/비활성화된 계정입니다/.test(suspended), '중지된 계정 → 「비활성화된 계정입니다」')
ok(!/승인을 기다리는 중/.test(suspended), '중지를 승인 대기로 잘못 안내하지 않음')

await b.close()
console.log(out.join('\n'))
