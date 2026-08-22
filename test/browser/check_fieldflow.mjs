import { chromium, EXEC } from './_pw.mjs'

//  현장 기사님이 한 병원에서 수거 한 건을 넣는 **실제 흐름**을 잽니다.
//
//   오늘 일정 → 병원 누름 → 수거량 → 용기 → 자재 → 완료
//
//  이사님 통화 기준 목표: 「휴대폰에서 몇 번의 터치로」.
//  그래서 세는 것은 **화면 수**와 **수거량 칸까지의 거리**입니다.

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000f1'
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }

const C1 = '00000000-0000-0000-0000-0000000000a1'
const me = { id: UID, email: 'f@b.c', name: '김준기', role: 'field', font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z' }
const clients = [{
  id: C1, name: '의료법인 한마음의료재단 한마음요양병원', type: '요양병원',
  address: '경기도 남양주시 오남읍 양지로 47-35', manager: '김담당', phone: '031-111-2222',
  collection_cycle: '주 3회', collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
  note: '', is_demo_generated: false, active: true, pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const schedules = [{
  id: 's1', date: TODAY, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null,
  completed_at: null, memo: '', origin: 'plan', canceled_at: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
}]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(64)
  if (url.includes('/rpc/')) return json(null)
  if (url.includes('/profiles')) return json(single ? me : [me])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])

// ── 1. 오늘 일정에서 병원을 누른다 ──────────────────────────────────────────
await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2600)
const entry = p.locator('a[href*="/collection"], button').filter({ hasText: /수거|입력/ }).first()
ok((await entry.count()) > 0, '오늘 일정에서 수거 입력으로 가는 길이 있음')

// ── 2. 일정을 고른 상태의 수거 입력 ────────────────────────────────────────
await p.goto(`${BASE}/collection?schedule=s1`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2600)
//  주소로 못 넘기면 화면에서 직접 고릅니다 (기사님이 실제로 하는 동작)
if ((await p.locator('[data-collect-here]').count()) === 0) {
  const pick = p.locator('button').filter({ hasText: /한마음/ }).first()
  if (await pick.count()) { await pick.dispatchEvent('click'); await p.waitForTimeout(900) }
}
ok((await p.locator('[data-collect-here]').count()) > 0, '**「지금 이 병원」 한 줄로 접힘** (①②를 다시 안 지나감)')
const name = ((await p.locator('[data-collect-here-name]').textContent()) ?? '').trim()
ok(/한마음/.test(name), '어느 병원인지 크게 보임', name)
const here = ((await p.locator('[data-collect-here]').innerText()) ?? '').replace(/\s+/g, ' ')
ok(/양지로/.test(here), '주소가 함께 보임')
ok(/031-111-2222/.test(here), '전화번호가 함께 보임 (바로 걸 수 있게)')
ok((await p.locator('[data-collect-repick]').count()) > 0, '다른 일정으로 바꿀 길이 남아 있음')

const m = await p.evaluate(() => {
  const findY = (re) => {
    for (const el of document.querySelectorAll('main *')) {
      const t = (el.textContent || '').replace(/\s+/g, ' ')
      if (t.length < 200 && re.test(t)) return Math.round(el.getBoundingClientRect().top + window.scrollY)
    }
    return -1
  }
  return {
    height: document.documentElement.scrollHeight,
    amountY: findY(/수거량/),
    inputs: document.querySelectorAll('main input, main select, main textarea').length,
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }
})
ok(m.overflow === 0, '가로로 밀리지 않음', `${m.overflow}px`)
ok(m.amountY > 0 && m.amountY < 900, '**수거량이 첫 화면 언저리에 있음** (예전 두 화면 아래)', `y=${m.amountY}px`)
//  ⚠ 여기 숫자는 **지금까지 줄인 만큼**이지 목표가 아닙니다.
//    예전 3,378px(4.0화면) → 지금 2,932px(3.5화면). 목표는 2,600px 이하이고
//    아직 못 갔습니다. 남은 큰 덩어리는 「차량·기사」 395px 인데, 계정에
//    차량이 묶이면(0056) 고를 것이 없어 접을 수 있습니다 — 다음 회차 후보.
//    이 검사는 **다시 늘어나는 것**을 막는 자리입니다.
ok(m.height < 3000, '전체 길이가 줄어든 상태를 지킴 (목표 2,600px 은 아직)', `${m.height}px = ${(m.height / 844).toFixed(1)}화면`)

