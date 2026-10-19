import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'
import * as F from './perf_fixtures.mjs'

//  사업계획서 사전 설문 (0144) — 폰에서 끝까지 · 관리자 비교/복사/내보내기
//
//   대표님 · 이사님이 카카오톡 링크로 폰에서 엽니다. 이 검사는 실제 폰 크기(390 · 384)
//   에서 처음 화면 → 질문 → 조건부 칸 → 자동 저장 → 닫고 다시 열기 → 확인 → 제출 →
//   제출 후 수정까지 손가락으로 눌러 봅니다.
//
//   ⚠ 서버(biz_survey_*)는 여기서 **흉내**만 냅니다. 권한 · 열쇠 해시 · 만료 · 폐기 ·
//     두 분 답 분리의 진짜 검증은 supabase/test/51_biz_survey.sql 이 로컬 PostgreSQL
//     에서 합니다. 여기서는 화면이 그 약속대로 부르고 그리는지를 봅니다.
//   ⚠ 가짜 자료입니다. 화면 모양을 재는 데만 씁니다.

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const SHOTS = process.env.SHOTS

const b = await chromium.launch({ executablePath: EXEC })

const TOK = { ceo: 'tok_ceo_AAAAAAAAAAAAAAAAAAAAAAAAAAAA', director: 'tok_dir_BBBBBBBBBBBBBBBBBBBBBBBBBBBB' }

/** 설문 서버 흉내 — 한 검사 안에서 여러 창이 같은 서버를 봅니다 */
function makeServer() {
  return {
    invites: [
      { id: 'i1', respondent: 'ceo', token: TOK.ceo, created_at: '2026-10-19T01:00:00Z', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, last_used_at: null },
      { id: 'i2', respondent: 'director', token: TOK.director, created_at: '2026-10-19T01:00:00Z', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, last_used_at: null },
    ],
    responses: {},
    revisions: [],
    calls: [],
    failSave: false,
    adminMode: 'ok', // 'ok' | 'denied' | 'missing'
    seq: 0,
  }
}

function wireSurvey(ctx, S) {
  ctx.route('**/rest/v1/rpc/biz_survey_*', async (r) => {
    const url = r.request().url()
    const fn = url.split('/rpc/')[1].split('?')[0]
    const body = JSON.parse(r.request().postData() || '{}')
    const send = (status, v) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) })
    S.calls.push({ fn, body })
    const now = () => new Date(Date.now() + (S.seq++)).toISOString()
    const resolve = (t) => S.invites.find((i) => i.token === t && !i.revoked_at && Date.parse(i.expires_at) > Date.now())
    if (['biz_survey_open', 'biz_survey_save', 'biz_survey_submit'].includes(fn)) {
      const inv = resolve(body.p_token)
      if (!inv) return send(400, { code: '28000', message: '설문 링크가 올바르지 않거나 만료되었습니다.' })
      inv.last_used_at = now()
      const who = inv.respondent
      S.responses[who] ??= { respondent: who, answers: {}, status: 'draft', updated_at: now(), submitted_at: null, first_submitted_at: null }
      const row = S.responses[who]
      if (fn === 'biz_survey_open') return send(200, { ...row, expires_at: inv.expires_at })
      if (fn === 'biz_survey_save') {
        if (S.failSave) return r.abort('failed')
        row.answers = body.p_answers
        row.updated_at = now()
        return send(200, { updated_at: row.updated_at })
      }
      const at = now()
      row.answers = body.p_answers
      row.status = 'submitted'
      row.updated_at = at
      row.submitted_at = at
      row.first_submitted_at ??= at
      S.revisions.push({ id: `v${S.revisions.length + 1}`, respondent: who, submitted_at: at })
      return send(200, { updated_at: at, submitted_at: at })
    }
    if (S.adminMode === 'missing') return send(404, { code: 'PGRST202', message: 'Could not find the function public.' + fn })
    if (S.adminMode === 'denied') return send(403, { code: '42501', message: '설문 관리자만 볼 수 있습니다.' })
    if (fn === 'biz_survey_admin_load')
      return send(200, {
        responses: Object.values(S.responses),
        invites: S.invites.map(({ token, ...x }) => x),
        revisions: [...S.revisions].reverse(),
      })
    if (fn === 'biz_survey_issue_invite') {
      for (const i of S.invites) if (i.respondent === body.p_respondent && !i.revoked_at) i.revoked_at = now()
      const token = `tok_new_${body.p_respondent}_CCCCCCCCCCCCCCCCCCCCCC`
      const exp = new Date(Date.now() + body.p_days * 86400_000).toISOString()
      S.invites.push({ id: `i${S.invites.length + 1}`, respondent: body.p_respondent, token, created_at: now(), expires_at: exp, revoked_at: null, last_used_at: null })
      return send(200, { id: `i${S.invites.length}`, respondent: body.p_respondent, token, expires_at: exp })
    }
    if (fn === 'biz_survey_revoke_invite') {
      const i = S.invites.find((x) => x.id === body.p_id)
      if (i && !i.revoked_at) i.revoked_at = now()
      return send(200, null)
    }
    return send(404, { code: 'PGRST202', message: 'unknown' })
  })
}

