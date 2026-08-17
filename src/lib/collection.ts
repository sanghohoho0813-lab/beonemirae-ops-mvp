import type {
  AppData,
  CollectionEvent,
  ContainerBreakdown,
  EventRole,
  HandoverStatus,
  MaterialSupply,
  OfficeStock,
  Schedule,
  ScheduleStatus,
  WasteType,
} from '../types'
import { requestsClosedByCollection } from './ops'
import { today } from './format'
import { checkAmount, checkItemCounts, itemCheckMessage } from './amountCheck'
import { uid } from './storage'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 완료 통합 커맨드 (3단계 핵심)
//
//  현장 담당자가 "한 번" 입력한 수거정보를 아래 업무 데이터에 원자적으로 연결합니다.
//   · 오늘 일정 완료 처리 (또는 직접 입력 시 완료 일정 생성)
//   · 수거이력 / 거래처 최근 활동 / 월간 수거량 (일정에서 파생 — 자동 반영)
//   · 자재 동시공급 이력 + 사무실 재고 차감
//   · 처리장 인계 상태
//   · 관련 병원 요청 자동 처리
//   · 대시보드 KPI / 통계 / 수거대장·월간 명세 초안 (파생 — 자동 반영)
//   · 입력 이벤트(감사기록) 기록 → 되돌리기(rollback) 지원
//
//  ※ 모든 처리는 순수 함수로 "복사 → 검증 → 적용 → 새 AppData 반환" 흐름을 따르며,
//    검증 실패 시 어떤 데이터도 바꾸지 않습니다(원자성). 저장은 호출측(Context)에서 1회 수행.
// ─────────────────────────────────────────────────────────────────────────────

/** 자재 동시공급 수량 (사무실 재고 종류와 1:1) */
export interface SuppliedMaterials {
  corrugatedBox: number // 골판지 전용박스
  plasticContainer: number // 합성수지 전용용기
  bag: number // 전용 봉투(비닐)
  needleBox: number // 합성수지 바늘통
}

export interface CollectionCompletionInput {
  scheduleId: string | null // null = 직접 입력(새 완료 일정 생성)
  clientId: string
  wasteType: WasteType
  vehicleId: string
  driverName: string
  actualAmount: number
  actualTime: string
  /**
   * 실제로 **다녀온 날** (YYYY-MM-DD, 0061). 안 보내면 오늘입니다.
   *
   *  ⚠ 저녁이나 다음 날 아침에 넣으면 날짜가 하루 밀립니다. 월말에는
   *  그 하루가 **다른 달 매출**이 됩니다 — 31일 수거를 1일에 넣으면 그 달
   *  청구에서 빠집니다. 예정 일정을 눌러 완료하는 길은 그 일정의 날짜를
   *  쓰므로 이 값이 필요 없습니다.
   */
  date?: string
  containers: ContainerBreakdown
  handoverStatus: HandoverStatus
  supplied: SuppliedMaterials
  /**
   * 규격별 공급 수량 (v8) — 예: { box63: 10, plastic20: 3 }
   * 정산·거래명세서가 이 값을 씁니다(규격마다 단가가 다르기 때문). 재고는
   * 위 supplied(4칸)로 차감하며, 두 값은 화면에서 함께 만들어집니다.
   */
  suppliedItems?: Record<string, number>
  isAdditional: boolean
  memo: string
  role: EventRole
  screen: string
  demoSessionId?: string | null // 시연 세션 중 입력이면 세션 id (없으면 실사용 field 로 기록)
  // 성과측정용: 입력 화면 진입 → 저장까지의 실제 경과시간(ms). 미측정이면 생략.
  inputDurationMs?: number | null
}

export interface CommandResult {
  ok: boolean
  data?: AppData
  event?: CollectionEvent
  errors: string[] // 처리 차단 사유
  warnings: string[] // 진행은 가능하나 확인 권장
}

export const EMPTY_CONTAINERS: ContainerBreakdown = { corrugated: 0, plastic: 0, bag: 0, etc: 0 }
export const EMPTY_SUPPLIED: SuppliedMaterials = { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 }

