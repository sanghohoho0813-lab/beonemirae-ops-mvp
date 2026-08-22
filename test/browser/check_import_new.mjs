import { chromium, EXEC } from './_pw.mjs'

//  새로 받은 실제 파일 3종을 관리자 화면에 실제로 올려 봅니다.
//   · 해올요양병원  월정액 2건 — 정산 규칙이 미리보기에 보여야 함
//   · 서울온케어    박스 개당 — 자재(박스) 줄로 등록 예정
//   · 서울인화      명세서 시트 2개 + 연도 밀린 날짜 → 오류로 거름

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UP = '/root/.claude/uploads/1c636c94-52d3-5813-b2a8-7537162d97f7'
const UID = '00000000-0000-0000-0000-0000000000ad'

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
const mk = (n, name) => ({
  id: `00000000-0000-0000-0000-0000000000c${n}`, name, type: '병원', address: '', manager: '', phone: '',
  collection_cycle: '', collects_medical_waste: true, collects_diaper: true, storage_size: '보통',
  note: '', is_demo_generated: false, demo_session_id: null, active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})
const clients = [mk(1, '해올요양병원'), mk(2, '서울온케어의원'), mk(3, '서울인화스포츠마취통증의학과의원')]

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  if (url.includes('/clients')) return json(single ? clients[0] : clients)
  if (url.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

const body = () => p.textContent('main').then((t) => t ?? '')

// ── 1. 해올요양병원 — 월정액 2건 ──────────────────────────────────────────
await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)
await p.setInputFiles('input[type="file"]', `${UP}/28270947-202601_____________.xlsx`)
await p.waitForTimeout(2500)
let t = await body()
ok(/해올요양병원/.test(t), '해올: 파일을 읽고 거래처를 알아봄')
ok(/정산 규칙/.test(t) && /의료 월정액 1,300,000원/.test(t) && /지정 월정액 3,000,000원/.test(t),
  '해올: 월정액 두 건이 미리보기에 그대로 보임')
ok(/등록 예정/.test(t), '해올: 날짜 있는 수거 5건 등록 예정')
await p.screenshot({ path: `${SHOT}/import-haeol.png`, fullPage: true })

// ── 2. 서울온케어 — 박스 개당 ────────────────────────────────────────────
await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
await p.setInputFiles('input[type="file"]', `${UP}/2cb0894a-202404______________.xlsx`)
await p.waitForTimeout(2500)
t = await body()
ok(/서울온케어의원/.test(t), '온케어: 거래처 인식')
ok(/35L 박스/.test(t), '온케어: 35L 박스(새 규격) 줄이 보임')
ok(!/정산 규칙/.test(t), '온케어: 월정액 아님 — 규칙 줄 없음')

// ── 3. 서울인화 — 명세서 2시트 + 연도 밀린 날짜 ─────────────────────────
await p.goto(`${BASE}/import`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
await p.setInputFiles('input[type="file"]', `${UP}/4d162046-202512_______________________.xlsx`)
await p.waitForTimeout(2500)
//  파일의 거래처명이 「서울인화스포츠마취통증」(잘림)이라 자동 선택이 안 됩니다 —
//  실제 운영과 같이 사람이 거래처를 고릅니다.
await p.selectOption('#import-client', clients[2].id)
await p.waitForTimeout(800)
t = await body()
ok(/2026-01-05|2026-01/.test(t), '인화: 두 번째 명세서 시트(1~2월)도 읽음')
ok(/오지 않은 날짜/.test(t), '인화: 연도 밀린 12월 날짜를 오류로 거름')
await p.screenshot({ path: `${SHOT}/import-inhwa.png`, fullPage: true })

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
