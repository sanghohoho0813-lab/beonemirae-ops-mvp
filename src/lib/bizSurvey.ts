// ─────────────────────────────────────────────────────────────────────────────
// 사업계획서 사전 설문 (0144 · 임시) — 신용보증기금 뉴본펭귄 사업계획서 준비용
//
//  대표님(송명근) · 이사님(홍현주) 중 **한 분**이 앱 안에서 「시작하기」로 바로 답하는
//  일회성 설문입니다(0145 — 링크 없이 · 답지 하나). 정식 설문 플랫폼이 아니라
//  **사업계획서 초안을 쓰기 위한 의견 수렴 도구**입니다.
//
//   · 질문 · 선택지 · 안내문은 전부 이 파일 한 곳에 있습니다.
//   · 추천안 · 제안안은 「검토안」일 뿐 확정이 아닙니다. 아무 것도 미리 골라 두지
//     않습니다 — 고르지 않은 것은 「추후 확인」으로 남습니다.
//   · 치울 때: 아래 BIZ_SURVEY_ENABLED 를 false 로 두면 관리자 탭과 응답 화면이
//     함께 사라집니다. 서버 표는 supabase/proposals/PROPOSAL_0144_biz_survey.sql.
// ─────────────────────────────────────────────────────────────────────────────

/** 설문 기능 전체 켜기/끄기 (임시 기능 — 끝나면 false) */
export const BIZ_SURVEY_ENABLED = true

export const SURVEY_TITLE = '비원미래 AX 사업화 계획 사전 설문'
/** 메뉴 · 탭에 쓰는 이름 (대표님: 「뉴본펭귄 사전 설문으로 이름 바꿔 주고」) */
export const SURVEY_MENU_NAME = '뉴본펭귄 사전 설문'
/** 앱 안에서 답하는 주소 */
export const SURVEY_PATH = '/newborn-survey'

export const SURVEY_INTRO = [
  '대표님, 이사님 안녕하세요.',
  '신용보증기금 뉴본펭귄 사업계획서를 준비하기 위해 몇 가지 의견을 여쭙고자 합니다.',
  '개발계획과 매출 전망 등은 저희가 먼저 설계할 예정이므로 부담 없이 실제 업계 상황과 평소 생각하셨던 방향을 중심으로 선택해 주시면 됩니다.',
  "정확히 모르시는 내용은 '미정'으로 선택하셔도 괜찮습니다.",
  '두 분 중 한 분만 답해 주셔도 됩니다. 이어서 쓰시면 같은 답지에 이어집니다.',
  '응답해 주신 내용을 바탕으로 사업계획서 초안을 작성하고 최종적으로 함께 검토하겠습니다.',
]

export const SURVEY_THANKS = [
  '응답해 주셔서 감사합니다.',
  '작성해 주신 내용을 바탕으로 비원미래 AX 사업화 및 신용보증기금 뉴본펭귄 사업계획서 초안을 구체화하겠습니다.',
  '미정으로 선택하신 항목은 추후 함께 검토하겠습니다.',
]

// ── 응답자 ──────────────────────────────────────────────────────────────────

export type Respondent = 'ceo' | 'director'
/** 'shared' — 두 분 중 한 분이 답하는 공동 답지 (0145 · 지금 쓰는 방식) */
export type SurveyWho = Respondent | 'shared'
export const RESPONDENTS: Record<SurveyWho, { name: string; title: string; label: string }> = {
  ceo: { name: '송명근', title: '대표님', label: '송명근 대표님' },
  director: { name: '홍현주', title: '이사님', label: '홍현주 이사님' },
  shared: { name: '', title: '대표님 · 이사님', label: '대표님 · 이사님 (한 분만 답하시면 됩니다)' },
}

// ── 질문 모양 ───────────────────────────────────────────────────────────────

export interface Opt {
  v: string
  /** 「잘 모르겠음 · 미정 · 확인 필요 · 협의 필요 …」 — 미확정으로 모읍니다 */
  unsure?: boolean
}

export interface Field {
  key: string
  label: string
  kind: 'text' | 'number' | 'select' | 'long'
  unit?: string
  placeholder?: string
  options?: string[]
}

export type SectionId = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7'
export const SECTIONS: { id: SectionId; no: string; title: string }[] = [
  { id: 's1', no: '01', title: 'AX 프로그램 외부 판매' },
  { id: 's2', no: '02', title: '병원 고객 포털' },
  { id: 's3', no: '03', title: '의료기관 B2B 플랫폼' },
  { id: 's4', no: '04', title: '기존 사업현황' },
  { id: 's5', no: '05', title: '향후 기술개발 방향' },
  { id: 's6', no: '06', title: '보증자금 및 사업비' },
  { id: 's7', no: '07', title: '경영진 및 서류 준비' },
]

