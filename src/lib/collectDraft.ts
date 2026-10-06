import type { ContainerBreakdown, HandoverStatus, WasteType } from '../types'
import type { ItemCounts } from './billing'
import { today } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 입력 임시 보관 (0132)
//
//  기사님 폰에서 수거 입력은 자주 끊깁니다 — 전화가 오고, 카메라를 켜고,
//  지도(0131 주소 링크)를 열었다 돌아오면 폰이 화면을 새로 띄웁니다. 그때마다
//  적던 kg·용기·자재·메모가 다 사라져 처음부터 다시 쳤습니다.
//
//  ⚠ **이 폰 안에만** 둡니다(localStorage). 서버에 보내지 않고, 실적도 아닙니다 —
//    「저장」을 눌러야 기록이 됩니다. 자동으로 다시 채우지도 않습니다. 화면 위에
//    「이어서 입력」을 한 번 누를 때만 되살립니다(남이 쓰던 폰일 수 있습니다).
//  ⚠ **오늘 적던 것만** 씁니다. 어제 것은 버립니다.
//  ⚠ 계정마다 따로 둡니다. 저장에 성공하면 지웁니다.
// ─────────────────────────────────────────────────────────────────────────────

export interface CollectDraft {
  v: 1
  savedAt: number
  day: string
  scheduleId: string
  clientId: string
  wasteType: WasteType
  /** 사무실이 고른 차량 / 현장이 직접 고른 차량 */
  vehicleId: string
  fieldPicked: string | null
  driverName: string
  amount: string
  time: string
  visitDate: string
  containers: ContainerBreakdown
  suppliedItems: ItemCounts
  usedItems: ItemCounts
  isAdditional: boolean
  handover: HandoverStatus
  memo: string
}

const key = (who: string) => `beonemirae-ops:collect-draft:${who || 'demo'}`

export function loadDraft(who: string): CollectDraft | null {
  try {
    const raw = localStorage.getItem(key(who))
    if (!raw) return null
    const d = JSON.parse(raw) as CollectDraft
    if (d?.v !== 1 || d.day !== today()) {
      localStorage.removeItem(key(who))
      return null
    }
    return d
  } catch {
    return null
  }
}

export function saveDraft(who: string, d: Omit<CollectDraft, 'v' | 'savedAt' | 'day'>): void {
  try {
    localStorage.setItem(key(who), JSON.stringify({ ...d, v: 1, savedAt: Date.now(), day: today() }))
  } catch {
    //  저장 공간이 없거나 막힌 브라우저 — 임시 보관만 못 할 뿐 입력은 그대로 됩니다.
  }
}

export function clearDraft(who: string): void {
  try {
    localStorage.removeItem(key(who))
  } catch {
    /* 위와 같음 */
  }
}
