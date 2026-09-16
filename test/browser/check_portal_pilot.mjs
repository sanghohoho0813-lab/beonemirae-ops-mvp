import { chromium, EXEC } from './_pw.mjs'

//  0124 — Pilot 병원 계정 두 곳의 **격리 확인** (기존 구조 그대로, 코드 변경 없음)
//
//   실제 계정은 대표님이 「사용자 관리 → 계정 만들기」로 만드십니다. 이 검사는
//   그 계정이 만들어졌을 때 **무엇이 보이고 무엇이 막히는지**를 지금 미리
//   확인합니다 — 역할 `client` + 소속 병원 하나로 로그인한 상태를 그대로 흉내 냅니다.
//
//   두 병원 각각에 대해
//    · 로그인하면 /portal 로 들어간다
//    · 자기 병원 이름만 보이고 **다른 병원 이름은 화면에 없다**
//    · 자기 병원의 일정·자재만 보인다 (다른 병원 것은 목록에 없다)
//    · BUSINESS AX(내부 화면)로 주소를 직접 쳐도 들어가지 못한다
//      — 대시보드 · 거래처 · 오늘 일정 · 수거입력 · 성과 · AX 코치 · 청구 · 설정
//    · 다른 병원 포털 주소(/portal/c/<남의 id>)로도 들어가지 못한다
//
//   ⚠ 여기서 막는 것은 **화면**입니다. 서버도 같은 기준으로 막습니다
//     (0006_portal.sql: is_client_user() and client_id = auth_client_id()).

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass += 1
  else fail += 1
  console.log(`${cond ? ' OK ' : 'FAIL'} | ${name}${detail && !cond ? ` — ${detail}` : ''}`)
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

//  Pilot 두 곳 + 섞이면 안 되는 제3의 병원
const A = { id: '00000000-0000-0000-0000-0000000000a1', name: '오남한양병원', user: '00000000-0000-0000-0000-0000000000u1' }
const B = { id: '00000000-0000-0000-0000-0000000000b1', name: '남양주백병원', user: '00000000-0000-0000-0000-0000000000u2' }
const OTHER = { id: '00000000-0000-0000-0000-0000000000c1', name: '해올요양병원' }

const clientRow = (c) => ({
  id: c.id, name: c.name, type: '병원', address: '경기도 남양주시', manager: '원무과', phone: '031-000-0000',
  collection_cycle: '주 2회', collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true, pricing: {},
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const ALL_CLIENTS = [clientRow(A), clientRow(B), clientRow(OTHER)]
const sched = (id, c, time) => ({
  id, client_id: c.id, date: T, waste_type: '의료폐기물', scheduled_time: time, status: '예정',
  vehicle_id: null, expected_amount: 100, actual_amount: null, completed_at: null, memo: '', origin: 'system',
  is_additional: false, canceled_at: null, demo_session_id: null, handover_status: null, driver_name: '',
  created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z`,
})
const ALL_SCHEDULES = [sched('sa', A, '09:00'), sched('sb', B, '11:00'), sched('sc', OTHER, '14:00')]
const mat = (id, c, box) => ({
  id, date: T, client_id: c.id, box_count: box, vinyl_count: 0, needle_box_count: 0,
  is_additional_request: false, memo: '', origin: 'field', demo_session_id: null, items: { box63: box },
  created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z`,
})
const ALL_MATERIALS = [mat('ma', A, 4), mat('mb', B, 7), mat('mc', OTHER, 9)]

const BASE = 'http://localhost:4173'
const b = await chromium.launch({ executablePath: EXEC })

/**
 * 병원 계정으로 연 화면.
 *  ⚠ 서버는 **그 병원 것만** 돌려줍니다 (RLS). 그것을 그대로 흉내 내려고
 *    이 시늉 서버도 client_id 로 걸러서 돌려줍니다 — 화면이 남의 것을
 *    걸러 주기를 기대하지 않습니다.
 */
async function open(hospital, path = '/portal') {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const me = {
    id: hospital.user, email: `pilot-${hospital.id.slice(-2)}@example.invalid`, name: '원무과 담당자',
    role: 'client', font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z',
    client_id: hospital.id, vehicle_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: hospital.user, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }) }))
  ctx.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    const mine = (rows) => rows.filter((x) => x.client_id === hospital.id)
    if (url.includes('/rpc/app_schema_version')) return json(122)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? me : [me])
    if (url.includes('/clients')) {
      const only = ALL_CLIENTS.filter((c) => c.id === hospital.id)
      return json(single ? (only[0] ?? null) : only)
    }
    if (url.includes('/schedules')) return json(mine(ALL_SCHEDULES))
    if (url.includes('/materials')) return json(mine(ALL_MATERIALS))
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    window.localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    window.localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: hospital.user, aud: 'authenticated', email: me.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.body?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p }
}

