// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 업무 보조 AI 세 가지 (0141 · 신보 발표 · 실제 Gemini 호출)
//
//   briefing    오늘 브리핑      — 대시보드 숫자(건수 · 금액)만 읽고 「오늘 먼저 챙길 일」 셋
//   field_note  현장 메모 정리   — 기사님이 적은 메모를 사무실이 바로 쓸 수 있게 정리
//   dunning     독촉 문자 초안   — 병원 이름 · 금액은 **보내지 않고** 자리표시자({병원명} · {금액})로
//
//  ⚠ 셋 다 **제안**입니다. 저장 · 전송 · 상태 변경을 하는 코드가 없습니다 — 담당자가 고르고 고쳐 씁니다.
//  ⚠ 결과는 엄격하게 검사합니다(프롬프트만 믿지 않음). 받은 글에 없는 숫자 · 확정 약속 · 범위 밖 값이면
//    **실패**로 돌려보냅니다 — 고정 문구로 갈아끼워 성공처럼 보이게 하지 않습니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════

import { PROMISE, REQUEST_KINDS, isStr, numbersIn, scrub, unitTokens } from './triage.ts'

export const ASSIST_TASKS = ['briefing', 'field_note', 'dunning'] as const
export type AssistTask = (typeof ASSIST_TASKS)[number]

/** ai_calls.kind — 병원 요청 분석(request_triage)과 섞이지 않게 따로 */
export const ASSIST_KIND: Record<AssistTask, string> = {
  briefing: 'today_briefing',
  field_note: 'field_note',
  dunning: 'dunning_draft',
}

type Ok<T> = { ok: true; value: T }
type Bad = { ok: false; error: string }
const bad = (error: string): Bad => ({ ok: false, error })

const COMMON_RULES = [
  '반드시 지킬 것:',
  '- 받은 글에 없는 사실 · 숫자를 만들어내지 않는다. 숫자는 받은 글에 있는 것만 그대로 쓴다.',
  '- 회사가 확정한 것처럼 약속하지 않는다 (「방문하겠습니다」 「배차했습니다」 금지). 확인이 필요하면 「확인 필요」로 쓴다.',
  '- 사람 이름 · 연락처를 새로 적지 않는다.',
  '- 답은 JSON 객체 하나로만 한다 (설명 문장 · 코드 블록 없이).',
]

/** 원 단위 금액 → 「1억 1,871만 원」 (AI 가 읽기 쉬운 말 — 원래 숫자도 함께 보냅니다) */
export function wonWords(n: number): string {
  const v = Math.round(n)
  if (v < 10_000) return `${v.toLocaleString('en-US')}원`
  const eok = Math.floor(v / 100_000_000)
  const man = Math.floor((v % 100_000_000) / 10_000)
  return [eok ? `${eok}억` : '', man ? `${man.toLocaleString('en-US')}만` : ''].filter(Boolean).join(' ') + ' 원'
}

const int = (v: unknown, max = 1e12): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null

/** 결과 글 전체에서 받은 글에 없는 숫자 · 단위 표현을 찾습니다 */
function inventedNumbers(out: string, source: string, extra: string[] = []): string[] {
  const allowed = new Set([...numbersIn(source), ...extra])
  for (const n of numbersIn(source)) allowed.add(String(Number(n)))
  return [...new Set(numbersIn(out).filter((x) => !allowed.has(x) && !allowed.has(String(Number(x)))))]
}

