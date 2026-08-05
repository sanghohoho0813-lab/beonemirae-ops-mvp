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
  FileBarChart,
  History,
  Headset,
  Lock,
  Sparkles,
  ChevronDown,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { BottomSheet } from './BottomSheet'
import { MoreMenu } from './MoreMenu'
import { PageMotion } from './motion'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃 — 반응형 B2B 운영관리 콘솔
//  · 데스크톱(lg↑): 다크 네이비 사이드바 + 밝은 본문
//  · 모바일(lg 미만): 상단 헤더 + 본문 + 하단 탭바(앱형)
//  · 메뉴는 "현재 운영 / 운영 도구 / 추가 개발 예정" 3단으로 분리해
//    지금 바로 사용하는 기능과 향후 확장 기능을 명확히 구분합니다.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** 현재 운영 중인 핵심 메뉴 */
const CORE_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid },
  { to: '/today', label: '오늘 일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '수거 입력', icon: PlusCircle },
  { to: '/reports', label: '운영 리포트', icon: FileBarChart },
]

/** 운영 도구 — 핵심 흐름을 보조하는 실사용 화면 */
const TOOL_NAV: NavItem[] = [
  { to: '/dispatch', label: '배차·경로', icon: Truck },
  { to: '/materials', label: '자재 관리', icon: Boxes },
  { to: '/receivables', label: '미수금 관리', icon: Wallet },
  { to: '/history', label: '수거이력', icon: History },
  { to: '/stats', label: '통계', icon: PieChart },
  { to: '/roadmap', label: '활용 계획', icon: Workflow },
]

/** 추가 개발 예정 — 아직 실사용 단계가 아닌 확장 기능 (클릭 시 활용 계획으로 안내) */
const PLANNED: string[] = [
  'AI 배차·경로 고도화',
  '병원 요청 포털',
  '소모품 주문',
  '배출자 교육 관리',
  '자동 문서 발송',
  '올바로 API 연동',
  '실시간 다중 사용자',
  'SaaS 서비스 확장',
]

/** 모바일 하단 고정 메뉴 */
const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: '홈', icon: LayoutGrid },
  { to: '/today', label: '일정', icon: CalendarClock },
  { to: '/clients', label: '거래처', icon: Building2 },
  { to: '/collection', label: '입력', icon: PlusCircle },
]

const MORE_PATHS = [
  '/more', '/materials', '/receivables', '/stats', '/demo', '/dispatch',
  '/presentation', '/history', '/roadmap', '/reports', '/settings',
]

