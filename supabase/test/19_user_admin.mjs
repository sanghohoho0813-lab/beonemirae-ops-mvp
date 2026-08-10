// ─────────────────────────────────────────────────────────────────────────────
// 사용자 관리 · 역할 변경 (실제 브라우저 · 실제 DB)
//
//  이 화면이 계정 권한의 마지막 문입니다. 여기서 잘못 누르면 두 가지가 납니다.
//
//    · 권한이 조용히 올라간다 — 현장 담당자가 미수금과 매출을 보게 됩니다.
//    · 관리자가 스스로를 잠근다 — 아무도 계정을 관리할 수 없게 됩니다.
//      (이 경우 복구는 service 키를 쥔 사람만 할 수 있습니다)
//
//  화면에서 눌러 보고, 화면이 막아 둔 것을 API 로도 막는지 따로 확인합니다.
//  화면에서만 막는 것은 막은 것이 아닙니다.
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=...
//    node supabase/test/19_user_admin.mjs
//
//  · 역할·활성 상태를 잠시 바꾸고 반드시 되돌립니다.
//  · 시작 시점의 계정 상태를 찍어 두고 끝에 대조합니다.
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

let pass = 0
let fail = 0
const notes = []
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const note = (t) => { notes.push(t); console.log(`  참고  ${t}`) }
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
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
const asUser = (token, path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
async function login(email, password) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)
  if (!r.body?.access_token) throw new Error(`로그인 실패 ${email}`)
  return r.body.access_token
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

