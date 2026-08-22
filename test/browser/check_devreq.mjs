import { chromium, EXEC } from './_pw.mjs'

//  개발 요청함 — 현장이 폰으로 보내고, 관리자가 받아 보는 왕복을 확인합니다.
//  서버는 흉내 내되 하나의 공유 상태를 둡니다(실제 서버와 같은 관계).

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const server = { devRequests: [] }
let inserted = null

const b = await chromium.launch({ executablePath: EXEC })

async function open(role, uid, name, mobile) {
  const ctx = await b.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
           : { viewport: { width: 1400, height: 1000 } },
  )
  const profile = {
    id: uid, email: `${role}@beonemirae.test`, name, role, font_scale: 'normal',
    active: true, approved_at: '2026-01-01T00:00:00Z', client_id: null, created_at: '2026-01-01T00:00:00Z',
  }
  await ctx.route('**/rest/v1/**', (r) => {
    const req = r.request()
    const url = req.url()
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const json = (v) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) })

    if (url.includes('/dev_requests')) {
      if (req.method() === 'POST') {
        //  서버가 요청자를 채웁니다(0022). 화면이 보낸 값은 쓰지 않습니다.
        inserted = req.postDataJSON()
        const body = Array.isArray(inserted) ? inserted[0] : inserted
        server.devRequests.unshift({
          id: 'r1', created_at: new Date().toISOString(),
          requester_id: uid, requester_name: name, requester_role: role,
          topics: body.topics ?? [], message: body.message ?? '',
          status: '접수', admin_note: '', handled_at: null,
        })
        return json(server.devRequests.slice(0, 1))
      }
      if (req.method() === 'PATCH') {
        const patch = req.postDataJSON()
        server.devRequests[0] = { ...server.devRequests[0], ...patch }
        return json([server.devRequests[0]])
      }
      //  RLS 를 흉내 냅니다 — 관리자는 전부, 나머지는 자기 것만.
      const rows = role === 'admin' ? server.devRequests : server.devRequests.filter((x) => x.requester_id === uid)
      return json(rows)
    }
    if (url.includes('/profiles')) return json(single ? profile : [profile])
    return json([])
  })
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => window.localStorage.setItem(k, JSON.stringify({
    access_token: 't', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u,
  })), ['beonemirae-ops:auth', { id: uid, aud: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {} }])
  return { ctx, p }
}

// ── 1. 현장 담당자가 폰에서 보냅니다 ────────────────────────────────────────
{
  const { ctx, p } = await open('field', '00000000-0000-0000-0000-0000000000f1', '김기사', true)
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)

  await p.getByRole('button', { name: '더보기' }).first().click()
  await p.waitForTimeout(800)
  const sheet = (await p.textContent('body')) ?? ''
  ok(/개발자에게 요청하기/.test(sheet), '폰 더보기에 「개발자에게 요청하기」가 있음')
  await p.screenshot({ path: `${SHOT}/dev-more.png`, fullPage: true })

  //  시트 안이 스크롤되어 하단 탭바에 가릴 수 있어, 위로 올린 뒤 누릅니다.
  await p.evaluate(() => {
    const el = document.querySelector('[data-dev-request-more]')
    el?.scrollIntoView({ block: 'center' })
  })
  await p.waitForTimeout(400)
  await p.locator('[data-dev-request-more]').first().click({ force: true })
  await p.waitForTimeout(1600)
  //  시트가 닫히면서 모달까지 사라지면 안 됩니다 — 이것이 이번 구조의 핵심입니다.
  const groups = p.locator('[data-dev-group]')
  const topics = p.locator('[data-dev-topic]')
  ok((await groups.count()) === 5, '주제가 5개', `${await groups.count()}개`)
  const perGroup = []
  for (let i = 0; i < (await groups.count()); i++) {
    perGroup.push(await groups.nth(i).locator('[data-dev-topic]').count())
  }
  ok(perGroup.every((n) => n >= 4 && n <= 5), '주제마다 선택지가 4~5개', perGroup.join('·'))
  ok((await topics.count()) === perGroup.reduce((a, b) => a + b, 0), '선택지 총합이 맞음', `${await topics.count()}개`)
  const subjects = await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-dev-group')))
  ok(subjects.includes('오늘 일정') && subjects.includes('수거 입력'), '현장 주제가 나옴', subjects.join(' · '))

  const body = (await p.textContent('body')) ?? ''
  ok(/방문할 곳이 실제와 다릅니다/.test(body), '현장용 선택지가 나옴')
  ok(!/청구 금액이 기존 엑셀과 다릅니다/.test(body), '사무실용 선택지는 섞이지 않음')

  const send = p.getByRole('button', { name: '보내기' })
  ok(await send.isDisabled(), '아무것도 고르지 않으면 보내기가 잠김')

  await topics.nth(0).click()
  await topics.nth(2).click()
  await p.fill('#dev-request-message', '지하 주차장에서 저장이 안 될 때가 있습니다')
  ok(!(await send.isDisabled()), '고르면 보내기가 열림')
  await p.screenshot({ path: `${SHOT}/dev-sheet.png`, fullPage: true })

  await send.click()
  await p.waitForTimeout(1500)
  ok(/요청을 보냈습니다/.test((await p.textContent('body')) ?? ''), '보낸 뒤 확인 화면이 뜸')

  const sent = Array.isArray(inserted) ? inserted[0] : inserted
  ok(sent?.topics?.length === 2, '고른 항목 2개가 전송됨', JSON.stringify(sent?.topics ?? []))
  ok((sent?.topics ?? []).every((t) => t.includes(' › ')), '「주제 › 선택지」 형태로 전송됨')
  ok(!('requester_id' in (sent ?? {})) && !('requester_name' in (sent ?? {})),
    '요청자 정보를 화면에서 보내지 않음 (서버가 채웁니다)', JSON.stringify(Object.keys(sent ?? {})))
  await ctx.close()
}

