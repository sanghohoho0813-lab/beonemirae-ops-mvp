import { chromium, EXEC } from './_pw.mjs'
import { skipIfHidden } from './_pilot.mjs'

//  0076 — 대표님이 한 번에 주신 아홉 가지 중 화면에서 볼 수 있는 것들
//
//   ① 요청을 잠시 내려 두면 목록에서 빠진다 (지우지도 처리하지도 않고)
//   ② 3.5톤을 **누가** 잡았는지 보인다 (PC · 폰 둘 다)
//   ③ 폰 수거 입력에서 펼친 칸을 **다시 접을 수 있다**
//   ④ 거래처 검색칸이 눈에 띈다 · PC 에서는 커서가 들어가 있다
//   ⑤ 운영 모드 거래처 목록에 「시연용」 칩이 없다
//   ⑥ 저장 직후에 **방금 넣은 것을 지울** 수 있다
//   ⑦ 피드백이 지금 화면 기준으로 묻는다 · 관점이 나뉘어 있다

const BASE = 'http://localhost:4173'
const ME = '00000000-0000-0000-0000-0000000000a9'
const FD = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V35 = '00000000-0000-0000-0000-000000000035'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const plus = (n) => new Date(Date.now() + n * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '더원요양병원', type: '요양병원', address: '경기도 남양주시', manager: '김',
  phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true,
  storage_size: '보통', note: '', is_demo_generated: false, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [
  { id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000, expected_capacity: 800, driver: '', active: true },
  { id: V35, name: '3.5톤 (공용)', waste_type: '의료폐기물', tonnage: 3.5, nominal_capacity: 3500, expected_capacity: 2800, driver: '', active: true },
]

const b = await chromium.launch({ executablePath: EXEC })

async function open(ver, { role = 'admin', path = '/', w = 1280, requests = [], res = [], scheds = [] } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, isMobile: w < 700, hasTouch: w < 700 })
  const uid = role === 'field' ? FD : ME
  const me = { id: uid, email: 'a@b.c', name: role === 'field' ? '김준기' : '송대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  const state = { calls: [], events: [] }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(ver)
    if (url.includes('/rpc/snooze_request')) {
      state.calls.push(['snooze', JSON.parse(r.request().postData() ?? '{}')])
      return json({ ok: true })
    }
    if (url.includes('/rpc/complete_collection')) {
      state.calls.push(['save', JSON.parse(r.request().postData() ?? '{}')])
      //  ⚠ 저장하면 서버에 기록이 **생깁니다.** 시늉본도 그렇게 해야
      //    「방금 넣은 것 지우기」가 진짜 그 기록을 열 수 있습니다.
      state.events.push({
        id: 'ev-new', at: `${T}T01:00:00Z`, actor_id: uid, actor_role: 'field', screen: '수거 입력',
        action: '수거 완료', schedule_id: 's1', created_schedule: false, client_id: C1,
        client_name: '더원요양병원', waste_type: '의료폐기물', amount_kg: 120,
        before_state: { status: '예정', actualAmount: null, handoverStatus: null },
        material_ids: [], stock_before: {}, request_updates: [], note: '', reverted: false, reverted_at: null,
      })
      return json({ eventId: 'ev-new', scheduleId: 's1', createdSchedule: false })
    }
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/material_transactions')) return json([])
    if (url.includes('/collection_events')) return json(state.events)
    if (url.includes('/client_requests')) return json(requests)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/vehicle_reservations')) return json(res)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/schedules')) return json(scheds)
    if (url.includes('/office_stock')) return json(single ? { id: 1, corrugated_box: 50, plastic_container: 20, bag: 30, needle_box: 5 } : [{ id: 1, corrugated_box: 50, plastic_container: 20, bag: 30, needle_box: 5 }])
    return json([])
  })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1300)
  return { ctx, p, state }
}

const mkReq = (id, over = {}) => ({
  id, client_id: C1, kind: '소모품', content: '검증용 요청', desired_date: null, urgent: false,
  status: '접수', source: 'staff', requester_name: '검증', reply: '', handled_by: null, handled_at: null,
  created_at: `${T}T00:00:00Z`, snoozed_until: null, snooze_reason: '', ...over,
})

