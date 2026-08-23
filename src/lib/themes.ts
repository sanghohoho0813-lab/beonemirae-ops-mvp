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
  { id: 'onyx-gold', name: '오닉스 골드', desc: '검정 바탕 · 밝은 금빛', swatch: ['#1a1915', '#8f6605', '#c7a007', '#f66612', '#0e84a1'] },
  { id: 'burgundy-bronze', name: '버건디 브론즈', desc: '짙은 와인 · 붉은 청동', swatch: ['#3a0f15', '#c20726', '#eb6309', '#f71f26', '#0d748d'] },
  { id: 'emerald-gold', name: '에메랄드 골드', desc: '아이보리 · 밝은 에메랄드', swatch: ['#0d1d19', '#058164', '#c7ae12', '#f77918', '#d15913'] },
  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지', swatch: ['#10160f', '#0a701e', '#6aa70f', '#8e8905', '#b14b10'] },
  { id: 'deep-teal', name: '딥 틸', desc: '흰 바탕 · 청록과 테라코타', swatch: ['#101c1f', '#057c8e', '#f07642', '#f8455c', '#d05812'] },
  { id: 'navy-gold', name: '네이비 골드', desc: '남색 바탕 · 앤티크 금', swatch: ['#0f1527', '#2e56f7', '#c08307', '#ed3e09', '#c15211'] },
  { id: 'plum-champagne', name: '플럼 샴페인', desc: '자줏빛 · 연한 샴페인', swatch: ['#30102a', '#a70f97', '#dbad13', '#f87c3f', '#0c7088'] },
  { id: 'rose-copper', name: '로즈 코퍼', desc: '차콜 · 러스트와 코퍼', swatch: ['#1d1714', '#c7320c', '#f78e24', '#f9665c', '#0e809d'] },
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = 'navy-blue'
export function isTheme(v: unknown): v is string {
  return typeof v === 'string' && THEME_IDS.includes(v)
}
