// ─────────────────────────────────────────────────────────────────────────────
// 시간 입력 — 오전/오후 · 시 · 분
//
//  현장에서 쓰는 값입니다. 예전에는 브라우저 기본 <input type="time"> 하나였는데,
//  폰에서 그 칸이 화면 왼쪽에 아주 작게 붙고, 누르면 시계 다이얼이 떠서
//  손가락으로 바늘을 돌려야 했습니다. 장갑 낀 손으로 트럭 옆에서 할 일이
//  아닙니다.
//
//  그래서 오전/오후는 큰 버튼으로 고르고, 시·분은 숫자로 바로 칩니다.
//
//  이 파일은 **변환 규칙만** 담습니다 — 화면은 components/TimeField.tsx 입니다.
//  규칙을 화면 안에 두면 「오후 12시가 자정으로 저장된다」 같은 것을 눈으로
//  훑어서 찾아야 합니다. 여기 있으면 그냥 검사할 수 있습니다.
//
//  저장되는 값은 지금까지와 똑같은 24시간 'HH:MM' 입니다. 저장 형식을 바꾸면
//  이미 쌓인 수거 기록의 시간과 어긋납니다.
// ─────────────────────────────────────────────────────────────────────────────

export type Meridiem = '오전' | '오후'

export interface TimeParts {
  meridiem: Meridiem
  /** 1~12 (12시간제) */
  hour12: number
  /** 0~59 */
  minute: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * 'HH:MM' → 오전/오후 · 시 · 분.
 *
 *  읽을 수 없는 값이 오면 오전 9시로 둡니다. 예전 기록에 빈 값이 있어도
 *  화면이 깨지지 않아야 하고, **아무 값이나 만들어 저장하지는 않습니다** —
 *  이 값은 사람이 다시 고른 뒤에야 저장됩니다.
 */
export function parseHm(value: string): TimeParts {
  const m = /^\s*(\d{1,2}):(\d{1,2})\s*$/.exec(value ?? '')
  if (!m) return { meridiem: '오전', hour12: 9, minute: 0 }
  const h24 = clamp(Number(m[1]), 0, 23)
  const minute = clamp(Number(m[2]), 0, 59)
  return {
    meridiem: h24 < 12 ? '오전' : '오후',
    //  0시 → 오전 12시 · 12시 → 오후 12시. 0 이나 13 이 화면에 뜨면 안 됩니다.
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute,
  }
}

/** 오전/오후 · 시 · 분 → 'HH:MM' (24시간) */
export function toHm(parts: TimeParts): string {
  const h12 = clamp(Math.trunc(parts.hour12), 1, 12)
  const minute = clamp(Math.trunc(parts.minute), 0, 59)
  //  오전 12시는 0시, 오후 12시는 12시입니다. 여기를 뒤집으면 점심에 수거한
  //  기록이 새벽 0시로 남습니다.
  const h24 = parts.meridiem === '오전' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 숫자 칸에 친 글자를 받습니다.
 *
 *  치는 도중에는 빈 칸이 될 수 있어야 합니다 — 지우자마자 1 이 튀어 들어오면
 *  두 자리를 고칠 수가 없습니다. 그래서 빈 값은 null 로 돌려주고, 화면이
 *  그대로 비워 둔 채 기다립니다.
 */
export function typedNumber(raw: string, lo: number, hi: number): number | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  return clamp(Number(digits.slice(-2)), lo, hi)
}

/** ＋/－ 버튼 — 시는 1~12 안에서 돌고, 넘어가도 오전/오후는 바뀌지 않습니다 */
export function stepHour(hour12: number, by: number): number {
  const next = (((hour12 - 1 + by) % 12) + 12) % 12
  return next + 1
}

/**
 * ＋/－ 버튼 — 분은 5분 단위로 돌립니다.
 *
 *  59분에서 ＋ 를 누르면 0분이 됩니다. 시가 따라 올라가지는 **않습니다** —
 *  시는 시 칸에서 고칩니다. 여기서 같이 올리면 한 번 잘못 누른 것이 두
 *  칸을 바꿔서, 무엇이 바뀐 건지 보고 알기 어렵습니다.
 */
export function stepMinute(minute: number, by: number): number {
  const step = 5
  const base = by > 0 ? Math.floor(minute / step) * step : Math.ceil(minute / step) * step
  return ((base + by * step) % 60 + 60) % 60
}