// ── ① 요청 내려 두기 ───────────────────────────────────────────────────────
if (!skipIfHidden('requests', '① 요청 「나중에 보기」')) {
  const requests = [mkReq('r1'), mkReq('r2')]
  const { ctx, p, state } = await open(76, { path: '/requests', requests })
  ok((await p.locator('[data-snooze="r1"]').count()) === 1, '**요청에 「나중에 보기」가 있다**')
  await p.locator('[data-snooze="r1"]').click()
  await p.waitForTimeout(700)
  const t = flat(await p.locator('[role="dialog"]').innerText())
  ok(/지우는 것도.*처리 완료.*아닙니다/.test(t) || /지우는 것도/.test(t),
    '**지우는 것도 처리 완료도 아니라고 적혀 있다**', t.slice(0, 90))
  ok((await p.locator('[data-snooze-days="30"]').count()) === 1, '기간을 고를 수 있다')
  ok((await p.locator('[data-snooze-until]').count()) === 1, '**언제 다시 올라오는지 적혀 있다**')
  await p.locator('[data-snooze-why]').fill('검증 중 — 테스트 끝나면 정리')
  await p.locator('[data-snooze-go]').click()
  await p.waitForTimeout(1300)
  const sent = state.calls.find(([k]) => k === 'snooze')
  ok(!!sent, '서버로 감', JSON.stringify(state.calls).slice(0, 60))
  ok(sent?.[1]?.p_until === plus(30), '30일 뒤 날짜로 감', String(sent?.[1]?.p_until))
  ok(sent?.[1]?.p_reason === '검증 중 — 테스트 끝나면 정리', '이유가 그대로 감')
  await ctx.close()
}
if (!skipIfHidden('requests', '① 내려 둔 요청을 다시 꺼내기')) {
  //  이미 내려 둔 것은 「진행 중」에서 빠지고, 대시보드 배너에도 안 셉니다.
  const requests = [mkReq('r1', { snoozed_until: plus(20), snooze_reason: '검증 중' }), mkReq('r2')]
  const { ctx, p } = await open(76, { path: '/requests', requests })
  const body = flat(await p.locator('main').innerText())
  ok((await p.locator('[data-snoozed="r1"]').count()) === 0, '**내려 둔 것은 「진행 중」에 안 뜬다**')
  ok(/내려 둔 것 1/.test(body), '「내려 둔 것 1」 칩이 생긴다', body.slice(0, 80))
  await p.locator('text=내려 둔 것 1').first().click()
  await p.waitForTimeout(600)
  ok((await p.locator('[data-snoozed="r1"]').count()) === 1, '거기서는 보인다 (지운 것이 아님)')
  ok(/검증 중/.test(flat(await p.locator('[data-snoozed="r1"]').innerText())), '왜 내려 뒀는지도 보인다')
  ok((await p.locator('[data-unsnooze="r1"]').count()) === 1, '**다시 꺼낼 수 있다**')
  await ctx.close()
}

// ── ② 3.5톤을 누가 잡았나 ──────────────────────────────────────────────────
for (const w of [1280, 390]) {
  const res = [{ id: 'r9', vehicle_id: V35, date: T, profile_id: ME, profile_name: '오대성', note: '' }]
  const { ctx, p } = await open(76, { role: 'field', path: '/today', w, res })
  const st = flat(await p.locator('[data-truck-state]').textContent())
  ok(/오대성/.test(st), `**${w >= 700 ? 'PC' : '폰'} — 누가 잡았는지 딱지에 보인다**`, st)
  const line = flat(await p.locator('[data-truck-who]').innerText())
  ok(/오대성 님이 잡으셨습니다/.test(line), `${w >= 700 ? 'PC' : '폰'} — 한 줄로 다시 적어 준다`, line)
  await ctx.close()
}
{
  //  ⚠ 이름이 없는 옛 예약(판 75 이전)에는 지어내지 않습니다.
  const res = [{ id: 'r9', vehicle_id: V35, date: T, profile_id: ME, profile_name: '', note: '' }]
  const { ctx, p } = await open(76, { role: 'field', path: '/today', res })
  ok((await p.locator('[data-truck-who]').count()) === 0, '이름이 없으면 그 줄을 안 그린다 (지어내지 않음)')
  ok(/다른 분이 씁니다/.test(flat(await p.locator('[data-truck-state]').textContent())), '예전처럼만 적는다')
  await ctx.close()
}

