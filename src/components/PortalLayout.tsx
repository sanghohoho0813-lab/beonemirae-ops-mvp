import { useEffect, useMemo } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CLIENT_TEL } from '../lib/brand'
import { Building2, ChevronRight, ClipboardList, Headset, LogOut, MessageSquare, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SyncBar } from './SyncBar'
import { LiveClock } from './LiveClock'
import { ThemeButton } from './ThemePicker'
import { PageMotion } from './motion'
import { TourButton } from './TourEntry'
import { PortalNoticeBell } from './PortalNoticeBell'
import { FontSizeButton } from './FontSizeButton'
import { portalNotices } from '../lib/portalNotices'
import { usePortalClient, portalPath, PORTAL_SELECT_PATH, type PortalPage } from '../lib/portalClient'
import { PortalPreviewBar } from './PortalPreviewBar'
import { PortalToaster } from './PortalToast'
import { usePortalSheet } from '../lib/portalSheet'
import { RequestSheet } from './portal/RequestSheet'
import { SupplySheet } from './portal/SupplySheet'
import { InquirySheet } from './portal/InquirySheet'
import { HistoryDrawer } from './portal/HistoryDrawer'
import { ReportSheet } from './portal/ReportSheet'
import { BillingDrawer } from './portal/BillingDrawer'
import { DocsDrawer } from './portal/DocsDrawer'
import { touchPortalSeen } from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 고객 포털 레이아웃
//
//  내부 운영 화면을 그대로 복사하지 않습니다. 병원 담당자는 폐기물 담당이
//  본업이 아니라 겸직인 경우가 대부분이라, 화면이 세 개를 넘지 않게 두고
//  "지금 필요한 것"만 크게 보여줍니다.
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  /**
   * 어느 화면인가 (0088).
   *
   *  ⚠ 예전에는 여기에 `/portal/supplies` 같은 **완성된 주소**가 적혀
   *    있었습니다. 그래서 메뉴를 누르는 순간 `?client=<id>` 가 떨어져 나가
   *    「어느 병원을 보시겠습니까」가 다시 떴습니다(대표님 신고).
   *    이제는 화면 이름만 두고, 주소는 지금 병원을 아는 쪽에서 만듭니다
   *    (target.path). 병원을 빠뜨릴 자리가 없습니다.
   */
  page: PortalPage
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
//  ⚠ 0089 — 여섯에서 **셋**으로 줄였습니다.
//
//   대표님: 「상단 메뉴 최소화 … 수거 요청 / 긴급수거 / 물품 주문 / 문의 등
//   자주 사용하는 기능은 상단 메뉴가 아니라 홈 화면의 주요 Action Card를
//   통해 실행한다」
//
//   물품·리포트·정산은 이제 홈에서 **창**으로 엽니다(화면을 안 옮깁니다).
//   그래서 위에 이름을 또 걸어 둘 이유가 없어졌습니다 — 같은 일로 가는
//   길이 둘이면 병원 담당자는 어느 쪽이 맞는지 고민하게 됩니다.
//
//   ⚠ 화면(라우트)은 **안 없앴습니다.** 주소를 아시는 분, 예전에 받으신
//     링크, 인증 심사처럼 오래 들여다볼 때는 전체 화면이 낫습니다.
//     위 메뉴에서만 뺐습니다.
const NAV: Item[] = [
  { page: '', label: '우리 병원 홈', short: '홈', icon: Building2, bottom: true },
  { page: 'history', label: '이용 내역', short: '이용내역', icon: ClipboardList, bottom: true },
  { page: 'support', label: '고객지원', short: '고객지원', icon: MessageSquare, bottom: true },
]

/** 지금 화면 이름 — 병원명 옆에 적습니다 (0088 · 브리프 11) */
const PAGE_LABEL: Record<PortalPage, string> = {
  '': '우리 병원 현황',
  supplies: '필요한 물품',
  report: '월간 배출 리포트',
  history: '수거 이력',
  billing: '정산 내역',
  support: '문의하기',
}

