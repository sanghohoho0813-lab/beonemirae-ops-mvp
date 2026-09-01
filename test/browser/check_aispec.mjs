import { chromium, EXEC } from './_pw.mjs'

//  0094 — AI 를 붙일 자리 열두 곳이 **정직하게** 서 있는가
//
//   대표님: 「각 파트마다 api 두면 좋을 그런부분들에 버튼이랑 같이 올려두는거지.
//   버튼 누르면 어떤 방식으로 이 기능들이 실행되는지, 뭘 위한건지 이런것도 다
//   나와야하고」
//
//   ⚠ 이 검사가 지키는 것은 **화면이 예뻐 보이는가**가 아닙니다.
//     · 눌렀을 때 「아직 안 켜졌다」를 **먼저** 말하는가
//     · 어떻게 도는지, 무엇을 위한 것인지, 무엇을 재료로 쓰는지 다 적혀 있는가
//     · **AI 가 정하지 않는 것**이 적혀 있는가 (실사에서 첫 물음입니다)
//     · **가짜 숫자가 없는가** — 절감률·거리·시간을 지어내지 않았는가
//     · **아무 데도 통신하지 않는가** — 아직 연동 전이니 한 곳도 나가면 안 됩니다
//     · 실제 업무 단추보다 **앞에 서지 않는가**

const BASE = 'http://localhost:4173'
const AD = '00000000-0000-0000-0000-0000000000ad'
const C1 = '00000000-0000-0000-0000-0000000000c1'
const V3 = '00000000-0000-0000-0000-00000000v300'.replace('v3', 'a3')

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

const T = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const clients = [{
  id: C1, name: '가나요양병원', type: '병원', address: '경기도 남양주시 오남읍 양지로 47-35',
  manager: '', phone: '', collection_cycle: '주 1회', collects_medical_waste: true,
  collects_diaper: true, storage_size: '보통', note: '', is_demo_generated: false, active: true,
  contract_start: '2025-01-01', contract_end: null, payment_terms: '', payment_due_day: 20,
  pricing: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}]
const vehicles = [{
  id: V3, name: '3호차', waste_type: '의료폐기물', tonnage: 1, nominal_capacity: 1000,
  expected_capacity: 800, driver: '박기사', active: true,
}]
const scheds = [{
  id: 's1', client_id: C1, date: T, waste_type: '의료폐기물', vehicle_id: V3,
  scheduled_time: '09:00', status: '예정', expected_amount: 100, actual_amount: null, memo: '',
  origin: 'system', created_at: `${T}T00:10:00Z`, created_by: AD, created_by_name: '송대표',
  created_via: '사무실 배정', event_id: null, canceled_at: null, cancel_reason: '',
}]

const b = await chromium.launch({ executablePath: EXEC })

async function open(path, { w = 1280 } = {}) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 1000 }, isMobile: w < 700, hasTouch: w < 700,
  })
  const me = {
    id: AD, email: 'a@b.c', name: '송대표', role: 'admin', font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, vehicle_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }
  //  ⚠ 바깥으로 나간 곳을 전부 적습니다 — 아직 연동 전이라 **한 곳도**
  //    나가면 안 됩니다. 이 목록이 이 검사의 핵심 중 하나입니다.
  const outbound = []
  await ctx.route('**/*', (r) => {
    const u = r.request().url()
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outbound.push(u)
    if (u.includes('/auth/v1/')) {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }),
      })
    }
    if (u.includes('/rest/v1/')) {
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
      const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })
      if (u.includes('/rpc/app_schema_version')) return json(87)
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
  })), ['beonemirae-ops:auth', { id: AD, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText ?? ''
    return t.length > 20 && !/불러오는 중/.test(t)
  }, null, { timeout: 40000 }).catch(() => {})
  await p.waitForTimeout(1100)
  return { ctx, p, outbound }
}

