import { chromium, EXEC } from './_pw.mjs'

//  0077 — 「이 일정 누가 넣었지?」 · 기사님이 본인 일정을 정리한다
//
//   대표님: 「남양주백병원 09:00 같은 일정처럼 "이게 누가 넣은 일정인지
//   모르겠다"는 상황이 다시 생기지 않게 해줘.」
//
//   확인하는 것
//    · 일정 줄에서 ⋯ 하나로 상세가 열린다 (폰 · PC)
//    · 누가 · 언제 · 어떻게 생긴 일정인지 보인다
//    · 내가 넣은 미완료 일정은 여기서 취소·시간변경
//    · 사무실이 잡은 일정은 못 고치고, **왜 못 고치는지 그 자리에서** 말해 준다
//    · 수거기록이 붙은 일정은 그 수거기록으로 가라고 말해 준다
//    · 이름이 없는 옛 일정은 지어내지 않는다
//    · 판 76 이하에서는 고치는 단추가 안 뜬다

const BASE = 'http://localhost:4173'
const FD = '00000000-0000-0000-0000-0000000000f1'
const AD = '00000000-0000-0000-0000-0000000000a9'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '남양주백병원', type: '병원', address: '경기도 남양주시 오남읍 1',
  manager: '김', phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '', active: true }]

const mkSched = (id, over = {}) => ({
  id, client_id: C1, date: T, waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
  status: '예정', expected_amount: 100, actual_amount: null, memo: '', origin: 'system',
  created_at: `${T}T00:10:00Z`, created_by: AD, created_by_name: '송대표', created_via: '사무실 배정',
  event_id: null, canceled_at: null, cancel_reason: '', ...over,
})

