import type { AppData, CollectionEvent, DemoSession } from '../types'
import { DEFAULT_OFFICE_STOCK, EMPTY_BASELINE, EMPTY_EXPERIMENT, SCHEMA_VERSION } from '../types'
import { buildSeedData, rebuildForToday } from '../data/seed'

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 오늘 날짜 문자열 (YYYY-MM-DD) */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage 영속화 레이어
//
// 추후 Supabase 로 교체 시, 이 파일의 loadData / saveData 만 비동기 API 호출로
// 바꾸면 되도록 데이터 접근을 한 곳에 모았습니다.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'beonemirae-ops:v3'
const CLIENT_SET_KEY = 'beonemirae-ops:client-set'
const SCHEMA_VERSION_KEY = 'beonemirae-ops:schema-version'
const BACKUP_KEY = 'beonemirae-ops:v3:backup-before-schema2'

// ─────────────────────────────────────────────────────────────────────────────
// 스키마 v2 마이그레이션 (3단계)
//  · 기존 저장 데이터(clients/schedules/materials/payments)는 그대로 두고
//    누락된 필드(officeStock/events/requestOverrides, Schedule.origin/eventId 등)만 채웁니다.
//  · 멱등(idempotent): 이미 v2 형태면 그대로 통과. 최초 1회만 백업 생성.
// ─────────────────────────────────────────────────────────────────────────────
type LegacyData = AppData & {
  officeStock?: unknown
  events?: unknown
  requestOverrides?: unknown
  notes?: unknown
  baseline?: unknown
  experiment?: unknown
  leads?: unknown
  requests?: unknown
}

function needsMigration(d: LegacyData): boolean {
  return (
    !d.officeStock ||
    !Array.isArray(d.events) ||
    !Array.isArray(d.requestOverrides) ||
    !Array.isArray(d.notes) ||
    !d.baseline ||
    !d.experiment ||
    !Array.isArray(d.leads) ||
    !Array.isArray(d.requests) ||
    d.schedules.some((s) => s.origin === undefined)
  )
}

export function migrateToV2(parsed: LegacyData): AppData {
  if (!needsMigration(parsed)) return parsed as AppData
  // 최초 마이그레이션 시 원본 백업 (한 번만)
  try {
    if (!localStorage.getItem(BACKUP_KEY)) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(parsed))
    }
  } catch {
    /* noop */
  }
  const schedules = parsed.schedules.map((s) => ({
    ...s,
    // 기존 완료 건은 인계 완료로 간주, 그 외는 상태 없음. 현장 입력 여부는 seed 로 취급.
    handoverStatus: s.handoverStatus ?? (s.status === '완료' ? ('인계 완료' as const) : undefined),
    handoverAt: s.handoverAt ?? null,
    eventId: s.eventId ?? null,
    origin: s.origin ?? ('seed' as const),
  }))
  const migrated: AppData = {
    ...parsed,
    schedules,
    officeStock: parsed.officeStock ? (parsed.officeStock as AppData['officeStock']) : { ...DEFAULT_OFFICE_STOCK },
    events: Array.isArray(parsed.events) ? (parsed.events as CollectionEvent[]) : [],
    requestOverrides: Array.isArray(parsed.requestOverrides)
      ? (parsed.requestOverrides as AppData['requestOverrides'])
      : [],
    // v3: 현장 메모 — 기존 저장 데이터에는 없으므로 빈 배열로 채웁니다.
    notes: Array.isArray(parsed.notes) ? (parsed.notes as AppData['notes']) : [],
    // v4: 성과측정 — 기준값/실증설정이 없으면 '미입력' 상태로 채웁니다(임의 값 생성 금지).
    baseline: (parsed.baseline as AppData['baseline']) ?? { ...EMPTY_BASELINE },
    experiment: (parsed.experiment as AppData['experiment']) ?? { ...EMPTY_EXPERIMENT },
    // v5: 매출 전환 기록 — 없으면 빈 배열로 채웁니다.
    leads: Array.isArray(parsed.leads) ? (parsed.leads as AppData['leads']) : [],
    // v7: 병원 요청 — 이전 저장 데이터에는 없으므로 빈 배열로 채웁니다.
    requests: Array.isArray(parsed.requests) ? (parsed.requests as AppData['requests']) : [],
  }
  try {
    localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION))
  } catch {
    /* noop */
  }
  return migrated
}

/**
 * 하루가 바뀌어 오늘 일정이 비어 있을 때, 시드 기반 오늘 데이터를 다시 만들되
 * 현장에서 직접 입력(origin='field')한 수거 기록과 감사기록/재고는 보존합니다.
 * (오늘 입력이 있으면 loadData 가 rebuild 를 타지 않으므로 오늘분은 항상 안전합니다.)
 */
