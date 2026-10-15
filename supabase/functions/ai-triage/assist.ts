// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 업무 보조 AI 세 가지 (0141 · 신보 발표 · 실제 Gemini 호출)
//
//   briefing    오늘 브리핑      — 대시보드 숫자(건수 · 금액)만 읽고 「오늘 먼저 챙길 일」 셋
//   field_note  현장 메모 정리   — 기사님이 적은 메모를 사무실이 바로 쓸 수 있게 정리
//   dunning     독촉 문자 초안   — 병원 이름 · 금액은 **보내지 않고** 자리표시자({병원명} · {금액})로
//   request_plan 요청 처리 계획 (0142) — 요청 글 + 시스템 자료(그날 차량별 방문 · 사무실 재고 · 이 병원 이력)로
//                「원하는 것 · 처리 순서 · 주의 · 구체 회신」. 병원 이름 · 기사 이름은 보내지 않음
//
//  0142 — 대표님: 「AI 버튼이 너무 간단한 업무만 돕는다. 누가 봐도 와! 하게 디테일까지 관여해서」.
//   · 브리핑: 차량별 남은 방문 · 오래 기다린 요청까지 보고, 할 일마다 「언제 · 어느 화면」을 붙임
//   · 메모 정리: 메모에서 수거량 · 가져온 용기 · 주고 온 자재 · 인계 상태를 뽑아 **수거 입력 칸 채우기 제안**
//   · 요청 처리 계획: 위
//   ⚠ 숫자는 여전히 받은 글 · 받은 자료에 있는 것만. 칸 채우기 · 일정 · 회신은 모두 **담당자가 눌러야** 반영.
//
//  ⚠ 셋 다 **제안**입니다. 저장 · 전송 · 상태 변경을 하는 코드가 없습니다 — 담당자가 고르고 고쳐 씁니다.
//  ⚠ 결과는 엄격하게 검사합니다(프롬프트만 믿지 않음). 받은 글에 없는 숫자 · 확정 약속 · 범위 밖 값이면
//    **실패**로 돌려보냅니다 — 고정 문구로 갈아끼워 성공처럼 보이게 하지 않습니다.
//  ⚠ Deno 전용 기능을 쓰지 않습니다 — Node 검사도 이 파일을 읽습니다.
// ═══════════════════════════════════════════════════════════════════════════

import { PROMISE, REQUEST_KINDS, isStr, numbersIn, scrub, unitTokens } from './triage.ts'

export const ASSIST_TASKS = ['briefing', 'field_note', 'dunning', 'request_plan'] as const
export type AssistTask = (typeof ASSIST_TASKS)[number]

/** ai_calls.kind — 병원 요청 분석(request_triage)과 섞이지 않게 따로 */
export const ASSIST_KIND: Record<AssistTask, string> = {
  briefing: 'today_briefing',
  field_note: 'field_note',
  dunning: 'dunning_draft',
  request_plan: 'request_plan',
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
  /** 0142 — 차량별 오늘 남은 방문 (차량 이름 · 곳 수). 기사 이름은 보내지 않음 */
  vehicles: { label: string; left: number }[]
  /** 0142 — 처리 전 요청 중 가장 오래 기다린 시간(시간 단위) · 하루 넘게 기다린 건수 */
  oldestOpenHours: number | null
  staleRequests: number
}

/** 브리핑 할 일마다 붙는 「어느 화면」 — 화면이 단추로 바꿉니다 */
export const BRIEF_GO = ['요청함', '오늘 일정', '수거 입력', '방문 계획', '미수금'] as const
export const BRIEF_WHEN = ['지금', '오전', '오후', '마감 전'] as const

