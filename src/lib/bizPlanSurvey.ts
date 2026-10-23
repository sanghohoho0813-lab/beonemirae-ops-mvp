import { QUESTION_BY_ID, stateOf, summaryLines, STATE_LABEL, type Answer, type Question } from './bizSurvey'

// ─────────────────────────────────────────────────────────────────────────────
// 사전 설문 26문항 ↔ 사업계획서 칸 (0147)
//
//  항목에서 「관련 설문 응답 보기」를 누르면 그 질문의 **실제 답지**(서버 bizplan_survey,
//  읽기만)를 보여 줍니다. 설문에 답했다고 본문이 확정되는 것은 아닙니다 — 자동으로 고치지
//  않고, 숫자가 서로 달라 보이면 「다를 수 있음」만 알려 줍니다.
// ─────────────────────────────────────────────────────────────────────────────

export const SURVEY_LINKS: Record<string, string[]> = {
  //  기존 수집운반 사업
  's11.prod.bm_a': ['q16'],
  's11.prod.growth_a': ['q16', 'q17', 'q19', 'q23'],
  's11.market.target': ['q1', 'q16'],
  's4.sellers': ['q16'],
  's4.recent_sales': ['q17'],
  's1.employees': ['q19'],
  's3.staff': ['q19'],
  'a.jobs': ['q19'],
  //  AX SaaS — 사업모델 · 가격 · 고객 목표 (Q3 월 구독료 · Q6 고객 확보 목표)
  's11.prod.bm_b': ['q2', 'q3', 'q4', 'q5', 'q7'],
  's11.prod.growth_b': ['q1', 'q2', 'q6', 'q7'],
  's11.plan.y1': ['q3', 'q6', 'q17'],
  's11.plan.y1_note': ['q3', 'q6', 'q17'],
  's11.plan.y2': ['q3', 'q6'],
  's11.plan.y2_note': ['q3', 'q6'],
  's11.plan.y3': ['q3', 'q6'],
  's11.plan.y3_note': ['q3', 'q6'],
  's11.plan.sum_annual': ['q17'],
  //  병원 포털 · B2B (Q8 시범운영 · Q9 병원 혜택)
  's11.prod.bm_c': ['q12', 'q13', 'q14', 'q15'],
  's11.prod.growth_c': ['q8', 'q9', 'q10', 'q11', 'q15'],
  's11.plan.commercial': ['q8', 'q15', 'q20'],
  //  기술개발 · 개발체계
  's11.prod.dev_a': ['q18', 'q20'],
  's11.prod.dev_b': ['q20', 'q21'],
  's11.prod.dev_c': ['q20', 'q21'],
  's11.tech.rnd': ['q21'],
  's6.devstaff': ['q21'],
  //  자금 (Q22 총 필요자금 · Q23 기존 사업 확장 · Q24 AX 투자)
  's9.working': ['q22', 'q23', 'q24'],
  's9.facility': ['q23'],
  's9.funding': ['q22'],
  'a.funds': ['q22', 'q23', 'q24'],
  'a.funds_plan': ['q22', 'q23', 'q24'],
  'a.funds_source': ['q22'],
  //  경영진
  's11.mgmt.cto': ['q25'],
  's2.mgmt': ['q25'],
}

export const surveyQuestionsFor = (key: string): Question[] =>
  (SURVEY_LINKS[key] ?? []).map((id) => QUESTION_BY_ID[id]).filter(Boolean)

export function answerView(q: Question, a: Answer | undefined) {
  const lines = summaryLines(q, a)
  const st = stateOf(q, a)
  return { lines: lines.length ? lines : ['아직 답하지 않음'], state: STATE_LABEL[st], answered: st !== 'later' }
}

// ── 숫자 비교 — 단위를 맞춰서(만원 · 개사 · 곳 · 명) ─────────────────────────────
type Unit = '만원' | '개사' | '곳' | '명'
interface Fact {
  q: string
  label: string
  unit: Unit
  lo: number
  hi: number
}
const num = (s: string | undefined) => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