export function containerTotal(c: ContainerBreakdown): number {
  return c.corrugated + c.plastic + c.bag + c.etc
}
export function suppliedTotal(s: SuppliedMaterials): number {
  return s.corrugatedBox + s.plasticContainer + s.bag + s.needleBox
}

const STOCK_LABEL: Record<keyof OfficeStock, string> = {
  corrugatedBox: '골판지 전용박스',
  plasticContainer: '합성수지 전용용기',
  bag: '전용 봉투',
  needleBox: '합성수지 바늘통',
}

// ── 검증 ─────────────────────────────────────────────────────────────────────
function validate(data: AppData, input: CollectionCompletionInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  const client = data.clients.find((c) => c.id === input.clientId)
  if (!client) errors.push('거래처를 찾을 수 없습니다. 거래처를 선택해 주세요.')

  if (!input.actualTime) errors.push('실제 수거 시간을 입력해 주세요.')

  if (!Number.isFinite(input.actualAmount) || input.actualAmount <= 0) {
    errors.push('실제 수거량은 0kg보다 커야 합니다.')
  }

  // 차량 폐기물 구분 일치 (의료폐기물 ↔ 기저귀 양방향 차단)
  const vehicle = data.vehicles.find((v) => v.id === input.vehicleId)
  if (!vehicle) {
    errors.push('배차 차량을 선택해 주세요.')
  } else if (vehicle.wasteType !== input.wasteType) {
    errors.push(
      `${input.wasteType} 수거에는 ${input.wasteType} 차량만 배차할 수 있습니다. (선택한 차량: ${vehicle.wasteType})`,
    )
  }

  //  평소와 크게 다른 수거량 — 차량 적재량만으로는 작은 거래처의 오타를
  //  못 잡습니다. 30kg 거래처가 300kg 이 되어도 1톤 차량 안입니다.
  const amt = checkAmount(data, input.clientId, input.wasteType, input.actualAmount, input.scheduleId)
  if (amt.message) warnings.push(amt.message)
  const itemMsg = itemCheckMessage(checkItemCounts(data, input.clientId, input.suppliedItems ?? {}))
  if (itemMsg) warnings.push(itemMsg)

  //  차량이 실을 수 있는 양을 넘는 수거량은 거의 자릿수 오타입니다.
  //  (88 을 880 으로 치면 그 거래처 그 달 매출이 열 배가 됩니다)
  //  현장 사정을 시스템이 다 알 수는 없으니 막지는 않되, 반드시 알립니다.
  if (vehicle && vehicle.nominalCapacity > 0 && input.actualAmount > vehicle.nominalCapacity) {
    warnings.push(
      `입력한 수거량 ${input.actualAmount.toLocaleString('ko-KR')}kg 이 ` +
        `${vehicle.name} 최대 적재량 ${vehicle.nominalCapacity.toLocaleString('ko-KR')}kg 을 넘습니다. ` +
        `자릿수를 확인해 주세요.`,
    )
  }

  // 거래처 배출 구분 확인 (차단은 아니고 경고)
  if (client) {
    if (input.wasteType === '일회용기저귀' && !client.collectsDiaper) {
      warnings.push(`${client.name}는 일회용기저귀 수거 대상으로 등록되어 있지 않습니다. 구분을 확인해 주세요.`)
    }
    if (input.wasteType === '의료폐기물' && !client.collectsMedicalWaste) {
      warnings.push(`${client.name}는 의료폐기물 수거 대상으로 등록되어 있지 않습니다. 구분을 확인해 주세요.`)
    }
  }

  // 중복 완료 방지
  if (input.scheduleId) {
    const s = data.schedules.find((x) => x.id === input.scheduleId)
    if (!s) errors.push('선택한 일정을 찾을 수 없습니다.')
    else if (s.status === '완료') errors.push('이미 완료 처리된 일정입니다. (중복 완료 방지)')
  }

  // 사무실 재고 초과 차단
  ;(Object.keys(input.supplied) as (keyof OfficeStock)[]).forEach((k) => {
    const req = input.supplied[k]
    if (req > 0 && req > data.officeStock[k]) {
      errors.push(`사무실 ${STOCK_LABEL[k]} 재고(${data.officeStock[k]})보다 많이 공급할 수 없습니다. (요청 ${req})`)
    }
  })

  return { errors, warnings }
}

