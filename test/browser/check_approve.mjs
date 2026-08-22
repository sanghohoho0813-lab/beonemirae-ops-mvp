import { chromium, EXEC } from './_pw.mjs'

//  「사용자 관리」의 승인 대기 화면을 확인합니다.
//
//  서버가 실제로 막는지는 이미 04_signup_approval.sql 이 진짜 PostgreSQL 에서
//  확인했습니다. 여기서 보는 것은 화면입니다 — 승인 대기가 눈에 띄게 뜨는지,
//  역할을 골라 승인하면 서버로 무엇이 나가는지.
//
//  로그인 세션과 목록 응답은 만들어 넣습니다. 이 컨테이너에는 관리자 계정의
//  비밀번호가 없고, 있더라도 운영 DB 에 검증용 신청 계정을 만들 수는 없습니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const ADMIN_ID = '00000000-0000-0000-0000-0000000000ad'
const PENDING_ID = '00000000-0000-0000-0000-0000000000p1'.replace('p1', 'b1')

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const admin = {
  id: ADMIN_ID, email: 'sanghohoho0813@gmail.com', name: '대표', role: 'admin',
  font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
  created_at: '2026-01-01T00:00:00Z',
}
const pending = {
  id: PENDING_ID, email: 'newstaff@naver.com', name: '김현장', role: 'field',
  font_scale: 'normal', active: false, approved_at: null, client_id: null,
  created_at: '2026-08-10T02:00:00Z', clients: null,
}
const CLIENTS = [
  { id: '00000000-0000-0000-0000-0000000000c1', name: '한양의료재단', type: '병원', address: '서울', manager: '', phone: '', collection_cycle: '', collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } })

let rpcCall = null

await ctx.route('**/rest/v1/**', (route) => {
  const req = route.request()
  const url = req.url()
  const accept = req.headers()['accept'] ?? ''
  const single = accept.includes('vnd.pgrst.object')
  const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })

  if (url.includes('/rpc/admin_approve_user')) {
    rpcCall = req.postDataJSON()
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  }
  if (url.includes('/profiles')) {
    if (url.includes(`id=eq.${ADMIN_ID}`)) return json(single ? admin : [admin])
    //  승인이 끝난 뒤의 새로고침에서는 대기 목록이 비어야 합니다.
    const rows = rpcCall ? [admin, { ...pending, active: true, approved_at: '2026-08-12T00:00:00Z', role: 'office' }] : [admin, pending]
    return json(single ? rows[0] : rows)
  }
  if (url.includes('/clients')) return json(CLIENTS)
  return json([])
})

const p = await ctx.newPage()

//  로그인 상태를 만들어 둡니다 (supabase-js 가 읽는 자리에 그대로 넣습니다).
await p.addInitScript(
  ([key, user]) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        access_token: 'verify-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        refresh_token: 'verify-refresh-token',
        user,
      }),
    )
  },
  ['beonemirae-ops:auth', { id: ADMIN_ID, aud: 'authenticated', email: admin.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }],
)

await p.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('text=승인 대기', { timeout: 15000 })

const body = () => p.textContent('body').then((t) => t ?? '')

ok(/승인 대기 1명/.test(await body()), '승인 대기 건수가 화면 맨 위에 표시')
ok(/김현장/.test(await body()) && /newstaff@naver\.com/.test(await body()), '신청자 이름과 이메일 표시')
ok(/8월 10일 신청/.test(await body()), '언제 신청했는지 표시')

const row = p.locator(`[data-pending-row]`)
ok((await row.count()) === 1, '승인 대기 줄이 목록과 분리되어 있음')

//  기본값은 현장 담당자여야 합니다 (잘못 눌렀을 때 피해가 가장 작은 쪽)
ok(/현장 담당자\(으\)로 승인/.test(await body()), '기본 역할은 현장 담당자')

//  역할을 사무실로 바꾸고 승인
await row.getByRole('button', { name: '사무실 담당자', exact: true }).click()
ok(/사무실 담당자\(으\)로 승인/.test(await body()), '역할을 고르면 승인 버튼 문구가 따라 바뀜')

await p.screenshot({ path: `${SHOT}/approve-queue.png`, fullPage: true })

await row.getByRole('button', { name: /승인/ }).click()
await p.waitForTimeout(1500)

ok(rpcCall !== null, '승인 → 서버 함수 호출됨')
ok(rpcCall?.p_user_id === PENDING_ID, '올바른 계정에 대해 호출', rpcCall?.p_user_id)
ok(rpcCall?.p_role === 'office', '화면에서 고른 역할이 그대로 전달', rpcCall?.p_role)
ok(rpcCall?.p_client_id === null, '직원 계정은 소속 병원 없이 전달')

await p.waitForSelector('text=승인했습니다', { timeout: 10000 })
ok(true, '승인 결과 안내 표시')
ok(!/승인 대기 \d+명/.test(await body()), '승인 후 대기 목록에서 사라짐')

await p.screenshot({ path: `${SHOT}/approve-done.png`, fullPage: true })

// ── 이름 바꾸기 — 호칭만, 권한은 그대로 ──────────────────────────────────
//   지금 대표님 계정 이름과 예비 계정 이름이 서로 바뀌어 있는데 화면에
//   고칠 곳이 없었습니다. 권한 구조를 건드리면 대표님이 본인 화면에서
//   막힐 수 있어, **이름만** 바꿉니다.
{
  const patches = []
  await ctx.route('**/rest/v1/profiles**', (route) => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON())
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fallback()
  })
  const btn = p.locator(`[data-user-rename="${ADMIN_ID}"]`)
  ok((await btn.count()) === 1, '계정마다 「이름 바꾸기」가 있음')

  p.once('dialog', (d) => void d.accept('관리자'))
  await btn.click()
  await p.waitForTimeout(1200)
  ok(patches.length === 1, '이름만 서버로 보냄', JSON.stringify(patches))
  ok(patches[0]?.name === '관리자', '고친 이름이 그대로', String(patches[0]?.name))
  ok(!('role' in (patches[0] ?? {})), '**권한(role)은 건드리지 않음**', Object.keys(patches[0] ?? {}).join(','))
  ok(!('active' in (patches[0] ?? {})), '사용/중지도 건드리지 않음')

  //  빈 이름은 보내지 않습니다 — 비면 화면이 사람을 이메일로 부르게 됩니다.
  patches.length = 0
  p.once('dialog', (d) => void d.accept('   '))
  await btn.click()
  await p.waitForTimeout(900)
  ok(patches.length === 0, '빈 이름은 서버로 안 보냄', JSON.stringify(patches))
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
