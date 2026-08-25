import { chromium, EXEC } from './_pw.mjs'

//  거래처 상세 배치 (대표님 요청).
//
//   ① 「다음 행동 AI 추천」이 **거래처 정보 카드 안**에 들어간다
//   ② 「인증·실사 관련」은 숨긴다 (시연용 체크리스트라 자리만 차지했음)
//   ③ 탭 목차(운영조건~결제·미수금)가 **AI 추천이 있던 자리**로 올라온다
//   ④ 모든 거래처에 똑같이 — 새로 등록한 곳도
//
//   ④ 가 중요합니다. 「이 거래처만 그렇다」면 고친 것이 아닙니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ')
const seen = (p, sel, ms = 20000) => p.waitForSelector(sel, { timeout: ms }).then(() => true, () => false)

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const back = (n) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

//  세 곳 — 기록이 많은 곳 · 갓 등록해 아무것도 없는 곳 · 그 사이
const CA = '00000000-0000-0000-0000-0000000000c1'
const CNEW = '00000000-0000-0000-0000-0000000000c9'
const V1 = '00000000-0000-0000-0000-0000000000v1'
const mkClient = (id, name, over = {}) => ({
  id, name, type: '병원', address: '경기도 남양주시 오남읍 1', manager: '홍길동', phone: '031-000-0000',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: { plastic20: { sale: 9000, cost: 5200 } }, biz_no: '2568802759', vat_mode: 'exclusive',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})
//  CNEW 는 **오늘 막 등록한 거래처**입니다 — 수거도 청구도 없습니다.
const clients = [mkClient(CA, '가나요양병원'), mkClient(CNEW, '새로등록한의원', { pricing: {} })]
const vehicles = [{ id: V1, name: '5506호', waste_type: '의료폐기물', tonnage: 1,
  nominal_capacity: 1000, expected_capacity: 660, driver: '오대성', active: true }]
const scheds = [1, 8, 15, 22].map((d, i) => ({
  id: `s${i}`, date: back(d), client_id: CA, waste_type: '의료폐기물', vehicle_id: V1,
  scheduled_time: '09:00', status: '완료', expected_amount: 100, actual_amount: 120 + i,
  actual_time: '10:20', driver_name: '김준기', completed_at: `${back(d)}T10:30:00Z`,
  memo: '', origin: 'field', is_additional: false, demo_session_id: null, plan_batch: null,
  created_at: `${back(d)}T00:00:00Z`, updated_at: `${back(d)}T00:00:00Z`,
}))

const b = await chromium.launch({ executablePath: EXEC })

function wire(ctx, { role = 'admin' } = {}) {
  const pf = {
    id: UID, email: 'a@b.c', name: '송명근', role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/app_health_check')) return json({ version: 64, ok: true, missing: [], checkedAt: '' })
    if (url.includes('/rpc/recent_app_errors')) return json({ days: 7, total: 0, groups: [], checkedAt: '' })
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/vehicles')) return json(vehicles)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
}
async function open(ctx, clientId) {
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/clients/${clientId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2600)
  return p
}
const top = (p, sel) => p.locator(sel).first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY)

