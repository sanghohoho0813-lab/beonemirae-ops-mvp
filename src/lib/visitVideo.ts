// ─────────────────────────────────────────────────────────────────────────────
// 신용보증기금 방문용 영상 (0130) — 파일 위치와 상세 내용
//
//  ⚠ 영상은 Supabase Storage **비공개** 칸에 있습니다 (저장소가 공개라 public/ 금지).
//    칸·권한: supabase/proposals/PROPOSAL_0130_visit_video_storage.sql
//    대표·사무실(is_staff) 계정만 서명 주소를 받을 수 있습니다.
//
//  ⚠ 숫자는 **영상 음성에서 말한 그대로**입니다. 1원이라도 바꾸지 않습니다.
//    영상을 새로 만들면 path · lengthLabel · chapters · numbers 를 같이 고칩니다.
// ─────────────────────────────────────────────────────────────────────────────

export const VISIT_VIDEO = {
  bucket: 'visit-media',
  path: 'sinbo_visit_v3.mp4',
  /** 서명 주소 유효 시간 — 상담 한 번(몇 시간) 동안 끊기지 않게 */
  signSeconds: 6 * 60 * 60,
  lengthLabel: '4분 20초',
  /** 장면 시작 시각(초) — 영상 파일 기준 */
  chapters: [
    { at: 0, title: '비원미래 소개 · 찾아온 이유' },
    { at: 38, title: '매출 흐름' },
    { at: 55, title: '성장하면서 커진 문제' },
    { at: 101, title: 'AX 운영 시스템과 실제 화면' },
    { at: 155, title: '지금 단계 · 과장하지 않는 이유' },
    { at: 173, title: '앞으로 쌓을 데이터 · 성장 방향' },
    { at: 242, title: '필요한 것 · 상담 요청' },
  ],
  numbers: [
    { label: '2023년 매출', value: '1억 2천만 원 수준', projection: false },
    { label: '2025년 매출', value: '5억 8천만 원', projection: false },
    { label: '2년간 성장', value: '약 5배 가까이', projection: false },
    { label: '2026년 상반기 매출', value: '약 4억 5천만 원 넘음', projection: false },
    { label: '2026년 연환산', value: '약 9억 원 수준', projection: true },
  ],
} as const