export interface BriefingOutput {
  headline: string
  items: { title: string; detail: string; when: (typeof BRIEF_WHEN)[number] | null; go: (typeof BRIEF_GO)[number] | null }[]
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
  //  0142 — 없어도 됩니다(옛 화면). 있으면 모양을 확인합니다.
  const vehicles: BriefingInput['vehicles'] = []
  if (o.vehicles != null) {
    if (!Array.isArray(o.vehicles) || o.vehicles.length > 12) return bad('차량별 남은 방문 형식이 맞지 않습니다')
    for (const v of o.vehicles) {
      const x = (v ?? {}) as Record<string, unknown>
      const label = isStr(x.label) ? x.label.trim().slice(0, 30) : ''
      const left = int(x.left, 500)
      if (!label || left == null) return bad('차량별 남은 방문 형식이 맞지 않습니다')
      vehicles.push({ label, left })
    }
  }
  const oldestOpenHours = o.oldestOpenHours == null ? null : int(o.oldestOpenHours, 24 * 365)
  if (o.oldestOpenHours != null && oldestOpenHours == null) return bad('가장 오래 기다린 요청 시간이 맞지 않습니다')
  const staleRequests = o.staleRequests == null ? 0 : int(o.staleRequests, 100_000)
  if (staleRequests == null) return bad('오래 기다린 요청 수가 맞지 않습니다')
  return { ok: true, value: { date, ...(got as Omit<BriefingInput, 'date' | 'requestKinds' | 'vehicles' | 'oldestOpenHours' | 'staleRequests'>), requestKinds: kinds, vehicles, oldestOpenHours, staleRequests } }
}

export const BRIEFING_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 대표의 아침 업무 보조다.',
  '아래 「오늘 운영 숫자」만 보고, 대표가 오늘 할 일을 우선순위대로 3~4가지, 구체적으로 정리한다.',
  '우선순위 기준: 긴급 요청 → 오래 기다린 요청 → 오늘 남은 방문(차량별로 몰린 곳) → 다음 방문이 안 잡힌 거래처 → 지난 청구 미수. 0 인 항목은 쓰지 않는다.',
  '각 할 일에는 왜 지금 해야 하는지(숫자 근거)와 무엇을 하면 되는지를 적고, 언제 할지와 어느 화면에서 할지를 고른다.',
  '차량별 남은 방문이 한 차량에 몰려 있으면 그 차량 이름과 곳 수를 들어 말한다.',
  ...COMMON_RULES,
  '- 거래처 이름은 받지 않았으므로 쓰지 않는다. 「~곳」 「~건」처럼 숫자로만 말한다.',
  '',
  `언제(when)는 다음 중 하나: ${BRIEF_WHEN.map((k) => `"${k}"`).join(', ')}`,
  `어느 화면(go)은 다음 중 하나: ${BRIEF_GO.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "headline": "오늘을 한 문장으로 (40자 안팎)",',
  '  "items": [{ "title": "할 일 (20자 안팎)", "detail": "왜(숫자 근거) · 무엇을 (80자 안팎)", "when": "언제", "go": "어느 화면" }],',
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
    ...(b.vehicles.length ? [`차량별 오늘 남은 방문: ${b.vehicles.map((v) => `${v.label} ${v.left}곳`).join(' · ')}`] : []),
    ...(b.oldestOpenHours != null ? [`처리 전 요청 중 가장 오래 기다린 것: ${b.oldestOpenHours}시간 · 하루(24시간) 넘게 기다린 요청 ${b.staleRequests}건`] : []),
  ].join('\n')
}

export function parseBriefing(raw: string, message: string): Ok<BriefingOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  const headline = isStr(o.headline) ? o.headline.trim() : ''
  if (!headline || headline.length > 120) return bad('브리핑 첫 문장이 없거나 너무 깁니다')
  if (!Array.isArray(o.items) || o.items.length < 1 || o.items.length > 4) return bad('먼저 챙길 일은 1~4개여야 합니다')
  const items: BriefingOutput['items'] = []
  for (const it of o.items) {
    const t = (it ?? {}) as Record<string, unknown>
    const title = isStr(t.title) ? t.title.trim() : ''
    const detail = isStr(t.detail) ? t.detail.trim() : ''
    if (!title || title.length > 60 || detail.length > 200) return bad('먼저 챙길 일 형식이 맞지 않습니다')
    //  언제 · 어느 화면 — 빠지면 없음(null), 범위 밖이면 실패
    const when = t.when == null || t.when === '' ? null : (BRIEF_WHEN as readonly string[]).includes(t.when as string) ? (t.when as BriefingOutput['items'][number]['when']) : undefined
    const go = t.go == null || t.go === '' ? null : (BRIEF_GO as readonly string[]).includes(t.go as string) ? (t.go as BriefingOutput['items'][number]['go']) : undefined
    if (when === undefined) return bad(`할 일의 「언제」가 범위 밖입니다: ${String(t.when).slice(0, 12)}`)
    if (go === undefined) return bad(`할 일의 「화면」이 범위 밖입니다: ${String(t.go).slice(0, 12)}`)
    items.push({ title, detail, when, go })
  }
  const note = isStr(o.note) ? o.note.trim() : ''
  if (note.length > 160) return bad('덧붙인 말이 너무 깁니다')
  const all = [headline, note, ...items.flatMap((x) => [x.title, x.detail])].join('\n')
  //  「1순위 · 2순위 · 3가지」 같은 차례 숫자는 허용
  const inv = inventedNumbers(all, message, ['1', '2', '3', '4'])
  if (inv.length) return bad(`브리핑에 받은 숫자에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  if (PROMISE.test(all)) return bad('브리핑이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { headline, items, note } }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ② 현장 메모 정리
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_MAX = 600
export const FOLLOW_KINDS = ['추가수거', '자재·용기', '일정 확인', '병원 연락', '기타'] as const
/** 수거 입력의 「가져온 용기」 칸 이름 (화면과 같은 글) */
export const CONTAINER_LABELS = ['골판지 전용박스', '합성수지 전용용기', '전용 봉투', '기타'] as const
/** 수거 입력의 「처리장 인계 상태」 */
export const HANDOVERS = ['수거 완료', '인계 대기', '인계 완료'] as const

/** 0142 — 메모에서 뽑은 「수거 입력 칸 채우기」 제안 (담당자가 눌러야 칸에 들어감) */
export interface FieldFill {
  amountKg: number | null
  containers: { label: (typeof CONTAINER_LABELS)[number]; qty: number }[]
  supplied: { item: string; qty: number }[]
  handover: (typeof HANDOVERS)[number] | null
}

export interface FieldNoteOutput {
  summary: string
  issues: string[]
  followups: { kind: (typeof FOLLOW_KINDS)[number]; text: string }[]
  cleaned: string
  fill: FieldFill
}

export interface FieldNoteInput {
  memo: string
  /** 「주고 온 자재」 규격 이름 (화면 목록 그대로) — 없으면 자재 칸은 채우지 않음 */
  items: string[]
}

export function readFieldNote(v: unknown): Ok<FieldNoteInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const memo = isStr(o.memo) ? scrub(o.memo.trim()).slice(0, FIELD_MAX) : ''
  if (memo.length < 4) return bad('정리할 메모가 너무 짧습니다 (4자 이상)')
  const items = o.items == null ? [] : strArr(o.items, 40, 30)
  if (!items) return bad('자재 규격 목록 형식이 맞지 않습니다')
  return { ok: true, value: { memo, items } }
}

