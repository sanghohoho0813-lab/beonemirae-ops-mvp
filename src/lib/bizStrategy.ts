// ─────────────────────────────────────────────────────────────────────────────
// 사업화전략 · 3개년 매출 검토 — 계산 엔진 (0148)
//
//  ⚠ 공개 저장소입니다. 이 파일에는 **회사 숫자가 하나도 없습니다.** 매출 · 고객 · 가격 ·
//    자금 · 결정안 · 심사 질문은 모두 서버(bizplan_strategy, 참여자만)에 있는 「모델 자료」로
//    받아 계산합니다. 여기는 계산 방법(수식)과 자료 모양만 둡니다.
//
//  계산 원칙
//   · 금액은 원 단위로 계산하고, 표시할 때만 억원(소수 둘째 자리) · 백만원(정수)으로 반올림.
//     반올림한 부분 합이 반올림한 합계와 다르면 각주를 붙입니다(숫자를 억지로 맞추지 않음).
//   · 월별로 계산합니다 — 연말 고객 수와 연평균 고객 수가 다르고(연중 가입), 달력 연도와
//     신보 차년도(접수월 다음 달부터 12개월)를 같은 월별 숫자에서 따로 더할 수 있습니다.
//   · 신규 가입 · 이탈 · 무료 체험 · 추천 할인 · 설정비를 반영합니다.
//   · 거래총액(GMV)과 회사 매출을 나눕니다 — 직접판매는 총액, 중개는 수수료만 매출.
//   · 모든 숫자에는 성격(확인된 사실 · 산출된 추정치 · 사업화 목표 · 추가 검증 필요 ·
//     경영진 결정 필요)을 글자로 붙입니다. 목표를 계약 · 확정 매출처럼 쓰지 않습니다.
//
//  이 파일은 다른 파일을 불러오지 않습니다(검사에서 그대로 씀).
// ─────────────────────────────────────────────────────────────────────────────

export type Kind = '확인된 사실' | '산출된 추정치' | '사업화 목표' | '추가 검증 필요' | '경영진 결정 필요'
export const KINDS: Kind[] = ['확인된 사실', '산출된 추정치', '사업화 목표', '추가 검증 필요', '경영진 결정 필요']

export type ScenarioId = 'A' | 'B' | 'C'
export const SCENARIO_IDS: ScenarioId[] = ['A', 'B', 'C']

export interface ParamLabel {
  kind: Kind
  src?: string
  asOf?: string
  note?: string
}

export interface PlanTier {
  id: string
  name: string
  /** 월 구독료 (원, 부가세 별도) */
  price: number
  desc?: string
}
export interface PaidOption {
  id: string
  name: string
  /** 월 추가요금 (원) */
  price: number
  desc?: string
  /** 이미 구현된 비슷한 기능과 그 범위 · 한계 */
  existing?: string
  /** 새로 개발할 부분 */
  newWork?: string
  /** 원가(1곳 · 1달, 원) — 측정 전이면 null */
  unitCost?: number | null
}
export interface SetupTier {
  id: string
  name: string
  /** 원 — 별도 견적이면 null */
  fee: number | null
  desc?: string
}

export interface SaasYear {
  /** 'target' = 연말 고객 목표에서 신규 가입을 역산 · 'funnel' = 경로별 접촉 수에서 신규 가입을 계산 */
  drive: 'target' | 'funnel'
  /** 연말 유료고객 목표 (drive=target) */
  endTarget: number
  /** 경로별 접촉 수 (drive=funnel) */
  contacts?: Record<string, number>
  /** 연 이탈률 0~1 */
  churnRate: number
  /** 가입 시점 — 고르게 · 상반기에 많이 · 하반기에 많이 */
  timing: 'even' | 'front' | 'back'
  /** 가입 뒤 무료 체험 개월 */
  trialMonths: number
  /** 요금제 비중 (합 1) */
  mix: Record<string, number>
  /** 부가 기능 채택률 0~1 (출시 전이면 0) */
  adoption: Record<string, number>
  /** 요금 할인 등 (1 = 정가) */
  priceFactor: number
  /** 신규 고객 중 유료 설정을 하는 비율 0~1 */
  setupPaidShare: number
  /** 유료 설정 평균 청구액 (원) */
  setupAvgFee: number
  /** 신규 고객의 경로별 비중 (합 1) — drive=target 일 때 */
  channelShare: Record<string, number>
  /** 경로별 전환율 — 접촉→시연, 시연→가입, 가입→유료 */
  funnel: Record<string, { demoRate: number; signupRate: number; paidRate: number }>
  /** 추천으로 들어온 신규 1곳당 비용 (원) — 기존 고객 할인 + 신규 고객 설정비 할인 */
  referral: { referrerCost: number; refereeCost: number }
}

export interface B2BYear {
  /** 연평균 상품 구매 의료기관 수 */
  goodsHospitals: number
  /** 기관당 월평균 구매액 (원, 거래총액) */
  monthlySpend: number
  /** 전문 서비스 계약 건수 (연) */
  serviceContracts: number
  /** 서비스 계약 평균액 (원) */
  serviceAvg: number
  /** 서비스 중개 수수료율 0~1 */
  serviceFeeRate: number
  /** 입점 · 광고 매출 (원, 연) */
  adsRevenue: number
}

export interface Scenario {
  id: ScenarioId
  name: string
  summary: string
  conditions?: string[]
  risks?: string[]
  /** 마지막 해 기존 사업 목표 (원) */
  legacyTarget: number
  saas: { startCustomers: number; years: Record<string, SaasYear> }
  b2b: { years: Record<string, B2BYear> }
}

export type B2BStructure = 'direct' | 'broker' | 'mixed'
export type B2BCore = 'goods' | 'services' | 'mixed'

export interface B2BSettings {
  /** 상품 매출총이익률 (직접판매) */
  grossMargin: number
  /** 배송 · 반품비 (직접판매 매출 대비) */
  shippingRate: number
  /** 결제수수료 (회사가 대금을 받는 직접판매 매출 대비) */
  paymentFeeRate: number
  /** 추천쿠폰 · 할인 (상품 거래총액 대비, 회사 부담) */
  couponRate: number
  /** 중개형 상품 수수료율 */
  brokerTakeRate: number
  /** 매출채권 회수기간 · 매입채무 지급기간 · 재고 보유일 */
  arDays: number
  apDays: number
  inventoryDays: number
  /** 고객지원 · 운영비 — 기관당 월 (원) */
  opsCostPerHospitalMonth: number
  /** 고정 운영비 (원, 연) */
  fixedOpsCostYear: number
  /** 혼합형의 직접판매 비중 0~1 */
  directShare: number
  structure: B2BStructure
  core: B2BCore
}

export type FundingCategory = 'rnd' | 'outsource' | 'labor' | 'infra' | 'marketing' | 'pilot' | 'other'
export type Eligibility = '적격 가능' | '신보 확인 필요' | '별도 자금 권장'
export interface FundingItem {
  id: string
  name: string
  /** 원 */
  amount: number
  category: FundingCategory
  eligibility: Eligibility
  /** 보증신청 접수 뒤 12개월 안에 쓰는 비율 0~1 */
  firstYearShare: number
  phase?: string
  /** 별첨 소요자금 표의 줄 번호(0부터) */
  formRow?: number
  note?: string
}
export interface FundingPhase {
  id: string
  name: string
  desc?: string
  existing?: string
  newWork?: string
  months?: string
}
export type FundingRule = 'eligible' | 'eligible_plus_check' | 'cap_to_eligible'
export interface FundingOption {
  id: string
  name: string
  rule: FundingRule
  desc?: string
}
export interface Funding {
  /** 예비예산 총액 (원) */
  total: number
  /** 신청 검토 금액 (원) — 보증 신청금액과 같다는 뜻이 아님 */
  applyTarget: number
  items: FundingItem[]
  phases: FundingPhase[]
  options: FundingOption[]
  option: string
  /** 자기자금 (원) — 모르면 null */
  ownFunds: number | null
}

