import { chromium, EXEC } from './_pw.mjs'

//  0083 — 고객 포털 1차 고도화
//
//   대표님이 완료 기준으로 적어 주신 **두 흐름을 그대로** 돌립니다.
//
//    고객   로그인 → 포털 → 다음 수거일 → 추가 수거 요청 → 상태 확인
//           → 수거 이력 → 월간 리포트 → 자재 요청 → 문의 → 정산
//    내부   로그인 → 고객 요청 확인 → 상태 변경 → 거래처 인사이트
//
//   ⚠ 화면이 뜨는가가 아니라 **끝까지 되는가**를 봅니다. 그리고
//     「지어낸 숫자가 없는가」를 함께 봅니다 — 시안에 있던 기관코드·
//     무사고일수는 저희 서버에 없는 값이라 넣지 않았습니다.

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000a9'
const HO = '00000000-0000-0000-0000-00000000c1a1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const shift = (n) => {
  const d = new Date(`${T}T00:00:00+09:00`); d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

const clients = [{ id: C1, name: '남양주백병원', type: '요양병원', address: '경기도 남양주시 오남읍 1',
  manager: '김주현', phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '김준기', active: true }]
const schedules = [
  { id: 's1', client_id: C1, date: shift(2), waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
    status: '예정', expected_amount: 100, actual_amount: null, memo: '', created_at: `${T}T00:00:00Z` },
  { id: 's2', client_id: C1, date: shift(-3), waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
    status: '완료', expected_amount: 100, actual_amount: 120, memo: '', created_at: `${T}T00:00:00Z` },
  { id: 's3', client_id: C1, date: shift(-9), waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
    status: '완료', expected_amount: 100, actual_amount: 95, memo: '', created_at: `${T}T00:00:00Z` },
]
const mkInq = (id, over = {}) => ({
  id, client_id: C1, topic: '수거 일정', subject: '일정을 하루 당길 수 있을까요',
  body: '다음 주 화요일이 휴진입니다', status: '접수', reply: '', asked_by_name: '김주현',
  handled_by: null, handled_at: null, created_at: `${T}T01:00:00Z`,
  clients: { name: '남양주백병원' }, ...over,
})

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { role = 'client', w = 1280, inquiries = [], requests = [], schema = 83 } = {}) {
  const uid = role === 'client' ? HO : AD
  const me = { id: uid, email: 'x@b.c', name: role === 'client' ? '김주현' : '송현근', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: role === 'client' ? C1 : null, vehicle_id: null, created_at: '2026-01-01T00:00:00Z' }
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700 })
  const sent = []
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (method !== 'GET') sent.push({ url: url.split('/rest/v1/')[1]?.slice(0, 60), method, body: r.request().postData() })
    if (url.includes('/rpc/app_schema_version')) return json(schema)
    if (url.includes('/rpc/')) return json(null)
    if (method !== 'GET') return json(single ? {} : [])
    if (url.includes('/client_inquiries')) return json(inquiries)
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => (document.querySelector('main')?.innerText ?? '').length > 20, null, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, sent }
}

// ── ① 고객이 로그인하면 무엇이 보이나 ──────────────────────────────────────
{
  const { ctx, p } = await open('/portal')
  ok((await p.locator('[data-portal-hero]').count()) === 1, '**병원 이름이 있는 머리 칸이 뜬다**')
  const hero = flat(await p.locator('[data-portal-hero]').innerText())
  ok(/남양주백병원님, 환영합니다/.test(hero), '병원 이름으로 맞이한다', hero.slice(0, 40))

  //  ⚠ 제일 중요합니다 — 시안에 있던 **지어낸 숫자**가 들어가지 않았는지.
  ok(!/BWM-\d|무사고|\d+일째/.test(hero), '**지어낸 기관코드·무사고일수가 없다**', hero.slice(0, 90))
  ok(/요양병원/.test(hero) && /주 3회/.test(hero), '실제로 아는 것만 적혀 있다 (기관 구분·수거주기)')

  //  다음 수거 — 확정/예상 구분
  const next = flat(await p.locator('[data-hero-next]').innerText())
  ok(next.includes('다음 수거'), '**다음 수거일이 머리 칸에 있다**', next.slice(0, 50))
  ok(/일정 확정|예상/.test(next), '확정인지 예상인지 적혀 있다', next.slice(0, 60))
  await ctx.close()
}