function parseJson(raw: string): Ok<Record<string, unknown>> | Bad {
  let v: unknown
  try {
    v = JSON.parse(raw.trim())
  } catch {
    return bad('AI 응답이 JSON 이 아닙니다')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('AI 응답이 JSON 객체가 아닙니다')
  return { ok: true, value: v as Record<string, unknown> }
}

const strArr = (v: unknown, max: number, each: number): string[] | null => {
  if (v == null) return []
  if (!Array.isArray(v) || !v.every(isStr)) return null
  const a = v.map((x) => x.trim()).filter(Boolean)
  return a.length <= max && a.every((x) => x.length <= each) ? a : null
}

// ─────────────────────────────────────────────────────────────────────────────
//  ① 오늘 브리핑
// ─────────────────────────────────────────────────────────────────────────────

export interface BriefingInput {
  date: string
  visitsPlanned: number
  visitsDone: number
  openRequests: number
  urgentRequests: number
  /** 처리 전 요청 — 종류별 건수 */
  requestKinds: Record<string, number>
  /** 다음 방문이 안 잡힌 거래처 수 */
  unscheduledClients: number
  /** 지난달 이전 청구가 남은 거래처 수 · 금액(원) */
  overdueClients: number
  overdueAmount: number
}

export interface BriefingOutput {
  headline: string
  items: { title: string; detail: string }[]
  note: string
}

export function readBriefing(v: unknown): Ok<BriefingInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const date = isStr(o.date) && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null
  const nums = ['visitsPlanned', 'visitsDone', 'openRequests', 'urgentRequests', 'unscheduledClients', 'overdueClients', 'overdueAmount'] as const
  const got: Record<string, number> = {}
  for (const k of nums) {
    const n = int(o[k])
    if (n == null) return bad(`브리핑 숫자가 맞지 않습니다 (${k})`)
    got[k] = n
  }
  const kinds: Record<string, number> = {}
  const rk = (o.requestKinds ?? {}) as Record<string, unknown>
  if (typeof rk !== 'object' || Array.isArray(rk)) return bad('요청 종류별 건수 형식이 맞지 않습니다')
  for (const [k, c] of Object.entries(rk)) {
    if (!(REQUEST_KINDS as readonly string[]).includes(k)) return bad(`모르는 요청 종류: ${k.slice(0, 12)}`)
    const n = int(c, 100_000)
    if (n == null) return bad('요청 종류별 건수가 맞지 않습니다')
    if (n > 0) kinds[k] = n
  }
  if (!date) return bad('브리핑 날짜가 맞지 않습니다')
  return { ok: true, value: { date, ...(got as Omit<BriefingInput, 'date' | 'requestKinds'>), requestKinds: kinds } }
}

export const BRIEFING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 대표의 아침 업무 보조다.',
  '아래 「오늘 운영 숫자」만 보고, 대표가 오늘 먼저 챙길 일을 우선순위대로 최대 3가지 정리한다.',
  '우선순위 기준: 긴급 요청 → 오늘 남은 방문 → 처리 전 요청 → 다음 방문이 안 잡힌 거래처 → 지난 청구 미수. 0 인 항목은 쓰지 않는다.',
  ...COMMON_RULES,
  '- 거래처 이름은 받지 않았으므로 쓰지 않는다. 「~곳」 「~건」처럼 숫자로만 말한다.',
  '',
  '답 형식:',
  '{',
  '  "headline": "오늘을 한 문장으로 (40자 안팎)",',
  '  "items": [{ "title": "먼저 챙길 일 (20자 안팎)", "detail": "왜 · 무엇을 (60자 안팎)" }],',
  '  "note": "덧붙일 한 마디 (없으면 빈 글)"',
  '}',
].join('\n')

export function briefingMessage(b: BriefingInput): string {
  const kinds = Object.entries(b.requestKinds).map(([k, n]) => `${k} ${n}건`).join(', ') || '없음'
  return [
    `오늘 날짜: ${b.date}`,
    `오늘 예정 방문: ${b.visitsPlanned}곳 (완료 ${b.visitsDone}곳 · 남은 ${Math.max(0, b.visitsPlanned - b.visitsDone)}곳)`,
    `처리 전 병원 요청: ${b.openRequests}건 (그중 긴급 ${b.urgentRequests}건)`,
    `처리 전 요청 종류: ${kinds}`,
    `다음 방문이 안 잡힌 거래처: ${b.unscheduledClients}곳`,
    `지난달 이전 청구가 남은 거래처: ${b.overdueClients}곳 · 금액 ${wonWords(b.overdueAmount)} (${b.overdueAmount.toLocaleString('en-US')}원)`,
  ].join('\n')
}

