import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0078 — 오늘 날짜와 지금 시각이 **어느 계정에서든, PC 든 폰이든** 보이는가
//
//   ⚠ 한국 시각(Asia/Seoul)으로 그려야 합니다. 이 시스템의 날짜 계산이 전부
//     한국 시각 기준이라, 시계만 기기 시간대를 따르면 「화면은 오늘인데
//     저장은 어제로 들어가는」 일이 생깁니다. 기기 시간대를 일부러 다른 곳으로
//     맞춰 놓고도 같은 값이 나오는지 봅니다.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const C1 = F.clients[0].id
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, w, h, tz) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role),
    schedules: [{ id: 't1', date: T, client_id: C1, waste_type: '의료폐기물', vehicle_id: null,
      scheduled_time: '09:00', status: '예정', expected_amount: 120, actual_amount: null, completed_at: null,
      memo: '', origin: 'system', canceled_at: null, is_additional: false,
      created_at: `${T}T00:00:00Z`, updated_at: `${T}T00:00:00Z` }] }
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700,
    ...(tz ? { timezoneId: tz } : {}) })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}/`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p }
}

const read = (p) => p.evaluate(() => {
  const els = [...document.querySelectorAll('[data-live-clock]')].filter((e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e)
    return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden'
  })
  if (!els.length) return null
  const e = els[0]
  return { text: (e.innerText ?? '').replace(/\s+/g, ' ').trim(),
    px: Math.round(parseFloat(getComputedStyle(e).fontSize)), count: els.length }
})

// ── 네 역할 × 폰·PC — 어디서든 보여야 합니다 ───────────────────────────────
for (const role of ['field', 'office', 'admin', 'client']) {
  for (const [label, w, h] of [['폰 390px', 390, 844], ['PC 1440px', 1440, 900]]) {
    const s = await open(role, w, h)
    const c = await read(s.p)
    ok(c !== null, `${role} · ${label} — **날짜·시각이 보임**`, c?.text ?? '(안 보임)')
    if (c) {
      //  「8월 22일 (토) · 오후 2:37:12」 — 분·초까지 있어야 합니다
      ok(/\d+월 \d+일 \(.\)/.test(c.text), `${role} · ${label} — 오늘 날짜(요일까지)`, c.text)
      ok(/(오전|오후) \d{1,2}:\d{2}:\d{2}/.test(c.text), `${role} · ${label} — **시·분·초까지**`, c.text)
      ok(c.px >= 15, `${role} · ${label} — 읽을 만한 크기`, `${c.px}px`)
    }
    await s.ctx.close()
  }
}

// ── 1초마다 실제로 바뀌는가 ────────────────────────────────────────────────
{
  const s = await open('field', 390, 844)
  const a = await read(s.p)
  await s.p.waitForTimeout(2200)
  const c = await read(s.p)
  ok(a?.text !== c?.text, '**초가 실제로 흐름** (멈춘 시계가 아님)', `${a?.text} → ${c?.text}`)
  await s.ctx.close()
}

// ── 기기 시간대가 달라도 한국 시각 ─────────────────────────────────────────
//
//   ⚠ 이게 왜 중요한가: 저장은 한국 날짜로 들어갑니다. 시계만 기기 시간대를
//     따르면 자정 근처에서 「화면은 어제, 저장은 오늘」이 됩니다.
{
  const seoulDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
  const [d0, t0] = seoulDate.split(' ')
  const [, m0, day0] = d0.split('-').map(Number)
  const h0 = Number(t0.split(':')[0])
  for (const tz of ['America/New_York', 'Europe/London']) {
    const s = await open('field', 390, 844, tz)
    const c = await read(s.p)
    ok(c !== null, `기기 시간대 ${tz} — 시계가 보임`)
    ok((c?.text ?? '').startsWith(`${m0}월 ${day0}일`), `기기 시간대 ${tz} — **한국 날짜로 보임**`, c?.text ?? '')
    const want = h0 < 12 ? '오전' : '오후'
    ok((c?.text ?? '').includes(want), `기기 시간대 ${tz} — 한국 시각 오전/오후`, `${want} · ${c?.text}`)
    await s.ctx.close()
  }
}

// ── PC — 시계가 **사이드바 맨 위에 붙어 있는가** (0129) ─────────────────────
//
//   대표님: 「왼쪽 아래 계정 아래에 두지 말고 상단에 고정시켜 잘 보이게」.
//   예전에는 계정 카드 아래(사이드바 맨 밑)라, 메뉴가 길면 끝까지 내려야
//   시각이 보였습니다.
{
  const s = await open('admin', 1440, 900)
  const r = await s.p.evaluate(() => {
    const band = document.querySelector('[data-clock-top]')
    if (!band) return null
    const aside = band.closest('aside')
    const clock = band.querySelector('[data-live-clock]')
    const before = band.getBoundingClientRect()
    //  메뉴를 아래로 굴려도 이 줄은 맨 위에 남아야 합니다 (sticky).
    if (aside) aside.scrollTop = aside.scrollHeight
    const after = band.getBoundingClientRect()
    //  계정 카드(로그아웃 단추가 있는 줄) 안에는 시계가 없어야 합니다.
    const account = [...document.querySelectorAll('aside button[aria-label="로그아웃"]')][0]
    const card = account?.closest('div')?.parentElement ?? null
    return {
      top: Math.round(before.top),
      stickyTop: Math.round(after.top),
      px: clock ? Math.round(parseFloat(getComputedStyle(clock).fontSize)) : 0,
      text: (clock?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      inAccount: card ? !!card.querySelector('[data-live-clock]') : false,
      asideTop: aside ? Math.round(aside.getBoundingClientRect().top) : -1,
    }
  })
  ok(r !== null, 'PC — 사이드바 맨 위에 시계 줄이 있음')
  if (r) {
    ok(r.top <= r.asideTop + 4, '**사이드바 맨 위**에 있음', `줄 ${r.top}px · 사이드바 ${r.asideTop}px`)
    ok(r.stickyTop <= r.asideTop + 4, '**메뉴를 끝까지 내려도 그대로 붙어 있음** (고정)', `${r.stickyTop}px`)
    ok(/\d+월 \d+일 \(.\)/.test(r.text) && /(오전|오후) \d{1,2}:\d{2}:\d{2}/.test(r.text),
      '날짜·요일·시·분·초가 그대로 보임', r.text)
    ok(r.px >= 17, '아래 자리보다 크게 — 잘 보임', `${r.px}px`)
    ok(!r.inAccount, '**계정 카드 아래에는 이제 없음**')
  }
  await s.ctx.close()
}

await b.close()
