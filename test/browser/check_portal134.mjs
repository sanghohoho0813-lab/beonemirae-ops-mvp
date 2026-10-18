import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  0134 — 병원 포털 UI/UX 1차 고도화
//
//   대표님 브리프: 「이미 구현된 기능을 실제 병원 직원이 매일 사용해도 어색하지
//   않을 정도로 쉽고 세련되고 신뢰감 있게 다듬는다 · 보여주기용 과장이나 가짜
//   기능은 절대 만들지 않는다」
//
//   여기서 재는 것 —
//     ① 첫 화면 5초: 다음 수거 · 큰 단추 둘(긴급수거 · 자재·용기) · 최근 요청 · 최근 수거
//     ② 상태는 병원 말(접수 · 확인 중 · 일정 확정 · 처리 완료)로, 늘 글자로
//     ③ 긴급수거 요청 — 시점 → 내용 → 특이사항, 보내면 「요청이 접수되었습니다」
//     ④ 자재·용기 요청 — 품목 · 수량 · 필요한 시점
//     ⑤ 저장 실패 — 정해진 문장 + 「다시 시도」, 고른 것 그대로
//     ⑥ 아래 메뉴 다섯 — 병원 직원 말, 글자 안 잘림, 44px
//     ⑦ 요청 내역 · 정산·증빙 · 수거 이력(예정된 수거)
//     ⑧ 로그인 · PWA(아이콘 · 이름)
//     ⑨ 지어낸 것 없음 · 내부 말(소모품 · 일정 반영) 없음 · 남의 병원 없음
//     ⑬ 포털 4차 — 회색 바탕 위 흰 카드 · 옅은 그림자 · 카드 안에 카드 없음,
//        모서리 위계(다음 수거 20~24 · 빠른 요청 16~20 · 입력 12~14 · 칩 알약),
//        PC 두 줄(왼쪽 다음 수거 + 최근 요청 · 오른쪽 빠른 요청 + 최근 수거)

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d && !c ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const flat = (t) => (t ?? '').replace(/\s+/g, ' ').trim()
const b = await chromium.launch({ executablePath: EXEC })

const HOSP = F.clients[2]
const OTHER = F.clients[1]
const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString()

/** 기억하는 서버 흉내 — 이 병원 요청 셋 + 남의 병원 요청 하나 */
function makeServer({ fail = 0, seed = true } = {}) {
  const requests = seed
    ? [
        { id: 'r1', client_id: HOSP.id, kind: '소모품', content: '63L 박스 10개', status: '일정 반영', urgent: false,
          source: 'portal', requester_name: '원무과', reply: '다음 수거 때 함께 가져다 드리겠습니다.', desired_date: null,
          created_at: ago(30) },
        { id: 'r2', client_id: HOSP.id, kind: '긴급수거', content: '보관 용량 부족', status: '접수', urgent: true,
          source: 'staff', requester_name: '홍현주', reply: '', desired_date: null, created_at: ago(2) },
        { id: 'r3', client_id: HOSP.id, kind: '추가수거', content: '정기 일정 외 추가 수거', status: '처리 완료', urgent: false,
          source: 'portal', requester_name: '원무과', reply: '수거 완료로 처리되었습니다.', desired_date: null, created_at: ago(200) },
        { id: 'rx', client_id: OTHER.id, kind: '긴급수거', content: '남의병원비밀요청', status: '접수', urgent: true,
          source: 'portal', requester_name: '남', reply: '', desired_date: null, created_at: ago(1) },
      ]
    : []
  //  포털 2차 — 앞으로 7일 줄을 재려고 이 병원 일정 둘을 더 얹습니다:
  //  사흘 뒤 「예정」(칠해져야 함) · 이틀 뒤 「취소된 것」(칠하면 안 됨).
  const kst = (n) => {
    const t = new Date(Date.now() + 9 * 3_600_000)
    t.setUTCDate(t.getUTCDate() + n)
    return t.toISOString().slice(0, 10)
  }
  const base = F.schedules.find((x) => x.client_id === HOSP.id)
  const schedules = [
    ...F.schedules,
    { ...base, id: 'w3', date: kst(3), status: '예정', actual_amount: null, completed_at: null, handover_status: null, scheduled_time: '14:00', canceled_at: null },
    { ...base, id: 'w2', date: kst(2), status: '예정', actual_amount: null, completed_at: null, handover_status: null, scheduled_time: '10:00', canceled_at: '2026-01-01T00:00:00Z' },
  ]
  return { requests, schedules, posts: [], fail, reqs: 0, writes: [] }
}

function wire(ctx, srv, profile) {
  ctx.route('**/auth/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: F.UID, aud: 'authenticated', email: 'a@b.c', app_metadata: {}, user_metadata: {} }),
  }))
  ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request()
    const url = req.url()
    const method = req.method()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const q = new URL(url).searchParams
    const lim = Number(q.get('limit') ?? 0)
    const off = Number(q.get('offset') ?? 0)
    srv.reqs += 1
    const json = (v, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    const page = (rows) => json(lim > 0 ? rows.slice(off, off + lim) : rows)
    if (url.includes('/rpc/app_schema_version')) return json(87)
    if (url.includes('/rpc/')) return json(null)
    if (method !== 'GET') {
      if (url.includes('client_requests') && method === 'POST') {
        const row = JSON.parse(req.postData() ?? '{}')
        srv.posts.push(row)
        if (srv.fail > 0) {
          srv.fail -= 1
          return json({ code: '500', message: 'internal error', details: null, hint: null }, 500)
        }
        const saved = { id: `new-${srv.posts.length}`, status: '접수', reply: '', created_at: new Date().toISOString(), ...row }
        srv.requests.unshift(saved)
        return json(single ? saved : [saved])
      }
      return json(single ? {} : [])
    }
    const named = (rows) => rows.map((x) => ({ ...x, clients: { name: F.clients.find((c) => c.id === x.client_id)?.name ?? '' } }))
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    //  ⚠ 진짜 서버(RLS)처럼 **자기 병원 것만** 줍니다.
    if (url.includes('/client_requests')) return page(named(srv.requests.filter((x) => x.client_id === profile.client_id)))
    if (url.includes('/client_inquiries')) return json([])
    if (url.includes('/site_notes')) return page(F.notes)
    if (url.includes('/schedules')) return page(srv.schedules)
    if (url.includes('/materials')) return page(F.materials)
    if (url.includes('/payment_receipts')) return page(F.receipts)
    if (url.includes('/payments')) return page(F.payments)
    if (url.includes('/vehicles')) return page(F.vehicles)
    if (url.includes('/products')) return json([])
    if (url.includes('/product_orders')) return json([])
    if (url.includes('/clients')) {
      const rows = F.clients.filter((c) => c.id === profile.client_id)
      return single ? json(rows[0] ?? null) : page(rows)
    }
    return json([])
  })
}

