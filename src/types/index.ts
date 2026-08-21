//  청구 확정 스냅샷은 정산·명세서 모양 그대로 담기므로 lib/billing 에
//  정의된 타입을 그대로 씁니다 (타입만 가져오므로 순환 참조가 남지 않습니다).
import type { BillingSnapshot } from '../lib/billing'
import type { TaxFiling } from '../lib/taxBase'

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

/**
 *  방문 목적 (0067) — 기사님이 일정을 잡을 때 고릅니다.
 *
 *  ⚠ **새 칸이 아닙니다.** 이미 있는 두 칸으로 옮겨 담습니다 —
 *    정기수거 → status '예정' · is_additional false
 *    추가수거 → is_additional **true** (청구서에 「추가 수거」라고 적히고,
 *               **금액은 안 바뀝니다** — 수량×단가 그대로입니다)
 *    긴급수거 → status **'긴급'**
 *    기타     → 정기와 같게 두고 메모에 적습니다
 */
export type VisitPurpose = '정기수거' | '추가수거' | '긴급수거' | '기타'

export const VISIT_PURPOSES: VisitPurpose[] = ['정기수거', '추가수거', '긴급수거', '기타']

/** 입금상태 */
export type PaymentStatus = '입금완료' | '미수금' | '확인필요' | '취소'

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

/**
 * 화면에 적는 이름 — **저장값과 다릅니다.**
 *
 *  `소모품` 은 DB 의 CHECK 로 굳어 있는 값이라 바꾸려면 migration 이
 *  필요합니다. 그런데 병원이 실제로 급한 것은 「용기가 모자란다」이지
 *  물건을 사겠다는 뜻이 아닙니다. 「소모품」이라고 적어 두면 판매 상품
 *  목록처럼 읽혀서, 정작 용기가 없어 못 버리는 병원이 이 칸을 안 누르고
 *  전화를 겁니다.
 *
 *  그래서 **저장값은 그대로 두고 보이는 글자만** 바꿉니다. 화면에서 요청
 *  종류를 사람에게 보여 줄 때는 여기를 지나갑니다.
 */
export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  긴급수거: '긴급수거',
  추가수거: '추가수거',
  소모품: '자재·용기',
  '교육·자료': '교육·자료',
  기타: '기타',
}

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
  /**
   * 마지막 배출자 교육을 **실제로 한 날** (0060, YYYY-MM-DD).
   *
   *  ⚠ 비어 있으면 「모른다」입니다. 예전에는 거래처 id 를 해시해
   *  「23개월 전」 같은 값을 만들어 화면에 확정처럼 띄웠습니다.
   *  없으면 아무 말도 하지 않습니다.
   */
  educationAt?: string | null
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

  // ── v33: 세금계산서 발행 정보 ──
  //  매달 홈택스에 옮겨 적던 값입니다. 없으면 발행 목록에서 「확인 필요」로
  //  빠지고, 금액을 자동으로 계산하지 않습니다.
  /** 사업자등록번호 — 숫자 10자리, 하이픈 없이 저장 */
  bizNo?: string
  /** 대표자명 */
  bizCeo?: string
  /** 업태 */
  bizType?: string
  /** 종목 */
  bizItem?: string
  /** 계산서 담당자 이메일 */
  taxEmail?: string
  /** 부가세 처리 — 사람이 계약을 보고 정합니다. null = 미지정 */
  vatMode?: VatMode | null

  // ── v35: 월정액 계약 정책 ──
  /**
   * 월정액을 수거 0건인 달에도 청구하는 계약인지 (0035).
   *  계약서를 보고 사람이 켭니다. 꺼져 있으면 지금까지와 같이
   *  수거가 있을 때만 청구하고, 0건인 달은 「확인 필요」로 돌립니다.
   */
  flatFeeWhenEmpty?: boolean
  /**
   * 위 정책을 **사람이 정한 시각** (0044). 비어 있으면 「아직 안 정함」입니다.
   *
   *  `flatFeeWhenEmpty === false` 하나로는 「아니오로 정했다」와 「아무도 안
   *  정했다」를 구분할 수 없습니다. 구분이 안 되면 배출 없는 달에 월정액
   *  거래처를 확정하지 못한 채 그 달만 엑셀로 넘어갑니다.
   */
  flatFeePolicyAt?: string | null
  /** 수거 가능시간 (0039) — 예: 평일 09:00~17:00 */
  collectTime?: string
  /** 처리장·처리업체 (0039) */
  disposalSite?: string
  /** 일회용기저귀 수거주기 (0039). 비면 의료폐기물 주기를 함께 씁니다 */
  diaperCycle?: string
}