export interface Productivity {
  who: string
  task: string
  /** 기존 하루 업무 (분) — [적게, 많게] */
  beforeMin: [number, number]
  /** 도입 뒤 하루 업무 (분, 최대) */
  afterMax: number
  daysMonth: number
  daysYear: number
  /** 시간당 업무가치 가정 (원) */
  hourlyValue: number
  kind: Kind
  src?: string
  asOf?: string
  /** 더 확보할 실증자료 */
  evidenceTodo?: string[]
  /** 측정되지 않은 개선 (시간을 만들어 넣지 않음) */
  unmeasured?: string[]
}

export interface MarketStep {
  id: string
  label: string
  count: number | null
  kind: Kind
  src?: string
  asOf?: string
}

export interface Patch {
  /** 점으로 이은 경로 · `*` 는 모든 시나리오 · `{sel}` 은 고른 시나리오 · `select.scenario` 는 시나리오 선택 */
  path: string
  value: unknown
  op?: 'set' | 'mul'
}
export interface DecisionOption {
  id: string
  label: string
  summary?: string
  patch?: Patch[]
}
export interface DecisionCustom {
  kind: 'number' | 'numbers' | 'multi' | 'text'
  label?: string
  unit?: string
  /** number: 이 경로에 (값 × scale) 을 넣음 */
  path?: string
  scale?: number
  /** numbers: 칸마다 경로 */
  fields?: { id: string; label: string; unit?: string; path: string; scale?: number }[]
  /** multi: 고른 것 → 패치, 안 고른 것 → 패치 */
  choices?: { id: string; label: string; on?: Patch[]; off?: Patch[] }[]
}
export interface Decision {
  key: string
  no: number
  title: string
  question: string
  options: DecisionOption[]
  recommended?: string
  custom?: DecisionCustom
  reason?: string
  calc?: string
  prerequisites?: string[]
  risk?: string
  evidence?: string[]
  /** 영향을 받는 사업계획서 칸 */
  fields?: string[]
  qa?: string[]
}

export interface QAItem {
  id: string
  area: '시장' | '유료화' | 'B2B' | '기술' | '자금' | string
  question: string
  answer: string
  evidence: string[]
  gaps: string[]
  plan: string[]
  fields?: string[]
  decisions?: string[]
  /** 이 질문과 함께 보여 줄 계산값 (METRIC 이름) */
  metrics?: string[]
  status: '설명 가능' | '보완 필요' | '근거 부족'
}

export interface Source {
  id: string
  topic: string
  claim: string
  value?: string
  publisher?: string
  title?: string
  url?: string
  published?: string
  baseYear?: string
  scope?: string
  reliability?: string
  kind: Kind
}

export interface DraftTemplate {
  /** {{지표}} 를 계산값으로 바꿉니다 — 모르는 지표는 {{?이름}} 으로 남아 반영 전에 막힙니다 */
  text: string
  decisions: string[]
  note?: string
}

export interface Fact {
  id: string
  text: string
  kind: Kind
  src?: string
  asOf?: string
}

export interface StrategyModel {
  version: 1
  meta: {
    title: string
    asOf: string
    baseYear: number
    years: number[]
    /** 신보 접수 예정월 'YYYY-MM' — 비우면 작성일 칸 · 없으면 이번 달 */
    applicationMonth: string
    recommended: ScenarioId
    note?: string
  }
  segments: { legacy: string; saas: string; b2b: string }
  labels?: Record<string, ParamLabel>
  facts?: Fact[]
  legacy: { baseAmount: number; baseKind: Kind; method: 'cagr' | 'manual'; manual?: Record<string, number> }
  saasCatalog: { plans: PlanTier[]; options: PaidOption[]; setupTiers: SetupTier[]; overage?: { included: number; unit: number; price: number; confirmed: boolean; note?: string } }
  channels: { id: string; name: string }[]
  /** 추천 경로 id (추천 비용을 셀 때) */
  referralChannel?: string
  b2b: B2BSettings
  scenarios: Record<ScenarioId, Scenario>
  funding: Funding
  productivity: Productivity
  market: { steps: MarketStep[] }
  /** 기존 자료에 적혀 있던 숫자 (원 · 곳) — 계산으로 다시 확인합니다 */
  original?: Partial<Record<ScenarioId, { legacy?: number; saas?: number; b2b?: number; total?: number; saasAvg?: number; saasEnd?: number; saasArpu?: number; setupCount?: number; setupAvg?: number }>>
  decisions: Decision[]
  qa: QAItem[]
  research: Source[]
  drafts?: Record<string, DraftTemplate>
}

// ── 숫자 표시 ─────────────────────────────────────────────────────────────────
const comma = (n: number) => Math.round(n).toLocaleString('ko-KR')
export const won = (n: number) => `${comma(n)}원`
/** 억원 — 소수 둘째 자리 (원 단위에서 한 번만 반올림) */
export const eokNum = (n: number) => Math.round(n / 1e6) / 100
export const eok = (n: number) => `${eokNum(n).toFixed(2)}억`
/** 백만원 — 정수 */
export const mil = (n: number) => Math.round(n / 1e6)
export const man = (n: number) => {
  const v = Math.round(n / 1000) / 10
  return `${Number.isInteger(v) ? v : v.toFixed(1)}만`
}
export const pct = (r: number, d = 1) => `${(r * 100).toFixed(d)}%`
export const cnt = (n: number, d = 1) => {
  const v = Math.round(n * 10 ** d) / 10 ** d
  return Number.isInteger(v) ? String(v) : v.toFixed(d)
}

/** 반올림해 보여 준 부분의 합과 합계가 다르면 각주 문장 */
export function roundNote(parts: number[], total: number, unit: 'eok' | 'mil'): string | null {
  const f = unit === 'eok' ? (n: number) => eokNum(n) * 100 : mil
  const sum = parts.reduce((a, b) => a + f(b), 0)
  if (Math.round(sum) === Math.round(f(total))) return null
  return unit === 'eok'
    ? `표시 반올림 때문에 부문 합(${(sum / 100).toFixed(2)}억)과 합계(${eok(total)})가 0.01억 단위로 다릅니다 — 정밀 합계 ${won(total)}`
    : `표시 반올림 때문에 부문 합(${sum}백만원)과 합계(${mil(total)}백만원)가 다릅니다 — 정밀 합계 ${won(total)}`
}

// ── 월 ────────────────────────────────────────────────────────────────────────
/** 'YYYY-MM' 또는 'YYYY.MM' → 월 번호(년×12+월-1) */
export function ym(s: string | null | undefined): number | null {
  const m = String(s ?? '').match(/(20\d{2}|\d{2})\s*[.\-/년]\s*(\d{1,2})/)
  if (!m) return null
  let y = Number(m[1])
  if (y < 100) y += 2000
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return y * 12 + mo - 1
}
export const ymText = (n: number) => `${Math.floor(n / 12)}.${String((n % 12) + 1).padStart(2, '0')}`
export const ymKo = (n: number) => `${Math.floor(n / 12)}년 ${(n % 12) + 1}월`

// ── 경로 · 패치 ───────────────────────────────────────────────────────────────
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
function setPath(obj: Record<string, unknown>, parts: string[], value: unknown, op: 'set' | 'mul') {
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  const last = parts[parts.length - 1]
  if (op === 'mul') cur[last] = Number(cur[last] ?? 0) * Number(value)
  else cur[last] = clone(value)
}
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}
/** 패치를 적용한 새 모델 + 고른 시나리오 */
export function applyPatches(model: StrategyModel, sel: ScenarioId, patches: Patch[]): { model: StrategyModel; sel: ScenarioId } {
  const m = clone(model)
  let s = sel
  for (const p of patches) {
    if (p.path === 'select.scenario') {
      if (SCENARIO_IDS.includes(p.value as ScenarioId)) s = p.value as ScenarioId
      continue
    }
    const parts = p.path.split('.')
    const targets = parts[0] === 'scenarios' && (parts[1] === '*' || parts[1] === '{sel}') ? (parts[1] === '*' ? SCENARIO_IDS : [s]) : null
    if (targets) for (const t of targets) setPath(m as unknown as Record<string, unknown>, ['scenarios', t, ...parts.slice(2)], p.value, p.op ?? 'set')
    else setPath(m as unknown as Record<string, unknown>, parts.map((x) => (x === '{sel}' ? s : x)), p.value, p.op ?? 'set')
  }
  return { model: m, sel: s }
}

