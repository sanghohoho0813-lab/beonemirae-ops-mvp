import { FONT_SCALE_OPTIONS, useSettings } from '../context/SettingsContext'

// ─────────────────────────────────────────────────────────────────────────────
// 글자 크기 선택 컨트롤 — 더보기/설정 및 대시보드에서 재사용
// ─────────────────────────────────────────────────────────────────────────────

export function FontSizeControl({ compact = false }: { compact?: boolean }) {
  const { fontScale, setFontScale } = useSettings()
  return (
    <div className={`grid grid-cols-3 gap-2 ${compact ? '' : ''}`}>
      {FONT_SCALE_OPTIONS.map((opt) => {
        const active = fontScale === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => setFontScale(opt.value)}
            aria-pressed={active}
            className={`rounded-xl px-2 py-2.5 text-center transition ${
              active ? 'bg-teal-600 text-white shadow-sm' : 'bg-navy-50 text-navy-600'
            }`}
          >
            <span className={`block font-bold ${opt.value === 'normal' ? 'text-sm' : opt.value === 'large' ? 'text-base' : 'text-lg'}`}>
              가
            </span>
            <span className="mt-0.5 block text-xs font-semibold">{opt.label}</span>
            {!compact && <span className={`mt-0.5 block text-[0.6875rem] ${active ? 'text-teal-50' : 'text-navy-400'}`}>{opt.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}
