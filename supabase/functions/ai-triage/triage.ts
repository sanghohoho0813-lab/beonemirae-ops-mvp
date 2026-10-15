// ═══════════════════════════════════════════════════════════════════════════
//  ai-triage — 순수 로직 (프롬프트 · 개인정보 가림 · 엄격한 결과 검사)
//
//  ⚠ 이 파일은 Deno 전용 기능을 쓰지 않습니다 — 같은 파일을 Node 검사
//    (test/ai/check_ai_triage_core.mjs)가 그대로 불러 시험합니다.
//
//  ── 역할 나눔 (비원미래 AX 의 AI 기준) ────────────────────────────────────
//   Rule / DB = 사실과 계산 (일정 · 배차 · 재고 · 정산 — 여기서 손대지 않음)
//   LLM       = 비정형 문장의 이해 · 요약 · 분류 · 문장 작성 (이 함수)
//
//  ── AI 가 하는 것 ────────────────────────────────────────────────────────
//   병원 요청 글 하나 → 요청 종류 · 긴급도 · 요약 · 핵심 요구사항 · 회신 초안 · 근거
//
//  ── AI 가 절대 하지 않는 것 ──────────────────────────────────────────────
//   일정 확정 · 배차 · 상태 변경 · 회신 전송 · 수거량 · 재고 · 정산 변경 · DB 수정.
//   이 함수에는 그런 쓰기 코드가 **없습니다.** 쓰는 곳은 ai_calls(호출 기록) 하나뿐입니다.
// ═══════════════════════════════════════════════════════════════════════════

/** 시스템 요청 종류 — client_requests.kind CHECK 값 그대로 (src/types RequestKind) */
export const REQUEST_KINDS = ['긴급수거', '추가수거', '소모품', '교육·자료', '기타'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]

/** 화면이 그대로 표시하는 긴급도 세 단계 */
export const URGENCIES = ['높음', '보통', '낮음'] as const
export type Urgency = (typeof URGENCIES)[number]

/** 모델에 보내는 요청 글 최대 길이 (그 뒤는 자릅니다) */
export const MAX_CONTENT = 2000

/** 병원 화면에서 쓰는 이름 — 모델이 「소모품」을 「자재·용기 요청」으로 이해하게 */
const KIND_HINT: Record<RequestKind, string> = {
  긴급수거: '긴급수거 (예상보다 빨리 찼을 때 · 빨리 와 달라는 수거)',
  추가수거: '추가수거 (정기 일정 외 한 번 더 수거)',
  소모품: '소모품 (자재·용기 요청 — 박스 · 봉투 · 바늘통 등)',
  '교육·자료': '교육·자료 (교육 · 증빙 · 서류 요청)',
  기타: '기타 (위에 해당하지 않는 문의 · 요청)',
}

export const SYSTEM_PROMPT = [
  '너는 의료폐기물 수거·운반 회사 「비원미래」 담당자의 업무 보조다.',
  '병원이 보낸 요청 글 하나를 읽고, 담당자가 빨리 이해하고 회신할 수 있도록 정리한다.',
  '너는 결정하지 않는다. 최종 판단 · 일정 확정 · 회신은 담당자가 한다.',
  '',
  '반드시 지킬 것:',
  '1. 요청 글에 없는 사실을 만들어내지 않는다.',
  '2. 수거 가능 여부를 확정하지 않는다. 「확인 후 안내」로 쓴다.',
  '3. 날짜 · 시간을 회사가 확정한 것처럼 쓰지 않는다. 병원이 원한 시점은 「원하신 시점」으로만 다시 말한다.',
  '4. 차량 배정 · 기사 · 도착 시각을 말하지 않는다.',
  '5. 자재 · 용기 재고가 있다고 가정하지 않는다. 「준비 가능 여부를 확인」으로 쓴다.',
  '6. 비용 · 단가 · 계약 조건을 말하지 않는다.',
  '7. 요청 글에 없는 숫자를 회신 초안에 쓰지 않는다.',
  '8. 애매하면 「확인 필요」라고 쓴다.',
  '9. 사람 이름 · 연락처 · 환자 정보는 요약과 초안에 다시 적지 않는다.',
  '',
  '좋은 초안 예: 「요청 확인했습니다. 내일 오전 방문 가능 여부를 확인한 뒤 안내드리겠습니다.」',
  '나쁜 초안 예: 「내일 오전 10시에 방문하겠습니다.」 (확정 약속 · 요청에 없는 시각)',
  '',
  '요청 종류는 아래 다섯 가지 값 중에서만 고른다:',
  ...REQUEST_KINDS.map((k) => `- "${k}": ${KIND_HINT[k]}`),
  '한 글에 두 가지가 섞이면 가장 중요한 것을 kind 에, 나머지를 also_kinds 에 넣는다.',
  '',
  '긴급도는 "높음" · "보통" · "낮음" 중 하나:',
  '- 높음: 보관 공간이 찼거나 곧 차서 빠른 수거가 필요하다고 쓴 경우, 오늘·내일처럼 급한 시점을 요청한 경우',
  '- 보통: 이번 주 안 등 일반적인 일정 요청',
  '- 낮음: 급하지 않은 문의 · 다음 방문 때 함께 처리해도 되는 요청',
  '- 판단이 애매하면 "보통"으로 하고 basis 에 「확인 필요」를 적는다.',
  '',
  '답은 아래 JSON 객체 하나로만 한다 (설명 문장 · 코드 블록 없이):',
  '{',
  '  "kind": "다섯 가지 중 하나",',
  '  "also_kinds": ["함께 들어 있는 다른 종류 (없으면 빈 배열)"],',
  '  "urgency": "높음 | 보통 | 낮음",',
  '  "summary": "요청 내용 요약 1~2문장",',
  '  "points": ["핵심 요구사항 짧게 (최대 4개)"],',
  '  "draft": "담당자가 고쳐 쓸 회신 초안 2~3문장, 존댓말, 확정 약속 없이",',
  '  "basis": "종류와 긴급도를 그렇게 본 근거 한 문장"',
  '}',
].join('\n')

