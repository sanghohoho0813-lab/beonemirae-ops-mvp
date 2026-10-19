import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  뉴본펭귄 사전 설문 (0144 · 0145) — 앱 안에서 바로 · 폰에서 끝까지 · 관리자 결과
//
//   대표님: 「링크 필요 없이 · 두 분 중 한 분만 답하면 되고 · 시작하기 누르면 바로 ·
//   다 입력하고 나면 관리자(사용자 피드백) 화면에 딱 나오도록 · 더 눈에 띄게」.
//   이 검사는 실제 폰 크기(390 · 384 큰 글씨)에서 더보기 「★ 뉴본펭귄 사전 설문 · 시작하기」
//   → 질문 → 조건부 칸 → 자동 저장 → 나가기 → 다른 분(이사님)이 이어 쓰기 → 확인 → 제출 →
//   제출 후 수정 → 관리자 화면까지 손가락으로 눌러 봅니다.
//
//   ⚠ 서버(biz_survey_*)는 여기서 **흉내**만 냅니다. 권한(대표·사무실만) · 답지 하나 ·
//     마지막 작성자의 진짜 검증은 supabase/test/52_newborn_survey_inapp.sql 이 로컬
//     PostgreSQL 에서 합니다. 여기서는 화면이 그 약속대로 부르고 그리는지를 봅니다.
//   ⚠ 가짜 자료입니다. 화면 모양을 재는 데만 씁니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const SHOTS = process.env.SHOTS
const fs = await import('node:fs/promises')

const b = await chromium.launch({ executablePath: EXEC })

const NAME = { admin: '송명근', office: '홍현주', field: '김준기' }

/** 설문 서버 흉내 — 한 검사 안에서 여러 창이 같은 답지 하나를 봅니다 */
function makeServer() {
  return { row: null, revisions: [], calls: [], failSave: false, mode: 'ok' /* ok | missing | denied */, seq: 0 }
}

function wireSurvey(ctx, S, role) {
  ctx.route('**/rest/v1/rpc/biz_survey_*', async (r) => {
    const fn = r.request().url().split('/rpc/')[1].split('?')[0]
    const body = JSON.parse(r.request().postData() || '{}')
    const send = (status, v) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    S.calls.push({ fn, body, role })
    const now = () => new Date(Date.now() + (S.seq++)).toISOString()
    if (S.mode === 'missing') return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn })
    if (fn.startsWith('biz_survey_my_')) {
      //  서버 판단 — 대표·관리자 · 사무실만 (biz_survey_can_answer)
      if (!['admin', 'office'].includes(role)) return send(403, { code: '42501', message: '뉴본펭귄 사전 설문은 대표님 · 이사님 계정만 열 수 있습니다.' })
      S.row ??= { respondent: 'ceo', answers: {}, status: 'draft', updated_at: now(), submitted_at: null, first_submitted_at: null, edited_by: '', edited_role: '' }
      const row = S.row
      if (fn === 'biz_survey_my_open') return send(200, { ...row })
      if (fn === 'biz_survey_my_save') {
        if (S.failSave) return r.abort('failed')
        Object.assign(row, { answers: body.p_answers, updated_at: now(), edited_by: NAME[role], edited_role: role })
        return send(200, { updated_at: row.updated_at })
      }
      const at = now()
      Object.assign(row, { answers: body.p_answers, status: 'submitted', updated_at: at, submitted_at: at, edited_by: NAME[role], edited_role: role })
      row.first_submitted_at ??= at
      S.revisions.push({ id: `v${S.revisions.length + 1}`, respondent: 'ceo', submitted_at: at })
      return send(200, { updated_at: at, submitted_at: at })
    }
    if (S.mode === 'denied' || role !== 'admin') return send(403, { code: '42501', message: '설문 관리자만 볼 수 있습니다.' })
    if (fn === 'biz_survey_admin_load') return send(200, { responses: S.row ? [S.row] : [], invites: [], revisions: [...S.revisions].reverse() })
    return send(404, { code: 'PGRST202', message: 'unknown' })
  })
}