async function open(srv, path, { w = 390, scale = 'normal', tourSeen = true } = {}) {
  const profile = { ...W.profileFor('client'), font_scale: scale, client_id: HOSP.id }
  //  ⚠ 병원 담당자의 폰 · PC 는 한국 시각입니다. 「오늘 10:49」 같은 시각 글자가
  //    실제와 같은 조건에서 맞는지 봅니다(검사 기계의 시간대는 UTC).
  const ctx = await b.newContext({ viewport: { width: w, height: w < 700 ? 844 : 950 }, isMobile: w < 700, hasTouch: w < 700, timezoneId: 'Asia/Seoul' })
  wire(ctx, srv, profile)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))
  await p.addInitScript(([k, u, seen]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    if (seen) localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }, tourSeen])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, srv); await p.waitForTimeout(700)
  return { ctx, p, errors }
}

// ── ⑭ 병원 화면에는 내부(AX) 안내가 없다 ──────────────────────────────────────
//    대표님: 「병원 화면에서는 저 AX 알림이 절대 안 보여야 해 — 고객용 화면이잖아」.
//    ⚠ 다른 검사들은 tour-seen 을 미리 넣고 열어서, **처음 들어온 병원**에게 뜨던
//      「비원미래 AX 운영시스템」 띠를 한 번도 못 봤습니다. 여기서는 넣지 않고 엽니다.
for (const [w, path] of [[390, '/portal'], [1440, '/portal'], [390, '/portal/requests'], [390, '/portal/history']]) {
  const srv = makeServer()
  const { ctx, p } = await open(srv, path, { w, tourSeen: false })
  const body = flat(await p.locator('body').innerText())
  ok(!/AX 운영시스템|AX 코치|운영관리 시스템|BUSINESS AX/i.test(body), `${w}px ${path} ⑭ 내부 시스템 이름 · 안내가 없다`, (body.match(/.{0,20}AX.{0,20}/) ?? [''])[0])
  ok((await p.locator('[data-tour-snooze], [data-tour-start]').count()) === 0, `${w}px ${path} ⑭ 처음 들어와도 시작 안내 띠가 뜨지 않는다`)
  await ctx.close()
}

// ── ① 첫 화면 5초 ─────────────────────────────────────────────────────────
for (const w of [390, 412, 360]) {
  const srv = makeServer()
  const { ctx, p, errors } = await open(srv, '/portal', { w })
  const head = flat(await p.locator('header p').first().innerText())
  ok(head.includes(HOSP.name), `${w}px ① 맨 위에 병원 이름`, head)
  const hero = flat(await p.locator('[data-hero-next]').innerText())
  ok(/다음 수거|오늘 수거 예정/.test(hero) && /\d+월 \d+일/.test(hero) && /일정 확정|예상/.test(hero),
    `${w}px ① 다음 수거 날짜와 확정·예상이 한 칸에`, hero.slice(0, 60))
  const navTop = (await p.locator('nav.fixed.bottom-0').boundingBox()).y
  //  ⚠ 포털 3차 **시안 적용**(대표님 승인) — 큰 카드 둘(이름 + 언제 누르는지)이 아이콘 8칸 한 판이 되어
  //    칸에는 **짧은 이름**만 적힙니다. 온전한 이름은 화면 읽기용 이름(aria-label)으로 잽니다.
  //    「언제 누르는지」 글은 누르면 뜨는 요청 창의 첫 줄에 있습니다(RequestSheet · SupplySheet).
  for (const [cta, label, short] of [['urgent', '긴급수거 요청', '긴급수거'], ['supplies', '자재·용기 요청', '자재·용기']]) {
    const el = p.locator(`[data-portal-cta="${cta}"]`)
    const box = await el.boundingBox()
    const t = flat(await el.innerText())
    const name = await el.getAttribute('aria-label')
    ok(t.includes(short) && name === label, `${w}px ① 「${label}」 — 칸에 짧은 이름 · 화면 읽기 이름은 온전히`, `${t} / ${name}`)
    ok(box.y + box.height <= navTop, `${w}px ① 「${label}」이 아래 메뉴에 가리지 않고 첫 화면에`, `${Math.round(box.y + box.height)} > ${Math.round(navTop)}`)
    ok(box.height >= 64, `${w}px ① 「${label}」은 큰 단추 (64px 이상)`, `${Math.round(box.height)}px`)
  }
  //  최근 요청 — 무엇을 · 언제 · 상태 (최신순)
  const rows = await p.locator('[data-portal-requests] [data-req-row]').allInnerTexts()
  ok(rows.length === 3, `${w}px ① 최근 요청 세 줄`, `${rows.length}`)
  //  포털 3차 — 시각은 「오늘 10:49」 · 「어제 14:20」 · 「10월 12일 06:49」
  ok(/긴급수거 요청/.test(rows[0]) && /(오늘|어제|\d+월 \d+일) \d{2}:\d{2}/.test(rows[0]) && /접수/.test(rows[0]),
    `${w}px ① 최근 요청 — 이름 · 날짜시각 · 상태`, flat(rows[0]))
  ok((await p.locator('[data-portal-recent] [data-recent-pickup]').count()) > 0, `${w}px ① 최근 수거가 보인다`)
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over === 0, `${w}px ① 가로로 안 밀린다`, `${over}px`)
  ok(errors.length === 0, `${w}px ① 화면 오류 0`, errors.join(' | '))
  await ctx.close()
}

