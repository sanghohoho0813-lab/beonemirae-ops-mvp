import type {
  AppData,
  Client,
  HandoverStatus,
  RequestKind,
  RequestSource,
  RequestStatus,
  WasteType,
} from '../types'
import { facilityByWaste } from '../data/ops'
import { schedulesOn, todaySummary, additionalMaterialCount, outstandingOf, paidTotalOf } from './selectors'
import { today, thisMonth, nowHm, shiftDays } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 운영 파생 로직 (시연용 추천/위험 시뮬레이션)
//  ※ 실제 최적화 알고리즘·지도 API 미연동. 운영 데이터 기반 추천 로직 개발 중.
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchStop {
  clientName: string
  time: string
  urgent: boolean
}

export interface DispatchPlan {
  vehicleId: string
  vehicleName: string
  wasteType: WasteType
  driver: string
  capacity: number // 실제 예상 적재량(kg)
  nominalCapacity: number
  stops: DispatchStop[]
  routeLabels: string[] // 권장 경로 (처리장 포함)
  loadRate: number // 예상 적재율 %
  urgentCount: number
  materialCount: number // 자재 동시공급 반영 건수
  facilityName: string
  handoverTime: string
  simDistanceKm: number // 시뮬레이션
  simMinutes: number // 시뮬레이션
}

/** 오늘 차량별 배차·경로 추천 (시뮬레이션) */
export function dispatchPlans(data: AppData): DispatchPlan[] {
  const t = today()
  const list = schedulesOn(data, t)
  const todayMaterialClients = new Set(
    data.materials.filter((m) => m.date === t).map((m) => m.clientId),
  )

  return data.vehicles.map((v) => {
    const items = list.filter((s) => s.vehicleId === v.id)
    const stops: DispatchStop[] = items.map((s) => ({
      clientName: data.clients.find((c) => c.id === s.clientId)?.name ?? '거래처',
      time: s.scheduledTime,
      urgent: s.status === '긴급' || s.status === '지연',
    }))
    const expectedSum = items.reduce((sum, s) => sum + s.expectedAmount, 0)
    const loadRate = v.expectedCapacity > 0 ? Math.min(100, Math.round((expectedSum / v.expectedCapacity) * 100)) : 0
    const urgentCount = items.filter((s) => s.status === '긴급').length
    const materialCount = items.filter((s) => todayMaterialClients.has(s.clientId)).length
    const facility = facilityByWaste(v.wasteType)
    const routeLabels = [...stops.map((s) => s.clientName), facility?.name ?? '처리장']

    return {
      vehicleId: v.id,
      vehicleName: v.name,
      wasteType: v.wasteType,
      driver: v.driver,
      capacity: v.expectedCapacity,
      nominalCapacity: v.nominalCapacity,
      stops,
      routeLabels,
      loadRate,
      urgentCount,
      materialCount,
      facilityName: facility?.name ?? '처리장',
      handoverTime: facility?.targetTime ?? '-',
      simDistanceKm: stops.length ? 8 + stops.length * 6 : 0,
      simMinutes: stops.length ? 30 + stops.length * 22 : 0,
    }
  })
}

// ── 자재 소진 위험 (시뮬레이션) ───────────────────────────────────────────────
export type RiskLevel = '긴급' | '주의' | '낮음'
export interface MaterialRisk {
  clientId: string
  clientName: string
  material: string
  level: RiskLevel
  message: string
}

