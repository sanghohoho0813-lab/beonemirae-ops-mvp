// ─────────────────────────────────────────────────────────────────────────────
// 사용자 · 권한 관리 (실제 브라우저 · 실제 DB · 4개 역할)
//
//  대표님이 앱 안에서 직원·병원 계정을 직접 만들고 관리하실 수 있어야 합니다.
//  그런데 계정을 만드는 힘(service_role 키)은 브라우저에 두면 안 됩니다 —
//  그 키 하나면 RLS 가 통째로 무의미해집니다. 그래서 그 힘은 서버(0018 의
//  DB 함수)에 두고, 서버가 '부른 사람이 관리자인가'를 다시 확인합니다.
//
//  여기서 보는 것
//   1) 관리자가 화면에서 계정을 만든다 (직원 · 병원)
//   2) 만든 계정으로 실제로 로그인된다
//   3) 병원 계정은 소속 병원이 없으면 만들어지지 않는다
//   4) 사무실·현장·병원 계정이 직접 함수를 불러도 서버가 거절한다
//      (화면만 숨기는 것이 아니라 서버가 막는가)
//   5) 역할 변경 · 사용/중지 · 비밀번호 초기화 · 병원 소속 변경
//   6) 자기 자신을 잠그거나 마지막 관리자를 없앨 수 없다
//   7) 모든 변경이 감사기록에 남는다
//   8) 병원 계정끼리 서로의 데이터가 보이지 않는다
//   9) PC(1440) 와 폰(390) 에서 화면이 밀리거나 잘리지 않는다
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=... TEST_CLIENT_PW=...
//    node supabase/test/43_user_admin.mjs
//
//  · 0018 을 적용하지 않았으면 그 사실을 먼저 알리고 실패합니다.
//  · 만드는 계정에는 모두 '[검증]' 이 붙고 끝나면 지웁니다.
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.SUPABASE_URL
const A = process.env.SUPABASE_ANON_KEY
const S = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !A || !S) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const BASE = process.env.BASE || 'http://localhost:4173'
const DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'beonemirae.test'
const MARK = '[검증]'
const STAMP = Date.now() % 100000
const TEMP_PW = `Bm${STAMP}temp!`

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  }).then(json)
/** 로그인한 사용자로 REST/RPC 를 부릅니다 (공개 키 + 그 사람 토큰) */
const as = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  }).then(json)

async function token(email, password) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(json)
    if (r.body?.access_token) return r.body.access_token
    //  GoTrue 는 짧은 시간에 로그인을 몰아치면 429 로 막습니다. 검사가
    //  여러 계정을 연달아 로그인하므로 잠시 쉬었다 다시 시도합니다.
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    return null
  }
  return null
}

async function until(page, want, ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await want()) return { ok: true, ms: Date.now() - t0 }
    await page.waitForTimeout(300)
  }
  return { ok: false, ms: Date.now() - t0 }
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}

/** 화면이 옆으로 밀려 나가는가 (폰에서 가장 흔한 깨짐) */
const OVERFLOW = () => {
  const doc = document.documentElement
  const over = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right > doc.clientWidth + 1.5 || r.left < -1.5) {
      over.push(`${el.tagName}.${String(el.className).slice(0, 40)} → ${Math.round(r.right)}`)
    }
  }
  return { docW: doc.clientWidth, scrollW: doc.scrollWidth, over: over.slice(0, 4) }
}

