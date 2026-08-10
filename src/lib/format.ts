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

/**
 * 오늘 날짜 문자열 — **한국 시각 기준**입니다.
 *
 *  서버는 오늘이 며칠인지를 늘 한국 시각으로 봅니다(수거 중복 차단, 일정
 *  날짜 모두). 화면이 기기 시각으로 보면 둘이 어긋납니다. 기기 시간대가
 *  한국이 아니면 (해외에서 열었거나, 폰 시간대를 잘못 잡았거나) 「오늘
 *  일정」이 통째로 비어 보이고, 오늘 이미 다녀온 곳인데 「추가 수거」 칸이
 *  나오지 않아 저장이 막히기만 합니다 — 화면은 시키는 대로 할 방법을 주지
 *  않은 채 서버만 거절합니다. 실제로 UTC 로 맞춰진 브라우저에서 그 상태가
 *  재현됐습니다. 서버가 보는 날짜를 화면도 그대로 봅니다.
 */
export function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** 이번 달 문자열 — 위와 같은 이유로 한국 시각 기준입니다 */
export function thisMonth(): string {
  return today().slice(0, 7)
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
