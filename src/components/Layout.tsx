import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutGrid,
  CalendarClock,
  Building2,
  PlusCircle,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { MoreMenu } from './MoreMenu'
import { PageMotion } from './motion'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃 — "폰 프레임" 구조
//  데스크톱에서도 중앙에 모바일 앱(최대 420px)처럼 보이도록 프레임을 적용.
//  프레임 = 헤더(고정) + 본문(내부 스크롤) + 하단 탭. 사이드바는 제거.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** 모바일 하단 고정 메뉴 — 핵심 4개 (+ 더보기는 별도 버튼) */
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/today', label: '오늘 일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거 입력', icon: PlusCircle },
]

const MORE_PATHS = ['/more', '/materials', '/receivables', '/stats', '/demo']

function BrandHeader() {
  return (
    <header className="z-20 shrink-0 bg-[#f5f7fa]/90 px-4 py-2.5 backdrop-blur-lg">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-sm font-black text-teal-300">
          비
        </div>
        <div className="leading-none">
          <p className="text-[15px] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
          <p className="mt-1 text-[11px] font-medium text-navy-400">의료폐기물 수거·운반 통합 운영관리</p>
        </div>
        <span className="ml-auto text-[10px] font-semibold tracking-wide text-navy-300">beonemirae ops</span>
      </div>
    </header>
  )
}

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
      className="z-20 flex shrink-0 bg-white/95 shadow-nav backdrop-blur-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_NAV.map((item) => {
        const active = !moreActive && (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
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
    </nav>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 경로 변경 시 본문 스크롤 컨테이너를 항상 최상단으로
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <div className="flex min-h-[100dvh] justify-center bg-[#f5f7fa] sm:items-center sm:bg-gradient-to-br sm:from-navy-100 sm:via-[#eef2f8] sm:to-teal-50 sm:p-6">
      {/* 폰 프레임 */}
      <div
        id="app-frame"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f7fa] sm:h-[min(900px,94vh)] sm:w-[420px] sm:rounded-[44px] sm:shadow-2xl sm:ring-1 sm:ring-navy-900/5"
      >
        <BrandHeader />
        <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-3">
          <PageMotion key={pathname}>
            <Outlet />
          </PageMotion>
        </main>
        <BottomNav onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />

        {/* 더보기 바텀시트 — 프레임 내부에 contained */}
        <BottomSheet open={moreOpen} title="더보기" onClose={() => setMoreOpen(false)}>
          <MoreMenu onNavigate={() => setMoreOpen(false)} />
        </BottomSheet>
      </div>
    </div>
  )
}
