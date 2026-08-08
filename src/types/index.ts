// ─────────────────────────────────────────────────────────────────────────────
// 도메인 타입 정의
//
// 추후 Supabase 로 이전 시 각 인터페이스가 곧 테이블 스키마가 되도록
// 개념을 명확히 분리해 두었습니다. (id 는 현재 string UUID 형태)
// ─────────────────────────────────────────────────────────────────────────────

/** 폐기물 구분 */
export type WasteType = '의료폐기물' | '일회용기저귀'

/** 거래처 유형 */
export type ClientType =
  | '병원'
  | '요양병원'
  | '의원'
  | '장례식장'
  | '요양원'
  | '치과'
  | '한의원'
  | '한방병원'

/** 자재 보관창고 크기 */
export type StorageSize = '큼' | '보통' | '작음'

/** 수거일정 상태 */
export type ScheduleStatus = '예정' | '완료' | '지연' | '긴급'

/** 입금상태 */
export type PaymentStatus = '입금완료' | '미수금' | '확인필요'

/** 결제방식 */
export type PaymentMethod = '무통장' | '카드요청' | '기타'

/** 처리장 인계 상태 (수거 완료 → 인계 대기 → 인계 완료) */
export type HandoverStatus = '수거 완료' | '인계 대기' | '인계 완료'

/** 병원 요청 처리 상태 */
export type RequestStatus = '접수' | '확인 중' | '일정 반영' | '처리 완료'

// ── 병원 요청 (v7) ───────────────────────────────────────────────────────────
// 이전에는 화면용 파생값(규칙으로 만들어 낸 예시)이었습니다.
// v7부터는 병원 담당자가 직접 올리거나 비원미래가 대신 접수한 '실제 기록'입니다.
//  · 병원 포털에서 등록 → 비원미래 오늘 일정·요청 화면에 즉시 표시
//  · 수거 완료 입력 시 관련 요청이 자동으로 '처리 완료'로 닫힙니다
//  · 회신(reply)은 병원 포털에서 그대로 보입니다

/** 요청 유형 — 각 유형이 비원미래의 어떤 업무·매출로 이어지는지와 1:1 대응됩니다. */
export type RequestKind = '긴급수거' | '추가수거' | '소모품' | '교육·자료' | '기타'

export const REQUEST_KINDS: RequestKind[] = ['긴급수거', '추가수거', '소모품', '교육·자료', '기타']

/** 요청 등록 주체 — 병원 포털 / 비원미래 대행 접수(전화·카톡) */
export type RequestSource = 'portal' | 'staff'

export interface ClientRequest {
  id: string
  clientId: string
  clientName: string
  kind: RequestKind
  content: string
  /** 희망일 (YYYY-MM-DD) — 없으면 null */
  desiredDate: string | null
  urgent: boolean
  status: RequestStatus
  source: RequestSource
  /** 등록한 사람 이름 (병원 담당자 또는 접수한 직원) */
  requesterName: string
  /** 비원미래 회신 — 병원 포털에 그대로 보입니다 */
  reply: string
  handledBy: string | null
  handledAt: string | null
  createdAt: string
  demoSessionId?: string | null
}

/** 수거 이벤트 작업 주체 (Demo — 실제 적용 시 사용자별 계정 연동 예정) */
export type EventRole = '관리자' | '현장 담당자' | '대표자(Demo)'

/** 용기별 배출 수량 — 한 번의 수거에서 배출된 전용 용기 집계 */
export interface ContainerBreakdown {
  corrugated: number // 골판지 전용박스
  plastic: number // 합성수지 전용용기
  bag: number // 전용 봉투
  etc: number // 기타
}

/** 사무실(창고) 자재 재고 — 자재 동시공급 시 차감되는 물리 재고 */
export interface OfficeStock {
  corrugatedBox: number // 골판지 전용박스
  plasticContainer: number // 합성수지 전용용기
  bag: number // 전용 봉투(비닐)
  needleBox: number // 합성수지 바늘통
}

