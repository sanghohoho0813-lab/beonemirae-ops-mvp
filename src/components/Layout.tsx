import { useEffect, useState } from 'react'
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
  ScrollText,
  MessageSquarePlus,
  Gauge,
  Inbox,
  LogOut,
  HelpCircle,
  type LucideIcon,
  UserCog,
  FileSpreadsheet,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { TONE, type Tone } from '../lib/tone'
import { SyncBar } from './SyncBar'
import { BottomSheet } from './BottomSheet'
import { MoreMenu } from './MoreMenu'
import { TourButton, TourWhyButton } from './TourEntry'
import { HelpSheet } from './HelpSheet'
import { DevRequestButton, DevRequestSheet } from './DevRequestSheet'
import { PcViewBar, usePcViewport } from './PcViewBar'
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
  /** 한 줄 설명 — 무엇을 하는 메뉴인지 목차에서 바로 읽히게 */
  desc: string
  tone: Tone
}

/** 핵심 운영 — 매일 쓰는 화면 */
const CORE_NAV: NavItem[] = [
  { to: '/', label: '대시보드', icon: LayoutGrid, desc: '오늘 현황 · 핵심 지표', tone: 'blue' },
  { to: '/today', label: '오늘 일정', icon: CalendarClock, desc: '방문 · 완료 · 입력 대기', tone: 'sky' },
  { to: '/collection', label: '수거 입력', icon: PlusCircle, desc: '한 번 입력 → 자동 연결', tone: 'emerald' },
  { to: '/clients', label: '거래처', icon: Building2, desc: '병원별 이력 · 메모 · 추천', tone: 'navy' },
]

/** 병원 서비스 — 이번 확장의 중심. 병원에 무엇을 제공하고 무엇을 받았는지 */
const SERVICE_NAV: NavItem[] = [
  { to: '/requests', label: '병원 요청', icon: Inbox, desc: '병원이 올린 요청 처리 · 회신', tone: 'violet' },
  { to: '/reports', label: '운영 리포트', icon: FileBarChart, desc: '병원에 제공하는 월간 리포트', tone: 'sky' },
  { to: '/performance', label: 'AX 도입 성과', icon: Gauge, desc: '효율 · 자동화 · 매출 확장', tone: 'teal' },
]

/** 운영 도구 — 핵심 흐름을 보조하는 실사용 화면 */
const TOOL_NAV: NavItem[] = [
  { to: '/dispatch', label: '배차·경로', icon: Truck, desc: '', tone: 'navy' },
  { to: '/materials', label: '자재 관리', icon: Boxes, desc: '', tone: 'navy' },
  { to: '/receivables', label: '미수금 관리', icon: Wallet, desc: '', tone: 'navy' },
  { to: '/history', label: '수거이력', icon: History, desc: '', tone: 'navy' },
  { to: '/stats', label: '통계', icon: PieChart, desc: '', tone: 'navy' },
  { to: '/roadmap', label: '활용 계획', icon: Workflow, desc: '', tone: 'navy' },
]

/** 관리 — 관리자만 보이는 영역 */
const ADMIN_NAV: NavItem[] = [
  { to: '/users', label: '사용자 관리', icon: UserCog, desc: '', tone: 'navy' },
  { to: '/dev-requests', label: '개발 요청함', icon: MessageSquarePlus, desc: '', tone: 'navy' },
  { to: '/import', label: '엑셀 가져오기', icon: FileSpreadsheet, desc: '', tone: 'navy' },
  { to: '/settings', label: '설정', icon: SlidersHorizontal, desc: '', tone: 'navy' },
  { to: '/audit', label: '감사로그', icon: ScrollText, desc: '', tone: 'navy' },
]

/** 추가 개발 예정 — 아직 실사용 단계가 아닌 확장 기능 (클릭 시 활용 계획으로 안내) */
const PLANNED: string[] = [
  'AI 배차·경로 고도화',
  '소모품 주문·결제',
  '배출자 교육 이력 관리',
  '리포트 자동 발송(PDF·메일)',
  '올바로 API 연동',
  '병원 다중 담당자 계정',
  'SaaS 서비스 확장',
]

