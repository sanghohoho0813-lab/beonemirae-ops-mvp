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

function findClient(data: AppData, name: string): Client | undefined {
  return data.clients.find((c) => c.name === name)
}

export function isolationAlerts(data: AppData): IsolationAlert[] {
  const plan: { name: string; kind: IsolationKind; message: string }[] = [
    { name: '사랑채요양원', kind: '격리', message: '격리환자 발생 가능 — 보관기한(1주일) 확인 및 추가수거 검토' },
    { name: '하나요양병원', kind: '추가수거', message: '병원 인증기간 추가수거 요청 확인 필요' },
    { name: '미소요양병원', kind: '자재동시공급', message: '보관창고 협소 — 자재 동시공급 권장' },
  ]
  return plan
    .map((p) => {
      const c = findClient(data, p.name)
      return c ? { clientId: c.id, clientName: c.name, kind: p.kind, message: p.message } : null
    })
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

  return [
    { key: 'today', label: '오늘 수거 예정', count: summary.total, status: '정보', to: '/today' },
    { key: 'urgent', label: '긴급 수거', count: summary.긴급, status: summary.긴급 ? '긴급' : '완료', to: '/dispatch' },
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