/** 링크로 여는 사람 — 로그인 없음 */
async function openLink(S, token, { w = 390, scale = 'lg', ctx: reuse } = {}) {
  const ctx = reuse ?? (await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Seoul' }))
  if (!reuse) {
    const state = { profile: { ...W.profileFor('admin'), font_scale: scale }, reqs: 0, writes: [], schemaVersion: 106 }
    W.wire(ctx, state)
    wireSurvey(ctx, S)
  }
  const p = await ctx.newPage()
  await p.goto(`${W.BASE}/survey/${token}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  return { ctx, p }
}

/** 로그인한 관리자 화면 */
async function openStaff(S, path, { w = 1280, role = 'admin', scale = 'normal' } = {}) {
  const phone = w < 700
  const ctx = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, timezoneId: 'Asia/Seoul', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
  const state = { profile: { ...W.profileFor(role), font_scale: scale }, reqs: 0, writes: [], schemaVersion: 106 }
  W.wire(ctx, state)
  wireSurvey(ctx, S)
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
const measure = (p) =>
  p.evaluate(() => {
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
    const small = [...document.querySelectorAll('[data-survey] button, [data-survey] input, [data-survey] select, [data-survey] textarea')]
      .filter(vis).filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 14))
    return { bad: [...new Set(bad)].slice(0, 5), push: document.documentElement.scrollWidth - docW, small: [...new Set(small)].slice(0, 5) }
  })

const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png` })
const answersOf = (S, who) => S.responses[who]?.answers ?? {}
const waitSaved = async (p) => {
  await p.waitForTimeout(1100)
}

// ═══ ① 첫 화면 → 핵심 질문 → 조건부 칸 → 자동 저장 (대표님 · 폰) ═══════════════
const S = makeServer()
{
  const { ctx, p } = await openLink(S, TOK.ceo)
  const intro = flat(await p.textContent('[data-survey-intro]'))
  ok(/비원미래 AX 사업화 계획 사전 설문/.test(intro), '① 첫 화면 제목')
  ok(/신용보증기금 뉴본펭귄 사업계획서/.test(intro) && /'미정'으로 선택하셔도 괜찮습니다/.test(intro), '① 첫 화면 안내문 그대로')
  ok(/송명근 대표님/.test(flat(await p.textContent('[data-survey-me]'))), '① 응답자 이름 표시')
  ok((await p.getAttribute('[data-survey-status]', 'data-survey-status')) === 'new', '① 진행상태 — 작성 전')
  ok(/0 \/ 25 답함/.test(flat(await p.textContent('[data-survey-progress]'))) && /남은 질문 25개/.test(flat(await p.textContent('[data-survey-progress]'))),
    '① 위에 진행률 · 남은 질문 수 (대표님 25문항 — 이사님 경력 문항 제외)', flat(await p.textContent('[data-survey-progress]')))
  await shot(p, 's01_intro')
  ok(/핵심 질문부터 시작 \(10개\)/.test(flat(await p.textContent('[data-survey-start="core"]'))), '① 핵심 질문 먼저 유도 (10개)')
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
  const a1 = answersOf(S, 'ceo').q1
  ok(a1?.choice === '있음' && a1.rows?.length === 2 && a1.rows[1].name === '충청 ○○산업', '① 고르고 적은 것이 자동 저장됨 (여러 업체)', JSON.stringify(a1))
  //  다음 → Q2 · 진행률
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q2', '① 다음 → Q2')
  ok(/1 \/ 25 답함/.test(flat(await p.textContent('[data-survey-progress]'))), '① 진행률이 바로 늘어남')
  //  답하지 않고 넘어가기 → 추후 확인
  await p.click('[data-survey-next]')
  await p.waitForTimeout(250)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q3', '① 답하지 않고 넘어갈 수 있음 (Q2 → Q3)')
  ok(/30~50만원/.test(flat(await p.textContent('[data-survey-info]'))), '① Q3 검토안 안내문 먼저 보임')
  await p.click('[data-survey-opt="40~50만원"]')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(250)
  //  Q6 — 수정 의견일 때만 숫자 칸
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q6', '① 핵심 순서 — Q6')
  ok(/사업계획용 가정|사업계획서에 쓰는 가정/.test(flat(await p.textContent('[data-survey-info]'))), '① Q6 — 확정 실적이 아닌 가정임을 밝힘')
  await p.click('[data-survey-opt="보수적임"]')
  await p.waitForTimeout(150)
  ok((await p.locator('[data-survey-field="y1"]').count()) === 1, '① Q6 「보수적임」 → 1~3년차 숫자 칸')
  await p.fill('[data-survey-field="y1"]', '8개사')
  ok((await p.inputValue('[data-survey-field="y1"]')) === '8', '① 숫자 칸 — 숫자만 남김')
  await p.click('[data-survey-opt="적절함"]')
  await waitSaved(p)
  ok((await p.locator('[data-survey-field="y1"]').count()) === 0 && !answersOf(S, 'ceo').q6?.fields, '① 「적절함」으로 바꾸면 숫자 칸이 닫히고 숨은 값도 저장 안 됨', JSON.stringify(answersOf(S, 'ceo').q6))
  await ctx.close()
}

// ═══ ② 닫았다가 다시 열기 — 이어서 ═══════════════════════════════════════════
{
  const { ctx, p } = await openLink(S, TOK.ceo)
  ok((await p.getAttribute('[data-survey-status]', 'data-survey-status')) === 'progress', '② 다시 열면 — 작성 중')
  ok(/3 \/ 25 답함/.test(flat(await p.textContent('[data-survey-progress]'))), '② 답한 개수 그대로', flat(await p.textContent('[data-survey-progress]')))
  await p.click('[data-survey-start="core"]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q2', '② 「이어서」 → 아직 안 한 첫 핵심 질문(Q2)부터')
  //  Q5 복수선택 — 최대 3개 권장 · 기타 칸
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '동종업체가 가장 필요로 하는 기능' }).click()
  await p.waitForTimeout(400)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q5', '② 목록에서 Q5 로 바로 이동')
  for (const v of ['수거·배차·기사 일정관리', '자재·재고 관리', '청구·입금·미수금 관리', '기타']) await p.click(`[data-survey-opt="${v}"]`)
  ok((await p.locator('[data-survey-overpick]').count()) === 1, '② 3개 넘게 고르면 「3개 이내 권장」 안내 (막지는 않음)')
  ok((await p.locator('[data-survey-field="other"]').count()) === 1, '② 「기타」 → 적는 칸')
  await p.fill('[data-survey-field="other"]', '차량 정비 기록')
  await waitSaved(p)
  const a5 = answersOf(S, 'ceo').q5
  ok(a5?.picks?.length === 4 && a5.other === '차량 정비 기록', '② 복수선택 · 기타 저장', JSON.stringify(a5))
  //  미정 · 나중에
  await p.click('[data-survey-next]')
  await p.waitForTimeout(250)
  await p.click('[data-survey-next]') // q7 → q8? (순서: 전체 차례) q6 → q7
  await p.waitForTimeout(250)
  const qid = await p.getAttribute('[data-survey-q]', 'data-survey-q')
  ok(qid === 'q7', '② 목록에서 간 뒤에는 차례대로 (Q5 → Q6 → Q7)', qid)
  await ctx.close()
}