export interface Question {
  id: string
  no: number
  section: SectionId
  /** 짧은 제목 (목차 · 비교표) */
  title: string
  /** 묻는 문장 */
  prompt: string
  /** 먼저 보여 주는 안내 · 제안안 · 현재 파악한 숫자 */
  info?: { title: string; lines: string[]; tone?: 'proposal' | 'fact' | 'note' }
  kind: 'single' | 'multi' | 'grid' | 'fields'
  options?: Opt[]
  /** 복수선택 권장 개수 (막지는 않음) */
  maxPick?: number
  /** 「기타」를 고르면 적는 칸 */
  otherText?: boolean
  /** 표 — 줄 이름 · 줄마다 고를 것 */
  rows?: string[]
  rowOptions?: Opt[]
  /** 특정 답을 골랐을 때만 나타나는 세부 칸 */
  detail?: { when: string[]; title?: string; fields: Field[]; repeat?: { addLabel: string; max: number } }
  /** 세부 칸이 늘 보이는 경우 (입력형 질문) */
  fields?: Field[]
  /** 덧붙이는 목록 (선택) — 예: 신규 계약 업체 */
  list?: { title: string; addLabel: string; max: number; fields: Field[] }
  /** 한 질문 안의 두 번째 선택 (Q14) */
  extra?: { prompt: string; options: Opt[] }
  /** 짧은 의견 칸 이름 (선택) */
  note?: string
  /** 우선 확인할 핵심 질문 */
  core?: boolean
  /** 이 사람만 답하는 질문 (다른 분께는 「확인 항목」으로만) */
  onlyFor?: Respondent
  /** 화면 아래 작은 주의 문구 */
  caution?: string
  /** 공동 답지(한 분이 답할 때)에서만 보이는 안내 */
  sharedNote?: string
}

const U = (v: string): Opt => ({ v, unsure: true })
const O = (v: string): Opt => ({ v })

