import type { RequestKind, RequestStatus } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면에 적는 말 — 요청 이름 · 처리 상태 · 날짜 (포털 1차 고도화)
//
//  ⚠ **저장값은 그대로 두고 보이는 말만 바꿉니다.** `일정 반영`·`소모품` 은
//    DB CHECK 값이라 내부 화면·통계·검사가 전부 이 글자로 셉니다. 병원
//    화면에서만 병원 직원이 쓰는 말로 옮겨 적습니다.
//
//  ⚠ 상태는 **늘 글자로** 적습니다. 색만으로 가르면 화면 색을 바꾸신 분,
//    색을 잘 못 가리시는 분이 못 알아봅니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 요청 이름 — 「무엇을 요청했나」가 이름만 보고 알 수 있게 */
export const PORTAL_KIND_LABEL: Record<RequestKind, string> = {
  긴급수거: '긴급수거 요청',
  추가수거: '추가수거 요청',
  소모품: '자재·용기 요청',
  '교육·자료': '교육·자료 요청',
  기타: '기타 요청',
}

export function portalKindLabel(kind: string): string {
  return PORTAL_KIND_LABEL[kind as RequestKind] ?? kind
}

/** 처리 단계 — 병원이 보는 순서 그대로 */
export const PORTAL_STEPS: { status: RequestStatus; label: string }[] = [
  { status: '접수', label: '접수' },
  { status: '확인 중', label: '확인 중' },
  //  ⚠ 내부에서는 「일정 반영」입니다. 병원에게는 「언제 오는지 정해졌다」가
  //    핵심이라 「일정 확정」으로 적습니다.
  { status: '일정 반영', label: '일정 확정' },
  { status: '처리 완료', label: '처리 완료' },
]

export function portalStatusLabel(status: string): string {
  return PORTAL_STEPS.find((s) => s.status === status)?.label ?? status
}

/** 몇 번째 단계인가 (0부터). 모르는 값이면 0 */
export function portalStepIndex(status: string): number {
  const i = PORTAL_STEPS.findIndex((s) => s.status === status)
  return i < 0 ? 0 : i
}

/** 「2026-10-12 14:20」 → 「10월 12일 14:20」 */
export function shortDateTime(when: string): string {
  const m = when.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return when
  const md = `${Number(m[2])}월 ${Number(m[3])}일`
  return m[4] ? `${md} ${m[4]}:${m[5]}` : md
}

/** 「09:30」 → 「오전 9시 30분」. 값이 없으면 null */
export function timeBand(hhmm: string | null | undefined): string | null {
  const m = (hhmm ?? '').match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  const half = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${half} ${h12}시${min ? ` ${min}분` : ''}`
}

/** 오늘(YYYY-MM-DD)에서 며칠 뒤인가 — 「오늘」·「내일」·「3일 후」 */
export function daysFromToday(iso: string, todayIso: string): string | null {
  const a = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  const b = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10))
  const d = Math.round((a - b) / 86_400_000)
  if (Number.isNaN(d) || d < 0) return null
  if (d === 0) return '오늘'
  if (d === 1) return '내일'
  return `${d}일 후`
}

/**
 * 목록용 시각 — 「오늘 10:49」 · 「어제 14:20」 · 「10월 12일 06:49」 (포털 3차).
 *  ⚠ 「오늘」은 한국 시각 기준 오늘(format.today)을 받아 비교합니다.
 */
export function friendlyWhen(when: string, todayIso: string): string {
  const m = when.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return when
  const date = `${m[1]}-${m[2]}-${m[3]}`
  const hm = m[4] ? ` ${m[4]}:${m[5]}` : ''
  if (date === todayIso) return `오늘${hm}`
  const rel = daysFromToday(todayIso, date)
  if (rel === '내일') return `어제${hm}`
  return shortDateTime(when)
}
