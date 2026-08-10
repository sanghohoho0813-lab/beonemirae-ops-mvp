import type {
  AppData,
  Client,
  ClientRequest,
  CollectionEvent,
  MaterialSupply,
  OfficeStock,
  Payment,
  RequestOverride,
  Schedule,
  SalesLead,
  SiteNote,
  Vehicle,
} from '../types'
import { DEFAULT_OFFICE_STOCK, EMPTY_BASELINE, EMPTY_EXPERIMENT } from '../types'
import { supabase, withRetry } from './supabase'
import type { CollectionCompletionInput } from './collection'

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
  contractStart: r.contract_start ?? null,
  contractEnd: r.contract_end ?? null,
  paymentTerms: r.payment_terms ?? '',
  paymentDueDay: r.payment_due_day ?? null,
  monthlyFlatFee: r.monthly_flat_fee ?? null,
  pricing: r.pricing ?? undefined,
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
  eventId: r.event_id ?? null,
  origin: r.origin ?? 'field',
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
 * 운영 데이터를 서버에서 한 번에 읽어 AppData 로 조립합니다.
 * 역할에 따라 RLS 가 일부 테이블을 막으므로(예: 현장 담당자의 미수금/매출),
 * 접근 불가 테이블은 빈 배열로 두고 화면은 정상 동작하게 합니다.
 */
export async function loadAppData(): Promise<AppData> {
  const sb = need()

  const soft = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      // RLS 로 막힌 테이블은 오류가 아니라 '권한 없음'입니다.
      const msg = e instanceof Error ? e.message : ''
      if (/row-level security|permission denied/i.test(msg)) return fallback
      throw e
    }
  }

  const [clients, vehicles, schedules, materials, notes, events, stock, overrides, requests] = await Promise.all([
    // 그만둔 거래처까지 함께 읽습니다. 목록에는 활성만 넣고, 비활성은
    // 청구·수거 기록의 이름을 되찾는 데만 씁니다(아래 retiredClients).
    withRetry(async () => unwrap<Row[]>(await sb.from('clients').select('*'))),
    withRetry(async () => unwrap<Row[]>(await sb.from('vehicles').select('*').eq('active', true))),
    withRetry(async () => unwrap<Row[]>(await sb.from('schedules').select('*'))),
    withRetry(async () => unwrap<Row[]>(await sb.from('materials').select('*'))),
    withRetry(async () => unwrap<Row[]>(await sb.from('site_notes').select('*').eq('archived', false))),
    withRetry(async () =>
      unwrap<Row[]>(await sb.from('collection_events').select('*').order('at', { ascending: false })),
    ),
    withRetry(async () => unwrapOne(await sb.from('office_stock').select('*').eq('id', 1).maybeSingle())),
    withRetry(async () => unwrap<Row[]>(await sb.from('request_overrides').select('*'))),
    withRetry(async () =>
      unwrap<Row[]>(
        await sb
          .from('client_requests')
          .select('*, clients(name)')
          .order('created_at', { ascending: false }),
      ),
    ),
  ])

  const payments = await soft(
    async () => unwrap<Row[]>(await sb.from('payments').select('*')),
    [] as Row[],
  )
  const leads = await soft(
    async () => unwrap<Row[]>(await sb.from('sales_leads').select('*, sales_lead_events(stage, at)')),
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
    clients: clients.filter((c) => c.active).map(toClient),
    retiredClients: clients.filter((c) => !c.active).map(toClient),
    vehicles: vehicles.map(toVehicle),
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
  contract_start: c.contractStart,
  contract_end: c.contractEnd,
  payment_terms: c.paymentTerms,
  payment_due_day: c.paymentDueDay,
  monthly_flat_fee: c.monthlyFlatFee,
  pricing: c.pricing,
})

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

export async function insertClient(c: Omit<Client, 'id'>): Promise<Client> {
  const sb = need()
  const row = unwrap<Row[]>(await sb.from('clients').insert(clean(clientRow(c))).select())
  return toClient(row[0])
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const sb = need()
  unwrap(await sb.from('clients').update(clean(clientRow(patch))).eq('id', id).select())
}

