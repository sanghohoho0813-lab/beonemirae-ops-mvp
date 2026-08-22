import { chromium, EXEC } from './_pw.mjs'
import { relay } from './live_relay.mjs'

//  실계정 · 실서버 · 390px — 병원 담당자.
//   로그인 → 수거 요청 → 상태 확인 → 자재·용기 주문 → 상태 확인
//
//  ⚠ WRITE=1 이 아니면 운영 DB 에 한 줄도 안 씁니다.
//  ⚠ Supabase 는 RPC 도 POST 입니다 — 읽기 전용 RPC 는 막지 않습니다.

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
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const READONLY = /\/rpc\/(client_billing_terms|app_schema_version|app_health_check|recent_app_errors|has_live_billing|clients_full|product_sales_summary)/

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const writes = []
await ctx.route('**/*supabase.co/**', (r) =>
  relay(r, ({ method, url, status }) => {
    if (method !== 'GET' && method !== 'HEAD' && !url.includes('/auth/v1/') && !READONLY.test(url)) {
      writes.push(`${method} ${url.split('/rest/v1/')[1]?.split('?')[0]} → ${status}`)
    }
  }, ({ method, url }) =>
    WRITE || method === 'GET' || method === 'HEAD' || url.includes('/auth/v1/') || READONLY.test(url)))

const p = await ctx.newPage()

console.log('── 1. 로그인 ──')
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1800)
await p.fill('#login-email', EMAIL)
await p.fill('#login-password', PW)
await p.getByRole('button', { name: /로그인/ }).first().click()
//  ⚠ 실서버는 중계를 거쳐 느립니다. **자료가 실릴 때까지** 기다립니다.
//    처음에는 /병원|의원/ 로 기다렸는데, 「연결된 병원 정보를 찾을 수
//    없습니다」에도 「병원」이 들어 있어 **빈 화면에서 바로 통과**했습니다.
//    그래서 「연결이 안 됐다」고 잘못 적을 뻔했습니다 — 실제로는 연결돼
//    있었습니다. 화면이 다 그려진 표시(첫 화면의 두 버튼)를 기다립니다.
await p.waitForSelector('[data-portal-cta="collect"]', { timeout: 45000 }).catch(() => {})
await p.waitForTimeout(1200)
ok(new URL(p.url()).pathname.startsWith('/portal'), '병원 계정이 **포털**로 들어감', new URL(p.url()).pathname)
const t1 = flat(await p.textContent('main'))
ok(!/연결된 병원 정보를 찾을 수 없습니다/.test(t1), '우리 병원이 연결돼 보임', t1.slice(0, 70))

console.log('── 2. 첫 화면의 두 가지 ──')
const c1 = await p.locator('[data-portal-cta="collect"]').boundingBox()
const c2 = await p.locator('[data-portal-cta="supplies"]').boundingBox()
ok(c1 != null && c1.y + c1.height <= 844, '① 수거 요청이 첫 화면 안', c1 ? `${Math.round(c1.y + c1.height)}px` : '없음')
ok(c2 != null && c2.y + c2.height <= 844, '② 자재·용기 요청이 첫 화면 안', c2 ? `${Math.round(c2.y + c2.height)}px` : '없음')
const over = await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
ok(over === 0, '가로로 밀리지 않음', `${over}px`)

console.log('── 3. 수거 요청 ──')
await p.locator('[data-portal-cta="collect"]').dispatchEvent('click')
await p.waitForTimeout(1200)
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
const CONTENT = `[실증검증] 실계정 E2E 확인 ${stamp} — 확인 뒤 지우셔도 됩니다`
await p.fill('#req-content', CONTENT)
ok(true, '요청 창이 열리고 내용을 적을 수 있음')
if (!WRITE) {
  console.log('   ⚠ WRITE=1 이 아니어서 **보내지 않았습니다**')
  await p.keyboard.press('Escape')
} else {
  await p.getByRole('button', { name: '요청 보내기' }).click()
  //  ⚠ 실서버는 중계를 거쳐 느립니다. 정해진 시간만 기다렸다가 글자를
  //    훑으면 **아직 안 뜬 것을 「안 뜬다」로** 적게 됩니다. 배너가 뜰
  //    때까지 기다립니다 — 안 뜨면 그때 실패입니다.
  const shown = await p.waitForSelector('[data-req-sent]', { timeout: 30000 }).then(() => true, () => false)
  ok(shown, '**접수되었다고 화면이 말해 줌**', shown ? flat(await p.textContent('[data-req-sent]')).slice(0, 60) : '안 뜸')

  console.log('── 4. 요청 상태 확인 ──')
  await p.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => /내 요청 진행 상태/.test(document.querySelector('main')?.textContent ?? ''), { timeout: 45000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const t3 = flat(await p.textContent('main'))
  ok(/실증검증/.test(t3), '**보낸 요청이 목록에 보임**', (t3.match(/\[실증검증\][^·]{0,40}/) ?? [''])[0])
  ok(/접수/.test(t3), '상태가 「접수」로 보임')
  ok(/추가수거/.test(t3), '종류가 그대로')
}

console.log('── 5. 자재·용기 요청 ──')
await p.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2500)
await p.locator('[data-portal-cta="supplies"]').dispatchEvent('click')
await p.waitForTimeout(3000)
ok(new URL(p.url()).pathname === '/portal/supplies', '물품 화면으로 감', p.url())
await p.waitForTimeout(2500)
const t4 = flat(await p.textContent('main'))
const prods = await p.locator('[data-product]').count()
if (prods === 0) {
  //  ⚠ 화면 잘못이 아닙니다 — **단가가 하나도 안 들어가 있어서**입니다.
  //    (0050 이 단가 0 이면 공급 가능으로 못 켜게 막습니다)
  ok(/준비되지 않았습니다/.test(t4), '주문할 물건이 없으면 **그렇다고 말해 줌** (빈 화면으로 두지 않음)', t4.slice(0, 90))
  ok(/전화로/.test(t4), '그러면 어떻게 하면 되는지도 알려 줌')
  console.log('   ⚠ 상품 단가가 전부 0원이라 병원 화면에 주문할 물건이 없습니다 — 자료 문제입니다.')
} else {
  ok(true, `주문할 물건이 ${prods}가지 보임`)
  const plus = p.locator('[data-qty-plus]').first()
  for (let i = 0; i < 2; i += 1) { await plus.click(); await p.waitForTimeout(150) }
  if (!WRITE) { console.log('   ⚠ WRITE=1 이 아니어서 **주문을 보내지 않았습니다**') }
  else {
    await p.locator('[data-order-send]').click()
    await p.waitForTimeout(4000)
    ok(/접수/.test(flat(await p.textContent('[data-order-msg]').catch(() => ''))), '**주문 접수 안내가 뜸**')
    await p.reload({ waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3500)
    ok((await p.locator('[data-my-order]').count()) > 0, '**요청하신 내역에 보임**')
  }
}

console.log(WRITE ? `   운영 DB 에 쓴 것: ${writes.join(' · ') || '없음'}` : '')
if (!WRITE) ok(writes.length === 0, '**운영 DB 에 한 줄도 안 씀**', writes.join(' · '))
await b.close()