export const QUESTIONS: Question[] = [
  // ── SECTION 01. AX 프로그램 외부 판매 ─────────────────────────────────────
  {
    id: 'q1', no: 1, section: 's1', core: true, title: '소개 가능한 동종업체',
    prompt: 'AX 프로그램을 소개하거나 시연해 볼 수 있는 동종업계 업체가 있으신가요?',
    kind: 'single', options: [O('있음'), O('없음'), U('확인 필요')],
    detail: {
      when: ['있음'], title: '업체 (여러 곳 가능 · 아는 만큼만)',
      fields: [
        { key: 'name', label: '업체명 또는 지역', kind: 'text', placeholder: '예: ○○환경 / 경기 남부' },
        { key: 'relation', label: '업체와의 관계', kind: 'text', placeholder: '예: 오래 알고 지낸 대표' },
      ],
      repeat: { addLabel: '업체 더 적기', max: 8 },
    },
  },
  {
    id: 'q2', no: 2, section: 's1', core: true, title: '실제 유료 도입 가능성',
    prompt: '소개 가능한 업체 중 유료 시범사용이나 구매의향 확인이 가능한 곳이 있을까요?',
    kind: 'single',
    options: [O('유료 시범사용 가능'), O('구매의향 확인 가능'), O('시연만 가능'), O('아직 어려움'), U('확인 필요')],
    note: '간단한 의견 (선택)',
  },
  {
    id: 'q3', no: 3, section: 's1', core: true, title: '월 구독료',
    prompt: 'AX 프로그램의 적정 월 구독료는 얼마라고 생각하시나요?',
    info: { title: '현재 검토안', lines: ['기본형 월 30~50만원 · 상위형 월 80~100만원을 검토 중입니다.'], tone: 'proposal' },
    kind: 'single', options: [O('20~30만원'), O('40~50만원'), O('60~80만원'), O('100만원 이상'), U('잘 모르겠음')],
  },
  {
    id: 'q4', no: 4, section: 's1', title: '최초 도입비',
    prompt: '신규 업체에 최초 세팅·데이터 이전·교육비로 200~300만원을 별도 청구하는 방안은 어떠신가요?',
    info: { title: '검토안', lines: ['최초 도입비 200~300만원 (세팅 · 데이터 이전 · 교육) 별도'], tone: 'proposal' },
    kind: 'single',
    options: [O('적절함'), O('다소 비쌈'), O('더 높게 받을 수 있음'), O('도입비 없이 구독료만 받는 게 좋음'), U('잘 모르겠음')],
  },
  {
    id: 'q5', no: 5, section: 's1', title: '동종업체가 가장 필요로 하는 기능',
    prompt: '동종업체가 가장 필요로 할 기능은 무엇일까요?',
    kind: 'multi', maxPick: 3, otherText: true,
    options: [
      O('수거·배차·기사 일정관리'), O('병원 거래처 관리'), O('자재·재고 관리'), O('청구·입금·미수금 관리'),
      O('수거대장·보고서'), O('AI 요청분석 및 업무지원'), O('기타'),
    ],
  },
  {
    id: 'q6', no: 6, section: 's1', core: true, title: 'SaaS 유료 고객 확보 목표',
    prompt: '아래 유료 고객 확보 목표(제안안)는 어떻게 보시나요?',
    info: {
      title: '제안안 (사업계획용 가정)',
      lines: ['1년차 5개사 · 2년차 15개사 · 3년차 30개사', '확정된 실적이 아니라 사업계획서에 쓰는 가정 숫자입니다.'],
      tone: 'proposal',
    },
    kind: 'single', options: [O('적절함'), O('보수적임'), O('다소 공격적임'), U('잘 모르겠음')],
    detail: {
      when: ['보수적임', '다소 공격적임'], title: '생각하시는 숫자 (가정 · 선택)',
      fields: [
        { key: 'y1', label: '1년차', kind: 'number', unit: '개사', placeholder: '5' },
        { key: 'y2', label: '2년차', kind: 'number', unit: '개사', placeholder: '15' },
        { key: 'y3', label: '3년차', kind: 'number', unit: '개사', placeholder: '30' },
      ],
    },
  },
  {
    id: 'q7', no: 7, section: 's1', title: '경쟁업체 대상 판매',
    prompt: '비원미래의 직접 영업지역과 SaaS 판매지역을 구분하여 본업과의 경쟁을 최소화하는 방안을 어떻게 생각하시나요?',
    kind: 'single', options: [O('동의'), U('일부 조정 필요'), O('지역 구분 없이 판매'), U('잘 모르겠음')],
    note: '수정 의견 (선택)',
  },

  // ── SECTION 02. 병원 고객 포털 ─────────────────────────────────────────────
  {
    id: 'q8', no: 8, section: 's2', core: true, title: '시범운영 병원',
    prompt: '가까운 지인·친척분이 운영하시는 병원 등을 포함하여 3~5개 의료기관에 포털 시범운영을 요청할 수 있을까요?',
    kind: 'single', options: [O('가능'), O('1~2곳 가능'), U('확인 필요'), O('어려움')],
    detail: { when: ['가능', '1~2곳 가능'], fields: [{ key: 'names', label: '병원명 (선택)', kind: 'text', placeholder: '예: ○○의원, ○○요양병원' }] },
  },
  {
    id: 'q9', no: 9, section: 's2', title: '병원 포털 이용 혜택',
    prompt: '병원이 기존 전화·문자 대신 포털을 적극적으로 이용하도록 하려면 어떤 혜택이 가장 효과적일까요?',
    kind: 'multi', otherText: true,
    options: [
      O('수거용기·자재 할인'), O('월별 수거량·거래내역 보고서 무료 제공'), O('병원 소모품 구매 혜택'),
      O('일부 수거비 할인'), O('긴급수거 요청 및 처리현황 확인'), O('기타'),
    ],
  },
  {
    id: 'q10', no: 10, section: 's2', title: '할인 및 혜택 제공 범위',
    prompt: '실제 혜택을 제공한다면 회사가 부담할 수 있는 수준은 어느 정도인가요?',
    kind: 'single',
    options: [O('소액 자재 지원'), O('거래처별 개별 협의'), O('월 정액 할인'), O('일정 비율 할인'), U('잘 모르겠음')],
    detail: {
      when: ['소액 자재 지원', '거래처별 개별 협의', '월 정액 할인', '일정 비율 할인'],
      fields: [{ key: 'amount', label: '금액 또는 할인율 (선택)', kind: 'text', placeholder: '예: 월 2만원 / 5%' }],
    },
  },
  {
    id: 'q11', no: 11, section: 's2', title: '병원에서 가장 자주 요청하는 업무',
    prompt: '병원에서 가장 자주 요청하는 업무는 무엇인가요?',
    kind: 'multi', maxPick: 3, otherText: true,
    options: [O('긴급수거'), O('수거일정 변경'), O('용기·말통·자재 요청'), O('수거내역 확인'), O('청구·정산 문의'), O('기타')],
  },

  // ── SECTION 03. 의료기관 B2B 플랫폼 ────────────────────────────────────────
  {
    id: 'q12', no: 12, section: 's3', title: '우선 판매할 상품',
    prompt: '의료기관에 우선 판매할 상품은 무엇이 좋을까요?',
    kind: 'multi', otherText: true,
    options: [O('의료폐기물 전용용기'), O('말통·수거자재'), O('위생용품'), O('병원 소모품'), O('기타')],
  },
  {
    id: 'q13', no: 13, section: 's3', title: '상품 공급처와 마진',
    prompt: '기존 공급업체나 매입처를 알고 계신가요?',
    kind: 'single', options: [O('있음'), O('일부 있음'), O('없음'), U('확인 필요')],
    detail: {
      when: ['있음', '일부 있음'], title: '공급처 (아는 만큼만)',
      fields: [
        { key: 'name', label: '업체명', kind: 'text' },
        { key: 'items', label: '주요 품목', kind: 'text' },
        { key: 'margin', label: '대략적인 매입·판매가격 또는 마진율', kind: 'text', placeholder: '예: 매입 3,000원 → 판매 4,000원 / 마진 20%' },
      ],
      repeat: { addLabel: '공급처 더 적기', max: 6 },
    },
  },
  {
    id: 'q14', no: 14, section: 's3', title: '확장 가능한 제휴 서비스',
    prompt: '앞으로 연결할 수 있는 제휴 서비스는 무엇일까요?',
    kind: 'multi',
    options: [O('병원 세탁'), O('병원 청소·시설관리'), O('의료기관 물품공급'), O('기타 업체 연결'), U('아직 미정')],
    extra: {
      prompt: '장기적으로 외부 공급업체를 연결하고 중개수익을 확보하는 방향에 동의하시나요?',
      options: [O('동의'), U('검토 필요'), U('다른 방식 선호')],
    },
  },
  {
    id: 'q15', no: 15, section: 's3', title: '실제 소모품 구매 가능 병원',
    prompt: '현재 거래처 중 비원미래를 통해 소모품을 추가 구매할 가능성이 있는 병원이 있나요?',
    kind: 'single', options: [O('있음'), U('확인 필요'), O('아직 없음')],
    detail: { when: ['있음'], fields: [{ key: 'names', label: '병원명 (선택)', kind: 'text' }] },
  },

  // ── SECTION 04. 기존 사업현황 ──────────────────────────────────────────────
  {
    id: 'q16', no: 16, section: 's4', core: true, title: '최신 거래처 및 수거량 확인',
    prompt: '현재 파악한 숫자가 지금도 맞나요?',
    info: {
      title: '현재 파악한 숫자',
      lines: ['거래처: 약 64곳', '의료폐기물: 월 43톤', '의료기관 일회용기저귀: 월 80톤'],
      tone: 'fact',
    },
    kind: 'single', options: [O('현재도 동일'), O('일부 변경됨'), U('정확한 확인 필요')],
    detail: {
      when: ['일부 변경됨'], title: '바뀐 숫자만 적어 주세요',
      fields: [
        { key: 'clients', label: '거래처', kind: 'number', unit: '곳', placeholder: '64' },
        { key: 'medical', label: '의료폐기물 (월)', kind: 'number', unit: '톤', placeholder: '43' },
        { key: 'diaper', label: '의료기관 일회용기저귀 (월)', kind: 'number', unit: '톤', placeholder: '80' },
      ],
    },
  },
  {
    id: 'q17', no: 17, section: 's4', core: true, title: '2026년 매출 및 신규계약',
    prompt: '2026년 매출과 신규 계약 전망을 알려 주세요. (아는 것만)',
    kind: 'fields',
    fields: [
      { key: 'revenueSoFar', label: '현재까지 실제 매출액', kind: 'number', unit: '만원' },
      { key: 'revenue2026', label: '2026년 예상 연매출', kind: 'number', unit: '만원' },
      { key: 'newClients', label: '향후 신규 계약 예상 병원 수', kind: 'number', unit: '곳' },
    ],
    list: {
      title: '신규 계약이 있다면 (선택)', addLabel: '신규 계약 적기', max: 10,
      fields: [
        { key: 'name', label: '업체명', kind: 'text' },
        { key: 'revenue', label: '예상 매출 (연)', kind: 'number', unit: '만원' },
        { key: 'stage', label: '진행상태', kind: 'select', options: ['문의·협의 중', '견적 제출', '계약 예정', '계약 완료'] },
      ],
    },
  },
  {
    id: 'q18', no: 18, section: 's4', title: 'AX 시스템 실사용 여부',
    prompt: '사용자별로 지금 AX 시스템을 얼마나 쓰고 있나요?',
    kind: 'grid', rows: ['관리자', '사무실', '기사', '병원 고객'],
    rowOptions: [O('실제 사용 중'), O('일부 테스트 중'), O('아직 사용 전'), U('잘 모르겠음')],
    note: '개선된 점 (선택)',
  },
  {
    id: 'q19', no: 19, section: 's4', title: '신규 기사 채용',
    prompt: '거래처 증가에 따라 향후 1년 이내 기사를 추가 채용할 계획이 있으신가요?',
    kind: 'single', options: [O('1명'), O('2명'), O('3명 이상'), O('아직 없음'), U('미정')],
  },

  // ── SECTION 05. 향후 기술개발 방향 ─────────────────────────────────────────
  {
    id: 'q20', no: 20, section: 's5', core: true, title: '단계별 AX 개발계획',
    prompt: '위와 같은 순서로 개발을 추진하는 방향에 동의하시나요?',
    info: {
      title: '제안 — 단계별 개발계획',
      lines: [
        '1단계: 기존 AX 시스템 안정화 및 운영데이터 축적',
        '2단계: 동종업체용 SaaS 제품화, 업체별 데이터 분리 및 구독·결제 시스템 구축',
        '3단계: AI 분석 및 운영지원 고도화, 외부 유료 고객 확보',
        '4단계: 의료기관 B2B 플랫폼 확장',
      ],
      tone: 'proposal',
    },
    kind: 'single', options: [O('동의'), U('일부 수정 희망'), U('추가 논의 필요')],
    note: '수정 의견 (선택)',
  },
  {
    id: 'q21', no: 21, section: 's5', title: '개발인력 운영방식',
    prompt: '아래 개발인력 운영 방향을 어떻게 생각하시나요?',
    info: {
      title: '제안',
      lines: ['초기에는 기존 외부 개발 협업을 중심으로 프로그램을 안정화하고 상용화하며, 추후 유료 고객 확대와 기술지원 수요 증가에 맞춰 비원미래 내부 개발자 채용을 검토하는 방향을 제안드립니다.'],
      tone: 'proposal',
    },
    kind: 'single',
    options: [O('동의'), O('내부 개발자를 더 일찍 채용하고 싶음'), U('다른 방식 검토'), U('추가 논의 필요')],
    note: '수정 의견 (선택)',
  },

  // ── SECTION 06. 보증자금 및 사업비 ─────────────────────────────────────────
  {
    id: 'q22', no: 22, section: 's6', core: true, title: '총 필요자금',
    prompt: '향후 12개월 동안 AX 개발·사업화 및 회사 성장에 필요한 전체 자금은 어느 정도라고 생각하시나요?',
    info: { title: '안내', lines: ['실제 보증 신청금액은 신보의 인정 가능 자금용도와 심사 결과를 바탕으로 확정합니다.'], tone: 'note' },
    kind: 'single', options: [O('3억원'), O('4억원'), O('5억원'), O('기타'), U('협의 필요')],
    detail: { when: ['기타'], fields: [{ key: 'amount', label: '생각하시는 금액', kind: 'number', unit: '만원' }] },
  },
  {
    id: 'q23', no: 23, section: 's6', title: '기존 사업 확장에 필요한 자금',
    prompt: '차량 외에 추가로 필요한 항목을 골라 주세요.',
    info: { title: '기존에 논의한 것', lines: ['추가 4.5톤급 차량 · 약 6,000~7,000만원'], tone: 'fact' },
    kind: 'multi',
    options: [O('차량 추가 구매'), O('신규 기사 인건비'), O('사업장 운영비'), O('기타 운영자금'), O('별도 필요 없음')],
    detail: {
      when: ['차량 추가 구매', '신규 기사 인건비', '사업장 운영비', '기타 운영자금'],
      fields: [{ key: 'amount', label: '필요금액 (대략 · 선택)', kind: 'number', unit: '만원' }],
    },
  },
  {
    id: 'q24', no: 24, section: 's6', core: true, title: 'AX 개발·사업화 투자금액',
    prompt: '전체 자금 중 AX 시스템 고도화, SaaS 제품화, 외부 전문개발, AI 기능, 서버·데이터 및 초기 사업화에 어느 정도까지 투자할 계획이신가요?',
    info: { title: '안내', lines: ['초기 의견수렴용이며, 실제 개발범위·견적과 신보 인정범위를 검토해 확정합니다.'], tone: 'note' },
    kind: 'single', options: [O('1억원 내외'), O('2억원 내외'), O('3억원 내외'), O('3억원 이상'), U('협의 필요')],
  },

  // ── SECTION 07. 경영진 및 서류 준비 ────────────────────────────────────────
  {
    id: 'q25', no: 25, section: 's7', title: '홍현주 이사님 주요 경력', onlyFor: 'director',
    prompt: '사업계획서 경영진 소개에 들어갈 내용을 간단히 적어 주세요. (아는 만큼만)',
    kind: 'fields',
    fields: [
      { key: 'edu', label: '최종학력 · 전공', kind: 'text' },
      { key: 'career', label: '주요 근무경력', kind: 'long' },
      { key: 'training', label: '관련 교육이력', kind: 'long' },
      { key: 'rnd', label: '연구개발 관련 경험', kind: 'long' },
    ],
    caution: '주민등록번호 · 상세 주소 같은 개인정보는 적지 마세요. 이 설문에서는 받지 않습니다.',
    sharedNote: '이사님 경력입니다. 대표님이 답하시는 경우 아는 만큼만 적거나 「미정 · 나중에」를 눌러 넘어가셔도 됩니다.',
  },
  {
    id: 'q26', no: 26, section: 's7', title: '신보 제출서류 준비 현황',
    prompt: '자료별로 지금 상태를 골라 주세요.',
    kind: 'grid',
    rows: [
      '최신 매출현황', '신규 거래처·계약 관련 자료', '최근 통장거래내역 및 잔고', '매출채권·매입채무',
      '기존 차입금·금융거래', '급여대장·4대보험 명부', '연구개발전담부서 인정자료', '특허출원 자료',
      '차량 구매 견적', '세무·재무 증빙자료',
    ],
    rowOptions: [O('준비 완료'), O('준비 중'), O('추후 제출'), O('해당 없음')],
    caution: '원본 서류는 이 설문에 첨부하지 마세요. 상태만 골라 주시고, 서류는 기존에 쓰던 안전한 방법으로 주시면 됩니다.',
  },
]

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]))

