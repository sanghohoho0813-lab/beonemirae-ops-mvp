import { chromium, EXEC } from './_pw.mjs'

//  AI 동선 추천 — **2단계 예정 기능의 입구만** 있는지 확인합니다
//
//   대표님: 「실제 TMAP API 나 GPT API 를 연결하지 않는다. 가짜 추천경로 ·
//   가짜 절감률 만들지 말 것. "현재 AI가 최적화하고 있다"는 오해를 주는
//   문구 금지.」
//
//   그래서 여기서 제일 중요한 검사는 **아무 데도 안 나간다**는 것입니다.
//   화면을 열고 눌러 보는 동안 바깥으로 나가는 요청을 전부 적어 두고,
//   tmap · openai · gpt 로 가는 것이 한 건이라도 있으면 실패입니다.

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000a9'
const FD = '00000000-0000-0000-0000-0000000000f1'
const C1 = '00000000-0000-0000-0000-0000000000a1'
const V3 = '00000000-0000-0000-0000-0000000000v3'
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

const clients = [{ id: C1, name: '남양주백병원', type: '병원', address: '경기도 남양주시 오남읍 1',
  manager: '김', phone: '031-000-0000', collection_cycle: '주 3회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
const vehicles = [{ id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '박기사', active: true }]
const scheds = [{ id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', vehicle_id: V3,
  scheduled_time: '09:00', status: '예정', expected_amount: 100, actual_amount: null, memo: '',
  origin: 'system', created_at: `${T}T00:10:00Z`, created_by: AD, created_by_name: '송대표',
  created_via: '사무실 배정', event_id: null, canceled_at: null, cancel_reason: '' }]

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { role = 'admin', w = 1280 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, isMobile: w < 700, hasTouch: w < 700 })
  const uid = role === 'field' ? FD : AD
  const me = { id: uid, email: 'a@b.c', name: role === 'field' ? '김준기' : '송대표', role,
    font_scale: 'normal', active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null,
    vehicle_id: V3, created_at: '2026-01-01T00:00:00Z' }
  //  ⚠ 바깥으로 나간 곳을 전부 적습니다 — 이 목록이 이 검사의 핵심입니다.
  const outbound = []
  ctx.route('**/*', (r) => {
    const u = r.request().url()
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outbound.push(u)
    if (u.includes('/auth/v1/')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }) })
    }
    if (u.includes('/rest/v1/')) {
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
      if (u.includes('/rpc/app_schema_version')) return json(77)
      if (u.includes('/rpc/')) return json(null)
      if (u.includes('/profiles')) return json(single ? me : [me])
      if (u.includes('/clients')) return json(single ? clients[0] : clients)
      if (u.includes('/vehicles')) return json(single ? vehicles[0] : vehicles)
      if (u.includes('/schedules')) return json(scheds)
      if (u.includes('/office_stock')) return json(single ? { id: 1 } : [{ id: 1 }])
      return json([])
    }
    return r.continue()
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1200)
  return { ctx, p, outbound }
}

//  모달 내용 검사는 두 화면에서 똑같으므로 함수로 묶습니다.
async function checkPanel(p, where) {
  await p.locator('[data-routeai-open]').first().click()
  await p.waitForTimeout(700)
  ok((await p.locator('[data-routeai-panel]').count()) === 1, `${where} — 누르면 안내가 열린다 (빈 화면·오류 아님)`)
  const t = flat(await p.locator('[data-routeai-panel]').innerText())

  //  ⚠ 제일 먼저 「아직 아니다」가 나와야 합니다.
  ok(/아직 켜지지 않은 기능입니다/.test(t), `${where} — **아직 안 되는 기능이라고 먼저 말한다**`)
  ok(/연결돼 있지 않고/.test(flat(await p.locator('[data-routeai-notyet]').innerText())),
    `${where} — TMAP·GPT 에 연결 안 됐다고 적혀 있다`)
  ok(/TMAP 의 실도로·교통정보와 GPT 기반 업무조건 분석/.test(t), `${where} — 무엇을 할 기능인지 설명한다`)
  ok(/2단계 AX 기능으로 적용할 예정/.test(t), `${where} — 언제 붙일지 적혀 있다`)
  for (const f of ['실시간 교통 반영', '방문순서 추천', '기사·차량별 일정 분석', '이동거리·운행시간 절감']) {
    ok(t.includes(f), `${where} — 예정 기능 「${f}」`)
  }

  //  ⚠ **가짜 숫자 금지.** 절감률·거리·분 같은 성과 숫자가 하나라도 있으면
  //    실사에서 근거를 묻습니다. 지어낸 숫자는 없어야 합니다.
  const fake = t.match(/\d+(\.\d+)?\s*(%|km|분|배|원)/g) ?? []
  ok(fake.length === 0, `${where} — **가짜 절감률·거리·시간 숫자가 없다**`, fake.join(',') || '없음')
  //  ⚠ 「지금 최적화하고 있다」로 읽힐 문구가 없어야 합니다.
  ok(!/최적화하고 있습니다|최적화 중|AI가 추천했|추천된 경로입니다/.test(t),
    `${where} — 「지금 AI 가 하고 있다」로 읽힐 문구가 없다`)
  ok((await p.locator('[data-routeai-badge]').count()) >= 1, `${where} — 「2단계」 딱지가 붙어 있다`)
}