// ── 데스크톱 사이드바 (다크 네이비) ──────────────────────────────────────────
function SidebarLink({ item, muted = false }: { item: NavItem; muted?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `t-nav flex items-center gap-3.5 rounded-xl px-4 transition ${
          muted ? 'min-h-[52px] font-semibold' : 'min-h-[60px]'
        } ${
          isActive
            ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25'
            : muted
              ? 'text-navy-300/75 hover:bg-white/10 hover:text-white'
              : 'text-navy-200/90 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon size={muted ? 21 : 25} strokeWidth={2.2} className="shrink-0" />
      <span className="min-w-0 break-keep">{item.label}</span>
    </NavLink>
  )
}

function Sidebar() {
  const navigate = useNavigate()
  const [plannedOpen, setPlannedOpen] = useState(false)

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[344px] shrink-0 flex-col overflow-y-auto bg-navy-950 lg:flex">
      {/* 브랜드 */}
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.3rem] font-black text-white">
            비
          </div>
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1.3rem] font-extrabold tracking-tight text-white">㈜비원미래</p>
            <p className="mt-1.5 break-keep text-[0.9rem] font-medium leading-snug text-navy-300">
              의료폐기물 수거·운반 통합 운영관리
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <p className="px-4 pb-2.5 pt-2 text-[0.8rem] font-extrabold tracking-wide text-teal-300">
          핵심 운영
        </p>
        <div className="space-y-0.5">
          {CORE_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>

        <p className="px-4 pb-2.5 pt-7 text-[0.8rem] font-extrabold tracking-wide text-navy-400">
          운영 도구 · 추가 고도화 예정
        </p>
        <div className="space-y-0.5">
          {TOOL_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} muted />
          ))}
        </div>

        {/* 설정 — 글자 크기·데이터 관리 (추가 개발 예정 바로 위) */}
        <div className="mt-6 space-y-0.5">
          <SidebarLink item={{ to: '/settings', label: '설정', icon: SlidersHorizontal }} muted />
        </div>

        {/* 추가 개발 예정 — 접기/펼치기 */}
        <button
          onClick={() => setPlannedOpen((v) => !v)}
          className="mt-4 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[0.8rem] font-extrabold tracking-wide text-navy-400 transition hover:text-navy-200"
        >
          <Sparkles size={13} />
          추가 개발 예정
          <ChevronDown size={13} className={`ml-auto transition-transform ${plannedOpen ? 'rotate-180' : ''}`} />
        </button>
        {plannedOpen && (
          <div className="space-y-0.5 pb-2">
            {PLANNED.map((label) => (
              <button
                key={label}
                onClick={() => navigate('/roadmap')}
                title="향후 개발 예정 기능 — 활용 계획에서 단계별 로드맵을 확인할 수 있습니다"
                className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[0.87rem] font-semibold text-navy-400 transition hover:bg-white/5 hover:text-navy-200"
              >
                <Lock size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 break-keep text-left leading-snug">{label}</span>
                <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.85rem] font-bold text-navy-300">
                  예정
                </span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* 하단 — 계정 / 바로가기 */}
      <div className="space-y-2 px-3 pb-4 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-[0.85rem] font-black text-teal-300">
            비
          </div>
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1rem] font-bold text-white">비원미래 대표</p>
            <p className="break-keep text-[0.87rem] text-navy-400">대표 관리자</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <Headset size={16} className="shrink-0 text-teal-300" />
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1rem] font-bold text-white">1533-8876</p>
            <p className="break-keep text-[0.87rem] text-navy-400">평일 09:00 ~ 18:00</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => navigate('/company')}
            title="회사 홈페이지"
            className="flex items-center justify-center rounded-xl bg-white/5 py-2.5 text-navy-300 transition hover:bg-white/10 hover:text-white"
          >
            <Globe size={16} strokeWidth={2.2} />
          </button>
          <button
            onClick={() => navigate('/mobile-preview')}
            title="모바일 미리보기"
            className="flex items-center justify-center rounded-xl bg-white/5 py-2.5 text-navy-300 transition hover:bg-white/10 hover:text-white"
          >
            <Smartphone size={16} strokeWidth={2.2} />
          </button>
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="올바로 시스템"
            className="flex items-center justify-center rounded-xl bg-white/5 py-2.5 text-navy-300 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={16} strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </aside>
  )
}

// ── 모바일 상단 헤더 ─────────────────────────────────────────────────────────
function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 bg-[#f5f7fa]/90 px-4 py-2.5 backdrop-blur-lg lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-[0.95rem] font-black text-teal-300">
          비
        </div>
        <div className="leading-none">
          <p className="text-[1.0625rem] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
          <p className="mt-1 break-keep text-[0.9rem] font-medium text-navy-400">의료폐기물 통합 운영관리</p>
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[0.78rem] font-bold text-amber-600 ring-1 ring-amber-100">
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
      <span className={`relative z-10 whitespace-nowrap text-[0.9rem] font-bold leading-none transition-colors ${active ? 'text-teal-700' : 'text-navy-400'}`}>
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
      <div className="flex w-full">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileHeader />
          <main className="w-full px-4 pb-24 pt-4 lg:px-10 lg:pb-14 lg:pt-8 2xl:px-12">
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