export const FIELD_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 업무 보조다.',
  '현장 기사가 수거하면서 급하게 적은 메모를 읽고, 사무실이 바로 쓸 수 있게 정리한다.',
  '그리고 메모에 적힌 값으로 「수거 입력」 칸을 채울 수 있게 뽑는다:',
  '  · amountKg — 수거량(kg). 메모에 kg 숫자가 있을 때만. 없으면 null',
  `  · containers — 병원에서 가져온 용기 수. 칸 이름은 다음 중에서만: ${CONTAINER_LABELS.map((k) => `"${k}"`).join(', ')}`,
  '  · supplied — 병원에 두고 온(새로 준) 자재. item 은 아래 「자재 규격 목록」의 이름 그대로만. 규격이 분명하지 않으면 넣지 않는다',
  `  · handover — 처리장 인계 상태. 다음 중 하나 또는 null: ${HANDOVERS.map((k) => `"${k}"`).join(', ')}`,
  '  「깨졌다 · 교체 필요」처럼 아직 주지 않은 것은 supplied 에 넣지 않고 후속 조치로 둔다.',
  ...COMMON_RULES,
  '- 메모에 없는 후속 조치는 만들지 않는다. 메모가 말한 것만 「후속 조치 제안」으로 옮긴다.',
  '- 칸에 들어간 숫자(수거량 · 개수)는 정리본(cleaned)에 다시 쓰지 않는다 — 정리본은 특이사항만.',
  '',
  `후속 조치 종류는 다음 중에서만: ${FOLLOW_KINDS.map((k) => `"${k}"`).join(', ')}`,
  '',
  '답 형식:',
  '{',
  '  "summary": "메모 요약 한 문장",',
  '  "issues": ["확인할 특이사항 짧게 (없으면 빈 배열, 최대 4개)"],',
  '  "followups": [{ "kind": "종류 하나", "text": "무엇을 (짧게)" }],',
  '  "cleaned": "수거 기록의 특이사항 칸에 넣을 깔끔한 한두 문장",',
  '  "fill": { "amountKg": 숫자 또는 null, "containers": [{ "label": "칸 이름", "qty": 숫자 }], "supplied": [{ "item": "규격 이름", "qty": 숫자 }], "handover": "인계 상태" 또는 null }',
  '}',
].join('\n')