// ── ② 상태는 병원 말로 · 늘 글자로 ────────────────────────────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal/requests', { w: 390 })
  const main = flat(await p.locator('main').innerText())
  ok(/일정 확정/.test(main), '② 저장값 「일정 반영」이 「일정 확정」으로 보인다')
  ok(!/일정 반영/.test(main), '② 내부 상태값 「일정 반영」을 그대로 적지 않는다')
  ok(!/소모품/.test(await p.content()), '② 「소모품」이 화면 어디에도 없다 (자재·용기 요청)')
  ok(/자재·용기 요청/.test(main) && /긴급수거 요청/.test(main) && /추가수거 요청/.test(main), '② 요청 이름이 병원 말')
  const chips = await p.locator('[data-req-list] [data-status-chip]').allInnerTexts()
  ok(chips.length === 3 && chips.every((c) => /접수|확인 중|일정 확정|처리 완료/.test(c)), '② 요청마다 상태가 **글자로** 있다', chips.join(','))
  //  ⚠ 포털 3차 **시안 적용**(대표님 승인) — 「목록에는 상태 칩만」을 바꿨습니다. 요청 하나 = 카드 하나에
  //    상태 칩 + **4단계 막대**(주문 내역처럼). 막대가 그 요청의 실제 상태와 맞는지 잽니다.
  ok((await p.locator('[data-req-list] [data-step-bar]').count()) === 3, '② 요청 카드마다 4단계 막대가 있다')
  const bar1 = await p.locator('[data-req-open="r1"] [data-step-bar]').getAttribute('aria-label')
  ok(/4단계 중 3단계 일정 확정/.test(bar1 ?? ''), '② 막대가 그 요청의 실제 상태와 맞다 (일정 반영 → 3단계 일정 확정)', bar1)
  ok(/전화 접수/.test(main), '② 전화로 말씀하신 요청도 같이 보인다 (앱만 쓰시라는 화면이 아님)')
  await p.locator('[data-req-open="r1"]').click()
  await p.locator('[data-portal-sheet="request"]').waitFor({ state: 'visible', timeout: 5000 })
  const steps = await p.locator('[data-portal-sheet="request"] [data-status-steps]').getAttribute('aria-label')
  ok(/4단계 중 3단계 일정 확정/.test(steps ?? ''), '② 요청 상세 — 진행 단계를 화면 읽기 프로그램도 읽는다', steps)
  const reply = flat(await p.locator('[data-req-reply="r1"]').innerText())
  ok(/담당자 안내/.test(reply) && /비원미래 회신/.test(reply) && /다음 수거 때 함께 가져다 드리겠습니다/.test(reply), '② 요청 상세 — 비원미래 회신이 「담당자 안내」에', reply)
  ok(new URL(p.url()).searchParams.get('req') === 'r1', '② 상세는 주소에 남는다 (새로고침해도 그대로)', p.url())
  await p.locator('[data-req-detail-close]').click(); await p.waitForTimeout(900)
  ok((await p.locator('[data-portal-sheet="request"]').count()) === 0 && new URL(p.url()).pathname === '/portal/requests', '② 닫으면 보던 목록 그 자리',
    `${await p.locator('[data-portal-sheet="request"]').count()} · ${p.url()}`)
  ok(!/남의병원비밀요청/.test(main) && !main.includes(OTHER.name), '② 남의 병원 요청은 안 보인다')
  //  거르기 — 진행 중 / 처리 완료
  await p.locator('[data-req-filter="done"]').click(); await p.waitForTimeout(300)
  ok((await p.locator('[data-req-list] [data-req-row]').count()) === 1, '② 「처리 완료」만 거르기')
  await p.locator('[data-req-filter="open"]').click(); await p.waitForTimeout(300)
  ok((await p.locator('[data-req-list] [data-req-row]').count()) === 2, '② 「진행 중」만 거르기')
  await ctx.close()
}

