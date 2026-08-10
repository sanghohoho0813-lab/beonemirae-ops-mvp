// ─────────────────────────────────────────────────────────────────────────────
// 한 번 입력한 사실이 월말까지 그대로 가는가 (실제 브라우저 · 실제 DB)
//
//  이사님이 쓰시던 엑셀(202602_더원요양병원_거래처관리)의 일은 이렇습니다.
//
//    거래처 기본정보 → 수거 입력 → 자재 공급/재고 → 월 정산 → 미수금/입금 → 거래명세서
//
//  엑셀에서는 같은 숫자(날짜·수거량·자재수량·금액)를 시트마다 다시 적어야
//  했습니다. 이 시스템의 목적은 그걸 없애는 것입니다 — 현장이 폰으로 한 번
//  넣으면, 사무실은 다시 넣지 않고, 월말에는 이사님이 새로 만들지 않고
//  보기만 하면 되는 구조.
//
//  그래서 이 검사는 '기능이 되는가' 가 아니라 **'다시 입력해야 하는 자리가
//  남아 있는가'** 를 봅니다. 현장이 딱 한 번 넣고, 그 뒤로는 아무 데도
//  숫자를 넣지 않은 채 화면을 따라가며 같은 값이 나오는지 확인합니다.
//
//  따라가는 자리
//   1) 현장(폰)  수거 입력 1회 — 수거량 + 자재 동시공급
//   2) DB        수거 기록 · 자재 기록 · 사무실 재고 차감 · 재고 원장
//   3) 사무실    월 정산 화면 (다시 입력 없이 같은 수량·금액인가)
//   4) 사무실    거래명세서 (같은 금액인가)
//   5) 사무실    미수금 화면 (그 금액이 청구로 이어지는가)  ← 여기가 끊깁니다
//
//  실행
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_FIELD_PW=... TEST_OFFICE_PW=...
//    node supabase/test/39_one_entry_chain.mjs
//
//  · 만드는 것에는 모두 '[검증]' 이 붙고 끝나면 지웁니다.
//  · 사무실 재고는 검사 전 값으로 되돌리고, 되돌아갔는지까지 확인합니다.
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

//  엑셀 더원요양병원 기준 단가(기본값과 같습니다)로 계산되는 값입니다.
const KG = 137                  // 의료폐기물 수거량
const PLASTIC20 = 2             // 20L 합성수지 동시공급 (유상)
const BOX63 = 3                 // 63L 박스 동시공급 (무상)
const EXPECT_WASTE = KG * 950           // 130,150
const EXPECT_SUPPLY = PLASTIC20 * 7000  // 14,000
const EXPECT_REVENUE = EXPECT_WASTE + EXPECT_SUPPLY