export const fieldMessage = (f: FieldNoteInput | string) => {
  const x = typeof f === 'string' ? { memo: f, items: [] } : f
  return [
    '현장 메모:', '"""', x.memo, '"""',
    `자재 규격 목록: ${x.items.length ? x.items.join(' · ') : '없음 (자재 칸은 채우지 않음)'}`,
  ].join('\n')
}

const EMPTY_FILL: FieldFill = { amountKg: null, containers: [], supplied: [], handover: null }

/** 칸 채우기 제안 검사 — 숫자는 메모에 있는 것만 · 이름은 정해진 목록에서만 */
function readFill(v: unknown, memo: string, items: string[]): Ok<FieldFill> | Bad {
  if (v == null) return { ok: true, value: EMPTY_FILL }
  if (typeof v !== 'object' || Array.isArray(v)) return bad('칸 채우기 형식이 맞지 않습니다')
  const o = v as Record<string, unknown>
  const nums = new Set(numbersIn(memo).map((x) => String(Number(x))))
  const fromMemo = (n: number) => nums.has(String(n))
  let amountKg: number | null = null
  if (o.amountKg != null) {
    const n = typeof o.amountKg === 'number' && Number.isFinite(o.amountKg) && o.amountKg > 0 && o.amountKg <= 100_000 ? o.amountKg : null
    if (n == null) return bad('수거량 형식이 맞지 않습니다')
    if (!fromMemo(n)) return bad(`수거량(${n})이 메모에 없는 숫자라 쓰지 않았습니다`)
    amountKg = n
  }
  const qtyOk = (q: unknown): q is number => typeof q === 'number' && Number.isInteger(q) && q > 0 && q <= 10_000
  const containers: FieldFill['containers'] = []
  if (o.containers != null) {
    if (!Array.isArray(o.containers) || o.containers.length > CONTAINER_LABELS.length) return bad('가져온 용기 형식이 맞지 않습니다')
    for (const c of o.containers) {
      const x = (c ?? {}) as Record<string, unknown>
      const label = isStr(x.label) ? x.label.trim() : ''
      if (!(CONTAINER_LABELS as readonly string[]).includes(label)) return bad(`가져온 용기 칸 이름이 범위 밖입니다: ${label.slice(0, 12)}`)
      if (!qtyOk(x.qty)) return bad('가져온 용기 수가 맞지 않습니다')
      if (!fromMemo(x.qty)) return bad(`가져온 용기 수(${x.qty})가 메모에 없는 숫자라 쓰지 않았습니다`)
      if (containers.some((y) => y.label === label)) return bad('가져온 용기 칸이 겹칩니다')
      containers.push({ label: label as FieldFill['containers'][number]['label'], qty: x.qty })
    }
  }
  const supplied: FieldFill['supplied'] = []
  if (o.supplied != null) {
    if (!Array.isArray(o.supplied) || o.supplied.length > 8) return bad('주고 온 자재 형식이 맞지 않습니다')
    for (const c of o.supplied) {
      const x = (c ?? {}) as Record<string, unknown>
      const item = isStr(x.item) ? x.item.trim() : ''
      if (!items.includes(item)) return bad(`주고 온 자재 규격이 목록에 없습니다: ${item.slice(0, 16)}`)
      if (!qtyOk(x.qty)) return bad('주고 온 자재 수가 맞지 않습니다')
      if (!fromMemo(x.qty)) return bad(`주고 온 자재 수(${x.qty})가 메모에 없는 숫자라 쓰지 않았습니다`)
      if (supplied.some((y) => y.item === item)) return bad('주고 온 자재 규격이 겹칩니다')
      supplied.push({ item, qty: x.qty })
    }
  }
  let handover: FieldFill['handover'] = null
  if (o.handover != null && o.handover !== '') {
    if (!(HANDOVERS as readonly string[]).includes(o.handover as string)) return bad(`인계 상태가 범위 밖입니다: ${String(o.handover).slice(0, 12)}`)
    handover = o.handover as FieldFill['handover']
  }
  return { ok: true, value: { amountKg, containers, supplied, handover } }
}

