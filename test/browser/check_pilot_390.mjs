import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0122 QA ④ — 폰 390px 현장 흐름 + 360 / 430 스모크
//
//   확인하는 것 (390)
//    · 수거 입력에서 자재 사용량 구역을 펼쳐도 가로로 안 밀림
//    · 규격 이름이 잘리지 않음 (줄 폭 안에 다 들어감)
//    · − / + 단추가 44px 이상
//    · 숫자칸에 포커스한 뒤에도 저장 단추가 보임 (자판 위로 가려지지 않음)
//   스모크 (360 / 390 / 430)
//    · 오늘 일정 · 거래처(관리자) · 성과(관리자) 가 가로로 안 밀리고 그려짐
//    · 거래처 관리에 Pilot 토글 · 「Pilot N / 10」

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const C1 = F.clients[0].id
const json = (r, v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
const b = await chromium.launch({ executablePath: EXEC })

const seed = () => [
  { id: 'today1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
    scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
    memo: '', origin: 'system', canceled_at: null, is_additional: false,
    created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` },
]

async function open(role, w, h, extra = {}) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role), schedules: seed(), ...extra }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })
  W.wire(ctx, state)
  ctx.route('**/rest/v1/experiment_settings**', (r) => json(r, { id: 1, start_date: T, pilot_client_ids: [C1, F.clients[1].id] }))
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p, state }
}
const overflowX = (p) => p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))

// ── 390 현장 흐름 ────────────────────────────────────────────────────────────
{
  console.log('\n── 폰 390px 현장 흐름 ─────────────────────────────────')
  const { ctx, p, state } = await open('field', 390, 844)
  await p.goto(`${W.BASE}/today`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  ok((await overflowX(p)) === 0, '오늘 일정 — 가로로 안 밀림')
  await p.goto(`${W.BASE}/collection?schedule=today1`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  if (new URL(p.url()).pathname !== '/collection') {
    await p.goto(`${W.BASE}/collection`, { waitUntil: 'domcontentloaded' })
    await W.settle(p, state, 800, 30000)
  }
  ok((await overflowX(p)) === 0, '수거 입력 — 접힌 상태에서 가로로 안 밀림')
  if (await p.locator('[data-fold="used"]').count()) {
    await p.locator('[data-fold="used"]').dispatchEvent('click')
    await p.waitForTimeout(500)
  }
  if (await p.locator('[data-used-more]').count()) {
    await p.locator('[data-used-more]').dispatchEvent('click')
    await p.waitForTimeout(400)
  }
  ok((await overflowX(p)) === 0, '**규격 13줄을 다 펼쳐도 가로로 안 밀림**')
  const m = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-collect-used] [data-used-row]')].filter((r) => r.getBoundingClientRect().height > 2)
    const clipped = []
    let minBtn = 999
    for (const r of rows) {
      //  규격 이름 — 가로로 잘리면 scrollWidth 가 clientWidth 보다 커집니다
      for (const el of r.querySelectorAll('span, label, p')) {
        if (el.children.length === 0 && el.textContent.trim().length > 1 && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim())
      }
      for (const btn of r.querySelectorAll('button[aria-label]')) {
        const b = btn.getBoundingClientRect()
        minBtn = Math.min(minBtn, b.width, b.height)
      }
    }
    return { rows: rows.length, clipped, minBtn: Math.round(minBtn) }
  })
  ok(m.rows === 13, '규격 13줄이 보임', `${m.rows}줄`)
  ok(m.clipped.length === 0, '**규격 이름이 잘리지 않음**', m.clipped.join(', '))
  ok(m.minBtn >= 44, '**− / + 단추가 44px 이상**', `${m.minBtn}px`)

  //  숫자칸에 포커스 → 저장 단추가 보이는가
  await p.locator('[data-collect-used]').getByLabel('63L 박스', { exact: true }).focus()
  await p.waitForTimeout(300)
  await p.fill('#collection-amount', '100')
  const save = await p.evaluate(() => {
    const el = document.querySelector('[data-collect-save]')
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return { visible: r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none', inView: r.top >= 0 && r.bottom <= window.innerHeight, h: Math.round(r.height) }
  })
  ok(save?.visible === true && save?.inView === true, '**저장 단추가 가려지지 않고 보임**', JSON.stringify(save))
  ok((save?.h ?? 0) >= 44, '저장 단추 44px 이상', `${save?.h}px`)
  await ctx.close()
}

// ── 360 / 390 / 430 스모크 ────────────────────────────────────────────────────
for (const w of [360, 390, 430]) {
  console.log(`\n── 스모크 ${w}px ─────────────────────────────────────`)
  {
    const { ctx, p, state } = await open('field', w, 800)
    await p.goto(`${W.BASE}/today`, { waitUntil: 'domcontentloaded' })
    await W.settle(p, state, 800, 30000)
    ok((await overflowX(p)) === 0, `${w} 오늘 일정 — 안 밀림`)
    ok((await p.locator('[data-pilot-badge]').count()) >= 1, `${w} 오늘 일정 — PILOT 배지`)
    await ctx.close()
  }
  {
    const { ctx, p, state } = await open('admin', w, 800)
    await p.goto(`${W.BASE}/clients`, { waitUntil: 'domcontentloaded' })
    await W.settle(p, state, 800, 30000)
    ok((await overflowX(p)) === 0, `${w} 거래처 관리 — 안 밀림`)
    const toggles = await p.locator('[data-pilot-toggle]').count()
    ok(toggles === F.clients.length, `${w} 거래처 관리 — 카드마다 Pilot 토글`, `${toggles}개`)
    const sub = await p.evaluate(() => document.querySelector('main')?.innerText ?? '')
    ok(/Pilot 2 \/ 10/.test(sub), `${w} 「Pilot 2 / 10」이 적힘`)
    await p.goto(`${W.BASE}/performance`, { waitUntil: 'domcontentloaded' })
    await W.settle(p, state, 800, 30000)
    ok((await overflowX(p)) === 0, `${w} 성과 — 안 밀림`)
    ok((await p.locator('[data-pilot-summary]').count()) === 1, `${w} 성과 — Pilot 요약 카드`)
    await ctx.close()
  }
}

await b.close()