// ── 우리 직원 (0047) ─────────────────────────────────────────────────────────
//
//  주민등록번호는 담지 않습니다 — 이 시스템이 하는 일(일정·수거·정산)에
//  필요 없는 값이고, 한 번 넣으면 백업·내보내기·화면 어디로든 흘러갑니다.
export type StaffPosition = '대표' | '이사' | '사무' | '현장'
export type WasteScope = '의료폐기물' | '일회용기저귀' | '둘 다' | '해당없음'

export interface Staff {
  id: string
  name: string
  position: StaffPosition
  /** 주로 맡는 폐기물 — 「오늘 이 일이 누구 일인지」를 가립니다 */
  wasteScope: WasteScope
  /** 4대보험 최초 자격취득일. 실제 입사일과 다를 수 있습니다 */
  insuredFrom: string | null
  /** 네 보험의 취득일을 원본 그대로 ({'국민연금': '2025-07-01', …}) */
  insurance: Record<string, string | null>
  active: boolean
  note: string
}

// ── 소모품 판매 (0048) ───────────────────────────────────────────────────────
//
//  쇼핑몰이 아니라 **수거연계 판매**입니다. 어차피 가는 차가 물건을 싣고
//  가면 배송비가 0 이고, 병원은 따로 주문할 데를 찾지 않습니다.
export type ProductOrderStatus = '요청' | '확인' | '준비' | '전달예정' | '전달완료' | '취소'

export interface Product {
  id: string
  name: string
  spec: string
  unit: string
  salePrice: number
  /**
   * 매입원가. **null 이면 「이 계정은 볼 수 없다」** 입니다 (0064).
   *
   *  0 으로 채우지 않습니다 — 원가 0원은 「이익 100%」라는 뜻이 되어,
   *  못 본 것과 재 봤더니 0원인 것이 같은 숫자로 섞입니다.
   */
  costPrice: number | null
  /** 사무실 재고의 어느 칸에서 빠지는가. null = 재고를 두지 않는 물건 */
  stockKey: string | null
  available: boolean
  imageUrl: string
  description: string
  active: boolean
  /** 화면에서 묶어 보여 주는 분류 (0050). 재고 차감과는 무관합니다 */
  category: string
  /** 목록에서의 자리 */
  sort: number
}

export interface ProductOrderItem {
  id: number
  orderId: string
  productId: string | null
  name: string
  spec: string
  unit: string
  qty: number
  /** 주문 시점의 단가 — 상품가가 나중에 바뀌어도 이 값은 안 바뀝니다 */
  unitPrice: number
  unitCost: number
  stockKey: string | null
}

export interface ProductOrder {
  id: string
  clientId: string
  status: ProductOrderStatus
  requesterName: string
  source: 'portal' | 'staff'
  note: string
  /** 「다음 수거 때 같이」 — 그 방문 일정 */
  deliverScheduleId: string | null
  deliverOn: string | null
  requestedAt: string
  confirmedAt: string | null
  deliveredAt: string | null
  canceledAt: string | null
  cancelReason: string
  items: ProductOrderItem[]
}

