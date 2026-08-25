import { chromium, EXEC } from './_pw.mjs'
import { PILOT, skipIfHidden } from './_pilot.mjs'

//  폰 메뉴 — 하단 고정 메뉴와 「더보기」.
//
//   · 하단 네 번째 자리가 「요청」이었습니다. 폰에서 하루에 몇 번씩 여는
//     곳은 거래처입니다 — 전화가 오면 그 병원의 이력·미수금·메모를 봐야
//     하기 때문입니다.
//   · 「더보기」가 자기 목록을 따로 들고 있어 PC 사이드바와 순서·분류가
//     달랐습니다. 같은 목록(lib/nav.ts)을 같은 순서로 읽어야 합니다.
//   · 거래처 화면의 탭 여덟 개가 폰에서 가로 한 줄이라, 처음 보이는 것은
//     「운영조건」뿐이었습니다. 나머지는 있는 줄도 몰랐습니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const mkProfile = (role) => ({
  id: UID, email: `${role}@beonemirae.test`, name: role, role, font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
})
const CID = '00000000-0000-0000-0000-0000000000a1'
const client = {
  id: CID, name: '새로등록병원', type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: {}, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
  flat_fee_when_empty: false,
}

const b = await chromium.launch({ executablePath: EXEC })

async function open(role, width = 390, height = 900) {
  const profile = mkProfile(role)
  const ctx = await b.newContext({ viewport: { width, height } })
  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(37)
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/clients')) return json(single ? client : [client])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

// ── 1. 하단 고정 메뉴 — 요청 대신 거래처 ──────────────────────────────────
{
  const { ctx, p } = await open('admin')
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  const bar = p.locator('nav.fixed.bottom-0')
  const labels = (await bar.locator('button').allTextContents()).map((s) => s.trim())
  ok(labels.join('|') === '홈|오늘|입력|거래처|더보기', '하단 메뉴가 홈·오늘·입력·거래처·더보기',
    labels.join('|'))
  ok(!labels.includes('요청'), '「요청」이 하단에서 빠짐 — 더보기의 병원 서비스로 갔습니다')

  //  실제로 거래처 목록으로 가야 합니다
  await bar.locator('button:has-text("거래처")').click()
  await p.waitForTimeout(1200)
  ok(p.url().endsWith('/clients'), '누르면 거래처 목록으로', p.url())
  await ctx.close()
}

// ── 2. 현장 담당자 하단 메뉴는 그대로 ─────────────────────────────────────
{
  const { ctx, p } = await open('field')
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  const labels = (await p.locator('nav.fixed.bottom-0 button').allTextContents()).map((s) => s.trim())
  ok(labels.join('|') === '오늘|수거 입력|거래처|더보기', '현장 담당자 하단 메뉴는 그대로',
    labels.join('|'))
  await ctx.close()
}

// ── 3. 더보기 — PC 사이드바와 같은 순서·분류 ──────────────────────────────
{
  const { ctx, p } = await open('admin')
  await p.goto(BASE, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)

  //  맨 위 세 가지는 그대로 있어야 합니다
  const sheet = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/사용 방법/.test(sheet), '맨 위에 사용 방법')
  ok(/이 시스템을 만든 이유/.test(sheet), '맨 위에 이 시스템을 만든 이유')
  ok((await p.locator('[data-dev-request-more]').count()) === 1, '개발자에게 요청하기도 그대로')

  //  묶음 제목이 PC 와 같아야 합니다.
  //  「운영 도구」와 「추가 개발 예정」은 한 묶음으로 합쳤습니다 — 둘 다
  //  업무 도구인데 목차만 둘로 갈려 있었습니다.
  for (const t of ['병원 서비스 · 성과', '운영 도구', '관리']) {
    ok(sheet.includes(t), `묶음 제목 「${t}」`)
  }

  //  순서 — 병원 서비스 → 운영 도구 → 추가 개발 예정 → 관리.
  //  본문 글자로 찾으면 「자재 관리」의 '관리' 가 먼저 걸립니다. 화면에
  //  그려진 자리(y 좌표)로 봅니다.
  const topOf = async (sel) =>
    await p.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top + window.scrollY))
  const svcTop = await topOf('[data-more-section="more-service"]')
  const toolTop = await topOf('[data-more-section="more-tools"]')
  const adminTop = await topOf('[data-more-section="more-admin"]')
  ok(svcTop < toolTop, '병원 서비스가 운영 도구보다 위')
  ok(toolTop < adminTop, '운영 도구가 관리보다 위 — PC 사이드바와 같은 차례')

  //  각 묶음의 항목이 PC 목록과 같은 순서인지
  const svc = await p.locator('[data-more-section="more-service"] [data-more-item]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-more-item')))
  //  Pilot 동안 내려 둔 것은 빼고 견줍니다 (0080). 순서 자체는 그대로
  //  지켜져야 하므로 목록을 지우지 않고 **걸러서** 비교합니다.
  //  0083 — 「거래처 인사이트」가 병원 서비스 묶음에 들어왔습니다.
  const wantSvc = ['/revenue', '/requests', '/insight', '/supplies', '/reports', '/performance']
    .filter((r) => !(PILOT.requests && r === '/requests') && !(PILOT.supplies && r === '/supplies'))
  ok(svc.join(',') === wantSvc.join(','),
    `병원 서비스 ${wantSvc.length}개가 PC 와 같은 순서`, `${svc.join(',')} ← 기대 ${wantSvc.join(',')}`)
  //  소모품 주문(/supplies)은 폰에서도 열려야 합니다 — 사무실이 현장에서 씁니다
  if (!skipIfHidden('supplies', '폰 더보기의 「소모품 주문」')) {
    ok(svc.includes('/supplies'), '소모품 주문이 폰 더보기에도 있음')
  }

  const tools = await p.locator('[data-more-section="more-tools"] [data-more-item]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-more-item')))
  //  ⚠ 0076 — **자재 관리와 수거이력이 「핵심 운영」으로 올라갔습니다**
  //    (대표님 지시). 매일 여는 화면인데 도구 열 줄 사이에 묻혀 있었습니다.
  //    목록을 통째로 못 박아 두면 메뉴를 손볼 때마다 검사가 깨지면서 정작
  //    「폰과 PC 가 같은 순서인가」는 안 보게 됩니다. 순서 규칙만 봅니다.
  ok(tools.join(',') === '/plan,/dispatch,/billing,/pricing,/receivables,/bank,/stats,/roadmap',
    '운영 도구가 PC 와 같은 순서', tools.join(','))
  //  ⚠ 같은 메뉴가 두 자리에 있으면 어느 쪽이 진짜인지 헷갈립니다.
  ok(!tools.includes('/materials') && !tools.includes('/history'),
    '**자재 관리·수거이력은 도구에 남아 있지 않음** (핵심으로 올라갔습니다)', tools.join(','))
  //  거래처 점검(/pricing)은 예전 더보기에 아예 없었습니다 — 폰에서는 못 열었습니다
  ok(tools.includes('/pricing'), '거래처 점검이 폰에서도 열림 (예전에는 목록에 없었음)')

  //  운영 도구 열 개는 접혀서 시작합니다 — 펼치면 화면 두 개를 씁니다.
  //  그 아래 「추가 개발 예정 · 관리」가 첫 화면 안에 들어오는 것이 목적입니다.
  ok(!(await p.locator('[data-more-item="/pricing"]').first().isVisible()),
    '운영 도구는 접힌 채로 시작 — 스크롤을 줄입니다')
  ok((await p.locator('[data-more-toggle="more-tools"]').count()) === 1, '펼쳐보기 단추가 있음')
  await p.click('[data-more-toggle="more-tools"]')
  await p.waitForTimeout(400)
  ok(await p.locator('[data-more-item="/pricing"]').first().isVisible(), '누르면 펼쳐짐')

  const admin = await p.locator('[data-more-section="more-admin"] [data-more-item]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-more-item')))
  ok(admin.join(',') === '/users,/dev-requests,/import,/settings,/audit', '관리 5개가 PC 와 같은 순서',
    admin.join(','))

  //  두 칸 격자인지 — 같은 줄에 두 개가 나란히 서야 합니다
  const boxes = await p.locator('[data-more-section="more-tools"] [data-more-item]').evaluateAll(
    (els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().top)))
  ok(boxes.length === 2 && boxes[0] === boxes[1], '두 칸 격자 — 첫 두 개가 같은 줄', String(boxes))

  //  핵심 운영은 하단 고정 메뉴가 맡으므로 더보기에 또 넣지 않습니다
  ok((await p.locator('[data-more-item="/collection"]').count()) === 0,
    '수거 입력은 더보기에 없음 — 하단에 있습니다')

  //  눌러서 실제로 가는지
  await p.locator('[data-more-item="/pricing"]').click()
  await p.waitForTimeout(1400)
  ok(p.url().endsWith('/pricing'), '더보기에서 거래처 점검으로 이동', p.url())
  await ctx.close()
}

