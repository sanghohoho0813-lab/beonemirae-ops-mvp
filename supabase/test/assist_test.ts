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
import { briefingMessage, wonWords } from '../functions/ai-triage/assist.ts'

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
  assert(briefingMessage(BRIEF).includes('남은 3곳'), '남은 방문 계산')
})