// ── ② 빈 상태 — 조용히 한 줄 ─────────────────────────────────────────────
{
  const srv = makeServer({ seed: false })
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  const t = flat(await p.locator('[data-portal-requests]').innerText())
  ok(/최근 요청이 없습니다\./.test(t), '② 요청이 없으면 「최근 요청이 없습니다.」', t)
  await p.goto(`${W.BASE}/portal/requests`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(500)
  ok(/아직 요청하신 내역이 없습니다/.test(flat(await p.locator('main').innerText())), '② 요청 내역도 빈 상태를 말한다')
  await ctx.close()
}

// ── ③ 긴급수거 요청 — 30초 안에 ───────────────────────────────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  const t0 = Date.now()
  await p.locator('[data-portal-cta="urgent"]').click()
  await p.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 5000 })
  const titles = (await p.locator('[data-portal-sheet="urgent"] [data-sheet-step] h3').allInnerTexts()).map(flat)
  ok(titles[0] === '원하는 수거 시점' && titles[1] === '요청 내용' && titles[2] === '특이사항',
    '③ 시점 → 내용 → 특이사항 순서', titles.join(' → '))
  const sheetText = flat(await p.locator('[data-portal-sheet="urgent"]').innerText())
  ok(!/담당자 이름|병원명을 입력|연락처를 입력/.test(sheetText), '③ 병원명·담당자를 다시 묻지 않는다')
  ok((await p.locator('[data-portal-sheet="urgent"] [data-sheet-hero]').evaluate((el) => getComputedStyle(el).display)) === 'none',
    '③ 폰에서는 창 머리 사진이 없다 (고를 것이 먼저)')
  await p.locator('[data-choice="day"] [data-choice-item="asap"]').click()
  await p.locator('[data-choice="reason"] [data-choice-item]').nth(2).click()
  await p.locator('[data-req-memo]').fill('후문으로 와 주세요')
  await p.locator('[data-req-send]').click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(Date.now() - t0 < 30000, '③ 30초 안에 끝난다', `${Date.now() - t0}ms`)
  const sent = srv.posts[0] ?? {}
  ok(sent.kind === '긴급수거' && sent.urgent === true && sent.client_id === HOSP.id, '③ 긴급수거로 그 병원 것이 나갔다', JSON.stringify(sent).slice(0, 120))
  ok(/후문으로 와 주세요/.test(sent.content ?? '') && /가능한 빠르게|가장 빠르게/.test(sent.content ?? ''), '③ 고른 것·적은 것이 글에 그대로', sent.content)
  ok(!('desired_date' in sent) || sent.desired_date == null, '③ 「가능한 가장 빠르게」는 날짜를 지어내지 않는다', String(sent.desired_date))
  const done = flat(await p.locator('[data-sheet-done]').innerText())
  ok(/요청이 접수되었습니다/.test(done) && /비원미래에서 확인 후 처리 상태를 안내드립니다/.test(done), '③ 「요청이 접수되었습니다」 + 다음 안내', done.slice(0, 80))
  ok(/원하는 시점 · 가능한 가장 빠르게/.test(done) && /특이사항 · 후문으로 와 주세요/.test(done), '③ 무엇이 접수됐는지 그 자리에서', done)
  //  포털 3차 — 큰 단추는 「확인」(창 닫기), 작은 단추가 「요청 내역 보기」
  const btns = (await p.locator('[data-portal-sheet="urgent"] [data-done-primary], [data-portal-sheet="urgent"] [data-done-secondary]').allInnerTexts()).map(flat)
  ok(btns.join(',') === '확인,요청 내역 보기', '③ 다음 — 확인 · 요청 내역 보기', btns.join(','))
  for (const sel of ['[data-done-primary]', '[data-done-secondary]']) {
    const bx = await p.locator(sel).boundingBox()
    ok(bx.height >= 44 && bx.y + bx.height <= 844, `③ ${sel} 44px 이상 · 화면 안`, `${Math.round(bx.height)} · ${Math.round(bx.y + bx.height)}`)
  }
  await p.locator('[data-done-primary]').click(); await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/portal', '③ 「확인」 → 홈 그대로', p.url())
  ok((await p.locator('[data-portal-sheet]').count()) === 0, '③ 「확인」을 누르면 창이 닫힌다')
  const first = flat(await p.locator('[data-portal-requests] [data-req-row]').first().innerText())
  ok(/긴급수거 요청/.test(first) && /오늘 \d{2}:\d{2}/.test(first) && /접수/.test(first), '③ 방금 보낸 요청이 홈 「최근 요청」 맨 위에', first)
  const reqTop = await p.locator('[data-portal-requests]').evaluate((el) => Math.round(el.getBoundingClientRect().top))
  ok(reqTop >= 0 && reqTop < 400, '③ 「확인」 뒤 「최근 요청」이 화면에 보인다', `${reqTop}px`)
  await ctx.close()
}

// ── ④ 자재·용기 요청 — 품목 · 수량 · 필요한 시점 ──────────────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal?do=supply', { w: 390 })
  const titles = (await p.locator('[data-portal-sheet="supply"] [data-sheet-step] h3').allInnerTexts()).map(flat)
  ok(titles[0] === '필요한 품목과 수량' && titles.includes('언제 필요하신가요?'), '④ 품목·수량 → 필요한 시점', titles.join(' → '))
  ok((await p.locator('[data-portal-sheet="supply"] h2').innerText()).includes('자재·용기 요청'), '④ 창 이름이 홈 단추와 같다')
  await p.locator('[data-spec-quick="box63:10"]').click()
  await p.locator('[data-choice="need"] [data-choice-item="soon"]').click()
  await p.locator('[data-supply-send]').click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 })
  const sent = srv.posts[0] ?? {}
  ok(sent.kind === '소모품' && /63L 박스 10개/.test(sent.content ?? ''), '④ 서버 값(소모품)·품목·수량 그대로', sent.content)
  ok(/다음 방문 전에 필요/.test(sent.content ?? '') && sent.desired_date == null, '④ 「그 전에 필요」는 글로 남고 희망일을 다음 방문일로 안 적는다', `${sent.content} · ${sent.desired_date}`)
  const done = flat(await p.locator('[data-sheet-done]').innerText())
  ok(/요청이 접수되었습니다/.test(done) && /63L 박스 10개/.test(done) && /필요한 시점 · 다음 방문 전에 필요/.test(done), '④ 접수 화면에 품목·수량·시점', done)
  await p.locator('[data-done-secondary]').click(); await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === '/portal/requests' && (await p.locator('[data-portal-sheet]').count()) === 0, '④ 「요청 내역 보기」 → 창 닫히고 요청 내역')
  ok(/63L 박스 10개/.test(flat(await p.locator('[data-req-list]').innerText())), '④ 방금 보낸 요청이 요청 내역 맨 위에 (보낸 내용 첫 줄까지)')
  await ctx.close()
}

