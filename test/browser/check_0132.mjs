import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0132 — 실사용 고도화 2
//   ① 수거 입력 임시 보관 — 폰이 화면을 새로 띄워도 적던 것이 남고, 「이어서 입력」 한 번
//   ② 다음 방문이 안 잡힌 단골 — 대시보드 → 일정 편성 → 거래처 방문 잡기
//   ③ 월말 청구 — 실패한 곳을 전부 적고, 그 곳만 다시 확정

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const T = F.TODAY
const shift = (n) => { const d = new Date(`${T}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const b = await chromium.launch({ executablePath: EXEC })
const nameOf = (id) => F.clients.find((c) => c.id === id)?.name ?? id

const row = (id, date, over = {}) => ({
  id, date, client_id: 'c1', waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '10:00', status: '예정',
  expected_amount: 87, actual_amount: null, completed_at: null, memo: '', origin: 'system', is_additional: false,
  demo_session_id: null, plan_batch: null, handover_status: null, driver_name: null, canceled_at: null,
  created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z`, ...over,
})
const doneRow = (id, client, date) => row(id, date, { client_id: client, status: '완료', actual_amount: 90, vehicle_id: 'v1',
  driver_name: '1호기사', completed_at: `${date}T01:00:00Z` })

async function open(role, path, { w = 1440, h = 900, schedules, extra, ctx: reuse } = {}) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role), ...(schedules ? { schedules } : {}) }
  const phone = w < 700
  const ctx = reuse ?? await b.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone })
  if (!reuse) {
    W.wire(ctx, state)
    if (extra) await extra(ctx, state)
  }
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
const draftKeys = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('beonemirae-ops:collect-draft:')))
const reopen = async (p, path) => { await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('[data-actual-amount]', { timeout: 20000 }); await p.waitForTimeout(900) }

// ── ① 임시 보관 ────────────────────────────────────────────────────────────
console.log('\n── ① 수거 입력 임시 보관 ──')
{
  const schedules = [row('x1', T, { vehicle_id: 'v1', client_id: 'c1' })]
  const s = await open('field', '/collection?schedule=x1', { w: 390, h: 844, schedules })
  const p = s.p
  await p.waitForSelector('[data-actual-amount]', { timeout: 15000 })
  await p.waitForTimeout(900)
  ok((await draftKeys(p)).length === 0, '**일정만 열어 본 것은 남기지 않음** (다시 누르면 똑같이 채워짐)')
  await p.fill('[data-actual-amount]', '95')
  await p.waitForTimeout(900)
  const keys = await draftKeys(p)
  ok(keys.length === 1, '고친 값은 이 폰에 임시 보관', keys.join(','))
  //  폰이 화면을 새로 띄움 (지도 갔다 옴 · 전화)
  await reopen(p, '/collection')
  const banner = flat(await p.locator('[data-collect-draft]').innerText().catch(() => ''))
  ok(banner.includes(nameOf('c1')) && banner.includes('95kg'), '**다시 열면 「적던 수거 입력이 남아 있습니다」**', banner.slice(0, 70))
  ok((await p.locator('[data-actual-amount]').inputValue()) === '', '자동으로 채우지 않음 — 사람이 고름')
  await p.locator('[data-collect-draft-resume]').click()
  await p.waitForTimeout(400)
  ok((await p.locator('[data-actual-amount]').inputValue()) === '95', '**「이어서 입력」 한 번으로 95kg 그대로**')
  ok((await p.locator('[data-collect-draft]').count()) === 0, '안내가 사라짐')
  const sched = flat(await p.locator('main').innerText())
  ok(/선택한 일정에서 자동 지정됨|10:00/.test(sched) || (await p.locator('#collection-client').isDisabled()), '그 일정으로 이어짐')
  //  저장하면 지움
  await p.locator('[data-collect-save]').click()
  await p.waitForSelector('[data-tour="collect-done"]', { timeout: 15000 }).catch(() => {})
  ok((await p.locator('[data-tour="collect-done"]').count()) === 1, '저장 완료')
  await p.waitForTimeout(700)
  ok((await draftKeys(p)).length === 0, '**저장하면 임시 보관을 지움**')
  await s.ctx.close()
}
{
  //  일정 없이 직접 넣던 것 · 지우기
  const s = await open('field', '/collection', { w: 390, h: 844, schedules: [] })
  const p = s.p
  await p.selectOption('#collection-client', 'c2')
  await p.fill('[data-actual-amount]', '40')
  await p.waitForTimeout(900)
  await reopen(p, '/collection')
  ok((await p.locator('[data-collect-draft]').count()) === 1, '직접 입력하던 것도 남음')
  await p.locator('[data-collect-draft-resume]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('#collection-client').inputValue()) === 'c2' && (await p.locator('[data-actual-amount]').inputValue()) === '40',
    '거래처·kg 이 돌아옴')
  //  지우기
  await p.fill('[data-actual-amount]', '41'); await p.waitForTimeout(800)
  await reopen(p, '/collection')
  await p.locator('[data-collect-draft-drop]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-collect-draft]').count()) === 0 && (await draftKeys(p)).length === 0, '**「지우기」로 버림**')
  await reopen(p, '/collection')
  ok((await p.locator('[data-collect-draft]').count()) === 0, '다시 열어도 안 나옴')
  //  어제 적던 것은 버림
  await p.evaluate(([who]) => localStorage.setItem(`beonemirae-ops:collect-draft:${who}`, JSON.stringify({ v: 1, savedAt: Date.now() - 86400000, day: '2000-01-01',
    scheduleId: '', clientId: 'c2', wasteType: '의료폐기물', vehicleId: '', fieldPicked: null, driverName: '', amount: '33', time: '09:00',
    visitDate: '2000-01-01', containers: {}, suppliedItems: {}, usedItems: {}, isAdditional: false, handover: '수거 완료', memo: '' })), [W.profileFor('field').id])
  await reopen(p, '/collection')
  ok((await p.locator('[data-collect-draft]').count()) === 0, '**어제 적던 것은 안 띄우고 버림**')
  await s.ctx.close()
}
{
  //  남은 것이 그사이 저장된 일정이면 버림 (다른 폰 · 재시도)
  const schedules = [doneRow('y1', 'c3', T)]
  const s = await open('field', '/collection', { w: 390, h: 844, schedules })
  const p = s.p
  await p.evaluate(([who, today]) => localStorage.setItem(`beonemirae-ops:collect-draft:${who}`, JSON.stringify({ v: 1, savedAt: Date.now(), day: today,
    scheduleId: 'y1', clientId: 'c3', wasteType: '의료폐기물', vehicleId: 'v1', fieldPicked: 'v1', driverName: '', amount: '70', time: '09:00',
    visitDate: today, containers: {}, suppliedItems: {}, usedItems: {}, isAdditional: false, handover: '수거 완료', memo: '' })), [W.profileFor('field').id, T])
  await reopen(p, '/collection')
  ok((await p.locator('[data-collect-draft]').count()) === 0 && (await draftKeys(p)).length === 0, '**이미 저장된 일정의 임시 보관은 버림**')
  await s.ctx.close()
}

