// ─────────────────────────────────────────────────────────────────────────────
//  0141 — 업무 보조 AI 세 가지 화면: 오늘 브리핑 · 현장 메모 정리 · 독촉 문구 다시 쓰기
//
//   서버 함수(ai-triage)는 이 검사에서 정해진 답을 돌려줍니다 — 실제 Gemini 호출 증명이 아닙니다.
//   보는 것: 단추 · 보내는 것(이름 · 금액 · 글 안 보냄) · 결과 표시 · 실패 까닭 · 저장/전송 안 함 ·
//            현장 계정엔 안 보임 · 발표 중 병원 이름 가림.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium, EXEC } from './_pw.mjs'
import * as W from './walk_lib.mjs'

const b = await chromium.launch({ executablePath: EXEC })
let fails = 0
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${!c && d ? ` — ${d}` : ''}`); if (!c) { fails++; process.exitCode = 1 } }
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

const BRIEF = { headline: '오늘은 긴급 요청부터 챙기세요.', items: [{ title: '긴급 요청 확인', detail: '처리 전 요청 중 긴급 건부터' }, { title: '남은 방문', detail: '오늘 일정 확인' }], note: '' }
const NOTE = { summary: '용기 파손 · 추가수거 요청', issues: ['용기 교체 필요'], followups: [{ kind: '추가수거', text: '다음주 추가수거 희망 — 일정 확인 필요' }], cleaned: '용기 2개 파손(교체 필요). 다음주 추가수거 희망.' }
const DUN = { message: '{병원명} 담당자님, 비원미래입니다. 청구 금액 {금액}이 아직 확인되지 않아 안내드립니다.' }

async function open(role, path, { fail = false, presenting = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' })
  const prof = { ...W.profileFor(role), font_scale: 'normal' }
  const state = { profile: prof, reqs: 0, writes: [], schemaVersion: 106 }
  W.wire(ctx, state)
  const S = { bodies: [] }
  await ctx.route('**/functions/v1/ai-triage', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, body: 'ok' })
    const body = JSON.parse(r.request().postData() ?? '{}')
    S.bodies.push(body)
    if (fail) return r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'AI 사용량 한도에 걸렸습니다 (429)', callId: 'c9' }) })
    const result = body.task === 'briefing' ? BRIEF : body.task === 'field_note' ? NOTE : DUN
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: body.task, result: { ...result, model: 'gemini-3.1-flash-lite' }, callId: 'c1', logged: true, ms: 2100 }) })
  })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.addInitScript(([k, u, pres]) => {
    localStorage.setItem(k, JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: u }))
    localStorage.setItem('beonemirae-ops:tour-seen', 'staff,field,client,demo')
    if (pres) sessionStorage.setItem('beonemirae-ops:presenter', JSON.stringify({ order: ['receivables'], pos: 0, clientId: null, demoRequestId: null, at: Date.now() }))
  }, ['beonemirae-ops:auth', { id: prof.id, aud: 'authenticated', email: prof.email, app_metadata: {}, user_metadata: {} }, presenting])
  await p.goto(`${W.BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await W.settle(p, state)
  await p.waitForTimeout(700)
  return { ctx, p, S, errors, state }
}

// ── ① 대시보드 — AI 오늘 브리핑 ──────────────────────────────────────────────
{
  const { ctx, p, S, errors } = await open('admin', '/')
  ok((await p.locator('[data-ai-assist="briefing"]').count()) === 1, '① 대시보드에 「AI 오늘 브리핑」')
  await p.locator('[data-ai-assist-run="briefing"]').click()
  await p.locator('[data-ai-briefing]').waitFor({ timeout: 8000 })
  const body = S.bodies[0]
  ok(body?.task === 'briefing' && typeof body.input?.visitsPlanned === 'number' && typeof body.input?.overdueAmount === 'number', '① 보내는 것 — 작업 이름 · 숫자', JSON.stringify(body?.input).slice(0, 160))
  const sent = JSON.stringify(body?.input ?? {})
  ok(!/[가-힣]+(병원|의원|재단)/.test(sent) && Object.values(body.input).every((v) => typeof v === 'number' || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) || typeof v === 'object'), '① 거래처 이름 · 요청 글은 보내지 않음 (숫자 · 날짜 · 종류별 건수만)', sent.slice(0, 160))
  const txt = flat(await p.locator('[data-ai-assist="briefing"]').innerText())
  ok(txt.includes(BRIEF.headline) && (await p.locator('[data-ai-briefing-item]').count()) === 2, '① 결과 — 첫 문장 · 먼저 챙길 일 (번호)')
  ok(/실제 AI 응답 · Google Gemini · 모델 gemini-3\.1-flash-lite · \d+\.\d초/.test(txt), '① 아래 줄 — 실제 AI 응답 · 회사 · 모델 · 초', txt.slice(-80))
  ok(/AI 제안 → 담당자 확인/.test(txt), '① 「AI 제안 → 담당자 확인」')
  ok(errors.length === 0, '① 화면 오류 0', errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, p } = await open('admin', '/', { fail: true })
  await p.locator('[data-ai-assist-run="briefing"]').click()
  await p.locator('[data-ai-assist-error]').waitFor({ timeout: 8000 })
  const t = flat(await p.locator('[data-ai-assist-error]').innerText())
  ok(/AI 사용량 한도에 걸렸습니다 \(429\)/.test(t) && (await p.locator('[data-ai-briefing]').count()) === 0, '① 실패 — 까닭 그대로 · 결과를 지어내지 않음', t)
  await ctx.close()
}

