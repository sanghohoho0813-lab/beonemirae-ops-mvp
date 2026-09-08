import { chromium, EXEC } from './_pw.mjs'

// ─────────────────────────────────────────────────────────────────────────────
//  사용자 피드백 v2 — 눌러서 끝내는 설문 (0100)
//
//  ⚠ 0100 — 대표님 지시로 「다음 → 다음」 단계를 걷어내고 **한 화면 연속
//    스크롤**로 바꿨습니다. 묶음 제목은 그대로 두되, 답하다가 화면이 갈리지
//    않습니다. 그래서 이 검사도 「단계 넘기기」가 아니라 「한 화면에 다 있고,
//    스크롤하며 눌러 내려갈 수 있는가」를 봅니다.
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

/** 화면에 있는 문항 번호 전부 */
async function questionIds(p) {
  return await p.locator('[data-fb-question]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-fb-question')))
}

/**
 * 스크롤하며 눌러 내려갑니다 — 실제 사용과 같은 순서로.
 *
 *  ⚠ 각 문항으로 스크롤한 뒤 누릅니다. 「다음」을 찾아 오르내리지 않고
 *    한 방향으로만 내려가는지가 이번 UI 의 핵심입니다.
 */
async function scrollAndAnswer(p, valueOf) {
  const ids = await questionIds(p)
  for (const id of ids) {
    const el = p.locator(`[data-fb-question="${id}"]`)
    await el.scrollIntoViewIfNeeded()
    await p.locator(`[data-fb-choice="${id}:${valueOf(id)}"]`).click()
  }
  return ids
}