export function parseFieldNote(raw: string, memo: string, items: string[] = []): Ok<FieldNoteOutput> | Bad {
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
  const fill = readFill(o.fill, memo, items)
  if (!fill.ok) return fill
  return { ok: true, value: { summary, issues, followups, cleaned, fill: fill.value } }
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
//  ④ 요청 처리 계획 (0142) — 요청 글 + 시스템 자료 → 원하는 것 · 처리 순서 · 주의 · 구체 회신
//
//   화면이 보내는 것: 요청 글(전화번호 등 가림) · 요청 종류 · 급함 표시 · 오늘 · 방문 날짜 후보와 근거 ·
//     그날 차량별 방문 수(차량 이름만 · 기사 이름 없음) · 시스템 추천 차량 · 사무실 재고 4칸 ·
//     자재 규격 목록(규격 → 재고 칸) · 이 병원 이력(최근 수거일 · 다음 방문 · 90일 방문 · 90일 긴급 · 미수 개월).
//   ⚠ 병원 이름 · 요청자 이름 · 기사 이름은 보내지 않습니다.
//   ⚠ AI 는 자료를 **읽고 계획을 세울 뿐**입니다. 재고가 충분한지 같은 셈은 화면이 다시 합니다(AI 를 믿지 않음).
//   ⚠ 회신에는 차량 이름 · 내부 재고 숫자를 쓰지 않고, 확정 약속도 하지 않습니다(검사로 막음).
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_MAX = 800
const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface PlanInput {
  request: string
  kind: string | null
  urgent: boolean
  today: string
  target: { date: string; why: string }
  vehicles: { label: string; visits: number; regular: boolean; alreadyThere: boolean }[]
  pick: string | null
  stock: { name: string; qty: number }[]
  items: { name: string; stock: string | null }[]
  history: { lastVisit: string | null; nextVisit: string | null; visits90: number; urgent90: number; overdueMonths: number }
}

export interface PlanOutput {
  asks: { what: string; qty: number | null; item: string | null }[]
  when: string
  steps: { title: string; detail: string }[]
  watch: string[]
  reply: string
}

const dayOrNull = (v: unknown): string | null | undefined => (v == null || v === '' ? null : isStr(v) && DAY.test(v) ? v : undefined)

export function readPlan(v: unknown): Ok<PlanInput> | Bad {
  const o = (v ?? {}) as Record<string, unknown>
  const request = isStr(o.request) ? scrub(o.request.trim()).slice(0, PLAN_MAX) : ''
  if (request.length < 4) return bad('요청 글이 너무 짧습니다 (4자 이상)')
  const kind = isStr(o.kind) && (REQUEST_KINDS as readonly string[]).includes(o.kind) ? o.kind : null
  const today = isStr(o.today) && DAY.test(o.today) ? o.today : null
  if (!today) return bad('오늘 날짜가 맞지 않습니다')
  const t = (o.target ?? {}) as Record<string, unknown>
  if (!isStr(t.date) || !DAY.test(t.date) || !isStr(t.why) || t.why.length > 40) return bad('방문 날짜 후보가 맞지 않습니다')
  const vehicles: PlanInput['vehicles'] = []
  if (!Array.isArray(o.vehicles) || o.vehicles.length > 12) return bad('차량 목록 형식이 맞지 않습니다')
  for (const x of o.vehicles) {
    const y = (x ?? {}) as Record<string, unknown>
    const label = isStr(y.label) ? y.label.trim().slice(0, 30) : ''
    const visits = int(y.visits, 500)
    if (!label || visits == null) return bad('차량 목록 형식이 맞지 않습니다')
    vehicles.push({ label, visits, regular: y.regular === true, alreadyThere: y.alreadyThere === true })
  }
  const pick = o.pick == null || o.pick === '' ? null : isStr(o.pick) && vehicles.some((x) => x.label === o.pick) ? o.pick : undefined
  if (pick === undefined) return bad('추천 차량이 차량 목록에 없습니다')
  const stock: PlanInput['stock'] = []
  if (!Array.isArray(o.stock) || o.stock.length > 8) return bad('재고 형식이 맞지 않습니다')
  for (const x of o.stock) {
    const y = (x ?? {}) as Record<string, unknown>
    const name = isStr(y.name) ? y.name.trim().slice(0, 20) : ''
    const qty = int(y.qty, 1_000_000)
    if (!name || qty == null) return bad('재고 형식이 맞지 않습니다')
    stock.push({ name, qty })
  }
  const items: PlanInput['items'] = []
  if (o.items != null) {
    if (!Array.isArray(o.items) || o.items.length > 40) return bad('자재 규격 목록 형식이 맞지 않습니다')
    for (const x of o.items) {
      const y = (x ?? {}) as Record<string, unknown>
      const name = isStr(y.name) ? y.name.trim().slice(0, 30) : ''
      const st = y.stock == null ? null : isStr(y.stock) && stock.some((z) => z.name === y.stock) ? y.stock : undefined
      if (!name || st === undefined) return bad('자재 규격 목록 형식이 맞지 않습니다')
      items.push({ name, stock: st })
    }
  }
  const h = (o.history ?? {}) as Record<string, unknown>
  const lastVisit = dayOrNull(h.lastVisit)
  const nextVisit = dayOrNull(h.nextVisit)
  const visits90 = int(h.visits90, 1000)
  const urgent90 = int(h.urgent90, 1000)
  const overdueMonths = int(h.overdueMonths, 120)
  if (lastVisit === undefined || nextVisit === undefined || visits90 == null || urgent90 == null || overdueMonths == null) return bad('이 병원 이력 형식이 맞지 않습니다')
  return {
    ok: true,
    value: { request, kind, urgent: o.urgent === true, today, target: { date: t.date, why: t.why.trim() }, vehicles, pick, stock, items, history: { lastVisit, nextVisit, visits90, urgent90, overdueMonths } },
  }
}

/** 'YYYY-MM-DD' → 「10월 17일」 (AI 가 같은 날을 말로 쓸 수 있게 · 숫자 근거도 함께) */
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

export const PLAN_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 사무실의 요청 처리 보조다.',
  '병원 요청 하나를 받아, 담당자가 처음부터 끝까지 처리할 수 있게 「처리 계획」을 세운다.',
  '1) asks — 요청 글에서 병원이 원하는 것을 하나씩 뽑는다 (무엇 · 수량 · 자재면 「자재 규격 목록」의 이름 그대로, 아니면 null). 최대 5개.',
  '2) when — 병원이 언제를 원하는지 짧게 (예: 「내일 오전」). 말이 없으면 「날짜 언급 없음」.',
  '3) steps — 아래 「시스템 자료」(방문 날짜 후보 · 그날 차량별 방문 · 추천 차량 · 사무실 재고 · 이 병원 이력)를 근거로 담당자가 할 일을 순서대로 3~5단계로 쓴다.',
  '   각 단계 detail 에는 어떤 자료를 보고 그렇게 하는지 숫자로 밝힌다 (예: 「그날 의료폐기물 1톤 B 방문 2곳 — 가장 여유」 「합성수지 전용용기 재고 360개 — 10개 충분」).',
  '4) watch — 이력에서 눈여겨볼 점(최근 90일 긴급 요청이 잦음 · 다음 방문이 없음 · 미수 개월 등)이 있으면 0~3개. 없으면 빈 배열.',
  '5) reply — 병원에 보낼 회신. 받은 내용을 하나씩 짚고, 언제 · 무엇을 어떻게 진행하려는지 구체적으로 3~5문장 존댓말.',
  '   단 담당자 확정 전이므로 「방문하겠습니다 · 배차했습니다 · 준비해 드리겠습니다」 같은 확정 약속은 하지 않는다 (「~로 일정을 확인하고 있습니다」 「확정되면 다시 안내드리겠습니다」).',
  '   회신에는 차량 이름 · 사무실 재고 숫자 · 내부 사정을 쓰지 않는다. 날짜는 「10월 17일」처럼 쓴다.',
  ...COMMON_RULES,
  '- 병원 이름 · 기사 이름은 받지 않았으므로 쓰지 않는다.',
  '',
  '답 형식:',
  '{',
  '  "asks": [{ "what": "원하는 것 (짧게)", "qty": 숫자 또는 null, "item": "자재 규격 이름" 또는 null }],',
  '  "when": "언제를 원하는지",',
  '  "steps": [{ "title": "할 일 (20자 안팎)", "detail": "근거 숫자와 함께 무엇을 (80자 안팎)" }],',
  '  "watch": ["주의할 점"],',
  '  "reply": "병원에 보낼 회신"',
  '}',
].join('\n')

