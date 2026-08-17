import type { Schedule } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 살아 있는 일정 — 판단을 한 곳에 모읍니다 (0059)
//
//  0059 로 방문을 **무를** 수 있게 됐습니다. 무른 방문은 지우지 않고 남깁니다
//  (「그 병원이 8월 20일 방문을 취소했다」는 사실이 나중에 필요합니다).
//
//  그런데 그 순간, 지금까지 「완료가 아니면 아직 안 간 것」으로 보던 자리가
//  **전부 틀리게 됩니다.** 세어 보니 열두 곳이었습니다 —
//
//    오늘 일정 · 배차 · 미배정 · 밀린 마감 · 월 마감 진행상황 · 다음 방문 ·
//    병원 포털 · 휴무일 겹침 · 채워야 할 값 · 긴급 신호 · 수거 입력 · 지연
//
//  한 곳만 빠뜨리면 **무른 방문이 배차에 남아 기사가 나가거나**, 영원히
//  지워지지 않는 「수거 입력 밀림」이 됩니다. 알림이 죽는 가장 흔한 방식입니다.
//
//  그래서 조건을 각 화면에 흩뿌리지 않고 여기 한 곳에 둡니다. 다음에 상태가
//  하나 더 생겨도 고칠 자리는 이 파일입니다.
//
//  ⚠ **지난 기록에는 이 칸이 없습니다.** 0059 를 실행하기 전 데이터와 옛
//    서버는 canceled_at 을 안 돌려줍니다 — 없으면 「안 무른 것」으로 봅니다.
//    지금까지와 똑같이 동작한다는 뜻입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 무른 방문인가 */
export function isCanceled(s: Pick<Schedule, 'canceledAt'>): boolean {
  return !!s.canceledAt
}

/**
 * 아직 살아 있는 일정인가 — 무르지 않았다는 뜻입니다.
 *
 *  완료 여부는 보지 않습니다. 「완료된 수거」도 살아 있는 기록입니다
 *  (정산·청구가 거기서 나옵니다).
 */
export function isLive(s: Pick<Schedule, 'canceledAt'>): boolean {
  return !s.canceledAt
}

/**
 * **아직 안 간 방문인가.**
 *
 *  이 시스템에서 제일 많이 묻는 질문입니다 — 오늘 갈 곳, 배차할 곳,
 *  미수거, 밀린 마감이 전부 이것을 봅니다.
 */
export function isPending(s: Pick<Schedule, 'status' | 'canceledAt'>): boolean {
  return s.status !== '완료' && !s.canceledAt
}

/** 실제로 다녀온 기록인가 (무른 것은 애초에 완료가 될 수 없습니다) */
export function isDone(s: Pick<Schedule, 'status' | 'canceledAt'>): boolean {
  return s.status === '완료' && !s.canceledAt
}

/** 살아 있는 일정만 (무른 것 제외) */
export function liveOnly<T extends Pick<Schedule, 'canceledAt'>>(list: T[]): T[] {
  return list.filter(isLive)
}

/** 아직 안 간 방문만 */
export function pendingOnly<T extends Pick<Schedule, 'status' | 'canceledAt'>>(list: T[]): T[] {
  return list.filter(isPending)
}

/** 다녀온 기록만 */
export function doneOnly<T extends Pick<Schedule, 'status' | 'canceledAt'>>(list: T[]): T[] {
  return list.filter(isDone)
}