// ── 답 모양 ─────────────────────────────────────────────────────────────────

export interface Answer {
  choice?: string
  picks?: string[]
  other?: string
  extra?: string
  grid?: Record<string, string>
  fields?: Record<string, string>
  rows?: Record<string, string>[]
  list?: Record<string, string>[]
  note?: string
  /** 「미정 · 나중에」를 눌렀음 — 답이 없는 것과 구분합니다 */
  skip?: boolean
}
export type Answers = Record<string, Answer>

/** 이 사람이 답하는 질문 (공동 답지는 26문항 전부 · 개인 답지면 Q25 는 이사님만) */
export function questionsFor(who: SurveyWho): Question[] {
  return QUESTIONS.filter((q) => who === 'shared' || !q.onlyFor || q.onlyFor === who)
}

/** 이 사람에게 해당 없는 질문인가 (개인 답지에서 남의 확인 항목) */
export const notMineFor = (q: Question, who: SurveyWho) => who !== 'shared' && !!q.onlyFor && q.onlyFor !== who

const filled = (s: string | undefined) => !!s && s.trim().length > 0
const anyFilled = (o: Record<string, string> | undefined) => !!o && Object.values(o).some(filled)
const rowsFilled = (r: Record<string, string>[] | undefined) => (r ?? []).filter(anyFilled)