// ── ② 번호 카드가 실제로 눌리는가 ──────────────────────────────────────────
{
  const { ctx, p } = await open('/portal')
  const n = await p.locator('[data-portal-action]').count()
  ok(n === 8, '**번호 카드 8개가 있다** (시안 배치)', `${n}개`)
  //  ⚠ 눌러도 아무 데도 안 가는 칸이 있으면 안 됩니다.
  const dead = await p.locator('[data-portal-action]').evaluateAll((els) =>
    els.filter((e) => e.tagName === 'A' && !e.getAttribute('href')).map((e) => e.getAttribute('data-portal-action')))
  ok(dead.length === 0, '**누르면 아무 데도 안 가는 칸이 없다**', dead.join(', ') || '없음')
  const body = flat(await p.locator('main').innerText())
  ok(!/준비중|Coming Soon|coming soon/i.test(body), '「준비중」 칸이 없다')
  await ctx.close()
}

// ── ③ 문의를 올리고 상태를 본다 ────────────────────────────────────────────
{
  const { ctx, p, sent } = await open('/portal/support')
  ok((await p.locator('[data-inq-send]').count()) === 1, '문의 화면이 열린다')
  ok(await p.locator('[data-inq-send]').isDisabled(), '**제목·내용이 비면 못 보낸다**')
  await p.locator('[data-inq-subject]').fill('다음 주 일정을 당길 수 있을까요')
  await p.locator('[data-inq-body]').fill('화요일이 휴진입니다')
  await p.locator('[data-inq-topic="수거 일정"]').click()
  ok(!(await p.locator('[data-inq-send]').isDisabled()), '채우면 보낼 수 있다')
  await p.locator('[data-inq-send]').click()
  await p.waitForTimeout(900)
  const post = sent.find((x) => x.url?.includes('client_inquiries') && x.method === 'POST')
  ok(!!post, '**서버로 실제로 간다**', post ? post.method + ' ' + post.url : sent.map((x) => x.url).join(','))
  //  ⚠ 상태·답변을 화면이 보내면 안 됩니다 — 서버가 막고 있어 거절당합니다.
  ok(post && !/"status"|"reply"/.test(post.body ?? ''), '**상태·답변은 화면이 보내지 않는다**', (post?.body ?? '').slice(0, 90))
  ok((await p.locator('[data-inq-sent]').count()) === 1, '접수됐다고 알려 준다')
  await ctx.close()
}

// ── ④ 답변이 오면 병원 화면에 보인다 ──────────────────────────────────────
{
  const inquiries = [mkInq('q1', { status: '답변 완료', reply: '화요일로 옮겨 드리겠습니다.' })]
  const { ctx, p } = await open('/portal/support', { inquiries })
  const row = flat(await p.locator('[data-inq-row="q1"]').innerText())
  ok(/답변 완료/.test(row), '상태가 보인다', row.slice(0, 40))
  ok((await p.locator('[data-inq-reply="q1"]').count()) === 1, '**비원미래 답변이 그대로 보인다**')
  ok(/화요일로 옮겨/.test(flat(await p.locator('[data-inq-reply="q1"]').innerText())), '답변 내용이 맞다')
  await ctx.close()
}

// ── ⑤ 알림 — 지금 자료에서 나온다 ──────────────────────────────────────────
{
  const inquiries = [mkInq('q1', { status: '답변 완료', reply: '화요일로 옮겨 드리겠습니다.' })]
  const { ctx, p } = await open('/portal', { inquiries })
  ok((await p.locator('[data-portal-bell]').count()) === 1, '알림 종이 있다')
  const cnt = await p.locator('[data-portal-bell-count]').count()
  ok(cnt === 1, '**알려 줄 것이 있으면 숫자가 붙는다**')
  await p.locator('[data-portal-bell]').click()
  await p.waitForTimeout(500)
  const list = flat(await p.locator('[data-portal-notices]').innerText())
  ok(/문의에 답변이 등록되었습니다/.test(list), '**답변 알림이 뜬다**', list.slice(0, 70))
  ok(/수거 예정/.test(list), '다음 수거 알림도 뜬다')
  //  ⚠ 지어낸 알림이 없어야 합니다 — 자료에 없는 말이 있으면 안 됩니다.
  ok(!/포인트|이벤트|프로모션|할인/.test(list), '없는 이야기를 만들지 않는다')
  await ctx.close()
}

