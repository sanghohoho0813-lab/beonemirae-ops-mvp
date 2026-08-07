import type { LeadStage, RequestKind, RequestStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 절제된 컬러 포인트 체계
//
//  색을 "디자인 장식"이 아니라 "정보를 빨리 구분하기 위한 도구"로만 씁니다.
//  그래서 규칙이 두 개뿐입니다.
//
//   1) 색은 작은 면적에만 — 아이콘 배경 / 칩 / 점 / 얇은 바.
//      카드 전체를 색칠하지 않습니다(베이스는 화이트 · 네이비 · 그레이 유지).
//   2) 같은 의미는 항상 같은 색 — 아래 매핑을 화면마다 다시 정하지 않습니다.
//      긴급은 어디서나 로즈, 완료는 어디서나 에메랄드입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type Tone = 'navy' | 'blue' | 'teal' | 'emerald' | 'amber' | 'orange' | 'rose' | 'violet' | 'sky'

export interface ToneStyle {
  /** 아이콘 타일 (연한 배경 + 진한 아이콘) */
  tile: string
  /** 작은 라벨 칩 */
  chip: string
  /** 상태 점 · 얇은 바 */
  dot: string
  /** 텍스트 강조 */
  text: string
}

export const TONE: Record<Tone, ToneStyle> = {
  navy:    { tile: 'bg-navy-100 text-navy-600',     chip: 'bg-navy-100 text-navy-600',     dot: 'bg-navy-300',   text: 'text-navy-700' },
  blue:    { tile: 'bg-teal-50 text-teal-600',      chip: 'bg-teal-50 text-teal-700',      dot: 'bg-teal-500',   text: 'text-teal-700' },
  teal:    { tile: 'bg-accent-50 text-accent-600',  chip: 'bg-accent-50 text-accent-700',  dot: 'bg-accent-500', text: 'text-accent-700' },
  emerald: { tile: 'bg-emerald-50 text-emerald-600',chip: 'bg-emerald-50 text-emerald-700',dot: 'bg-emerald-500',text: 'text-emerald-700' },
  amber:   { tile: 'bg-amber-50 text-amber-600',    chip: 'bg-amber-50 text-amber-700',    dot: 'bg-amber-500',  text: 'text-amber-700' },
  orange:  { tile: 'bg-orange-50 text-orange-600',  chip: 'bg-orange-50 text-orange-700',  dot: 'bg-orange-500', text: 'text-orange-700' },
  rose:    { tile: 'bg-rose-50 text-rose-600',      chip: 'bg-rose-50 text-rose-600',      dot: 'bg-rose-500',   text: 'text-rose-600' },
  violet:  { tile: 'bg-violet-50 text-violet-600',  chip: 'bg-violet-50 text-violet-700',  dot: 'bg-violet-500', text: 'text-violet-700' },
  sky:     { tile: 'bg-sky-50 text-sky-600',        chip: 'bg-sky-50 text-sky-700',        dot: 'bg-sky-500',    text: 'text-sky-700' },
}

// ── 의미 → 색 매핑 (한 곳에서만 정합니다) ───────────────────────────────────

/** 요청 유형 — 각 유형이 어떤 매출로 이어지는지와 같은 색을 씁니다 */
export const REQUEST_TONE: Record<RequestKind, Tone> = {
  긴급수거: 'rose',
  추가수거: 'orange',
  소모품: 'violet',
  '교육·자료': 'sky',
  기타: 'navy',
}

/** 요청이 연결되는 매출 항목 — 병원의 행동이 무엇이 되는지 화면에서 바로 읽히게 */
export const REQUEST_REVENUE: Record<RequestKind, string> = {
  긴급수거: '추가 수거 매출',
  추가수거: '추가 수거 매출',
  소모품: '전용용기·소모품 매출',
  '교육·자료': '교육·운영지원 (개발 예정)',
  기타: '—',
}

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  접수: 'rose',
  '확인 중': 'amber',
  '일정 반영': 'sky',
  '처리 완료': 'emerald',
}

export const STAGE_TONE: Record<LeadStage, Tone> = {
  추천: 'navy',
  제안: 'sky',
  수락: 'emerald',
  보류: 'amber',
  미전환: 'navy',
}

/** AX 스토리에서 "누가 하는 일인지" — 병원이 중간에 들어온다는 사실이 바로 보이게 */
export type Actor = '현장' | '시스템' | '병원' | '비원미래'
export const ACTOR_TONE: Record<Actor, Tone> = {
  현장: 'blue',
  시스템: 'navy',
  병원: 'violet',
  비원미래: 'emerald',
}
