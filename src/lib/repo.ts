import type {
  VisitPurpose,
  AppData,
  Client,
  ClientRequest,
  ClientInquiry,
  InquiryTopic,
  InquiryStatus,
  CollectionEvent,
  ScheduleFeedback,
  MaterialSupply,
  OfficeStock,
  Payment,
  RequestOverride,
  Schedule,
  SalesLead,
  SiteNote,
  Vehicle,
  ClientMonthlyActual,
  ClientPrice,
  Holiday,
  OperatingCost,
  PaymentReceipt,
  RevenueOverride,
  Staff,
  Product,
  ProductOrder,
  ProductOrderItem,
  ProductOrderStatus,
  MonthCloseMark,
  MonthCloseStep,
  ClientAssignment,
  StaffInvite,
  WasteType,
} from '../types'
import { DEFAULT_OFFICE_STOCK, EMPTY_BASELINE, EMPTY_EXPERIMENT } from '../types'
import { supabase, withRetry, missingName } from './supabase'
import type { CollectionCompletionInput } from './collection'
import { SNAPSHOT_TABLES, buildSnapshot, type Snapshot } from './snapshot'
import { clientNameKey } from './clientName'
import type { TaxFiling } from './taxBase'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase 레포지토리
//
//  기존 도메인 로직(insights / performance / sales / ops / reports)은 모두
//  AppData 를 입력으로 받는 순수 함수입니다. 그래서 이 레이어는 "Supabase 행 ↔
//  AppData" 변환만 담당하고, 화면과 비즈니스 로직은 손대지 않습니다.
//
//  실제 운영 데이터의 source of truth 는 Supabase 이며, localStorage 는 시연
//  모드 전용으로만 남습니다.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, any>

const need = () => {
  if (!supabase) throw new Error('Supabase 연결이 설정되지 않았습니다.')
  return supabase
}

/** PostgREST 오류를 throw 로 변환 (목록 조회 — 없으면 빈 배열) */
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

/** 단일 행 조회 — 행이 없으면 빈 배열이 아니라 null 을 돌려줍니다. */
function unwrapOne(res: { data: Row | null; error: { message: string } | null }): Row | null {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/**
 * 표 하나를 **끝까지** 읽습니다.
 *
 *  서버(PostgREST)는 한 번에 1000줄까지만 돌려줍니다. 그런데 앱은 돌려받은
 *  것을 전부라고 믿고 있었습니다. 그래서 수거 기록이 1000건을 넘는 순간부터
 *  **일부 거래처가 화면에서 통째로 사라졌습니다.**
 *
 *  실제로 재현했습니다 — 거래처 20곳에 6개월치(수거 1,461건)를 넣으니
 *  6곳의 수거가 0kg 으로 보였고, 매출로 2억 3,900만원이 화면에서 빠졌습니다.
 *  오류도 경고도 없이 조용히 틀립니다. 정산·통계·거래명세서가 전부 그
 *  값을 씁니다.
 *
 *  거래처 18곳이면 넉 달이면 1000건을 넘습니다. 즉 실사용 몇 달 뒤에
 *  반드시 일어날 일이었습니다.
 *
 *  1000줄씩 나눠 끝까지 읽습니다. 마지막 장이 1000줄보다 적으면 끝입니다.
 *  나눠 읽을 때는 순서가 고정돼야 합니다 — 정렬 없이 나누면 어떤 줄은 두 번
 *  오고 어떤 줄은 영영 안 옵니다. 그래서 모든 조회에 정렬을 붙였습니다.
 */
const PAGE = 1000
async function pageAll(
  make: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/**
 * 거래처에서 **읽을 수 있는 칸** (0063).
 *
 *  ⚠ 예전에는 `select('*')` 였습니다. 그런데 별표는 단가·월정액·결제조건·
 *    세금계산서 정보까지 통째로 훑습니다. 0063 부터 서버가 그 칸들을
 *    authenticated 에게서 **열 단위로** 회수했기 때문에, 별표를 그대로 두면
 *    **모든 역할에서** 「permission denied」가 납니다.
 *
 *  ⚠ 여기에 새 칸을 더하는 것을 잊으면 그 칸이 조용히 안 읽힙니다.
 *    그래서 서버의 `app_health_check()` 가 **이 목록과 같은 칸이 열려 있는지**
 *    함께 봅니다 — 한쪽만 고치면 자가진단이 알려 줍니다.
 */
const CLIENT_COLS = [
  'id', 'name', 'type', 'address', 'manager', 'phone',
  'collection_cycle', 'collects_medical_waste', 'collects_diaper', 'storage_size', 'note',
  'is_demo_generated', 'demo_session_id', 'active',
  'created_at', 'updated_at', 'created_by', 'updated_by',
  'contract_start', 'contract_end',
  'collect_time', 'disposal_site', 'diaper_cycle',
  'name_key', 'request_id', 'education_at',
].join(', ')

/**
 * 상품에서 **누구나 읽어도 되는 칸** (0064 준비).
 *
 *  매입원가(cost_price)가 **빠져 있습니다.** 병원도 상품 목록은 봐야 하지만
 *  우리가 얼마에 사 오는지는 볼 일이 없습니다. 0064 가 그 칸을 잠그는데,
 *  별표로 읽고 있으면 잠그는 순간 요청 전체가 거절됩니다.
 */
const PRODUCT_COLS = [
  'id', 'name', 'spec', 'unit', 'sale_price',
  'stock_key', 'available', 'image_url', 'description', 'active', 'category', 'sort',
  'created_at', 'updated_at',
].join(', ')

/**
 * 직원 명부에서 **업무에 필요한 칸** (0064 준비).
 *
 *  4대보험 자격취득일(insured_from)과 보험 상세(insurance)가 **빠져 있습니다.**
 *  누가 무슨 폐기물을 맡는지는 현장에서도 봐야 하지만, 동료의 보험 취득일은
 *  업무에 필요 없는 개인정보입니다.
 */
const STAFF_COLS = [
  'id', 'name', 'position', 'waste_scope', 'profile_id', 'active', 'note',
  'created_at', 'updated_at',
].join(', ')

/**
 * 거래처의 돈 칸 — 사무실·관리자만 (0063).
 *
 *  ⚠ 이 값이 안 붙으면 **청구가 틀립니다.** 단가판(client_prices)이 없는
 *    거래처는 지금도 `clients.pricing` 을 그대로 씁니다(billing.ts). 서버는
 *    현장에 빈 배열을 돌려주므로, 현장 화면에서는 이 칸들이 비어 있는 것이
 *    맞습니다 — 현장은 금액을 계산하지 않습니다.
 */
interface BillingTerm {
  id: string
  paymentTerms?: string | null
  paymentDueDay?: number | null
  monthlyFlatFee?: number | null
  pricing?: Client['pricing'] | null
  bizNo?: string | null
  bizCeo?: string | null
  bizType?: string | null
  bizItem?: string | null
  taxEmail?: string | null
  vatMode?: Client['vatMode'] | null
  flatFeeWhenEmpty?: boolean | null
  flatFeePolicyAt?: string | null
}

function applyTerms(list: Client[], terms: BillingTerm[]): Client[] {
  if (terms.length === 0) return list
  const by = new Map(terms.map((t) => [t.id, t]))
  return list.map((c) => {
    const t = by.get(c.id)
    if (!t) return c
    return {
      ...c,
      paymentTerms: t.paymentTerms ?? '',
      paymentDueDay: t.paymentDueDay ?? null,
      monthlyFlatFee: t.monthlyFlatFee ?? null,
      pricing: t.pricing ?? undefined,
      bizNo: t.bizNo ?? '',
      bizCeo: t.bizCeo ?? '',
      bizType: t.bizType ?? '',
      bizItem: t.bizItem ?? '',
      taxEmail: t.taxEmail ?? '',
      vatMode: t.vatMode ?? null,
      flatFeeWhenEmpty: t.flatFeeWhenEmpty ?? false,
    }
  })
}

// ── 행 → 도메인 매핑 ─────────────────────────────────────────────────────────
const toClient = (r: Row): Client => ({
  id: r.id,
  name: r.name,
  type: r.type,
  address: r.address ?? '',
  manager: r.manager ?? '',
  phone: r.phone ?? '',
  collectionCycle: r.collection_cycle ?? '',
  collectsMedicalWaste: !!r.collects_medical_waste,
  collectsDiaper: !!r.collects_diaper,
  storageSize: r.storage_size,
  note: r.note ?? '',
  isDemoGenerated: !!r.is_demo_generated,
  //  0060 이전 서버에는 이 칸이 없습니다 — 없으면 「모른다」입니다.
  educationAt: r.education_at ?? null,
  contractStart: r.contract_start ?? null,
  contractEnd: r.contract_end ?? null,
  paymentTerms: r.payment_terms ?? '',
  paymentDueDay: r.payment_due_day ?? null,
  monthlyFlatFee: r.monthly_flat_fee ?? null,
  pricing: r.pricing ?? undefined,
  //  0033 이전 DB 에서는 이 칸들이 아예 없습니다. undefined 로 두면
  //  화면이 「미입력」으로 읽고, 저장할 때도 clean() 이 빼 줍니다.
  bizNo: r.biz_no ?? '',
  bizCeo: r.biz_ceo ?? '',
  bizType: r.biz_type ?? '',
  bizItem: r.biz_item ?? '',
  taxEmail: r.tax_email ?? '',
  vatMode: r.vat_mode ?? null,
  flatFeeWhenEmpty: !!r.flat_fee_when_empty,
  //  0044 이전 DB 에는 이 칸이 없습니다. null 로 두면 화면이 「아직 안 정함」으로
  //  읽습니다 — 그게 사실입니다. 정한 적 없는 것을 정했다고 하지 않습니다.
  flatFeePolicyAt: r.flat_fee_policy_at ?? null,
  collectTime: r.collect_time ?? '',
  disposalSite: r.disposal_site ?? '',
  diaperCycle: r.diaper_cycle ?? '',
})

const toVehicle = (r: Row): Vehicle => ({
  id: r.id,
  name: r.name,
  wasteType: r.waste_type,
  tonnage: Number(r.tonnage ?? 0),
  nominalCapacity: r.nominal_capacity ?? 0,
  expectedCapacity: r.expected_capacity ?? 0,
  driver: r.driver ?? '',
})

const toSchedule = (r: Row): Schedule => ({
  id: r.id,
  date: r.date,
  clientId: r.client_id,
  wasteType: r.waste_type,
  vehicleId: r.vehicle_id ?? '',
  scheduledTime: r.scheduled_time ?? '',
  status: r.status,
  expectedAmount: r.expected_amount ?? 0,
  actualAmount: r.actual_amount ?? null,
  completedAt: r.completed_at ?? null,
  memo: r.memo ?? '',
  actualTime: r.actual_time ?? undefined,
  containers: r.containers ?? undefined,
  driverName: r.driver_name ?? undefined,
  handoverStatus: r.handover_status ?? undefined,
  handoverAt: r.handover_at ?? null,
  createdByName: (r as { created_by_name?: string }).created_by_name ?? '',
  createdVia: (r as { created_via?: string }).created_via ?? '',
  createdBy: (r as { created_by?: string | null }).created_by ?? null,
  createdAt: (r as { created_at?: string }).created_at ?? '',
  eventId: r.event_id ?? null,
  origin: r.origin ?? 'field',
  //  0058 이전 서버에는 이 칸이 없습니다 — 없으면 없는 대로 둡니다.
  bookedAt: r.booked_at ?? null,
  //  0059 이전 서버에는 이 칸이 없습니다 — 없으면 「안 무른 것」입니다.
  canceledAt: r.canceled_at ?? null,
  cancelReason: r.cancel_reason ?? '',
})

const toMaterial = (r: Row): MaterialSupply => ({
  id: r.id,
  date: r.date,
  clientId: r.client_id,
  boxCount: r.box_count ?? 0,
  vinylCount: r.vinyl_count ?? 0,
  needleBoxCount: r.needle_box_count ?? 0,
  isAdditionalRequest: !!r.is_additional_request,
  memo: r.memo ?? '',
  items: r.items ?? undefined,
})

const toPayment = (r: Row): Payment => ({
  id: r.id,
  clientId: r.client_id,
  billingMonth: r.billing_month,
  amount: r.amount ?? 0,
  status: r.status,
  method: r.method,
  paidAt: r.paid_at ?? null,
  memo: r.memo ?? '',
  snapshot: r.snapshot ?? null,
  canceledAt: r.canceled_at ?? null,
})

const toNote = (r: Row): SiteNote => ({
  id: r.id,
  clientId: r.client_id,
  kind: r.kind,
  content: r.content,
  createdAt: r.created_at,
  done: !!r.done,
})

const toEvent = (r: Row): CollectionEvent => ({
  id: r.id,
  at: r.at,
  // 실사용에서는 실제 로그인 사용자 이름·역할이 들어갑니다.
  role: (r.actor_role === 'field' ? '현장 담당자' : '관리자') as CollectionEvent['role'],
  screen: r.screen ?? '',
  action: r.action,
  scheduleId: r.schedule_id ?? '',
  createdSchedule: !!r.created_schedule,
  clientId: r.client_id ?? '',
  clientName: r.client_name ?? '',
  wasteType: r.waste_type,
  amountKg: r.amount_kg ?? 0,
  before: r.before_state ?? { status: '예정', actualAmount: null, handoverStatus: null },
  materialIds: r.material_ids ?? [],
  stockBefore: r.stock_before ?? { ...DEFAULT_OFFICE_STOCK },
  requestUpdates: r.request_updates ?? [],
  note: r.note ?? '',
  reverted: !!r.reverted,
  revertedAt: r.reverted_at ?? null,
  demoSessionId: r.demo_session_id ?? null,
  inputDurationMs: r.input_duration_ms ?? null,
})

const toRequest = (r: Row): ClientRequest => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.clients?.name ?? '',
  kind: r.kind,
  content: r.content ?? '',
  desiredDate: r.desired_date ?? null,
  urgent: !!r.urgent,
  status: r.status,
  source: r.source ?? 'portal',
  requesterName: r.requester_name ?? '',
  reply: r.reply ?? '',
  snoozedUntil: (r as { snoozed_until?: string | null }).snoozed_until ?? null,
  snoozeReason: (r as { snooze_reason?: string }).snooze_reason ?? '',
  handledBy: r.handled_by ?? null,
  handledAt: r.handled_at ?? null,
  createdAt: r.created_at,
  demoSessionId: r.demo_session_id ?? null,
})

const toInquiry = (r: Row): ClientInquiry => ({
  id: r.id,
  clientId: r.client_id,
  clientName: (r as { clients?: { name?: string } }).clients?.name ?? '',
  topic: r.topic,
  subject: r.subject ?? '',
  body: r.body ?? '',
  status: r.status,
  reply: r.reply ?? '',
  askedByName: r.asked_by_name ?? '',
  handledBy: r.handled_by ?? null,
  handledAt: r.handled_at ?? null,
  createdAt: r.created_at,
  demoSessionId: r.demo_session_id ?? null,
})

const toLead = (r: Row): SalesLead => ({
  id: r.id,
  key: r.key,
  clientId: r.client_id,
  clientName: r.client_name ?? '',
  kind: r.kind,
  title: r.title ?? '',
  month: r.month,
  estValue: r.est_value ?? 0,
  stage: r.stage,
  actualRevenue: r.actual_revenue ?? null,
  actualRevenueAt: r.actual_revenue_at ?? null,
  history: (r.sales_lead_events ?? []).map((h: Row) => ({ stage: h.stage, at: h.at })),
  createdAt: r.created_at,
  demoSessionId: r.demo_session_id ?? null,
  sharedWithClient: !!r.shared_with_client,
  sharedAt: r.shared_at ?? null,
  clientMessage: r.client_message ?? '',
  clientRespondedAt: r.client_responded_at ?? null,
})

