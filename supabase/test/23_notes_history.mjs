// ─────────────────────────────────────────────────────────────────────────────
// 현장 메모 · 수거 이력 · 감사로그 화면 (실제 브라우저 · 실제 DB)
//
//  세 화면 다 "적어 두면 다음 사람이 본다"는 약속 위에 서 있습니다.
//
//   · 현장 메모 — 사무실이 적은 특이사항이 현장 사람 화면에 뜨지 않으면,
//     결국 다시 전화로 물어보게 되고 아무도 메모를 안 씁니다.
//   · 수거 이력 — 검색·필터가 어긋나면 "지난달에 왔었나"를 확인할 방법이
//     없습니다. 정산 다툼이 여기서 시작됩니다.
//   · 감사로그 — 관리자만 봐야 합니다.
//
//  밟는 순서
//   1) 사무실(PC)  거래처 상세에서 현장 메모를 적는다 → DB 확인
//   2) 현장(모바일) 오늘 일정에서 그 메모가 보이는지 확인
//   3) 사무실(PC)  완료 표시 → 삭제(보관) → DB 확인
//   4) 사무실(PC)  수거 이력에서 이름 검색·구분 필터가 맞는지 확인
//   5) 감사로그    사무실은 막히고 관리자만 열리는지 확인
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=... TEST_FIELD_PW=...
//    node supabase/test/23_notes_history.mjs
//
//  · 만드는 것에는 '[검증]' 이 붙고 끝나면 모두 지웁니다.
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

/**
 * 화면이 그렇게 될 때까지 기다립니다 (걸린 시간도 돌려줍니다).
 *
 *  전에는 저장을 누르고 3초를 기다린 뒤 화면을 봤습니다. 그런데 이 앱은
 *  무엇을 저장하든 저장 후 전체 데이터를 다시 읽습니다. 검증을 오래 돌려
 *  DB 가 커지면 그 다시 읽기가 3초를 넘고, 화면은 멀쩡한데 검사만 실패
 *  했습니다(실제로 전체 회귀 도중에만 두 줄이 FAIL 로 나왔고, 같은 검사를
 *  따로 돌리면 통과했습니다). 시간이 아니라 결과를 기다립니다.
 */
async function until(page, want, ms = 25000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await want()) return { ok: true, ms: Date.now() - t0 }
    await page.waitForTimeout(300)
  }
  return { ok: false, ms: Date.now() - t0 }
}

