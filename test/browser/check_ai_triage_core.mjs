// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage 서버 함수 — 흐름 · 권한 · 결과 검사 · 호출 기록 (0138)
//
//  브라우저 없이 Node 로 **배포되는 그 코드**(supabase/functions/ai-triage/*.ts)를
//  그대로 불러 시험합니다. DB · 모델은 가짜를 넣지만, 권한 확인 · 입력 만들기 ·
//  결과 검사 · 기록 규칙은 실제 코드입니다.
//
//   ① 정상 JSON → 성공 · 기록(ok=true · 모델명 · 처리시간 · 누가)
//   ② 긴급도 · 종류 누락 / 범위 밖 / JSON 아님 → 실패 + 실패 기록
//   ③ 지어낸 숫자 · 확정 약속이 든 초안 → 실패 (고정 문구로 갈아끼우지 않음)
//   ④ 모델 500 · 429 · 시간 초과 · 키 없음 → 실패 + 기록, 키 조각은 가림
//   ⑤ 권한 — 익명 401 · 병원 · 현장 · 중지 계정 403 (모델 호출 · 기록 없음), 관리자 · 사무실 200
//   ⑥ 입력 최소화 — DB 의 요청 글만, 브라우저가 보낸 글은 무시, 전화번호 등 가림, 병원명 없음
//   ⑦ 시연 요청 → kind 'request_triage_demo' (운영 실적과 분리)
//   ⑧ 이 흐름은 ai_calls 한 줄 외에는 아무것도 쓰지 않는다
// ─────────────────────────────────────────────────────────────────────────────

import { handleTriage, KIND_DEMO, KIND_REAL } from '../../supabase/functions/ai-triage/handler.ts'
import { SYSTEM_PROMPT, buildUserMessage, parseTriage, scrub } from '../../supabase/functions/ai-triage/triage.ts'
import { chatJson, ProviderError } from '../../supabase/functions/ai-triage/provider.ts'

const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d && !c ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const J = (v) => JSON.stringify(v)

const REQ_ID = '11111111-2222-4333-8444-555555555555'
const CONTENT = '의료폐기물이 예상보다 빨리 찼습니다.\n가능하면 내일 오전에 수거 부탁드립니다.\n63L 박스도 10개 정도 같이 부탁드립니다.\n담당 010-1234-5678'
const GOOD = {
  kind: '긴급수거',
  also_kinds: ['소모품'],
  urgency: '높음',
  summary: '폐기물 조기 포화로 내일 오전 수거와 63L 박스 10개 공급을 요청함.',
  points: ['내일 오전 수거 희망', '63L 박스 10개'],
  draft: '요청 확인했습니다. 내일 오전 수거 가능 여부와 63L 박스 10개 준비 여부를 확인한 뒤 안내드리겠습니다.',
  basis: '보관 공간이 찼다는 표현과 내일 수거 요청이 있어 높음으로 봄.',
}

/** 가짜 의존성 — 무엇이 불렸는지 셉니다 */
function deps({ user = { id: 'u-admin' }, profile = { role: 'admin', active: true, name: '홍대표' }, request, reply, replyError, hasKey = true, insertFails = false } = {}) {
  const calls = { model: [], insert: [], getRequest: 0 }
  let clock = 1000
  const d = {
    getUser: async () => user,
    getProfile: async () => profile,
    getRequest: async (id) => { calls.getRequest += 1; return request === undefined ? { id, content: CONTENT, kind: '긴급수거', urgent: true, desiredDate: null, demo: false } : request },
    insertCall: async (row) => { calls.insert.push(row); if (insertFails) throw new Error('표 없음'); return `call-${calls.insert.length}` },
    callModel: async (system, userMsg) => {
      calls.model.push({ system, user: userMsg })
      clock += 1800
      if (replyError) throw replyError
      return reply ?? { text: J(GOOD), model: 'gpt-4o-mini-2024-07-18', usage: { input: 420, output: 160 } }
    },
    hasKey,
    model: 'gpt-4o-mini',
    now: () => clock,
  }
  return { d, calls }
}

