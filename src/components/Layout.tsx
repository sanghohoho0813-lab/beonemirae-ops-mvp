import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutGrid,
  CalendarClock,
  Building2,
  PlusCircle,
  MoreHorizontal,
  Boxes,
  Wallet,
  PieChart,
  type LucideIcon,
} from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { MoreMenu } from './MoreMenu'
import { PageMotion } from './motion'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃
//  - 상단: 브랜드 헤더
//  - 데스크탑(sm↑): 좌측 사이드 네비 (전체 메뉴)
//  - 모바일: 하단 탭 네비 — 핵심 4개 + '더보기'(바텀시트)
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** 데스크탑 사이드바 전체 메뉴 */
const FULL_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/today', label: '오늘 일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거 입력', icon: PlusCircle },
  { to: '/materials', label: '자재 관리', icon: Boxes },
  { to: '/receivables', label: '미수금 관리', icon: Wallet },
  { to: '/stats', label: '통계', icon: PieChart },
  { to: '/more', label: '더보기', icon: MoreHorizontal },
]

/** 모바일 하단 고정 메뉴 — 핵심 4개 (+ 더보기는 별도 버튼) */
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/today', label: '오늘 일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거 입력', icon: PlusCircle },
]

const MORE_PATHS = ['/more', '/materials', '/receivables', '/stats']

function BrandHeader() {
  return (
    <header className="sticky top-0 z-30 bg-[#f5f7fa]/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-4 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-sm font-black text-teal-300">
          비
        </div>
        <div className="leading-none">
          <p className="text-[15px] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
          <p className="mt-1 text-[11px] font-medium text-navy-400">의료폐기물 수거·운반 통합 운영관리</p>
        </div>
        <span className="ml-auto hidden text-xs font-medium text-navy-300 sm:inline">beonemirae ops</span>
      </div>
    </header>
  )
}

function SideNav({ onMore }: { onMore: () => void }) {
  return (
    <nav className="hidden w-52 shrink-0 sm:block">
      <div className="sticky top-[68px] space-y-1 p-3">
        {FULL_NAV.map((item) => {
          const Icon = item.icon
          return item.to === '/more' ? (
            <button
              key={item.to}
              onClick={onMore}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-navy-600 transition hover:bg-navy-100"
            >
              <Icon size={18} strokeWidth={2.2} />
              {item.label}
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-teal-500 text-white shadow-sm' : 'text-navy-600 hover:bg-navy-100'
                }`
              }
            >
              <Icon size={18} strokeWidth={2.2} />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function NavTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative flex min-h-[58px] flex-col items-center justify-center gap-1 py-1.5"
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-x-2 inset-y-1 rounded-2xl bg-teal-50"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      <Icon
        size={24}
        strokeWidth={active ? 2.4 : 2}
        className={`relative z-10 transition-colors ${active ? 'text-teal-600' : 'text-navy-400'}`}
      />
      <span className={`relative z-10 text-[11px] font-bold leading-none transition-colors ${active ? 'text-teal-700' : 'text-navy-400'}`}>
        {label}
      </span>
    </button>
  )
}

function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const moreActive = moreOpen || MORE_PATHS.includes(pathname)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 bg-white/95 shadow-nav backdrop-blur-lg sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-5">
        {BOTTOM_NAV.map((item) => {
          const active =
            !moreActive && (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
          return (
            <NavTab
              key={item.to}
              active={active}
              icon={item.icon}
              label={item.label}
              onClick={() => navigate(item.to)}
            />
          )
        })}
        <NavTab active={moreActive} icon={MoreHorizontal} label="더보기" onClick={onMore} />
      </div>
    </nav>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="min-h-[100dvh]">
      <BrandHeader />
      <div className="mx-auto flex max-w-5xl">
        <SideNav onMore={() => setMoreOpen(true)} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:pb-8">
          <PageMotion key={pathname}>
            <Outlet />
          </PageMotion>
        </main>
      </div>

      <BottomNav onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />

      <BottomSheet open={moreOpen} title="더보기" onClose={() => setMoreOpen(false)}>
        <MoreMenu onNavigate={() => setMoreOpen(false)} />
      </BottomSheet>
    </div>
  )
}