/**
 *  창 하나를 열어 **정직한지** 봅니다.
 *
 *  ⚠ 「글자가 있다」가 아니라 **무엇이 적혀 있어야 하는가**를 봅니다.
 *    특히 「AI 가 정하지 않는 것」은 한 자리라도 빠지면 그 화면만 예외처럼
 *    읽힙니다 — 실사에서 제일 먼저 파고드는 자리입니다.
 */
async function checkPanel(p, id, where) {
  const panel = p.locator(`[data-ai-panel][data-ai-spec="${id}"]`)
  ok((await panel.count()) === 1, `${where}/${id} — 누르면 안내가 열린다 (빈 화면·오류 아님)`)
  if ((await panel.count()) !== 1) return
  const t = flat(await panel.innerText())

  ok(/아직 켜지지 않은 기능입니다/.test(t), `${where}/${id} — **아직 안 되는 기능이라고 먼저 말한다**`)
  ok((await panel.locator('[data-ai-badge]').count()) >= 1, `${where}/${id} — 단계 딱지가 붙어 있다`)

  const why = flat(await panel.locator('[data-ai-why]').innerText())
  ok(why.length >= 40, `${where}/${id} — **무엇을 위한 것인지** 적혀 있다`, `${why.length}자`)

  const steps = await panel.locator('[data-ai-how] > li').count()
  ok(steps >= 3, `${where}/${id} — **어떻게 도는지** 차례로 적혀 있다`, `${steps}단계`)

  const uses = await panel.locator('[data-ai-uses] > li').count()
  ok(uses >= 2, `${where}/${id} — 무엇을 재료로 쓰는지 적혀 있다`, `${uses}가지`)

  const never = flat(await panel.locator('[data-ai-never]').innerText())
  ok((await panel.locator('[data-ai-never] > li').count()) >= 2,
    `${where}/${id} — **AI 가 정하지 않는 것**이 적혀 있다`)
  //  ⚠ 돈은 예외 없이 사람이 정합니다. 한 자리도 빠지면 안 됩니다.
  ok(/청구 금액과 단가는 정하지 않습니다/.test(never),
    `${where}/${id} — **청구·단가는 AI 가 안 정한다고 못박았다**`, never.slice(0, 50))

  ok(flat(await panel.locator('[data-ai-needs]').innerText()).length >= 10,
    `${where}/${id} — 붙이기 전에 무엇이 필요한지 적혀 있다`)
  ok(flat(await panel.locator('[data-ai-api]').innerText()).length >= 5,
    `${where}/${id} — 어느 서비스를 쓸지(또는 아직 안 정했다고) 적혀 있다`)

  //  ⚠ **지어낸 숫자**가 없어야 합니다. 「30% 절감 · 12km 단축」 같은 것을
  //    한 번 적으면 실사에서 반드시 근거를 묻습니다.
  const fake = t.match(/\d+\s*%|\d+\s*km|\d+\s*분\s*(단축|절감)|\d+\s*원\s*(절감|아낌)/g) ?? []
  ok(fake.length === 0, `${where}/${id} — **가짜 절감률·거리·시간 숫자가 없다**`, fake.join(',') || '없음')

  //  ⚠ 「지금 하고 있다」로 읽힐 문구가 없어야 합니다.
  ok(!/최적화하고 있습니다|분석 중입니다|AI가 추천했|AI가 분석했/.test(t),
    `${where}/${id} — 「지금 AI 가 하고 있다」로 읽힐 문구가 없다`)
}


/**
 *  창 닫기 — **「닫기」를 누릅니다.**
 *
 *  ⚠ Esc 로는 안 닫힙니다. 내부 화면의 Modal 에는 Esc 처리가 없습니다
 *    (병원 화면의 창은 Esc 로 닫힙니다 — 두 곳이 다릅니다. 0094 에서 확인해
 *    대표님께 따로 알려 드렸습니다). 검사는 **지금 동작**을 재야 하므로
 *    사람이 실제로 누르는 자리를 누릅니다.
 */
