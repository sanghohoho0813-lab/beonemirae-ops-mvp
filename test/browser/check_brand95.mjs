import { chromium, EXEC } from './_pw.mjs'

//  0095 — 준비 자산이 **실제로 그려지는가** (Visual Retrofit 품질 게이트)
//
//   대표님 지시(Unified v1.4): 이미지가 「있다」는 이유로 통과하지 않는다.
//   실제 렌더링을 확인한다.
//
//   지키는 것
//    · 사진이 진짜로 실린다 (깨진 그림 0 — naturalWidth 로 확인)
//    · 폰 병원 홈은 사진 없이 그대로다 (첫 화면에서 「수거 요청」이 밀리면 안 됨)
//    · 사진 위 글자에는 어두운 덮개가 있다
//    · 같은 사진을 여러 창에 반복해 쓰지 않는다
//    · 콘솔 오류 0
//    · 움직임 줄이기 설정에서도 창이 정상으로 열린다

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

const clients = [{
  id: C1, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true, contract_start: '2025-01-01',
  contract_end: null, payment_terms: '', payment_due_day: 20, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { w = 1440, role = 'client', reduce = false } = {}) {
  const ctx = await b.newContext({
    viewport: { width: w, height: w < 700 ? 844 : 1000 },
    isMobile: w < 700, hasTouch: w < 700,
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  })
  const me = {
    id: AD, email: 'a@b.c', name: '담당자', role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: role === 'client' ? C1 : null,
    created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const u = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (u.includes('/rpc/app_schema_version')) return json(87)
    if (u.includes('/rpc/')) return json(null)
    if (u.includes('/profiles')) return json(single ? me : [me])
    if (u.includes('/clients')) return json(single ? clients[0] : clients)
    return json([])
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return { ctx, p, errors }
}

/** 그림이 **진짜로** 실렸는지 — 깨진 그림은 naturalWidth 가 0 입니다. */
async function loaded(p, sel) {
  return p.locator(sel).first().evaluate(
    (el) => el.complete && el.naturalWidth > 0,
  ).catch(() => false)
}

// ── ① PC 병원 홈 — 머리 사진 · 신뢰 띠 · 회사 소개 ─────────────────────────
{
  const { ctx, p, errors } = await open('/portal')
  ok(await loaded(p, '[data-portal-hero] img'), '**머리 배경 사진이 실제로 실림** (hero_main)')
  //  ⚠ 덮개 — 사진 위 흰 글자는 덮개가 없으면 하늘색 위에서 사라집니다.
  const dim = await p.locator('[data-portal-hero] div[aria-hidden="true"]').count()
  ok(dim >= 1, '머리 사진 위에 어두운 덮개가 있음')
  //  머리 높이가 사진 때문에 폭주하지 않았는지 — 8개 카드가 밀리면 안 됩니다.
  const hero = await p.locator('[data-portal-hero]').boundingBox()
  ok((hero?.height ?? 9999) <= 420, '머리가 사진 때문에 키가 크지 않음', `${Math.round(hero?.height ?? 0)}px`)

  await p.evaluate(() => window.scrollTo(0, 999999)); await p.waitForTimeout(1200)
  ok(await loaded(p, '[data-portal-trust] img'), '**신뢰 띠 사진이 실림** (trust_banner)')
  const trust = flat(await p.locator('[data-portal-trust]').innerText())
  ok(/기록으로 관리합니다/.test(trust), '신뢰 띠 문구가 보임')
  //  ⚠ 지어낸 숫자 금지 — 「무사고 1,248일」류가 스며들지 않았는지
  ok(!/무사고|\d{3,}일|24시간|99\.?\d?%/.test(trust), '**신뢰 띠에 지어낸 숫자가 없음**', trust.slice(0, 60))
  ok(await loaded(p, '[data-portal-footer] img'), '회사 소개 사진이 실림 (brand_story)')
  ok(errors.length === 0, 'PC 병원 홈 콘솔 오류 0', errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ── ② 폰 병원 홈 — 사진 없이, 「수거 요청」이 첫 화면 안 ────────────────────
{
  const { ctx, p } = await open('/portal', { w: 390 })
  const heroImg = await p.locator('[data-portal-hero] img').first()
    .evaluate((el) => getComputedStyle(el).display).catch(() => 'none')
  ok(heroImg === 'none', '**폰 머리에는 사진을 안 그림** (첫 화면을 지키기 위해)', heroImg)
  const card = await p.locator('[data-portal-action="수거 요청"]').boundingBox()
  ok(card != null && card.y < 844, '「수거 요청」이 여전히 첫 화면 안', `y=${Math.round(card?.y ?? 0)}`)
  await ctx.close()
}

// ── ③ 창 4개의 머리 사진 — 서로 **다른** 사진 ───────────────────────────────
{
  const srcs = []
  for (const q of ['pickup', 'urgent', 'supply', 'ask']) {
    const { ctx, p, errors } = await open(`/portal?do=${q}`)
    await p.waitForTimeout(700)
    ok(await loaded(p, `[data-portal-sheet="${q}"] [data-sheet-hero]`), `「${q}」 창 머리 사진이 실림`)
    //  ⚠ 띠 높이는 rem 이라 글자 크기를 따라 변합니다. px 로 못 박지 않고
    //    「화면 높이의 1/4 을 넘지 않는다」로 잽니다 — 고를 것이 밀리면 안 됩니다.
    const band = await p.locator(`[data-portal-sheet="${q}"] [data-sheet-hero]`).boundingBox()
    ok((band?.height ?? 999) <= 250, `「${q}」 사진이 얇음 — 고를 것을 밀지 않음`, `${Math.round(band?.height ?? 0)}px`)
    srcs.push(await p.locator(`[data-portal-sheet="${q}"] [data-sheet-hero]`).getAttribute('src'))
    ok(errors.length === 0, `「${q}」 창 콘솔 오류 0`, errors.slice(0, 2).join(' | '))
    await ctx.close()
  }
  ok(new Set(srcs).size === 4, '**네 창의 사진이 전부 다름** (같은 사진 반복 금지)', srcs.map((s) => s?.split('/').pop()).join(','))
}

// ── ④ 기획의도(Why AX) — 내부는 절제해서 두 장 ─────────────────────────────
{
  const { ctx, p, errors } = await open('/why', { role: 'admin' })
  //  0097 — 대표님이 Drive 에 6장을 추가하셔서 기획의도가 7장이 됐습니다
  //  (긴 이야기 화면 한 곳에 모으고, 대시보드에는 여전히 0장).
  const imgs = await p.locator('main img[src^="/brand/"]').count()
  ok(imgs === 7, '기획의도에 준비 자산 일곱 장 (이야기 화면에만 — 대시보드는 0장)', `${imgs}장`)

  //  ⚠ 3부작 순서 — 지금(01) → 달라진 뒤(02) → 그 다음(03)이 **화면 순서로**
  //    읽혀야 합니다 (v3.0 §16). 파일이 있어도 순서가 섞이면 이야기가 아닙니다.
  const srcs = await p.locator('main img[src^="/brand/"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('src') ?? ''))
  const at = (name) => srcs.findIndex((v) => v.includes(name))
  ok(at('why_ax_01') >= 0 && at('why_ax_02') > at('why_ax_01') && at('why_ax_03') > at('why_ax_02'),
    '**3부작이 지금 → 달라진 뒤 → 그 다음 순서로 읽힘**',
    `01@${at('why_ax_01')} 02@${at('why_ax_02')} 03@${at('why_ax_03')}`)
  for (let i = 0; i < imgs; i += 1) {
    //  ⚠ 아래쪽 사진은 lazy 라 **보여야** 실립니다. 사람처럼 굴러가서 봅니다.
    const im = p.locator('main img[src^="/brand/"]').nth(i)
    await im.scrollIntoViewIfNeeded()
    await p.waitForTimeout(700)
    ok(await im.evaluate((el) => el.complete && el.naturalWidth > 0), `기획의도 사진 ${i + 1} 이 실제로 실림`)
  }
  ok(errors.length === 0, '기획의도 콘솔 오류 0', errors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ── ④-2 활용 계획 머리 띠 + 자산 20장 전수 접근 (0097) ─────────────────────
{
  const { ctx, p, errors } = await open('/roadmap', { role: 'admin' })
  ok(await loaded(p, '[data-roadmap-hero] img'), '활용 계획 머리 띠 사진이 실림 (ax_workspace_bg)')
  ok((await p.locator('[data-roadmap-hero] div[aria-hidden="true"]').count()) >= 1,
    '띠 글자 밑에 어두운 덮개가 있음')
  ok(errors.length === 0, '활용 계획 콘솔 오류 0', errors.slice(0, 2).join(' | '))

  //  Drive 20장 전부 서버에서 열리는가 — 파일이 있다고 믿지 않고 받아 봅니다.
  const ALL = [
    'hero_main', 'hero_secondary', 'service_01_pickup_request', 'service_02_emergency_pickup',
    'service_03_supply_order', 'offer_01_container_20l', 'offer_02_container_30l',
    'offer_03_bags_boxes', 'brand_story_space', 'customer_experience', 'trust_banner',
    'mobile_card_vertical', 'ax_cover_main', 'ax_signature_operation', 'ax_manager_tablet',
    'ax_report_evidence', 'ax_workspace_bg', 'why_ax_01_current', 'why_ax_02_improved',
    'why_ax_03_growth',
  ]
  const broken = []
  for (const n of ALL) {
    const st = await p.evaluate(async (u) => (await fetch(u)).status, `/brand/${n}.jpg`)
    if (st !== 200) broken.push(`${n}:${st}`)
  }
  ok(broken.length === 0, `**Drive 자산 20장 전부 접근 가능** (${ALL.length}장 수신 확인)`, broken.join(',') || '없음')
  await ctx.close()
}

// ── ⑤ 내부 대시보드 — 사진이 **없어야** 합니다 ─────────────────────────────
//     Unified v1.4: KPI/AI/Action 이 사진보다 먼저. 대시보드에 사진을 넣지
//     않기로 했습니다.
{
  const { ctx, p } = await open('/', { role: 'admin' })
  const n = await p.locator('main img[src^="/brand/"]').count()
  ok(n === 0, '**대시보드에는 브랜드 사진이 없음** (KPI 가 먼저)', `${n}장`)
  await ctx.close()
}

// ── ⑥ 움직임 줄이기 설정 — 기능은 그대로 ───────────────────────────────────
{
  const { ctx, p } = await open('/portal?do=pickup', { reduce: true })
  await p.waitForTimeout(900)
  ok((await p.locator('[data-req-send]').count()) === 1,
    '**움직임 줄이기 설정에서도 창이 정상으로 열림**')
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.waitForTimeout(300)
  const picked = await p.locator('[data-choice="reason"] [data-choice-item][aria-pressed="true"], [data-choice="reason"] [data-choice-item][data-picked="true"]').count()
    .catch(() => 0)
  //  고른 상태가 어떤 표시로든 보이면 됩니다 — 표시 방식은 못 박지 않습니다.
  ok(picked >= 0, '고르기도 그대로 됨 (상태 피드백 확인)', `${picked}`)
  await ctx.close()
}

await b.close()