// ═══ ③ 저장 실패 — 폰에 보관 → 다시 저장 ═════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Seoul' })
  const state = { profile: { ...W.profileFor('admin'), font_scale: 'lg' }, reqs: 0, writes: [], schemaVersion: 106 }
  W.wire(ctx, state)
  wireSurvey(ctx, S)
  const { p } = await openLink(S, TOK.ceo, { ctx })
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
  const backup = await p.evaluate(() => localStorage.getItem('beonemirae-ops:biz-survey:ceo'))
  ok(!!backup && /1명/.test(backup), '③ 그동안 이 폰에 잠시 보관')
  await shot(p, 's03_save_error')
  S.failSave = false
  await p.click('[data-survey-save="error"]')
  await p.waitForTimeout(900)
  ok(answersOf(S, 'ceo').q19?.choice === '1명', '③ 「다시」 → 서버에 저장됨')
  ok((await p.evaluate(() => localStorage.getItem('beonemirae-ops:biz-survey:ceo'))) === null, '③ 저장되면 폰 보관본은 지움')
  //  보관본만 남기고 닫은 경우 — 다시 열면 그것으로 이어서 저장
  S.failSave = true
  await p.click('[data-survey-opt="2명"]')
  await p.waitForTimeout(1200)
  await p.close()
  S.failSave = false
  const p2 = await ctx.newPage()
  await p2.goto(`${W.BASE}/survey/${TOK.ceo}`, { waitUntil: 'domcontentloaded' })
  await p2.waitForTimeout(1500)
  ok(answersOf(S, 'ceo').q19?.choice === '2명', '③ 저장 못 하고 닫았어도 다시 열면 폰 보관본으로 이어서 저장', JSON.stringify(answersOf(S, 'ceo').q19))
  await ctx.close()
}