async function closePanel(p, id) {
  await p.locator('[role="dialog"]').getByRole('button', { name: '닫기' }).last().click()
  await p.locator(`[data-ai-panel][data-ai-spec="${id}"]`)
    .waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
}

// ── ① 화면마다 선 단추를 하나씩 눌러 봅니다 ────────────────────────────────
const PLACES = [
  ['/dispatch', '배차·경로', ['route']],
  ['/plan', '일정 편성', ['route', 'plan']],
  ['/collection', '수거 입력', ['photo']],
  ['/requests', '고객 요청', ['requestTriage', 'portalAsk']],
  ['/reports', '운영 리포트', ['reportWrite']],
  ['/import', '엑셀 가져오기', ['excelRead']],
  ['/bank', '통장 대사', ['bankMatch']],
  ['/insight', '거래처 인사이트', ['churn']],
  ['/supplies', '소모품 주문', ['supplyForecast']],
  ['/receivables', '미수금 관리', ['dunning']],
  ['/stats', '통계', ['forecast']],
  ['/revenue', '매출 현황', ['forecast']],
]

const seen = new Set()
for (const [path, name, ids] of PLACES) {
  const { ctx, p, outbound } = await open(path)
  for (const id of ids) {
    const btn = p.locator(`[data-ai-open="${id}"]`)
    ok((await btn.count()) === 1, `${name} — 「${id}」 단추가 있다`, `${await btn.count()}개`)
    if ((await btn.count()) !== 1) continue

    const box = await btn.boundingBox()
    ok((box?.height ?? 0) >= 44, `${name}/${id} — 누르는 자리가 손가락 크기`, `${Math.round(box?.height ?? 0)}px`)

    await btn.click()
    await p.waitForTimeout(700)
    await checkPanel(p, id, name)
    seen.add(id)
    await closePanel(p, id)
  }
  //  ⚠ 아직 연동 전입니다. 이 화면을 열고 단추를 누르는 동안 **한 곳도**
  //    바깥으로 나가면 안 됩니다.
  //  ⚠ **AI 쪽으로** 나간 곳만 셉니다. 글꼴 CDN 과 (흉내 낸) 저희 서버는
  //    원래 나가는 길입니다 — 그것까지 세면 이 검사는 늘 빨강이 되고,
  //    빨강이 늘 켜져 있으면 아무도 안 봅니다.
  const bad = outbound.filter((u) => /tmap|openai|gpt|anthropic|claude|kakao|naver|google.*(maps|generativelanguage)|clova/i.test(u))
  ok(bad.length === 0, `${name} — **AI 쪽으로 한 곳도 안 나갔다**`, bad.slice(0, 2).join(',') || '나간 곳 없음')
  await ctx.close()
}

ok(seen.size === 12, '**열두 자리를 다 눌러 봤다**', `${seen.size}가지`)

// ── ② 실제 업무 단추가 **먼저**입니다 ──────────────────────────────────────
//    아직 안 되는 것이 되는 것보다 앞에 서면, 매일 쓰는 사람이 매일 헷갈립니다.
{
  const { ctx, p } = await open('/requests')
  const real = await p.getByRole('button', { name: /전화 요청 접수/ }).first().boundingBox()
  const ai = await p.locator('[data-ai-open="requestTriage"]').boundingBox()
  ok(real != null && ai != null && real.x < ai.x,
    '고객 요청 — **「전화 요청 접수」가 AI 단추보다 왼쪽에 있다**',
    `실제 x=${Math.round(real?.x ?? 0)} · AI x=${Math.round(ai?.x ?? 0)}`)
  await ctx.close()
}

