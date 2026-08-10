// ─────────────────────────────────────────────────────────────────────────────
// 수거 → 자재 → 월정산 → 청구확정 → 미수금 → 입금처리 → 거래명세서
// (실제 브라우저 · 실제 DB · 더원요양병원 기준)
//
//  39번이 "정산까지는 가는데 청구에서 끊긴다" 를 보여 줬습니다. 이 검사는
//  그 끊긴 자리를 이은 뒤, 현장이 한 번 넣은 것이 **받을 돈과 입금까지**
//  이어지는지를 끝까지 따라갑니다.
//
//  대표님이 정하신 방침대로인지도 함께 봅니다.
//   · 월말 자동이 아니라 사무실이 「청구 확정」을 눌러 만든다
//   · 확정하면 금액·명세서가 굳어, 이후 단가 변경이 기존 청구를 바꾸지 않는다
//   · 같은 거래처·같은 청구월 중복 생성은 차단된다
//   · 확정 뒤 추가 수거는 기존 청구를 유지한 채 「추가 청구」로 분리된다
//   · 잘못 만든 청구는 지우지 않고 「취소」로 남고 감사기록에 남는다
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=... TEST_OFFICE_PW=...
//    node supabase/test/40_billing_confirm.mjs
//
//  · 0017_billing_confirm.sql 을 적용하지 않았으면 그 사실을 먼저 알리고
//    실패합니다 (조용히 통과시키지 않습니다).
//  · 만드는 것에는 모두 '[검증]' 이 붙고 끝나면 지웁니다. 재고도 되돌립니다.
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

const KG = 137
const PLASTIC20 = 2
const EXTRA_KG = 40
const EXPECT_FIRST = KG * 950 + PLASTIC20 * 7000 // 130,150 + 14,000 = 144,150
const EXPECT_EXTRA = EXTRA_KG * 950 // 38,000

