// ─────────────────────────────────────────────────────────────────────────────
// 수거량 자릿수 오타 (실제 브라우저 · 실제 DB)
//
//  현장에서 숫자를 잘못 치는 것은 드문 일이 아닙니다. 88 을 880 으로 치면
//  그 거래처의 그 달 매출이 열 배가 되고, 아무도 눈치채지 못합니다.
//  수거량은 사람이 손으로 넣는 숫자 중 돈에 가장 직접 붙는 값입니다.
//
//  차량이 실을 수 없는 양이면 거의 확실히 오타입니다. 그래서
//   · 막지는 않고 (현장 사정을 시스템이 다 알 수는 없습니다)
//   · 대신 반드시 눈에 보이게 알려야 합니다.
//
//  같은 화면에서 또 하나 확인합니다. 오늘 이미 수거한 거래처에 다시 가면
//  "'추가 수거'로 저장해 주세요" 라는 안내가 뜨는데, 정작 그 선택칸은
//  자재를 공급할 때만 보였습니다. 자재 없이 다시 방문하면 화면이 시키는
//  대로 할 방법이 없었습니다.
//
//  밟는 순서
//   1) 현장(모바일)  오늘 두 번째 방문에 '추가 수거' 칸이 보이는가
//   2) 현장(모바일)  차량 적재량을 넘는 수거량을 넣고 저장
//   3) 화면          자릿수를 확인하라는 안내가 뜨는가
//   4) DB            그래도 저장은 되는가 (막지 않기로 한 결정)
//   5) 되돌리기      잘못 넣은 것을 취소하면 깨끗이 사라지는가
//   6) 정상값        평범한 수거량에는 안내가 뜨지 않는가 (헛경고 방지)
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=...
//    node supabase/test/29_amount_typo.mjs
//
//  · 이 검사가 만든 수거는 끝나면 되돌리고 지웁니다. 재고도 원래대로 확인합니다.
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
let staffToken = null
const tokenFor = (email, password) =>
  fetch(`${U}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(json)

//  revert_collection 은 '누가 되돌렸는지'를 남기므로 로그인한 직원으로 불러야
//  합니다. service_role 에는 auth.uid() 가 없어 400 이 납니다.
const revert = (eventId) =>
  fetch(`${U}/rest/v1/rpc/revert_collection`, {
    method: 'POST',
    headers: { apikey: A, Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_event_id: eventId }),
  }).then(json)

const svc = (path, init = {}) =>
  fetch(`${U}/rest/v1${path}`, {
    ...init,
    headers: { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
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
  await page.waitForTimeout(1500)
}

/** 수거 입력 화면에서 거래처·수거량을 넣고 저장합니다. */
async function enter(page, clientName, amount) {
  await page.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  //  화면에는 select 가 둘입니다 — [0] 거래처, [1] 배차 차량.
  //  차량은 자동으로 골라지지 않으므로 사람처럼 직접 고릅니다.
  const clientSel = page.locator('select').nth(0)
  const options = await clientSel.locator('option').allTextContents()
  const target = options.find((o) => o.includes(clientName))
  if (!target) return { ok: false, why: `거래처 목록에 ${clientName} 이 없습니다` }
  await clientSel.selectOption({ label: target })
  await page.waitForTimeout(1200)

  const vehSel = page.locator('select').nth(1)
  const vOpts = await vehSel.locator('option').allTextContents()
  const vTarget = vOpts.find((o) => o.includes(MARK) || (o !== '차량 선택' && o.trim()))
  if (!vTarget) return { ok: false, why: '배차 차량 목록이 비어 있습니다' }
  await vehSel.selectOption({ label: vTarget })
  await page.waitForTimeout(800)

  const amountInput = page.locator('input[type="number"]').first()
  await amountInput.fill(String(amount))
  await page.waitForTimeout(600)

  //  오늘 이미 수거한 곳이면 '추가 수거' 를 켜야 저장됩니다.
  const addBox = page.locator('label:has-text("추가 수거") input[type="checkbox"]').first()
  const hasAddBox = (await addBox.count()) > 0
  if (hasAddBox) await addBox.check()

  const save = page.locator('button:has-text("수거 완료 저장")').first()
  if (await save.isDisabled()) return { ok: false, why: '저장 버튼이 잠겨 있습니다', hasAddBox }
  await save.click()
  await page.waitForTimeout(6000)

  //  저장이 실제로 됐는지는 화면의 오류 문구로 판단합니다.
  //  (경고는 실패할 때도 함께 나오므로 경고만 보고 성공이라 하면 안 됩니다)
  const txt = await page.locator('body').innerText()
  const blocked = /이미 저장되어 있습니다|저장하지 못했습니다|권한이 없습니다/.test(txt)
  return { ok: !blocked, why: blocked ? txt.split('\n')[0].slice(0, 70) : '', hasAddBox, txt }
}

async function main() {
  console.log('\n════ 수거량 자릿수 오타 ════')

  const vehicle = (await svc('/vehicles?select=id,name,nominal_capacity,waste_type&active=eq.true&limit=1')).body?.[0]
  if (!vehicle) { console.error('활성 차량이 없습니다.'); process.exit(1) }
  const client = (await svc(`/clients?select=id,name&active=eq.true&limit=1`)).body?.[0]
  const TYPO = vehicle.nominal_capacity + 500   // 차량이 실을 수 없는 양
  const NORMAL = 45                              // 평범한 수거량
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const stock0 = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
  const startSched = ((await svc('/schedules?select=id')).body ?? []).length
  const madeEvents = []
  staffToken = (await tokenFor(`field@${DOMAIN}`, process.env.TEST_FIELD_PW)).body?.access_token

  console.log(`대상 ${client.name} · ${vehicle.name} (최대 ${vehicle.nominal_capacity}kg)`)

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const field = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    field.on('console', (m) => { if (m.type() === 'error') errors.push(`[현장] ${m.text()}`) })
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)

    // ── 0. 오늘 두 번째 방문이면 '추가 수거' 칸이 보이는가 ──────────────
    section("0. 오늘 이미 수거한 곳에 다시 갔을 때")
    const doneToday = (await svc(
      `/schedules?select=id&client_id=eq.${client.id}&date=eq.${todayStr}&status=eq.완료&waste_type=eq.${encodeURIComponent(vehicle.waste_type)}`,
    )).body ?? []
    console.log(`  (오늘 이 거래처의 ${vehicle.waste_type} 완료 수거 ${doneToday.length}건)`)

    // ── 1. 차량이 실을 수 없는 양을 넣는다 ──────────────────────────────
    section('1. 자릿수를 잘못 친 경우')
    const r1 = await enter(field, client.name, TYPO)
    if (doneToday.length > 0) {
      check(r1.hasAddBox, "오늘 두 번째 방문에는 '추가 수거' 칸이 보임",
        r1.hasAddBox ? '' : '칸이 없어 저장할 방법이 없습니다')
    }
    check(r1.ok, `${TYPO}kg 을 넣고 저장`, r1.why ?? '')
    if (!r1.ok) return

    const body1 = r1.txt ?? (await field.locator('body').innerText())
    check(/자릿수를 확인/.test(body1), '자릿수를 확인하라는 안내가 뜸',
      /자릿수를 확인/.test(body1) ? '' : '안내가 보이지 않습니다')
    check(body1.includes(String(vehicle.nominal_capacity).slice(0, 2)) || /최대 적재량/.test(body1),
      '안내에 그 차량의 최대 적재량이 함께 보임')

    // ── 2. 그래도 저장은 되는가 ────────────────────────────────────────
    section('2. 막지는 않는다')
    const saved = (await svc(`/schedules?select=id,actual_amount,event_id&client_id=eq.${client.id}&actual_amount=eq.${TYPO}&order=id.desc&limit=1`)).body?.[0]
    check(saved?.actual_amount === TYPO, '경고를 띄우되 저장은 그대로 됨',
      `${saved?.actual_amount}kg`)
    if (saved?.event_id) madeEvents.push(saved.event_id)

    // ── 3. 되돌리면 깨끗이 사라지는가 ──────────────────────────────────
    section('3. 잘못 넣은 것을 되돌리기')
    if (saved?.event_id) {
      const rev = await revert(saved.event_id)
      check(rev.status === 200, '되돌리기 성공', `(${rev.status})`)
      const gone = (await svc(`/schedules?select=actual_amount,status&id=eq.${saved.id}`)).body?.[0]
      check(gone == null || gone.status !== '완료' || gone.actual_amount == null,
        '되돌린 수거는 완료 상태가 아님', `${gone?.status ?? '행 없음'} · ${gone?.actual_amount ?? '-'}`)
      if (rev.status === 200) madeEvents.pop()
    }

    // ── 4. 평범한 값에는 헛경고가 뜨지 않는가 ──────────────────────────
    section('4. 정상 수거량 (헛경고 방지)')
    const r2 = await enter(field, client.name, NORMAL)
    check(r2.ok, `${NORMAL}kg 을 넣고 저장`, r2.why ?? '')
    if (r2.ok) {
      const body2 = r2.txt ?? (await field.locator('body').innerText())
      check(!/자릿수를 확인/.test(body2), '평범한 수거량에는 안내가 뜨지 않음')
      const ok2 = (await svc(`/schedules?select=id,actual_amount,event_id&client_id=eq.${client.id}&actual_amount=eq.${NORMAL}&order=id.desc&limit=1`)).body?.[0]
      check(ok2?.actual_amount === NORMAL, '정상 수거는 그대로 저장됨', `${ok2?.actual_amount}kg`)
      if (ok2?.event_id) madeEvents.push(ok2.event_id)
    }

    // ── 5. 오늘 일정의 '빠른 완료' 에서도 경고가 보이는가 ────────────────
    section("5. 빠른 완료에서도 같은 경고가 보이는가")
    //  현장은 수거 입력 화면보다 오늘 일정의 '빠른 완료' 를 더 많이 씁니다.
    //  이 길에서 경고가 사라지면 자릿수 오타를 잡을 방법이 없습니다.
    const pend = (await svc(
      `/schedules?select=id&status=eq.예정&date=eq.${todayStr}&limit=1`,
    )).body?.[0]
    if (!pend) {
      console.log('  참고  오늘 남은 예정 수거가 없어 빠른 완료는 건너뜁니다')
    } else {
      //  「빠른 완료」 는 넓은 화면 전용입니다(카드가 hidden lg:block 안에 있습니다).
      //  폰에서는 일정 줄을 누르면 수거 입력 화면으로 넘어가는 것이 정상 흐름이라,
      //  이 확인만 넓은 화면에서 합니다. 저장 경로 자체는 같은 코드입니다.
      const wide = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
      wide.on('pageerror', (e) => errors.push(`[현장PC] ${e.message}`))
      await signIn(wide, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
      await wide.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
      await wide.waitForTimeout(3000)
      //  일정 카드는 가로로 스크롤되는 띠 안에 있어서, 버튼이 화면 밖에
      //  있을 수 있습니다. 스크롤해서 끌어온 뒤 누릅니다.
      const quickBtn = wide.locator('button:has-text("빠른 완료")').last()
      if ((await quickBtn.count()) === 0) {
        console.log('  참고  「빠른 완료」 버튼이 없어 건너뜁니다')
      } else {
        await quickBtn.scrollIntoViewIfNeeded().catch(() => {})
        await quickBtn.click()
        await wide.waitForTimeout(1500)
        const qAmount = wide.locator('[role="dialog"] input[type="number"]').first()
        await qAmount.fill(String(TYPO))
        await wide.waitForTimeout(500)
        await wide.locator('button:has-text("완료 처리")').first().click()
        await wide.waitForTimeout(6000)
        const qtxt = await wide.locator('body').innerText()
        check(/자릿수를 확인/.test(qtxt), '빠른 완료에서도 자릿수 안내가 보임',
          /자릿수를 확인/.test(qtxt) ? '' : '경고가 사라졌습니다')
        const qSaved = (await svc(
          `/schedules?select=event_id,actual_amount&id=eq.${pend.id}`,
        )).body?.[0]
        if (qSaved?.event_id && qSaved.actual_amount === TYPO) madeEvents.push(qSaved.event_id)
      }
      await wide.close()
    }

    // ── 6. 화면 오류 ───────────────────────────────────────────────────
    section('6. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await field.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    //  이 검사가 만든 수거를 모두 되돌립니다.
    for (const ev of madeEvents) await revert(ev).catch(() => {})
    //  되돌리기가 남긴 빈 일정까지 지웁니다 (이 검사가 새로 만든 것만).
    const endSchedAll = (await svc('/schedules?select=id,status,actual_amount&order=id.desc&limit=20')).body ?? []
    for (const s of endSchedAll.slice(0, 4)) {
      if (s.status !== '완료' && (s.actual_amount == null || s.actual_amount === 0)) {
        const cnt = ((await svc('/schedules?select=id')).body ?? []).length
        if (cnt > startSched) await svc(`/schedules?id=eq.${s.id}`, { method: 'DELETE' })
      }
    }
    const stock1 = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
    check(
      stock0.corrugated_box === stock1.corrugated_box &&
        stock0.plastic_container === stock1.plastic_container &&
        stock0.bag === stock1.bag &&
        stock0.needle_box === stock1.needle_box,
      '사무실 재고가 시작 시점과 같음',
      `골판지 ${stock1.corrugated_box} · 합성수지 ${stock1.plastic_container}`,
    )
    const endSched = ((await svc('/schedules?select=id')).body ?? []).length
    check(endSched === startSched, '수거일정 수가 시작 시점과 같음', `${startSched}건 → ${endSched}건`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`수거량 오타 방어: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
