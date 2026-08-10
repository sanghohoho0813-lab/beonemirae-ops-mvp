// ─────────────────────────────────────────────────────────────────────────────
// 엑셀 가져오기 종단 (실제 브라우저 · 실제 DB · 실제 엑셀 파일)
//
//  관리자가 「엑셀 가져오기」 화면에서 실제 파일을 올려, 미리보기를 보고,
//  확인을 누르고, 들어간 결과를 엑셀 합계와 맞춰 보는 한 바퀴입니다.
//
//  여기서 보는 것
//   1) 파일을 올리면 무엇이 들어 있는지 화면에 나오는가
//   2) 넣기 전에 등록 예정/건너뜀/충돌/오류/확인 필요 건수를 보여 주는가
//   3) 「확인 필요」(날짜 없는 달·미수금 표시)를 조용히 넣지 않는가
//   4) 확인을 누르면 DB 에 들어가는가 — 그리고 원 단위까지 엑셀과 같은가
//   5) 같은 파일을 다시 올리면 두 번 들어가지 않는가 (건너뜀)
//   6) 값이 다른 기록이 있으면 덮어쓰지 않고 「충돌」로 두는가
//   7) 관리자가 아닌 계정은 서버가 거절하는가
//   8) 중간에 잘못된 줄이 하나 섞이면 **하나도 안 들어가는가** (rollback)
//   9) 가져오기가 감사기록에 남는가
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_ADMIN_PW=... TEST_OFFICE_PW=...
//    export SAMPLE_XLSX=/경로/202602_더원요양병원_거래처관리.xlsx
//    node supabase/test/45_excel_import_live.mjs
//
//  · 0019 를 적용하지 않았으면 그 사실을 먼저 알리고 실패합니다.
//  · 검증용 거래처를 만들고 끝나면 지웁니다. 원본 파일은 고치지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

