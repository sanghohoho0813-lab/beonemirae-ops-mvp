//  사업화전략(0148) 검사용 모델 — **가상 회사 · 중립 숫자만** (공개 저장소)
//
//   실제 회사 숫자 · 결정안 · 질문은 저장소에 없습니다(서버 DB 에만). 여기 숫자는 손으로
//   계산하기 쉬운 값으로 골랐습니다. 검사의 기대값은 엔진을 돌려 얻은 값이 아니라 아래
//   주석의 손 계산입니다.

const year = (o = {}) => ({
  drive: 'target',
  endTarget: 36,
  churnRate: 0,
  timing: 'even',
  trialMonths: 0,
  mix: { basic: 0.5, plus: 0.5 },
  adoption: { helper: 0.5, route: 0 },
  priceFactor: 1,
  setupPaidShare: 0.5,
  setupAvgFee: 600_000,
  channelShare: { direct: 0.75, ref: 0.25 },
  funnel: { direct: { demoRate: 0.5, signupRate: 0.5, paidRate: 0.5 }, ref: { demoRate: 1, signupRate: 0.5, paidRate: 0.5 } },
  referral: { referrerCost: 100_000, refereeCost: 50_000 },
  ...o,
})
const b2b = (o = {}) => ({ goodsHospitals: 100, monthlySpend: 100_000, serviceContracts: 50, serviceAvg: 2_000_000, serviceFeeRate: 0.1, adsRevenue: 5_000_000, ...o })

const scenario = (id, name, o = {}) => ({
  id,
  name,
  summary: `${name} — 검사용 가상 시나리오`,
  conditions: ['검사용 조건'],
  risks: ['검사용 위험'],
  legacyTarget: 1_331_000_000,
  saas: { startCustomers: 0, years: { 2027: year({ endTarget: 12 }), 2028: year({ endTarget: 12 }), 2029: year() } },
  b2b: { years: { 2027: b2b({ goodsHospitals: 10, serviceContracts: 0, adsRevenue: 0 }), 2028: b2b({ goodsHospitals: 50 }), 2029: b2b() } },
  ...o,
})