/** 로그인한 직원 화면 (폰이면 폰 크기) */
async function openStaff(S, path, { w = 390, role = 'admin', scale = 'lg', ctx: reuse } = {}) {
  const phone = w < 700
  const ctx =
    reuse ??
    (await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true }))
  const state = { profile: { ...W.profileFor(role), name: NAME[role] ?? '대표', font_scale: scale }, reqs: 0, writes: [], schemaVersion: 106 }
  if (!reuse) {
    W.wire(ctx, state)
    wireSurvey(ctx, S, role)
  }
  const p = await ctx.newPage()
  await p.addInitScript(([k, u]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
  }, ['beonemirae-ops:auth', { id: F.UID, aud: 'authenticated', email: 'x@b.c', app_metadata: {}, user_metadata: {} }])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  return { ctx, p, state }
}

/** 눌린 글자 · 상자 밖 · 화면 밖 · 가로 밀림 */
const measure = (p, scope = '[data-survey]') =>
  p.evaluate((scope) => {
    const docW = document.documentElement.clientWidth
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const bad = []
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim()
      if (!own) continue
      const s = getComputedStyle(el); const fs = parseFloat(s.fontSize); const lh = parseFloat(s.lineHeight) || fs * 1.4
      const r = el.getBoundingClientRect()
      if (own.length >= 4 && r.width < fs * 2.6 && r.height > lh * 3.5) bad.push(`눌림 ${own.slice(0, 14)}`)
      if (r.right > docW + 1 || r.left < -1) bad.push(`화면 밖 ${own.slice(0, 14)}`)
    }
    const small = [...document.querySelectorAll(`${scope} button, ${scope} input, ${scope} select, ${scope} textarea`)]
      .filter(vis).filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 14))
    return { bad: [...new Set(bad)].slice(0, 5), push: document.documentElement.scrollWidth - docW, small: [...new Set(small)].slice(0, 5) }
  }, scope)