// ── ① 정상 ───────────────────────────────────────────────────────────────────
{
  const { d, calls } = deps()
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 200 && r.body.ok === true, '① 정상 JSON → 200 성공', J(r))
  const res = r.body.result
  ok(res.kind === '긴급수거' && J(res.alsoKinds) === J(['소모품']) && res.urgency === '높음', '① 종류 · 함께 든 종류 · 긴급도가 그대로', J(res))
  ok(res.summary === GOOD.summary && res.draft === GOOD.draft && res.basis === GOOD.basis && res.points.length === 2, '① 요약 · 초안 · 근거 · 핵심이 모델이 준 그대로')
  ok(res.model === 'gpt-4o-mini-2024-07-18', '① 모델명은 응답에 적힌 실제 모델', res.model)
  ok(calls.insert.length === 1, '① ai_calls 한 줄 기록', String(calls.insert.length))
  const row = calls.insert[0]
  ok(row.ok === true && row.error === '' && row.kind === KIND_REAL && row.request_id === REQ_ID, '① 기록: ok=true · 운영 kind · 요청 번호', J(row).slice(0, 160))
  ok(row.model === 'gpt-4o-mini-2024-07-18' && row.ms === 1800 && r.body.ms === 1800, '① 기록: 모델명 · 처리시간(ms)', `${row.model} · ${row.ms}`)
  ok(row.actor_id === 'u-admin' && row.actor_name === '홍대표', '① 기록: 누가 — 서버가 확인한 로그인 사용자')
  ok(row.output.usage?.input === 420 && row.output.usage?.output === 160, '① 기록: 토큰 수(응답에 있을 때만)')
  ok(r.body.callId === 'call-1' && r.body.logged === true, '① 화면에 기록 번호를 돌려준다 (수정됨 표시용)')
}

// ── ② 형식 검사 — 빠짐 · 범위 밖 · JSON 아님은 실패 ───────────────────────────
const src = { content: CONTENT, kind: '긴급수거', urgent: true, desiredDate: null }
{
  const cases = [
    ['긴급도 누락', { ...GOOD, urgency: undefined }],
    ['종류 누락', { ...GOOD, kind: undefined }],
    ['초안 누락', { ...GOOD, draft: '' }],
    ['종류 범위 밖 (일정변경)', { ...GOOD, kind: '일정변경' }],
    ['긴급도 범위 밖 (긴급)', { ...GOOD, urgency: '긴급' }],
    ['함께 든 종류 범위 밖', { ...GOOD, also_kinds: ['배차'] }],
    ['핵심 5개 초과', { ...GOOD, points: ['a', 'b', 'c', 'd', 'e'] }],
  ]
  for (const [name, v] of cases) {
    const p = parseTriage(J(v), src)
    ok(!p.ok, `② ${name} → 실패`, J(p).slice(0, 120))
  }
  ok(!parseTriage('요청을 정리하면 긴급수거입니다', src).ok, '② JSON 이 아닌 글 → 실패')
  ok(!parseTriage('```json\n' + J(GOOD) + '\n```', src).ok, '② 코드 블록으로 감싼 글도 억지로 풀지 않는다 → 실패')
  ok(!parseTriage(J([GOOD]), src).ok, '② 배열 → 실패')
  //  흐름 전체로도 — 누락이면 502 + 실패 기록(원문 보관), 성공으로 치지 않음
  const { d, calls } = deps({ reply: { text: J({ ...GOOD, urgency: undefined }), model: 'm', usage: { input: 1, output: 1 } } })
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 502 && !r.body.ok && /빠진 항목: urgency/.test(r.body.error), '② 긴급도 누락 → 502 실패', J(r.body))
  //  0142 안정화 — 둘째 답이 맞으면 성공 · 걸린 까닭을 알려 주고 다시 물음
  {
    const seq = deps()
    let n = 0
    seq.d.callModel = async (system, userMsg) => {
      seq.calls.model.push({ system, user: userMsg })
      n += 1
      return { text: n === 1 ? J({ ...GOOD, urgency: undefined }) : J(GOOD), model: 'm', usage: { input: 1, output: 1 } }
    }
    const rs = await handleTriage({ requestId: REQ_ID }, seq.d)
    ok(rs.status === 200 && seq.calls.model.length === 2 && /앞의 답은 쓰이지 못했습니다 — 까닭: .*urgency/.test(seq.calls.model[1].user),
      '② 첫 답이 검사에 걸리면 까닭을 알려 주고 한 번만 다시 — 둘째가 맞으면 성공', J(rs.body).slice(0, 160))
    ok(seq.calls.insert.length === 2 && seq.calls.insert[0].ok === false && seq.calls.insert[1].ok === true, '② 다시 물은 것도 기록 (첫 번째는 실패로)')
  }
  //  첫 답이 이미 오래 걸렸으면(12초 넘게) 다시 묻지 않음 — 화면이 기다리는 시간을 넘기지 않게
  {
    const slow = deps({ reply: { text: J({ ...GOOD, urgency: undefined }), model: 'm', usage: { input: 1, output: 1 } } })
    const orig = slow.d.callModel
    let t = 1000
    slow.d.now = () => t
    slow.d.callModel = async (a, b) => { t += 15_000; return orig(a, b) }
    const rs = await handleTriage({ requestId: REQ_ID }, slow.d)
    ok(rs.status === 502 && slow.calls.model.length === 1, '② 첫 답이 12초를 넘겼으면 다시 묻지 않고 실패 그대로', String(slow.calls.model.length))
  }
  //  검사에 걸리면 한 번만 다시 묻습니다(같은 답이면 둘 다 실패로 기록)
  ok(calls.insert.length === 2 && calls.insert.every((x) => x.ok === false && /urgency/.test(x.error) && typeof x.output.raw === 'string'), '② 실패도 기록 (원문 보관 · 한 번 다시 물은 것까지)')
  const { d: d2, calls: c2 } = deps({ reply: { text: 'not json', model: 'm', usage: { input: 1, output: 1 } } })
  const r2 = await handleTriage({ requestId: REQ_ID }, d2)
  ok(r2.status === 502 && /JSON 이 아닙니다/.test(r2.body.error) && c2.insert[0]?.ok === false, '② 잘못된 JSON → 502 실패 + 기록')
}