const E1 = '00000000-0000-0000-0000-0000000000e1'
const mkEvent = (over = {}) => ({
  id: E1, at: `${T}T00:40:00Z`, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
  schedule_id: 's1', created_schedule: false, client_id: C1, client_name: '남양주백병원',
  waste_type: '의료폐기물', amount_kg: 120, before_state: { status: '예정', actualAmount: null, handoverStatus: null },
  material_ids: [], stock_before: null, request_updates: [], note: '', reverted: false,
  reverted_at: null, demo_session_id: null, input_duration_ms: null, ...over,
})

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'field', w = 390, scheds = [], events = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700, hasTouch: w < 700 })
  const uid = role === 'field' ? FD : AD
  const me = { id: uid, email: 'f@b.c', name: role === 'field' ? '김준기' : '송대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/cancel_my_visit')) {
      state.calls.push(['cancel', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/retime_my_visit')) {
      state.calls.push(['retime', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/material_transactions')) return json([])
    if (url.includes('/collection_events')) return json(events)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicle_reservations')) return json([])
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1300)
  return { ctx, p, state }
}

// ── ① 「누가 넣었지?」가 줄에서부터 보인다 ─────────────────────────────────
{
  const { ctx, p } = await open(77, { scheds: [mkSched('s1')] })
  //  ⚠ 대표님이 실제로 보신 그 화면입니다 — 「남양주백병원 09:00」.
  const more = p.locator('[data-sched-more="s1"]')
  ok((await more.count()) === 1, '**일정 줄에 ⋯(자세히)가 있다**')
  ok(/사무실 배정/.test(flat(await more.innerText())),
    '**줄에서부터 누가 넣었는지 갈린다** (열어 보기 전에)', flat(await more.innerText()))
  const box = await more.boundingBox()
  ok((box?.height ?? 0) >= 44, '손가락 크기', `${Math.round(box?.height ?? 0)}px`)

  await more.click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched]').count()) === 1, '누르면 상세가 열린다')
  const t = flat(await p.locator('[data-sched-origin]').innerText())
  ok(/사무실 배정/.test(t), '어떻게 생긴 일정인지', t)
  ok(/송대표 님이 넣었습니다/.test(t), '**누가 넣었는지**', t)
  ok(/들어옴/.test(t), '**언제 들어왔는지**', t)
  //  병원 정보를 여기서 바로 — 「다른 메뉴로 가야 하나」를 없앱니다.
  const all = flat(await p.locator('[data-sched]').innerText())
  ok(/오남읍/.test(all) && /031-000-0000/.test(all), '주소·전화도 여기서 바로 보인다')
  await ctx.close()
}

// ── ② 사무실이 잡은 일정 — 못 고치고, 왜 못 고치는지 말해 준다 ────────────
{
  const { ctx, p } = await open(77, { scheds: [mkSched('s1')] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '사무실이 잡은 일정은 취소 단추가 없다')
  //  ⚠ 단추만 없으면 「어디 있지?」가 되고 결국 사무실에 전화합니다.
  const why = flat(await p.locator('[data-sched-why]').innerText())
  ok(/사무실에 말씀/.test(why), '**왜 못 고치는지 그 자리에서 말해 준다**', why)
  await ctx.close()
}

// ── ③ 내가 넣은 일정 — 여기서 취소·시간변경 ───────────────────────────────
{
  const mine = mkSched('s1', { created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가', origin: 'field' })
  const { ctx, p, state } = await open(77, { scheds: [mine] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  const t = flat(await p.locator('[data-sched-origin]').innerText())
  ok(/기사 직접 추가/.test(t) && /내가 넣은 일정/.test(t), '**내가 넣은 것이라고 알려 준다**', t)
  ok((await p.locator('[data-sched-cancel]').count()) === 1, '**일정 취소가 있다**')
  ok((await p.locator('[data-sched-retime]').count()) === 1, '**시간 바꾸기가 있다**')

  //  취소 — 이유 없이는 못 누릅니다
  await p.locator('[data-sched-cancel]').click()
  await p.waitForTimeout(500)
  ok(await p.locator('[data-sched-cancel-go]').isDisabled(), '이유 없이는 못 무른다')
  const body = flat(await p.locator('[data-sched]').innerText())
  ok(/지우지 않고 남습니다|기록은 지우지 않고/.test(body), '**지우는 게 아니라고 적혀 있다**', body.slice(-90))
  await p.locator('[data-sched-reason]').fill('병원이 오늘 쉰다고 합니다')
  await p.waitForTimeout(300)
  await p.locator('[data-sched-cancel-go]').click()
  await p.waitForTimeout(1400)
  const sent = state.calls.find(([k]) => k === 'cancel')
  ok(!!sent, '**취소가 서버로 감**', JSON.stringify(state.calls).slice(0, 60))
  ok(sent?.[1]?.p_reason === '병원이 오늘 쉰다고 합니다', '이유가 그대로 감', String(sent?.[1]?.p_reason))
  await ctx.close()
}
{
  const mine = mkSched('s1', { created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가' })
  const { ctx, p, state } = await open(77, { scheds: [mine] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  await p.locator('[data-sched-retime]').click()
  await p.waitForTimeout(500)
  ok(await p.locator('[data-sched-retime-go]').isDisabled(), '같은 시간이면 못 누른다')
  const t = flat(await p.locator('[data-sched]').innerText())
  ok(/날짜를 옮기시려면 사무실/.test(t), '**날짜 이동은 사무실 일이라고 적혀 있다**', t.slice(-80))
  await ctx.close()
}

// ── ④ 수거기록이 붙은 일정 ────────────────────────────────────────────────
{
  const done = mkSched('s1', {
    created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가',
    status: '완료', actual_amount: 120, event_id: '00000000-0000-0000-0000-0000000000e1',
  })
  const { ctx, p } = await open(77, { scheds: [done], events: [mkEvent()] })
  //  ⚠ 끝난 일정에도 ⋯ 는 그대로 둡니다 — 「누가 넣은 일정인지」는 다녀온
  //    뒤에도 묻습니다. 대신 **고치는 길은 수거기록 쪽**으로 보냅니다.
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '끝난 일정은 여기서 못 무른다')
  ok((await p.locator('[data-sched-go-record]').count()) === 1,
    '**막다른 길이 아니라 「수거기록 열기」로 데려다준다**')
  await p.locator('[data-sched-go-record]').click()
  await p.waitForTimeout(900)
  ok((await p.locator('[data-record]').count()) === 1, '눌렀더니 그 수거기록이 열린다')
  await ctx.close()
}
{
  //  아직 완료는 아닌데 수거기록이 붙은 어긋난 줄 — 그래도 안전하게 말해 줍니다.
  const linked = mkSched('s1', {
    created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가',
    event_id: '00000000-0000-0000-0000-0000000000e1',
  })
  const { ctx, p } = await open(77, { scheds: [linked] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '수거기록이 붙어 있으면 취소가 없다')
  ok(/수거기록/.test(flat(await p.locator('[data-sched-why]').innerText())),
    '**그 수거기록으로 가라고 말해 준다**', flat(await p.locator('[data-sched-why]').innerText()))
  await ctx.close()
}

// ── ⑤ 이름이 없는 옛 일정 — 지어내지 않는다 ───────────────────────────────
{
  const old = mkSched('s1', { created_by: null, created_by_name: '', created_via: '엑셀·초기 자료', origin: 'migrated' })
  const { ctx, p } = await open(77, { scheds: [old] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched-noname]').count()) === 1,
    '**이름이 없으면 없다고 적는다** (지어내지 않음)')
  ok(/엑셀·초기 자료/.test(flat(await p.locator('[data-sched-origin]').innerText())),
    '그래도 어디서 온 자료인지는 안다')
  await ctx.close()
}

// ── ⑥ PC 에서도 · 판 76 이하 ──────────────────────────────────────────────
{
  const mine = mkSched('s1', { created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가' })
  const { ctx, p } = await open(77, { w: 1280, scheds: [mine] })
  ok((await p.locator('[data-sched-more-pc="s1"]').count()) === 1, 'PC 에도 「자세히」가 있다')
  await p.locator('[data-sched-more-pc="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched-cancel]').count()) === 1, 'PC 에서도 취소할 수 있다')
  await ctx.close()
}
{
  const mine = mkSched('s1', { created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가' })
  const { ctx, p } = await open(76, { scheds: [mine] })
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-sched]').count()) === 1, '판 76 에서도 상세는 보인다 (읽는 것은 막지 않음)')
  ok((await p.locator('[data-sched-cancel]').count()) === 0,
    '**판 76 에서는 고치는 단추가 없다** (서버에 그 함수가 없습니다)')
  await ctx.close()
}

// ── ⑦ 도움말 입구가 하나 ──────────────────────────────────────────────────
{
  const { ctx, p } = await open(77, { scheds: [mkSched('s1')] })
  //  ⚠ 대표님: 「더보기 > 사용방법」은 어색하고 위쪽 「도움말」은 정상.
  //    두 입구 중 잘 되는 쪽만 남깁니다.
  ok((await p.locator('[data-help-open]').count()) === 1, '**위쪽 「도움말」은 그대로 있다**')
  //  하단 「더보기」 탭 — 이름표로 찾습니다(전용 표시가 없습니다).
  await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => (e.textContent ?? '').trim() === '더보기')
    b?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await p.waitForTimeout(900)
  //  ⚠ 0078 — 0077 에서는 「오른쪽 위 도움말에서 여세요」 안내 칸을 남겼는데,
  //    대표님 말씀대로 그것도 결국 **도움말 이야기가 두 군데**라는 뜻입니다.
  //    이제 현장 담당자의 더보기에는 사용 방법 이야기가 **아예 없습니다.**
  const moved = await p.locator('[data-more-help-moved]').count()
  const oldEntry = await p.locator('[data-more-help] [data-tour-start]').count()
  const sheetText = flat(await p.locator('[data-more-help]').innerText())
  ok(moved === 0, '**더보기에 「도움말에서 여세요」 안내 칸이 없다** (지웠습니다)', `${moved}`)
  ok(oldEntry === 0, '**더보기에서 안내가 바로 시작되지 않는다** (시트가 열린 채로 시작해 어긋났습니다)')
  ok(!/사용 방법/.test(sheetText), '**더보기에 「사용 방법」이 아예 없다**', sheetText.slice(0, 60))
  await ctx.close()
}

await b.close()
