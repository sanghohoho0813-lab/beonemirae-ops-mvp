import { useEffect, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CLIENT_TEL } from '../lib/brand'
import { PackageCheck, Building2, FileBarChart, History, Headset, LogOut, ReceiptText, MessageSquare, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SyncBar } from './SyncBar'
import { LiveClock } from './LiveClock'
import { ThemeButton } from './ThemePicker'
import { PageMotion } from './motion'
import { TourButton } from './TourEntry'
import { PortalNoticeBell } from './PortalNoticeBell'
import { portalNotices } from '../lib/portalNotices'
import { touchPortalSeen } from '../lib/repo'

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
  /** 폰 아래 고정 띠에 둘 것인가 (0083) */
  bottom: boolean
}

//  ⚠ 0083 — 두 개를 더했습니다. 병원이 **전화로 물어보던 것**이 정확히
//    이 둘이라, 여기 있어야 전화가 줄어듭니다.
//      정산   「이번 달 얼마 나왔나요 · 입금 됐나요」
//      문의   「이건 어떻게 되나요」 (수거 요청과 다릅니다 — 대화입니다)
//  ⚠ 여섯 개는 폰 아래 띠에 다 안 들어갑니다. 아래 띠에는 **자주 쓰는
//    넷**만 두고, 나머지 둘은 위쪽 줄에 둡니다(bottom: false).
const NAV: Item[] = [
  { to: '/portal', label: '우리 병원 현황', short: '현황', icon: Building2, bottom: true },
  { to: '/portal/supplies', label: '필요한 물품', short: '물품', icon: PackageCheck, bottom: true },
  { to: '/portal/report', label: '월간 리포트', short: '리포트', icon: FileBarChart, bottom: true },
  { to: '/portal/history', label: '수거 이력', short: '이력', icon: History, bottom: true },
  { to: '/portal/billing', label: '정산 내역', short: '정산', icon: ReceiptText, bottom: false },
  { to: '/portal/support', label: '문의하기', short: '문의', icon: MessageSquare, bottom: false },
]