// ── 결정 ──────────────────────────────────────────────────────────────────────
export interface Pick {
  choice: string
  custom?: unknown
}
export const LATER = '추후 결정'
export const CUSTOM = 'custom'

/** 고른 안 → 패치 (직접 입력 포함) */
export function patchesFor(d: Decision, p: Pick | undefined): Patch[] {
  if (!p || p.choice === LATER) return []
  if (p.choice !== CUSTOM) return d.options.find((o) => o.id === p.choice)?.patch ?? []
  const c = d.custom
  if (!c) return []
  if (c.kind === 'number' && c.path) {
    const v = Number(p.custom)
    return Number.isFinite(v) ? [{ path: c.path, value: v * (c.scale ?? 1) }] : []
  }
  if (c.kind === 'numbers' && c.fields) {
    const vals = (p.custom ?? {}) as Record<string, unknown>
    return c.fields.flatMap((f) => {
      const v = Number(vals[f.id])
      return Number.isFinite(v) && vals[f.id] !== '' && vals[f.id] != null ? [{ path: f.path, value: v * (f.scale ?? 1) }] : []
    })
  }
  if (c.kind === 'multi' && c.choices) {
    const on = new Set(Array.isArray(p.custom) ? (p.custom as string[]) : [])
    return c.choices.flatMap((x) => (on.has(x.id) ? x.on ?? [] : x.off ?? []))
  }
  return []
}

/** 결정들을 순서대로(번호 순) 적용한 모델 */
export function effective(model: StrategyModel, picks: Record<string, Pick | undefined>, extra: Patch[] = [], sel: ScenarioId = model.meta.recommended): { model: StrategyModel; sel: ScenarioId } {
  const ds = [...model.decisions].sort((a, b) => a.no - b.no)
  const patches = ds.flatMap((d) => patchesFor(d, picks[d.key]))
  return applyPatches(model, sel, [...patches, ...extra])
}

/** 고르지 않은 결정은 추천안으로 채운 「미리보기용」 선택 */
export function withRecommended(model: StrategyModel, picks: Record<string, Pick | undefined>): Record<string, Pick> {
  const out: Record<string, Pick> = {}
  for (const d of model.decisions) {
    const p = picks[d.key]
    if (p && p.choice !== LATER) out[d.key] = p
    else if (d.recommended) out[d.key] = { choice: d.recommended }
  }
  return out
}

export interface DecisionRow {
  key: string
  profile_id: string
  name: string
  title: string
  choice: string | null
  custom: unknown
  note: string
  assump_rev: number
  at: string
}
export interface Decider {
  profile_id: string
  name: string
  title: string
}
export type DecisionState = '합의' | '의견 조율 필요' | '결정 대기' | '재확인 필요' | '추후 결정'
export const MIN_DECIDERS = 2

const sameCustom = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function resolveDecision(
  key: string,
  rows: DecisionRow[],
  deciders: Decider[],
  assumpRev: number,
): { state: DecisionState; agreed: Pick | null; people: { decider: Decider; row: DecisionRow | null; stale: boolean }[] } {
  const people = deciders.map((dc) => {
    const row = rows.find((r) => r.key === key && r.profile_id === dc.profile_id && r.choice) ?? null
    return { decider: dc, row, stale: !!row && row.assump_rev < assumpRev }
  })
  const live = people.filter((p) => p.row && !p.stale).map((p) => p.row as DecisionRow)
  const distinct = new Set(live.map((r) => `${r.choice}|${r.choice === CUSTOM ? JSON.stringify(r.custom ?? null) : ''}`))
  if (distinct.size > 1) return { state: '의견 조율 필요', agreed: null, people }
  //  결정할 분이 2명 이상일 때만 합의 — 한 분의 선택이 곧 합의가 되지 않게 (서버 bizplan_decision_agreed 와 같은 규칙)
  if (deciders.length >= MIN_DECIDERS && live.length === deciders.length) {
    const r = live[0]
    if (r.choice === LATER) return { state: '추후 결정', agreed: null, people }
    if (live.every((x) => x.choice === r.choice && (r.choice !== CUSTOM || sameCustom(x.custom, r.custom))))
      return { state: '합의', agreed: { choice: r.choice as string, custom: r.custom }, people }
  }
  if (live.some((r) => r.choice === LATER)) return { state: '추후 결정', agreed: null, people }
  if (people.some((p) => p.stale)) return { state: '재확인 필요', agreed: null, people }
  return { state: '결정 대기', agreed: null, people }
}