export function rebuildPreserving(prev: AppData): AppData {
  const clients = prev.clients.length ? prev.clients : buildSeedData(loadClientSet()).clients
  const regen = rebuildForToday(clients)
  const fieldSchedules = prev.schedules.filter((s) => s.origin === 'field')
  const keepMaterialIds = new Set(prev.events.flatMap((e) => e.materialIds))
  const fieldMaterials = prev.materials.filter((m) => keepMaterialIds.has(m.id))
  return {
    ...regen,
    schedules: [...regen.schedules, ...fieldSchedules],
    materials: [...regen.materials, ...fieldMaterials],
    // 감사기록·사무실 재고는 물리적으로 이어지므로 보존, 요청 오버라이드는 새 날이므로 초기화
    events: prev.events,
    officeStock: prev.officeStock,
    requestOverrides: [],
    // 현장 메모는 병원별 정보라 날짜와 무관하게 보존합니다.
    notes: prev.notes ?? [],
    // 성과측정 기준값·실증설정은 사용자 설정이므로 날짜 재생성과 무관하게 보존합니다.
    baseline: prev.baseline ?? { ...EMPTY_BASELINE },
    experiment: prev.experiment ?? { ...EMPTY_EXPERIMENT },
    // 영업 전환 기록은 날짜 재생성과 무관하게 보존합니다.
    leads: prev.leads ?? [],
    // 병원이 올린 요청도 날짜와 무관한 실제 기록이므로 보존합니다.
    requests: prev.requests ?? [],
  }
}

/** 시연용 확장 거래처 수 (0=실제 5곳만, 10/20/30=실제+시연) */
export type ClientSetSize = 0 | 10 | 20 | 30
export const CLIENT_SETS: { demoCount: ClientSetSize; total: number; label: string }[] = [
  { demoCount: 0, total: 5, label: '실제 주요거래처 5곳' },
  { demoCount: 10, total: 15, label: '실제 + 시연용 10곳' },
  { demoCount: 20, total: 25, label: '실제 + 시연용 20곳' },
  { demoCount: 30, total: 35, label: '실제 + 시연용 30곳' },
]

/** 선택된 거래처 세트(시연용 확장 수)를 읽습니다. 기본 0(실제 5곳). */
export function loadClientSet(): ClientSetSize {
  try {
    const raw = localStorage.getItem(CLIENT_SET_KEY)
    const n = Number(raw)
    if (n === 0 || n === 10 || n === 20 || n === 30) return n
  } catch {
    /* noop */
  }
  return 0
}

export function saveClientSet(demoCount: ClientSetSize): void {
  try {
    localStorage.setItem(CLIENT_SET_KEY, String(demoCount))
  } catch {
    /* noop */
  }
}

/** localStorage 에서 데이터를 읽어옵니다. 없거나 구버전이면 현재 세트로 생성·저장 후 반환. */
export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      // 무결성 + 스키마(신규 isDemoGenerated) 검사 — 손상/구버전 시 시드로 복구
      if (
        parsed &&
        Array.isArray(parsed.clients) &&
        Array.isArray(parsed.schedules) &&
        (parsed.clients.length === 0 || 'isDemoGenerated' in parsed.clients[0])
      ) {
        // v1 → v2 스키마 마이그레이션 (누락 필드만 채움, 멱등)
        const migrated = migrateToV2(parsed as AppData)
        // 시연 신뢰성 자가복구: 저장 데이터의 '오늘 일정'이 없으면(과거 날짜 기준으로 저장됨)
        // 거래처·현장 입력 기록은 유지한 채 오늘 기준 시드 데이터만 다시 생성합니다.
        const hasToday = migrated.schedules.some((s) => s.date === todayStr())
        if (hasToday) {
          const ensured = ensureDemoSession(migrated)
          if (ensured !== parsed) saveData(ensured)
          return ensured
        }
        const refreshed = ensureDemoSession(rebuildPreserving(migrated))
        saveData(refreshed)
        return refreshed
      }
    }
  } catch (err) {
    console.warn('[storage] 데이터 로드 실패, 시드 데이터로 초기화합니다.', err)
  }
  const seed = ensureDemoSession(buildSeedData(loadClientSet()))
  saveData(seed)
  return seed
}

/** 데이터를 localStorage 에 저장합니다. */
export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('[storage] 데이터 저장 실패', err)
  }
}

/** 현재(또는 지정한) 거래처 세트 기준으로 데이터를 새로 생성·저장합니다. */
export function resetData(demoCount: ClientSetSize = loadClientSet()): AppData {
  saveClientSet(demoCount)
  const seed = ensureDemoSession(buildSeedData(demoCount))
  saveData(seed)
  return seed
}

/** 간단한 UUID 생성기 (crypto 미지원 환경 폴백 포함) */
export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** 새 시연 세션 생성 (실사 당일 기준 상태 추적용) */
export function newDemoSession(): DemoSession {
  return { id: uid('demo'), startedAt: new Date().toISOString(), active: true }
}

/** 시연 세션이 없으면 부여 (기존 세션은 유지) */
export function ensureDemoSession(data: AppData): AppData {
  if (data.demoSession && data.demoSession.id) return data
  return { ...data, demoSession: newDemoSession() }
}
