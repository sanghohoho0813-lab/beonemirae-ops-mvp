import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { DEFAULT_THEME, THEME_IDS } from '../lib/themes'

// ─────────────────────────────────────────────────────────────────────────────
// UI 설정 컨텍스트 — 글자 크기 모드
//
// 모바일 대표자 시연 가독성을 위해 앱 전체 글자 크기를 3단계로 조절합니다.
// 선택값은 localStorage 에 저장되어 새로고침해도 유지됩니다.
// 구현은 <html> 요소에 클래스를 부여해 root font-size 를 키우는 방식으로,
// rem 기반 Tailwind 사이즈(글자·여백)가 함께 자연스럽게 확대됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export type FontScale = 'normal' | 'large' | 'xlarge'

// 배율(%)을 적지 않습니다. 같은 '크게'라도 노트북과 폰에서 올라가는 폭이
// 다르기 때문에(index.css 참고) 숫자를 적으면 한쪽은 반드시 틀린 설명이 됩니다.
export const FONT_SCALE_OPTIONS: { value: FontScale; label: string; hint: string }[] = [
  { value: 'normal', label: '기본', hint: '노트북 기준 표준' },
  { value: 'large', label: '크게', hint: '조금 크게' },
  { value: 'xlarge', label: '매우 크게', hint: '가장 크게' },
]

const STORAGE_KEY = 'beonemirae-ops:font-scale'
const THEME_KEY = 'beonemirae-ops:theme'
const SCALE_CLASS: Record<FontScale, string> = {
  normal: 'scale-normal',
  large: 'scale-lg',
  xlarge: 'scale-xl',
}

/** 저장된 값이 없을 때의 기본값: 손에 들고 보는 기기는 '크게', 그 외는 '기본'
 *
 *  ⚠ 0080 — 예전에는 「640px 이하」만 폰으로 봤습니다. 그래서 **접는 폰을 편**
 *    673px 이나 태블릿 768px 은 노트북 취급을 받아 '기본'으로 시작했습니다.
 *    폭만으로는 「손에 들었는지」를 알 수 없습니다. 그래서 폭과 함께
 *    **손가락으로 누르는 기기인지**(pointer: coarse)를 봅니다 —
 *    창을 900px 로 줄인 노트북은 마우스라서 그대로 '기본'이고,
 *    펼친 폴더블은 손가락이라 '크게'로 시작합니다.
 *    (root 글자 크기의 경계도 0080 에서 1024px 로 맞췄습니다. index.css 참고 —
 *     경계를 두 군데 서로 다르게 두면 나중에 반드시 어긋납니다.) */
function defaultScale(): FontScale {
  if (typeof window === 'undefined') return 'normal'
  const handheld = window.matchMedia('(max-width: 1023px) and (pointer: coarse)').matches
  //  pointer 를 못 읽는 오래된 브라우저를 위해 예전 기준도 남겨 둡니다
  const narrow = window.matchMedia('(max-width: 640px)').matches
  return handheld || narrow ? 'large' : 'normal'
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

// ── 테마 (0081) ──────────────────────────────────────────────────────────────
//
//  색만 갈아 끼웁니다. <html data-theme="..."> 하나만 바뀌고, 나머지는 전부
//  CSS 변수가 받습니다(src/themes.css). 화면 코드도 배치도 건드리지 않습니다.
//
//  ⚠ 저장은 이 기기의 localStorage 입니다. 같은 기기에서는 재접속해도
//    그대로지만, **다른 기기까지 따라가지는 않습니다.** 계정에 저장하려면
//    profiles 에 칸을 하나 늘리는 SQL 이 필요한데, 그건 대표님이 실행하실
//    일이라 여기서 임의로 만들지 않았습니다. 글자 크기처럼 계정에 붙이길
//    원하시면 그때 SQL 을 따로 올리겠습니다.
function loadTheme(): string {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw && THEME_IDS.includes(raw)) return raw
  } catch {
    /* noop */
  }
  return DEFAULT_THEME
}

interface SettingsContextValue {
  fontScale: FontScale
  setFontScale: (scale: FontScale) => void
  theme: string
  setTheme: (id: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// profiles.font_scale ↔ 화면 값 매핑 (DB 는 normal/lg/xl 로 저장합니다)
const TO_DB: Record<FontScale, 'normal' | 'lg' | 'xl'> = { normal: 'normal', large: 'lg', xlarge: 'xl' }
const FROM_DB: Record<'normal' | 'lg' | 'xl', FontScale> = { normal: 'normal', lg: 'large', xl: 'xlarge' }

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>(() => loadScale())
  const [theme, setThemeState] = useState<string>(() => loadTheme())
  const { profile, updateProfile } = useAuth()

  // 로그인하면 사용자 계정에 저장된 글자 크기를 따라갑니다(기기가 바뀌어도 동일).
  useEffect(() => {
    if (profile?.fontScale) setFontScaleState(FROM_DB[profile.fontScale])
  }, [profile?.fontScale])

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

  //  <html data-theme> 동기화 + 이 기기에 저장
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* noop */
    }
  }, [theme])

  const setTheme = useCallback((id: string) => {
    //  모르는 이름이 들어오면 무시합니다 — 저장된 값이 오래돼 지금 없는
    //  테마를 가리키면, 색이 하나도 안 정해진 화면이 됩니다.
    if (THEME_IDS.includes(id)) setThemeState(id)
  }, [])

  const setFontScale = useCallback(
    (scale: FontScale) => {
      setFontScaleState(scale)
      // 로그인 상태면 계정에도 저장해 다른 기기에서도 같은 크기로 보이게 합니다.
      if (profile) void updateProfile({ fontScale: TO_DB[scale] })
    },
    [profile, updateProfile],
  )

  const value = useMemo(
    () => ({ fontScale, setFontScale, theme, setTheme }),
    [fontScale, setFontScale, theme, setTheme],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings 는 SettingsProvider 내부에서만 사용할 수 있습니다.')
  return ctx
}