const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png` })
const A = (S) => S.row?.answers ?? {}
const waitSaved = (p) => p.waitForTimeout(1100)
const openMore = async (p) => {
  await p.locator('nav.fixed.bottom-0 button:has-text("더보기")').click()
  await p.waitForTimeout(900)
}

// ═══ ① 더보기 「★ 뉴본펭귄 사전 설문 · 시작하기」 → 바로 시작 (대표님 · 폰) ═══════════
const S = makeServer()
{
  const { ctx, p } = await openStaff(S, '/')
  await openMore(p)
  const banner = p.locator('[data-more-survey]:visible')
  ok((await banner.count()) === 1, '① 더보기 — 「★ 뉴본펭귄 사전 설문」 단추가 있음')
  const bt = flat(await banner.textContent())
  ok(/★ 뉴본펭귄 사전 설문/.test(bt) && /시작하기/.test(bt) && /한 분만/.test(bt), '① 별표 · 이름 · 「시작하기」 · 「한 분만」', bt)
  const pos = await p.evaluate(() => {
    const top = (s) => [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 2)?.getBoundingClientRect().top ?? -1
    const el = [...document.querySelectorAll('[data-more-survey]')].find((e) => e.getBoundingClientRect().width > 2)
    return { survey: top('[data-more-survey]'), firstGroup: top('[data-more-section="more-ops"]'), bg: el ? getComputedStyle(el).backgroundImage : '' }
  })
  ok(pos.survey >= 0 && pos.survey < pos.firstGroup, '① 목차 묶음보다 위 (먼저 보임)', `${pos.survey} < ${pos.firstGroup}`)
  ok(/gradient/.test(pos.bg), '① 다른 칸과 다른 색 (노란 띠) — 눈에 띄게')
  await shot(p, 's00_more_banner')
  await banner.click()
  await p.waitForTimeout(1200)
  ok(new URL(p.url()).pathname === '/newborn-survey', '① 누르면 바로 설문 (링크 없음)', p.url())
  ok(S.calls.some((c) => c.fn === 'biz_survey_my_open'), '① 서버 — 로그인한 계정으로 답지를 엶 (열쇠 없음)')
  const intro = flat(await p.textContent('[data-survey-intro]'))
  ok(/★ 뉴본펭귄 사전 설문/.test(intro) && /비원미래 AX 사업화 계획 사전 설문/.test(intro), '① 첫 화면 — 이름 · 제목')
  ok(/신용보증기금 뉴본펭귄 사업계획서/.test(intro) && /'미정'으로 선택하셔도 괜찮습니다/.test(intro), '① 첫 화면 안내문 그대로')
  ok(/두 분 중 한 분만 답해 주셔도 됩니다/.test(intro), '① 「두 분 중 한 분만」 안내')
  ok(/대표님 · 이사님/.test(flat(await p.textContent('[data-survey-me]'))), '① 답지 이름 — 대표님 · 이사님 (공동)')
  ok((await p.getAttribute('[data-survey-status]', 'data-survey-status')) === 'new', '① 진행상태 — 작성 전')
  const pr = flat(await p.textContent('[data-survey-progress]'))
  ok(/0 \/ 26 답함/.test(pr) && /남은 질문 26개/.test(pr), '① 위에 진행률 · 남은 질문 수 (26문항 전부)', pr)
  ok(/시작하기 · 핵심 질문 10개부터/.test(flat(await p.textContent('[data-survey-start="core"]'))), '① 큰 「시작하기」 (핵심 10개부터)')
  ok((await p.locator('[data-survey-exit]').count()) === 1, '① 앱으로 돌아가는 단추가 있음')
  await shot(p, 's01_intro')
  await p.click('[data-survey-start="core"]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q1', '① 핵심 질문 첫 번째 = Q1')
  ok((await p.locator('[data-survey-core]').count()) === 1, '① ★핵심 표시')
  ok((await p.locator('[role="radio"][aria-checked="true"]').count()) === 0, '① 아무것도 미리 골라 두지 않음 (기본값을 답으로 넣지 않음)')
  ok((await p.locator('[data-survey-detail]').count()) === 0, '① 「있음」을 고르기 전에는 세부 칸 없음')
  await p.click('[data-survey-opt="있음"]')
  await p.waitForTimeout(200)
  ok((await p.locator('[data-survey-detail]').count()) === 1, '① 「있음」 → 업체명 · 관계 칸이 나타남 (조건부)')
  await p.locator('[data-survey-detail] [data-survey-field="name"]').first().fill('경기 남부 ○○환경')
  await p.locator('[data-survey-detail] [data-survey-field="relation"]').first().fill('오래 알고 지낸 대표')
  await p.click('[data-survey-add]')
  await p.locator('[data-survey-detail] [data-survey-field="name"]').nth(1).fill('충청 ○○산업')
  await shot(p, 's02_q1_detail')
  const m1 = await measure(p)
  ok(m1.bad.length === 0 && m1.push <= 0, '① 질문 화면 — 눌림 · 화면 밖 없음', m1.bad.join(' ; '))
  ok(m1.small.length === 0, '① 누르는 것은 모두 44px 이상', m1.small.join(' ; '))
  await waitSaved(p)
  const a1 = A(S).q1
  ok(a1?.choice === '있음' && a1.rows?.length === 2 && a1.rows[1].name === '충청 ○○산업', '① 고르고 적은 것이 자동 저장됨 (여러 업체)', JSON.stringify(a1))
  ok(S.row.edited_by === '송명근', '① 서버 — 마지막 작성자 송명근')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q2', '① 다음 → Q2')
  ok(/1 \/ 26 답함/.test(flat(await p.textContent('[data-survey-progress]'))), '① 진행률이 바로 늘어남')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(250)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q3', '① 답하지 않고 넘어갈 수 있음 (Q2 → Q3)')
  ok(/30~50만원/.test(flat(await p.textContent('[data-survey-info]'))), '① Q3 검토안 안내문 먼저 보임')
  await p.click('[data-survey-opt="40~50만원"]')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(250)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q6', '① 핵심 순서 — Q6')
  await p.click('[data-survey-opt="보수적임"]')
  await p.waitForTimeout(150)
  ok((await p.locator('[data-survey-field="y1"]').count()) === 1, '① Q6 「보수적임」 → 1~3년차 숫자 칸')
  await p.fill('[data-survey-field="y1"]', '8개사')
  ok((await p.inputValue('[data-survey-field="y1"]')) === '8', '① 숫자 칸 — 숫자만 남김')
  await p.click('[data-survey-opt="적절함"]')
  await waitSaved(p)
  ok((await p.locator('[data-survey-field="y1"]').count()) === 0 && !A(S).q6?.fields, '① 「적절함」으로 바꾸면 숫자 칸이 닫히고 숨은 값도 저장 안 됨', JSON.stringify(A(S).q6))
  //  앱으로 돌아가기 — 들어온 화면(대시보드)으로
  await p.click('[data-survey-exit]')
  await p.waitForTimeout(900)
  ok(new URL(p.url()).pathname === '/', '① 「←」 → 앱으로 돌아감', p.url())
  await ctx.close()
}

// ═══ ② 이사님(사무실 계정)이 이어 쓰기 — 같은 답지 · 큰 글씨 ════════════════════════
{
  const { ctx, p } = await openStaff(S, '/', { role: 'office', w: 384, scale: 'xl' })
  await openMore(p)
  ok((await p.locator('[data-more-survey]:visible').count()) === 1, '② 사무실 계정 더보기에도 「★ 뉴본펭귄 사전 설문」')
  await p.locator('[data-more-survey]:visible').click()
  await p.waitForTimeout(1200)
  ok((await p.getAttribute('[data-survey-status]', 'data-survey-status')) === 'progress', '② 이사님이 열면 — 작성 중 (같은 답지)')
  ok(/3 \/ 26 답함/.test(flat(await p.textContent('[data-survey-progress]'))), '② 대표님이 답한 것이 그대로', flat(await p.textContent('[data-survey-progress]')))
  ok(/마지막 작성 송명근/.test(flat(await p.textContent('[data-survey-me]'))), '② 누가 마지막으로 썼는지 보임')
  ok(/이어서 — 핵심 질문 7개 남음/.test(flat(await p.textContent('[data-survey-start="core"]'))), '② 「이어서」 (남은 핵심 질문 수)', flat(await p.textContent('[data-survey-start="core"]')))
  await p.click('[data-survey-start="core"]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q2', '② 아직 안 한 첫 핵심 질문(Q2)부터')
  //  Q5 복수선택 — 최대 3개 권장 · 기타 칸
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '동종업체가 가장 필요로 하는 기능' }).click()
  await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q5', '② 목록에서 Q5 로 바로 이동')
  for (const v of ['수거·배차·기사 일정관리', '자재·재고 관리', '청구·입금·미수금 관리', '기타']) await p.click(`[data-survey-opt="${v}"]`)
  ok((await p.locator('[data-survey-overpick]').count()) === 1, '② 3개 넘게 고르면 「3개 이내 권장」 안내 (막지는 않음)')
  await p.fill('[data-survey-field="other"]', '차량 정비 기록')
  await waitSaved(p)
  ok(A(S).q5?.picks?.length === 4 && A(S).q5.other === '차량 정비 기록' && A(S).q1?.choice === '있음', '② 이사님 답이 같은 답지에 더해짐 (대표님 답 그대로)', JSON.stringify(A(S).q5))
  ok(S.row.edited_by === '홍현주', '② 서버 — 마지막 작성자 홍현주')
  //  Q25 — 공동 답지에서는 누구나 (이사님 경력) · 안내 문구
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '홍현주 이사님 주요 경력' }).click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-survey-field="career"]').count()) === 1 && (await p.locator('[data-survey-notmine]').count()) === 0, '② Q25 — 공동 답지라 칸이 열림')
  ok(/대표님이 답하시는 경우/.test(flat(await p.textContent('[data-survey-shared-note]'))), '② Q25 — 한 분이 답할 때 안내')
  ok(/주민등록번호/.test(flat(await p.textContent('[data-survey-q]'))), '② 민감정보는 받지 않는다고 안내')
  await p.fill('[data-survey-field="edu"]', '○○대학교 환경공학')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q26', '② Q26 서류 준비 현황')
  ok((await p.locator('[data-survey-row]').count()) === 10, '② 서류 10가지 줄')
  ok((await p.locator('input[type="file"]').count()) === 0, '② 파일 올리는 칸이 없음')
  await p.locator('[data-survey-row="최신 매출현황"] [data-survey-cell="준비 완료"]').click()
  await p.locator('[data-survey-row="특허출원 자료"] [data-survey-cell="준비 중"]').click()
  await p.waitForTimeout(350)
  await shot(p, 's04_q26_xl')
  const m2 = await measure(p)
  ok(m2.bad.length === 0 && m2.push <= 0, '② 가장 큰 글씨 — 표 질문 눌림 · 화면 밖 없음', m2.bad.join(' ; '))
  ok(m2.small.length === 0, '② 가장 큰 글씨 — 누르는 것 44px 이상', m2.small.join(' ; '))
  await waitSaved(p)
  ok(A(S).q26?.grid?.['최신 매출현황'] === '준비 완료' && A(S).q25?.fields?.edu, '② 표 · 경력 저장')
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '총 필요자금' }).click()
  await p.waitForTimeout(300)
  await p.click('[data-survey-opt="협의 필요"]')
  await waitSaved(p)
  await ctx.close()
}

// ═══ ③ 저장 실패 — 폰에 보관 → 다시 저장 ═════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Seoul' })
  const state = { profile: { ...W.profileFor('admin'), name: NAME.admin, font_scale: 'lg' }, reqs: 0, writes: [], schemaVersion: 106 }
  W.wire(ctx, state)
  wireSurvey(ctx, S, 'admin')
  const { p } = await openStaff(S, '/newborn-survey', { ctx })
  await p.click('[data-survey-start="all"]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '신규 기사 채용' }).click()
  await p.waitForTimeout(300)
  S.failSave = true
  await p.click('[data-survey-opt="1명"]')
  await p.waitForTimeout(1300)
  ok((await p.getAttribute('[data-survey-save]', 'data-survey-save')) === 'error', '③ 서버에 못 닿으면 「저장 안 됨 · 다시」')
  const backup = await p.evaluate(() => localStorage.getItem('beonemirae-ops:biz-survey:shared'))
  ok(!!backup && /1명/.test(backup), '③ 그동안 이 폰에 잠시 보관')
  await shot(p, 's03_save_error')
  S.failSave = false
  await p.click('[data-survey-save="error"]')
  await p.waitForTimeout(900)
  ok(A(S).q19?.choice === '1명', '③ 「다시」 → 서버에 저장됨')
  ok((await p.evaluate(() => localStorage.getItem('beonemirae-ops:biz-survey:shared'))) === null, '③ 저장되면 폰 보관본은 지움')
  S.failSave = true
  await p.click('[data-survey-opt="2명"]')
  await p.waitForTimeout(1200)
  await p.close()
  S.failSave = false
  const p2 = await ctx.newPage()
  await p2.goto(`${W.BASE}/newborn-survey`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(2200)
  ok(A(S).q19?.choice === '2명', '③ 저장 못 하고 닫았어도 다시 열면 폰 보관본으로 이어서 저장', JSON.stringify(A(S).q19))
  await ctx.close()
}

// ═══ ④ 확인 → 제출 → 감사 → 제출 후 수정 ═══════════════════════════════════
{
  const { ctx, p } = await openStaff(S, '/newborn-survey')
  await p.click('[data-survey-start="review"]')
  await p.waitForTimeout(400)
  const review = flat(await p.textContent('[data-survey-review]'))
  ok(/답변 확인/.test(review) && /SECTION 07/.test(review), '④ 확인 화면 — 7개 섹션 한눈에')
  ok((await p.locator('[data-survey-review-q]').count()) === 26 && (await p.locator('[data-survey-edit]').count()) === 26, '④ 26문항이 모두 보이고 모두 고칠 수 있음')
  ok(/추후 확인/.test(review) && /경기 남부 ○○환경/.test(review), '④ 안 고른 것은 「추후 확인」 · 세부 입력도 요약에')
  await shot(p, 's05_review')
  await p.click('[data-survey-submit]')
  await p.waitForTimeout(800)
  const done = flat(await p.textContent('[data-survey-done]'))
  ok(/응답해 주셔서 감사합니다/.test(done) && /미정으로 선택하신 항목은 추후 함께 검토하겠습니다/.test(done), '④ 제출 → 감사 문구 그대로')
  ok(S.row.status === 'submitted' && S.revisions.length === 1, '④ 서버 — 제출 완료 · 이력 1')
  ok((await p.locator('[data-survey-home]').count()) === 1, '④ 「앱으로 돌아가기」 단추')
  await shot(p, 's06_done')
  await p.click('[data-survey-again]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-edit="q22"]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q22', '④ 「수정」 → 그 질문으로')
  await p.click('[data-survey-opt="5억원"]')
  ok(/확인 화면으로/.test(flat(await p.textContent('[data-survey-next]'))), '④ 고친 뒤 「확인 화면으로」')
  await waitSaved(p)
  ok(A(S).q22?.choice === '5억원' && S.row.status === 'submitted', '④ 제출 뒤 고쳐도 자동 저장 · 제출 상태 유지')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok(/수정한 내용으로 다시 제출/.test(flat(await p.textContent('[data-survey-submit]'))), '④ 다시 제출 단추')
  await p.click('[data-survey-submit]')
  await p.waitForTimeout(700)
  ok(S.revisions.length === 2, '④ 다시 제출 → 이력 2')
  await p.click('[data-survey-home]')
  await p.waitForTimeout(800)
  ok(new URL(p.url()).pathname !== '/newborn-survey', '④ 「앱으로 돌아가기」 → 설문을 나감', p.url())
  //  제출 뒤 한 번 더 고쳐 두기 — 관리 화면 「제출 후 수정 중」
  await p.goto(`${W.BASE}/newborn-survey`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  ok((await p.getAttribute('[data-survey-status]', 'data-survey-status')) === 'submitted', '④ 다시 열면 — 제출 완료')
  ok(/답변 확인 · 수정하기/.test(flat(await p.textContent('[data-survey-start="review"]'))), '④ 제출 뒤 첫 단추 — 답변 확인 · 수정하기')
  await ctx.close()
}

// ═══ ⑤ 관리자 — 사용자 피드백 화면 첫 칸 「★ 뉴본펭귄 사전 설문」 · 결과 · 복사 · 내보내기 ═══
{
  const { ctx, p } = await openStaff(S, '/dev-requests', { w: 1280, scale: 'normal' })
  const tabs = await p.locator('[data-devreq-view]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-devreq-view'), (e.innerText ?? '').replace(/\u00a0/g, ' ').trim()]))
  ok(tabs[0]?.[0] === 'survey' && tabs[1]?.[0] === 'feedback', '⑤ 첫 칸이 설문 · 두 번째가 사용자 피드백', JSON.stringify(tabs))
  ok(tabs[0]?.[1] === '★ 뉴본펭귄 사전 설문', '⑤ 이름 「★ 뉴본펭귄 사전 설문」', tabs[0]?.[1])
  ok((await p.locator('[data-devreq-view="survey"][aria-selected="true"]').count()) === 1, '⑤ 들어가면 설문이 먼저 열림')
  const tabBg = await p.locator('[data-devreq-view="survey"]').evaluate((e) => getComputedStyle(e).backgroundColor)
  const fbBg = await p.locator('[data-devreq-view="feedback"]').evaluate((e) => getComputedStyle(e).backgroundColor)
  ok(tabBg !== fbBg, '⑤ 설문 칸은 다른 색 (강조)', `${tabBg} / ${fbBg}`)
  await p.waitForTimeout(600)
  const card = '[data-survey-admin-card="shared"]'
  ok((await p.getAttribute(card, 'data-survey-admin-status')) === 'submitted' || (await p.getAttribute(card, 'data-survey-admin-status')) === 'edited', '⑤ 상태 — 제출 완료', await p.getAttribute(card, 'data-survey-admin-status'))
  const ct = flat(await p.textContent(card))
  ok(/마지막 작성 송명근/.test(ct), '⑤ 마지막 작성자', ct.slice(0, 160))
  ok(/제출 이력 2회/.test(ct) && /최종 수정/.test(ct) && /일부 미응답/.test(ct), '⑤ 제출 이력 · 최종 수정 · 일부 미응답')
  ok(/한 분만/.test(ct), '⑤ 「두 분 중 한 분만」 안내')
  ok((await p.getAttribute('[data-survey-start-link]', 'href')) === '/newborn-survey' && /답변 확인 · 수정하기/.test(flat(await p.textContent('[data-survey-start-link]'))),
    '⑤ 여기서도 바로 「답변 확인 · 수정하기」 (링크 만들기 없음)')
  ok((await p.locator('[data-survey-issue], [data-survey-issued-link], [data-survey-revoke]').count()) === 0, '⑤ 링크 발급 · 폐기 단추가 없음')
  const q3 = flat(await p.textContent('[data-survey-result-q="q3"]'))
  ok(/40~50만원/.test(q3), '⑤ 질문별 답이 그대로 보임 (Q3)', q3)
  ok(/경기 남부 ○○환경/.test(flat(await p.textContent('[data-survey-result-q="q1"]'))) && /준비 완료/.test(flat(await p.textContent('[data-survey-result-q="q26"]'))),
    '⑤ 세부 입력 · 표 답도 보임 (두 분이 쓴 것 모두)')
  ok((await p.locator('[data-survey-result-q]').count()) === 26, '⑤ 26문항 전부')
  await p.locator('[data-survey-filter="open"]').click()
  await p.waitForTimeout(300)
  const openIds = await p.locator('[data-survey-result-q]').evaluateAll((els) => els.map((e) => e.getAttribute('data-survey-result-q')))
  ok(openIds.includes('q2') && !openIds.includes('q3') && !openIds.includes('q1'), '⑤ 미정 · 미응답만 모아 보기', openIds.join(','))
  await shot(p, 's07_admin_pc')
  await p.click('[data-survey-copy-all]')
  await p.waitForTimeout(400)
  const all = await p.evaluate(() => navigator.clipboard.readText())
  ok(/뉴본펭귄 사전 설문 — 비원미래 AX 사업화 계획 사전 설문 · 답변 정리/.test(all) && /Q3\. 월 구독료 ★/.test(all) && /- 40~50만원/.test(all) && /마지막 작성 송명근/.test(all),
    '⑤ 「전체 답변 복사」 — 문서 형태', all.slice(0, 160))
  ok(/추후 확인 \(미응답\)/.test(all), '⑤ 빈 답은 「추후 확인」으로 적힘')
  await p.click('[data-survey-copy-open]')
  await p.waitForTimeout(400)
  const open = await p.evaluate(() => navigator.clipboard.readText())
  ok(/미확정 사항/.test(open) && /Q2\./.test(open) && !/Q3\. 월 구독료/.test(open), '⑤ 「미확정 사항 복사」 — 미정·미응답만', open.slice(0, 100))
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('[data-survey-json]')])
  const js = JSON.parse(await fs.readFile(await dj.path(), 'utf8'))
  ok(js.response.answers.q3.choice === '40~50만원' && js.response.edited_by === '송명근' && js.questions.length === 26, '⑤ JSON 내보내기 — 답지 하나 · 26문항')
  const [dc] = await Promise.all([p.waitForEvent('download'), p.click('[data-survey-csv]')])
  const csv = await fs.readFile(await dc.path(), 'utf8')
  ok(csv.charCodeAt(0) === 0xfeff && /"섹션","번호","질문"/.test(csv) && csv.split('\r\n').length === 27, '⑤ CSV 내보내기 — 엑셀용 BOM · 머리줄 + 26줄', String(csv.split('\r\n').length))
  //  기존 사용자 피드백은 두 번째 칸에 그대로
  await p.click('[data-devreq-view="feedback"]')
  await p.waitForTimeout(800)
  ok(/tab=feedback/.test(p.url()) && /사용자 피드백/.test(flat(await p.textContent('main'))) && (await p.locator('[data-survey-admin]').count()) === 0,
    '⑤ 「사용자 피드백」 칸 — 기존 화면 그대로 (?tab=feedback)')
  await ctx.close()
}
{
  //  관리자 화면 — 폰에서도
  const { ctx, p } = await openStaff(S, '/dev-requests', { w: 390, scale: 'lg' })
  await p.waitForTimeout(600)
  ok((await p.locator('[data-survey-admin-card="shared"]').count()) === 1, '⑤ 폰 — 설문 칸이 먼저')
  const m = await measure(p, '[data-survey-admin]')
  ok(m.bad.length === 0 && m.push <= 0, '⑤ 폰 관리자 화면 — 눌림 · 화면 밖 없음', m.bad.join(' ; '))
  await shot(p, 's08_admin_phone')
  await ctx.close()
}
{
  //  PC — 사이드바에도 「★ 뉴본펭귄 사전 설문」
  const { ctx, p } = await openStaff(S, '/', { w: 1280, scale: 'normal' })
  const pin = p.locator('[data-side-survey]')
  ok((await pin.count()) === 1 && /★ 뉴본펭귄 사전 설문/.test(flat(await pin.textContent())), '⑤ PC 사이드바 — 「★ 뉴본펭귄 사전 설문」')
  await pin.click()
  await p.waitForTimeout(1000)
  ok(new URL(p.url()).pathname === '/newborn-survey', '⑤ PC — 누르면 바로 설문')
  await ctx.close()
}

// ═══ ⑥ 권한 — 현장 계정 · 서버 막힘 · SQL 실행 전 · 미리보기 ═════════════════════
{
  const S2 = makeServer()
  const { ctx, p } = await openStaff(S2, '/', { role: 'field' })
  await openMore(p)
  ok((await p.locator('[data-more-survey]:visible').count()) === 0, '⑥ 현장 계정 — 더보기에 설문이 없음')
  await p.goto(`${W.BASE}/newborn-survey`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1000)
  ok((await p.locator('[data-survey-intro], [data-survey-q]').count()) === 0, '⑥ 현장 계정 — 주소로 들어가도 안 열림')
  ok(S2.calls.every((c) => !c.fn.startsWith('biz_survey_my_')), '⑥ 현장 계정 — 답지를 부르지도 않음')
  await ctx.close()
}
{
  const S3 = makeServer()
  const { ctx, p } = await openStaff(S3, '/dev-requests', { role: 'office' })
  ok((await p.locator('[data-survey-admin]').count()) === 0 && S3.calls.every((c) => c.fn !== 'biz_survey_admin_load'), '⑥ 사무실 계정 — 관리 화면(결과 모아 보기)은 안 열림')
  await ctx.close()
}
{
  const S4 = makeServer()
  S4.mode = 'missing'
  const { ctx, p } = await openStaff(S4, '/newborn-survey')
  ok((await p.getAttribute('[data-survey-fail]', 'data-survey-fail')) === 'missing' && /PROPOSAL_0145/.test(flat(await p.textContent('[data-survey-fail]'))),
    '⑥ SQL 실행 전 — 설문 화면에 「0145 실행 필요」 (깨지지 않음)')
  ok((await p.locator('[data-survey-fail] [data-survey-exit]').count()) === 1, '⑥ 그때도 앱으로 돌아가는 단추')
  await p.goto(`${W.BASE}/dev-requests`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  ok((await p.getAttribute('[data-survey-admin-error]', 'data-survey-admin-error')) === 'missing' && /PROPOSAL_0145_newborn_survey_inapp\.sql/.test(flat(await p.textContent('main'))),
    '⑥ SQL 실행 전 — 관리 화면에 실행 순서 안내')
  await ctx.close()
}
{
  const S5 = makeServer()
  S5.mode = 'denied'
  const { ctx, p } = await openStaff(S5, '/dev-requests', { w: 1280, scale: 'normal' })
  ok((await p.getAttribute('[data-survey-admin-error]', 'data-survey-admin-error')) === 'denied' && (await p.locator('[data-survey-results]').count()) === 0,
    '⑥ 서버가 설문 관리자로 인정하지 않으면 — 답이 하나도 안 보임')
  await ctx.close()
}
{
  const S6 = makeServer()
  const { ctx, p } = await openStaff(S6, '/dev-requests', { w: 1280, scale: 'normal' })
  await p.click('[data-survey-preview-link]')
  await p.waitForTimeout(900)
  ok((await p.locator('[data-survey-preview]').count()) === 1 && /저장되지 않습니다/.test(flat(await p.textContent('[data-survey-preview]'))), '⑥ 관리자 미리보기 — 「저장되지 않습니다」')
  await p.click('[data-survey-start="core"]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-opt="있음"]')
  await p.waitForTimeout(1200)
  ok(S6.calls.filter((c) => /my_|open|save|submit/.test(c.fn)).length === 0, '⑥ 미리보기 — 서버에 아무것도 저장하지 않음')
  await p.click('[data-survey-preview-close]')
  await p.waitForTimeout(700)
  ok(new URL(p.url()).pathname === '/dev-requests', '⑥ 미리보기 닫기 → 설문 관리 화면으로')
  await ctx.close()
}

await b.close()