// ── ③ 지어낸 숫자 · 확정 약속 ────────────────────────────────────────────────
{
  const p1 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 내일 오전 10시에 방문 가능 여부를 확인하겠습니다.' }), src)
  ok(!p1.ok && /없는 표현\(10시\)/.test(p1.error), '③ 요청의 「10개」와 같은 숫자라도 「10시」(요청에 없는 시각) → 실패', J(p1))
  const p2 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 내일 오전 9시 방문 가능 여부를 확인 후 안내드리겠습니다.' }), src)
  ok(!p2.ok && /없는 숫자\(9\)/.test(p2.error), '③ 요청에 없는 숫자(9시)가 든 초안 → 실패', J(p2))
  const p3 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 내일 오전에 방문하겠습니다.' }), src)
  ok(!p3.ok && /확정 약속/.test(p3.error), '③ 「방문하겠습니다」(확정 약속) → 실패', J(p3))
  const p4 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 차량 배차되었습니다.' }), src)
  ok(!p4.ok && /확정 약속/.test(p4.error), '③ 「배차되었습니다」 → 실패')
  const p5 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 박스 1개당 2,000원입니다.' }), src)
  ok(!p5.ok, '③ 금액(요청에 없는 숫자) → 실패')
  const p6 = parseTriage(J(GOOD), src)
  ok(p6.ok, '③ 요청에 있던 숫자(63L · 10개)를 다시 말하는 것은 괜찮다', J(p6).slice(0, 100))
  const p7 = parseTriage(J({ ...GOOD, draft: '요청 확인했습니다. 원하신 10월 15일 방문 가능 여부를 확인 후 안내드리겠습니다.' }), { ...src, desiredDate: '2026-10-15' })
  ok(p7.ok, '③ 병원이 적은 희망일(10월 15일)을 다시 말하는 것은 괜찮다', J(p7).slice(0, 100))
  const { d, calls } = deps({ reply: { text: J({ ...GOOD, draft: '내일 오전 9시에 방문하겠습니다.' }), model: 'm', usage: {} } })
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 502 && !r.body.result && calls.insert[0].ok === false, '③ 흐름 전체 — 실패로 기록하고 초안을 돌려주지 않는다 (고정 문구 대체 없음)')
}