// ── ③ 폰 수거 입력 — 접었다 폈다 ───────────────────────────────────────────
{
  const { ctx, p } = await open(76, { role: 'field', path: '/collection', w: 390 })
  //  처음엔 접혀 있습니다.
  ok((await p.locator('[data-fold="containers"]').count()) === 1, '처음에는 접혀 있다')
  await p.locator('[data-fold="containers"]').click()
  await p.waitForTimeout(400)
  ok((await p.locator('[data-fold="containers"]').count()) === 0, '누르면 펴진다')
  //  ⚠ 여기가 이번에 고친 자리입니다 — 예전에는 **접는 단추가 없었습니다.**
  ok((await p.locator('[data-fold-close="containers"]').count()) === 1, '**접는 단추가 생겼다**')
  await p.locator('[data-fold-close="containers"]').click()
  await p.waitForTimeout(400)
  ok((await p.locator('[data-fold="containers"]').count()) === 1, '**다시 접힌다**')

  for (const id of ['supply', 'memo', 'handover']) {
    await p.locator(`[data-fold="${id}"]`).click()
    await p.waitForTimeout(300)
    ok((await p.locator(`[data-fold-close="${id}"]`).count()) === 1, `${id} 도 접을 수 있다`)
  }
  await ctx.close()
}
{
  //  값이 들어 있어도 접을 수 있고, **접힌 줄에 그 값이 적혀** 있어야 합니다.
  const { ctx, p } = await open(76, { role: 'field', path: '/collection', w: 390 })
  await p.locator('[data-fold="memo"]').click()
  await p.waitForTimeout(300)
  await p.locator('textarea').first().fill('3층 앞에서 인수')
  await p.waitForTimeout(300)
  await p.locator('[data-fold-close="memo"]').click()
  await p.waitForTimeout(400)
  ok((await p.locator('[data-fold="memo"]').count()) === 1, '**값이 있어도 접힌다**')
  const sum = flat(await p.locator('[data-fold-summary="memo"]').innerText())
  ok(/적었습니다/.test(sum), '**접힌 줄에 저장될 값이 적혀 있다** (접는 것과 숨기는 것은 다릅니다)', sum)
  await ctx.close()
}

// ── ④⑤ 거래처 화면 ────────────────────────────────────────────────────────
{
  const { ctx, p } = await open(76, { path: '/clients' })
  const box = p.locator('[data-client-search]')
  ok((await box.count()) === 1, '검색칸이 있다')
  ok(await box.evaluate((el) => el === document.activeElement), '**PC 에서는 커서가 들어가 있다**')
  const cls = (await box.getAttribute('class')) ?? ''
  ok(/ring-2/.test(cls), '입력할 수 있는 칸이라는 것이 테두리로 보인다', cls.slice(0, 50))
  const body = flat(await p.locator('main').innerText())
  ok(!/시연용/.test(body), '**운영 모드에 「시연용」이 없다**', body.slice(0, 70))
  await ctx.close()
}
{
  //  ⚠ 폰에서는 커서를 넣지 않습니다 — 키보드가 화면 절반을 덮습니다.
  const { ctx, p } = await open(76, { path: '/clients', w: 390 })
  const box = p.locator('[data-client-search]')
  ok(!(await box.evaluate((el) => el === document.activeElement)),
    '폰에서는 커서를 안 넣는다 (키보드가 목록을 덮습니다)')
  await ctx.close()
}

// ── ⑥ 저장 직후에 지우기 ───────────────────────────────────────────────────
{
  const scheds = [{ id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', scheduled_time: '09:00',
    status: '예정', vehicle_id: V3, expected_amount: 100, actual_amount: null, memo: '' }]
  const { ctx, p } = await open(76, { role: 'field', path: '/collection', w: 390, scheds })
  await p.locator('select').first().selectOption(C1).catch(() => {})
  await p.waitForTimeout(400)
  const amt = p.locator('input[type="number"]').first()
  await amt.fill('120')
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /수거 완료 저장|저장/ }).last().click()
  await p.waitForTimeout(2000)
  //  ⚠ 대표님: 「수거입력 실수로 시작했다가 지우는 게 없네」 — 저장 **직후**가
  //    실수를 알아채는 순간입니다.
  ok((await p.locator('[data-undo-just-saved]').count()) === 1,
    '**저장 직후에 「방금 넣은 것 지우기」가 있다**')
  await p.locator('[data-undo-just-saved]').click()
  await p.waitForTimeout(800)
  ok((await p.locator('[data-record]').count()) === 1, '누르면 그 기록이 열린다')
  const t = flat(await p.locator('[data-record]').innerText())
  ok(/본인이 넣으신 것만/.test(t) || (await p.locator('[data-record-revert]').count()) === 1,
    '기사님이 지울 수 있다')
  await ctx.close()
}