// ── ⑤ 저장 실패 — 정해진 문장 + 다시 시도 ─────────────────────────────────
{
  const srv = makeServer({ fail: 1 })
  const { ctx, p } = await open(srv, '/portal?do=urgent', { w: 390 })
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.locator('[data-req-send]').click()
  await p.locator('[data-req-error]').waitFor({ state: 'visible', timeout: 8000 })
  const err = flat(await p.locator('[data-req-error]').innerText())
  ok(/요청을 저장하지 못했습니다\. 잠시 후 다시 시도해주세요\./.test(err), '⑤ 「요청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.」', err)
  ok(/고르신 것은 그대로 있습니다/.test(err), '⑤ 고른 것이 그대로라고 알려 준다')
  ok((await p.locator('[data-choice="reason"] [data-picked]').count()) === 1, '⑤ 실제로 고른 것이 남아 있다')
  ok((await p.locator('[data-sheet-done]').count()) === 0, '⑤ 실패했는데 「접수되었습니다」를 띄우지 않는다')
  const retry = p.locator('[data-req-error] [data-save-retry]')
  const rb = await retry.boundingBox()
  ok(rb.height >= 44, '⑤ 「다시 시도」 44px 이상', `${Math.round(rb.height)}`)
  await retry.click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  ok(srv.posts.length === 2 && srv.posts[0].request_id === srv.posts[1].request_id, '⑤ 다시 시도는 같은 표로 (두 건이 안 생김)')
  ok((await p.locator('[data-sheet-done]').count()) === 1, '⑤ 다시 시도하면 접수된다')
  await ctx.close()
}

// ── ⑥ 아래 메뉴 다섯 ─────────────────────────────────────────────────────
for (const [w, scale] of [[360, 'normal'], [390, 'normal'], [390, 'xl'], [412, 'lg']]) {
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w, scale })
  const tabs = await p.locator('nav.fixed.bottom-0 a').evaluateAll((els) => els.map((a) => {
    const label = a.querySelector('span:last-child')
    const r = a.getBoundingClientRect()
    return { t: (label?.textContent ?? '').trim(), clip: label ? label.scrollWidth > label.clientWidth + 1 || label.getBoundingClientRect().right > r.right + 1 : true, h: r.height, w: r.width }
  }))
  ok(tabs.map((x) => x.t).join(',') === '홈,요청 내역,수거 이력,정산·증빙,고객지원', `${w}px·${scale} ⑥ 메뉴 다섯 — 병원 직원 말`, tabs.map((x) => x.t).join(','))
  ok(tabs.every((x) => !x.clip), `${w}px·${scale} ⑥ 메뉴 글자가 안 잘린다`, JSON.stringify(tabs.filter((x) => x.clip)))
  ok(tabs.every((x) => x.h >= 44 && x.w >= 44), `${w}px·${scale} ⑥ 메뉴 칸 44px 이상`)
  const hh = (await p.locator('header').boundingBox()).height
  ok(hh <= 140, `${w}px·${scale} ⑥ 머리띠가 화면을 먹지 않는다`, `${Math.round(hh)}px`)
  await ctx.close()
}

// ── ⑦ 메뉴 화면 — 요청 내역 · 수거 이력 · 정산·증빙 ────────────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  await p.locator('nav.fixed.bottom-0 a:has-text("수거 이력")').click(); await p.waitForTimeout(900)
  const hist = flat(await p.locator('main').innerText())
  ok(new URL(p.url()).pathname === '/portal/history' && /수거 이력/.test(hist), '⑦ 수거 이력 화면')
  if ((await p.locator('[data-hist-upcoming]').count()) > 0) {
    ok(/일정 확정/.test(flat(await p.locator('[data-hist-upcoming]').innerText())), '⑦ 예정된 수거는 등록된 일정만 (일정 확정)')
  }
  await p.locator('nav.fixed.bottom-0 a:has-text("정산·증빙")').click(); await p.waitForTimeout(900)
  const bill = flat(await p.locator('main').innerText())
  ok(new URL(p.url()).pathname === '/portal/billing' && /정산 내역/.test(bill) && /증빙자료/.test(bill), '⑦ 정산·증빙 — 정산 내역과 증빙자료가 한 화면')
  ok(/결제하실 수 없습니다/.test(bill) && !/결제하기|카드 결제|지금 결제/.test(bill), '⑦ 없는 결제 단추를 만들지 않았다')
  ok(/아직 준비되지 않은 자료/.test(bill) && !/다운로드|내려받기/.test(bill), '⑦ 아직 없는 자료는 없다고 적는다')
  await p.locator('[data-pb-doc="report"]').click(); await p.waitForTimeout(900)
  ok((await p.locator('[data-portal-sheet="report"] [data-portal-insight]').count()) === 1, '⑦ 증빙 → 월간 배출 리포트(배출 분석 포함)')
  await ctx.close()
}

// ── ⑨ 지어낸 것 · 내부 말 · 장식 움직임 없음 (홈) ───────────────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 1440 })
  const html = await p.content()
  const body = flat(await p.locator('body').innerText())
  ok(!/소모품/.test(html), '⑨ 「소모품」이 없다')
  ok(!/일정 반영/.test(flat(await p.locator('main').innerText())), '⑨ 「일정 반영」이 본문에 없다')
  ok(!/무사고|\d+일째|BWM-\d|AI 분석|AI 추천|MVP|운영관리 시스템/.test(body), '⑨ 지어낸 숫자·과장·개발 용어가 없다')
  ok(!/원가|매입|마진|영업이익|손익|처리비|소각비|수익률/.test(body), '⑨ 내부 돈 이야기가 없다')
  ok(!body.includes(OTHER.name), '⑨ 남의 병원 이름이 없다')
  const tools = await p.locator('header > div').first().locator('button:visible, a:visible').count()
  ok(tools <= 7, '⑨ PC 머리띠 단추가 줄었다 (예전 아홉)', `${tools}개`)
  //  알림 — 저장값을 그대로 적지 않는다
  await p.locator('header [aria-label*="알림"]').first().click(); await p.waitForTimeout(500)
  const notes = flat(await p.locator('[data-portal-notices]').innerText().catch(() => ''))
  ok(!/소모품/.test(notes), '⑨ 알림에도 「소모품」이 없다', notes.slice(0, 80))
  await ctx.close()
}