// ── 거래처 ───────────────────────────────────────────────────────────────────
export interface Client {
  id: string
  name: string // 거래처명
  type: ClientType // 유형
  address: string // 주소
  manager: string // 담당자
  phone: string // 연락처
  collectionCycle: string // 수거주기 (예: 주 2회, 월 1회)
  collectsMedicalWaste: boolean // 의료폐기물 수거 여부
  collectsDiaper: boolean // 일회용기저귀 수거 여부
  storageSize: StorageSize // 자재 보관창고 크기
  note: string // 특이사항
  isDemoGenerated: boolean // true=시연용 확장 거래처, false=실제 주요거래처

  // ── v8: 계약·정산 (실제 거래처 관리 엑셀을 흡수) ──
  // 매월 같은 값을 다시 적지 않도록 거래처에 한 번만 정해 둡니다.
  /** 계약 시작일 (YYYY-MM-DD) */
  contractStart?: string | null
  /** 계약 종료일 — 만료 알림의 근거가 됩니다 */
  contractEnd?: string | null
  /** 결제조건 문구 (예: 익월 20일 현금) — 거래명세서에 그대로 나갑니다 */
  paymentTerms?: string
  /** 결제일 규칙 — 익월 며칠. 예: 20 → 익월 20일 */
  paymentDueDay?: number | null
  /** 월정액 계약이면 금액 (kg 단가 대신 쓰는 거래처용). 없으면 null */
  monthlyFlatFee?: number | null
  /** 품목별 단가. 없는 품목은 기본 단가를 씁니다 (lib/billing.ts) */
  pricing?: Record<string, { sale?: number | null; cost?: number | null }>
}

// ── 차량 ─────────────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string
  name: string // 차량명
  wasteType: WasteType // 폐기물 구분
  tonnage: number // 톤수
  nominalCapacity: number // 명목 적재량 (kg)
  expectedCapacity: number // 실제 예상 적재량 (kg)
  driver: string // 담당자
}

// ── 수거일정 ─────────────────────────────────────────────────────────────────
export interface Schedule {
  id: string
  date: string // 날짜 (YYYY-MM-DD)
  clientId: string // 거래처
  wasteType: WasteType // 폐기물 구분
  vehicleId: string // 담당 차량
  scheduledTime: string // 예정 시간 (HH:mm)
  status: ScheduleStatus // 상태
  expectedAmount: number // 예상 수거량 (kg)
  actualAmount: number | null // 실제 수거량 (kg) — 미입력 시 null
  completedAt: string | null // 수거 완료 시간 (ISO) — 미완료 시 null
  memo: string // 메모
  // ── v2: 현장 입력 연결(3단계) 필드 — 기존 데이터는 마이그레이션에서 기본값으로 채움 ──
  actualTime?: string // 실제 수거 시간 (HH:mm) — 예정시간과 별도
  containers?: ContainerBreakdown // 용기별 배출 수량
  driverName?: string // 실제 수거 기사 (차량 기본 기사와 다를 수 있음)
  handoverStatus?: HandoverStatus // 처리장 인계 상태
  handoverAt?: string | null // 처리장 인계 완료 시간 (ISO)
  eventId?: string | null // 이 완료를 생성/처리한 수거 이벤트 id
  origin?: RecordOrigin // 데이터 출처 (seed/field/demo/migrated/system)
}

/** 데이터 출처 구분 — 시연 초기화 시 보존/정리 대상을 구분하는 데 사용 */
export type RecordOrigin = 'seed' | 'field' | 'demo' | 'migrated' | 'system'

// ── 자재공급 ─────────────────────────────────────────────────────────────────
export interface MaterialSupply {
  id: string
  date: string // 날짜 (YYYY-MM-DD)
  clientId: string // 거래처
  boxCount: number // 박스 수량 (규격 합계 — 기존 화면·통계 호환용)
  vinylCount: number // 비닐 수량
  needleBoxCount: number // 합성수지 바늘통 수량
  isAdditionalRequest: boolean // 추가요청 여부
  memo: string // 메모
  /**
   * 규격별 공급 수량 (v8). 예: { box63: 180, box12: 400, plastic20: 30 }
   * 정산·거래명세서는 이 값을 씁니다. 단가가 규격마다 다르기 때문입니다.
   * 이 필드가 생기기 전 기록은 위 3칸에서 대표 규격으로 읽습니다.
   */
  items?: Record<string, number>
}

