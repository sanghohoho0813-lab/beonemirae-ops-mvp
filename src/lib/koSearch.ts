// ─────────────────────────────────────────────────────────────────────────────
// 한글 검색 (0131) — 초성 · 전화번호 · 대소문자
//
//  병원 이름을 폰에서 끝까지 치기는 번거롭습니다. 「ㄱㄴㅇ」만 쳐도 「가나요양병원」이
//  나오게 합니다(초성만 친 경우에만 초성으로 비교 — 섞어 치면 그냥 글자 비교).
//  전화번호는 하이픈을 떼고 숫자끼리 비교합니다(「5000100」 → 02-500-0100).
// ─────────────────────────────────────────────────────────────────────────────

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

/** 글자열의 초성만 (한글 음절이 아닌 글자는 그대로) */
export function chosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00
    out += code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : ch
  }
  return out
}

const ONLY_CHO = /^[ㄱ-ㅎ\s]+$/

/**
 * q 가 texts 중 하나에 맞는가.
 *  · 초성만 친 경우 → 초성끼리
 *  · 숫자가 3자 이상 들어 있으면 → 숫자끼리도 (전화번호)
 *  · 그 밖 → 대소문자 무시 포함 비교
 */
export function koMatch(q: string, texts: (string | null | undefined)[]): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const list = texts.map((t) => (t ?? '').toLowerCase())
  if (ONLY_CHO.test(query)) {
    const qc = query.replace(/\s+/g, '')
    return list.some((t) => chosung(t).replace(/\s+/g, '').includes(qc))
  }
  if (list.some((t) => t.includes(query))) return true
  const digits = query.replace(/\D/g, '')
  if (digits.length >= 3 && digits.length === query.replace(/[\s-]/g, '').length) {
    return list.some((t) => t.replace(/\D/g, '').includes(digits))
  }
  return false
}

/**
 * 받침에 맞는 조사 (0148) — 「차량을」 · 「거래처를」. 「을(를)」처럼 둘 다 적지 않습니다.
 *  끝 글자가 한글이 아니면(숫자 · 영문) 앞의 것(받침 있음 쪽)을 씁니다.
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0) - 0xac00
  if (!(code >= 0 && code <= 11171)) return withFinal
  return code % 28 === 0 ? withoutFinal : withFinal
}