let pass = 0
let fail = 0
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)
const won = (n) => `${n.toLocaleString('ko-KR')}원`

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
const numbersIn = (text) =>
  [...text.matchAll(/[\d,]{2,}/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite)

/** 현장 수거 입력 1회 (자재 동시공급 포함) */
async function collect(page, clientName, kg, plastic20) {
  await page.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const sel = page.locator('select').nth(0)
  const opts = await sel.locator('option').allTextContents()
  const target = opts.find((o) => o.includes(clientName))
  if (!target) return { ok: false, why: '거래처가 목록에 없음' }
  await sel.selectOption({ label: target })
  await page.waitForTimeout(1200)
  const veh = page.locator('select').nth(1)
  const vOpts = (await veh.locator('option').allTextContents()).filter((o) => o.trim() && !/선택/.test(o))
  if (!vOpts.length) return { ok: false, why: '차량이 없음' }
  await veh.selectOption({ label: vOpts[0] })
  await page.waitForTimeout(700)
  await page.locator('input[type="number"]').first().fill(String(kg))
  if (plastic20 > 0) {
    const box = page.locator('div').filter({ hasText: /^20L 합성수지/ })
    const input = box.locator('input[type="number"]').last()
    if (await input.count()) await input.fill(String(plastic20))
  }
  await page.waitForTimeout(500)
  const add = page.locator('label:has-text("추가 수거") input[type="checkbox"]').first()
  if (await add.count()) await add.check()
  const save = page.locator('button:has-text("수거 완료 저장")').first()
  if (await save.isDisabled()) return { ok: false, why: '저장 버튼이 잠김' }
  await save.click()
  await page.waitForTimeout(7000)
  const txt = await page.locator('body').innerText()
  return { ok: !/저장하지 못했습니다/.test(txt), why: '' }
}

/** 거래처 상세 → 월 정산·명세서 탭 */
async function openSettlement(page, clientId) {
  await page.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  const tab = page.locator('button', { hasText: '월 정산·명세서' }).first()
  await tab.waitFor({ state: 'attached', timeout: 20000 })
  await tab.click()
  await page.waitForTimeout(2500)
}

async function main() {
  console.log('\n════ 수거 → 정산 → 청구확정 → 미수금 → 입금 → 명세서 ════')

  // ── 0. 0017 적용 여부 ────────────────────────────────────────────────
  section('0. 준비 — 0017 migration 적용 여부')
  const probe = await svc('/payments?select=id,snapshot,canceled_at&limit=1')
  const ready = probe.status === 200
  check(ready, '청구 확정에 필요한 칸이 준비돼 있음 (payments.snapshot / canceled_at)',
    ready ? '' : `★ 0017_billing_confirm.sql 을 먼저 적용해 주세요 — ${JSON.stringify(probe.body).slice(0, 120)}`)
  if (!ready) {
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log('청구 확정 종단: NO (0017 migration 미적용)')
    process.exit(1)
  }

  const name = `${MARK}더원요양병원-${STAMP}`
  const month = new Date().toISOString().slice(0, 7)
  let clientId = null
  const stockBefore = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]

  const pw = (await import(process.env.PLAYWRIGHT_MODULE || 'playwright')).default
  const browser = await pw.chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: process.env.CHROMIUM_TLS12 ? ['--ssl-version-max=tls1.2'] : [],
  })
  const errors = []

  try {
    const made = (await svc('/clients', {
      method: 'POST',
      body: JSON.stringify({
        name, type: '요양병원', address: '경기도 남양주시 검증로 1',
        manager: '박용재 총무부장', phone: '031-000-0000', collection_cycle: '주 3회',
        collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
        note: `${MARK}청구 확정 검증`, contract_start: '2026-02-01', contract_end: '2028-04-30',
        payment_due_day: 20, payment_terms: '익월 20일 현금',
      }),
    })).body?.[0]
    check(!!made, '검증용 거래처를 만듦', made?.name)
    if (!made) return
    clientId = made.id

    // ── 1. 현장이 한 번 입력 ───────────────────────────────────────────
    section('1. 현장(폰)이 수거 + 자재를 한 번 입력')
    const field = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    const r1 = await collect(field, name, KG, PLASTIC20)
    check(r1.ok, '수거 완료 저장', r1.why)

    // ── 2. 사무실이 정산을 보고 청구 확정 ──────────────────────────────
    section('2. 사무실이 월 정산을 보고 「청구 확정」')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await openSettlement(office, clientId)

    const beforeText = await office.locator('body').innerText()
    check(numbersIn(beforeText).includes(EXPECT_FIRST), '정산 금액이 화면에 그대로', won(EXPECT_FIRST))
    const confirmBtn = office.locator('button', { hasText: '청구 확정' }).first()
    check((await confirmBtn.count()) > 0, '「청구 확정」 버튼이 있음')
    check(await confirmBtn.isEnabled(), '아직 청구하지 않았으므로 누를 수 있음')

    let asked = ''
    office.once('dialog', (d) => { asked = d.message(); d.accept() })
    await confirmBtn.click()
    await office.waitForTimeout(5000)
    check(/고정됩니다/.test(asked), '확정 전에 무슨 일이 일어나는지 알려 줌',
      asked.replace(/\n/g, ' ').slice(0, 70))

    const bills1 = (await svc(`/payments?select=*&client_id=eq.${clientId}`)).body ?? []
    check(bills1.length === 1, '청구가 한 건 만들어짐', `${bills1.length}건`)
    const b1 = bills1[0]
    check(b1?.amount === EXPECT_FIRST, '청구 금액이 정산 금액과 같음', won(b1?.amount ?? 0))
    check(b1?.status === '미수금', '상태는 미수금', b1?.status)
    check(!!b1?.snapshot, '확정 당시의 정산·명세서가 함께 저장됨')
    check(b1?.snapshot?.kind === '정기', '「정기」 청구로 기록', b1?.snapshot?.kind)
    check((b1?.snapshot?.scheduleIds ?? []).length === 1, '이 청구가 덮은 수거를 기록')
    check(b1?.snapshot?.invoice?.total === EXPECT_FIRST, '명세서도 같은 금액으로 굳음',
      won(b1?.snapshot?.invoice?.total ?? 0))
    check(b1?.snapshot?.invoice?.dueDate?.endsWith('-20'), '결제기한이 익월 20일로 굳음',
      b1?.snapshot?.invoice?.dueDate ?? '없음')

    const audit1 = (await svc(`/audit_logs?select=action,summary&client_id=eq.${clientId}&action=eq.payment.confirm`)).body ?? []
    check(audit1.length === 1, '청구 확정이 감사기록에 남음', audit1[0]?.summary ?? '없음')

    // ── 3. 중복 차단 ───────────────────────────────────────────────────
    section('3. 같은 달을 또 확정하려 할 때')
    await openSettlement(office, clientId)
    const again = office.locator('button', { hasText: '청구 확정' }).first()
    check(!(await again.isEnabled()), '버튼이 잠겨 있음 (같은 달 중복 청구 차단)')
    const afterText = await office.locator('body').innerText()
    check(/청구를 마쳤습니다/.test(afterText), '이미 청구했다고 알려 줌')

    // ── 4. 미수금 화면 → 입금 처리 ─────────────────────────────────────
    section('4. 미수금 화면에서 입금 처리')
    await office.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    const recv = await office.locator('body').innerText()
    check(recv.includes(name), '미수금 화면에 이 거래처 청구가 보임')
    check(numbersIn(recv).includes(EXPECT_FIRST), '청구 금액이 그대로 보임', won(EXPECT_FIRST))

    //  `div` 로 훑으면 이름이 든 가장 안쪽 줄(업체명 + 상태 배지)이 잡혀서
    //  버튼이 없는 것처럼 보였습니다. 청구 한 건은 카드 한 장이므로 카드로 집습니다.
    const row = office.locator('.card').filter({ hasText: name }).first()
    const payBtn = row.locator('button:has-text("입금완료 처리")').first()
    const hasPay = (await payBtn.count()) > 0
    check(hasPay, '「입금완료 처리」 버튼이 있음')
    if (hasPay) {
      office.once('dialog', (d) => d.accept())
      await payBtn.click()
      await office.waitForTimeout(4000)
      const paid = (await svc(`/payments?select=status,paid_at&id=eq.${b1.id}`)).body?.[0]
      check(paid?.status === '입금완료', '입금완료가 DB 에 반영', paid?.status)
      check(!!paid?.paid_at, '입금 시각이 기록됨')
    }
    const outstandingAfter = (await svc(`/payments?select=amount,status&client_id=eq.${clientId}`)).body ?? []
    check(outstandingAfter.every((p) => p.status !== '미수금'), '남은 미수금이 없음')

    // ── 5. 확정 뒤 추가 수거 → 추가 청구 ───────────────────────────────
    section('5. 확정 뒤에 그 달 수거가 더 들어왔을 때')
    const r2 = await collect(field, name, EXTRA_KG, 0)
    check(r2.ok, '추가 수거를 저장', r2.why)
    await openSettlement(office, clientId)
    const extraText = await office.locator('body').innerText()
    check(numbersIn(extraText).includes(EXPECT_EXTRA), '추가분만 「아직 청구하지 않은 금액」으로 잡힘',
      won(EXPECT_EXTRA))
    const addBtn = office.locator('button', { hasText: '추가 청구 확정' }).first()
    check((await addBtn.count()) > 0, '버튼이 「추가 청구 확정」으로 바뀜')
    office.once('dialog', (d) => d.accept())
    await addBtn.click()
    await office.waitForTimeout(5000)

    const bills2 = (await svc(`/payments?select=*&client_id=eq.${clientId}&order=created_at.asc`)).body ?? []
    check(bills2.length === 2, '청구가 두 건이 됨 (정기 + 추가)', `${bills2.length}건`)
    const first = bills2.find((p) => p.id === b1.id)
    const extra = bills2.find((p) => p.id !== b1.id)
    check(first?.amount === EXPECT_FIRST && first?.status === '입금완료',
      '먼저 확정한 청구는 그대로 (금액·입금상태 유지)', `${won(first?.amount ?? 0)} · ${first?.status}`)
    check(extra?.amount === EXPECT_EXTRA, '추가 청구는 추가분만', won(extra?.amount ?? 0))
    check(extra?.snapshot?.kind === '추가', '「추가」 청구로 기록', extra?.snapshot?.kind)

    // ── 6. 단가를 바꿔도 확정한 청구는 그대로인가 ──────────────────────
    section('6. 확정 뒤에 단가를 바꿨을 때')
    await svc(`/clients?id=eq.${clientId}`, {
      method: 'PATCH', body: JSON.stringify({ pricing: { medical: { sale: 1500, cost: 350 } } }),
    })
    await office.waitForTimeout(800)
    const stillFirst = (await svc(`/payments?select=amount&id=eq.${b1.id}`)).body?.[0]
    check(stillFirst?.amount === EXPECT_FIRST, '이미 확정한 청구 금액은 그대로', won(stillFirst?.amount ?? 0))

    await openSettlement(office, clientId)
    const invBtn = office.locator('button', { hasText: '거래명세서' }).first()
    if ((await invBtn.count()) > 0 && (await invBtn.isEnabled())) {
      await invBtn.click()
      await office.waitForTimeout(2500)
      const invText = await office.locator('body').innerText()
      check(numbersIn(invText).includes(EXPECT_EXTRA) || numbersIn(invText).includes(EXPECT_FIRST),
        '확정한 달의 명세서가 굳은 금액으로 열림',
        `${won(EXPECT_FIRST)} 또는 ${won(EXPECT_EXTRA)}`)
      check(!numbersIn(invText).includes(KG * 1500), '올린 단가로 다시 계산되지 않음',
        `${won(KG * 1500)} 이 없어야 함`)
      await office.locator('button[aria-label="닫기"]').first().click()
      await office.waitForTimeout(1000)
    } else {
      no('거래명세서를 열 수 없었습니다')
    }

    // ── 7. 청구 취소 ───────────────────────────────────────────────────
    section('7. 잘못 만든 청구를 취소')
    await openSettlement(office, clientId)
    const cancelBtn = office.locator('button', { hasText: '취소' }).first()
    check((await cancelBtn.count()) > 0, '「취소」 버튼이 있음')
    office.once('dialog', (d) => d.accept(`${MARK}잘못 만든 청구`))
    await cancelBtn.click()
    await office.waitForTimeout(4500)
    const afterCancel = (await svc(`/payments?select=id,status,canceled_at&client_id=eq.${clientId}`)).body ?? []
    check(afterCancel.length === 2, '취소해도 기록은 지워지지 않음', `${afterCancel.length}건`)
    const canceled = afterCancel.find((p) => p.status === '취소')
    check(!!canceled, '상태가 「취소」로 바뀜')
    check(!!canceled?.canceled_at, '취소 시각이 남음')
    const audit2 = (await svc(`/audit_logs?select=summary&client_id=eq.${clientId}&action=eq.payment.cancel`)).body ?? []
    check(audit2.length === 1, '취소가 감사기록에 남음', audit2[0]?.summary ?? '없음')

    // ── 8. 콘솔 오류 ───────────────────────────────────────────────────
    section('8. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await field.close()
    await office.close()
  } catch (e) {
    no('검사 도중 오류가 났습니다', String(e?.message ?? e).slice(0, 200))
  } finally {
    section('정리')
    if (clientId) {
      for (const p of [
        `/material_transactions?client_id=eq.${clientId}`,
        `/materials?client_id=eq.${clientId}`,
        `/payments?client_id=eq.${clientId}`,
        `/collection_events?client_id=eq.${clientId}`,
        `/schedules?client_id=eq.${clientId}`,
        `/site_notes?client_id=eq.${clientId}`,
        `/audit_logs?client_id=eq.${clientId}`,
      ]) await svc(p, { method: 'DELETE' })
      await svc(`/clients?id=eq.${clientId}`, { method: 'DELETE' })
    }
    if (stockBefore) {
      await svc('/office_stock?id=eq.1', {
        method: 'PATCH',
        body: JSON.stringify({
          corrugated_box: stockBefore.corrugated_box,
          plastic_container: stockBefore.plastic_container,
          bag: stockBefore.bag,
          needle_box: stockBefore.needle_box,
        }),
      })
      const back = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
      check(back.plastic_container === stockBefore.plastic_container, '사무실 재고를 검사 전으로 되돌림',
        `합성수지 ${back.plastic_container}`)
    }
    const left = (await svc(`/clients?select=id&name=like.${encodeURIComponent(MARK + '더원%')}`)).body ?? []
    check(left.length === 0, '검증용 거래처가 남지 않음', left.length ? `${left.length}곳 남음` : '')

    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
    console.log(`청구 확정 종단: ${fail === 0 ? 'YES' : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
