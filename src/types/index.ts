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
  origin?: 'seed' | 'field' // seed=시드·자동생성, field=현장 입력
}

// ── 자재공급 ─────────────────────────────────────────────────────────────────
export interface MaterialSupply {
  id: string
  date: string // 날짜 (YYYY-MM-DD)
  clientId: string // 거래처
  boxCount: number // 박스 수량
  vinylCount: number // 비닐 수량
  needleBoxCount: number // 합성수지 바늘통 수량
  isAdditionalRequest: boolean // 추가요청 여부
  memo: string // 메모
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