// ── 결제관리 ─────────────────────────────────────────────────────────────────
export interface Payment {
  id: string
  clientId: string // 거래처
  billingMonth: string // 청구월 (YYYY-MM)
  amount: number // 청구금액 (원)
  status: PaymentStatus // 입금상태
  method: PaymentMethod // 결제방식
  paidAt: string | null // 입금 완료 시간 (ISO) — 미입금 시 null
  memo: string // 메모
}

// ── 병원 요청 상태 오버라이드 (자동 처리 결과 영속화) ────────────────────────
export interface RequestOverride {
  requestId: string // clientRequests 파생 id (req1..)
  status: RequestStatus
  changedAt: string // ISO
  by: string // 처리 근거 (예: '수거 완료 자동 반영')
}

// ── 수거 이벤트 (감사기록 + 되돌리기 원장) ───────────────────────────────────
// 한 번의 수거 완료 입력이 어떤 데이터를 바꿨는지 기록해 취소(rollback)와
// 입력 이력(audit)에 사용합니다. 실제 적용 시 사용자별 계정·수정이력과 연동 예정.
export interface CollectionEvent {
  id: string // collectionEventId
  at: string // ISO 처리 시각
  role: EventRole // 작업 주체 (Demo)
  screen: string // 입력 화면 (수거 입력 / 오늘 일정 등)
  action: '수거 완료' | '완료 취소'
  scheduleId: string // 연결된 수거일정
  createdSchedule: boolean // true=직접 입력으로 새 일정 생성 / false=기존 예정 완료
  clientId: string
  clientName: string
  wasteType: WasteType
  amountKg: number
  before: {
    status: ScheduleStatus
    actualAmount: number | null
    handoverStatus: HandoverStatus | null
  }
  materialIds: string[] // 이 이벤트로 생성된 자재공급 id (취소 시 제거)
  stockBefore: OfficeStock // 차감 전 재고 (취소 시 복원)
  requestUpdates: { requestId: string; from: RequestStatus; to: RequestStatus }[]
  note: string
  reverted: boolean // 취소됨 여부 (기록은 유지)
  revertedAt?: string | null
  demoSessionId?: string | null // 시연 세션 중 생성된 기록이면 세션 id (초기화 대상 구분)
  // ── v4: 성과측정용 시스템 측정값 ──
  // 수거 입력 화면 진입 → 저장 버튼까지의 실제 경과시간(ms).
  // 화면을 켜둔 채 방치한 경우 등 왜곡이 있을 수 있어 '시스템 측정값'으로만 표시하고,
  // 집계 시 이상치(INPUT_SESSION_MAX_MS 초과)는 제외합니다.
  inputDurationMs?: number | null
}

/** 입력 처리시간 집계 유효 범위 — 이 범위를 벗어난 표본은 왜곡으로 보고 제외합니다.
 *  · 상한 30분: 입력 화면을 켜둔 채 방치한 경우
 *  · 하한 20초: 실제 현장 입력(거래처·구분·수거량·용기·차량·인계 선택)이 물리적으로
 *    불가능한 시간. 테스트 입력이나 오조작으로 보고 제외합니다. */
export const INPUT_SESSION_MAX_MS = 30 * 60 * 1000
export const INPUT_SESSION_MIN_MS = 20 * 1000

// ── 현장 메모 / 특이사항 ─────────────────────────────────────────────────────
// 현장에서 수기로 적거나 담당자가 기억하던 병원별 유의사항을 한 번 기록해두면
// 오늘 일정·수거 입력·대시보드 등 관련 업무 화면에서 함께 확인됩니다.
export type NoteKind = '수거요청' | '연락' | '주의' | '자재' | '기타'

export interface SiteNote {
  id: string
  clientId: string
  kind: NoteKind
  content: string
  createdAt: string // ISO
  /** 처리 완료 여부 — 완료된 메모는 목록 하단으로 내려갑니다 */
  done: boolean
}