/** 무엇이든 골랐거나 적었는가 (「미정」 누름 포함) */
export function isAnswered(q: Question, a: Answer | undefined): boolean {
  if (!a) return false
  if (a.skip) return true
  switch (q.kind) {
    case 'single':
      return filled(a.choice)
    case 'multi':
      return (a.picks ?? []).length > 0 || filled(a.extra)
    case 'grid':
      return anyFilled(a.grid)
    case 'fields':
      return anyFilled(a.fields) || rowsFilled(a.list).length > 0
  }
}

const unsureOf = (opts: Opt[] | undefined, v: string | undefined) => !!v && !!opts?.find((o) => o.v === v)?.unsure

/** 미정 · 확인 필요 · 추가 논의 필요 … (답은 했지만 확정이 아닌 것) */
export function isUnsure(q: Question, a: Answer | undefined): boolean {
  if (!a) return false
  if (a.skip) return true
  if (q.kind === 'single' && unsureOf(q.options, a.choice)) return true
  if (q.kind === 'multi' && (a.picks ?? []).some((p) => unsureOf(q.options, p))) return true
  if (q.extra && unsureOf(q.extra.options, a.extra)) return true
  if (q.kind === 'grid' && Object.values(a.grid ?? {}).some((v) => unsureOf(q.rowOptions, v))) return true
  return false
}

