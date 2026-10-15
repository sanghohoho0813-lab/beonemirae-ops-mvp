// ─────────────────────────────────────────────────────────────────────────────
//  ai-triage · 업무 보조 AI 세 가지 (0141) — 흐름 · 입력 검사 · 결과 검사 · 기록
//
//   모델 자리에 「정해진 답」을 넣고 handleAssist 를 그대로 돌립니다. 이 검사는 실제 Gemini 가
//   답했다는 증명이 아닙니다 — 그것은 배포 뒤 화면에서 합니다.
//
//  실행(저장소 맨 위에서): deno test --config supabase/functions/ai-triage/deno.json --allow-read supabase/test/assist_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { handleAssist, type AiCallRow } from '../functions/ai-triage/handler.ts'
import { ProviderError } from '../functions/ai-triage/provider.ts'
import { briefingMessage, wonWords, planMessage, readPlan } from '../functions/ai-triage/assist.ts'

const assert = (c: unknown, m: string) => { if (!c) throw new Error(m) }

function deps(reply: string | Error, role = 'admin') {
  const rows: AiCallRow[] = []
  const seen: { system: string; user: string }[] = []
  return {
    rows, seen,
    d: {
      getUser: async () => ({ id: 'u1' }),
      getProfile: async () => ({ role, active: true, name: '대표' }),
      insertCall: async (r: AiCallRow) => { rows.push(r); return `c${rows.length}` },
      callModel: async (system: string, user: string) => {
        seen.push({ system, user })
        if (reply instanceof Error) throw reply
        return { text: reply, model: 'gemini-3.1-flash-lite', usage: { input: 100, output: 50 } }
      },
      hasKey: true, model: 'gemini-x', now: () => 1000,
    },
  }
}

const BRIEF = { date: '2026-10-16', visitsPlanned: 5, visitsDone: 2, openRequests: 3, urgentRequests: 1, requestKinds: { 긴급수거: 1, 소모품: 2 }, unscheduledClients: 18, overdueClients: 2, overdueAmount: 118714572 }

Deno.test('브리핑 — 숫자만 보내고 · 결과 그대로 · today_briefing 로 기록', async () => {
  const out = { headline: '오늘은 긴급 요청 1건부터 챙기세요.', items: [{ title: '긴급 요청 1건', detail: '처리 전 요청 3건 중 긴급 1건을 먼저 확인' }, { title: '남은 방문 3곳', detail: '예정 5곳 중 2곳 완료' }, { title: '미수 2곳 안내', detail: '1억 1,871만 원 — 안내 문구 확인 필요' }], note: '' }
  const { d, rows, seen } = deps(JSON.stringify(out))
  const r = await handleAssist({ task: 'briefing', input: BRIEF }, d)
  assert(r.status === 200 && (r.body.result as { items: unknown[] }).items.length === 3, JSON.stringify(r.body))
  assert(rows.length === 1 && rows[0].kind === 'today_briefing' && rows[0].request_id === null && rows[0].ok, '기록 kind · 성공')
  assert(!/[가-힣]+(병원|의원|재단)/.test(seen[0].user), '거래처 이름을 보내지 않음 (「○○병원」 꼴이 없음)')
  assert(seen[0].user.includes('1억 1,871만 원') && seen[0].user.includes('118,714,572원'), '금액은 읽기 쉬운 말 + 원래 숫자')
})

Deno.test('브리핑 — 받은 숫자에 없는 숫자를 쓰면 실패 (가짜 결과 없음)', async () => {
  const out = { headline: '오늘 방문 7곳', items: [{ title: '방문', detail: '7곳' }], note: '' }
  const { d, rows } = deps(JSON.stringify(out))
  const r = await handleAssist({ task: 'briefing', input: BRIEF }, d)
  assert(r.status === 502 && /없는 숫자\(7\)/.test(String(r.body.error)), String(r.body.error))
  assert(rows[0].ok === false, '실패도 기록')
})

Deno.test('브리핑 — 입력 모양이 틀리면 모델을 부르지 않음', async () => {
  const { d, seen } = deps('{}')
  const r1 = await handleAssist({ task: 'briefing', input: { ...BRIEF, overdueAmount: -1 } }, d)
  const r2 = await handleAssist({ task: 'briefing', input: { ...BRIEF, requestKinds: { 아무거나: 1 } } }, d)
  assert(r1.status === 400 && r2.status === 400 && seen.length === 0, `${r1.body.error} / ${r2.body.error}`)
})

