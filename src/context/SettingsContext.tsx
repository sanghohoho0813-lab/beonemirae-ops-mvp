import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// UI 설정 컨텍스트 — 글자 크기 모드
//
// 모바일 대표자 시연 가독성을 위해 앱 전체 글자 크기를 3단계로 조절합니다.
// 선택값은 localStorage 에 저장되어 새로고침해도 유지됩니다.
// 구현은 <html> 요소에 클래스를 부여해 root font-size 를 키우는 방식으로,
// rem 기반 Tailwind 사이즈(글자·여백)가 함께 자연스럽게 확대됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export type FontScale = 'normal' | 'large' | 'xlarge'

export const FONT_SCALE_OPTIONS: { value: FontScale; label: string; hint: string }[] = [
  { value: 'normal', label: '기본', hint: '표준' },
  { value: 'large', label: '크게', hint: '+5%' },
  { value: 'xlarge', label: '매우 크게', hint: '+10%' },
]

const STORAGE_KEY = 'beonemirae-ops:font-scale'
const SCALE_CLASS: Record<FontScale, string> = {
  normal: 'scale-normal',
  large: 'scale-lg',
  xlarge: 'scale-xl',
}

/** 저장된 값이 없을 때의 기본값: 모바일은 '크게', 데스크탑은 '기본' */
function defaultScale(): FontScale {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
    return 'large'
  }
  return 'normal'
}

function loadScale(): FontScale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as FontScale | null
    if (raw && raw in SCALE_CLASS) return raw
  } catch {
    /* noop */
  }
  return defaultScale()
}

interface SettingsContextValue {
  fontScale: FontScale
  setFontScale: (scale: FontScale) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>(() => loadScale())

  // <html> 클래스 동기화 + 영속화
  useEffect(() => {
    const el = document.documentElement
    Object.values(SCALE_CLASS).forEach((c) => el.classList.remove(c))
    el.classList.add(SCALE_CLASS[fontScale])
    try {
      localStorage.setItem(STORAGE_KEY, fontScale)
    } catch {
      /* noop */
    }
  }, [fontScale])

  const setFontScale = useCallback((scale: FontScale) => setFontScaleState(scale), [])

  const value = useMemo(() => ({ fontScale, setFontScale }), [fontScale, setFontScale])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings 는 SettingsProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
