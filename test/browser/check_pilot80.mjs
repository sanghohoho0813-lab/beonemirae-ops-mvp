import { existsSync, readFileSync } from 'node:fs'
import { chromium, EXEC } from './_pw.mjs'
import { PILOT } from './_pilot.mjs'

//  0080 — Pilot 모드: 지금 쓰는 것만 보이는가
//
//   대표님: 「송현주 이사님 / 송현근 대표님이 처음 시스템을 쓸 때 불필요한
//   기능·알림·경고 때문에 헷갈리지 않도록, 지금 당장 실제로 쓸 핵심 업무만
//   보이게 만드는 것이 목표다.」
//
//   기준: 처음 로그인한 사람이 「뭘 써야 하지?」가 아니라
//         「오늘 할 일이 이거구나」라고 바로 이해하는가.
//
//   확인하는 것
//    · 병원 요청 — 메뉴 · 경고 · 배지 · 분석 카드가 **전부** 사라졌나
//    · 주소를 직접 쳐도 안 열리나 (메뉴에서만 빼면 옛 링크로 들어갑니다)
//    · 소모품 주문이 안 보이나
//    · 시작하기 체크리스트가 첫 화면을 안 밀어내나
//    · **숨김 때문에 일정·수거·정산이 깨지지 않았나** ← 제일 중요합니다

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000a9'
const OF = '00000000-0000-0000-0000-0000000000b2'
const FD = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const ago = (n) => {
  const d = new Date(`${T}T00:00:00+09:00`)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

const clients = [{ id: C1, name: '더원요양병원', type: '병원', address: '경기도 남양주시 오남읍 1',
  manager: '김', phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '김준기', active: true }]

//  ⚠ 대표님이 실제로 겪으신 상황을 그대로 만듭니다 — 급한 요청이 여러 건
//    쌓여 있고, 그중 일부는 이미 처리했거나 내려 둔 상태입니다.
const mkReq = (id, over = {}) => ({
  id, client_id: C1, kind: '긴급수거', content: '오늘 좀 와주세요', urgent: true,
  status: '접수', source: '전화', requester_name: '김', reply: '', desired_date: null,
  created_at: `${ago(3)}T01:00:00Z`, handled_by: null, handled_at: null,
  snoozed_until: null, snooze_reason: '', clients: { name: '더원요양병원' }, ...over,
})
const REQUESTS = [
  mkReq('r1'),
  mkReq('r2', { created_at: `${ago(10)}T01:00:00Z` }),
  mkReq('r3', { created_at: `${ago(20)}T01:00:00Z` }),
]
const mkSched = (id, date, over = {}) => ({
  id, client_id: C1, date, waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
  status: '예정', expected_amount: 100, actual_amount: null, memo: '', origin: 'system',
  created_at: `${date}T00:10:00Z`, created_by: AD, created_by_name: '송대표',
  created_via: '사무실 배정', event_id: null, canceled_at: null, cancel_reason: '', ...over,
})

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { role = 'admin', w = 1280, requests = REQUESTS, scheds = null, onRest = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1100 }, isMobile: w < 700, hasTouch: w < 700 })
  const uid = role === 'field' ? FD : role === 'office' ? OF : AD
  const name = role === 'field' ? '김준기' : role === 'office' ? '송현주' : '송현근'
  const me = { id: uid, email: 'x@b.c', name, role, font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: V3,
    created_at: '2026-01-01T00:00:00Z' }
  //  ⚠ 이미 굴러가고 있는 회사입니다 — 완료된 수거가 있습니다.
  const rows = scheds ?? [
    mkSched('s1', T),
    mkSched('s2', T, { status: '완료', actual_amount: 120, id: 's2' }),
    mkSched('s3', ago(2), { status: '완료', actual_amount: 90 }),
  ]
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    if (onRest) onRest(url)
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(79)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/office_stock_items')) return json([])
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(rows)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1400)
  return { ctx, p }
}