/** 부가세 처리 방식 — 청구액이 공급가액인지 합계인지는 계약마다 다릅니다 */
export type VatMode = '별도' | '포함' | '면세'

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
  /**
   * 같은 날 방문 순서 (1,2,3…) — 0067.
   *
   *  ⚠ `null`/`undefined` 는 **「정하지 않음」**이지 「첫 번째」가 아닙니다.
   *    0 으로 채우면 안 정한 곳이 전부 맨 앞으로 올라옵니다.
   *    안 정했으면 지금까지처럼 예정 시간순으로 봅니다.
   *
   *  판 67 이전 DB 에서는 이 칸이 없어 늘 undefined 입니다 — 화면이
   *  깨지지 않게 읽는 쪽에서 없는 것으로 다룹니다.
   */
  visitOrder?: number | null
  /**
   * 사람이 날짜를 정해 잡은 방문 (0058, ISO).
   *
   *  자동 편성으로 생긴 예정과 **무게가 다릅니다.** 자동 예정은 틀리면
   *  지우면 되지만, 병원과 약속한 방문을 놓치면 그 병원은 전화기를 듭니다.
   *  화면에서 갈라 보여 주기 위한 값입니다.
   */
  bookedAt?: string | null
  /**
   * 무른 방문 (0059, ISO). 지우지 않고 남깁니다 —
   * 「그 주에 왜 안 갔나」에 답할 근거입니다.
   *
   *  ⚠ 이 값이 있으면 **아직 안 간 방문으로 세지 않습니다.**
   *  판단은 lib/scheduleLive.ts 한 곳에 있습니다 — 화면마다 조건을
   *  적으면 언젠가 한 곳을 빠뜨리고, 그러면 무른 방문에 기사가 나갑니다.
   */
  canceledAt?: string | null
  /** 무른 이유 (0059) */
  cancelReason?: string
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
  /**
   * 저장 시도 표 (0043).
   *
   *  통신이 끊겨 다시 눌렀을 때 「같은 저장」임을 서버가 알 수 있게 화면이
   *  만들어 보냅니다. 자재는 청구에 들어가므로 두 줄이 되면 돈이 틀립니다.
   */
  requestId?: string | null
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

  // ── v9: 청구 확정 (0017 migration) ──
  /**
   * 확정한 순간의 정산·거래명세서 내용과, 이 청구가 덮은 수거·공급 id.
   * 나중에 단가를 바꾸거나 수거가 더 들어와도 이 청구는 흔들리지 않습니다.
   * 값이 없으면 이 기능 이전에 만들어진 청구입니다.
   */
  snapshot?: BillingSnapshot | null
  /** 청구를 취소한 시각 (지우지 않고 취소로 남깁니다) */
  canceledAt?: string | null
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
/** 월 마감에서 **사람만 아는** 두 단계 (0054) */
export type MonthCloseStep = 'invoice_sent' | 'tax_issued'

export interface MonthCloseMark {
  month: string // YYYY-MM
  step: MonthCloseStep
  markedAt: string
  /** 누른 사람 이름 — 계정이 지워져도 남도록 그 자리에서 굳혀 둡니다 */
  markedName: string
  note: string
}

/**
 * 거래처에 붙은 담당 기사 (0056).
 *
 *  이 표가 **비어 있는 기사**는 지금까지처럼 전 거래처를 봅니다. 한 건이라도
 *  붙는 순간 그 목록만 보입니다 — 그래서 「배정했더니 화면이 빈다」가 아니라
 *  「배정한 곳만 남는다」가 됩니다.
 */
export interface ClientAssignment {
  clientId: string
  profileId: string
  assignedAt: string
}

/**
 * 사전 등록(초대) — 아직 가입하지 않은 직원 자리 (0056).
 *
 *  비밀번호는 여기에 없습니다. 본인이 가입 화면에서 직접 정합니다.
 *  이 이메일로 가입하면 역할·차량·담당 거래처가 자동으로 붙고 바로 씁니다.
 */