// ── 모든 거래처에 똑같이 ────────────────────────────────────────────────────
//   기록이 쌓인 곳과 **오늘 막 등록한 곳** 둘 다 봅니다.
for (const [cid, who] of [[CA, '기록 있는 거래처'], [CNEW, '새로 등록한 거래처']]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 } })
  wire(ctx)
  const p = await open(ctx, cid)

  // ② 인증·실사는 숨겨져 있어야 합니다
  const body = flat(await p.textContent('body'))
  ok(!/인증·실사 관련/.test(body), `${who} — **인증·실사 관련이 숨겨짐**`)
  ok(!/필요 자료 체크리스트/.test(body), `${who} — 체크리스트도 안 보임`)

  // ③ 탭 목차가 위로
  ok(await seen(p, '[data-client-tabs]'), `${who} — 탭 목차가 있음`)
  const yTabs = await top(p, '[data-client-tabs]')
  const yMetrics = await top(p, '[data-key-metrics="pc"]')
  ok(yTabs > yMetrics, `${who} — 탭이 핵심 지표 아래`, `지표 ${Math.round(yMetrics)} · 탭 ${Math.round(yTabs)}`)

  //  ① 추천이 있으면 **카드 안**에 있어야 합니다.
  const hasInsight = (await p.locator('[data-client-insight-grid]').count()) > 0
  if (hasInsight) {
    //  「같은 카드 안인가」를 봅니다. 부모가 곧 카드라고 단정하면 안 됩니다 —
    //  카드 안을 좌우로 가르는 순간 부모가 「왼쪽 칸」이 되어, 뜻은 그대로인데
    //  검사만 깨집니다(실제로 그렇게 깨졌습니다). 카드를 직접 찾아 비교합니다.
    const inside = await p.evaluate(() => {
      const grid = document.querySelector('[data-client-insight-grid]')
      const metrics = document.querySelector('[data-key-metrics="pc"]')
      if (!grid || !metrics) return false
      const card = metrics.closest('.card')
      return !!card && card.contains(grid)
    })
    ok(inside, `${who} — **추천이 거래처 정보 카드 안에 들어감**`)
    //  그리고 탭보다 위에 있어야 합니다.
    const yGrid = await top(p, '[data-client-insight-grid]')
    ok(yGrid < yTabs, `${who} — 추천이 탭보다 위`, `추천 ${Math.round(yGrid)} · 탭 ${Math.round(yTabs)}`)

    //  ── 좌우 반반 (대표님 요청) ──────────────────────────────────────────
    //   왼쪽에 거래처 정보와 핵심 지표, 오른쪽에 추천. 위아래로 깔리면
    //   탭이 그만큼 아래로 밀립니다 — 그게 이 배치를 만든 이유입니다.
    const box = await p.evaluate(() => {
      const g = document.querySelector('[data-client-insight-grid]')
      const m = document.querySelector('[data-key-metrics="pc"]')
      const s = document.querySelector('[data-client-split]')
      if (!g || !m || !s) return null
      const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width } }
      return { g: r(g), m: r(m), s: r(s) }
    })
    ok(box != null, `${who} — 좌우 칸을 찾음`)
    if (box) {
      ok(box.g.x > box.m.x + box.m.w - 2,
        `${who} — **추천이 지표의 오른쪽에 있음** (아래가 아니라)`,
        `지표 끝 ${Math.round(box.m.x + box.m.w)} · 추천 시작 ${Math.round(box.g.x)}`)
      //  ⚠ 0083 — 예전에는 **지표와** 견줬습니다. 그런데 지표는 왼쪽 칸의
      //    맨 위가 아니라 중간쯤에 있는 칸이라, 그 위 내용(이름·연락처·
      //    급한 요청 알림)이 조금만 길어져도 이 숫자가 흔들립니다.
      //    실제로 PC 글자 바닥을 16px 로 올리자(0082) 368px → 422px 이
      //    되면서 임의로 잡아 둔 400px 을 넘었습니다.
      //    여기서 정말 볼 것은 「두 칸이 **나란히** 시작하는가」입니다.
      //    그래서 **줄(row)의 맨 위**와 견줍니다 — 흔들리지 않는 기준입니다.
      ok(Math.abs(box.g.y - box.s.y) < 120,
        `${who} — 추천이 왼쪽 칸과 나란히 시작`,
        `줄 맨 위 y ${Math.round(box.s.y)} · 추천 y ${Math.round(box.g.y)}`)
      //  가운데를 딱 반으로 — 두 칸이 거의 같은 너비여야 합니다.
      const half = box.s.w / 2
      ok(Math.abs(box.g.w - half) < half * 0.25,
        `${who} — **오른쪽 칸이 절반쯤 차지**`,
        `전체 ${Math.round(box.s.w)} · 추천 ${Math.round(box.g.w)}`)
    }

    //  영업 전환 이력은 **작게만** — 접혀 있어야 합니다.
    const lead = p.locator('[data-lead-history]')
    if (await lead.count()) {
      const h = (await lead.boundingBox())?.height ?? 999
      ok(h < 80, `${who} — **영업 전환 이력은 접어서 작게**`, `${Math.round(h)}px`)
      await lead.locator('summary').click()
      await p.waitForTimeout(400)
      const h2 = (await lead.boundingBox())?.height ?? 0
      ok(h2 > h, `${who} — 눌러서 펼쳐짐 (지운 것이 아님)`, `${Math.round(h)} → ${Math.round(h2)}px`)
    }
  }

  //  탭을 눌러 실제로 열리는지 — 자리를 옮기다 끊어지면 안 됩니다.
  await p.click('[data-client-tab="history"]')
  await p.waitForTimeout(600)
  ok(/수거 이력|이번 달 수거횟수/.test(flat(await p.textContent('body'))),
    `${who} — 탭을 눌러 내용이 바뀜`)
  await ctx.close()
}

