import { chromium, EXEC } from './_pw.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  사용자 피드백 v2 — 눌러서 끝내는 설문 (0100)
//
//  지키는 것:
//   ① 관점(운영·관리 / 현장·실무)이 갈리고, 각자 다른 것을 묻는다
//   ② 실제로 얼마나 써 봤는지를 **함께** 받는다 — 없으면 다음으로 못 간다
//   ③ 모든 문항에 「아직 판단하기 어려워요」가 있다
//   ④ 자유 의견은 **끝까지 선택** — 한 글자도 안 쓰고 낼 수 있다
//   ⑤ 이전으로 갔다 와도 고른 답이 남는다
//   ⑥ 두 번 눌러도 한 건만 간다
//   ⑦ 저장되는 줄에 **문항 번호**가 들어간다 (나중에 비교하려고)
//   ⑧ 보내는 사람 정보는 화면에서 싣지 않는다 (서버가 채웁니다)
//   ⑨ 안쪽 분류(EFFICIENCY…)는 답하는 분 화면에 절대 안 보인다
//   ⑩ 관리자 화면에서 관점별로 나뉘고, 사람 수가 늘 함께 보인다
//   ⑪ 예전(v1) 답변이 그대로 남아 보인다
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:4173'
const SHOT = (process.env.TEST_OUT ?? '/tmp')

