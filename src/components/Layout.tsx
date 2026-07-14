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
  Smartphone,
  Truck,
  Globe,
  Workflow,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { BottomSheet } from './BottomSheet'
import { MoreMenu } from './MoreMenu'
import { PageMotion } from './motion'
import { DemoSettingsPanel } from './DemoControls'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃 — 반응형
//  · 데스크톱(lg↑): 좌측 사이드바 + 넓은 본문(웹 운영관리 대시보드)
//  · 모바일(lg 미만): 상단 헤더 + 본문 + 하단 탭바(앱형)
//  ※ 모바일 폰 프레임은 /mobile-preview 시연 모드에서만 사용
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** 데스크톱 사이드바 전체 메뉴 */
const FULL_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/roadmap', label: '활용 계획', icon: Workflow },
  { to: '/today', label: '오늘 일정', icon: CalendarClock },
  { to: '/dispatch', label: '배차·경로', icon: Truck },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거 입력', icon: PlusCircle },
  { to: '/materials', label: '자재 관리', icon: Boxes },
  { to: '/receivables', label: '미수금 관리', icon: Wallet },
  { to: '/stats', label: '통계', icon: PieChart },
  { to: '/more', label: '더보기', icon: MoreHorizontal },
]

/** 모바일 하단 고정 메뉴 — 대시보드 바로 옆에 활용계획 배치 (+ 더보기는 별도 버튼) */
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/roadmap', label: '활용계획', icon: Workflow },
  { to: '/today', label: '오늘일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거입력', icon: PlusCircle },
]

// /roadmap 은 하단 탭으로 노출되므로 '더보기' 활성 경로에서 제외
const MORE_PATHS = ['/more', '/materials', '/receivables', '/stats', '/demo', '/dispatch', '/presentation', '/history']

// ── 데스크톱 사이드바 ─────────────────────────────────────────────────────────
function Sidebar() {
  const navigate = useNavigate()
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-navy-100 bg-white lg:flex">
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-black text-teal-300">
            비
          </div>
          <div className="leading-none">
            <p className="whitespace-nowrap text-[0.9375rem] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
            <p className="mt-1 whitespace-nowrap text-[0.6875rem] font-medium text-navy-400">통합 운영관리</p>
          </div>
        </div>
        <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[0.625rem] font-bold text-amber-600 ring-1 ring-amber-100">
          시연용 데이터 · Demo
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {FULL_NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                  isActive ? 'bg-teal-500 text-white shadow-sm' : 'text-navy-600 hover:bg-navy-50'
                }`
              }
            >
              <Icon size={18} strokeWidth={2.2} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
      <div className="space-y-2 px-3 pb-4">
        <button
          onClick={() => navigate('/company')}
          className="flex w-full items-center gap-2.5 rounded-2xl bg-navy-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-navy-800"
        >
          <Globe size={18} strokeWidth={2.2} />
          회사 홈페이지
        </button>
        <button
          onClick={() => navigate('/mobile-preview')}
          className="flex w-full items-center gap-2.5 rounded-2xl bg-navy-50 px-3 py-2.5 text-sm font-bold text-navy-600 transition hover:bg-navy-100"
        >
          <Smartphone size={18} strokeWidth={2.2} />
          모바일 미리보기
        </button>
        <a
          href={ALLBARO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-2.5 rounded-2xl bg-teal-50 px-3 py-2.5 text-sm font-bold text-teal-700 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <ExternalLink size={18} strokeWidth={2.2} />
          올바로 시스템
        </a>
        <DemoSettingsPanel />
        <p className="px-1 pt-1 text-[0.6875rem] font-medium text-navy-300">beonemirae ops · 시연용 MVP</p>
      </div>
    </aside>
  )
}

// ── 모바일 상단 헤더 ─────────────────────────────────────────────────────────
function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 bg-[#f5f7fa]/90 px-4 py-2.5 backdrop-blur-lg lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-sm font-black text-teal-300">
          비
        </div>
        <div className="leading-none">
          <p className="text-[0.9375rem] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
          <p className="mt-1 text-[0.6875rem] font-medium text-navy-400">의료폐기물 수거·운반 통합 운영관리</p>
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[0.625rem] font-bold text-amber-600 ring-1 ring-amber-100">
          시연용 데이터
        </span>
      </div>
    </header>
  )
}

// ── 모바일 하단 탭바 ─────────────────────────────────────────────────────────
function NavTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 py-1.5"
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-x-2 inset-y-1 rounded-2xl bg-teal-50"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      <Icon
        size={22}
        strokeWidth={active ? 2.4 : 2}
        className={`relative z-10 transition-colors ${active ? 'text-teal-600' : 'text-navy-400'}`}
      />
      <span className={`relative z-10 whitespace-nowrap text-[0.6875rem] font-bold leading-none transition-colors ${active ? 'text-teal-700' : 'text-navy-400'}`}>
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
      className="fixed inset-x-0 bottom-0 z-30 flex bg-white/95 shadow-nav backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-2xl">
        {BOTTOM_NAV.map((item) => {
          const active = !moreActive && (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
          return (
            <NavTab key={item.to} active={active} icon={item.icon} label={item.label} onClick={() => navigate(item.to)} />
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
    <div className="min-h-[100dvh] bg-[#f5f7fa]">
      <div className="mx-auto flex w-full max-w-[1280px]">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileHeader />
          <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-4 lg:px-8 lg:pb-10 lg:pt-7">
            <PageMotion key={pathname}>
              <Outlet />
            </PageMotion>
          </main>
        </div>
      </div>

      {/* 모바일 하단 탭 + 더보기 바텀시트 */}
      <BottomNav onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <BottomSheet open={moreOpen} title="더보기" onClose={() => setMoreOpen(false)}>
        <MoreMenu variant="mobile" onNavigate={() => setMoreOpen(false)} />
      </BottomSheet>
    </div>
  )
}
