import { chromium, EXEC } from './_pw.mjs'
import { UPLOAD_DIR, requireUploads } from './_uploads.mjs'

//  대표님이 겪은 그대로 재현합니다.
//   오남한양병원 = 명세서에 날짜가 하나도 없는 파일.
//   예전에는 「등록 예정 0건」이라 가져오기 버튼이 잠겨서, 8개월치 월 실적을
//   저장할 방법이 아예 없었습니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UP = UPLOAD_DIR
//  ⚠ 폴더만 보면 안 됩니다 — 다른 파일이 올라와 폴더가 다시 생기면
//    폴더는 있는데 엑셀은 없어서 도중에 터집니다 (0095 에서 실제로 그랬습니다).
//    이 스위트가 쓰는 파일을 **하나씩** 확인합니다.
requireUploads([`${UP}/7c6daff4-202304_____________.xlsx`])
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
const client = {
  id: C1, name: '오남한양병원', type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '주 1회', collects_medical_waste: true, collects_diaper: false,
  storage_size: '보통', note: '', is_demo_generated: false, demo_session_id: null, active: true,
  contract_start: '2025-05-01', contract_end: '2028-04-30', payment_terms: '익월 25일',
  payment_due_day: 25, pricing: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const rpc = []
const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx.route('**/rest/v1/**', (r) => {
  const req = r.request()
  const url = req.url()
  const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/rpc/import_excel_rows')) {
    let body = {}
    try { body = JSON.parse(req.postData() ?? '{}') } catch { /* 무시 */ }
    rpc.push(body)
    return json({ inserted: 0, skipped: 0, conflict: 0, clientFields: 0, months: (body.p_monthly ?? []).length })
  }
  if (req.method() === 'POST') return json([{ id: 'x' }])
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/client_monthly_actuals')) return json([])
  if (url.includes('/clients')) return json(single ? client : [client])
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
p.on('dialog', (d) => d.accept())
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
await p.setInputFiles('input[type="file"]', `${UP}/7c6daff4-202304_____________.xlsx`)
await p.waitForTimeout(2500)
//  파일의 상호(오남한양병원)와 명세서의 법인명이 달라 자동 선택이 안 됩니다 — 직접 고릅니다.
await p.selectOption('#import-client', C1)
await p.waitForTimeout(900)

const t = await p.textContent('main')
ok(/등록 예정\s*0건/.test(t.replace(/\s+/g, ' ')), '날짜 있는 줄은 0건 (파일 그대로)')
ok(/월 실적\s*8개월/.test(t.replace(/\s+/g, ' ')), '월 실적 8개월이 저장 대상으로 잡힘')

const btn = p.locator('[data-import-run]')
ok((await btn.count()) === 1, '가져오기 버튼이 있음')
ok(!(await btn.isDisabled()), '★ 버튼이 잠겨 있지 않음 (예전에는 잠겼습니다)')
ok(/월 실적 8개월/.test((await btn.textContent()) ?? ''), '버튼에 무엇이 저장되는지 적힘', (await btn.textContent())?.trim())

await btn.click()
await p.waitForTimeout(2000)
ok(rpc.length === 1, '서버로 가져오기 요청이 나감')
ok((rpc[0]?.p_monthly ?? []).length === 8, '월 실적 8개월이 실제로 서버로 감', String((rpc[0]?.p_monthly ?? []).length))
ok((rpc[0]?.p_rows ?? []).length === 0, '없는 수거는 만들지 않음 (가짜 날짜 0)')
//  값이 파일 그대로인가 — 오남한양 1월 9,531kg · 900만원
const jan = (rpc[0]?.p_monthly ?? []).find((m) => m.month === '2026-01')
ok(jan?.medicalKg === 9531 && jan?.revenue === 9000000, '1월 값이 파일과 같음', JSON.stringify(jan))
await p.screenshot({ path: `${SHOT}/p0-monthly-only.png`, fullPage: true })

// ── 운영조건 탭의 가짜 값이 사라졌는지 ────────────────────────────────────
await p.goto(`${BASE}/clients/${C1}`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
//  ⚠ 0087 탭 순서 변경 — 거래 시작일·결제조건·처리장은 「운영조건」 탭에
//    있습니다. 예전에는 그게 첫 탭이었습니다. 값이 사라진 것이 아니라
//    자리가 뒤로 갔습니다 (매일 보는 수거이력이 앞으로 왔습니다).
await p.locator('[data-client-tab="ops"]').first().dispatchEvent('click')
await p.waitForTimeout(700)
const c = await p.textContent('main')
ok(/2025\.05/.test(c), '거래 시작일이 엑셀의 계약일(2025.05)')
ok(!/2022\.02|2021\.|2023\./.test(c), '★ id 로 지어낸 시작일이 사라짐')
ok(/익월 25일/.test(c), '결제조건이 엑셀 그대로 (익월 25일)')
ok(!/익월 15일 입금|월말 마감/.test(c), '★ 지어낸 결제조건이 사라짐')
ok(!/수도권 의료폐기물 처리장 A/.test(c), '★ 지어낸 처리장 이름이 사라짐')
ok(/미등록/.test(c), '없는 값은 「미등록」으로 정직하게 표시')
await p.screenshot({ path: `${SHOT}/p0-profile.png`, fullPage: true })

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