// ── 시연 세션 (실사 당일 동일 초기 상태 복원용) ──────────────────────────────
export interface DemoSession {
  id: string
  startedAt: string // ISO
  active: boolean
}

// ── 전체 데이터 컨테이너 (localStorage 직렬화 단위) ──────────────────────────
export interface AppData {
  clients: Client[]
  vehicles: Vehicle[]
  schedules: Schedule[]
  materials: MaterialSupply[]
  payments: Payment[]
  // ── v2 (3단계) ──
  officeStock: OfficeStock // 사무실 자재 재고
  events: CollectionEvent[] // 수거 입력 이벤트/감사기록
  requestOverrides: RequestOverride[] // 병원 요청 자동 처리 결과
  // ── v2.5 (3.5단계 시연 안정화) ──
  demoSession?: DemoSession | null // 현재 시연 세션 (초기화 기준)
  // ── v3: 병원별 현장 메모 (없으면 마이그레이션에서 빈 배열로 채움) ──
  notes: SiteNote[]
  // ── v4: AX 실증·성과측정 (없으면 마이그레이션에서 기본값으로 채움) ──
  baseline: BaselineMetrics // 도입 전 기준값 (사용자 입력)
  experiment: ExperimentConfig // 실증 기간 설정
  // ── v5: 매출 전환 실증 (추천 → 제안 → 수락 → 실제 매출) ──
  leads: SalesLead[]
  // ── v7: 병원 고객 서비스 — 병원이 직접 올린 요청 (없으면 빈 배열) ──
  requests: ClientRequest[]
}

// ── 매출 전환 실증 (v5) ──────────────────────────────────────────────────────
// 데이터 기반 추천이 실제 영업 행동과 매출로 이어졌는지 기록합니다.
// 추천 자체는 파생값(nextActionsFor)이므로 저장하지 않고, '영업 진행상태'만
// 안정 키(clientId::kind::month)로 붙여 둡니다.
//
// Supabase 이전 시 sales_leads 테이블 1행 = SalesLead 1건, history 는 JSONB
// 또는 sales_lead_events 자식 테이블로 그대로 옮길 수 있는 형태입니다.

/** 영업 진행상태 */
export type LeadStage = '추천' | '제안' | '수락' | '보류' | '미전환'

export const LEAD_STAGES: LeadStage[] = ['추천', '제안', '수락', '보류', '미전환']

/** 상태 변경 이력 1건 */
export interface LeadStageChange {
  stage: LeadStage
  at: string // ISO
}

export interface SalesLead {
  id: string
  /** 추천 식별 키 — `${clientId}::${kind}::${YYYY-MM}` (추천은 매달 재산출되므로 월 단위) */
  key: string
  clientId: string
  clientName: string
  /** 추천 유형 — NextActionKind 와 동일 문자열 */
  kind: string
  /** 추천 제목 (기록 시점 값) */
  title: string
  month: string // YYYY-MM
  /** 추천 시점의 예상 매출(원). 실제 매출과 반드시 구분해 표시합니다. */
  estValue: number
  stage: LeadStage
  /** 실제 매출(원) — 수락 건에만 입력. null = 아직 입력되지 않음(0원과 구분) */
  actualRevenue: number | null
  actualRevenueAt: string | null
  history: LeadStageChange[]
  createdAt: string
  /** 시연 세션 중 생성된 기록이면 세션 id (시연용 표시 + 초기화 대상 구분) */
  demoSessionId?: string | null
  // ── v7: 병원 고객에게 실제로 전달된 제안인지 ──
  // 이전에는 '제안'이 담당자의 자기 기록이었습니다. 이제 병원 포털로 전달되고
  // 병원 담당자가 직접 수락/보류하므로, '수락'이 실제 고객 행동이 됩니다.
  /** 병원 포털에 공유되었는지 */
  sharedWithClient?: boolean
  sharedAt?: string | null
  /** 병원에 보여줄 제안 설명 */
  clientMessage?: string
  /** 병원이 응답한 시각 (수락/보류) */
  clientRespondedAt?: string | null
}