export function PortalLayout() {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const { data } = useData()
  const navigate = useNavigate()
  const clientName = data.clients[0]?.name ?? ''

  //  ⚠ 알림은 저장하지 않고 지금 자료로 만듭니다 (0083).
  const notices = useMemo(
    () => (data.clients[0] ? portalNotices(data, data.clients[0]) : []),
    [data],
  )

  //  ⚠ 「이 병원이 포털을 마지막으로 언제 열었나」를 남깁니다 (0083).
  //    거래처 상세의 「최근 접속」이 지어낸 값이 되지 않으려면 실제로
  //    찍어 두는 수밖에 없습니다.
  //    · 실패해도 조용히 넘어갑니다 — 이건 기록이지 업무가 아닙니다
  //    · 직원이 확인용으로 열어 본 것은 **서버가** 안 셉니다
  useEffect(() => {
    void touchPortalSeen()
  }, [])

  return (
    <div className="min-h-[100dvh] bg-app">
      {/* 상단 바 — 병원 이름이 가장 먼저 보이게 합니다 */}
      <header className="bg-navy-950">
        {/*  ⚠ 0080 — 여기에 gap-y-2(세로 간격)만 있고 flex-wrap 이 없었습니다.
             줄이 바뀔 수 없으니 세로 간격은 처음부터 쓰일 일이 없었고, 대신
             오른쪽 단추들이 **화면 밖으로 밀려났습니다** — 768px 태블릿에서
             91px, 「매우 크게」로 켜면 254px 이 잘렸습니다(「로그아웃」이
             화면 밖). 원래 의도대로 접히게 둡니다.

             ⚠ 단, **sm: 부터**입니다. 390px 폰에서는 오른쪽 단추가 이미
               아이콘만 남아 좁은데, 여기까지 접히게 두면 단추가 한 줄
               내려가 머리글이 140px → 176px 로 **오히려 커집니다.**
               폰에서는 병원 이름 쪽이 줄어드는 것이 맞습니다(min-w-0 +
               두 줄까지 허용). 접기는 글자가 다 보이기 시작하는
               sm: 부터 필요한 것입니다. */}
        <div className="mx-auto flex w-full max-w-[1240px] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:flex-wrap lg:gap-x-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.15rem] font-black text-white sm:h-12 sm:w-12 sm:text-[1.3rem]">
              비
            </div>
            {/*  ⚠ 한 줄로 자르면 「의료법인 한…」만 남습니다. 정작 어느 병원인지는
                 **뒤쪽**에 있습니다 — 「의료법인 한마음의료재단 **한마음요양병원**」.
                 병원 담당자가 자기 병원 이름을 못 알아보는 화면이 됩니다.
                 그렇다고 「의료법인」 같은 앞머리를 임의로 떼지 않습니다 —
                 등록된 이름을 저희가 줄여 부를 일이 아닙니다.
                 두 줄까지 허용합니다. 헤더는 한 줄(약 20px)만 길어집니다. */}
            <div className="min-w-0 leading-tight">
              <p className="t-card line-clamp-2 break-keep text-white">{clientName || '우리 병원'}</p>
              <p className="t-muted mt-1 hidden break-keep text-navy-300 sm:block">㈜비원미래 병원 운영지원 서비스</p>
              {/*  ⚠ 0078 — 폰에서는 여기에 답니다. 오른쪽 단추들과 가로를
                   다투면 병원 이름이 밀려 잘립니다. 넓은 화면에서는 오른쪽
                   단추 옆(아래 lg:inline)에 따로 보입니다.
                   ⚠ 0080 — 자리를 바꾸는 경계를 md(768px)에서 lg(1024px)로
                     옮겼습니다. 768px 은 오른쪽에 시계까지 낄 자리가 없어,
                     끼워 넣은 순간 「로그아웃」이 화면 밖으로 나갔습니다.
                     글자 크기 경계(index.css)와 같은 1024px 을 씁니다 —
                     경계를 두 군데 다르게 두면 반드시 어긋납니다. */}
              <p className="mt-1 break-keep text-[0.98rem] font-bold text-navy-300 lg:hidden">
                <LiveClock />
              </p>
            </div>
          </div>

          {/*  ⚠ 0081 — 「화면 색」 단추가 하나 늘면서 이 묶음이 다시 화면을
               넘겼습니다(673px 33px · 768px 「매우 크게」 68px, 「로그아웃」이
               화면 밖). 0080 에서 **바깥 줄**만 접히게 해 뒀는데, 묶음 자체가
               한 줄을 넘기면 소용이 없습니다. 묶음 안에서도 접히게 둡니다.
               ⚠ shrink-0 은 뗐습니다 — 안 줄고 안 접히면 넘치는 수밖에 없습니다. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/*  0083 — 알림. 표를 만들지 않고 **지금 자료로** 만듭니다
                 (lib/portalNotices.ts). 그래서 「읽음」이 없고, 처리하면
                 저절로 사라집니다. */}
            <PortalNoticeBell notices={notices} />
            <TourButton
              compact
              tourId="client"
              className="flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-[1.05rem] font-bold text-white transition hover:bg-white/20 sm:px-3.5 sm:py-2.5"
            />
            {/*  화면 색 (0081) — 병원 담당자도 바꿀 수 있습니다.
                 어두운 머리띠 위라 흰 테두리 꼴로 둡니다. */}
            <ThemeButton className="flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-2 text-[1.05rem] font-bold text-white transition hover:bg-white/20 sm:px-3.5 sm:py-2.5" />
            <a
              href={`tel:${CLIENT_TEL}`}
              className="flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-white transition hover:bg-white/20 sm:px-3.5 sm:py-2.5"
            >
              <Headset size={17} strokeWidth={2.3} />
              <span className="t-btn hidden sm:inline">{CLIENT_TEL}</span>
            </a>
            {/*  오늘 날짜 · 지금 시각 (0078) — 병원 담당자도 봅니다 */}
            <span className="hidden text-[1rem] font-bold text-white/80 lg:inline">
              <LiveClock />
            </span>
            {profile?.name && (
              <span data-portal-who className="hidden max-w-[9rem] truncate text-[1.02rem] font-bold text-white/80 sm:inline">
                {profile.name}
              </span>
            )}
            <button
              onClick={() => {
                void signOut()
                navigate('/login')
              }}
              title="로그아웃"
              aria-label="로그아웃"
              className="flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-white transition hover:bg-white/20 sm:px-3.5 sm:py-2.5"
            >
              <LogOut size={17} strokeWidth={2.3} />
              {/*  ⚠ 0073 — 여기에 **본인 이름**이 적혀 있었습니다. 그래서 병원
                   담당자가 자기 이름을 눌렀다가 그대로 **로그아웃**됐습니다.
                   이름은 「내 정보」처럼 보이는 자리인데 하는 일은 나가기라,
                   글자와 하는 일이 어긋나 있었습니다. 다시 들어오려면 비밀번호를
                   쳐야 하는데, 병원 담당자는 그것을 모르는 경우가 많습니다.
                   단추에는 **하는 일**을 적습니다. 이름은 옆에 따로 둡니다. */}
              <span className="t-btn hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>

        {/* 3개뿐인 메뉴 — 넓은 화면에서는 상단에, 폰에서는 엄지가 닿는 하단에 둡니다 */}
        <nav className="mx-auto hidden w-full max-w-[1240px] gap-1 overflow-x-auto px-3 sm:flex lg:px-7">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/portal'}
                className={({ isActive }) =>
                  `t-nav flex flex-1 shrink-0 items-center justify-center gap-2 rounded-t-xl px-3 py-3.5 transition sm:flex-none sm:justify-start sm:px-4 ${
                    isActive ? 'bg-app text-navy-900' : 'text-navy-300 hover:bg-white/10 hover:text-white'
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
      {/* 아래 여백을 넉넉히 둡니다 — 페이지가 짧으면 마지막 섹션을 위로 스크롤할 수 없어
          사용 방법 안내가 들어갈 자리가 나오지 않습니다 */}
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-[40vh] pt-5 lg:px-8 lg:pt-8">
        <PageMotion key={pathname}>
          <Outlet />
        </PageMotion>
      </main>

      {/* 폰 전용 하단 탭 — 화면이 셋뿐이라 접거나 숨기지 않습니다 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex bg-white/95 shadow-nav backdrop-blur-lg sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/*  ⚠ 0083 — 여섯 개를 다 넣으면 폰에서 한 칸이 65px 이 되어 글자가
             세로로 늘어집니다. 자주 쓰는 넷만 둡니다 — 정산·문의는 위쪽
             줄에 그대로 있습니다(안 없앴습니다). */}
        {NAV.filter((n) => n.bottom).map((n) => {
          const Icon = n.icon
          const active = n.to === '/portal' ? pathname === '/portal' : pathname.startsWith(n.to)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/portal'}
              className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 py-1.5"
            >
              {active && <span className="absolute inset-x-2 inset-y-1 rounded-2xl bg-teal-50" />}
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 2}
                className={`relative z-10 ${active ? 'text-teal-600' : 'text-navy-400'}`}
              />
              <span className={`t-tab relative z-10 whitespace-nowrap ${active ? 'text-teal-700' : 'text-navy-400'}`}>
                {n.short}
              </span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