Deno.test('현장 메모 — 정리 · 후속 조치 종류 검사 · 메모에 없는 숫자 막기', async () => {
  const memo = '용기 2개 깨져서 교체 필요. 원무과에서 다음주 추가수거 원함. 63L 5개 더 달라고 함'
  const good = { summary: '용기 2개 파손, 다음주 추가수거와 63L 5개 요청', issues: ['용기 2개 파손 — 교체 필요'], followups: [{ kind: '추가수거', text: '다음주 추가수거 희망 — 일정 확인 필요' }, { kind: '자재·용기', text: '63L 5개 준비 가능 여부 확인' }], cleaned: '용기 2개 파손(교체 필요). 다음주 추가수거 희망, 63L 5개 추가 요청.' }
  const a = deps(JSON.stringify(good))
  const r = await handleAssist({ task: 'field_note', input: { memo } }, a.d)
  assert(r.status === 200 && a.rows[0].kind === 'field_note', JSON.stringify(r.body))
  const b = deps(JSON.stringify({ ...good, cleaned: '63L 10개 추가 요청' }))
  const rb = await handleAssist({ task: 'field_note', input: { memo } }, b.d)
  assert(rb.status === 502 && /없는 숫자\(10\)/.test(String(rb.body.error)), String(rb.body.error))
  const c = deps(JSON.stringify({ ...good, followups: [{ kind: '자동배차', text: 'x' }] }))
  const rc = await handleAssist({ task: 'field_note', input: { memo } }, c.d)
  assert(rc.status === 502 && /범위 밖/.test(String(rc.body.error)), String(rc.body.error))
  const e = deps(JSON.stringify({ ...good, cleaned: '내일 오전에 방문하겠습니다.' }))
  const re = await handleAssist({ task: 'field_note', input: { memo } }, e.d)
  assert(re.status === 502 && /확정 약속/.test(String(re.body.error)), String(re.body.error))
  const f = deps('{}')
  const rf = await handleAssist({ task: 'field_note', input: { memo: '짧' } }, f.d)
  assert(rf.status === 400 && f.seen.length === 0, '짧은 메모는 부르지 않음')
})

Deno.test('현장 메모 — 전화번호는 가린 뒤 보냄', async () => {
  const { d, seen } = deps(JSON.stringify({ summary: 's', issues: [], followups: [], cleaned: 'c' }))
  await handleAssist({ task: 'field_note', input: { memo: '원무과 010-1234-5678 로 연락 달라고 함' } }, d)
  assert(!seen[0].user.includes('1234') && seen[0].user.includes('[전화번호 가림]'), seen[0].user)
})

Deno.test('독촉 문자 — 이름 · 금액 없이 자리표시자 · 위협 표현 막기', async () => {
  const input = { months: 3, oldestMonth: '2026-07', tone: 'soft' }
  const good = { message: '{병원명} 담당자님, 안녕하세요. 비원미래입니다. 2026년 7월분부터 3개월 청구 금액 {금액}이 아직 확인되지 않아 안내드립니다. 확인 부탁드립니다.' }
  const a = deps(JSON.stringify(good))
  const r = await handleAssist({ task: 'dunning', input }, a.d)
  assert(r.status === 200 && a.rows[0].kind === 'dunning_draft', JSON.stringify(r.body))
  assert(!/원$|병원$/.test(a.seen[0].user) && !/\d{5,}/.test(a.seen[0].user), '금액 · 이름을 보내지 않음')
  const b = deps(JSON.stringify({ message: '{병원명} 미납 {금액} — 7일 안에 입금 없으면 법적 조치' }))
  const rb = await handleAssist({ task: 'dunning', input }, b.d)
  assert(rb.status === 502, String(rb.body.error))
  const c = deps(JSON.stringify({ message: '미납 금액이 있습니다. 확인 부탁드립니다.' }))
  const rc = await handleAssist({ task: 'dunning', input }, c.d)
  assert(rc.status === 502 && /자리가 없어/.test(String(rc.body.error)), String(rc.body.error))
})

