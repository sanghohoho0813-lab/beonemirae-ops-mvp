import { chromium, EXEC } from './_pw.mjs'

//  휴무일 — 일정 편성이 쉬는 날에 방문을 잡지 않도록.
//
//   편성은 실제 이력에서 요일 패턴을 찾으므로 일요일에 안 가던 곳은
//   일요일이 안 잡힙니다. 그런데 평일에 떨어지는 공휴일은 그냥 평일로
//   봤습니다 — 한 달치를 편성하면 그 달 공휴일만큼 잘못된 예정이 기사에게
//   나가고, 이사님이 손으로 지웁니다. 지우는 것을 잊으면 헛걸음합니다.
//
//   시나리오
//    A병원  최근 12주 매주 (오늘 요일)마다 수거 → 그 요일이 패턴으로 잡힘
//    앞으로 4주 중 두 번째 그 요일을 휴무일로 등록
//    → 그 날짜만 편성에서 빠지고, 「휴무일이라 뺌 1건」으로 보임

const BASE = 'http://localhost:4173'
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const shift = (base, n) => {
  const d = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
//  편성 대상은 오늘 이후입니다. 오늘부터 7·14·21일 뒤가 같은 요일입니다.
const D7 = shift(TODAY, 7)
const D14 = shift(TODAY, 14)
const D21 = shift(TODAY, 21)

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
const CA = '00000000-0000-0000-0000-0000000000a1'
const clients = [{
  id: CA, name: 'A병원', type: '병원', address: '', manager: '', phone: '', collection_cycle: '주 1회',
  collects_medical_waste: true, collects_diaper: false, storage_size: '보통', note: '',
  is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: null, contract_end: null, payment_terms: '', payment_due_day: null,
  pricing: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  biz_no: null, biz_ceo: null, biz_type: null, biz_item: null, tax_email: null, vat_mode: null,
}]

//  최근 12주 같은 요일마다 완료 수거 — 요일 패턴의 근거입니다.
const schedules = []
for (let w = 1; w <= 12; w += 1) {
  const d = shift(TODAY, -7 * w)
  schedules.push({
    id: `s${w}`, date: d, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '', status: '완료', expected_amount: 100, actual_amount: 100,
    completed_at: `${d}T09:00:00Z`, memo: '', origin: 'migrated', is_additional: false,
    demo_session_id: null, plan_batch: null, created_at: `${d}T00:00:00Z`, updated_at: `${d}T00:00:00Z`,
  })
}

let holidays = []
const posted = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } })
await ctx.route('**/auth/v1/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }) }))
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/app_schema_version')) return json(34)
  if (url.includes('/rpc/set_holidays')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    posted.push(body)
    //  서버처럼 동작합니다 — 있던 날은 이름만 덮어씁니다.
    let added = 0
    let updated = 0
    for (const row of body.p_rows ?? []) {
      const at = holidays.findIndex((h) => h.day === row.day)
      if (at >= 0) { holidays[at] = { day: row.day, name: row.name }; updated += 1 }
      else { holidays.push({ day: row.day, name: row.name }); added += 1 }
    }
    return json({ added, updated })
  }
  if (url.includes('/rpc/delete_holiday')) {
    const body = JSON.parse(r.request().postData() ?? '{}')
    holidays = holidays.filter((h) => h.day !== body.p_day)
    return json({ day: body.p_day })
  }
  if (url.includes('/audit_logs')) return json([{ id: 1 }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/holidays')) return json(holidays)
  if (url.includes('/schedules')) return json(schedules)
  if (url.includes('/payment_receipts')) return json([])
  if (url.includes('/payments')) return json([])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/vehicles')) return json([])
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
p.on('dialog', (d) => d.accept())

await p.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-plan-summary]', { timeout: 20000 })
await p.waitForTimeout(900)

// ── 1. 휴무일이 없으면 그 사실을 말해 주는가 ──────────────────────────────
const status0 = ((await p.textContent('[data-holiday-status]')) ?? '').replace(/\s+/g, ' ')
ok(/등록된 휴무일이 없습니다/.test(status0), '휴무일이 없으면 조용히 있지 않고 알려 줌', status0.slice(0, 80))
ok(/짐작하지 않습니다/.test(status0), '왜 시스템이 안 채우는지 적음')

const before = ((await p.textContent('[data-plan-summary]')) ?? '').replace(/\s+/g, ' ')
const madeBefore = Number((before.match(/만들 일정\s*(\d+)/) ?? [])[1] ?? 0)
ok(madeBefore >= 3, '휴무일이 없을 때 4주치 예정이 만들어짐', String(madeBefore))
ok(/휴무일이라 뺌\s*0건/.test(before), '뺀 건이 0건', before.slice(0, 100))

// ── 2. 붙여 넣은 목록을 읽는가 ────────────────────────────────────────────
//  일부러 세 가지 표기를 섞습니다 — 달력에서 긁어 오는 모양이 제각각입니다.
const [y2, m2, d2] = D14.split('-')
await p.fill('[data-holiday-input]',
  `${D7} 임시공휴일\n${y2}.${Number(m2)}.${Number(d2)} 창립기념일\n${Number(D21.slice(5, 7))}월 ${Number(D21.slice(8))}일 하계휴가\n이건뭐지`)
await p.waitForTimeout(700)
const preview = ((await p.textContent('[data-holiday-preview]')) ?? '').replace(/\s+/g, ' ')
ok(/3일을 읽었습니다/.test(preview), '표기가 섞여 있어도 3일을 읽음', preview.slice(0, 90))
ok(preview.includes(`${D7} 임시공휴일`), '하이픈 표기', preview.slice(0, 90))
ok(preview.includes(`${D14} 창립기념일`), '점 표기 (2026.1.1)')
ok(preview.includes(`${D21} 하계휴가`), '「N월 N일」 표기 — 연도는 기준 연도로')
const bad = ((await p.textContent('[data-holiday-bad]')) ?? '').replace(/\s+/g, ' ')
ok(/읽지 못한 줄 1개/.test(bad), '읽지 못한 줄을 조용히 버리지 않음', bad.slice(0, 80))
ok(/이건뭐지/.test(bad), '어느 줄인지 그대로 보여 줌')

// ── 3. 저장 ───────────────────────────────────────────────────────────────
await p.click('[data-holiday-save]')
await p.waitForTimeout(1800)
ok(posted.length === 1, '서버로 한 번 보냄', String(posted.length))
const sent = posted[0]?.p_rows ?? []
ok(sent.length === 3, '읽은 3일만 보냄 (읽지 못한 줄은 안 보냄)', String(sent.length))
ok(sent.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)), '날짜를 YYYY-MM-DD 로 정리해 보냄',
  sent.map((r) => r.day).join(','))
