import { FAKE_NOW } from './fake_now.mjs' //  ⚠ 맨 먼저 — 아래 공용 자료가 옮긴 「오늘」로 만들어지게
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

//  날짜 경계 — 달 끝 · 월초 · 연말 · 윤일 · 31일, 그리고 **한국 아침 9시 전**(UTC 로는 아직 전날)
//
//   지금까지 「며칠 뒤」가 다음 달로 넘어가는 달 끝 주에만 깨지는 검사를 세 번 만났습니다.
//   검사만이 아니라 화면도 그런 날 깨지는지 봅니다 — 시계를 그 시각으로 옮겨(브라우저는 page.clock,
//   이 검사의 자료 · 기대값은 fake_now.mjs) 주요 화면을 열고:
//     · 화면 오류 없음 · 오류 칸(ErrorBoundary) 없음
//     · 위쪽 시계 · 오늘 일정 제목 · 달력 달이 **한국 날짜**로 그날
//     · 월간 화면(월 마감 · 매출 · 병원 리포트)의 달이 그 달(또는 마감할 지난달)
//   한 시각마다 따로 돌립니다(시계를 프로세스째 옮겨야 하므로).

const MOMENTS = [
  '2026-11-30T23:58:00+09:00', //  달 끝 자정 직전
  '2026-12-01T08:30:00+09:00', //  월초 아침 — UTC 로는 11월 30일
  '2026-12-31T23:55:00+09:00', //  연말
  '2027-01-01T08:30:00+09:00', //  새해 아침 — UTC 로는 지난해
  '2028-02-29T08:30:00+09:00', //  윤일 아침
  '2027-03-31T10:00:00+09:00', //  31일 — 「한 달 전」 계산이 2월 31일로 넘치는 날
]

if (!FAKE_NOW) {
  //  바깥 — 시각마다 이 파일을 따로 띄웁니다
  let failed = 0
  for (const t of MOMENTS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, FAKE_NOW: t }, encoding: 'utf8', timeout: 600_000 })
    process.stdout.write(r.stdout ?? '')
    if (r.status !== 0) {
      failed += 1
      process.stdout.write(`FAIL | ${t} — 끝까지 못 돎 (exit ${r.status})\n${(r.stderr ?? '').slice(-1200)}\n`)
    }
  }
  process.exit(failed ? 1 : 0)
}

const { chromium, EXEC } = await import('./_pw.mjs')
const W = await import('./walk_lib.mjs')
const F = await import('./perf_fixtures.mjs')

const tag = FAKE_NOW.slice(0, 16).replace('T', ' ')
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | [${tag}] ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const b = await chromium.launch({ executablePath: EXEC })

//  한국 날짜 — 기대값
const kst = new Date(FAKE_NOW).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const [Y, M, D] = kst.split('-').map(Number)
const DOW = '일월화수목금토'[new Date(`${kst}T12:00:00+09:00`).getUTCDay()]
ok(F.TODAY === kst, '공용 자료의 오늘도 같은 날', `${F.TODAY} · ${kst}`)

async function open(role, path, w = 1440) {
  const state = { reqs: 0, writes: [], profile: { ...W.profileFor(role), font_scale: 'normal' }, schemaVersion: 87 }
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700, hasTouch: w < 700, timezoneId: 'Asia/Seoul' })
  await ctx.clock.install({ time: new Date(FAKE_NOW) })
  W.wire(ctx, state)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400 * 400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p, state, errors }
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
async function visit(o, path) {
  await o.p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(o.p, o.state, 700, 25000)
  await o.p.waitForTimeout(500)
  const crashed = await o.p.locator('[data-error-boundary]').count()
  ok(crashed === 0 && o.errors.length === 0, `${path} — 화면 오류 없음`, o.errors.slice(-1)[0]?.slice(0, 120) ?? (crashed ? flat(await o.p.locator('[data-error-message]').first().innerText().catch(() => '')) : ''))
  o.errors.length = 0
}

// ── 내부 화면 · 대표 ──────────────────────────────────────────────────────
{
  const o = await open('admin', '/')
  await visit(o, '/')
  const clock = flat(await o.p.locator('[data-clock-top]').innerText().catch(() => ''))
  ok(clock.startsWith(`${M}/${D}(${DOW})`), '위쪽 시계 — 한국 날짜', clock)
  await visit(o, '/today')
  ok(flat(await o.p.locator('main').innerText()).includes(`${M}월 ${D}일 (${DOW})`), 'PC 오늘 일정 — 한국 오늘 날짜', `${M}월 ${D}일 (${DOW})`)
  const calM = flat(await o.p.locator('[data-cal-month]').first().innerText().catch(() => ''))
  ok(calM.includes(`${Y}년 ${M}월`) || calM.includes(`${M}월`), '달력 — 이번 달', calM)
  ok((await o.p.locator(`[data-cal-pick="${kst}"]`).count()) === 1, '달력에 오늘 칸이 있음', kst)
  for (const path of ['/billing', '/receivables', '/revenue', '/history', '/stats', '/reports', '/requests', '/plan', '/dispatch', '/clients', '/performance']) await visit(o, path)
  //  월 마감 — 이번 달 또는 마감할 지난달
  await visit(o, '/billing')
  const prev = new Date(Date.UTC(Y, M - 2, 1))
  const want = [`${M}월`, `${prev.getUTCMonth() + 1}월`]
  const mc = flat(await o.p.locator('main').innerText())
  ok(want.some((x) => mc.includes(x)), '월 마감 — 이번 달 · 지난달 이름이 보임', want.join(' / '))
  await o.ctx.close()
}

// ── 현장 · 폰 ─────────────────────────────────────────────────────────────
{
  const o = await open('field', '/today', 390)
  await visit(o, '/today')
  const strip = await o.p.locator(`[data-day="${kst}"]`).count()
  ok(strip === 1, '폰 날짜 띠에 한국 오늘', kst)
  const title = flat(await o.p.locator('[data-day-title]').first().innerText().catch(() => ''))
  ok(title.startsWith(`${M}월 ${D}일`), '폰 오늘 일정 제목 — 한국 오늘', title)
  await visit(o, '/collection')
  await o.ctx.close()
}

// ── 병원 화면 · 병원 계정 ─────────────────────────────────────────────────
{
  const o = await open('client', '/portal', 390)
  for (const path of ['/portal', '/portal/history', '/portal/report', '/portal/billing', '/portal/requests', '/portal/supplies']) await visit(o, path)
  await visit(o, '/portal/report')
  const rep = flat(await o.p.locator('main').innerText())
  ok(rep.includes(`${M}월`) || rep.includes(`${new Date(Date.UTC(Y, M - 2, 1)).getUTCMonth() + 1}월`), '병원 리포트 — 이번 달 · 지난달', rep.slice(0, 60))
  await o.ctx.close()
}

await b.close()