export interface TriageRequest {
  content: string
  /** 병원이 고른 종류 (DB 값). 없으면 null */
  kind: string | null
  /** 병원이 「급함」 표시를 했는가 */
  urgent: boolean
  /** 병원이 적은 희망일 (YYYY-MM-DD). 없으면 null */
  desiredDate: string | null
}

export interface TriageOutput {
  kind: RequestKind
  alsoKinds: RequestKind[]
  urgency: Urgency
  summary: string
  points: string[]
  draft: string
  basis: string
}

/**
 * 모델에 보내기 전에 가립니다 — 전화번호 · 주민등록번호 · 메일.
 *  ⚠ 요청 분류에 필요 없는 정보입니다. 병원명 · 요청자 이름은 애초에 보내지 않습니다.
 */
export function scrub(text: string): string {
  return text
    .replace(/\b\d{6}\s*-\s*[1-4]\d{6}\b/g, '[주민번호 가림]')
    .replace(/(?:\+?82[-\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[전화번호 가림]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[메일 가림]')
}

/** 모델에 보내는 사용자 메시지 — 이것이 AI 가 읽는 **전부**입니다 (ai_calls.input 에 그대로 남김) */
export function buildUserMessage(r: TriageRequest): string {
  const kind = r.kind && (REQUEST_KINDS as readonly string[]).includes(r.kind) ? r.kind : null
  const body = scrub(r.content.trim()).slice(0, MAX_CONTENT)
  return [
    `병원이 고른 요청 종류: ${kind ?? '없음'}`,
    `병원의 「급함」 표시: ${r.urgent ? '있음' : '없음'}`,
    `병원이 적은 희망일: ${r.desiredDate ?? '없음'}`,
    '요청 글:',
    '"""',
    body,
    '"""',
  ].join('\n')
}

/** 회사 확정 약속처럼 읽히는 표현 — 초안에 있으면 쓰지 않습니다 */
export const PROMISE = /(확정|배차|배정|예약|접수\s*완료)\s*(되었|됐|했|하였)습니다|(방문|수거|도착|출발)(하겠습니다|해\s*드리겠습니다|드리겠습니다)|(가져다|갖다|보내|준비해)\s*드리겠습니다/

export const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((x) => x.replace(/,/g, ''))

/**
 * 숫자 + 단위 (「10시」 · 「10개」 · 「63L」).
 *  ⚠ 숫자만 보면 요청의 「10개」가 초안의 「10시」를 통과시킵니다 — 단위까지 같아야
 *    「요청에 있던 말」입니다.
 */
const UNIT = /(\d+(?:[.,]\d+)*)\s*(시|분|월|일|만\s*원|원|개|kg|킬로|톤|L|ℓ|리터|박스|봉투|회|번|차례|대|명|곳|%)/g
export const unitTokens = (s: string): string[] =>
  [...s.matchAll(UNIT)].map((m) => `${Number(m[1].replace(/,/g, ''))}${m[2].replace(/\s+/g, '')}`)

export const isStr = (v: unknown): v is string => typeof v === 'string'

export type ParseResult =
  | { ok: true; result: TriageOutput }
  | { ok: false; error: string; parsed?: unknown }

/**
 * 모델이 돌려준 글을 엄격하게 검사합니다.
 *
 *  ⚠ 필드가 빠지거나 값이 범위 밖이면 **실패**입니다. 「기타」·「보통」으로
 *    조용히 바꿔 성공처럼 보이게 하지 않습니다.
 *  ⚠ 초안에 요청 글에 없는 숫자가 있거나 확정 약속처럼 쓰였으면 실패입니다.
 *    고정 문구로 갈아끼우지 않습니다 — 담당자가 다시 시도하거나 직접 씁니다.
 *
 * @param source 모델에 보낸 요청 정보 — 「요청 글에 있던 숫자」를 가리는 기준
 */
export function parseTriage(raw: string, source: TriageRequest): ParseResult {
  let v: unknown
  try {
    v = JSON.parse(raw.trim())
  } catch {
    return { ok: false, error: 'AI 응답이 JSON 이 아닙니다' }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'AI 응답이 JSON 객체가 아닙니다' }
  const o = v as Record<string, unknown>
  const missing = ['kind', 'urgency', 'summary', 'draft', 'basis'].filter((k) => !isStr(o[k]) || !(o[k] as string).trim())
  if (missing.length) return { ok: false, error: `AI 응답에 빠진 항목: ${missing.join(', ')}`, parsed: v }

  const kind = (o.kind as string).trim()
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `요청 종류 값이 범위 밖입니다: ${kind.slice(0, 20)}`, parsed: v }
  const urgency = (o.urgency as string).trim()
  if (!(URGENCIES as readonly string[]).includes(urgency)) return { ok: false, error: `긴급도 값이 범위 밖입니다: ${urgency.slice(0, 20)}`, parsed: v }

  const alsoRaw = o.also_kinds ?? o.alsoKinds ?? []
  if (!Array.isArray(alsoRaw) || !alsoRaw.every(isStr)) return { ok: false, error: 'also_kinds 형식이 맞지 않습니다', parsed: v }
  const also = [...new Set(alsoRaw.map((x) => x.trim()))].filter((x) => x && x !== kind)
  const badAlso = also.filter((x) => !(REQUEST_KINDS as readonly string[]).includes(x))
  if (badAlso.length) return { ok: false, error: `함께 든 요청 종류 값이 범위 밖입니다: ${badAlso.join(', ').slice(0, 30)}`, parsed: v }

  const pointsRaw = o.points ?? []
  if (!Array.isArray(pointsRaw) || !pointsRaw.every(isStr)) return { ok: false, error: 'points 형식이 맞지 않습니다', parsed: v }
  const points = pointsRaw.map((x) => x.trim()).filter(Boolean)
  if (points.length > 4 || points.some((x) => x.length > 120)) return { ok: false, error: '핵심 요구사항이 너무 많거나 깁니다', parsed: v }

  const summary = (o.summary as string).trim()
  const draft = (o.draft as string).trim()
  const basis = (o.basis as string).trim()
  if (summary.length > 300) return { ok: false, error: '요약이 너무 깁니다 (300자 초과)', parsed: v }
  if (draft.length > 600) return { ok: false, error: '회신 초안이 너무 깁니다 (600자 초과)', parsed: v }
  if (basis.length > 300) return { ok: false, error: '근거가 너무 깁니다 (300자 초과)', parsed: v }

  //  ── 지어낸 숫자 · 확정 약속 막기 (프롬프트만 믿지 않습니다) ─────────────
  const allowed = new Set([...numbersIn(source.content), ...numbersIn(source.desiredDate ?? '')])
  //  날짜 2026-10-15 → 10 · 15 도 「있던 숫자」로 봅니다 (「10월 15일」로 다시 말하는 것은 괜찮음)
  for (const n of numbersIn(source.desiredDate ?? '')) for (const p of n.split('-')) allowed.add(String(Number(p)))
  const invented = numbersIn(draft).filter((x) => !allowed.has(x) && !allowed.has(String(Number(x))))
  if (invented.length) return { ok: false, error: `회신 초안에 요청 글에 없는 숫자(${[...new Set(invented)].join(', ')})가 있어 쓰지 않았습니다`, parsed: v }
  const allowedUnits = new Set(unitTokens(source.content))
  const dd = (source.desiredDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dd) { allowedUnits.add(`${Number(dd[2])}월`); allowedUnits.add(`${Number(dd[3])}일`) }
  const inventedUnits = unitTokens(draft).filter((x) => !allowedUnits.has(x))
  if (inventedUnits.length) return { ok: false, error: `회신 초안에 요청 글에 없는 표현(${[...new Set(inventedUnits)].join(', ')})이 있어 쓰지 않았습니다`, parsed: v }
  if (PROMISE.test(draft)) return { ok: false, error: '회신 초안이 회사의 확정 약속처럼 쓰여 쓰지 않았습니다', parsed: v }

  return {
    ok: true,
    result: { kind: kind as RequestKind, alsoKinds: also as RequestKind[], urgency: urgency as Urgency, summary, points, draft, basis },
  }
}