// ── 완료 상태 일정 필드 구성 ──────────────────────────────────────────────────
function completedFields(input: CollectionCompletionInput, eventId: string, nowIso: string) {
  return {
    status: '완료' as ScheduleStatus,
    actualAmount: input.actualAmount,
    actualTime: input.actualTime,
    completedAt: nowIso,
    containers: input.containers,
    driverName: input.driverName,
    handoverStatus: input.handoverStatus,
    handoverAt: input.handoverStatus === '인계 완료' ? nowIso : null,
    memo: input.memo,
    wasteType: input.wasteType,
    vehicleId: input.vehicleId,
    eventId,
    // 시연 세션 입력은 'demo'(초기화 대상), 실사용 입력은 'field'(보존)
    origin: (input.demoSessionId ? 'demo' : 'field') as 'demo' | 'field',
  }
}

/**
 * 수거 완료 통합 커맨드 — 검증 통과 시 모든 연결을 반영한 새 AppData 를 반환합니다.
 * 실패 시 data 는 undefined, errors 에 사유가 담깁니다(원본 불변).
 */
export function applyCollectionCompletion(data: AppData, input: CollectionCompletionInput): CommandResult {
  const { errors, warnings } = validate(data, input)
  if (errors.length) return { ok: false, errors, warnings }

  const client = data.clients.find((c) => c.id === input.clientId)!
  const eventId = uid('evt')
  const nowIso = new Date().toISOString()
  const t = today()

  // 1) 수거일정 — 기존 예정 완료 처리 또는 직접 입력 시 새 완료 일정 생성
  let scheduleId: string
  let createdSchedule = false
  let before: CollectionEvent['before']
  let schedules: Schedule[]

  const existing = input.scheduleId ? data.schedules.find((s) => s.id === input.scheduleId) : undefined
  if (existing) {
    scheduleId = existing.id
    before = {
      status: existing.status,
      actualAmount: existing.actualAmount,
      handoverStatus: existing.handoverStatus ?? null,
    }
    schedules = data.schedules.map((s) => (s.id === existing.id ? { ...s, ...completedFields(input, eventId, nowIso) } : s))
  } else {
    createdSchedule = true
    const ns: Schedule = {
      id: uid('s'),
      date: t,
      clientId: input.clientId,
      scheduledTime: input.actualTime,
      expectedAmount: input.actualAmount,
      ...completedFields(input, eventId, nowIso),
    }
    scheduleId = ns.id
    before = { status: '예정', actualAmount: null, handoverStatus: null }
    schedules = [...data.schedules, ns]
  }

  // 2) 자재 동시공급 이력 + 3) 사무실 재고 차감
  const materialIds: string[] = []
  let materials = data.materials
  const stockBefore: OfficeStock = { ...data.officeStock }
  const suppliedAny = suppliedTotal(input.supplied) > 0
  if (suppliedAny) {
    const m: MaterialSupply = {
      id: uid('m'),
      date: t,
      clientId: input.clientId,
      boxCount: input.supplied.corrugatedBox,
      vinylCount: input.supplied.bag,
      needleBoxCount: input.supplied.plasticContainer + input.supplied.needleBox,
      isAdditionalRequest: input.isAdditional,
      memo: '수거 완료 시 동시공급',
      items: input.suppliedItems,
    }
    materialIds.push(m.id)
    materials = [...data.materials, m]
  }
  const officeStock: OfficeStock = {
    corrugatedBox: data.officeStock.corrugatedBox - input.supplied.corrugatedBox,
    plasticContainer: data.officeStock.plasticContainer - input.supplied.plasticContainer,
    bag: data.officeStock.bag - input.supplied.bag,
    needleBox: data.officeStock.needleBox - input.supplied.needleBox,
  }

  // 4) 관련 병원 요청 자동 처리
  //    병원이 올린 수거요청은 수거하면 닫히고, 소모품 요청은 자재를 함께 공급했을 때 닫힙니다.
  //    교육·자료 요청은 별도 처리가 필요하므로 자동 종료하지 않습니다.
  const closing = requestsClosedByCollection(data, input.clientId, suppliedAny)
  const requestUpdates: CollectionEvent['requestUpdates'] = closing.map((r) => ({
    requestId: r.id,
    from: r.status,
    to: '처리 완료' as const,
  }))
  const closingIds = new Set(closing.map((r) => r.id))
  const requests = (data.requests ?? []).map((r) =>
    closingIds.has(r.id)
      ? {
          ...r,
          status: '처리 완료' as const,
          handledAt: nowIso,
          reply: r.reply || '수거 완료로 처리되었습니다.',
        }
      : r,
  )

  // 5) 이벤트(감사기록 + 되돌리기 원장)
  const event: CollectionEvent = {
    id: eventId,
    at: nowIso,
    role: input.role,
    screen: input.screen,
    action: '수거 완료',
    scheduleId,
    createdSchedule,
    clientId: input.clientId,
    clientName: client.name,
    wasteType: input.wasteType,
    amountKg: input.actualAmount,
    before,
    materialIds,
    stockBefore,
    requestUpdates,
    note: input.memo,
    reverted: false,
    revertedAt: null,
    demoSessionId: input.demoSessionId ?? null,
    inputDurationMs: input.inputDurationMs ?? null,
  }

  const nextData: AppData = {
    ...data,
    schedules,
    materials,
    officeStock,
    events: [event, ...data.events],
    requests,
  }

  return { ok: true, data: nextData, event, errors: [], warnings }
}