console.log(`   (참고) 입력칸 ${m.inputs}개 · 문서 ${m.height}px`)

// ── 3. 직접 입력일 때는 예전 그대로 ────────────────────────────────────────
await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2400)
const direct = await p.evaluate(() => (document.querySelector('main')?.innerText ?? ''))
ok(/오늘 일정 선택/.test(direct), '일정 없이 들어오면 고르는 단계가 그대로 있음')

// ── 4. F2 — 계정에 차량이 묶여 있으면 「차량·기사」가 한 줄이 된다 ──────────
//
//   위 2번에서 남은 가장 큰 덩어리가 「차량·기사」였습니다. 그런데 이건
//   **코드가 없어서**가 아니라 **계정에 차량이 안 묶여 있어서** 펼쳐진
//   것입니다 (0056 의 `vehicleHidden`). 그래서 새로 만들 것이 아니라
//   **묶었을 때 실제로 줄어드는지**를 재는 것이 맞습니다.
//
//   ⚠ 두 상태를 같은 데이터로 나란히 재야 의미가 있습니다. 묶인 쪽만 재면
//     「원래 짧았던 것」과 구별이 안 됩니다.
const V1 = '00000000-0000-0000-0000-0000000000v1'
//  ⚠ `active` 를 반드시 넣습니다. repo 는 `vehicles.filter((v) => v.active)`
//    로 갈라 담기 때문에(repo.ts:507), 이 칸이 없으면 **차량이 한 대도 없는
//    상태**가 됩니다. 처음에 이걸 빠뜨려서 「묶어도 안 접힌다」는 실패가
//    났는데, 원인은 제품이 아니라 이 fixture 였습니다.
const vehicles = [
  { id: V1, name: '80가 1234 (1t)', waste_type: '의료폐기물', tonnage: 1,
    nominal_capacity: 1000, expected_capacity: 800, driver: '김준기', active: true },
  { id: '00000000-0000-0000-0000-0000000000v2', name: '80가 5678 (3.5t)',
    waste_type: '의료폐기물', tonnage: 3.5, nominal_capacity: 3500,
    expected_capacity: 2800, driver: '이하늘', active: true },
]

