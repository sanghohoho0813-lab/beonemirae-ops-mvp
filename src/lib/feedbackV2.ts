// ─────────────────────────────────────────────────────────────────────────────
// 사용자 피드백 v2 — 눌러서 끝내는 설문 (0100)
//
//  ── 왜 다시 만들었는가 ──────────────────────────────────────────────────
//
//  v1(0022·0076)은 「개발자에게 요청하기」였습니다. 주제 예닐곱 개 아래에
//  「무엇이 불편합니다」가 서른 줄쯤 늘어선 한 장짜리 화면이었습니다.
//  그것으로 알 수 있는 것은 **무엇이 고장났는가** 하나뿐이었습니다.
//
//  지금 필요한 것은 두 가지입니다.
//   ① 이사님·직원분이 부담 없이 **눌러서** 지금 느낌을 남기는 것
//   ② 나중에 「이 시스템이 실제 업무에 도움이 되었는가」를 물었을 때
//      내놓을 수 있는, 사람이 직접 답한 기록을 쌓아 두는 것
//
//  그래서 「무엇이 불편한가」만 묻지 않고 「무엇이 쉬워졌는가 · 무엇이
//  줄었는가 · 계속 쓸 만한가」를 같은 잣대(1~5)로 묻습니다.
//
//  ── 지키는 것 ───────────────────────────────────────────────────────────
//
//  ⚠ 좋은 답을 하도록 유도하지 않습니다. 심사·평가 이야기는 화면 어디에도
//    쓰지 않습니다. 질문은 중립적으로, 답은 다섯 단계로만 받습니다.
//  ⚠ **「아직 판단하기 어려워요」가 늘 있습니다.** 사흘 써 본 분에게 「업무가
//    줄었나요」를 물으면서 그 답을 막아 두면, 답이 아니라 짐작이 쌓입니다.
//  ⚠ 실제로 얼마나 써 봤는지(usage)를 **함께 저장**합니다. 이것이 없으면
//    나중에 4.4점을 보고도 그 점수를 믿어도 되는지 알 수 없습니다.
//  ⚠ 체감 점수를 시간 절감률·비용 절감률로 **바꾸지 않습니다**. 그것은
//    시스템 기록(입력 시각·건수)과 Before/After 로만 말할 수 있습니다.
//  ⚠ 자유 의견은 끝까지 선택입니다. 한 글자도 안 쓰고 낼 수 있어야 합니다.
//
//  ── 어디에 저장하는가 ───────────────────────────────────────────────────
//
//  기존 요청함 표(dev_requests)를 그대로 씁니다. SQL 을 새로 돌리지 않아도
//  오늘 바로 쓸 수 있어야 하기 때문입니다 — 지금 이사님과 직원분이 쓰고
//  계십니다. topics(text[]) 한 줄에 답 하나씩, 아래 형식으로 넣습니다.
//
//      v2:<질문번호>=<값> › <고른 말> · <질문 그대로>
//      v2:_group=management › 운영·관리 관점
//      v2:_usage=d3_7 › 3~7일
//      v2:_benefit=오늘 현황 확인이 쉬워짐
//
//  질문번호(MG_STATUS_01…)를 함께 넣는 이유는, 나중에 질문 **문구**를 다듬어도
//  같은 항목끼리 비교할 수 있어야 하기 때문입니다. 사람이 읽을 문구도 같은
//  줄에 남겨 둡니다 — 번호만 남기면 몇 달 뒤에 아무도 못 읽습니다.
//
//  v1 로 들어온 예전 답변은 그대로 둡니다. 형식이 다르므로(앞에 v2: 가 없음)
//  섞이지 않고, v2 형식으로 바꿔 쓰지도 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 어떤 관점에서 답하는가 */
export type RespondentGroup = 'management' | 'staff'

/** 직원이 주로 하는 일 */
export type StaffWorkType = 'field' | 'office' | 'both'