// ── ④ 모델 쪽 실패 — 500 · 429 · 시간 초과 · 키 없음 ─────────────────────────
{
  //  실제 어댑터(chatJson) + 가짜 fetch
  const fakeFetch = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const base = { apiKey: 'sk-test-REALLOOKINGKEY123456', url: 'https://example.test/v1/chat/completions', model: 'gpt-4o-mini', system: 's', user: 'u', timeoutMs: 300, temperature: 0.2 }
  const errOf = async (o) => { try { await chatJson(o); return null } catch (e) { return e } }

  const e500 = await errOf({ ...base, fetchImpl: fakeFetch(500, { error: { message: 'upstream broke' } }) })
  ok(e500 instanceof ProviderError && e500.code === 'http' && /AI 서버 오류 \(500\)/.test(e500.message), '④ 모델 500 → 오류', e500?.message)
  const e429 = await errOf({ ...base, fetchImpl: fakeFetch(429, { error: { message: 'Rate limit reached' } }) })
  ok(e429 instanceof ProviderError && /사용량 한도/.test(e429.message), '④ 429 → 「사용량 한도」', e429?.message)
  const e401 = await errOf({ ...base, fetchImpl: fakeFetch(401, { error: { message: 'Incorrect API key provided: sk-test-REALLOOKINGKEY123456' } }) })
  ok(e401 && /키가 올바르지 않습니다/.test(e401.message) && !/REALLOOKING/.test(e401.message), '④ 401 → 키 조각은 오류 문구에서 가린다', e401?.message)
  const hang = (_url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
  const eTo = await errOf({ ...base, fetchImpl: hang })
  ok(eTo instanceof ProviderError && eTo.code === 'timeout' && /시간 초과/.test(eTo.message), '④ 시간 초과 → timeout 오류', eTo?.message)
  const eEmpty = await errOf({ ...base, fetchImpl: fakeFetch(200, { choices: [{ message: { content: '' } }] }) })
  ok(eEmpty instanceof ProviderError && eEmpty.code === 'format', '④ 빈 응답 → 실패')

  //  어댑터가 보내는 요청 — JSON 모드 · 키는 헤더로만
  let sent = null
  const spy = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ model: 'gpt-4o-mini-2024-07-18', choices: [{ message: { content: J(GOOD) } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }), { status: 200 }) }
  const rep = await chatJson({ ...base, fetchImpl: spy })
  const sentBody = JSON.parse(sent.init.body)
  ok(sent.init.headers.Authorization === `Bearer ${base.apiKey}` && !sent.init.body.includes(base.apiKey), '④ 키는 Authorization 헤더로만 (본문에 없음)')
  ok(sentBody.response_format?.type === 'json_object' && sentBody.messages[0].role === 'system' && sentBody.temperature === 0.2, '④ JSON 모드 · system 프롬프트 · temperature')
  ok(rep.model === 'gpt-4o-mini-2024-07-18' && rep.usage.input === 3 && rep.usage.output === 4, '④ 실제 모델명 · 토큰 수를 돌려준다')
  await chatJson({ ...base, temperature: null, fetchImpl: spy })
  ok(!('temperature' in JSON.parse(sent.init.body)), '④ temperature 를 안 받는 모델용 — null 이면 보내지 않는다')

  //  흐름 — 실패는 기록하고 5xx 로 돌려준다
  for (const [name, err, st] of [['500', e500, 502], ['429', e429, 502], ['시간 초과', eTo, 504]]) {
    const { d, calls } = deps({ replyError: err })
    const r = await handleTriage({ requestId: REQ_ID }, d)
    ok(r.status === st && !r.body.ok && calls.insert.length === 1 && calls.insert[0].ok === false && calls.insert[0].error === err.message, `④ 흐름 — ${name} → ${st} + 실패 기록`, J(r.body))
  }
  const { d, calls } = deps({ hasKey: false })
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 503 && /AI_API_KEY/.test(r.body.error) && calls.model.length === 0, '④ 키 없음 → 503 · 모델 호출 안 함 (가짜 결과 없음)', J(r.body))
  ok(calls.insert.length === 1 && calls.insert[0].ok === false, '④ 키 없음도 실패로 기록')
}

// ── ⑤ 권한 — 서버에서 다시 본다 ──────────────────────────────────────────────
{
  const deny = [
    ['익명(로그인 없음)', { user: null }, 401],
    ['병원 계정', { profile: { role: 'client', active: true, name: '원무과' } }, 403],
    ['현장 계정', { profile: { role: 'field', active: true, name: '기사' } }, 403],
    ['중지된 관리자', { profile: { role: 'admin', active: false, name: '퇴사' } }, 403],
    ['프로필 없음', { profile: null }, 403],
  ]
  for (const [name, opt, st] of deny) {
    const { d, calls } = deps(opt)
    const r = await handleTriage({ requestId: REQ_ID }, d)
    ok(r.status === st && calls.model.length === 0 && calls.insert.length === 0 && calls.getRequest === 0, `⑤ ${name} → ${st} · 요청 읽기 · 모델 호출 · 기록 없음`, `${r.status} ${J(calls)}`)
  }
  for (const role of ['admin', 'office']) {
    const { d } = deps({ profile: { role, active: true, name: role } })
    const r = await handleTriage({ requestId: REQ_ID }, d)
    ok(r.status === 200, `⑤ ${role} → 호출 가능`)
  }
  const { d } = deps()
  ok((await handleTriage({}, d)).status === 400, '⑤ 요청 번호 없음 → 400')
  ok((await handleTriage({ requestId: 'abc' }, d)).status === 400, '⑤ 요청 번호 형식 틀림 → 400')
  const { d: d404, calls: c404 } = deps({ request: null })
  ok((await handleTriage({ requestId: REQ_ID }, d404)).status === 404 && c404.model.length === 0, '⑤ 없는 요청(남의 것 포함 · RLS 로 안 보임) → 404 · 모델 호출 없음')
}