Deno.test('권한 · 모르는 작업 · 키 없음 · 시간 초과', async () => {
  const f = deps('{}', 'field')
  assert((await handleAssist({ task: 'briefing', input: BRIEF }, f.d)).status === 403, '현장 계정 거부')
  const a = deps('{}')
  assert((await handleAssist({ task: 'auto_dispatch', input: {} }, a.d)).status === 400, '모르는 작업 거부')
  const k = deps('{}')
  const rk = await handleAssist({ task: 'briefing', input: BRIEF }, { ...k.d, hasKey: false })
  assert(rk.status === 503 && k.rows[0].ok === false, '키 없음 — 실패로 기록')
  const t = deps(new ProviderError('timeout', 'AI 응답 시간 초과 (20초)'))
  const rt = await handleAssist({ task: 'briefing', input: BRIEF }, t.d)
  assert(rt.status === 504 && /시간 초과/.test(String(rt.body.error)), String(rt.body.error))
})

Deno.test('금액 읽기 쉬운 말', () => {
  assert(wonWords(118714572) === '1억 1,871만 원' && wonWords(5000) === '5,000원' && wonWords(300000) === '30만 원', wonWords(118714572))
  assert(briefingMessage({ ...BRIEF, vehicles: [], oldestOpenHours: null, staleRequests: 0 }).includes('남은 3곳'), '남은 방문 계산')
})

// ─────────────────────────────────────────────────────────────────────────────
//  0142 — 「와!」 하게: 브리핑 언제 · 화면 / 메모 → 칸 채우기 / 요청 처리 계획 / 한 번 다시 묻기
// ─────────────────────────────────────────────────────────────────────────────

/** 모델이 차례로 다른 답을 내는 흉내 (다시 묻기 검사) */
function depsSeq(replies: string[]) {
  const base = deps(replies[0])
  let i = 0
  base.d.callModel = async (system: string, user: string) => {
    base.seen.push({ system, user })
    const text = replies[Math.min(i++, replies.length - 1)]
    return { text, model: 'gemini-3.1-flash-lite', usage: { input: 100, output: 50 } }
  }
  return base
}

const BRIEF2 = { ...BRIEF, vehicles: [{ label: '의료폐기물 1톤 A', left: 6 }, { label: '의료폐기물 1톤 B', left: 1 }], oldestOpenHours: 30, staleRequests: 2 }

Deno.test('브리핑 — 차량별 남은 방문 · 오래 기다린 요청을 보내고 · 할 일마다 언제 · 화면', async () => {
  const out = { headline: '긴급 1건과 하루 넘게 기다린 요청 2건부터.', items: [
    { title: '긴급 요청 1건', detail: '처리 전 3건 중 긴급 1건 — 요청함에서 먼저 회신', when: '지금', go: '요청함' },
    { title: '1톤 A 남은 6곳', detail: '의료폐기물 1톤 A 에 6곳이 몰려 있음 — 오후 일정 확인', when: '오전', go: '오늘 일정' },
    { title: '오래 기다린 요청 2건', detail: '가장 오래 30시간 — 회신 먼저', when: '오전', go: '요청함' },
    { title: '미수 2곳', detail: '1억 1,871만 원 — 안내 문구 확인', when: '마감 전', go: '미수금' },
  ], note: '' }
  const { d, seen } = deps(JSON.stringify(out))
  const r = await handleAssist({ task: 'briefing', input: BRIEF2 }, d)
  assert(r.status === 200, String(r.body.error))
  const items = (r.body.result as { items: { when: string; go: string }[] }).items
  assert(items.length === 4 && items[0].go === '요청함' && items[3].when === '마감 전', JSON.stringify(items))
  assert(seen[0].user.includes('의료폐기물 1톤 A 6곳') && seen[0].user.includes('30시간'), seen[0].user)
  const bad = deps(JSON.stringify({ ...out, items: [{ ...out.items[0], go: '자동 배차' }] }))
  const rb = await handleAssist({ task: 'briefing', input: BRIEF2 }, bad.d)
  assert(rb.status === 502 && /범위 밖/.test(String(rb.body.error)), String(rb.body.error))
})

const ITEMS = ['2L 합성수지', '63L 박스', '12L 봉투형용기']
const MEMO = '오늘 85kg 수거. 합성수지 용기 6개, 골판지 박스 4개 가져옴. 63L 박스 5개 두고 옴. 용기 2개 깨져서 교체 필요. 다음주 추가수거 원함. 처리장 인계는 내일'
const NOTE_OK = {
  summary: '85kg 수거 · 용기 2개 파손 · 다음주 추가수거 희망', issues: ['용기 2개 파손 — 교체 필요'],
  followups: [{ kind: '추가수거', text: '다음주 추가수거 희망 — 일정 확인' }],
  cleaned: '용기 일부 파손으로 교체 필요. 다음주 추가수거 희망. 처리장 인계는 내일 예정.',
  fill: { amountKg: 85, containers: [{ label: '합성수지 전용용기', qty: 6 }, { label: '골판지 전용박스', qty: 4 }], supplied: [{ item: '63L 박스', qty: 5 }], handover: '인계 대기' },
}