/** 실제로 얼마나 써 봤는가 */
export type UsageDuration = 'first' | 'd1_2' | 'd3_7' | 'w1plus' | 'notyet'

/** 답의 값 — 1~5 또는 「아직 판단하기 어려워요」 */
export type AnswerValue = 1 | 2 | 3 | 4 | 5 | 'na'

/**
 * 화면에는 보이지 않는 분류.
 *
 *  나중에 「사용성은 괜찮은데 업무효율 쪽이 낮다」처럼 묶어 보기 위한
 *  것입니다. 답하는 분에게는 절대 보여 주지 않습니다 — 「이건 효율 문항이구나」를
 *  알게 되는 순간 답이 달라집니다.
 */
export type EvidenceCategory =
  | 'USABILITY' | 'ADOPTION' | 'EFFICIENCY' | 'CUSTOMER'
  | 'DATA' | 'DECISION' | 'SCALE' | 'ERROR_REDUCTION'

/**
 * 답변 눈금.
 *
 *  질문에 맞는 말을 씁니다. 「줄었나요」에 「아주 편해요」로 답하게 두면
 *  고르는 사람이 한 번 더 생각해야 합니다. 셋 다 1 이 가장 나쁘고 5 가 가장
 *  좋아서, 나중에 같이 평균 낼 수 있습니다.
 */
export type ScaleKind = 'ease' | 'reduce' | 'agree'

export const SCALES: Record<ScaleKind, { labels: [string, string, string, string, string]; low: string; high: string }> = {
  ease: {
    labels: ['전혀 아니에요', '조금 불편해요', '보통이에요', '편해요', '아주 편해요'],
    low: '불편함', high: '매우 편함',
  },
  reduce: {
    labels: ['더 불편해짐', '거의 차이 없음', '조금 줄어듦', '꽤 줄어듦', '많이 줄어듦'],
    low: '그대로', high: '많이 줄어듦',
  },
  agree: {
    labels: ['전혀 아니에요', '별로 아니에요', '보통이에요', '그런 편이에요', '매우 그래요'],
    low: '아니다', high: '그렇다',
  },
}

/** 다섯 단계 어느 쪽도 아닐 때 — 늘 고를 수 있습니다 */
export const NA_LABEL = '아직 판단하기 어려워요'

export interface FeedbackQuestion {
  /** 문구가 바뀌어도 남는 번호 — 이것으로 비교합니다 */
  id: string
  text: string
  scale: ScaleKind
  category: EvidenceCategory
}

export interface FeedbackStep {
  key: string
  title: string
  questions: FeedbackQuestion[]
}

const q = (id: string, text: string, scale: ScaleKind, category: EvidenceCategory): FeedbackQuestion =>
  ({ id, text, scale, category })

