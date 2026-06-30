import { NavLink, Outlet, useLocation } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃
//  - 상단: 브랜드 헤더
//  - 데스크탑(sm↑): 좌측 사이드 네비 (전체 메뉴)
//  - 모바일: 하단 탭 네비 — 핵심 5개 + '더보기'
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: string
}

/** 데스크탑 사이드바 전체 메뉴 */
const FULL_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: '▦' },
  { to: '/today', label: '오늘 일정', icon: '◷' },
  { to: '/clients', label: '거래처', icon: '☰' },
  { to: '/collection', label: '수거 입력', icon: '＋' },
  { to: '/materials', label: '자재 관리', icon: '⬚' },
  { to: '/receivables', label: '미수금 관리', icon: '₩' },
  { to: '/stats', label: '통계', icon: '◔' },
  { to: '/more', label: '더보기', icon: '⋯' },
]

/** 모바일 하단 고정 메뉴 — 핵심 5개 */
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: '▦' },
  { to: '/today', label: '오늘 일정', icon: '◷' },
  { to: '/clients', label: '거래처', icon: '☰' },
  { to: '/collection', label: '수거 입력', icon: '＋' },
  { to: '/more', label: '더보기', icon: '⋯' },
]

/** '더보기'에 묶이는 하위 경로 — 해당 경로에서도 더보기 탭을 활성 표시 */
const MORE_PATHS = ['/more', '/materials', '/receivables', '/stats']

function BrandHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-navy-100 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-400 text-lg font-black text-navy-900">
          비
        </div>
        <div className="leading-tight">
          <p className="text-base font-bold">㈜비원미래</p>
          <p className="text-xs text-navy-300">의료폐기물 수거·운반 통합 운영관리</p>
        </div>
        <span className="ml-auto hidden text-xs text-navy-300 sm:inline">beonemirae ops</span>
      </div>
    </header>
  )
}

function SideNav() {
  return (
    <nav className="hidden w-52 shrink-0 sm:block">
      <div className="sticky top-[68px] space-y-1 p-3">
        {FULL_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-teal-600 text-white shadow-sm' : 'text-navy-600 hover:bg-navy-100'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-100 bg-white/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-5">
        {BOTTOM_NAV.map((item) => {
          const active =
            item.to === '/more'
              ? MORE_PATHS.includes(pathname)
              : item.to === '/'
                ? pathname === '/'
                : pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-1 py-2 font-semibold transition ${
                active ? 'text-teal-600' : 'text-navy-400'
              }`}
            >
              <span className="text-2xl leading-none">{item.icon}</span>
              <span className="text-xs leading-none">{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

export function Layout() {
  return (
    <div className="min-h-[100dvh]">
      <BrandHeader />
      <div className="mx-auto flex max-w-5xl">
        <SideNav />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