let pass = 0
let fail = 0
const gaps = []
const ok = (t, e = '') => { pass++; console.log(`  PASS  ${t}${e ? '  ' + e : ''}`) }
const no = (t, e = '') => { fail++; console.log(`  FAIL  ${t}${e ? '  ' + e : ''}`) }
const check = (c, t, e = '') => (c ? ok(t, e) : no(t, e))
const gap = (t) => { gaps.push(t); console.log(`  단절  ${t}`) }
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`)
const won = (n) => `${n.toLocaleString('ko-KR')}원`

const json = async (r) => {
  const t = await r.text()
  let body = null
  try { body = t ? JSON.parse(t) : null } catch { body = t }
  return { status: r.status, body }
}
//  id 는 uuid 입니다. order=id.desc 로는 최신 행이 오지 않습니다 — 실제로
//  자재 화면에서 새로 넣은 행 대신 엉뚱한 행을 읽고 "3개" 라고 실패했습니다.
//  시간순으로 정렬해야 합니다.
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

/** 화면 글에서 숫자만 뽑습니다 (1,234,000원 → 1234000) */
const numbersIn = (text) =>
  [...text.matchAll(/[\d,]{2,}/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter(Number.isFinite)

async function main() {
  console.log('\n════ 한 번 입력한 사실이 월말까지 그대로 가는가 ════')

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
    // ── 0. 거래처 기본정보 (한 번만 적는 자리) ────────────────────────────
    section('0. 거래처 기본정보 — 계약·결제일·단가를 한 번만 적는가')
    const made = (await svc('/clients', {
      method: 'POST',
      body: JSON.stringify({
        name, type: '요양병원', address: '경기도 남양주시 검증로 1',
        manager: '박용재 총무부장', phone: '031-000-0000',
        collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
        storage_size: '보통', note: `${MARK}엑셀 흐름 검증`,
        contract_start: '2026-02-01', contract_end: '2028-04-30',
        payment_due_day: 20, payment_terms: '익월 20일 현금',
      }),
    })).body?.[0]
    check(!!made, '거래처를 만들었습니다 (계약일·종료일·결제일 포함)', made?.name)
    if (!made) return
    clientId = made.id
    check(made.payment_due_day === 20 && made.contract_end === '2028-04-30',
      '계약·결제 조건이 거래처에 저장됨 — 매달 다시 적지 않습니다',
      `결제일 익월 ${made.payment_due_day}일 · 종료 ${made.contract_end}`)

    // ── 1. 현장이 폰으로 딱 한 번 입력 ────────────────────────────────────
    section('1. 현장(폰)이 한 번 입력 — 수거량 + 자재 동시공급')
    const field = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    field.on('pageerror', (e) => errors.push(`[현장] ${e.message}`))
    await signIn(field, `field@${DOMAIN}`, process.env.TEST_FIELD_PW)
    await field.goto(`${BASE}/collection`, { waitUntil: 'networkidle' })
    await field.waitForTimeout(2500)

    const clientSel = field.locator('select').nth(0)
    const opts = await clientSel.locator('option').allTextContents()
    const target = opts.find((o) => o.includes(name))
    check(!!target, '수거 입력 화면의 거래처 목록에 방금 만든 곳이 바로 보임')
    if (!target) return
    await clientSel.selectOption({ label: target })
    await field.waitForTimeout(1200)

    const vehSel = field.locator('select').nth(1)
    const vOpts = (await vehSel.locator('option').allTextContents()).filter((o) => o.trim() && !/선택/.test(o))
    check(vOpts.length > 0, '배차 차량을 고를 수 있음')
    if (vOpts.length) await vehSel.selectOption({ label: vOpts[0] })
    await field.waitForTimeout(800)

    await field.locator('input[type="number"]').first().fill(String(KG))
    await field.waitForTimeout(500)

    //  자재 동시공급 — 품목 칸을 이름으로 찾아 넣습니다.
    const fillItem = async (label, qty) => {
      const box = field.locator('div').filter({ hasText: new RegExp(`^${label}`) })
      const input = box.locator('input[type="number"]').last()
      if (await input.count()) { await input.fill(String(qty)); await field.waitForTimeout(400); return true }
      return false
    }
    const put20 = await fillItem('20L 합성수지', PLASTIC20)
    const put63 = await fillItem('63L 박스', BOX63)
    check(put20 && put63, '같은 화면에서 자재 공급까지 함께 넣을 수 있음',
      `20L ${PLASTIC20}개 · 63L 박스 ${BOX63}개`)

    const addBox = field.locator('label:has-text("추가 수거") input[type="checkbox"]').first()
    if (await addBox.count()) await addBox.check()

    const save = field.locator('button:has-text("수거 완료 저장")').first()
    check(!(await save.isDisabled()), '저장 버튼이 열려 있음')
    await save.click()
    await field.waitForTimeout(7000)
    const fieldText = await field.locator('body').innerText()
    check(/저장되었습니다|완료/.test(fieldText) && !/저장하지 못했습니다/.test(fieldText),
      '한 번의 저장으로 끝남 (다시 입력한 것 없음)')
    await field.close()

    // ── 2. DB — 그 한 번이 어디까지 남았는가 ──────────────────────────────
    section('2. 그 한 번이 DB 에 남긴 것')
    const sched = (await svc(`/schedules?select=*&client_id=eq.${clientId}&order=created_at.desc&limit=1`)).body?.[0]
    check(sched?.actual_amount === KG, '수거 기록에 수거량이 그대로', `${sched?.actual_amount}kg`)
    check(sched?.status === '완료', '수거 상태가 완료')

    const mat = (await svc(`/materials?select=*&client_id=eq.${clientId}&order=created_at.desc&limit=1`)).body?.[0]
    const items = mat?.items ?? {}
    check(Number(items.plastic20) === PLASTIC20 && Number(items.box63) === BOX63,
      '자재 공급이 같은 입력에서 자동으로 기록됨 — 자재 화면에 다시 넣지 않았습니다',
      `20L ${items.plastic20} · 63L ${items.box63}`)

    const stockNow = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
    check(stockNow.plastic_container === stockBefore.plastic_container - PLASTIC20,
      '사무실 재고(합성수지)가 자동으로 차감됨',
      `${stockBefore.plastic_container} → ${stockNow.plastic_container}`)
    check(stockNow.corrugated_box === stockBefore.corrugated_box - BOX63,
      '사무실 재고(박스)가 자동으로 차감됨',
      `${stockBefore.corrugated_box} → ${stockNow.corrugated_box}`)

    const tx = (await svc(`/material_transactions?select=kind,item,qty&client_id=eq.${clientId}`)).body ?? []
    check(tx.length >= 2 && tx.every((t) => t.kind === '공급' && t.qty < 0),
      '재고 원장에도 출고로 남음 (나중에 왜 줄었는지 알 수 있음)', `${tx.length}건`)

    // ── 3. 사무실 — 월 정산 화면 ──────────────────────────────────────────
    section('3. 사무실 월 정산 — 다시 입력하지 않고 같은 값이 나오는가')
    const office = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office.on('pageerror', (e) => errors.push(`[사무실] ${e.message}`))
    await signIn(office, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    await office.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    await office.locator('button', { hasText: '월 정산·명세서' }).first().click()
    await office.waitForTimeout(2500)
    const settleText = await office.locator('body').innerText()
    const nums = numbersIn(settleText)

    check(nums.includes(KG) || settleText.includes(`${KG}kg`),
      '정산 화면에 현장이 넣은 수거량이 그대로', `${KG}kg`)
    check(nums.includes(EXPECT_WASTE), '의료폐기물 매출이 자동 계산됨',
      `${KG}kg × 950 = ${won(EXPECT_WASTE)}`)
    check(nums.includes(EXPECT_SUPPLY), '자재(유상) 매출도 자동 계산됨',
      `20L ${PLASTIC20}개 × 7,000 = ${won(EXPECT_SUPPLY)}`)
    check(nums.includes(EXPECT_REVENUE), '전체매출이 자동으로 합산됨', won(EXPECT_REVENUE))

    //  사람이 이 화면에서 숫자를 넣어야 하는 칸이 있으면 안 됩니다.
    const typableInSettle = await office.locator(
      'input[type="number"]:visible, input[type="text"]:visible',
    ).count()
    check(typableInSettle === 0, '정산 화면에 사람이 채워야 하는 빈 칸이 없음',
      typableInSettle ? `${typableInSettle}칸` : '')

    // ── 4. 거래명세서 ─────────────────────────────────────────────────────
    section('4. 거래명세서 — 같은 금액이 그대로 나오는가')
    const invBtn = office.locator('button', { hasText: '거래명세서' }).first()
    check((await invBtn.count()) > 0 && (await invBtn.isEnabled()), '거래명세서를 바로 열 수 있음')
    await invBtn.click()
    await office.waitForTimeout(2500)
    const invText = await office.locator('body').innerText()
    const invNums = numbersIn(invText)
    check(invNums.includes(EXPECT_REVENUE), '명세서 합계금액이 정산과 같음', won(EXPECT_REVENUE))
    check(invNums.includes(EXPECT_WASTE), '명세서 의료폐기물 줄이 같음', won(EXPECT_WASTE))
    check(/결제기한/.test(invText) && /20일/.test(invText),
      '결제기한이 거래처 설정에서 자동으로 채워짐')
    await office.locator('button[aria-label="닫기"]').first().click()
    await office.waitForTimeout(1200)

    // ── 5. 미수금 — 정산 결과가 청구로 이어지는가 ─────────────────────────
    section('5. 미수금 — 이 금액이 받을 돈으로 이어지는가')
    const billed = (await svc(`/payments?select=id,amount,billing_month&client_id=eq.${clientId}`)).body ?? []
    if (billed.length > 0) {
      check(billed.some((p) => p.amount === EXPECT_REVENUE),
        '정산 금액이 청구로 자동 등록됨', won(billed[0].amount))
    } else {
      gap('정산이 끝나도 청구(미수금)가 만들어지지 않습니다 — 이 금액을 받을 돈으로 옮기는 길이 화면에 없습니다')
    }

    await office.goto(`${BASE}/receivables`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2500)
    const recvText = await office.locator('body').innerText()
    check(!/오류|잘못/.test(recvText), '미수금 화면이 정상적으로 열림')
    const hasThis = recvText.includes(name)
    if (!hasThis) {
      gap(`미수금 화면에 이 거래처의 ${month} 청구가 없습니다 — 이사님은 여기서 "누가 얼마 안 냈는지"를 볼 수 없습니다`)
    } else {
      ok('미수금 화면에 이 거래처 청구가 보임')
    }

    //  청구를 만들 수 있는 버튼이 화면 어딘가에 있는가 (정산·미수금 양쪽)
    const billBtn = await office.locator(
      'button:has-text("청구"), button:has-text("청구 등록"), button:has-text("청구서")',
    ).count()
    if (billBtn === 0) {
      gap('정산·미수금 어느 화면에도 「청구 등록」 버튼이 없습니다 — 청구는 DB 에 직접 넣어야 합니다')
    } else {
      ok('청구를 만드는 버튼이 있음', `${billBtn}개`)
    }
    await office.close()

    // ── 6. 자재 화면에서 넣어도 같은 결과인가 ─────────────────────────────
    //  같은 사실(자재를 병원에 줬다)인데 어디서 넣느냐에 따라 결과가 달랐습니다.
    //  수거 입력의 동시공급은 재고를 줄이는데, 자재 화면의 공급 등록은 줄이지
    //  않았습니다. 그러면 재고 숫자가 조용히 어긋나고 「자재 소진 위험」도 틀립니다.
    section('6. 자재 화면에서 등록해도 재고가 같이 줄어드는가')
    const office2 = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    office2.on('pageerror', (e) => errors.push(`[자재] ${e.message}`))
    await signIn(office2, `office@${DOMAIN}`, process.env.TEST_OFFICE_PW)
    const beforeMat = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
    await office2.goto(`${BASE}/materials`, { waitUntil: 'networkidle' })
    await office2.waitForTimeout(2500)
    await office2.locator('button:has-text("공급 등록")').first().click()
    await office2.waitForTimeout(1200)
    const dlg = office2.locator('[role="dialog"]')
    await dlg.locator('select').first().selectOption({ label: name })
    const boxInput = dlg.locator('input[type="number"]').first()
    await boxInput.fill('4')
    await office2.waitForTimeout(400)
    await dlg.locator('button:has-text("저장")').first().click()
    await office2.waitForTimeout(4500)

    const matRow = (await svc(`/materials?select=box_count&client_id=eq.${clientId}&order=created_at.desc&limit=1`)).body?.[0]
    check(matRow?.box_count === 4, '자재 화면의 공급이 기록됨', `박스 ${matRow?.box_count}개`)
    const afterMat = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
    check(afterMat.corrugated_box === beforeMat.corrugated_box - 4,
      '자재 화면에서 넣어도 사무실 재고가 줄어듦 (수거 입력과 같은 결과)',
      `${beforeMat.corrugated_box} → ${afterMat.corrugated_box}`)
    const supTx = (await svc(`/material_transactions?select=kind,qty&client_id=eq.${clientId}&kind=eq.공급`)).body ?? []
    check(supTx.length >= 3, '재고 원장에도 남음', `${supTx.length}건`)

    // ── 7. 재고를 다시 채울 수 있는가 ─────────────────────────────────────
    //  재고는 공급으로 줄기만 했고 채우는 길이 화면에 없었습니다. 0 이 되면
    //  서버가 공급을 막아, 현장이 실제로 준 자재를 기록조차 못 하게 됩니다.
    section('7. 사무실 재고를 다시 채울 수 있는가')
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    admin.on('pageerror', (e) => errors.push(`[관리자] ${e.message}`))
    await signIn(admin, `admin@${DOMAIN}`, process.env.TEST_ADMIN_PW)
    await admin.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await admin.waitForTimeout(2500)
    const stockIn = admin.locator('input[aria-label="골판지 전용박스 입고 수량"]').first()
    const canReceive = (await stockIn.count()) > 0
    check(canReceive, '설정 화면에 자재 입고 칸이 있음')
    if (canReceive) {
      const beforeIn = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
      await stockIn.fill('7')
      await admin.locator('input[placeholder*="사유"]').first().fill(`${MARK}입고 검증`)
      await admin.locator('button:has-text("입고 등록")').first().click()
      await admin.waitForTimeout(4000)
      const afterIn = (await svc('/office_stock?select=*&id=eq.1')).body?.[0]
      check(afterIn.corrugated_box === beforeIn.corrugated_box + 7,
        '입고한 만큼 재고가 늘어남', `${beforeIn.corrugated_box} → ${afterIn.corrugated_box}`)
      const inTx = (await svc('/material_transactions?select=kind,qty,memo&kind=eq.입고&order=created_at.desc&limit=1')).body?.[0]
      check(inTx?.qty === 7, '입고도 원장에 남음', `${inTx?.kind} ${inTx?.qty} · ${inTx?.memo ?? ''}`)
    }
    await office2.close()
    await admin.close()

    // ── 8. 콘솔 오류 ──────────────────────────────────────────────────────
    section('8. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
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
    //  검사가 남긴 입고 원장도 지웁니다 (재고는 아래에서 되돌립니다).
    await svc(`/material_transactions?memo=like.${encodeURIComponent(MARK + '%')}`, { method: 'DELETE' })

    //  재고는 검사 때문에 줄어든 것이므로 반드시 되돌립니다.
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
      check(
        back.corrugated_box === stockBefore.corrugated_box &&
          back.plastic_container === stockBefore.plastic_container,
        '사무실 재고를 검사 전으로 되돌림',
        `박스 ${back.corrugated_box} · 합성수지 ${back.plastic_container}`,
      )
    }
    const left = (await svc(`/clients?select=id&name=like.${encodeURIComponent(MARK + '더원%')}`)).body ?? []
    check(left.length === 0, '검증용 거래처가 남지 않음', left.length ? `${left.length}곳 남음` : '')

    await browser.close()
    console.log(`\n════ ${pass} PASS / ${fail} FAIL${gaps.length ? ` / 단절 ${gaps.length}` : ''} ════`)
    if (gaps.length) {
      console.log('\n다시 입력해야 하는 자리 (자동으로 이어지지 않는 곳)')
      gaps.forEach((g, i) => console.log(`  ${i + 1}. ${g}`))
    }
    console.log(`\n한 번 입력 → 월말까지: ${fail === 0 ? (gaps.length ? '끊기는 곳 있음' : 'YES') : 'NO'}`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('\n실행 오류:', e)
  process.exit(1)
})