/**
 * 모바일 하단 고정 메뉴 — 데스크톱 메뉴를 그대로 넣지 않습니다.
 *
 *  폰에서 실제로 반복해서 누르는 것만 남기고, 나머지는 전부 「더보기」로 보냅니다.
 *  역할마다 하는 일이 다르므로 구성도 다릅니다.
 *
 *   현장   오늘 갈 곳 → 입력 → 병원 정보. 대시보드는 아예 열리지 않습니다.
 *   사무실 오늘 할 일 → 일정 → 병원 요청.
 */
const BOTTOM_NAV_STAFF: NavItem[] = [
  { to: '/', label: '홈', icon: LayoutGrid, desc: '', tone: 'blue' },
  { to: '/today', label: '오늘', icon: CalendarClock, desc: '', tone: 'sky' },
  { to: '/collection', label: '입력', icon: PlusCircle, desc: '', tone: 'emerald' },
  { to: '/requests', label: '요청', icon: Inbox, desc: '', tone: 'violet' },
]
const BOTTOM_NAV_FIELD: NavItem[] = [
  { to: '/today', label: '오늘', icon: CalendarClock, desc: '', tone: 'sky' },
  { to: '/collection', label: '수거 입력', icon: PlusCircle, desc: '', tone: 'emerald' },
  { to: '/clients', label: '거래처', icon: Building2, desc: '', tone: 'navy' },
]

const MORE_PATHS = [
  '/more', '/materials', '/receivables', '/stats', '/demo', '/dispatch',
  '/presentation', '/history', '/roadmap', '/reports', '/settings', '/performance',
  '/audit', '/requests',
]

/**
 * 역할이 접근할 수 없는 메뉴는 목록에서 아예 제거합니다.
 * (라우트 차단은 RequireAuth, DB 접근 차단은 RLS 가 별도로 담당합니다.)
 */
function useVisibleNav(items: NavItem[]): NavItem[] {
  const { configured, role } = useAuth()
  if (!configured) return items          // 시연 모드에서는 기존과 동일
  return items.filter((i) => canAccess(role, i.to))
}

// ── 데스크톱 사이드바 (다크 네이비) ──────────────────────────────────────────
/**
 * 사이드바 메뉴 1줄.
 * 주요 메뉴는 색 아이콘 타일 + 한 줄 설명을 함께 보여줘, 목차만 봐도
 * "무엇을 하는 메뉴인지"와 "어떤 영역인지"가 바로 구분되게 합니다.
 * (색은 아이콘 타일에만 — 줄 전체를 칠하지 않습니다)
 */
function SidebarLink({ item, muted = false }: { item: NavItem; muted?: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `t-nav flex items-center gap-3 rounded-2xl px-3 transition ${
          muted ? 'min-h-[52px] font-semibold' : 'min-h-[64px]'
        } ${
          isActive
            ? 'bg-white/[0.14] text-white'
            : muted
              ? 'text-navy-300/75 hover:bg-white/10 hover:text-white'
              : 'text-navy-100 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      {muted ? (
        <Icon size={21} strokeWidth={2.2} className="ml-1 shrink-0" />
      ) : (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE[item.tone].tile}`}>
          <Icon size={22} strokeWidth={2.3} />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block break-keep">{item.label}</span>
        {/* 설명은 사이드바가 넉넉해지는 xl 이상에서만 — 좁은 폭에서는 메뉴명만 보여 줍니다 */}
        {!muted && item.desc && (
          <span className="mt-1 hidden break-keep text-[0.95rem] font-medium text-navy-400 xl:block">
            {item.desc}
          </span>
        )}
      </span>
    </NavLink>
  )
}