const toStock = (r: Row | null): OfficeStock =>
  r
    ? {
        corrugatedBox: r.corrugated_box ?? 0,
        plasticContainer: r.plastic_container ?? 0,
        bag: r.bag ?? 0,
        needleBox: r.needle_box ?? 0,
      }
    : { ...DEFAULT_OFFICE_STOCK }

// ── 전체 로드 ────────────────────────────────────────────────────────────────

/**
 * 마지막 로드에서 **없어서 건너뛴** 표·칸의 이름.
 *
 *  비어 있으면 전부 제자리에 있다는 뜻입니다. 관리자 화면(위 안내 띠)이
 *  이 목록을 그대로 읽어 줍니다 — 「무엇이 없는지」를 말해 주지 않는 경고는
 *  대표님이 손을 쓸 수 없어 없는 것과 같습니다.
 */
export const missingParts: string[] = []


/**
 * 운영 데이터를 서버에서 한 번에 읽어 AppData 로 조립합니다.
 * 역할에 따라 RLS 가 일부 테이블을 막으므로(예: 현장 담당자의 미수금/매출),
 * 접근 불가 테이블은 빈 배열로 두고 화면은 정상 동작하게 합니다.
 */
export async function loadAppData(): Promise<AppData> {
  const sb = need()

  //  「없어도 화면이 도는」 표를 읽습니다.
  //
  //   여기 주석들은 오래전부터 「마이그레이션 전 환경에는 표가 없으므로 soft
  //   로 읽습니다」라고 적어 왔지만, **실제로는 권한 오류만 넘겼습니다.**
  //   그래서 RUN 파일 하나를 아직 안 올린 서버에서는 표 하나가 없다는 이유로
  //   빨간 띠가 뜨고 **대시보드 전체가 멈췄습니다** — 수거도, 청구도, 미수금도
  //   못 봤습니다. 없는 것은 없는 대로 두고 나머지는 돌아가야 합니다.
  //
  //   대신 **무엇이 없었는지는 반드시 남깁니다.** 조용히 넘기면 「운영비를
  //   넣었는데 미입력으로 보인다」 같은 일이 원인 없이 벌어집니다.
  missingParts.length = 0
  const soft = async <T>(fn: () => Promise<T>, fallback: T, what = ''): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      // RLS 로 막힌 테이블은 오류가 아니라 '권한 없음'입니다.
      const msg = e instanceof Error ? e.message : ''
      if (/row-level security|permission denied/i.test(msg)) return fallback
      //  아직 안 올린 RUN 파일 때문에 표·칸·**함수**가 없는 경우.
      //
      //   ⚠ PostgREST 는 없는 함수를 부르면 PGRST202 로 답합니다 —
      //     「Could not find the function public.xxx in the schema cache」.
      //     보통은 'schema cache' 가 들어 있어 아래 조건에 걸리지만, 서버
      //     판에 따라 그 꼬리말이 빠진 문구가 오기도 합니다. 그러면 이 함수가
      //     오류를 그대로 던지고 **자료 읽기 전체가 실패**합니다 —
      //     화면 한 칸이 비는 게 아니라 앱이 안 열립니다.
      //     실제로 0064 호환 검사에서 그렇게 걸렸습니다. 코드로도 잡습니다.
      if (/schema cache|does not exist|PGRST202|could not find the function/i.test(msg)) {
        const name = missingName(msg)
        if (what) missingParts.push(name ? `${what} (${name})` : what)
        return fallback
      }
      throw e
    }
  }

  const [clients, vehicles, schedules, materials, notes, events, stock, overrides, requests] = await Promise.all([
    // 그만둔 거래처까지 함께 읽습니다. 목록에는 활성만 넣고, 비활성은
    // 청구·수거 기록의 이름을 되찾는 데만 씁니다(아래 retiredClients).
    withRetry(async () => pageAll((f, t) => sb.from('clients').select(CLIENT_COLS).order('id').range(f, t))),
    //  사용 중지한 차량도 함께 읽습니다. 예전에는 여기서 active=true 로 걸러
    //  버려서, 실수로 「사용 중지」를 누르면 앱 어디에서도 다시 꺼낼 수
    //  없었습니다(SQL 을 직접 쓰는 수밖에). 아래에서 갈라 담습니다.
    withRetry(async () => pageAll((f, t) => sb.from('vehicles').select('*').order('id').range(f, t))),
    withRetry(async () => pageAll((f, t) => sb.from('schedules').select('*').order('id').range(f, t))),
    withRetry(async () => pageAll((f, t) => sb.from('materials').select('*').order('id').range(f, t))),
    withRetry(async () =>
      pageAll((f, t) => sb.from('site_notes').select('*').eq('archived', false).order('id').range(f, t)),
    ),
    withRetry(async () =>
      pageAll((f, t) =>
        sb.from('collection_events').select('*').order('at', { ascending: false }).order('id').range(f, t),
      ),
    ),
    withRetry(async () => unwrapOne(await sb.from('office_stock').select('*').eq('id', 1).maybeSingle())),
    //  이 표의 기본키는 id 가 아니라 request_id 입니다. 없는 칸으로 정렬하면
    //  400 이 나고, 전체 로드가 통째로 실패해 화면이 아예 안 뜹니다.
    withRetry(async () =>
      pageAll((f, t) => sb.from('request_overrides').select('*').order('request_id').range(f, t)),
    ),
    withRetry(async () =>
      pageAll((f, t) =>
        sb
          .from('client_requests')
          .select('*, clients(name)')
          .order('created_at', { ascending: false })
          .order('id')
          .range(f, t),
      ),
    ),
  ])

  //  엑셀에서 가져온 월 실적 (0025). 아직 마이그레이션을 적용하지 않은
  //  환경에서는 표가 없으므로, 실패해도 화면 전체가 멈추지 않게 soft 로 읽습니다.
  const monthlyActuals = await soft(
    async () => pageAll((f, t) => sb.from('client_monthly_actuals').select('*').order('month').range(f, t)),
    [] as Row[],
    'Excel 월 실적',
  )

  //  고객 문의 (0083). 판 82 이하에는 표가 없으므로 soft 로 읽습니다 —
  //  없으면 「문의가 아직 없다」와 같은 상태이고, 화면은 그대로 뜹니다.
  //  ⚠ 병원 계정에는 RLS 가 **자기 병원 것만** 내려 줍니다.
  const inquiryRows = await soft(
    async () =>
      pageAll((f, t) =>
        sb
          .from('client_inquiries')
          .select('*, clients(name)')
          .order('created_at', { ascending: false })
          .order('id')
          .range(f, t),
      ),
    [] as Row[],
    '고객 문의',
  )

  //  현장 의견 (0062). 현장 계정에는 **자기가 낸 것만** 내려옵니다(RLS).
  //  마이그레이션 전 환경에는 표가 없으므로 soft 로 읽습니다.
  const feedbackRows = await soft(
    async () =>
      pageAll((f, t) =>
        sb.from('schedule_feedback').select('*').order('created_at', { ascending: false }).range(f, t),
      ),
    [] as Row[],
    '현장 의견',
  )

  //  월 매출 직접입력·조정 (0038). 현장은 RLS 로 막혀 있고, 마이그레이션 전
  //  환경에는 표가 없으므로 soft 로 읽습니다 — 없으면 조정이 없는 것과 같습니다.
  const revenueOverrides = await soft(
    async () => pageAll((f, t) => sb.from('revenue_overrides').select('*').order('month').range(f, t)),
    [] as Row[],
    '매출 직접입력',
  )

  //  파는 소모품과 주문 (0048). 병원은 RLS 로 자기 주문만 내려받습니다.
  //
  //  ⚠ **별표(*)를 쓰지 않습니다.** 0064 가 매입원가 칸을 잠그면, 별표는
  //    「있는 칸 전부」라서 그 요청이 통째로 permission denied 로 거절됩니다.
  //    그러면 소모품 화면이 빈 화면이 아니라 **오류**가 됩니다.
  //    (0063 이 거래처에서 똑같은 함정을 만들었습니다 — 그때 배운 대로 씁니다)
  //    칸 이름을 적어 두면 잠그기 전에도 후에도 똑같이 돕니다.
  const products = await soft(
    async () => pageAll((f, t) => sb.from('products').select(PRODUCT_COLS).order('sort').range(f, t)),
    [] as Row[],
    '소모품 상품',
  )

  //  매입원가는 **따로** 받습니다 — 사무실·관리자만 받습니다.
  //
  //   0064 뒤에는 product_costs() 로 옵니다. 아직 0064 를 안 돌린 판(63)
  //   에서는 그 함수가 없으므로, 예전처럼 표에서 그 칸만 다시 읽습니다.
  //   둘 다 soft 라 **어느 쪽이 없어도 화면이 안 깨집니다.**
  //   (현장·병원은 어느 길로도 못 받습니다 — 빈 값이고 오류가 아닙니다)
  const costRows = await soft(
    async () => unwrap<Row[]>(await sb.rpc('product_costs')),
    null as Row[] | null,
  )
  const costFallback =
    costRows == null
      ? await soft(
          async () => pageAll((f, t) => sb.from('products').select('id, cost_price').order('id').range(f, t)),
          [] as Row[],
        )
      : []
  const costById = new Map<string, number | null>(
    [...(costRows ?? []), ...costFallback].map((r) => [
      String(r.id),
      r.cost_price == null ? null : Number(r.cost_price),
    ]),
  )
  const orderRows = await soft(
    async () => pageAll((f, t) => sb.from('product_orders').select('*').order('requested_at').range(f, t)),
    [] as Row[],
    '소모품 주문',
  )
  const orderItemRows = await soft(
    async () => pageAll((f, t) => sb.from('product_order_items').select('*').order('id').range(f, t)),
    [] as Row[],
    '소모품 주문 품목',
  )

  //  우리 직원 명부 (0047). 이름·담당만 담고 주민등록번호는 담지 않습니다.
  //
  //  ⚠ 여기도 별표를 쓰지 않습니다. 그리고 **정렬도 바꿉니다** —
  //    예전에는 insured_from 으로 정렬했는데, 0064 가 그 칸을 잠그면
  //    **정렬만으로도** 요청이 거절됩니다(칸을 안 읽어도 정렬에 쓰면 권한이
  //    필요합니다). 이름으로 정렬합니다.
  //  ── 공용 차량 예약 (0070) ───────────────────────────────────────────────
  //   ⚠ 판 69 이하에는 이 표가 없습니다. soft() 가 「없는 표」를 삼키고 빈
  //     배열을 돌려주므로, DB 를 아직 안 올리셨어도 앱이 안 깨집니다.
  //   ⚠ 병원 계정에는 서버가 아무것도 안 줍니다(RLS). 화면에서 거르지
  //     않습니다 — 화면에서 거르면 「화면엔 없는데 서버는 주더라」가 됩니다.
  const reservations = await soft(
    async () =>
      pageAll((f, t) =>
        sb.from('vehicle_reservations').select('id, vehicle_id, date, profile_id, profile_name, note').order('date').range(f, t)),
    [] as Row[],
  )

  const staff = await soft(
    async () => pageAll((f, t) => sb.from('staff').select(STAFF_COLS).order('name').range(f, t)),
    [] as Row[],
    '직원 명부',
  )

  //  4대보험 자격취득일은 **관리자만** 봅니다 (0064). 상품 원가와 같은 방식 —
  //  새 함수가 있으면 그쪽에서, 아직 없으면 예전처럼 표에서. 둘 다 soft 입니다.
  const hrRows = await soft(
    async () => unwrap<Row[]>(await sb.rpc('staff_hr')),
    null as Row[] | null,
  )
  const hrFallback =
    hrRows == null
      ? await soft(
          async () =>
            pageAll((f, t) => sb.from('staff').select('id, insured_from, insurance').order('id').range(f, t)),
          [] as Row[],
        )
      : []
  const hrById = new Map<string, { insured_from: unknown; insurance: unknown }>(
    [...(hrRows ?? []), ...hrFallback].map((r) => [
      String(r.id),
      { insured_from: r.insured_from, insurance: r.insurance },
    ]),
  )

  //  국세청 신고 매출 (0047). 현장은 RLS 로 막혀 있고, 마이그레이션 전
  //  환경에는 표가 없으므로 soft 로 읽습니다 — 없으면 그 칸이 안 뜹니다.
  const taxFilings = await soft(
    async () => pageAll((f, t) => sb.from('tax_filings').select('*').order('period_from').range(f, t)),
    [] as Row[],
    '국세청 신고 매출',
  )

  //  휴무일 (0034). 마이그레이션 전 환경에는 표가 없으므로 soft 로 읽습니다 —
  //  없으면 빈 목록이고, 편성은 지금까지와 똑같이 동작합니다.
  const holidays = await soft(
    async () => pageAll((f, t) => sb.from('holidays').select('*').order('day').range(f, t)),
    [] as Row[],
    '휴무일',
  )

  //  마감 표시 (0054). 사람이 「보냈다/발행했다」고 누른 기록입니다.
  //  없으면 지금까지와 똑같이 「준비됨」에 머뭅니다 — 시스템이 스스로
  //  「보냈다」로 채우지 않습니다.
  const monthCloseMarks = await soft(
    async () => pageAll((f, t) => sb.from('month_close_marks').select('*').order('month').range(f, t)),
    [] as Row[],
    '마감 표시',
  )

  //  담당 기사 배정 (0056). 마이그레이션 전 환경에는 표가 없으므로 soft 로
  //  읽습니다 — 없으면 빈 목록이고, 지금까지처럼 전부 보입니다.
  const clientAssignments = await soft(
    async () => pageAll((f, t) => sb.from('client_assignments').select('*').order('assigned_at').range(f, t)),
    [] as Row[],
    '담당 기사 배정',
  )

  //  사전 등록(초대) 명단 (0056). 관리자만 읽을 수 있습니다 — 다른 역할은
  //  RLS 가 막으므로 빈 목록으로 옵니다.
  const staffInvites = await soft(
    async () => pageAll((f, t) => sb.from('staff_invites').select('*').order('created_at').range(f, t)),
    [] as Row[],
    '사전 등록 명단',
  )

  //  거래처의 돈 칸 (0063). 서버가 clients 에서 **열 단위로** 회수했기 때문에
  //  사무실·관리자는 여기로 받습니다. 현장에는 빈 배열이 옵니다.
  //
  //  ⚠ 0063 을 아직 안 올린 서버에는 이 함수가 없습니다. 그때는 `clients` 에
  //    돈 칸이 아직 열려 있어 위에서 이미 읽힙니다 — soft 로 조용히 넘어가고
  //    화면은 지금까지처럼 돕니다.
  const billingTerms = await soft(
    async () => {
      const { data, error } = await sb.rpc('client_billing_terms')
      if (error) throw new Error(error.message)
      return (data ?? []) as BillingTerm[]
    },
    [] as BillingTerm[],
    '거래처 단가·결제조건',
  )

  //  거래처 단가의 판 (0036). 현장은 RLS 로 막혀 있고, 마이그레이션 전
  //  환경에는 표가 없으므로 soft 로 읽습니다 — 없으면 지금 단가를 씁니다.
  const clientPrices = await soft(
    async () => pageAll((f, t) => sb.from('client_prices').select('*').order('effective_from').range(f, t)),
    [] as Row[],
    '단가 이력',
  )

  //  월 운영비 (0030). 현장 담당자는 RLS 로 막혀 있고, 마이그레이션 전
  //  환경에는 표가 없으므로 soft 로 읽습니다.
  const operatingCosts = await soft(
    async () => pageAll((f, t) => sb.from('operating_costs').select('*').order('month').range(f, t)),
    [] as Row[],
    '월 운영비',
  )

  //  입금 기록 (0026). 현장 담당자는 RLS 로 막혀 있으므로 soft 로 읽습니다.
  const receipts = await soft(
    async () => pageAll((f, t) => sb.from('payment_receipts').select('*').order('received_on').range(f, t)),
    [] as Row[],
    '입금 기록',
  )

  const payments = await soft(
    async () => pageAll((f, t) => sb.from('payments').select('*').order('id').range(f, t)),
    [] as Row[],
    '청구',
  )
  const leads = await soft(
    async () =>
      pageAll((f, t) =>
        sb.from('sales_leads').select('*, sales_lead_events(stage, at)').order('id').range(f, t),
      ),
    [] as Row[],
  )
  const baselineRow = await soft(
    async () => unwrapOne(await sb.from('performance_baselines').select('*').eq('id', 1).maybeSingle()),
    null as Row | null,
  )
  const experimentRow = await soft(
    async () => unwrapOne(await sb.from('experiment_settings').select('*').eq('id', 1).maybeSingle()),
    null as Row | null,
  )

  return {
    //  돈 칸은 별도 통로로 받아 붙입니다 (0063). 현장에는 안 붙습니다.
    clients: applyTerms(clients.filter((c) => c.active).map(toClient), billingTerms),
    retiredClients: applyTerms(clients.filter((c) => !c.active).map(toClient), billingTerms),
    vehicles: vehicles.filter((v) => v.active).map(toVehicle),
    retiredVehicles: vehicles.filter((v) => !v.active).map(toVehicle),
    //  ⚠ 이름은 **예약하는 순간 서버가 그 줄에 적어 둔 값**입니다 (0076).
    //    여기서 프로필을 다시 읽지 않습니다 — 그 권한을 열면 기사님이 남의
    //    개인정보를 전부 읽게 됩니다. 판 75 이하에는 빈 문자열로 옵니다.
    vehicleReservations: reservations.map((r) => ({
      id: String(r.id),
      vehicleId: String(r.vehicle_id),
      date: String(r.date),
      profileId: String(r.profile_id),
      who: String(r.profile_name ?? ''),
      note: String(r.note ?? ''),
    })),
    receipts: receipts.map(
      (r): PaymentReceipt => ({
        id: r.id,
        paymentId: r.payment_id,
        receivedOn: r.received_on,
        amount: Number(r.amount ?? 0),
        method: r.method,
        memo: r.memo ?? '',
        actorName: r.actor_name ?? '',
        createdAt: r.created_at,
        sourceRef: r.source_ref ?? null,
      }),
    ),
    products: products.map(
      (r): Product => ({
        id: r.id,
        name: r.name,
        spec: r.spec ?? '',
        unit: r.unit ?? '개',
        salePrice: Number(r.sale_price ?? 0),
        //  ⚠ 원가는 **못 받을 수도 있습니다** (현장·병원은 못 봅니다).
        //     그때 0 으로 채우면 「원가 0원 = 이익 100%」라는 거짓말이 됩니다.
        //     모르면 null 입니다 — 화면이 「모름」이라고 적습니다.
        costPrice: costById.has(String(r.id)) ? costById.get(String(r.id)) ?? null : null,
        stockKey: r.stock_key ?? null,
        available: !!r.available,
        imageUrl: r.image_url ?? '',
        description: r.description ?? '',
        active: !!r.active,
        category: (r.category as string) ?? '',
        sort: Number(r.sort ?? 0),
      }),
    ),
    productOrders: orderRows.map(
      (r): ProductOrder => ({
        id: r.id,
        clientId: r.client_id,
        status: r.status,
        requesterName: r.requester_name ?? '',
        source: r.source ?? 'portal',
        note: r.note ?? '',
        deliverScheduleId: r.deliver_schedule_id ?? null,
        deliverOn: r.deliver_on ?? null,
        requestedAt: r.requested_at,
        confirmedAt: r.confirmed_at ?? null,
        deliveredAt: r.delivered_at ?? null,
        canceledAt: r.canceled_at ?? null,
        cancelReason: r.cancel_reason ?? '',
        items: orderItemRows
          .filter((i) => i.order_id === r.id)
          .map((i): ProductOrderItem => ({
            id: Number(i.id),
            orderId: i.order_id,
            productId: i.product_id ?? null,
            name: i.name,
            spec: i.spec ?? '',
            unit: i.unit ?? '개',
            qty: Number(i.qty ?? 0),
            unitPrice: Number(i.unit_price ?? 0),
            unitCost: Number(i.unit_cost ?? 0),
            stockKey: i.stock_key ?? null,
          })),
      }),
    ),
    staff: staff.map(
      (r): Staff => ({
        id: r.id,
        name: r.name,
        position: r.position,
        wasteScope: r.waste_scope,
        //  자격취득일·보험 상세는 관리자만 받습니다 (0064). 못 받으면 null —
        //  「없다」가 아니라 「이 계정은 볼 수 없다」입니다.
        insuredFrom: (hrById.get(String(r.id))?.insured_from as string | null | undefined) ?? null,
        insurance: (hrById.get(String(r.id))?.insurance ?? {}) as Record<string, string | null>,
        active: !!r.active,
        note: r.note ?? '',
      }),
    ),
    taxFilings: taxFilings.map(
      (r): TaxFiling => ({
        id: Number(r.id),
        periodFrom: r.period_from,
        periodTo: r.period_to,
        baseTotal: Number(r.base_total ?? 0),
        baseTaxed: Number(r.base_taxed ?? 0),
        baseExempt: Number(r.base_exempt ?? 0),
        taxPayable: Number(r.tax_payable ?? 0),
        sourceNo: r.source_no ?? '',
        issuedOn: r.issued_on ?? null,
        note: r.note ?? '',
        //  0050 이전 서버에는 이 칸이 없습니다 — 없으면 「아직 확인 안 함」입니다.
        confirmedAt: (r.confirmed_at as string | null) ?? null,
      }),
    ),
    revenueOverrides: revenueOverrides.map(
      (r): RevenueOverride => ({
        id: r.id,
        clientId: r.client_id,
        month: r.month,
        amount: Number(r.amount ?? 0),
        reason: r.reason ?? '',
        actorName: r.actor_name ?? '',
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? r.created_at,
      }),
    ),
    scheduleFeedback: feedbackRows.map(
      (r): ScheduleFeedback => ({
        id: r.id,
        scheduleId: r.schedule_id,
        clientId: r.client_id,
        kind: r.kind,
        body: r.body ?? '',
        status: r.status,
        reply: r.reply ?? '',
        createdBy: r.created_by ?? null,
        createdAt: r.created_at,
        handledAt: r.handled_at ?? null,
      }),
    ),
    monthlyActuals: monthlyActuals.map(
      (r): ClientMonthlyActual => ({
        id: r.id,
        clientId: r.client_id,
        month: r.month,
        medicalKg: Number(r.medical_kg ?? 0),
        diaperKg: Number(r.diaper_kg ?? 0),
        revenue: Number(r.revenue ?? 0),
        cost: Number(r.cost ?? 0),
        profit: Number(r.profit ?? 0),
        hasDated: Boolean(r.has_dated),
        sourceFile: r.source_file ?? '',
      }),
    ),
    holidays: holidays.map((r): Holiday => ({ day: r.day, name: r.name ?? '' })),
    monthCloseMarks: monthCloseMarks.map((r): MonthCloseMark => ({
      month: r.month, step: r.step as MonthCloseStep,
      markedAt: r.marked_at ?? '', markedName: r.marked_name ?? '', note: r.note ?? '',
    })),
    clientAssignments: clientAssignments.map((r): ClientAssignment => ({
      clientId: r.client_id, profileId: r.profile_id, assignedAt: r.assigned_at ?? '',
    })),
    staffInvites: staffInvites.map((r): StaffInvite => ({
      email: r.email, name: r.name ?? '', role: r.role,
      vehicleId: r.vehicle_id ?? null, clientIds: r.client_ids ?? [],
      note: r.note ?? '', createdAt: r.created_at ?? '', usedAt: r.used_at ?? null,
    })),
    clientPrices: clientPrices.map(
      (r): ClientPrice => ({
        id: r.id,
        clientId: r.client_id,
        effectiveFrom: r.effective_from,
        pricing: r.pricing ?? {},
        memo: r.memo ?? '',
        actorName: r.actor_name ?? '',
        createdAt: r.created_at,
      }),
    ),
    operatingCosts: operatingCosts.map(
      (r): OperatingCost => ({
        id: r.id,
        month: r.month,
        category: r.category,
        amount: Number(r.amount ?? 0),
        memo: r.memo ?? '',
        actorName: r.actor_name ?? '',
        updatedAt: r.updated_at,
      }),
    ),
    schedules: schedules.map(toSchedule),
    materials: materials.map(toMaterial),
    payments: payments.map(toPayment),
    officeStock: toStock(stock),
    events: events.map(toEvent),
    requestOverrides: overrides.map(
      (r): RequestOverride => ({
        requestId: r.request_id,
        status: r.status,
        changedAt: r.changed_at,
        by: r.by ?? '',
      }),
    ),
    notes: notes.map(toNote),
    requests: requests.map(toRequest),
    inquiries: inquiryRows.map(toInquiry),
    baseline: baselineRow
      ? {
          adminMinutesPerCollection: baselineRow.admin_minutes_per_collection,
          repeatEntriesPerCollection: baselineRow.repeat_entries_per_collection,
          monthlyDocHours: baselineRow.monthly_doc_hours,
          monthlyReworkCount: baselineRow.monthly_rework_count,
          dailyCapacity: baselineRow.daily_capacity,
          source: baselineRow.source ?? 'user',
          updatedAt: baselineRow.updated_at ?? null,
        }
      : { ...EMPTY_BASELINE },
    experiment: experimentRow ? { startDate: experimentRow.start_date ?? null } : { ...EMPTY_EXPERIMENT },
    leads: leads.map(toLead),
    // 실제 운영 모드에서는 시연 세션 개념을 쓰지 않습니다(=null).
    demoSession: null,
  }
}

