//  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
export interface ThemeDef {
  id: string
  /** 화면에 보이는 이름 */
  name: string
  /** 한 줄 설명 — 고르는 사람이 무엇이 바뀌는지 알 수 있게 */
  desc: string
  /** 고르는 화면에 찍을 색 세 방울 [바탕·주색·강조] */
  swatch: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'navy-blue', name: '딥 네이비 블루', desc: '지금 쓰는 기본색', swatch: ['#0f1a2e', '#3182f6', '#14b8a6'] },
  { id: 'onyx-gold', name: '오닉스 골드', desc: '검정 바탕 · 금빛 포인트', swatch: ['#1a1611', '#8f601b', '#c1901f'] },
  { id: 'burgundy-bronze', name: '버건디 브론즈', desc: '와인빛 · 청동 포인트', swatch: ['#241318', '#7d2140', '#b98a4b'] },
  { id: 'emerald-gold', name: '에메랄드 골드', desc: '아이보리 · 짙은 초록', swatch: ['#16261c', '#1c6b47', '#c2a24a'] },
  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지', swatch: ['#17251c', '#256c4a', '#8a9a52'] },
  { id: 'deep-teal', name: '딥 틸', desc: '흰 바탕 · 짙은 청록', swatch: ['#0e2a2e', '#0f6c74', '#c08a2e'] },
  { id: 'navy-gold', name: '네이비 골드', desc: '남색 바탕 · 금빛 강조', swatch: ['#0d1a33', '#1e46a8', '#c9a227'] },
  { id: 'plum-champagne', name: '플럼 샴페인', desc: '자줏빛 · 샴페인 골드', swatch: ['#26141f', '#7a2b56', '#c9a86a'] },
  { id: 'rose-copper', name: '로즈 코퍼', desc: '차콜 · 로즈 코퍼', swatch: ['#241a16', '#9a4a34', '#b9764a'] },
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = 'navy-blue'
export function isTheme(v: unknown): v is string {
  return typeof v === 'string' && THEME_IDS.includes(v)
}