// ── ⑥ 정산 — 결제 단추를 만들지 않았다 ─────────────────────────────────────
{
  const { ctx, p } = await open('/portal/billing')
  const body = flat(await p.locator('main').innerText())
  ok(/정산 내역/.test(body), '정산 화면이 열린다')
  ok((await p.locator('[data-pb-nopay]').count()) === 1, '**지금은 결제할 수 없다고 분명히 적는다**')
  //  ⚠ 눌러도 아무 일 없는 「결제하기」가 있으면 고장으로 읽힙니다.
  ok(!/결제하기|카드 결제|지금 결제/.test(body), '**작동하지 않는 결제 단추가 없다**')
  await ctx.close()
}

// ── ⑦ 폰에서 쓸 만한가 ─────────────────────────────────────────────────────
{
  const { ctx, p } = await open('/portal', { w: 390 })
  const push = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(push <= 0, '**폰에서 가로로 밀리지 않는다**', `${push}px`)
  //  ⚠ 0089 — **넷에서 셋으로** 줄었습니다. 물품·리포트·정산은 이제 홈에서
  //    창으로 엽니다(화면을 안 옮깁니다). 위 메뉴에 이름을 또 걸어 둘 이유가
  //    없어졌고, 아래 띠도 같은 셋을 씁니다.
  //    ⚠ 넷을 넘으면 안 되는 이유는 그대로입니다 — 여섯이면 한 칸이 65px 이
  //      되어 글자가 세로로 늘어집니다.
  const tabs = await p.locator('nav.fixed.bottom-0 a').count()
  ok(tabs === 3, '폰 아래 띠는 셋', `${tabs}개`)
  const tabText = (await p.locator('nav.fixed.bottom-0 a').allInnerTexts()).map((x) => x.replace(/\s+/g, ''))
  ok(tabText.some((x) => x.includes('홈')), '아래 띠에 홈이 있다', tabText.join(','))
  const tiny = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t.length > 3 && r.width > 0 && r.width < 40 && r.height > r.width * 3) out.push(t.slice(0, 18))
    }
    return [...new Set(out)]
  })
  ok(tiny.length === 0, '세로로 늘어진 글자가 없다', tiny.slice(0, 3).join(' / ') || '없음')
  await ctx.close()
}

// ── ⑧ 내부 — 문의를 받아 답한다 ────────────────────────────────────────────
{
  const inquiries = [mkInq('q1')]
  const { ctx, p, sent } = await open('/requests', { role: 'admin', inquiries })
  ok((await p.locator('[data-inquiry-inbox]').count()) === 1, '**요청 화면에 문의 칸이 있다**')
  ok((await p.locator('[data-inq-item="q1"]').count()) === 1, '병원이 올린 문의가 보인다')
  const row = flat(await p.locator('[data-inq-item="q1"]').innerText())
  ok(/남양주백병원/.test(row), '어느 병원인지 보인다', row.slice(0, 40))
  await p.locator('[data-inq-open="q1"]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-inq-answer="q1"]').fill('화요일로 옮겨 드리겠습니다.')
  await p.locator('[data-inq-set="q1:답변 완료"]').click()
  await p.waitForTimeout(900)
  const call = sent.find((x) => x.url?.includes('answer_inquiry'))
  ok(!!call, '**답변이 서버 함수로 간다** (누가 언제 답했는지 남습니다)',
    call ? call.url : sent.map((x) => x.url).join(','))
  ok(call && /답변 완료/.test(call.body ?? ''), '상태가 함께 간다', (call?.body ?? '').slice(0, 80))
  await ctx.close()
}

// ── ⑨ 판이 낮으면 문의 칸을 아예 안 그린다 ─────────────────────────────────
{
  const { ctx, p } = await open('/requests', { role: 'admin', schema: 82, inquiries: [mkInq('q1')] })
  ok((await p.locator('[data-inquiry-inbox]').count()) === 0,
    '**판 82 에서는 문의 칸을 안 그린다** (눌러도 안 되는 단추를 만들지 않습니다)')
  ok(flat(await p.locator('main').innerText()).includes('고객 요청'), '요청 화면 자체는 그대로 열린다')
  await ctx.close()
}