// ── ⑧ 로그인 · PWA ────────────────────────────────────────────────────────
for (const w of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700 })
  const p = await ctx.newPage()
  await p.goto(`${W.BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.locator('#login-email').waitFor({ state: 'visible', timeout: 10000 })
  const t = flat(await p.locator('body').innerText())
  ok(/병원 고객 포털/.test(t) && /의료폐기물 수거 일정과 요청을 간편하게 관리하세요\./.test(t), `${w}px ⑧ 로그인 — 「병원 고객 포털」 + 한 줄 설명`)
  ok(/이메일/.test(t) && /비밀번호/.test(t) && /비밀번호를 잊으셨나요\?/.test(t), `${w}px ⑧ 이메일 · 비밀번호 · 비밀번호 찾기`)
  ok(!/운영관리 시스템|BUSINESS AX|VITE_|저장되지 않습니다/.test(t), `${w}px ⑧ 개발 용어 · 사실과 다른 문구가 없다`)
  ok(/직원도 이 화면에서 로그인/.test(t), `${w}px ⑧ 직원도 같은 화면이라고 적혀 있다`)
  const btn = await p.getByRole('button', { name: '로그인' }).boundingBox()
  ok(btn.height >= 44, `${w}px ⑧ 로그인 단추 44px 이상`)
  await ctx.close()
}
{
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  const man = await (await p.request.get(`${W.BASE}/manifest.webmanifest`)).json()
  ok(man.short_name === '비원미래' && /고객 포털/.test(man.name) && !/MVP|운영관리/.test(JSON.stringify(man)), '⑧ 앱 이름 — 홈 화면 「비원미래」', `${man.name} / ${man.short_name}`)
  const pngs = man.icons.filter((i) => i.type === 'image/png')
  ok(pngs.some((i) => i.sizes === '192x192') && pngs.some((i) => i.sizes === '512x512') && pngs.some((i) => i.purpose === 'maskable'), '⑧ PNG 아이콘 192 · 512 · maskable')
  for (const i of pngs) {
    const r = await p.request.get(`${W.BASE}${i.src}`)
    ok(r.status() === 200 && (r.headers()['content-type'] ?? '').includes('png'), `⑧ ${i.src} 실제로 있다`)
  }
  await p.goto(`${W.BASE}/login`, { waitUntil: 'domcontentloaded' })
  const apple = await p.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  ok(/\.png$/.test(apple ?? ''), '⑧ 아이폰 홈 화면 아이콘이 PNG (SVG 는 아이폰이 못 씀)', apple)
  const ar = await p.request.get(`${W.BASE}${apple}`)
  ok(ar.status() === 200, '⑧ 아이폰 아이콘 파일이 실제로 있다')
  ok((await p.locator('meta[name="theme-color"]').getAttribute('content')) === man.theme_color, '⑧ 테마 색이 manifest 와 같다')
  await ctx.close()
}

// ── ⑩ 포털 4차 — 첫 화면은 파란 머리 + 그 위에 겹친 흰 「다음 수거」 카드 ──────────
//    대표님이 고르신 2차 시안(흔한 생활 앱 첫 화면). 3차의 「밝은 머리띠 · 짙은 다음 수거」를
//    바꿨습니다. 다른 화면의 머리띠는 그대로 흰색입니다(아래에서 함께 잽니다).
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  const lum = (rgb) => {
    const [r, g, bl] = (rgb.match(/\d+/g) ?? []).map(Number)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const headBg = await p.locator('header').evaluate((el) => getComputedStyle(el).backgroundColor)
  const heroBg = await p.locator('[data-portal-hero]').evaluate((el) => getComputedStyle(el).backgroundColor)
  const blue = (rgb) => {
    const [r, g, bl] = (rgb.match(/\d+/g) ?? []).map(Number)
    return bl > 180 && bl > r + 80 && bl > g + 40
  }
  ok(blue(headBg), '⑩ 첫 화면 머리띠는 브랜드 파랑', headBg)
  ok(lum(heroBg) > 240, '⑩ 「다음 수거」는 흰 카드', heroBg)
  const band = await p.locator('[data-portal-band]').boundingBox()
  const heroBox = await p.locator('[data-portal-hero]').boundingBox()
  ok(band && heroBox && heroBox.y < band.y + band.height - 8, '⑩ 「다음 수거」 카드가 파란 띠 위에 겹쳐 올라앉는다', `${Math.round(heroBox?.y ?? 0)} / ${Math.round((band?.y ?? 0) + (band?.height ?? 0))}`)
  await p.goto(`${W.BASE}/portal/requests`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(400)
  const subHead = await p.locator('header').evaluate((el) => getComputedStyle(el).backgroundColor)
  ok(lum(subHead) > 240 && (await p.locator('[data-portal-band]').count()) === 0, '⑩ 다른 화면의 머리띠는 흰색 · 파란 띠 없음', subHead)
  await p.goto(`${W.BASE}/portal`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(400)
  //  포털 3차 — 「다음 수거」 칸에는 날짜 하나만 크게. 작은 메뉴 · 7일 줄이 없다.
  ok((await p.locator('[data-week-day]').count()) === 0, '⑩ 「다음 수거」 칸에 7일 줄 · 작은 정보가 겹치지 않는다')
  ok((await p.locator('[data-portal-hero] button, [data-portal-hero] a').count()) === 0, '⑩ 「다음 수거」 칸에 작은 단추가 없다')
  //  최근 요청 — 포털 3차 시안 적용: 요청 카드(상태 칩 + 4단계 막대 + 회신). 예전 「막대 없음」 규칙을 바꿨습니다.
  ok((await p.locator('[data-portal-requests] [data-step-bar]').count()) === (await p.locator('[data-portal-requests] [data-status-chip]').count()), '⑩ 최근 요청 카드마다 4단계 막대 하나')
  ok((await p.locator('[data-portal-requests] [data-status-chip]').count()) === 3, '⑩ 최근 요청마다 상태 칩 하나')
  //  도움 · 설정 — 화면마다 깔리던 네 줄은 「내 정보」 안으로
  ok((await p.locator('[data-portal-utility]').count()) === 0, '⑩ 화면 아래 「도움·설정」 줄이 없다 (내 정보 안으로)')
  await p.locator('[data-portal-more]').click()
  await p.locator('[data-portal-more-panel]').waitFor({ state: 'visible', timeout: 3000 })
  const menu = await p.locator('[data-portal-more-panel] a:visible, [data-portal-more-panel] button:visible').evaluateAll((els) =>
    els.map((e) => ({ t: (e.textContent ?? '').replace(/\s+/g, ' ').trim(), h: Math.round(e.getBoundingClientRect().height) })))
  const has = (re) => menu.some((m) => re.test(m.t))
  ok(has(/전화 상담/) && has(/사용 방법/) && has(/글자 크기/) && has(/화면 색/) && has(/PC 화면/) && has(/로그아웃/),
    '⑩ 내 정보 — 전화 상담 · 사용 방법 · 글자 크기 · 화면 색 · PC 화면 · 로그아웃', menu.map((m) => m.t).join(' | '))
  ok(menu.every((m) => m.h >= 44), '⑩ 내 정보 — 줄마다 44px 이상', menu.map((m) => m.h).join(','))
  await ctx.close()
}

// ── ⑪ 포털 2차 — 창: 고른 단계는 체크 · 접수 뒤 진행 단계 · 맨 위부터 ──────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal?do=urgent', { w: 390 })
  ok((await p.locator('[data-portal-sheet="urgent"] [data-step-done]').count()) === 0, '⑪ 처음에는 체크된 단계가 없다')
  await p.locator('[data-choice="day"] [data-choice-item="asap"]').click()
  ok((await p.locator('[data-sheet-step="1"][data-step-done]').count()) === 1, '⑪ 시점을 고르면 1단계가 체크로 바뀐다')
  //  맨 아래 칸까지 내려가서 고르고 보낸다 — 접수 화면은 맨 위부터 보여야 한다
  await p.locator('[data-choice="amount"] [data-choice-item]').first().scrollIntoViewIfNeeded()
  await p.locator('[data-choice="amount"] [data-choice-item]').first().click()
  await p.locator('[data-choice="reason"] [data-choice-item]').first().click()
  await p.locator('[data-req-send]').click()
  await p.locator('[data-sheet-done]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(400)
  const top = await p.locator('[data-sheet-done]').evaluate((el) => {
    const box = el.parentElement.getBoundingClientRect()
    return Math.round(el.getBoundingClientRect().top - box.top)
  })
  ok(top < 40, '⑪ 접수 화면은 맨 위부터 보인다 (체크 표시가 잘리지 않음)', `${top}px`)
  const steps = await p.locator('[data-done-steps] [data-status-steps]').getAttribute('aria-label')
  ok(/4단계 중 1단계 접수/.test(steps ?? ''), '⑪ 다음에 무슨 일이 일어나는지 — 지금은 「접수」', steps)
  await ctx.close()
}

// ── ⑫ 포털 2차 — 수거 이력 달 묶음 · 정산 요약 · 고객지원 대화 ─────────────────
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal/history', { w: 390 })
  const groups = await p.locator('[data-hist-month]').evaluateAll((els) => els.map((h) => {
    const n = h.nextElementSibling?.querySelectorAll('[data-portal-hist-card]').length ?? 0
    const said = Number((h.textContent ?? '').match(/(\d+)회/)?.[1] ?? -1)
    return { n, said }
  }))
  ok(groups.length > 0 && groups.every((g) => g.n === g.said), '⑫ 달 머리의 「N회」 = 그 달 아래 기록 수', JSON.stringify(groups))
  await p.goto(`${W.BASE}/portal/billing`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(500)
  if ((await p.locator('[data-pb-summary]').count()) > 0) {
    const sum = flat(await p.locator('[data-pb-summary]').innerText())
    ok(/아직 안 내신 금액|미납 없음/.test(sum), '⑫ 정산 — 「낼 돈이 남았나」를 맨 위에 글자로', sum.slice(0, 60))
  }
  await p.goto(`${W.BASE}/portal/support`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(500)
  ok((await p.locator('main img').count()) === 0, '⑫ 고객지원에 장식 사진이 없다')
  ok((await p.locator('[data-support-call]').getAttribute('href'))?.startsWith('tel:'), '⑫ 고객지원 맨 위에 바로 전화 걸기')
  await ctx.close()
}

// ── ⑬ 포털 4차 — 회색 바탕 위 흰 카드 · 옅은 그림자 · 카드 안에 카드 없음 ──────────
//    대표님이 고르신 2차 시안(흔한 생활 앱)은 회색 바탕 위에 흰 둥근 카드를 놓습니다.
//    3차의 「면은 셋 이하 · 그림자 0」 대신 지킬 것:
//     · 그림자는 옅게 — 바깥 그림자의 투명도 0.15 이하 (떠 있는 창 · 아래 메뉴는 제외)
//     · 카드(.p-card) 안에 또 카드를 넣지 않는다 — 상자가 겹치면 다시 「대시보드」가 됩니다
//     · 바탕은 회색(흰 카드와 구분되는 색)
{
  for (const w of [390, 1440]) {
    for (const [name, path] of [['home', '/portal'], ['requests', '/portal/requests'], ['history', '/portal/history'], ['billing', '/portal/billing'], ['support', '/portal/support']]) {
      const srv = makeServer()
      const { ctx, p } = await open(srv, path, { w })
      const m = await p.evaluate(() => {
        const heavy = []
        for (const el of document.querySelectorAll('main *')) {
          const sh = getComputedStyle(el).boxShadow
          if (!sh || sh === 'none') continue
          for (const one of sh.split(/,(?![^()]*\))/)) {
            if (/inset/.test(one)) continue
            const a = one.match(/rgba\([^)]*,\s*([\d.]+)\)/)
            const alpha = a ? Number(a[1]) : 1
            //  x · y · 흐림 중 하나라도 0 이 아니어야 「그림자」입니다. 넓이(spread)만 있는 것은
            //  테두리 고리(ring) — 그림자가 아닙니다.
            const nums = (one.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
            if (nums.slice(0, 3).some((n) => n !== 0) && alpha > 0.15) heavy.push(`${el.tagName}.${String(el.className).slice(0, 30)} ${alpha}`)
          }
        }
        const nested = [...document.querySelectorAll('main .p-card .p-card')].map((el) => String(el.className).slice(0, 40))
        const bg = getComputedStyle(document.querySelector('[data-portal-app]')).backgroundColor
        return { heavy, nested, bg }
      })
      ok(m.heavy.length === 0, `${w}px ⑬ ${name} — 그림자는 옅게 (투명도 0.15 이하)`, m.heavy.join(' | '))
      ok(m.nested.length === 0, `${w}px ⑬ ${name} — 카드 안에 카드가 없다`, m.nested.join(' | '))
      ok(m.bg !== 'rgb(255, 255, 255)' && m.bg !== 'rgba(0, 0, 0, 0)', `${w}px ⑬ ${name} — 바탕은 회색 (흰 카드와 구분)`, m.bg)
      await ctx.close()
    }
  }
}
{
  //  모서리 위계
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  const rad = (sel) => p.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
  const hero = await rad('[data-portal-hero]')
  const tile = await rad('[data-portal-cta="urgent"]')
  ok(hero >= 20 && hero <= 24, '⑬ 「다음 수거」 모서리 20~24px', `${hero}`)
  ok(tile >= 16 && tile <= 20, '⑬ 빠른 요청 모서리 16~20px', `${tile}`)
  const chip = await p.locator('[data-portal-requests] [data-status-chip]').first().evaluate((el) => {
    const r = el.getBoundingClientRect(); return parseFloat(getComputedStyle(el).borderTopLeftRadius) >= r.height / 2 - 1
  })
  ok(chip, '⑬ 상태 칩은 알약 모양')
  await p.locator('[data-portal-cta="urgent"]').click()
  await p.locator('[data-portal-sheet="urgent"]').waitFor({ state: 'visible', timeout: 5000 })
  const memo = await rad('[data-req-memo]')
  const choice = await rad('[data-choice="day"] [data-choice-item]')
  ok(memo >= 12 && memo <= 14 && choice >= 12 && choice <= 14, '⑬ 입력 · 고르는 칸 모서리 12~14px', `${memo} · ${choice}`)
  //  같은 상태 = 같은 색 — 홈과 요청 내역의 「처리 완료」 칩
  await ctx.close()
}
{
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 390 })
  const bg = (sel) => p.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const homeDone = await bg('[data-portal-requests] [data-status-chip="처리 완료"]')
  await p.goto(`${W.BASE}/portal/requests`, { waitUntil: 'domcontentloaded' }); await W.settle(p, srv); await p.waitForTimeout(500)
  const listDone = await bg('[data-req-list] [data-status-chip="처리 완료"]')
  ok(homeDone === listDone, '⑬ 같은 상태는 어느 화면에서나 같은 색', `${homeDone} / ${listDone}`)
  await ctx.close()
}
{
  //  PC — 왼쪽 다음 수거 + 최근 요청 · 오른쪽 빠른 요청 + 최근 수거 (관리자 대시보드 아님)
  const srv = makeServer()
  const { ctx, p } = await open(srv, '/portal', { w: 1440 })
  const bx = async (sel) => p.locator(sel).first().boundingBox()
  const hero = await bx('[data-portal-hero]'), act = await bx('[data-portal-actions]')
  const req = await bx('[data-portal-requests]'), rec = await bx('[data-portal-recent]')
  ok(hero.x < act.x && Math.abs(hero.y - act.y) < 4, '⑬ PC — 다음 수거(왼쪽) · 빠른 요청(오른쪽) 한 줄', `${Math.round(hero.x)},${Math.round(hero.y)} / ${Math.round(act.x)},${Math.round(act.y)}`)
  ok(req.x < rec.x && Math.abs(req.y - rec.y) < 4, '⑬ PC — 최근 요청(왼쪽) · 최근 수거(오른쪽) 한 줄')
  ok(Math.abs(hero.x - req.x) < 2 && Math.abs(act.x - rec.x) < 2, '⑬ PC — 위아래 칸이 같은 세로선에')
  await ctx.close()
  //  폰 — 다음 수거 → 빠른 요청 → 최근 요청 → 최근 수거
  const srv2 = makeServer()
  const o2 = await open(srv2, '/portal', { w: 390 })
  const ys = []
  for (const sel of ['[data-portal-hero]', '[data-portal-actions]', '[data-portal-requests]', '[data-portal-recent]']) ys.push((await o2.p.locator(sel).first().boundingBox()).y)
  ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), '⑬ 폰 — 다음 수거 → 빠른 요청 → 최근 요청 → 최근 수거', ys.map(Math.round).join(' → '))
  await o2.ctx.close()
}

await b.close()
