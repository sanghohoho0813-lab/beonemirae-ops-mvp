import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  Client,
  MaterialSupply,
  NoteKind,
  OfficeStock,
  Payment,
  Schedule,
  SiteNote,
  Vehicle,
  BaselineMetrics,
  LeadStage,
  SalesLead,
  RequestKind,
  RequestStatus,
  Product,
  ProductOrderStatus,
  WasteType,
  VisitPurpose,
} from '../types'
import { EMPTY_APP_DATA } from '../types'
import { loadData, resetData, saveData, uid, loadClientSet, saveClientSet, type ClientSetSize } from '../lib/storage'
import {
  applyCollectionCompletion,
  rollbackCollectionCompletion,
  type CollectionCompletionInput,
  type CommandResult,
} from '../lib/collection'
import { buildBillingSnapshot } from '../lib/billing'
import { resetDemoSession, startDemoSession, restoreTodayOnly } from '../lib/demo'
import { leadKey } from '../lib/sales'
import { outstandingOf, paidTotalOf } from '../lib/selectors'
import type { NextAction } from '../lib/insights'
import { thisMonth, today } from '../lib/format'
import { useAuth } from './AuthContext'
import { friendlyError, isSupabaseConfigured } from '../lib/supabase'
import * as repo from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// 전역 데이터 컨텍스트
//
// 모든 CRUD 는 이 컨텍스트를 통해 이루어지며, 변경 시 자동으로 localStorage 에
// 영속화됩니다. 컴포넌트는 useData() 훅으로 접근합니다.
// ─────────────────────────────────────────────────────────────────────────────

