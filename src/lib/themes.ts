//  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
export interface ThemeDef {
  id: string
  /** 화면에 보이는 이름 */
  name: string
  /** 한 줄 설명 — 고르는 사람이 무엇이 바뀌는지 알 수 있게 */
  desc: string
  /** 고르는 화면에 찍을 색 다섯 방울 [바탕·주색·강조·강조2·강조3] */
  swatch: [string, string, string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'navy-blue', name: '딥 네이비 블루', desc: '지금 쓰는 기본색', swatch: ['#080f1c', '#3182f6', '#14b8a6', '#06aa4d', '#c55312'] },
  { id: 'onyx-gold', name: '오닉스 골드', desc: '검정 바탕 · 금빛 포인트', swatch: ['#211911', '#955e0d', '#c29007', '#f34f09', '#0e809d'] },
  { id: 'burgundy-bronze', name: '버건디 브론즈', desc: '와인빛 · 청동 포인트', swatch: ['#29171a', '#af0f3a', '#da8413', '#f7492e', '#0c6b82'] },
  { id: 'emerald-gold', name: '에메랄드 골드', desc: '아이보리 · 짙은 초록', swatch: ['#141f14', '#0a7349', '#c0910f', '#f34f09', '#ba4e10'] },
  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지', swatch: ['#151f17', '#0b7741', '#7cab0f', '#a08c06', '#be5111'] },
  { id: 'deep-teal', name: '딥 틸', desc: '흰 바탕 · 짙은 청록', swatch: ['#111c1e', '#0c7b87', '#cb8d10', '#f74915', '#cd5612'] },
  { id: 'navy-gold', name: '네이비 골드', desc: '남색 바탕 · 금빛 강조', swatch: ['#101623', '#225eeb', '#c29007', '#f34f09', '#c55311'] },
  { id: 'plum-champagne', name: '플럼 샴페인', desc: '자줏빛 · 샴페인 골드', swatch: ['#271721', '#a70f60', '#cd8f12', '#f7501d', '#0b6980'] },
  { id: 'rose-copper', name: '로즈 코퍼', desc: '차콜 · 로즈 코퍼', swatch: ['#221a15', '#b73710', '#eb7a22', '#f84545', '#0d7995'] },
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = 'navy-blue'
export function isTheme(v: unknown): v is string {
  return typeof v === 'string' && THEME_IDS.includes(v)
}