async function main() {
  console.log('\n════ 사용자 · 권한 관리 ════')

  const made = []          // 정리할 계정 uuid
  const errors = []
  let browser = null

  // ── 0. 0018 적용 여부 ────────────────────────────────────────────────
  section('0. 준비 — 0018 migration 적용 여부')
  const adminTok = await token(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
  if (!adminTok) {
    no('관리자 로그인', '비밀번호를 확인해 주세요')
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }
  //  일부러 틀린 값(빈 이메일)으로 불러 봅니다. 함수가 없으면 404,
  //  있으면 값 검사에 걸려 400 이 옵니다 — 그 차이로 적용 여부를 압니다.
  const probe = await as(adminTok, '/rpc/admin_create_user', {
    method: 'POST',
    body: JSON.stringify({ p_email: '', p_password: '', p_name: '', p_role: 'field', p_client_id: null }),
  })
  const ready = probe.status !== 404
  check(ready, '계정 관리 함수가 준비돼 있음 (admin_create_user)',
    ready ? '' : '★ 0018_user_admin.sql 을 먼저 적용해 주세요')
  if (!ready) {
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log('사용자 관리: NO (0018 migration 미적용)')
    process.exit(1)
  }

  const client1 = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body ?? []
  if (client1.length < 2) {
    no('검증용 거래처가 2곳 필요합니다', `${client1.length}곳 — 06_cross_client.mjs 를 먼저 돌려 주세요`)
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }
  const [homeA, homeB] = client1

  const startProfiles = ((await svc('/profiles?select=id')).body ?? []).length
  //  감사기록은 **이번 회차에 생긴 것만** 봅니다. 그냥 최근 것을 훑으면
  //  앞서 돈 다른 검사가 남긴 줄이 잡혀서, 이번에 안 남았는데도 남은 것처럼
  //  보입니다(실제로 그래서 '역할 변경'이 통과하고 있었습니다).
  const startAudit = (await svc('/audit_logs?select=id&order=id.desc&limit=1')).body?.[0]?.id ?? 0

  try {
    const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
    browser = await pw.chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
    })

    // ── 1. 관리자가 화면에서 직원 계정을 만든다 ────────────────────────
    section('1. 관리자가 화면에서 직원 계정을 만든다 (PC 1440)')
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)

    await admin.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
    await until(admin, async () => /사용자 관리/.test(await admin.locator('body').innerText()))
    check(/사용자 관리/.test(await admin.locator('body').innerText()), '「사용자 관리」 화면이 열림')
    check((await admin.locator('a[href="/users"], a[href$="/users"]').count()) > 0
          || /사용자 관리/.test(await admin.locator('nav, aside').first().innerText().catch(() => '')),
      '메뉴에 「사용자 관리」가 있음')

    const staffEmail = `staff${STAMP}@${DOMAIN}`
    const staffName = `${MARK}새사무실-${STAMP}`
    await admin.locator('button:has-text("계정 만들기")').first().click()
    await admin.waitForTimeout(800)
    await admin.fill('#new-user-name', staffName)
    await admin.fill('#new-user-email', staffEmail)
    await admin.fill('#new-user-password', TEMP_PW)
    await admin.selectOption('#new-user-role', 'office')
    await admin.waitForTimeout(400)
    await admin.locator('button:has-text("계정 만들기")').last().click()

    const madeStaff = await until(admin, async () =>
      ((await svc(`/profiles?select=id&email=eq.${encodeURIComponent(staffEmail)}`)).body ?? []).length === 1)
    check(madeStaff.ok, '직원 계정이 만들어짐', `${(madeStaff.ms / 1000).toFixed(1)}초`)
    const staff = (await svc(`/profiles?select=*&email=eq.${encodeURIComponent(staffEmail)}`)).body?.[0]
    if (staff) made.push(staff.id)
    check(staff?.role === 'office', '고른 역할 그대로 저장됨', staff?.role ?? '없음')
    check(staff?.name === staffName, '이름이 그대로 저장됨', staff?.name ?? '')
    check(staff?.active === true, '바로 쓸 수 있는 상태')

    //  임시 비밀번호는 만든 사람만 압니다 — 화면에 한 번 보여 줘야 전달할 수 있습니다.
    //
    //  DB 에 행이 생긴 순간과 화면에 문구가 뜨는 순간은 다릅니다. 계정을
    //  만든 뒤 목록을 다시 읽고 나서야 안내 문구가 그려지는데, 위의
    //  until() 은 행이 생기자마자 끝납니다. 곧바로 본문을 읽으면 아직
    //  없을 때가 있어, 멀쩡한 화면이 회차에 따라 실패로 찍혔습니다.
    const shownPw = await until(admin, async () =>
      (await admin.locator('body').innerText()).includes(TEMP_PW))
    check(shownPw.ok, '임시 비밀번호를 화면에서 전달할 수 있음',
      shownPw.ok ? `${(shownPw.ms / 1000).toFixed(1)}초` : '화면에 나타나지 않았습니다')

    // ── 2. 만든 계정으로 실제 로그인 ───────────────────────────────────
    section('2. 만든 계정으로 실제로 로그인되는가')
    const staffTok = await token(staffEmail, TEMP_PW)
    check(!!staffTok, '새 계정으로 로그인됨 — 화면에서 만든 계정이 진짜 계정입니다')
    if (staffTok) {
      const mine = await as(staffTok, '/profiles?select=id,role')
      check(mine.body?.[0]?.role === 'office', '로그인한 계정의 역할이 사무실', mine.body?.[0]?.role ?? '')
    }

    // ── 3. 병원 계정 — 소속이 없으면 만들지 않는다 ─────────────────────
    section('3. 병원 계정은 소속 병원이 있어야 만들어진다')
    const noHome = await as(adminTok, '/rpc/admin_create_user', {
      method: 'POST',
      body: JSON.stringify({
        p_email: `nohome${STAMP}@${DOMAIN}`, p_password: TEMP_PW,
        p_name: `${MARK}소속없는병원`, p_role: 'client', p_client_id: null,
      }),
    })
    check(noHome.status >= 400, '소속 없는 병원 계정은 거절됨', `${noHome.status}`)
    check(/소속 거래처/.test(JSON.stringify(noHome.body ?? '')), '왜 안 되는지 사람 말로 알려 줌',
      String(noHome.body?.message ?? '').slice(0, 40))
    check(((await svc(`/profiles?select=id&email=eq.${encodeURIComponent(`nohome${STAMP}@${DOMAIN}`)}`)).body ?? []).length === 0,
      '거절된 계정은 DB 에도 남지 않음')

    const hospEmail = `hosp${STAMP}@${DOMAIN}`
    await admin.reload({ waitUntil: 'networkidle' })
    await until(admin, async () => /계정 만들기/.test(await admin.locator('body').innerText()))
    await admin.locator('button:has-text("계정 만들기")').first().click()
    await admin.waitForTimeout(800)
    await admin.fill('#new-user-name', `${MARK}새병원담당-${STAMP}`)
    await admin.fill('#new-user-email', hospEmail)
    await admin.fill('#new-user-password', TEMP_PW)
    await admin.selectOption('#new-user-role', 'client')
    await admin.waitForTimeout(600)
    check((await admin.locator('#new-user-client').count()) > 0, '병원을 고르면 소속 병원 칸이 나타남')
    await admin.selectOption('#new-user-client', homeA.id)
    await admin.waitForTimeout(300)
    await admin.locator('button:has-text("계정 만들기")').last().click()

    const madeHosp = await until(admin, async () =>
      ((await svc(`/profiles?select=id&email=eq.${encodeURIComponent(hospEmail)}`)).body ?? []).length === 1)
    check(madeHosp.ok, '병원 계정이 만들어짐')
    const hosp = (await svc(`/profiles?select=*&email=eq.${encodeURIComponent(hospEmail)}`)).body?.[0]
    if (hosp) made.push(hosp.id)
    check(hosp?.role === 'client' && hosp?.client_id === homeA.id, '고른 병원에 연결됨', homeA.name)

    // ── 4. 서버가 막는가 (화면만 숨기는 것이 아니라) ───────────────────
    section('4. 관리자가 아닌 계정이 직접 불렀을 때')
    const officeTok = await token(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    const fieldTok = await token(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    const clientTok = await token(`client@${DOMAIN}`, process.env.TEST_CLIENT_PW)

    for (const [label, tk] of [['사무실', officeTok], ['현장', fieldTok], ['병원', clientTok]]) {
      if (!tk) { no(`${label} 계정 로그인`); continue }
      const r = await as(tk, '/rpc/admin_create_user', {
        method: 'POST',
        body: JSON.stringify({
          p_email: `sneak${STAMP}${label}@${DOMAIN}`, p_password: TEMP_PW,
          p_name: `${MARK}몰래만든계정`, p_role: 'admin', p_client_id: null,
        }),
      })
      const left = ((await svc(`/profiles?select=id&email=eq.${encodeURIComponent(`sneak${STAMP}${label}@${DOMAIN}`)}`)).body ?? []).length
      check(r.status >= 400 && left === 0, `${label} 계정은 계정을 만들 수 없음`, `${r.status} · 남은 계정 ${left}개`)

      const rp = await as(tk, '/rpc/admin_reset_password', {
        method: 'POST', body: JSON.stringify({ p_user_id: staff.id, p_password: 'hacked-12345' }),
      })
      check(rp.status >= 400, `${label} 계정은 남의 비밀번호를 못 바꿈`, `${rp.status}`)
    }
    //  비밀번호가 정말 안 바뀌었는지 — 응답만 보고 믿지 않습니다
    check(!!(await token(staffEmail, TEMP_PW)), '거절된 뒤에도 원래 비밀번호가 그대로')
    check(!(await token(staffEmail, 'hacked-12345')), '바꾸려던 비밀번호로는 로그인되지 않음')

    //  권한 상승 — 자기 역할을 스스로 관리자로 올릴 수 있는가
    if (officeTok) {
      await as(officeTok, `/profiles?id=eq.${staff.id}`, {
        method: 'PATCH', body: JSON.stringify({ role: 'admin' }),
      })
      const after = (await svc(`/profiles?select=role&id=eq.${staff.id}`)).body?.[0]
      check(after?.role === 'office', '사무실 계정은 역할을 바꿀 수 없음', after?.role ?? '')
    }

    // ── 5. 바꾸기 — 역할 · 중지 · 비밀번호 · 병원 소속 ─────────────────
    section('5. 역할 변경 · 사용/중지 · 비밀번호 초기화 · 병원 소속 변경')
    await as(adminTok, `/profiles?id=eq.${staff.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'field' }) })
    check((await svc(`/profiles?select=role&id=eq.${staff.id}`)).body?.[0]?.role === 'field', '역할을 현장으로 바꿈')

    await as(adminTok, `/profiles?id=eq.${staff.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
    check((await svc(`/profiles?select=active&id=eq.${staff.id}`)).body?.[0]?.active === false, '계정을 중지함')
    const stoppedRead = await as(await token(staffEmail, TEMP_PW) ?? '', '/schedules?select=id')
    check(!(Array.isArray(stoppedRead.body) && stoppedRead.body.length), '중지된 계정은 데이터를 볼 수 없음')
    await as(adminTok, `/profiles?id=eq.${staff.id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
    check((await svc(`/profiles?select=active&id=eq.${staff.id}`)).body?.[0]?.active === true, '다시 사용으로 되돌림')

    const newPw = `Bm${STAMP}reset!`
    const reset = await as(adminTok, '/rpc/admin_reset_password', {
      method: 'POST', body: JSON.stringify({ p_user_id: staff.id, p_password: newPw }),
    })
    check(reset.status < 300, '관리자는 비밀번호를 초기화할 수 있음', `${reset.status}`)
    check(!!(await token(staffEmail, newPw)), '새 임시 비밀번호로 로그인됨')
    check(!(await token(staffEmail, TEMP_PW)), '옛 비밀번호로는 더 이상 로그인되지 않음')

    const short = await as(adminTok, '/rpc/admin_reset_password', {
      method: 'POST', body: JSON.stringify({ p_user_id: staff.id, p_password: 'abc' }),
    })
    check(short.status >= 400, '너무 짧은 비밀번호는 거절됨', `${short.status}`)

    await as(adminTok, `/profiles?id=eq.${hosp.id}`, {
      method: 'PATCH', body: JSON.stringify({ client_id: homeB.id }),
    })
    check((await svc(`/profiles?select=client_id&id=eq.${hosp.id}`)).body?.[0]?.client_id === homeB.id,
      '병원 계정의 소속을 다른 병원으로 바꿈', homeB.name)

    // ── 6. 병원 간 격리 ────────────────────────────────────────────────
    section('6. 병원 계정끼리 서로의 데이터가 보이는가')
    const hospTok = await token(hospEmail, TEMP_PW)
    check(!!hospTok, '새 병원 계정으로 로그인됨')
    if (hospTok) {
      const seen = (await as(hospTok, '/clients?select=id,name')).body ?? []
      check(seen.length === 1 && seen[0]?.id === homeB.id, '자기 병원만 보임',
        seen.map((c) => c.name).join(', ') || '없음')
      const other = (await as(hospTok, `/clients?select=id&id=eq.${homeA.id}`)).body ?? []
      check(other.length === 0, '옮기기 전 병원도 더는 보이지 않음')
      const money = (await as(hospTok, '/payments?select=id')).body ?? []
      check(!(Array.isArray(money) && money.length), '병원 계정은 미수금을 볼 수 없음')
    }

    // ── 7. 잠김 방지 ───────────────────────────────────────────────────
    section('7. 자기 자신을 잠그거나 마지막 관리자를 없앨 수 있는가')
    const me = (await svc(`/profiles?select=id,role&email=eq.${encodeURIComponent(`admin@${DOMAIN}`)}`)).body?.[0]
    const selfOff = await as(adminTok, `/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ active: false }),
    })
    check((await svc(`/profiles?select=active&id=eq.${me.id}`)).body?.[0]?.active === true,
      '자기 계정을 중지할 수 없음', `${selfOff.status}`)
    const selfDown = await as(adminTok, `/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ role: 'office' }),
    })
    check((await svc(`/profiles?select=role&id=eq.${me.id}`)).body?.[0]?.role === 'admin',
      '자기 관리자 권한을 스스로 내릴 수 없음', `${selfDown.status}`)

    //  관리자를 한 명 더 만든 뒤에도 '자기 자신'은 여전히 막혀야 합니다.
    const admin2Email = `admin2${STAMP}@${DOMAIN}`
    const mk2 = await as(adminTok, '/rpc/admin_create_user', {
      method: 'POST',
      body: JSON.stringify({
        p_email: admin2Email, p_password: TEMP_PW, p_name: `${MARK}두번째관리자`, p_role: 'admin', p_client_id: null,
      }),
    })
    const admin2 = (await svc(`/profiles?select=*&email=eq.${encodeURIComponent(admin2Email)}`)).body?.[0]
    if (admin2) made.push(admin2.id)
    check(mk2.status < 300 && admin2?.role === 'admin', '두 번째 관리자를 만듦')
    const selfDown2 = await as(adminTok, `/profiles?id=eq.${me.id}`, {
      method: 'PATCH', body: JSON.stringify({ role: 'office' }),
    })
    check((await svc(`/profiles?select=role&id=eq.${me.id}`)).body?.[0]?.role === 'admin',
      '관리자가 둘이어도 자기 권한은 스스로 못 내림', `${selfDown2.status}`)
    //  다른 관리자는 내릴 수 있어야 합니다 (아무도 못 바꾸면 그것대로 문제입니다)
    await as(adminTok, `/profiles?id=eq.${admin2.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'office' }) })
    check((await svc(`/profiles?select=role&id=eq.${admin2.id}`)).body?.[0]?.role === 'office',
      '다른 관리자는 내릴 수 있음 (잠기지 않는 구조)')

    // ── 8. 감사기록 ────────────────────────────────────────────────────
    section('8. 모든 변경이 감사기록에 남는가')
    const logs = (await svc(`/audit_logs?select=action,summary,actor_id,actor_role&id=gt.${startAudit}&order=id.desc&limit=200`)).body ?? []
    const has = (a) => logs.find((l) => l.action === a)
    check(!!has('profile.create'), '계정 생성이 남음', has('profile.create')?.summary?.slice(0, 46) ?? '없음')
    check(!!has('profile.role'), '역할 변경이 남음', has('profile.role')?.summary?.slice(0, 46) ?? '없음')
    check(!!has('profile.active'), '사용/중지가 남음', has('profile.active')?.summary?.slice(0, 46) ?? '없음')
    check(!!has('profile.password'), '비밀번호 초기화가 남음', has('profile.password')?.summary?.slice(0, 46) ?? '없음')
    check(!!has('profile.client'), '병원 소속 변경이 남음', has('profile.client')?.summary?.slice(0, 46) ?? '없음')
    check(logs.filter((l) => l.action?.startsWith('profile.')).every((l) => !!l.actor_id),
      '누가 했는지가 모두 남음')
    check(!logs.some((l) => String(l.summary ?? '').includes(TEMP_PW) || String(l.summary ?? '').includes(newPw)),
      '비밀번호 원문은 감사기록에 남지 않음')

    // ── 9. 화면 — 사무실·현장·병원은 들어올 수 없다 ────────────────────
    section('9. 관리자가 아닌 사람이 화면 주소로 들어왔을 때')
    for (const [label, email, pwd] of [
      ['사무실', `office@${DOMAIN}`, process.env.TEST_OFFICE_PW],
      ['현장', `field@${DOMAIN}`, process.env.TEST_FIELD_PW],
    ]) {
      const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
      await signIn(p, email, pwd)
      await p.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
      await p.waitForTimeout(1500)
      const t = await p.locator('body').innerText()
      check(/접근 권한이 없는 화면입니다/.test(t), `${label} 계정은 사용자 관리 화면 차단`)
      check(!t.includes(staffEmail), `${label} 계정에는 계정 목록이 보이지 않음`)
      await p.close()
    }

    // ── 10. 화면 크기 (PC 1440 · 폰 390) ───────────────────────────────
    section('10. PC(1440) · 폰(390) 에서 화면이 밀리지 않는가')
    const pc = await admin.evaluate(OVERFLOW)
    check(pc.over.length === 0 && pc.scrollW <= pc.docW + 2, 'PC(1440) 에서 옆으로 밀리지 않음',
      pc.over.join(' | ') || `${pc.scrollW} ≤ ${pc.docW}`)

    const phone = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    phone.on('pageerror', (e) => errors.push(`[폰] ${e.message}`))
    await signIn(phone, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await phone.goto(`${BASE}/users`, { waitUntil: 'networkidle' })
    await until(phone, async () => /사용자 관리/.test(await phone.locator('body').innerText()))
    const m1 = await phone.evaluate(OVERFLOW)
    check(m1.over.length === 0 && m1.scrollW <= m1.docW + 2, '폰(390) 목록에서 밀리지 않음',
      m1.over.join(' | ') || `${m1.scrollW} ≤ ${m1.docW}`)

    await phone.locator('button:has-text("계정 만들기")').first().click()
    await phone.waitForTimeout(800)
    await phone.selectOption('#new-user-role', 'client')
    await phone.waitForTimeout(500)
    const m2 = await phone.evaluate(OVERFLOW)
    check(m2.over.length === 0 && m2.scrollW <= m2.docW + 2, '폰(390) 계정 만들기 칸에서도 밀리지 않음',
      m2.over.join(' | ') || `${m2.scrollW} ≤ ${m2.docW}`)
    const tap = await phone.locator('#new-user-name').boundingBox()
    check((tap?.height ?? 0) >= 40, '폰에서 입력칸이 손가락으로 누를 만큼 큼', `${Math.round(tap?.height ?? 0)}px`)
    await phone.close()

    // ── 11. 콘솔 오류 ──────────────────────────────────────────────────
    section('11. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_|400|401|403/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 2).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    if (browser) await browser.close().catch(() => {})

    // ── 정리 ────────────────────────────────────────────────────────────
    section('정리')
    for (const id of made) {
      await svc(`/profiles?id=eq.${id}`, { method: 'DELETE' })
      await fetch(`${U}/auth/v1/admin/users/${id}`, {
        method: 'DELETE', headers: { apikey: S, Authorization: `Bearer ${S}` },
      }).catch(() => {})
    }
    const endProfiles = ((await svc('/profiles?select=id')).body ?? []).length
    check(endProfiles === startProfiles, '계정 수가 시작 시점과 같음', `${startProfiles}개 → ${endProfiles}개`)

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`사용자 관리: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
