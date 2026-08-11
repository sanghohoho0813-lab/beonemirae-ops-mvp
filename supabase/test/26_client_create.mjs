// ─────────────────────────────────────────────────────────────────────────────
// 거래처를 새로 등록할 때 (실제 브라우저 · 실제 DB)
//
//  직원 테스트의 첫 동작이 이것입니다. 여기서 이상하면 그 다음 화면은
//  아무도 보지 않습니다.
//
//  특히 무서운 자리: 저장은 됐는데 화면이 "찾을 수 없어요" 로 가는 경우입니다.
//  사무실은 저장이 안 된 줄 알고 한 번 더 등록하고, 같은 거래처가 두 개
//  생깁니다. 그리고 그 둘로 수거·정산이 갈려 나갑니다.
//
//  밟는 순서
//   1) 사무실(PC)  거래처 관리 → ＋추가 → 값을 넣고 저장
//   2) DB          그 거래처가 실제로 들어갔는가 · 감사기록이 남는가
//   3) 화면        저장 직후 그 거래처 상세로 제대로 갔는가
//   4) 목록        돌아왔을 때 목록·검색에 보이는가
//   5) 이름 없이   빈 이름으로는 저장되지 않는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=...
//    node supabase/test/26_client_create.mjs
//
//  · 만든 거래처는 끝나면 지웁니다. 시작·종료 건수를 비교합니다.
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

/**
 * 화면이 그렇게 될 때까지 기다립니다.
 *
 *  이 앱은 저장이 끝나면 거래처·일정·자재·수거기록을 통째로 다시 읽고,
 *  그 다음에 새 거래처 화면으로 넘어갑니다. 기록이 쌓이면 그 다시 읽기가
 *  길어져서, 몇 초를 정해 놓고 기다리면 아직 목록에 서 있는 화면을 보게
 *  됩니다. 저장도 이동도 멀쩡한데 검사만 실패합니다.
 */
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
  await page.waitForTimeout(1500)
}