export type QState = 'done' | 'unsure' | 'later'
/** 답함 · 미정 · 추후 확인(아직 안 고름) */
export function stateOf(q: Question, a: Answer | undefined): QState {
  if (!isAnswered(q, a)) return 'later'
  return isUnsure(q, a) ? 'unsure' : 'done'
}
export const STATE_LABEL: Record<QState, string> = { done: '답함', unsure: '미정 · 논의', later: '추후 확인' }

/** 세부 칸을 보여 줄 때인가 */
export function detailOpen(q: Question, a: Answer | undefined): boolean {
  if (!q.detail || !a) return false
  if (q.kind === 'multi') return (a.picks ?? []).some((p) => q.detail!.when.includes(p))
  return !!a.choice && q.detail.when.includes(a.choice)
}

export function progressOf(who: SurveyWho, answers: Answers) {
  const qs = questionsFor(who)
  const states = qs.map((q) => stateOf(q, answers[q.id]))
  const answered = states.filter((s) => s !== 'later').length
  return {
    total: qs.length,
    answered,
    left: qs.length - answered,
    unsure: states.filter((s) => s === 'unsure').length,
    coreLeft: qs.filter((q, i) => q.core && states[i] === 'later').length,
  }
}

// ── 동시 작성 보호 (0145) — 바뀐 질문만 보내고, 서버 답 위에 다시 얹기 ─────────

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** 서버에 있던 답(base)과 지금 답(cur)의 차이 — 바꾼 질문 · 지운 질문 */
export function diffAnswers(base: Answers, cur: Answers): { set: Answers; unset: string[] } {
  const set: Answers = {}
  for (const [k, v] of Object.entries(cur)) if (!same(base[k], v)) set[k] = v
  const unset = Object.keys(base).filter((k) => !(k in cur))
  return { set, unset }
}