// ── ① PC · 일정 편성 ──────────────────────────────────────────────────────
{
  const { ctx, p, outbound } = await open('/plan')
  const btn = p.locator('[data-routeai-open]')
  ok((await btn.count()) === 1, 'PC 일정 편성 — 「AI 동선 추천」이 있다')
  ok(/AI 동선 추천/.test(flat(await btn.innerText())), '버튼 이름', flat(await btn.innerText()))
  ok(/2단계/.test(flat(await btn.innerText())), '버튼에 「2단계」가 같이 붙어 있다')

  //  ⚠ 우측 상단인지 — 화면 오른쪽 절반, 그리고 위쪽에 있어야 합니다.
  const box = await btn.boundingBox()
  const vw = p.viewportSize().width
  ok((box?.x ?? 0) > vw / 2, '**우측**에 있다', `x=${Math.round(box?.x ?? 0)} / ${vw}`)
  ok((box?.y ?? 9999) < 400, '**상단**에 있다', `y=${Math.round(box?.y ?? 0)}`)
  ok((box?.height ?? 0) >= 44, '누르는 자리가 손가락 크기', `${Math.round(box?.height ?? 0)}px`)

  await checkPanel(p, 'PC 편성')

  //  ⚠ 여기까지 오는 동안 바깥으로 나간 곳이 있으면 안 됩니다.
  const bad = outbound.filter((u) => /tmap|openai|gpt|kakao|naver|google.*maps/i.test(u))
  ok(bad.length === 0, '**TMAP·GPT 어디에도 안 나갔다**', bad.join(',') || '나간 곳 없음')
  await ctx.close()
}

// ── ② PC · 배차·경로 ──────────────────────────────────────────────────────
{
  const { ctx, p, outbound } = await open('/dispatch')
  const btn = p.locator('[data-routeai-open]')
  ok((await btn.count()) === 1, 'PC 배차·경로 — 「AI 동선 추천」이 있다')
  const box = await btn.boundingBox()
  ok((box?.x ?? 0) > p.viewportSize().width / 2, '여기서도 우측', `x=${Math.round(box?.x ?? 0)}`)
  ok((box?.y ?? 9999) < 400, '여기서도 상단', `y=${Math.round(box?.y ?? 0)}`)
  await checkPanel(p, 'PC 배차')
  const bad = outbound.filter((u) => /tmap|openai|gpt|kakao|naver|google.*maps/i.test(u))
  ok(bad.length === 0, '**여기서도 아무 데도 안 나갔다**', bad.join(',') || '나간 곳 없음')
  await ctx.close()
}

// ── ③ 폰 · 오늘 일정 ──────────────────────────────────────────────────────
{
  const { ctx, p, outbound } = await open('/today', { role: 'field', w: 390 })
  const chip = p.locator('[data-routeai-open]')
  ok((await chip.count()) === 1, '폰 오늘 일정 — 「추천 동선」이 있다')
  ok(/추천 동선/.test(flat(await chip.innerText())), '이름', flat(await chip.innerText()))

  const box = await chip.boundingBox()
  //  ⚠ 「너무 큰 공간을 차지하지 않되 쉽게 발견 가능하게」.
  //    처음에는 「화면 위쪽 420px 안」으로 재려 했는데, 그건 이 화면을
  //    잘못 안 것이었습니다 — 폰에서 날짜 줄은 오늘 담당·가져다 줄 물품·
  //    다음 방문 카드 **아래**입니다. 재야 할 것은 자리(y)가 아니라
  //    **새 줄을 만들지 않았는가**와 **일정 목록 바로 위인가**입니다.
  const title = await p.locator('[data-day-title]').boundingBox()
  const mid = (b) => (b?.y ?? 0) + (b?.height ?? 0) / 2
  ok(Math.abs(mid(box) - mid(title)) < 30,
    '**새 줄을 만들지 않는다** (날짜 줄에 얹힘)',
    `칩 ${Math.round(mid(box))} · 날짜 ${Math.round(mid(title))}`)
  ok((box?.height ?? 0) >= 44, '누르는 자리가 손가락 크기', `${Math.round(box?.height ?? 0)}px`)
  ok((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 391, '390px 밖으로 안 나간다',
    `${Math.round(box?.x ?? 0)}~${Math.round((box?.x ?? 0) + (box?.width ?? 0))}`)
  //  ⚠ 같은 줄에 있는 「오늘로」를 밀어내면 안 됩니다.
  const list0 = await p.locator('[data-sched-more="s1"]').boundingBox()
  ok((box?.y ?? 9999) < (list0?.y ?? 0), '**일정 목록 바로 위**에 있다',
    `칩 ${Math.round(box?.y ?? 0)} · 첫 일정 ${Math.round(list0?.y ?? 0)}`)

  await checkPanel(p, '폰')
  const bad = outbound.filter((u) => /tmap|openai|gpt|kakao|naver|google.*maps/i.test(u))
  ok(bad.length === 0, '**폰에서도 아무 데도 안 나갔다**', bad.join(',') || '나간 곳 없음')
  await ctx.close()
}

// ── ④ 오늘 갈 곳을 가리지 않는다 ──────────────────────────────────────────
{
  //  ⚠ 입구를 얹느라 **오늘 일정이 밀려나면** 그게 진짜 손해입니다.
  const { ctx, p } = await open('/today', { role: 'field', w: 390 })
  const first = p.locator('[data-sched-more="s1"]')
  ok((await first.count()) === 1, '오늘 일정 줄은 그대로 있다')
  //  ⚠ 입구를 얹느라 오늘 갈 곳이 밀려나면 그게 진짜 손해입니다.
  //    날짜 줄 전체가 한 줄(≤56px)에 머물러야 밀리지 않은 것입니다.
  const row = await p.locator('[data-day-title]').evaluate((e) => {
    const r = e.parentElement.getBoundingClientRect()
    return r.height
  })
  ok(row <= 56, '**날짜 줄이 한 줄 그대로다** (오늘 갈 곳이 안 밀립니다)', `${Math.round(row)}px`)
  await ctx.close()
}

await b.close()