let pass = 0
let fail = 0
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d && !c ? ` — ${d}` : ''}`)
  if (c) pass += 1
  else { fail += 1; process.exitCode = 1 }
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

//  ── 서버 흉내 — 하나의 공유 상태 (실제 서버와 같은 관계) ──────────────────
const server = { rows: [], posts: [], failNext: false }

const b = await chromium.launch({ executablePath: EXEC })

async function open(role, uid, name, { w = 1400, path = '/today' } = {}) {
  const mobile = w < 700
  const ctx = await b.newContext(
    mobile ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true }
           : { viewport: { width: w, height: 1000 } },
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
        const body0 = req.postDataJSON()
        const body = Array.isArray(body0) ? body0[0] : body0
        server.posts.push(body)
        if (server.failNext) {
          server.failNext = false
          return r.fulfill({ status: 500, contentType: 'application/json',
            body: JSON.stringify({ message: '일시적인 서버 오류' }) })
        }
        server.rows.unshift({
          id: `r${server.rows.length + 1}`, created_at: new Date().toISOString(),
          requester_id: uid, requester_name: name, requester_role: role,
          topics: body.topics ?? [], message: body.message ?? '',
          status: '접수', admin_note: '', handled_at: null,
        })
        return json(server.rows.slice(0, 1))
      }
      if (req.method() === 'PATCH') {
        server.rows[0] = { ...server.rows[0], ...req.postDataJSON() }
        return json([server.rows[0]])
      }
      const rows = role === 'admin' ? server.rows : server.rows.filter((x) => x.requester_id === uid)
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
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2500)
  return { ctx, p }
}

/** 설문 창을 엽니다 (오른쪽 위 단추 — 폰은 더보기 안) */
async function openSheet(p, mobile) {
  if (mobile) {
    await p.getByRole('button', { name: '더보기' }).first().click()
    await p.waitForTimeout(700)
    await p.evaluate(() => document.querySelector('[data-dev-request-more]')?.scrollIntoView({ block: 'center' }))
    await p.locator('[data-dev-request-more]').first().click({ force: true })
  } else {
    await p.locator('main [data-dev-request-open]').first().click()
  }
  await p.locator('[data-fb-group="management"]').waitFor({ state: 'visible', timeout: 8000 })
}

/** 지금 단계의 문항을 전부 고릅니다 — value 는 1~5 또는 'na' */
async function answerAll(p, value) {
  const ids = await p.locator('[data-fb-question]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-fb-question')))
  for (const id of ids) await p.locator(`[data-fb-choice="${id}:${value}"]`).click()
  return ids
}

// ── 1. 운영·관리 관점 — 4단계, 자유 의견 비우고 제출 ────────────────────────
{
  const { ctx, p } = await open('admin', '00000000-0000-0000-0000-0000000000ad', '송대표')
  await openSheet(p, false)

  //  ① 첫 화면 — 관점 두 장. 심사·평가 이야기는 어디에도 없어야 합니다.
  const first = flat(await p.textContent('[role="dialog"]'))
  ok(/어떤 관점에서 사용해 보셨나요/.test(first), '첫 화면이 「어떤 관점에서 사용해 보셨나요」')
  ok(/1~2분/.test(first), '얼마나 걸리는지 알려 줌')
  ok(!/심사|보증|정책자금|평가기관|설문조사서/.test(first), '심사·평가 이야기가 없음', first.slice(0, 80))
  ok((await p.locator('[data-fb-group]').count()) === 2, '관점이 두 가지')

  await p.locator('[data-fb-group="management"]').click()
  await p.waitForTimeout(400)

  //  ② 사용 정도 — 고르기 전에는 다음으로 못 갑니다
  ok(await p.locator('[data-fb-next]').isDisabled(), '사용 정도를 고르기 전에는 「다음」이 잠김')
  ok((await p.locator('[data-fb-usage]').count()) === 5, '사용 정도가 다섯 가지')
  ok(/아직 충분히 못 써봤어요/.test(flat(await p.textContent('[role="dialog"]'))),
    '「아직 충분히 못 써봤어요」를 고를 수 있음')
  ok((await p.locator('[data-fb-work]').count()) === 0, '관리자에게는 업무 종류를 묻지 않음')
  await p.locator('[data-fb-usage="d3_7"]').click()
  ok(!(await p.locator('[data-fb-next]').isDisabled()), '고르면 「다음」이 열림')
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)

  //  ③ 질문 단계 — 4단계, 각 5문항
  const steps = []
  const firstIds = []
  for (let i = 0; i < 6; i += 1) {
    const prog = flat(await p.textContent('[data-fb-progress]'))
    steps.push(prog)
    const n = await p.locator('[data-fb-question]').count()
    ok(n >= 4 && n <= 6, `${prog} — 한 화면에 4~6문항`, `${n}개`)
    //  ⚠ 안쪽 분류가 화면에 새어 나오면 답이 달라집니다
    const txt = flat(await p.textContent('[role="dialog"]'))
    ok(!/USABILITY|EFFICIENCY|ADOPTION|DECISION|ERROR_REDUCTION/.test(txt),
      `${prog} — 안쪽 분류가 화면에 안 보임`)
    ok((await p.locator('[data-fb-choice$=":na"]').count()) === n,
      `${prog} — 문항마다 「아직 판단하기 어려워요」가 있음`)

    if (i === 0) {
      firstIds.push(...await answerAll(p, 4))
      await p.screenshot({ path: `${SHOT}/fb-step1.png`, fullPage: true })
    } else if (i === 1) {
      await answerAll(p, 'na')
    } else {
      await answerAll(p, 5)
    }
    if (prog === '4 / 4') break
    await p.locator('[data-fb-next]').click()
    await p.waitForTimeout(450)
  }
  ok(steps.length === 4 && steps[0] === '1 / 4' && steps[3] === '4 / 4',
    '운영·관리는 네 단계', steps.join(' → '))

  //  ④ 이전으로 갔다 와도 답이 남아 있는가
  await p.locator('[data-fb-back]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-back]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-back]').click()
  await p.waitForTimeout(450)
  ok(flat(await p.textContent('[data-fb-progress]')) === '1 / 4', '이전을 세 번 누르면 첫 단계')
  const kept = await p.locator(`[data-fb-choice="${firstIds[0]}:4"]`).getAttribute('aria-pressed')
  ok(kept === 'true', '이전으로 와도 고른 답이 남아 있음', String(kept))
  ok(/고르신 답/.test(flat(await p.textContent(`[data-fb-question="${firstIds[0]}"]`))),
    '고른 답의 뜻이 글로 보임 (숫자만 두지 않음)')

  //  다시 끝까지
  for (let i = 0; i < 3; i += 1) { await p.locator('[data-fb-next]').click(); await p.waitForTimeout(400) }
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)

  //  ⑤ 마무리 — 체감 변화 · 불편한 곳 · 자유 의견(선택)
  const wrap = flat(await p.textContent('[role="dialog"]'))
  ok(/거의 다 됐습니다/.test(wrap) && /정답은 없습니다/.test(wrap), '제출 직전 안내가 나옴')
  ok((await p.locator('[data-fb-benefit]').count()) > 0, '체감 변화를 고를 수 있음 (운영·관리)')
  ok((await p.locator('[data-fb-pain]').count()) > 0, '불편한 곳을 고를 수 있음')
  ok(!(await p.locator('[data-fb-submit]').isDisabled()), '아무것도 더 고르지 않아도 제출할 수 있음')

  await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').click()
  await p.locator('[data-fb-benefit="일정관리 편해짐"]').click()
  await p.locator('[data-fb-pain="속도가 느림"]').click()
  //  ⚠ 「없음」을 고르면 나머지가 풀립니다 — 둘 다 켜져 있으면 뜻이 어긋납니다
  await p.locator('[data-fb-benefit="아직 크게 체감되는 변화 없음"]').click()
  ok((await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').getAttribute('aria-pressed')) === 'false',
    '「변화 없음」을 고르면 앞서 고른 것이 풀림')
  await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').click()
  ok((await p.locator('[data-fb-benefit="아직 크게 체감되는 변화 없음"]').getAttribute('aria-pressed')) === 'false',
    '다른 것을 고르면 「변화 없음」이 풀림')
  await p.screenshot({ path: `${SHOT}/fb-wrapup.png`, fullPage: true })

  //  ⑥ 자유 의견은 비운 채로 제출
  ok(flat(await p.inputValue('#feedback-comment')) === '', '자유 의견은 비어 있음')
  await p.locator('[data-fb-submit]').click()
  await p.locator('[data-fb-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(/피드백이 등록되었습니다/.test(flat(await p.textContent('[role="dialog"]'))), '제출하면 완료 화면')

  //  ⑦ 저장된 줄 — 번호가 들어 있고, 사람이 읽을 말도 함께 있는가
  const sent = server.posts[server.posts.length - 1]
  const topics = sent?.topics ?? []
  ok(topics.every((t) => t.startsWith('v2:')), 'v2 형식으로 저장됨', topics[0])
  ok(topics.some((t) => /^v2:_group=management/.test(t)), '관점이 저장됨')
  ok(topics.some((t) => /^v2:_usage=d3_7/.test(t)), '사용 정도가 저장됨')
  ok(topics.some((t) => /^v2:MG_STATUS_01=4 › 편해요 · /.test(t)),
    '문항 번호 · 고른 값 · 사람이 읽을 말이 한 줄에 있음',
    topics.find((t) => t.includes('MG_STATUS_01')))
  ok(topics.some((t) => /^v2:MG_EFF_01=na/.test(t)), '「아직 판단하기 어려워요」도 그대로 저장됨')
  ok(topics.filter((t) => t.startsWith('v2:_benefit=')).length === 1, '체감 변화 1개가 저장됨')
  ok(topics.some((t) => t === 'v2:_pain=속도가 느림'), '불편한 곳이 저장됨')
  ok(sent?.message === '', '자유 의견은 빈 채로 전달됨')
  ok(!('requester_id' in (sent ?? {})) && !('requester_name' in (sent ?? {})),
    '보내는 사람 정보를 화면에서 싣지 않음 (서버가 채웁니다)', Object.keys(sent ?? {}).join(','))
  await ctx.close()
}

// ── 2. 현장 담당자 — 폰에서, 현장 문항으로 ──────────────────────────────────
{
  const { ctx, p } = await open('field', '00000000-0000-0000-0000-0000000000f1', '김기사', { w: 390 })
  ok((await p.locator('[data-dev-request-more]').count()) === 0, '폰 첫 화면에는 더보기 안 입구가 아직 안 열려 있음')
  await openSheet(p, true)
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)

  //  직원에게는 업무 종류를 함께 묻습니다
  ok((await p.locator('[data-fb-work]').count()) === 3, '직원에게는 업무 종류를 묻는다')
  await p.locator('[data-fb-usage="d1_2"]').click()
  ok(await p.locator('[data-fb-next]').isDisabled(), '업무 종류를 고르기 전에는 다음이 잠김')
  await p.locator('[data-fb-work="field"]').click()
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)

  const seen = []
  for (let i = 0; i < 4; i += 1) {
    const prog = flat(await p.textContent('[data-fb-progress]'))
    seen.push(prog)
    seen.push(...await answerAll(p, 3))
    if (prog === '3 / 3') break
    await p.locator('[data-fb-next]').click()
    await p.waitForTimeout(450)
  }
  const ids = seen.filter((x) => /^ST_/.test(x))
  ok(seen.filter((x) => / \/ /.test(x)).length === 3, '현장·실무는 세 단계 (더 짧게)',
    seen.filter((x) => / \/ /.test(x)).join(' → '))
  ok(ids.length === 15, '모두 15문항', `${ids.length}개`)
  ok(ids.some((x) => x.startsWith('ST_WORK_F')), '현장 문항이 나옴')
  ok(!ids.some((x) => x.startsWith('ST_WORK_O')), '사무실 문항은 섞이지 않음')
  await p.screenshot({ path: `${SHOT}/fb-field.png`, fullPage: true })

  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)
  ok((await p.locator('[data-fb-benefit]').count()) === 0, '직원에게는 체감 변화 목록을 묻지 않음 (더 짧게)')
  ok((await p.locator('[data-fb-pain]').count()) > 0, '직원도 불편한 곳은 고를 수 있음')
  await p.locator('[data-fb-pain="수거 입력"]').click()
  await p.fill('#feedback-comment', '지하 주차장에서 저장이 안 될 때가 있습니다')

  //  ⚠ 두 번 눌러도 한 건만 가야 합니다 — 통신이 느린 현장에서 실제로 두 번 눌립니다
  const before = server.posts.length
  await p.locator('[data-fb-submit]').click()
  await p.locator('[data-fb-submit]').click({ force: true }).catch(() => {})
  await p.locator('[data-fb-done]').waitFor({ state: 'visible', timeout: 8000 })
  await p.waitForTimeout(600)
  ok(server.posts.length === before + 1, '두 번 눌러도 한 건만 저장됨', `${server.posts.length - before}건`)

  const sent = server.posts[server.posts.length - 1]
  ok((sent?.topics ?? []).some((t) => /^v2:_work=field/.test(t)), '업무 종류가 저장됨')
  ok(sent?.message === '지하 주차장에서 저장이 안 될 때가 있습니다', '자유 의견이 그대로 전달됨')
  await ctx.close()
}

// ── 3. 사무실 담당자 — 사무실 문항 · 「둘 다」는 현장 문항 ───────────────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '홍이사')
  await openSheet(p, false)
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-fb-usage="w1plus"]').click()
  await p.locator('[data-fb-work="office"]').click()
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)
  const officeIds = await p.locator('[data-fb-question]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-fb-question')))
  ok(officeIds.every((x) => x.startsWith('ST_WORK_O')), '사무실을 고르면 사무실 문항', officeIds.join(','))
  ok(/자재·재고/.test(flat(await p.textContent('[role="dialog"]'))), '사무실용 문구가 나옴')

  //  「둘 다」 — 스무 문항이 되지 않도록 현장 문항으로 갑니다(짧게). 저장에는 both 가 남습니다.
  await p.locator('[data-fb-back]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-back]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-work="both"]').click()
  ok(/현장 쪽 질문을 보여 드립니다/.test(flat(await p.textContent('[role="dialog"]'))),
    '「둘 다」를 고르면 어느 쪽 질문이 나오는지 알려 줌')
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(450)
  const bothIds = await p.locator('[data-fb-question]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-fb-question')))
  ok(bothIds.every((x) => x.startsWith('ST_WORK_F')), '「둘 다」는 현장 문항 (스무 문항이 되지 않게)')

  //  ⚠ 서버가 실패하면 알려 주고, 다시 낼 수 있어야 합니다
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(450)
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(500)
  server.failNext = true
  await p.locator('[data-fb-submit]').click()
  await p.waitForTimeout(1800)
  ok(/문제|오류|실패|다시/.test(flat(await p.textContent('[role="dialog"]'))),
    '서버가 실패하면 화면에 알려 줌', flat(await p.textContent('[role="dialog"]')).slice(0, 90))
  ok((await p.locator('[data-fb-done]').count()) === 0, '실패했는데 완료 화면으로 넘어가지 않음')
  const before = server.posts.length
  await p.locator('[data-fb-submit]').click()
  await p.locator('[data-fb-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(server.posts.length === before + 1, '실패 뒤 다시 누르면 보내진다')
  const sent = server.posts[server.posts.length - 1]
  ok((sent?.topics ?? []).some((t) => /^v2:_work=both/.test(t)), '저장에는 「둘 다」가 그대로 남음')
  await ctx.close()
}

// ── 4. 폰 세 폭에서 넘치지 않고, 누를 것이 충분히 크고 떨어져 있는가 ─────────
for (const w of [360, 390, 430]) {
  const { ctx, p } = await open('field', '00000000-0000-0000-0000-0000000000f1', '김기사', { w })
  await openSheet(p, true)
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-fb-usage="d3_7"]').click()
  await p.locator('[data-fb-work="field"]').click()
  await p.locator('[data-fb-next]').click()
  await p.waitForTimeout(600)

  const m = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')
    const taps = [...dlg.querySelectorAll('button')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const small = taps.filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => `${Math.round(el.getBoundingClientRect().height)}px "${(el.textContent ?? '').trim().slice(0, 12) || el.getAttribute('aria-label') || el.tagName}"`)
    //  나란히 놓인 것끼리 8px 이상 떨어져 있는가 (손가락이 굵어도 옆 것을 안 누르게)
    //
    //   ⚠ 아래에 **붙어 있는 띠**([이전][다음])는 빼고 셉니다. 그 띠는 내용
    //     위에 얹혀 있는 것이지 내용과 나란히 놓인 것이 아닙니다. 스크롤을
    //     조금만 움직이면 어떤 단추든 그 띠 바로 위에 올 수 있어서, 같이 세면
    //     「7.7px 붙었다」가 스크롤 위치에 따라 생겼다 없어졌다 합니다.
    //     (a11y_measure 가 떠 있는 ＋ 단추를 빼는 것과 같은 이유입니다.)
    const inFlow = taps.filter((el) => !el.closest('[data-modal-footer]'))
    const boxes = inFlow.map((el) => el.getBoundingClientRect())
    let tight = 0
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i], c = boxes[j]
        const yOverlap = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 0
        const xOverlap = Math.min(a.right, c.right) - Math.max(a.left, c.left) > 0
        const gapX = Math.max(a.left, c.left) - Math.min(a.right, c.right)
        const gapY = Math.max(a.top, c.top) - Math.min(a.bottom, c.bottom)
        if (yOverlap && gapX >= 0 && gapX < 8) tight += 1
        else if (xOverlap && gapY >= 0 && gapY < 8) tight += 1
      }
    }
    //  글자가 너무 작지 않은가
    const tiny = [...dlg.querySelectorAll('*')].filter((el) => {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) return false
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      return parseFloat(getComputedStyle(el).fontSize) < 16
    }).map((el) => `${Math.round(parseFloat(getComputedStyle(el).fontSize))}px "${(el.textContent ?? '').trim().slice(0, 12)}"`)
    return {
      push: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small, tight, tiny,
      //  아래 단추가 마지막 문항을 가리지 않는가 — 자리를 차지한 채 붙어 있어야 합니다
      footerOverlaps: (() => {
        const f = dlg.querySelector('[data-modal-footer]')
        const last = [...dlg.querySelectorAll('[data-fb-question]')].pop()
        if (!f || !last) return false
        const fr = f.getBoundingClientRect(), lr = last.getBoundingClientRect()
        return lr.bottom > fr.top + 1 && lr.top < fr.bottom
      })(),
    }
  })
  ok(m.push <= 0, `${w}px — 가로로 밀리지 않음`, `${m.push}px`)
  ok(m.small.length === 0, `${w}px — 44px 미만 누를 것 없음`, m.small.slice(0, 3).join(' | '))
  ok(m.tight === 0, `${w}px — 누를 것끼리 8px 이상 떨어져 있음`, `붙은 쌍 ${m.tight}개`)
  ok(m.tiny.length === 0, `${w}px — 16px 미만 글자 없음`, m.tiny.slice(0, 3).join(' | '))
  ok(!m.footerOverlaps, `${w}px — 아래 단추가 마지막 문항을 가리지 않음`)
  if (w === 390) await p.screenshot({ path: `${SHOT}/fb-phone.png`, fullPage: true })
  await ctx.close()
}

// ── 5. 관리자 화면 — 관점별로 나뉘고 사람 수가 함께 보이는가 ────────────────
{
  //  ⚠ 예전(v1) 형식 한 건을 섞어 둡니다. 그대로 보여야 합니다.
  server.rows.push({
    id: 'legacy1', created_at: '2026-08-01T00:00:00Z',
    requester_id: '00000000-0000-0000-0000-0000000000f1', requester_name: '김기사', requester_role: 'field',
    topics: ['수거 입력 › 저장이 안 되거나 중간에 끊깁니다'], message: '예전 형식 요청입니다',
    status: '접수', admin_note: '', handled_at: null,
  })

  const { ctx, p } = await open('admin', '00000000-0000-0000-0000-0000000000ad', '송대표', { path: '/dev-requests' })
  const body = flat(await p.textContent('main'))

  ok(/사용자 피드백/.test(body), '화면 이름이 「사용자 피드백」')
  ok((await p.locator('[data-fb-summary="management"]').count()) === 1
    && (await p.locator('[data-fb-summary="staff"]').count()) === 1,
    '운영·관리와 현장·실무가 나뉘어 보임')

  const mg = flat(await p.textContent('[data-fb-summary="management"]'))
  const st = flat(await p.textContent('[data-fb-summary="staff"]'))
  ok(/1명 답변/.test(mg), '운영·관리 응답 수가 보임', mg.slice(0, 60))
  ok(/2명 답변/.test(st), '현장·실무 응답 수가 보임', st.slice(0, 60))
  //  ⚠ 몇 명 중 몇 명인지 — 한 사람이 고른 것이 전체 의견처럼 보이면 안 됩니다
  ok(/\d명 \/ \d명/.test(st), '「n명 / 전체 m명」으로 함께 보임')
  ok(/판단 어려움|아직 판단하기 어려워요/.test(mg), '「아직 판단하기 어려워요」를 따로 세어 보여 줌')
  ok(/사용 정도 —/.test(mg), '얼마나 써 보고 답했는지 함께 보임')
  ok(/ \/ 5/.test(mg), '평균이 5점 만점으로 보임')
  ok(/절감률로 바꾸지 않습니다/.test(body), '느낌 점수를 절감률로 바꾸지 않는다고 못 박아 둠')
  ok(!/USABILITY|EFFICIENCY|ADOPTION/.test(body), '안쪽 분류 이름은 화면에 안 나옴')

  //  한 건씩 — 요약 한 줄, 자세히는 눌러서
  ok(/문항 답변/.test(body), '한 건마다 몇 문항 답했는지 보임')
  ok(!/v2:/.test(body), '저장 형식(v2:)이 그대로 노출되지 않음')
  //  ⚠ 목록은 새것부터라 첫 줄이 관리자 답변이 아닙니다 — 관점으로 찾습니다.
  const mgRow = p.locator('[data-dev-request]').filter({ hasText: '운영·관리 관점' }).first()
  await mgRow.locator('[data-fb-detail]').click()
  await p.waitForTimeout(400)
  ok(/오늘 예정된 수거와 진행상황/.test(flat(await mgRow.textContent())),
    '「문항별 답변 보기」를 누르면 질문과 답이 그대로 보임', flat(await mgRow.textContent()).slice(0, 100))

  //  예전 답변이 그대로 남아 있는가
  ok(/저장이 안 되거나 중간에 끊깁니다/.test(body), '예전(v1) 답변이 그대로 보임')
  ok(/예전 형식 요청입니다/.test(body), '예전 자유 의견도 그대로 보임')
  await p.screenshot({ path: `${SHOT}/fb-inbox.png`, fullPage: true })

  //  관리자는 상태를 바꿉니다 (기존 기능 그대로)
  await p.locator('[data-dev-request] button', { hasText: '확인' }).first().click()
  await p.waitForTimeout(1500)
  ok(server.rows[0].status === '확인', '관리자가 상태를 바꿈', server.rows[0].status)
  await ctx.close()
}

// ── 6. 사무실 담당자는 남의 피드백을 못 봅니다 (기존 권한 그대로) ───────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '홍이사', { path: '/dev-requests' })
  ok(/접근 권한이 없는 화면입니다/.test(flat(await p.textContent('body'))),
    '사무실 담당자는 피드백 화면을 열 수 없음')
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const nav = flat(await p.textContent('aside'))
  ok(!/사용 후기 남기기/.test(nav), 'PC 왼쪽 목차에는 입구를 두지 않음')
  ok((await p.locator('main [data-dev-request-open]').count()) === 1, 'PC 오른쪽 위에 입구가 하나')
  ok(!/사용자 피드백/.test(nav), '피드백 화면 메뉴는 사무실 담당자에게 안 보임')
  await ctx.close()
}

await b.close()
console.log(`\ncheck_devreq OK=${pass} FAIL=${fail}`)