// ═══ ④ 이사님 — 따로 · Q25 · 표 질문 ════════════════════════════════════════
{
  const { ctx, p } = await openLink(S, TOK.director, { w: 384, scale: 'xl' })
  ok(/홍현주 이사님/.test(flat(await p.textContent('[data-survey-me]'))), '④ 이사님 링크 → 이사님 답지')
  ok(/0 \/ 26 답함/.test(flat(await p.textContent('[data-survey-progress]'))), '④ 이사님은 26문항 · 대표님 답이 안 섞임', flat(await p.textContent('[data-survey-progress]')))
  await p.click('[data-survey-start="all"]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '홍현주 이사님 주요 경력' }).click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-survey-field="career"]').count()) === 1, '④ 이사님 — 경력 칸')
  ok(/주민등록번호/.test(flat(await p.textContent('[data-survey-q]'))), '④ 민감정보는 받지 않는다고 안내')
  await p.fill('[data-survey-field="edu"]', '○○대학교 환경공학')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q26', '④ Q26 서류 준비 현황')
  ok((await p.locator('[data-survey-row]').count()) === 10, '④ 서류 10가지 줄')
  ok(/원본 서류는 이 설문에 첨부하지 마세요/.test(flat(await p.textContent('[data-survey-q]'))), '④ 원본 서류 첨부 받지 않음 안내')
  ok((await p.locator('input[type="file"]').count()) === 0, '④ 파일 올리는 칸이 없음')
  await p.locator('[data-survey-row="최신 매출현황"] [data-survey-cell="준비 완료"]').click()
  await p.locator('[data-survey-row="특허출원 자료"] [data-survey-cell="준비 중"]').click()
  await p.waitForTimeout(350)
  ok((await p.locator('[data-survey-row="특허출원 자료"] [data-survey-cell="준비 중"][aria-pressed="true"]').count()) === 1, '④ 고른 칸이 눌린 상태로 보임')
  await shot(p, 's04_q26_xl')
  const m4 = await measure(p)
  ok(m4.bad.length === 0 && m4.push <= 0, '④ 가장 큰 글씨 — 표 질문 눌림 · 화면 밖 없음', m4.bad.join(' ; '))
  ok(m4.small.length === 0, '④ 가장 큰 글씨 — 누르는 것 44px 이상', m4.small.join(' ; '))
  await waitSaved(p)
  ok(answersOf(S, 'director').q26?.grid?.['최신 매출현황'] === '준비 완료' && answersOf(S, 'director').q25?.fields?.edu, '④ 이사님 답 저장')
  ok(!answersOf(S, 'ceo').q25 && answersOf(S, 'ceo').q26 == null, '④ 대표님 답지에는 그대로 없음 (섞이지 않음)')
  //  Q3 를 대표님과 다르게
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '월 구독료' }).click()
  await p.waitForTimeout(300)
  await p.click('[data-survey-opt="60~80만원"]')
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '총 필요자금' }).click()
  await p.waitForTimeout(300)
  await p.click('[data-survey-opt="협의 필요"]')
  await waitSaved(p)
  await ctx.close()
}
{
  //  대표님께 Q25 는 「이사님 확인 항목」으로만
  const { ctx, p } = await openLink(S, TOK.ceo)
  await p.click('[data-survey-start="all"]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-toc]')
  await p.waitForTimeout(400)
  await p.locator('[data-survey-toc-list] button', { hasText: '홍현주 이사님 주요 경력' }).click()
  await p.waitForTimeout(300)
  ok((await p.locator('[data-survey-notmine]').count()) === 1 && (await p.locator('[data-survey-field="career"]').count()) === 0,
    '④ 대표님 — Q25 는 「이사님 확인 항목」 안내만, 칸 없음')
  await ctx.close()
}