Deno.test('메모 → 칸 채우기 — 수거량 · 가져온 용기 · 주고 온 자재 · 인계 상태', async () => {
  const a = deps(JSON.stringify(NOTE_OK))
  const r = await handleAssist({ task: 'field_note', input: { memo: MEMO, items: ITEMS } }, a.d)
  assert(r.status === 200, String(r.body.error))
  const fill = (r.body.result as typeof NOTE_OK).fill
  assert(fill.amountKg === 85 && fill.containers.length === 2 && fill.supplied[0].item === '63L 박스' && fill.handover === '인계 대기', JSON.stringify(fill))
  assert(a.seen[0].user.includes('자재 규격 목록: 2L 합성수지 · 63L 박스'), '규격 목록을 보냄')
})

Deno.test('메모 → 칸 채우기 — 메모에 없는 숫자 · 목록에 없는 규격 · 범위 밖 칸은 실패 (한 번 다시 물은 뒤에도)', async () => {
  const cases: [unknown, RegExp][] = [
    [{ ...NOTE_OK.fill, amountKg: 90 }, /수거량\(90\)/],
    [{ ...NOTE_OK.fill, supplied: [{ item: '100L 박스', qty: 5 }] }, /목록에 없습니다/],
    [{ ...NOTE_OK.fill, containers: [{ label: '드럼통', qty: 6 }] }, /범위 밖/],
    [{ ...NOTE_OK.fill, handover: '처리 완료' }, /인계 상태가 범위 밖/],
    [{ ...NOTE_OK.fill, supplied: [{ item: '63L 박스', qty: 7 }] }, /메모에 없는 숫자/],
  ]
  for (const [fill, re] of cases) {
    const x = deps(JSON.stringify({ ...NOTE_OK, fill }))
    const r = await handleAssist({ task: 'field_note', input: { memo: MEMO, items: ITEMS } }, x.d)
    assert(r.status === 502 && re.test(String(r.body.error)) && x.rows.length === 2 && x.seen.length === 2, `${String(r.body.error)} / 기록 ${x.rows.length}`)
  }
})

const PLAN_IN = {
  request: '폐기물이 예상보다 빨리 찼습니다. 가능하면 내일 오전 수거 부탁드리고 63L 용기도 10개 부탁드립니다.',
  kind: '긴급수거', urgent: true, today: '2026-10-16',
  target: { date: '2026-10-17', why: '요청 글의 「내일」' },
  vehicles: [{ label: '의료폐기물 1톤 A', visits: 4, regular: false, alreadyThere: false }, { label: '의료폐기물 1톤 B', visits: 2, regular: true, alreadyThere: false }],
  pick: '의료폐기물 1톤 B',
  stock: [{ name: '골판지 전용박스', qty: 480 }, { name: '합성수지 전용용기', qty: 360 }],
  items: [{ name: '63L 박스', stock: '골판지 전용박스' }, { name: '2L 합성수지', stock: '합성수지 전용용기' }],
  history: { lastVisit: '2026-10-09', nextVisit: null, visits90: 12, urgent90: 3, overdueMonths: 0 },
}
const PLAN_OK = {
  asks: [{ what: '빠른 수거', qty: null, item: null }, { what: '63L 용기', qty: 10, item: '63L 박스' }],
  when: '내일 오전',
  steps: [
    { title: '방문일 정하기', detail: '10월 17일 — 그날 의료폐기물 1톤 B 방문 2곳으로 가장 여유, 늘 가던 차량' },
    { title: '63L 박스 10개 챙기기', detail: '골판지 전용박스 재고 480개 — 10개 충분' },
    { title: '회신 남기기', detail: '내일 오전 방문 가능 여부를 확정한 뒤 안내' },
    { title: '정기 주기 점검', detail: '최근 90일 긴급 요청 3번 — 방문 주기 당기기 검토' },
  ],
  watch: ['최근 90일 긴급 요청 3번 · 다음 방문이 잡혀 있지 않음'],
  reply: '요청 확인했습니다. 내일(10월 17일) 오전 수거가 가능하도록 일정을 확인하고 있으며, 63L 용기 10개도 함께 준비할 수 있는지 확인하고 있습니다. 확정되면 바로 다시 안내드리겠습니다.',
}