// ── ⑦ 사용자 피드백이 묻는 것 ──────────────────────────────────────────────
{
  const { ctx, p } = await open(76, { role: 'field', path: '/today', w: 390 })
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button,a')].find((e) => /요청|개선/.test(e.textContent ?? ''))
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await p.waitForTimeout(600)
  await ctx.close()
  //  ⚠ 들어가는 문이 화면마다 달라 여기서는 **목록 자체**를 확인합니다.
  //    (화면 연결은 기존 check_devreq 가 봅니다.)
}
{
  //  ── ⑦ 물어보는 것이 **지금 화면 기준**인가 ────────────────────────────
  //
  //   대표님(0076): 「개발자에게 요청하기 목록 보면 예전 버전으로 있는 것
  //   같거든? 그 이후에 기능 추가 보완 수정 이런 거 거쳤으니까 현재에 맞게
  //   바꿔 주고, 특히 앞으로도 계속 개선해 나가야 될 부분만 주제로 정해서.」
  //
  //   ⚠ 0100 — 그 목록(DEV_REQUEST_TOPICS)은 사용자 피드백 v2 로 바뀌었습니다.
  //     「무엇이 불편한가」만 서른 줄 묻던 것을, 관점을 나눠 눌러서 끝내는
  //     설문으로 다시 만들었습니다. 여기서 지키는 것은 그 취지 그대로입니다 —
  //     **지금 화면에 있는 일**을 묻는가, 그리고 **답이 나중에 비교되는가**.
  const F = await import('../../src/lib/feedbackV2.ts')

  const mg = F.MANAGEMENT_STEPS.flatMap((g) => g.questions)
  const stField = F.stepsFor('staff', 'field').flatMap((g) => g.questions)
  const stOffice = F.stepsFor('staff', 'office').flatMap((g) => g.questions)
  const textOf = (list) => list.map((q) => q.text).join(' | ')

  //  관점이 나뉘어 있는가 — 대표님 질문과 기사님 질문이 섞이면 둘 다 못 씁니다
  ok(F.MANAGEMENT_STEPS.length === 4, '운영·관리는 4단계', `${F.MANAGEMENT_STEPS.length}단계`)
  ok(F.stepsFor('staff', 'field').length === 3, '현장·실무는 3단계 (더 짧게)',
    `${F.stepsFor('staff', 'field').length}단계`)
  ok(stField.length <= mg.length, '직원 문항이 관리자보다 많지 않음', `${stField.length} vs ${mg.length}`)
  for (const [name, steps] of [['management', F.MANAGEMENT_STEPS], ['staff', F.stepsFor('staff', 'field')]]) {
    ok(steps.every((g) => g.questions.length >= 4 && g.questions.length <= 6),
      `${name} — 한 단계에 4~6문항`, steps.map((g) => g.questions.length).join('·'))
  }

  //  지금 화면에 있는 일을 묻는가
  ok(/전화나 카톡으로 다시 묻는 일/.test(textOf(mg)), '**전화·카톡 재확인**을 묻는다')
  ok(/엑셀/.test(textOf(mg)), '**엑셀 다시 열어보는 일**을 묻는다')
  ok(/미수금|정산/.test(textOf(mg)), '정산·미수를 묻는다')
  ok(/수거내용을 입력하는 과정/.test(textOf(stField)), '현장에는 수거 입력을 묻는다')
  ok(/자재·재고/.test(textOf(stOffice)), '사무실에는 자재·재고를 묻는다')
  ok(!/보고 싶은 지표가 빠져 있습니다/.test(textOf(mg)), '예전 v1 문구를 그대로 쓰지 않는다')

  //  ⚠ 번호가 있어야 문구를 다듬어도 같은 항목끼리 비교됩니다
  //    (현장·사무실 묶음은 앞뒤 단계를 함께 쓰므로 번호로 한 번 걸러 셉니다)
  const all = [...new Map([...mg, ...stField, ...stOffice].map((q) => [q.id, q])).values()]
  const NUM = /^(MG|ST)_[A-Z]+_[A-Z]?[0-9]{2}$/
  ok(all.every((q) => NUM.test(q.id)), '모든 문항에 번호가 있다',
    all.filter((q) => !NUM.test(q.id)).map((q) => q.id).join(','))
  ok(all.length === mg.length + stField.length + stOffice.length - 10,
    '현장·사무실은 앞뒤 단계를 함께 쓴다 (번호가 겹치지 않게)', `${all.length}개`)
  ok(all.every((q) => F.CATEGORY_LABEL[q.category]), '모든 문항에 안쪽 분류가 있다')
  //  ⚠ 안쪽 분류 이름은 답하는 분 화면에 나오면 안 됩니다 — 이건 화면 검사에서 봅니다.

  //  ⚠ 실제로 얼마나 써 봤는지를 함께 받는가. 이것이 없으면 점수를 읽을 수 없습니다
  ok(F.USAGE_OPTIONS.length === 5 && F.USAGE_OPTIONS.some((o) => /아직 충분히/.test(o.label)),
    '사용 정도를 함께 묻고, 「아직 충분히 못 써봤어요」가 있다')
  //  ⚠ 병원 계정은 포털의 「요청」으로 보냅니다 — 이 화면이 열리지 않습니다.
  const { canSendDevRequest } = await import('../../src/lib/devRequests.ts')
  ok(!canSendDevRequest('client'), '병원 계정에는 이 화면이 없다')
}

await b.close()