// ── 접히는 메뉴 묶음 ─────────────────────────────────────────────────────────
//
//  관리자 계정으로 들어오면 사이드바에 메뉴가 18개 펼쳐져 있었습니다.
//  매일 쓰는 것은 위 7개뿐인데, 아래 11개(운영 도구 6 + 관리 5)가 항상
//  같은 무게로 깔려 있어 "정신없다"는 이야기를 들었습니다.
//
//  그래서 아래 두 묶음은 접어 둡니다. 제목 줄을 누르면 펼쳐집니다.
//   · 접힘/펼침은 이 브라우저에 기억해 둡니다 — 매번 다시 열게 하지 않습니다.
//   · 지금 보고 있는 화면이 그 묶음 안에 있으면 저절로 펼쳐집니다.
//     (접힌 채로 두면 "내가 지금 어디에 있는지" 표시가 사라집니다)

const NAV_OPEN_KEY = 'beonemirae-ops:nav-open'

function readNavOpen(id: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_KEY)
    if (!raw) return fallback
    const map = JSON.parse(raw) as Record<string, unknown>
    return typeof map?.[id] === 'boolean' ? (map[id] as boolean) : fallback
  } catch {
    return fallback
  }
}

function writeNavOpen(id: string, value: boolean) {
  try {
    const raw = window.localStorage.getItem(NAV_OPEN_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify({ ...map, [id]: value }))
  } catch {
    /* 저장이 안 되더라도 메뉴 자체는 그대로 동작해야 합니다 */
  }
}

