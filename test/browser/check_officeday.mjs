import { chromium, EXEC } from './_pw.mjs'

//  이사님이 「오늘 직원들이 뭘 했나」를 확인하는 화면 (F3 · F4).
//
//   카카오톡 사진방을 다시 열 필요가 없으려면 **수거량만으로는 안 됩니다.**
//   배출 용기 개수와 공급 자재가 함께 보여야 사진을 대신합니다.
//
//   그리고 「아직 안 들어온 곳」이 보여야 저녁에 기다리지 않습니다.
//   ⚠ 다만 「누락」이라고 단정하면 안 됩니다 — 일정 변경·휴원·다음날 처리가
//     있을 수 있고, 시스템은 그 이유를 모릅니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000of'
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }

const C1 = '00000000-0000-0000-0000-0000000000a1'
const C2 = '00000000-0000-0000-0000-0000000000a2'
const me = { id: UID, email: 'o@b.c', name: '홍현주', role: 'office', font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z' }
const mk = (id, name) => ({
  id, name, type: '요양병원', address: '경기도 남양주시', manager: '김담당', phone: '031-1-2',
  collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통',
  note: '', is_demo_generated: false, active: true, pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mk(C1, '한마음요양병원'), mk(C2, '연세의원')]
const schedules = [
  //  들어온 것 — 용기와 메모까지
  { id: 's1', date: TODAY, client_id: C1, waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '09:00',
    status: '완료', expected_amount: 120, actual_amount: 118, actual_time: '09:40',
    completed_at: `${TODAY}T00:40:00Z`, containers: { corrugated: 3, plastic: 2, bag: 0, etc: 0 },
    driver_name: '김준기', memo: '지하 주차 후 화물엘리베이터', origin: 'field', canceled_at: null,
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
  //  아직 안 들어온 곳
  { id: 's2', date: TODAY, client_id: C2, waste_type: '의료폐기물', vehicle_id: null, scheduled_time: '14:00',
    status: '예정', expected_amount: 90, actual_amount: null, actual_time: null, completed_at: null,
    containers: null, driver_name: '오대성', memo: '', origin: 'plan', canceled_at: null,
    created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z` },
]
//  그날 건넨 자재
const materials = [{ id: 'm1', date: TODAY, client_id: C1, box_count: 10, vinyl_count: 0, needle_box_count: 2,
  is_additional_request: false, memo: '', created_at: `${TODAY}T00:00:00Z` }]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }) }))
ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/rpc/')) return json(null)
  if (url.includes('/profiles')) return json(single ? me : [me])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/materials')) return json(materials)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }])
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2800)

const card = p.locator('[data-field-today]')
ok((await card.count()) > 0, '이사님 화면에 「오늘 현장」 카드가 있음')
const text = ((await card.innerText()) ?? '').replace(/\s+/g, ' ')

// ── F3. 용기·자재가 함께 보인다 ────────────────────────────────────────────
ok(/용기 골판지 3 · 합성수지 2/.test(text), '**배출 용기 종류와 개수가 보임**', text.slice(0, 120))
ok(/\(5개\)/.test(text), '용기 합계도 함께', text.match(/\([0-9]+개\)/)?.[0] ?? '없음')
ok(/자재 박스 10 · 바늘통 2/.test(text), '**그날 건넨 자재가 보임**')
ok(/지하 주차 후 화물엘리베이터/.test(text), '기사님이 적은 특이사항이 보임')
ok(/118kg/.test(text), '수거량도 그대로')
ok(/김준기/.test(text), '누가 갔는지')

// ── F4. 아직 안 들어온 곳 ──────────────────────────────────────────────────
ok((await p.locator('[data-field-pending]').count()) > 0, '**아직 입력이 없는 곳이 보임**')
const pend = ((await p.locator('[data-field-pending]').innerText()) ?? '').replace(/\s+/g, ' ')
ok(/연세의원/.test(pend), '어느 병원인지', pend.slice(0, 80))
ok(/14:00/.test(pend), '예정 시각도 함께')
ok(/오대성/.test(pend), '누가 가기로 했는지')
//  ⚠ 가장 중요한 검사 — 시스템이 「누락」이라고 단정하면 안 됩니다.
//    ⚠ 카드 전체를 보면 안 됩니다. 아래 안내문은 「'안 했다'가 아니라」라고
//      **부인하는** 문장이라, 전체를 훑으면 그 부인까지 걸립니다.
//      단정하는 자리는 **제목**입니다 — 거기만 봅니다.
const head = ((await p.locator('[data-field-pending-headline]').textContent()) ?? '').replace(/\s+/g, ' ')
ok(!/누락|빠뜨|미이행|안 함/.test(head), '**제목이 「누락」이라고 단정하지 않음** (이유를 모르니까)', head)
ok(/아직 입력이 없는 곳/.test(head), '제목은 사실만 — 「아직 입력이 없는 곳」', head)
ok(/아직 입력이 없다/.test(pend), '「아직 입력이 없다」는 사실만 적음')

// ── 사람별 한 줄 — 「누구 것이 아직 안 들어왔나」 ───────────────────────────
//
//   ⚠ 이것도 **성적표가 아닙니다.** 사람 이름 옆에 숫자가 붙는 순간
//     그 숫자로 사람을 평가하게 됩니다. 그래서 「누락·미이행」 같은 말을
//     쓰지 않는지를 이 묶음 **안에서만** 봅니다 (아래 안내문의 부인 문장이
//     걸리지 않게).
ok((await p.locator('[data-field-staff]').count()) > 0, '**사람별 한 줄이 보임** (기사가 둘 이상일 때)')
const staff = ((await p.locator('[data-field-staff]').innerText()) ?? '').replace(/\s+/g, ' ')
ok(!/누락|빠뜨|미이행|안 함|미완료/.test(staff), '**사람별 줄이 「누락」이라고 단정하지 않음**', staff)

const kim = ((await p.locator('[data-field-staff-row="김준기"]').innerText()) ?? '').replace(/\s+/g, ' ')
ok(/1곳 들어옴/.test(kim), '들어온 사람은 「N곳 들어옴」', kim)
ok(!/아직/.test(kim), '다 들어온 사람에게는 「아직」을 안 붙임', kim)

const oh = ((await p.locator('[data-field-staff-row="오대성"]').innerText()) ?? '').replace(/\s+/g, ' ')
ok(/0곳 들어옴/.test(oh), '아직인 사람도 사실 그대로 — 「0곳 들어옴」', oh)
ok(/1곳 아직/.test(oh), '**「1곳 아직」** — 「안 했다」가 아니라 「아직」', oh)

// ── 용기를 안 적은 건은 0 으로 채우지 않는다 ──────────────────────────────
{
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } })
  ctx2.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx2.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/schedules')) return json([{ ...schedules[0], containers: null }])
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p2 = await ctx2.newPage()
  await p2.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'o@b.c', app_metadata: {}, user_metadata: {} }])
  await p2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(2600)
  const t2 = ((await p2.locator('[data-field-today]').innerText()) ?? '').replace(/\s+/g, ' ')
  ok(/용기 미기재/.test(t2), '**용기를 안 적었으면 「미기재」** (0개로 채우지 않음)', t2.slice(0, 100))
  ok(!/용기 0/.test(t2), '「용기 0」이라고 쓰지 않음')
  await ctx2.close()
}

// ── 기사님 화면에는 안 뜬다 ────────────────────────────────────────────────
{
  const fid = '00000000-0000-0000-0000-0000000000f1'
  const fme = { ...me, id: fid, role: 'field', name: '김준기' }
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  ctx3.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  ctx3.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? fme : [fme])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const p3 = await ctx3.newPage()
  await p3.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: fid, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await p3.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p3.waitForTimeout(2600)
  ok((await p3.locator('[data-field-today]').count()) === 0,
    '기사님 화면에는 안 뜸 (자기가 방금 넣은 것을 다시 보여 줄 이유가 없음)')
  await ctx3.close()
}
await b.close()