// ── 계산 결과 ─────────────────────────────────────────────────────────────────
export interface Funnel {
  contacts: number
  demos: number
  signups: number
  paid: number
}
export interface SaasYearResult {
  startCustomers: number
  newCustomers: number
  churned: number
  endCustomers: number
  avgCustomers: number
  avgPaying: number
  /** 월 고객매출 (원) — 요금제 비중 · 부가 기능 채택률로 계산 */
  arpu: number
  arpuBase: number
  arpuOptions: number
  sub: number
  opt: number
  setup: number
  setupBilled: number
  referral: number
  referred: number
  net: number
  funnel: Record<string, Funnel>
  unreachable: boolean
}
export interface B2BYearResult {
  goodsGmv: number
  serviceGmv: number
  gmv: number
  goodsDirect: number
  goodsBroker: number
  service: number
  ads: number
  revenue: number
  cogs: number
  grossProfit: number
  shipping: number
  paymentFee: number
  coupons: number
  ops: number
  contribution: number
  ar: number
  ap: number
  inventory: number
  nwc: number
  monthlyPurchase: number
}
export interface YearResult {
  year: number
  legacy: number
  saas: SaasYearResult
  b2b: B2BYearResult
  total: number
}
export interface Month {
  ym: number
  legacy: number
  saasSub: number
  saasOpt: number
  saasSetup: number
  saasReferral: number
  b2bDirect: number
  b2bBroker: number
  b2bService: number
  b2bAds: number
  b2bGmv: number
  active: number
  paying: number
}
export interface AppWindow {
  no: number
  from: number
  to: number
  legacy: number
  saas: number
  b2b: number
  total: number
  gmv: number
  avgPaying: number
  complete: boolean
  missingMonths: number
}
export interface FundingResult {
  total: number
  itemsSum: number
  byEligibility: Record<Eligibility, number>
  firstYear: number
  option: FundingOption | null
  guarantee: number
  guaranteeMax: number
  outside: number
  reduced: number
}
export interface ProductivityResult {
  saveMin: [number, number]
  rate: [number, number]
  monthHours: [number, number]
  yearHours: [number, number]
  value: [number, number]
}
export interface Warning {
  level: 'risk' | 'warn' | 'info'
  code: string
  msg: string
}
export interface Result {
  sel: ScenarioId
  scenario: Scenario
  model: StrategyModel
  base: number
  years: YearResult[]
  months: Month[]
  windows: AppWindow[] | null
  appMonth: number | null
  legacyGrowth: number
  funding: FundingResult
  productivity: ProductivityResult
  warnings: Warning[]
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const r0 = Math.round

function weights(timing: SaasYear['timing']): number[] {
  const ms = Array.from({ length: 12 }, (_, i) => i + 1)
  if (timing === 'front') return ms.map((m) => (13 - m) / 78)
  if (timing === 'back') return ms.map((m) => m / 78)
  return ms.map(() => 1 / 12)
}
const monthlyKeep = (annualChurn: number) => Math.pow(1 - Math.min(Math.max(annualChurn, 0), 0.999), 1 / 12)

export function arpuOf(model: StrategyModel, y: SaasYear): { base: number; options: number; total: number } {
  const plans = model.saasCatalog.plans
  const mixSum = sum(plans.map((p) => y.mix[p.id] ?? 0)) || 1
  const base = sum(plans.map((p) => ((y.mix[p.id] ?? 0) / mixSum) * p.price)) * (y.priceFactor ?? 1)
  const options = sum(model.saasCatalog.options.map((o) => (y.adoption[o.id] ?? 0) * o.price)) * (y.priceFactor ?? 1)
  return { base, options, total: base + options }
}

function funnelOf(model: StrategyModel, y: SaasYear, newCustomers: number): Record<string, Funnel> {
  const out: Record<string, Funnel> = {}
  for (const ch of model.channels) {
    const f = y.funnel[ch.id] ?? { demoRate: 0, signupRate: 0, paidRate: 0 }
    if (y.drive === 'funnel') {
      const contacts = y.contacts?.[ch.id] ?? 0
      const demos = contacts * f.demoRate
      const signups = demos * f.signupRate
      out[ch.id] = { contacts, demos, signups, paid: signups * f.paidRate }
    } else {
      const paid = newCustomers * (y.channelShare[ch.id] ?? 0)
      const signups = f.paidRate > 0 ? paid / f.paidRate : paid > 0 ? Infinity : 0
      const demos = f.signupRate > 0 ? signups / f.signupRate : signups > 0 ? Infinity : 0
      const contacts = f.demoRate > 0 ? demos / f.demoRate : demos > 0 ? Infinity : 0
      out[ch.id] = { contacts, demos, signups, paid }
    }
  }
  return out
}

/** 한 시나리오 계산 — 월별로 */
/** force = 결정 1(시나리오 선택)과 상관없이 sel0 시나리오로 (A · B · C 나란히 비교할 때) */
export function compute(model0: StrategyModel, sel0: ScenarioId, picks: Record<string, Pick | undefined> = {}, extra: Patch[] = [], fallbackAppMonth: number | null = null, force = false): Result {
  const eff = effective(model0, picks, extra, sel0)
  const model = eff.model
  const sel = force ? sel0 : eff.sel
  const sc = model.scenarios[sel]
  const years = model.meta.years
  const base = model.meta.baseYear
  const first = years[0]
  const last = years[years.length - 1]
  const warnings: Warning[] = []

  // 기존 사업 — 기준연도 추정에서 마지막 해 목표까지 연평균 성장(또는 직접 적은 값)
  const growth = model.legacy.baseAmount > 0 ? Math.pow(sc.legacyTarget / model.legacy.baseAmount, 1 / (last - base)) - 1 : 0
  const legacyOf = (y: number) => {
    if (y === base) return model.legacy.baseAmount
    if (model.legacy.method === 'manual' && model.legacy.manual?.[String(y)] != null && y !== last) return model.legacy.manual[String(y)]
    if (y === last) return sc.legacyTarget
    return model.legacy.baseAmount * Math.pow(1 + growth, y - base)
  }
  if (growth > 0.25) warnings.push({ level: 'risk', code: 'legacy_growth', msg: `${model.segments.legacy}: ${base}년 ${eok(model.legacy.baseAmount)} → ${last}년 ${eok(sc.legacyTarget)} 은 연평균 ${pct(growth)} 성장이 필요합니다 — 신규 거래처 · 차량 · 인력 계획과 함께 확인 필요` })

  // 월별 칸 — 기준연도 1월부터 마지막 해 12월까지
  const months: Month[] = []
  for (let y = base; y <= last; y++)
    for (let m = 0; m < 12; m++)
      months.push({ ym: y * 12 + m, legacy: legacyOf(y) / 12, saasSub: 0, saasOpt: 0, saasSetup: 0, saasReferral: 0, b2bDirect: 0, b2bBroker: 0, b2bService: 0, b2bAds: 0, b2bGmv: 0, active: 0, paying: 0 })
  const mIdx = (y: number, m: number) => (y - base) * 12 + m

  // SaaS — 가입 묶음(코호트)마다 이탈 · 무료 체험을 따라갑니다
  const cohorts: { size: number; age: number; trial: number }[] = [{ size: sc.saas.startCustomers, age: 999, trial: 0 }]
  if (sc.saas.startCustomers > 0) warnings.push({ level: 'info', code: 'saas_start', msg: `${first}년 초 유료고객 ${cnt(sc.saas.startCustomers)}곳에서 시작 — ${base}년 SaaS 매출은 0으로 둡니다` })
  const saasYears: SaasYearResult[] = []
  const refCh = model.referralChannel
  for (const y of years) {
    const sy = sc.saas.years[String(y)]
    const start = sum(cohorts.map((c) => c.size))
    const keep = monthlyKeep(sy.churnRate)
    const w = weights(sy.timing)
    const k12 = Math.pow(keep, 12)
    const reach = sum(w.map((wm, i) => wm * Math.pow(keep, 11 - i)))
    let n: number
    let unreachable = false
    if (sy.drive === 'funnel') {
      n = sum(Object.values(funnelOf(model, sy, 0)).map((f) => f.paid))
    } else {
      n = (sy.endTarget - start * k12) / reach
      if (n < 0) {
        unreachable = true
        n = 0
        warnings.push({ level: 'warn', code: 'saas_target_low', msg: `${y}년 연말 목표 ${cnt(sy.endTarget)}곳이 이탈만 반영한 고객 수(${cnt(start * k12)}곳)보다 적습니다 — 목표를 확인해 주세요` })
      }
    }
    const a = arpuOf(model, sy)
    let sub = 0
    let opt = 0
    let setup = 0
    let referral = 0
    let actSum = 0
    let paySum = 0
    const referredShare = sy.drive === 'funnel'
      ? (() => {
          const f = funnelOf(model, sy, 0)
          const tot = sum(Object.values(f).map((x) => x.paid))
          return refCh && tot > 0 ? (f[refCh]?.paid ?? 0) / tot : 0
        })()
      : refCh ? sy.channelShare[refCh] ?? 0 : 0
    for (let m = 0; m < 12; m++) {
      for (const c of cohorts) {
        c.size *= keep
        c.age += 1
      }
      const joined = n * w[m]
      cohorts.push({ size: joined, age: 0, trial: sy.trialMonths })
      const active = sum(cohorts.map((c) => c.size))
      const paying = sum(cohorts.filter((c) => c.age >= c.trial).map((c) => c.size))
      const row = months[mIdx(y, m)]
      row.active = active
      row.paying = paying
      row.saasSub = paying * a.base
      row.saasOpt = paying * a.options
      row.saasSetup = joined * sy.setupPaidShare * sy.setupAvgFee
      row.saasReferral = joined * referredShare * (sy.referral.referrerCost + sy.referral.refereeCost)
      sub += row.saasSub
      opt += row.saasOpt
      setup += row.saasSetup
      referral += row.saasReferral
      actSum += active
      paySum += paying
    }
    const end = sum(cohorts.map((c) => c.size))
    const res: SaasYearResult = {
      startCustomers: start,
      newCustomers: n,
      churned: start + n - end,
      endCustomers: end,
      avgCustomers: actSum / 12,
      avgPaying: paySum / 12,
      arpu: a.total,
      arpuBase: a.base,
      arpuOptions: a.options,
      sub: r0(sub),
      opt: r0(opt),
      setup: r0(setup),
      setupBilled: n * sy.setupPaidShare,
      referral: r0(referral),
      referred: n * referredShare,
      net: 0,
      funnel: funnelOf(model, sy, n),
      unreachable,
    }
    res.net = res.sub + res.opt + res.setup - res.referral
    for (const [ch, f] of Object.entries(res.funnel))
      if (!Number.isFinite(f.contacts)) warnings.push({ level: 'warn', code: 'funnel_rate', msg: `${y}년 ${model.channels.find((c) => c.id === ch)?.name ?? ch}: 전환율이 0이라 필요한 접촉 수를 계산할 수 없습니다` })
    saasYears.push(res)
  }

  // B2B — 연평균 숫자를 달마다 고르게 (근사)
  const b = model.b2b
  const d = b.structure === 'direct' ? 1 : b.structure === 'broker' ? 0 : Math.min(Math.max(b.directShare, 0), 1)
  const b2bYears: B2BYearResult[] = years.map((y) => {
    const by = sc.b2b.years[String(y)]
    const goods = b.core === 'services' ? 0 : 1
    const svc = b.core === 'goods' ? 0 : 1
    const goodsGmv = by.goodsHospitals * by.monthlySpend * 12 * goods
    const serviceGmv = by.serviceContracts * by.serviceAvg * svc
    const goodsDirect = goodsGmv * d
    const goodsBroker = goodsGmv * (1 - d) * b.brokerTakeRate
    const service = serviceGmv * by.serviceFeeRate
    const ads = by.adsRevenue
    const cogs = goodsDirect * (1 - b.grossMargin)
    const shipping = goodsDirect * b.shippingRate
    const paymentFee = goodsDirect * b.paymentFeeRate
    const coupons = goodsGmv * b.couponRate
    const ops = (goods ? by.goodsHospitals : 0) * b.opsCostPerHospitalMonth * 12 + (goodsGmv + serviceGmv + ads > 0 ? b.fixedOpsCostYear : 0)
    const ar = (goodsDirect / 365) * b.arDays
    const ap = (cogs / 365) * b.apDays
    const inventory = (cogs / 365) * b.inventoryDays
    for (let m = 0; m < 12; m++) {
      const row = months[mIdx(y, m)]
      row.b2bDirect = goodsDirect / 12
      row.b2bBroker = goodsBroker / 12
      row.b2bService = service / 12
      row.b2bAds = ads / 12
      row.b2bGmv = (goodsGmv + serviceGmv) / 12
    }
    const R = (x: number) => r0(x)
    const out: B2BYearResult = {
      goodsGmv: R(goodsGmv), serviceGmv: R(serviceGmv), gmv: R(goodsGmv + serviceGmv),
      goodsDirect: R(goodsDirect), goodsBroker: R(goodsBroker), service: R(service), ads: R(ads),
      revenue: 0, cogs: R(cogs), grossProfit: 0, shipping: R(shipping), paymentFee: R(paymentFee), coupons: R(coupons), ops: R(ops),
      contribution: 0, ar: R(ar), ap: R(ap), inventory: R(inventory), nwc: R(ar + inventory - ap), monthlyPurchase: R(cogs / 12),
    }
    out.revenue = out.goodsDirect + out.goodsBroker + out.service + out.ads
    out.grossProfit = out.revenue - out.cogs
    out.contribution = out.grossProfit - out.shipping - out.paymentFee - out.coupons - out.ops
    return out
  })
  const lastB = b2bYears[b2bYears.length - 1]
  if (lastB.nwc > 0) {
    const wc = model.funding.items.filter((i) => /운전|매입|working/i.test(`${i.name} ${i.note ?? ''}`)).reduce((a, i) => a + i.amount, 0)
    if (wc < lastB.nwc)
      warnings.push({ level: 'risk', code: 'b2b_working_capital', msg: `${last}년 상품 직접판매에 묶이는 운전자금(매출채권 + 재고 − 매입채무) 약 ${eok(lastB.nwc)} — 자금 계획에 상품 매입 운전자금이 ${wc > 0 ? eok(wc) + '뿐입니다' : '없습니다'}` })
  }
  if (b2bYears.some((x) => x.contribution < 0)) warnings.push({ level: 'warn', code: 'b2b_loss', msg: `${model.segments.b2b}: 매출이 있어도 운영비 · 배송 · 쿠폰을 빼면 손실인 해가 있습니다 (${years.filter((_, i) => b2bYears[i].contribution < 0).join(' · ')}년)` })

  const yearsOut: YearResult[] = years.map((y, i) => {
    const legacy = r0(legacyOf(y))
    return { year: y, legacy, saas: saasYears[i], b2b: b2bYears[i], total: legacy + saasYears[i].net + b2bYears[i].revenue }
  })

  // 신보 차년도 — 접수월 다음 달부터 12개월씩
  const appMonth = ym(model.meta.applicationMonth) ?? fallbackAppMonth
  let windows: AppWindow[] | null = null
  if (appMonth != null) {
    windows = [1, 2, 3].map((no) => {
      const from = appMonth + 1 + (no - 1) * 12
      const to = from + 11
      const rows = months.filter((m) => m.ym >= from && m.ym <= to)
      const legacy = r0(sum(rows.map((m) => m.legacy)))
      const saas = r0(sum(rows.map((m) => m.saasSub))) + r0(sum(rows.map((m) => m.saasOpt))) + r0(sum(rows.map((m) => m.saasSetup))) - r0(sum(rows.map((m) => m.saasReferral)))
      const b2bv = r0(sum(rows.map((m) => m.b2bDirect))) + r0(sum(rows.map((m) => m.b2bBroker))) + r0(sum(rows.map((m) => m.b2bService))) + r0(sum(rows.map((m) => m.b2bAds)))
      return {
        no, from, to, legacy, saas, b2b: b2bv, total: legacy + saas + b2bv,
        gmv: r0(sum(rows.map((m) => m.b2bGmv))),
        avgPaying: rows.length ? sum(rows.map((m) => m.paying)) / rows.length : 0,
        complete: rows.length === 12,
        missingMonths: 12 - rows.length,
      }
    })
    const short = windows.filter((x) => !x.complete)
    if (short.length) warnings.push({ level: 'warn', code: 'window_outside', msg: `신보 ${short.map((x) => x.no).join(' · ')}차년도 일부(${short.map((x) => x.missingMonths).join(' · ')}개월)가 계산 기간(${base}~${last}년) 밖입니다 — 그 달은 0으로 셉니다` })
  }

  // 기존 자료 숫자와 다시 계산한 숫자
  const org = model.original?.[sel]
  if (org) {
    const L = yearsOut[yearsOut.length - 1]
    const cmp = (label: string, a: number | undefined, bv: number, fmt: (n: number) => string, tol: number) => {
      if (a == null) return
      if (Math.abs(a - bv) > tol) warnings.push({ level: 'info', code: 'original_diff', msg: `${label}: 기존 자료 ${fmt(a)} · 다시 계산 ${fmt(bv)}` })
    }
    cmp(`${last}년 ${model.segments.saas} 매출`, org.saas, L.saas.net, eok, 5e5)
    cmp(`${last}년 ${model.segments.b2b} 매출`, org.b2b, L.b2b.revenue, eok, 5e5)
    cmp(`${last}년 전체 매출`, org.total, L.total, eok, 5e5)
    cmp(`${last}년 연평균 유료고객`, org.saasAvg, L.saas.avgPaying, (n) => `${cnt(n)}곳`, 0.5)
    cmp(`${last}년 연말 유료고객`, org.saasEnd, L.saas.endCustomers, (n) => `${cnt(n)}곳`, 0.5)
    cmp(`${last}년 월 고객매출`, org.saasArpu, L.saas.arpu, (n) => `${man(n)}원`, 1000)
    const share = sc.saas.years[String(last)]?.setupPaidShare ?? 0
    if (org.setupCount != null && org.setupCount > L.saas.newCustomers + 0.5)
      warnings.push({ level: 'warn', code: 'setup_count', msg: `기존 자료의 설정비 청구 ${org.setupCount}곳이 ${last}년 신규 가입(${cnt(L.saas.newCustomers)}곳)보다 많습니다 — 무료 가입 · 전년도 이탈과 맞지 않습니다` })
    else if (org.setupCount != null && L.saas.newCustomers > 0 && org.setupCount / L.saas.newCustomers > share + 0.05)
      warnings.push({ level: 'warn', code: 'setup_ratio', msg: `기존 자료의 설정비 청구 ${org.setupCount}곳 = ${last}년 신규 ${cnt(L.saas.newCustomers)}곳의 ${pct(org.setupCount / L.saas.newCustomers, 0)} — 유료 설정 비율 가정(${pct(share, 0)})보다 높아 무료 간편가입이 거의 없다는 뜻입니다` })
  }

  // 시장 — 유료 목표가 확인된 시장 숫자 안에 있는지
  const steps = model.market.steps
  const known = steps.filter((s) => s.count != null && s.id !== 'target')
  const endLast = yearsOut[yearsOut.length - 1].saas.endCustomers
  if (known.length === 0) warnings.push({ level: 'risk', code: 'market_unknown', msg: `수거업체 시장 규모가 확인되지 않았습니다 — ${last}년 유료고객 ${cnt(endLast, 0)}곳 목표의 점유율을 말할 수 없습니다` })
  else {
    const narrow = known[known.length - 1]
    if ((narrow.count ?? 0) > 0) {
      const share = endLast / (narrow.count as number)
      warnings.push({ level: share > 0.3 ? 'risk' : 'info', code: 'market_share', msg: `${last}년 유료고객 ${cnt(endLast, 0)}곳 = 「${narrow.label}」 ${comma(narrow.count as number)}곳의 ${pct(share)}` })
    }
  }

  // 자금
  const f = model.funding
  const itemsSum = sum(f.items.map((i) => i.amount))
  const byEl: Record<Eligibility, number> = { '적격 가능': 0, '신보 확인 필요': 0, '별도 자금 권장': 0 }
  for (const i of f.items) byEl[i.eligibility] += i.amount
  const option = f.options.find((o) => o.id === f.option) ?? null
  let guarantee = byEl['적격 가능']
  let guaranteeMax = byEl['적격 가능']
  if (option?.rule === 'eligible_plus_check') guaranteeMax = byEl['적격 가능'] + byEl['신보 확인 필요']
  if (option?.rule === 'cap_to_eligible') {
    guarantee = Math.min(f.applyTarget, byEl['적격 가능'])
    guaranteeMax = guarantee
  }
  guaranteeMax = Math.min(guaranteeMax, f.applyTarget)
  guarantee = Math.min(guarantee, f.applyTarget)
  if (itemsSum !== f.total) warnings.push({ level: 'warn', code: 'funding_sum', msg: `자금 항목 합계 ${eok(itemsSum)} ≠ 예비예산 ${eok(f.total)}` })
  const funding: FundingResult = {
    total: f.total,
    itemsSum,
    byEligibility: byEl,
    firstYear: r0(sum(f.items.map((i) => i.amount * i.firstYearShare))),
    option,
    guarantee,
    guaranteeMax,
    outside: itemsSum - guaranteeMax,
    reduced: Math.max(0, f.applyTarget - guaranteeMax),
  }
  if (byEl['신보 확인 필요'] > 0) warnings.push({ level: 'warn', code: 'funding_check', msg: `${eok(byEl['신보 확인 필요'])}은 보증 자금으로 인정되는지 신보 담당자 확인 전입니다 — 확인 없이 보증금액에 넣지 않습니다` })

  // 생산성 — 한 분의 해당 업무 시간 (회사 전체 효율이 아님)
  const p = model.productivity
  const saveMin: [number, number] = [p.beforeMin[0] - p.afterMax, p.beforeMin[1] - p.afterMax]
  const productivity: ProductivityResult = {
    saveMin,
    rate: [saveMin[0] / p.beforeMin[0], saveMin[1] / p.beforeMin[1]],
    monthHours: [(saveMin[0] * p.daysMonth) / 60, (saveMin[1] * p.daysMonth) / 60],
    yearHours: [(saveMin[0] * p.daysYear) / 60, (saveMin[1] * p.daysYear) / 60],
    value: [r0(((saveMin[0] * p.daysYear) / 60) * p.hourlyValue), r0(((saveMin[1] * p.daysYear) / 60) * p.hourlyValue)],
  }

  if (model.saasCatalog.overage && !model.saasCatalog.overage.confirmed)
    warnings.push({ level: 'info', code: 'overage_unconfirmed', msg: 'AI 사용량 초과요금은 실제 API 원가를 측정하기 전이라 매출에 넣지 않았습니다' })
  if (model.saasCatalog.options.some((o) => o.unitCost == null))
    warnings.push({ level: 'info', code: 'option_cost_unmeasured', msg: '부가 기능의 원가(AI API · 지도 API)는 아직 측정 전입니다 — 수익성은 매출만 보고 판단하지 않습니다' })

  return { sel, scenario: sc, model, base, years: yearsOut, months, windows, appMonth, legacyGrowth: growth, funding, productivity, warnings }
}

// ── 지표 — 심사 질문 · 초안 문장에 넣는 계산값 ───────────────────────────────
export function metrics(r: Result): Record<string, string> {
  const out: Record<string, string> = {}
  const m = r.model
  out['scenario.name'] = r.scenario.name
  out['scenario.id'] = r.sel
  out['seg.legacy'] = m.segments.legacy
  out['seg.saas'] = m.segments.saas
  out['seg.b2b'] = m.segments.b2b
  out['base.year'] = String(r.base)
  out['legacy.base'] = eok(m.legacy.baseAmount)
  out['legacy.growth'] = pct(r.legacyGrowth)
  for (const y of r.years) {
    const k = String(y.year)
    out[`total.${k}`] = eok(y.total)
    out[`legacy.${k}`] = eok(y.legacy)
    out[`saas.${k}`] = eok(y.saas.net)
    out[`b2b.${k}`] = eok(y.b2b.revenue)
    out[`saas.end.${k}`] = `${cnt(y.saas.endCustomers, 0)}곳`
    out[`saas.avg.${k}`] = `${cnt(y.saas.avgPaying)}곳`
    out[`saas.new.${k}`] = `${cnt(y.saas.newCustomers)}곳`
    out[`saas.arpu.${k}`] = won(y.saas.arpu)
    out[`saas.setup.${k}`] = eok(y.saas.setup)
    out[`saas.referral.${k}`] = won(y.saas.referral)
    out[`b2b.gmv.${k}`] = eok(y.b2b.gmv)
    out[`b2b.direct.${k}`] = eok(y.b2b.goodsDirect)
    out[`b2b.broker.${k}`] = eok(y.b2b.goodsBroker)
    out[`b2b.service.${k}`] = eok(y.b2b.service)
    out[`b2b.ads.${k}`] = eok(y.b2b.ads)
    out[`b2b.gross.${k}`] = eok(y.b2b.grossProfit)
    out[`b2b.contribution.${k}`] = eok(y.b2b.contribution)
    out[`b2b.nwc.${k}`] = eok(y.b2b.nwc)
    out[`b2b.purchase.${k}`] = eok(y.b2b.monthlyPurchase)
    const contacts = Object.values(y.saas.funnel).reduce((a, f) => a + f.contacts, 0)
    out[`saas.contacts.${k}`] = Number.isFinite(contacts) ? `${cnt(contacts, 0)}곳` : '계산 불가'
  }
  for (const w of r.windows ?? []) {
    out[`app.y${w.no}.period`] = `${ymText(w.from)} ~ ${ymText(w.to)}`
    out[`app.y${w.no}.total`] = `${mil(w.total)}백만원`
  }
  const p = r.productivity
  out['prod.save'] = `${p.saveMin[0]}~${p.saveMin[1]}분`
  out['prod.rate'] = `${pct(p.rate[0])}~${pct(p.rate[1])}`
  out['prod.yearHours'] = `${cnt(p.yearHours[0], 0)}~${cnt(p.yearHours[1], 0)}시간`
  out['prod.value'] = `${man(p.value[0])}~${man(p.value[1])}원`
  out['funding.total'] = eok(r.funding.total)
  out['funding.guarantee'] = r.funding.guarantee === r.funding.guaranteeMax ? eok(r.funding.guarantee) : `${eok(r.funding.guarantee)}~${eok(r.funding.guaranteeMax)}`
  out['funding.check'] = eok(r.funding.byEligibility['신보 확인 필요'])
  out['funding.firstYear'] = eok(r.funding.firstYear)
  for (const p of m.saasCatalog.plans) out[`price.${p.id}`] = won(p.price)
  for (const o of m.saasCatalog.options) out[`price.${o.id}`] = won(o.price)
  out['b2b.structure'] = m.b2b.structure === 'direct' ? '상품 직접판매(총액 매출)' : m.b2b.structure === 'broker' ? '상품 중개(수수료만 매출)' : `직접판매 ${pct(m.b2b.directShare, 0)} · 중개 ${pct(1 - m.b2b.directShare, 0)} 혼합`
  out['b2b.core'] = m.b2b.core === 'goods' ? '상품판매 중심' : m.b2b.core === 'services' ? '전문서비스 중심' : '상품 + 전문서비스'
  const share = r.warnings.find((w) => w.code === 'market_share')
  out['market.share'] = share ? share.msg : '시장 규모 미확인'
  return out
}
export const METRIC_HELP = '{{total.2029}} · {{saas.end.2029}} · {{b2b.gmv.2029}} · {{app.y1.total}} · {{prod.rate}} · {{funding.guarantee}} …'

export function render(text: string, mt: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = []
  const out = text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, k: string) => {
    if (mt[k] != null) return mt[k]
    missing.push(k)
    return `{{?${k}}}`
  })
  return { text: out, missing }
}