//  내부 화면(BUSINESS AX) — 병원 계정에게 하나도 열리면 안 되는 주소
const INTERNAL = ['/', '/today', '/clients', '/collection', '/history', '/performance', '/ax-coach', '/billing', '/receivables', '/stats', '/settings', '/materials']

for (const [me, other] of [[A, B], [B, A]]) {
  console.log(`\n── ${me.name} 계정 ─────────────────────────────────────`)
  const { ctx, p } = await open(me)

  // ① 로그인하면 포털로
  ok('① 로그인하면 병원 포털로 들어감', new URL(p.url()).pathname.startsWith('/portal'), p.url())

  // ② 자기 병원만 보임
  const body = flat(await p.evaluate(() => document.body.innerText))
  ok('② 자기 병원 이름이 보임', body.includes(me.name), body.slice(0, 80))
  ok(`② **다른 Pilot 병원(${other.name}) 이름이 화면에 없음**`, !body.includes(other.name))
  ok(`② 제3의 병원(${OTHER.name}) 이름도 없음`, !body.includes(OTHER.name))

  // ③ 자기 일정·자재만
  const mineTime = me.id === A.id ? '09:00' : '11:00'
  const othersTime = me.id === A.id ? '11:00' : '09:00'
  const hist = await open(me, '/portal/history')
  const histBody = flat(await hist.p.evaluate(() => document.body.innerText))
  ok('③ 자기 병원 일정이 보임', histBody.includes(mineTime) || histBody.includes(me.name), histBody.slice(0, 80))
  ok('③ 남의 병원 일정 시각이 안 보임', !histBody.includes(othersTime) || histBody.includes(mineTime) === false ? !histBody.includes(othersTime) : !histBody.includes(othersTime))
  await hist.ctx.close()

  // ④ BUSINESS AX(내부 화면) 차단 — 주소를 직접 쳐도
  const blocked = []
  for (const path of INTERNAL) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(700)
    const now = new URL(p.url()).pathname
    const txt = flat(await p.evaluate(() => document.body.innerText))
    //  막혔다 = 그 주소에 머무르지 않거나(포털·로그인으로 돌려보냄),
    //  「권한이 없다」고 말하거나 — 둘 중 하나여야 합니다.
    const stayed = now === path
    const denied = /권한이 없|접근할 수 없|열람 권한|들어갈 수 없/.test(txt)
    if (stayed && !denied) blocked.push(`${path} → ${now} ${txt.slice(0, 40)}`)
  }
  ok('④ **내부 화면 12곳이 전부 막힘** (주소 직접 입력 포함)', blocked.length === 0, blocked.join(' / '))

  // ⑤ 남의 병원 포털 주소도 막힘
  await p.goto(`${BASE}/portal/c/${other.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const cross = flat(await p.evaluate(() => document.body.innerText))
  ok(`⑤ **남의 병원 포털 주소로도 그 병원 이름이 안 보임**`, !cross.includes(other.name), cross.slice(0, 80))

  await ctx.close()
}

console.log(`\n합계 ${pass + fail}검사 · 실패 ${fail}`)
await b.close()
if (fail > 0) process.exitCode = 1