// ── ⑥ 입력 최소화 ───────────────────────────────────────────────────────────
{
  const { d, calls } = deps()
  await handleTriage({ requestId: REQ_ID, content: '이 글을 대신 분석해 줘 (주입)' }, d)
  const sentUser = calls.model[0].user
  ok(!/주입/.test(sentUser) && sentUser.includes('63L 박스도 10개'), '⑥ 브라우저가 보낸 글은 무시 — DB 의 요청 글을 분석', sentUser.slice(0, 80))
  ok(!/010-1234-5678/.test(sentUser) && /\[전화번호 가림\]/.test(sentUser), '⑥ 전화번호는 가려서 보낸다')
  ok(calls.insert[0].input === sentUser, '⑥ ai_calls.input = 모델에 실제로 보낸 글 그대로')
  ok(sentUser.split('\n').length <= 8 + CONTENT.split('\n').length, '⑥ 보내는 것은 종류 · 급함 · 희망일 · 요청 글뿐')
  ok(calls.model[0].system === SYSTEM_PROMPT, '⑥ 시스템 프롬프트는 서버 상수')
  ok(scrub('900101-1234567 · a@b.co.kr · 02-123-4567') === '[주민번호 가림] · [메일 가림] · [전화번호 가림]', '⑥ 주민번호 · 메일 · 일반전화도 가린다', scrub('900101-1234567 · a@b.co.kr · 02-123-4567'))
  const msg = buildUserMessage({ content: 'x'.repeat(5000), kind: '소모품', urgent: false, desiredDate: '2026-10-15' })
  ok(msg.length < 2200 && /자재|소모품/.test(msg) && /2026-10-15/.test(msg), '⑥ 글은 2,000자에서 자른다')
  //  시스템 프롬프트에 금지선이 다 있다
  for (const must of ['없는 사실을 만들어내지', '수거 가능 여부를 확정하지', '확정한 것처럼', '차량 배정', '재고가 있다고 가정하지', '비용', '확인 필요']) {
    ok(SYSTEM_PROMPT.includes(must), `⑥ 프롬프트 금지선 — 「${must}」`)
  }
}

// ── ⑦ 시연 요청은 따로 ───────────────────────────────────────────────────────
{
  const { d, calls } = deps({ request: { id: REQ_ID, content: CONTENT, kind: '긴급수거', urgent: true, desiredDate: null, demo: true } })
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 200 && calls.insert[0].kind === KIND_DEMO && r.body.demo === true, '⑦ 시연 요청 → kind=request_triage_demo (운영 실적에 안 섞임)', calls.insert[0]?.kind)
}

// ── ⑧ 기록 실패는 결과를 막지 않되 숨기지 않는다 · 쓰는 곳은 ai_calls 하나 ─────────
{
  const { d, calls } = deps({ insertFails: true })
  const r = await handleTriage({ requestId: REQ_ID }, d)
  ok(r.status === 200 && r.body.logged === false && r.body.callId === null, '⑧ 기록 실패 → 결과는 주되 logged=false 로 알린다')
  //  deps 에 쓰기 함수는 insertCall 하나뿐 — 요청 상태 · 회신 · 일정 · 재고를 바꿀 길이 없다
  ok(Object.keys(d).filter((k) => /insert|update|upsert|delete|set|write|send/i.test(k)).join(',') === 'insertCall', '⑧ 이 흐름이 쓸 수 있는 곳은 ai_calls 기록 하나', Object.keys(d).join(','))
  ok(calls.insert.length === 1, '⑧ 한 번 부르면 기록 시도도 한 번')
}

console.log('\ncheck_ai_triage_core 끝')
