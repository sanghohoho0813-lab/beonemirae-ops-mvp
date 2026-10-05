import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

//  0130 — 「신용보증기금 방문용 영상」 단추와 화면
//
//   대표님: 「대표님·이사님·개발자 화면에서 볼 수 있게, 오늘 날짜·현재 시각 옆에
//   버튼을. 누르면 영상과 간단한 상세가 뜨게. 1.25배·1.5배로도 재생 가능하게」.
//
//   ⚠ 영상에는 매출 숫자가 있습니다. 저장소가 공개라 **영상 파일이 앱 안에
//     (public/ · dist/) 들어가면 안 됩니다.** Storage 비공개 칸 + 서명 주소로만 엽니다.
//   ⚠ 실제 영상으로 재생까지 보려면 VISIT_VIDEO_FILE=/경로/영상.mp4 를 주십시오.
//     없으면 재생 시험만 건너뜁니다 (나머지는 그대로 봅니다).

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = process.env.VISIT_VIDEO_FILE
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, { w = 1440, h = 900, path = '/', sign = 'ok' } = {}) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role), signs: [] }
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  W.wire(ctx, state)
  //  createSignedUrl — POST /storage/v1/object/sign/<칸>/<파일> → { signedURL }
  await ctx.route('**/storage/v1/object/sign/**', async (r) => {
    const req = r.request()
    if (req.method() === 'POST') {
      state.signs.push({ url: req.url(), body: req.postDataJSON?.() ?? null })
      if (sign === 'missing') return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }) })
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/visit-media/sinbo_visit_v3.mp4?token=TEST' }) })
    }
    //  서명 주소로 영상 받기 — 실제 파일이 있으면 그것을, 없으면 빈 응답
    if (FILE && existsSync(FILE)) {
      const buf = readFileSync(FILE)
      const range = req.headers()['range']
      if (range) {
        const [s, e] = range.replace('bytes=', '').split('-')
        const start = Number(s); const end = e ? Number(e) : buf.length - 1
        return r.fulfill({ status: 206, headers: { 'content-type': /\.webm$/.test(FILE) ? 'video/webm' : 'video/mp4', 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${buf.length}` }, body: buf.subarray(start, end + 1) })
      }
      return r.fulfill({ status: 200, contentType: /\.webm$/.test(FILE) ? 'video/webm' : 'video/mp4', body: buf })
    }
    return r.fulfill({ status: 404, body: '' })
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: 'u', aud: 'authenticated', email: state.profile.email, app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state, 800, 30000)
  return { ctx, p, state }
}

const btnBox = (p) => p.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-visit-video-btn]')].find((e) => e.getBoundingClientRect().width > 2)
  const clock = document.querySelector('[data-clock-top]')
  const theme = [...document.querySelectorAll('button')]
    .filter((x) => /화면 색/.test(x.textContent ?? '') || /화면 색/.test(x.getAttribute('aria-label') ?? ''))
    .find((x) => x.getBoundingClientRect().width > 2)
  if (!btn) return null
  const a = btn.getBoundingClientRect(); const c = clock?.getBoundingClientRect(); const t = theme?.getBoundingClientRect()
  const mid = (r) => r.top + r.height / 2
  return {
    text: (btn.textContent ?? '').replace(/\s+/g, ' ').trim(),
    sameRowClock: c ? Math.abs(mid(a) - mid(c)) <= 12 : false,
    leftOfClock: c ? a.right <= c.left : false,
    gapToClock: c ? Math.round(c.left - a.right) : -1,
    clockThemeGap: c && t ? Math.round(t.left - c.right) : -1,
    clockThemeRow: c && t ? Math.abs(mid(c) - mid(t)) <= 12 : false,
    h: Math.round(a.height), oneLine: a.height < 60,
  }
})

// ── ① 대표(admin) · 이사님(office) — 시계 옆에 단추 ─────────────────────────
for (const role of ['admin', 'office']) {
  for (const w of [1440, 1280]) {
    const s = await open(role, { w })
    const r = await btnBox(s.p)
    ok(r !== null, `${role} · PC ${w}px — **「신용보증기금 방문용 영상」 단추가 보임**`, r?.text ?? '(없음)')
    if (r) {
      ok(r.text === '신용보증기금 방문용 영상', `${role} · ${w}px — 글자 그대로`, r.text)
      ok(r.sameRowClock && r.leftOfClock, `${role} · ${w}px — **오늘 날짜·현재 시각 바로 옆(왼쪽)**`, `간격 ${r.gapToClock}px`)
      ok(r.gapToClock >= 4 && r.gapToClock <= 40, `${role} · ${w}px — 시계와 붙어 있음`, `${r.gapToClock}px`)
      //  0129 의 자리를 깨지 않음 — 시계는 여전히 「화면 색」 옆
      ok(r.clockThemeRow && r.clockThemeGap >= 12 && r.clockThemeGap <= 80, `${role} · ${w}px — 시계 ↔ 「화면 색」은 그대로 붙어 있음`, `${r.clockThemeGap}px`)
      ok(r.oneLine && r.h >= 44, `${role} · ${w}px — 한 줄 · 누를 만한 높이`, `${r.h}px`)
    }
    await s.ctx.close()
  }
}

// ── ② 현장(field) · 병원(client) — 단추도 화면도 없음 ──────────────────────
for (const role of ['field', 'client']) {
  const s = await open(role)
  const n = await s.p.locator('[data-visit-video-btn]').count()
  ok(n === 0, `${role} — 단추가 **없음**`)
  await s.ctx.close()
  const d = await open(role, { path: '/visit-video' })
  //  주소는 그대로 두고 「접근 권한이 없는 화면입니다」를 띄웁니다 (RequireAuth)
  const shown = await d.p.locator('[data-visit-video-player]').count()
  const blocked = (await d.p.evaluate(() => document.body.innerText)).includes('접근 권한이 없는 화면입니다')
  ok(shown === 0 && blocked, `${role} — 주소로 열어도 **화면이 열리지 않음** (접근 권한 없음)`)
  ok(d.state.signs.length === 0, `${role} — 영상 서명 주소를 **요청조차 하지 않음**`)
  await d.ctx.close()
}

// ── ③ 누르면 영상 + 간단한 상세 ─────────────────────────────────────────────
{
  const s = await open('admin')
  await s.p.locator('[data-visit-video-btn]').first().click()
  await s.p.waitForSelector('[data-visit-video]', { timeout: 15000 }).catch(() => {})
  ok(s.p.url().endsWith('/visit-video'), '단추를 누르면 **/visit-video** 로', s.p.url().replace(W.BASE, ''))
  const v = await s.p.evaluate(() => {
    const el = document.querySelector('[data-visit-video]')
    return el ? { src: el.getAttribute('src') ?? '', controls: el.hasAttribute('controls') } : null
  })
  ok(v !== null, '**영상이 뜸**')
  ok(!!v && /\/storage\/v1\/object\/sign\/visit-media\/sinbo_visit_v3\.mp4\?token=/.test(v.src), '영상은 **비공개 칸의 서명 주소**로만 엶', v?.src.replace(/^https?:\/\/[^/]+/, '') ?? '')
  ok(!!v?.controls, '재생·멈춤·소리 조절 (기본 조작 막대)')
  const sg = s.state.signs[0]
  ok(s.state.signs.length === 1 && /\/sign\/visit-media\/sinbo_visit_v3\.mp4$/.test(sg?.url ?? ''), '서명은 visit-media / sinbo_visit_v3.mp4 한 번', sg?.url.split('/storage/v1')[1] ?? '')
  ok(sg?.body?.expiresIn === 21600, '서명 주소 유효 6시간 (상담 중 끊기지 않게)', String(sg?.body?.expiresIn))

  //  간단한 상세 — 영상 흐름 · 말하는 숫자 · 보여드리기 전에
  const d = await s.p.evaluate(() => ({
    title: document.querySelector('h1')?.textContent ?? '',
    chapters: document.querySelectorAll('[data-visit-chapters] li').length,
    numbers: (document.querySelector('[data-visit-numbers]')?.textContent ?? '').replace(/\s+/g, ' '),
    body: document.body.innerText,
  }))
  ok(d.title.includes('신용보증기금 방문용 영상'), '상세 제목', d.title)
  ok(d.chapters >= 5, '영상 흐름 (누르면 그 장면부터)', `${d.chapters}장`)
  //  ⚠ 숫자는 영상 음성 그대로 — 1원이라도 다르면 FAIL
  for (const want of ['1억 2천만 원 수준', '5억 8천만 원', '약 5배 가까이', '약 4억 5천만 원', '약 9억 원 수준']) {
    ok(d.numbers.includes(want), `말하는 숫자 그대로 — ${want}`)
  }
  ok(/약 9억 원 수준.*전망 · 실적 아님/.test(d.numbers), '연환산은 **전망 · 실적 아님** 표시')
  //  좁은 칸에서도 숫자 줄이 단어 중간에서 쪼개지지 않음 (「연환/산」 「실적 아/님」 이 실제로 났습니다)
  const wrapped = await s.p.evaluate(() => [...document.querySelectorAll('[data-visit-numbers] li span')]
    .filter((e) => e.classList.contains('whitespace-nowrap') && e.getClientRects().length > 1).map((e) => e.textContent))
  ok(wrapped.length === 0, '숫자 줄이 단어 중간에서 쪼개지지 않음', wrapped.join(', '))
  const over = await s.p.evaluate(() => [...document.querySelectorAll('[data-visit-numbers] li')].filter((li) => li.scrollWidth > li.clientWidth + 1).length)
  ok(over === 0, '숫자 칸이 넘치지 않음', `${over}칸`)
  //  인포그래픽에만 있고 음성에는 없는 숫자는 쓰지 않습니다
  for (const bad of ['1.19억', '3.62억', '4.53억', '9.06억', '53곳']) ok(!d.body.includes(bad), `음성에 없는 숫자 없음 — ${bad}`)
  //  담당자에게 보여 줄 영상 — 「상담 포인트」 같은 내부 메모는 넣지 않습니다
  ok(!d.body.includes('상담 포인트'), '「신용보증기금 상담 포인트」 없음')

  // ── ④ 재생 속도 1 · 1.25 · 1.5 ────────────────────────────────────────
  for (const r of [1.25, 1.5, 1]) {
    await s.p.locator(`[data-rate="${r}"]`).click()
    const st = await s.p.evaluate(() => ({
      rate: document.querySelector('[data-visit-video]')?.playbackRate,
      pressed: [...document.querySelectorAll('[data-rate]')].filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.rate),
    }))
    ok(st.rate === r && st.pressed.length === 1 && Number(st.pressed[0]) === r, `**${r}배** — 영상 속도가 실제로 바뀜`, `playbackRate=${st.rate}`)
  }
  const labels = await s.p.locator('[data-rate]').allInnerTexts()
  ok(labels.join(',') === '1배,1.25배,1.5배', '속도 단추 글자', labels.join(' · '))

  //  실제 영상으로 — 길이 · 재생 중 속도 바꾸기
  //  ⚠ Playwright 의 Chromium 은 H.264(mp4) 를 **풀지 못합니다** (실제 Chrome·Edge·
  //    Safari 는 풉니다). mp4 를 주면 재생 시험은 건너뛰고, 같은 영상을 VP9(webm)으로
  //    잘라 준 파일이면 재생까지 봅니다. 어느 쪽이든 멈춰 서지 않게 시간 제한을 둡니다.
  if (FILE && existsSync(FILE)) {
    await s.p.locator('[data-rate="1.5"]').click()
    const play = await s.p.evaluate(async () => {
      const el = document.querySelector('[data-visit-video]')
      el.muted = true
      const meta = await Promise.race([
        new Promise((res) => (el.readyState >= 1 ? res(true) : el.addEventListener('loadedmetadata', () => res(true), { once: true }))),
        new Promise((res) => setTimeout(() => res(false), 8000)),
      ])
      if (!meta) return { decoded: false }
      await el.play()
      const t0 = el.currentTime; const w0 = performance.now()
      await new Promise((res) => setTimeout(res, 2000))
      return { decoded: true, dur: el.duration, w: el.videoWidth, h: el.videoHeight, rate: el.playbackRate,
        speed: (el.currentTime - t0) / ((performance.now() - w0) / 1000) }
    })
    if (!play.decoded) console.log('  -- 이 브라우저가 풀지 못하는 형식이라 재생 시험 건너뜀 (H.264 → VP9 webm 으로 주십시오)')
    else {
      if (play.dur > 200) ok(Math.abs(play.dur - 259.6) < 1, '실제 영상 — 길이 4분 20초', `${play.dur.toFixed(1)}s`)
      ok(play.w === 1080 && play.h === 1920, '실제 영상 — 세로 1080×1920', `${play.w}×${play.h}`)
      ok(play.rate === 1.5 && play.speed > 1.3, '실제 영상 — **재생 중 1.5배로 흐름**', `${play.speed.toFixed(2)}배`)
    }
  } else console.log('  -- 실제 영상 재생 시험 건너뜀 (VISIT_VIDEO_FILE 없음)')
  await s.ctx.close()
}

// ── ③-2 화면 폭마다 — 상세 칸이 찌그러지거나 넘치지 않음 ───────────────────
//   ⚠ 1024px 에서 두 칸을 나란히 두었더니 오른쪽 상세가 글자 한 자 폭이 됐습니다.
for (const [w, h] of [[1024, 800], [1280, 800], [1440, 900], [390, 844]]) {
  const s = await open('admin', { w, h, path: '/visit-video' })
  await s.p.waitForSelector('[data-visit-numbers]', { timeout: 15000 }).catch(() => {})
  const r = await s.p.evaluate(() => ({
    over: [...document.querySelectorAll('[data-visit-numbers] li, [data-visit-chapters] li')].filter((li) => li.scrollWidth > li.clientWidth + 1).length,
    detailW: Math.round(document.querySelector('[data-visit-chapters]')?.getBoundingClientRect().width ?? 0),
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
  }))
  ok(r.over === 0 && !r.hscroll, `${w}px — 넘치는 칸 없음 · 옆으로 밀리지 않음`, `넘침 ${r.over}`)
  ok(r.detailW >= 320, `${w}px — 상세 칸 폭이 읽을 만함`, `${r.detailW}px`)
  await s.ctx.close()
}

// ── ⑤ 영상이 아직 안 올라갔으면 — 막히지 않고 올리는 법 안내 ─────────────────
{
  const s = await open('admin', { path: '/visit-video', sign: 'missing' })
  await s.p.waitForSelector('[data-visit-video-missing]', { timeout: 10000 }).catch(() => {})
  const r = await s.p.evaluate(() => ({
    missing: !!document.querySelector('[data-visit-video-missing]'),
    help: (document.querySelector('[data-visit-upload-help]')?.textContent ?? ''),
  }))
  ok(r.missing, '파일이 없으면 — 「영상 파일을 아직 찾지 못했습니다」')
  ok(r.help.includes('PROPOSAL_0130') && r.help.includes('sinbo_visit_v3.mp4'), '올리는 법 안내 (SQL · 파일 이름)')
  await s.ctx.close()
}

// ── ⑥ 영상 파일이 앱 안에 **없음** (공개 저장소) ───────────────────────────
{
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
  const vids = ['public', 'dist'].filter((d) => existsSync(join(ROOT, d)))
    .flatMap((d) => walk(join(ROOT, d))).filter((f) => /sinbo|visit/i.test(f) && /\.(mp4|mov|webm)$/i.test(f))
  ok(vids.length === 0, '**영상 파일이 public/ · dist/ 에 없음** (공개 저장소라 비공개 칸에만)', vids.join(', '))
}

await b.close()