export const isEmptyDiff = (d: { set: Answers; unset: string[] }) => Object.keys(d.set).length === 0 && d.unset.length === 0

/** 차이를 답 위에 적용 (서버의 끼워 넣기와 같은 계산) */
export function applyDiff(base: Answers, d: { set: Answers; unset: string[] }): Answers {
  const out: Answers = { ...base }
  for (const k of d.unset) delete out[k]
  return Object.assign(out, d.set)
}

/** 서버가 돌려준 답(server) 위에 — 보낸 뒤(sent) 이 화면에서 또 바꾼 것(cur)만 다시 얹습니다 */
export function rebase(server: Answers, sent: Answers, cur: Answers): Answers {
  const out: Answers = { ...server }
  for (const k of new Set([...Object.keys(sent), ...Object.keys(cur)])) {
    if (same(sent[k], cur[k])) continue
    if (k in cur) out[k] = cur[k]
    else delete out[k]
  }
  return out
}

// ── 한 줄 요약 (검토 화면 · 관리자 비교 · 복사) ─────────────────────────────

const fieldText = (fs: Field[], o: Record<string, string> | undefined) =>
  fs
    .filter((f) => filled(o?.[f.key]))
    .map((f) => `${f.label.replace(/ \(.*\)$/, '')} ${o![f.key].trim()}${f.unit ? f.unit : ''}`)
    .join(' · ')

/** 답을 사람이 읽는 줄로 — 없으면 빈 배열 */
export function summaryLines(q: Question, a: Answer | undefined): string[] {
  if (!a) return []
  const out: string[] = []
  if (a.skip && !isAnsweredIgnoringSkip(q, a)) return ['미정 (나중에 답하기)']
  if (q.kind === 'single' && filled(a.choice)) out.push(a.choice!)
  if (q.kind === 'multi' && (a.picks ?? []).length) {
    out.push(a.picks!.map((p) => (p === '기타' && filled(a.other) ? `기타(${a.other!.trim()})` : p)).join(', '))
  }
  if (q.extra && filled(a.extra)) out.push(`${q.extra.prompt.replace(/\?$/, '')} → ${a.extra}`)
  if (q.kind === 'grid') {
    for (const r of q.rows ?? []) if (filled(a.grid?.[r])) out.push(`${r}: ${a.grid![r]}`)
  }
  if (q.kind === 'fields' && q.fields) {
    for (const f of q.fields) if (filled(a.fields?.[f.key])) out.push(`${f.label}: ${a.fields![f.key].trim()}${f.unit ?? ''}`)
  }
  if (q.detail && detailOpen(q, a)) {
    if (q.detail.repeat) {
      rowsFilled(a.rows).forEach((r, i) => out.push(`${i + 1}) ${fieldText(q.detail!.fields, r)}`))
    } else {
      const t = fieldText(q.detail.fields, a.fields)
      if (t) out.push(t)
    }
  }
  if (q.list) rowsFilled(a.list).forEach((r, i) => out.push(`신규 ${i + 1}) ${fieldText(q.list!.fields, r)}`))
  if (filled(a.note)) out.push(`의견: ${a.note!.trim()}`)
  if (a.skip) out.push('(미정으로 표시)')
  return out
}

