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
      //  ⚠ 0129 — PC 는 오른쪽 위 도구 줄로 옮기면서 날짜를 「9/17(목)」로 줄였습니다
      //    (그 줄에 단추가 넷이라 「9월 17일 (목)」은 넘칩니다). 폰은 그대로입니다.
      //    여기서 지킬 것은 **오늘 날짜와 요일이 읽히는가** 이지 표기 방식이 아닙니다.
      ok(/\d+월 \d+일 \(.\)/.test(c.text) || /\d+\/\d+\(.\)/.test(c.text),
        `${role} · ${label} — 오늘 날짜(요일까지)`, c.text)
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

// ── PC — 시계가 **오른쪽 위 「화면 색」 옆**에 있는가 (0129) ────────────────
//
//   대표님 지시가 두 번 바뀐 자리입니다:
//    ① 처음 — 왼쪽 계정 카드 아래 (끝까지 내려야 보임)
//    ② 다음 — 사이드바 맨 위 고정 (「현재 위치 너무 별로」)
//    ③ 지금 — **오른쪽 위 도구 줄, 「화면 색」 옆 · 간격 띄워서**
{
  const s = await open('admin', 1440, 900)
  const r = await s.p.evaluate(() => {
    const clock = document.querySelector('[data-clock-top]')
    if (!clock) return null
    //  「화면 색」 단추 — 글자로 찾습니다 (아이콘만 남는 좁은 화면은 PC 가 아닙니다)
    //  ⚠ 「화면 색」 단추는 화면에 **두 벌**입니다(폰용은 숨어 있습니다).
    //    숨은 쪽을 집으면 좌표가 0 이라 「같은 줄」 판정이 뒤집힙니다.
    const theme = [...document.querySelectorAll('button')]
      .filter((b) => /화면 색/.test(b.textContent ?? '') || /화면 색/.test(b.getAttribute('aria-label') ?? ''))
      .find((b) => b.getBoundingClientRect().width > 2)
    const cb = clock.getBoundingClientRect()
    const tb = theme?.getBoundingClientRect()
    const sidebar = document.querySelector('aside')
    return {
      text: (clock.textContent ?? '').replace(/\s+/g, ' ').trim(),
      px: Math.round(parseFloat(getComputedStyle(clock).fontSize)),
      sameRow: tb ? Math.abs((cb.top + cb.height / 2) - (tb.top + tb.height / 2)) <= 12 : false,
      //  「옆」 = 화면 색 **왼쪽**에 붙어 있습니다
      gap: tb ? Math.round(tb.left - cb.right) : -1,
      //  왼쪽 사이드바 **밖**이어야 합니다 (거기 있던 것을 옮겨 온 것이니)
      outOfSidebar: sidebar ? cb.left > sidebar.getBoundingClientRect().right : true,
      inSidebar: !!sidebar?.querySelector('[data-live-clock]'),
      //  단추처럼 보이면 눌러 보게 됩니다 — 알약(배경·테두리)이 없어야 합니다
      looksClickable: clock.tagName === 'BUTTON' || clock.closest('button') !== null,
    }
  })
  ok(r !== null, 'PC — 오른쪽 위 도구 줄에 시계가 있음')
  if (r) {
    ok(r.sameRow, '**「화면 색」과 같은 줄**')
    ok(r.gap >= 12 && r.gap <= 80, '**간격이 띄워져 있음** (12px 이상)', `${r.gap}px`)
    ok(r.outOfSidebar, '왼쪽 사이드바 밖 — 오른쪽 위로 옮겨졌음')
    ok(!r.inSidebar, '**사이드바(계정 아래·맨 위)에는 이제 없음**')
    ok(!r.looksClickable, '단추처럼 보이지 않음 (눌러 보게 하지 않음)')
    ok(/\d+\/\d+\(.\)/.test(r.text) && /(오전|오후) \d{1,2}:\d{2}:\d{2}/.test(r.text),
      '날짜·요일·시·분·초가 그대로 (PC 는 짧은 날짜 표기)', r.text)
    ok(r.px >= 16, '읽을 만한 크기', `${r.px}px`)
  }
  await s.ctx.close()
}

await b.close()
