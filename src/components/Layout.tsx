import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { motion } from 'framer-motion'
import {
  MoreHorizontal,
  Smartphone,
  Globe,
  ExternalLink,
  Headset,
  Lock,
  ChevronDown,
  LogOut,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { TONE } from '../lib/tone'
import { LiveClock } from './LiveClock'
import { ThemeButton } from './ThemePicker'
import { SyncBar } from './SyncBar'
import { SchemaBar } from './SchemaBar'
import { BottomSheet } from './BottomSheet'
import { FieldGuide } from './FieldGuide'
import { guideStore, openGuide } from '../lib/fieldGuides'
import { MoreMenu } from './MoreMenu'
import {
  COMPANY,
  COMPANY_EMAIL,
  COMPANY_FAX,
  COMPANY_HOURS,
  COMPANY_TEL,
  SYSTEM_TAGLINE,
  SYSTEM_WORDMARK,
  SYSTEM_WORDMARK_TAIL,
} from '../lib/brand'
import { TourButton, TourWhyButton } from './TourEntry'
import { HelpSheet } from './HelpSheet'
import { FeedbackButton, FeedbackSheet } from './FeedbackSheet'
import { PcViewBar, usePcViewport } from './PcViewBar'
import { PageMotion } from './motion'

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전체 레이아웃 — 반응형 B2B 운영관리 콘솔
//  · 데스크톱(lg↑): 다크 네이비 사이드바 + 밝은 본문
//  · 모바일(lg 미만): 상단 헤더 + 본문 + 하단 탭바(앱형)
//  · 메뉴는 "현재 운영 / 운영 도구 / 추가 개발 예정" 3단으로 분리해
//    지금 바로 사용하는 기능과 향후 확장 기능을 명확히 구분합니다.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CORE_NAV,
  SERVICE_NAV,
  TOOL_NAV,
  ADMIN_NAV,
  PLANNED,
  BOTTOM_NAV_STAFF,
  BOTTOM_NAV_FIELD,
  type NavItem,
} from '../lib/nav'
import { PlannedPreview } from './PlannedPreview'