// ── 거래처 ───────────────────────────────────────────────────────────────────
const clientRow = (c: Partial<Client>) => ({
  name: c.name,
  type: c.type,
  address: c.address,
  manager: c.manager,
  phone: c.phone,
  collection_cycle: c.collectionCycle,
  collects_medical_waste: c.collectsMedicalWaste,
  collects_diaper: c.collectsDiaper,
  storage_size: c.storageSize,
  note: c.note,
  education_at: c.educationAt,
  contract_start: c.contractStart,
  contract_end: c.contractEnd,
  payment_terms: c.paymentTerms,
  payment_due_day: c.paymentDueDay,
  monthly_flat_fee: c.monthlyFlatFee,
  pricing: c.pricing,
  biz_no: c.bizNo,
  biz_ceo: c.bizCeo,
  biz_type: c.bizType,
  biz_item: c.bizItem,
  tax_email: c.taxEmail,
  vat_mode: c.vatMode,
  flat_fee_when_empty: c.flatFeeWhenEmpty,
  collect_time: c.collectTime,
  disposal_site: c.disposalSite,
  diaper_cycle: c.diaperCycle,
})

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

/** 이미 있는 거래처와 부딪혔을 때 — 화면이 「그 거래처를 쓰시겠습니까」로 받습니다 */
export class DuplicateClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateClientError'
  }
}

export interface CreateClientResult {
  id: string
  /** 같은 저장 시도가 이미 들어와 있었음 — 새로 만들지 않았습니다 */
  alreadySaved: boolean
  /** 「다른 병원입니다」로 만든 경우, 무엇과 부딪혔는지 */
  duplicates: { id: string; name: string; active: boolean }[]
}

/**
 * 거래처 등록 (0045).
 *
 *  표에 직접 넣던 길은 서버에서 닫았습니다. 같은 이름이 이미 있으면 서버가
 *  이름을 대고 멈춥니다 — 화면이 먼저 확인하더라도 두 사람이 같은 순간에
 *  누르는 경우는 서버만 막을 수 있습니다.
 *
 *  `allowDuplicate` 는 사람이 「정말 다른 병원입니다」라고 확인했을 때만
 *  켭니다. 그 판단은 서버 기록에 남습니다.
 */
export async function createClient(
  c: Omit<Client, 'id'>,
  opts?: { allowDuplicate?: boolean; requestId?: string | null },
): Promise<CreateClientResult> {
  const sb = need()
  const { data, error } = await sb.rpc('create_client', {
    p_client: clean(clientRow(c)),
    p_allow_duplicate: opts?.allowDuplicate ?? false,
    p_request_id: opts?.requestId ?? null,
  })
  if (error) {
    if (/이미 같은 이름의 거래처가 있습니다/.test(error.message ?? '')) {
      throw new DuplicateClientError(error.message)
    }
    throw new Error(error.message)
  }
  return data as CreateClientResult
}

// ── 소모품 판매 (0048) ───────────────────────────────────────────────────────

/** 병원 주문 올리기. 금액은 서버가 상품표를 보고 계산합니다 */
export async function requestProductOrder(input: {
  clientId: string
  items: { productId: string; qty: number }[]
  note?: string
  deliverScheduleId?: string | null
  deliverOn?: string | null
  requestId?: string | null
}): Promise<{ id: string; alreadySaved: boolean; itemCount: number; total: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('request_product_order', {
    p_client_id: input.clientId,
    p_items: input.items,
    p_note: input.note ?? '',
    p_deliver_schedule_id: input.deliverScheduleId ?? null,
    p_deliver_on: input.deliverOn ?? null,
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; alreadySaved: boolean; itemCount: number; total: number }
}

/**
 * 주문 상태 옮기기.
 *  재고는 서버가 **전달완료에서 한 번만** 뺍니다 — 화면이 재고를 건드리지
 *  않습니다. 다시 눌러도 `alreadyDone: true` 로 조용히 끝납니다.
 */
export async function setProductOrderStatus(
  orderId: string,
  status: ProductOrderStatus,
  reason = '',
): Promise<{ status: string; alreadyDone: boolean; stockMoved: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('set_product_order_status', {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data as { status: string; alreadyDone: boolean; stockMoved: boolean }
}

export async function upsertProduct(p: Partial<Product> & { name: string }): Promise<{ id: string }> {
  const sb = need()
  const { data, error } = await sb.rpc('upsert_product', {
    p_id: p.id ?? null,
    p_name: p.name,
    p_spec: p.spec ?? '',
    p_unit: p.unit ?? '개',
    p_sale: p.salePrice ?? 0,
    p_cost: p.costPrice ?? 0,
    p_stock_key: p.stockKey ?? null,
    p_available: p.available ?? true,
    p_desc: p.description ?? '',
    p_image: p.imageUrl ?? '',
    p_category: p.category ?? '',
  })
  if (error) throw new Error(error.message)
  return data as { id: string }
}

/**
 * 신고 한 줄을 「확정」으로 표시하거나 되돌립니다 (0050).
 *
 *  숫자는 건드리지 않습니다 — 「이 숫자가 확정 신고분인가」만 기록합니다.
 *  종이(증명서 발급일)만으로는 알 수 없고, 아는 사람은 대표님뿐입니다.
 */
export async function setTaxFilingConfirmed(id: number, confirmed: boolean): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('set_tax_filing_confirmed', { p_id: id, p_confirmed: confirmed })
  if (error) throw new Error(error.message)
}

/**
 * 「보냈습니다 / 발행했습니다」 표시 (0054).
 *
 *  누가 눌렀는지는 **보내지 않습니다** — 서버가 로그인한 사람에서 채웁니다.
 *  화면이 보내면 남의 이름으로 표시할 수 있습니다.
 */
export async function setMonthCloseMark(
  month: string,
  step: MonthCloseStep,
  done: boolean,
  note = '',
): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('set_month_close_mark', {
    p_month: month, p_step: step, p_done: done, p_note: note,
  })
  if (error) throw new Error(error.message)
}

// ── 담당 기사 배정 · 사전 등록 (0056) ───────────────────────────────────────
//
//  네 함수 모두 **관리자만** 부를 수 있고, 그 확인은 서버가 다시 합니다.
//  화면에서 버튼을 숨기는 것으로 끝내지 않습니다.

/**
 * 이 거래처의 담당 기사 **목록 전체**를 바꿉니다.
 *
 *  하나씩 넣고 빼는 길을 두지 않은 이유 — 화면에서 두 번 눌렀는데 한 번만
 *  닿으면 화면과 서버가 어긋난 채로 남습니다. 통째로 보내면 마지막에 보낸
 *  것이 그대로 서버 상태입니다.
 *
 *  빈 배열을 보내면 배정이 사라지고, 그 기사는 다시 전 거래처를 봅니다.
 */
export async function setClientDrivers(clientId: string, profileIds: string[]): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('set_client_drivers', {
    p_client_id: clientId, p_profiles: profileIds,
  })
  if (error) throw new Error(error.message)
}

