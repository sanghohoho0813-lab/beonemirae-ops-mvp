import { chromium, EXEC } from './_pw.mjs'

//  관리자 사이드바에서 「운영 도구」·「관리」가 접혀서 시작하는지,
//  눌러서 펼쳐지는지, 그 안의 화면에 들어가면 저절로 펼쳐지는지 확인합니다.

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')
const UID = '00000000-0000-0000-0000-0000000000ad'

const out = []
//  ⚠ 모아 뒀다가 끝에 찍으면 중간에 터졌을 때 **앞의 결과까지 전부 사라집니다.**
//    그러면 회귀 집계에 「검사 0 · 실패 0」으로 남아 통과한 것처럼 보입니다.
//    한 줄씩 바로 찍습니다.
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const profile = {
  id: UID, email: 'admin@beonemirae.test', name: '대표', role: 'admin', font_scale: 'normal',
  active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
}

const b = await chromium.launch({ executablePath: EXEC })
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
await ctx.route('**/rest/v1/**', (r) => {
  const url = r.request().url()
  const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
  if (url.includes('/profiles')) return json(single ? profile : [profile])
  return json([])
})
const p = await ctx.newPage()
await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
})), ['beonemirae-ops:auth', { id: UID, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])

await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2200)

const aside = p.locator('aside')
const tools = p.locator('[data-nav-group="tools"]')
const admin = p.locator('[data-nav-group="admin"]')
const toolsBtn = p.locator('[data-nav-group-header="운영 도구"]')
const adminBtn = p.locator('[data-nav-group-header="관리"]')

// 1) 처음에는 접혀 있어야 합니다
ok(await toolsBtn.isVisible(), '「운영 도구」 제목이 보임')
ok(await adminBtn.isVisible(), '「관리」 제목이 보임')
ok((await tools.count()) === 0, '처음엔 운영 도구가 접혀 있음')
ok((await admin.count()) === 0, '처음엔 관리가 접혀 있음')
ok(await toolsBtn.getAttribute('aria-expanded') === 'false', '운영 도구 aria-expanded=false')

// 접혀 있으면 안쪽 메뉴명이 사이드바에 없어야 합니다
const asideText = () => aside.textContent().then((t) => t ?? '')
const t0 = await asideText()
for (const m of ['미수금 관리', '감사로그', '사용자 관리', '엑셀 가져오기']) {
  ok(!t0.includes(m), `접힌 상태에서 「${m}」 안 보임`)
}
//  ⚠ 0076 — **자재 관리와 수거이력은 접히지 않습니다.** 매일 여는 화면이라
//    「핵심 운영」으로 올라갔습니다(대표님 지시). 접히는 쪽에 두면 재고를
//    보려고 매번 묶음을 펼쳐야 합니다.
ok(t0.includes('대시보드') && t0.includes('수거 입력') && t0.includes('거래처'), '매일 쓰는 메뉴는 그대로 보임')
ok(t0.includes('자재 관리'), '**자재 관리는 접혀도 보임** (매일 여는 화면)')
ok(t0.includes('수거이력'), '**수거이력도 접혀도 보임** (잘못된 입력을 찾는 자리)')

// 접힌 묶음 개수 배지
//  숫자를 여기에 적어 두면 메뉴가 늘 때마다 검사가 아니라 기대값을 고치게
//  됩니다. 그건 검사가 아닙니다. **펼쳐서 실제로 센 것과 맞는지**를 봅니다.
const badgeOf = (name) => {
  const m = t0.replace(/\s+/g, ' ').match(new RegExp(`${name}\\s*(\\d+)`))
  return m ? Number(m[1]) : -1
}
const toolBadge = badgeOf('운영 도구')
const adminBadge = badgeOf('관리')
ok(toolBadge > 0, '운영 도구에 개수 배지가 있음', String(toolBadge))
ok(adminBadge > 0, '관리에 개수 배지가 있음', String(adminBadge))

// 사이드바 세로 길이 — 접히면 짧아져야 합니다
const h0 = await aside.evaluate((el) => el.scrollHeight)
await p.screenshot({ path: `${SHOT}/nav-collapsed.png`, fullPage: false })

// 2) 눌러서 펼치기
await toolsBtn.click()
await p.waitForTimeout(350)
ok((await tools.count()) === 1, '누르면 운영 도구가 펼쳐짐')
ok((await asideText()).includes('미수금 관리'), '펼치면 「미수금 관리」가 보임')
//  배지 숫자 = 펼쳤을 때 실제로 있는 줄 수 (쓸 수 있는 것 + 예정)
const usable = await tools.locator('a').count()
const planned = await tools.locator('[data-nav-planned]').count()
ok(toolBadge === usable + planned, '배지 숫자가 실제 줄 수와 같음',
  `배지 ${toolBadge} = 쓸 수 있는 것 ${usable} + 예정 ${planned}`)