export function planMessage(p: PlanInput): string {
  const h = p.history
  return [
    `오늘: ${p.today} (${md(p.today)})`,
    `병원이 고른 요청 종류: ${p.kind ?? '없음'} · 「급함」 표시: ${p.urgent ? '있음' : '없음'}`,
    '요청 글:',
    '"""',
    p.request,
    '"""',
    '',
    '[시스템 자료 — 숫자는 여기 있는 것만 쓴다]',
    `방문 날짜 후보: ${p.target.date} (${md(p.target.date)}) — ${p.target.why}`,
    `그날 차량별 방문: ${p.vehicles.length ? p.vehicles.map((v) => `${v.label} ${v.visits}곳${v.regular ? ' (늘 가던 차량)' : ''}${v.alreadyThere ? ' (그날 이미 이 병원 방문 예정)' : ''}`).join(' · ') : '차량 정보 없음'}`,
    `시스템 추천 차량: ${p.pick ?? '없음'}`,
    `사무실 재고: ${p.stock.map((x) => `${x.name} ${x.qty}개`).join(' · ') || '정보 없음'}`,
    `자재 규격 목록 (규격 → 재고 칸): ${p.items.length ? p.items.map((x) => `${x.name}${x.stock ? ` → ${x.stock}` : ''}`).join(' · ') : '없음'}`,
    `이 병원 이력: 최근 수거 ${h.lastVisit ? `${h.lastVisit} (${md(h.lastVisit)})` : '기록 없음'} · 다음 방문 ${h.nextVisit ? `${h.nextVisit} (${md(h.nextVisit)})` : '잡힌 것 없음'} · 최근 90일 방문 ${h.visits90}번 · 최근 90일 긴급 요청 ${h.urgent90}번 · 지난 청구 미수 ${h.overdueMonths}개월`,
  ].join('\n')
}