/** 사전 등록(초대) 만들기·고치기. 비밀번호는 보내지 않습니다 — 본인이 정합니다 */
export async function upsertStaffInvite(input: {
  email: string
  name: string
  role: 'admin' | 'office' | 'field'
  vehicleId?: string | null
  clientIds?: string[]
  note?: string
}): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('upsert_staff_invite', {
    p_email: input.email,
    p_name: input.name,
    p_role: input.role,
    p_vehicle_id: input.vehicleId ?? null,
    p_client_ids: input.clientIds ?? [],
    p_note: input.note ?? '',
  })
  if (error) throw new Error(error.message)
}

/** 아직 가입에 안 쓰인 초대만 지웁니다 (쓰인 것은 기록으로 남습니다) */
export async function deleteStaffInvite(email: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('delete_staff_invite', { p_email: email })
  if (error) throw new Error(error.message)
}

/** 계정에 차량을 묶습니다 (null 이면 해제) */
export async function setProfileVehicle(profileId: string, vehicleId: string | null): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('set_profile_vehicle', {
    p_profile_id: profileId, p_vehicle_id: vehicleId,
  })
  if (error) throw new Error(error.message)
}

export interface ProductSales {
  from: string
  to: string
  orders: number
  clients: number
  revenue: number
  cost: number
  profit: number
  /** 수거 방문에 실어 보낸 주문 수 — 이 사업모델이 실제로 도는지의 지표 */
  withPickup: number
  //  아래 둘은 0049 부터 옵니다. 그 전 서버에서는 **없습니다** — 없는 것을
  //  0 으로 바꿔 보여 주면 「아무도 다시 안 샀다」는 거짓말이 됩니다.
  /** 그전에도 받아 간 적이 있는 거래처 수 — 한 번은 호의, 두 번째부터가 매출 */
  repeatClients?: number
  /** 그 거래처의 첫 주문이 아닌 주문 수 */
  repeatOrders?: number
}

/** 판매 실적 — **전달완료만** 셉니다. 수거 매출과 섞지 않습니다 */
export async function productSales(from: string, to: string): Promise<ProductSales | null> {
  const sb = supabase
  if (!sb) return null
  const { data, error } = await sb.rpc('product_sales_summary', { p_from: from, p_to: to })
  if (error) return null
  const r = data as Partial<ProductSales> | null
  if (!r || typeof r.revenue !== 'number') return null
  return r as ProductSales
}

/** 등록 직후 화면이 쓰는 거래처 한 줄 */
export async function clientById(id: string): Promise<Client | null> {
  const sb = need()
  const row = unwrapOne(await sb.from('clients').select(CLIENT_COLS).eq('id', id).maybeSingle())
  return row ? toClient(row) : null
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const sb = need()
  unwrap(await sb.from('clients').update(clean(clientRow(patch))).eq('id', id).select('id'))
}

/** hard delete 대신 비활성화 — 과거 수거 이력이 끊기지 않게 합니다. */
export async function deactivateClient(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('clients').update({ active: false }).eq('id', id).select('id'))
}

/** 거래 종료를 되돌립니다 — 잘못 누른 것을 SQL 없이 되살릴 수 있어야 합니다. */
export async function reactivateClient(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('clients').update({ active: true }).eq('id', id).select('id'))
}

// ── 차량 ─────────────────────────────────────────────────────────────────────
// 차량이 한 대도 없으면 수거 완료 입력 자체가 불가능하므로(배차 차량 필수),
// 실사용 전환 시 반드시 앱에서 등록할 수 있어야 합니다.
const vehicleRow = (v: Partial<Vehicle>) => ({
  name: v.name,
  waste_type: v.wasteType,
  tonnage: v.tonnage,
  nominal_capacity: v.nominalCapacity,
  expected_capacity: v.expectedCapacity,
  driver: v.driver,
})

export async function insertVehicle(v: Omit<Vehicle, 'id'>): Promise<Vehicle> {
  const sb = need()
  const row = unwrap<Row[]>(await sb.from('vehicles').insert(clean(vehicleRow(v))).select())
  return toVehicle(row[0])
}

export async function updateVehicle(id: string, patch: Partial<Vehicle>): Promise<void> {
  const sb = need()
  unwrap(await sb.from('vehicles').update(clean(vehicleRow(patch))).eq('id', id).select())
}

/** 차량도 삭제 대신 비활성화 — 과거 수거 이력의 배차 정보가 끊기지 않도록 */
export async function deactivateVehicle(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('vehicles').update({ active: false }).eq('id', id).select())
}

/** 사용 중지를 되돌립니다 — 실수로 눌러도 앱 안에서 되살릴 수 있어야 합니다. */
export async function reactivateVehicle(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('vehicles').update({ active: true }).eq('id', id).select())
}

// ── 수거일정 ─────────────────────────────────────────────────────────────────
const scheduleRow = (s: Partial<Schedule>) => ({
  date: s.date,
  client_id: s.clientId,
  waste_type: s.wasteType,
  vehicle_id: s.vehicleId || null,
  scheduled_time: s.scheduledTime,
  status: s.status,
  expected_amount: s.expectedAmount,
  actual_amount: s.actualAmount,
  memo: s.memo,
})

/**
 * 날짜를 정해 방문을 잡습니다 (0058).
 *
 *  ⚠ 표에 직접 넣지 않고 서버 함수를 부릅니다. 지난 날짜·먼 미래·안 하는
 *  구분·중복 같은 판단이 **서버 한 곳에** 있어야 화면을 우회해도 지켜집니다.
 *  화면에서만 막으면 새로고침 두 번으로 뚫립니다.
 *
 *  requestId 를 함께 보내면 그 요청이 같은 트랜잭션에서 「일정 반영」으로
 *  넘어갑니다 — 방문만 생기고 요청이 「접수」로 남으면 병원 담당자가 한 번
 *  더 전화를 겁니다.
 */
export async function bookVisit(input: {
  clientId: string
  date: string
  wasteType: WasteType
  time?: string
  vehicleId?: string | null
  memo?: string
  expected?: number | null
  requestId?: string | null
  /**
   *  방문 목적 (0067). 안 주면 서버가 「정기수거」로 봅니다 —
   *  판 66 이하에서는 이 칸이 없으므로 **보내지 않습니다**(아래 참고).
   */
  purpose?: VisitPurpose
}): Promise<{ id: string; date: string; clientName: string; requestUpdated: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('book_visit', {
    p_client_id: input.clientId,
    p_date: input.date,
    p_waste_type: input.wasteType,
    p_time: input.time ?? '',
    p_vehicle_id: input.vehicleId || null,
    p_memo: input.memo ?? '',
    p_expected: input.expected ?? null,
    p_request_id: input.requestId || null,
    //  ⚠ 판 66 이하에는 이 인자가 없습니다. 늘 보내면 「그런 함수 없다」로
    //    방문 예약이 통째로 죽습니다. **줄 때만** 넣습니다.
    ...(input.purpose ? { p_purpose: input.purpose } : {}),
  })
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as Record<string, unknown>
  return {
    id: String(r.id ?? ''),
    date: String(r.date ?? input.date),
    clientName: String(r.clientName ?? ''),
    requestUpdated: !!r.requestUpdated,
  }
}

/**
 * 잡아 둔 방문을 옮깁니다 (0059).
 *
 *  time 을 안 보내면 지금 시각을 그대로 둡니다. 빈 문자열은 「지우기」입니다.
 *  vehicleId 를 명시하지 않으면 지금 차를 그대로 둡니다.
 */
/**
 * 잡아 둔 방문의 **상세**를 고칩니다 (0062) — 시각·차량·예상량·메모.
 *
 *  날짜를 옮기는 것은 moveVisit 입니다. 여기서는 날짜를 안 건드립니다 —
 *  그 달 매출이 통째로 옮겨 가는 일을 막기 위해서입니다.
 *  완료된 수거는 서버가 거부합니다(정산·청구가 거기서 나옵니다).
 */
export async function updateVisit(input: {
  scheduleId: string
  time?: string | null
  vehicleId?: string | null
  expected?: number | null
  memo?: string | null
  keepVehicle?: boolean
}): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('update_visit', {
    p_schedule_id: input.scheduleId,
    p_time: input.time ?? null,
    p_vehicle_id: input.vehicleId ?? null,
    p_expected: input.expected ?? null,
    p_memo: input.memo ?? null,
    p_keep_vehicle: input.keepVehicle ?? true,
  })
  if (error) throw new Error(error.message)
}

/** 현장 의견 내기 (0062). requestId 로 다시 눌러도 하나입니다. */
export async function submitScheduleFeedback(input: {
  scheduleId: string
  kind: string
  body: string
  requestId?: string | null
}): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('submit_schedule_feedback', {
    p_schedule_id: input.scheduleId,
    p_kind: input.kind,
    p_body: input.body,
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
}

/** 현장 의견 처리 (0062) — 사무실·관리자만. */
export async function handleScheduleFeedback(
  id: string,
  status: string,
  reply: string,
): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('handle_schedule_feedback', {
    p_id: id,
    p_status: status,
    p_reply: reply,
  })
  if (error) throw new Error(error.message)
}

/**
 * 엑셀로 가져온 월 실적 고치기 (0062).
 *
 *  ⚠ **매출이 바뀝니다.** 이익은 보내지 않습니다 — 서버가 매출 − 원가로
 *    다시 계산합니다. 확정한 청구가 있는 달은 서버가 거부합니다.
 */
export async function updateMonthlyActual(input: {
  id: string
  medicalKg?: number | null
  diaperKg?: number | null
  revenue?: number | null
  cost?: number | null
}): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('update_monthly_actual', {
    p_id: input.id,
    p_medical_kg: input.medicalKg ?? null,
    p_diaper_kg: input.diaperKg ?? null,
    p_revenue: input.revenue ?? null,
    p_cost: input.cost ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function moveVisit(input: {
  scheduleId: string
  date: string
  time?: string | null
  vehicleId?: string | null
  keepVehicle?: boolean
}): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('move_visit', {
    p_schedule_id: input.scheduleId,
    p_date: input.date,
    p_time: input.time ?? null,
    p_vehicle_id: input.vehicleId ?? null,
    p_keep_vehicle: input.keepVehicle ?? true,
  })
  if (error) throw new Error(error.message)
}

/**
 * 잡아 둔 방문을 무릅니다 (0059).
 *
 *  ⚠ 지우지 않습니다. 지우면 「그 병원이 그날 취소했다」는 사실이 사라져
 *  나중에 「왜 그 주에 안 갔냐」에 답할 근거가 없어집니다.
 *  이유는 서버가 반드시 요구합니다.
 */
export async function cancelVisit(scheduleId: string, reason: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('cancel_visit', {
    p_schedule_id: scheduleId, p_reason: reason,
  })
  if (error) throw new Error(error.message)
}

export async function insertSchedule(s: Omit<Schedule, 'id'>): Promise<Schedule> {
  const sb = need()
  const row = unwrap<Row[]>(await sb.from('schedules').insert(clean(scheduleRow(s))).select())
  return toSchedule(row[0])
}

export async function updateSchedule(id: string, patch: Partial<Schedule>): Promise<void> {
  const sb = need()
  unwrap(await sb.from('schedules').update(clean(scheduleRow(patch))).eq('id', id).select())
}

export async function deleteSchedule(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('schedules').delete().eq('id', id).select())
}

// ── 현장 메모 ────────────────────────────────────────────────────────────────
export async function insertNote(
  n: Omit<SiteNote, 'id' | 'createdAt'>,
  requestId?: string | null,
): Promise<SiteNote | null> {
  const sb = need()
  try {
    const row = unwrap<Row[]>(
      await sb
        .from('site_notes')
        .insert(
          clean({
            client_id: n.clientId, kind: n.kind, content: n.content, done: n.done,
            request_id: requestId ?? null,
          }),
        )
        .select(),
    )
    return toNote(row[0])
  } catch (e) {
    //  다시 눌러 같은 표가 온 것입니다 (0055). 이미 저장돼 있습니다.
    if (requestId && isDuplicateAttempt(e)) return null
    throw e
  }
}

export async function setNoteDone(id: string, done: boolean): Promise<void> {
  const sb = need()
  unwrap(await sb.from('site_notes').update({ done }).eq('id', id).select())
}

/** 메모도 삭제 대신 보관 처리합니다. */
export async function archiveNote(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('site_notes').update({ archived: true }).eq('id', id).select())
}

// ── 자재 ─────────────────────────────────────────────────────────────────────
export async function insertMaterial(m: Omit<MaterialSupply, 'id'>): Promise<MaterialSupply> {
  const sb = need()
  const row = unwrap<Row[]>(
    await sb
      .from('materials')
      .insert({
        date: m.date,
        client_id: m.clientId,
        box_count: m.boxCount,
        vinyl_count: m.vinylCount,
        needle_box_count: m.needleBoxCount,
        is_additional_request: m.isAdditionalRequest,
        memo: m.memo,
        items: m.items ?? null,
      })
      .select(),
  )
  return toMaterial(row[0])
}

/** 자재 입고 / 재고 조정 — 원장에 사유를 함께 남깁니다. */
/**
 * 자재 공급 기록 삭제 (0023).
 *
 *  예전에는 `from('materials').delete()` 였습니다. materials 에는 DELETE 정책이
 *  없어서 **아무도(관리자 포함) 지울 수 없었는데**, RLS 는 거부를 오류가 아니라
 *  "해당 행 없음"으로 처리합니다. 그래서 오류 없이 0건이 지워지고, 화면은
 *  성공한 줄 알고 감사기록에 「삭제」를 남겼습니다 — 실제로는 안 지워졌는데.
 *
 *  이제 서버 함수가 지웁니다. 지우면서 원장에 적힌 만큼 재고를 되돌리고,
 *  되돌린 것을 원장과 감사기록에 남깁니다. 되돌린 수량을 돌려주므로 화면에서
 *  "무엇이 얼마나 돌아왔는지" 그대로 보여 줄 수 있습니다.
 */