ok(planned > 0, '「추가 개발 예정」이 운영 도구 안에 함께 들어 있음', `${planned}가지`)
ok((await asideText()).includes('추가 개발 예정'), '예정 줄에 소제목이 붙음')
await adminBtn.click()
await p.waitForTimeout(350)
ok((await asideText()).includes('감사로그'), '펼치면 「감사로그」가 보임')
ok(adminBadge === (await admin.locator('a').count()), '관리 배지도 실제 줄 수와 같음',
  `배지 ${adminBadge} · 실제 ${await admin.locator('a').count()}`)
const h1 = await aside.evaluate((el) => el.scrollHeight)
ok(h1 > h0, '펼치면 메뉴가 길어짐', `${h0}px → ${h1}px`)
await p.screenshot({ path: `${SHOT}/nav-expanded.png`, fullPage: false })

// 3) 다시 접고 새로고침하면 접힌 상태가 기억되어야 합니다
await toolsBtn.click()
await adminBtn.click()
await p.waitForTimeout(300)
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
ok((await p.locator('[data-nav-group="tools"]').count()) === 0, '새로고침해도 접힌 상태를 기억함')

// 4) 펼친 상태도 기억되어야 합니다
await p.locator('[data-nav-group-header="관리"]').click()
await p.waitForTimeout(300)
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
ok((await p.locator('[data-nav-group="admin"]').count()) === 1, '펼친 상태도 기억함')

// 5) 접힌 묶음 안의 화면으로 바로 들어가면 저절로 펼쳐져야 합니다
await p.evaluate(() => window.localStorage.removeItem('beonemirae-ops:nav-open'))
//  ⚠ 자재 관리는 이제 접히는 묶음 밖에 있습니다 — 접힌 묶음 **안쪽** 화면으로
//    미수금 관리를 씁니다. 확인하려는 것은 「접힌 묶음 안으로 바로 들어가면
//    저절로 펼쳐지는가」이지 특정 화면이 아닙니다.
await p.goto(`${BASE}/receivables`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
ok((await p.locator('[data-nav-group="tools"]').count()) === 1, '접힌 묶음 안쪽 화면으로 들어가면 저절로 펼쳐짐')
const active = await p.locator('aside a[href="/materials"]').count()
ok(active === 1, '지금 보는 화면이 메뉴에 표시됨')
ok((await p.locator('[data-nav-group="admin"]').count()) === 0, '상관없는 「관리」는 접힌 채로 둠')

// 6) 「추가 개발 예정」은 이제 따로 있는 묶음이 아닙니다
//    운영 도구 안으로 들어갔습니다 — 둘 다 업무 도구라 목차를 두 칸
//    차지할 이유가 없었습니다. 옛 묶음이 남아 있으면 같은 것이 두 군데
//    보입니다.
ok((await p.locator('[data-nav-group-header="추가 개발 예정"]').count()) === 0,
  '「추가 개발 예정」은 따로 있는 묶음이 아님')
//    접힌 상태에서는 예정 항목도 같이 숨습니다.
await p.evaluate(() => window.localStorage.removeItem('beonemirae-ops:nav-open'))
await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
ok(!(await asideText()).includes('올바로 API 연동'), '접으면 예정 항목도 같이 숨음')

// 7) 예정 항목은 **눌러도 아무 일이 없어야** 합니다
await p.locator('[data-nav-group-header="운영 도구"]').click()
await p.waitForTimeout(350)
const lock = p.locator('[data-nav-planned]').first()
const label = (await lock.textContent()) ?? ''
ok((await lock.evaluate((e) => e.tagName)) !== 'A', '예정 항목은 링크가 아님', label.replace(/\s+/g, ' '))
ok((await lock.getAttribute('aria-disabled')) === 'true', '누를 수 없다고 표시됨')
const before = p.url()
//  Playwright 는 aria-disabled 를 눌러 주지 않습니다 — 그러면 「안 눌린다」를
//  확인한 것이 아니라 검사를 건너뛴 것이 됩니다. 실제 클릭을 쏴 봅니다.
await lock.dispatchEvent('click')
await p.waitForTimeout(600)
ok(p.url() === before, '**눌러도 화면이 안 바뀜**', `${before} → ${p.url()}`)

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
await b.close()