// ── ⑩ 거래처 인사이트 — 규칙이지 AI 가 아니다 ─────────────────────────────
{
  const { ctx, p } = await open('/insight', { role: 'admin' })
  const body = flat(await p.locator('main').innerText())
  ok(/거래처 인사이트/.test(body), '인사이트 화면이 열린다')
  //  ⚠ 대표님 금지사항: 「가짜 AI 기능을 실제 AI처럼 표현」
  ok(!/AI가 분석|AI 분석 결과|인공지능이/.test(body), '**AI 가 분석했다고 하지 않는다**')
  ok((await p.locator('[data-insight-basis]').count()) === 1, '무엇을 보고 계산했는지 적혀 있다')
  ok(/정해 둔 규칙/.test(flat(await p.locator('[data-insight-basis]').innerText())), '「규칙」이라고 밝힌다')
  ok((await p.locator('[data-insight-row]').count()) >= 1, '거래처가 나온다')
  //  몇 개로 쟀는지 반드시 적습니다.
  const measured = flat(await p.locator(`[data-insight-measured="${C1}"]`).innerText())
  ok(/가지 중 \d가지로 계산|잴 수 있는 기록이 없습니다/.test(measured), '**몇 개로 쟀는지 적는다**', measured)
  //  근거를 펴 볼 수 있어야 합니다.
  if (await p.locator(`[data-insight-why="${C1}"]`).count()) {
    await p.locator(`[data-insight-why="${C1}"]`).click()
    await p.waitForTimeout(400)
    ok((await p.locator(`[data-insight-reasons="${C1}"]`).count()) === 1, '**근거를 펴 볼 수 있다**')
  }
  await ctx.close()
}

// ── ⑪ 내부 → 고객 화면 단추 ────────────────────────────────────────────────
{
  const { ctx, p } = await open('/', { role: 'admin' })
  //  ⚠ 자리가 화면 폭에 따라 다릅니다 — PC 는 인사 줄 오른쪽, 폰은 오늘
  //    할 일 아래(폰에서 위에 두면 오늘 할 일이 첫 화면에서 밀립니다).
  //    그래서 **보이는 것**을 셉니다. DOM 에 몇 개 있는지가 아닙니다.
  const shown = p.locator('[data-portal-switch]:visible')
  ok((await shown.count()) === 1, '**대표님 첫 화면에 「병원이 보는 화면」 단추가 있다**',
    `보이는 것 ${await shown.count()}개`)
  const box = await shown.first().boundingBox()
  ok((box?.height ?? 0) >= 44, '누를 만한 크기', `${Math.round(box?.height ?? 0)}px`)
  const href = await shown.first().getAttribute('href')
  ok(href === '/portal', '포털로 간다', String(href))
  await ctx.close()
}
{
  //  ⚠ 0084 — 대표님 보고: 「고객전용 화면으로 넘어가는 버튼이 PC나
  //    모바일 모두에서 안 보인다」. 재 보니 두 가지가 틀렸습니다 —
  //      ① 이사님(office) 계정에서는 **아예 안 그려졌습니다**
  //         (/portal 이 admin·client 전용이었습니다)
  //      ② 폰에서는 y=1,458px, 즉 2화면 아래에 있었습니다
  //    처음 검사는 `:visible` 만 봐서 ②를 못 잡았습니다. **보이는가**가
  //    아니라 **찾을 수 있는 자리인가**를 봐야 합니다.
  for (const role of ['admin', 'office']) {
    //  PC — 첫 화면 안
    const a = await open('/', { role, w: 1440 })
    const pc = a.p.locator('[data-portal-switch]:visible')
    ok((await pc.count()) === 1, `PC · ${role} — 단추가 보인다`, `${await pc.count()}개`)
    const y = await pc.first().evaluate((e) => Math.round(e.getBoundingClientRect().top + scrollY))
    ok(y < 400, `**PC · ${role} — 첫 화면 안에 있다**`, `y=${y}px`)
    await a.ctx.close()

    //  폰 — 「더보기」 안. 대시보드에 두면 오늘 할 일이 밀립니다.
    const m = await open('/more', { role, w: 390 })
    const ph = m.p.locator('[data-portal-switch]:visible')
    ok((await ph.count()) === 1, `폰 · ${role} — 「더보기」에 단추가 있다`, `${await ph.count()}개`)
    const my = await ph.first().evaluate((e) => Math.round(e.getBoundingClientRect().top + scrollY))
    ok(my < 844, `**폰 · ${role} — 더보기 첫 화면 안에 있다**`, `y=${my}px`)
    const box = await ph.first().boundingBox()
    ok((box?.height ?? 0) >= 44, `폰 · ${role} — 누를 만한 크기`, `${Math.round(box?.height ?? 0)}px`)
    await m.ctx.close()
  }

  //  ⚠ 현장 담당자에게는 **어디에도** 없어야 합니다 — 병원 화면에는
  //    청구·정산이 있습니다.
  for (const path of ['/today', '/more']) {
    const f = await open(path, { role: 'field', w: 390 })
    ok((await f.p.locator('[data-portal-switch]').count()) === 0,
      `**기사님 ${path} 에는 없다**`)
    await f.ctx.close()
  }
}