export async function deleteMaterial(id: string): Promise<Record<string, number>> {
  const sb = need()
  const { data, error } = await sb.rpc('delete_material', { p_material_id: id })
  if (error) throw new Error(error.message)
  return ((data as { restored?: Record<string, number> } | null)?.restored ?? {}) as Record<string, number>
}

/**
 * 자재 공급 (0043) — 기록·재고 차감·원장·감사기록을 서버가 한 번에.
 *
 *  예전에는 화면이 네 번 따로 불렀습니다. 그 사이에 통신이 끊기면 자재는
 *  기록됐는데 재고는 그대로였고, 두 사람이 같은 순간에 넣으면 한쪽 차감이
 *  통째로 사라졌습니다(화면이 아는 옛 재고 값을 절대값으로 썼기 때문에).
 *
 *  requestId 는 「같은 저장 시도」를 알려 주는 표입니다 — 통신이 끊겨 다시
 *  눌러도 두 줄이 되지 않습니다. 자재는 청구에 들어가므로 돈입니다.
 */
export async function supplyMaterials(input: {
  clientId: string
  date: string
  boxCount: number
  vinylCount: number
  needleBoxCount: number
  isAdditionalRequest?: boolean
  memo?: string
  requestId?: string | null
}): Promise<{ id: string; alreadySaved: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('supply_materials', {
    p_client_id: input.clientId,
    p_date: input.date,
    p_box: input.boxCount,
    p_vinyl: input.vinylCount,
    p_needle: input.needleBoxCount,
    p_additional: input.isAdditionalRequest ?? false,
    p_memo: input.memo ?? '',
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; alreadySaved: boolean }
}

/**
 * 규격별 자재 공급 (0075).
 *
 *  ⚠ 예전 supplyMaterials 는 박스·비닐·바늘통 **세 칸**만 보냈습니다.
 *    그러면 규격이 안 남아 정산이 대표 규격 단가를 **추정**합니다 —
 *    63L 박스와 12L 박스는 매입가가 다릅니다.
 *  ⚠ 옛 3칸은 서버가 규격에서 계산해 함께 채웁니다. 화면이 두 번 세지 않습니다.
 */
export async function supplyMaterialsItems(input: {
  clientId: string
  date: string
  items: Record<string, number>
  isAdditionalRequest?: boolean
  memo?: string
  requestId?: string | null
}): Promise<{ id: string; alreadySaved: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('supply_materials_items', {
    p_client_id: input.clientId,
    p_date: input.date,
    p_items: input.items,
    p_additional: input.isAdditionalRequest ?? false,
    p_memo: input.memo ?? '',
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; alreadySaved: boolean }
}

/**
 * 월정액 빈 달 정책을 **사람이 정했다고 기록** (0044).
 *
 *  값만 바꾸는 것이 아니라 「누가 언제 정했는지」를 남깁니다. 「아니오」도
 *  정한 것으로 남깁니다 — 안 남기면 이미 확인한 거래처를 매달 다시 묻게 됩니다.
 *
 *  0044 이전 DB 에는 이 함수가 없습니다. 그때는 `recorded: false` 로 돌려주고
 *  **다른 오류는 그대로 던집니다** — 못 저장한 것을 저장했다고 하지 않습니다.
 */
export async function setFlatFeePolicy(
  clientId: string,
  whenEmpty: boolean,
): Promise<{ recorded: boolean }> {
  const sb = need()
  const { error } = await sb.rpc('set_flat_fee_policy', {
    p_client_id: clientId,
    p_when_empty: whenEmpty,
  })
  if (error) {
    const msg = `${error.message ?? ''} ${(error as { code?: string }).code ?? ''}`
    //  PGRST202 = 그런 함수가 없음, 42883 = undefined_function
    if (/PGRST202|42883|Could not find the function|does not exist/i.test(msg)) {
      return { recorded: false }
    }
    throw new Error(error.message)
  }
  return { recorded: true }
}

/** 자재 입고 (0043) — 재고를 상대값으로 늘립니다. 동시에 넣어도 둘 다 더해집니다. */
export async function receiveStockRpc(input: {
  corrugatedBox?: number
  plasticContainer?: number
  bag?: number
  needleBox?: number
  memo?: string
  requestId?: string | null
}): Promise<{ alreadySaved: boolean; stock: Record<string, number> }> {
  const sb = need()
  const { data, error } = await sb.rpc('receive_stock', {
    p_box: input.corrugatedBox ?? 0,
    p_plastic: input.plasticContainer ?? 0,
    p_vinyl: input.bag ?? 0,
    p_needle: input.needleBox ?? 0,
    p_memo: input.memo ?? '',
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { alreadySaved: boolean; stock: Record<string, number> }
}

export interface HealthCheck {
  version: number
  ok: boolean
  missing: string[]
  checkedAt: string
}

/**
 * DB 자가진단 (0043).
 *
 *  판 번호는 「마이그레이션 파일이 끝까지 돌았다」까지만 말해 줍니다. 그 뒤에
 *  정책이 지워지거나 색인이 사라져도 숫자는 그대로입니다. 돈을 지키는 것들이
 *  실제로 있는지 서버가 세어 **없는 것을 이름으로** 돌려줍니다. 관리자만.
 */
export interface AppErrorInput {
  kind: 'save' | 'load' | 'render'
  screen?: string
  action?: string
  message?: string
  detail?: Record<string, unknown>
}

/**
 * 오류 한 건을 서버에 남깁니다 (0046).
 *
 *  **절대 예외를 올리지 않습니다.** 이 함수는 이미 오류가 난 자리에서 불립니다.
 *  여기서 또 던지면 사용자가 보던 진짜 오류가 「기록 실패」로 바뀌어 원인이
 *  가려집니다. 못 남겼으면 false 를 돌려줄 뿐, 남긴 척하지 않습니다.
 *
 *  0046 이전 DB 에는 함수가 없습니다 — 그때도 조용히 false 입니다.
 */
export async function recordAppError(e: AppErrorInput): Promise<boolean> {
  try {
    const sb = supabase
    if (!sb) return false
    const { data, error } = await sb.rpc('record_app_error', {
      p_kind: e.kind,
      p_screen: e.screen ?? '',
      p_action: e.action ?? '',
      p_message: e.message ?? '',
      p_detail: {
        ...(e.detail ?? {}),
        appSchema: EXPECTED_SCHEMA_VERSION,
        //  어떤 기기·브라우저인지 — 기사님 폰에서만 나는 문제를 가릅니다.
        agent: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 200),
      },
    })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

export interface ErrorGroup {
  kind: 'save' | 'load' | 'render'
  screen: string
  action: string
  message: string
  times: number
  last_at: string
  who: string | null
}
export interface RecentErrors {
  days: number
  total: number
  groups: ErrorGroup[]
  checkedAt: string
}

/** 최근 오류를 화면·동작·문구로 묶어서 (0046). 관리자만. */
export async function recentErrors(days = 7): Promise<RecentErrors | null> {
  const sb = supabase
  if (!sb) return null
  const { data, error } = await sb.rpc('recent_app_errors', { p_days: days })
  if (error) return null
  const r = data as Partial<RecentErrors> | null
  //  모양이 다르면 못 읽은 것으로 봅니다 — 진단 하나 때문에 설정 화면 전체를
  //  잃은 적이 있습니다 (0043 라운드).
  if (!r || !Array.isArray(r.groups) || typeof r.total !== 'number') return null
  return r as RecentErrors
}

export async function healthCheck(): Promise<HealthCheck | null> {
  const sb = supabase
  if (!sb) return null
  const { data, error } = await sb.rpc('app_health_check')
  //  0043 이전 DB 에는 이 함수가 없습니다 — 그건 「고장」이 아니라 「구버전」이고,
  //  위쪽 판 번호 안내가 이미 그 이야기를 하고 있습니다.
  if (error) return null
  //  모양이 다르면 못 읽은 것으로 봅니다.
  //
  //   여기서 그냥 통과시키면 화면이 `missing.map` 을 부르다 터지고, **설정
  //   화면 전체가 하얗게** 됩니다 — 백업도 내보내기도 못 하게 됩니다.
  //   진단 하나 때문에 나머지를 잃을 이유가 없습니다.
  const h = data as Partial<HealthCheck> | null
  if (!h || typeof h.ok !== 'boolean' || !Array.isArray(h.missing)) return null
  return h as HealthCheck
}

export async function adjustStock(
  patch: Partial<OfficeStock>,
  kind: '입고' | '조정' | '공급',
  memo: string,
  clientId?: string,
  materialId?: string,
): Promise<OfficeStock> {
  const sb = need()
  const current = toStock(unwrapOne(await sb.from('office_stock').select('*').eq('id', 1).maybeSingle()))
  const next: OfficeStock = { ...current, ...patch }
  unwrap(
    await sb
      .from('office_stock')
      .update({
        corrugated_box: next.corrugatedBox,
        plastic_container: next.plasticContainer,
        bag: next.bag,
        needle_box: next.needleBox,
      })
      .eq('id', 1)
      .select(),
  )
  const tx = (Object.keys(next) as (keyof OfficeStock)[])
    .filter((k) => next[k] !== current[k])
    .map((k) => ({
      kind,
      item: k,
      qty: next[k] - current[k],
      memo,
      ...(clientId ? { client_id: clientId } : {}),
      //  어느 공급 기록에서 나온 출고인지 이어 둡니다. 수거 입력 경로
      //  (complete_collection)도 같은 칸을 채웁니다 — 나중에 원장만 보고
      //  "이 3개가 왜 빠졌지" 를 되짚을 수 있어야 합니다.
      ...(materialId ? { material_id: materialId } : {}),
    }))
  if (tx.length) unwrap(await sb.from('material_transactions').insert(tx).select())
  return next
}

// ── 결제 / 미수금 ────────────────────────────────────────────────────────────
export async function insertPayment(p: Omit<Payment, 'id'>): Promise<Payment> {
  const sb = need()
  const row = unwrap<Row[]>(
    await sb
      .from('payments')
      .insert({
        client_id: p.clientId,
        billing_month: p.billingMonth,
        amount: p.amount,
        status: p.status,
        method: p.method,
        paid_at: p.paidAt,
        memo: p.memo,
        //  확정 당시의 정산·명세서를 그대로 담아 둡니다. 이후 단가 변경이나
        //  추가 수거가 이 청구를 바꾸지 못하게 하는 근거가 됩니다.
        snapshot: p.snapshot ?? null,
      })
      .select(),
  )
  return toPayment(row[0])
}

/**
 * 청구 내용 수정.
 *
 *  금액·청구월·명세서는 여기서 보내지 않습니다 — 확정 순간에 굳는 값이라
 *  서버(0037)가 거부합니다. 금액이 틀렸으면 취소하고 다시 확정합니다.
 *  취소도 여기가 아니라 cancelBilling 으로 합니다.
 */
export async function updatePayment(id: string, patch: Partial<Payment>): Promise<void> {
  const sb = need()
  unwrap(
    await sb
      .from('payments')
      .update(
        clean({
          status: patch.status,
          method: patch.method,
          paid_at: patch.paidAt,
          memo: patch.memo,
        }),
      )
      .eq('id', id)
      .select(),
  )
}

/**
 * 청구 취소 (0037).
 *
 *  입금이 한 건이라도 있으면 서버가 거부합니다 — 받은 돈이 어느 합계에도
 *  안 잡히는 상태가 되기 때문입니다. 상태 변경과 감사기록이 한 트랜잭션입니다.
 */
export async function cancelBilling(id: string, reason: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('cancel_billing', { p_payment_id: id, p_reason: reason })
  if (error) throw new Error(error.message)
}

/**
 * 월 매출 직접입력 · 조정 (0038).
 *
 *  사유 없이 넣지 못합니다. 기존 값이 있으면 서버가 이전 값을 함께
 *  돌려주고 감사기록에 남깁니다 — 조용히 덮어쓰지 않습니다.
 */
export async function setRevenueOverride(input: {
  clientId: string
  month: string
  amount: number
  reason: string
}): Promise<{ created: boolean; before: number | null; amount: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('set_revenue_override', {
    p_client_id: input.clientId,
    p_month: input.month,
    p_amount: input.amount,
    p_reason: input.reason,
  })
  if (error) throw new Error(error.message)
  return data as { created: boolean; before: number | null; amount: number }
}

/**
 * 거래처 삭제 (0039).
 *
 *  수거·청구·자재·요청·메모·엑셀 실적이 한 건이라도 있으면 서버가
 *  거부합니다 — 무엇 때문인지 숫자로 알려 줍니다. 그런 곳은 「거래 종료」로
 *  둡니다(기록은 그대로 남고 목록에서만 빠집니다).
 */
export async function deleteClient(id: string, reason: string): Promise<{ name: string }> {
  const sb = need()
  const { data, error } = await sb.rpc('delete_client', { p_client_id: id, p_reason: reason })
  if (error) throw new Error(error.message)
  return data as { name: string }
}

/** 매출 조정 되돌리기 (0038) — 그 달은 다시 확정 → Excel → 추정 순서로 */
export async function deleteRevenueOverride(clientId: string, month: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('delete_revenue_override', {
    p_client_id: clientId,
    p_month: month,
  })
  if (error) throw new Error(error.message)
}

// ── 병원 요청 ────────────────────────────────────────────────────────────────
// 병원 담당자가 포털에서 직접 등록하거나(source='portal'),
// 전화·카톡으로 받은 것을 비원미래가 대신 접수합니다(source='staff').
//  같은 저장 시도가 두 번 오면 두 번째는 서버 색인이 막습니다 (0055).
//  그건 오류가 아니라 **이미 저장된 것**입니다 — 그렇게 다뤄야 화면이
//  「실패했습니다」라고 거짓말하지 않습니다.
function isDuplicateAttempt(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /duplicate key|23505|_request_uniq/i.test(msg)
}

export async function insertRequest(r: {
  clientId: string
  kind: ClientRequest['kind']
  content: string
  desiredDate: string | null
  urgent: boolean
  source: ClientRequest['source']
  requesterName: string
  /** 이번 「보내기」 시도의 표. 다시 눌러도 같은 값을 보냅니다 (0055) */
  requestId?: string | null
}): Promise<void> {
  const sb = need()
  try {
    unwrap(
      await sb
        .from('client_requests')
        .insert(
          clean({
            client_id: r.clientId,
            kind: r.kind,
            content: r.content,
            desired_date: r.desiredDate,
            urgent: r.urgent,
            source: r.source,
            requester_name: r.requesterName,
            status: '접수',
            request_id: r.requestId ?? null,
          }),
        )
        .select(),
    )
  } catch (e) {
    //  다시 눌러 같은 표가 온 것입니다. 이미 들어가 있으니 성공입니다.
    if (r.requestId && isDuplicateAttempt(e)) return
    throw e
  }
}

// ── 고객 문의 (0083) ────────────────────────────────────────────────────────

/**
 * 병원이 문의를 올립니다.
 *
 *  ⚠ 상태·답변은 **보내지 않습니다.** 서버 RLS 가 「접수 · 답 없음」만
 *    받아 주도록 막고 있어서, 보내 봐야 거절당합니다. 화면에서도 안 보냅니다 —
 *    두 곳이 서로 다른 말을 하면 언젠가 한쪽이 틀립니다.
 */
export async function submitInquiry(q: {
  clientId: string
  topic: InquiryTopic
  subject: string
  body: string
  askedByName: string
}): Promise<void> {
  const sb = need()
  unwrap(
    await sb
      .from('client_inquiries')
      .insert({
        client_id: q.clientId,
        topic: q.topic,
        subject: q.subject,
        body: q.body,
        asked_by_name: q.askedByName,
      })
      .select(),
  )
}

/**
 * 비원미래가 문의에 답합니다.
 *
 *  ⚠ 표를 직접 고치지 않고 함수를 부릅니다 — 그래야 **누가 언제 답했는지**가
 *    반드시 같이 남습니다(0083 의 answer_inquiry).
 */
export async function answerInquiry(
  id: string,
  status: InquiryStatus,
  reply?: string,
): Promise<void> {
  const sb = need()
  unwrap(await sb.rpc('answer_inquiry', { p_id: id, p_status: status, p_reply: reply ?? null }))
}

/**
 * 병원이 포털을 열었다고 남깁니다 (0083).
 *
 *  ⚠ 실패해도 조용히 넘어갑니다. 이건 **기록**이지 업무가 아닙니다 —
 *    판이 안 올라간 환경에서 이것 때문에 포털이 안 열리면 안 됩니다.
 *  ⚠ 직원이 확인용으로 열어 본 것은 서버가 안 셉니다.
 */
export async function touchPortalSeen(): Promise<void> {
  try {
    const sb = need()
    await sb.rpc('touch_portal_seen')
  } catch {
    /* 기록이 안 남아도 포털은 열려야 합니다 */
  }
}

/** 비원미래 담당자의 요청 처리 — 상태 변경 + 회신 */
export async function updateRequest(
  id: string,
  patch: { status?: ClientRequest['status']; reply?: string },
): Promise<void> {
  const sb = need()
  const row: Record<string, unknown> = {}
  if (patch.status !== undefined) {
    row.status = patch.status
    row.handled_at = new Date().toISOString()
  }
  if (patch.reply !== undefined) row.reply = patch.reply
  if (Object.keys(row).length === 0) return
  unwrap(await sb.from('client_requests').update(row).eq('id', id).select())
}

// ── 매출 전환 ────────────────────────────────────────────────────────────────
export async function upsertLead(lead: Omit<SalesLead, 'id' | 'history' | 'createdAt'>): Promise<void> {
  const sb = need()
  const share =
    lead.sharedWithClient
      ? {
          shared_with_client: true,
          shared_at: lead.sharedAt ?? new Date().toISOString(),
          client_message: lead.clientMessage ?? '',
        }
      : {}
  const rows = unwrap<Row[]>(
    await sb
      .from('sales_leads')
      .upsert(
        {
          key: lead.key,
          client_id: lead.clientId,
          client_name: lead.clientName,
          kind: lead.kind,
          title: lead.title,
          month: lead.month,
          est_value: lead.estValue,
          stage: lead.stage,
          actual_revenue: lead.actualRevenue,
          actual_revenue_at: lead.actualRevenueAt,
          ...share,
        },
        { onConflict: 'key' },
      )
      .select(),
  )
  if (rows[0]) unwrap(await sb.from('sales_lead_events').insert({ lead_id: rows[0].id, stage: lead.stage }).select())
}

/** 병원 담당자의 제안 응답 (수락 / 보류) — 서버 함수가 권한을 다시 검사합니다. */
export async function respondToProposal(leadId: string, accept: boolean): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('respond_to_proposal', { p_lead_id: leadId, p_accept: accept })
  if (error) throw new Error(error.message)
}

export async function setLeadRevenue(leadId: string, amount: number | null): Promise<void> {
  const sb = need()
  unwrap(
    await sb
      .from('sales_leads')
      .update({ actual_revenue: amount, actual_revenue_at: amount == null ? null : new Date().toISOString() })
      .eq('id', leadId)
      .select(),
  )
}

// ── AX 실증 설정 ─────────────────────────────────────────────────────────────
/**
 * 도입 전 기준값을 저장합니다.
 *
 *  예전에는 출처를 무조건 `'user'` 로 박아 보냈습니다. 그래서 「시연용
 *  예시값 채우기」를 눌러도 서버에는 **사용자 입력값**으로 남았고, 화면을
 *  새로 고치면 노란 「시연 기준값」 딱지가 사라졌습니다 — 시연 숫자가
 *  실제 조사값처럼 보이는 상태였습니다. 심사 자리에서 제일 위험한 종류의
 *  거짓말이라, 부르는 쪽이 출처를 함께 정하게 바꿉니다.
 */
export async function saveBaseline(
  patch: Record<string, number | null>,
  source: 'user' | 'demo' | 'survey' = 'user',
): Promise<void> {
  const sb = need()
  unwrap(await sb.from('performance_baselines').update({ ...patch, source }).eq('id', 1).select())
}

export async function saveExperimentStart(date: string | null): Promise<void> {
  const sb = need()
  unwrap(await sb.from('experiment_settings').update({ start_date: date }).eq('id', 1).select())
}

// ── 핵심 1: 수거 완료 통합 커맨드 (DB 트랜잭션) ─────────────────────────────
export interface CompleteResult {
  eventId: string
  scheduleId: string
  createdSchedule: boolean
}

/**
 * 서버 함수 complete_collection 을 호출합니다.
 * 일정·수거이력·자재·재고·병원 요청·감사기록이 한 트랜잭션에서 처리되므로
 * "일부만 저장된 상태"가 생기지 않습니다.
 * 관련 병원 요청은 서버가 직접 찾아 닫습니다(프론트가 대상 목록을 만들지 않습니다).
 */
export async function completeCollection(input: CollectionCompletionInput): Promise<CompleteResult> {
  const sb = need()
  const { data, error } = await sb.rpc('complete_collection', {
    p: {
      scheduleId: input.scheduleId,
      clientId: input.clientId,
      wasteType: input.wasteType,
      vehicleId: input.vehicleId,
      driverName: input.driverName,
      actualAmount: input.actualAmount,
      actualTime: input.actualTime,
      //  안 보내면 서버가 오늘로 씁니다 (0061 이전 서버도 그렇게 동작합니다).
      date: input.date ?? null,
      containers: input.containers,
      handoverStatus: input.handoverStatus,
      supplied: input.supplied,
      suppliedItems: input.suppliedItems ?? null,
      isAdditional: input.isAdditional,
      memo: input.memo,
      screen: input.screen,
      inputDurationMs: input.inputDurationMs ?? null,
      demoSessionId: null, // 실제 운영 모드에서는 시연 태깅을 하지 않습니다.
    },
  })
  if (error) throw new Error(error.message)
  return data as CompleteResult
}

/**
 * 수거 기록 고쳐 넣기 (0074).
 *
 *  ⚠ 서버가 **되돌리기 + 다시 입력을 한 트랜잭션에서** 합니다. 그래서 여기서
 *    재고 증감을 따로 계산하지 않습니다 — 계산을 세 벌로 만들면 셋이 어긋납니다.
 *  ⚠ 안 보낸 칸은 서버가 원래 값을 그대로 씁니다.
 *  ⚠ 거래처는 못 바꿉니다. 거래처를 바꾸는 것은 「고치기」가 아니라 다른
 *    기록이고, 그렇게 하면 그 병원의 청구가 조용히 바뀝니다.
 */
export async function amendCollection(
  eventId: string,
  reason: string,
  input: Partial<CollectionCompletionInput>,
): Promise<CompleteResult> {
  const sb = need()
  const { data, error } = await sb.rpc('amend_collection', {
    p_event_id: eventId,
    p_reason: reason,
    p: {
      wasteType: input.wasteType ?? null,
      vehicleId: input.vehicleId,
      driverName: input.driverName ?? '',
      actualAmount: input.actualAmount,
      actualTime: input.actualTime,
      date: input.date ?? null,
      containers: input.containers ?? null,
      handoverStatus: input.handoverStatus ?? null,
      supplied: input.supplied,
      suppliedItems: input.suppliedItems ?? null,
      isAdditional: input.isAdditional ?? false,
      memo: input.memo ?? '',
    },
  })
  if (error) throw new Error(error.message)
  return data as CompleteResult
}

/** 재고 원장 한 줄 — 「왜 숫자가 바뀌었나」 */
export interface StockMove {
  id: string
  at: string
  kind: '입고' | '공급' | '조정' | '취소'
  item: keyof OfficeStock
  /** 어느 규격인지 (0079). 빈 문자열이면 규격을 모르고 넣은 옛 줄입니다 */
  itemKey: string
  qty: number
  clientName: string
  memo: string
}

/**
 * 최근 재고 변동 (0074).
 *
 *  ⚠ 이 표는 지금까지 **쓰기만 하고 한 번도 읽지 않았습니다.** 그래서
 *    「재고가 왜 이 숫자가 됐지」에 답할 화면이 없었습니다.
 */
export async function stockLedger(limit = 40): Promise<StockMove[]> {
  const sb = need()
  const { data, error } = await sb
    .from('material_transactions')
    .select('id, created_at, kind, item, item_key, qty, memo, clients(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>
    const c = x.clients as { name?: string } | null
    return {
      id: String(x.id), at: String(x.created_at),
      kind: String(x.kind) as StockMove['kind'],
      item: String(x.item) as keyof OfficeStock,
      //  0079 — 어느 규격인지. 옛 줄은 비어 있습니다 (모르고 넣은 줄입니다).
      itemKey: x.item_key == null ? '' : String(x.item_key),
      qty: Number(x.qty ?? 0),
      clientName: c?.name ?? '',
      memo: String(x.memo ?? ''),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 규격별 재고 (0079)
//
//  ⚠ `qty` 가 **null 이면 「아직 안 세어 봄」**입니다. 0 개가 아닙니다.
//    화면에서 `?? 0` 으로 뭉개면 대표님은 창고에 쌓여 있는 63L 박스를 보고도
//    「0 개네」 하고 또 발주하시게 됩니다. 이 null 은 끝까지 null 로 옵니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface StockItem {
  /** 규격 키 (plastic2 · box63 …) */
  item: string
  /** 남은 수량. **null = 아직 안 세어 봄** */
  qty: number | null
  /** 마지막으로 센 때. null 이면 한 번도 안 셌습니다 */
  countedAt: string | null
}

/** 규격별 재고 읽기 (0079) */
export async function stockItems(): Promise<StockItem[]> {
  const sb = need()
  const { data, error } = await sb
    .from('office_stock_items')
    .select('item, qty, counted_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>
    return {
      item: String(x.item),
      //  ⚠ null 을 0 으로 바꾸지 않습니다.
      qty: x.qty == null ? null : Number(x.qty),
      countedAt: x.counted_at == null ? null : String(x.counted_at),
    }
  })
}

/**
 * 규격 하나를 세어 넣기 (0079).
 *
 *  ⚠ 더하는 것이 아니라 **그 수로 정합니다.** 창고에 가서 센 수입니다.
 */
export async function countStockItem(
  item: string,
  qty: number,
  reason: string,
): Promise<{ item: string; before: number | null; after: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('count_stock_item', {
    p_item: item, p_qty: qty, p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data as { item: string; before: number | null; after: number }
}

/** 규격별 입고 (0079). 세어 본 규격만 규격별 재고가 늘어납니다 */
export async function receiveStockItems(
  items: Record<string, number>,
  memo: string,
  requestId?: string | null,
): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('receive_stock_items', {
    p_items: items, p_memo: memo, p_request_id: requestId ?? null,
  })
  if (error) throw new Error(error.message)
}

/** 재고 정정 — 숫자를 덮어쓰지 않고 원장에 이유와 함께 남깁니다 (0074) */
export async function correctStock(
  item: keyof OfficeStock,
  qty: number,
  reason: string,
): Promise<{ item: string; before: number; after: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('correct_stock', { p_item: item, p_qty: qty, p_reason: reason })
  if (error) throw new Error(error.message)
  return data as { item: string; before: number; after: number }
}

/**
 * 본인이 넣은 미완료 방문 무르기 (0077).
 *
 *  ⚠ 지우지 않습니다. 「무름」으로 남고 누가·언제·왜가 감사기록에 남습니다.
 *  ⚠ 사무실이 잡은 일정과 수거기록이 붙은 일정은 **서버가** 막습니다 —
 *    화면에서 지어내 막지 않습니다.
 */
export async function cancelMyVisit(scheduleId: string, reason: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('cancel_my_visit', { p_schedule_id: scheduleId, p_reason: reason })
  if (error) throw new Error(error.message)
}

/** 본인이 넣은 미완료 방문 시간 바꾸기 (0077). 날짜 이동은 사무실 일입니다 */
export async function retimeMyVisit(scheduleId: string, time: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('retime_my_visit', { p_schedule_id: scheduleId, p_time: time })
  if (error) throw new Error(error.message)
}

export async function revertCollection(eventId: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('revert_collection', { p_event_id: eventId })
  if (error) throw new Error(error.message)
}

/**
 * 요청을 기한까지 내려 두기 (0076). `until` 이 null 이면 다시 꺼냅니다.
 *
 *  ⚠ 지우지도, 「처리 완료」로 바꾸지도 않습니다. 상태는 그대로 두고
 *    목록에서만 잠시 내려 둡니다 — 안 한 일을 했다고 적지 않습니다.
 */
export async function snoozeRequest(id: string, until: string | null, reason = ''): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('snooze_request', { p_id: id, p_until: until, p_reason: reason })
  if (error) throw new Error(error.message)
}

// ── 감사로그 ─────────────────────────────────────────────────────────────────
export interface AuditRow {
  id: number
  at: string
  actorName: string
  actorRole: string | null
  action: string
  entity: string
  clientName: string
  screen: string
  source: string
  summary: string
  before: unknown
  after: unknown
}

export async function loadAuditLogs(limit = 200): Promise<AuditRow[]> {
  const sb = need()
  const rows = unwrap<Row[]>(
    await sb.from('audit_logs').select('*').order('at', { ascending: false }).limit(limit),
  )
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorName: r.actor_name ?? '',
    actorRole: r.actor_role ?? null,
    action: r.action,
    entity: r.entity,
    clientName: r.client_name ?? '',
    screen: r.screen ?? '',
    source: r.source ?? 'web',
    summary: r.summary ?? '',
    before: r.before_data,
    after: r.after_data,
  }))
}

/** 수거 외 변경에 대한 감사기록 */
export async function writeAudit(entry: {
  action: string
  entity: string
  entityId?: string
  clientId?: string
  clientName?: string
  screen?: string
  before?: unknown
  after?: unknown
  summary: string
}): Promise<void> {
  if (!supabase) return
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return
  const { data: p } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', u.user.id)
    .maybeSingle()
  await supabase.from('audit_logs').insert({
    actor_id: u.user.id,
    actor_name: p?.name ?? u.user.email ?? '',
    actor_role: p?.role ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    client_id: entry.clientId ?? null,
    client_name: entry.clientName ?? '',
    screen: entry.screen ?? '',
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
    summary: entry.summary,
  })
}

// ── 사용자 관리 (관리자) ─────────────────────────────────────────────────────
export interface ProfileRow {
  id: string
  email: string
  name: string
  role: 'admin' | 'office' | 'field' | 'client'
  active: boolean
  createdAt: string
  /**
   * 관리자가 승인한 시각. null 이면 본인이 가입 신청만 하고 승인 대기 중인 계정.
   *
   *  active=false 만으로는 「승인 대기」와 「쓰다가 중지」가 구분되지 않습니다.
   *  둘은 관리자가 해야 할 일이 정반대입니다 — 하나는 역할을 정해 들여보내는
   *  일이고, 하나는 이미 정해진 계정을 다시 여는 일입니다.
   */
  approvedAt: string | null
  /** 병원 계정이면 소속 거래처 id */
  clientId: string | null
  clientName: string
  /** 계정에 묶인 차량 (0056). 묶여 있으면 수거 입력에서 차량 칸이 사라집니다 */
  vehicleId: string | null
}

/** 아직 승인되지 않은 가입 신청인가 */
export const isPending = (r: ProfileRow): boolean => r.approvedAt === null

export async function loadProfiles(): Promise<ProfileRow[]> {
  const sb = need()
  // 어느 관계로 붙일지 반드시 지정해야 합니다.
  //
  //  profiles 와 clients 사이에는 외래키가 셋 있습니다.
  //    profiles.client_id → clients      (병원 계정의 소속)
  //    clients.created_by → profiles     (거래처를 등록한 사람)
  //    clients.updated_by → profiles     (마지막으로 고친 사람)
  //
  //  그냥 clients(name) 이라고 쓰면 PostgREST 가 어느 것인지 고르지 못하고
  //  요청 전체를 거절합니다. 그러면 사용자 계정 화면에 목록이 아예 안 뜨고,
  //  관리자가 역할 변경도 계정 비활성화도 할 수 없습니다.
  //  (0006 에서 client_id 가 생기면서부터 이랬는데, 관리자만 여는 화면이라
  //   실제로 열어 보고서야 드러났습니다)
  const rows = unwrap<Row[]>(
    await sb.from('profiles').select('*, clients!profiles_client_id_fkey(name)').order('created_at'),
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: !!r.active,
    createdAt: r.created_at,
    approvedAt: (r as { approved_at?: string | null }).approved_at ?? null,
    clientId: r.client_id ?? null,
    clientName: r.clients?.name ?? '',
    //  0056 이전 서버에는 이 칸이 없습니다 — 그때는 null 로 옵니다.
    vehicleId: (r as { vehicle_id?: string | null }).vehicle_id ?? null,
  }))
}