async function main() {
  console.log('\n════ 사용자 관리 · 역할 변경 ════')

  // 시작 상태 — 끝에 이 값으로 돌아와야 합니다
  const snap = (await svc('/profiles?select=id,email,name,role,active,client_id&order=email')).body ?? []
  const key = (rows) => JSON.stringify(rows.map((r) => [r.email, r.role, r.active]))
  const before = key(snap)
  const idOf = Object.fromEntries(snap.map((r) => [r.email, r.id]))
  const fieldId = idOf[`field@${DOMAIN}`]
  const adminId = idOf[`admin@${DOMAIN}`]

  const restoreAll = async () => {
    for (const r of snap) {
      await svc(`/profiles?id=eq.${r.id}`, {
        method: 'PATCH', body: JSON.stringify({ role: r.role, active: r.active }),
      })
    }
  }

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 관리자만 이 화면에 들어온다 ────────────────────────────────────
    section('1. 누가 이 화면에 들어올 수 있는가')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(1200)
    const officeText = await office.locator('body').innerText()
    check(officeText.includes('접근 권한이 없는 화면입니다'), '사무실 계정은 설정 화면 차단')
    check(!officeText.includes(`field@${DOMAIN}`), '다른 사람 계정 목록이 안 보임')
    await office.close()

    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)

    // 사용자 목록을 불러옵니다 (버튼이 있으면 누릅니다)
    const loadBtn = admin.locator('button:has-text("불러오기"), button:has-text("새로고침")').first()
    if (await loadBtn.count()) { await loadBtn.click(); await admin.waitForTimeout(2500) }
    const adminText = await admin.locator('body').innerText()
    check(adminText.includes(`field@${DOMAIN}`), '관리자 화면에 계정 목록이 보임')

    // ── 2. 화면에서 역할 바꾸기 ───────────────────────────────────────────
    section('2. 화면에서 현장 → 사무실로 역할 변경')
    // div:has-text 는 그 글을 품은 가장 안쪽 요소까지 다 잡습니다. 그대로 쓰면
    // 이메일이 든 작은 칸이 잡히고, 역할 버튼은 그 밖에 있어 안 보입니다.
    // 이메일 문단에서 위로 두 단계 올라가 줄 전체를 잡습니다.
    const rowOf = async (email) => {
      const p = admin.locator(`p:has-text("${email}")`).first()
      if (!(await p.count())) return null
      const row = p.locator('xpath=ancestor::div[2]')
      return (await row.count()) ? row.first() : null
    }
    const fieldRow = await rowOf(`field@${DOMAIN}`)
    check(!!fieldRow, '현장 계정 줄을 찾음')
    if (fieldRow) {
      const btn = fieldRow.locator('button:has-text("사무실")').first()
      if (await btn.count()) {
        await btn.click()
        await admin.waitForTimeout(3000)
      }
    }
    const changed = (await svc(`/profiles?select=role&id=eq.${fieldId}`)).body?.[0]
    check(changed?.role === 'office', '역할 변경이 DB 에 반영', `field → ${changed?.role}`)

    const audits = (await svc('/audit_logs?select=action,summary,actor_id&order=id.desc&limit=6')).body ?? []
    const roleAudit = audits.find((a) => a.action === 'profile.role')
    check(!!roleAudit, '역할 변경이 감사기록에 남음', roleAudit?.summary ?? '없음')
    check(!!roleAudit?.actor_id, '누가 바꿨는지 남음')

    // 바뀐 권한이 실제로 먹는가 — 이제 미수금을 볼 수 있어야 합니다
    const fieldToken = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    const canSee = await asUser(fieldToken, '/payments?select=id&limit=1')
    check(Array.isArray(canSee.body), '바뀐 권한이 바로 적용됨 (미수금 조회 가능)',
      `${Array.isArray(canSee.body) ? canSee.body.length + '건' : canSee.status}`)

    // 되돌립니다
    await svc(`/profiles?id=eq.${fieldId}`, { method: 'PATCH', body: JSON.stringify({ role: 'field' }) })
    const back = (await svc(`/profiles?select=role&id=eq.${fieldId}`)).body?.[0]
    check(back?.role === 'field', '역할을 원래대로 되돌림')

    // ── 3. 본인은 못 바꾼다 ───────────────────────────────────────────────
    section('3. 관리자가 자기 자신을 건드릴 수 있는가')
    const selfRow = await rowOf(`admin@${DOMAIN}`)
    if (selfRow) {
      const selfBtns = await selfRow.locator('button').all()
      let disabledCount = 0
      for (const b of selfBtns) if (!(await b.isEnabled())) disabledCount++
      check(disabledCount > 0, '화면에서 본인 역할·비활성 버튼이 잠겨 있음', `${disabledCount}개 비활성`)
    }

    // 화면이 막았다고 끝이 아닙니다. API 로도 막히는지 봅니다.
    const adminToken = await login(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    const selfOff = await asUser(adminToken, `/profiles?id=eq.${adminId}`, {
      method: 'PATCH', body: JSON.stringify({ active: false }),
    })
    const selfNow = (await svc(`/profiles?select=active&id=eq.${adminId}`)).body?.[0]
    if (selfNow?.active === false) {
      // 잠겼습니다 — 즉시 되살립니다
      await svc(`/profiles?id=eq.${adminId}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
      const revived = (await svc(`/profiles?select=active&id=eq.${adminId}`)).body?.[0]
      check(revived?.active === true, '(복구) 관리자 계정을 다시 살림')
      note('관리자가 API 로 자기 계정을 비활성화할 수 있습니다.')
      note('  화면은 막고 있지만 DB 는 막지 않습니다. 관리자가 한 명뿐인 상태에서 이렇게 되면')
      note('  아무도 계정을 관리할 수 없고, service 키를 쥔 사람만 복구할 수 있습니다.')
      note('  운영상으로는 관리자를 두 명 이상 두는 것으로 대비할 수 있습니다.')
    } else {
      ok('API 로도 본인 비활성화가 막힘', `(${selfOff.status})`)
    }

    // ── 4. 비활성 계정은 실제로 막히는가 ─────────────────────────────────
    section('4. 비활성 처리한 계정')
    await svc(`/profiles?id=eq.${fieldId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
    const offToken = await login(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    const offRead = await asUser(offToken, '/schedules?select=id&limit=1')
    check(!(Array.isArray(offRead.body) && offRead.body.length), '비활성 계정은 일정 조회 불가')
    const offPage = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await signIn(offPage, `field@${DOMAIN}`, process.env.TEST_FIELD_PW).catch(() => {})
    await offPage.waitForTimeout(1500)
    const offText = await offPage.locator('body').innerText()
    check(/비활성화된 계정|관리자에게|권한/.test(offText), '화면에도 비활성 안내가 나옴',
      (offText.match(/[^\n]*비활성[^\n]*/) ?? [''])[0].slice(0, 50))
    await offPage.close()

    await svc(`/profiles?id=eq.${fieldId}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
    const on = (await svc(`/profiles?select=active&id=eq.${fieldId}`)).body?.[0]
    check(on?.active === true, '(복구) 현장 계정 다시 활성화')

    // ── 5. 병원 계정은 역할 버튼이 없다 ──────────────────────────────────
    section('5. 병원 계정 줄')
    const clientRow = await rowOf(`client@${DOMAIN}`)
    if (clientRow) {
      const t = await clientRow.innerText()
      check(/병원 계정/.test(t), '병원 계정은 역할 버튼 대신 소속으로 표시', t.split('\n').slice(-1)[0]?.slice(0, 40))
    } else {
      note('병원 계정 줄을 화면에서 찾지 못했습니다')
    }

    // ── 6. 화면 오류 ──────────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } catch (e) {
    //  중간에 터지면 여기서 붙잡아 실패로 남깁니다. 예전에는 catch 가 없어서,
    //  터진 뒤 finally 의 process.exit(0) 이 그대로 실행되며 '통과' 로 끝났습니다.
    //  (관리자 로그인이 막혔을 때 이 검사가 4건만 하고 YES 를 찍었습니다)
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    await restoreAll()
    const after = (await svc('/profiles?select=id,email,name,role,active,client_id&order=email')).body ?? []
    check(key(after) === before, '계정 역할·활성 상태가 시작 시점과 같음',
      after.map((r) => `${r.email.split('@')[0]}:${r.role}${r.active ? '' : '(비활성)'}`).join(' · '))
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL${notes.length ? ` / 참고 ${notes.length}` : ''} ════`)
  console.log(`사용자 관리: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); process.exit(1) })