// ── 1. 운영·관리 관점 — 한 화면에서 스크롤하며 20문항 ───────────────────────
{
  const { ctx, p } = await open('admin', '00000000-0000-0000-0000-0000000000ad', '송대표')
  await openSheet(p, false)

  //  ① 첫 화면 — 관점 두 장. 심사·평가 이야기는 어디에도 없어야 합니다.
  const first = flat(await p.textContent('[role="dialog"]'))
  ok(/어떤 관점에서 사용해 보셨나요/.test(first), '첫 화면이 「어떤 관점에서 사용해 보셨나요」')
  ok(/1~2분/.test(first), '얼마나 걸리는지 알려 줌')
  ok(!/심사|보증|정책자금|평가기관|설문조사서/.test(first), '심사·평가 이야기가 없음', first.slice(0, 80))
  ok((await p.locator('[data-fb-group]').count()) === 2, '관점이 두 가지')
  ok((await p.locator('[data-fb-question]').count()) === 0, '관점을 고르기 전에는 문항이 안 열림')

  await p.locator('[data-fb-group="management"]').click()
  await p.waitForTimeout(500)

  //  ② 고르는 순간 **한 화면에 전부** 열립니다 — 「다음」 단추가 없어야 합니다
  ok((await p.locator('[data-fb-next]').count()) === 0, '「다음」 단추가 없음 (단계 넘기기를 걷어냄)')
  ok((await p.locator('[data-fb-back]').count()) === 0, '「이전」 단추도 없음')
  ok((await p.locator('[data-fb-question]').count()) === 20, '20문항이 한 화면에 다 있음',
    `${await p.locator('[data-fb-question]').count()}개`)
  ok((await p.locator('[data-fb-section]').count()) === 4, '묶음 제목 네 개로 나뉘어 있음',
    `${await p.locator('[data-fb-section]').count()}개`)
  ok((await p.locator('[data-fb-benefit]').count()) > 0, '마무리(체감 변화)까지 같은 화면에 있음')
  ok((await p.locator('#feedback-comment').count()) === 1, '자유 의견 칸도 같은 화면에 있음')

  //  ③ 사용 정도를 고르기 전에는 제출이 없고, 무엇이 남았는지 알려 줍니다
  ok((await p.locator('[data-fb-submit]').count()) === 0, '사용 정도를 고르기 전에는 제출 단추가 없음')
  ok(/어느 정도 사용해 보셨는지/.test(flat(await p.textContent('[data-fb-need-usage]'))),
    '무엇이 남았는지 아래 띠에 알려 줌')
  ok((await p.locator('[data-fb-usage]').count()) === 5, '사용 정도가 다섯 가지')
  ok(/아직 충분히 못 써봤어요/.test(flat(await p.textContent('[data-fb-usage-block]'))),
    '「아직 충분히 못 써봤어요」를 고를 수 있음')
  ok((await p.locator('[data-fb-work]').count()) === 0, '관리자에게는 업무 종류를 묻지 않음')
  await p.locator('[data-fb-usage="d3_7"]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-fb-submit]').count()) === 1, '고르면 제출 단추가 나옴')

  //  ④ 안쪽 분류가 화면에 새어 나오면 답이 달라집니다
  const all = flat(await p.textContent('[role="dialog"]'))
  ok(!/USABILITY|EFFICIENCY|ADOPTION|DECISION|ERROR_REDUCTION/.test(all), '안쪽 분류가 화면에 안 보임')
  ok((await p.locator('[data-fb-choice$=":na"]').count()) === 20,
    '문항마다 「아직 판단하기 어려워요」가 있음')
  ok(flat(await p.textContent('[data-fb-progress]')) === '0 / 20 답변', '답한 개수가 아래에 보임',
    flat(await p.textContent('[data-fb-progress]')))

  //  ⑤ 스크롤하며 눌러 내려갑니다 — 한 방향으로만
  const scrolls = []
  await p.evaluate(() => { window.__y = []; })
  const ids = await scrollAndAnswer(p, (id) => (id.startsWith('MG_EFF') ? 'na' : id === 'MG_STATUS_01' ? 4 : 5))
  ok(ids.length === 20, '스무 문항을 순서대로 눌러 내려감', `${ids.length}개`)
  ok(flat(await p.textContent('[data-fb-progress]')) === '20 / 20 답변', '누른 만큼 개수가 올라감',
    flat(await p.textContent('[data-fb-progress]')))
  scrolls.push(await p.evaluate(() => {
    const box = document.querySelector('[role="dialog"] [data-modal-footer]')?.previousElementSibling
    return box ? box.scrollTop : -1
  }))
  ok(scrolls[0] > 0, '실제로 아래로 스크롤되었음', `${scrolls[0]}px`)

  //  ⑥ 고른 답의 뜻이 글로 보이는가 (숫자만 두지 않음)
  ok(/고르신 답/.test(flat(await p.textContent('[data-fb-question="MG_STATUS_01"]'))),
    '고른 답의 뜻이 글로 보임')
  //  같은 것을 다시 누르면 지워집니다 — 되돌릴 길
  await p.locator('[data-fb-question="MG_STATUS_01"]').scrollIntoViewIfNeeded()
  await p.locator('[data-fb-choice="MG_STATUS_01:4"]').click()
  ok(flat(await p.textContent('[data-fb-progress]')) === '19 / 20 답변', '같은 것을 다시 누르면 답이 지워짐')
  await p.locator('[data-fb-choice="MG_STATUS_01:4"]').click()
  await p.screenshot({ path: `${SHOT}/fb-scroll.png`, fullPage: true })

  //  ⑦ 마무리 — 「없음」류는 나머지를 풀어 줍니다
  await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').scrollIntoViewIfNeeded()
  await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').click()
  await p.locator('[data-fb-benefit="일정관리 편해짐"]').click()
  await p.locator('[data-fb-pain="속도가 느림"]').click()
  await p.locator('[data-fb-benefit="아직 크게 체감되는 변화 없음"]').click()
  ok((await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').getAttribute('aria-pressed')) === 'false',
    '「변화 없음」을 고르면 앞서 고른 것이 풀림')
  await p.locator('[data-fb-benefit="전화·카톡 확인 감소"]').click()
  ok((await p.locator('[data-fb-benefit="아직 크게 체감되는 변화 없음"]').getAttribute('aria-pressed')) === 'false',
    '다른 것을 고르면 「변화 없음」이 풀림')

  //  ⑧ 자유 의견은 비운 채로 제출
  ok(flat(await p.inputValue('#feedback-comment')) === '', '자유 의견은 비어 있음')
  ok(!(await p.locator('[data-fb-submit]').isDisabled()), '더 고르지 않아도 제출할 수 있음')
  await p.locator('[data-fb-submit]').click()
  await p.locator('[data-fb-done]').waitFor({ state: 'visible', timeout: 8000 })
  ok(/피드백이 등록되었습니다/.test(flat(await p.textContent('[role="dialog"]'))), '제출하면 완료 화면')

  //  ⑨ 저장된 줄 — 번호가 들어 있고, 사람이 읽을 말도 함께 있는가
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
  await p.waitForTimeout(500)

  //  직원에게는 업무 종류를 함께 묻습니다
  ok((await p.locator('[data-fb-work]').count()) === 3, '직원에게는 업무 종류를 묻는다')
  await p.locator('[data-fb-usage="d1_2"]').click()
  ok((await p.locator('[data-fb-submit]').count()) === 0, '업무 종류를 고르기 전에는 제출이 없음')
  ok(/어떤 업무를 하시는지/.test(flat(await p.textContent('[data-fb-need-usage]'))),
    '무엇이 남았는지 알려 줌')
  await p.locator('[data-fb-work="field"]').click()
  await p.waitForTimeout(400)

  const ids = await questionIds(p)
  ok(ids.length === 15, '직원은 15문항 (관리자보다 짧게)', `${ids.length}개`)
  ok((await p.locator('[data-fb-section]').count()) === 3, '묶음 제목 세 개')
  ok(ids.some((x) => x.startsWith('ST_WORK_F')), '현장 문항이 나옴')
  ok(!ids.some((x) => x.startsWith('ST_WORK_O')), '사무실 문항은 섞이지 않음')
  ok((await p.locator('[data-fb-benefit]').count()) === 0, '직원에게는 체감 변화 목록을 묻지 않음 (더 짧게)')
  ok((await p.locator('[data-fb-pain]').count()) > 0, '직원도 불편한 곳은 고를 수 있음')

  await scrollAndAnswer(p, () => 3)
  ok(flat(await p.textContent('[data-fb-progress]')) === '15 / 15 답변', '폰에서도 스크롤하며 다 누름')
  await p.screenshot({ path: `${SHOT}/fb-field.png`, fullPage: true })

  await p.locator('[data-fb-pain="수거 입력"]').scrollIntoViewIfNeeded()
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

// ── 3. 사무실 — 문항이 바뀐다 · 「둘 다」는 현장 문항 · 서버 실패 ────────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '홍이사')
  await openSheet(p, false)
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-fb-usage="w1plus"]').click()
  await p.locator('[data-fb-work="office"]').click()
  await p.waitForTimeout(400)
  const officeIds = (await questionIds(p)).filter((x) => x.startsWith('ST_WORK'))
  ok(officeIds.every((x) => x.startsWith('ST_WORK_O')), '사무실을 고르면 사무실 문항', officeIds.join(','))
  ok(/자재·재고/.test(flat(await p.textContent('[role="dialog"]'))), '사무실용 문구가 나옴')

  //  ⚠ 관점·업무를 바꾸면 화면의 문항이 그 자리에서 바뀝니다 (화면 이동 없이)
  await p.locator('[data-fb-work="both"]').click()
  await p.waitForTimeout(400)
  ok(/현장 쪽 질문을 보여 드립니다/.test(flat(await p.textContent('[role="dialog"]'))),
    '「둘 다」를 고르면 어느 쪽 질문이 나오는지 알려 줌')
  const bothIds = (await questionIds(p)).filter((x) => x.startsWith('ST_WORK'))
  ok(bothIds.every((x) => x.startsWith('ST_WORK_F')), '「둘 다」는 현장 문항 (스무 문항이 되지 않게)')

  //  ⚠ 0104 — 관점을 바꾸면 **업무 종류도 딸려 가지 않아야** 합니다.
  //    「운영·관리 관점 · 현장 수거」라는 앞뒤 안 맞는 기록이 실제로 저장됐습니다.
  //  ⚠ 관점을 바꿔도 답이 섞이지 않아야 합니다 — 보이는 문항의 답만 셉니다
  await p.locator('[data-fb-question="ST_USE_01"]').scrollIntoViewIfNeeded()
  await p.locator('[data-fb-choice="ST_USE_01:5"]').click()
  ok(flat(await p.textContent('[data-fb-progress]')) === '1 / 15 답변', '직원 관점에서 1문항 답함')
  await p.locator('[data-fb-group="management"]').scrollIntoViewIfNeeded()
  await p.locator('[data-fb-group="management"]').click()
  await p.waitForTimeout(400)
  ok(flat(await p.textContent('[data-fb-progress]')) === '0 / 20 답변',
    '관점을 바꾸면 그 관점의 답만 셈 (섞이지 않음)', flat(await p.textContent('[data-fb-progress]')))
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)
  ok(flat(await p.textContent('[data-fb-progress]')) === '1 / 15 답변', '돌아오면 아까 고른 답이 그대로 있음')

  //  ⚠ 서버가 실패하면 알려 주고, 다시 낼 수 있어야 합니다
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
  ok(!(sent?.topics ?? []).some((t) => /^v2:MG_/.test(t)), '고르지 않은 관점의 답은 보내지 않음')
  await ctx.close()
}