// ── 폰에서도 순서가 같다 ────────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx)
  const p = await open(ctx, CA)
  const body = flat(await p.textContent('body'))
  ok(!/인증·실사 관련/.test(body), '폰 — 인증·실사가 숨겨짐')
  const yTabs = await top(p, '[data-client-tabs]')
  const yPhone = await top(p, '[data-key-metrics="phone"]')
  ok(yTabs > yPhone, '폰 — 탭이 핵심 지표 아래', `지표 ${Math.round(yPhone)} · 탭 ${Math.round(yTabs)}`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 1, '폰 — 가로 스크롤이 생기지 않음', `${over}px`)

  //  ── 전화가 왔을 때 이사님이 보는 순서 ────────────────────────────────
  //
  //   ⚠ 여기 숫자는 **지금까지 줄인 만큼**입니다. 목표가 아닙니다.
  //     탭 줄이 y=2,103px(2.5화면)이었습니다 — 수거이력·자재·요청을 보려면
  //     두 화면 반을 밀어야 했습니다. 그 위 800px 을 「다음 행동 AI 추천」이
  //     차지하고 있었고(카드 378px + 근거 안내문 96px), 폰에서는 그것을
  //     접어서 1,695px 로 내렸습니다. 추천을 없앤 것이 아닙니다.
  const yPhoneNum = await top(p, '[data-key-metrics="phone"]')
  const findY = (re) => p.evaluate((src) => {
    const rx = new RegExp(src)
    for (const el of document.querySelectorAll('main *')) {
      const t = (el.textContent || '').replace(/\s+/g, ' ')
      if (t.length < 200 && rx.test(t)) return Math.round(el.getBoundingClientRect().top + window.scrollY)
    }
    return -1
  }, re)

  //  ⚠ 이 파일의 픽스처 값을 그대로 씁니다. 다른 파일에서 쓰던 번호를
  //    적었다가 「못 찾음(-1)」이 나왔습니다 — 검사가 아니라 제 실수였습니다.
  const yPhoneTel = await findY('031-000-0000')
  ok(yPhoneTel > 0 && yPhoneTel < 844, '폰 — **전화번호가 첫 화면 안**', `y=${yPhoneTel}px`)
  const yAddr = await findY('오남읍 1')
  ok(yAddr > 0 && yAddr < 844, '폰 — **주소도 첫 화면 안** (그 자리에서 찾아갑니다)', `y=${yAddr}px`)

  const yTabs2 = await top(p, '[data-client-tabs]')
  ok(yTabs2 < 1900, '폰 — 탭 줄이 두 화면 안에 들어옴 (예전 2,103px)', `y=${Math.round(yTabs2)}px`)
  ok(yTabs2 > yPhoneNum, '폰 — 그래도 탭은 핵심 지표 아래 (순서는 그대로)')

  const docH = await p.evaluate(() => document.documentElement.scrollHeight)
  ok(docH < 3100, '폰 — 문서 길이가 줄어든 상태를 지킴 (예전 3,284px)',
    `${docH}px = ${(docH / 844).toFixed(1)}화면`)

  //  ⚠ 추천을 **지운 것이 아닙니다.** 한 번 누르면 그대로 나옵니다.
  const moreBtn = p.locator('[data-actions-more]')
  ok((await moreBtn.count()) > 0, '폰 — 추천을 펴는 버튼이 있음')
  const moreText = flat(await moreBtn.first().textContent())
  ok(/추천 \d+건 보기/.test(moreText), '폰 — 몇 건인지 적혀 있음', moreText)
  const beforeH = await p.evaluate(() => document.documentElement.scrollHeight)
  await moreBtn.first().click()
  await p.waitForTimeout(500)
  const afterH = await p.evaluate(() => document.documentElement.scrollHeight)
  ok(afterH > beforeH, '폰 — 누르면 추천이 실제로 펼쳐짐 (지운 것이 아님)', `${beforeH} → ${afterH}px`)
  const openBody = flat(await p.textContent('body'))
  ok(/규칙에 대입해 도출한 추천/.test(openBody), '폰 — 펼치면 **근거 안내문도 함께** 나옴')
  await ctx.close()
}

// ── 현장 담당자에게는 추천이 안 보인다 (기존 규칙 유지) ─────────────────────
//   자리를 옮기면서 이 규칙이 풀리면 병원에 가서 여는 화면에 금액이 뜹니다.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  wire(ctx, { role: 'field' })
  const p = await open(ctx, CA)
  ok((await p.locator('[data-client-insight-grid]').count()) === 0
     || !/다음 행동 AI 추천/.test(flat(await p.textContent('body'))),
    '**현장 담당자에게는 추천이 안 보임** — 자리를 옮겨도 이 규칙은 그대로')
  const body = flat(await p.textContent('body'))
  ok(!/만원|원\b/.test(body.replace(/원장|원미래|병원|지원|남양주/g, '')),
    '현장 화면에 금액이 없음', (body.match(/[^\s]{0,5}만원/g) ?? []).slice(0, 2).join(' '))
  await ctx.close()
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