// ── ① 대표(admin) 첫 화면 — 병원 요청 흔적이 없다 ─────────────────────────
{
  const { ctx, p } = await open('/', { role: 'admin' })
  const body = flat(await p.locator('body').innerText())

  //  ⚠ 대표님이 지적하신 그 카드입니다.
  //  ⚠ 0083 — 병원 요청을 다시 켰습니다(포털을 드리는데 요청함이 닫혀
  //    있으면 병원이 올린 요청을 아무도 못 봅니다). 그래서 이 검사는
  //    **스위치를 따라갑니다** — 내려 뒀으면 「없다」, 켜 뒀으면 「있다」.
  //    한쪽으로만 무는 검사는 되돌릴 때 아무것도 못 잡습니다.
  if (PILOT.requests) {
    ok((await p.locator('[data-urgent-banner]').count()) === 0,
      '**「급한 요청이 반복됩니다」 배너가 없다**')
    ok(!/급한 요청이 반복/.test(body), '그 문구 자체가 화면에 없다')
  } else {
    //  ⚠ 켜 뒀을 때 **배너가 뜨는지**는 여기서 묻지 않습니다. 그 띠는
    //    「급한 요청이 반복 + 앞이 비었음」일 때만 뜨는 것이라, 이 시늉본은
    //    앞 일정이 있어서 안 뜨는 것이 맞습니다. 여기서 볼 것은
    //    **스위치가 풀렸는가**이고, 그건 ② 에서 주소로 확인합니다.
    ok(true, '요청을 켜 두었다 — 배너 조건은 별도 검사(check_urgent)에서 봅니다')
  }
  ok(PILOT.requests ? !/병원 요청/.test(body) : true,
    PILOT.requests ? '**「병원 요청」이라는 메뉴·글자가 없다**' : '요청을 켜 두어 이 항목은 건너뜁니다',
    (body.match(/.{0,20}병원 요청.{0,20}/) ?? [''])[0])
  if (PILOT.requests) ok(!/처리 대기 요청/.test(body), '「처리 대기 요청」 카드가 없다')
  if (PILOT.requests) ok(!/긴급 요청/.test(body), '「긴급 요청」 카드가 없다')
  //  ⚠ 소모품은 실사에서 보여 드릴 화면이라 다시 켰습니다 (0081).
  //    그래도 「켜져 있으면 실제로 보이는가」는 그대로 봅니다 — 스위치가
  //    한쪽으로만 무는 것이 아니라는 뜻입니다.
  ok(PILOT.supplies ? !/소모품 주문/.test(body) : /소모품 주문/.test(body),
    PILOT.supplies ? '**「소모품 주문」 메뉴가 없다**' : '**「소모품 주문」 메뉴가 다시 보인다** (실사용)')

  //  ⚠ 핵심은 남아 있어야 합니다 — 없애기만 하면 안 됩니다.
  ok(/오늘 일정/.test(body), '**「오늘 일정」은 그대로 있다**')
  ok(/수거 입력/.test(body), '「수거 입력」도 그대로')
  ok(/자재 관리/.test(body), '「자재 관리」도 그대로')
  ok(/거래처/.test(body), '「거래처」도 그대로')
  await ctx.close()
}

// ── ② 주소를 직접 쳐도 안 열린다 ──────────────────────────────────────────
{
  //  ⚠ 메뉴에서만 빼면 옛 링크·즐겨찾기로 그대로 들어갑니다.
  for (const [path, label] of [
    ...(PILOT.requests ? [['/requests', '병원 요청']] : []),
    ...(PILOT.supplies ? [['/supplies', '소모품 주문']] : []),
  ]) {
    const { ctx, p } = await open(path, { role: 'admin' })
    const body = flat(await p.locator('body').innerText())
    ok(/권한|접근|찾을 수 없/.test(body) || !new RegExp(label).test(body),
      `**주소로 ${path} 를 쳐도 그 화면이 안 열린다** (대표 계정)`, body.slice(0, 50))
    await ctx.close()
  }
}

{
  //  ⚠ 켜 둔 화면은 **실제로 열려야** 합니다. 「메뉴엔 있는데 안 열린다」가
  //    반대 방향의 같은 결함입니다.
  for (const [path, label] of [
    ...(PILOT.requests ? [] : [['/requests', '고객 요청']]),
    ...(PILOT.supplies ? [] : [['/supplies', '소모품']]),
  ]) {
    const { ctx, p } = await open(path, { role: 'admin' })
    const body = flat(await p.locator('main').innerText())
    ok(!/권한이 없는 화면/.test(body), `**${label} 화면이 다시 열린다**`, body.slice(0, 40))
    await ctx.close()
  }
}

// ── ③ 이사님(office) 화면 ─────────────────────────────────────────────────
{
  const { ctx, p } = await open('/', { role: 'office' })
  const body = flat(await p.locator('body').innerText())
  if (PILOT.requests) ok(!/병원 요청/.test(body), '**이사님 화면에도 「병원 요청」이 없다**')
  ok(PILOT.supplies ? !/소모품 주문/.test(body) : /소모품 주문/.test(body),
    PILOT.supplies ? '이사님 화면에도 「소모품 주문」이 없다' : '이사님 화면에도 「소모품 주문」이 다시 보인다')
  ok((await p.locator('[data-urgent-banner]').count()) === 0, '요청 경고 배너도 없다')
  ok(/오늘 일정/.test(body) && /수거 입력/.test(body), '**핵심 업무는 그대로 보인다**')
  await ctx.close()
}