/**
 * 수거 완료 취소 — 해당 이벤트가 반영한 일정/자재/재고/요청 상태를 원복합니다.
 * (직접 입력으로 생성한 일정은 삭제, 기존 예정 완료 처리는 이전 상태로 되돌림.)
 * 감사기록(event)은 삭제하지 않고 reverted 로 표시해 이력을 유지합니다.
 */
export function rollbackCollectionCompletion(data: AppData, eventId: string): CommandResult {
  const event = data.events.find((e) => e.id === eventId)
  if (!event) return { ok: false, errors: ['취소할 입력을 찾을 수 없습니다.'], warnings: [] }
  if (event.reverted) return { ok: false, errors: ['이미 취소된 입력입니다.'], warnings: [] }
  const nowIso = new Date().toISOString()

  // 1) 일정 원복
  let schedules: Schedule[]
  if (event.createdSchedule) {
    schedules = data.schedules.filter((s) => s.id !== event.scheduleId)
  } else {
    schedules = data.schedules.map((s) =>
      s.id === event.scheduleId
        ? {
            ...s,
            status: event.before.status,
            actualAmount: event.before.actualAmount,
            actualTime: undefined,
            completedAt: null,
            containers: undefined,
            driverName: undefined,
            handoverStatus: event.before.handoverStatus ?? undefined,
            handoverAt: null,
            eventId: null,
            origin: 'seed' as const,
          }
        : s,
    )
  }

  // 2) 자재 이력 제거 + 3) 재고 복원
  const materials = data.materials.filter((m) => !event.materialIds.includes(m.id))
  const officeStock: OfficeStock = { ...event.stockBefore }

  // 4) 자동으로 닫혔던 병원 요청을 다시 열어 둡니다 (요청이 사라지지 않도록)
  const reopened = new Set(event.requestUpdates.map((u) => u.requestId))
  const requests = (data.requests ?? []).map((r) =>
    reopened.has(r.id)
      ? {
          ...r,
          status: '접수' as const,
          handledAt: null,
          handledBy: null,
          reply: r.reply === '수거 완료로 처리되었습니다.' ? '' : r.reply,
        }
      : r,
  )

  // 5) 이벤트는 유지하되 취소 표시
  const events = data.events.map((e) => (e.id === eventId ? { ...e, reverted: true, revertedAt: nowIso } : e))

  const nextData: AppData = { ...data, schedules, materials, officeStock, events, requests }
  return { ok: true, data: nextData, errors: [], warnings: [] }
}