async function measure(bound) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const pf = { ...me, vehicle_id: bound ? V1 : null }
  c.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }) }))
  c.route('**/rest/v1/**', (r) => {
    const url = r.request().url()
    const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
    if (url.includes('/rpc/app_schema_version')) return json(64)
    if (url.includes('/rpc/')) return json(null)
    if (url.includes('/profiles')) return json(single ? pf : [pf])
    if (url.includes('/clients')) return json(single ? clients[0] : clients)
    if (url.includes('/schedules')) return json(schedules)
    if (url.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
    if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
    return json([])
  })
  const q = await c.newPage()
  await q.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: 'f@b.c', app_metadata: {}, user_metadata: {} }])
  await q.goto(`${BASE}/collection?schedule=s1`, { waitUntil: 'domcontentloaded' })
  await q.waitForTimeout(2600)
  if ((await q.locator('[data-collect-here]').count()) === 0) {
    const pick = q.locator('button').filter({ hasText: /한마음/ }).first()
    if (await pick.count()) { await pick.dispatchEvent('click'); await q.waitForTimeout(900) }
  }
  const r = await q.evaluate(() => {
    //  「차량·기사」 덩어리의 실제 높이 — 접힌 쪽은 한 줄 카드입니다.
    //  0067 — 현장은 한 줄입니다 (고르는 칸 없음).
    //  ⚠ [data-auto-vehicle] 는 **칸 전체**라 차량이 없을 때도 있습니다
    //    (그 안에 안내문이 들어갑니다). 「보여 줄 차가 있는가」는
    //    [data-vehicle-auto] — 차량 줄 자체 — 로 봐야 합니다.
    const one = document.querySelector('[data-vehicle-auto]') ?? document.querySelector('[data-my-vehicle]')
    let vh = 0
    if (one) vh = Math.round(one.getBoundingClientRect().height)
    else {
      //  펼쳐진 쪽은 감싸는 태그가 정해져 있지 않습니다. 「배차 차량」과
      //  아래 안내문을 **둘 다** 품은 것 중 **가장 작은 것**이 그 덩어리의
      //  뿌리입니다 — 위로 갈수록 화면 전체를 품어 버립니다.
      //  ⚠ 처음에 `main section, main > div` 로 찾다가 하나도 못 찾아
      //    0px 이 나왔고, 그 0 이 「줄었다」로 읽힐 뻔했습니다.
      const cands = [...document.querySelectorAll('main *')].filter((el) => {
        const t = (el.textContent || '')
        return t.includes('배차 차량') && t.includes('전용 차량만 배차')
      })
      vh = cands.length
        ? Math.round(Math.min(...cands.map((el) => el.getBoundingClientRect().height)))
        : 0
    }
    return {
      height: document.documentElement.scrollHeight,
      vehicleH: vh,
      //  고를 차가 실제로 있는지 — 0 대면 「접혔다/펼쳤다」 비교가 무의미합니다
      options: [...document.querySelectorAll('main select option')]
        .filter((o) => /\(1t\)|\(3\.5t\)/.test(o.textContent || '')).length,
      hasOneLine: !!one,
      canRepick: !!document.querySelector('[data-vehicle-other]'),
      //  안 묶인 계정에는 「담당 차량이 지정되지 않았습니다」 안내가 뜹니다
      unset: !!document.querySelector('[data-vehicle-unset]'),
      saveLocked: !!document.querySelector('[data-tour="collect-save"]')?.disabled,
      text: (one?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  })
  await c.close()
  return r
}

const free = await measure(false)
const boundM = await measure(true)

//  ⚠ 먼저 **고를 차가 있는지**부터 봅니다. 차가 0 대면 아래 비교가 전부
//    「원래 없던 것」이 되어 통과해 버립니다 — 실제로 그렇게 잘못 잰 적이
//    있습니다 (fixture 에 active 를 빠뜨렸습니다).
//  ⚠ 0067 부터 **현장에는 고르는 칸이 아예 없습니다** (대표님 지시:
//    「기사님이 생각하거나 선택해야 할 항목을 최대한 없애는 것」).
//    그래서 예전처럼 「고를 차가 2대 이상인가」를 재면 늘 0 이 나옵니다 —
//    그건 결함이 아니라 **없앤 것**입니다. 재는 자리를 바꿉니다.
ok(free.options === 0, '현장 화면에는 차량 고르는 칸이 없음 (0067)', `${free.options}대`)
ok(!free.hasOneLine, '차량이 안 묶이면 보여 줄 차도 없음')
ok(free.unset, '**안 묶인 계정에는 「담당 차량이 지정되지 않았습니다」 안내**')
ok(free.saveLocked, '**안 묶인 계정은 저장이 잠김** (거절당하는 화면을 안 보여 줌)')
ok(boundM.hasOneLine, '**계정에 차량이 묶이면 한 줄로 보임**')
ok(/80가 1234/.test(boundM.text), '무엇으로 저장되는지는 그대로 보여 줌', boundM.text)
ok(/김준기/.test(boundM.text), '기사 이름은 **로그인한 본인** — 차량에 적힌 기본 기사가 아님', boundM.text)
ok(!boundM.canRepick, '「오늘은 다른 차로 갔어요」는 없앰 (0067 — 사무실이 고칩니다)')
ok(!boundM.saveLocked, '묶여 있으면 저장이 잠기지 않음')
//  ⚠ 여기 숫자는 **잰 값**이지 목표가 아닙니다.
//
//    묶으면 2,785 → 2,631px 입니다. 제가 잡았던 2,600px 에 **31px 못 미칩니다.**
//    그 31px 을 맞추려고 기준을 2,631 로 내리지 않습니다 — 그건 통과시키려고
//    자를 고치는 것입니다. 대신 **다시 늘어나는 것**을 막는 자리로 둡니다.
//
//    (참고) 안 묶인 값이 2,932 → 2,785px 로 줄어 보이는 것은 화면이 바뀌어서가
//    아니라, 이번 fixture 에는 차량이 등록돼 있어 「등록된 차량이 없어 저장할
//    수 없습니다」 안내가 안 뜨기 때문입니다.
//  ⚠ 0065·0067 로 많이 줄었습니다. 이 숫자는 **잰 값**이지 목표가 아니고,
//    다시 늘어나는 것을 막는 자리입니다.
ok(boundM.height < 2700, '묶은 계정 길이가 늘어나지 않음',
  `${boundM.height}px = ${(boundM.height / 844).toFixed(1)}화면 (안 묶으면 ${free.height}px)`)

console.log(`   (참고) 차량 칸 ${free.vehicleH}px → ${boundM.vehicleH}px · 문서 ${free.height}px → ${boundM.height}px`)

await b.close()