// ── 운영·관리 관점 (대표·이사·관리자) ───────────────────────────────────────
export const MANAGEMENT_STEPS: FeedbackStep[] = [
  {
    key: 'status',
    title: '필요한 상황이 잘 보이나요?',
    questions: [
      q('MG_STATUS_01', '오늘 예정된 수거와 진행상황을 한눈에 확인하기 쉬웠나요?', 'ease', 'DATA'),
      q('MG_STATUS_02', '어느 병원에서 어떤 일이 진행되고 있는지 찾기 쉬웠나요?', 'ease', 'DATA'),
      q('MG_STATUS_03', '최근 현장 입력내용을 따로 물어보지 않고 확인하기 쉬웠나요?', 'ease', 'DATA'),
      q('MG_STATUS_04', '일정이 추가되거나 변경됐을 때 무엇이 달라졌는지 파악하기 쉬웠나요?', 'ease', 'DATA'),
      q('MG_STATUS_05', '지금 먼저 확인해야 할 일이 무엇인지 화면에서 알기 쉬웠나요?', 'ease', 'DECISION'),
    ],
  },
  {
    key: 'efficiency',
    title: '확인하고 정리하는 일이 줄었나요?',
    questions: [
      q('MG_EFF_01', '현장 상황을 확인하기 위해 전화나 카톡으로 다시 묻는 일이 줄었나요?', 'reduce', 'EFFICIENCY'),
      q('MG_EFF_02', '여러 엑셀이나 자료를 다시 열어보는 일이 줄었나요?', 'reduce', 'EFFICIENCY'),
      q('MG_EFF_03', '직원이 입력한 내용을 대표나 이사님이 다시 정리하는 일이 줄었나요?', 'reduce', 'EFFICIENCY'),
      q('MG_EFF_04', '병원별 수거이력이나 요청내용을 찾는 시간이 줄었나요?', 'reduce', 'EFFICIENCY'),
      q('MG_EFF_05', '월말 정산이나 미수 확인을 위해 여러 자료를 다시 맞춰보는 일이 줄어들 것 같나요?', 'reduce', 'EFFICIENCY'),
    ],
  },
  {
    key: 'decision',
    title: '업무를 판단하는 데 도움이 되나요?',
    questions: [
      q('MG_DECISION_01', '어느 거래처를 먼저 확인해야 할지 판단하는 데 도움이 되나요?', 'agree', 'DECISION'),
      q('MG_DECISION_02', '미수금·정산·재고처럼 놓치기 쉬운 내용을 확인하기 쉬워졌나요?', 'ease', 'DECISION'),
      q('MG_DECISION_03', '거래처별 과거 기록을 보고 현재 상황을 판단하기 쉬워졌나요?', 'ease', 'DECISION'),
      q('MG_DECISION_04', '대표나 관리자 입장에서 회사가 지금 어떻게 돌아가고 있는지 이전보다 더 잘 보이나요?', 'agree', 'DATA'),
      q('MG_DECISION_05', '앞으로 데이터가 계속 쌓이면 경영 판단에 도움이 될 것 같나요?', 'agree', 'DATA'),
    ],
  },
  {
    key: 'scale',
    title: '계속 사용할 만한가요?',
    questions: [
      q('MG_SCALE_01', '이 시스템이 없던 방식으로 돌아가기보다 계속 사용하는 편이 낫다고 느끼시나요?', 'agree', 'ADOPTION'),
      q('MG_SCALE_02', '거래처가 더 늘어나도 지금 인원으로 관리하는 데 도움이 될 것 같나요?', 'agree', 'SCALE'),
      q('MG_SCALE_03', '병원에서 직접 수거요청이나 자료확인을 하게 되면 전화·카톡 업무가 줄어들 것 같나요?', 'agree', 'CUSTOMER'),
      q('MG_SCALE_04', '현재 시스템이 단순히 자료를 저장하는 프로그램보다 실제 업무를 연결해 주는 느낌이 있나요?', 'agree', 'DATA'),
      q('MG_SCALE_05', '현재 단계에서 실제 업무에 도움이 된다고 느끼시나요?', 'agree', 'ADOPTION'),
    ],
  },
]

// ── 현장·실무 관점 (현장기사·사무실) ────────────────────────────────────────
const STAFF_USE_STEP: FeedbackStep = {
  key: 'use',
  title: '사용하기 편하셨나요?',
  questions: [
    q('ST_USE_01', '오늘 해야 할 일을 첫 화면에서 찾기 쉬웠나요?', 'ease', 'USABILITY'),
    q('ST_USE_02', '글씨 크기와 버튼 크기는 사용하기 편했나요?', 'ease', 'USABILITY'),
    q('ST_USE_03', '원하는 병원이나 거래처를 찾기 쉬웠나요?', 'ease', 'USABILITY'),
    q('ST_USE_04', '메뉴 이름을 보고 어디를 눌러야 할지 알기 쉬웠나요?', 'ease', 'USABILITY'),
    q('ST_USE_05', '휴대폰에서 화면이 잘 보이고 누르기 편했나요?', 'ease', 'USABILITY'),
  ],
}

