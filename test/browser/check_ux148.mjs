import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0148 — UI/UX 4차: 핵심 흐름을 처음부터 끝까지 눌러 보며 찾은 마찰
//
//   현장 하루 (폰 390 · 큰 글씨)
//    ① 수거 저장 뒤 — 「다음 방문 · 시각 병원」 단추가 **첫 화면(아래 탭 위)** 에 · 「오늘 남은 방문 N곳」
//       (예전: 「자동 연결됨」 목록 밑이라 아래 탭 뒤에 숨어 있었음) · 결과 화면은 맨 위부터
//    ② 마지막 방문까지 저장 → 「오늘 업무 마감하기」 → 오늘 일정의 마감 카드가 화면 안
//    ③ 오늘 일정 「다 마쳤습니다」 카드의 「오늘 업무 마감」 → 마감 카드로 (마감 카드가 없는 옛 서버에서는 단추도 없음)
//    ④ 저장 잠김 안내 — 「차량을 골라 주세요」 (예전 「차량 을(를) 채워 주세요」)
//    ⑤ 일정을 고르면 칸 번호가 1부터 (예전 3부터) · 「10월 21일 (수) 01:09 으로 저장」이 날짜/시각 덩어리로
//    ⑥ 오늘 일정 건수 줄 「3곳 · 완료 0」이 한 줄
//   사무실 (폰 390 · 큰 글씨)
//    ⑦ 고객 요청 — 숫자 카드 넉 장 대신 글자 한두 줄 → 첫 요청이 첫 화면 안 · 시각 「오늘 09:30」 · 「연결되는 매출: —」 없음
//    ⑧ 회신 저장 뒤 — 상태는 **그대로**(자동으로 안 바꿈) · 「「확인 중」으로 바꾸기」 한 번 → 그때만 저장
//    ⑨ 전화 요청 접수 — 초성(ㄷㄹ)으로 거래처 찾기 · 한 곳이면 바로 고름 · 단추 폭 반씩 · 잠긴 이유 · 접수 뒤 확인 줄
//    ⑩ 방문 예약 창 — 단추 폭(「이 날짜로 잡기」 한 줄) · 「실제 수거 시간」 제목 없음 · 비어 있으면 「안 정함」 · 오전/오후 안 눌림 · 시각 지우기
//    ⑪ 거래처 상세 — 「수거 입력」 한 줄 다 쓰기 · 단추 글자 한 줄 · 접힌 추천에 빈 띠 없음 · 「영업 진행 상태 보기」는 편 뒤에만
//    ⑫ 수거이력 — 폰에서 kg 가 화면 안 (거래처 옆) · 숫자 요약 한 줄
//    ⑬ 병원 이름 — 「의료법인 / 한양의료재단」 (낱말 한가운데서 안 끊김)
//
//   ⚠ 기대값은 검사가 스스로 셉니다 — 화면 값에 맞추지 않습니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const T = F.TODAY
const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
const b = await chromium.launch({ executablePath: EXEC })