// ── 2. 관리자가 요청함에서 봅니다 ───────────────────────────────────────────
{
  const { ctx, p } = await open('admin', '00000000-0000-0000-0000-0000000000ad', '대표', false)
  await p.goto(`${BASE}/dev-requests`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)

  const body = (await p.textContent('main')) ?? ''
  ok(/김기사/.test(body), '요청함에 보낸 사람이 보임')
  ok(/현장 담당자/.test(body), '보낸 사람의 역할이 보임')
  ok(/방문할 곳이 실제와 다릅니다/.test(body), '고른 항목이 그대로 보임')
  ok(/오늘 일정/.test(body), '어느 주제인지 함께 보임')
  ok(/지하 주차장에서 저장이 안 될 때가 있습니다/.test(body), '자유 의견이 보임')
  ok(/접수/.test(body), '처음 상태가 접수로 보임')
  await p.screenshot({ path: `${SHOT}/dev-inbox.png`, fullPage: true })

  //  관리자는 상태를 바꿉니다
  await p.locator('[data-dev-request] button', { hasText: '확인' }).first().click()
  await p.waitForTimeout(1500)
  ok(server.devRequests[0].status === '확인', '관리자가 상태를 바꿈', server.devRequests[0].status)

  //  관리자에게도 요청 보내기 버튼이 있고, 항목은 관리자용이어야 합니다
  await p.locator('[data-dev-request-open]').first().click()
  await p.waitForTimeout(900)
  //  모달 안만 봅니다 — 뒤에 깔린 요청함 목록에는 현장이 보낸 항목 글자가 있습니다.
  const modalGroups = await p.locator('[role="dialog"] [data-dev-group]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-dev-group')),
  )
  const modalTopics = await p.locator('[role="dialog"] [data-dev-topic]').allTextContents()
  ok(modalGroups.length === 5, '관리자 요청 화면에도 주제가 5개', `${modalGroups.length}개`)
  ok(modalGroups.includes('대시보드·지표') && modalGroups.includes('외부 연동'),
    '관리자용 주제가 나옴', modalGroups.join(' · '))
  ok(!modalGroups.includes('오늘 일정'), '현장 주제는 섞이지 않음')
  ok(modalTopics.some((t) => /보고 싶은 지표가 빠져 있습니다/.test(t)), '관리자용 선택지가 나옴')
  await ctx.close()
}

// ── 3. 사무실 담당자 — 자기 것만 보이고 요청함은 못 엽니다 ──────────────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '사무실', false)
  await p.goto(`${BASE}/dev-requests`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  ok(/접근 권한이 없는 화면입니다/.test((await p.textContent('body')) ?? ''),
    '사무실 담당자는 요청함 화면을 열 수 없음')

  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const nav = (await p.textContent('aside')) ?? ''
  //  요청 버튼은 **오른쪽 위 한 곳**입니다. 예전에는 왼쪽 목차에도 같은
  //  버튼이 있었는데, 같은 입구를 두 군데 두면 어느 쪽이 진짜인지 헷갈립니다.
  ok(!/개발자에게 요청하기/.test(nav), 'PC 왼쪽 목차에는 요청 버튼을 두지 않음')
  const topRight = await p.locator('main [data-dev-request-open]').count()
  ok(topRight === 1, 'PC 오른쪽 위(「사용 방법」 옆)에 요청 버튼이 있음', `${topRight}개`)
  ok((await p.locator('aside [data-dev-request-open]').count()) === 0, '입구는 한 곳뿐')
  ok(!/개발 요청함/.test(nav), '요청함 메뉴는 사무실 담당자에게 안 보임')

  await p.locator('[data-dev-request-open]').first().click()
  await p.waitForTimeout(900)
  const officeGroups = await p.locator('[role="dialog"] [data-dev-group]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-dev-group')),
  )
  ok(officeGroups.includes('청구·정산') && officeGroups.includes('반복 작업'),
    '사무실 담당자에게는 사무실용 주제가 나옴', officeGroups.join(' · '))
  await ctx.close()
}

await b.close()
console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