// ── 3b. 운영·관리로 바꾸면 업무 종류는 딸려 가지 않는다 (0104) ──────────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '홍이사')
  await openSheet(p, false)
  //  직원 → 현장 수거까지 고른 뒤
  await p.locator('[data-fb-group="staff"]').click()
  await p.waitForTimeout(400)
  await p.locator('[data-fb-usage="d1_2"]').click()
  await p.locator('[data-fb-work="field"]').click()
  await p.waitForTimeout(400)
  //  관점을 운영·관리로 바꿉니다
  await p.locator('[data-fb-group="management"]').click()
  await p.waitForTimeout(500)
  ok((await p.locator('[data-fb-work]').count()) === 0, '관리자 관점에는 업무 종류를 묻지 않는다')
  await p.locator('[data-fb-question="MG_STATUS_01"]').scrollIntoViewIfNeeded()
  await p.locator('[data-fb-choice="MG_STATUS_01:4"]').click()
  await p.locator('[data-fb-submit]').click()
  await p.locator('[data-fb-done]').waitFor({ state: 'visible', timeout: 8000 })
  const t = server.posts[server.posts.length - 1]?.topics ?? []
  ok(t.some((x) => /^v2:_group=management/.test(x)), '관점은 운영·관리로 저장됨')
  ok(!t.some((x) => /^v2:_work=/.test(x)),
    '**「운영·관리 관점 · 현장 수거」 같은 앞뒤 안 맞는 기록이 저장되지 않음**',
    t.filter((x) => /_work/.test(x)).join(','))
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
    //   ⚠ 아래에 **붙어 있는 띠**(제출)는 빼고 셉니다. 그 띠는 내용 위에 얹혀
    //     있는 것이지 내용과 나란히 놓인 것이 아닙니다. 스크롤을 조금만
    //     움직이면 어떤 단추든 그 띠 바로 위에 올 수 있어서, 같이 세면
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
      //  아래 띠가 마지막 문항을 가리지 않는가 — 자리를 차지한 채 붙어 있어야 합니다
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

  //  ⚠ 고른 것과 안 고른 것 **양쪽 다** 읽히는가. 처음에 「아직 판단하기
  //    어려워요」를 고르면 어두운 바탕에 회색 글자가 되어 안 읽혔습니다 —
  //    글자 크기만 재고 색을 안 재서 못 잡았습니다.
  await p.locator('[data-fb-choice$=":na"]').first().click()
  await p.locator('[data-fb-pain]').first().scrollIntoViewIfNeeded()
  await p.locator('[data-fb-pain]').first().click()
  await p.waitForTimeout(250)
  const dim = await p.evaluate(() => {
    const srgb = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    const parse = (c) => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/)
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null }
    const bgOf = (el) => { let n = el
      while (n && n !== document.documentElement) { const q = parse(getComputedStyle(n).backgroundColor)
        if (q && q[3] > 0.55) return q.slice(0, 3); n = n.parentElement }
      return [255, 255, 255] }
    const ratio = (f, g) => { const a = lum(f) + 0.05, c = lum(g) + 0.05; return a > c ? a / c : c / a }
    const bad = []
    for (const el of document.querySelectorAll('[role="dialog"] *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const st = getComputedStyle(el)
      const fg = parse(st.color); if (!fg) continue
      const px = parseFloat(st.fontSize), bold = Number(st.fontWeight) >= 700
      const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5
      const v = ratio(fg.slice(0, 3), bgOf(el))
      if (v < need) bad.push(`${v.toFixed(1)}:1 "${(el.textContent ?? '').trim().slice(0, 14)}"`)
    }
    return bad
  })
  ok(dim.length === 0, `${w}px — 글자가 다 읽힘 (고른 것 포함)`, dim.slice(0, 3).join(' | '))
  ok(!m.footerOverlaps, `${w}px — 아래 띠가 마지막 문항을 가리지 않음`)

  //  ⚠ 스크롤 한 방향으로 끝까지 갈 수 있는가 — 이번 UI 의 핵심
  const reach = await p.evaluate(async () => {
    const dlg = document.querySelector('[role="dialog"]')
    const box = dlg.querySelector('[data-modal-footer]')?.previousElementSibling
    if (!box) return null
    box.scrollTo(0, box.scrollHeight)
    await new Promise((r) => setTimeout(r, 250))
    const cmt = dlg.querySelector('#feedback-comment')?.getBoundingClientRect()
    const f = dlg.querySelector('[data-modal-footer]')?.getBoundingClientRect()
    return { atEnd: box.scrollTop + box.clientHeight >= box.scrollHeight - 2, commentVisible: cmt && f ? cmt.bottom <= f.top + 1 : false }
  })
  ok(reach?.atEnd === true, `${w}px — 아래로 계속 스크롤하면 끝까지 감`)
  ok(reach?.commentVisible === true, `${w}px — 맨 아래 자유 의견 칸이 띠에 안 가림`)
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
  //  운영·관리 2명(①번 · 3b번) · 현장·실무 2명(②번 · ③번)
  ok(/2명 답변/.test(mg), '운영·관리 응답 수가 보임', mg.slice(0, 60))
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