const STAFF_FIELD_STEP: FeedbackStep = {
  key: 'work-field',
  title: '실제 업무가 편해졌나요?',
  questions: [
    q('ST_WORK_F01', '오늘 방문할 병원과 일정을 확인하기 쉬웠나요?', 'ease', 'EFFICIENCY'),
    q('ST_WORK_F02', '수거내용을 입력하는 과정이 어렵지 않았나요?', 'ease', 'USABILITY'),
    q('ST_WORK_F03', '병원별 주소·주의사항·기록을 필요할 때 확인하기 쉬웠나요?', 'ease', 'DATA'),
    q('ST_WORK_F04', '자재나 필요한 내용을 현장에서 기록하기 쉬웠나요?', 'ease', 'EFFICIENCY'),
    q('ST_WORK_F05', '업무가 끝난 뒤 다시 카톡이나 전화로 설명해야 하는 일이 줄어들 것 같나요?', 'agree', 'EFFICIENCY'),
  ],
}

const STAFF_OFFICE_STEP: FeedbackStep = {
  key: 'work-office',
  title: '실제 업무가 편해졌나요?',
  questions: [
    q('ST_WORK_O01', '거래처별 일정과 진행상황을 찾기 쉬웠나요?', 'ease', 'EFFICIENCY'),
    q('ST_WORK_O02', '현장에서 입력한 내용을 확인하기 쉬웠나요?', 'ease', 'DATA'),
    q('ST_WORK_O03', '자재·재고 정보를 확인하기 쉬웠나요?', 'ease', 'DATA'),
    q('ST_WORK_O04', '병원 요청이나 변경내용을 확인하기 쉬웠나요?', 'ease', 'CUSTOMER'),
    q('ST_WORK_O05', '여러 자료를 다시 정리하는 일이 줄어들 것 같나요?', 'agree', 'EFFICIENCY'),
  ],
}

const STAFF_ADOPT_STEP: FeedbackStep = {
  key: 'adopt',
  title: '계속 쓸 만한가요?',
  questions: [
    q('ST_ADOPT_01', '예전 방식보다 이 시스템을 이용하는 편이 업무하기 편하다고 느끼시나요?', 'agree', 'ADOPTION'),
    q('ST_ADOPT_02', '한 번 입력한 내용을 다시 적는 일이 줄어드는 느낌이 있나요?', 'agree', 'EFFICIENCY'),
    q('ST_ADOPT_03', '업무 중 실수하거나 놓치는 일을 줄이는 데 도움이 될 것 같나요?', 'agree', 'ERROR_REDUCTION'),
    q('ST_ADOPT_04', '조금 더 익숙해지면 계속 사용하는 데 큰 어려움이 없을 것 같나요?', 'agree', 'ADOPTION'),
    q('ST_ADOPT_05', '현재 단계에서 실제 업무에 도움이 된다고 느끼시나요?', 'agree', 'ADOPTION'),
  ],
}

/**
 * 이 사람이 답할 질문 묶음.
 *
 *  ⚠ 「둘 다」를 고르신 분께는 **현장 문항**을 보여 드립니다. 두 벌을 다
 *    물으면 스무 문항이 되어 「짧게 끝난다」는 이번 목표와 어긋납니다.
 *    저장에는 「둘 다」가 그대로 남으므로, 나중에 사무실 문항만 따로
 *    여쭐 수 있습니다.
 */
export function stepsFor(group: RespondentGroup, work: StaffWorkType | null): FeedbackStep[] {
  if (group === 'management') return MANAGEMENT_STEPS
  return [STAFF_USE_STEP, work === 'office' ? STAFF_OFFICE_STEP : STAFF_FIELD_STEP, STAFF_ADOPT_STEP]
}

