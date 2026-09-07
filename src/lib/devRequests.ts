import type { UserRole } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 피드백 · 요청함 — 저장소와 상태값
//
//  ⚠ 0100 — 여기 있던 「역할별 점검 항목」(DEV_REQUEST_TOPICS, 주제 6~7개 ×
//    선택지 4~5개)은 사용자 피드백 v2 로 바뀌면서 화면에서 내려갔습니다.
//    질문 목록은 이제 lib/feedbackV2.ts 에 있습니다.
//
//    예전 목록 자체는 지우지 않고 **git 이력에 그대로** 남습니다. 그리고
//    그 목록으로 들어온 예전 답변(「수거 입력 › 저장이 안 되거나…」 형태)은
//    DB 에 그대로 있고, 요청함 화면에도 그대로 보입니다 — 형식이 달라
//    v2 답변과 섞이지 않고, v2 형식으로 바꿔 쓰지도 않습니다.
//
//  보내는 자리(화면)와 받는 자리(요청함)는 그대로입니다. 저장하는 표도
//  dev_requests 그대로입니다 — 오늘 바로 쓰실 수 있어야 해서 SQL 을 새로
//  돌리지 않았습니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이 역할이 피드백을 보낼 수 있는지 (내부 직원만).
 *
 *  병원 계정은 포털의 「요청」으로 보냅니다 — 이 화면이 열리지 않습니다.
 */
export function canSendDevRequest(role: UserRole | null): boolean {
  return role === 'admin' || role === 'office' || role === 'field'
}

export const DEV_REQUEST_STATUSES = ['접수', '확인', '처리 완료', '보류'] as const
export type DevRequestStatus = (typeof DEV_REQUEST_STATUSES)[number]

/** 상태별 뱃지 색 — 처리 완료만 가라앉히고 나머지는 눈에 띄게 둡니다 */
export const DEV_STATUS_STYLE: Record<DevRequestStatus, string> = {
  접수: 'bg-teal-50 text-teal-700',
  확인: 'bg-amber-50 text-amber-700',
  '처리 완료': 'bg-accent-100 text-accent-800',
  보류: 'bg-navy-100 text-navy-500',
}