async function main() {
  console.log('\n════ 거래처를 새로 등록할 때 ════')

  const startCount = ((await svc('/clients?select=id&active=eq.true')).body ?? []).length
  const name = `${MARK}새거래처-${Date.now() % 100000}`
  const address = '경기도 남양주시 검증대로 77'
  const phone = '031-777-7777'
  let madeId = null

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    // ── 1. 이름 없이 저장하면 ──────────────────────────────────────────
    section('1. 이름 없이 저장하려 할 때')
    await office.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    //  '추가' 로만 찾으면 사이드바의 「추가 개발 예정」이 먼저 잡힙니다.
    await office.locator('button:has-text("＋ 추가")').first().click()
    await office.waitForTimeout(1200)

    const dialog = office.locator('[role="dialog"]')
    check(await dialog.count() > 0, '거래처 추가 창이 열림')
    await dialog.locator('button:has-text("저장")').first().click()
    await office.waitForTimeout(1500)
    check(await dialog.count() > 0, '이름이 비면 저장되지 않고 창이 그대로 있음')

    // ── 2. 값을 넣고 저장 ──────────────────────────────────────────────
    section('2. 값을 넣고 저장')
    //  라벨로 칸을 집습니다 (모달 안에서만).
    const fieldByLabel = (label) =>
      dialog.locator('div').filter({ has: office.locator(`label:text-is("${label}")`) })
        .locator('input, select').first()

    await dialog.locator('label:text-is("거래처명 *")').locator('xpath=following-sibling::input[1]').fill(name)
    await dialog.locator('label:text-is("주소")').locator('xpath=following-sibling::input[1]').fill(address)
    await dialog.locator('label:text-is("연락처")').locator('xpath=following-sibling::input[1]').fill(phone)
    await dialog.locator('input[placeholder="예: 주 2회"]').first().fill('주 1회')
    void fieldByLabel

    await dialog.locator('button:has-text("저장")').first().click()
    //  저장 → 전체 데이터 다시 읽기 → 새 거래처 화면으로 이동. 마지막까지
    //  기다립니다(창이 닫히기만 한 상태에서 판정하면 안 됩니다).
    const moved = await until(office, async () =>
      /\/clients\/[0-9a-f-]{36}/.test(office.url()))
    if (!moved.ok) await office.waitForTimeout(2000)

    // ── 3. DB 확인 ─────────────────────────────────────────────────────
    section('3. DB 확인')
    const made = (await svc(`/clients?select=*&name=eq.${encodeURIComponent(name)}`)).body?.[0]
    check(!!made, '거래처가 DB 에 저장됨', made ? `${made.name} · ${made.type}` : '안 됨')
    if (!made) return
    madeId = made.id
    check(made.address === address, '주소가 그대로 저장됨', made.address)
    check(made.phone === phone, '연락처가 그대로 저장됨', made.phone)
    check(made.active === true, '활성 상태로 만들어짐')

    const audit = (await svc('/audit_logs?select=action,summary&action=eq.client.create&order=id.desc&limit=1')).body?.[0]
    check(audit?.summary?.includes(name), '거래처 등록이 감사기록에 남음', audit?.summary ?? '없음')

    // ── 4. 저장 직후 화면이 어디로 갔는가 ──────────────────────────────
    section('4. 저장한 뒤 화면')
    //  여기가 핵심입니다. 저장은 됐는데 "찾을 수 없어요" 가 뜨면 사무실은
    //  실패한 줄 알고 한 번 더 등록합니다 — 같은 거래처가 둘이 됩니다.
    const url = office.url()
    const body = await office.locator('body').innerText()
    check(!body.includes('거래처를 찾을 수 없'),
      "저장 직후 '거래처를 찾을 수 없어요' 가 뜨지 않음",
      body.includes('거래처를 찾을 수 없') ? url.replace(BASE, '') : '')
    check(url.includes(madeId), `방금 만든 거래처의 상세 화면으로 이동 (${(moved.ms / 1000).toFixed(1)}초)`,
      url.includes(madeId) ? '' : `${url.replace(BASE, '')} (기대 /clients/${madeId})`)
    check(body.includes(name), '그 화면에 방금 넣은 이름이 보임')

    // ── 5. 목록에서 찾을 수 있는가 ─────────────────────────────────────
    section('5. 목록·검색')
    await office.goto(`${BASE}/clients`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    check((await office.locator('body').innerText()).includes(name), '목록에 새 거래처가 보임')

    const search = office.locator('input[placeholder="거래처명 · 주소 검색"]').first()
    await search.fill(name.slice(-8))
    await office.waitForTimeout(1200)
    check((await office.locator('body').innerText()).includes(name), '이름으로 검색해도 나옴')

    //  폰 자판은 낱말 뒤에 공백을 붙여 주는 일이 잦습니다. 분명히 있는
    //  거래처인데 "없어요" 가 나오면 사무실은 없는 줄 알고 또 등록합니다.
    await search.fill(` ${name.slice(-8)} `)
    await office.waitForTimeout(1200)
    check((await office.locator('body').innerText()).includes(name),
      '앞뒤에 공백이 붙어도 검색됨')

    // ── 5-1. 같은 이름으로 한 번 더 등록하려 할 때 ─────────────────────
    //  같은 병원이 둘이 되면 수거도 정산도 갈립니다. 명세서가 두 장 나가고,
    //  나중에 어느 쪽이 진짜인지 알 수 없게 됩니다. 막지는 않되 알려 줘야
    //  합니다(상호가 같은 다른 병원일 수도 있으므로).
    section('5-1. 같은 이름으로 또 등록')
    await office.locator('input[placeholder="거래처명 · 주소 검색"]').first().fill('')
    await office.waitForTimeout(800)
    let asked = ''
    office.once('dialog', (d) => { asked = d.message(); d.dismiss() })
    await office.locator('button:has-text("＋ 추가")').first().click()
    await office.waitForTimeout(1200)
    await dialog.locator('label:text-is("거래처명 *")').locator('xpath=following-sibling::input[1]').fill(name)
    await dialog.locator('button:has-text("저장")').first().click()
    await office.waitForTimeout(2500)
    check(/이미 거래처 목록에 있습니다/.test(asked), '이미 있는 이름이라고 알려 줌',
      asked.replace(/\n/g, ' ').slice(0, 60))
    const dupRows = (await svc(`/clients?select=id&name=eq.${encodeURIComponent(name)}`)).body ?? []
    check(dupRows.length === 1, '취소하면 같은 이름이 하나 더 생기지 않음', `${dupRows.length}곳`)
    await dialog.locator('button:has-text("취소")').first().click().catch(() => {})
    await office.waitForTimeout(800)

    // ── 6. 화면 오류 ───────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (madeId) {
      await svc(`/audit_logs?client_id=eq.${madeId}`, { method: 'DELETE' })
      await svc(`/clients?id=eq.${madeId}`, { method: 'DELETE' })
    }
    //  혹시 같은 이름이 둘 이상 만들어졌다면 그것도 지우고 알립니다.
    const leftovers = (await svc(`/clients?select=id&name=eq.${encodeURIComponent(name)}`)).body ?? []
    if (leftovers.length) {
      for (const l of leftovers) await svc(`/clients?id=eq.${l.id}`, { method: 'DELETE' })
      console.log(`  참고  같은 이름이 ${leftovers.length}개 더 남아 있어 함께 지웠습니다`)
    }
    const endCount = ((await svc('/clients?select=id&active=eq.true')).body ?? []).length
    check(endCount === startCount, '거래처 수가 시작 시점과 같음', `${startCount}곳 → ${endCount}곳`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`거래처 신규 등록: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