/** hard delete 대신 비활성화 — 과거 수거 이력이 끊기지 않게 합니다. */
export async function deactivateClient(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('clients').update({ active: false }).eq('id', id).select())
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
export async function insertNote(n: Omit<SiteNote, 'id' | 'createdAt'>): Promise<SiteNote> {
  const sb = need()
  const row = unwrap<Row[]>(
    await sb.from('site_notes').insert({ client_id: n.clientId, kind: n.kind, content: n.content, done: n.done }).select(),
  )
  return toNote(row[0])
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
export async function deleteMaterial(id: string): Promise<void> {
  const sb = need()
  unwrap(await sb.from('materials').delete().eq('id', id).select())
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
          amount: patch.amount,
          memo: patch.memo,
          canceled_at: patch.canceledAt,
        }),
      )
      .eq('id', id)
      .select(),
  )
}

// ── 병원 요청 ────────────────────────────────────────────────────────────────
// 병원 담당자가 포털에서 직접 등록하거나(source='portal'),
// 전화·카톡으로 받은 것을 비원미래가 대신 접수합니다(source='staff').
export async function insertRequest(r: {
  clientId: string
  kind: ClientRequest['kind']
  content: string
  desiredDate: string | null
  urgent: boolean
  source: ClientRequest['source']
  requesterName: string
}): Promise<void> {
  const sb = need()
  unwrap(
    await sb
      .from('client_requests')
      .insert({
        client_id: r.clientId,
        kind: r.kind,
        content: r.content,
        desired_date: r.desiredDate,
        urgent: r.urgent,
        source: r.source,
        requester_name: r.requesterName,
        status: '접수',
      })
      .select(),
  )
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
export async function saveBaseline(patch: Record<string, number | null>): Promise<void> {
  const sb = need()
  unwrap(await sb.from('performance_baselines').update({ ...patch, source: 'user' }).eq('id', 1).select())
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

export async function revertCollection(eventId: string): Promise<void> {
  const sb = need()
  const { error } = await sb.rpc('revert_collection', { p_event_id: eventId })
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
  /** 병원 계정이면 소속 거래처 id */
  clientId: string | null
  clientName: string
}

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
    clientId: r.client_id ?? null,
    clientName: r.clients?.name ?? '',
  }))
}

export async function setProfileRole(id: string, role: ProfileRow['role']): Promise<void> {
  const sb = need()
  // 변경 전 값을 먼저 읽어 감사기록에 남깁니다 — 권한 변경은 추적 대상입니다.
  const { data: before } = await sb.from('profiles').select('name, role').eq('id', id).maybeSingle()
  unwrap(await sb.from('profiles').update({ role }).eq('id', id).select())
  await writeAudit({
    action: 'profile.role',
    entity: 'profiles',
    entityId: id,
    before: { role: before?.role ?? null },
    after: { role },
    summary: `권한 변경 — ${before?.name ?? id} · ${before?.role ?? '?'} → ${role}`,
  })
}

export async function setProfileActive(id: string, active: boolean): Promise<void> {
  const sb = need()
  const { data: before } = await sb.from('profiles').select('name, active').eq('id', id).maybeSingle()
  unwrap(await sb.from('profiles').update({ active }).eq('id', id).select())
  await writeAudit({
    action: 'profile.active',
    entity: 'profiles',
    entityId: id,
    before: { active: before?.active ?? null },
    after: { active },
    summary: `계정 ${active ? '사용' : '중지'} — ${before?.name ?? id}`,
  })
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
  const keyOf = (n: string, a: string) => `${n.trim()}::${(a ?? '').trim()}`
  const existingByKey = new Map(existing.map((r) => [keyOf(r.name, r.address ?? ''), r.id as string]))

  const realClients = local.clients.filter((c) => !c.isDemoGenerated)
  const idMap = new Map<string, string>() // 로컬 id → 서버 id
  let skipped = 0

  for (const c of realClients) {
    const k = keyOf(c.name, c.address)
    const hit = existingByKey.get(k)
    if (hit) {
      idMap.set(c.id, hit)
      skipped++
      continue
    }
    const created = await insertClient(c)
    idMap.set(c.id, created.id)
    existingByKey.set(k, created.id)
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