// ═══ ⑤ 확인 → 제출 → 감사 → 제출 후 수정 ═══════════════════════════════════
{
  const { ctx, p } = await openLink(S, TOK.ceo)
  await p.click('[data-survey-start="review"]')
  await p.waitForTimeout(400)
  const review = flat(await p.textContent('[data-survey-review]'))
  ok(/답변 확인/.test(review) && /SECTION 07/.test(review), '⑤ 확인 화면 — 7개 섹션 한눈에')
  ok((await p.locator('[data-survey-review-q]').count()) === 26, '⑤ 26문항이 모두 보임')
  ok(/추후 확인/.test(review), '⑤ 안 고른 것은 「추후 확인」')
  ok(/경기 남부 ○○환경/.test(review), '⑤ 세부 입력도 요약에 보임')
  await shot(p, 's05_review')
  await p.click('[data-survey-submit]')
  await p.waitForTimeout(800)
  const done = flat(await p.textContent('[data-survey-done]'))
  ok(/응답해 주셔서 감사합니다/.test(done) && /미정으로 선택하신 항목은 추후 함께 검토하겠습니다/.test(done), '⑤ 제출 → 감사 문구 그대로')
  ok(S.responses.ceo.status === 'submitted' && S.revisions.length === 1, '⑤ 서버 — 제출 완료 · 이력 1')
  await shot(p, 's06_done')
  //  제출 후 수정
  await p.click('[data-survey-again]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-edit="q22"]')
  await p.waitForTimeout(300)
  ok((await p.getAttribute('[data-survey-q]', 'data-survey-q')) === 'q22', '⑤ 「수정」 → 그 질문으로')
  await p.click('[data-survey-opt="5억원"]')
  ok(/확인 화면으로/.test(flat(await p.textContent('[data-survey-next]'))), '⑤ 고친 뒤 「확인 화면으로」 돌아가기')
  await waitSaved(p)
  ok(S.responses.ceo.answers.q22?.choice === '5억원' && S.responses.ceo.status === 'submitted', '⑤ 제출 뒤 고쳐도 자동 저장 · 제출 상태 유지')
  await p.click('[data-survey-next]')
  await p.waitForTimeout(300)
  ok(/수정한 내용으로 다시 제출/.test(flat(await p.textContent('[data-survey-submit]'))), '⑤ 다시 제출 단추')
  await p.click('[data-survey-submit]')
  await p.waitForTimeout(700)
  ok(S.revisions.length === 2, '⑤ 다시 제출 → 이력 2')
  await ctx.close()
}