export interface StaffInvite {
  email: string
  name: string
  role: 'admin' | 'office' | 'field'
  vehicleId: string | null
  clientIds: string[]
  note: string
  createdAt: string
  /** 가입해서 실제로 쓰인 시각 — 채워지면 더 이상 대기 중이 아닙니다 */
  usedAt: string | null
}

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
  // ── 그만둔 거래처 ──
  //  거래처를 '삭제'하면 지우지 않고 비활성으로 둡니다. 그런데 청구·수거
  //  기록은 그대로 남기 때문에, 이름을 못 찾으면 미수금이 '알 수 없음' 으로
  //  보입니다. 목록 화면에는 넣지 않고 이름을 되찾는 용도로만 씁니다.
  retiredClients?: Client[]
  /**
   * 엑셀에서 가져온 월 실적 (0025).
   *
   *  거래처 관리 엑셀의 「정산금 세부내역」에는 월 합계만 있는 달이 많습니다.
   *  날짜를 알 수 없어 수거 기록으로 만들 수 없지만, 그 달의 수거량·매출은
   *  회사의 실제 실적입니다. 날짜별 기록과 섞지 않고 따로 들고 있다가
   *  화면에서 「엑셀에서 가져온 월 실적」으로 구분해 보여 줍니다.
   */
  monthlyActuals?: ClientMonthlyActual[]
  // ── v34: 휴무일 (공휴일·회사 휴무). 넣은 날만 편성에서 빠집니다 ──
  holidays?: Holiday[]
  /** 우리 직원 명부 (0047). 이름·담당만 — 주민등록번호는 담지 않습니다 */
  staff?: Staff[]
  /**
   * 사람이 「보냈다 / 발행했다」고 표시한 기록 (0054).
   *
   *  거래명세서 발송과 세금계산서 발행은 시스템이 알 수 없습니다 — 뽑을 수
   *  있다는 것까지만 압니다. 그래서 사람이 누른 것만 「끝」으로 봅니다.
   *  시스템이 스스로 채우지 않습니다.
   */
  monthCloseMarks?: MonthCloseMark[]
  /**
   * 담당 기사 배정 (0056). 관리자만 바꿀 수 있고, 화면은 읽기만 합니다.
   *
   *  기사 계정으로 들어오면 RLS 가 이미 걸러 주므로 여기 담긴 것도 자기
   *  것뿐입니다 — 화면이 다시 거르지 않아도 됩니다.
   */
  clientAssignments?: ClientAssignment[]
  /** 사전 등록(초대) 명단 (0056). 관리자만 읽습니다 */
  staffInvites?: StaffInvite[]
  /** 파는 소모품 (0048) */
  products?: Product[]
  /** 소모품 주문 (0048). 병원은 자기 것만 내려받습니다 (RLS) */
  productOrders?: ProductOrder[]
  /**
   * 국세청에 신고한 부가가치세 과세표준 (0047).
   *
   *  이 시스템에 쌓인 매출과 **다른 숫자**입니다. 회사가 실제로 국가에 낸
   *  값이라 대표님이 믿는 기준이고, 「작년 같은 반기보다 얼마나 늘었나」의
   *  근거가 됩니다. 현장 담당자에게는 RLS 로 보이지 않습니다.
   */
  taxFilings?: TaxFiling[]
  // ── v36: 거래처 단가의 판 (언제부터 얼마였는지) ──
  clientPrices?: ClientPrice[]
  /** 입금 기록 (0026) — 청구별 부분입금. 없으면 기존 방식(완납/미수)만 */
  receipts?: PaymentReceipt[]
  /**
   * 현장 의견 (0062) — 배정된 일정에 대해 현장이 낸 의견.
   *
   *  현장 담당자에게는 **자기가 낸 것만** 담깁니다(RLS). 사무실·관리자에게는
   *  전부 담깁니다 — 그래서 「몇 건 왔는지」를 셀 수 있는 것도 그쪽뿐입니다.
   */
  scheduleFeedback?: ScheduleFeedback[]
  /**
   * 월 매출 직접입력 · 조정 (0038).
   *
   *  거래처 × 월 매출 집계에서 **가장 높은 우선순위**입니다. 계약서에는
   *  있는데 기록이 없는 달, 엑셀 값이 실제와 다른 달을 사람이 바로잡습니다.
   *  사유 없이 넣을 수 없습니다.
   */
  revenueOverrides?: RevenueOverride[]
  /**
   * 월 운영비 (0030).
   *
   *  인건비·유류비처럼 회사 전체에 나가는 돈입니다. 시스템이 추정하지 않고
   *  대표가 실제 나간 금액을 넣습니다. 이 값이 있어야 「기여이익」이
   *  「영업이익」이 됩니다 — 없는 달은 영업이익을 계산하지 않습니다.
   */
  operatingCosts?: OperatingCost[]
  // ── 사용 중지한 차량 ──
  //  차량도 지우지 않고 비활성으로 둡니다(과거 배차 이력 때문에).
  //  되돌릴 수 있어야 하므로 목록과 따로 담아 둡니다.
  retiredVehicles?: Vehicle[]
}

/** 운영비 항목 (0030) — DB check 제약과 같은 목록 */
export type CostCategoryName =
  | '인건비'
  | '유류비'
  | '차량 유지비'
  | '임차료·수수료'
  | '기타 운영비'

/** 월 운영비 한 줄 (0030). 같은 달·같은 항목은 한 줄만 있습니다. */
export interface OperatingCost {
  id: string
  month: string // YYYY-MM
  category: CostCategoryName
  amount: number
  memo: string
  actorName: string
  updatedAt: string
}

