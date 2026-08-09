// ─────────────────────────────────────────────────────────────────────────────
// 월 정산 · 거래명세서 화면 종단 검증 (실제 브라우저 · 실제 DB)
//
//  07·12 는 계산 함수를 봅니다. 계산이 맞아도 화면이 다른 숫자를 보여 주면
//  거래처에 나가는 것은 화면 쪽입니다. 그래서 화면에 찍힌 숫자를 그대로 읽어
//  같은 데이터로 계산한 값과 맞춰 봅니다.
//
//  밟는 순서
//   1) 거래처 상세 → 월 정산 탭에서 매출·원가·영업이익을 읽는다
//   2) 화면 숫자와 계산 결과가 같은지 본다
//   3) 단가를 바꾸면 화면이 따라오는지 본다 (끝나면 되돌립니다)
//   4) 거래명세서를 열어 합계와 결제기한을 확인한다
//   5) 병원 계정은 이 화면에 못 들어오는지 본다
//
//  실행 (Node 22 이상 — billing.ts 를 그대로 읽습니다)
//    npm run build && npx vite preview --port 4173
//    export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
//    export TEST_OFFICE_PW=... TEST_CLIENT_PW=...
//    node --experimental-strip-types supabase/test/18_settlement_screen.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { settlementFor, invoiceFor } from '../../src/lib/billing.ts'

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
const won = (n) => n.toLocaleString('ko-KR')
/** 화면 글에서 쉼표·공백을 지워 숫자 비교를 쉽게 합니다 */
const flat = (s) => s.replace(/[,\s]/g, '')

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