// ── 사업계획서 칸 초안 — 담당이 비교하고 반영합니다(자동으로 고치지 않음) ────────
export interface Draft {
  key: string
  kind: 'text' | 'table' | 'grid'
  value: string | Record<string, string>[] | Record<string, string>
  text: string
  decisions: string[]
  missing: string[]
  note?: string
}
const S = (n: number) => String(n)

export function drafts(r: Result): Draft[] {
  const m = r.model
  const out: Draft[] = []
  const NUM_DECISIONS = m.decisions.filter((d) => (d.fields ?? []).some((k) => k.startsWith('s11.plan') || k.startsWith('a.sales') || k === 'a.periods')).map((d) => d.key)
  const FUND_DECISIONS = m.decisions.filter((d) => (d.fields ?? []).some((k) => k.startsWith('s9.') || k.startsWith('a.funds'))).map((d) => d.key)
  const label = '사업화 목표 · 계약 확정 아님'

  if (r.windows) {
    const segRows = (w: AppWindow) => [
      { segment: m.segments.legacy, amount: S(mil(w.legacy)) },
      { segment: m.segments.saas, amount: S(mil(w.saas)) },
      { segment: m.segments.b2b, amount: S(mil(w.b2b)) },
    ]
    const rowsSum = (w: AppWindow) => mil(w.legacy) + mil(w.saas) + mil(w.b2b)
    for (const w of r.windows) {
      const basis = windowBasis(r, w)
      const rows = segRows(w).map((x, i) => ({ ...x, basis: basis[i] }))
      out.push({
        key: `s11.plan.y${w.no}`,
        kind: 'table',
        value: rows,
        text: rows.map((x) => `${x.segment} ${x.amount}백만원 — ${x.basis}`).join('\n'),
        decisions: NUM_DECISIONS,
        missing: [],
        note: w.complete ? undefined : `계산 기간 밖 ${w.missingMonths}개월은 0으로 셈`,
      })
      const tmpl = m.drafts?.[`s11.plan.y${w.no}_note`]
      const generic = `[${ymText(w.from)} ~ ${ymText(w.to)}] 합계 ${rowsSum(w)}백만원 (${label})\n` + rows.map((x) => `· ${x.segment}: ${x.basis}`).join('\n') + `\n· 의료기관 B2B 거래총액(GMV) ${mil(w.gmv)}백만원은 회사 매출이 아니며 위 매출에 넣지 않았습니다.`
      const rd = tmpl ? render(tmpl.text, metrics(r)) : { text: generic, missing: [] }
      out.push({ key: `s11.plan.y${w.no}_note`, kind: 'text', value: rd.text, text: rd.text, decisions: tmpl?.decisions ?? NUM_DECISIONS, missing: rd.missing })
    }
    const sl = { a: S(rowsSum(r.windows[0])), b: S(rowsSum(r.windows[1])), c: S(rowsSum(r.windows[2])) }
    out.push({ key: 's11.plan.sum_limit', kind: 'grid', value: sl, text: `Ⓐ ${sl.a} · Ⓑ ${sl.b} · Ⓒ ${sl.c} (백만원, 각 차년도 표의 부문 합)`, decisions: NUM_DECISIONS, missing: [] })
    const periods = Object.fromEntries(r.windows.map((w) => [`y${w.no}`, `${ymText(w.from)} ~ ${ymText(w.to)}`]))
    out.push({ key: 'a.periods', kind: 'grid', value: periods, text: r.windows.map((w) => `${w.no}차년도 ${periods[`y${w.no}`]}`).join(' · '), decisions: [], missing: [] })
    const st = Object.fromEntries(r.windows.map((w) => [`y${w.no}`, S(rowsSum(w))]))
    out.push({ key: 'a.sales_total', kind: 'grid', value: st, text: r.windows.map((w) => `${w.no}차년도 ${st[`y${w.no}`]}`).join(' · ') + ' (백만원)', decisions: NUM_DECISIONS, missing: [] })
    const items = [
      { item: m.segments.legacy, ...Object.fromEntries(r.windows.map((w) => [`y${w.no}`, S(mil(w.legacy))])) },
      { item: m.segments.saas, ...Object.fromEntries(r.windows.map((w) => [`y${w.no}`, S(mil(w.saas))])) },
      { item: m.segments.b2b, ...Object.fromEntries(r.windows.map((w) => [`y${w.no}`, S(mil(w.b2b))])) },
    ] as Record<string, string>[]
    out.push({ key: 'a.sales_items', kind: 'table', value: items, text: items.map((x) => `${x.item} ${x.y1} · ${x.y2} · ${x.y3}`).join('\n'), decisions: NUM_DECISIONS, missing: [] })
    const sb = Object.fromEntries(r.windows.map((w) => [`y${w.no}`, `${label} — ` + windowBasis(r, w).join(' / ')]))
    out.push({ key: 'a.sales_basis', kind: 'grid', value: sb, text: r.windows.map((w) => `${w.no}차년도: ${sb[`y${w.no}`]}`).join('\n'), decisions: NUM_DECISIONS, missing: [] })
  }

  // 연간 매출(회계기준) — 원본 서식은 기준연도부터 3개 연도
  const yearsForm = [r.base, r.base + 1, r.base + 2]
  const ann: Record<string, string> = {}
  for (const y of yearsForm) {
    if (y === r.base) ann[`y${y}`] = S(mil(m.legacy.baseAmount))
    else {
      const yr = r.years.find((x) => x.year === y)
      if (yr) ann[`y${y}`] = S(mil(yr.legacy) + mil(yr.saas.net) + mil(yr.b2b.revenue))
    }
  }
  out.push({ key: 's11.plan.sum_annual', kind: 'grid', value: ann, text: yearsForm.map((y) => `${y}년 ${ann[`y${y}`] ?? '—'}`).join(' · ') + ` (백만원 · ${r.base}년은 결산 전 ${m.legacy.baseKind}, 이후는 ${label})`, decisions: NUM_DECISIONS, missing: [] })

  // 자금 — 고른 자금 안 기준. 신보 확인이 필요한 금액은 보증신청에 넣지 않습니다
  const f = m.funding
  const rowLabels = 11
  const funds: Record<string, string>[] = Array.from({ length: rowLabels }, () => ({}))
  for (const i of f.items) {
    if (i.formRow == null || i.formRow < 0 || i.formRow >= rowLabels) continue
    const amt = mil(i.amount * i.firstYearShare)
    const prev = Number(funds[i.formRow].amount ?? 0)
    funds[i.formRow] = {
      amount: S(prev + amt),
      basis: [funds[i.formRow].basis, `${i.name} ${amt}백만원(${i.eligibility}${i.firstYearShare < 1 ? ` · 1차년도 ${pct(i.firstYearShare, 0)}` : ''})`].filter(Boolean).join(' · '),
    }
  }
  out.push({ key: 'a.funds', kind: 'table', value: funds, text: funds.map((x, i) => (x.amount ? `${i + 1}행 ${x.amount}백만원 — ${x.basis}` : '')).filter(Boolean).join('\n'), decisions: FUND_DECISIONS, missing: [], note: '금액은 견적 · 계약 근거로 다시 확인' })
  const firstYearSum = funds.reduce((a, x) => a + Number(x.amount ?? 0), 0)
  //  9번 운전자금 — 같은 금액을 네 줄 이내로 묶어서 (원본 표 4줄)
  const GROUPS: [string, FundingCategory[]][] = [
    ['연구개발 · 시스템 고도화', ['rnd', 'outsource', 'labor', 'infra']],
    ['마케팅 · 판로 개척', ['marketing']],
    ['고객 실증 · 초기 도입', ['pilot']],
    ['기타', ['other']],
  ]
  const working = GROUPS.map(([name, cats]) => {
    const its = f.items.filter((i) => cats.includes(i.category) && i.formRow != null)
    return { item: name, amount: S(its.reduce((a, i) => a + mil(i.amount * i.firstYearShare), 0)) }
  }).filter((x) => x.amount !== '0')
  out.push({ key: 's9.working', kind: 'table', value: working, text: working.map((x) => `${x.item} ${x.amount}백만원`).join(' · '), decisions: FUND_DECISIONS, missing: [], note: '별첨 1차년도 소요자금과 같은 합계' })
  const g = mil(r.funding.guarantee)
  const own = f.ownFunds == null ? null : mil(f.ownFunds)
  const fundingGrid: Record<string, string> = {
    loan: S(g),
    loan_how: '신용보증기금 보증부 대출',
    guarantee: S(g),
    guarantee_how: r.funding.guaranteeMax > r.funding.guarantee ? `신보 확인 뒤 최대 ${mil(r.funding.guaranteeMax)}백만원까지` : '이번 보증신청분',
  }
  if (own != null) {
    fundingGrid.own = S(own)
    fundingGrid.own_how = '자기자금'
  }
  const rest = firstYearSum - g - (own ?? 0)
  if (rest < 0) r.warnings.push({ level: 'warn', code: 'funding_over', msg: `보증 검토액 + 자기자금이 1차년도 소요자금(${firstYearSum}백만원)보다 많습니다 — (A)=(B) 확인` })
  if (rest > 0) {
    fundingGrid.etc = S(rest)
    fundingGrid.etc_how = '조달 방법 확인 필요 (자기자금 · 별도 사업화 자금)'
  }
  out.push({ key: 's9.funding', kind: 'grid', value: fundingGrid, text: Object.entries(fundingGrid).map(([k, v]) => `${k} ${v}`).join(' · '), decisions: FUND_DECISIONS, missing: [], note: '(A)=(B) — 9번 자금소요 합계와 맞는지 확인' })

  // 글 칸 — 모델 자료의 초안 문장(지표를 계산값으로 바꿈)
  const mt = metrics(r)
  for (const [key, t] of Object.entries(m.drafts ?? {})) {
    if (out.some((x) => x.key === key)) continue
    const rd = render(t.text, mt)
    out.push({ key, kind: 'text', value: rd.text, text: rd.text, decisions: t.decisions, missing: rd.missing, note: t.note })
  }
  return out
}

