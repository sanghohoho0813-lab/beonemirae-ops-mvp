import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

//  0130 — 「신용보증기금 방문용 영상」 단추와 화면
//
//   대표님: 「대표님·이사님·개발자 화면에서 볼 수 있게, 오늘 날짜·현재 시각 옆에
//   버튼을. 누르면 영상과 간단한 상세가 뜨게. 1.25배·1.5배로도 재생 가능하게」.
//   이어서: 「SQL 실행 안 해도 바로 보이게. 폰에서도 — 지금은 PC 버전으로만 보여요」.
//
//   ⚠ 영상 파일은 앱 안(public/media/)에 있습니다. 저장소가 공개라 파일 주소를
//     아는 사람은 받을 수 있다는 것을 대표님께 알리고 정했습니다.
//     단추·화면은 대표·이사님(admin·office)에게만 보입니다.
//   ⚠ Playwright 의 Chromium 은 H.264(mp4)를 풀지 못합니다(실제 Chrome·Edge·Safari 는
//     풉니다). 그래서 화면 시험은 같은 영상을 VP9 로 자른 조각(fixtures/visit_tiny.webm)
//     으로 돌리고, 진짜 mp4 는 ⑧ 에서 파일 자체(H.264·AAC·faststart)를 봅니다.
//     더 큰 조각으로 보려면 VISIT_VIDEO_FILE=/경로/조각.webm.

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = '/media/sinbo_visit_v3.mp4'
//  재생 시험용 — 기본은 같은 영상을 2.5초·108×192 VP9 로 자른 조각(24KB)
const FILE = process.env.VISIT_VIDEO_FILE || join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'visit_tiny.webm')
const b = await chromium.launch({ executablePath: EXEC })