// ── ② 수거 입력 — AI 메모 정리 ────────────────────────────────────────────────
{
  const { ctx, p, S, state, errors } = await open('admin', '/collection')
  //  특이사항 칸 펼치기
  const fold = p.locator('[data-fold="memo"]').first()
  if (await fold.count()) await fold.click().catch(() => {})
  await p.waitForTimeout(300)
  const ta = p.locator('textarea[placeholder="현장 특이사항을 입력하세요 (선택)"]')
  ok((await ta.count()) === 1, '② 특이사항 칸이 열림')
  ok(await p.locator('[data-ai-assist-run="field_note"]').isDisabled(), '② 메모가 비어 있으면 AI 단추는 잠김')
  const memo = '용기 2개 깨져서 교체 필요. 원무과에서 다음주 추가수거 원함'
  await ta.fill(memo)
  const writes0 = state.writes.length
  await p.locator('[data-ai-assist-run="field_note"]').click()
  await p.locator('[data-ai-field-note]').waitFor({ timeout: 8000 })
  ok(S.bodies[0]?.task === 'field_note' && S.bodies[0]?.input?.memo === memo, '② 보내는 것 — 특이사항 글 그대로 (서버가 전화번호 가림)')
  ok((await p.locator('[data-ai-followup="추가수거"]').count()) === 1, '② 후속 조치 제안 (자동 등록 아님)')
  ok(state.writes.length === writes0, '② AI 를 불러도 아무것도 저장하지 않음')
  await p.locator('[data-ai-field-apply]').click()
  ok((await ta.inputValue()) === NOTE.cleaned, '② 「정리본으로 바꾸기」를 눌러야 특이사항 칸이 바뀜', await ta.inputValue())
  ok(state.writes.length === writes0, '② 칸만 바뀜 — 저장은 「수거 완료 저장」을 눌러야')
  ok(errors.length === 0, '② 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ③ 미수금 — 독촉 문구 AI 로 다시 쓰기 ──────────────────────────────────────
{
  const { ctx, p, S, errors } = await open('admin', '/receivables')
  const row = p.locator('[data-dunning-row]').first()
  ok((await row.count()) === 1, '③ 독촉 대상 줄이 있음')
  const name = flat(await row.locator('span.font-extrabold').first().innerText())
  await row.locator('[data-dunning-msg]').click()
  await p.locator('[data-ai-assist="dunning"]').waitFor({ timeout: 5000 })
  const before = await p.locator('[data-dunning-text]').inputValue()
  await p.locator('[data-ai-dunning-tone="firm"]').waitFor({ state: 'detached', timeout: 500 }).catch(() => {})
  await p.locator('[data-ai-assist-run="dunning"]').click()
  await p.waitForFunction((b0) => document.querySelector('[data-dunning-text]')?.value !== b0, before, { timeout: 8000 }).catch(() => {})
  const sent = JSON.stringify(S.bodies[0] ?? {})
  ok(S.bodies[0]?.task === 'dunning' && S.bodies[0].input.tone === 'soft' && /^\d{4}-\d{2}$/.test(S.bodies[0].input.oldestMonth), '③ 보내는 것 — 밀린 개월 · 가장 오래된 청구월 · 말투', sent)
  ok(!sent.includes(name) && !/원"|\d{5,}/.test(sent), '③ 병원 이름 · 금액은 보내지 않음', sent)
  const after = await p.locator('[data-dunning-text]').inputValue()
  ok(after.includes(name) && !after.includes('{병원명}') && !after.includes('{금액}') && /원/.test(after), '③ 문구 칸 — 이름 · 금액은 화면에서 채움', after.slice(0, 120))
  ok(errors.length === 0, '③ 화면 오류 0', errors.join(' | '))
  await ctx.close()
}

// ── ④ 발표 중 미수금 — 독촉 칸만 · 병원 이름 가림 · 연락처 숨김 ─────────────────
{
  const { ctx, p } = await open('admin', '/receivables', { presenting: true })
  ok((await p.locator('[data-receivables-presenting]').count()) === 1 && (await p.locator('[data-recv-search]').count()) === 0, '④ 발표 중 — 독촉 대상 칸만 (청구 목록 · 검색 숨김)')
  const names = await p.locator('[data-dunning-row] span.font-extrabold').allInnerTexts()
  ok(names.length > 0 && names.every((n) => /○/.test(n)), '④ 병원 이름은 가림 (가○○…)', names.join(', '))
  ok((await p.locator('[data-dunning-row] a[href^="tel:"]').count()) === 0, '④ 전화 단추 · 연락처 숨김')
  await ctx.close()
}

// ── ⑤ 현장 계정 — AI 단추 없음 (서버도 거부) ─────────────────────────────────
{
  const { ctx, p } = await open('field', '/collection')
  ok((await p.locator('[data-ai-assist]').count()) === 0, '⑤ 현장 계정에는 AI 단추가 없음')
  await ctx.close()
}

await b.close()
console.log(`\ncheck_ai_assist141 — 실패 ${fails}`)