function windowBasis(r: Result, w: AppWindow): string[] {
  const m = r.model
  const rows = r.months.filter((x) => x.ym >= w.from && x.ym <= w.to)
  const sub = sum(rows.map((x) => x.saasSub))
  const opt = sum(rows.map((x) => x.saasOpt))
  const setup = sum(rows.map((x) => x.saasSetup))
  const ref = sum(rows.map((x) => x.saasReferral))
  const direct = sum(rows.map((x) => x.b2bDirect))
  const broker = sum(rows.map((x) => x.b2bBroker))
  const svc = sum(rows.map((x) => x.b2bService))
  const ads = sum(rows.map((x) => x.b2bAds))
  const avgPay = w.avgPaying
  const monthsN = rows.length
  return [
    `${r.base}년 추정 ${eok(m.legacy.baseAmount)}에서 연평균 ${pct(r.legacyGrowth)} 성장 가정 (${m.legacy.baseKind})`,
    `월평균 유료고객 ${cnt(avgPay)}곳 × ${monthsN}개월 · 구독 ${mil(sub)} + 부가기능 ${mil(opt)} + 설정비 ${mil(setup)} − 추천할인 ${mil(ref)} (백만원)`,
    `상품 직접판매(총액) ${mil(direct)} · 상품 중개수수료 ${mil(broker)} · 서비스 수수료 ${mil(svc)} · 입점·광고 ${mil(ads)} (백만원) — 거래총액 ${mil(w.gmv)}백만원은 매출 아님`,
  ]
}