interface DataContextValue {
  data: AppData
  // 거래처
  /**
   * 거래처 등록.
   *  `allowDuplicate` 는 사람이 「이미 있는 그 곳과 다른 병원입니다」라고
   *  확인했을 때만 켭니다 (0045). 켜지 않으면 서버가 이름을 대고 막습니다.
   *  `requestId` 는 「이번 저장 시도」 표 — 다시 눌러도 두 곳이 안 됩니다.
   */
  addClient: (
    c: Omit<Client, 'id'>,
    opts?: { allowDuplicate?: boolean; requestId?: string | null },
  ) => Promise<Client | null>
  /**
   * 거래처 정보 수정.
   *  quiet 를 켜면 저장 뒤 전체 다시 읽기를 건너뜁니다 — 여러 곳을 이어서
   *  고칠 때 매번 전부 읽으면 스무 곳이면 스무 번입니다. 부른 쪽이
   *  마지막에 reload() 를 한 번 부릅니다.
   */
  updateClient: (
    id: string,
    patch: Partial<Client>,
    opts?: { quiet?: boolean },
  ) => Promise<{ ok: boolean; error: string | null }>
  /**
   * 월정액 빈 달 정책을 사람이 정합니다 (0044).
   *  `updateClient` 와 달리 **값이 그대로여도 「정했다」로 기록**합니다 —
   *  「아니오」로 확인한 것과 아직 안 본 것은 다른 일이기 때문입니다.
   */
  setFlatFeePolicy: (
    clientId: string,
    whenEmpty: boolean,
  ) => Promise<{ ok: boolean; error: string | null }>
  /** 소모품 주문 올리기 (0048). 금액은 서버가 계산합니다 */
  requestProductOrder: (input: {
    clientId: string
    items: { productId: string; qty: number }[]
    note?: string
    deliverScheduleId?: string | null
    deliverOn?: string | null
    requestId?: string | null
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 주문 상태 옮기기. 재고는 서버가 전달완료에서 한 번만 뺍니다 */
  setProductOrderStatus: (
    orderId: string,
    status: ProductOrderStatus,
    reason?: string,
  ) => Promise<{ ok: boolean; error: string | null }>
  /** 상품 등록·수정 (관리자) */
  saveProduct: (p: Partial<Product> & { name: string }) => Promise<{ ok: boolean; error: string | null }>
  removeClient: (id: string) => void
  /** 거래 종료를 되돌립니다 (그만둔 거래처 → 다시 거래 중) */
  restoreClient: (id: string) => void
  // 현장 메모 / 특이사항 (병원별)
  addNote: (clientId: string, kind: NoteKind, content: string, requestId?: string | null) => SiteNote
  toggleNote: (id: string) => void
  removeNote: (id: string) => void
  notesFor: (clientId: string) => SiteNote[]
  // 수거일정
  addSchedule: (s: Omit<Schedule, 'id'>) => Schedule
  updateSchedule: (id: string, patch: Partial<Schedule>) => void
  removeSchedule: (id: string) => void
  completeSchedule: (id: string, actualAmount: number, memo?: string) => void
  // 수거 완료 통합 커맨드 (3단계) — 입력 한 번으로 일정/이력/자재/재고/요청/감사기록 연결
  completeCollection: (input: CollectionCompletionInput) => Promise<CommandResult>
  revertCollection: (eventId: string) => Promise<CommandResult>
  // 시연 안정화 (3.5단계)
  resetDemo: () => void // 시연용 변경만 기준 상태로 복원
  startDemo: () => void // 기준 복원 + 새 시연 세션 시작
  restoreToday: () => void // 오늘 일정만 기준 복원 (비상)
  /** 운영 모드 전환 — 끄면 이후 입력이 '실제 현장 기록'으로 저장됩니다(성과 실증 대상). */
  setDemoActive: (active: boolean) => void
  // 차량 — 차량이 없으면 수거 완료 입력이 불가능하므로 앱에서 등록할 수 있어야 합니다
  addVehicle: (v: Omit<Vehicle, 'id'>) => Vehicle
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void
  removeVehicle: (id: string) => void
  /** 사용 중지를 되돌립니다 (사용 중지한 차량 → 다시 사용) */
  restoreVehicle: (id: string) => void
  // 자재공급
  addMaterial: (m: Omit<MaterialSupply, 'id'>) => MaterialSupply
  removeMaterial: (id: string) => void
  /** 사무실 자재 입고 — 재고는 공급으로 줄기만 하므로 채우는 길이 필요합니다 */
  /** 자재 입고 — requestId 는 저장 시도 표(0043). 다시 눌러도 두 번 늘지 않습니다 */
  receiveStock: (patch: Partial<OfficeStock>, memo: string, requestId?: string | null) => void
  // 결제
  addPayment: (p: Omit<Payment, 'id'>) => Payment
  /** 월 정산을 확인한 뒤 청구로 확정합니다 (금액·명세서를 그 순간으로 고정) */
  confirmBilling: (
    clientId: string,
    month: string,
    /** quiet=true 면 건마다 전체를 다시 읽지 않습니다 (여러 건 연속 확정용) */
    opts?: { quiet?: boolean },
  ) => Promise<{ ok: boolean; error: string | null }>
  /**
   * 잘못 만든 청구 — 지우지 않고 취소로 남깁니다.
   *  입금이 한 건이라도 있으면 취소하지 못합니다(0037). 받은 돈이 매출에도
   *  미수금에도 안 잡히는 상태가 되기 때문입니다.
   */
  cancelPayment: (id: string, reason: string) => Promise<{ ok: boolean; error: string | null }>
  updatePayment: (id: string, patch: Partial<Payment>) => void
  /**
   * 남은 금액을 받은 것으로 기록합니다 (입금일 = 오늘).
   * 실제 입금일이 다르면 거래처 화면의 「입금 기록」을 씁니다.
   */
  markPaid: (id: string) => Promise<{ ok: boolean; error: string | null }>
  /** 입금 한 건 기록 (0026) — 부분입금. 서버가 청구 상태까지 맞춥니다 */
  addReceipt: (input: {
    paymentId: string
    receivedOn: string
    amount: number
    method: string
    memo: string
    /** 통장 대사로 들어온 건이면 그 줄의 지문 (0031) */
    sourceRef?: string | null
    /** 저장 시도 표 (0042) — 통신이 끊겨 다시 눌러도 두 번 들어가지 않게 */
    requestId?: string | null
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 잘못 넣은 입금 취소 */
  removeReceipt: (id: string) => Promise<{ ok: boolean; error: string | null }>
  /** 확인된 예정 일정을 한 번에 저장 (0028) */
  planSchedules: (
    rows: { clientId: string; date: string; wasteType: string; expectedAmount: number; basis: string }[],
  ) => Promise<{ ok: boolean; error: string | null; result: repo.PlanBatchResult | null }>
  /**
   * 거래처 단가 저장 (0036).
   *  지금 단가와 「언제부터」 판을 서버에서 한 번에 씁니다 — 둘이 어긋나면
   *  과거 달이 새 단가로 계산됩니다.
   */
  savePricing: (
    clientId: string,
    pricing: Client['pricing'],
    effectiveFrom: string | null,
  ) => Promise<{ ok: boolean; error: string | null }>
  /** 휴무일 일괄 등록 (0034) — 넣은 날만 편성에서 빠집니다 */
  saveHolidays: (
    rows: { day: string; name: string }[],
  ) => Promise<{ ok: boolean; error: string | null; result: { added: number; updated: number } | null }>
  /** 휴무일 삭제 */
  removeHoliday: (day: string) => Promise<{ ok: boolean; error: string | null }>
  /**
   * 이 거래처의 담당 기사 목록을 통째로 바꿉니다 (0056).
   *
   *  빈 배열을 보내면 배정이 사라지고, 그 기사는 다시 전 거래처를 봅니다 —
   *  잘못 눌러도 되돌릴 수 있어야 합니다.
   */
  setClientDrivers: (
    clientId: string,
    profileIds: string[],
  ) => Promise<{ ok: boolean; error: string | null }>
  /**
   * 날짜를 정해 방문을 잡습니다 (0058).
   *
   *  병원에서 「다음 주 목요일에 와 주세요」 전화를 받았을 때 넣는 자리입니다.
   *  requestId 를 함께 보내면 그 요청이 같은 트랜잭션에서 「일정 반영」으로
   *  넘어갑니다 — 방문만 생기고 요청이 「접수」로 남으면 병원이 한 번 더
   *  전화를 겁니다.
   */
  /** 잡아 둔 방문을 옮깁니다 (0059) */
  updateVisit: (input: {
    scheduleId: string
    time?: string | null
    vehicleId?: string | null
    expected?: number | null
    memo?: string | null
    keepVehicle?: boolean
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 현장 의견 (0062) — 현장은 일정을 못 지우고, 의견만 냅니다 */
  submitScheduleFeedback: (input: {
    scheduleId: string
    kind: string
    body: string
    requestId?: string | null
  }) => Promise<{ ok: boolean; error: string | null }>
  handleScheduleFeedback: (
    id: string,
    status: string,
    reply: string,
  ) => Promise<{ ok: boolean; error: string | null }>
  /** 엑셀 월 실적 고치기 (0062) — 이익은 서버가 매출 − 원가로 계산 */
  updateMonthlyActual: (input: {
    id: string
    medicalKg?: number | null
    diaperKg?: number | null
    revenue?: number | null
    cost?: number | null
  }) => Promise<{ ok: boolean; error: string | null }>
  moveVisit: (input: {
    scheduleId: string
    date: string
    time?: string | null
    vehicleId?: string | null
    keepVehicle?: boolean
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 잡아 둔 방문을 무릅니다 (0059). 지우지 않고 이유와 함께 남깁니다 */
  cancelVisit: (scheduleId: string, reason: string) => Promise<{ ok: boolean; error: string | null }>
  bookVisit: (input: {
    clientId: string
    date: string
    wasteType: WasteType
    time?: string
    vehicleId?: string | null
    memo?: string
    expected?: number | null
    requestId?: string | null
    /** 방문 목적 (0067) — 안 주면 서버가 「정기수거」로 봅니다 */
    purpose?: VisitPurpose
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 공용 차량을 그 날짜로 잡습니다 (0070) */
  reserveVehicle: (vehicleId: string, date: string, note?: string) => Promise<{ ok: boolean; error: string | null }>
  /** 잡아 둔 예약을 무릅니다 (0070) */
  releaseVehicle: (id: string) => Promise<{ ok: boolean; error: string | null }>
  /** 사전 등록(초대) 만들기·고치기 (0056). 비밀번호는 본인이 정합니다 */
  saveStaffInvite: (input: {
    email: string
    name: string
    role: 'admin' | 'office' | 'field'
    vehicleId?: string | null
    clientIds?: string[]
    note?: string
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 아직 안 쓰인 초대만 지웁니다 */
  removeStaffInvite: (email: string) => Promise<{ ok: boolean; error: string | null }>
  /** 계정에 차량 묶기 (0056). null 이면 해제 */
  setProfileVehicle: (
    profileId: string,
    vehicleId: string | null,
  ) => Promise<{ ok: boolean; error: string | null }>
  /**
   * 월 매출 직접입력·조정 (0038).
   *  사유 없이 넣지 못하고, 기존 값이 있으면 서버가 이전 값을 함께 돌려줍니다.
   */
  saveRevenueOverride: (input: {
    clientId: string
    month: string
    amount: number
    reason: string
  }) => Promise<{ ok: boolean; error: string | null; before: number | null }>
  /**
   * 거래처 완전 삭제 (0039).
   *  기록이 한 건이라도 있으면 서버가 거부합니다 — 그런 곳은 removeClient
   *  (거래 종료)로 둡니다.
   */
  purgeClient: (id: string, reason: string) => Promise<{ ok: boolean; error: string | null }>
  /** 매출 조정 되돌리기 — 그 달은 다시 확정 → Excel → 추정 순서로 */
  removeRevenueOverride: (
    clientId: string,
    month: string,
  ) => Promise<{ ok: boolean; error: string | null }>
  /** 방금 만든 편성 되돌리기 — 손대지 않은 예정만 지웁니다 */
  undoPlan: (
    batch: string,
  ) => Promise<{ ok: boolean; error: string | null; result: { deleted: number; kept: number } | null }>
  /** 확인한 차량 배정을 저장 (0029) */
  assignVehicles: (
    rows: { scheduleId: string; vehicleId: string }[],
  ) => Promise<{ ok: boolean; error: string | null; result: repo.AssignResultRow | null }>
  /** 차량 배정 되돌리기 — 아직 수거하지 않은 건만 풀립니다 */
  undoAssign: (
    ids: string[],
  ) => Promise<{ ok: boolean; error: string | null; result: { cleared: number; kept: number } | null }>
  /** 그 달 운영비 한 항목 입력·수정 (0030, 관리자) */
  setCost: (input: {
    month: string
    category: string
    amount: number
    memo: string
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 잘못 넣은 운영비 항목 삭제 */
  removeCost: (month: string, category: string) => Promise<{ ok: boolean; error: string | null }>
  // 거래처 조회 헬퍼
  clientById: (id: string) => Client | undefined
  // 데이터 초기화
  reset: () => void
  // 전체 데이터 교체 (JSON 가져오기 등)
  replaceAll: (data: AppData) => void
  // 거래처 데이터 세트 (0=실제 5곳, 10/20/30=실제+시연)
  clientSet: ClientSetSize
  setClientSet: (demoCount: ClientSetSize) => void
  // AX 실증·성과측정 (v4)
  setBaseline: (patch: Partial<BaselineMetrics>) => void // 도입 전 기준값 (사용자 입력)
  setExperimentStart: (date: string | null) => void // 실증 시작일
  // 매출 전환 실증 (v5) — 추천 → 제안 → 수락 → 실제 매출
  setLeadStage: (action: NextAction, stage: LeadStage, month?: string) => void
  setLeadRevenue: (leadId: string, amount: number | null) => void
  // ── v7: 병원 고객 서비스 ──
  /** 병원 요청 등록 (병원 포털 직접 등록 / 비원미래 대행 접수) */
  addRequest: (r: {
    clientId: string
    kind: RequestKind
    content: string
    desiredDate?: string | null
    urgent?: boolean
    source?: 'portal' | 'staff'
    requesterName?: string
    /** 이번 「보내기」 시도의 표 (0055) — 다시 눌러도 같은 값이어야 합니다 */
    requestId?: string | null
  }) => Promise<{ ok: boolean; error: string | null }>
  /** 비원미래 담당자의 요청 처리 (상태 변경 · 병원에 보이는 회신) */
  handleRequest: (id: string, patch: { status?: RequestStatus; reply?: string }) => void
  /** 추천을 병원 포털로 전달 — 이후 수락은 병원이 직접 누릅니다 */
  shareProposal: (action: NextAction, message: string, month?: string) => void
  /** 병원 담당자의 제안 응답 (수락 / 보류) */
  respondProposal: (leadId: string, accept: boolean) => void
  // ── v6: 실사용 전환 (Supabase) ──
  /** 'live' = 로그인 상태의 서버 DB, 'demo' = 이 브라우저에만 저장되는 시연 데이터 */
  mode: 'live' | 'demo'
  /** 서버 통신 상태 — 화면에서 로딩/저장중/실패를 그대로 보여주기 위한 값 */
  sync: {
    loading: boolean
    saving: boolean
    error: string | null
    lastSavedAt: string | null
    /**
     * 첫 읽기가 끝났는가.
     *
     *  실사용에서 병원 담당자가 로그인한 직후 몇 초 동안
     *  「연결된 병원 정보를 찾을 수 없습니다 — 담당자에게 계정 연결을
     *  요청해 주세요」가 떴습니다. 실제로는 연결돼 있었습니다.
     *  아직 안 읽어온 것과 정말로 없는 것은 다른 말이어야 합니다.
     */
    ready: boolean
  }
  /** 서버에서 다시 읽어옵니다 (다른 기기에서 입력한 내용 반영) */
  reload: () => Promise<void>
  /** 마지막 실패한 저장을 다시 시도 */
  retry: () => Promise<void>
  clearSyncError: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

/** 사무실 재고 4칸의 화면 이름 (감사기록에 그대로 적습니다) */

/**
 * 감사기록에 남길 거래처 이름 — 그만둔 거래처도 찾습니다.
 * (돈 기록에 "거래처" 라고만 남으면 나중에 아무 소용이 없습니다)
 */
function findClientName(data: AppData, clientId: string): string {
  const c =
    data.clients.find((x) => x.id === clientId) ??
    data.retiredClients?.find((x) => x.id === clientId)
  return c?.name ?? '거래처'
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { mode } = useAuth()
  // 서버가 연결된 환경에서는 시연 데이터로 시작하지 않습니다.
  // (로그인 직후 서버 응답을 기다리는 동안 존재하지 않는 병원·일정이
  //  실제 데이터처럼 보이면 안 됩니다)
  const [data, setData] = useState<AppData>(() =>
    isSupabaseConfigured ? EMPTY_APP_DATA : loadData(),
  )
  const [clientSet, setClientSetState] = useState<ClientSetSize>(() => loadClientSet())
  const [loading, setLoading] = useState(false)
  //  로그인 후 첫 읽기가 끝났는지. 끝나기 전에는 어느 화면도 「없습니다」라고
  //  말하지 않습니다 (실패로 끝나도 true — 그때는 실패 안내가 대신 뜹니다).
  const [firstLoadDone, setFirstLoadDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 실패한 작업을 그대로 다시 실행하기 위해 보관합니다 (입력값이 사라지지 않도록).
  const pending = useRef<null | (() => Promise<void>)>(null)
  const live = mode === 'live'

  // 변경 시 영속화 — 서버가 연결된 환경에서는 원본이 서버이므로 저장하지 않습니다.
  // (시연 데이터가 실제 데이터를 덮어쓰지 않게 하는 안전장치이기도 합니다.
  //  로그아웃 상태에서도 저장하지 않아, 실사용 브라우저에 시연 데이터가
  //  쌓이지 않습니다.)
  useEffect(() => {
    if (!isSupabaseConfigured) saveData(data)
  }, [data])

  /** 서버에서 전체 운영 데이터를 다시 읽어옵니다. */
  const reload = useCallback(async () => {
    if (mode !== 'live') return
    setLoading(true)
    setSyncError(null)
    try {
      setData(await repo.loadAppData())
    } catch (e) {
      setSyncError(friendlyError(e))
      //  앱을 켜다 못 읽은 경우 (0046). 「아침에 안 열렸다」는 이야기가
      //  가장 흔한데 지금까지 아무 자료도 안 남았습니다.
      void repo.recordAppError({
        kind: 'load',
        screen: typeof window === 'undefined' ? '' : window.location.pathname,
        action: '운영 자료 읽기',
        message: friendlyError(e),
        detail: { raw: e instanceof Error ? e.message : String(e ?? '') },
      })
    } finally {
      setLoading(false)
      setFirstLoadDone(true)
    }
  }, [mode])

  // 로그인/로그아웃 시 데이터 원본을 전환합니다.
  // 서버가 연결된 환경에서 로그아웃하면 화면을 비웁니다 — 앞사람의 운영 데이터가
  // 남아 있어서도, 그 자리를 시연 데이터가 채워서도 안 됩니다.
  useEffect(() => {
    if (live) void reload()
    else {
      setData(isSupabaseConfigured ? EMPTY_APP_DATA : loadData())
      //  로그아웃하면 다시 「아직 안 읽었음」으로 되돌립니다 — 다음 사람이
      //  로그인했을 때 앞사람 기준으로 「없습니다」가 뜨면 안 됩니다.
      setFirstLoadDone(false)
    }
  }, [live, reload])

  // ── 남의 입력을 따라잡기 ────────────────────────────────────────────────
  //
  //  여기까지의 동작은 이랬습니다.
  //
  //    내가 저장한다        → runLive 가 곧바로 다시 읽어옴 → 내 화면은 최신
  //    남이 저장한다        → 아무 일도 일어나지 않음      → 내 화면은 그대로
  //
  //  현장에서 수거를 입력해도, 사무실에서 화면을 켜 둔 사람은 브라우저를
  //  새로고침하기 전까지 그 건을 보지 못했습니다. 로그인할 때 한 번 읽고
  //  끝이었기 때문입니다. "실시간으로 넘어온다"고 알고 계시면 곤란한
  //  동작입니다 — 사무실은 오지 않은 수거로 알고 병원에 전화하게 됩니다.
  //
  //  두 가지 계기로 다시 읽어옵니다.
  //
  //    화면으로 돌아올 때  다른 탭·앱에 갔다 오면 그 즉시
  //    켜 두는 동안        45초마다 (보이는 상태일 때만)
  //
  //  Supabase Realtime 을 쓰면 더 빠르지만 대시보드에서 테이블마다 복제를
  //  켜야 하고, 꺼져 있으면 조용히 아무것도 오지 않습니다. 이 방식은 서버
  //  설정 없이 지금 그대로 동작합니다.
  const savingRef = useRef(false)
  savingRef.current = saving

  /** 배경 갱신 — 화면을 깜빡이지 않도록 loading 을 건드리지 않습니다 */
  const refreshQuiet = useCallback(async () => {
    if (mode !== 'live') return
    //  저장이 진행 중이면 건너뜁니다. 저장 직후 runLive 가 어차피 다시
    //  읽어오고, 여기서 끼어들면 방금 넣은 값이 잠깐 사라졌다 돌아옵니다.
    if (savingRef.current) return
    try {
      setData(await repo.loadAppData())
    } catch {
      //  배경 갱신 실패는 조용히 넘깁니다. 다음 차례에 다시 시도합니다.
      //  여기서 오류 배너를 띄우면, 차를 타고 이동하며 신호가 끊길 때마다
      //  현장 화면에 빨간 띠가 떴다 사라집니다.
    }
  }, [mode])

  useEffect(() => {
    if (!live) return
    const wake = () => {
      if (document.visibilityState === 'visible') void refreshQuiet()
    }
    const id = window.setInterval(wake, 45_000)
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }, [live, refreshQuiet])

  /**
   * 서버 반영 후 최신 상태를 다시 읽어옵니다.
   * 실패하면 화면 상태를 바꾸지 않고 오류만 노출해, 사용자가 입력한 내용이
   * 사라지지 않도록 합니다(재시도 가능).
   */
  // 저장이 됐는지와 안 됐다면 왜인지를 함께 돌려줍니다.
  // 부르는 쪽이 "저장됐다"고 화면에 쓰기 전에 이 결과를 봐야 합니다.
  /**
   * 서버 작업 한 건을 실행하고 화면을 새 데이터로 맞춥니다.
   *
   *  @param quiet 끝나고 다시 읽어오지 않습니다. 여러 건을 잇달아 처리하는
   *   화면(월말 청구 등)에서 씁니다 — 건마다 전체를 다시 읽으면 거래처가
   *   열여덟 곳일 때 전체 조회를 열여덟 번 하게 됩니다. 이 경우 부르는 쪽이
   *   마지막에 reload() 를 한 번 합니다.
   */
  const runLive = useCallback(
    async (fn: () => Promise<void>, quiet = false): Promise<{ ok: boolean; error: string | null }> => {
      setSaving(true)
      setSyncError(null)
      try {
        await fn()
        if (!quiet) setData(await repo.loadAppData())
        setLastSavedAt(new Date().toISOString())
        pending.current = null
        return { ok: true, error: null }
      } catch (e) {
        const message = friendlyError(e)
        setSyncError(message)
        pending.current = fn
        //  남깁니다 (0046). 예전에는 이 빨간 띠가 다음 동작에 사라지면 끝이라,
        //  「어제 저장이 안 됐다」에 답할 자료가 아무 데도 없었습니다.
        //  기록이 실패해도 여기서 다시 터지지 않습니다 — recordAppError 는
        //  절대 예외를 올리지 않습니다.
        void repo.recordAppError({
          kind: 'save',
          screen: typeof window === 'undefined' ? '' : window.location.pathname,
          message,
          //  사람이 읽는 문구로 바꾸기 전의 원문 — 원인을 찾을 때 이게 필요합니다.
          detail: { raw: e instanceof Error ? e.message : String(e ?? '') },
        })
        return { ok: false, error: message }
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const retry = useCallback(async () => {
    const fn = pending.current
    if (fn) await runLive(fn)
  }, [runLive])

  const clearSyncError = useCallback(() => setSyncError(null), [])

  // ── 거래처 ──────────────────────────────────────────────────────────────
  //  서버가 발급한 id 를 돌려줍니다. 예전에는 여기서 만든 임시 id(c_…)를
  //  돌려줘서, 등록 직후 화면이 '거래처를 찾을 수 없어요' 로 갔습니다.
  //  저장은 됐는데 실패한 것처럼 보이니 한 번 더 등록해 같은 거래처가
  //  둘이 되는 자리였습니다.
  const addClient = useCallback(
    async (
      c: Omit<Client, 'id'>,
      opts?: { allowDuplicate?: boolean; requestId?: string | null },
    ): Promise<Client | null> => {
      if (live) {
        let created: Client | null = null
        //  0045 부터 서버가 등록을 맡습니다 — 같은 이름이 이미 있으면 서버가
        //  막고, 기록도 서버가 남깁니다. 여기서 따로 기록하면 두 줄이 됩니다.
        await runLive(async () => {
          const res = await repo.createClient(c, opts)
          created = await repo.clientById(res.id)
        })
        //  못 만들었으면 null 입니다 — 이유는 위쪽 저장 오류 안내와, 부른 쪽이
        //  보여 주는 문구에 그대로 남습니다. 성공한 척하지 않습니다.
        return created
      }
      const client: Client = { ...c, id: uid('c') }
      setData((d) => ({ ...d, clients: [...d.clients, client] }))
      return client
    },
    [live, runLive],
  )

  const updateClient = useCallback(
    async (id: string, patch: Partial<Client>, opts?: { quiet?: boolean }) => {
      if (live) {
        const before = data.clients.find((c) => c.id === id)
        const r = await runLive(async () => {
          await repo.updateClient(id, patch)
          //  「배출 없는 달에도 청구」 체크를 **실제로 바꿨을 때만** 사람이
          //  정한 것으로 기록합니다. 다른 칸만 고쳐 저장한 것은 판단이 아니므로
          //  「정했다」로 만들지 않습니다 (계약서를 안 본 채 정한 것이 됩니다).
          if (
            patch.flatFeeWhenEmpty !== undefined &&
            !!patch.flatFeeWhenEmpty !== !!before?.flatFeeWhenEmpty
          ) {
            await repo.setFlatFeePolicy(id, !!patch.flatFeeWhenEmpty)
          }
          await repo.writeAudit({
            action: 'client.update',
            entity: 'clients',
            entityId: id,
            clientId: id,
            clientName: before?.name ?? '',
            before,
            after: patch,
            summary: `거래처 정보 수정 — ${before?.name ?? id}`,
          })
        }, opts?.quiet ?? false)
        return { ok: r.ok, error: r.error ?? null }
      }
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }))
      return { ok: true, error: null }
    },
    [live, runLive, data.clients],
  )

  //  거래처 점검 화면의 「예 / 아니오」. 값이 안 바뀌어도 기록을 남깁니다 —
  //  이미 「아니오」인 곳을 계약서 보고 「아니오」로 확인한 것도 판단입니다.
  //  그걸 안 남기면 확인한 거래처를 매달 다시 묻게 되고, 알림은 곧 무시됩니다.
  const setFlatFeePolicy = useCallback(
    async (clientId: string, whenEmpty: boolean) => {
      if (live) {
        const r = await runLive(async () => {
          const { recorded } = await repo.setFlatFeePolicy(clientId, whenEmpty)
          if (!recorded) {
            //  0044 를 아직 안 올린 DB. 삼키지 않고 그대로 말합니다.
            throw new Error('이 DB 에는 아직 월정액 정책 기록 기능이 없습니다. RUN_30 을 실행해 주세요.')
          }
        })
        return { ok: r.ok, error: r.error ?? null }
      }
      const at = new Date().toISOString()
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === clientId ? { ...c, flatFeeWhenEmpty: whenEmpty, flatFeePolicyAt: at } : c,
        ),
      }))
      return { ok: true, error: null }
    },
    [live, runLive],
  )

  // ── 소모품 판매 (0048) ────────────────────────────────────────────────
  //
  //  화면은 **재고를 건드리지 않습니다.** 서버가 전달완료에서 한 번만 뺍니다.
  //  여기서 재고를 같이 만지면 두 번 빠지는 자리가 생깁니다.
  const requestProductOrder = useCallback(
    async (input: {
      clientId: string
      items: { productId: string; qty: number }[]
      note?: string
      deliverScheduleId?: string | null
      deliverOn?: string | null
      requestId?: string | null
    }) => {
      if (!live) return { ok: false, error: '서버에 연결되어 있지 않습니다.' }
      const r = await runLive(async () => {
        await repo.requestProductOrder(input)
      })
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive],
  )

  const setProductOrderStatus = useCallback(
    async (orderId: string, status: ProductOrderStatus, reason = '') => {
      if (!live) return { ok: false, error: '서버에 연결되어 있지 않습니다.' }
      const r = await runLive(async () => {
        await repo.setProductOrderStatus(orderId, status, reason)
      })
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive],
  )

  const saveProduct = useCallback(
    async (p: Partial<Product> & { name: string }) => {
      if (!live) return { ok: false, error: '서버에 연결되어 있지 않습니다.' }
      const r = await runLive(async () => {
        await repo.upsertProduct(p)
      })
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive],
  )

  /** 실사용에서는 삭제 대신 비활성화합니다 — 과거 수거 이력이 끊기지 않도록. */
  const removeClient = useCallback(
    (id: string) => {
      if (live) {
        const before = data.clients.find((c) => c.id === id)
        void runLive(async () => {
          await repo.deactivateClient(id)
          await repo.writeAudit({
            action: 'client.deactivate',
            entity: 'clients',
            entityId: id,
            clientId: id,
            clientName: before?.name ?? '',
            summary: `거래처 비활성화 — ${before?.name ?? id}`,
          })
        })
        return
      }
      // 거래처를 지우면 그 거래처의 현장 메모도 함께 정리합니다.
      setData((d) => ({
        ...d,
        clients: d.clients.filter((c) => c.id !== id),
        retiredClients: [...(d.retiredClients ?? []), ...d.clients.filter((c) => c.id === id)],
        notes: (d.notes ?? []).filter((n) => n.clientId !== id),
      }))
    },
    [live, runLive, data.clients],
  )

  /**
   * 거래 종료를 되돌립니다.
   *
   *  거래처를 '거래 종료' 하면 목록에서 사라집니다. 되돌리는 길이 앱 안에
   *  없어서, 실수로 눌렀거나 다시 거래를 시작하면 새로 만드는 수밖에
   *  없었습니다. 새로 만들면 지난 수거·미수금이 이어지지 않고 갈립니다.
   */
  const restoreClient = useCallback(
    (id: string) => {
      const before = (data.retiredClients ?? []).find((c) => c.id === id)
      if (!before) return
      if (live) {
        void runLive(async () => {
          await repo.reactivateClient(id)
          await repo.writeAudit({
            action: 'client.reactivate',
            entity: 'clients',
            entityId: id,
            clientId: id,
            clientName: before.name,
            summary: `거래 재개 — ${before.name}`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        clients: [...d.clients, before],
        retiredClients: (d.retiredClients ?? []).filter((c) => c.id !== id),
      }))
    },
    [live, runLive, data.retiredClients],
  )

  // ── 현장 메모 / 특이사항 ────────────────────────────────────────────────
  // 한 번 기록하면 오늘 일정·수거 입력·대시보드에서 함께 확인됩니다.
  const addNote = useCallback(
    (clientId: string, kind: NoteKind, content: string, requestId?: string | null) => {
      const note: SiteNote = {
        id: uid('note'),
        clientId,
        kind,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        done: false,
      }
      if (live) {
        void runLive(async () => {
          await repo.insertNote({ clientId, kind, content: content.trim(), done: false }, requestId)
        })
        return note
      }
      setData((d) => ({ ...d, notes: [note, ...(d.notes ?? [])] }))
      return note
    },
    [live, runLive],
  )

  const toggleNote = useCallback(
    (id: string) => {
      if (live) {
        const cur = (data.notes ?? []).find((n) => n.id === id)
        void runLive(async () => repo.setNoteDone(id, !cur?.done))
        return
      }
      setData((d) => ({
        ...d,
        notes: (d.notes ?? []).map((n) => (n.id === id ? { ...n, done: !n.done } : n)),
      }))
    },
    [live, runLive, data.notes],
  )

  /** 실사용에서는 메모도 삭제 대신 보관 처리합니다. */
  const removeNote = useCallback(
    (id: string) => {
      if (live) {
        void runLive(async () => repo.archiveNote(id))
        return
      }
      setData((d) => ({ ...d, notes: (d.notes ?? []).filter((n) => n.id !== id) }))
    },
    [live, runLive],
  )

  const notesFor = useCallback(
    (clientId: string) =>
      (data.notes ?? [])
        .filter((n) => n.clientId === clientId)
        .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt)),
    [data.notes],
  )

  // ── 수거일정 ────────────────────────────────────────────────────────────
  const addSchedule = useCallback(
    (s: Omit<Schedule, 'id'>) => {
      const schedule: Schedule = { ...s, id: uid('s') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertSchedule(s)
          await repo.writeAudit({
            action: 'schedule.create',
            entity: 'schedules',
            entityId: created.id,
            clientId: s.clientId,
            summary: `수거일정 생성 — ${s.date} ${s.wasteType}`,
          })
        })
        return schedule
      }
      setData((d) => ({ ...d, schedules: [...d.schedules, schedule] }))
      return schedule
    },
    [live, runLive],
  )

  const updateSchedule = useCallback(
    (id: string, patch: Partial<Schedule>) => {
      if (live) {
        const before = data.schedules.find((s) => s.id === id)
        void runLive(async () => {
          await repo.updateSchedule(id, patch)
          await repo.writeAudit({
            action: 'schedule.update',
            entity: 'schedules',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: patch,
            summary: `수거일정 수정 — ${before?.date ?? id}`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        schedules: d.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [live, runLive, data.schedules],
  )

  const removeSchedule = useCallback(
    (id: string) => {
      if (live) {
        void runLive(async () => {
          await repo.deleteSchedule(id)
          await repo.writeAudit({
            action: 'schedule.delete',
            entity: 'schedules',
            entityId: id,
            summary: '수거일정 삭제',
          })
        })
        return
      }
      setData((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== id) }))
    },
    [live, runLive],
  )

  // 완료된 일정의 수거량·메모 수정 (오늘 일정 화면의 '수정')
  //
  // 실제 운영에서는 서버가 원본입니다. 여기서 화면 상태만 바꾸면 새로고침하는
  // 순간 수정한 값이 사라지는데, 사용자에게는 저장된 것처럼 보입니다.
  const completeSchedule = useCallback(
    (id: string, actualAmount: number, memo?: string) => {
      const patch: Partial<Schedule> = {
        status: '완료',
        actualAmount,
        completedAt: new Date().toISOString(),
        ...(memo !== undefined ? { memo } : {}),
      }
      if (live) {
        const before = data.schedules.find((s) => s.id === id)
        void runLive(async () => {
          await repo.updateSchedule(id, patch)
          await repo.writeAudit({
            action: 'schedule.complete',
            entity: 'schedules',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: patch,
            summary: `수거 완료 수정 — ${before?.date ?? id} · ${actualAmount}kg`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        schedules: d.schedules.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }))
    },
    [live, runLive, data.schedules],
  )

  // ── 수거 완료 통합 커맨드 (3단계) ───────────────────────────────────────
  // 검증→적용→저장을 한 번에 수행. 현재 커밋된 data 기준으로 계산(원자적)합니다.
  const completeCollection = useCallback(
    async (input: CollectionCompletionInput): Promise<CommandResult> => {
      if (live) {
        // 실사용: 서버 함수(complete_collection)가 일정·이력·자재·재고·요청·감사기록을
        // 한 트랜잭션에서 처리합니다. 먼저 로컬 검증으로 즉시 피드백을 주고,
        // 실제 반영은 서버가 다시 검증한 뒤 수행합니다(중복 완료·재고 초과는 서버가 최종 차단).
        const precheck = applyCollectionCompletion(data, { ...input, demoSessionId: null })
        if (!precheck.ok) return precheck

        // 서버 응답을 기다린 뒤에 성공을 돌려줍니다.
        //
        //  예전에는 여기서 바로 ok 를 돌려줬습니다. 지하 주차장처럼 통신이 끊기는
        //  곳에서 저장을 누르면 "수거 완료가 반영되었습니다" 화면이 뜨고 입력값이
        //  지워지는데, 실제로는 아무것도 저장되지 않았습니다. 기사는 저장된 줄
        //  알고 떠나고 그 수거는 사라집니다. 현장에서 가장 위험한 종류입니다.
        const saved = await runLive(async () => {
          await repo.completeCollection(input)
        })
        if (!saved.ok) {
          return {
            ok: false,
            errors: [saved.error ?? '저장하지 못했습니다. 통신 상태를 확인한 뒤 다시 시도해 주세요.'],
            warnings: precheck.warnings,
          }
        }
        return { ok: true, errors: [], warnings: precheck.warnings }
      }

      // 시연 모드: 로컬에서 순수 함수로 처리하고 시연 기록으로 태깅합니다.
      const demoSessionId = data.demoSession?.active ? data.demoSession.id : null
      const result = applyCollectionCompletion(data, { ...input, demoSessionId })
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data, live, runLive],
  )

  const revertCollection = useCallback(
    async (eventId: string): Promise<CommandResult> => {
      if (live) {
        const e = data.events.find((x) => x.id === eventId)
        if (!e) return { ok: false, errors: ['취소할 입력을 찾을 수 없습니다.'], warnings: [] }
        if (e.reverted) return { ok: false, errors: ['이미 취소된 입력입니다.'], warnings: [] }
        // 수거 완료와 같은 이유로 서버 결과를 기다립니다 —
        // 되돌려지지 않았는데 "되돌렸습니다"라고 말하면 안 됩니다.
        const done = await runLive(async () => repo.revertCollection(eventId))
        if (!done.ok) {
          return { ok: false, errors: [done.error ?? '되돌리지 못했습니다. 잠시 후 다시 시도해 주세요.'], warnings: [] }
        }
        return { ok: true, errors: [], warnings: [] }
      }
      const result = rollbackCollectionCompletion(data, eventId)
      if (result.ok && result.data) setData(result.data)
      return result
    },
    [data, live, runLive],
  )

  // ── 시연 안정화 ─────────────────────────────────────────────────────────
  // ── AX 실증·성과측정 ────────────────────────────────────────────────────
  // 기준값은 사용자가 입력한 값만 저장합니다(시스템이 임의 값을 만들지 않음).
  const setBaseline = useCallback(
    (patch: Partial<BaselineMetrics>) => {
      if (live) {
        const row: Record<string, number | null> = {}
        if ('adminMinutesPerCollection' in patch) row.admin_minutes_per_collection = patch.adminMinutesPerCollection ?? null
        if ('repeatEntriesPerCollection' in patch) row.repeat_entries_per_collection = patch.repeatEntriesPerCollection ?? null
        if ('monthlyDocHours' in patch) row.monthly_doc_hours = patch.monthlyDocHours ?? null
        if ('monthlyReworkCount' in patch) row.monthly_rework_count = patch.monthlyReworkCount ?? null
        if ('dailyCapacity' in patch) row.daily_capacity = patch.dailyCapacity ?? null
        //  출처를 함께 보냅니다. 예전에는 서버가 무조건 「사용자 입력값」으로
        //  저장해, 시연용 예시값이 새로고침 뒤에 실제 값처럼 보였습니다.
        const src = patch.source ?? 'user'
        if (Object.keys(row).length) void runLive(async () => repo.saveBaseline(row, src))
        return
      }
      setData((d) => ({
        ...d,
        baseline: { ...d.baseline, ...patch, updatedAt: new Date().toISOString() },
      }))
    },
    [live, runLive],
  )

  const setExperimentStart = useCallback(
    (date: string | null) => {
      if (live) {
        void runLive(async () => repo.saveExperimentStart(date))
        return
      }
      setData((d) => ({ ...d, experiment: { ...d.experiment, startDate: date } }))
    },
    [live, runLive],
  )

  // ── 매출 전환 실증 ──────────────────────────────────────────────────────
  // 추천은 파생값이라 저장하지 않고, 담당자가 상태를 기록할 때만 lead 를 만듭니다.
  const setLeadStage = useCallback((action: NextAction, stage: LeadStage, month = thisMonth()) => {
    if (live) {
      void runLive(async () =>
        repo.upsertLead({
          key: leadKey(action.clientId, action.kind, month),
          clientId: action.clientId,
          clientName: action.clientName,
          kind: action.kind,
          title: action.title,
          month,
          estValue: action.estValue,
          stage,
          // 수락에서 벗어나면 실제 매출을 함께 비웁니다(유령 값 방지).
          actualRevenue: stage === '수락' ? (data.leads ?? []).find((l) => l.key === leadKey(action.clientId, action.kind, month))?.actualRevenue ?? null : null,
          actualRevenueAt: stage === '수락' ? (data.leads ?? []).find((l) => l.key === leadKey(action.clientId, action.kind, month))?.actualRevenueAt ?? null : null,
          demoSessionId: null,
        }).then(() =>
          repo.writeAudit({
            action: 'lead.stage',
            entity: 'sales_leads',
            entityId: leadKey(action.clientId, action.kind, month),
            clientId: action.clientId,
            clientName: action.clientName,
            after: { stage, kind: action.kind, month },
            summary: `영업 단계 변경 — ${action.clientName} · ${action.title} → ${stage}`,
          }),
        ),
      )
      return
    }
    setData((d) => {
      const key = leadKey(action.clientId, action.kind, month)
      const at = new Date().toISOString()
      const demoSessionId = d.demoSession?.active ? d.demoSession.id : null
      const existing = (d.leads ?? []).find((l) => l.key === key)
      if (existing) {
        if (existing.stage === stage) return d
        // 수락에서 벗어나면 입력된 실제 매출을 함께 비웁니다.
        // (수락이 아닌 건에 매출이 남아 있으면 집계에서 보이지 않는 유령 값이 됩니다.)
        const leavingAccepted = existing.stage === '수락' && stage !== '수락'
        return {
          ...d,
          leads: d.leads.map((l) =>
            l.key === key
              ? {
                  ...l,
                  stage,
                  history: [...l.history, { stage, at }],
                  actualRevenue: leavingAccepted ? null : l.actualRevenue,
                  actualRevenueAt: leavingAccepted ? null : l.actualRevenueAt,
                }
              : l,
          ),
        }
      }
      const lead: SalesLead = {
        id: uid('lead'),
        key,
        clientId: action.clientId,
        clientName: action.clientName,
        kind: action.kind,
        title: action.title,
        month,
        estValue: action.estValue,
        stage,
        actualRevenue: null,
        actualRevenueAt: null,
        history: [
          { stage: '추천', at },
          ...(stage === '추천' ? [] : [{ stage, at }]),
        ],
        createdAt: at,
        demoSessionId,
      }
      return { ...d, leads: [...(d.leads ?? []), lead] }
    })
  }, [live, runLive, data.leads])

  /** 실제 매출 입력 — null 이면 '미입력'으로 되돌립니다(0원과 구분). */
  const setLeadRevenue = useCallback(
    (leadId: string, amount: number | null) => {
      if (live) {
        const lead = (data.leads ?? []).find((l) => l.id === leadId)
        void runLive(async () => {
          await repo.setLeadRevenue(leadId, amount)
          await repo.writeAudit({
            action: 'lead.revenue',
            entity: 'sales_leads',
            entityId: leadId,
            clientId: lead?.clientId,
            clientName: lead?.clientName,
            before: { actualRevenue: lead?.actualRevenue ?? null },
            after: { actualRevenue: amount },
            summary:
              amount == null
                ? `실제 매출 삭제 — ${lead?.clientName ?? ''} · ${lead?.title ?? ''}`
                : `실제 매출 입력 — ${lead?.clientName ?? ''} · ${lead?.title ?? ''} · ${amount.toLocaleString('ko-KR')}원`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        leads: (d.leads ?? []).map((l) =>
          l.id === leadId
            ? { ...l, actualRevenue: amount, actualRevenueAt: amount == null ? null : new Date().toISOString() }
            : l,
        ),
      }))
    },
    // data.leads 를 읽어 변경 전 값을 감사기록에 남기므로 의존성에 포함합니다.
    [live, runLive, data.leads],
  )

  // ── 병원 요청 (병원 고객 서비스) ────────────────────────────────────────
  // 병원 담당자가 포털에서 직접 올리거나, 전화·카톡으로 받은 것을 비원미래가
  // 대신 접수합니다. 어느 쪽이든 같은 기록으로 남아 오늘 일정·수거 입력과 연결됩니다.
  const addRequest = useCallback(
    async (r: {
      clientId: string
      kind: RequestKind
      content: string
      desiredDate?: string | null
      urgent?: boolean
      source?: 'portal' | 'staff'
      requesterName?: string
      /**
       * 이번 「보내기」 시도의 표 (0055).
       *
       *  다시 눌러도 **같은 값**이어야 합니다. 누를 때마다 새로 만들면
       *  중복 방어가 아무 일도 안 합니다 — 서버는 서로 다른 시도로 봅니다.
       */
      requestId?: string | null
    }): Promise<{ ok: boolean; error: string | null }> => {
      const payload = {
        clientId: r.clientId,
        kind: r.kind,
        content: r.content.trim(),
        desiredDate: r.desiredDate ?? null,
        urgent: r.urgent ?? false,
        source: r.source ?? 'portal',
        requesterName: r.requesterName ?? '',
        requestId: r.requestId ?? null,
      }
      if (live) {
        //  서버가 받았는지 확인한 뒤에 돌려줍니다. 예전에는 기다리지 않아서,
        //  통신이 끊긴 채로 요청을 보내도 병원 화면에는 '접수되었습니다' 가
        //  떴습니다. 병원은 접수된 줄 알고 기다리는데 아무것도 오지 않습니다.
        return await runLive(async () => repo.insertRequest(payload))
      }
      const now = new Date().toISOString()
      setData((d) => ({
        ...d,
        requests: [
          {
            ...payload,
            requestId: undefined,
            id: uid('creq'),
            clientName: d.clients.find((c) => c.id === r.clientId)?.name ?? '',
            status: '접수' as const,
            reply: '',
            handledBy: null,
            handledAt: null,
            createdAt: now,
            demoSessionId: d.demoSession?.active ? d.demoSession.id : null,
          },
          ...(d.requests ?? []),
        ],
      }))
      return { ok: true, error: null }
    },
    [live, runLive],
  )

  /** 비원미래 담당자의 요청 처리 — 상태 변경 + 병원에 보이는 회신 */
  const handleRequest = useCallback(
    (id: string, patch: { status?: RequestStatus; reply?: string }) => {
      if (live) {
        const before = (data.requests ?? []).find((r) => r.id === id)
        void runLive(async () => {
          await repo.updateRequest(id, patch)
          await repo.writeAudit({
            action: 'request.handle',
            entity: 'client_requests',
            entityId: id,
            clientId: before?.clientId,
            clientName: before?.clientName,
            screen: '병원 요청',
            before,
            after: patch,
            summary: `병원 요청 처리 — ${before?.clientName ?? ''} ${before?.kind ?? ''} → ${patch.status ?? '회신'}`,
          })
        })
        return
      }
      const at = new Date().toISOString()
      setData((d) => ({
        ...d,
        requests: (d.requests ?? []).map((r) =>
          r.id === id ? { ...r, ...patch, handledAt: patch.status ? at : r.handledAt } : r,
        ),
      }))
    },
    [live, runLive, data.requests],
  )

  /**
   * 추천을 병원 포털로 전달합니다 — 이후 '수락'은 병원이 직접 누릅니다.
   * 추천 자체는 파생값이라 저장되어 있지 않으므로, 전달할 때 lead 를 만들며 함께 공유합니다.
   */
  const shareProposal = useCallback(
    (action: NextAction, message: string, month = thisMonth()) => {
      const key = leadKey(action.clientId, action.kind, month)
      const at = new Date().toISOString()
      if (live) {
        const existing = (data.leads ?? []).find((l) => l.key === key)
        void runLive(async () => {
          await repo.upsertLead({
            key,
            clientId: action.clientId,
            clientName: action.clientName,
            kind: action.kind,
            title: action.title,
            month,
            estValue: action.estValue,
            stage: '제안',
            actualRevenue: existing?.actualRevenue ?? null,
            actualRevenueAt: existing?.actualRevenueAt ?? null,
            demoSessionId: null,
            sharedWithClient: true,
            sharedAt: at,
            clientMessage: message,
          })
          await repo.writeAudit({
            action: 'proposal.share',
            entity: 'sales_leads',
            clientId: action.clientId,
            clientName: action.clientName,
            screen: '추천',
            summary: `병원에 제안 전달 — ${action.clientName} ${action.title}`,
          })
        })
        return
      }
      setData((d) => {
        const existing = (d.leads ?? []).find((l) => l.key === key)
        if (existing) {
          return {
            ...d,
            leads: d.leads.map((l) =>
              l.key === key
                ? {
                    ...l,
                    stage: '제안' as const,
                    sharedWithClient: true,
                    sharedAt: at,
                    clientMessage: message,
                    history: [...l.history, { stage: '제안' as const, at }],
                  }
                : l,
            ),
          }
        }
        const lead: SalesLead = {
          id: uid('lead'),
          key,
          clientId: action.clientId,
          clientName: action.clientName,
          kind: action.kind,
          title: action.title,
          month,
          estValue: action.estValue,
          stage: '제안',
          actualRevenue: null,
          actualRevenueAt: null,
          history: [
            { stage: '추천', at },
            { stage: '제안', at },
          ],
          createdAt: at,
          demoSessionId: d.demoSession?.active ? d.demoSession.id : null,
          sharedWithClient: true,
          sharedAt: at,
          clientMessage: message,
        }
        return { ...d, leads: [...(d.leads ?? []), lead] }
      })
    },
    [live, runLive, data.leads],
  )

  /** 병원 담당자의 제안 응답 — 수락/보류 (실제 고객 행동) */
  const respondProposal = useCallback(
    (leadId: string, accept: boolean) => {
      const stage = accept ? ('수락' as const) : ('보류' as const)
      if (live) {
        void runLive(async () => repo.respondToProposal(leadId, accept))
        return
      }
      const at = new Date().toISOString()
      setData((d) => ({
        ...d,
        leads: (d.leads ?? []).map((l) =>
          l.id === leadId
            ? {
                ...l,
                stage,
                clientRespondedAt: at,
                actualRevenue: accept ? l.actualRevenue : null,
                actualRevenueAt: accept ? l.actualRevenueAt : null,
                history: [...l.history, { stage, at }],
              }
            : l,
        ),
      }))
    },
    [live, runLive],
  )

  // ── 시연 전용 기능 ──────────────────────────────────────────────────────
  // 실제 운영(live) 모드에서는 시연 초기화·복원이 동작하지 않습니다.
  // 실제 DB 데이터를 시연 버튼으로 지우는 사고를 원천 차단합니다.
  const setDemoActive = useCallback(
    (active: boolean) => {
      if (live) return
      setData((d) => ({
        ...d,
        demoSession: d.demoSession
          ? { ...d.demoSession, active }
          : { id: uid('demo'), startedAt: new Date().toISOString(), active },
      }))
    },
    [live],
  )

  const resetDemo = useCallback(() => {
    if (live) return
    setData((d) => resetDemoSession(d))
  }, [live])
  const startDemo = useCallback(() => {
    if (live) return
    setData((d) => startDemoSession(d))
  }, [live])
  const restoreToday = useCallback(() => {
    if (live) return
    setData((d) => restoreTodayOnly(d))
  }, [live])

  // ── 차량 ────────────────────────────────────────────────────────────────
  const addVehicle = useCallback(
    (v: Omit<Vehicle, 'id'>) => {
      const vehicle: Vehicle = { ...v, id: uid('v') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertVehicle(v)
          await repo.writeAudit({
            action: 'vehicle.create',
            entity: 'vehicles',
            entityId: created.id,
            summary: `차량 등록 — ${created.name} (${v.wasteType})`,
          })
        })
        return vehicle
      }
      setData((d) => ({ ...d, vehicles: [...d.vehicles, vehicle] }))
      return vehicle
    },
    [live, runLive],
  )

  const updateVehicle = useCallback(
    (id: string, patch: Partial<Vehicle>) => {
      if (live) {
        const before = data.vehicles.find((v) => v.id === id)
        void runLive(async () => {
          await repo.updateVehicle(id, patch)
          await repo.writeAudit({
            action: 'vehicle.update',
            entity: 'vehicles',
            entityId: id,
            before,
            after: patch,
            summary: `차량 정보 수정 — ${before?.name ?? id}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
    },
    [live, runLive, data.vehicles],
  )

  /** 차량도 삭제 대신 비활성화 — 과거 배차 이력이 끊기지 않도록 */
  const removeVehicle = useCallback(
    (id: string) => {
      if (live) {
        const before = data.vehicles.find((v) => v.id === id)
        void runLive(async () => {
          await repo.deactivateVehicle(id)
          await repo.writeAudit({
            action: 'vehicle.deactivate',
            entity: 'vehicles',
            entityId: id,
            summary: `차량 비활성화 — ${before?.name ?? id}`,
          })
        })
        return
      }
      setData((d) => ({ ...d, vehicles: d.vehicles.filter((v) => v.id !== id) }))
    },
    [live, runLive, data.vehicles],
  )

  /**
   * 사용 중지한 차량을 다시 씁니다.
   *
   *  「사용 중지」는 되돌릴 수 있어야 하는 동작인데, 예전에는 되돌릴 길이
   *  앱 안에 아예 없었습니다. 목록에서 사라지면 끝이라, 차량 이름을 잘못
   *  적고 지운 경우 SQL 을 직접 쓰는 수밖에 없었습니다.
   */
  const restoreVehicle = useCallback(
    (id: string) => {
      const before = (data.retiredVehicles ?? []).find((v) => v.id === id)
      if (!before) return
      if (live) {
        void runLive(async () => {
          await repo.reactivateVehicle(id)
          await repo.writeAudit({
            action: 'vehicle.reactivate',
            entity: 'vehicles',
            entityId: id,
            summary: `차량 사용 재개 — ${before.name}`,
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        vehicles: [...d.vehicles, before],
        retiredVehicles: (d.retiredVehicles ?? []).filter((v) => v.id !== id),
      }))
    },
    [live, runLive, data.retiredVehicles],
  )

  // ── 자재공급 ────────────────────────────────────────────────────────────
  const addMaterial = useCallback(
    (m: Omit<MaterialSupply, 'id'>) => {
      const material: MaterialSupply = { ...m, id: uid('m') }
      if (live) {
        //  같은 사실(자재를 병원에 줬다)인데 어디서 넣느냐에 따라 결과가
        //  달랐습니다. 수거 입력의 동시공급은 사무실 재고를 줄이고 원장에도
        //  남는데, 자재 화면의 공급 등록은 둘 다 하지 않았습니다. 그러면
        //  재고 숫자가 조용히 실제와 어긋나고, 「자재 소진 위험」도 틀립니다.
        //  같은 사실은 같은 결과가 되도록 여기서도 줄이고 원장에 남깁니다.
        //  서버 함수 하나가 기록·재고 차감·원장·감사기록을 한 트랜잭션에서
        //  합니다 (0043). 예전에는 여기서 네 번 따로 불렀고, 재고를 **화면이
        //  아는 옛 값에서 뺀 절대값**으로 썼습니다 — 두 사람이 같은 순간에
        //  넣으면 한쪽 차감이 통째로 사라졌고, 중간에 끊기면 자재만 남았습니다.
        void runLive(async () => {
          await repo.supplyMaterials({
            clientId: m.clientId,
            date: m.date,
            boxCount: m.boxCount,
            vinylCount: m.vinylCount,
            needleBoxCount: m.needleBoxCount,
            isAdditionalRequest: m.isAdditionalRequest,
            memo: m.memo,
            requestId: m.requestId ?? null,
          })
        })
        return material
      }
      setData((d) => ({ ...d, materials: [...d.materials, material] }))
      return material
    },
    [live, runLive, data],
  )

  //  사무실 재고는 수거 입력의 동시공급으로 줄기만 하고, 채우는 길이 화면에
  //  없었습니다. 그대로 두면 재고가 0 이 되는 순간 서버가 "재고보다 많이
  //  공급할 수 없습니다" 로 막아 현장이 실제로 준 자재를 기록조차 못 하게
  //  됩니다. 더원요양병원 한 달 사용량(63L 180개·12L 400개·비닐 800개)이면
  //  지금 재고로는 한 달을 못 넘깁니다. 원장에는 '입고' 로 남깁니다.
  const receiveStock = useCallback(
    (patch: Partial<OfficeStock>, memo: string, requestId?: string | null) => {
      const next: Partial<OfficeStock> = {}
      for (const [k, v] of Object.entries(patch)) {
        const add = Number(v ?? 0)
        if (add > 0) next[k as keyof OfficeStock] = (data.officeStock?.[k as keyof OfficeStock] ?? 0) + add
      }
      if (Object.keys(next).length === 0) return
      if (live) {
        //  0043 — 서버가 **상대값**으로 더합니다. 두 사람이 같은 순간에
        //  50개씩 넣으면 100개가 늘어야 하는데, 예전에는 「내가 아는 재고 +
        //  넣을 양」을 절대값으로 써서 50개만 늘었습니다.
        void runLive(async () => {
          await repo.receiveStockRpc({
            corrugatedBox: Number(patch.corrugatedBox ?? 0),
            plasticContainer: Number(patch.plasticContainer ?? 0),
            bag: Number(patch.bag ?? 0),
            needleBox: Number(patch.needleBox ?? 0),
            memo: memo || '자재 입고',
            requestId: requestId ?? null,
          })
        })
        return
      }
      setData((d) => ({ ...d, officeStock: { ...d.officeStock, ...next } }))
    },
    [live, runLive, data],
  )

  const removeMaterial = useCallback(
    (id: string) => {
      if (live) {
        //  감사기록은 서버가 남깁니다(0023). 화면에서 따로 남기면, 실제로는
        //  지워지지 않았는데 「지웠다」가 기록되는 일이 다시 생깁니다.
        void runLive(async () => {
          await repo.deleteMaterial(id)
        })
        return
      }
      setData((d) => ({ ...d, materials: d.materials.filter((m) => m.id !== id) }))
    },
    [live, runLive, data.materials],
  )

  // ── 결제 ────────────────────────────────────────────────────────────────
  const addPayment = useCallback(
    (p: Omit<Payment, 'id'>) => {
      const payment: Payment = { ...p, id: uid('p') }
      if (live) {
        void runLive(async () => {
          const created = await repo.insertPayment(p)
          await repo.writeAudit({
            action: 'payment.create',
            entity: 'payments',
            entityId: created.id,
            clientId: p.clientId,
            after: created,
            summary: `청구 등록 — ${p.billingMonth} · ${p.amount.toLocaleString()}원`,
          })
        })
        return payment
      }
      setData((d) => ({ ...d, payments: [...d.payments, payment] }))
      return payment
    },
    [live, runLive],
  )

  //  ── 청구 확정 ──────────────────────────────────────────────────────────
  //  사무실이 월 정산을 눈으로 확인한 뒤 누릅니다. 그 순간의 정산·명세서를
  //  통째로 담아 두므로, 나중에 단가를 바꾸거나 그 달 수거가 더 들어와도
  //  이 청구는 흔들리지 않습니다. 남은 수거·공급이 없으면 만들지 않습니다
  //  (같은 달을 두 번 청구하는 것을 이걸로 막습니다).
  const confirmBilling = useCallback(
    async (
      clientId: string,
      month: string,
      opts?: { quiet?: boolean },
    ): Promise<{ ok: boolean; error: string | null }> => {
      const built = buildBillingSnapshot(data, clientId, month, new Date().toISOString())
      if (!built) {
        return { ok: false, error: '이 달에는 새로 청구할 수거·공급이 없습니다.' }
      }
      const payload: Omit<Payment, 'id'> = {
        clientId,
        billingMonth: month,
        amount: built.amount,
        status: '미수금',
        method: '무통장',
        paidAt: null,
        memo: `${built.snapshot.kind} 청구`,
        snapshot: built.snapshot,
      }
      if (live) {
        //  서버 함수 한 번으로 끝냅니다 (0032).
        //   · 이미 청구한 수거가 들어 있으면 서버가 거부합니다 — 두 사람이
        //     동시에 눌러도 병원에 두 배로 청구되지 않습니다. 화면의 버튼
        //     잠금은 내 브라우저에서만 도는 잠금이라 이걸 막지 못합니다.
        //   · 청구 저장과 감사기록이 같은 트랜잭션입니다.
        return await runLive(async () => {
          await repo.confirmBillingRpc({
            clientId,
            month,
            amount: built.amount,
            snapshot: built.snapshot,
          })
        }, opts?.quiet)
      }
      setData((d) => ({ ...d, payments: [...d.payments, { ...payload, id: uid('p') }] }))
      return { ok: true, error: null }
    },
    [live, runLive, data],
  )

  //  잘못 만든 청구는 지우지 않습니다. 지워 버리면 "그런 청구는 없었다" 가
  //  되어, 병원과 금액을 두고 다툴 때 근거가 남지 않습니다.
  //
  //  입금이 들어온 청구는 취소하지 못합니다(0037). 취소한 청구는 매출에도
  //  미수금에도 안 잡히는데 입금 기록만 남으면, **실제로 받은 돈이 장부
  //  어디에도 없는 상태**가 됩니다. 입금을 먼저 취소해야 합니다.
  const cancelPayment = useCallback(
    async (id: string, reason: string): Promise<{ ok: boolean; error: string | null }> => {
      const before = data.payments.find((p) => p.id === id)
      if (!before) return { ok: false, error: '취소할 청구를 찾을 수 없습니다.' }
      if (before.status === '취소') return { ok: false, error: '이미 취소한 청구입니다.' }
      //  화면에서도 같은 것을 먼저 봅니다 — 서버까지 갔다 오지 않고 이유를
      //  바로 알려 주기 위해서입니다. 최종 방어선은 서버입니다.
      const paid = paidTotalOf(data, before)
      if (paid > 0) {
        return {
          ok: false,
          error:
            `이 청구에는 입금 ${paid.toLocaleString('ko-KR')}원이 이미 기록되어 있습니다. ` +
            '입금 기록을 먼저 취소한 뒤 청구를 취소해 주세요 — 받은 돈이 장부에서 사라지지 않게 하는 규칙입니다.',
        }
      }
      const canceledAt = new Date().toISOString()
      if (live) {
        //  상태 변경과 감사기록을 서버가 한 트랜잭션으로 묶습니다(0037).
        return await runLive(async () => {
          await repo.cancelBilling(id, reason)
        }).then((r) => ({ ok: r.ok, error: r.error ?? null }))
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, status: '취소', canceledAt } : p)),
      }))
      return { ok: true, error: null }
    },
    [live, runLive, data],
  )

  const updatePayment = useCallback(
    (id: string, patch: Partial<Payment>) => {
      if (live) {
        //  돈에 관한 상태 변경인데 아무 기록도 남지 않았습니다. 나중에
        //  "누가 이걸 확인필요로 바꿨나" 를 물으면 답할 수가 없습니다.
        const before = data.payments.find((p) => p.id === id)
        const name = before ? findClientName(data, before.clientId) : '거래처'
        void runLive(async () => {
          await repo.updatePayment(id, patch)
          await repo.writeAudit({
            action: 'payment.update',
            entity: 'payments',
            entityId: id,
            clientId: before?.clientId,
            before,
            after: before ? { ...before, ...patch } : patch,
            summary: before
              ? `${name} ${before.billingMonth} 청구 ${before.amount.toLocaleString('ko-KR')}원 — ` +
                `${patch.status ? `${before.status} → ${patch.status}` : '내용 수정'}`
              : '청구 내용 수정',
          })
        })
        return
      }
      setData((d) => ({
        ...d,
        payments: d.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }))
    },
    [live, runLive, data],
  )

  /**
   * 입금 한 건 기록 (0026).
   *
   *  서버 함수가 입금 저장 + 청구 상태 갱신 + 감사기록을 한 트랜잭션에서
   *  합니다. 화면에서 따로따로 부르면 중간에 끊겼을 때 입금은 들어갔는데
   *  청구는 미수로 남는 상태가 생깁니다 — 돈 기록에서 가장 나쁜 경우입니다.
   */
  const addReceipt = useCallback(
    async (input: {
      paymentId: string
      receivedOn: string
      amount: number
      method: string
      memo: string
      sourceRef?: string | null
      /** 저장 시도 표 (0042) — 다시 눌러도 두 번 들어가지 않게 */
      requestId?: string | null
    }) => {
      if (!live) return { ok: false, error: '입금 기록은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.addPaymentReceipt(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const removeReceipt = useCallback(
    async (id: string) => {
      if (!live) return { ok: false, error: '입금 기록은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deletePaymentReceipt(id)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  /**
   * 확인된 예정 일정을 한 번에 저장합니다 (0028).
   *
   *  화면에서 목록을 눈으로 확인한 뒤에만 부릅니다. 서버가 중복·과거
   *  날짜를 다시 막고, 한 트랜잭션이라 중간에 끊기면 한 건도 남지 않습니다.
   */
  const planSchedules = useCallback(
    async (rows: { clientId: string; date: string; wasteType: string; expectedAmount: number; basis: string }[]) => {
      if (!live) return { ok: false, error: '일정 편성은 실제 운영 모드에서만 됩니다.', result: null }
      let result: repo.PlanBatchResult | null = null
      const r = await runLive(async () => {
        result = await repo.createPlannedSchedules(rows)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, result }
    },
    [live, runLive, reload],
  )

  /** 거래처 단가 저장 (0036) — 지금 단가와 판을 서버에서 함께 씁니다 */
  const savePricing = useCallback(
    async (clientId: string, pricing: Client['pricing'], effectiveFrom: string | null) => {
      if (!live) {
        setData((d) => ({
          ...d,
          clients: d.clients.map((c) => (c.id === clientId ? { ...c, pricing } : c)),
        }))
        return { ok: true, error: null }
      }
      const r = await runLive(async () => {
        await repo.setClientPricing({ clientId, pricing, effectiveFrom })
      })
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive],
  )

  /** 휴무일 일괄 등록 (0034) — 붙여 넣은 목록을 그대로 서버에 넘깁니다 */
  const saveHolidays = useCallback(
    async (rows: { day: string; name: string }[]) => {
      if (!live) return { ok: false, error: '휴무일 등록은 실제 운영 모드에서만 됩니다.', result: null }
      let result: { added: number; updated: number } | null = null
      const r = await runLive(async () => {
        result = await repo.setHolidays(rows)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, result }
    },
    [live, runLive, reload],
  )

  const removeHoliday = useCallback(
    async (day: string) => {
      if (!live) return { ok: false, error: '휴무일 삭제는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deleteHoliday(day)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  // ── 담당 기사 배정 · 사전 등록 (0056) ──────────────────────────────────────
  //
  //  넷 다 관리자만 됩니다. 화면에서 감추는 것과 별개로 서버가 다시 막습니다.

  const setClientDrivers = useCallback(
    async (clientId: string, profileIds: string[]) => {
      if (!live) return { ok: false, error: '담당 기사 배정은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.setClientDrivers(clientId, profileIds)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  ── 방문 예약 (0058) ────────────────────────────────────────────────────
  //
  //   판단(지난 날짜·먼 미래·안 하는 구분·중복)은 전부 서버에 있습니다.
  //   여기서 한 번 더 검사하지 않습니다 — 두 곳에 두면 언젠가 서로 달라지고,
  //   그때 어느 쪽이 맞는지 아무도 모릅니다.
  const bookVisit = useCallback(
    async (input: {
      clientId: string
      date: string
      wasteType: WasteType
      time?: string
      vehicleId?: string | null
      memo?: string
      expected?: number | null
      requestId?: string | null
      purpose?: VisitPurpose
    }) => {
      if (!live) return { ok: false, error: '방문 예약은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.bookVisit(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  ── 공용 차량 예약 (0070) ───────────────────────────────────────────────
  //   판단(지난 날짜·이미 잡힘·본인 것인지)은 전부 서버에 있습니다.
  //   화면에서 한 번 더 쓰지 않습니다 — 두 곳에 두면 언젠가 서로 달라집니다.
  const reserveVehicleFn = useCallback(
    async (vehicleId: string, date: string, note = '') => {
      if (!live) return { ok: false, error: '차량 예약은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.reserveVehicle(vehicleId, date, note)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const releaseVehicleFn = useCallback(
    async (id: string) => {
      if (!live) return { ok: false, error: '차량 예약은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.releaseVehicle(id)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  ── 옮기기·무르기 (0059) ───────────────────────────────────────────────
  //
  //   판단(완료 여부·지난 날짜·겹침·이유 필수)은 전부 서버에 있습니다.
  //   화면에서 한 번 더 쓰지 않습니다 — 두 곳에 두면 언젠가 서로 달라집니다.
  const moveVisit = useCallback(
    async (input: {
      scheduleId: string
      date: string
      time?: string | null
      vehicleId?: string | null
      keepVehicle?: boolean
    }) => {
      if (!live) return { ok: false, error: '방문 옮기기는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.moveVisit(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  잡아 둔 방문의 **상세**만 고칩니다 (0062). 날짜는 안 건드립니다 —
  //  옮기는 것은 moveVisit 입니다.
  const updateVisit = useCallback(
    async (input: {
      scheduleId: string
      time?: string | null
      vehicleId?: string | null
      expected?: number | null
      memo?: string | null
      keepVehicle?: boolean
    }) => {
      if (!live) return { ok: false, error: '일정 수정은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.updateVisit(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  현장 의견 (0062). 같은 표(requestId)로 다시 눌러도 하나입니다.
  const submitScheduleFeedback = useCallback(
    async (input: { scheduleId: string; kind: string; body: string; requestId?: string | null }) => {
      if (!live) return { ok: false, error: '의견 보내기는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.submitScheduleFeedback(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const handleScheduleFeedback = useCallback(
    async (id: string, status: string, reply: string) => {
      if (!live) return { ok: false, error: '의견 처리는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.handleScheduleFeedback(id, status, reply)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  엑셀 월 실적 고치기 (0062) — ⚠ 매출이 바뀝니다. 이익은 서버가 계산합니다.
  const updateMonthlyActual = useCallback(
    async (input: {
      id: string
      medicalKg?: number | null
      diaperKg?: number | null
      revenue?: number | null
      cost?: number | null
    }) => {
      if (!live) return { ok: false, error: '월 실적 수정은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.updateMonthlyActual(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const cancelVisit = useCallback(
    async (scheduleId: string, reason: string) => {
      if (!live) return { ok: false, error: '방문 무르기는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.cancelVisit(scheduleId, reason)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const saveStaffInvite = useCallback(
    async (input: {
      email: string
      name: string
      role: 'admin' | 'office' | 'field'
      vehicleId?: string | null
      clientIds?: string[]
      note?: string
    }) => {
      if (!live) return { ok: false, error: '사전 등록은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.upsertStaffInvite(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const removeStaffInvite = useCallback(
    async (email: string) => {
      if (!live) return { ok: false, error: '사전 등록 삭제는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deleteStaffInvite(email)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const setProfileVehicle = useCallback(
    async (profileId: string, vehicleId: string | null) => {
      if (!live) return { ok: false, error: '차량 지정은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.setProfileVehicle(profileId, vehicleId)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  /**
   * 월 매출 직접입력 · 조정 (0038).
   *
   *  매출은 대표님이 경영 판단에 쓰는 숫자입니다. 조용히 덮어쓰지 않고,
   *  기존 값이 있었으면 얼마였는지 돌려줍니다 — 화면이 그것을 보여 줍니다.
   */
  const saveRevenueOverride = useCallback(
    async (input: { clientId: string; month: string; amount: number; reason: string }) => {
      if (!live) return { ok: false, error: '매출 조정은 실제 운영 모드에서만 됩니다.', before: null }
      let before: number | null = null
      const r = await runLive(async () => {
        const res = await repo.setRevenueOverride(input)
        before = res.before
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, before }
    },
    [live, runLive, reload],
  )

  const removeRevenueOverride = useCallback(
    async (clientId: string, month: string) => {
      if (!live) return { ok: false, error: '매출 조정은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deleteRevenueOverride(clientId, month)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  //  잘못 만든 거래처를 지웁니다. 기록이 있으면 서버가 막습니다 —
  //  지우면 지난 매출·미수금이 바뀌기 때문입니다.
  const purgeClient = useCallback(
    async (id: string, reason: string) => {
      if (!live) return { ok: false, error: '거래처 삭제는 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deleteClient(id, reason)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const undoPlan = useCallback(
    async (batch: string) => {
      if (!live) return { ok: false, error: '일정 편성은 실제 운영 모드에서만 됩니다.', result: null }
      let result: { deleted: number; kept: number } | null = null
      const r = await runLive(async () => {
        result = await repo.undoScheduleBatch(batch)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, result }
    },
    [live, runLive, reload],
  )

  /**
   * 확인한 차량 배정을 한 번에 저장합니다 (0029).
   *
   *  구분이 다른 차량(분리 운행 위반)은 서버가 다시 막습니다 — 화면 판단을
   *  최종 근거로 삼지 않습니다.
   */
  const assignVehicles = useCallback(
    async (rows: { scheduleId: string; vehicleId: string }[]) => {
      if (!live) return { ok: false, error: '차량 배정은 실제 운영 모드에서만 됩니다.', result: null }
      let result: repo.AssignResultRow | null = null
      const r = await runLive(async () => {
        result = await repo.assignScheduleVehicles(rows)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, result }
    },
    [live, runLive, reload],
  )

  const undoAssign = useCallback(
    async (ids: string[]) => {
      if (!live) return { ok: false, error: '차량 배정은 실제 운영 모드에서만 됩니다.', result: null }
      let result: { cleared: number; kept: number } | null = null
      const r = await runLive(async () => {
        result = await repo.unassignScheduleVehicles(ids)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null, result }
    },
    [live, runLive, reload],
  )

  /**
   * 월 운영비 (0030).
   *
   *  시스템이 추정하지 않습니다. 대표님이 실제 나간 돈을 넣고, 그 값이
   *  있어야 영업이익이 계산됩니다.
   */
  const setCost = useCallback(
    async (input: { month: string; category: string; amount: number; memo: string }) => {
      if (!live) return { ok: false, error: '운영비 입력은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.setOperatingCost(input)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  const removeCost = useCallback(
    async (month: string, category: string) => {
      if (!live) return { ok: false, error: '운영비 입력은 실제 운영 모드에서만 됩니다.' }
      const r = await runLive(async () => {
        await repo.deleteOperatingCost(month, category)
      })
      if (r.ok) await reload()
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, reload],
  )

  /**
   * 남은 금액을 「받았다」로 처리합니다.
   *
   *  예전에는 상태만 입금완료로 바꿨습니다. 그러면
   *   · 30만원만 들어온 100만원 청구를 눌렀을 때 남은 70만원이 장부에서
   *     사라졌습니다 (미수금 합계가 그만큼 줄어듭니다)
   *   · 입금일이 실제 입금일이 아니라 **버튼 누른 시각**으로 남았습니다
   *   · 얼마를 어떻게 받았는지 근거가 없어 통장 대사가 붙을 자리도
   *     없었습니다
   *
   *  이제 남은 금액만큼 실제 입금 기록을 남깁니다. 상태·입금일은 서버가
   *  맞춰 줍니다(0031). 통장에서 온 것이 아니므로 지문(source_ref)은
   *  없습니다 — 나중에 같은 건이 통장 파일로 들어와도 서로 막지 않습니다.
   *
   *  실제 입금일이 오늘이 아니면 거래처 화면의 「입금 기록」으로 날짜를
   *  넣어야 합니다. 화면이 그렇게 안내합니다.
   */
  const markPaid = useCallback(
    async (id: string): Promise<{ ok: boolean; error: string | null }> => {
      const bill = data.payments.find((p) => p.id === id)
      if (!bill) return { ok: false, error: '청구를 찾을 수 없습니다.' }
      const rest = outstandingOf(data, bill)
      if (rest <= 0) return { ok: false, error: '이미 다 받은 청구입니다.' }
      if (!live) {
        setData((d) => ({
          ...d,
          payments: d.payments.map((p) =>
            p.id === id ? { ...p, status: '입금완료', paidAt: new Date().toISOString() } : p,
          ),
        }))
        return { ok: true, error: null }
      }
      const r = await runLive(async () => {
        await repo.addPaymentReceipt({
          paymentId: id,
          receivedOn: today(),
          amount: rest,
          method: '기타',
          memo: '완납 처리',
          sourceRef: null,
        })
      })
      return { ok: r.ok, error: r.error ?? null }
    },
    [live, runLive, data],
  )

  // 아래 세 가지는 시연/로컬 데이터 전용입니다.
  // 실제 운영 모드에서는 서버 데이터를 건드리지 않습니다.
  const reset = useCallback(() => {
    if (live) return
    setData(resetData(loadClientSet()))
  }, [live])

  const replaceAll = useCallback(
    (next: AppData) => {
      if (live) return
      setData(next)
    },
    [live],
  )

  // 거래처 세트 전환 — 해당 세트 기준으로 데이터 재생성
  const setClientSet = useCallback(
    (demoCount: ClientSetSize) => {
      if (live) return
      saveClientSet(demoCount)
      setClientSetState(demoCount)
      setData(resetData(demoCount))
    },
    [live],
  )

  //  그만둔 거래처도 찾습니다. 활성 목록에만 있으면, 비활성으로 돌린
  //  거래처의 미수금이 '알 수 없음' 으로 남아 몇 달 뒤 주인을 못 찾습니다.
  const clientById = useCallback(
    (id: string) =>
      data.clients.find((c) => c.id === id) ?? data.retiredClients?.find((c) => c.id === id),
    [data.clients, data.retiredClients],
  )

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      addClient,
      updateClient,
      setFlatFeePolicy,
      requestProductOrder,
      setProductOrderStatus,
      saveProduct,
      removeClient,
      restoreClient,
      addNote,
      toggleNote,
      removeNote,
      notesFor,
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
      resetDemo,
      startDemo,
      restoreToday,
      setDemoActive,
      addVehicle,
      updateVehicle,
      removeVehicle,
      restoreVehicle,
      addMaterial,
      removeMaterial,
      receiveStock,
      addPayment,
      confirmBilling,
      cancelPayment,
      updatePayment,
      markPaid,
      addReceipt,
      removeReceipt,
      planSchedules,
      savePricing,
      saveHolidays,
      removeHoliday,
      setClientDrivers,
      bookVisit,
      reserveVehicle: reserveVehicleFn,
      releaseVehicle: releaseVehicleFn,
      moveVisit,
      updateVisit,
      submitScheduleFeedback,
      handleScheduleFeedback,
      updateMonthlyActual,
      cancelVisit,
      saveStaffInvite,
      removeStaffInvite,
      setProfileVehicle,
      saveRevenueOverride,
      removeRevenueOverride,
      purgeClient,
      undoPlan,
      assignVehicles,
      undoAssign,
      setCost,
      removeCost,
      clientById,
      reset,
      replaceAll,
      clientSet,
      setClientSet,
      setBaseline,
      setExperimentStart,
      setLeadStage,
      setLeadRevenue,
      addRequest,
      handleRequest,
      shareProposal,
      respondProposal,
      mode,
      sync: { loading, saving, error: syncError, lastSavedAt, ready: !live || firstLoadDone },
      reload,
      retry,
      clearSyncError,
    }),
    [
      data,
      addClient,
      updateClient,
      setFlatFeePolicy,
      requestProductOrder,
      setProductOrderStatus,
      saveProduct,
      removeClient,
      restoreClient,
      addNote,
      toggleNote,
      removeNote,
      notesFor,
      addSchedule,
      updateSchedule,
      removeSchedule,
      completeSchedule,
      completeCollection,
      revertCollection,
      resetDemo,
      startDemo,
      restoreToday,
      setDemoActive,
      addVehicle,
      updateVehicle,
      removeVehicle,
      restoreVehicle,
      addMaterial,
      removeMaterial,
      receiveStock,
      addPayment,
      confirmBilling,
      cancelPayment,
      updatePayment,
      markPaid,
      addReceipt,
      removeReceipt,
      planSchedules,
      savePricing,
      saveHolidays,
      removeHoliday,
      setClientDrivers,
      bookVisit,
      reserveVehicleFn,
      releaseVehicleFn,
      moveVisit,
      updateVisit,
      submitScheduleFeedback,
      handleScheduleFeedback,
      updateMonthlyActual,
      cancelVisit,
      saveStaffInvite,
      removeStaffInvite,
      setProfileVehicle,
      saveRevenueOverride,
      removeRevenueOverride,
      purgeClient,
      undoPlan,
      assignVehicles,
      undoAssign,
      setCost,
      removeCost,
      clientById,
      reset,
      replaceAll,
      clientSet,
      setClientSet,
      setBaseline,
      setExperimentStart,
      setLeadStage,
      setLeadRevenue,
      addRequest,
      handleRequest,
      shareProposal,
      respondProposal,
      mode,
      loading,
      firstLoadDone,
      live,
      saving,
      syncError,
      lastSavedAt,
      reload,
      retry,
      clearSyncError,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData 는 DataProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