async function main() {
  console.log('\n════ 현장 메모 · 수거 이력 · 감사로그 ════')

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const startNotes = ((await svc('/site_notes?select=id&archived=eq.false')).body ?? []).length
  const stamp = Date.now() % 100000
  const noteText = `${MARK}용기 3개 추가-${stamp}`
  let schedId = null
  let noteId = null

  const client = (await svc(`/clients?select=id,name&active=eq.true&order=created_at&limit=1`)).body?.[0]
  if (!client) { console.error('거래처가 없습니다.'); process.exit(1) }
  const vehicle = (await svc('/vehicles?select=id,waste_type&active=eq.true&limit=1')).body?.[0]

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    // ── 1. 사무실이 현장 메모를 적는다 ──────────────────────────────────
    section('1. 사무실이 거래처 상세에서 메모를 적는다')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    office.on('console', (m) => { if (m.type() === 'error') errors.push(`[사무실] ${m.text()}`) })
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)

    await office.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)

    //  메모는 「현장 메모」 탭 안에 있습니다 (상세 화면의 기본 탭이 아닙니다).
    await office.locator('button:has-text("현장 메모")').first().click()
    await office.waitForTimeout(1500)

    const noteInput = office.locator('input[placeholder^="예) 다음 방문"]').first()
    check(await noteInput.count() > 0, '현장 메모 입력칸이 있음')
    //  구분 칩은 메모 입력 폼 안에 있습니다. 폼 밖에서 '자재' 를 찾으면
    //  사이드바의 「자재 관리」 메뉴가 먼저 잡혀 화면이 통째로 넘어갑니다.
    const noteForm = office.locator('form').filter({ has: noteInput })
    await noteForm.locator('button:has-text("자재")').first().click()
    await noteInput.fill(noteText)
    await noteForm.locator('button:has-text("기록")').first().click()
    const shown = await until(office, async () => (await office.locator(`text=${noteText}`).count()) > 0)

    const saved = (await svc(`/site_notes?select=*&content=eq.${encodeURIComponent(noteText)}`)).body?.[0]
    check(!!saved, '메모가 DB 에 저장됨', saved ? `${saved.kind} · done=${saved.done}` : '안 됨')
    if (saved) noteId = saved.id
    check(saved?.kind === '자재', '고른 구분(자재)이 그대로 저장됨', saved?.kind ?? '')
    check(saved?.client_id === client.id, '그 거래처에 붙음')

    check(shown.ok, '화면 목록에도 바로 보임', `${(shown.ms / 1000).toFixed(1)}초 만에 보임`)

    // ── 2. 현장 사람이 오늘 일정에서 그 메모를 보는가 ──────────────────
    section('2. 현장(모바일) 오늘 일정에서 보이는가')
    //  메모는 '오늘 일정에 뜨는 거래처'에만 붙어 보입니다. 오늘 일정을 하나 만듭니다.
    const sched = (await svc('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        date: today, client_id: client.id, waste_type: vehicle?.waste_type ?? '의료폐기물',
        vehicle_id: vehicle?.id ?? null, scheduled_time: '15:40', expected_amount: 20,
        status: '예정', is_additional: true, origin: 'seed', memo: `${MARK}메모확인용-${stamp}`,
        event_id: crypto.randomUUID(),
      }),
    })).body?.[0]
    check(!!sched, '오늘 일정을 하나 만듦')
    if (sched) schedId = sched.id

    const field = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    await field.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
    const seen = await until(field, async () =>
      (await field.locator('body').innerText()).includes(noteText.slice(0, 14)))
    const fieldText = await field.locator('body').innerText()
    check(seen.ok, '현장 화면에 사무실이 적은 메모가 그대로 보임',
      seen.ok
        ? `${(seen.ms / 1000).toFixed(1)}초 만에 보임`
        : fieldText.includes(client.name) ? '' : `${client.name} 이 오늘 일정에 없음`)
    await field.close()

    // ── 3. 완료 표시 → 보관 ────────────────────────────────────────────
    section('3. 완료 표시와 보관')
    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    await office.locator('button:has-text("현장 메모")').first().click()
    await office.waitForTimeout(1500)
    //  같은 글이 헤더의 메모 칩에도 뜹니다. 글자로만 찾으면 버튼이 없는
    //  칩 쪽이 먼저 잡히므로, '처리 완료' 버튼을 가진 줄로 좁힙니다.
    const rowOf = (label) =>
      office
        .locator('div')
        .filter({ hasText: noteText })
        .filter({ has: office.locator(`button[title="${label}"]`) })
        .last()
    await rowOf('처리 완료').locator('button[title="처리 완료"]').first().click()
    await until(office, async () =>
      (await svc(`/site_notes?select=done&id=eq.${noteId}`)).body?.[0]?.done === true)
    const done = (await svc(`/site_notes?select=done,archived&id=eq.${noteId}`)).body?.[0]
    check(done?.done === true, '완료 표시가 DB 에 반영')

    await rowOf('삭제').locator('button[title="삭제"]').first().click()
    await until(office, async () =>
      (await svc(`/site_notes?select=archived&id=eq.${noteId}`)).body?.[0]?.archived === true)
    const archived = (await svc(`/site_notes?select=archived&id=eq.${noteId}`)).body?.[0]
    check(archived?.archived === true, '삭제가 아니라 보관으로 남음 (기록은 지워지지 않음)',
      `archived=${archived?.archived}`)
    const gone = await until(office, async () => (await office.locator(`text=${noteText}`).count()) === 0)
    check(gone.ok, '보관한 메모는 화면에서 빠짐', `${(gone.ms / 1000).toFixed(1)}초 만에 빠짐`)

    // ── 4. 수거 이력 검색·필터 ─────────────────────────────────────────
    section('4. 수거 이력 검색·필터')
    await office.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    const search = office.locator('input[placeholder="거래처명 검색"]').first()
    check(await search.count() > 0, '거래처명 검색칸이 있음')
    await search.fill(client.name)
    await office.waitForTimeout(1200)
    const hitText = await office.locator('body').innerText()
    check(hitText.includes(client.name), '검색한 거래처가 목록에 남음')

    await search.fill(`${MARK}없는거래처${stamp}`)
    await office.waitForTimeout(1200)
    const emptyText = await office.locator('body').innerText()
    check(!emptyText.includes(client.name), '없는 이름으로 검색하면 목록이 비워짐')
    await search.fill('')
    await office.waitForTimeout(1000)

    //  구분 필터 — '긴급' 만 골랐을 때 예정/완료가 섞여 나오면 안 됩니다
    const urgent = office.locator('button:has-text("긴급")').first()
    if (await urgent.count()) {
      await urgent.click()
      await office.waitForTimeout(1500)
      const urgentOnly = (await svc('/schedules?select=id&status=eq.긴급')).body ?? []
      const listText = await office.locator('body').innerText()
      const emptyShown = /조건에 맞는|없습니다|없어요/.test(listText)
      check(urgentOnly.length > 0 ? !emptyShown : emptyShown,
        '긴급 필터 결과가 DB 와 맞음', `DB 긴급 ${urgentOnly.length}건`)
    }

    // ── 5. 감사로그는 관리자만 ─────────────────────────────────────────
    section('5. 감사로그 접근')
    await office.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    const officeAudit = await office.locator('body').innerText()
    check(!office.url().includes('/audit') || /권한|접근|관리자/.test(officeAudit),
      '사무실 계정은 감사로그를 열 수 없음', office.url().replace(BASE, ''))
    await office.close()

    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/audit`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const adminAudit = await admin.locator('body').innerText()
    check(admin.url().includes('/audit'), '관리자는 감사로그 화면이 열림')
    const lastAudit = (await svc('/audit_logs?select=summary&order=id.desc&limit=1')).body?.[0]
    check(lastAudit ? adminAudit.includes(lastAudit.summary.slice(0, 12)) : true,
      '가장 최근 기록이 화면에도 보임', lastAudit?.summary?.slice(0, 30) ?? '기록 없음')

    //  기록 종류가 'vehicle.create' 같은 영문 원문으로 보이면 대표님은
    //  그게 무슨 뜻인지 알 수 없습니다. 화면에 남은 영문 키를 찾아냅니다.
    const rawKeys = [...new Set((adminAudit.match(/\b[a-z]+\.[a-z]+\b/g) ?? []))]
      .filter((k) => !/\.(com|kr|net|co|test|io)$/.test(k))
    check(rawKeys.length === 0, '기록 종류가 모두 한국어로 보임', rawKeys.slice(0, 6).join(', '))

    // ── 6. 현장 담당자의 더보기 메뉴에 못 여는 칸이 있는가 ──────────────
    section('6. 현장(모바일) 더보기 메뉴')
    //  눌렀는데 튕기는 메뉴는 "고장난 것"으로 보입니다.
    //  현장에게 닫혀 있는 화면(미수금·통계·배차·리포트)은 아예 안 보여야 합니다.
    const field2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
    field2.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field2, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    await field2.goto(`${BASE}/today`, { waitUntil: 'networkidle' })
    await field2.waitForTimeout(2000)
    //  폰에서는 하단 탭의 「더보기」가 바텀시트를 엽니다(/more 는 PC 경로).
    await field2.locator('button:has-text("더보기")').first().click()
    await field2.waitForTimeout(1500)
    const moreText = await field2.locator('body').innerText()
    //  메뉴 이름만으로 찾으면 '추가 개발 예정' 목록의 「AI 배차·경로 고도화」
    //  같은 글까지 걸립니다. 각 바로가기의 설명 문구로 정확히 봅니다.
    const forbidden = [
      ['미수금 관리', '청구·입금 현황 및 미수금'],
      ['통계', '수거량·거래처·차량 실적'],
      ['배차·경로', '차량별 배차·경로 추천'],
      ['운영 리포트', '병원별 월간 운영 리포트'],
    ].filter(([, desc]) => moreText.includes(desc)).map(([label]) => label)
    check(forbidden.length === 0, '현장에게 닫힌 화면은 더보기에도 없음', forbidden.join(', '))
    check(moreText.includes('전체 수거 입력 이력·감사기록'), '현장에게 열린 화면은 그대로 보임')
    await field2.close()

    // ── 7. 화면 오류 ───────────────────────────────────────────────────
    section('7. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await admin.close()
  } catch (e) {
    //  finally 안에서 process.exit 을 부르기 때문에, 여기서 잡아 두지 않으면
    //  중간에 터진 오류가 조용히 사라지고 '2 PASS' 처럼 보입니다.
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (noteId) await svc(`/site_notes?id=eq.${noteId}`, { method: 'DELETE' })
    if (schedId) await svc(`/schedules?id=eq.${schedId}`, { method: 'DELETE' })
    const endNotes = ((await svc('/site_notes?select=id&archived=eq.false')).body ?? []).length
    check(endNotes === startNotes, '메모 수가 시작 시점과 같음', `${startNotes}건 → ${endNotes}건`)
    await browser.close()

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`현장 메모 · 이력 · 감사로그: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