/** 결정 안마다 영향 — 그 안으로 바꾸면 마지막 해 매출 · 3년 합 · B2B 기여이익 · 보증 검토액이 어떻게 되는지 */
export interface Impact {
  total: number
  sum3: number
  contribution: number
  guarantee: number
}
export function impactOf(model: StrategyModel, picks: Record<string, Pick | undefined>, override?: { key: string; pick: Pick }, appFallback: number | null = null): Impact {
  const p = { ...withRecommended(model, picks) }
  if (override) p[override.key] = override.pick
  const r = compute(model, model.meta.recommended, p, [], appFallback)
  const L = r.years[r.years.length - 1]
  return { total: L.total, sum3: sum(r.years.map((y) => y.total)), contribution: L.b2b.contribution, guarantee: r.funding.guarantee }
}

/** 화면에 보이는 결정의 근거 숫자 — 저장할 때 함께 남겨, 나중에 숫자가 바뀌면 비교합니다 */
export function basisOf(model: StrategyModel, d: Decision, pick: Pick, picks: Record<string, Pick | undefined>, appFallback: number | null = null): Record<string, string> {
  const i = impactOf(model, picks, { key: d.key, pick }, appFallback)
  return { 마지막해매출: eok(i.total), 삼년합: eok(i.sum3), B2B기여이익: eok(i.contribution), 보증검토액: eok(i.guarantee) }
}

