// ─────────────────────────────────────────────────────────────────────────────
// 차량 관리 · 본인 비밀번호 변경 (실제 브라우저 · 실제 DB)
//
//  둘 다 "안 되면 그날 업무가 멈추는" 자리입니다.
//
//   · 차량이 한 대도 없으면 수거 입력 자체가 불가능합니다(배차 차량 필수).
//     그리고 차량은 지우지 않고 비활성으로 두는데, 그때 과거 배차 이력이
//     끊기면 정산·통계가 함께 흔들립니다.
//   · 비밀번호를 본인이 못 바꾸면 관리자가 매번 불려 다닙니다.
//     반대로 아무렇게나 바뀌면 그것대로 문제입니다.
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_FIELD_PW=...
//    node supabase/test/21_vehicle_password.mjs
//
//  · 만드는 차량에는 '[검증]' 이 붙고 끝나면 지웁니다.
//  · 비밀번호는 잠시 바꿨다가 반드시 원래 값으로 되돌립니다.
//    (되돌리기가 실패하면 service 권한으로 강제 복구하고 그 사실을 알립니다)
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
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  }).then(json)
const tokenFor = (email, password) =>
  fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)

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
  console.log('\n════ 차량 관리 · 비밀번호 변경 ════')

  const before = ((await svc('/vehicles?select=id')).body ?? []).map((v) => v.id).sort()
  const fieldPw = process.env.TEST_FIELD_PW
  const tempPw = `Temp-${Date.now()}-Aa!`
  let pwChanged = false
  let madeVehicleId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)

    // ── 1. 차량 추가 ──────────────────────────────────────────────────────
    section('1. 차량 추가')
    const name = `${MARK}추가차량-${Date.now() % 100000}`
    const addBtn = admin.locator('button:has-text("차량 추가")').first()
    check(await addBtn.count() > 0, '「차량 추가」 버튼이 있음')
    await addBtn.click()
    await admin.waitForTimeout(900)

    const nameInput = admin.locator('input[placeholder="예: 의료폐기물 1호"]').first()
    check(await nameInput.count() > 0, '차량 이름 입력칸이 열림')
    await nameInput.fill(name)
    const driverInput = admin.locator('input[placeholder="예: 김기사"]').first()
    if (await driverInput.count()) await driverInput.fill('검증기사')
    await admin.locator('button:has-text("저장")').last().click()
    await admin.waitForTimeout(3000)

    const made = (await svc(`/vehicles?select=*&name=eq.${encodeURIComponent(name)}`)).body?.[0]
    check(!!made, '차량이 DB 에 저장됨', made ? `${made.name} · ${made.waste_type}` : '안 됨')
    if (made) madeVehicleId = made.id

    const audits = (await svc('/audit_logs?select=action,summary&order=id.desc&limit=5')).body ?? []
    check(audits.some((a) => a.action === 'vehicle.create'), '차량 등록이 감사기록에 남음',
      audits.find((a) => a.action === 'vehicle.create')?.summary ?? '없음')

    // ── 2. 새 차량으로 수거 입력이 되는가 ────────────────────────────────
    section('2. 새 차량이 수거 입력에서 선택되는가')
    await admin.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const vehSel = admin.locator('select').nth(1)
    const vopts = await vehSel.locator('option').allTextContents()
    check(vopts.some((o) => o.includes(name.slice(0, 12))), '새 차량이 배차 목록에 보임',
      vopts.filter((o) => o.includes(MARK)).join(' / ').slice(0, 60))

    // ── 3. 차량 수정 ──────────────────────────────────────────────────────
    section('3. 차량 수정')
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const rowP = admin.locator(`p:has-text("${name}")`).first()
    let edited = false
    if (await rowP.count()) {
      const row = rowP.locator('xpath=ancestor::div[2]')
      const editBtn = row.locator('button:has-text("수정")').first()
      if (await editBtn.count()) {
        await editBtn.click()
        await admin.waitForTimeout(900)
        const d = admin.locator('input[placeholder="예: 김기사"]').first()
        if (await d.count()) { await d.fill('검증기사2'); edited = true }
        await admin.locator('button:has-text("저장")').last().click()
        await admin.waitForTimeout(2500)
      }
    }
    check(edited, '차량 수정 화면을 열어 기사명을 바꿈')
    const after = (await svc(`/vehicles?select=driver&id=eq.${madeVehicleId}`)).body?.[0]
    check(after?.driver === '검증기사2', '수정이 DB 에 반영', after?.driver ?? '')

    // ── 4. 비활성화해도 과거 이력이 끊기지 않는가 ────────────────────────
    section('4. 차량을 비활성으로 두었을 때')
    // 이 차량으로 완료된 수거를 하나 만들어 둡니다 (service 로 직접)
    const client = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&limit=1`)).body?.[0]
    const sched = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
        client_id: client.id, waste_type: made.waste_type, vehicle_id: madeVehicleId,
        scheduled_time: '08:00', expected_amount: 5, actual_amount: 5, actual_time: '08:00',
        status: '완료', is_additional: true, origin: 'seed', memo: `${MARK}차량비활성확인`,
        event_id: crypto.randomUUID(),
      }),
    })).body?.[0]
    check(!!sched, '이 차량으로 완료된 수거를 하나 만듦')

    await svc(`/vehicles?id=eq.${madeVehicleId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
    const stillLinked = (await svc(`/schedules?select=vehicle_id&id=eq.${sched.id}`)).body?.[0]
    check(stillLinked?.vehicle_id === madeVehicleId, '비활성으로 둬도 과거 배차가 그대로 남음')

    await admin.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const vopts2 = await admin.locator('select').nth(1).locator('option').allTextContents()
    check(!vopts2.some((o) => o.includes(name.slice(0, 12))), '비활성 차량은 새 배차 목록에서 빠짐')

    await admin.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2000)
    const hist = await admin.locator('body').innerText()
    check(!/NaN|undefined/.test(hist), '수거 이력이 깨지지 않음 (차량이 비활성이어도)')

    await svc(`/schedules?id=eq.${sched.id}`, { method: 'DELETE' })

    // ── 5. 본인 비밀번호 변경 ────────────────────────────────────────────
    section('5. 본인 비밀번호 변경')
    const field = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, fieldPw)
    await field.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await field.waitForTimeout(1200)
    const fieldSettings = await field.locator('body').innerText()
    check(fieldSettings.includes('접근 권한이 없는 화면입니다'),
      '현장 계정은 설정 화면 자체가 막힘 (비밀번호 변경도 여기 있음)')
    await field.close()

    // 관리자 화면에서 비밀번호 변경 칸을 씁니다
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(1500)
    const p1 = admin.locator('#np1')
    const p2 = admin.locator('#np2')
    check(await p1.count() > 0 && await p2.count() > 0, '비밀번호 변경 칸이 있음')

    // 짧은 비밀번호는 막혀야 합니다
    await p1.fill('short')
    await p2.fill('short')
    const btn = admin.locator('button:has-text("비밀번호 변경")').first()
    check(!(await btn.isEnabled()), '8자 미만은 변경 버튼이 잠김')

    // 서로 다른 값을 넣으면 안내가 나와야 합니다
    await p1.fill(tempPw)
    await p2.fill(`${tempPw}-different`)
    if (await btn.isEnabled()) { await btn.click(); await admin.waitForTimeout(2000) }
    const mismatchText = await admin.locator('body').innerText()
    const stillAdmin = await tokenFor(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    check(!!stillAdmin.body?.access_token, '서로 다르게 넣으면 비밀번호가 바뀌지 않음',
      (mismatchText.match(/[^\n]*(같지|일치)[^\n]*/) ?? [''])[0].slice(0, 40))

    // 제대로 바꿔 봅니다 (관리자 계정으로, 끝나고 되돌립니다)
    await p1.fill(tempPw)
    await p2.fill(tempPw)
    await btn.click()
    await admin.waitForTimeout(3000)
    const okText = await admin.locator('body').innerText()
    const withNew = await tokenFor(`admin@${DOMAIN}`, tempPw)
    pwChanged = !!withNew.body?.access_token
    check(pwChanged, '새 비밀번호로 로그인됨',
      (okText.match(/[^\n]*비밀번호[^\n]*/) ?? [''])[0].slice(0, 40))
    const withOld = await tokenFor(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    check(!withOld.body?.access_token, '옛 비밀번호로는 더 이상 로그인 안 됨')

    // ── 5-2. 직원은 스스로 비밀번호를 바꿀 길이 있는가 ────────────────────
    section('5-2. 관리자가 아닌 직원의 비밀번호 변경 길')
    //  비밀번호 변경 칸은 설정 화면 안에 있고 설정은 관리자 전용입니다.
    //  그래서 현장·사무실은 앱 안에서 스스로 바꿀 수 없습니다.
    //  대신 로그인 화면의 '비밀번호를 잊으셨나요?' 가 그 길입니다 — 그것이
    //  실제로 열려 있는지, 그리고 계정 존재 여부를 흘리지 않는지 봅니다.
    const resetPage = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    await resetPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    const forgot = resetPage.locator('button:has-text("비밀번호를 잊으셨나요")').first()
    check(await forgot.count() > 0, '로그인 화면에 비밀번호 재설정 안내가 있음')

    //  이메일을 비운 채 누르면 먼저 안내가 나와야 합니다.
    await forgot.click()
    await resetPage.waitForTimeout(600)
    check(await resetPage.locator('text=먼저 이메일을 입력해 주세요').count() > 0,
      '이메일 없이 누르면 입력을 먼저 요청함')

    //  실제 계정으로 눌렀을 때 직원에게 무엇이 보이는가.
    //  메일이 나가면 성공 안내, 못 나가면 한국어 안내여야 합니다.
    //  (영문 원문이 그대로 보이면 직원은 무슨 뜻인지 알 수 없습니다)
    await resetPage.fill('#login-email', `field@${DOMAIN}`)
    await forgot.click()
    await resetPage.waitForTimeout(2500)
    const msg = (await resetPage.locator('p.text-teal-600').allInnerTexts()).join(' | ')
    check(/재설정 메일을 보냈습니다|메일을 보낼 수 없습니다|요청이 너무 잦습니다|네트워크/.test(msg),
      '재설정 결과가 한국어 안내로 보임', msg.slice(0, 80))
    check(!/invalid|rate limit|error|Email address/i.test(msg),
      '영문 오류 원문이 직원에게 노출되지 않음', msg.slice(0, 80))
    await resetPage.close()

    //  계정 존재 여부가 새는지는 이 프로젝트에서 판정할 수 없습니다.
    //  테스트 계정 도메인(@beonemirae.test)이 실제로 배달되지 않는 주소라
    //  '있는 계정'은 메일 발송 단계에서 400(email_address_invalid)으로 막히고
    //  '없는 계정'은 발송 전에 200으로 끝나서, 상태 코드가 원래 갈립니다.
    //  실제 도메인에서는 양쪽 다 200 이므로 이 차이만으로 취약점이라 부를 수
    //  없습니다. 여기서는 사실만 남기고 합격/불합격을 매기지 않습니다.
    const missing = await fetch(`${U}/auth/v1/recover`, {
      method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nobody-${Date.now()}@${DOMAIN}` }),
    }).then(json)
    console.log(`  참고  없는 계정 재설정 요청 → ${missing.status} (있는 계정은 발송 단계에서 갈립니다)`)
    console.log('  참고  운영 계정은 실제로 메일을 받을 수 있는 주소여야 재설정이 동작합니다')

    // ── 6. 화면 오류 ──────────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } finally {
    section('정리')
    // 비밀번호 되돌리기 — service 권한으로 확실하게
    if (pwChanged) {
      const uid = (await svc(`/profiles?select=id&email=eq.${encodeURIComponent(`admin@${DOMAIN}`)}`)).body?.[0]?.id
      await fetch(`${U}/auth/v1/admin/users/${uid}`, {
        method: 'PUT',
        headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: process.env.TEST_ADMIN_PW }),
      })
      const back = await tokenFor(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
      check(!!back.body?.access_token, '관리자 비밀번호를 원래대로 되돌림')
    }
    if (madeVehicleId) await svc(`/vehicles?id=eq.${madeVehicleId}`, { method: 'DELETE' })
    await svc(`/schedules?memo=like.*${encodeURIComponent('차량비활성확인')}*`, { method: 'DELETE' })
    const now = ((await svc('/vehicles?select=id')).body ?? []).map((v) => v.id).sort()
    check(JSON.stringify(now) === JSON.stringify(before), '차량 목록이 시작 시점과 같음',
      `${before.length}대 → ${now.length}대`)
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`차량 관리 · 비밀번호: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
