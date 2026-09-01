import { chromium, EXEC } from './_pw.mjs'
import { UPLOAD_DIR, requireUploads } from './_uploads.mjs'

//  실제 더원요양병원 파일을 관리자 화면에 올려, 「확인 필요」가 접혀서
//  보이는지 확인합니다. 내용이 줄어들면 안 됩니다 — 접히기만 해야 합니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const XLSX = `${UPLOAD_DIR}/1a85e0e1-202602_____________.xlsx`
requireUploads([XLSX])
const UID = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}
//  더원요양병원이 이미 등록돼 있는 상태로 둡니다 (거래처 선택이 자동으로 되도록)
const clients = [{
  id: C1, name: '더원요양병원', type: '요양병원', address: '경기도', manager: '', phone: '',
  collection_cycle: '', collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) {
    const st = { id: 1, corrugated_box: 100, plastic_container: 50, bag: 200, needle_box: 30 }
    return json(single ? st : [st])
  }
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)

await p.setInputFiles('input[type="file"]', XLSX)
await p.waitForTimeout(2500)

const body = () => p.textContent('main').then((t) => t ?? '')
ok(/더원요양병원/.test(await body()), '파일을 읽고 거래처를 알아봄')

//  접힌 묶음이 있는가
const groups = p.locator('[data-issue-group]')
ok((await groups.count()) === 1, '반복되는 항목이 한 묶음으로 접힘', `${await groups.count()}묶음`)
ok(/수거 날짜가 없는 달 6건/.test(await body()), '「수거 날짜가 없는 달 6건」으로 표시')

//  화면에 보이는 「확인 필요」 줄 수 — 8줄이 3줄로
const rows = await p.locator('.card ul > li').count()
//  묶음 안만 봅니다 — 화면 아래 「월별 합계 대조」 표에도 같은 달이 나옵니다.
const collapsedText = (await groups.first().textContent()) ?? ''
ok(!/2026-02/.test(collapsedText), '접혀 있을 때는 달별 줄이 안 보임')
ok(rows === 3, '확인 필요가 8줄에서 3줄로 줄어듦', `${rows}줄`)
await p.screenshot({ path: `${SHOT}/import-collapsed.png`, fullPage: true })

//  펼치면 6건이 전부 나와야 합니다 — 내용이 사라지면 안 됩니다
await groups.first().locator('button').first().click()
await p.waitForTimeout(600)
const opened = (await groups.first().textContent()) ?? ''
for (const m of ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) {
  ok(opened.includes(m), `펼치면 ${m} 이 보임`)
}
ok(/6,698,400/.test(opened), '금액도 그대로 보임')
await p.screenshot({ path: `${SHOT}/import-expanded.png`, fullPage: true })

//  묶이지 않는 항목은 그대로 한 줄씩
const all = await body()
ok(/정산 상태가 「미수금」/.test(all), '미수금 항목은 따로 보임')
ok(/2025년 8월 거래명세서/.test(all), '명세서 제목 불일치 항목도 따로 보임')

console.log(`(참고: 목록 li 수 ${rows})`)
await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