Deno.test('요청 처리 계획 — 자료를 보내고 · 계획 · 구체 회신 · request_plan 로 기록', async () => {
  const { d, rows, seen } = deps(JSON.stringify(PLAN_OK))
  const r = await handleAssist({ task: 'request_plan', input: PLAN_IN }, d)
  assert(r.status === 200, String(r.body.error))
  const out = r.body.result as typeof PLAN_OK
  assert(out.asks[1].item === '63L 박스' && out.steps.length === 4 && out.reply.includes('10월 17일'), JSON.stringify(out))
  assert(rows[0].kind === 'request_plan' && rows[0].ok, '기록 kind')
  const u = seen[0].user
  assert(u.includes('의료폐기물 1톤 B 2곳 (늘 가던 차량)') && u.includes('골판지 전용박스 480개') && u.includes('최근 90일 긴급 요청 3번') && u.includes('2026-10-17 (10월 17일)'), u)
  assert(!/[가-힣]+(병원|의원|재단)/.test(u), '병원 이름을 보내지 않음')
})

Deno.test('요청 처리 계획 — 회신에 차량 이름 · 재고 숫자 · 확정 약속 · 지어낸 숫자가 있으면 실패', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ reply: '내일 의료폐기물 1톤 B 가 갑니다. 확정되면 다시 안내드리겠습니다.' }, /차량 이름/],
    [{ reply: '재고가 480개라 충분합니다. 확정되면 다시 안내드리겠습니다.' }, /내부 숫자/],
    [{ reply: '내일 오전에 방문하겠습니다.' }, /확정 약속/],
    [{ steps: [{ title: '방문일', detail: '그날 1톤 A 방문 7곳' }, { title: '회신', detail: '안내' }] }, /없는 숫자\(7\)/],
    [{ asks: [{ what: '63L 용기', qty: 20, item: '63L 박스' }] }, /요청 글에 없는 숫자/],
    [{ asks: [{ what: '63L 용기', qty: 10, item: '100L 박스' }] }, /목록에 없습니다/],
  ]
  for (const [patch, re] of cases) {
    const x = deps(JSON.stringify({ ...PLAN_OK, ...patch }))
    const r = await handleAssist({ task: 'request_plan', input: PLAN_IN }, x.d)
    assert(r.status === 502 && re.test(String(r.body.error)), `${JSON.stringify(patch).slice(0, 60)} → ${String(r.body.error)}`)
  }
})

Deno.test('요청 처리 계획 — 입력 모양이 틀리면 모델을 부르지 않음', async () => {
  const bads = [
    { ...PLAN_IN, request: '짧' },
    { ...PLAN_IN, pick: '없는 차량' },
    { ...PLAN_IN, target: { date: '내일', why: 'x' } },
    { ...PLAN_IN, history: { ...PLAN_IN.history, visits90: -1 } },
    { ...PLAN_IN, items: [{ name: '63L 박스', stock: '없는 칸' }] },
  ]
  for (const b of bads) {
    const x = deps('{}')
    const r = await handleAssist({ task: 'request_plan', input: b }, x.d)
    assert(r.status === 400 && x.seen.length === 0, String(r.body.error))
  }
  const ok = readPlan(PLAN_IN)
  assert(ok.ok && planMessage(ok.value).includes('시스템 추천 차량: 의료폐기물 1톤 B'), '추천 차량을 함께 보냄')
})

Deno.test('한 번 다시 묻기 — 첫 답이 검사에 걸리면 까닭을 알려 주고 다시 · 둘째 답이 맞으면 성공', async () => {
  const badFirst = JSON.stringify({ ...PLAN_OK, reply: '재고가 480개라 충분합니다. 확정되면 다시 안내드리겠습니다.' })
  const x = depsSeq([badFirst, JSON.stringify(PLAN_OK)])
  const r = await handleAssist({ task: 'request_plan', input: PLAN_IN }, x.d)
  assert(r.status === 200, String(r.body.error))
  assert(x.seen.length === 2 && /앞의 답은 쓰이지 못했습니다 — 까닭: 회신에/.test(x.seen[1].user), x.seen[1]?.user.slice(-120) ?? '')
  assert(x.rows.length === 2 && x.rows[0].ok === false && x.rows[1].ok === true, '두 번 다 기록 (첫 번째는 실패)')
})