// ── 모델 모양 검사 — 담당이 고친 자료를 저장하기 전에 ───────────────────────────
export function validate(model: StrategyModel): string[] {
  const e: string[] = []
  if (!model || model.version !== 1) return ['모델 자료의 판(version)이 1이 아닙니다.']
  if (!Array.isArray(model.meta?.years) || model.meta.years.length < 1) e.push('meta.years 가 비었습니다.')
  for (const id of SCENARIO_IDS) {
    const sc = model.scenarios?.[id]
    if (!sc) {
      e.push(`시나리오 ${id} 가 없습니다.`)
      continue
    }
    for (const y of model.meta.years ?? []) {
      if (!sc.saas?.years?.[String(y)]) e.push(`시나리오 ${id} · ${y}년 SaaS 가정이 없습니다.`)
      if (!sc.b2b?.years?.[String(y)]) e.push(`시나리오 ${id} · ${y}년 B2B 가정이 없습니다.`)
      const sy = sc.saas?.years?.[String(y)]
      if (sy) {
        const mix = sum(Object.values(sy.mix ?? {}))
        if (Math.abs(mix - 1) > 0.001) e.push(`시나리오 ${id} · ${y}년 요금제 비중 합이 ${pct(mix)} 입니다 (100%여야 함).`)
        if (sy.drive === 'target') {
          const ch = sum(Object.values(sy.channelShare ?? {}))
          if (Math.abs(ch - 1) > 0.001) e.push(`시나리오 ${id} · ${y}년 유입 경로 비중 합이 ${pct(ch)} 입니다 (100%여야 함).`)
        }
        for (const [k, v] of Object.entries(sy.adoption ?? {})) if (v < 0 || v > 1) e.push(`시나리오 ${id} · ${y}년 ${k} 채택률이 0~100% 밖입니다.`)
        if (sy.churnRate < 0 || sy.churnRate >= 1) e.push(`시나리오 ${id} · ${y}년 이탈률이 0~100% 밖입니다.`)
      }
    }
  }
  const keys = new Set<string>()
  for (const d of model.decisions ?? []) {
    if (keys.has(d.key)) e.push(`결정 「${d.key}」가 두 번 있습니다.`)
    keys.add(d.key)
    if (!/^[a-z0-9_]{1,40}$/.test(d.key)) e.push(`결정 이름 「${d.key}」는 영문 소문자 · 숫자 · _ 만 씁니다.`)
    if (!d.options?.length) e.push(`결정 「${d.title}」에 안이 없습니다.`)
    if (d.recommended && !d.options.some((o) => o.id === d.recommended)) e.push(`결정 「${d.title}」 추천안 ${d.recommended} 가 안 목록에 없습니다.`)
  }
  return e
}