export function materialRisks(data: AppData): MaterialRisk[] {
  const month = thisMonth()
  const addReq = new Set(
    data.materials.filter((m) => m.isAdditionalRequest && m.date.startsWith(month)).map((m) => m.clientId),
  )
  // 후보: 추가요청 거래처 + 보관창고 작은 의료기관
  const scored = data.clients
    .map((c) => {
      const hasReq = addReq.has(c.id)
      const small = c.storageSize === '작음'
      const score = (hasReq ? 2 : 0) + (small ? 1 : 0)
      return { c, hasReq, small, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)

  const materials = ['비닐', '박스', '바늘통']
  return scored.map(({ c, hasReq, small }, i): MaterialRisk => {
    const material = c.collectsMedicalWaste ? materials[i % materials.length] : '비닐'
    const level: RiskLevel = hasReq ? '긴급' : small ? '주의' : '낮음'
    const message = hasReq
      ? '추가요청 접수 — 다음 방문 시 우선 공급 권장'
      : small
        ? '보관창고 협소 — 다음 수거 시 함께 공급 권장'
        : '입고 대비 출고 차이 확인 필요'
    return { clientId: c.id, clientName: c.name, material, level, message }
  })
}

// ── 격리 / 긴급 수거 확인 대상 (시뮬레이션) ─────────────────────────────────
export type IsolationKind = '격리' | '추가수거' | '자재동시공급'
export interface IsolationAlert {
  clientId: string
  clientName: string
  kind: IsolationKind
  message: string
}

export function isolationAlerts(data: AppData): IsolationAlert[] {
  // 요양병원·요양원 우선, 없으면 임의 거래처 — 세트 크기와 무관하게 동작
  const seen = new Set<string>()
  const pool: Client[] = []
  for (const c of [
    ...data.clients.filter((c) => c.type === '요양병원' || c.type === '요양원'),
    ...data.clients,
  ]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    pool.push(c)
  }
  const kinds: { kind: IsolationKind; message: string }[] = [
    { kind: '격리', message: '격리환자 발생 가능 — 보관기한(1주일) 확인 및 추가수거 검토' },
    { kind: '추가수거', message: '인증기간 추가수거 요청 확인 필요' },
    { kind: '자재동시공급', message: '보관창고 협소 — 자재 동시공급 권장' },
  ]
  return kinds
    .map((k, i) => (pool[i] ? { clientId: pool[i].id, clientName: pool[i].name, kind: k.kind, message: k.message } : null))
    .filter((x): x is IsolationAlert => x !== null)
}

// ── 오늘 할 일 체크리스트 ─────────────────────────────────────────────────────
export type CheckStatus = '긴급' | '주의' | '정보' | '완료'
export interface CheckItem {
  key: string
  label: string
  count: number
  status: CheckStatus
  to: string
}

export function todayChecklist(data: AppData): CheckItem[] {
  const summary = todaySummary(data)
  const addMaterials = additionalMaterialCount(data)
  const confirmNeeded = data.payments.filter((p) => p.status === '확인필요').length
  const t = today()
  // 최근 7일 내 완료 거래처 수 (수거대장 작성 대상 proxy)
  //  날짜 문자열끼리 비교합니다 — Date 로 바꿔 비교하면 'YYYY-MM-DD' 는 UTC
  //  자정으로 파싱되고 기준값은 기기 시각이라 하루 어긋납니다.
  const weekAgo = shiftDays(-7)
  const logTargets = new Set(
    data.schedules
      .filter((s) => s.status === '완료' && s.date <= t && s.date >= weekAgo)
      .map((s) => s.clientId),
  ).size
  const isolation = isolationAlerts(data).filter((a) => a.kind === '격리').length
  // 현장 운영 파생 항목
  const inspection = inspectionAlerts(data).length
  const sameDayMaterial = dispatchPlans(data).reduce((s, p) => s + p.materialCount, 0)
  const pendingInput = pendingInputSchedules(data).length
  const handover = handoverToday(data).length

  return [
    { key: 'today', label: '오늘 수거 예정', count: summary.total, status: '정보', to: '/today' },
    { key: 'urgent', label: '격리의료폐기물 긴급수거', count: summary.긴급, status: summary.긴급 ? '긴급' : '완료', to: '/dispatch' },
    { key: 'inspection', label: '인증·실사 전 확인', count: inspection, status: inspection ? '주의' : '완료', to: '/clients' },
    { key: 'pending', label: '수거 완료 후 입력 대기', count: pendingInput, status: pendingInput ? '주의' : '완료', to: '/today' },
    { key: 'sameday', label: '자재 동시공급', count: sameDayMaterial, status: sameDayMaterial ? '정보' : '완료', to: '/materials' },
    { key: 'handover', label: '처리장 인계 예정', count: handover, status: '정보', to: '/dispatch' },
    { key: 'delay', label: '지연 확인', count: summary.지연, status: summary.지연 ? '주의' : '완료', to: '/today' },
    { key: 'material', label: '자재 추가공급 확인', count: addMaterials, status: addMaterials ? '주의' : '완료', to: '/materials' },
    { key: 'unpaid', label: '미수금 확인 필요', count: confirmNeeded, status: confirmNeeded ? '주의' : '완료', to: '/receivables' },
    { key: 'log', label: '수거대장 작성 필요', count: logTargets, status: logTargets ? '정보' : '완료', to: '/clients' },
    { key: 'isolation', label: '격리/보관기한 확인', count: isolation, status: isolation ? '긴급' : '완료', to: '/dispatch' },
  ]
}

// ── 거래처별 이력 ────────────────────────────────────────────────────────────
export function clientSchedules(data: AppData, clientId: string) {
  return data.schedules
    .filter((s) => s.clientId === clientId)
    .sort((a, b) => (b.date + b.scheduledTime).localeCompare(a.date + a.scheduledTime))
}

export function clientMaterials(data: AppData, clientId: string) {
  return data.materials
    .filter((m) => m.clientId === clientId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function lastCollection(data: AppData, clientId: string) {
  return clientSchedules(data, clientId).find((s) => s.status === '완료')
}

export function nextSchedule(data: AppData, clientId: string) {
  const t = today()
  return data.schedules
    .filter((s) => s.clientId === clientId && s.date >= t && s.status !== '완료')
    .sort((a, b) => (a.date + a.scheduledTime).localeCompare(b.date + b.scheduledTime))[0]
}

/**
 * 이 거래처의 엑셀 월 실적 (0025) — 최근 달부터.
 *
 *  엑셀 정산 시트의 월 합계입니다. 날짜별 수거 기록이 아니라 월 단위 값이라,
 *  시스템이 수거에서 계산한 값과 섞지 않고 따로 씁니다.
 */
export function monthlyActualsFor(data: AppData, clientId: string) {
  return (data.monthlyActuals ?? [])
    .filter((m) => m.clientId === clientId)
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * 월평균 수거량 (kg).
 *
 *  예전에는 완료된 수거 기록의 **건별 평균**이었습니다. 이름은 「월평균」인데
 *  실제로는 1회 평균이라 뜻이 어긋났고, 무엇보다 엑셀에서 옮겨 온 거래처는
 *  0kg 으로 보였습니다 — 명세서에 날짜가 없는 거래처(오남한양·남양주백)는
 *  수거 기록이 한 건도 없기 때문입니다. 엑셀에는 8개월치가 멀쩡히 있는데도
 *  화면만 비어 있었습니다.
 *
 *  이제 달 단위로 셉니다.
 *   · 수거 기록이 있는 달은 그 달의 합계
 *   · 기록이 없고 엑셀 월 실적만 있는 달은 그 값
 *  두 가지를 달 기준으로 합쳐 평균을 냅니다(같은 달을 두 번 세지 않습니다).
 */
/**
 * 월평균 수거량과 **그 근거**.
 *
 *  화면에 「7.4톤」만 뜨면 대표님은 그 숫자가 어디서 왔는지 알 수 없습니다.
 *  몇 달치를 무엇으로 계산했는지 함께 돌려줍니다.
 */
export function clientMonthlyAvgDetail(data: AppData, clientId: string): {
  avg: number
  months: number
  fromRecords: number
  fromExcel: number
} {
  const byMonth = new Map<string, { kg: number; src: '기록' | '엑셀' }>()
  for (const s of clientSchedules(data, clientId)) {
    if (s.status !== '완료' || s.actualAmount == null) continue
    const m = s.date.slice(0, 7)
    const cur = byMonth.get(m)
    byMonth.set(m, { kg: (cur?.kg ?? 0) + s.actualAmount, src: '기록' })
  }
  for (const a of data.monthlyActuals ?? []) {
    if (a.clientId !== clientId || byMonth.has(a.month)) continue
    const kg = a.medicalKg + a.diaperKg
    if (kg > 0) byMonth.set(a.month, { kg, src: '엑셀' })
  }
  const vals = [...byMonth.values()]
  const sum = vals.reduce((s, v) => s + v.kg, 0)
  return {
    avg: vals.length ? Math.round(sum / vals.length) : 0,
    months: vals.length,
    fromRecords: vals.filter((v) => v.src === '기록').length,
    fromExcel: vals.filter((v) => v.src === '엑셀').length,
  }
}

export function clientMonthlyAvg(data: AppData, clientId: string): number {
  const byMonth = new Map<string, number>()
  for (const s of clientSchedules(data, clientId)) {
    if (s.status !== '완료' || s.actualAmount == null) continue
    const m = s.date.slice(0, 7)
    byMonth.set(m, (byMonth.get(m) ?? 0) + s.actualAmount)
  }
  for (const a of data.monthlyActuals ?? []) {
    if (a.clientId !== clientId) continue
    //  같은 달에 수거 기록이 있으면 그쪽이 더 정확합니다 — 덮지 않습니다.
    if (byMonth.has(a.month)) continue
    const kg = a.medicalKg + a.diaperKg
    if (kg > 0) byMonth.set(a.month, kg)
  }
  if (byMonth.size === 0) return 0
  const sum = [...byMonth.values()].reduce((a, b) => a + b, 0)
  return Math.round(sum / byMonth.size)
}

/** 이 거래처에서 아직 못 받은 돈 — 부분입금을 뺀 값 */
export function clientOutstanding(data: AppData, clientId: string): number {
  return data.payments
    .filter((p) => p.clientId === clientId)
    .reduce((s, p) => s + outstandingOf(data, p), 0)
}

// ── 수거대장 행 (수거이력 + 자재공급 통합) ──────────────────────────────────
export interface LogRow {
  date: string
  wasteType: WasteType | '자재공급'
  amount: number | null
  box: number
  vinyl: number
  needle: number
  manager: string
  note: string
}

export function collectionLog(data: AppData, clientId: string, month = thisMonth()): LogRow[] {
  const rows: LogRow[] = []
  for (const s of data.schedules) {
    if (s.clientId !== clientId || s.status !== '완료' || !s.date.startsWith(month)) continue
    const driver = s.driverName ?? data.vehicles.find((v) => v.id === s.vehicleId)?.driver ?? '-'
    const c = s.containers
    rows.push({
      date: s.date,
      wasteType: s.wasteType,
      amount: s.actualAmount,
      box: c?.corrugated ?? 0,
      vinyl: c?.bag ?? 0,
      needle: c?.plastic ?? 0,
      manager: driver,
      note: s.memo ? s.memo : '정상수거',
    })
  }
  for (const m of data.materials) {
    if (m.clientId !== clientId || !m.date.startsWith(month)) continue
    rows.push({
      date: m.date,
      wasteType: '자재공급',
      amount: null,
      box: m.boxCount,
      vinyl: m.vinylCount,
      needle: m.needleBoxCount,
      manager: '-',
      note: m.isAdditionalRequest ? '추가공급' : '정기공급',
    })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

// ─────────────────────────────────────────────────────────────────────────────
// 현장 운영 파생 데이터 (시연용) — AppData 스키마를 바꾸지 않고 거래처/일정에서 규칙 기반 산출
//  ※ localStorage self-heal(rebuildForToday)과 충돌하지 않도록 저장하지 않고 계산만 함
// ─────────────────────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0')

// ── 인증·실사 대응 ────────────────────────────────────────────────────────────
export type InspectionStatus = '예정' | '사전 확인 필요' | '자료 준비 중' | '완료'
export interface InspectionItem {
  clientId: string
  clientName: string
  type: string
  dday: number
  status: InspectionStatus
  needs: string[]
}

/** 14일 이내 인증·실사 예정 (병원·요양병원 우선, 규칙 기반 시연 데이터) */
export function inspectionAlerts(data: AppData): InspectionItem[] {
  const pool = data.clients.filter((c) => c.type === '병원' || c.type === '요양병원')
  const base = pool.length ? pool : data.clients
  const defs: Omit<InspectionItem, 'clientId' | 'clientName'>[] = [
    { type: '병원 정기인증', dday: 7, status: '사전 확인 필요', needs: ['수거대장', '전용 용기 재고', '최근 3개월 수거이력'] },
    { type: '보건소 실사', dday: 13, status: '자료 준비 중', needs: ['월간 명세', '자재 공급 내역'] },
  ]
  return defs
    .map((d, i) => (base[i] ? { clientId: base[i].id, clientName: base[i].name, ...d } : null))
    .filter((x): x is InspectionItem => x !== null)
}

/** 특정 거래처의 인증·실사 예정 (없으면 undefined) */
export function clientInspection(data: AppData, clientId: string): InspectionItem | undefined {
  return inspectionAlerts(data).find((a) => a.clientId === clientId)
}

// ── 병원 요청사항 ─────────────────────────────────────────────────────────────
// v7 이전에는 규칙으로 만들어 낸 화면용 예시였습니다.
// 이제는 병원 담당자가 포털에서 직접 올리거나(source='portal'),
// 전화·카톡으로 받은 것을 비원미래가 대신 접수한(source='staff') 실제 기록입니다.
export type { RequestStatus }
export interface RequestItem {
  id: string
  clientId: string
  clientName: string
  /** 요청 유형 (긴급수거 / 추가수거 / 소모품 / 교육·자료 / 기타) */
  type: RequestKind
  content: string
  /** 접수 시각 (YYYY-MM-DD HH:mm) */
  when: string
  urgent: boolean
  status: RequestStatus
  source: RequestSource
  requesterName: string
  reply: string
  desiredDate: string | null
  /** 수거 완료로 자동 종료된 건 */
  autoProcessed?: boolean
  processedAt?: string
}

const whenOf = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 병원 요청 목록 — 최신순 */
export function clientRequests(data: AppData): RequestItem[] {
  return [...(data.requests ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName || data.clients.find((c) => c.id === r.clientId)?.name || '거래처',
      type: r.kind,
      content: r.content,
      when: whenOf(r.createdAt),
      urgent: r.urgent,
      status: r.status,
      source: r.source,
      requesterName: r.requesterName,
      reply: r.reply,
      desiredDate: r.desiredDate,
      autoProcessed: r.status === '처리 완료' && r.reply === '수거 완료로 처리되었습니다.',
      processedAt: r.handledAt ?? undefined,
    }))
}

/** 아직 처리되지 않은 요청 */
export function openRequests(data: AppData): RequestItem[] {
  return clientRequests(data).filter((r) => r.status !== '처리 완료')
}

/** 특정 거래처의 요청사항 */
export function requestsForClient(data: AppData, clientId: string): RequestItem[] {
  return clientRequests(data).filter((r) => r.clientId === clientId)
}

/** 이 수거 완료 입력으로 자동 종료되는 요청 — 수거하면 수거요청이, 자재를 함께 주면 소모품요청이 닫힙니다. */
export function requestsClosedByCollection(
  data: AppData,
  clientId: string,
  suppliedAny: boolean,
): RequestItem[] {
  return openRequests(data).filter(
    (r) =>
      r.clientId === clientId &&
      (r.type === '긴급수거' || r.type === '추가수거' || (suppliedAny && r.type === '소모품')),
  )
}

// ── 자재 공급 대비 배출 비교 ──────────────────────────────────────────────────
export type UsageStatus = '정상' | '확인 필요' | '점검 필요'
export interface MaterialUsageRow {
  clientId: string
  clientName: string
  suppliedUnits: number // 이번 달 공급 자재 수량 합(박스+용기+봉투)
  dischargedKg: number // 이번 달 수거량
  ratio: number // 배출/공급 지표 (kg per unit)
  status: UsageStatus
  note: string
}

/** 이번 달 자재 공급량 대비 실제 배출량(수거량) 비교 — 과다사용/누락 "가능성"만 표시 */
export function materialUsage(data: AppData, month = thisMonth()): MaterialUsageRow[] {
  const rows: MaterialUsageRow[] = []
  for (const c of data.clients) {
    const mats = data.materials.filter((m) => m.clientId === c.id && m.date.startsWith(month))
    if (mats.length === 0) continue
    const suppliedUnits = mats.reduce((s, m) => s + m.boxCount + m.needleBoxCount + Math.round(m.vinylCount / 2), 0)
    const dischargedKg = data.schedules
      .filter((s) => s.clientId === c.id && s.status === '완료' && s.date.startsWith(month) && s.actualAmount != null)
      .reduce((s, x) => s + (x.actualAmount ?? 0), 0)
    if (suppliedUnits === 0) continue
    const ratio = Math.round((dischargedKg / suppliedUnits) * 10) / 10
    // 배출/공급 지표가 낮으면(공급 대비 배출 적음) 확인 필요, 매우 낮으면 점검 필요
    const status: UsageStatus = ratio >= 6 ? '정상' : ratio >= 3 ? '확인 필요' : '점검 필요'
    const note =
      status === '정상'
        ? '공급 대비 배출 정상 범위'
        : status === '확인 필요'
          ? '공급 대비 배출량 적음 — 사용량 점검 필요'
          : '공급 대비 배출량 크게 적음 — 담당자 확인 권장'
    rows.push({ clientId: c.id, clientName: c.name, suppliedUnits, dischargedKg, ratio, status, note })
  }
  return rows.sort((a, b) => a.ratio - b.ratio).slice(0, 6)
}

// ── 수거 완료 후 입력 대기 (오늘 방문 예정시간 지난 미완료 건) ────────────────
export function pendingInputSchedules(data: AppData): typeof data.schedules {
  const t = today()
  //  기기 시각이 아니라 한국 시각으로 비교합니다 — 시간대가 어긋난 기기에서
  //  「입력 대기」가 아홉 시간 일찍/늦게 뜨지 않도록.
  const hhmm = nowHm()
  return schedulesOn(data, t).filter((s) => s.status === '지연' || (s.status !== '완료' && s.scheduledTime < hhmm))
}

// ── 오늘 처리장 인계 예정 (배차된 차량 기준) ─────────────────────────────────
export interface HandoverItem {
  facilityId: string
  facilityName: string
  wasteType: WasteType
  targetTime: string
  vehicleCount: number
}
export function handoverToday(data: AppData): HandoverItem[] {
  const plans = dispatchPlans(data).filter((p) => p.stops.length > 0)
  const facilities = new Map<string, HandoverItem>()
  for (const p of plans) {
    const key = p.facilityName
    if (!facilities.has(key)) {
      facilities.set(key, {
        facilityId: key,
        facilityName: p.facilityName,
        wasteType: p.wasteType,
        targetTime: p.handoverTime,
        vehicleCount: 0,
      })
    }
    facilities.get(key)!.vehicleCount += 1
  }
  return [...facilities.values()]
}

// ── 오늘 업무 진행 현황 (대시보드용) ─────────────────────────────────────────
export function todayProgress(data: AppData) {
  const list = schedulesOn(data, today())
  const done = list.filter((s) => s.status === '완료').length
  const inProgress = pendingInputSchedules(data).length
  const handoverDone = handoverToday(data).length
  return {
    planned: list.length,
    inProgress,
    done,
    handover: handoverDone,
    pendingInput: inProgress,
  }
}

// ── 거래처 운영 프로필 (파생 시연 데이터 · id 기반 결정적 생성) ───────────────
export interface ClientProfile {
  startDate: string
  contractStatus: string
  paymentTerm: string
  roleManager: string
  medicalCycle: string
  diaperCycle: string
  pickupWindow: string
  facility: string
}
/**
 * 거래처 운영조건.
 *
 *  예전에는 이 값들을 **거래처 id 로 만들어 냈습니다.** 거래 시작일은
 *  id 글자 합을 4로 나눈 나머지로 연도를 정했고, 결제조건·수거 가능시간·
 *  처리장은 유형별 고정 문구였습니다.
 *
 *  그래서 오남한양병원 화면에는 엑셀에 「계약일 2025-05-01 · 익월 25일」이
 *  적혀 있는데도 **「거래 시작일 2022.02 · 월말 마감 · 익월 15일 입금」**
 *  이라고 떴습니다. 화면 위 계약 뱃지(실제값)와 아래 표(지어낸 값)가
 *  서로 다른 말을 하고 있었던 것입니다.
 *
 *  운영 시스템에서 지어낸 값은 없는 값보다 나쁩니다. 이제 실제로 저장된
 *  것만 쓰고, 없으면 없다고 적습니다.
 */
export function clientProfile(client: Client): ClientProfile {
  const roleByType: Record<string, string> = {
    병원: '원무과 담당', 요양병원: '시설관리 담당', 요양원: '시설관리 담당', 의원: '접수실 담당',
    치과: '접수실 담당', 한의원: '접수실 담당', 한방병원: '원무과 담당', 장례식장: '시설관리 담당',
  }
  //  계약 시작일 — 엑셀·거래처 정보에 있는 값만
  const start = client.contractStart
    ? `${client.contractStart.slice(0, 4)}.${client.contractStart.slice(5, 7)}`
    : '미등록'
  //  계약 상태 — 종료일이 지났으면 만료입니다. 늘 「정기 계약」이라고
  //  적어 두면 만료된 계약도 정상으로 보입니다.
  const contractStatus = (() => {
    if (!client.contractStart && !client.contractEnd) return '미등록'
    if (client.contractEnd && client.contractEnd < today()) return `만료 (${client.contractEnd})`
    return client.contractEnd ? `정기 계약 (~${client.contractEnd})` : '정기 계약'
  })()
  return {
    startDate: start,
    contractStatus,
    //  결제조건은 거래처에 저장된 문구 그대로. 없으면 없다고 씁니다.
    paymentTerm: client.paymentTerms?.trim()
      ? client.paymentTerms
      : client.paymentDueDay
        ? `익월 ${client.paymentDueDay}일`
        : '미등록',
    //  담당자 이름이 있으면 그것을, 없으면 유형별 통상 부서명을 씁니다
    //  (이건 사람 이름이 아니라 "어느 부서와 이야기하는지"의 안내입니다).
    roleManager: client.manager?.trim() || roleByType[client.type] || '병원 폐기물 담당',
    medicalCycle: client.collectsMedicalWaste ? client.collectionCycle || '미등록' : '해당 없음',
    diaperCycle: client.collectsDiaper ? client.collectionCycle || '미등록' : '해당 없음',
    //  수거 가능시간·처리장은 저장하는 칸이 아직 없습니다. 있는 척하지 않습니다.
    pickupWindow: '미등록',
    facility: '미등록',
  }
}

// ── 거래처 수거이력 (성상·용기·인계 포함, 파생) ──────────────────────────────
export interface HistoryRow {
  id: string
  date: string
  scheduledTime: string
  actualTime: string
  wasteType: WasteType
  form: string
  amountKg: number | null
  containerType: string
  containerCount: number
  driver: string
  vehicleName: string
  handoverTime: string
  handoverStatus: HandoverStatus | null
  handedOver: boolean
  kind: '정기' | '추가' | '긴급'
  note: string
  inLedger: boolean
  fromField: boolean // 현장에서 직접 입력된 기록
}
export function collectionHistory(data: AppData, clientId: string, limit = 10): HistoryRow[] {
  return clientSchedules(data, clientId)
    .slice(0, limit)
    .map((s) => {
      const v = data.vehicles.find((x) => x.id === s.vehicleId)
      const facility = facilityByWaste(s.wasteType)
      const done = s.status === '완료'
      const seed = [...s.id].reduce((a, ch) => a + ch.charCodeAt(0), 0)
      const kind: HistoryRow['kind'] = s.status === '긴급' ? '긴급' : s.memo.includes('추가') ? '추가' : '정기'
      const form = s.wasteType === '일회용기저귀' ? '고상(기저귀)' : ['위해성(고상)', '손상성', '병리계'][seed % 3]
      // 저장된 용기별 배출 수량이 있으면 사용, 없으면 결정적 파생값
      const c = s.containers
      const containerType = s.wasteType === '일회용기저귀' ? '전용 봉투' : ['골판지 전용박스', '합성수지 전용용기'][seed % 2]
      const containerCount = c ? c.corrugated + c.plastic + c.bag + c.etc : 2 + (seed % 8)
      const handoverStatus = s.handoverStatus ?? (done ? '인계 완료' : null)
      return {
        id: s.id,
        date: s.date,
        scheduledTime: s.scheduledTime,
        actualTime: s.actualTime ?? (done ? s.scheduledTime : '-'),
        wasteType: s.wasteType,
        form,
        amountKg: s.actualAmount,
        containerType,
        containerCount,
        driver: s.driverName ?? v?.driver ?? '-',
        vehicleName: v?.name ?? '-',
        handoverTime: facility?.targetTime ?? '-',
        handoverStatus,
        handedOver: handoverStatus === '인계 완료',
        kind,
        note: s.memo || (done ? '정상수거' : ''),
        inLedger: done,
        fromField: s.origin === 'field',
      }
    })
}
export function collectionHistorySummary(data: AppData, clientId: string, month = thisMonth()) {
  const all = clientSchedules(data, clientId)
  const done = all.filter((s) => s.status === '완료' && s.date.startsWith(month))
  return {
    count: done.length,
    totalKg: done.reduce((a, s) => a + (s.actualAmount ?? 0), 0),
    urgent: all.filter((s) => s.status === '긴급').length,
    sameDayMaterial: data.materials.filter((m) => m.clientId === clientId && m.date.startsWith(month)).length,
  }
}

// ── 거래처 자재 종류별 요약 ───────────────────────────────────────────────────
export interface MaterialTypeRow {
  type: string
  suppliedMonth: number
  lastDate: string | null
  estRemain: number
  status: UsageStatus
}
export function clientMaterialSummary(data: AppData, clientId: string, month = thisMonth()): MaterialTypeRow[] {
  const mats = data.materials.filter((m) => m.clientId === clientId)
  const monthMats = mats.filter((m) => m.date.startsWith(month))
  const last = mats.length ? [...mats].map((m) => m.date).sort().reverse()[0] : null
  const sum = (k: 'boxCount' | 'vinylCount' | 'needleBoxCount') => monthMats.reduce((a, m) => a + m[k], 0)
  const mk = (type: string, supplied: number): MaterialTypeRow => ({
    type,
    suppliedMonth: supplied,
    lastDate: last,
    estRemain: Math.round(supplied * 0.35),
    status: supplied === 0 ? '확인 필요' : '정상',
  })
  return [mk('골판지 전용박스', sum('boxCount')), mk('전용 봉투(비닐)', sum('vinylCount')), mk('합성수지 전용용기', sum('needleBoxCount'))]
}

// ── 거래처 결제·미수금 행 ─────────────────────────────────────────────────────
export type BillStatus = '정상' | '부분입금' | '입금 예정' | '확인 필요' | '장기 미수' | '취소'
export interface BillRow {
  id: string
  month: string
  amount: number
  paid: number
  outstanding: number
  status: BillStatus
  invoiceIssued: boolean
  note: string
}
//  계산은 selectors 한 곳에만 둡니다 — 미수금을 두 벌로 계산하다가
//  화면마다 숫자가 갈렸던 자리입니다. 여기서는 이름만 다시 내보냅니다.
export { paidTotalOf, outstandingOf } from './selectors'

/** 이 청구의 입금 기록 (최근 순) */
export function receiptsOf(data: AppData, paymentId: string) {
  return (data.receipts ?? [])
    .filter((r) => r.paymentId === paymentId)
    .slice()
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))
}

export function clientPaymentRows(data: AppData, clientId: string): BillRow[] {
  return data.payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
    .map((p) => {
      const paid = p.status === '취소' ? 0 : paidTotalOf(data, p)
      const outstanding = outstandingOf(data, p)
      //  취소한 청구는 받을 돈이 아닙니다. 표에는 남기되 미수 금액은 0 으로 둡니다.
      //  「부분입금」은 받은 돈이 있는데 아직 남은 상태입니다 — 「입금 예정」과
      //  다릅니다. 한 푼도 안 들어온 것과 절반 들어온 것을 같게 보면 안 됩니다.
      const status: BillStatus =
        p.status === '취소' ? '취소'
        : outstanding <= 0 ? '정상'
        : p.status === '확인필요' ? '확인 필요'
        : paid > 0 ? '부분입금'
        : '입금 예정'
      return { id: p.id, month: p.billingMonth, amount: p.amount, paid, outstanding, status, invoiceIssued: true, note: p.memo }
    })
}