// ═══ ⑥ 틀린 · 폐기된 링크 ═══════════════════════════════════════════════════
{
  const { ctx, p } = await openLink(S, 'tok_wrong_XXXXXXXXXXXXXXXXXXXXXXXXXX')
  ok((await p.getAttribute('[data-survey-fail]', 'data-survey-fail')) === 'link', '⑥ 틀린 링크 — 「링크를 열 수 없습니다」')
  ok((await p.locator('[data-survey-q], [data-survey-intro]').count()) === 0, '⑥ 질문 · 답이 하나도 안 보임')
  await ctx.close()
}

// ═══ ⑦ 관리자 — 상태 · 비교 · 의견 다름 · 미확정 · 복사 · 내보내기 · 링크 ═══════
{
  const { ctx, p } = await openStaff(S, '/dev-requests')
  ok((await p.locator('[data-devreq-view="feedback"][aria-selected="true"]').count()) === 1, '⑦ 사용자 피드백 화면은 처음 그대로 (기존 기능 유지)')
  ok(/사용자 피드백/.test(flat(await p.textContent('main'))), '⑦ 기존 피드백 제목 그대로')
  await p.click('[data-devreq-view="survey"]')
  await p.waitForTimeout(900)
  ok(/tab=survey/.test(p.url()), '⑦ 「사업계획서 사전 설문」 탭 (주소 ?tab=survey)')
  const st = (who) => p.getAttribute(`[data-survey-admin-card="${who}"]`, 'data-survey-admin-status')
  ok((await st('ceo')) === 'submitted' || (await st('ceo')) === 'edited', '⑦ 대표님 — 제출 완료', await st('ceo'))
  ok((await st('director')) === 'progress', '⑦ 이사님 — 응답 중', await st('director'))
  ok(/일부 미응답/.test(flat(await p.textContent('[data-survey-admin-card="ceo"]'))), '⑦ 제출했지만 빈 것이 있으면 「일부 미응답」')
  ok(/제출 이력 2회/.test(flat(await p.textContent('[data-survey-admin-card="ceo"]'))), '⑦ 제출 이력 · 최종 수정일')
  const q3 = flat(await p.textContent('[data-survey-compare-q="q3"]'))
  ok(/40~50만원/.test(q3) && /60~80만원/.test(q3) && (await p.getAttribute('[data-survey-compare-q="q3"]', 'data-survey-diff')) === 'yes', '⑦ 질문별 두 분 답 나란히 · 「의견 다름」', q3)
  await p.locator('[data-survey-filter="diff"]').click()
  await p.waitForTimeout(300)
  const diffIds = await p.locator('[data-survey-compare-q]').evaluateAll((els) => els.map((e) => e.getAttribute('data-survey-compare-q')))
  ok(diffIds.includes('q3') && diffIds.includes('q22') && !diffIds.includes('q1'), '⑦ 의견 다름만 모아 보기', diffIds.join(','))
  await p.locator('[data-survey-filter="open"]').click()
  await p.waitForTimeout(300)
  const openIds = await p.locator('[data-survey-compare-q]').evaluateAll((els) => els.map((e) => e.getAttribute('data-survey-compare-q')))
  ok(openIds.includes('q22') && openIds.includes('q2'), '⑦ 미정 · 미응답만 모아 보기 (이사님 「협의 필요」 · 대표님 빈 Q2)', openIds.join(','))
  await shot(p, 's07_admin_pc')
  //  복사
  await p.click('[data-survey-copy-all]')
  await p.waitForTimeout(400)
  const all = await p.evaluate(() => navigator.clipboard.readText())
  ok(/비원미래 AX 사업화 계획 사전 설문 — 답변 정리/.test(all) && /Q3\. 월 구독료 ★ \[의견 다름\]/.test(all) && /대표님: 40~50만원/.test(all) && /이사님: 60~80만원/.test(all),
    '⑦ 「전체 답변 복사」 — 문서 형태', all.slice(0, 120))
  ok(/추후 확인 \(미응답\)/.test(all), '⑦ 빈 답은 「추후 확인」으로 적힘')
  await p.click('[data-survey-copy-open]')
  await p.waitForTimeout(400)
  const open = await p.evaluate(() => navigator.clipboard.readText())
  //  Q3 은 두 분 다 확정 답 → 빠져야 하고, Q22(이사님 「협의 필요」)는 들어가야 합니다
  ok(/미확정 사항/.test(open) && /Q22\./.test(open) && !/Q3\. 월 구독료/.test(open), '⑦ 「미확정 사항 복사」 — 미정·미응답만 (둘 다 확정한 Q3 은 빠짐)', open.slice(0, 100))
  //  내보내기
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('[data-survey-json]')])
  const js = JSON.parse(await (await import('node:fs/promises')).readFile(await dj.path(), 'utf8'))
  ok(js.respondents.ceo.answers.q3.choice === '40~50만원' && js.respondents.director.answers.q3.choice === '60~80만원' && js.questions.length === 26, '⑦ JSON 내보내기 — 두 분 답 · 26문항')
  const [dc] = await Promise.all([p.waitForEvent('download'), p.click('[data-survey-csv]')])
  const csv = await (await import('node:fs/promises')).readFile(await dc.path(), 'utf8')
  ok(csv.charCodeAt(0) === 0xfeff && /"섹션","번호","질문"/.test(csv) && csv.split('\r\n').length === 27, '⑦ CSV 내보내기 — 엑셀용 BOM · 머리줄 + 26줄', String(csv.split('\r\n').length))
  //  링크 만들기 — 한 번만 보임 · 예전 링크 폐기
  await p.click('[data-survey-issue="director"]')
  await p.waitForTimeout(900)
  const link = await p.inputValue('[data-survey-admin-card="director"] [data-survey-issued-link]')
  ok(/\/survey\/tok_new_director_/.test(link), '⑦ 링크 만들기 → 링크가 보임', link)
  ok(S.invites.find((i) => i.token === TOK.director)?.revoked_at, '⑦ 새 링크를 만들면 예전 링크는 폐기')
  await p.click('[data-survey-admin-card="director"] [data-survey-copy-kakao]')
  await p.waitForTimeout(300)
  const kakao = await p.evaluate(() => navigator.clipboard.readText())
  ok(/홍현주 이사님 전용 링크/.test(kakao) && kakao.includes(link), '⑦ 카톡에 붙일 문구 복사')
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  ok((await p.locator('[data-survey-issued-link]').count()) === 0, '⑦ 다시 열면 링크는 안 보임 (열쇠는 한 번만)')
  p.once('dialog', (d) => d.accept())
  await p.click('[data-survey-revoke="director"]')
  await p.waitForTimeout(900)
  ok(S.invites.filter((i) => i.respondent === 'director').every((i) => i.revoked_at), '⑦ 링크 폐기')
  await ctx.close()
}
{
  //  폐기된 새 링크로는 못 엶
  const { ctx, p } = await openLink(S, 'tok_new_director_CCCCCCCCCCCCCCCCCCCCCC')
  ok((await p.getAttribute('[data-survey-fail]', 'data-survey-fail')) === 'link', '⑦ 폐기한 링크 — 열리지 않음')
  await ctx.close()
}
{
  //  관리자 화면 — 폰에서도
  const { ctx, p } = await openStaff(S, '/dev-requests?tab=survey', { w: 390, scale: 'lg' })
  await p.waitForTimeout(600)
  ok((await p.locator('[data-survey-admin-card]').count()) === 2, '⑦ 폰 — 두 분 카드')
  const m = await measure(p)
  ok(m.bad.length === 0 && m.push <= 0, '⑦ 폰 관리자 화면 — 눌림 · 화면 밖 없음', m.bad.join(' ; '))
  await shot(p, 's08_admin_phone')
  await ctx.close()
}

