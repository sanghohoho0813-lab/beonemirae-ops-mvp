import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, FileBarChart, History, Headset, LogOut, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SyncBar } from './SyncBar'
import { PageMotion } from './motion'
import { TourButton } from './TourEntry'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 포털 레이아웃
//
//  내부 운영 화면을 그대로 복사하지 않습니다. 병원 담당자는 폐기물 담당이
//  본업이 아니라 겸직인 경우가 대부분이라, 화면이 세 개를 넘지 않게 두고
//  "지금 필요한 것"만 크게 보여줍니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  to: string
  label: string
  /** 모바일에서 세 메뉴가 한 줄에 들어가도록 쓰는 짧은 이름 */
  short: string
  icon: LucideIcon
}

const NAV: Item[] = [
  { to: '/portal', label: '우리 병원 현황', short: '현황', icon: Building2 },
  { to: '/portal/report', label: '월간 리포트', short: '리포트', icon: FileBarChart },
  { to: '/portal/history', label: '수거 이력', short: '이력', icon: History },
]

export function PortalLayout() {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const { data } = useData()
  const navigate = useNavigate()
  const clientName = data.clients[0]?.name ?? ''

  return (
    <div className="min-h-[100dvh] bg-[#f5f7fa]">
      {/* 상단 바 — 병원 이름이 가장 먼저 보이게 합니다 */}
      <header className="bg-navy-950">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.3rem] font-black text-white">
              비
            </div>
            <div className="min-w-0 leading-tight">
              <p className="t-card break-keep text-white">{clientName || '우리 병원'} 폐기물 관리</p>
              <p className="t-muted mt-1 break-keep text-navy-300">㈜비원미래 병원 운영지원 서비스</p>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <TourButton
              compact
              tourId="client"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-[1.05rem] font-bold text-white transition hover:bg-white/20"
            />
            <a
              href="tel:1533-8876"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-white transition hover:bg-white/20"
            >
              <Headset size={17} strokeWidth={2.3} />
              <span className="t-btn hidden sm:inline">1533-8876</span>
            </a>
            <button
              onClick={() => {
                void signOut()
                navigate('/login')
              }}
              title="로그아웃"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-white transition hover:bg-white/20"
            >
              <LogOut size={17} strokeWidth={2.3} />
              <span className="t-btn hidden sm:inline">{profile?.name ?? '로그아웃'}</span>
            </button>
          </div>
        </div>

        {/* 3개뿐인 메뉴 — 접히거나 숨지 않고 항상 그대로 보입니다 */}
        <nav className="mx-auto flex w-full max-w-[1240px] gap-1 overflow-x-auto px-3 lg:px-7">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/portal'}
                className={({ isActive }) =>
                  `t-nav flex flex-1 shrink-0 items-center justify-center gap-2 rounded-t-xl px-3 py-3.5 transition sm:flex-none sm:justify-start sm:px-4 ${
                    isActive ? 'bg-[#f5f7fa] text-navy-900' : 'text-navy-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={20} className="shrink-0" strokeWidth={2.2} />
                <span className="whitespace-nowrap sm:hidden">{n.short}</span>
                <span className="hidden whitespace-nowrap sm:inline">{n.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </header>

      <SyncBar />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-5 lg:px-8 lg:pt-8">
        <PageMotion key={pathname}>
          <Outlet />
        </PageMotion>
      </main>
    </div>
  )
}