// ── 고르는 목록 (여러 개 가능) ──────────────────────────────────────────────

export interface PickOption {
  label: string
  /** 「없음」류 — 이것을 고르면 나머지가 풀립니다. 같이 고르면 뜻이 어긋납니다 */
  exclusive?: boolean
}

export const MANAGEMENT_BENEFITS: PickOption[] = [
  { label: '오늘 현황 확인이 쉬워짐' },
  { label: '전화·카톡 확인 감소' },
  { label: '엑셀 다시 찾는 일 감소' },
  { label: '거래처 기록 찾기 쉬움' },
  { label: '일정관리 편해짐' },
  { label: '수거기록 관리 편해짐' },
  { label: '정산·미수 확인 편해짐' },
  { label: '현장 직원 업무 파악 쉬움' },
  { label: '병원 요청 관리 쉬움' },
  { label: '아직 크게 체감되는 변화 없음', exclusive: true },
  { label: '아직 사용기간이 짧음', exclusive: true },
]

export const MANAGEMENT_PAINS: PickOption[] = [
  { label: '첫 화면이 복잡함' },
  { label: '메뉴 찾기가 어려움' },
  { label: '글씨가 작음' },
  { label: '필요한 숫자가 잘 안 보임' },
  { label: '거래처 찾기가 어려움' },
  { label: '일정 화면이 불편함' },
  { label: '수거기록 확인이 불편함' },
  { label: '정산·미수 화면이 불편함' },
  { label: '병원 요청 확인이 불편함' },
  { label: '모바일 사용이 불편함' },
  { label: '속도가 느림' },
  { label: '원하는 기능이 아직 없음' },
  { label: '특별히 불편한 점 없음', exclusive: true },
]

export const STAFF_PAINS: PickOption[] = [
  { label: '오늘 일정 찾기' },
  { label: '미래 일정 찾기' },
  { label: '병원·거래처 찾기' },
  { label: '수거 입력' },
  { label: '자재 입력' },
  { label: '글씨 크기' },
  { label: '버튼 크기' },
  { label: '화면 이동' },
  { label: '저장 과정' },
  { label: '속도' },
  { label: '로그인' },
  { label: '무엇을 눌러야 할지 헷갈림' },
  { label: '특별히 불편한 점 없음', exclusive: true },
  { label: '아직 충분히 사용하지 못함', exclusive: true },
]

// ── 화면에 쓰는 말 ──────────────────────────────────────────────────────────

export const GROUP_LABEL: Record<RespondentGroup, string> = {
  management: '운영·관리 관점',
  staff: '현장·실무 관점',
}

export const GROUP_DESC: Record<RespondentGroup, string> = {
  management: '대표 · 이사 · 관리자 등 전체 업무와 운영현황을 확인하는 분',
  staff: '현장기사 · 사무실 직원 등 실제 업무를 처리하는 분',
}

export const WORK_LABEL: Record<StaffWorkType, string> = {
  field: '현장 수거',
  office: '사무실 업무',
  both: '둘 다',
}

export const USAGE_OPTIONS: { value: UsageDuration; label: string }[] = [
  { value: 'first', label: '오늘 처음' },
  { value: 'd1_2', label: '1~2일' },
  { value: 'd3_7', label: '3~7일' },
  { value: 'w1plus', label: '1주 이상' },
  { value: 'notyet', label: '아직 충분히 못 써봤어요' },
]

export const USAGE_LABEL: Record<UsageDuration, string> =
  Object.fromEntries(USAGE_OPTIONS.map((o) => [o.value, o.label])) as Record<UsageDuration, string>

/** 고른 값이 화면에서 무엇으로 보이는가 */
export function answerLabel(scale: ScaleKind, v: AnswerValue): string {
  return v === 'na' ? NA_LABEL : SCALES[scale].labels[v - 1]
}

// ── 저장 형식 ───────────────────────────────────────────────────────────────

const P = 'v2:'