// ── 6. 들어가는 문 · 권한 (기존 그대로) ─────────────────────────────────────
{
  const { ctx, p } = await open('office', '00000000-0000-0000-0000-0000000000o1', '홍이사', { path: '/dev-requests' })
  ok(/접근 권한이 없는 화면입니다/.test(flat(await p.textContent('body'))),
    '사무실 담당자는 피드백 화면을 열 수 없음')
  await p.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  const nav = flat(await p.textContent('aside'))
  const top = flat(await p.textContent('main'))
  ok(!/사용 후기 남기기/.test(nav), 'PC 왼쪽 목차에는 입구를 두지 않음')
  ok((await p.locator('main [data-dev-request-open]').count()) === 1, 'PC 오른쪽 위에 입구가 하나')
  //  ⚠ 대표님 지시 — 이름 옆(폰은 아래)에 무엇을 하는 곳인지 괄호로 답니다
  ok(/사용 후기 남기기 \(개발자에게 요청\)/.test(top), 'PC 입구에 「(개발자에게 요청)」이 붙어 있음',
    top.slice(0, 80))
  ok(!/사용자 피드백/.test(nav), '피드백 화면 메뉴는 사무실 담당자에게 안 보임')
  await ctx.close()
}

// ── 7. 폰 더보기·도움말에도 「(개발자에게 요청)」이 아래 줄에 ────────────────
{
  const { ctx, p } = await open('field', '00000000-0000-0000-0000-0000000000f1', '김기사', { w: 390 })
  await p.getByRole('button', { name: '더보기' }).first().click()
  await p.waitForTimeout(800)
  const more = flat(await p.textContent('body'))
  ok(/사용 후기 남기기 \(개발자에게 요청\)/.test(more),
    '폰 더보기 — 제목 아래에 「(개발자에게 요청)」', more.slice(more.indexOf('사용 후기') - 10, more.indexOf('사용 후기') + 40))
  await ctx.close()
}

await b.close()
console.log(`\ncheck_devreq OK=${pass} FAIL=${fail}`)
