import { useEffect, useMemo } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CLIENT_TEL } from '../lib/brand'
import { ChevronRight, ClipboardList, Headset, House, MessageSquare, ReceiptText, Truck, type LucideIcon } from 'lucide-react'
import { icon3d } from '../lib/icons3d'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { SyncBar } from './SyncBar'
import { LiveClock } from './LiveClock'
import { PageMotion } from './motion'
import { PortalNoticeBell } from './PortalNoticeBell'
import { PortalViewSwitch } from './PortalViewSwitch'
import { DeviceViewPanels, DeviceViewToggle, useDeviceView, useFrameRouteReport } from './DeviceView'
import { PortalMenu } from './portal/PortalMenu'
import { BrandLogo } from './BrandLogo'
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
import { RequestDetailSheet } from './portal/RequestDetailSheet'
import { touchPortalSeen } from '../lib/repo'
import { OrgName } from './OrgName'

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
  /** 입체 그림 이름 (icons3d 의 portal:…) — 대표님이 만들어 주신 그림 */
  img: string
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
//  ⚠ 포털 1차 고도화 — 셋에서 **다섯**으로.
//
//   대표님 브리프: 「하단 메뉴는 병원 직원이 바로 이해할 수 있는 이름으로
//   (예: 수거 일정 · 이용 내역 · 자재·용기 · 요청 내역 · 정산·증빙) — 최종
//   메뉴명은 실제 코드 구조를 확인한 뒤 결정」.
//
//   셋으로 줄였던 0089 의 까닭은 「같은 일로 가는 길이 둘이면 고민한다」
//   였습니다. 그 원칙은 그대로 지킵니다 — 홈의 여덟 칸 중 이력·정산·증빙
//   카드를 빼고 **메뉴로 옮겼습니다.** 길은 여전히 하나씩입니다.
//
//   · 「이용 내역」→「수거 이력」: 그 화면의 제목이 원래 「수거 이력」입니다.
//     「이용 내역」은 요금 내역처럼도 읽혔습니다.
//   · 「요청 내역」: 보낸 요청이 어디까지 왔는지 모아 보는 자리가 없었습니다.
//   · 「정산·증빙」: 정산 화면에 증빙자료를 함께 둡니다.
//   · 「자재·용기」는 메뉴에 두지 않습니다 — 홈의 큰 단추가 그 길입니다.
//
//   ⚠ 다섯이면 폰에서 한 칸이 78px(390) · 72px(360)입니다. 0083 에서 여섯
//     칸(65px)일 때 글자가 세로로 늘어졌던 것은 이름이 길어서였습니다.
//     이름을 네 글자 이내로 두고, 실측(check_scale · check_ux390)으로 지킵니다.
const NAV: Item[] = [
  { page: '', label: '홈', short: '홈', icon: House, img: 'portal:tab-home', bottom: true },
  { page: 'requests', label: '요청 내역', short: '요청 내역', icon: ClipboardList, img: 'portal:tab-requests', bottom: true },
  { page: 'history', label: '수거 이력', short: '수거 이력', icon: Truck, img: 'portal:history', bottom: true },
  { page: 'billing', label: '정산·증빙', short: '정산·증빙', icon: ReceiptText, img: 'portal:tab-billing', bottom: true },
  { page: 'support', label: '고객지원', short: '고객지원', icon: MessageSquare, img: 'portal:ask', bottom: true },
]

/** 메뉴 그림 — 입체 그림이 있으면 그것, 없으면 예전 선 아이콘. 이름이 옆에 있어 그림은 장식입니다. */
function NavImg({ img, icon: Icon, className }: { img: string; icon: LucideIcon; className: string }) {
  const src = icon3d(img)
  if (!src) return <Icon size={20} strokeWidth={2.2} aria-hidden="true" className={`shrink-0 ${className}`} />
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      decoding="async"
      draggable={false}
      className={`shrink-0 select-none object-contain ${className}`}
    />
  )
}

