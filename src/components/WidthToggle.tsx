import { Maximize2, Minimize2, Square } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 화면 폭 3단계 (0141) — 대표님: 「PC 에서 오른쪽 화면이 너무 넓어 눈이 좌우로 많이 오간다.
//   좌우 여백을 살짝 둬서 가운데로 모으고, 위쪽 단추로 3단계 정도 줄였다 넓혔다. 글씨는 작아지지 않게.」
//
//   좁게 1120px · 보통 1360px(기본) · 넓게(제한 없음). 글자 크기는 그대로 — 폭만 바뀝니다.
//   PC(lg 이상)에서만 효과가 있습니다. 폰은 원래 화면 폭 그대로.
//   이 기기에만 기억합니다(localStorage) — 기기마다 화면 크기가 다르기 때문입니다.
// ─────────────────────────────────────────────────────────────────────────────

export type ContentWidth = 'narrow' | 'normal' | 'wide'
export const WIDTH_KEY = 'beonemirae-ops:content-width'
export const WIDTH_CLASS: Record<ContentWidth, string> = {
  narrow: 'lg:max-w-[1120px]',
  normal: 'lg:max-w-[1360px]',
  wide: 'lg:max-w-none',
}
const LABEL: Record<ContentWidth, string> = { narrow: '좁게', normal: '보통', wide: '넓게' }
const ICON = { narrow: Minimize2, normal: Square, wide: Maximize2 } as const

export function loadWidth(): ContentWidth {
  try {
    const v = localStorage.getItem(WIDTH_KEY)
    return v === 'narrow' || v === 'wide' || v === 'normal' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function WidthToggle({ value, onChange }: { value: ContentWidth; onChange: (w: ContentWidth) => void }) {
  return (
    <div role="group" aria-label="화면 폭" data-width-toggle className="flex shrink-0 items-center gap-0.5 rounded-full bg-white p-1 shadow-sm ring-1 ring-navy-100">
      <span className="px-2 text-[0.95rem] font-bold text-navy-500">화면 폭</span>
      {(['narrow', 'normal', 'wide'] as ContentWidth[]).map((w) => {
        const Icon = ICON[w]
        const on = value === w
        return (
          <button
            key={w}
            type="button"
            data-width={w}
            aria-pressed={on}
            onClick={() => {
              onChange(w)
              try { localStorage.setItem(WIDTH_KEY, w) } catch { /* 기억 못 해도 지금 화면은 바뀝니다 */ }
            }}
            className={`flex min-h-[36px] items-center gap-1 rounded-full px-3 text-[0.95rem] font-bold transition ${on ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50'}`}
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden />
            {LABEL[w]}
          </button>
        )
      })}
    </div>
  )
}
