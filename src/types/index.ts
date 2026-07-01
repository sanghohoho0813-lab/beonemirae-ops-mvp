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

// ── 전체 데이터 컨테이너 (localStorage 직렬화 단위) ──────────────────────────
export interface AppData {
  clients: Client[]
  vehicles: Vehicle[]
  schedules: Schedule[]
  materials: MaterialSupply[]
  payments: Payment[]
}