/**
 * 가입 신청 승인 — 역할 지정과 활성화를 한 번에 (0021).
 *
 *  「활성화」와 「역할 변경」을 두 번 나눠 보내면, 그 사이 짧은 순간 신청자가
 *  기본 역할(현장)로 들어와 있게 됩니다. 관리자가 사무실 담당자로 승인하려던
 *  중이었어도 마찬가지입니다. 서버 함수 하나로 한 트랜잭션에서 처리합니다.
 *
 *  '관리자인가' 는 화면이 아니라 서버가 확인합니다.
 */
export async function approveUser(
  id: string,
  role: ProfileRow['role'],
  clientId?: string | null,
): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('admin_approve_user', {
    p_user_id: id,
    p_role: role,
    p_client_id: role === 'client' ? (clientId ?? null) : null,
  })
  if (error) throw new Error(error.message)
}

/**
 * 가입 신청 거절 — 계정을 삭제합니다 (0021).
 *
 *  승인된 적 없는 계정만 지울 수 있습니다. 쓰던 계정을 지우는 길이 아닙니다
 *  (그건 '중지' 입니다 — 기록이 남아야 하므로 계정은 지우지 않습니다).
 *  누가 신청했었는지는 지우기 전에 감사기록에 남습니다.
 */
export async function rejectUser(id: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('admin_reject_user', { p_user_id: id })
  if (error) throw new Error(error.message)
}