import { statSync } from 'node:fs'

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
const SAMPLE =
  process.env.SAMPLE_XLSX ||
  '/root/.claude/uploads/1c636c94-52d3-5813-b2a8-7537162d97f7/1a85e0e1-202602_____________.xlsx'

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`

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

/** 화면 숫자만 뽑기 */
const numbersIn = (t) => [...t.matchAll(/[\d,]{2,}/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite)

async function main() {
  console.log('\n════ 엑셀 가져오기 종단 ════')

  let before
  try {
    before = statSync(SAMPLE)
  } catch {
    no('원본 엑셀을 찾지 못했습니다', SAMPLE)
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }

  // ── 0. 0019 적용 여부 ────────────────────────────────────────────────
  section('0. 준비 — 0019 migration 적용 여부')
  const adminTok = await token(`admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
  if (!adminTok) {
    no('관리자 로그인')
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    process.exit(1)
  }
  const probe = await as(adminTok, '/rpc/import_excel_rows', {
    method: 'POST',
    body: JSON.stringify({ p_client_id: '00000000-0000-0000-0000-000000000000', p_rows: [] }),
  })
  const ready = probe.status !== 404
  check(ready, '가져오기 함수가 준비돼 있음 (import_excel_rows)',
    ready ? '' : '★ 0019_excel_import.sql 을 먼저 적용해 주세요')
  if (!ready) {
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log('엑셀 가져오기: NO (0019 migration 미적용)')
    process.exit(1)
  }

  const name = `${MARK}엑셀이관병원-${STAMP}`
  let clientId = null
  let browser = null
  const errors = []

  try {
    const made = await svc('/clients', {
      method: 'POST',
      body: JSON.stringify({
        name, type: '요양병원', address: '경기도 남양주시 검증로 9', manager: '박용재',
        phone: '031-000-0000', collection_cycle: '주 3회',
        collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
      }),
    })
    clientId = made.body?.[0]?.id
    check(!!clientId, '검증용 거래처를 만듦', name)
    if (!clientId) throw new Error('거래처 생성 실패')

    const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
    browser = await pw.chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
    })
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    admin.on('console', (m) => { if (m.type() === 'error') errors.push(`[관리자] ${m.text()}`) })
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)

    // ── 1. 파일 올리기 → 무엇이 들어 있는지 ────────────────────────────
    section('1. 파일을 올리면 무엇이 들어 있는지 보여 주는가')
    await admin.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
    await until(admin, async () => /엑셀 가져오기/.test(await admin.locator('body').innerText()))
    check(/엑셀 가져오기/.test(await admin.locator('body').innerText()), '「엑셀 가져오기」 화면이 열림')

    await admin.setInputFiles('#excel-file', SAMPLE)
    const read = await until(admin, async () => /파일에서 읽은 것/.test(await admin.locator('body').innerText()))
    check(read.ok, '파일을 읽어 내용을 보여 줌', `${(read.ms / 1000).toFixed(1)}초`)
    const t1 = await admin.locator('body').innerText()
    check(/더원요양병원/.test(t1), '엑셀에서 거래처 이름을 읽음')
    check(/2026-02-01/.test(t1), '계약 시작일을 읽음')
    check(/익월20일/.test(t1), '결제조건을 읽음')

    //  같은 이름의 거래처가 없으므로 사람이 고르게 되어 있어야 합니다.
    check(/거래처를 찾지 못했습니다/.test(t1) || (await admin.locator('#import-client').inputValue()) === '',
      '이름만 보고 새 거래처를 만들지 않음 — 사람이 고르게 함')
    await admin.selectOption('#import-client', clientId)
    await admin.waitForTimeout(1200)

    // ── 2. 넣기 전 건수 ────────────────────────────────────────────────
    section('2. 넣기 전에 건수를 보여 주는가')
    const t2 = await admin.locator('body').innerText()
    for (const label of ['등록 예정', '건너뜀', '충돌', '오류', '확인 필요']) {
      check(t2.includes(label), `「${label}」 건수를 보여 줌`)
    }
    check(/4건 가져오기/.test(t2), '등록 예정 4건 (수거 3 · 자재 1)',
      (t2.match(/(\d+)건 가져오기/) ?? [])[0] ?? '')
    check(/날짜가 없어|월 합계만/.test(t2), '날짜 없는 달을 왜 못 넣는지 알려 줌')
    check(/미수금/.test(t2), '「미수금」 표시를 그대로 보여 줌 (임의로 청구를 만들지 않음)')

    // ── 3. 가져오기 ────────────────────────────────────────────────────
    section('3. 확인을 누르면 DB 에 들어가는가')
    const schedBefore = ((await svc(`/schedules?select=id&client_id=eq.${clientId}`)).body ?? []).length
    admin.once('dialog', (d) => d.accept())
    await admin.locator('button:has-text("건 가져오기")').first().click()
    const done = await until(admin, async () =>
      ((await svc(`/schedules?select=id&client_id=eq.${clientId}`)).body ?? []).length === schedBefore + 3)
    check(done.ok, '수거 3건이 DB 에 들어감', `${(done.ms / 1000).toFixed(1)}초`)

    const sched = (await svc(`/schedules?select=*&client_id=eq.${clientId}&order=date`)).body ?? []
    const mats = (await svc(`/materials?select=*&client_id=eq.${clientId}`)).body ?? []
    check(mats.length === 1, '자재 공급 1건이 들어감', `${mats.length}건`)
    check(sched.every((s) => s.origin === 'migrated'), '엑셀에서 옮겨 온 것으로 표시됨 (origin=migrated)')
    check(sched.every((s) => s.status === '완료'), '수거 상태는 완료')

    const med = sched.find((s) => s.waste_type === '의료폐기물')
    check(med?.date === '2026-08-05' && med?.actual_amount === 472, '의료폐기물 8/5 472kg',
      `${med?.date} ${med?.actual_amount}kg`)
    const dia = sched.filter((s) => s.waste_type === '일회용기저귀')
    check(dia.length === 2 && dia.reduce((a, b) => a + b.actual_amount, 0) === 2270,
      '기저귀 2건 합계 2,270kg', `${dia.map((d) => `${d.date} ${d.actual_amount}kg`).join(' · ')}`)
    check(mats[0]?.items?.plastic20 === 50, '20L 합성수지 50개', String(mats[0]?.items?.plastic20))

    const cl = (await svc(`/clients?select=*&id=eq.${clientId}`)).body?.[0]
    check(cl?.contract_start === '2026-02-01', '거래처 계약 시작일이 채워짐', cl?.contract_start ?? '')
    check(cl?.payment_due_day === 20, '결제일이 채워짐', String(cl?.payment_due_day))
    check(cl?.pricing?.medical?.sale === 950, '단가가 채워짐', String(cl?.pricing?.medical?.sale))

    // ── 4. 엑셀 합계 ↔ 시스템 합계 ─────────────────────────────────────
    section('4. 엑셀 합계와 시스템 합계가 원 단위까지 같은가')
    check(/엑셀 합계 ↔ 시스템 합계/.test(await admin.locator('body').innerText()), '대조표를 자동으로 보여 줌')
    //  넣은 직후에는 앱이 전체 데이터를 다시 읽는 중이라 시스템 쪽이 잠시 0원
    //  으로 보입니다. 다 읽고 나서 판정합니다 — 읽는 중을 결함으로 세면 안 됩니다.
    const settled = await until(admin, async () =>
      /같음/.test((await admin.locator('body').innerText()).match(/엑셀 합계 ↔ 시스템 합계[\s\S]{0,400}/)?.[0] ?? ''))
    const t4 = await admin.locator('body').innerText()
    //  대조표만 잘라 냅니다. 그냥 400자를 집으면 아래 「한 줄씩」 표까지
    //  딸려 와서 수거 줄의 날짜(2026-08-05)가 달로 잡힙니다.
    const table = (t4.match(/엑셀 합계 ↔ 시스템 합계[\s\S]*?날짜가 없어 넣지 못한 달은/) ?? [''])[0]
    check(settled.ok, '차이 없음으로 나옴',
      `${(settled.ms / 1000).toFixed(1)}초 · ${(table.match(/2026-08[^\n]*/) ?? [''])[0]}`)
    check(numbersIn(t4).includes(2296600), '8월 매출 2,296,600원이 화면에 있음', won(2296600))
    //  달마다 한 줄씩 — 마지막 칸이 「같음」이어야 합니다. (금액에서 부호만
    //  찾으면 날짜의 '2026-08' 하이픈이 걸립니다 — 실제로 그래서 헛실패했습니다)
    const monthLines = table.split('\n').filter((l) => /^\d{4}-\d{2}(?!-)/.test(l.trim()))
    check(monthLines.length > 0 && monthLines.every((l) => /같음/.test(l)),
      '대조한 모든 달이 「같음」', monthLines.map((l) => l.trim()).join(' / ') || '대조한 달 없음')

    // ── 5. 같은 파일을 다시 ────────────────────────────────────────────
    section('5. 같은 파일을 다시 올렸을 때')
    await admin.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
    await until(admin, async () => /파일 고르기/.test(await admin.locator('body').innerText()))
    await admin.setInputFiles('#excel-file', SAMPLE)
    await until(admin, async () => /파일에서 읽은 것/.test(await admin.locator('body').innerText()))
    await admin.selectOption('#import-client', clientId)
    await until(admin, async () => /건너뜀/.test(await admin.locator('body').innerText()))
    await admin.waitForTimeout(1500)
    const t5 = await admin.locator('body').innerText()
    check(/등록 예정[\s\S]{0,20}0건/.test(t5), '등록 예정 0건 — 두 번 넣지 않음',
      (t5.match(/등록 예정[\s\S]{0,12}/) ?? [''])[0].replace(/\n/g, ' '))
    const btn = admin.locator('button:has-text("건 가져오기")').first()
    check((await btn.count()) === 0 || !(await btn.isEnabled()), '가져오기 버튼이 잠겨 있음')
    const still = ((await svc(`/schedules?select=id&client_id=eq.${clientId}`)).body ?? []).length
    check(still === 3, '수거 기록이 늘지 않음', `${still}건`)

    // ── 6. 값이 다르면 덮어쓰지 않는가 ─────────────────────────────────
    section('6. 같은 날인데 값이 다르면')
    await svc(`/schedules?id=eq.${med.id}`, { method: 'PATCH', body: JSON.stringify({ actual_amount: 999 }) })
    await admin.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
    await until(admin, async () => /파일 고르기/.test(await admin.locator('body').innerText()))
    await admin.setInputFiles('#excel-file', SAMPLE)
    await until(admin, async () => /파일에서 읽은 것/.test(await admin.locator('body').innerText()))
    await admin.selectOption('#import-client', clientId)
    await until(admin, async () => /충돌/.test(await admin.locator('body').innerText()))
    await admin.waitForTimeout(1500)
    const t6 = await admin.locator('body').innerText()
    check(/999/.test(t6), '무엇이 다른지 보여 줌', (t6.match(/이미 있는 기록은[^\n]{0,40}/) ?? [''])[0])
    //  서버도 덮어쓰지 않아야 합니다 — 화면을 거치지 않고 직접 불러 봅니다.
    const force = await as(adminTok, '/rpc/import_excel_rows', {
      method: 'POST',
      body: JSON.stringify({
        p_client_id: clientId,
        p_rows: [{ kind: '수거', date: '2026-08-05', wasteType: '의료폐기물', kg: 472, where: '강제' }],
        p_file: '강제시도.xlsx',
      }),
    })
    check(force.body?.conflict === 1 && force.body?.inserted === 0,
      '서버도 덮어쓰지 않고 충돌로 셈', JSON.stringify(force.body ?? {}))
    const kept = (await svc(`/schedules?select=actual_amount&id=eq.${med.id}`)).body?.[0]
    check(kept?.actual_amount === 999, '기존 값이 그대로 남음', `${kept?.actual_amount}kg`)
    await svc(`/schedules?id=eq.${med.id}`, { method: 'PATCH', body: JSON.stringify({ actual_amount: 472 }) })

    // ── 7. 관리자가 아니면 ─────────────────────────────────────────────
    section('7. 관리자가 아닌 계정이 직접 불렀을 때')
    const officeTok = await token(`office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    if (officeTok) {
      const r = await as(officeTok, '/rpc/import_excel_rows', {
        method: 'POST',
        body: JSON.stringify({
          p_client_id: clientId,
          p_rows: [{ kind: '수거', date: '2026-09-09', wasteType: '의료폐기물', kg: 10, where: '몰래' }],
          p_file: '몰래.xlsx',
        }),
      })
      const leaked = ((await svc(`/schedules?select=id&client_id=eq.${clientId}&date=eq.2026-09-09`)).body ?? []).length
      check(r.status >= 400 && leaked === 0, '사무실 계정은 가져오기를 할 수 없음', `${r.status} · 남은 기록 ${leaked}건`)
    }
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(1500)
    check(/접근 권한이 없는 화면입니다/.test(await office.locator('body').innerText()),
      '사무실 계정은 화면도 차단')
    await office.close()

    // ── 8. 중간에 잘못된 줄이 있으면 하나도 안 들어가는가 ───────────────
    section('8. 중간에 잘못된 줄이 섞이면 (되돌리기)')
    const cntBefore = ((await svc(`/schedules?select=id&client_id=eq.${clientId}`)).body ?? []).length
    const half = await as(adminTok, '/rpc/import_excel_rows', {
      method: 'POST',
      body: JSON.stringify({
        p_client_id: clientId,
        p_rows: [
          { kind: '수거', date: '2026-09-01', wasteType: '의료폐기물', kg: 100, where: '정상' },
          { kind: '수거', date: '2026-09-02', wasteType: '엉뚱한구분', kg: 100, where: '잘못' },
        ],
        p_file: '반쯤.xlsx',
      }),
    })
    check(half.status >= 400, '잘못된 줄에서 실패함', `${half.status}`)
    const cntAfter = ((await svc(`/schedules?select=id&client_id=eq.${clientId}`)).body ?? []).length
    check(cntAfter === cntBefore, '앞의 정상 줄도 들어가지 않음 (반쯤 들어간 상태 없음)',
      `${cntBefore}건 → ${cntAfter}건`)

    // ── 9. 감사기록 ────────────────────────────────────────────────────
    section('9. 가져오기가 감사기록에 남는가')
    const logs = (await svc(`/audit_logs?select=action,summary,actor_id&client_id=eq.${clientId}&order=id.desc&limit=20`)).body ?? []
    const imports = logs.filter((l) => l.action === 'import.excel')
    check(imports.length > 0, '가져오기가 감사기록에 남음', imports[0]?.summary?.slice(0, 60) ?? '없음')
    check(imports.every((l) => !!l.actor_id), '누가 했는지 남음')
    //  이 검사는 일부러 여러 번 부릅니다(재업로드·강제 시도). 그중 진짜로
    //  넣은 회차의 줄을 찾습니다 — 가장 최근 줄만 보면 강제 시도가 잡힙니다.
    const realImport = imports.find((l) => /등록 4건/.test(l.summary ?? ''))
    check(!!realImport, '몇 건 넣었는지 남음',
      realImport?.summary?.slice(0, 70) ?? imports.map((l) => l.summary?.slice(0, 40)).join(' | '))

    // ── 10. 폰(390) ────────────────────────────────────────────────────
    section('10. 폰(390) 에서 화면이 밀리지 않는가')
    const phone = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    await signIn(phone, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await phone.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
    await until(phone, async () => /파일 고르기/.test(await phone.locator('body').innerText()))
    await phone.setInputFiles('#excel-file', SAMPLE)
    await until(phone, async () => /파일에서 읽은 것/.test(await phone.locator('body').innerText()))
    await phone.selectOption('#import-client', clientId)
    await phone.waitForTimeout(2000)
    const over = await phone.evaluate(() => {
      const doc = document.documentElement
      const bad = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.right > doc.clientWidth + 1.5) bad.push(`${el.tagName}.${String(el.className).slice(0, 32)}`)
      }
      return { docW: doc.clientWidth, scrollW: doc.scrollWidth, bad: bad.slice(0, 3) }
    })
    //  넓은 표는 자기 상자 안에서 가로로 스크롤됩니다(의도한 것). 페이지
    //  자체가 밀리는지만 봅니다.
    const slides = over.scrollW <= over.docW + 2
    check(slides, '폰에서 옆으로 밀리지 않음',
      slides ? `${over.scrollW} ≤ ${over.docW}` : over.bad.join(' | '))
    await phone.close()

    // ── 11. 콘솔 오류 ──────────────────────────────────────────────────
    section('11. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_|400|403/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 2).join(' | '))
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    if (browser) await browser.close().catch(() => {})

    section('정리')
    if (clientId) {
      await svc(`/schedules?client_id=eq.${clientId}`, { method: 'DELETE' })
      await svc(`/materials?client_id=eq.${clientId}`, { method: 'DELETE' })
      //  감사기록은 지우지 않습니다 — 무엇을 했는지 남기는 것이 그 자리의 목적입니다.
      //  거래처를 지우면 client_id 는 자동으로 비워집니다(on delete set null).
      await svc(`/clients?id=eq.${clientId}`, { method: 'DELETE' })
      const left = ((await svc(`/clients?select=id&id=eq.${clientId}`)).body ?? []).length
      check(left === 0, '검증용 거래처가 남지 않음')
    }
    const after = statSync(SAMPLE)
    check(after.size === before.size && after.mtimeMs === before.mtimeMs,
      '원본 엑셀을 고치지 않음', `${after.size} bytes`)

    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`엑셀 가져오기 종단: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
