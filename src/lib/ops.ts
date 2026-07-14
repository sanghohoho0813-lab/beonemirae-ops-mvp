import type { AppData, Client, WasteType } from '../types'
import { facilityByWaste } from '../data/ops'
import { schedulesOn, todaySummary, additionalMaterialCount } from './selectors'
import { today, thisMonth } from './format'

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
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const logTargets = new Set(
    data.schedules
      .filter((s) => s.status === '완료' && s.date <= t && new Date(s.date) >= weekAgo)
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

export function clientMonthlyAvg(data: AppData, clientId: string): number {
  const done = clientSchedules(data, clientId).filter((s) => s.status === '완료' && s.actualAmount != null)
  if (done.length === 0) return 0
  const sum = done.reduce((s, x) => s + (x.actualAmount ?? 0), 0)
  return Math.round(sum / done.length)
}

export function clientOutstanding(data: AppData, clientId: string): number {
  return data.payments
    .filter((p) => p.clientId === clientId && p.status !== '입금완료')
    .reduce((s, p) => s + p.amount, 0)
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
    const driver = data.vehicles.find((v) => v.id === s.vehicleId)?.driver ?? '-'
    rows.push({
      date: s.date,
      wasteType: s.wasteType,
      amount: s.actualAmount,
      box: 0,
      vinyl: 0,
      needle: 0,
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
export type RequestStatus = '접수' | '확인 중' | '일정 반영' | '처리 완료'
export interface RequestItem {
  id: string
  clientId: string
  clientName: string
  type: string
  content: string
  when: string
  urgent: boolean
  status: RequestStatus
}

/** 최근 병원 요청사항 (관리자·이사가 전화·카톡으로 받은 요청을 기록한 구조, 시연 데이터) */
export function clientRequests(data: AppData): RequestItem[] {
  const c = data.clients
  if (c.length === 0) return []
  const t = today()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yday = `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`
  const pick = (i: number) => c[i % c.length]
  const defs: { type: string; content: string; when: string; urgent: boolean; status: RequestStatus }[] = [
    { type: '긴급수거', content: '격리환자 발생 — 보관기한 임박, 오늘 중 추가 수거 요청', when: `${t} 08:20`, urgent: true, status: '일정 반영' },
    { type: '인증·실사 자료', content: '병원 정기인증 대비 최근 3개월 수거대장 요청', when: `${t} 09:05`, urgent: false, status: '확인 중' },
    { type: '자재공급', content: '전용 용기 소진 임박 — 다음 수거 시 동시 공급 요청', when: `${yday} 16:40`, urgent: false, status: '일정 반영' },
    { type: '수거대장 요청', content: '월말 통합 명세와 수거대장 이메일 발송 요청', when: `${yday} 14:10`, urgent: false, status: '접수' },
    { type: '담당자 변경', content: '폐기물 담당 부서 변경 — 연락 채널 업데이트 요청', when: `${yday} 11:30`, urgent: false, status: '처리 완료' },
  ]
  return defs.map((d, i) => ({ id: `req${i + 1}`, clientId: pick(i * 2).id, clientName: pick(i * 2).name, ...d }))
}

/** 특정 거래처의 요청사항 */
export function requestsForClient(data: AppData, clientId: string): RequestItem[] {
  return clientRequests(data).filter((r) => r.clientId === clientId)
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
  const now = new Date()
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
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
export function clientProfile(client: Client): ClientProfile {
  const seed = [...client.id].reduce((s, ch) => s + ch.charCodeAt(0), 0)
  const startY = 2021 + (seed % 4)
  const startM = 1 + (seed % 12)
  const roleByType: Record<string, string> = {
    병원: '원무과 담당', 요양병원: '시설관리 담당', 요양원: '시설관리 담당', 의원: '접수실 담당',
    치과: '접수실 담당', 한의원: '접수실 담당', 한방병원: '원무과 담당', 장례식장: '시설관리 담당',
  }
  return {
    startDate: `${startY}.${pad2(startM)}`,
    contractStatus: '정기 계약',
    paymentTerm: client.type === '병원' || client.type === '요양병원' ? '월말 마감 · 익월 15일 입금' : '월말 마감 · 익월 10일 입금',
    roleManager: roleByType[client.type] ?? '병원 폐기물 담당',
    medicalCycle: client.collectsMedicalWaste ? client.collectionCycle : '해당 없음',
    diaperCycle: client.collectsDiaper ? (client.collectionCycle === '주 3회' ? '주 2회' : client.collectionCycle) : '해당 없음',
    pickupWindow: '평일 09:00 ~ 17:00',
    facility: client.collectsMedicalWaste ? '수도권 의료폐기물 처리장 A' : '수도권 일회용기저귀 처리장 B',
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
  handedOver: boolean
  kind: '정기' | '추가' | '긴급'
  note: string
  inLedger: boolean
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
      const containerType = s.wasteType === '일회용기저귀' ? '전용 봉투' : ['골판지 전용박스', '합성수지 전용용기'][seed % 2]
      return {
        id: s.id,
        date: s.date,
        scheduledTime: s.scheduledTime,
        actualTime: done ? s.scheduledTime : '-',
        wasteType: s.wasteType,
        form,
        amountKg: s.actualAmount,
        containerType,
        containerCount: 2 + (seed % 8),
        driver: v?.driver ?? '-',
        vehicleName: v?.name ?? '-',
        handoverTime: facility?.targetTime ?? '-',
        handedOver: done,
        kind,
        note: s.memo || (done ? '정상수거' : ''),
        inLedger: done,
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
export type BillStatus = '정상' | '입금 예정' | '확인 필요' | '장기 미수'
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
export function clientPaymentRows(data: AppData, clientId: string): BillRow[] {
  return data.payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
    .map((p) => {
      const paid = p.status === '입금완료' ? p.amount : 0
      const status: BillStatus = p.status === '입금완료' ? '정상' : p.status === '확인필요' ? '확인 필요' : '입금 예정'
      return { id: p.id, month: p.billingMonth, amount: p.amount, paid, outstanding: p.amount - paid, status, invoiceIssued: true, note: p.memo }
    })
}