export function parseBriefing(raw: string, message: string): Ok<BriefingOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const headline = isStr(o.headline) ? o.headline.trim() : ''
  if (!headline || headline.length > 120) return bad('브리핑 첫 문장이 없거나 너무 깁니다')
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 3) return bad('먼저 챙길 일은 1~3개여야 합니다')
  const items: BriefingOutput['items'] = []
  for (const it of o.items) {
    const t = (it ?? {}) as Record<string, unknown>
    const title = isStr(t.title) ? t.title.trim() : ''
    const detail = isStr(t.detail) ? t.detail.trim() : ''
    if (!title || title.length > 60 || detail.length > 160) return bad('먼저 챙길 일 형식이 맞지 않습니다')
    items.push({ title, detail })
  }
  const note = isStr(o.note) ? o.note.trim() : ''
  if (note.length > 160) return bad('덧붙인 말이 너무 깁니다')
  const all = [headline, note, ...items.flatMap((x) => [x.title, x.detail])].join('\n')
  //  「1순위 · 2순위 · 3가지」 같은 차례 숫자는 허용
  const inv = inventedNumbers(all, message, ['1', '2', '3'])
  if (inv.length) return bad(`브리핑에 받은 숫자에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('브리핑이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { headline, items, note } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ② 현장 메모 정리
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_MAX = 600
export const FOLLOW_KINDS = ['추가수거', '자재·용기', '일정 확인', '병원 연락', '기타'] as const

export interface FieldNoteOutput {
  summary: string
  issues: string[]
  followups: { kind: (typeof FOLLOW_KINDS)[number]; text: string }[]
  cleaned: string
}

export function readFieldNote(v: unknown): Ok<{ memo: string }> | Bad {
  const memo = isStr((v as { memo?: unknown } | null)?.memo) ? scrub(((v as { memo: string }).memo).trim()).slice(0, FIELD_MAX) : ''
  if (memo.length < 4) return bad('정리할 메모가 너무 짧습니다 (4자 이상)')
  return { ok: true, value: { memo } }
}

export const FIELD_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 업무 보조다.',
  '현장 기사가 수거하면서 급하게 적은 메모를 읽고, 사무실이 바로 쓸 수 있게 정리한다.',
  ...COMMON_RULES,
  '- 메모에 없는 후속 조치는 만들지 않는다. 메모가 말한 것만 「후속 조치 제안」으로 옮긴다.',
  '',
  `후속 조치 종류는 다음 중에서만: ${FOLLOW_KINDS.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "summary": "메모 요약 한 문장",',
  '  "issues": ["확인할 특이사항 짧게 (없으면 빈 배열, 최대 4개)"],',
  '  "followups": [{ "kind": "종류 하나", "text": "무엇을 (짧게)" }],',
  '  "cleaned": "수거 기록의 특이사항 칸에 넣을 깔끔한 한두 문장"',
  '}',
].join('\n')

export const fieldMessage = (memo: string) => ['현장 메모:', '"""', memo, '"""'].join('\n')

export function parseFieldNote(raw: string, memo: string): Ok<FieldNoteOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const summary = isStr(o.summary) ? o.summary.trim() : ''
  const cleaned = isStr(o.cleaned) ? o.cleaned.trim() : ''
  if (!summary || summary.length > 200) return bad('메모 요약이 없거나 너무 깁니다')
  if (!cleaned || cleaned.length > 300) return bad('정리본이 없거나 너무 깁니다')
  const issues = strArr(o.issues, 4, 100)
  if (!issues) return bad('특이사항 형식이 맞지 않습니다')
  if (o.followups != null && !Array.isArray(o.followups)) return bad('후속 조치 형식이 맞지 않습니다')
  const followups: FieldNoteOutput['followups'] = []
  for (const f of (o.followups as unknown[] | undefined) ?? []) {
    const x = (f ?? {}) as Record<string, unknown>
    const kind = isStr(x.kind) ? x.kind.trim() : ''
    const text = isStr(x.text) ? x.text.trim() : ''
    if (!(FOLLOW_KINDS as readonly string[]).includes(kind)) return bad(`후속 조치 종류가 범위 밖입니다: ${kind.slice(0, 12)}`)
    if (!text || text.length > 100) return bad('후속 조치 글이 없거나 너무 깁니다')
    followups.push({ kind: kind as FieldNoteOutput['followups'][number]['kind'], text })
  }
  if (followups.length > 3) return bad('후속 조치는 3개까지입니다')
  const all = [summary, cleaned, ...issues, ...followups.map((f) => f.text)].join('\n')
  const inv = inventedNumbers(all, memo)
  if (inv.length) return bad(`정리본에 메모에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  const okUnits = new Set(unitTokens(memo))
  const invU = [...new Set(unitTokens(all).filter((x) => !okUnits.has(x)))]
  if (invU.length) return bad(`정리본에 메모에 없는 표현(${invU.join(', ')})이 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('정리본이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { summary, issues, followups, cleaned } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ③ 독촉 문자 초안 — 병원 이름 · 금액은 보내지 않음
// ─────────────────────────────────────────────────────────────────────────────

export const DUNNING_TONES = ['soft', 'firm'] as const
export interface DunningInput {
  months: number
  oldestMonth: string
  tone: (typeof DUNNING_TONES)[number]
}

export function readDunning(v: unknown): Ok<DunningInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const months = int(o.months, 120)
  if (!months) return bad('밀린 개월 수가 맞지 않습니다')
  if (!isStr(o.oldestMonth) || !/^\d{4}-\d{2}$/.test(o.oldestMonth)) return bad('가장 오래된 청구월이 맞지 않습니다 (YYYY-MM)')
  const tone = (DUNNING_TONES as readonly string[]).includes(o.tone as string) ? (o.tone as DunningInput['tone']) : null
  if (!tone) return bad('말투가 맞지 않습니다 (soft · firm)')
  return { ok: true, value: { months, oldestMonth: o.oldestMonth, tone } }
}

export const DUNNING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」가 거래 병원에 보낼 미납 안내 문자의 초안을 쓴다.',
  '병원 이름은 반드시 {병원명}, 미납 금액은 반드시 {금액} 이라는 글자 그대로 둔다 (실제 값은 담당자 화면에서 채운다).',
  '반드시 지킬 것:',
  '- 법적 조치 · 연체 이자 · 거래 중단 같은 위협을 쓰지 않는다. 계좌번호 · 전화번호 · 날짜 기한을 새로 만들지 않는다.',
  '- 받은 글에 없는 숫자를 쓰지 않는다.',
  '- 4~6문장, 존댓말. 문자로 보내기 좋게 짧게.',
  '- 답은 JSON 객체 하나로만: { "message": "문자 초안" }',
].join('\n')

export function dunningMessageInput(d: DunningInput): string {
  const [y, m] = d.oldestMonth.split('-').map(Number)
  return [
    `밀린 기간: ${y}년 ${m}월 청구분부터 ${d.months}개월`,
    `말투: ${d.tone === 'soft' ? '부드럽고 정중하게 (처음 안내)' : '정중하지만 분명하게 (여러 번 안내한 뒤)'}`,
  ].join('\n')
}

export function parseDunning(raw: string, input: string): Ok<{ message: string }> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const message = isStr(j.value.message) ? j.value.message.trim() : ''
  if (!message || message.length > 500) return bad('문자 초안이 없거나 너무 깁니다')
  if (!message.includes('{병원명}') || !message.includes('{금액}')) return bad('문자 초안에 {병원명} · {금액} 자리가 없어 쓰지 않았습니다')
  const inv = inventedNumbers(message.replace(/\{[^}]*\}/g, ''), input)
  if (inv.length) return bad(`문자 초안에 받은 글에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (/법적|소송|고소|연체\s*이자|거래\s*중단|압류/.test(message)) return bad('문자 초안에 위협하는 표현이 있어 쓰지 않았습니다')
  return { ok: true, value: { message } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  한 곳에서 고르기
// ─────────────────────────────────────────────────────────────────────────────

export interface AssistPlan {
  system: string
  message: string
  parse(raw: string): Ok<unknown> | Bad
}

export function planAssist(task: AssistTask, input: unknown): Ok<AssistPlan> | Bad {
  if (task === 'briefing') {
    const r = readBriefing(input)
    if (!r.ok) return r
    const message = briefingMessage(r.value)
    return { ok: true, value: { system: BRIEFING_PROMPT, message, parse: (raw) => parseBriefing(raw, message) } }
  }
  if (task === 'field_note') {
    const r = readFieldNote(input)
    if (!r.ok) return r
    return { ok: true, value: { system: FIELD_PROMPT, message: fieldMessage(r.value.memo), parse: (raw) => parseFieldNote(raw, r.value.memo) } }
  }
  const r = readDunning(input)
  if (!r.ok) return r
  const message = dunningMessageInput(r.value)
  return { ok: true, value: { system: DUNNING_PROMPT, message, parse: (raw) => parseDunning(raw, message) } }
}