async function open(role, { w = 1440, h = 900, path = '/', media = 'real' } = {}) {
  const state = { reqs: 0, writes: [], profile: W.profileFor(role), media: 0, storage: 0 }
  const phone = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone })
  W.wire(ctx, state)
  //  예전(Storage 서명 주소) 길이 남아 있지 않은지 셉니다
  await ctx.route('**/storage/v1/**', (r) => { state.storage += 1; return r.fulfill({ status: 400, body: '{}' }) })
  await ctx.route(`**${SRC}`, async (r) => {
    state.media += 1
    if (media === 'missing') return r.fulfill({ status: 404, body: '' })
    if (media === 'garbage') return r.fulfill({ status: 200, contentType: 'video/mp4', body: 'not a video' })
    //  재생 시험용 webm 조각 — 없으면 미리보기 서버의 진짜 파일을 그대로
    if (FILE && existsSync(FILE)) {
      const buf = readFileSync(FILE)
      const type = /\.webm$/.test(FILE) ? 'video/webm' : 'video/mp4'
      const range = r.request().headers()['range']
      if (range) {
        const [s, e] = range.replace('bytes=', '').split('-')
        const start = Number(s); const end = e ? Number(e) : buf.length - 1
        return r.fulfill({ status: 206, headers: { 'content-type': type, 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${buf.length}` }, body: buf.subarray(start, end + 1) })
      }
      return r.fulfill({ status: 200, contentType: type, body: buf })
    }
    return r.continue()
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

//  보이는 단추 하나와 그 옆 시계
const btnBox = (p) => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden' }
  const btn = [...document.querySelectorAll('[data-visit-video-btn]')].find(vis)
  if (!btn) return null
  //  같은 줄의 시계 — PC 는 data-clock-top, 폰은 머리띠의 data-live-clock
  const clock = [...document.querySelectorAll('[data-clock-top], header [data-live-clock]')].find(vis)
  const theme = [...document.querySelectorAll('button')]
    .filter((x) => /화면 색/.test(x.textContent ?? '') || /화면 색/.test(x.getAttribute('aria-label') ?? ''))
    .find(vis)
  const a = btn.getBoundingClientRect(); const c = clock?.getBoundingClientRect(); const t = theme?.getBoundingClientRect()
  const mid = (r) => r.top + r.height / 2
  return {
    text: (btn.textContent ?? '').replace(/\s+/g, ' ').trim(),
    clockText: (clock?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    sameRowClock: c ? Math.abs(mid(a) - mid(c)) <= 14 : false,
    leftOfClock: c ? a.right <= c.left : false,
    gapToClock: c ? Math.round(c.left - a.right) : -1,
    clockThemeGap: c && t ? Math.round(t.left - c.right) : -1,
    clockThemeRow: c && t ? Math.abs(mid(c) - mid(t)) <= 12 : false,
    h: Math.round(a.height), w: Math.round(a.width), right: Math.round(c?.right ?? 0),
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
  }
})

// ── ① PC — 대표(admin) · 이사님(office): 시계 바로 옆에 단추 ────────────────
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
      ok(r.h >= 44 && r.h < 60, `${role} · ${w}px — 한 줄 · 누를 만한 높이`, `${r.h}px`)
    }
    await s.ctx.close()
  }
}

// ── ② 폰 — 대표·이사님: **PC 버전으로 바꾸지 않아도** 시계 옆에 단추 ─────────
for (const role of ['admin', 'office']) {
  for (const [w, h] of [[390, 844], [360, 780], [430, 932], [320, 640]]) {
    const s = await open(role, { w, h })
    const r = await btnBox(s.p)
    ok(r !== null, `${role} · 폰 ${w}px — **단추가 보임** (PC 버전 전환 없이)`, r?.text ?? '(없음)')
    if (r) {
      //  320px 폰은 자리가 모자라 시계가 아랫줄로 내려갑니다 — 그 대신 단추가 짜부라지지 않음
      if (w >= 360) ok(r.sameRowClock && r.leftOfClock, `${role} · 폰 ${w}px — 시계와 **같은 줄 · 왼쪽**`, `간격 ${r.gapToClock}px`)
      ok(r.w >= 110, `${role} · 폰 ${w}px — 단추가 짜부라지지 않음 (글자 세로 안 됨)`, `${r.w}px`)
      ok(r.h >= 44, `${role} · 폰 ${w}px — 손가락으로 누를 만한 높이`, `${r.h}px`)
      ok(r.right <= w - 12 && !r.hscroll, `${role} · 폰 ${w}px — 화면 밖으로 안 나감`, `시계 오른쪽 끝 ${r.right}px`)
      ok(/\d+\/\d+\(.\)/.test(r.clockText) && /(오전|오후) \d{1,2}:\d{2}:\d{2}/.test(r.clockText),
        `${role} · 폰 ${w}px — 시계는 짧은 날짜 + 시·분·초`, r.clockText)
    }
    //  눌러서 들어가기
    if (r && w === 390) {
      await s.p.locator('[data-visit-video-btn]:visible').first().click()
      await s.p.waitForSelector('[data-visit-video]', { timeout: 15000 }).catch(() => {})
      const v = await s.p.evaluate(() => ({ path: location.pathname, video: !!document.querySelector('[data-visit-video]'),
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }))
      ok(v.path === '/visit-video' && v.video && !v.hscroll, `${role} · 폰 — 누르면 **영상 화면**`, v.path)
    }
    await s.ctx.close()
  }
}

// ── ③ 현장(field) · 병원(client) — 단추도 화면도 없음 (PC · 폰) ─────────────
for (const role of ['field', 'client']) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const s = await open(role, { w, h })
    const n = await s.p.evaluate(() => [...document.querySelectorAll('[data-visit-video-btn]')].filter((e) => e.getBoundingClientRect().width > 2).length)
    ok(n === 0, `${role} · ${w}px — 단추가 **없음**`)
    if (w === 390 && role === 'field') {
      //  현장 폰의 시계 줄은 예전 그대로 — 긴 날짜(「10월 5일 (월)」)
      const t = await s.p.evaluate(() => [...document.querySelectorAll('header [data-live-clock]')].find((e) => e.getBoundingClientRect().width > 2)?.textContent ?? '')
      ok(/\d+월 \d+일 \(.\)/.test(t), `${role} · 폰 — 시계 줄은 예전 그대로`, t.replace(/\s+/g, ' ').trim())
    }
    await s.ctx.close()
  }
  const d = await open(role, { path: '/visit-video' })
  const shown = await d.p.locator('[data-visit-video-player]').count()
  const blocked = (await d.p.evaluate(() => document.body.innerText)).includes('접근 권한이 없는 화면입니다')
  ok(shown === 0 && blocked, `${role} — 주소로 열어도 **화면이 열리지 않음** (접근 권한 없음)`)
  ok(d.state.media === 0, `${role} — 영상 파일을 **불러오지도 않음**`)
  await d.ctx.close()
}

// ── ④ 누르면 영상 + 간단한 상세 — **SQL·업로드 없이 바로** ─────────────────
{
  const s = await open('admin')
  await s.p.locator('[data-visit-video-btn]:visible').first().click()
  await s.p.waitForSelector('[data-visit-video]', { timeout: 15000 }).catch(() => {})
  ok(s.p.url().endsWith('/visit-video'), '단추를 누르면 **/visit-video** 로', s.p.url().replace(W.BASE, ''))
  const v = await s.p.evaluate(() => {
    const el = document.querySelector('[data-visit-video]')
    return el ? { src: el.getAttribute('src') ?? '', controls: el.hasAttribute('controls') } : null
  })
  ok(v !== null, '**영상이 뜸**')
  ok(v?.src === SRC, '영상은 앱 안의 파일에서 바로 (서버 설정 필요 없음)', v?.src ?? '')
  ok(s.state.storage === 0, 'Supabase Storage 를 **부르지 않음** (SQL 실행 불필요)', `${s.state.storage}회`)
  ok(!!v?.controls, '재생·멈춤·소리 조절 (기본 조작 막대)')

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
  //  인포그래픽에만 있고 음성에는 없는 숫자는 쓰지 않습니다
  for (const bad of ['1.19억', '3.62억', '4.53억', '9.06억', '53곳']) ok(!d.body.includes(bad), `음성에 없는 숫자 없음 — ${bad}`)
  //  담당자에게 보여 줄 영상 — 「상담 포인트」 같은 내부 메모는 넣지 않습니다
  ok(!d.body.includes('상담 포인트'), '「신용보증기금 상담 포인트」 없음')
  ok(!/SQL|PROPOSAL|Storage/.test(d.body), '「SQL 실행·업로드」 안내가 **없음**')

  // ── ⑤ 재생 속도 1 · 1.25 · 1.5 ────────────────────────────────────────
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

  //  실제 재생 — 시간 제한을 두어 멈춰 서지 않게
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
    //  1초만 잽니다 — 기본 조각이 2.5초라 1.5배면 1.7초에 끝납니다
    await new Promise((res) => setTimeout(res, 1000))
    return { decoded: true, dur: el.duration, w: el.videoWidth, h: el.videoHeight, rate: el.playbackRate,
      speed: (el.currentTime - t0) / ((performance.now() - w0) / 1000) }
  })
  if (!play.decoded) console.log('  -- 이 브라우저가 H.264 를 풀지 못해 재생 시험 건너뜀 (VISIT_VIDEO_FILE=조각.webm 으로 주십시오)')
  else {
    if (play.dur > 200) ok(Math.abs(play.dur - 259.6) < 1, '실제 영상 — 길이 4분 20초', `${play.dur.toFixed(1)}s`)
    ok(play.h > 0 && Math.abs(play.w / play.h - 9 / 16) < .01, '실제 영상 — 세로 9:16', `${play.w}×${play.h}`)
    ok(play.rate === 1.5 && play.speed > 1.3, '실제 영상 — **재생 중 1.5배로 흐름**', `${play.speed.toFixed(2)}배`)
  }
  await s.ctx.close()
}

// ── ⑥ 화면 폭마다 — 상세 칸이 찌그러지거나 넘치지 않음 ─────────────────────
//   ⚠ 1024px 에서 두 칸을 나란히 두었더니 오른쪽 상세가 글자 한 자 폭이 됐습니다.
for (const [w, h] of [[1024, 800], [1280, 800], [1440, 900], [390, 844]]) {
  const s = await open('admin', { w, h, path: '/visit-video' })
  await s.p.waitForSelector('[data-visit-numbers]', { timeout: 15000 }).catch(() => {})
  const r = await s.p.evaluate(() => ({
    over: [...document.querySelectorAll('[data-visit-numbers] li, [data-visit-chapters] li')].filter((li) => li.scrollWidth > li.clientWidth + 1).length,
    detailW: Math.round(document.querySelector('[data-visit-chapters]')?.getBoundingClientRect().width ?? 0),
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    box: (() => { const e = document.querySelector('[data-visit-video-box]')?.getBoundingClientRect(); return e ? { r: Math.round(e.right), ratio: e.width / e.height } : null })(),
  }))
  ok(r.over === 0 && !r.hscroll, `${w}px — 넘치는 칸 없음 · 옆으로 밀리지 않음`, `넘침 ${r.over}`)
  //  ⚠ 폰에서 영상 칸 오른쪽이 잘렸던 자리 — 높이를 고정해 두어 9:16 폭이 화면보다 넓었습니다
  ok(!!r.box && r.box.r <= w - 8 && Math.abs(r.box.ratio - 9 / 16) < .01, `${w}px — 영상 칸이 화면 안 · 9:16 그대로`, r.box ? `오른쪽 끝 ${r.box.r}px` : '(없음)')
  ok(r.detailW >= 320, `${w}px — 상세 칸 폭이 읽을 만함`, `${r.detailW}px`)
  await s.ctx.close()
}

// ── ⑦ 파일을 못 받으면 — 막히지 않고 안내 ───────────────────────────────────
{
  const s = await open('admin', { path: '/visit-video', media: 'missing' })
  await s.p.waitForSelector('[data-visit-video-missing]', { timeout: 10000 }).catch(() => {})
  const t = await s.p.evaluate(() => document.querySelector('[data-visit-video-missing]')?.textContent ?? '')
  ok(t.includes('영상을 불러오지 못했습니다'), '파일을 못 받으면 — 「영상을 불러오지 못했습니다」', t.trim())
  await s.ctx.close()
}
{
  //  파일은 받았는데 브라우저가 형식을 못 푸는 경우 — 「인터넷 확인」이 아니라 「다른 브라우저로」
  const s = await open('admin', { path: '/visit-video', media: 'garbage' })
  await s.p.waitForSelector('[data-visit-video-missing]', { timeout: 10000 }).catch(() => {})
  const t = await s.p.evaluate(() => document.querySelector('[data-visit-video-missing]')?.textContent ?? '')
  ok(t.includes('이 브라우저에서는 영상을 재생할 수 없습니다'), '형식을 못 풀면 — 「크롬·사파리·엣지에서 열어 주세요」', t.trim())
  await s.ctx.close()
}

// ── ⑧ 영상 파일 — 앱 안에 있고, 폰에서 받자마자 재생되게 ───────────────────
{
  const f = join(ROOT, 'public', 'media', 'sinbo_visit_v3.mp4')
  ok(existsSync(f), 'public/media/sinbo_visit_v3.mp4 있음')
  if (existsSync(f)) {
    const size = statSync(f).size
    ok(size > 10e6 && size < 90e6, '크기 (GitHub 한 파일 100MB 제한 아래)', `${(size / 1e6).toFixed(1)}MB`)
    //  +faststart — 「moov」가 「mdat」보다 앞이어야 폰이 전부 받기 전에 재생을 시작합니다
    const head = readFileSync(f).subarray(0, 4096).toString('latin1')
    const moov = head.indexOf('moov'); const mdat = head.indexOf('mdat')
    ok(moov > 0 && (mdat < 0 || moov < mdat), '받는 즉시 재생 (moov 가 앞 · faststart)', `moov@${moov} mdat@${mdat}`)
    //  폰(아이폰 사파리 포함)이 바로 푸는 형식 — 화면 H.264(avc1) · 소리 AAC(mp4a)
    const moovBox = readFileSync(f).subarray(0, 400000).toString('latin1')
    ok(moovBox.includes('avc1') && moovBox.includes('mp4a'), '형식 H.264 + AAC (폰·PC 브라우저 모두 재생)')
  }
  ok(existsSync(join(ROOT, 'dist', 'media', 'sinbo_visit_v3.mp4')), '빌드 결과(dist)에도 들어감 — 배포하면 바로 보임')
}

await b.close()