/** 지금 화면 이름 — 병원명 옆에 적습니다 (0088 · 브리프 11) */
const PAGE_LABEL: Record<PortalPage, string> = {
  '': '홈',
  requests: '요청 내역',
  supplies: '자재·용기 주문',
  report: '월간 배출 리포트',
  history: '수거 이력',
  billing: '정산·증빙',
  support: '고객지원',
}

export function PortalLayout() {
  const { pathname, search } = useLocation()
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
  //  포털 4차 — 첫 화면만 머리띠가 **브랜드 파랑**입니다(흔한 생활 앱 첫 화면).
  //  다른 화면은 흰 머리띠 그대로 — 어느 화면에 있는지 헷갈리지 않게.
  const isHome = !!client && target.page === '' && !onSelectPage
  //  화면 보기 — PC · 모바일 · PC+모바일 (DeviceView, 내부 화면과 같은 것)
  const deviceView = useDeviceView()
  useFrameRouteReport()

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

  //  탭 · 최근 기록 · 홈 화면 앱 전환기에 보이는 이름 — 「어느 병원의 포털인가」.
  //  포털을 떠나면 원래 이름으로 돌려 둡니다.
  useEffect(() => {
    if (!clientName) return
    const prev = document.title
    document.title = `${clientName} · 비원미래 고객 포털`
    return () => {
      document.title = prev
    }
  }, [clientName])

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
      //  ⚠ 0092 — 물음표 뒤를 **같이 들고 갑니다.** 안 그러면 열려 있던
      //    창(?do=supply)이 되돌리는 순간 사라집니다. 병원 담당자가
      //    링크를 받아 들어왔을 때 정작 열려야 할 창이 안 열립니다.
      return <Navigate to={`${portalPath(null, target.page)}${search}`} replace />
    }
    //  직원이 병원 없이 들어왔습니다 → 고르는 화면.
    //  ⚠ 「본문 자리에 목록을 끼워 넣기」가 아니라 **주소를 옮깁니다.**
    //    그래야 고른 뒤에 보던 화면으로 돌아갈 수 있습니다.
    if (target.needsPick && !onSelectPage) {
      return <Navigate to={target.page ? `${PORTAL_SELECT_PATH}?back=${target.page}` : PORTAL_SELECT_PATH} replace />
    }
  }

  return (
    //  포털 3차 — 바탕을 **흰 한 장**으로. 회색 바탕 위에 흰 카드를 띄우던 것이
    //  「웹 대시보드」처럼 보이게 한 첫째 원인이었습니다. 칸은 여백 · 제목 ·
    //  구분선으로 나눕니다.
    //  ⚠ 포털 4차 — 바탕을 다시 **옅은 회색(bg-app)** 으로, 그 위에 흰 둥근 카드.
    //    3차의 「흰 한 장」은 칸이 바탕에 녹아 어디까지가 한 덩어리인지 흐렸습니다.
    //    대표님이 고르신 2차 시안(흔한 생활 앱)은 회색 바탕 + 흰 카드입니다.
    <div data-portal-app data-portal-home={isHome ? '' : undefined} data-device-mode={deviceView} className={`min-h-[100dvh] bg-app ${deviceView === 'both' ? 'pr-[440px]' : ''}`}>
      {/* 상단 바 — 병원 이름이 가장 먼저 보이게 합니다 */}
      {/*  ⚠ 포털 1차 고도화 — 아이폰 「홈 화면에 추가」로 열면 상태 막대가
           투명(black-translucent)이라 머리띠가 시계·배터리 **밑으로** 들어갔습니다.
           그 높이만큼 비웁니다. 브라우저에서는 0 이라 달라지는 것이 없습니다. */}
      {/*  ⚠ 포털 2차 — 머리띠를 **밝게** 바꿨습니다. 예전에는 화면에서 가장 짙은
           것이 머리띠라 눈이 병원 이름·시계에 먼저 갔습니다. 이제 가장 짙은 칸은
           「다음 수거」입니다 — 병원 직원이 제일 먼저 봐야 할 것입니다. */}
      <header
        data-portal-header={isHome ? 'brand' : 'plain'}
        className={isHome ? 'bg-teal-600 text-white' : 'border-b border-navy-100 bg-white'}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/*  ── 포털 3차 — 머리띠는 「어디 · 누구」와 단추 둘(알림 · 내 정보)뿐 ──
             대표님 브리프: 「상단은 최대한 단순하게 — 비원미래 고객포털 / 병원명 ·
             알림 · 프로필 또는 더보기」. 사용 방법 · 글자 크기 · 화면 색 · 화면 보기
             전환 · 로그아웃은 「내 정보」 안으로 옮겼습니다(PortalMenu).
             ⚠ 전화 상담은 넓은 화면에서 눈에 띄는 자리에 남깁니다. 폰에서는
               「내 정보」 맨 위와 고객지원 화면에 있습니다.
             ⚠ 병원 이름은 **줄이지 않습니다**(0080) — 폰에서 세 줄까지 허용하고,
               그래서 폰에서는 「비원미래 고객 포털」 줄을 접습니다(머리띠 140px). */}
        <div className="mx-auto flex w-full max-w-[1240px] xl:max-w-[1600px] 2xl:max-w-[1840px] items-center gap-3 px-4 py-3 sm:py-3.5 lg:px-8">
          <BrandLogo size="md" />
          <div className="min-w-0 flex-1 leading-tight">
            {/*  ⚠ 0086 — 「고객 포털」 이름표: 직원은 내부 화면과 이 화면을 오가므로
                 어느 쪽인지 한눈에 갈라야 합니다. */}
            <span className={`hidden text-[0.95rem] font-bold sm:block ${isHome ? 'text-white/80' : 'text-navy-500'}`}>
              비원미래 <span data-portal-badge className={isHome ? 'text-white' : 'text-teal-700'}>고객 포털</span>
            </span>
            <p
              className={`line-clamp-3 break-keep text-[1.15rem] font-extrabold leading-tight tracking-tight sm:line-clamp-2 sm:text-[1.35rem] sm:leading-snug ${
                isHome ? 'text-white' : 'text-navy-900'
              }`}
            >
              {clientName ? <OrgName name={clientName} /> : '우리 병원'}
            </p>
          </div>
          <a
            href={`tel:${CLIENT_TEL}`}
            className={`hidden min-h-[2.75rem] shrink-0 items-center gap-2 rounded-xl px-3 transition lg:flex ${
              isHome ? 'text-white hover:bg-white/10' : 'text-teal-700 hover:bg-teal-50'
            }`}
          >
            <Headset size={18} strokeWidth={2.4} aria-hidden="true" />
            <span className="t-btn whitespace-nowrap">전화 상담 {CLIENT_TEL}</span>
          </a>
          {/*  0083 — 알림. 표를 만들지 않고 **지금 자료로** 만듭니다. */}
          <PortalNoticeBell notices={notices} onBrand={isHome} />
          <PortalMenu
            onBrand={isHome}
            clientName={clientName}
            profileName={profile?.name}
            onLogout={() => {
              void signOut()
              navigate('/login')
            }}
          />
          {/*  0090 — 폰 ↔ PC 화면 보기. 단추는 「내 정보」 안에 있고, 여기는
               보기 전환(틀 · 띠)만 맡습니다. */}
          <PortalViewSwitch withButton={false} />
        </div>

        {/*  ⚠ 시계는 남깁니다 — 「어느 계정이든 오늘 날짜와 지금 시각」(UIUX_0080).
             폰에서는 이름 아래 한 줄(짧은 날짜), 넓은 화면(lg)에서는 메뉴 줄 오른쪽. */}
        <p
          className={`mx-auto -mt-1 w-full max-w-[1240px] break-keep px-4 pb-2.5 text-[0.95rem] font-bold lg:hidden ${
            isHome ? 'text-white/85' : 'text-navy-500'
          }`}
        >
          <LiveClock compact className="sm:hidden" />
          <LiveClock className="hidden sm:inline" />
        </p>

        {/* 메뉴 — 넓은 화면에서는 상단에, 폰에서는 엄지가 닿는 하단에 둡니다 */}
        <nav className="mx-auto hidden w-full max-w-[1240px] xl:max-w-[1600px] 2xl:max-w-[1840px] items-center gap-1 overflow-x-auto px-3 sm:flex lg:px-7">
          {NAV.map((n) => {
            const Icon = n.icon
            return (
              <NavLink
                key={n.page}
                to={target.path(n.page)}
                end={n.page === ''}
                className={({ isActive }) =>
                  `t-nav relative flex flex-1 shrink-0 items-center justify-center gap-2 rounded-t-xl px-3 py-3.5 transition sm:flex-none sm:justify-start sm:px-4 ${
                    isHome
                      ? isActive
                        ? 'text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                      : isActive
                        ? 'text-navy-900'
                        : 'text-navy-500 hover:bg-navy-50 hover:text-navy-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/*  0103 — 지금 보는 탭 위의 짧은 청록 선. 다른 탭을 누르면
                         이 선이 **그 탭으로 미끄러져** 갑니다(layoutId). 어느
                         탭에서 어느 탭으로 갔는지 눈이 따라갈 수 있습니다.
                         바탕색(bg-app)은 탭 자체에 두어 대비는 그대로입니다. */}
                    {isActive && (
                      <motion.span
                        layoutId="portal-nav-accent"
                        data-nav-accent
                        aria-hidden="true"
                        className={`absolute inset-x-3 bottom-0 h-[3px] rounded-t-full ${isHome ? 'bg-white' : 'bg-teal-500'}`}
                        transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                      />
                    )}
                    <NavImg img={n.img} icon={Icon} className="h-[1.35rem] w-[1.35rem]" />
                    <span className="whitespace-nowrap sm:hidden">{n.short}</span>
                    <span className="hidden whitespace-nowrap sm:inline">{n.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
          {/*  오늘 날짜 · 지금 시각 (0078) — 병원 담당자도 봅니다. 넓은 화면에서는
               메뉴 줄 오른쪽 빈자리에 둡니다(포털 2차). */}
          {/*  화면 보기 PC · 모바일 · PC+모바일 — 시계 왼쪽 */}
          <DeviceViewToggle onBrand={isHome} className="ml-auto" />
          <span className={`hidden shrink-0 items-center pl-4 text-[1rem] font-bold lg:flex ${isHome ? 'text-white/85' : 'text-navy-500'}`}>
            <LiveClock />
          </span>
        </nav>
      </header>

      {/*  포털 4차 — 첫 화면은 파란 머리가 아래로 조금 더 내려와 둥글게 끝나고,
           「다음 수거」 카드가 그 위에 겹쳐 올라앉습니다(흔한 생활 앱 첫 화면). */}
      {/*  ⚠ 직원 미리보기에서는 띠를 안 그립니다 — 미리보기 줄이 사이에 끼어 카드가 띠에
           올라앉지 못하고, 띠 높이만큼 「긴급수거 요청」이 아래 메뉴 쪽으로 밀립니다(check_portal86 ⑦). */}
      {isHome && !target.isPreview && (
        <div data-portal-band aria-hidden="true" className="h-16 rounded-b-[28px] bg-teal-600 sm:h-20" />
      )}

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
        //  포털 3차 시안 — 폰에서는 아래 화면 머리(흰 띠)와 이어지도록 흰 바탕.
        <div className="mx-auto w-full max-w-[1240px] bg-white px-4 pt-4 sm:bg-transparent xl:max-w-[1600px] 2xl:max-w-[1840px] lg:px-8 lg:pt-6">
          <p data-portal-crumb className="t-muted flex flex-wrap items-center gap-1 break-keep">
            <b className="font-extrabold text-navy-700">{client.name}</b>
            <ChevronRight size={14} className="shrink-0 text-navy-400" strokeWidth={2.6} />
            <span className="font-bold text-navy-500">{PAGE_LABEL[target.page]}</span>
          </p>
        </div>
      )}

      {/*  ── 화면 폭 (0091) ─────────────────────────────────────────────────
           대표님: 「PC에서 주로 볼 확률이 훨씬 높으니까 … 좌우에 여백이 좀
           많이 남아, 너무 많이 남기진 않았으면 좋겠어」

           1,240px 로 묶여 있었습니다. 1920px 화면에서 **양쪽 340px 씩**이
           비었습니다 — 화면의 1/3 이 빈 자리였습니다.

           ⚠ **폰·태블릿은 안 건드립니다.** xl(1280px)부터만 넓힙니다.
             1240 아래에서는 어차피 화면 폭이 먼저라 값이 바뀌어도 결과가
             같습니다.
           ⚠ 무한정 늘리지는 않습니다. 다 늘리면 2560px 화면에서 카드 한 장이
             600px 이 되고, 요청 글 한 줄이 화면을 가로질러 눈이 줄을 잃습니다.
             카드 넉 장이 편한 폭(장당 약 420px)에서 멈춥니다.

           아래 여백을 넉넉히 둡니다 — 페이지가 짧으면 마지막 섹션을 위로
           스크롤할 수 없어 사용 방법 안내가 들어갈 자리가 나오지 않습니다 */}
      <main
        data-portal-main
        className={`relative mx-auto w-full max-w-[1240px] xl:max-w-[1600px] 2xl:max-w-[1840px] px-4 pb-[40vh] lg:px-8 ${
          isHome && !target.isPreview ? '-mt-12 pt-0 sm:-mt-14' : 'pt-5 lg:pt-8'
        }`}
      >
        {/*  ⚠ 0088 — 여기에 있던 「병원 고르기」 목록을 걷어냈습니다.
             본문 자리에 끼워 넣으면 **메뉴를 누를 때마다** 튀어나옵니다.
             고르는 일은 자기 주소(/portal/select)를 가진 화면이 합니다. */}
        <PageMotion key={pathname}>
          <Outlet />
        </PageMotion>

        {/*  ── 0093 — 「PC 화면으로 보기」를 **모든 병원 화면**에 ────────────
             0090 에서는 이 단추를 화면 맨 아래 칸(PortalFooter)에 뒀는데,
             그 칸은 **첫 화면에만** 있습니다. 그래서 「이용 내역」이나
             「고객지원」에서는 PC 화면으로 넘어갈 방법이 없었습니다.
             레이아웃으로 올려 어느 화면에서든 쓸 수 있게 합니다.
             ⚠ 머리띠가 아니라 여기입니다 — 머리띠에 두면 단추가 다섯이 되어
               병원 이름이 긴 곳에서 두 줄이 되고 「수거 요청」이 첫 화면
               밖으로 밀립니다(0090 에서 실측). */}
        {/*  포털 3차 — 화면 맨 아래 「도움 · 설정」 줄은 머리띠의 「내 정보」로 옮겼습니다.
             병원이 매일 쓰는 것(일정 · 요청 · 이력)보다 설정이 더 눈에 띄면 안 됩니다. */}
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
          {/*  포털 3차 — 요청 상세(?req=). 목록 어디서 눌러도 같은 창이 열립니다. */}
          <RequestDetailSheet client={client} />
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
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-navy-100 bg-white/95 shadow-nav backdrop-blur-lg sm:hidden"
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
              {/*  포털 4차 — 고른 칸은 짙은 글자(흔한 앱 아래 띠). 색 면은 깔지 않습니다.
                   입체 그림은 AX 아래 탭과 같은 크기(1.27rem) — 고르지 않은 칸은 그림을 옅게 둬서
                   지금 어디인지가 그림만으로도 보이게 합니다. */}
              <NavImg
                img={n.img}
                icon={Icon}
                className={`relative z-10 h-[1.27rem] w-[1.27rem] transition ${active ? '' : 'opacity-55 grayscale-[0.5]'}`}
              />
              <span className={`t-tab relative z-10 whitespace-nowrap ${active ? 'font-extrabold text-navy-900' : 'text-navy-500'}`}>
                {n.short}
              </span>
            </NavLink>
          )
        })}
      </nav>

      {/*  모바일 · PC+모바일 — 같은 주소를 띄운 폰 틀 */}
      <DeviceViewPanels view={deviceView} label={clientName ? `${clientName} 고객 포털` : '비원미래 고객 포털'} />
    </div>
  )
}