const msg = (await p.textContent('[data-holiday-msg]')) ?? ''
ok(/3일 등록/.test(msg), '몇 일이 등록됐는지 알려 줌', msg.trim())

// ── 4. 편성에서 빠지는가 ──────────────────────────────────────────────────
const after = ((await p.textContent('[data-plan-summary]')) ?? '').replace(/\s+/g, ' ')
const madeAfter = Number((after.match(/만들 일정\s*(\d+)/) ?? [])[1] ?? 0)
ok(madeAfter === madeBefore - 3, `휴무일 3일만큼 예정이 줄어듦 (${madeBefore} → ${madeAfter})`, after.slice(0, 100))
ok(/휴무일이라 뺌\s*3건/.test(after), '「휴무일이라 뺌 3건」으로 보임', after.slice(0, 110))

const status1 = ((await p.textContent('[data-holiday-status]')) ?? '').replace(/\s+/g, ' ')
ok(/휴무일 3일.*등록/.test(status1), '이 기간에 몇 일이 등록됐는지', status1.slice(0, 90))
ok(!/등록된 휴무일이 없습니다/.test(status1), '경고가 사라짐')

//  「이미 있어 건너뜀」과 「휴무일이라 뺌」은 다른 이야기입니다 — 한
//  숫자로 묶으면 휴무일 때문에 빠진 것을 이미 있는 일정으로 읽습니다.
ok(/이미 있어 건너뜀\s*0건/.test(after), '휴무일은 「이미 있어 건너뜀」에 섞이지 않음', after.slice(0, 110))

//  왜 빠졌는지 목록에 이유가 적혀야 합니다 (접혀 있으므로 펴 봅니다)
await p.locator('section:has([data-plan-skipped]) button, button:has-text("건 보기")').first().click()
await p.waitForTimeout(600)
const skippedTxt = ((await p.textContent('[data-plan-skipped]')) ?? '').replace(/\s+/g, ' ')
ok(/휴무일입니다 \(임시공휴일\)/.test(skippedTxt), '건너뛴 이유에 휴무일 이름을 적음', skippedTxt.slice(0, 100))

// ── 5. 이미 만들어 둔 예정이 휴무일에 걸린 경우 ───────────────────────────
//  휴무일을 나중에 넣으면 생깁니다. 저절로 지우지 않습니다.
schedules.push({
  id: 'sp1', date: D7, client_id: CA, waste_type: '의료폐기물', vehicle_id: null,
  scheduled_time: '', status: '예정', expected_amount: 100, actual_amount: null,
  completed_at: null, memo: '', origin: 'system', is_additional: false,
  demo_session_id: null, plan_batch: null, created_at: `${TODAY}T00:00:00Z`, updated_at: `${TODAY}T00:00:00Z`,
})
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-holiday-clash]', { timeout: 20000 })
const clash = ((await p.textContent('[data-holiday-clash]')) ?? '').replace(/\s+/g, ' ')
ok(/예정 1건이 휴무일에 잡혀 있습니다/.test(clash), '이미 있던 예정이 휴무일에 걸린 것을 알려 줌', clash.slice(0, 80))
ok(/저절로 지우지 않습니다/.test(clash), '자동으로 지우지 않는다고 밝힘 — 명절에도 가는 곳이 있습니다')

// ── 6. 휴무일 삭제 ────────────────────────────────────────────────────────
await p.click(`[data-holiday-list], [data-holiday-row="${D7}"]`).catch(() => {})
const expander = p.locator('button:has-text("등록된 휴무일")')
if ((await expander.count()) > 0) {
  await expander.first().click()
  await p.waitForTimeout(500)
}
ok((await p.locator(`[data-holiday-row="${D7}"]`).count()) === 1, '등록된 목록에 보임')
await p.click(`[data-holiday-del="${D7}"]`)
await p.waitForTimeout(1500)
ok(holidays.length === 2, '서버에서 하루가 지워짐', String(holidays.length))
const after2 = ((await p.textContent('[data-plan-summary]')) ?? '').replace(/\s+/g, ' ')
ok(/휴무일이라 뺌\s*2건/.test(after2), '지운 만큼 다시 편성에 들어옴', after2.slice(0, 110))

await b.close()
console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