function isAnsweredIgnoringSkip(q: Question, a: Answer): boolean {
  return isAnswered(q, { ...a, skip: false })
}

// ── 관리 화면 — 문서 · 복사 · 내보내기 (답지 하나) ────────────────────────────

export interface ResponseRow {
  respondent: Respondent
  answers: Answers
  status: 'draft' | 'submitted'
  started_at?: string
  updated_at?: string | null
  submitted_at?: string | null
  first_submitted_at?: string | null
  /** 0145 — 마지막으로 고친 사람 */
  edited_by?: string
  edited_role?: string
}

const sectionOf = (id: SectionId) => SECTIONS.find((s) => s.id === id)!

function answerText(q: Question, r: ResponseRow | undefined): string {
  const lines = summaryLines(q, r?.answers?.[q.id])
  return lines.length ? lines.join(' / ') : '추후 확인 (미응답)'
}

/** 읽기 좋은 문서 (전체 답변 복사 · 미확정 사항 복사) */
export function documentText(row: ResponseRow | undefined, opts: { onlyOpen?: boolean } = {}): string {
  const out: string[] = []
  const p = progressOf('shared', row?.answers ?? {})
  out.push(`${SURVEY_MENU_NAME} — ${SURVEY_TITLE}${opts.onlyOpen ? ' · 미확정 사항' : ' · 답변 정리'}`)
  out.push(
    `· 상태: ${row ? (row.status === 'submitted' ? '제출 완료' : p.answered > 0 ? '작성 중' : '작성 전') : '작성 전'} · ${p.answered}/${p.total} 답함 · 미정 ${p.unsure} · 추후 확인 ${p.left}` +
      (row?.edited_by ? ` · 마지막 작성 ${row.edited_by}` : '') +
      (row?.updated_at && p.answered > 0 ? ` · 최종 수정 ${fmtDateTime(row.updated_at)}` : ''),
  )
  out.push('※ 추천안·제안안은 검토안이며, 이 답변은 사업계획서 초안을 위한 의견 수렴입니다.')
  for (const s of SECTIONS) {
    const qs = QUESTIONS.filter((q) => q.section === s.id).filter((q) => !opts.onlyOpen || stateOf(q, row?.answers?.[q.id]) !== 'done')
    if (!qs.length) continue
    out.push('')
    out.push(`■ SECTION ${s.no}. ${s.title}`)
    for (const q of qs) {
      const st = stateOf(q, row?.answers?.[q.id])
      out.push(`Q${q.no}. ${q.title}${q.core ? ' ★' : ''}${st === 'unsure' ? ' [미정·논의]' : ''}`)
      out.push(`  - ${answerText(q, row)}`)
    }
  }
  return out.join('\n')
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

/** CSV — 엑셀에서 한글이 깨지지 않게 BOM 을 붙입니다 */
export function csvText(row: ResponseRow | undefined): string {
  const head = ['섹션', '번호', '질문', '핵심', '답변', '상태']
  const lines = [head.map(csvCell).join(',')]
  for (const q of QUESTIONS) {
    lines.push(
      [
        `${sectionOf(q.section).no} ${sectionOf(q.section).title}`,
        `Q${q.no}`,
        q.title,
        q.core ? '★' : '',
        answerText(q, row),
        STATE_LABEL[stateOf(q, row?.answers?.[q.id])],
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return '\ufeff' + lines.join('\r\n')
}

/** JSON — 질문 id 별 원래 답 그대로 + 질문 제목 */
export function jsonText(row: ResponseRow | undefined): string {
  return JSON.stringify(
    {
      survey: 'newborn-survey-0145',
      title: `${SURVEY_MENU_NAME} — ${SURVEY_TITLE}`,
      exportedAt: new Date().toISOString(),
      questions: QUESTIONS.map((q) => ({ id: q.id, no: q.no, section: sectionOf(q.section).title, title: q.title, core: !!q.core })),
      response: row
        ? {
            status: row.status,
            edited_by: row.edited_by ?? '',
            updated_at: row.updated_at ?? null,
            submitted_at: row.submitted_at ?? null,
            first_submitted_at: row.first_submitted_at ?? null,
            answers: row.answers,
          }
        : null,
    },
    null,
    2,
  )
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const k = new Date(d.getTime() + 9 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  //  올해가 아니면 연도까지 (링크 만료일이 해를 넘길 때)
  const thisYear = new Date(Date.now() + 9 * 3600_000).getUTCFullYear()
  const y = k.getUTCFullYear() !== thisYear ? `${k.getUTCFullYear()}년 ` : ''
  return `${y}${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`
}