export function parsePlan(raw: string, message: string, input: PlanInput): Ok<PlanOutput> | Bad {
  const j = parseJson(raw)
  if (!j.ok) return j
  const o = j.value
  if (!Array.isArray(o.asks) || o.asks.length < 1 || o.asks.length > 5) return bad('원하는 것은 1~5개여야 합니다')
  const reqNums = new Set(numbersIn(input.request).map((x) => String(Number(x))))
  const itemNames = input.items.map((x) => x.name)
  const asks: PlanOutput['asks'] = []
  for (const a of o.asks) {
    const x = (a ?? {}) as Record<string, unknown>
    const what = isStr(x.what) ? x.what.trim() : ''
    if (!what || what.length > 40) return bad('원하는 것 형식이 맞지 않습니다')
    let qty: number | null = null
    if (x.qty != null) {
      if (typeof x.qty !== 'number' || !Number.isInteger(x.qty) || x.qty <= 0 || x.qty > 100_000) return bad('원하는 수량 형식이 맞지 않습니다')
      if (!reqNums.has(String(x.qty))) return bad(`원하는 수량(${x.qty})이 요청 글에 없는 숫자라 쓰지 않았습니다`)
      qty = x.qty
    }
    const item = x.item == null || x.item === '' ? null : isStr(x.item) && itemNames.includes(x.item.trim()) ? x.item.trim() : undefined
    if (item === undefined) return bad(`자재 규격이 목록에 없습니다: ${String(x.item).slice(0, 16)}`)
    asks.push({ what, qty, item })
  }
  const when = isStr(o.when) ? o.when.trim() : ''
  if (!when || when.length > 40) return bad('희망 시점이 없거나 너무 깁니다')
  if (!Array.isArray(o.steps) || o.steps.length < 2 || o.steps.length > 6) return bad('처리 순서는 2~6단계여야 합니다')
  const steps: PlanOutput['steps'] = []
  for (const st of o.steps) {
    const x = (st ?? {}) as Record<string, unknown>
    const title = isStr(x.title) ? x.title.trim() : ''
    const detail = isStr(x.detail) ? x.detail.trim() : ''
    if (!title || title.length > 50 || detail.length > 220) return bad('처리 순서 형식이 맞지 않습니다')
    steps.push({ title, detail })
  }
  const watch = strArr(o.watch, 3, 140)
  if (!watch) return bad('주의할 점 형식이 맞지 않습니다')
  const reply = isStr(o.reply) ? o.reply.trim() : ''
  if (!reply || reply.length > 500) return bad('회신이 없거나 너무 깁니다')

  //  숫자 — 전부 받은 글 · 자료에 있는 것만 (차례 숫자 1~6 허용)
  const all = [when, reply, ...asks.map((a) => a.what), ...steps.flatMap((x) => [x.title, x.detail]), ...watch].join('\n')
  const inv = inventedNumbers(all, message, ['1', '2', '3', '4', '5', '6'])
  if (inv.length) return bad(`처리 계획에 받은 자료에 없는 숫자(${inv.join(', ')})가 있어 쓰지 않았습니다`)
  const okUnits = new Set(unitTokens(message))
  const invU = [...new Set(unitTokens(all).filter((x) => !okUnits.has(x)))]
  if (invU.length) return bad(`처리 계획에 받은 자료에 없는 표현(${invU.join(', ')})이 있어 쓰지 않았습니다`)
  //  회신 — 병원에 가는 글: 요청 글 · 날짜 숫자만 · 차량 이름 · 재고 숫자 없음 · 확정 약속 없음
  const replySource = [input.request, input.today, md(input.today), input.target.date, md(input.target.date)].join('\n')
  if (input.vehicles.some((v) => reply.includes(v.label))) return bad('회신에 차량 이름이 들어가 쓰지 않았습니다 (내부 정보)')
  const invR = inventedNumbers(reply, replySource)
  if (invR.length) return bad(`회신에 요청 글 · 날짜에 없는 숫자(${invR.join(', ')})가 있어 쓰지 않았습니다 (내부 숫자는 회신에 쓰지 않음)`)
  if (PROMISE.test(all)) return bad('처리 계획이 확정 약속처럼 쓰여 쓰지 않았습니다')
  return { ok: true, value: { asks, when, steps, watch, reply } }
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
    return { ok: true, value: { system: FIELD_PROMPT, message: fieldMessage(r.value), parse: (raw) => parseFieldNote(raw, r.value.memo, r.value.items) } }
  }
  if (task === 'request_plan') {
    const r = readPlan(input)
    if (!r.ok) return r
    const message = planMessage(r.value)
    return { ok: true, value: { system: PLAN_PROMPT, message, parse: (raw) => parsePlan(raw, message, r.value) } }
  }
  const r = readDunning(input)
  if (!r.ok) return r
  const message = dunningMessageInput(r.value)
  return { ok: true, value: { system: DUNNING_PROMPT, message, parse: (raw) => parseDunning(raw, message) } }
}