const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
const toClient = (r) => ({
  id: r.id, name: r.name, type: r.type, manager: r.manager ?? '',
  pricing: r.pricing ?? undefined, paymentDueDay: r.payment_due_day ?? undefined,
  paymentTerms: r.payment_terms ?? '',
})
const toSchedule = (r) => ({
  id: r.id, date: r.date, clientId: r.client_id, wasteType: r.waste_type,
  status: r.status, actualAmount: r.actual_amount ?? null,
})
const toMaterial = (r) => ({
  id: r.id, date: r.date, clientId: r.client_id,
  boxCount: r.box_count ?? 0, vinylCount: r.vinyl_count ?? 0,
  needleBoxCount: r.needle_box_count ?? 0,
  isAdditionalRequest: r.is_additional_request ?? false,
  items: r.items ?? undefined,
})
async function loadFor(clientId, month) {
  const [c, s, m] = await Promise.all([
    svc(`/clients?select=*&id=eq.${clientId}`),
    svc(`/schedules?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
    svc(`/materials?select=*&client_id=eq.${clientId}&date=gte.${month}-01&date=lte.${lastDay(month)}`),
  ])
  return {
    clients: (c.body || []).map(toClient),
    schedules: (s.body || []).map(toSchedule),
    materials: (m.body || []).map(toMaterial),
  }
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
  console.log('\n════ 월 정산 · 거래명세서 화면 ════')

  // 수거 기록이 있는 검증 거래처를 고릅니다 (숫자가 0이면 비교가 무의미합니다)
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
  const clients = (await svc(`/clients?select=*&name=like.${encodeURIComponent(MARK + '*')}&order=name`)).body ?? []
  let client = null
  let calc = null
  for (const c of clients) {
    const s = settlementFor(await loadFor(c.id, month), c.id, month)
    if (s.revenue > 0) { client = c; calc = s; break }
  }
  if (!client) { console.error('이번 달 수거 기록이 있는 검증 거래처가 없습니다.'); process.exit(1) }
  console.log(`대상 ${client.name} · ${month}`)

  const pricing0 = client.pricing ?? null
  const restorePricing = () => svc(`/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ pricing: pricing0 }) })

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
    await office.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await office.waitForTimeout(2000)

    // ── 1. 월 정산 탭 ─────────────────────────────────────────────────────
    section('1. 월 정산 탭의 숫자')
    const tab = office.locator('button:has-text("월 정산")').first()
    check(await tab.count() > 0, '월 정산 탭이 있음')
    await tab.click()
    await office.waitForTimeout(1800)

    const text = await office.locator('body').innerText()
    // 상단 KPI 는 '25만원' 처럼 줄여서 보여 줍니다. 정확한 값은 그 아래
    // 세부 줄(수거 매출 · 물품 매출 · 처리비 · 자재비)에 있으므로 그쪽과 맞춥니다.
    check(flat(text).includes(flat(won(calc.wasteRevenue))), '수거 매출이 계산과 일치', `${won(calc.wasteRevenue)}원`)
    check(calc.supplyRevenue === 0 || flat(text).includes(flat(won(calc.supplyRevenue))),
      '물품 매출이 계산과 일치', `${won(calc.supplyRevenue)}원`)
    check(flat(text).includes(flat(won(calc.disposalCost))), '처리비가 계산과 일치', `${won(calc.disposalCost)}원`)
    check(flat(text).includes(flat(won(calc.materialCost))), '자재비가 계산과 일치', `${won(calc.materialCost)}원`)
    if (calc.margin != null) {
      const pct = Math.round(calc.margin * 100)
      check(new RegExp(`${pct}\\s*%`).test(text), '영업이익률이 계산과 일치', `${pct}%`)
    }

    // 품목별 내역의 줄이 계산과 맞는가
    for (const line of [...calc.wasteLines, ...calc.supplyLines].slice(0, 4)) {
      const shown = flat(text).includes(flat(won(line.qty))) &&
        (line.revenue === 0 || flat(text).includes(flat(won(line.revenue))))
      check(shown, `품목 「${line.label}」 수량·매출이 화면과 일치`,
        `${won(line.qty)}${line.unit} · ${won(line.revenue)}원`)
    }

    // 유상/무상이 화면에서 구분되는가
    check(/무상/.test(text), '무상 품목이 화면에 「무상」으로 표시됨')
    if (calc.hasLegacySupply) {
      check(/규격이 기록되지 않은|규격 미상|규격미상/.test(text),
        '규격 미상 공급이 섞였다는 안내가 있음')
    }

    // ── 2. 단가를 바꾸면 화면이 따라오는가 ───────────────────────────────
    section('2. 단가를 바꿨을 때')
    const wasteKey = (await svc(`/schedules?select=waste_type&client_id=eq.${client.id}&status=eq.${encodeURIComponent('완료')}&limit=1`)).body?.[0]?.waste_type === '일회용기저귀' ? 'diaper' : 'medical'
    const bumped = { ...(pricing0 ?? {}), [wasteKey]: { sale: 1500, cost: 400 } }
    await svc(`/clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ pricing: bumped }) })
    const recalc = settlementFor(await loadFor(client.id, month), client.id, month)

    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(1500)
    const tab2 = office.locator('button:has-text("월 정산")').first()
    if (await tab2.count()) { await tab2.click(); await office.waitForTimeout(1800) }
    const text2 = await office.locator('body').innerText()
    check(flat(text2).includes(flat(won(recalc.wasteRevenue))),
      '바뀐 단가가 화면 수거 매출에 반영',
      `${won(calc.wasteRevenue)}원 → ${won(recalc.wasteRevenue)}원`)
    check(recalc.wasteRevenue === calc.wasteRevenue || !flat(text2).includes(flat(won(calc.wasteRevenue))),
      '옛 금액이 화면에 남아 있지 않음')

    await restorePricing()

    // ── 3. 거래명세서 ─────────────────────────────────────────────────────
    section('3. 거래명세서')
    await office.reload({ waitUntil: 'networkidle' })
    await office.waitForTimeout(1500)
    const tab3 = office.locator('button:has-text("월 정산")').first()
    if (await tab3.count()) { await tab3.click(); await office.waitForTimeout(1500) }

    const invBtn = office.locator('button:has-text("거래명세서")').first()
    check(await invBtn.count() > 0, '거래명세서를 여는 버튼이 있음')
    await invBtn.click()
    // 모달이 그려질 때까지 기다립니다 (바로 읽으면 아직 없습니다)
    await office.locator('text=합계금액').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    await office.waitForTimeout(800)

    const inv = invoiceFor(await loadFor(client.id, month), client.id, month)
    const invText = await office.locator('body').innerText()
    check(flat(invText).includes(flat(won(inv.total))), '명세서 합계가 계산과 일치', `${won(inv.total)}원`)
    check(invText.includes(client.name), '거래처 이름이 명세서에 있음')
    const period = [inv.from, inv.to, inv.from.replace(/-/g, '.'), inv.from.replace(/-/g, '/'),
      `${Number(month.slice(5))}월`, month].some((x) => invText.includes(x))
    check(period, '거래기간이 표시됨', `${inv.from} ~ ${inv.to}`)
    check(/인쇄|PDF/.test(invText), '인쇄·PDF 저장 버튼이 있음')
    if (inv.freeSupplies.length) {
      const anyFree = inv.freeSupplies.some((f) => invText.includes(f.label))
      check(anyFree, '무상 공급이 참고 표기로 보임',
        inv.freeSupplies.map((f) => `${f.label} ${f.qty}${f.unit}`).join(' · '))
    }
    const billedLabels = [...inv.medicalLines, ...inv.diaperLines].map((l) => l.label)
    const freeLabels = inv.freeSupplies.map((f) => f.label)
    check(freeLabels.every((f) => !billedLabels.includes(f)), '무상 품목이 청구 줄에 없음')

    const closeBtn = office.locator('button[aria-label="닫기"]').first()
    if (await closeBtn.count()) { await closeBtn.click(); await office.waitForTimeout(600) }

    // ── 4. 병원 계정은 못 들어온다 ───────────────────────────────────────
    section('4. 병원 계정 차단')
    const hospital = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    })).newPage()
    hospital.on('pageerror', (e) => errors.push(`[병원] ${e.message}`))
    await signIn(hospital, `client@${DOMAIN}`, process.env.TEST_CLIENT_PW)
    await hospital.goto(`${BASE}/clients/${client.id}`, { waitUntil: 'networkidle' })
    await hospital.waitForTimeout(1200)
    const hText = await hospital.locator('body').innerText()
    check(hText.includes('접근 권한이 없는 화면입니다') || new URL(hospital.url()).pathname.startsWith('/portal'),
      '병원 계정은 거래처 상세에 못 들어옴')
    check(!flat(hText).includes(flat(won(calc.cost))), '원가·영업이익이 병원에게 안 보임')
    await hospital.close()

    // ── 5. 화면 오류 ──────────────────────────────────────────────────────
    section('5. 콘솔 오류')
    const real = errors.filter((e) => !/favicon|jsdelivr|pretendard|Failed to load resource|net::ERR_/.test(e))
    check(real.length === 0, '자바스크립트 오류 없음', real.slice(0, 3).join(' | '))
    await office.close()
  } finally {
    section('정리')
    await restorePricing()
    const c = (await svc(`/clients?select=pricing&id=eq.${client.id}`)).body?.[0]
    check(JSON.stringify(c?.pricing ?? null) === JSON.stringify(pricing0), '거래처 단가 원복')
    await browser.close()
  }

  console.log(`\n════ ${pass} PASS / ${fail} FAIL ════`)
  console.log(`정산·거래명세서 화면: ${fail === 0 ? 'YES' : 'NO'}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