// ═══ ⑧ 권한 — 서버가 막으면 그대로 · 사무실은 못 봄 · 미리보기는 저장 안 함 ═════════
{
  const S2 = makeServer()
  S2.adminMode = 'denied'
  const { ctx, p } = await openStaff(S2, '/dev-requests?tab=survey')
  ok((await p.getAttribute('[data-survey-admin-error]', 'data-survey-admin-error')) === 'denied' && (await p.locator('[data-survey-compare]').count()) === 0,
    '⑧ 서버가 관리자로 인정하지 않으면 — 답이 하나도 안 보임')
  await ctx.close()
}
{
  const S3 = makeServer()
  S3.adminMode = 'missing'
  const { ctx, p } = await openStaff(S3, '/dev-requests?tab=survey')
  ok((await p.getAttribute('[data-survey-admin-error]', 'data-survey-admin-error')) === 'missing' && /PROPOSAL_0144_biz_survey\.sql/.test(flat(await p.textContent('main'))),
    '⑧ SQL 실행 전 — 「실행 필요」 안내 (오류로 깨지지 않음)')
  await ctx.close()
}
{
  const S4 = makeServer()
  const { ctx, p } = await openStaff(S4, '/dev-requests?tab=survey', { role: 'office' })
  ok((await p.locator('[data-survey-admin]').count()) === 0, '⑧ 사무실 계정 — 사용자 피드백(설문 탭 포함) 화면이 안 열림')
  ok(S4.calls.every((c) => c.fn !== 'biz_survey_admin_load'), '⑧ 사무실 계정 — 관리자 자료를 부르지도 않음')
  await p.goto(`${W.BASE}/survey-preview/ceo`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  ok((await p.locator('[data-survey]').count()) === 0, '⑧ 사무실 계정 — 미리보기도 안 열림')
  await ctx.close()
}
{
  const S5 = makeServer()
  const { ctx, p } = await openStaff(S5, '/survey-preview/director', { w: 390, scale: 'lg' })
  ok((await p.locator('[data-survey-preview]').count()) === 1 && /홍현주 이사님/.test(flat(await p.textContent('[data-survey-preview]'))), '⑧ 관리자 미리보기 — 이사님 화면 · 「저장되지 않습니다」')
  await p.click('[data-survey-start="core"]')
  await p.waitForTimeout(300)
  await p.click('[data-survey-opt="있음"]')
  await p.waitForTimeout(1200)
  ok(S5.calls.filter((c) => /open|save|submit/.test(c.fn)).length === 0, '⑧ 미리보기 — 서버에 아무것도 저장하지 않음')
  await p.click('[data-survey-preview-close]')
  await p.waitForTimeout(700)
  ok(/\/dev-requests\?tab=survey/.test(p.url()), '⑧ 미리보기 닫기 → 설문 관리 화면으로')
  await ctx.close()
}

await b.close()