/** 설문 답에서 비교할 숫자 — 모르는 질문은 비교하지 않습니다 */
export function factsOf(q: Question, a: Answer | undefined): Fact[] {
  if (!a || a.skip) return []
  const out: Fact[] = []
  const put = (label: string, unit: Unit, lo: number | null, hi: number | null = lo) => {
    if (lo != null && hi != null) out.push({ q: `Q${q.no}`, label, unit, lo, hi })
  }
  const c = a.choice ?? ''
  if (q.id === 'q3') {
    const m = c.match(/(\d+)\s*~\s*(\d+)\s*만원/)
    if (m) put(c, '만원', Number(m[1]), Number(m[2]))
    else if (/(\d+)\s*만원 이상/.test(c)) put(c, '만원', num(c), Infinity)
  }
  if (q.id === 'q6') {
    const f = a.fields ?? {}
    if (f.y1 || f.y2 || f.y3) {
      if (f.y1) put(`1년차 ${f.y1}개사`, '개사', num(f.y1))
      if (f.y2) put(`2년차 ${f.y2}개사`, '개사', num(f.y2))
      if (f.y3) put(`3년차 ${f.y3}개사`, '개사', num(f.y3))
    } else if (c === '적절함') {
      //  「적절함」 = 질문에 적힌 제안안 그대로 — 숫자는 질문 안내 글에서 읽습니다(여기에 따로 적지 않음)
      const line = q.info?.lines?.[0] ?? ''
      for (const m of line.matchAll(/(\d)년차\s*(\d+)개사/g)) put(`제안안 ${m[1]}년차 ${m[2]}개사`, '개사', Number(m[2]))
    }
  }
  if (q.id === 'q17') {
    const f = a.fields ?? {}
    if (f.revenueSoFar) put(`현재까지 매출 ${f.revenueSoFar}만원`, '만원', num(f.revenueSoFar))
    if (f.revenue2026) put(`2026년 예상 연매출 ${f.revenue2026}만원`, '만원', num(f.revenue2026))
    if (f.newClients) put(`신규 계약 예상 ${f.newClients}곳`, '곳', num(f.newClients))
  }
  if (q.id === 'q19' && /^\d명/.test(c)) put(c, '명', num(c), c.includes('이상') ? Infinity : num(c))
  if (q.id === 'q22') {
    if (/억원$/.test(c)) put(c, '만원', (num(c) ?? 0) * 10000)
    else if (c === '기타' && a.fields?.amount) put(`${a.fields.amount}만원`, '만원', num(a.fields.amount))
  }
  if (q.id === 'q24') {
    const n = num(c)
    if (n != null && /억원/.test(c)) put(c, '만원', c.includes('이상') ? n * 10000 : n * 10000 * 0.8, c.includes('이상') ? Infinity : n * 10000 * 1.2)
  }
  return out
}

/** 본문 글에서 단위별 숫자 — 「1.5억」 · 「50,000원」 · 「120 백만원」 · 「3개사」 · 「10곳」 · 「2명」 (예시 숫자) */
export function amountsIn(text: string): Record<Unit, number[]> {
  const t = text.replace(/,/g, '')
  const out: Record<Unit, number[]> = { 만원: [], 개사: [], 곳: [], 명: [] }
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*억\s*(?:(\d+(?:\.\d+)?)\s*만)?/g)) out.만원.push(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) : 0))
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*백만\s*원/g)) out.만원.push(Number(m[1]) * 100)
  for (const m of t.matchAll(/(?<![억\d.])(\d+(?:\.\d+)?)\s*만\s*원/g)) out.만원.push(Number(m[1]))
  for (const m of t.matchAll(/(\d{4,})\s*원/g)) out.만원.push(Number(m[1]) / 10000)
  for (const m of t.matchAll(/(\d+)\s*개사/g)) out.개사.push(Number(m[1]))
  for (const m of t.matchAll(/(\d+)\s*곳/g)) out.곳.push(Number(m[1]))
  for (const m of t.matchAll(/(\d+)\s*명/g)) out.명.push(Number(m[1]))
  return out
}

/**
 *  설문 숫자가 본문에 없어 보이면 알려 줍니다. 본문에 같은 단위의 숫자가 **하나도 없으면**
 *  말하지 않습니다(비교할 것이 없음). 어느 쪽이 맞는지는 사람이 정합니다.
 */
export function mismatchHints(text: string, facts: Fact[]): string[] {
  const have = amountsIn(text)
  const hints: string[] = []
  for (const f of facts) {
    const xs = have[f.unit]
    if (xs.length === 0) continue
    const near = (x: number) => (f.hi === Infinity ? x >= f.lo : x >= f.lo * 0.99 && x <= f.hi * 1.01)
    if (!xs.some(near)) hints.push(`${f.q} 응답 「${f.label}」과 본문 숫자가 다를 수 있습니다`)
  }
  return hints
}