export function fixtureModel() {
  return {
    version: 1,
    meta: { title: '사업화전략 · 3개년 매출 검토', asOf: '2026-10-01', baseYear: 2026, years: [2027, 2028, 2029], applicationMonth: '2026-11', recommended: 'B', note: '가상 회사 검사용' },
    segments: { legacy: '기존 수거 사업', saas: '업무관리 SaaS', b2b: '기관 B2B 플랫폼' },
    labels: {},
    facts: [
      { id: 'f1', text: '가상 회사의 확인된 사실 문장', kind: '확인된 사실', src: '검사' },
      { id: 'f2', text: '가상 회사의 사업화 목표 문장', kind: '사업화 목표', src: '검사' },
    ],
    legacy: { baseAmount: 1_000_000_000, baseKind: '산출된 추정치', method: 'cagr' },
    saasCatalog: {
      plans: [{ id: 'basic', name: 'BASIC', price: 100_000 }, { id: 'plus', name: 'PLUS', price: 200_000 }],
      options: [
        { id: 'helper', name: '도우미', price: 50_000, existing: '비슷한 기능 일부 있음', newWork: '확장', unitCost: null },
        { id: 'route', name: '경로 계산', price: 80_000, existing: '없음', newWork: '새로 개발', unitCost: null },
      ],
      setupTiers: [{ id: 'free', name: '간편', fee: 0 }, { id: 'std', name: '일반', fee: 600_000 }, { id: 'quote', name: '별도 견적', fee: null }],
      overage: { included: 100, unit: 100, price: 10_000, confirmed: false, note: '원가 측정 전' },
    },
    channels: [{ id: 'direct', name: '직접영업' }, { id: 'ref', name: '고객 추천' }],
    referralChannel: 'ref',
    b2b: {
      grossMargin: 0.2, shippingRate: 0.03, paymentFeeRate: 0.02, couponRate: 0.01, brokerTakeRate: 0.08,
      arDays: 30, apDays: 15, inventoryDays: 10, opsCostPerHospitalMonth: 10_000, fixedOpsCostYear: 6_000_000,
      directShare: 0.5, structure: 'direct', core: 'mixed',
    },
    scenarios: {
      A: scenario('A', '보수안', { legacyTarget: 1_200_000_000 }),
      B: scenario('B', '기본안'),
      C: scenario('C', '확장안', { legacyTarget: 1_500_000_000 }),
    },
    funding: {
      total: 100_000_000,
      applyTarget: 100_000_000,
      items: [
        { id: 'dev', name: '외부 개발', amount: 50_000_000, category: 'outsource', eligibility: '적격 가능', firstYearShare: 1, formRow: 0 },
        { id: 'lab', name: '내부 연구 인건비', amount: 20_000_000, category: 'labor', eligibility: '적격 가능', firstYearShare: 0.5, formRow: 2 },
        { id: 'mkt', name: '판로 개척', amount: 30_000_000, category: 'marketing', eligibility: '신보 확인 필요', firstYearShare: 1, formRow: 8 },
      ],
      phases: [{ id: 'p1', name: '1단계', desc: '검사용', existing: '있는 것', newWork: '새로 할 것', months: '1~6개월' }],
      options: [
        { id: 'A', name: '연구개발 중심', rule: 'eligible' },
        { id: 'B', name: '인정 범위 조합', rule: 'eligible_plus_check' },
        { id: 'C', name: '신청금액 조정', rule: 'cap_to_eligible' },
      ],
      option: 'A',
      ownFunds: null,
    },
    productivity: {
      who: '가상 담당자', task: '가상 정리 업무', beforeMin: [120, 180], afterMax: 30, daysMonth: 20, daysYear: 240, hourlyValue: 10_000,
      kind: '확인된 사실', src: '검사', evidenceTodo: ['같은 조건 비교'], unmeasured: ['측정 안 한 개선'],
    },
    market: { steps: [{ id: 'all', label: '전체 업체', count: null, kind: '추가 검증 필요' }, { id: 'target', label: '유료 목표', count: null, kind: '사업화 목표' }] },
    original: { B: { saas: 60_000_000, total: 2_000_000_000, saasAvg: 25, setupCount: 30 } },
    decisions: [
      { key: 'scenario', no: 1, title: '마지막 해 전체 목표', question: '어느 시나리오로 갈까요?', recommended: 'B',
        options: [{ id: 'A', label: '보수안', patch: [{ path: 'select.scenario', value: 'A' }] }, { id: 'B', label: '기본안', patch: [{ path: 'select.scenario', value: 'B' }] }, { id: 'C', label: '확장안', patch: [{ path: 'select.scenario', value: 'C' }] }],
        custom: { kind: 'number', label: '직접 입력', unit: '억원' },
        reason: '검사용 이유', calc: '검사용 계산', prerequisites: ['검사용 선행조건'], risk: '검사용 위험', evidence: ['검사용 자료'], fields: ['s11.plan.y1', 's11.plan.y1_note', 's11.plan.sum_limit', 's11.plan.sum_annual', 'a.sales_total', 'a.sales_items', 'a.sales_basis'], qa: ['q1'] },
      { key: 'legacy', no: 2, title: '기존 사업 목표', question: '기존 사업 마지막 해 목표는?', recommended: 'x13',
        options: [{ id: 'x12', label: '12억', patch: [{ path: 'scenarios.*.legacyTarget', value: 1_200_000_000 }] }, { id: 'x13', label: '13.31억', patch: [{ path: 'scenarios.*.legacyTarget', value: 1_331_000_000 }] }],
        custom: { kind: 'number', unit: '억원', path: 'scenarios.*.legacyTarget', scale: 100_000_000 }, fields: ['s11.plan.y1'] },
      { key: 'saas_target', no: 3, title: 'SaaS 목표 고객', question: '마지막 해 연말 고객은?', recommended: 'k36',
        options: [{ id: 'k24', label: '24곳', patch: [{ path: 'scenarios.{sel}.saas.years.2029.endTarget', value: 24 }] }, { id: 'k36', label: '36곳', patch: [{ path: 'scenarios.{sel}.saas.years.2029.endTarget', value: 36 }] }],
        custom: { kind: 'number', unit: '곳', path: 'scenarios.{sel}.saas.years.2029.endTarget' }, fields: ['s11.plan.y3'] },
      { key: 'ai', no: 5, title: '부가 기능 출시', question: '부가 기능을 어떻게 낼까요?', recommended: 'all',
        options: [{ id: 'all', label: '모두', patch: [] }, { id: 'none', label: '내지 않음', patch: [{ path: 'scenarios.*.saas.years.2029.adoption.helper', value: 0 }] }],
        custom: { kind: 'multi', choices: [{ id: 'helper', label: '도우미', off: [{ path: 'scenarios.*.saas.years.2029.adoption.helper', value: 0 }] }, { id: 'route', label: '경로 계산', on: [{ path: 'scenarios.*.saas.years.2029.adoption.route', value: 0.1 }] }] } },
      { key: 'structure', no: 8, title: 'B2B 매출구조', question: '직접판매 · 중개 · 혼합?', recommended: 'direct',
        options: [{ id: 'direct', label: '직접판매', patch: [{ path: 'b2b.structure', value: 'direct' }] }, { id: 'broker', label: '중개', patch: [{ path: 'b2b.structure', value: 'broker' }] }, { id: 'mixed', label: '혼합', patch: [{ path: 'b2b.structure', value: 'mixed' }] }],
        fields: ['s11.plan.y1'] },
      { key: 'funding', no: 10, title: '자금배분', question: '보증 신청 범위는?', recommended: 'A',
        options: [{ id: 'A', label: '연구개발 중심', patch: [{ path: 'funding.option', value: 'A' }] }, { id: 'B', label: '인정 범위 조합', patch: [{ path: 'funding.option', value: 'B' }] }, { id: 'C', label: '신청금액 조정', patch: [{ path: 'funding.option', value: 'C' }] }],
        fields: ['s9.funding', 's9.working', 'a.funds'] },
    ],
    qa: [
      { id: 'q1', area: '시장', question: '가상 질문 — 시장은 얼마나 큽니까?', answer: '가상 답변', evidence: ['가상 자료'], gaps: ['시장 규모 미확인'], plan: ['공식 통계 확인'], fields: ['s11.market.target'], decisions: ['scenario'], metrics: ['saas.end.2029', 'market.share'], status: '근거 부족' },
      { id: 'q2', area: '자금', question: '가상 질문 — 자금 근거는?', answer: '가상 답변 2', evidence: [], gaps: ['견적 없음'], plan: ['견적 받기'], fields: ['a.funds'], decisions: ['funding'], metrics: ['funding.guarantee'], status: '보완 필요' },
    ],
    research: [{ id: 'r1', topic: '시장', claim: '가상 출처 문장', publisher: '가상 기관', published: '2026-01-01', baseYear: '2025', scope: '전국', kind: '추가 검증 필요' }],
    drafts: { 's11.prod.bm_b': { text: '가상 사업모델 — 마지막 해 연말 {{saas.end.2029}} · 매출 {{saas.2029}}', decisions: ['saas_target'] } },
  }
}
