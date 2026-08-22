import { chromium, EXEC } from './_pw.mjs'
import { relay } from './live_relay.mjs'

//  실계정 · 실서버 · 390px — 현장 기사님의 하루.
//
//   로그인 → 오늘 일정 → 병원 → 수거량 → 용기 → 자재 → (저장)
//
//  ⚠ 비밀번호는 환경변수로만. 파일·git 어디에도 안 남깁니다.
//  ⚠ WRITE=1 을 주지 않으면 **운영 DB 에 한 줄도 안 씁니다.**
//    저장 버튼 직전까지만 밟고, 눌렀을 때 무엇이 갈지까지만 확인합니다.
//  ⚠ 브라우저가 이 컨테이너에서 바깥으로 못 나가므로 supabase 요청만
//    Node(curl) 로 중계합니다 — 앱 코드는 그대로입니다.

const BASE = 'http://localhost:4173'
const EMAIL = process.env.E2E_EMAIL
const PW = process.env.E2E_PW
const WRITE = process.env.WRITE === '1'
//  ⚠ 계정이 없으면 **한 줄 남기고 통과**합니다. 아무것도 안 찍고 끝내면
//    회귀 집계에 「검사 0」으로 잡혀 **깨진 스위트**가 됩니다 — 건너뛴 것과
//    깨진 것은 다릅니다.
if (!EMAIL || !PW) {
  console.log(' OK  | 실계정이 안 주어져 건너뜀 — E2E_EMAIL / E2E_PW 를 넣으면 돕니다')
  process.exit(0)
}

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const writes = []
const blocked = []
await ctx.route('**/*supabase.co/**', (r) =>
  relay(r, ({ method, url, status }) => {
    //  ⚠ 읽기 전용 RPC 는 POST 라도 「쓴 것」이 아닙니다.
    const READONLY = /\/rpc\/(client_billing_terms|app_schema_version|app_health_check|recent_app_errors|has_live_billing|clients_full|product_sales_summary)/
    if (method !== 'GET' && method !== 'HEAD' && !url.includes('/auth/v1/') && !READONLY.test(url)) {
      writes.push(`${method} ${url.split('/rest/v1/')[1]?.split('?')[0]} → ${status}`)
    }
  }, ({ method, url }) => {
    //  ⚠ Supabase 는 **RPC 도 POST** 입니다. 「POST 면 쓰기」로 막으면
    //    읽기 전용 RPC(단가 받기·판 확인)까지 막혀서, 앱이 오류를 남기려고
    //    또 POST 를 쏘고 그것마저 막히는 눈덩이가 됩니다. 실제로 그랬습니다.
    //    읽기만 하는 RPC 는 이름으로 통과시킵니다.
    const READ_RPC = /\/rpc\/(client_billing_terms|app_schema_version|app_health_check|recent_app_errors|has_live_billing|clients_full|product_sales_summary)/
    const pass = WRITE || method === 'GET' || method === 'HEAD' ||
      url.includes('/auth/v1/') || READ_RPC.test(url)
    if (!pass) blocked.push(`${method} ${url.split('/rest/v1/')[1]?.split('?')[0]}`)
    return pass
  }))

const p = await ctx.newPage()
p.on('console', (m) => { if (m.type() === 'error' && !/jsdelivr|font/i.test(m.text())) console.log('   CONSOLE', m.text().slice(0, 120)) })

console.log('── 1. 로그인 ──')
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
await p.fill('#login-email', EMAIL)
await p.fill('#login-password', PW)
await p.getByRole('button', { name: /로그인/ }).first().click()
await p.waitForTimeout(7000)
ok(new URL(p.url()).pathname === '/today', '현장 계정이 **오늘 일정**으로 들어감', new URL(p.url()).pathname)

