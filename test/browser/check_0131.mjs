import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0131 — 실사용 고도화 묶음
//   ① 수거이력 = 실제 기록 (예정·무른 방문 빠짐) · 「지난 일정 · 미입력」 · 바로 입력 · 딥링크 · 기사 검색
//   ② 대시보드 「지금 처리할 것」에 지난 미입력 · 독촉 대상 · 지어낸 인증/격리 경보 제거
//   ③ 미수금 검색(초성)·줄 세우기 · 독촉 목록 접기 · 거래처 초성/전화 검색
//   ④ 수거 입력 — 시각 정렬(9:00 < 10:00) · 오늘 일정은 지금 시각 · 예상 kg 그대로 알림 ·
//      저장 못 하는 이유 · 같은 차 한 번에 · 지도 · 두 번째 방문 「추가 수거로 저장」 ·
//      저장은 됐는데 다시 읽기만 실패해도 성공으로

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const T = F.TODAY
const shift = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const b = await chromium.launch({ executablePath: EXEC })

const row = (id, date, over = {}) => ({
  id, date, client_id: 'c1', waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '10:00', status: '예정',
  expected_amount: 87, actual_amount: null, completed_at: null, memo: '', origin: 'system', is_additional: false,
  demo_session_id: null, plan_batch: null, handover_status: null, driver_name: null, canceled_at: null,
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`, ...over,
})

async function open(role, path, { w = 1440, h = 900, schedules, extra } = {}) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role), ...(schedules ? { schedules } : {}) }
  const phone = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone })
  W.wire(ctx, state)
  if (extra) await extra(ctx, state)
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p, state }
}

// ── ① 수거이력 ────────────────────────────────────────────────────────────────
console.log('\n── ① 수거이력 ──')
{
  const extraRows = [
    row('sf', shift(3)),                                         // 앞으로의 예정
    row('sc', shift(-2), { canceled_at: `${shift(-3)}T00:00:00Z` }), // 무른 방문
    row('sm', shift(-3)),                                        // 지난 일정인데 입력 없음
    row('st', T, { scheduled_time: '23:50' }),                   // 오늘 아직 안 간 곳
  ]
  const schedules = [...F.schedules, ...extraRows]
  const s = await open('office', '/history', { schedules })
  const has = async (id) => (await s.p.locator(`[data-history-row="${id}"]`).count()) > 0
  ok(!(await has('sf')), '**앞으로의 예정이 기록에 안 섞임**')
  ok(!(await has('sc')), '무른 방문이 안 섞임')
  ok(!(await has('st')), '오늘 아직 안 간 곳이 안 섞임')
  ok(!(await has('sm')), '입력 없는 지난 일정도 기본(입력된 수거)에는 안 섞임')
  const kpi = flat(await s.p.locator('main').innerText())
  ok(/수거건수/.test(kpi) && !/전체 수거건수/.test(kpi), 'KPI 이름 — 「수거건수」')
  const first = await s.p.locator('[data-history-row]').first().getAttribute('data-history-row')
  const firstRow = F.schedules.find((x) => x.id === first)
  ok(!!firstRow && firstRow.status === '완료', '맨 위 줄이 실제 완료 기록', first ?? '')
  //  지난 일정 · 미입력
  await s.p.locator('[data-history-status] button', { hasText: '지난 일정' }).click()
  await s.p.waitForTimeout(300)
  ok(await has('sm'), '**「지난 일정 · 미입력」에 빠진 입력이 보임**')
  ok(!(await has('sf')) && !(await has('sc')) && !(await has('st')), '미입력에도 예정·무른 방문·오늘 것은 없음')
  await s.p.locator('[data-history-input="sm"]').click()
  await s.p.waitForTimeout(800)
  ok(/\/collection\?schedule=sm$/.test(s.p.url()), '**「수거 입력 ›」으로 그 일정 입력 화면에 바로 감**', s.p.url().replace(W.BASE, ''))
  await s.ctx.close()
  //  딥링크
  const d = await open('office', '/history?status=missing', { schedules })
  ok((await d.p.locator('[data-history-row="sm"]').count()) === 1, '?status=missing 으로 바로 미입력 목록')
  await d.ctx.close()
  const c = await open('office', '/history?client=c1', { schedules })
  const q = await c.p.locator('[data-history-search]').inputValue()
  ok(q === '가나요양병원', '?client= 로 그 거래처가 검색칸에', q)
  const names = await c.p.locator('[data-history-row] td:nth-child(2)').allInnerTexts()
  ok(names.length > 0 && names.every((n) => n.includes('가나요양병원')), '그 거래처 기록만', `${names.length}줄`)
  //  기사로 찾기
  await c.p.fill('[data-history-search]', '2호기사')
  await c.p.waitForTimeout(300)
  const drivers = await c.p.locator('[data-history-row] td:nth-child(6)').allInnerTexts()
  ok(drivers.length > 0 && drivers.every((n) => n.includes('2호기사')), '**기사 이름으로 검색**', `${drivers.length}줄`)
  ok((await c.p.locator('button', { hasText: '지난 달' }).count()) === 1, '기간에 「지난 달」')
  await c.ctx.close()
  //  거래처 상세 → 전체 수거이력 보기
  const cd = await open('office', '/clients/c1', { schedules })
  const link = cd.p.locator('button', { hasText: '전체 수거이력 보기' })
  if (await link.count()) {
    await link.first().click(); await cd.p.waitForTimeout(800)
    ok(/\/history\?client=c1$/.test(cd.p.url()), '거래처 상세 「전체 수거이력 보기」 → 그 거래처로', cd.p.url().replace(W.BASE, ''))
  } else ok(false, '거래처 상세에 「전체 수거이력 보기」')
  await cd.ctx.close()
}

// ── ② 대시보드 · 배차 ─────────────────────────────────────────────────────────
console.log('\n── ② 대시보드 ──')
{
  const schedules = [...F.schedules, row('sm', shift(-3))]
  const s = await open('admin', '/', { schedules })
  const board = flat(await s.p.locator('[data-tour="today-board"]').innerText().catch(() => ''))
  ok(/지난 일정 · 입력 없음/.test(board), '**PC 「지금 처리할 것」에 지난 일정 미입력**')
  ok(/독촉 대상/.test(board), '**독촉 대상이 할 일로**')
  const hrefs = await s.p.locator('[data-tour="today-board"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  ok(hrefs.includes('/history?status=missing'), '미입력 → 미입력 목록으로', hrefs.filter((h) => /history/.test(h ?? '')).join(','))
  const body = flat(await s.p.locator('main').innerText())
  ok(!/인증·실사 전 확인/.test(body), '**지어낸 「인증·실사 전 확인」이 없음**')
  await s.ctx.close()
  const m = await open('admin', '/', { schedules, w: 390, h: 844 })
  const mb = flat(await m.p.locator('main').innerText())
  ok(/지난 일정 · 입력 없음/.test(mb) && /독촉 대상/.test(mb), '폰 대시보드에도 같은 두 줄')
  await m.ctx.close()
  const dsp = await open('office', '/dispatch')
  const db = flat(await dsp.p.locator('main').innerText())
  ok(!/격리환자 발생 가능|보관창고 협소|인증기간 추가수거/.test(db), '**배차 화면에 지어낸 격리 경보 없음**')
  ok((await dsp.p.locator('[data-isolation-empty]').count()) === 1, '대신 「확인할 격리·보관기한 건이 없습니다」')
  await dsp.ctx.close()
}

// ── ③ 미수금 · 거래처 검색 ───────────────────────────────────────────────────
console.log('\n── ③ 미수금 · 거래처 ──')
{
  const s = await open('office', '/receivables')
  //  독촉 목록 접기 — 석 달 넘게 밀린 곳은 한 줄 요약
  const exp = s.p.locator('[data-dunning-expand]').first()
  if (await exp.count()) {
    const before = flat(await exp.innerText())
    ok(/미납 \d+개월 · \d{4}-\d{2} ~ \d{4}-\d{2}/.test(before), '**밀린 달이 많으면 「미납 N개월 · 언제~언제」 한 줄**', before)
    const id = await exp.getAttribute('data-dunning-expand')
    await exp.click(); await s.p.waitForTimeout(200)
    const after = flat(await s.p.locator(`[data-dunning-row="${id}"]`).innerText())
    ok((after.match(/\d{4}-\d{2} [\d,]+원/g) ?? []).length > 3, '누르면 달마다 펼쳐짐')
  } else ok(true, '(독촉 목록 접기 — 대상 없음)')
  await s.p.fill('[data-recv-search]', 'ㅊㅇㄹ')
  await s.p.waitForTimeout(300)
  const names = await s.p.locator('[data-recv-count] ~ div [class*="font-extrabold text-navy-900"]').allInnerTexts().catch(() => [])
  const body = flat(await s.p.locator('main').innerText())
  ok(/차오름병원/.test(body), '**초성 「ㅊㅇㄹ」으로 차오름병원**')
  const cards = await s.p.locator('[data-mark-paid]').count()
  ok(cards > 0, '검색 결과에 입금 처리 카드', `${cards}장`)
  //  남은 돈 큰 순
  await s.p.fill('[data-recv-search]', '')
  await s.p.locator('[data-recv-sort] button', { hasText: '남은 돈 큰 순' }).click()
  await s.p.waitForTimeout(300)
  const amounts = await s.p.locator('[data-mark-paid]').evaluateAll((bs) => bs.slice(0, 6).map((bt) => {
    const card = bt.closest('[class*="card"]'); const m = (card?.textContent ?? '').match(/([\d,]+)원/); return m ? Number(m[1].replace(/,/g, '')) : 0
  }))
  ok(amounts.length >= 2 && amounts.every((a, i) => i === 0 || amounts[i - 1] >= a), '**남은 돈 큰 순으로 줄 섬**', amounts.join(' ≥ '))
  void names
  await s.ctx.close()

  const c = await open('office', '/clients')
  const search = c.p.locator('input[placeholder*="초성"]')
  await search.fill('ㄱㄴㅇ'); await c.p.waitForTimeout(300)
  let t = flat(await c.p.locator('main').innerText())
  ok(/가나요양병원/.test(t) && !/다래의원/.test(t), '**거래처 초성 검색 「ㄱㄴㅇ」**')
  await search.fill('5000100'); await c.p.waitForTimeout(300)
  t = flat(await c.p.locator('main').innerText())
  ok(/가나요양병원/.test(t) && !/다래의원/.test(t), '**전화번호 숫자로 검색 「5000100」 → 02-500-0100**')
  await c.ctx.close()
}

// ── ④ 수거 입력 (현장 · 폰) ───────────────────────────────────────────────────
console.log('\n── ④ 수거 입력 ──')
const kstHm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
{
  //  시각 정렬 — 「9:00」이 「16:00」 뒤로 가던 것
  const schedules = [row('a16', T, { scheduled_time: '16:00', client_id: 'c2' }), row('a9', T, { scheduled_time: '9:00', client_id: 'c3' }),
    row('a10', T, { scheduled_time: '10:00', client_id: 'c4' })]
  const s = await open('field', '/collection', { w: 390, h: 844, schedules })
  const main = flat(await s.p.locator('main').innerText())
  const i9 = main.indexOf('09:00 ·'), i10 = main.indexOf('10:00 ·'), i16 = main.indexOf('16:00 ·')
  ok(i9 >= 0 && i9 < i10 && i10 < i16, '**「9:00」이 맨 앞 (09:00 < 10:00 < 16:00)**', `${i9} / ${i10} / ${i16}`)
  await s.ctx.close()
}
{
  //  오늘 일정 → 지금 시각 · 예상 kg 알림 · 못 누르는 이유 · 지도 · 같은 차
  const schedules = [
    row('x1', T, { scheduled_time: '00:05' }),
    //  오늘 앞 건 — 같은 기사(김준기)가 2호차로 완료
    row('x0', T, { client_id: 'c5', status: '완료', actual_amount: 90, vehicle_id: 'v2', driver_name: '김준기', completed_at: `${T}T00:30:00Z` }),
  ]
  const t0 = Date.now()
  const s = await open('field', '/collection?schedule=x1', { w: 390, h: 844, schedules })
  await s.p.waitForSelector('[data-actual-amount]', { timeout: 15000 })
  const body = flat(await s.p.locator('main').innerText())
  const okTime = [kstHm(t0), kstHm(t0 + 60_000), kstHm(Date.now())].some((hm) => body.includes(`${hm} 으로 저장`))
  ok(okTime && !body.includes('00:05 으로 저장'), '**오늘 일정은 실제 수거 시각 = 지금** (예정 00:05 아님)', (body.match(/\d{2}:\d{2} 으로 저장/) ?? [''])[0])
  ok((await s.p.locator('[data-amount-expected]').count()) === 1, '**예상 kg 그대로면 알림**', flat(await s.p.locator('[data-amount-expected]').innerText().catch(() => '')))
  await s.p.fill('[data-actual-amount]', '95'); await s.p.waitForTimeout(200)
  ok((await s.p.locator('[data-amount-expected]').count()) === 0, '고치면 알림이 사라짐')
  const miss = flat(await s.p.locator('[data-collect-missing]').innerText().catch(() => ''))
  ok(/차량/.test(miss), '**저장이 잠긴 이유 — 「차량」**', miss)
  const href = await s.p.locator('[data-collect-map]').getAttribute('href').catch(() => null)
  ok(!!href && href.startsWith('https://map.kakao.com/link/search/') && href.includes(encodeURIComponent('서울시 강남구 테헤란로')), '**주소를 누르면 카카오맵**', href ?? '')
  //  같은 차 — 자동으로 채우지 않고, 한 번 누르면 고름 (0128 결정 유지)
  ok((await s.p.locator('[data-vehicle-select]').inputValue()) === '', '차량은 자동으로 채우지 않음 (0128)')
  const same = s.p.locator('[data-vehicle-same-today="v2"]')
  ok((await same.count()) === 1, '**「오늘 앞 건과 같은 차 · 2호차」 단추**', flat(await same.innerText().catch(() => '')))
  await same.click(); await s.p.waitForTimeout(300)
  ok((await s.p.locator('[data-vehicle-select]').inputValue()) === 'v2', '한 번 누르면 2호차 선택')
  ok(!(await s.p.locator('[data-collect-save]').isDisabled()), '저장 단추가 열림')
  ok((await s.p.locator('[data-collect-missing]').count()) === 0, '이유 줄이 사라짐')
  await s.ctx.close()
}
{
  //  두 번째 방문 — 일정 없이 넣었는데 오늘 같은 병원 기록이 있다
  const calls = []
  const msg = '오늘 이 거래처의 의료폐기물 수거가 이미 저장되어 있습니다. 한 번 더 방문한 건이라면 "추가 수거"로 저장해 주세요.'
  const s = await open('field', '/collection', { w: 390, h: 844, schedules: [],
    extra: async (ctx) => {
      await ctx.route('**/rest/v1/rpc/complete_collection', (r) => {
        const body = r.request().postDataJSON(); calls.push(body)
        if (!body?.p?.isAdditional) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: msg }) })
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, eventId: 'e2', scheduleId: 'n2', warnings: [] }) })
      })
    } })
  await s.p.selectOption('#collection-client', 'c1')
  await s.p.fill('[data-actual-amount]', '100')
  await s.p.selectOption('[data-vehicle-select]', 'v1')
  await s.p.waitForTimeout(300)
  await s.p.locator('[data-collect-save]').click()
  await s.p.waitForSelector('[data-collect-dup]', { timeout: 15000 }).catch(() => {})
  const dup = flat(await s.p.locator('[data-collect-dup]').innerText().catch(() => ''))
  ok(/오늘 이 병원 수거가 이미 하나 저장돼 있습니다/.test(dup) && !/다시 넣지 않으셔도 됩니다/.test(dup),
    '**「다시 넣지 않으셔도 됩니다」라고 단정하지 않음**', dup.slice(0, 60))
  const add = s.p.locator('[data-collect-dup-additional]')
  ok((await add.count()) === 1, '**「추가 수거로 저장」 단추**')
  await add.click()
  await s.p.waitForSelector('[data-tour="collect-done"]', { timeout: 15000 }).catch(() => {})
  ok(calls.length === 2 && calls[1]?.p?.isAdditional === true, '**누르면 추가 수거로 다시 저장**', `호출 ${calls.length} · isAdditional=${calls[1]?.p?.isAdditional}`)
  ok((await s.p.locator('[data-tour="collect-done"]').count()) === 1, '저장 완료 화면')
  await s.ctx.close()
}
{
  //  예정 일정 다시 누름(응답만 끊겼던 것) → 예전 그대로 「이미 저장돼 있습니다」
  const s = await open('field', '/collection?schedule=y1', { w: 390, h: 844, schedules: [row('y1', T, { vehicle_id: 'v1' })],
    extra: async (ctx) => {
      await ctx.route('**/rest/v1/rpc/complete_collection', (r) => r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: 'P0001', message: '이미 완료 처리된 일정입니다. (중복 완료 방지)' }) }))
    } })
  await s.p.waitForSelector('[data-actual-amount]', { timeout: 15000 })
  await s.p.locator('[data-collect-save]').click()
  await s.p.waitForSelector('[data-collect-dup]', { timeout: 15000 }).catch(() => {})
  const dup = flat(await s.p.locator('[data-collect-dup]').innerText().catch(() => ''))
  ok(/이미 저장돼 있습니다 — 다시 넣지 않으셔도 됩니다/.test(dup), '예정 일정의 재시도는 그대로 「이미 저장」')
  ok((await s.p.locator('[data-collect-dup-additional]').count()) === 0, '이때는 「추가 수거」 단추 없음')
  await s.ctx.close()
}
{
  //  저장은 됐는데 다시 읽기만 실패 → 성공으로
  let saved = false
  const s = await open('field', '/collection?schedule=z1', { w: 390, h: 844, schedules: [row('z1', T, { vehicle_id: 'v1' })],
    extra: async (ctx) => {
      await ctx.route('**/rest/v1/rpc/complete_collection', (r) => { saved = true; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, eventId: 'e9', scheduleId: 'z1', warnings: [] }) }) })
      await ctx.route('**/rest/v1/schedules*', (r) => (saved ? r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"upstream"}' }) : r.fallback()))
    } })
  await s.p.waitForSelector('[data-actual-amount]', { timeout: 15000 })
  await s.p.locator('[data-collect-save]').click()
  await s.p.waitForSelector('[data-tour="collect-done"]', { timeout: 15000 }).catch(() => {})
  const body = flat(await s.p.locator('body').innerText())
  ok(saved && (await s.p.locator('[data-tour="collect-done"]').count()) === 1, '**저장 뒤 다시 읽기가 끊겨도 완료 화면**')
  ok(!/저장하지 못했습니다/.test(body), '「저장하지 못했습니다」가 뜨지 않음')
  await s.ctx.close()
}

await b.close()