const sched = (i, time) => ({
  id: `t${i}`, date: T, client_id: F.clients[i].id, waste_type: '의료폐기물', vehicle_id: null, scheduled_time: time,
  status: '예정', expected_amount: 100 + i * 10, actual_amount: null, completed_at: null, memo: '', origin: 'system',
  canceled_at: null, is_additional: false, created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z`,
})

async function open(role, path, { w = 390, h = 844, scale = 'lg', state: extraState = {}, extra } = {}) {
  const state = { reqs: 0, writes: [], schemaVersion: 123, profile: { ...W.profileFor(role), font_scale: scale }, ...extraState }
  const phone = w < 1024
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul' })
  W.wire(ctx, state)
  if (extra) await extra(ctx, state)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  await p.waitForTimeout(400)
  return { ctx, p, state, errors }
}
/** 아래 탭 윗변 — 폰에서 「첫 화면」의 바닥 */
const tabTop = (p) => p.evaluate(() => {
  const nav = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().top > innerHeight / 2)
  return nav ? nav.getBoundingClientRect().top : innerHeight
})
/** 이 요소의 **글자**가 몇 줄인가 (그림 · 여백은 세지 않습니다) */
const textLines = (el) => {
  const ys = new Set()
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.data.trim()) continue
    const r = document.createRange(); r.selectNodeContents(n)
    for (const q of r.getClientRects()) if (q.width > 1) ys.add(Math.round(q.bottom / 4))
  }
  return ys.size
}
const lines = (loc) => loc.evaluate(textLines)

// ── 현장 하루 ────────────────────────────────────────────────────────────────
console.log('\n── 현장 하루 (폰 390 · 큰 글씨) ──')
{
  const events = []
  const s0 = { schedules: [sched(0, '09:00'), sched(1, '10:30'), sched(2, '13:00'), ...F.schedules.filter((x) => x.date !== T)] }
  s0.rpc = (url, req) => {
    if (!url.includes('complete_collection')) return null
    const q = (JSON.parse(req.postData() ?? '{}').p) ?? {}
    const n = events.length + 1
    s0.schedules = s0.schedules.map((x) => x.id === q.scheduleId ? { ...x, status: '완료', actual_amount: Number(q.actualAmount), completed_at: new Date().toISOString(), vehicle_id: q.vehicleId, driver_name: q.driverName, handover_status: q.handoverStatus, event_id: `ev${n}` } : x)
    events.push({ id: `ev${n}`, at: new Date().toISOString(), actor_id: F.UID, actor_name: '김준기', actor_role: 'field', screen: '수거 입력', action: '수거 완료', schedule_id: q.scheduleId, created_schedule: false, client_id: q.clientId, client_name: '', waste_type: '의료폐기물', amount_kg: Number(q.actualAmount), before_state: { status: '예정' }, material_ids: [], stock_before: {}, request_updates: [], note: '', reverted: false, reverted_at: null, demo_session_id: null, input_duration_ms: 9000 })
    return { ok: true, scheduleId: q.scheduleId, eventId: `ev${n}`, warnings: [] }
  }
  const { ctx, p, errors } = await open('field', '/today', {
    state: s0,
    extra: (c, st) => { c.route('**/rest/v1/collection_events**', (r) => json(r, events)); Object.assign(st, s0); st.rpc = (...a) => { const v = s0.rpc(...a); st.schedules = s0.schedules; return v } },
  })
  // ⑥ 건수 줄
  const sub = p.locator('[data-day-sub]')
  ok((await lines(sub)) === 1, '⑥ 오늘 일정 건수 줄 「3곳 · 완료 0」이 한 줄', flat(await sub.innerText()))

  await p.evaluate(() => [...document.querySelectorAll('main button')].find((e) => e.getBoundingClientRect().height > 2 && /수거 입력 시작/.test(e.innerText))?.click())
  await p.waitForSelector('#collection-amount', { timeout: 15000 })
  await p.waitForTimeout(500)
  // ⑤ 칸 번호 · 시간 줄
  const firstNo = await p.evaluate(() => {
    const sec = [...document.querySelectorAll('main h2')].find((h) => /실제 수거 시간/.test(h.textContent ?? ''))
    return sec?.closest('div')?.parentElement?.querySelector('span')?.textContent?.trim() ?? ''
  })
  ok(firstNo === '1', '⑤ 일정을 고르면 「실제 수거 시간 · 수거량」이 1번 (예전 3번)', firstNo)
  const timeLine = p.locator('[data-fold-summary="time"]')
  const tl = flat(await timeLine.innerText())
  ok(/\d{2}:\d{2} 으로 저장/.test(tl), '⑤ 「HH:MM 으로 저장」 글자 그대로', tl)
  ok((await lines(timeLine)) <= 2, '⑤ 시간 줄이 두 줄 이하 (날짜 / 시각 덩어리)', `${await lines(timeLine)}줄`)
  // ④ 잠김 안내
  await p.fill('#collection-amount', '118')
  await p.waitForTimeout(200)
  const miss = flat(await p.locator('[data-collect-missing]').innerText())
  ok(/차량을 골라 주세요/.test(miss) && !/을\(를\)/.test(miss), '④ 「저장하려면 차량을 골라 주세요」', miss)
  const v = await p.locator('[data-vehicle-select] option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean))
  await p.locator('[data-vehicle-select]').selectOption(v[0])
  await p.locator('[data-collect-save]').click()
  await p.waitForSelector('[data-tour="collect-done"]', { timeout: 15000 })
  await p.waitForTimeout(500)
  // ① 저장 뒤
  const next = p.locator('[data-collect-next]')
  const nb = await next.boundingBox()
  const bottom = await tabTop(p)
  ok(!!nb && nb.y + nb.height <= bottom, '① 「다음 방문」 단추가 첫 화면 안 (아래 탭 위)', nb ? `단추 아래 ${Math.round(nb.y + nb.height)} · 탭 ${Math.round(bottom)}` : '없음')
  const nt = flat(await next.innerText())
  ok(/다음 방문 · 10:30 가나요양병원/.test(nt), '① 단추에 다음 곳의 시각 · 이름', nt)
  ok(flat(await p.locator('[data-collect-left]').innerText()) === '오늘 남은 방문 2곳', '① 「오늘 남은 방문 2곳」', flat(await p.locator('[data-collect-left]').innerText()))
  ok(await p.evaluate(() => scrollY) < 5, '① 결과 화면은 맨 위부터 (저장 단추 자리에 머물지 않음)', `scrollY ${await p.evaluate(() => scrollY)}`)
  const linkedY = (await p.locator('[data-collect-linked]').boundingBox())?.y ?? 0
  ok(linkedY > nb.y, '① 「자동 연결됨」 목록은 그대로 있고, 다음 할 일 아래', `${Math.round(linkedY)} > ${Math.round(nb.y)}`)
  // 둘째 · 셋째
  for (const kg of ['95', '130']) {
    await p.locator('[data-collect-next]').click()
    await p.waitForSelector('#collection-amount', { timeout: 10000 })
    await p.waitForTimeout(400)
    const same = p.locator('[data-vehicle-same-today]')
    if (await same.count()) await same.click()
    await p.fill('#collection-amount', kg)
    await p.locator('[data-collect-save]').click()
    await p.waitForSelector('[data-tour="collect-done"]', { timeout: 15000 })
    await p.waitForTimeout(400)
  }
  // ② 다 끝 → 업무 마감
  ok((await p.locator('[data-collect-next]').count()) === 0, '② 세 곳 다 넣으면 「다음 방문」이 없음')
  const go = p.locator('[data-collect-go-close]')
  ok((await go.count()) === 1 && (await lines(go)) === 1, '② 「오늘 업무 마감하기」 단추 (한 줄)', flat(await go.innerText().catch(() => '')))
  await go.click()
  await p.waitForTimeout(1500)
  ok(new URL(p.url()).pathname === '/today' && new URL(p.url()).hash === '#day-close', '② 오늘 일정의 마감 자리로', p.url().replace(W.BASE, ''))
  const dc = await p.locator('#day-close').boundingBox()
  ok(!!dc && dc.y < (await tabTop(p)) && dc.y + 60 > 0, '② 마감 카드가 화면 안 (맨 아래까지 밀지 않아도 됨)', dc ? `y ${Math.round(dc.y)}` : '없음')
  // ③ 「다 마쳤습니다」 카드에서
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(300)
  const goDc = p.locator('[data-go-day-close]')
  ok((await goDc.count()) === 1, '③ 「오늘 방문을 모두 마쳤습니다」 카드에 「오늘 업무 마감」')
  await goDc.click()
  await p.waitForTimeout(1200)
  const dc2 = await p.locator('#day-close').boundingBox()
  ok(!!dc2 && dc2.y < (await tabTop(p)) && dc2.y + 60 > 0, '③ 누르면 마감 카드로 화면이 옮겨짐', dc2 ? `y ${Math.round(dc2.y)}` : '없음')
  ok(errors.length === 0, '현장 흐름 — 스크립트 오류 없음', errors.join(' | '))
  await ctx.close()
}

//  ③ 마감 카드가 없는 서버(판 73 전)에서는 「오늘 업무 마감」으로 보내는 단추도 없음 — 눌러도 갈 곳이 없으니까
{
  const allDone = [0, 1, 2].map((i) => ({ ...sched(i, `${9 + i}:00`), status: '완료', actual_amount: 100, completed_at: new Date().toISOString(), driver_name: '김준기', vehicle_id: 'v1' }))
  const { ctx, p } = await open('field', '/today', { state: { schemaVersion: 72, schedules: [...allDone, ...F.schedules.filter((x) => x.date !== T)] } })
  ok(/오늘 방문을 모두 마쳤습니다/.test(flat(await p.locator('main').innerText())), '③ (판 72) 「다 마쳤습니다」 카드는 그대로')
  ok((await p.locator('[data-go-day-close]').count()) === 0 && (await p.locator('#day-close').count()) === 0, '③ (판 72) 마감 카드가 없으면 「오늘 업무 마감」 단추도 없음')
  await ctx.close()
}

// ── 사무실 ───────────────────────────────────────────────────────────────────
console.log('\n── 사무실 (폰 390 · 큰 글씨) ──')
const day = (n) => { const d = new Date(`${T}T12:00:00+09:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) }
function requestServer() {
  const srv = {
    patches: [], posts: [],
    rows: [
      { id: 'q1', client_id: F.clients[0].id, kind: '긴급수거', content: '보관실이 가득 찼습니다', desired_date: day(1), urgent: true, status: '접수', source: 'portal', requester_name: '홍길동', reply: '', handled_by: null, handled_at: null, created_at: `${T}T00:30:00Z`, updated_at: '' },
      { id: 'q2', client_id: F.clients[1].id, kind: '소모품', content: '20L 용기 10개', desired_date: null, urgent: false, status: '접수', source: 'portal', requester_name: '이영희', reply: '', handled_by: null, handled_at: null, created_at: `${day(-1)}T05:00:00Z`, updated_at: '' },
      { id: 'q3', client_id: F.clients[2].id, kind: '기타', content: '청구 금액 확인 부탁', desired_date: null, urgent: false, status: '확인 중', source: 'portal', requester_name: '박민수', reply: '확인 중입니다', handled_by: null, handled_at: null, created_at: `${day(-3)}T02:00:00Z`, updated_at: '' },
    ],
  }
  srv.route = (ctx) => ctx.route('**/rest/v1/client_requests**', (r) => {
    const req = r.request()
    if (req.method() === 'GET') return json(r, srv.rows)
    const body = JSON.parse(req.postData() ?? '{}')
    if (req.method() === 'POST') {
      srv.posts.push(body)
      const row = { id: `n${srv.posts.length}`, reply: '', handled_by: null, handled_at: null, created_at: new Date().toISOString(), updated_at: '', ...body }
      srv.rows = [row, ...srv.rows]
      return json(r, [row])
    }
    const id = new URL(req.url()).searchParams.get('id')?.replace('eq.', '')
    srv.patches.push({ id, body })
    srv.rows = srv.rows.map((x) => (x.id === id ? { ...x, ...body } : x))
    return json(r, srv.rows.filter((x) => x.id === id))
  })
  return srv
}
{
  const srv = requestServer()
  const { ctx, p, errors } = await open('office', '/requests', { extra: (c) => srv.route(c) })
  // ⑦
  const stats = flat(await p.locator('[data-req-stats-compact]').innerText())
  ok(/처리 대기 3건/.test(stats) && /처리 완료 0건/.test(stats), '⑦ 폰 — 숫자 요약이 글자 한 덩어리로 (처리 대기 3건 · 처리 완료 0건)', stats)
  const sh = (await p.locator('[data-req-stats-compact]').boundingBox())?.height ?? 999
  ok(sh <= 90, '⑦ 숫자 요약이 두 줄 높이 안', `${Math.round(sh)}px (예전 카드 넉 장 ≈ 300px)`)
  const firstCard = await p.locator('[data-req-status="접수"]').first().evaluate((el) => el.closest('.card').getBoundingClientRect().top)
  ok(firstCard < (await tabTop(p)), '⑦ 첫 요청 카드가 첫 화면 안에서 시작', `y ${Math.round(firstCard)}`)
  const whens = (await p.locator('[data-req-when]').allInnerTexts()).map(flat)
  ok(/^오늘 \d{2}:\d{2}$/.test(whens[0] ?? '') && /^어제 \d{2}:\d{2}$/.test(whens[1] ?? ''), '⑦ 시각 「오늘 09:30」 · 「어제 14:00」', whens.join(' / '))
  const body = flat(await p.locator('main').innerText())
  ok(!/연결되는 매출: —/.test(body) && /연결되는 매출: 추가 수거 매출/.test(body), '⑦ 「기타」 요청에 「연결되는 매출: —」 없음 (다른 요청은 그대로)')
  ok(/희망일 \d{1,2}월 \d{1,2}일 \(.\)/.test(body), '⑦ 희망일 「10월 22일 (목)」 꼴', (body.match(/희망일 [^·]{0,14}/) ?? [''])[0])
  const chipH = await p.locator('[data-req-status]').evaluateAll((els) => Math.min(...els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect().height)))
  ok(chipH >= 44, '⑦ 상태 단추 손가락 높이', `${Math.round(chipH)}px`)

  // ⑧ 회신 → 상태는 그대로 · 권하기만
  await p.locator('[data-presenter="reply-open"]').first().click()
  await p.waitForTimeout(500)
  await p.locator('textarea').first().fill('오늘 오후 3시쯤 가겠습니다')
  await p.locator('[data-reply-save]').click()
  await p.waitForTimeout(1200)
  ok(srv.patches.length === 1 && srv.patches[0].body.reply && !('status' in srv.patches[0].body), '⑧ 회신 저장 — 상태는 **안 바꿈** (회신만 보냄)', JSON.stringify(srv.patches[0]?.body ?? {}))
  const sug = p.locator('[data-req-suggest="확인 중"]')
  ok((await sug.count()) === 1, '⑧ 「「확인 중」으로 바꾸기」 단추가 그 요청에', flat(await sug.innerText().catch(() => '')))
  const sb = await sug.boundingBox()
  ok(!!sb && sb.height >= 44, '⑧ 손가락 높이', `${Math.round(sb?.height ?? 0)}px`)
  await sug.click()
  await p.waitForTimeout(1200)
  ok(srv.patches.length === 2 && srv.patches[1].id === 'q1' && srv.patches[1].body.status === '확인 중', '⑧ 누르면 그때 「확인 중」 저장', JSON.stringify(srv.patches[1] ?? {}))
  ok((await p.locator('[data-req-suggest]').count()) === 0, '⑧ 바꾼 뒤에는 단추가 사라짐')

  // ⑨ 전화 요청 접수
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.getByRole('button', { name: /전화 요청 접수/ }).first().click()
  await p.waitForTimeout(600)
  ok(flat(await p.locator('[data-new-req-missing]').innerText()) === '거래처를 고르고 내용을 적으면 접수됩니다', '⑨ 잠긴 이유가 단추 위에')
  const target = F.clients.find((c) => c.name === '다래의원')
  await p.locator('[data-new-req-search]').fill('ㄷㄹ')
  await p.waitForTimeout(300)
  ok((await p.locator('#nr-client').inputValue()) === target.id, '⑨ 초성 「ㄷㄹ」 → 한 곳뿐이라 다래의원을 바로 고름', await p.locator('#nr-client').inputValue())
  await p.locator('[data-new-req-search]').fill('없는병원이름')
  await p.waitForTimeout(200)
  ok((await p.locator('[data-new-req-nohit]').count()) === 1 && (await p.locator('#nr-client').inputValue()) === target.id, '⑨ 맞는 곳이 없으면 그렇다고 · 고른 곳은 그대로')
  await p.locator('#nr-content').fill('내일 추가 수거 부탁드립니다')
  await p.waitForTimeout(200)
  ok((await p.locator('[data-new-req-missing]').count()) === 0, '⑨ 다 채우면 안내 줄이 사라짐')
  const fw = await p.locator('[data-modal-footer]').last().evaluate((el) => ({ w: el.getBoundingClientRect().width, b: [...el.querySelectorAll('button')].map((x) => x.getBoundingClientRect().width) }))
  ok(fw.b.length === 2 && fw.b.every((x) => x >= fw.w * 0.4), '⑨ 「취소 · 접수」 단추가 폭을 반씩 (예전: 왼쪽에 작게 몰림)', `${fw.b.map(Math.round).join(' · ')} / ${Math.round(fw.w)}`)
  await p.locator('[data-new-req-save]').click()
  await p.waitForTimeout(1200)
  ok(srv.posts.length === 1 && srv.posts[0].client_id === target.id && srv.posts[0].source === 'staff', '⑨ 그 거래처로 「전화 접수」가 나감', JSON.stringify(srv.posts[0] ?? {}).slice(0, 100))
  const done = flat(await p.locator('[data-new-req-done]').innerText().catch(() => ''))
  ok(/다래의원 요청을 접수했습니다/.test(done), '⑨ 창이 닫힌 뒤 「다래의원 요청을 접수했습니다」', done)

  // ⑩ 방문 예약 창
  await p.locator('[data-book-req="q1"]').click()
  await p.locator('[data-book-modal]').waitFor({ state: 'visible', timeout: 5000 })
  const modal = p.locator('[data-book-modal]')
  ok(!/실제 수거 시간/.test(flat(await modal.innerText())), '⑩ 예약 창에 「실제 수거 시간」 제목 없음 (위 「방문 시각」만)')
  ok((await p.locator('[data-time-unset]').count()) === 1, '⑩ 시각을 안 정했으면 「안 정함」이라고 적힘', flat(await p.locator('[data-time-value]').innerText()))
  const pressed = await p.locator('[data-time-ampm][aria-pressed="true"]').count()
  ok(pressed === 0, '⑩ 안 정했으면 오전 · 오후 어느 쪽도 눌려 보이지 않음')
  await p.locator('[data-time-ampm="오후"]').click()
  await p.waitForTimeout(200)
  ok((await p.locator('[data-time-value]').getAttribute('data-time-value')) === '21:00' && (await p.locator('[data-time-clear]').count()) === 1, '⑩ 고르면 정해지고 「시각 지우기」가 생김', await p.locator('[data-time-value]').getAttribute('data-time-value'))
  await p.locator('[data-time-clear]').click()
  await p.waitForTimeout(200)
  ok((await p.locator('[data-time-value]').getAttribute('data-time-value')) === '', '⑩ 「시각 지우기」 → 다시 안 정함')
  const bf = await p.locator('[data-modal-footer]').last().evaluate((el) => ({ w: el.getBoundingClientRect().width, b: [...el.querySelectorAll('button')].map((x) => [x.getBoundingClientRect().width, x.getBoundingClientRect().height]) }))
  const sum = bf.b.reduce((n, [x]) => n + x, 0)
  ok(sum >= bf.w * 0.9, '⑩ 예약 창 단추가 폭을 다 씀', `${Math.round(sum)} / ${Math.round(bf.w)}`)
  ok((await lines(p.locator('[data-book-submit]'))) === 1, '⑩ 「이 날짜로 잡기」가 한 줄 (예전 두 줄)')
  ok(errors.length === 0, '사무실 요청 흐름 — 스크립트 오류 없음', errors.join(' | '))
  await ctx.close()
}
// ⑪ 거래처 상세
{
  const { ctx, p } = await open('office', `/clients/${F.clients[0].id}`)
  const go = p.locator(`[data-go-collect="${F.clients[0].id}"]`)
  const gb = await go.boundingBox()
  const card = await go.evaluate((el) => el.parentElement.getBoundingClientRect().width)
  ok(!!gb && gb.width >= card * 0.95, '⑪ 「수거 입력」이 한 줄을 다 씀', `${Math.round(gb?.width ?? 0)} / ${Math.round(card)}`)
  const multi = await go.evaluate((el, src) => {
    const textLines = new Function(`return (${src})`)()
    return [...el.parentElement.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0).map((x) => [x.innerText.trim(), textLines(x)])
  }, textLines.toString())
  ok(multi.length >= 3 && multi.every(([, n]) => n === 1), '⑪ 단추 글자가 모두 한 줄 (예전 「수거 / 입력」 · 「수거대장 / 보기」)', multi.map(([t, n]) => `${t}:${n}`).join(' · '))
  const icons = await go.evaluate((el) => [...el.parentElement.querySelectorAll('button svg')].filter((s) => s.getBoundingClientRect().width > 0).map((s) => Math.round(s.getBoundingClientRect().width)))
  ok(icons.every((x) => x >= 15), '⑪ 단추 그림이 찌그러지지 않음', icons.join(','))
  const emptyBar = await p.evaluate(() => [...document.querySelectorAll('.divide-y.bg-navy-50')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 30 && !e.innerText.trim() }).length)
  ok(emptyBar === 0, '⑪ 접힌 추천 자리에 속 빈 회색 띠가 없음')
  if ((await p.locator('[data-actions-more]').count()) > 0) {
    ok((await p.locator('[data-stage-open]').count()) === 0, '⑪ 접혀 있으면 「영업 진행 상태 보기」가 없음 (눌러도 아무것도 안 보이던 단추)')
    await p.locator('[data-actions-more]').click()
    await p.waitForTimeout(400)
    const st = p.locator('[data-stage-open]')
    ok((await st.count()) === 1, '⑪ 추천을 펴면 「영업 진행 상태 보기」가 나옴')
    const before = await p.evaluate(() => document.documentElement.scrollHeight)
    await st.click()
    await p.waitForTimeout(400)
    ok((await p.evaluate(() => document.documentElement.scrollHeight)) > before, '⑪ 누르면 실제로 펼쳐짐')
  } else ok(true, '⑪ (이 거래처는 추천 없음 — 건너뜀)')
  // ⑬ 병원 이름
  const h1 = p.locator('main h1').first()
  const h1t = await h1.evaluate((el) => {
    const r = document.createRange(); r.selectNodeContents(el)
    const rects = [...r.getClientRects()].filter((q) => q.width > 1)
    return { lines: new Set(rects.map((q) => Math.round(q.top))).size, text: el.innerText }
  })
  ok(h1t.text.replace(/\s+/g, '') === '의료법인한양의료재단', '⑬ 이름 글자는 그대로', h1t.text)
  const firstLine = await h1.evaluate((el) => {
    const t = el.textContent ?? ''; const r = document.createRange(); const tn = [...el.childNodes].filter((n) => n.nodeType === 3)
    let y0 = null; let out = ''
    for (const n of tn) for (let i = 0; i < n.length; i++) { r.setStart(n, i); r.setEnd(n, i + 1); const y = Math.round(r.getBoundingClientRect().top); if (y0 == null) y0 = y; if (y === y0) out += n.data[i] }
    return { out, t }
  })
  ok(h1t.lines === 1 || firstLine.out === '의료법인', '⑬ 줄이 갈리면 「의료법인 / 한양의료재단」 (낱말 한가운데서 안 끊김)', `${h1t.lines}줄 · 첫 줄 「${firstLine.out}」`)
  await ctx.close()
}
// ⑫ 수거이력
{
  const { ctx, p } = await open('office', '/history')
  const kg = p.locator('[data-history-kg-inline]').first()
  const kb = await kg.boundingBox()
  ok(!!kb && kb.x + kb.width <= 390 && kb.width > 0, '⑫ 폰 — 첫 줄의 kg 가 화면 안 (예전: 표 밖으로 밀림)', kb ? `${Math.round(kb.x + kb.width)}px` : '없음')
  const kgText = flat(await kg.innerText())
  const firstId = await p.locator('[data-history-row]').first().getAttribute('data-history-row')
  const src = F.schedules.find((x) => x.id === firstId)
  ok(kgText === `${src.actual_amount}kg`, '⑫ 그 줄의 실제 수거량 그대로', `${kgText} · 자료 ${src.actual_amount}kg`)
  const kpi = p.locator('[data-history-kpi-compact]')
  ok(((await kpi.boundingBox())?.height ?? 999) <= 130, '⑫ 숫자 요약이 몇 줄 안 (예전 카드 넉 장)', `${Math.round((await kpi.boundingBox())?.height ?? 0)}px`)
  const done = F.schedules.filter((x) => x.status === '완료' && x.date <= T).length
  ok(new RegExp(`수거건수 ${done.toLocaleString('ko-KR')}건`).test(flat(await kpi.innerText())), '⑫ 수거건수 = 자료에서 센 완료 건수', `${flat(await kpi.innerText()).slice(0, 30)} · 셈 ${done}`)
  await ctx.close()
  //  PC 는 그대로 — 수거량 칸이 따로, 「현장입력」 딱지도
  const pc = await open('office', '/history', { w: 1440, h: 900, scale: 'normal' })
  const heads = (await pc.p.locator('thead th').allInnerTexts()).map(flat)
  ok(heads[1] === '거래처' && heads[2] === '수거량' && heads[5] === '기사', 'PC — 「날짜 · 거래처 · 수거량 …」, 기사는 여섯째 그대로', heads.join(','))
  ok((await pc.p.locator('[data-history-kg-inline]').first().isVisible()) === false, 'PC — 거래처 칸 안 kg 는 안 보임 (따로 된 칸)')
  await pc.ctx.close()
}
// ⑬ 포털 머리글
{
  const { ctx, p } = await open('client', '/portal')
  const name = await p.evaluate(() => {
    const el = [...document.querySelectorAll('header *')].find((e) => e.childElementCount <= 1 && /의료법인/.test(e.textContent ?? '') && /한양의료재단/.test(e.textContent ?? ''))
    if (!el) return null
    const r = document.createRange(); r.selectNodeContents(el)
    const rows = new Map()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) for (let i = 0; i < n.length; i++) {
      r.setStart(n, i); r.setEnd(n, i + 1); const y = Math.round(r.getBoundingClientRect().top)
      rows.set(y, (rows.get(y) ?? '') + n.data[i])
    }
    return [...rows.values()]
  })
  ok(!!name && (name.length === 1 || name[0] === '의료법인'), '⑬ 포털 머리글 — 「의료법인 / 한양의료재단」', JSON.stringify(name))
  await ctx.close()
}

await b.close()