/**
 * 역할 변경.
 *
 *  감사기록은 여기서 남기지 않습니다 — DB 트리거가 남깁니다(0020). 화면이
 *  남기게 두면 화면을 거치지 않는 변경(주소창·스크립트)은 흔적 없이
 *  지나갑니다. 실제로 관리자 토큰으로 PATCH 한 번에 계정이 중지되는데
 *  감사기록은 그대로였습니다.
 */
export async function setProfileRole(
  id: string,
  role: ProfileRow['role'],
  clientId?: string | null,
): Promise<void> {
  const sb = need()
  //  병원 계정은 소속이 있어야 하고(DB 제약), 직원으로 돌아가면 소속을 비웁니다.
  //  두 값을 한 번에 보내지 않으면 제약에 걸려 저장이 통째로 실패합니다.
  const patch: Record<string, unknown> =
    role === 'client' ? { role, client_id: clientId ?? null } : { role, client_id: null }
  unwrap(await sb.from('profiles').update(patch).eq('id', id).select())
}

/**
 * 병원 계정의 소속 거래처를 바꿉니다.
 *
 *  병원 담당자가 다른 병원으로 옮기거나, 처음에 잘못 연결했을 때 씁니다.
 *  소속이 바뀌면 그 사람이 포털에서 보는 병원이 통째로 바뀌므로 감사기록에
 *  남깁니다.
 */
/**
 * 계정에 표시되는 이름을 바꿉니다.
 *
 *  권한은 하나도 안 바뀝니다 — **호칭만** 바꿉니다. 지금 대표님 계정 이름이
 *  「대표」, 예비 계정 이름이 「관리자(백업)」로 서로 바뀌어 있는데, 화면
 *  어디에도 고칠 곳이 없어 SQL 을 직접 써야 했습니다.
 *
 *  이름을 비우지 못하게 막습니다 — 비면 화면이 이메일로 사람을 부르게 되고,
 *  누가 누군지 알아보기 어려워집니다.
 */
export async function setProfileName(id: string, name: string): Promise<void> {
  const sb = need()
  const clean = name.trim()
  if (!clean) throw new Error('이름을 비워 둘 수 없습니다.')
  unwrap(await sb.from('profiles').update({ name: clean }).eq('id', id).select())
}

/** 병원 계정의 소속 거래처 변경 — 감사기록은 DB 트리거가 남깁니다(0020) */
export async function setProfileClient(id: string, clientId: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('profiles').update({ client_id: clientId }).eq('id', id).select())
}

/**
 * 계정을 새로 만듭니다 (관리자만).
 *
 *  계정을 만드는 힘은 service_role 키에 있는데, 그 키를 브라우저에 두면 RLS 가
 *  통째로 무의미해집니다. 그래서 그 일은 서버(DB 함수)가 하고, 앱은 부탁만
 *  합니다 — '관리자인가'는 서버가 다시 확인합니다(0018).
 *
 *  임시 비밀번호는 만든 사람이 직접 전달합니다. 서버에도 감사기록에도
 *  원문은 남지 않습니다.
 */