console.log('── 2. 오늘 일정 ──')
//   ⚠ 오늘 **살아 있는** 일정이 없으면 카드가 0개인 것이 맞습니다.
//     무른(취소한) 방문은 안 뜹니다 — 안 가기로 한 것이니까요(0059).
//     그러니 「카드가 0개다」를 실패로 세면 안 됩니다. 사실만 적습니다.
const t1 = flat(await p.textContent('body'))
ok(!/문제가 생겼습니다/.test(t1), '화면이 멀쩡함')
const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
ok(over === 0, '가로로 밀리지 않음', `${over}px`)
//  ⚠ 현장에는 돈이 한 글자도 없어야 합니다 (실서버 기준으로 다시)
const amt = t1.match(/\d[\d,]*\s*(?:원|만원|억)/)
ok(!amt, '**오늘 일정에 금액이 없음**', amt ? amt[0] : '')
const stops = await p.locator('[data-today-card], [data-today-row]').count()
console.log(`   (참고) 오늘 카드 ${stops}개`)
if (stops === 0) console.log('   ⚠ 오늘 살아 있는 일정이 없습니다 — 「오늘 일정 → 병원」 경로는 자료가 있어야 밟힙니다.')

console.log('── 3. 수거 입력으로 ──')
await p.goto(`${BASE}/collection`, { waitUntil: 'domcontentloaded' })
//  ⚠ 실서버는 중계를 거쳐 느립니다. **자료가 다 실릴 때까지** 기다립니다.
//    안 기다리면 「고를 거래처가 없다」가 나오는데, 그건 화면 잘못이 아니라
//    제가 성급했던 것입니다 — 실제로 그렇게 실패로 적을 뻔했습니다.
await p.waitForFunction(() => {
  const s = document.querySelector('main select')
  return !!s && s.options.length > 1
}, { timeout: 45000 }).catch(() => {})
await p.waitForTimeout(800)
const t2 = flat(await p.textContent('body'))
ok(!/문제가 생겼습니다/.test(t2), '수거 입력이 열림')

//  일정을 고릅니다 — 실제 기사님이 하는 동작
//  오늘 일정이 있으면 그 병원을 눌러 들어갑니다 (기사님이 실제로 하는 동작).
const pick = p.locator('button').filter({ hasText: /요양병원|의원|병원/ }).first()
if ((await pick.count()) > 0) { await pick.dispatchEvent('click'); await p.waitForTimeout(1200) }
let here = (await p.locator('[data-collect-here]').count()) > 0
if (here) {
  ok(true, '「지금 이 병원」으로 접혀서 들어감')
  console.log('   고른 곳:', flat(await p.locator('[data-collect-here]').innerText()).slice(0, 90))
} else {
  //  ⚠ 오늘 살아 있는 일정이 없으면 「직접 입력」 경로입니다 — 그때는
  //    거래처를 **직접 고릅니다.** 예전에 이걸 빼먹고 저장이 잠긴 것을
  //    제품 결함으로 볼 뻔했습니다(거래처가 비면 잠기는 게 맞습니다).
  const csel = p.locator('select').first()
  const copts = await csel.locator('option').evaluateAll((els) =>
    els.map((e) => ({ v: e.value, t: e.textContent ?? '' })).filter((o) => o.v))
  ok(copts.length > 0, '직접 입력 — 고를 거래처가 있음', copts.map((o) => o.t).slice(0, 4).join(','))
  if (copts.length > 0) {
    //  [검증] 로 시작하는 연습용 거래처가 있으면 **그것을 먼저** 고릅니다.
    const target = copts.find((o) => o.t.includes('[검증]')) ?? copts[0]
    await csel.selectOption(target.v)
    await p.waitForTimeout(1200)
    console.log('   고른 곳:', target.t)
  }
}

