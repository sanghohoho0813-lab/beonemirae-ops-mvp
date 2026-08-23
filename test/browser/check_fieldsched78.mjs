import { chromium, EXEC } from './_pw.mjs'

//  0078 — field 본인 일정 수정/취소가 **실제로 동작하는가**
//
//   대표님: 「일정 상세를 열면 "내가 넣은 일정입니다" 같은 출처 표시는 보이지만,
//   실제 수정/취소는 서버 준비 안내만 나오고 끝나는 경우가 있다.」
//
//   판 77 이 올라간 지금 확인할 것
//    · 본인이 넣은 미완료 일정 → 진짜로 취소·시간변경이 서버까지 간다
//    · 사무실이 배정한 일정 → 못 고치되 **막다른 길이 아니다** (사무실에 알리기)
//    · 수거기록이 붙은 일정 → 그 수거기록으로 데려간다
//    · 「서버 준비가 끝나면…」 이라는 임시 안내가 **없다**

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
  expected_capacity: 800, driver: '김준기', active: true }]

//  ⚠ 대표님이 실제로 보신 그 줄입니다 — 「남양주백병원 09:00」.
const mkSched = (over = {}) => ({
  id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', vehicle_id: V3, scheduled_time: '09:00',
  status: '예정', expected_amount: 100, actual_amount: null, memo: '', origin: 'system',
  created_at: `${T}T00:10:00Z`, created_by: AD, created_by_name: '송대표', created_via: '사무실 배정',
  event_id: null, canceled_at: null, cancel_reason: '', ...over,
})
const MINE = { created_by: FD, created_by_name: '김준기', created_via: '기사 직접 추가', origin: 'field' }

const b = await chromium.launch({ executablePath: EXEC })

async function open({ role = 'field', w = 390, scheds = [], events = [], ver = 77 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700, hasTouch: w < 700 })
  const uid = role === 'field' ? FD : AD
  const me = { id: uid, email: 'x@b.c', name: role === 'field' ? '김준기' : '송대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const calls = []
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    for (const fn of ['cancel_my_visit', 'retime_my_visit', 'submit_schedule_feedback']) {
      if (url.includes(`/rpc/${fn}`)) {
        calls.push([fn, JSON.parse(r.request().postData() ?? '{}')])
        return json({ ok: true })
      }
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/collection_events')) return json(events)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1300)
  return { ctx, p, calls }
}

const openSheet = async (p) => {
  await p.locator('[data-sched-more="s1"]').click()
  await p.waitForTimeout(700)
}

// ── ① 본인이 넣은 일정 — 진짜로 취소된다 ──────────────────────────────────
{
  const { ctx, p, calls } = await open({ scheds: [mkSched(MINE)] })
  await openSheet(p)
  const origin = flat(await p.locator('[data-sched-origin]').innerText())
  ok(/기사 직접 추가/.test(origin) && /내가 넣은 일정/.test(origin), '**내가 넣은 것이라고 알려 준다**', origin)
  ok((await p.locator('[data-sched-cancel]').count()) === 1, '**일정 취소 단추가 실제로 있다**')

  //  ⚠ 이것이 대표님이 지적하신 부분입니다 — 임시 안내가 남아 있으면 안 됩니다.
  const all = flat(await p.locator('[data-sched]').innerText())
  ok(!/서버 준비/.test(all), '**「서버 준비가 끝나면…」이 없다** (실제 기능이 붙었습니다)')

  await p.locator('[data-sched-cancel]').click()
  await p.waitForTimeout(500)
  await p.locator('[data-sched-reason]').fill('병원이 오늘 쉰다고 합니다')
  await p.waitForTimeout(250)
  await p.locator('[data-sched-cancel-go]').click()
  await p.waitForTimeout(1400)
  const c = calls.find(([k]) => k === 'cancel_my_visit')
  ok(!!c, '**취소가 서버까지 간다**', JSON.stringify(calls).slice(0, 70))
  ok(c?.[1]?.p_reason === '병원이 오늘 쉰다고 합니다', '이유가 그대로 간다', String(c?.[1]?.p_reason))
  ok(c?.[1]?.p_schedule_id === 's1', '그 일정이 맞다')
  await ctx.close()
}

// ── ② 본인이 넣은 일정 — 시간도 진짜로 바뀐다 ─────────────────────────────
{
  const { ctx, p, calls } = await open({ scheds: [mkSched(MINE)] })
  await openSheet(p)
  await p.locator('[data-sched-retime]').click()
  await p.waitForTimeout(500)
  //  시각을 바꿉니다 — 「＋」를 두 번 눌러 09:00 → 11:00.
  const up = p.locator('[data-time-step$="+"]').first()
  await up.click()
  await p.waitForTimeout(200)
  await up.click()
  await p.waitForTimeout(400)
  ok((await p.locator('[data-time-value]').count()) >= 1, '바뀔 시간이 화면에 보인다',
    await p.locator('[data-time-value]').first().getAttribute('data-time-value'))
  const go = p.locator('[data-sched-retime-go]')
  if (!(await go.isDisabled())) {
    await go.click()
    await p.waitForTimeout(1400)
    const r = calls.find(([k]) => k === 'retime_my_visit')
    ok(!!r, '**시간 바꾸기가 서버까지 간다**', JSON.stringify(calls).slice(0, 70))
    ok(/^\d{2}:\d{2}$/.test(String(r?.[1]?.p_time ?? '')), '시:분 꼴로 간다', String(r?.[1]?.p_time))
  } else {
    ok(false, '시간을 바꾸면 「이 시간으로」가 눌린다')
  }
  await ctx.close()
}

// ── ③ 사무실이 배정한 일정 — 못 고치되 **막다른 길이 아니다** ─────────────
{
  const { ctx, p, calls } = await open({ scheds: [mkSched()] })
  await openSheet(p)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '사무실이 배정한 일정은 취소 단추가 없다')
  const why = flat(await p.locator('[data-sched-why]').innerText())
  ok(/내가 넣은 일정이 아닙니다/.test(why), '왜 못 고치는지 그 자리에서 말해 준다', why)
  ok(!/서버 준비/.test(why), '여기에도 「서버 준비」가 없다')

  //  ⚠ 예전에는 여기서 끝이었습니다 — 결국 전화이고, 전화는 안 남습니다.
  ok((await p.locator('[data-sched-say]').count()) === 1, '**대신 「사무실에 알리기」가 있다**')
  await p.locator('[data-sched-say]').click()
  await p.waitForTimeout(500)
  await p.locator('[data-sched-say-body]').fill('이 날은 병원이 쉰다고 합니다. 다음 주 화요일이 낫습니다.')
  await p.waitForTimeout(250)
  await p.locator('[data-sched-say-go]').click()
  await p.waitForTimeout(1400)
  const f = calls.find(([k]) => k === 'submit_schedule_feedback')
  ok(!!f, '**의견이 서버까지 간다** (기록으로 남습니다)', JSON.stringify(calls).slice(0, 80))
  ok(f?.[1]?.p_schedule_id === 's1', '그 일정에 붙는다')
  ok((await p.locator('[data-sched-say-done]').count()) === 1, '보냈다고 알려 준다')
  await ctx.close()
}

