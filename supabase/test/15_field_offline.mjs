// ─────────────────────────────────────────────────────────────────────────────
// 현장 실사용 흐름 · 통신이 끊겼을 때 (실제 브라우저 · 실제 계정)
//
//  현장은 사무실이 아닙니다. 지하 주차장, 병원 지하 창고, 이동 중인 트럭에서
//  저장 버튼을 누릅니다. 그 순간 통신이 끊기는 일이 드물지 않습니다.
//
//  그때 셋 중 하나가 일어납니다.
//    · 아무 반응이 없다        → 기사는 저장된 줄 알고 떠납니다. 수거가 증발합니다.
//    · 입력한 값이 날아간다     → 30분 걸린 입력을 처음부터 다시 합니다.
//    · 다시 눌러 두 번 저장된다 → kg 이 두 배로 잡히고 정산이 틀어집니다.
//
//  셋 다 현장에서 실제로 겪는 일이고, 셋 다 조용히 일어납니다.
//  그래서 통신을 끊어 놓고 저장을 눌러 봅니다.
//
//  실행
//    npm run build && npx vite preview --port 4173      # 다른 터미널에서
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=... TEST_OFFICE_PW=...
//    node supabase/test/15_field_offline.mjs
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

const MOBILE = {
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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

/** 수거 입력 화면을 채웁니다 (저장은 누르지 않습니다) */
async function fillCollection(page, clientName, kg) {
  await page.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const clientSel = page.locator('select').first()
  const opts = await clientSel.locator('option').allTextContents()
  const label = opts.find((o) => o.startsWith(clientName))
  if (!label) return false
  await clientSel.selectOption({ label })
  await page.waitForTimeout(400)
  await page.locator('input[placeholder="예: 320"]').first().fill(String(kg))
  await page.locator('input[type="time"]').first().fill('16:20')
  // 자재를 하나 넣어야 '추가요청 공급' 체크가 나타납니다 (같은 날 재방문 저장용)
  const supply = page.locator('[data-tour="collect-supply"] input[aria-label="20L 합성수지"]')
  if (await supply.count()) await supply.fill('1')
  const addl = page.locator('input[type="checkbox"]').first()
  if (await addl.count()) await addl.check().catch(() => {})
  const vehSel = page.locator('select').nth(1)
  const vopts = await vehSel.locator('option').allTextContents()
  const v = vopts.find((o) => o.includes('검증차량'))
  if (v) await vehSel.selectOption({ label: v })
  await page.waitForTimeout(400)
  return true
}

async function main() {
  console.log('\n════ 현장 실사용 흐름 · 통신 끊김 ════')

  const client = (await svc(`/clients?select=id,name&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body?.[0]
  if (!client) { console.error('검증용 거래처가 없습니다.'); process.exit(1) }

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []
  const ctx = await browser.newContext(MOBILE)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[현장] ${m.text()}`) })

  const created = []
  const KG = 70 + (Date.now() % 30)

  try {
    await signIn(page, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    check(new URL(page.url()).pathname === '/today', '현장 계정은 오늘 일정이 첫 화면', new URL(page.url()).pathname)

    // ── 1. 통신이 끊긴 채로 저장 ──────────────────────────────────────────
    section('1. 저장 직전에 통신이 끊겼을 때')
    const filled = await fillCollection(page, client.name, KG)
    check(filled, '수거 입력 화면을 채움', `${client.name} · ${KG}kg`)

    const beforeCount = ((await svc(`/schedules?select=id&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}`)).body ?? []).length

    await ctx.setOffline(true)
    await page.locator('[data-tour="collect-save"]').click()
    await page.waitForTimeout(6000)

    const offlineText = await page.locator('body').innerText()
    const afterOffline = ((await svc(`/schedules?select=id&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}`)).body ?? []).length
    check(afterOffline === beforeCount, '끊긴 동안 저장되지 않음 (당연히)', `${beforeCount} → ${afterOffline}`)

    const told = /네트워크|통신|연결|저장하지|실패|다시 시도/.test(offlineText)
    check(told, '기사에게 저장이 안 됐다고 알림',
      told ? (offlineText.match(/[^\n]*(네트워크|통신|연결|실패)[^\n]*/) ?? [''])[0].slice(0, 60)
           : '아무 안내도 없음 — 저장된 줄 알고 떠나게 됩니다')

    const kgKept = await page.locator('input[placeholder="예: 320"]').first().inputValue().catch(() => '')
    check(kgKept === String(KG), '입력한 값이 화면에 그대로 남아 있음',
      kgKept === String(KG) ? `${kgKept}kg` : `"${kgKept}" — 다시 입력해야 합니다`)

    // ── 2. 통신이 돌아온 뒤 다시 저장 ─────────────────────────────────────
    section('2. 통신이 돌아온 뒤 다시 저장')
    await ctx.setOffline(false)
    await page.waitForTimeout(1500)
    const saveBtn = page.locator('[data-tour="collect-save"]')
    check(await saveBtn.isEnabled(), '저장 버튼이 다시 눌리는 상태')
    await saveBtn.click()
    await page.waitForTimeout(5000)

    const rows = (await svc(`/schedules?select=id,actual_amount,event_id&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}&actual_amount=eq.${KG}`)).body ?? []
    check(rows.length === 1, '정확히 한 건만 저장됨 (끊겼다 다시 눌러도 두 번 안 들어감)',
      `${rows.length}건 · ${KG}kg`)
    for (const r of rows) if (r.event_id) created.push(r.event_id)

    const okText = await page.locator('body').innerText()
    check(/저장|완료/.test(okText), '저장됐다는 것을 화면에서 확인할 수 있음')

    // ── 3. 저장 결과가 다른 화면에도 반영되는가 ──────────────────────────
    section('3. 저장한 것이 이력에 보이는가')
    await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    const hist = await page.locator('body').innerText()
    check(hist.includes(String(KG)), '수거 이력에 방금 넣은 수거량이 보임', `${KG}kg`)
    check(hist.includes(client.name), '거래처 이름도 함께 보임')

    // ── 4. 되돌리기 ───────────────────────────────────────────────────────
    section('4. 잘못 넣었을 때 되돌리기')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2000)

    // 최근 입력 목록에서 '그 수거'의 취소 버튼을 찾습니다.
    //  목록에는 다른 검사가 넣은 건도 함께 있으므로, 버튼이 속한 줄의 글을
    //  읽어 이번에 넣은 kg 이 있는 줄만 고릅니다. (아무거나 누르면 남의 것을
    //  되돌리게 됩니다)
    const cancels = await office.locator('button:has-text("취소")').all()
    let clicked = false
    for (const b of cancels) {
      const rowText = await b.locator('xpath=..').innerText().catch(() => '')
      if (!rowText.includes(`${KG}kg`)) continue
      await b.click()
      await office.waitForTimeout(900)
      const confirmBtn = office.locator('button:has-text("완료 취소")')
      if (await confirmBtn.count()) {
        await confirmBtn.first().click()
        await office.waitForTimeout(4000)
      }
      clicked = true
      break
    }
    check(clicked, '되돌릴 그 수거를 목록에서 찾음', `${KG}kg`)

    const left = (await svc(`/schedules?select=id&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}&actual_amount=eq.${KG}`)).body ?? []
    check(left.length === 0, '되돌리면 완료 기록이 사라짐', `${left.length}건 남음`)
    if (left.length === 0) created.length = 0

    await office.close()

    // ── 5. 화면 오류 ──────────────────────────────────────────────────────
    section('5. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/.test(e))
    check(real.length === 0, '통신 끊김 외의 자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
  } finally {
    section('정리')
    let reverted = 0
    if (created.length) {
      const token = (await fetch(`${U}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `office@${DOMAIN}`, password: process.env.TEST_OFFICE_PW }),
      }).then((r) => r.json())).access_token
      for (const ev of created) {
        const r = await fetch(`${U}/rest/v1/rpc/revert_collection`, {
          method: 'POST',
          headers: { apikey: A, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_event_id: ev }),
        })
        if (r.ok) reverted++
      }
    }
    const leftover = (await svc(`/schedules?select=id&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}&actual_amount=eq.${KG}`)).body ?? []
    check(leftover.length === 0, '검사가 넣은 수거를 되돌림', `되돌림 ${reverted}건 · 남음 ${leftover.length}건`)
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`현장 흐름 · 통신 끊김: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