// ── ⑫ 거래처 상세 — 고객 인사이트가 붙었나 ────────────────────────────────
{
  const { ctx, p } = await open(`/clients/${C1}`, { role: 'admin', inquiries: [mkInq('q1')] })
  ok((await p.locator(`[data-client-health="${C1}"]`).count()) === 1,
    '**거래처 상세에 「고객 인사이트」가 붙었다**')
  const measured = flat(await p.locator('[data-client-health-measured]').innerText())
  ok(/가지로 계산했습니다|잴 수 있는 기록이 없습니다/.test(measured), '**몇 개로 쟀는지 적는다**', measured)

  //  ⚠ 고객 활동 — 실제로 남는 것만. 없으면 「아직 기록 없음」이어야 합니다.
  const act = flat(await p.locator('[data-client-activity]').innerText())
  ok(/보낸 요청/.test(act) && /문의/.test(act), '고객 활동이 보인다', act.slice(0, 60))
  const last = flat(await p.locator('[data-client-lastportal]').innerText())
  ok(last.length > 0 && !/NaN|Invalid/.test(last), '**마지막 포털 이용을 지어내지 않는다**', last)

  //  ⚠ AI 라고 적으면 안 됩니다.
  const body = flat(await p.locator('main').innerText())
  ok(!/AI가 분석|AI 분석 결과|인공지능이/.test(body), '**AI 가 분석했다고 하지 않는다**')

  //  한 장으로 모아 보기 — 눌러도 되는 단추여야 합니다.
  await p.locator('[data-client-brief-open]').click()
  await p.waitForTimeout(400)
  const brief = flat(await p.locator('[data-client-brief]').innerText())
  ok(brief.includes('남양주백병원'), '**한 장 요약이 실제로 나온다**', brief.slice(0, 40))
  ok(/기록 없음|모름|kg|건/.test(brief), '요약에 실제 값이 들어 있다')
  const note = flat(await p.locator('[data-client-brief-note]').innerText())
  ok(/AI 분석은 아직\s*붙어 있지 않습니다/.test(note.replace(/\s+/g, ' ')),
    '**AI 는 아직 안 붙었다고 그대로 말한다**', note.slice(0, 60))
  await ctx.close()
}

// ── ⑬ 기존 것이 안 깨졌나 ──────────────────────────────────────────────────
{
  for (const [path, must] of [
    ['/today', '오늘'], ['/collection', '수거'], ['/clients', '거래처'],
    ['/materials', '재고'], ['/billing', '청구'], ['/receivables', '미수'],
  ]) {
    const { ctx, p } = await open(path, { role: 'admin' })
    const body = flat(await p.locator('body').innerText())
    const broken = /문제가 생겼|오류가 발생|권한이 없는/.test(body)
    ok(!broken && new RegExp(must).test(body), `**${path} 가 그대로 열린다**`, broken ? body.slice(0, 50) : '정상')
    await ctx.close()
  }
}

await b.close()