// ── AX 실증 · 성과측정 (v4) ──────────────────────────────────────────────────
// 정책자금·신용보증기금 심사에서 "도입 전 대비 얼마나 좋아졌는가"를 실제 데이터로
// 제시하기 위한 구조입니다. 도입 전 값은 반드시 사용자가 입력하고(임의 생성 금지),
// 도입 후 값은 실제 수거 입력 이벤트에서만 산출합니다.
//
// 서버 DB(Supabase) 이전을 염두에 두고 두 개의 평면 레코드로 분리했습니다.
//  · baseline    → baseline_metrics 테이블 1행
//  · experiment  → experiment_config 테이블 1행
//  · 측정 원천    → CollectionEvent (이미 존재하는 감사기록)에 소요시간만 추가

/** 기준값 출처 — 사용자가 직접 입력한 값인지, 시연용 예시값인지 구분합니다. */
export type BaselineSource = 'user' | 'demo'

/** 도입 전 업무 기준값 (모두 사용자 입력. 미입력은 null 로 두고 '기준값 입력 필요'로 표시) */
export interface BaselineMetrics {
  adminMinutesPerCollection: number | null // 수거 1건 처리 후 행정업무 소요시간 (분)
  repeatEntriesPerCollection: number | null // 동일 정보 반복 입력 횟수 (회)
  monthlyDocHours: number | null // 수거대장·명세 등 월간 문서 작성시간 (시간)
  monthlyReworkCount: number | null // 월간 누락·재확인 발생 건수 (건)
  dailyCapacity: number | null // 하루 평균 처리 건수 (건)
  source: BaselineSource // 'user' = 직접 입력 / 'demo' = 시연용 예시값
  updatedAt: string | null // ISO
}

/** 실증 설정 — 이 날짜 이후의 입력만 '도입 후' 성과로 집계합니다. */
export interface ExperimentConfig {
  startDate: string | null // YYYY-MM-DD (미설정이면 전체 기간)
}

/** 기준값 미입력 상태 — 시스템이 임의 값을 만들지 않음을 명시합니다. */
export const EMPTY_BASELINE: BaselineMetrics = {
  adminMinutesPerCollection: null,
  repeatEntriesPerCollection: null,
  monthlyDocHours: null,
  monthlyReworkCount: null,
  dailyCapacity: null,
  source: 'user',
  updatedAt: null,
}

/** 시연용 예시 기준값 — 사용자가 버튼으로 명시적으로 채울 때만 사용 (source='demo') */
export const DEMO_BASELINE: BaselineMetrics = {
  adminMinutesPerCollection: 18,
  repeatEntriesPerCollection: 5,
  monthlyDocHours: 12,
  monthlyReworkCount: 8,
  dailyCapacity: 9,
  source: 'demo',
  updatedAt: null,
}

export const EMPTY_EXPERIMENT: ExperimentConfig = { startDate: null }

/**
 * 데이터가 아직 하나도 없는 상태.
 *
 * 실사용(live) 모드에서 서버 응답을 기다리는 동안 화면에 무엇을 보여줄지의
 * 기준입니다. 이 자리에 시연 데이터를 두면 존재하지 않는 병원과 일정이
 * 실제 데이터처럼 보이고, 불러오기가 실패하면 그대로 남습니다.
 * 그래서 서버가 원본인 동안에는 "비어 있음"에서 시작합니다.
 */
export const EMPTY_APP_DATA: AppData = {
  clients: [],
  vehicles: [],
  schedules: [],
  materials: [],
  payments: [],
  officeStock: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  events: [],
  requestOverrides: [],
  demoSession: null,
  notes: [],
  baseline: EMPTY_BASELINE,
  experiment: EMPTY_EXPERIMENT,
  leads: [],
  requests: [],
}

/** 저장 스키마 버전 (마이그레이션 판단용) */
export const SCHEMA_VERSION = 2

/** v2 초기 사무실 재고 (시연용 기본값 — 자재 동시공급 시 차감) */
export const DEFAULT_OFFICE_STOCK: OfficeStock = {
  corrugatedBox: 480,
  plasticContainer: 360,
  bag: 900,
  needleBox: 300,
}
