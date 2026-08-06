import { Check } from 'lucide-react'
import { FONT_SCALE_OPTIONS, useSettings } from '../context/SettingsContext'

// ─────────────────────────────────────────────────────────────────────────────
// 화면 글자 크기 선택 — 기본 / 크게 / 매우 크게
//  · 클릭 즉시 <html> 클래스가 바뀌어 앱 전체(rem 기반)에 반영됩니다.
//  · 선택값은 localStorage 에 저장되어 새로고침해도 유지됩니다.
//  · variant='dark' 는 네이비 사이드바용, 'light' 는 밝은 배경(더보기 등)용.
// ─────────────────────────────────────────────────────────────────────────────

export function FontSizeControl({
  variant = 'light',
  compact = false,
}: {
  variant?: 'light' | 'dark'
  compact?: boolean
}) {
  const { fontScale, setFontScale } = useSettings()
  const dark = variant === 'dark'

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {FONT_SCALE_OPTIONS.map((opt) => {
        const active = fontScale === opt.value
        // 미리보기 '가' 글자 — 실제 배율(기본 / +10% / +20%)과 같은 비율로 표시합니다.
        const previewSize =
          opt.value === 'normal' ? 'text-[1.3rem]' : opt.value === 'large' ? 'text-[1.43rem]' : 'text-[1.56rem]'
        return (
          <button
            key={opt.value}
            onClick={() => setFontScale(opt.value)}
            aria-pressed={active}
            title={`${opt.label} — ${opt.hint}`}
            className={`relative flex flex-col items-center justify-center rounded-xl px-1 py-2.5 transition ${
              active
                ? 'bg-teal-500 text-white shadow-sm'
                : dark
                  ? 'bg-white/10 text-navy-200 hover:bg-white/20'
                  : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
            }`}
          >
            {active && (
              <Check size={12} strokeWidth={3.5} className="absolute right-1.5 top-1.5 text-white" />
            )}
            <span className={`font-extrabold leading-none ${previewSize}`}>가</span>
            <span className="mt-1.5 whitespace-nowrap text-[1.05rem] font-bold leading-none">{opt.label}</span>
            {!compact && (
              <span
                className={`mt-1 whitespace-nowrap text-[0.9rem] leading-none ${
                  active ? 'text-teal-50' : dark ? 'text-navy-400' : 'text-navy-400'
                }`}
              >
                {opt.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