/** 접기/펼치기 제목 줄 — 접혀 있을 때는 안에 몇 개가 있는지 숫자로 알려 줍니다 */
function GroupHeader({
  title,
  count,
  open,
  onToggle,
  icon: Icon,
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  icon?: LucideIcon
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-nav-group-header={title}
      className="mt-6 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[0.92rem] font-extrabold tracking-wide text-navy-400 transition hover:bg-white/5 hover:text-navy-200"
    >
      {Icon && <Icon size={13} className="shrink-0" />}
      <span className="min-w-0 flex-1 break-keep text-left leading-snug">{title}</span>
      {!open && (
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.9rem] font-bold text-navy-300">
          {count}
        </span>
      )}
      <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

/** 접히는 메뉴 묶음 (링크 목록) */
function NavGroup({ id, title, items }: { id: string; title: string; items: NavItem[] }) {
  const { pathname } = useLocation()
  const hasActive = items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  const [open, setOpen] = useState(() => readNavOpen(id, false))

  //  다른 곳에서 이 묶음 안의 화면으로 넘어오면(예: 대시보드의 바로가기)
  //  접힌 채로 두지 않고 펼쳐 줍니다. 펼친 뒤에는 다시 접을 수 있습니다.
  useEffect(() => {
    if (hasActive) setOpen(true)
  }, [hasActive])

  return (
    <>
      <GroupHeader
        title={title}
        count={items.length}
        open={open}
        onToggle={() => {
          setOpen((v) => {
            writeNavOpen(id, !v)
            return !v
          })
        }}
      />
      {open && (
        <div data-nav-group={id} className="space-y-0.5">
          {items.map((item) => (
            <SidebarLink key={item.to} item={item} muted />
          ))}
        </div>
      )}
    </>
  )
}

function Sidebar() {
  const navigate = useNavigate()
  const [plannedOpen, setPlannedOpen] = useState(() => readNavOpen('planned', false))
  const { configured, profile, signOut } = useAuth()
  const coreNav = useVisibleNav(CORE_NAV)
  const serviceNav = useVisibleNav(SERVICE_NAV)
  const toolNav = useVisibleNav(TOOL_NAV)
  const adminNav = !configured || profile?.role === 'admin' ? ADMIN_NAV : []
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다 — useVisibleNav 과 같은 규칙.
  const showPlanned = !configured || canAccess(profile?.role ?? null, '/roadmap')

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[336px] shrink-0 xl:w-[392px] flex-col overflow-y-auto bg-navy-950 lg:flex">
      {/* 브랜드 */}
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.42rem] font-black text-white">
            비
          </div>
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1.42rem] font-extrabold tracking-tight text-white">㈜비원미래</p>
            <p className="mt-1.5 break-keep text-[1.03rem] font-medium leading-snug text-navy-300">
              의료폐기물 수거·운반 통합 운영관리
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <p className="px-4 pb-2.5 pt-2 text-[0.92rem] font-extrabold tracking-wide text-teal-300">
          핵심 운영
        </p>
        <div className="space-y-0.5">
          {coreNav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>

        {serviceNav.length > 0 && (
          <>
            <p className="px-4 pb-2.5 pt-7 text-[0.92rem] font-extrabold tracking-wide text-teal-300">
              병원 서비스 · 성과
            </p>
            <div className="space-y-0.5">
              {serviceNav.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          </>
        )}

        {/*  현장 담당자에게는 이 묶음이 통째로 비어 있습니다(access.ts).
             빈 제목만 남으면 "여기 뭔가 있는데 안 열린다"로 읽힙니다. */}
        {toolNav.length > 0 && (
          <NavGroup id="tools" title="운영 도구 · 추가 고도화 예정" items={toolNav} />
        )}

        {/* 관리 — 관리자 전용 (추가 개발 예정 바로 위) */}
        {adminNav.length > 0 && <NavGroup id="admin" title="관리" items={adminNav} />}

        {/*  추가 개발 예정 — 접기/펼치기.
             누르면 「활용 계획」으로 가는 목록이라, 그 화면을 못 여는 역할에게는
             띄우지 않습니다. 현장 담당자에게는 지금 할 일과 상관없는 목록이고,
             눌러도 「접근 권한이 없는 화면입니다」만 나옵니다. */}
        {showPlanned && (
        <>
        <GroupHeader
          title="추가 개발 예정"
          icon={Sparkles}
          count={PLANNED.length}
          open={plannedOpen}
          onToggle={() => {
            setPlannedOpen((v) => {
              writeNavOpen('planned', !v)
              return !v
            })
          }}
        />
        {plannedOpen && (
          <div className="space-y-0.5 pb-2">
            {PLANNED.map((label) => (
              <button
                key={label}
                onClick={() => navigate('/roadmap')}
                title="향후 개발 예정 기능 — 활용 계획에서 단계별 로드맵을 확인할 수 있습니다"
                className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[1rem] font-semibold text-navy-400 transition hover:bg-white/5 hover:text-navy-200"
              >
                <Lock size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 break-keep text-left leading-snug">{label}</span>
                <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.98rem] font-bold text-navy-300">
                  예정
                </span>
              </button>
            ))}
          </div>
        )}
        </>
        )}
      </nav>

      {/* 하단 — 계정 / 바로가기 */}
      <div className="space-y-2 px-3 pb-4 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-[0.98rem] font-black text-teal-300">
            {(profile?.name ?? '비').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="break-keep text-[1.12rem] font-bold text-white">
              {profile?.name || (configured ? '로그인 필요' : '비원미래 대표')}
            </p>
            <p className="break-keep text-[1rem] text-navy-400">
              {profile ? ROLE_LABEL[profile.role] : configured ? '—' : '시연 모드'}
            </p>
          </div>
          {profile && (
            <button
              onClick={() => {
                void signOut()
                navigate('/login')
              }}
              title="로그아웃"
              aria-label="로그아웃"
              className="shrink-0 rounded-lg p-2 text-navy-300 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
        <TourButton className="flex w-full items-center gap-2.5 rounded-xl bg-white/5 px-3 py-3 text-[1.05rem] font-bold text-navy-200 transition hover:bg-white/10 hover:text-white" />
        {/*  개발자에게 요청하기 — 「사용 방법」 바로 아래, 전화번호 위.
             불편한 것이 생기는 순간은 화면을 보고 있을 때입니다. 그때 눈에
             들어오는 자리에 두어야 합니다(0022). */}
        <DevRequestButton className="flex w-full items-center gap-2.5 rounded-xl bg-white/5 px-3 py-3 text-[1.05rem] font-bold text-navy-200 transition hover:bg-white/10 hover:text-white" />
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <Headset size={16} className="shrink-0 text-teal-300" />
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1.12rem] font-bold text-white">1533-8876</p>
            <p className="break-keep text-[1rem] text-navy-400">평일 09:00 ~ 18:00</p>
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
function MobileHeader({ onHelp }: { onHelp: () => void }) {
  const { mode, profile } = useAuth()
  const live = mode === 'live'
  return (
    <header className="sticky top-0 z-30 bg-[#f5f7fa]/90 px-4 py-2.5 backdrop-blur-lg lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-[1.08rem] font-black text-teal-300">
          비
        </div>
        {/* 폰 헤더는 가로가 390px 뿐입니다. 회사명·담당자·사용법·상태배지를
            다 넣으면 글자 크기를 '크게'로 둔 사용자에게서 서로 밀어냅니다.
            그래서 이 블록만 줄어들게 두고(min-w-0 + truncate),
            오른쪽 두 개는 절대 줄지 않게 했습니다. */}
        {/* 폰 헤더는 가로가 390px 뿐입니다. 회사명·담당자·사용법·상태배지를
            다 넣으면 글자 크기를 '매우 크게'로 둔 사용자에게서 서로 밀어냅니다.
            그래서 이 블록만 줄어들게 두고(min-w-0 + truncate),
            오른쪽 두 개는 절대 줄지 않게 했습니다.

            여기만 rem 이 아니라 px 입니다. 상호와 역할은 '읽어서 판단하는
            업무 데이터'가 아니라 앱 이름표라서, 글자 크기를 키운 목적과
            상관이 없습니다. 오히려 같이 커지면 정작 눌러야 할 「사용법」과
            실제/시연 배지를 밀어내 상호가 「㈜비…」로 잘렸습니다. */}
        <div className="min-w-0 flex-1 leading-none">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-navy-900">㈜비원미래</p>
          {/* 실제 운영 중에는 로그인한 담당자를 보여줍니다 */}
          <p className="mt-1 truncate text-[13px] font-medium text-navy-400">
            {live && profile ? `${profile.name} · ${ROLE_LABEL[profile.role]}` : '운영관리'}
          </p>
        </div>
        {/* 도움말은 두 갈래입니다 — 사용 방법 / 만든 이유.
            폰 헤더에는 둘을 나란히 둘 자리가 없습니다. 하나만 내놓았더니
            나머지는 더보기를 뒤져야 나오는 상태가 됐습니다.
            그래서 여기는 「도움말」 하나로 두고, 누르면 두 갈래를 함께 보여줍니다. */}
        <button
          data-help-open
          onClick={onHelp}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-[0.95rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition active:bg-navy-50"
        >
          <HelpCircle size={17} strokeWidth={2.3} className="shrink-0" />
          도움말
        </button>
        {/* 실제 운영 데이터를 시연 데이터로 오인하지 않도록 배지를 구분합니다 */}
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.9rem] font-bold ring-1 ${
            live
              ? 'bg-teal-50 text-teal-700 ring-teal-100'
              : 'bg-amber-50 text-amber-600 ring-amber-100'
          }`}
        >
          {live ? '실제 운영' : '시연용'}
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
      <span className={`t-tab relative z-10 whitespace-nowrap transition-colors ${active ? 'text-teal-700' : 'text-navy-400'}`}>
        {label}
      </span>
    </button>
  )
}

/**
 * 하단 탭바.
 *
 * z-index 를 바텀시트(z-50)보다 높게 둡니다. 전에는 시트가 탭바를 덮고 있어서,
 * 「더보기」를 연 상태로 「오늘」 탭을 누르면 그 자리에 있던 시트 카드가 눌렸습니다.
 * 화면이 엉뚱한 곳으로 가거나(배경을 누르면) 시트만 닫히고 제자리에 남았습니다 —
 * "메뉴를 눌렀는데 대시보드에 그대로 있다"고 보이던 증상이 이것이었습니다.
 *
 * 탭바는 앱의 기본 이동 수단이라 무엇이 떠 있든 항상 눌려야 합니다.
 */
function BottomNav({
  onMore,
  moreOpen,
  onCloseSheets,
}: {
  onMore: () => void
  moreOpen: boolean
  onCloseSheets: () => void
}) {
  const { role } = useAuth()
  const bottomNav = useVisibleNav(role === 'field' ? BOTTOM_NAV_FIELD : BOTTOM_NAV_STAFF)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const moreActive = moreOpen || MORE_PATHS.includes(pathname)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[55] flex bg-white/95 shadow-nav backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-2xl">
        {bottomNav.map((item) => {
          const active = !moreActive && (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
          return (
            <NavTab
              key={item.to}
              active={active}
              icon={item.icon}
              label={item.label}
              onClick={() => {
                onCloseSheets()
                navigate(item.to)
              }}
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
  const { configured, role } = useAuth()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const showWhy = !configured || canAccess(role, '/why')
  const [moreOpen, setMoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  //  더보기 시트 안에서 열면 시트가 닫힐 때 함께 사라집니다 — 여기서 소유합니다.
  const [devOpen, setDevOpen] = useState(false)
  // PC 화면으로 보기 — 잠깐 확인하는 용도라 저장하지 않습니다.
  // 새로고침하면 언제나 모바일 화면으로 돌아옵니다.
  const [pcView, setPcView] = useState(false)
  usePcViewport(pcView)

  return (
    <div className="min-h-[100dvh] bg-[#f5f7fa]">
      <div className="flex w-full">
        <Sidebar />
        <div className="min-w-0 flex-1 overflow-x-hidden">
          {/* 서버 통신 상태 — 저장 중 / 실패 / 재시도 (실제 운영 모드에서만 표시) */}
          <SyncBar />
          <MobileHeader onHelp={() => setHelpOpen(true)} />
          <main
            className={`w-full px-4 pt-4 lg:px-[40px] lg:pt-8 2xl:px-[56px] ${
              pcView ? 'pb-32' : 'pb-24 lg:pb-14'
            }`}
          >
            {/* 상시 도움말 (PC) — 페이지 제목 바로 위 오른쪽.
                사이드바 맨 아래에도 있지만 거기까지 눈이 가지 않습니다.
                안내를 실수로 닫아도 모든 화면 같은 자리에서 다시 열 수 있습니다. */}
            <div className="mb-3 hidden items-center justify-end gap-2 lg:flex">
              {/* 「만든 이유」는 회사 이야기입니다 — 현장 담당자에게는 띄우지 않습니다 */}
              {showWhy && (
                <TourWhyButton className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-500 shadow-sm ring-1 ring-navy-100 transition hover:text-navy-800" />
              )}
              <TourButton
                className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition hover:text-navy-900"
                label="사용 방법"
              />
            </div>
            <PageMotion key={pathname}>
              <Outlet />
            </PageMotion>
          </main>
        </div>
      </div>

      {/* 모바일 하단 탭 + 더보기 바텀시트 */}
      <BottomNav
        onMore={() => setMoreOpen(true)}
        moreOpen={moreOpen}
        onCloseSheets={() => {
          setMoreOpen(false)
          setHelpOpen(false)
        }}
      />
      <BottomSheet open={moreOpen} title="더보기" onClose={() => setMoreOpen(false)}>
        <MoreMenu
          variant="mobile"
          onNavigate={() => setMoreOpen(false)}
          onDevRequest={() => {
            //  시트가 닫히고 나서 엽니다. 바로 열면 시트가 닫히며 되돌리는
            //  히스토리에 모달까지 함께 걸려 곧바로 닫힙니다(도움말 시트와 같은 이유).
            window.setTimeout(() => setDevOpen(true), 320)
          }}
          onPcView={() => {
            setMoreOpen(false)
            setPcView(true)
          }}
        />
      </BottomSheet>

      {/* 도움말 — 사용 방법 / 만든 이유 두 갈래 (폰) */}
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* 개발자에게 요청하기 — 더보기 시트 바깥에 두어야 시트가 닫혀도 남습니다 */}
      <DevRequestSheet open={devOpen} onClose={() => setDevOpen(false)} />

      {/* PC 화면으로 보기 중일 때만 — 돌아가는 길을 항상 띄워 둡니다 */}
      {pcView && <PcViewBar onExit={() => setPcView(false)} />}
    </div>
  )
}