export function PortalLayout() {
  const { pathname } = useLocation()
  const { profile, signOut, role } = useAuth()
  const { data } = useData()
  const navigate = useNavigate()
  //  ⚠ 0085 — **어느 병원인지**를 여기서 한 번만 정합니다.
  //    예전에는 화면마다 `data.clients[0]` 였고, 그래서 직원 계정에서는
  //    목록의 첫 병원이 「우리 병원」인 것처럼 떴습니다.
  const target = usePortalClient()
  //  ⚠ 0089 — 창은 **레이아웃에 답니다.** 어느 화면에 계시든 카드·알림·
  //    할 일에서 같은 창을 열 수 있어야 하고, 창이 화면마다 따로 있으면
  //    같은 창이 여러 벌 생깁니다.
  const sheets = usePortalSheet()
  const { clientId } = useParams()
  const client = target.client
  const clientName = client?.name ?? ''
  const onSelectPage = pathname === PORTAL_SELECT_PATH

  //  ⚠ 알림은 저장하지 않고 지금 자료로 만듭니다 (0083).
  const notices = useMemo(
    () => (client ? portalNotices(data, client) : []),
    [data, client],
  )

  //  ⚠ 「이 병원이 포털을 마지막으로 언제 열었나」를 남깁니다 (0083).
  //    거래처 상세의 「최근 접속」이 지어낸 값이 되지 않으려면 실제로
  //    찍어 두는 수밖에 없습니다.
  //    · 실패해도 조용히 넘어갑니다 — 이건 기록이지 업무가 아닙니다
  //    · 직원이 확인용으로 열어 본 것은 **서버가** 안 셉니다
  //  ⚠ 직원이 미리보기로 열어 본 것은 「병원이 들어왔다」가 아닙니다.
  //    서버도 안 세지만(0083), 화면에서도 아예 안 부릅니다.
  useEffect(() => {
    if (!target.isPreview) void touchPortalSeen()
  }, [target.isPreview])

  //  ⚠ 0089 — 투어 마지막의 「수거 요청해보기」가 여기로 옵니다.
  //    예전에는 첫 화면이 이 신호를 받아 창을 열었는데, 창이 레이아웃으로
  //    올라오면서 받는 자리도 함께 옮겼습니다. 안 옮기면 투어 마지막 단추가
  //    조용히 아무 일도 안 하게 됩니다.
  const openSheet = sheets.open
  useEffect(() => {
    const onAsk = () => openSheet('urgent')
    window.addEventListener('beonemirae:portal-request', onAsk)
    return () => window.removeEventListener('beonemirae:portal-request', onAsk)
  }, [openSheet])

  //  ── 길 정리 (0088) ───────────────────────────────────────────────────────
  //
  //  ⚠ **읽는 중에는 아무 데도 안 보냅니다.** 로그인 직후 한 순간 거래처
  //    목록이 비는데, 그때 「병원을 못 찾았으니 고르는 화면으로」를 하면
  //    대표님이 메뉴를 누를 때마다 고르는 화면이 깜빡입니다.
  //    (대표님 신고의 절반이 이것이었습니다)
  if (!target.loading) {
    //  병원 계정이 주소에 남의 병원 id 를 달고 왔습니다.
    //  ⚠ 서버(RLS)가 이미 남의 자료를 안 줍니다. 그래도 주소를 그대로 두면
    //    **주소창에 남의 병원 id 가 박힌 채** 자기 자료가 보입니다 —
    //    「내 화면에 저 병원 이름이 왜 있지」가 됩니다. 자기 주소로 되돌립니다.
    if (role === 'client' && clientId) {
      return <Navigate to={portalPath(null, target.page)} replace />
    }
    //  직원이 병원 없이 들어왔습니다 → 고르는 화면.
    //  ⚠ 「본문 자리에 목록을 끼워 넣기」가 아니라 **주소를 옮깁니다.**
    //    그래야 고른 뒤에 보던 화면으로 돌아갈 수 있습니다.
    if (target.needsPick && !onSelectPage) {
      return <Navigate to={target.page ? `${PORTAL_SELECT_PATH}?back=${target.page}` : PORTAL_SELECT_PATH} replace />
    }
  }

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
              {/*  ⚠ 0086 — 시안의 「고객 포털」 이름표. 여기 있어야 하는 이유는
                   꾸밈이 아닙니다 — 직원 계정은 내부 화면과 이 화면을 오가고,
                   두 화면의 머리띠가 똑같이 남색이라 **어느 쪽에 있는지**
                   한눈에 안 됩니다. 이름표가 그것을 가릅니다.
                   ⚠ 폰에서는 접습니다: 병원 이름과 가로를 다투면 정작 병원
                     이름이 잘립니다(0080 에서 이미 겪은 문제입니다). */}
              <span className="mt-1 hidden flex-wrap items-center gap-2 sm:flex">
                <span data-portal-badge className="rounded-md bg-teal-500 px-2 py-0.5 text-[0.9rem] font-black tracking-wide text-white">
                  고객 포털
                </span>
                <span className="t-muted break-keep text-navy-300">㈜비원미래 병원 운영지원 서비스</span>
              </span>
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
            {/*  ⚠ 0083 — 폰에서는 **감춥니다.** 단추가 여섯이 되면서 머리띠가
                 두 줄(196px)이 되어 화면의 1/4 을 먹었습니다.
                 「사용 방법」은 포털 첫 화면의 안내 띠(TourBanner)에 더 크게
                 그대로 있으므로, 여기서 사라져도 못 찾게 되지 않습니다. */}
            <TourButton
              compact
              tourId="client"
              className="hidden min-h-[2.75rem] items-center gap-2 rounded-xl bg-white/10 px-2.5 py-2 text-[1.05rem] font-bold text-white transition hover:bg-white/20 min-[430px]:flex sm:px-3.5 sm:py-2.5"
            />
            {/*  글자 크기 (0083) — **포털에서는 못 바꾸고 있었습니다.**
                 직원 「더보기」와 관리자 「설정」에만 있었는데, 병원 계정은
                 그 두 화면을 못 엽니다. 요양병원 담당자분이 화면이 작아도
                 방법이 없었습니다. */}
            <FontSizeButton className="flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-2 text-[1.05rem] font-bold text-white transition hover:bg-white/20 sm:px-3.5 sm:py-2.5" />
            {/*  화면 색 (0081) — 병원 담당자도 바꿀 수 있습니다.
                 어두운 머리띠 위라 흰 테두리 꼴로 둡니다. */}
            {/*  ⚠ 화면 색도 폰에서는 감춥니다 — 취향이고, 글자 크기만큼
                 급하지 않습니다. 글자 크기는 **남깁니다**: 요양병원
                 담당자분께는 그게 「쓸 수 있나 없나」의 문제입니다. */}
            <ThemeButton className="hidden min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-2 text-[1.05rem] font-bold text-white transition hover:bg-white/20 min-[430px]:flex sm:px-3.5 sm:py-2.5" />
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
                key={n.page}
                to={target.path(n.page)}
                end={n.page === ''}
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

      {/*  0085 — 직원이 보고 있으면 **그렇다고 말합니다.** 이 띠가 없으면
           대표님이 병원 화면을 보시면서 「우리 미수금이 왜 이것뿐이지」로
           읽으실 수 있습니다 — 병원 화면은 그 병원 것만 보여 줍니다. */}
      {target.isPreview && <PortalPreviewBar client={client} page={target.page} />}

      <SyncBar />
      {/*  ── 지금 어느 병원의 무슨 화면인가 (0088 · 브리프 11) ────────────────
           ⚠ 첫 화면에는 안 답니다 — 바로 아래 머리 칸이 병원 이름을 크게
             적고 있어서 같은 말이 두 번 나옵니다.
           ⚠ 고르는 화면에도 안 답니다 — 아직 병원이 없습니다. */}
      {client && target.page !== '' && !onSelectPage && (
        <div className="mx-auto w-full max-w-[1240px] px-4 pt-4 lg:px-8 lg:pt-6">
          <p data-portal-crumb className="t-muted flex flex-wrap items-center gap-1 break-keep">
            <b className="font-extrabold text-navy-700">{client.name}</b>
            <ChevronRight size={14} className="shrink-0 text-navy-400" strokeWidth={2.6} />
            <span className="font-bold text-navy-500">{PAGE_LABEL[target.page]}</span>
          </p>
        </div>
      )}

      {/* 아래 여백을 넉넉히 둡니다 — 페이지가 짧으면 마지막 섹션을 위로 스크롤할 수 없어
          사용 방법 안내가 들어갈 자리가 나오지 않습니다 */}
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-[40vh] pt-5 lg:px-8 lg:pt-8">
        {/*  ⚠ 0088 — 여기에 있던 「병원 고르기」 목록을 걷어냈습니다.
             본문 자리에 끼워 넣으면 **메뉴를 누를 때마다** 튀어나옵니다.
             고르는 일은 자기 주소(/portal/select)를 가진 화면이 합니다. */}
        <PageMotion key={pathname}>
          <Outlet />
        </PageMotion>
      </main>

      {/*  ── 창 (0089) ─────────────────────────────────────────────────────
           대표님: 「카드 클릭 → 현재 화면 유지 → Modal 중앙 등장 →
           background dim → 작업 완료 → Modal 닫힘 → Dashboard 정보 즉시
           업데이트」

           ⚠ 병원이 정해져 있을 때만 답니다. 어느 병원인지 모르는 채로
             요청을 받을 수는 없습니다. */}
      {client && (
        <>
          <RequestSheet open={sheets.sheet === 'pickup'} urgent={false} client={client} onClose={sheets.close} />
          <RequestSheet open={sheets.sheet === 'urgent'} urgent client={client} onClose={sheets.close} />
          <SupplySheet open={sheets.sheet === 'supply'} client={client} onClose={sheets.close} />
          <InquirySheet open={sheets.sheet === 'ask'} client={client} onClose={sheets.close} />
          <HistoryDrawer open={sheets.sheet === 'history'} client={client} onClose={sheets.close} />
          <ReportSheet open={sheets.sheet === 'report'} client={client} onClose={sheets.close} />
          <BillingDrawer open={sheets.sheet === 'billing'} client={client} onClose={sheets.close} />
          <DocsDrawer
            open={sheets.sheet === 'docs'}
            client={client}
            onClose={sheets.close}
            onOpen={sheets.open}
          />
        </>
      )}

      {/*  보내고 나면 짧게 알려 드립니다 */}
      <PortalToaster />

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
          //  ⚠ 0088 — 주소로 앞자리를 견주지 않습니다. 병원 id 가 주소 가운데
          //    들어가면서 `startsWith` 가 못 맞춥니다. 화면 이름끼리 견줍니다.
          const active = target.page === n.page
          return (
            <NavLink
              key={n.page}
              to={target.path(n.page)}
              end={n.page === ''}
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