// ── ③ 활용 계획 화면에 **한 장으로** 모여 있다 ─────────────────────────────
{
  const { ctx, p, outbound } = await open('/roadmap')
  const items = await p.locator('[data-ailist-item]').count()
  ok(items === 12, '활용 계획 — **AI 자리 열두 개가 한 장에 다 있다**', `${items}개`)

  const basis = flat(await p.locator('[data-ailist-basis]').innerText())
  ok(/아직 한 곳도 켜지지 않았습니다/.test(basis),
    '활용 계획 — **한 곳도 안 켜졌다고 먼저 말한다**', basis.slice(0, 50))

  //  목록에서도 눌러서 같은 안내가 열리는지 — 두 자리만 확인합니다.
  for (const id of ['photo', 'churn']) {
    await p.locator(`[data-ailist-item="${id}"]`).click()
    await p.waitForTimeout(700)
    await checkPanel(p, id, '활용 계획')
    await closePanel(p, id)
  }
  const bad = outbound.filter((u) => /tmap|openai|gpt|anthropic|claude|kakao|naver|google.*(maps|generativelanguage)|clova/i.test(u))
  ok(bad.length === 0, '활용 계획 — **AI 쪽으로 한 곳도 안 나갔다**', bad.slice(0, 2).join(',') || '나간 곳 없음')
  await ctx.close()
}

// ── ④ 폰(390px) — 단추가 밖으로 안 나가고, 업무를 밀어내지 않는다 ──────────
{
  const { ctx, p } = await open('/requests', { w: 390 })
  const btn = p.locator('[data-ai-open="requestTriage"]')
  const box = await btn.boundingBox()
  ok(box != null && box.x >= 0 && box.x + box.width <= 391,
    '폰 — AI 단추가 390px 밖으로 안 나간다',
    box ? `${Math.round(box.x)}~${Math.round(box.x + box.width)}` : '없음')
  ok((box?.height ?? 0) >= 44, '폰 — 누르는 자리가 손가락 크기', `${Math.round(box?.height ?? 0)}px`)

  //  ⚠ 요청 목록 첫 줄이 첫 화면 안에 남아 있어야 합니다. AI 단추 때문에
  //    매일 보는 목록이 아래로 밀리면 그건 손해입니다.
  await btn.click()
  await p.waitForTimeout(700)
  const panel = p.locator('[data-ai-panel][data-ai-spec="requestTriage"]')
  ok((await panel.count()) === 1, '폰 — 눌러도 안내가 제대로 열린다')
  const pbox = await panel.boundingBox()
  ok(pbox != null && pbox.x >= 0 && pbox.x + pbox.width <= 391,
    '폰 — 안내 창도 390px 안에 들어온다',
    pbox ? `${Math.round(pbox.x)}~${Math.round(pbox.x + pbox.width)}` : '없음')
  await ctx.close()
}

// ── ⑤ 코드에 **바깥으로 나가는 길이 아예 없다** ────────────────────────────
//     화면에서 안 나가는 것과, 코드에 길이 없는 것은 다른 이야기입니다.
//     지금은 길 자체를 안 냈습니다.
{
  const { readFileSync } = await import('node:fs')
  const files = ['src/lib/aiSpecs.ts', 'src/components/AiAction.tsx', 'src/components/AiSpecList.tsx']
  const hits = []
  //  ⚠ **주석을 걷어내고** 봅니다. 이 파일들의 주석에는 「fetch · axios ·
  //    supabase 호출 없음」이라고 적혀 있습니다 — 그 글자에 검사가 걸리면
  //    「없다고 적어 둔 것」 때문에 실패합니다. 처음에 실제로 그렇게 걸렸습니다.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const f of files) {
    const src = strip(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))
    for (const pat of [/\bfetch\s*\(/, /\baxios\b/, /https?:\/\//, /api[_-]?key/i, /supabase/i]) {
      if (pat.test(src)) hits.push(`${f}:${pat}`)
    }
  }
  ok(hits.length === 0, '**세 파일 어디에도 통신·키·주소가 없다**', hits.join(' · ') || '없음')
}

await b.close()