export interface FeedbackResponse {
  group: RespondentGroup
  workType: StaffWorkType | null
  usage: UsageDuration
  answers: Record<string, AnswerValue>
  benefits: string[]
  pains: string[]
}

const line = (key: string, value: string, human = ''): string =>
  `${P}${key}=${value}${human ? ` › ${human}` : ''}`

/**
 * 답변을 topics(text[]) 줄로 바꿉니다.
 *
 *  사람이 읽을 말을 같은 줄에 붙여 둡니다. 몇 달 뒤에 이 줄만 보고도
 *  무엇을 물었고 무엇을 골랐는지 알 수 있어야 합니다.
 */
export function encodeResponse(r: FeedbackResponse): string[] {
  const all = [...MANAGEMENT_STEPS, STAFF_USE_STEP, STAFF_FIELD_STEP, STAFF_OFFICE_STEP, STAFF_ADOPT_STEP]
    .flatMap((s) => s.questions)
  const byId = new Map(all.map((x) => [x.id, x]))

  const out: string[] = [
    line('_group', r.group, GROUP_LABEL[r.group]),
    line('_usage', r.usage, USAGE_LABEL[r.usage]),
  ]
  if (r.workType) out.push(line('_work', r.workType, WORK_LABEL[r.workType]))

  for (const [id, v] of Object.entries(r.answers)) {
    const qq = byId.get(id)
    if (!qq) continue
    out.push(line(id, String(v), `${answerLabel(qq.scale, v)} · ${qq.text}`))
  }
  for (const b of r.benefits) out.push(line('_benefit', b))
  for (const p of r.pains) out.push(line('_pain', p))
  return out
}

export interface ParsedFeedback {
  group: RespondentGroup | null
  workType: StaffWorkType | null
  usage: UsageDuration | null
  answers: Record<string, AnswerValue>
  benefits: string[]
  pains: string[]
}

/** v2 로 저장된 답변인가 (예전 v1 요청과 섞이지 않게) */
export function isFeedbackV2(topics: string[]): boolean {
  return topics.some((t) => t.startsWith(P))
}

/** topics 줄을 다시 답변으로 — 못 읽는 줄은 조용히 건너뜁니다 */
export function parseResponse(topics: string[]): ParsedFeedback {
  const r: ParsedFeedback = { group: null, workType: null, usage: null, answers: {}, benefits: [], pains: [] }
  for (const t of topics) {
    if (!t.startsWith(P)) continue
    const rest = t.slice(P.length)
    const eq = rest.indexOf('=')
    if (eq < 1) continue
    const key = rest.slice(0, eq)
    const after = rest.slice(eq + 1)
    //  「고른 목록」은 값 자체가 사람 말이라 › 로 자르지 않습니다
    if (key === '_benefit') { r.benefits.push(after); continue }
    if (key === '_pain') { r.pains.push(after); continue }
    const value = after.split(' › ')[0]
    if (key === '_group') { if (value === 'management' || value === 'staff') r.group = value; continue }
    if (key === '_work') { if (value === 'field' || value === 'office' || value === 'both') r.workType = value; continue }
    if (key === '_usage') { if (USAGE_OPTIONS.some((o) => o.value === value)) r.usage = value as UsageDuration; continue }
    if (value === 'na') { r.answers[key] = 'na'; continue }
    const n = Number(value)
    if (n >= 1 && n <= 5 && Number.isInteger(n)) r.answers[key] = n as AnswerValue
  }
  return r
}

// ── 모아 보기 (관리자 화면) ─────────────────────────────────────────────────

/** 화면에서 묶어 보여 줄 이름 — 안쪽 분류를 사람 말로 */
export const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  USABILITY: '사용성',
  EFFICIENCY: '업무 효율',
  DATA: '운영 가시성',
  DECISION: '판단 도움',
  ADOPTION: '지속 사용',
  SCALE: '확장 가능성',
  CUSTOMER: '고객 응대',
  ERROR_REDUCTION: '실수 감소',
}