export async function createUser(input: {
  email: string
  password: string
  name: string
  role: ProfileRow['role']
  clientId?: string | null
}): Promise<string> {
  const sb = need()
  const { data, error } = await sb.rpc('admin_create_user', {
    p_email: input.email,
    p_password: input.password,
    p_name: input.name,
    p_role: input.role,
    p_client_id: input.role === 'client' ? (input.clientId ?? null) : null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

/**
 * 엑셀에서 옮겨 온 기록을 한 번에 넣습니다 (관리자만).
 *
 *  한 줄씩 넣으면 중간에 하나가 걸렸을 때 앞의 절반만 들어간 상태가
 *  남습니다. 서버 함수 하나가 곧 트랜잭션 하나라, 무엇이든 잘못되면
 *  하나도 안 들어간 상태로 되돌아갑니다(0019).
 */
export async function importExcelRows(input: {
  clientId: string
  rows: unknown[]
  clientPatch: unknown
  file: string
  summary: unknown
  /** 엑셀 정산 시트의 월 합계 — 날짜별 수거로 바꾸지 않고 월 단위로 저장됩니다(0025) */
  monthly: unknown[]
}): Promise<{ inserted: number; skipped: number; conflict: number; clientFields: number; months: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('import_excel_rows', {
    p_client_id: input.clientId,
    p_rows: input.rows,
    p_client_patch: input.clientPatch,
    p_file: input.file,
    p_summary: input.summary,
    p_monthly: input.monthly,
  })
  if (error) throw new Error(error.message)
  return data as { inserted: number; skipped: number; conflict: number; clientFields: number; months: number }
}

/** 입금 기록 (0026) — 청구 상태까지 서버가 한 트랜잭션에서 맞춥니다 */
export async function addPaymentReceipt(input: {
  paymentId: string
  receivedOn: string
  amount: number
  method: string
  memo: string
  /** 통장 대사로 들어온 건이면 그 줄의 지문 (0031) — 같은 줄이 두 번 들어오지 않게 */
  sourceRef?: string | null
  /**
   * 저장 시도 표 (0042).
   *
   *  통신이 끊겨 다시 누른 것인지, 정말 한 번 더 받은 것인지는 **화면만**
   *  압니다. 저장 창을 열 때 표를 하나 만들고 실패해도 같은 표를 다시 냅니다.
   *  서버는 같은 표가 오면 새로 넣지 않고 처음 결과를 돌려줍니다.
   */
  requestId?: string | null
}): Promise<{ paidTotal: number; outstanding: number; status: string; alreadySaved?: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('add_payment_receipt', {
    p_payment_id: input.paymentId,
    p_received_on: input.receivedOn,
    p_amount: input.amount,
    p_method: input.method,
    p_memo: input.memo,
    p_source_ref: input.sourceRef ?? null,
    p_request_id: input.requestId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { paidTotal: number; outstanding: number; status: string; alreadySaved?: boolean }
}

/** 잘못 넣은 입금 취소 — 청구 상태도 함께 되돌립니다 */
export async function deletePaymentReceipt(id: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('delete_payment_receipt', { p_receipt_id: id })
  if (error) throw new Error(error.message)
}

// ── 수거 일정 자동 편성 (0028) ──────────────────────────────────────────────

export interface PlanBatchResult {
  batch: string
  inserted: number
  skipped: number
  clients: number
  from: string | null
  to: string | null
}

/**
 * 화면에서 확인한 예정 일정 목록을 저장합니다.
 *
 *  무슨 요일에 갈지 고르는 판단은 화면(lib/schedulePlan.ts)이 하고, 서버는
 *  **확인된 목록만** 받습니다. 중복·과거 날짜는 서버가 다시 막습니다.
 */
export async function createPlannedSchedules(
  rows: { clientId: string; date: string; wasteType: string; expectedAmount: number; basis: string }[],
): Promise<PlanBatchResult> {
  const sb = need()
  const { data, error } = await sb.rpc('create_planned_schedules', { p_rows: rows })
  if (error) throw new Error(error.message)
  return data as PlanBatchResult
}

/** 편성 되돌리기 — 아직 손대지 않은 예정만 지웁니다 */
export async function undoScheduleBatch(batch: string): Promise<{ deleted: number; kept: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('undo_schedule_batch', { p_batch: batch })
  if (error) throw new Error(error.message)
  return data as { deleted: number; kept: number }
}

// ── 차량 배정 (0029) ────────────────────────────────────────────────────────

export interface AssignResultRow {
  assigned: number
  skipped: number
  vehicles: number
  from: string | null
  to: string | null
  /** 되돌릴 때 쓰는 일정 id 목록 */
  ids: string[]
}

/** 확인한 차량 배정을 저장합니다 — 구분이 다른 차량은 서버가 다시 막습니다 */
export async function assignScheduleVehicles(
  rows: { scheduleId: string; vehicleId: string }[],
): Promise<AssignResultRow> {
  const sb = need()
  const { data, error } = await sb.rpc('assign_schedule_vehicles', { p_rows: rows })
  if (error) throw new Error(error.message)
  return data as AssignResultRow
}

/** 배정 되돌리기 — 아직 수거하지 않은 건만 풀립니다 */
export async function unassignScheduleVehicles(ids: string[]): Promise<{ cleared: number; kept: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('unassign_schedule_vehicles', { p_ids: ids })
  if (error) throw new Error(error.message)
  return data as { cleared: number; kept: number }
}

// ── 청구 확정 · DB 버전 (0032) ──────────────────────────────────────────────

/** 앱이 기대하는 DB 스키마 버전 — 마이그레이션을 추가할 때마다 함께 올립니다 */
/** 공용 차량을 그 날짜로 잡습니다 (0070) */
export async function reserveVehicle(vehicleId: string, date: string, note = ''): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('reserve_vehicle', { p_vehicle_id: vehicleId, p_date: date, p_note: note })
  if (error) throw new Error(error.message)
}

/** 잡아 둔 예약을 무릅니다 (0070) */
export async function releaseVehicle(id: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('release_vehicle', { p_id: id })
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// 0065 — 실사용 마감 세 가지
//
//  ⚠ 전부 서버 함수를 부릅니다. 화면이 여러 번 나눠 부르면 그 사이에 통신이
//    끊겼을 때 반쪽만 남습니다. 「가져갔는데 기록이 없다」가 그런 식입니다.
// ─────────────────────────────────────────────────────────────────────────────

//  ⚠ 공용차량 사용·반납은 **여기에 새로 만들지 않았습니다.**
//    0070 에 이미 예약·해제(vehicle_reservations · SharedTruck)가 있습니다.
//    같은 것을 두 벌 만들면 「어느 쪽이 진짜인가」가 생기고, 그때부터
//    현장과 사무실이 서로 다른 화면을 봅니다.

export interface DayCloseSummary {
  planned: number
  done: number
  left: number
  kg: number
  openVehicles: number
}

/**
 *  오늘 업무 마감.
 *
 *  ⚠ 숫자는 **서버가 셉니다.** 기사님이 이미 넣은 것을 다시 입력하게 하면
 *    그건 마감이 아니라 두 번째 보고입니다 — 없애려던 바로 그것입니다.
 *  ⚠ 두 번 눌러도 한 번입니다(`already: true`).
 */
export async function closeDay(date: string, note = ''): Promise<{ already: boolean; summary: DayCloseSummary }> {
  const sb = need()
  const { data, error } = await sb.rpc('close_day', { p_date: date, p_note: note })
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as { already?: boolean; summary?: Partial<DayCloseSummary> }
  const s = d.summary ?? {}
  return {
    already: Boolean(d.already),
    summary: {
      planned: Number(s.planned ?? 0), done: Number(s.done ?? 0), left: Number(s.left ?? 0),
      kg: Number(s.kg ?? 0), openVehicles: Number(s.openVehicles ?? 0),
    },
  }
}

export interface DayClose {
  profileId: string
  /** 마감한 사람 이름 — **마감 순간에 서버가 얼려 둔 값**입니다.
   *  현장 계정은 남의 프로필을 못 읽습니다(RLS). 여기 없으면 사무실 화면이
   *  이름을 못 적거나, 적으려고 프로필 권한을 열어야 합니다. */
  who: string
  date: string
  note: string
  closedAt: string
  summary: Partial<DayCloseSummary>
}

/** 그날의 마감 기록 (본인 것 + 사무실·관리자는 전원) */
export async function dayCloses(date: string): Promise<DayClose[]> {
  const sb = need()
  const { data, error } = await sb
    .from('day_closes')
    .select('profile_id, profile_name, date, note, closed_at, summary')
    .eq('date', date)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => {
    const x = r as Record<string, unknown>
    return {
      profileId: String(x.profile_id), who: String(x.profile_name ?? ''),
      date: String(x.date), note: String(x.note ?? ''),
      closedAt: String(x.closed_at), summary: (x.summary ?? {}) as Partial<DayCloseSummary>,
    }
  })
}

/** 수거 완료 취소 — **사유와 함께**. 되돌리는 일 자체는 기존 함수가 합니다. */
export async function revertCollectionWithReason(eventId: string, reason: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('revert_collection_with_reason', {
    p_event_id: eventId, p_reason: reason,
  })
  if (error) throw new Error(error.message)
}

//  ⚠ 이 값은 **앱이 돌아가기 위한 최소 판**입니다. 지금 실제 서버는 70 입니다
//    (0066·0067·0070·0072 는 supabase/proposals/ 에 있고 대표님이 실행하셨습니다).
//    새 기능은 이 값을 올려서 켜지 않습니다 — useSchemaAtLeast(n) 로 그 기능만
//    가립니다. 이 값을 올리면 SQL 을 아직 안 돌린 순간 **앱 전체가 멎습니다.**
export const EXPECTED_SCHEMA_VERSION = 64

/**
 * 서버 DB 의 스키마 버전.
 *
 *  함수 자체가 없으면(0032 이전) null 을 돌려줍니다 — 「구버전」이라는 뜻입니다.
 *  마이그레이션을 실행하지 않은 채 새 화면을 열면 표가 없어 조용히 빈 값으로
 *  보이기 때문에, 화면이 이 값을 보고 먼저 알려 줍니다.
 */
export async function schemaVersion(): Promise<number | null> {
  const sb = supabase
  if (!sb) return null
  try {
    const { data, error } = await sb.rpc('app_schema_version')
    if (error) return null
    return typeof data === 'number' ? data : null
  } catch {
    return null
  }
}

// ── 전체 스냅샷 ──────────────────────────────────────────────────────────────
/**
 * DB 의 줄을 **그대로** 읽어 담습니다 (도메인 모양으로 바꾸지 않습니다).
 *
 *  화면이 쓰는 loadAppData 는 줄을 화면용으로 바꾸고, 화면이 안 쓰는 표는
 *  아예 읽지 않습니다. 그 결과물은 되돌리는 데 쓸 수 없습니다 — 감사기록·
 *  자재 입출고가 통째로 빠져 있고, 참/거짓이 화면용 값으로 바뀌어 있습니다.
 *
 *  여기서는 `select *` 한 것을 손대지 않고 그대로 둡니다. 표가 늘어도 이
 *  함수는 고칠 게 없습니다 — SNAPSHOT_TABLES 에 한 줄 더할 뿐입니다.
 *
 *  1000줄 제한 때문에 반드시 나눠 읽습니다. 정렬 없이 나누면 어떤 줄은 두 번
 *  오고 어떤 줄은 영영 안 옵니다 — 백업에서 그러면 조용히 자료가 빕니다.
 *
 *  읽지 못한 표는 **빈 배열로 만들지 않고** 이유와 함께 따로 적습니다.
 *  「없는 것」과 「못 읽은 것」이 같아 보이면 백업으로서 쓸모가 없습니다.
 */
export async function rawSnapshot(takenBy: string, takenAt: string): Promise<Snapshot> {
  const sb = need()
  const tables: Record<string, unknown[]> = {}
  const unreadable: { name: string; reason: string }[] = []

  for (const t of SNAPSHOT_TABLES) {
    try {
      if (t.name === 'clients') {
        //  ⚠ 0063 부터 거래처는 `select *` 가 막혀 있습니다 (돈 칸을 열 단위로
        //    잠갔습니다). 백업은 **돈 칸까지** 담아야 복구가 됩니다 — 안 담으면
        //    되살렸을 때 단가·월정액·결제조건·세금정보가 통째로 사라지고,
        //    그 다음 달 청구가 조용히 틀립니다.
        //
        //    관리자만 부를 수 있고, 권한이 없으면 **오류**입니다. 빈 배열로
        //    돌려주면 「거래처 0곳인 백업」이 만들어져 더 위험합니다.
        tables[t.name] = await withRetry(async () => {
          const { data, error } = await sb.rpc('clients_full')
          if (!error) return (data ?? []) as unknown[]
          //  0063 을 아직 안 올린 서버에는 이 함수가 없습니다. 그때는 별표가
          //  아직 열려 있으므로 예전 길로 읽습니다 — 앱만 먼저 올려도 백업이
          //  멈추지 않게. (권한 오류는 그대로 올려 「못 읽음」으로 남깁니다)
          if (!/schema cache|does not exist/i.test(error.message)) throw new Error(error.message)
          return await pageAll((f, to) => sb.from('clients').select('*').order(t.order).range(f, to))
        })
        continue
      }
      tables[t.name] = await withRetry(async () =>
        pageAll((f, to) => sb.from(t.name).select('*').order(t.order).range(f, to)),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      unreadable.push({ name: t.name, reason: msg })
    }
  }

  return buildSnapshot({ tables, unreadable, schemaVersion: await schemaVersion(), takenBy, takenAt })
}

/**
 * 청구 확정 (0032).
 *
 *  이미 청구한 수거·자재가 들어 있으면 서버가 거부합니다 — 두 사람이 동시에
 *  월말 청구를 눌러도 병원에 두 배로 청구되지 않습니다. 청구 저장과
 *  감사기록이 한 트랜잭션이라 중간에 끊겨도 근거 없는 청구가 남지 않습니다.
 */
export async function confirmBillingRpc(input: {
  clientId: string
  month: string
  amount: number
  snapshot: unknown
}): Promise<{ id: string }> {
  const sb = need()
  const { data, error } = await sb.rpc('confirm_billing', {
    p_client_id: input.clientId,
    p_month: input.month,
    p_amount: input.amount,
    p_snapshot: input.snapshot,
  })
  if (error) throw new Error(error.message)
  return data as { id: string }
}

// ── 월 운영비 (0030) ────────────────────────────────────────────────────────

/** 그 달 운영비 한 항목을 넣거나 고칩니다 (관리자) */
export async function setOperatingCost(input: {
  month: string
  category: string
  amount: number
  memo: string
}): Promise<{ monthTotal: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('set_operating_cost', {
    p_month: input.month,
    p_category: input.category,
    p_amount: input.amount,
    p_memo: input.memo,
  })
  if (error) throw new Error(error.message)
  return data as { monthTotal: number }
}

export async function deleteOperatingCost(month: string, category: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('delete_operating_cost', { p_month: month, p_category: category })
  if (error) throw new Error(error.message)
}

// ── 거래처 단가 (0036) ──────────────────────────────────────────────────────

/**
 * 단가 저장 — 지금 단가와 판을 한 트랜잭션에서 함께 갱신합니다.
 *  둘을 따로 쓰면 중간에 끊겼을 때 「지금 단가는 바뀌었는데 판은 없는」
 *  상태가 남아, 과거 달이 새 단가로 계산됩니다.
 */
export async function setClientPricing(input: {
  clientId: string
  pricing: Client['pricing']
  effectiveFrom: string | null
  memo?: string
}): Promise<{ effectiveFrom: string; created: boolean }> {
  const sb = need()
  const { data, error } = await sb.rpc('set_client_pricing', {
    p_client_id: input.clientId,
    p_pricing: input.pricing ?? {},
    p_effective_from: input.effectiveFrom,
    p_memo: input.memo ?? '',
  })
  if (error) throw new Error(error.message)
  return data as { effectiveFrom: string; created: boolean }
}

// ── 휴무일 (0034) ───────────────────────────────────────────────────────────

/** 휴무일 일괄 등록 — 이미 있는 날은 이름만 덮어씁니다 */
export async function setHolidays(rows: { day: string; name: string }[]): Promise<{ added: number; updated: number }> {
  const sb = need()
  const { data, error } = await sb.rpc('set_holidays', { p_rows: rows })
  if (error) throw new Error(error.message)
  return data as { added: number; updated: number }
}

export async function deleteHoliday(day: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('delete_holiday', { p_day: day })
  if (error) throw new Error(error.message)
}

/** 비밀번호 초기화 (관리자만) — 새 임시 비밀번호는 관리자가 직접 전달합니다 */
export async function resetUserPassword(id: string, password: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('admin_reset_password', { p_user_id: id, p_password: password })
  if (error) throw new Error(error.message)
}

// ── 개발자에게 요청하기 (0022) ──────────────────────────────────────────────

export interface DevRequestRow {
  id: string
  createdAt: string
  requesterId: string
  requesterName: string
  requesterRole: 'admin' | 'office' | 'field' | 'client'
  topics: string[]
  message: string
  status: '접수' | '확인' | '처리 완료' | '보류'
  adminNote: string
  handledAt: string | null
}

/**
 * 요청 보내기.
 *
 *  누가 보냈는지는 넘기지 않습니다 — 서버가 로그인한 사람으로 채웁니다(0022).
 *  여기서 이름을 실어 보내면 남의 이름으로 요청을 넣을 수 있습니다.
 */
export async function createDevRequest(input: {
  topics: string[]
  message: string
}): Promise<void> {
  const sb = need()
  unwrap(
    await sb
      .from('dev_requests')
      .insert({ topics: input.topics, message: input.message.trim() })
      .select(),
  )
}

/**
 * 요청 목록.
 *
 *  RLS 가 걸러 줍니다 — 관리자는 전부, 나머지는 자기가 보낸 것만(0022).
 *  화면에서 역할을 따져 나눌 필요가 없습니다.
 */
export async function loadDevRequests(): Promise<DevRequestRow[]> {
  const sb = need()
  const rows = unwrap<Row[]>(
    await sb.from('dev_requests').select('*').order('created_at', { ascending: false }),
  )
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    requesterId: r.requester_id,
    requesterName: r.requester_name ?? '',
    requesterRole: r.requester_role,
    topics: (r.topics as string[] | null) ?? [],
    message: r.message ?? '',
    status: r.status,
    adminNote: r.admin_note ?? '',
    handledAt: r.handled_at ?? null,
  }))
}

/** 처리 상태·메모 변경 (관리자만 — 서버가 다시 확인합니다) */
export async function updateDevRequest(
  id: string,
  patch: { status?: DevRequestRow['status']; adminNote?: string },
): Promise<void> {
  const sb = need()
  const row: Record<string, unknown> = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.adminNote !== undefined) row.admin_note = patch.adminNote
  if (Object.keys(row).length === 0) return
  unwrap(await sb.from('dev_requests').update(row).eq('id', id).select())
}

/** 계정 사용/중지 — 감사기록은 DB 트리거가 남깁니다(0020) */
export async function setProfileActive(id: string, active: boolean): Promise<void> {
  const sb = need()
  unwrap(await sb.from('profiles').update({ active }).eq('id', id).select())
}

// ── 시연 데이터 초기화 (실제 운영 데이터는 건드리지 않음) ───────────────────
export async function resetDemoRecords(sessionId: string): Promise<Record<string, number>> {
  const sb = need()
  const { data, error } = await sb.rpc('reset_demo_records', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
  return data as Record<string, number>
}

// ── 브라우저 데이터 가져오기 (localStorage → DB) ────────────────────────────
export interface ImportPreview {
  clients: number
  schedules: number
  materials: number
  notes: number
  payments: number
  events: number
  /** 시연 생성 거래처 — 가져오기 대상에서 제외됩니다. */
  demoClients: number
}

/** 가져오기 전에 무엇이 올라가는지 미리 보여줍니다. */
export function previewImport(local: AppData): ImportPreview {
  const realClients = local.clients.filter((c) => !c.isDemoGenerated)
  const realIds = new Set(realClients.map((c) => c.id))
  return {
    clients: realClients.length,
    schedules: local.schedules.filter((s) => realIds.has(s.clientId) && s.origin !== 'demo').length,
    materials: local.materials.filter((m) => realIds.has(m.clientId)).length,
    notes: local.notes.filter((n) => realIds.has(n.clientId)).length,
    payments: local.payments.filter((p) => realIds.has(p.clientId)).length,
    events: local.events.filter((e) => !e.demoSessionId).length,
    demoClients: local.clients.length - realClients.length,
  }
}

/**
 * 브라우저(localStorage) 데이터를 서버로 가져옵니다.
 *  · 시연 생성 거래처와 시연 세션 기록은 절대 올리지 않습니다.
 *  · 로컬 id 를 그대로 쓰지 않고 서버가 새 uuid 를 발급해 id 충돌을 막습니다.
 *  · 이름+주소가 같은 거래처는 이미 있는 것으로 보고 중복 생성하지 않습니다.
 */
export async function importFromLocal(local: AppData): Promise<ImportPreview & { skipped: number }> {
  const sb = need()
  const existing = unwrap<Row[]>(await sb.from('clients').select('id, name, address'))
  //  0045 부터 서버가 이름 열쇠로 중복을 막습니다. 여기서도 같은 열쇠를 써야
  //  「이름은 같고 주소만 다른」 거래처를 새로 만들려다 서버에 막히는 일이
  //  생기지 않습니다. 열쇠가 갈리면 옮기기가 통째로 실패합니다.
  const existingByKey = new Map(existing.map((r) => [clientNameKey(r.name), r.id as string]))

  const realClients = local.clients.filter((c) => !c.isDemoGenerated)
  const idMap = new Map<string, string>() // 로컬 id → 서버 id
  let skipped = 0

  for (const c of realClients) {
    const k = clientNameKey(c.name)
    const hit = k ? existingByKey.get(k) : undefined
    if (hit) {
      idMap.set(c.id, hit)
      skipped++
      continue
    }
    const created = await createClient(c)
    idMap.set(c.id, created.id)
    if (k) existingByKey.set(k, created.id)
  }

  const mapped = <T extends { clientId: string }>(list: T[]) =>
    list.filter((x) => idMap.has(x.clientId)).map((x) => ({ ...x, clientId: idMap.get(x.clientId)! }))

  const schedules = mapped(local.schedules.filter((s) => s.origin !== 'demo'))
  if (schedules.length) {
    unwrap(
      await sb
        .from('schedules')
        .insert(
          schedules.map((s) => ({
            ...clean(scheduleRow(s)),
            origin: 'migrated',
            vehicle_id: null, // 차량 id 는 서버 기준이 다르므로 비워 둡니다.
          })),
        )
        .select(),
    )
  }

  const materials = mapped(local.materials)
  if (materials.length) {
    unwrap(
      await sb
        .from('materials')
        .insert(
          materials.map((m) => ({
            date: m.date,
            client_id: m.clientId,
            box_count: m.boxCount,
            vinyl_count: m.vinylCount,
            needle_box_count: m.needleBoxCount,
            is_additional_request: m.isAdditionalRequest,
            memo: m.memo,
            origin: 'migrated',
          })),
        )
        .select(),
    )
  }

  const notes = mapped(local.notes)
  if (notes.length) {
    unwrap(
      await sb
        .from('site_notes')
        .insert(notes.map((n) => ({ client_id: n.clientId, kind: n.kind, content: n.content, done: n.done })))
        .select(),
    )
  }

  const payments = mapped(local.payments)
  if (payments.length) {
    await sb.from('payments').insert(
      payments.map((p) => ({
        client_id: p.clientId,
        billing_month: p.billingMonth,
        amount: p.amount,
        status: p.status,
        method: p.method,
        paid_at: p.paidAt,
        memo: p.memo,
      })),
    )
  }

  await writeAudit({
    action: 'data.import',
    entity: 'bulk',
    summary: `브라우저 데이터 가져오기 — 거래처 ${realClients.length - skipped}건 신규 · ${skipped}건 기존 연결 · 일정 ${schedules.length}건 · 자재 ${materials.length}건 · 메모 ${notes.length}건`,
  })

  return { ...previewImport(local), skipped }
}
