//  ⚠ 이 파일은 손으로 고치지 않습니다 — scripts/gen_themes.mjs 가 만듭니다.
export interface ThemeDef {
  id: string
  /** 화면에 보이는 이름 */
  name: string
  /** 한 줄 설명 — 고르는 사람이 무엇이 바뀌는지 알 수 있게 */
  desc: string
  /** 고르는 화면에 찍을 색 다섯 방울 [사이드바·주색·강조·강조2·강조3] */
  swatch: [string, string, string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'navy-blue', name: '딥 네이비 블루', desc: '남색 · 파랑 · 틸', swatch: ['#080f1c', '#2f82f7', '#07b8a1', '#06ad4f', '#d18152'] },
  { id: 'navy-gold', name: '네이비 골드', desc: '남색 · 앤티크 금', swatch: ['#0d1424', '#3158f8', '#bd8707', '#f04709', '#b46030'] },
  { id: 'emerald-gold', name: '에메랄드 골드', desc: '짙은 초록 · 샴페인 금', swatch: ['#0b1f18', '#058160', '#c9ac18', '#e98440', '#c16834'] },
  { id: 'forest-sage', name: '포레스트 세이지', desc: '깊은 숲 · 세이지', swatch: ['#0f1d17', '#187333', '#6ca71e', '#90901a', '#a95b2d'] },
  { id: 'deep-teal', name: '딥 틸', desc: '청록 · 테라코타', swatch: ['#0b1c20', '#057c8e', '#f17945', '#f2576c', '#bf6633'] },
  { id: 'onyx-gold', name: '오닉스 골드', desc: '차콜 · 밝은 금빛', swatch: ['#12161c', '#8b6705', '#cba407', '#f77326', '#2a849b'] },
  { id: 'burgundy-slate', name: '버건디 슬레이트', desc: '슬레이트 · 와인 포인트', swatch: ['#141821', '#c0072c', '#e66c0e', '#f33c3c', '#257588'] },
  { id: 'plum-indigo', name: '플럼 인디고', desc: '인디고 · 자줏빛 포인트', swatch: ['#141329', '#a911a9', '#9c8bf5', '#6188f1', '#257588'] },
  { id: 'steel-platinum', name: '스틸 플래티넘', desc: '스틸 그레이 · 은빛 블루', swatch: ['#171b21', '#106eb1', '#73b8d2', '#39b29d', '#b46030'] },
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = 'navy-blue'
export function isTheme(v: unknown): v is string {
  return typeof v === 'string' && THEME_IDS.includes(v)
}