export const CATEGORY_ORDER: EvidenceCategory[] =
  ['USABILITY', 'EFFICIENCY', 'DATA', 'DECISION', 'ADOPTION', 'SCALE', 'CUSTOMER', 'ERROR_REDUCTION']

export interface CategoryScore {
  key: EvidenceCategory
  label: string
  /** 1~5 평균. 답이 하나도 없으면 null — 0 으로 두면 「최악」으로 읽힙니다 */
  avg: number | null
  answered: number
  /** 「아직 판단하기 어려워요」 수 */
  unsure: number
}

export interface FeedbackSummary {
  /** 답한 사람 수 */
  people: number
  categories: CategoryScore[]
  /** 전체 문항 중 「아직 판단하기 어려워요」 비율 (0~1). 답이 없으면 null */
  unsureRatio: number | null
  benefits: [string, number][]
  pains: [string, number][]
  /** 얼마나 써 보고 답했는가 */
  usage: [UsageDuration, number][]
}

const ALL_QUESTIONS: FeedbackQuestion[] =
  [...MANAGEMENT_STEPS, STAFF_USE_STEP, STAFF_FIELD_STEP, STAFF_OFFICE_STEP, STAFF_ADOPT_STEP]
    .flatMap((s) => s.questions)

const CATEGORY_OF = new Map(ALL_QUESTIONS.map((x) => [x.id, x.category]))

/**
 * 여러 사람의 답을 묶습니다.
 *
 *  ⚠ 사람 수를 늘 함께 내보냅니다. 한 사람이 답한 4.5 점과 열 사람이 답한
 *    4.5 점은 다른 것인데, 퍼센트만 보이면 같아 보입니다.
 *  ⚠ 「아직 판단하기 어려워요」는 점수에 넣지 않고 따로 셉니다. 3 점으로
 *    치면 「보통이다」가 되는데, 그분은 보통이라고 말한 적이 없습니다.
 */
export function summarize(list: ParsedFeedback[]): FeedbackSummary {
  const sum = new Map<EvidenceCategory, { total: number; n: number; unsure: number }>()
  const bump = (c: EvidenceCategory) => {
    const cur = sum.get(c) ?? { total: 0, n: 0, unsure: 0 }
    sum.set(c, cur)
    return cur
  }
  let answered = 0
  let unsure = 0
  const benefits = new Map<string, number>()
  const pains = new Map<string, number>()
  const usage = new Map<UsageDuration, number>()

  for (const r of list) {
    for (const [id, v] of Object.entries(r.answers)) {
      const c = CATEGORY_OF.get(id)
      if (!c) continue
      const cur = bump(c)
      if (v === 'na') { cur.unsure += 1; unsure += 1; continue }
      cur.total += v
      cur.n += 1
      answered += 1
    }
    for (const b of r.benefits) benefits.set(b, (benefits.get(b) ?? 0) + 1)
    for (const p of r.pains) pains.set(p, (pains.get(p) ?? 0) + 1)
    if (r.usage) usage.set(r.usage, (usage.get(r.usage) ?? 0) + 1)
  }

  const categories = CATEGORY_ORDER
    .filter((c) => sum.has(c))
    .map((c) => {
      const v = sum.get(c)!
      return {
        key: c, label: CATEGORY_LABEL[c],
        avg: v.n > 0 ? Math.round((v.total / v.n) * 10) / 10 : null,
        answered: v.n, unsure: v.unsure,
      }
    })

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) as [string, number][]

  return {
    people: list.length,
    categories,
    unsureRatio: answered + unsure > 0 ? unsure / (answered + unsure) : null,
    benefits: top(benefits),
    pains: top(pains),
    usage: [...usage.entries()].sort((a, b) => b[1] - a[1]) as [UsageDuration, number][],
  }
}