// ── ④ 수거기록이 붙은 일정 — 그 기록으로 데려간다 ─────────────────────────
{
  const E1 = '00000000-0000-0000-0000-0000000000e1'
  const ev = { id: E1, at: `${T}T00:40:00Z`, actor_role: 'field', screen: '수거 입력', action: '수거 완료',
    schedule_id: 's1', created_schedule: false, client_id: C1, client_name: '남양주백병원',
    waste_type: '의료폐기물', amount_kg: 120,
    before_state: { status: '예정', actualAmount: null, handoverStatus: null },
    material_ids: [], stock_before: null, request_updates: [], note: '', reverted: false,
    reverted_at: null, demo_session_id: null, input_duration_ms: null }
  const { ctx, p } = await open({
    scheds: [mkSched({ ...MINE, status: '완료', actual_amount: 120, event_id: E1 })],
    events: [ev],
  })
  await openSheet(p)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '끝난 일정은 여기서 못 무른다')
  ok((await p.locator('[data-sched-say]').count()) === 0, '끝난 일정에는 알릴 것이 없다')
  ok((await p.locator('[data-sched-go-record]').count()) === 1, '**「수거기록 열기」로 데려간다**')
  await p.locator('[data-sched-go-record]').click()
  await p.waitForTimeout(900)
  ok((await p.locator('[data-record]').count()) === 1, '눌렀더니 그 수거기록이 열린다')
  await ctx.close()
}

// ── ⑤ 대표(admin) 쪽에서도 출처와 상태가 보인다 ───────────────────────────
{
  const { ctx, p } = await open({ role: 'admin', w: 1280, scheds: [mkSched(MINE)] })
  ok((await p.locator('[data-sched-more-pc="s1"]').count()) === 1, 'PC 에도 「자세히」가 있다')
  await p.locator('[data-sched-more-pc="s1"]').click()
  await p.waitForTimeout(700)
  const t = flat(await p.locator('[data-sched-origin]').innerText())
  ok(/기사 직접 추가/.test(t), '**대표 화면에서도 누가 넣었는지 보인다**', t)
  ok(/김준기 님이 넣었습니다/.test(t), '이름까지')
  ok(/들어옴/.test(t), '언제 들어왔는지도')
  //  사무실·관리자는 남의 일정도 정리할 수 있습니다.
  ok((await p.locator('[data-sched-cancel]').count()) === 1, '대표는 기사 일정도 정리할 수 있다')
  await ctx.close()
}

// ── ⑥ 판 76 이하 — 임시 안내 대신 사실만 ──────────────────────────────────
{
  const { ctx, p } = await open({ scheds: [mkSched(MINE)], ver: 76 })
  await openSheet(p)
  ok((await p.locator('[data-sched-cancel]').count()) === 0, '판 76 에서는 고치는 단추가 없다')
  const why = flat(await p.locator('[data-sched-why]').innerText())
  ok(!/서버 준비가 끝나면/.test(why), '**「서버 준비가 끝나면…」은 더 이상 쓰지 않는다**', why)
  ok(/연결이 원활하지 않습니다/.test(why), '대신 무슨 일인지 그대로 말한다', why)
  await ctx.close()
}

await b.close()
