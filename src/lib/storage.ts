import type { AppData } from '../types'
import { buildSeedData } from '../data/seed'

// ─────────────────────────────────────────────────────────────────────────────
// localStorage 영속화 레이어
//
// 추후 Supabase 로 교체 시, 이 파일의 loadData / saveData 만 비동기 API 호출로
// 바꾸면 되도록 데이터 접근을 한 곳에 모았습니다.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'beonemirae-ops:v1'

/** localStorage 에서 데이터를 읽어옵니다. 없으면 시드 데이터를 생성·저장 후 반환합니다. */
export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      // 최소 무결성 검사 — 손상 시 시드로 복구
      if (parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.schedules)) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('[storage] 데이터 로드 실패, 시드 데이터로 초기화합니다.', err)
  }
  const seed = buildSeedData()
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

/** 모든 데이터를 초기 시드 상태로 되돌립니다. */
export function resetData(): AppData {
  const seed = buildSeedData()
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
