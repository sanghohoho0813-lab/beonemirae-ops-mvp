// ─────────────────────────────────────────────────────────────────────────────
// 표시용 포맷 유틸
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → YYYY-MM-DD */
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → YYYY-MM */
export function monthStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** 오늘 날짜 문자열 */
export function today(): string {
  return dateStr(new Date())
}

/** 이번 달 문자열 */
export function thisMonth(): string {
  return monthStr(new Date())
}

/** YYYY-MM-DD → "6월 30일 (월)" */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const week = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${m}월 ${d}일 (${week})`
}

/** 원화 포맷: 1234000 → "1,234,000원" */
export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

/** 원화 축약: 46500000 → "4,650만원", 120000000 → "1.2억" (작은 카드용) */
export function wonShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`
  return `${n.toLocaleString('ko-KR')}원`
}

/** kg → 보기 좋은 톤/킬로 표기: 105000 → "105.0톤", 350 → "350kg" */
export function weight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}톤`
  return `${kg.toLocaleString('ko-KR')}kg`
}

/** 숫자 천단위 구분 */
export function num(n: number): string {
  return n.toLocaleString('ko-KR')
}