// ── ② 다음 방문 안 잡힘 ────────────────────────────────────────────────────
console.log('\n── ② 다음 방문 안 잡힘 ──')
{
  const schedules = [
    //  c1 — 매주 다니던 곳, 이번 주 예정 없음 → 표시
    doneRow('a1', 'c1', shift(-21)), doneRow('a2', 'c1', shift(-14)), doneRow('a3', 'c1', shift(-7)),
    //  c2 — 같은데 내일 예정 있음 → 안 표시
    doneRow('b1', 'c2', shift(-21)), doneRow('b2', 'c2', shift(-14)), doneRow('b3', 'c2', shift(-7)), row('b4', shift(1), { client_id: 'c2' }),
    //  c3 — 두 번밖에 안 감 → 주기를 모르니 말 안 함
    doneRow('d1', 'c3', shift(-14)), doneRow('d2', 'c3', shift(-7)),
    //  c4 — 한 달에 한 번, 다음은 3주 뒤 → 아직 아님
    doneRow('e1', 'c4', shift(-69)), doneRow('e2', 'c4', shift(-39)), doneRow('e3', 'c4', shift(-9)),
  ]
  const s = await open('admin', '/', { schedules })
  const board = flat(await s.p.locator('[data-tour="today-board"]').innerText().catch(() => ''))
  const m = board.match(/다음 방문 안 잡힘.{0,80}/)
  ok(!!m && m[0].includes(nameOf('c1')) && !m[0].includes('외 '), '**대시보드에 「다음 방문 안 잡힘」 1곳 — 그 거래처**', m?.[0] ?? board.slice(0, 80))
  const hrefs = await s.p.locator('[data-tour="today-board"] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  ok(hrefs.includes('/plan'), '→ 일정 편성으로')
  await s.p.goto(`${W.BASE}/plan`, { waitUntil: 'domcontentloaded' })
  await s.p.waitForSelector('[data-plan-page]', { timeout: 20000 }); await s.p.waitForTimeout(800)
  const ids = await s.p.locator('[data-plan-gap]').evaluateAll((as) => as.map((a) => a.getAttribute('data-plan-gap')))
  ok(ids.length === 1 && ids[0] === 'c1', '**일정 편성 맨 위에 그 곳만** (내일 예정 있는 곳·기록 모자란 곳·월 1회 아직인 곳은 빠짐)', ids.join(','))
  const line = flat(await s.p.locator('[data-plan-gap="c1"]').innerText().catch(() => ''))
  ok(/평소 7일마다/.test(line) && /마지막/.test(line), '근거 — 평소 간격 · 마지막 방문', line)
  await s.p.locator('[data-plan-gap="c1"]').click()
  await s.p.waitForSelector('[data-book-modal]', { timeout: 15000 }).catch(() => {})
  ok((await s.p.locator('[data-book-modal]').count()) === 1, '**「방문 잡기 ›」 → 거래처 화면에서 예약 창이 바로 열림**')
  ok(!/book=1/.test(s.p.url()), '주소의 표시는 지움 (새로고침에 다시 안 열리게)', s.p.url().replace(W.BASE, ''))
  await s.ctx.close()
  const m2 = await open('admin', '/', { schedules, w: 390, h: 844 })
  ok(/다음 방문 안 잡힘/.test(flat(await m2.p.locator('main').innerText())), '폰 대시보드에도')
  await m2.ctx.close()
}

// ── ③ 월말 청구 실패 → 그 곳만 다시 ─────────────────────────────────────────
console.log('\n── ③ 월말 청구 ──')
{
  const UID = F.UID
  const [Y, M] = T.slice(0, 7).split('-').map(Number)
  const pv = new Date(Date.UTC(Y, M - 2, 1))
  const MONTH = `${pv.getUTCFullYear()}-${String(pv.getUTCMonth() + 1).padStart(2, '0')}`
  const profile = { id: UID, email: 'a@b.c', name: '대표', role: 'admin', font_scale: 'normal', active: true,
    approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z' }
  const mk = (id, name) => ({ id, name, type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
    collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '', is_demo_generated: false,
    demo_session_id: null, active: true, contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
    pricing: { medical: { sale: 1000, cost: 400 } }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
  const clients = [mk('ka', 'A병원'), mk('kb', 'B병원'), mk('kc', 'C병원')]
  const sched = clients.map((c, i) => ({ id: `ms${i}`, date: `${MONTH}-1${i}`, client_id: c.id, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: 100, actual_amount: 100, completed_at: `${MONTH}-1${i}T09:00:00Z`, memo: '',
    origin: 'migrated', is_additional: false, demo_session_id: null, plan_batch: null, created_at: `${MONTH}-01T00:00:00Z`, updated_at: `${MONTH}-01T00:00:00Z` }))
  const payments = []
  const calls = []
  let failOnce = new Set(['kb', 'kc'])
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
  await ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url(); const method = r.request().method()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/confirm_billing')) {
      const body = JSON.parse(r.request().postData() ?? '{}')
      calls.push(body.p_client_id)
      if (failOnce.has(body.p_client_id)) {
        failOnce.delete(body.p_client_id)
        return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: '잠시 연결이 끊겼습니다' }) })
      }
      payments.push({ id: `np${payments.length}`, client_id: body.p_client_id, billing_month: body.p_month, amount: body.p_amount, status: '미수금',
        method: '무통장', paid_at: null, memo: '정기 청구', snapshot: body.p_snapshot, canceled_at: null })
      return json({ id: `np${payments.length}`, amount: body.p_amount, month: body.p_month })
    }
    if (url.includes('/audit_logs') && method === 'POST') return json([{ id: 1 }])
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    if (url.includes('/payments')) return json(payments)
    if (url.includes('/schedules')) return json(sched)
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  await p.addInitScript(([k, u]) => localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/billing`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-close-summary]', { timeout: 20000 }); await p.waitForTimeout(700)
  await p.locator('[data-close-confirm]').first().click()
  await p.waitForSelector('[data-close-result]', { timeout: 20000 }).catch(() => {})
  await p.waitForTimeout(500)
  const failed = flat(await p.locator('[data-close-failed]').innerText().catch(() => ''))
  ok(/2곳은 확정되지 않았습니다/.test(failed) && failed.includes('B병원') && failed.includes('C병원'), '**실패한 곳을 전부 적음** (예전엔 첫 곳만)', failed.slice(0, 80))
  const retry = p.locator('[data-close-retry]')
  ok(flat(await retry.innerText().catch(() => '')) === '2곳만 다시 확정', '「2곳만 다시 확정」 단추')
  const before = calls.length
  await retry.click()
  await p.waitForTimeout(2500)
  const again = calls.slice(before)
  ok(again.length === 2 && again.includes('kb') && again.includes('kc') && !again.includes('ka'), '**실패한 곳만 다시 보냄** (A병원은 두 번 안 감)', again.join(','))
  const res = flat(await p.locator('[data-close-result]').innerText().catch(() => ''))
  ok(/2곳 · 200,000원 청구를 확정했습니다/.test(res) && (await p.locator('[data-close-failed]').count()) === 0, '다시 확정 결과 — 2곳 · 200,000원', res.slice(0, 60))
  ok(payments.length === 3 && payments.reduce((s, x) => s + x.amount, 0) === 300000, '세 곳 모두 한 번씩만 청구 · 합계 300,000원', `${payments.length}건`)
  await ctx.close()
}

await b.close()