/** 결제수단 — 실제 업무에 있는 것만 (0026) */
export type ReceiptMethod = '계좌이체' | '카드' | '현금' | '기타'

/**
 * 입금 한 건 (0026).
 *
 *  청구 하나에 여러 건이 달릴 수 있습니다. 100만원 청구에 30만원이 먼저
 *  들어오고 나중에 70만원이 들어오는 것이 실제 업무입니다.
 */
export interface PaymentReceipt {
  id: string
  paymentId: string
  /** 통장에 찍힌 날 (YYYY-MM-DD) */
  receivedOn: string
  amount: number
  method: ReceiptMethod
  memo: string
  actorName: string
  createdAt: string
  /** 통장 대사로 들어온 입금이면 그 통장 줄의 지문 (0031). 손입력은 없음 */
  sourceRef?: string | null
}

/** 월 매출 직접입력·조정 (0038) — 거래처 × 월 하나씩 */
export interface RevenueOverride {
  id: string
  clientId: string
  /** 'YYYY-MM' */
  month: string
  amount: number
  /** 왜 이 값인지 — 비어 있을 수 없습니다 */
  reason: string
  actorName: string
  createdAt: string
  updatedAt: string
}

/** 엑셀 정산 시트의 월 합계 — 날짜별 수거로 바꾸지 않고 월 단위 그대로 */
export interface ClientMonthlyActual {
  id: string
  clientId: string
  /** 'YYYY-MM' */
  month: string
  medicalKg: number
  diaperKg: number
  revenue: number
  cost: number
  profit: number
  /** 이 달에 날짜별 수거 기록도 함께 있는가 (있으면 시스템 계산을 우선) */
  hasDated: boolean
  /** 어느 파일에서 왔는지 */
  sourceFile: string
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
export type BaselineSource = 'user' | 'demo' | 'survey'

/** 도입 전 업무 기준값 (모두 사용자 입력. 미입력은 null 로 두고 '기준값 입력 필요'로 표시) */
export interface BaselineMetrics {
  adminMinutesPerCollection: number | null // 수거 1건 처리 후 행정업무 소요시간 (분)
  repeatEntriesPerCollection: number | null // 동일 정보 반복 입력 횟수 (회)
  monthlyDocHours: number | null // 수거대장·명세 등 월간 문서 작성시간 (시간)
  monthlyReworkCount: number | null // 월간 누락·재확인 발생 건수 (건)
  dailyCapacity: number | null // 하루 평균 처리 건수 (건)
  source: BaselineSource // 'user' = 직접 입력 / 'demo' = 시연용 예시값 / 'survey' = 실제 업무 조사(0051)
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

/** 휴무일 — 공휴일·회사 휴무. 사람이 넣은 날만 편성에서 빠집니다 (0034) */
export interface Holiday {
  /** YYYY-MM-DD */
  day: string
  name: string
}

/**
 * 거래처 단가의 판 (0036).
 *  정산은 「그 달에 유효했던 판」을 씁니다 — 과거 달이 오늘 단가로
 *  다시 계산되지 않게 하기 위해서입니다. 판이 없으면 clients.pricing.
 */
export interface ClientPrice {
  id: string
  clientId: string
  /** 이 날부터 적용 (YYYY-MM-DD, 그 날 포함) */
  effectiveFrom: string
  pricing: Record<string, { sale?: number | null; cost?: number | null }>
  memo: string
  actorName: string
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 현장 의견 (0062)
//
//  현장 담당자는 배정받은 일정을 **직접 지우지 못합니다.** 대신 의견을 냅니다 —
//  「이 날짜보다 화요일이 낫습니다」 같은 것. 저장하면 대표·사무실 화면에 뜹니다.
//  자기가 낸 것만 보이고(RLS), 지우지도 못합니다 — 기록이기 때문입니다.
// ─────────────────────────────────────────────────────────────────────────────
export const FEEDBACK_KINDS = ['일정변경', '요일변경', '현장상황', '기타'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_STATUSES = ['접수', '확인', '반영', '반려'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export interface ScheduleFeedback {
  id: string
  scheduleId: string
  clientId: string
  kind: FeedbackKind
  body: string
  status: FeedbackStatus
  reply: string
  createdBy: string | null
  createdAt: string
  handledAt: string | null
}
