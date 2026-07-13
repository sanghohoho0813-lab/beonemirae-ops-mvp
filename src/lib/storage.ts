import type { AppData } from '../types'
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
        // 시연 신뢰성 자가복구: 저장 데이터의 '오늘 일정'이 없으면(과거 날짜 기준으로 저장됨)
        // 거래처는 유지한 채 일정/자재/결제만 오늘 기준으로 다시 생성해 빈 화면을 방지합니다.
        const hasToday = parsed.schedules.some((s) => s.date === todayStr())
        if (hasToday) return parsed
        const clients = parsed.clients.length ? parsed.clients : buildSeedData(loadClientSet()).clients
        const refreshed = rebuildForToday(clients)
        saveData(refreshed)
        return refreshed
      }
    }
  } catch (err) {
    console.warn('[storage] 데이터 로드 실패, 시드 데이터로 초기화합니다.', err)
  }
  const seed = buildSeedData(loadClientSet())
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
  const seed = buildSeedData(demoCount)
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