// ── 4. 현장 담당자에게는 못 여는 메뉴를 안 보여 준다 (회귀) ───────────────
{
  const { ctx, p } = await open('field')
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(1000)
  ok((await p.locator('[data-more-item="/receivables"]').count()) === 0, '현장 담당자에게 미수금이 안 보임')
  ok((await p.locator('[data-more-item="/billing"]').count()) === 0, '월말 청구도 안 보임')
  ok((await p.locator('[data-more-section="more-admin"]').count()) === 0, '관리 묶음이 통째로 없음')
  const sheet = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ')
  ok(/글자 크기/.test(sheet), '설정에 못 들어가는 분에게는 글자 크기 조절기를 그대로 둠')
  await ctx.close()
}

// ── 5. 거래처 화면 탭 — 폰에서 여덟 개가 다 보인다 ────────────────────────
{
  const { ctx, p } = await open('admin')
  await p.goto(`${BASE}/clients/${CID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  const tabs = await p.locator('[data-client-tab]').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute('data-client-tab'), r: e.getBoundingClientRect() })))
  //  Pilot 동안 「요청·알림」 탭은 내려가 있습니다 (0080).
  const wantTabs = PILOT.requests ? 7 : 8
  ok(tabs.length === wantTabs, `탭 ${wantTabs}개`, String(tabs.length))
  //  옆으로 밀지 않아도 전부 화면 안에 있어야 합니다
  const outside = tabs.filter((t) => t.r.right > 390 + 1 || t.r.left < -1)
  ok(outside.length === 0, '옆으로 밀지 않아도 전부 화면 안 — 예전에는 첫 탭만 보였습니다',
    outside.map((t) => t.id).join(','))
  ok(tabs.some((t) => t.id === 'billing'), '결제·미수금 탭이 화면에 있음')

  //  눌렀을 때 실제로 내용이 그려지는지 (새로 등록한 거래처라 값은 비어 있지만
  //  「없습니다」라고 말해 줘야 합니다 — 빈 화면이 아니라)
  for (const [id, must] of [
    //  소모품 판매도 정산 대상이 된 뒤로 문구에 「소모품」이 함께 들어갑니다.
    ['settlement', '이 달에는 집계할 수거·공급·소모품이 없습니다'],
    ['report', '운영 리포트'],
    ['billing', '청구 내역이 없습니다'],
  ]) {
    await p.locator(`[data-client-tab="${id}"]`).click()
    await p.waitForTimeout(700)
    const body = ((await p.textContent('main')) ?? '').replace(/\s+/g, ' ')
    ok(body.includes(must), `[${id}] 탭이 내용을 그림 — 「${must}」`)
  }
  await ctx.close()
}

// ── 6. 넓은 화면에서는 예전처럼 한 줄 ─────────────────────────────────────
{
  const { ctx, p } = await open('admin', 1500, 1000)
  await p.goto(`${BASE}/clients/${CID}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  //  목차 글자를 20% 키운 뒤(대표님 요청) 1440~1500px 에서는 8개가 한 줄에
  //  안 들어갑니다 — 실측 1,029px 대 가용 968px. 두 줄로 접히는 것은
  //  받아들이되, **옆으로 밀려 안 보이는 탭은 없어야** 합니다. 그게 실제로
  //  못 쓰게 되는 경우입니다.
  const tops = await p.locator('[data-client-tab]').evaluateAll((els) =>
    [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))])
  ok(tops.length <= 2, 'PC 에서 탭이 두 줄 안', String(tops.length))
  const overflow = await p.locator('[data-client-tabs]').evaluate((e) => ({
    scroll: Math.round(e.scrollWidth), client: Math.round(e.clientWidth),
  }))
  ok(overflow.scroll <= overflow.client + 1, '옆으로 밀려 안 보이는 탭이 없음',
    `${overflow.scroll} / ${overflow.client}`)
  //  넓은 화면에서는 한 줄로 돌아옵니다
  await p.setViewportSize({ width: 1920, height: 1000 })
  await p.waitForTimeout(400)
  const wide = await p.locator('[data-client-tab]').evaluateAll((els) =>
    [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))])
  ok(wide.length === 1, '1920px 에서는 한 줄', String(wide.length))
  await ctx.close()
}

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