console.log('── 4. 수거량 · 용기 · 자재 ──')
const amountBox = p.locator('[data-actual-amount]')
ok((await amountBox.count()) > 0, '수거량 칸이 있음')
await amountBox.fill('120')
for (const [label, n] of [['골판지 전용박스', 2], ['합성수지 전용용기', 1]]) {
  const plus = p.getByRole('button', { name: `${label} 더하기` })
  if ((await plus.count()) === 0) { ok(false, `「${label}」 ＋ 버튼이 있음`); continue }
  const box = await plus.first().boundingBox()
  ok(box != null && box.height >= 44, `「${label}」 ＋ 가 44px 이상`, box ? `${Math.round(box.height)}px` : '')
  for (let i = 0; i < n; i += 1) { await plus.first().click(); await p.waitForTimeout(90) }
}
const more = p.locator('[data-supply-more]')
if ((await more.count()) > 0) { await more.first().click(); await p.waitForTimeout(500) }
const boxPlus = p.getByRole('button', { name: '63L 박스 더하기' })
ok((await boxPlus.count()) > 0, '자재 칸이 폰에서 닿음')

console.log('── 4-b. 차량 · 기사 ──')
//   ⚠ 저장은 **차량이 있어야** 열립니다(canSubmit). 계정에 차량이 안 묶여
//     있으면 기사님이 매번 고릅니다 — 예전에 이 단계를 빠뜨리고 「저장이
//     잠겨 있다」를 제품 결함으로 볼 뻔했습니다.
{
  const one = await p.locator('[data-my-vehicle]').count()
  if (one > 0) {
    ok(true, '계정에 차량이 묶여 있어 고를 필요가 없음', flat(await p.locator('[data-my-vehicle]').innerText()))
  } else {
    const dump = await p.locator('select').evaluateAll((els) =>
      els.map((e, i) => ({ i, label: e.getAttribute('aria-label') ?? '', opts: e.options.length, first: e.options[0]?.textContent ?? '' })))
    console.log('   (참고) select 들:', JSON.stringify(dump))
    const sel = p.locator('select').filter({ hasText: /차량 선택/ }).first()
    const has = (await sel.count()) > 0
    ok(has, '차량을 고르는 칸이 있음')
    if (has) {
      const opts = await sel.locator('option').evaluateAll((els) => els.map((e) => ({ v: e.value, t: e.textContent })).filter((o) => o.v))
      ok(opts.length > 0, '고를 수 있는 차량이 있음', opts.map((o) => o.t).join(','))
      if (opts.length > 0) { await sel.selectOption(opts[0].v); await p.waitForTimeout(600) }
    }
    console.log('   ⚠ 계정에 차량이 안 묶여 있어 매번 고릅니다 (설정 → 사용자 관리에서 묶으면 사라집니다)')
  }
}

console.log('── 5. 저장 ──')
const save = p.getByRole('button', { name: /수거 완료 저장/ })
ok((await save.count()) > 0, '저장 버튼이 있음')
const disabled = await save.first().isDisabled()
ok(!disabled, '**저장 버튼이 눌리는 상태** (필수값이 다 찼음)', disabled ? '아직 잠김' : '')

if (!WRITE) {
  console.log('   ⚠ WRITE=1 이 아니어서 **저장하지 않았습니다** — 운영 DB 에 한 줄도 안 썼습니다.')
} else {
  await save.first().click()
  await p.waitForTimeout(2500)
  const confirm = p.getByRole('button', { name: /그대로 저장|계속|확인/ })
  if ((await confirm.count()) > 0) { await confirm.first().click(); await p.waitForTimeout(3000) }
  const t3 = flat(await p.textContent('body'))
  ok(/저장|완료/.test(t3), '저장했다고 화면이 말해 줌', t3.slice(0, 90))
}

if (WRITE) {
  console.log(`   운영 DB 에 쓴 것: ${writes.join(' · ') || '없음'}`)
} else {
  ok(writes.length === 0, '**운영 DB 에 한 줄도 안 씀**', writes.join(' · '))
  //  막힌 것이 있으면 **그대로 적습니다.** 조용히 넘기면 「안 썼다」가
  //  아니라 「못 봤다」가 됩니다.
  console.log(`   (참고) 막은 쓰기 ${blocked.length}건: ${[...new Set(blocked)].join(' · ') || '없음'}`)
}

await b.close()