const MORE_PATHS = [
  '/more', '/plan', '/billing', '/bank', '/materials', '/receivables', '/stats', '/demo', '/dispatch',
  '/presentation', '/history', '/roadmap', '/reports', '/settings', '/performance',
  '/audit', '/readiness', '/requests', '/insight', '/pricing', '/users', '/dev-requests', '/import', '/revenue',
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
              /*  0082 — 글자에 걸린 투명도(/75)를 뗐습니다. 글자를 흐리게 만드는
                  방식이라 그만큼 대비가 깎입니다. 「덜 중요함」은 색 단계로
                  나타냅니다.
                  ⚠ 처음에 navy-400 을 골랐는데 그건 **밝은 바탕용** 색이라
                    어두운 사이드바에서 3.2:1 밖에 안 나왔습니다. 흐림을
                    나타내려다 안 읽히게 만든 것이라 navy-300 으로 되돌립니다.
                    덜 중요함은 navy-100(밝음) ↔ navy-300(덜 밝음)으로 냅니다. */
              /*  0084 — 대표님 요청: 「왼쪽 목차 글자들은 다 흰색으로 명확하게」.
                  덜 중요한 줄도 **글자는 흰색**으로 두고, 덜 중요함은
                  아이콘 크기와 묶음(접힘)으로 나타냅니다 — 글자를 흐리게
                  만들어서 나타내지 않습니다. */
              ? 'text-white hover:bg-white/10'
              : 'text-white hover:bg-white/10'
        }`
      }
    >
      {/*  아이콘 타일은 **메뉴별 색(TONE)** 을 그대로 씁니다.
           ⚠ 0083 에서 이것을 테마 강조색 하나로 통일해 봤는데, 대표님이
             처음 색이 낫다고 하셔서 되돌렸습니다. 「덧칠된 느낌」의 원인은
             이 타일이 아니라 **글자가 뿌옇던 것**이었습니다(0084 에서
             글자를 무채색으로 바꿔 해결했습니다). 원인을 잘못 짚어
             멀쩡한 것을 건드렸던 셈입니다. */}
      {muted ? (
        <Icon size={21} strokeWidth={2.2} className="ml-1 shrink-0" />
      ) : (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE[item.tone].tile}`}>
          <Icon size={22} strokeWidth={2.3} />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block break-keep">{item.label}</span>
        {/* 설명은 사이드바가 넉넉해지는 xl 이상에서만 — 좁은 폭에서는 메뉴명만 보여 줍니다.
            ⚠ 0082 — 여기에 navy-400 이 걸려 있었습니다. 그 색의 **일**은
              「밝은 바탕의 캡션」이라 0080 에서 일부러 어둡게 내린 색입니다.
              어두운 사이드바에 얹으면 검정 위의 짙은 회색이 됩니다 —
              실제로 3.2~3.8:1 로 기준(4.5)에 못 미쳤습니다.
              어두운 바탕용은 navy-300 입니다. 팔레트 주석에도 그렇게 적어
              두었는데 코드가 이미 어기고 있었고, 자(a11y_measure)가 main
              안만 봐서 여태 안 잡혔습니다. */}
        {!muted && item.desc && (
          <span className="mt-1 hidden break-keep text-[0.95rem] font-medium text-navy-200 xl:block">
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
      /*  0082 — navy-400 은 「밝은 바탕의 캡션」 색입니다. 어두운 사이드바에
          얹으니 3.2~3.6:1 로 기준(4.5)에 못 미쳤습니다. 어두운 바탕용은 navy-300. */
      className="mt-6 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-[0.92rem] font-extrabold tracking-wide text-navy-200 transition hover:bg-white/5 hover:text-white"
    >
      {Icon && <Icon size={13} className="shrink-0" />}
      <span className="min-w-0 flex-1 break-keep text-left leading-snug">{title}</span>
      {!open && (
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.9rem] font-bold text-navy-200">
          {count}
        </span>
      )}
      <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

/** 접히는 메뉴 묶음 (링크 목록) */
/**
 * 목차 한 묶음.
 *
 *  `planned` 는 **아직 못 쓰는 것**입니다. 예전에는 「운영 도구」와
 *  「추가 개발 예정」이 별개의 묶음이었는데, 둘 다 같은 성격(업무 도구)이라
 *  목차가 괜히 둘로 갈려 있었습니다. 한 묶음에 넣되 **자물쇠로 구분**하고
 *  **누를 수 없게** 둡니다 — 눌리는데 아무 일도 안 일어나는 것이 제일
 *  나쁩니다.
 */
function NavGroup({
  id,
  title,
  items,
  planned = [],
  onPlanned,
}: {
  id: string
  title: string
  items: NavItem[]
  planned?: string[]
  onPlanned?: (label: string) => void
}) {
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
        count={items.length + planned.length}
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
          {planned.length > 0 && (
            <p className="px-4 pb-1 pt-3 text-[0.9rem] font-bold tracking-wide text-navy-500">추가 개발 예정</p>
          )}
          {planned.map((label) => (
            //  0095 — 예전에는 잠긴 회색 글이었습니다. 눌러도 아무 일이
            //  없으니 회사가 어디로 가려는지 읽을 길이 없었습니다.
            //  이제 누르면 「계획 중 · 지금은 이렇게」 미리보기가 열립니다.
            //  ⚠ 여전히 **메뉴가 아닙니다** — 화면으로 데려가지 않습니다.
            //    되는 척은 미리보기 첫 줄의 「계획 중」 딱지가 막습니다.
            <button
              key={label}
              data-nav-planned={label}
              onClick={() => onPlanned?.(label)}
              title="계획 중인 기능입니다 — 누르면 무엇을 검토 중인지 나옵니다"
              className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[1rem] font-semibold text-navy-400 transition hover:bg-white/5 hover:text-navy-200"
            >
              <Lock size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 break-keep text-left leading-snug">{label}</span>
              <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[0.95rem] font-bold text-navy-400">
                계획중
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

//  ⚠ 0086 — 사이드바 글자는 **테마와 무관하게 항상 밝습니다.**
//    메뉴 이름은 흰색, 나머지 보조 글자는 navy-200(#d7dde6, near-white)
//    입니다. navy-300 으로 두면 어두운 바탕에서 「회색빛으로 흐리다」는
//    인상이 남습니다. 글자에 투명도는 쓰지 않습니다 — 흐림은 배경색에만.
//    중립색이 고정이라(0086) 어느 테마에서도 같은 밝기로 보입니다.
function Sidebar() {
  const navigate = useNavigate()
  const { configured, profile, signOut } = useAuth()
  //  0095 — 「추가 개발 예정」 미리보기. 열려 있는 항목 이름 하나만 기억합니다.
  const [plannedOpen, setPlannedOpen] = useState<string | null>(null)
  const coreNav = useVisibleNav(CORE_NAV)
  const serviceNav = useVisibleNav(SERVICE_NAV)
  const toolNav = useVisibleNav(TOOL_NAV)
  const adminNav = !configured || profile?.role === 'admin' ? ADMIN_NAV : []
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다 — useVisibleNav 과 같은 규칙.
  const showPlanned = !configured || canAccess(profile?.role ?? null, '/roadmap')
  //  0074 — 못 여는 역할에게는 그 단추를 아예 안 보입니다 (아래 ⚠ 참고)
  const showMobilePreview = !configured || canAccess(profile?.role ?? null, '/mobile-preview')

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[336px] shrink-0 xl:w-[392px] flex-col overflow-y-auto bg-navy-950 lg:flex">
      {/* 브랜드 */}
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.42rem] font-black text-white">
            비
          </div>
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1.42rem] font-extrabold tracking-tight text-white">{COMPANY}</p>
            <p className="mt-1.5 break-keep text-[1.03rem] font-medium leading-snug text-navy-200">
              {SYSTEM_TAGLINE}
            </p>
          </div>
        </div>
        {/*  이 시스템의 이름.
             남색 바탕에서 흰색은 위 회사명과 다투고, 청록은 왼쪽 아이콘과
             겹칩니다. 그래서 금색 계열(amber-300)로 두어 회사명 아래에서
             조용히 자기 자리를 잡게 했습니다. 자간을 넓게 준 것은 로고처럼
             읽히라고 — 문장이 아니라 이름입니다. */}
        <p
          data-brand-ax
          className="mt-3.5 select-none border-t border-white/10 pt-3 text-[0.98rem] font-black uppercase tracking-[0.22em] text-amber-300"
        >
          {SYSTEM_WORDMARK}
          {/*  0082 — 글자에 alpha 를 걸면 그만큼 대비가 깎입니다(3.8:1).
               투명도가 필요하면 배경색에만 씁니다. */}
          <span className="text-navy-200"> · </span>
          <span className="text-amber-200">{SYSTEM_WORDMARK_TAIL}</span>
        </p>
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
        {/*  운영 도구 — 쓸 수 있는 것과 아직 못 쓰는 것을 **한 묶음**으로.
             예전에는 「운영 도구」와 「추가 개발 예정」이 목차 두 칸을 따로
             차지했습니다. 둘 다 업무 도구라 나눌 이유가 없었고, 목차만
             길어졌습니다. 자물쇠로 구분하고 아직 못 쓰는 것은 누를 수 없게
             둡니다. */}
        {toolNav.length > 0 && (
          <NavGroup
            id="tools"
            title="운영 도구"
            items={toolNav}
            planned={showPlanned ? PLANNED : []}
            onPlanned={setPlannedOpen}
          />
        )}

        {/*  관리 — 관리자 전용. 아직 만들지 않은 「추가 개발 예정」보다 아래에
             둡니다. 설정·계정·감사로그는 필요할 때만 찾아 들어가는 곳이라
             메뉴의 마지막 자리가 맞습니다. */}
        {adminNav.length > 0 && <NavGroup id="admin" title="관리" items={adminNav} />}
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
            {/*  0082 — 어두운 사이드바 위라 navy-300 입니다(navy-400 은 밝은
                 바탕용이라 여기서는 3.2:1 밖에 안 나옵니다). */}
            <p className="break-keep text-[1rem] text-navy-200">
              {profile ? ROLE_LABEL[profile.role] : configured ? '—' : '시연 모드'}
            </p>
            {/*  오늘 날짜 · 지금 시각 (0078) — PC 는 자리가 넉넉해 연도까지 씁니다 */}
            <p className="mt-1 break-keep text-[1rem] font-bold text-navy-200">
              <LiveClock full />
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
              className="shrink-0 rounded-lg p-2 text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {/*  「사용 방법」과 「사용 후기 남기기」는 오른쪽 위로 옮겼습니다.
             한 화면에 같은 입구를 두 군데 두면 어느 쪽이 진짜인지 헷갈리고,
             왼쪽 목차는 목차만 남는 편이 읽힙니다. */}
        {/*  회사 연락처 — **우리 직원**이 보는 값입니다.
             예전에는 병원 상담번호(1533-8876)가 여기 있었습니다. 직원이
             자기 회사 상담센터로 전화할 일은 없고, 정작 대표번호는
             어디에도 없었습니다. */}
        <div data-company-contact className="rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Headset size={16} className="shrink-0 text-teal-300" />
            <div className="min-w-0 leading-tight">
              <p className="break-keep text-[1.12rem] font-bold text-white">{COMPANY_TEL}</p>
              <p className="break-keep text-[1rem] text-navy-200">{COMPANY_HOURS}</p>
            </div>
          </div>
          <p className="mt-1.5 break-keep text-[1rem] leading-snug text-navy-200">
            팩스 {COMPANY_FAX}
            <br />
            {COMPANY_EMAIL}
          </p>
        </div>
        {/*  바깥으로 나가는 길. 아이콘만 두었더니 무엇인지 눌러 보기 전에는
             알 수 없었습니다 — 이름을 함께 답니다. 글자와 아이콘을 같은
             크기 감각으로 맞추고 예전보다 10% 키웠습니다. */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => navigate('/company')}
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 text-navy-200 transition hover:bg-white/10 hover:text-white"
          >
            <Globe size={18} strokeWidth={2.2} />
            <span className="break-keep text-[0.98rem] font-semibold">홈페이지</span>
          </button>
          {/*  ⚠ 0074 — 이 단추가 **막힌 곳으로 가는 단추**였습니다. 현장
               담당자에게도 보이는데 누르면 「접근 권한이 없는 화면입니다」가
               떴습니다. 권한은 위에서 열었고, 여기서는 **못 여는 역할에게는
               아예 안 보이게** 합니다. 보이면 눌리고, 눌리면 열려야 합니다. */}
          {showMobilePreview && (
            <button
              data-go-mobile-preview
              onClick={() => navigate('/mobile-preview')}
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              <Smartphone size={18} strokeWidth={2.2} />
              <span className="break-keep text-[0.98rem] font-semibold">모바일 화면</span>
            </button>
          )}
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 py-2.5 text-navy-200 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={18} strokeWidth={2.2} />
            <span className="break-keep text-[0.98rem] font-semibold">올바로</span>
          </a>
        </div>
      </div>
    
      <PlannedPreview label={plannedOpen} onClose={() => setPlannedOpen(null)} />
    </aside>
  )
}

// ── 모바일 상단 헤더 ─────────────────────────────────────────────────────────
function MobileHeader({ onHelp }: { onHelp: () => void }) {
  const { mode } = useAuth()
  const live = mode === 'live'
  return (
    /*  ⚠ 0080 — 폰을 **가로로 들면** 화면 높이가 390px 밖에 안 됩니다
        (트럭 안에서 실제로 이렇게 듭니다). 그런데 위 머리띠 102px + 아래 탭
        58px 이 그대로 붙어 있어, **화면의 41%** 를 붙박이가 먹고 일할 자리는
        230px 만 남았습니다. 「매우 크게」로 켜면 46% 까지 갑니다.
        높이가 짧을 때만(가로로 든 폰) 이름표·태그라인을 접고 여백을 줄입니다.
        폭이 아니라 **높이**로 가릅니다 — 세로로 든 폰(844px)과 태블릿은
        그대로입니다. 시계는 남깁니다: 대표님이 「어느 계정이든 보이게」
        요청한 것이라, 자리가 좁다고 뺄 것이 아닙니다. */
    <header className="sticky top-0 z-30 bg-app/90 px-4 py-2.5 backdrop-blur-lg [@media(max-height:480px)]:py-1.5 lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-[1.08rem] font-black text-teal-300">
          비
        </div>
        {/* 폰 헤더는 가로가 390px 뿐입니다. 회사명·담당자·사용법·상태배지를
            다 넣으면 글자 크기를 '매우 크게'로 둔 사용자에게서 서로 밀어냅니다.
            그래서 이 블록만 줄어들게 두고(min-w-0 + truncate),
            오른쪽 두 개는 절대 줄지 않게 했습니다.

            여기만 rem 이 아니라 px 입니다. 상호와 역할은 '읽어서 판단하는
            업무 데이터'가 아니라 앱 이름표라서, 글자 크기를 키운 목적과
            상관이 없습니다. 오히려 같이 커지면 정작 눌러야 할 「사용법」과
            실제/시연 배지를 밀어내 상호가 「㈜비…」로 잘렸습니다. */}
        <div className="min-w-0 flex-1 leading-none">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-navy-900">{COMPANY}</p>
          {/*  PC 사이드바와 **같은 이름표**입니다. 폰에서는 지금까지 더보기
              맨 아래까지 내려가야 볼 수 있었습니다. */}
          {/*  ⚠ 0080 — 여기에 truncate 가 걸려 있어, 「매우 크게」로 켠 폰에서
                 「BEONEMIRAE · BUSINESS A…」로 잘렸습니다. 글자 크기는 px 로
                 고정돼 있어도 **옆에 있는 것들이 rem 이라 커지면서** 이 칸의
                 남는 폭을 가져가기 때문입니다.
                 이름표는 잘려 있으면 「고장 난 화면」으로 읽힙니다. 한 줄을
                 고집하지 않고 **접히게** 둡니다 — 헤더가 한 줄 길어질 뿐입니다.
                 (px 로 둔 이유 자체는 위 설명 그대로 유지합니다.) */}
          <p
            data-brand-ax-header
            /*  0082 — amber-500 은 밝은 바탕에서 2.0:1 입니다. 사이드바(어두운
                바탕)에서는 잘 보이는 금색이지만, 폰 머리띠는 밝은 바탕이라
                같은 색을 쓰면 안 읽힙니다. 같은 계열의 어두운 단계로 둡니다. */
            className="mt-1 break-keep text-[10px] font-black uppercase leading-tight tracking-[0.06em] text-amber-800 [@media(max-height:480px)]:hidden"
          >
            {SYSTEM_WORDMARK}
            {/*  0082 — 밝은 바탕에서 navy-300 은 1.8:1 입니다. 이름표 글자와
                 같은 색으로 둡니다 — 구분점만 유령처럼 흐릴 이유가 없습니다. */}
            <span className="text-amber-800"> · </span>
            {SYSTEM_WORDMARK_TAIL}
          </p>
          {/*  무엇을 하는 시스템인지. 아주 좁은 폰(360px 미만)에서는 상호를
              밀어내므로 그때만 접습니다 — 이름이 잘리는 것보다 낫습니다. */}
          <p className="mt-0.5 hidden break-keep text-[9.5px] font-medium leading-tight text-navy-400 min-[360px]:block [@media(max-height:480px)]:hidden">
            {SYSTEM_TAGLINE}
          </p>
        </div>
        {/*  화면 색 (0081) — 폰에서도 오른쪽 위입니다.
             ⚠ 420px 미만에서는 글자를 접고 아이콘만 남깁니다(ThemePicker 안).
               여기서 글자까지 달면 상호가 「㈜비…」로 잘립니다 — 0080 에서
               같은 자리를 두고 이미 한 번 다툰 적이 있습니다. */}
        <ThemeButton className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-2 text-[0.95rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition active:bg-navy-50" />
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
          {/*  아주 좁은 폰(360px 미만)에서는 글자를 접고 물음표만 남깁니다 —
              여기서 50px 을 아껴야 왼쪽 이름표가 안 잘립니다. */}
          <span className="hidden min-[380px]:inline">도움말</span>
        </button>
        {/*  「실제 운영」 딱지는 뗐습니다 — 실제로 쓰고 있는 지금은 굳이
            매 화면에서 알릴 것이 아니고, 좁은 폰에서 상호를 밀어냈습니다.
            **「시연용」은 그대로 둡니다.** 이건 안내가 아니라 경고입니다 —
            시연 자료를 실제 기록으로 착각하면 그게 진짜 사고입니다. */}
        {!live && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[0.9rem] font-bold text-amber-700 ring-1 ring-amber-100">
            시연용
          </span>
        )}
        {/*  가로로 든 폰에서는 시계를 **이 줄 안**에 넣습니다. 아래 줄을
             따로 쓰지 않아 머리띠가 한 줄 짧아집니다(26px). 이 줄을 피해
             아래로 내렸던 이유는 「폰은 가로가 390px 뿐」이라서인데,
             가로로 들면 844px 이라 그 이유가 없어집니다. */}
        <span className="hidden shrink-0 whitespace-nowrap text-[0.98rem] font-bold text-navy-500 [@media(max-height:480px)]:inline">
          <LiveClock />
        </span>
      </div>
      {/*  ── 오늘 날짜 · 지금 시각 (0078) ────────────────────────────────────
           대표님 요청으로 어느 계정이든 보이게 답니다.
           ⚠ 위 머리글 **안**에 넣지 않았습니다. 폰은 가로가 390px 뿐이라
             상호·도움말과 자리를 다투다 상호가 「㈜비…」로 잘립니다.
             한 줄 아래에 통째로 두면 아무것도 밀어내지 않습니다. */}
      <p className="mt-1.5 text-right text-[1rem] font-bold text-navy-500 [@media(max-height:480px)]:hidden">
        <LiveClock />
      </p>
    </header>
  )
}

// ── 모바일 하단 탭바 ─────────────────────────────────────────────────────────
function NavTab({ active, icon: Icon, label, onClick, guideAt }: { active: boolean; icon: LucideIcon; label: string; onClick: () => void; guideAt?: string }) {
  return (
    <button
      onClick={onClick}
      data-guide={guideAt}
      data-nav-tab={label}
      aria-current={active ? 'page' : undefined}
      /*  0080 — 가로로 든 폰에서는 58px 을 48px 로 줄입니다. 손가락 기준
          44px 은 그대로 지킵니다 — 줄이는 것은 여유분이지 기준이 아닙니다. */
      className="relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 py-1.5 [@media(max-height:480px)]:min-h-[48px] [@media(max-height:480px)]:py-0.5"
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
              guideAt={item.to === '/collection' ? 'guide-nav-collect' : undefined}
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
  //  지금 켜져 있는 사용 안내 (0069)
  const store = useMemo(() => guideStore(), [])
  const guideOn = useSyncExternalStore(store.subscribe, store.get, store.get)

  return (
    <div className="min-h-[100dvh] bg-app">
      <div className="flex w-full">
        <Sidebar />
        <div className="min-w-0 flex-1 overflow-x-hidden">
          {/* 서버 통신 상태 — 저장 중 / 실패 / 재시도 (실제 운영 모드에서만 표시) */}
          <SchemaBar />
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
              {/*  화면 색 바꾸기 (0081) — 대표님 요청으로 **오른쪽 위**에 둡니다.
                   설정 화면에도 같은 것이 있지만, 색은 보면서 고르는 것이라
                   설정까지 들어갔다 나오게 하면 고르는 맛이 없습니다.
                   새 줄을 만들지 않고 이미 있던 오른쪽 위 줄에 얹었습니다 —
                   배치를 바꾸지 않는 것이 이번 작업의 전제입니다. */}
              <ThemeButton className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition hover:text-navy-900" />
              {/* 「만든 이유」는 회사 이야기입니다 — 현장 담당자에게는 띄우지 않습니다 */}
              {showWhy && (
                <TourWhyButton className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-500 shadow-sm ring-1 ring-navy-100 transition hover:text-navy-800" />
              )}
              <TourButton
                className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1rem] font-bold text-navy-600 shadow-sm ring-1 ring-navy-100 transition hover:text-navy-900"
                label="사용 방법"
              />
              {/*  사용 후기 남기기 — 왼쪽 목차에서 여기로 올렸습니다.
                   같은 입구를 두 군데 두면 어느 쪽이 진짜인지 헷갈립니다.
                   **여기만 살짝 색을 넣습니다** — 옆의 둘은 읽는 곳이고
                   이건 보내는 곳이라, 눈에 걸려야 실제로 눌립니다. */}
              <FeedbackButton
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-50 px-3.5 py-2 text-[1rem] font-bold text-teal-700 shadow-sm ring-1 ring-teal-200 transition hover:bg-teal-100 hover:text-teal-800"
                /*  PC 는 한 줄짜리 알약이라 아래에 붙일 자리가 없습니다 —
                    괄호를 뒤에 답니다. 폰 더보기·도움말에서는 제목 아래 줄에
                    들어갑니다(그쪽은 두 줄짜리 칸이라). */
                label="사용 후기 남기기 (개발자에게 요청)"
              />
            </div>
            {/*
              안쪽 한 겹 — 본문만 터진 경우입니다. 이때 왼쪽 메뉴는 살아 있어
              다른 화면으로 그냥 넘어갈 수 있습니다. 예전에는 메뉴까지 사라져
              흰 화면만 남았습니다.

              `key={pathname}` 이 중요합니다 — React 의 오류 경계는 스스로
              풀리지 않아서, 키를 안 바꾸면 다른 화면으로 가도 계속 오류
              화면이 붙어 있습니다.
            */}
            <ErrorBoundary key={pathname} scope="page">
              <PageMotion key={pathname}>
                <Outlet />
              </PageMotion>
            </ErrorBoundary>
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
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} onDevRequest={() => setDevOpen(true)} />

      {/* 사용 후기 남기기 — 더보기 시트 바깥에 두어야 시트가 닫혀도 남습니다 */}
      <FeedbackSheet open={devOpen} onClose={() => setDevOpen(false)} />

      {/*
        사용 안내 (0069) — **화면 위에** 뜹니다. 안내가 화면을 옮겨도 살아
        있어야 해서 Layout 에 답니다. 현장 기사에게만 켭니다 —
        사무실·관리자는 지금까지 쓰던 투어가 따로 있습니다.
      */}
      {role === 'field' && <FieldGuide guideId={guideOn} onClose={() => openGuide(null)} />}

      {/* PC 화면으로 보기 중일 때만 — 돌아가는 길을 항상 띄워 둡니다 */}
      {pcView && <PcViewBar onExit={() => setPcView(false)} />}
    </div>
  )
}