// ── ④ 기사(field) 폰 화면 ─────────────────────────────────────────────────
{
  const { ctx, p } = await open('/today', { role: 'field', w: 390 })
  const body = flat(await p.locator('body').innerText())
  if (PILOT.requests) ok(!/병원 요청/.test(body), '**기사님 폰에도 「병원 요청」이 없다**')
  ok((await p.locator('[data-urgent-banner]').count()) === 0, '요청 경고 배너도 없다')

  //  더보기까지 열어 봅니다 — 메뉴가 거기 숨어 있을 수 있습니다.
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find((e) => (e.textContent ?? '').trim() === '더보기')
    t?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await p.waitForTimeout(900)
  const more = flat(await p.locator('body').innerText())
  if (PILOT.requests) ok(!/병원 요청/.test(more), '**「더보기」 안에도 없다**')
  //  ⚠ 현장은 스위치와 무관하게 원래 소모품을 못 봅니다 — 판매가·원가가
  //    붙는 화면이라 access.ts 가 admin·office 로 막아 둡니다.
  ok(!/소모품 주문/.test(more), '「더보기」 안에 소모품도 없다 (현장은 원래 권한 없음)')
  await ctx.close()
}

// ── ⑤ 오늘 일정 화면의 요청 배너 ──────────────────────────────────────────
{
  const { ctx, p } = await open('/today', { role: 'admin' })
  const body = flat(await p.locator('body').innerText())
  //  ⚠ 0083 — 요청을 다시 켰습니다. 스위치를 따라갑니다.
  if (PILOT.requests) {
    ok(!/병원 요청/.test(body) && !/급한 요청이 반복/.test(body),
      '**오늘 일정 화면에도 요청 경고가 없다**')
  } else {
    ok(!/문제가 생겼|권한이 없는/.test(body), '요청을 켜 두어도 오늘 일정이 멀쩡하다')
  }
  //  일정 자체는 멀쩡해야 합니다.
  ok(/더원요양병원/.test(body), '**오늘 갈 곳은 그대로 보인다**')
  await ctx.close()
}

// ── ⑥ 시작하기 체크리스트 — 첫 화면을 안 밀어낸다 ─────────────────────────
{
  const { ctx, p } = await open('/', { role: 'admin' })
  //  이미 수거를 해 본 회사이므로 한 줄로 줄어 있어야 합니다.
  const mini = await p.locator('[data-start-here-mini]').count()
  const full = await p.locator('[data-start-here-full]').count()
  ok(full === 0, '**「시작하기 3/4」 큰 카드가 첫 화면에 없다**', `큰 카드 ${full}`)
  if (mini > 0) {
    const box = await p.locator('[data-start-here-mini]').boundingBox()
    ok((box?.height ?? 0) <= 90, '남은 설정은 **한 줄로만** 알려 준다', `${Math.round(box?.height ?? 0)}px`)
  } else {
    ok(true, '남은 설정이 없어 아예 안 보인다')
  }
  await ctx.close()
}
{
  //  ⚠ 아직 한 번도 수거를 안 한 **처음 세팅** 때는 큰 카드가 나와야 합니다.
  //    줄이기만 하면 처음 쓰는 사람이 무엇부터 할지 모릅니다.
  const { ctx, p } = await open('/', { role: 'admin', scheds: [mkSched('s1', T)] })
  ok((await p.locator('[data-start-here-full]').count()) === 1,
    '**처음 세팅 때는 큰 체크리스트가 그대로 나온다**')
  await ctx.close()
}

// ── ⑦ 숨김 때문에 핵심이 깨지지 않았나 ────────────────────────────────────
{
  //  ⚠ 이번 작업에서 제일 위험한 부분입니다. 숨기려다 멀쩡한 화면을
  //    깨뜨리면 Pilot 자체가 안 됩니다.
  for (const [path, must] of [
    ['/today', '오늘'],
    ['/collection', '수거'],
    ['/clients', '거래처'],
    ['/materials', '재고'],
    ['/history', '수거이력'],
    ['/billing', '청구'],
    ['/receivables', '미수'],
  ]) {
    const { ctx, p } = await open(path, { role: 'admin' })
    const body = flat(await p.locator('body').innerText())
    const broken = /문제가 생겼|오류가 발생|권한이 없는/.test(body)
    ok(!broken && new RegExp(must).test(body), `**${path} 가 그대로 열린다**`,
      broken ? body.slice(0, 60) : '정상')
    await ctx.close()
  }
}

