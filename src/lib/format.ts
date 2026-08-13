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

/**
 * 지금 시각 "HH:mm" — 역시 **한국 시각 기준**입니다.
 *
 *  수거 입력 화면이 실제 수거 시간을 이 값으로 채워 두고, 그대로 저장됩니다.
 *  기기 시간대가 한국이 아니면 아홉 시간 어긋난 시간이 기록에 남습니다.
 */
export function nowHm(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** 오늘로부터 n일 뒤(음수면 이전) — 한국 시각 기준 */
export function shiftDays(days: number): string {
  const [y, m, d] = today().split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
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

/**
 * 원화 축약: 46500000 → "4,650만원", 120000000 → "1.2억" (작은 카드용)
 *
 *  음수도 줄여 씁니다. 예전에는 양수만 줄여서, 같은 줄에 「매출 150만원」과
 *  「처리비 -600,000원」이 나란히 붙었습니다. 비용 칸은 대부분 음수라
 *  작은 카드에서 글자가 넘치고 자릿수도 눈으로 맞추기 어려웠습니다.
 */
export function wonShort(n: number): string {
  const sign = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000).toLocaleString('ko-KR')}만원`
  return `${sign}${a.toLocaleString('ko-KR')}원`
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