// ── ⑧ 지운 것이 아니라 내려 둔 것인가 ────────────────────────────────────
{
  //  ⚠ 대표님 조건: 「기존 요청 이력과 처리완료 이력은 삭제하지 말고,
  //    Pilot 이후 다시 켤 수 있도록 하나의 feature flag 로 관리해줘.」
  //
  //    그래서 확인할 것은 「안 보이나」가 아니라 **「돌아올 수 있나」**입니다.

  //  ㉮ 스위치가 정말 한 곳인가 — 화면마다 흩어져 있으면 다시 켤 때
  //     한 군데는 반드시 빠집니다.
  const flagSrc = readFileSync('src/lib/pilotMode.ts', 'utf-8')
  ok(/clientRequests:\s*(true|false)/.test(flagSrc) && /supplies:\s*(true|false)/.test(flagSrc),
    '**스위치가 `src/lib/pilotMode.ts` 한 곳에 있다**',
    `요청 ${PILOT.requests ? '내림' : '켬'} · 소모품 ${PILOT.supplies ? '내림' : '켬'}`)

  //  ㉯ 코드를 지우지 않았는가 — 요청·소모품 화면이 그대로 있어야
  //     스위치만 되돌려도 예전처럼 돌아옵니다.
  for (const f of ['src/pages/Requests.tsx', 'src/pages/Supplies.tsx', 'src/components/UrgentRisk.tsx']) {
    ok(existsSync(f), `**${f} 는 그대로 있다** (지우지 않았습니다)`)
  }

  //  ㉰ 서버에서 요청을 **계속 받아 오는가.** 아예 안 받아 오게 만들면
  //     다시 켰을 때 과거 이력이 안 보입니다. 화면에만 안 그려야 합니다.
  const seen = []
  const { ctx, p } = await open('/', { role: 'admin', onRest: (u) => seen.push(u) })
  const body = flat(await p.locator('body').innerText())
  ok(seen.some((u) => u.includes('/client_requests')),
    '**요청 이력은 서버에서 계속 내려온다** — 화면에만 안 그립니다')
  ok(!/급한 요청이 반복|처리 대기 요청/.test(body), '그런데 화면에는 안 나온다')
  ok(body.length > 100, '화면은 정상적으로 그려졌다', `${body.length}자`)
  await ctx.close()
}

// ── ⑨ 내려 둔 화면으로 데려가는 길이 남아 있지 않은가 ──────────────────────
{
  //  ⚠ 메뉴만 지우면 끝이 아닙니다. 화면 안 바로가기·탭·안내 단계가
  //    그대로 남아 있으면, 눌렀을 때 「접근 권한이 없는 화면입니다」로
  //    끝납니다. 처음 쓰시는 분께는 그게 제일 나쁜 경험입니다.

  //  ㉮ 거래처 상세의 「요청·알림」 탭
  {
    const { ctx, p } = await open(`/clients/${C1}`, { role: 'admin' })
    const body = flat(await p.locator('body').innerText())
    ok(PILOT.requests ? !/요청·알림/.test(body) : /요청·알림/.test(body),
      PILOT.requests ? '**거래처 상세에 「요청·알림」 탭이 없다**' : '**요청·알림 탭이 다시 보인다**')
    ok(/수거이력/.test(body), '나머지 탭은 그대로 있다')
    await ctx.close()
  }

  //  ㉯ 대시보드의 「병원 요청 → 처리 → 제안 → 수락 → 매출」 전환 카드
  {
    const { ctx, p } = await open('/', { role: 'admin' })
    //  접혀 있는 칸까지 전부 펼쳐서 봅니다 — 접혀 있을 뿐 남아 있으면
    //  대표님이 펴는 순간 0 건짜리 카드가 나옵니다.
    await p.evaluate(() => {
      document.querySelectorAll('button, summary').forEach((el) => {
        if (/더 보기|펼치기|자세히/.test(el.textContent ?? '')) el.click()
      })
    })
    await p.waitForTimeout(600)
    const html = await p.evaluate(() => document.body.innerHTML)
    ok(!/병원 수락/.test(html), '**요청 전환 카드가 없다** (「병원 수락」 칸)')
    ok(!/요청 처리하기/.test(html), '「요청 처리하기」 버튼도 없다')
    await ctx.close()
  }

  //  ㉰ 어느 화면에도 내려 둔 곳으로 가는 링크가 없다
  for (const path of ['/', '/today', '/clients', '/materials']) {
    const { ctx, p } = await open(path, { role: 'admin' })
    //  ⚠ 이 함수는 **브라우저 안에서** 돕니다 — 바깥의 PILOT 을 그냥 쓰면
    //    `PILOT is not defined` 로 터집니다. 값으로 넘겨 줍니다.
    const bad = await p.evaluate(
      (hide) =>
        [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href') ?? '')
          //  병원 포털(/portal/supplies)은 병원 담당자 화면이라 대상이 아닙니다.
          .filter((h) =>
            (hide.requests && /^\/requests(\/|$)/.test(h)) ||
            (hide.supplies && /^\/supplies(\/|$)/.test(h))),
      PILOT,
    )
    ok(bad.length === 0, `**${path} 에 내려 둔 화면으로 가는 링크가 없다**`,
      bad.length ? bad.join(', ') : '0개')
    await ctx.close()
  }
}

await b.close()
