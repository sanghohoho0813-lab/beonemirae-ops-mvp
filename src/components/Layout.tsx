import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  ChevronRight,
  LogOut,
  HelpCircle,
  PlayCircle,
  Star,
  type LucideIcon,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { canAccess } from '../lib/access'
import { TONE } from '../lib/tone'
import { PortalSwitchButton } from './PortalSwitch'
import { LiveClock } from './LiveClock'
import { ThemeButton } from './ThemePicker'
import { SyncBar } from './SyncBar'
import { CoachPin } from './axCoach/CoachPin'
import { useTour } from '../context/TourContext'
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
//  · 메뉴는 여섯 묶음입니다 (0110 · lib/nav.ts 의 NAV_GROUPS).
//    처음에는 「오늘 업무」만 펼쳐져 있고 나머지는 제목 한 줄씩입니다.
// ─────────────────────────────────────────────────────────────────────────────

import {
  NAV_GROUPS,
  hiddenInMenu,
  readNavOpen,
  writeNavOpen,
  BOTTOM_NAV_STAFF,
  BOTTOM_NAV_FIELD,
  PLANNED,
  PLANNED_ICON,
  PLANNED_SHOWCASE,
  type NavItem,
  type NavGroupDef,
} from '../lib/nav'
import { PlannedPreview } from './PlannedPreview'
import { BrandLogo } from './BrandLogo'
import { PhoneBandSlot } from './PhoneBand'
import { icon3d } from '../lib/icons3d'
import { BIZ_SURVEY_ENABLED, SURVEY_MENU_NAME, SURVEY_PATH } from '../lib/bizSurvey'
import { WIDTH_CLASS, WidthToggle, loadWidth, type ContentWidth } from './WidthToggle'

//  폰에서 「더보기」 탭에 불이 들어와야 하는 화면들 — 하단 고정 탭 넷이
//  아닌 모든 업무 화면입니다. 빠지면 그 화면에 있는 동안 아래 탭 어디에도
//  불이 안 들어와 「지금 어디인지」가 안 보입니다.
//  ⚠ 0110 — /ax-coach · /why · /supplies 가 빠져 있었습니다. 목차를 여섯
//    묶음으로 정리하면서 함께 채웁니다.
const MORE_PATHS = [
  '/more', '/plan', '/billing', '/bank', '/materials', '/receivables', '/stats', '/demo', '/dispatch',
  '/presentation', '/history', '/roadmap', '/reports', '/settings', '/performance', '/ax-coach', '/why',
  '/supplies', '/audit', '/readiness', '/requests', '/insight', '/pricing', '/users', '/dev-requests',
  '/import', '/revenue',
]

/**
 * 역할이 접근할 수 없는 메뉴는 목록에서 아예 제거합니다.
 * (라우트 차단은 RequireAuth, DB 접근 차단은 RLS 가 별도로 담당합니다.)
 */
function useVisibleNav(items: NavItem[]): NavItem[] {
  const { configured, role } = useAuth()
  if (!configured) return items          // 시연 모드에서는 기존과 동일
  return items.filter((i) => canAccess(role, i.to) && !hiddenInMenu(role, i.to))
}

/**
 * 이 역할이 실제로 열 수 있는 묶음만 (0110).
 *
 *  ⚠ 안이 비는 묶음은 제목째 뺍니다. 제목만 남으면 「여기 뭔가 있는데
 *    안 열린다」로 읽힙니다 — 현장 담당자에게 실제로 그랬습니다.
 */
function useVisibleGroups(): NavGroupDef[] {
  const { configured, role } = useAuth()
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: configured ? g.items.filter((i) => canAccess(role, i.to) && !hiddenInMenu(role, i.to)) : g.items,
  })).filter((g) => g.items.length > 0)
}

// ── 데스크톱 사이드바 (다크 네이비) ──────────────────────────────────────────
/**
 * 사이드바 메뉴 1줄.
 * 주요 메뉴는 색 아이콘 타일 + 한 줄 설명을 함께 보여줘, 목차만 봐도
 * "무엇을 하는 메뉴인지"와 "어떤 영역인지"가 바로 구분되게 합니다.
 * (색은 아이콘 타일에만 — 줄 전체를 칠하지 않습니다)
 */
/**
 *  묶음별 아이콘 칸 색 — 대표님: 「병원 서비스 · 정산 매출 · AX 심사 안의 기능들도 아이콘에 색을 넣어 줘.
 *  같은 목차 안은 같은 색으로 묶되 톤만 다르게」.
 *   현장·운영 = 하늘 · 병원 서비스 = 보라 · 정산·매출 = 초록 · AX·심사 = 주황 · 관리 = 분홍
 *   (「추가 개발 예정」의 노랑과 겹치지 않게).
 *   줄 순서대로 옅은 톤 → 짙은 톤. 지금 보는 줄은 다른 묶음과 같게 강조색으로 채웁니다.
 *  ⚠ Tailwind 가 글자 그대로 찾아 쓰므로 클래스 이름을 통째로 적습니다(조립 금지).
 *  ⚠ 아이콘은 늘 **색이 보이는** 밝은 단계(200~300)로 — 50 · 100 은 어두운 바탕에서 회색처럼 보였습니다.
 *    톤 차이는 칸 바탕의 짙기(300/20 → 700/60)로 냅니다.
 */
const GROUP_SHADES: Record<string, string[]> = {
  //  대표님(후속): 「현장·운영이랑 관리 목차 안에도 똑같이」 — 현장·운영 = 하늘 · 관리 = 분홍
  ops: [
    'bg-sky-300/20 text-sky-200 ring-sky-200/40',
    'bg-sky-400/25 text-sky-300 ring-sky-300/40',
    'bg-sky-500/30 text-sky-300 ring-sky-400/45',
    'bg-sky-500/45 text-sky-200 ring-sky-400/50',
  ],
  //  보라는 이 팔레트에서 200 이 거의 흰색이라(채도 0.16) 300 · 400 만 씁니다
  service: [
    'bg-violet-300/20 text-violet-300 ring-violet-200/40',
    'bg-violet-400/25 text-violet-400 ring-violet-300/40',
    'bg-violet-500/35 text-violet-300 ring-violet-400/45',
    'bg-violet-600/45 text-violet-400 ring-violet-500/50',
  ],
  money: [
    'bg-emerald-300/20 text-emerald-200 ring-emerald-200/40',
    'bg-emerald-400/25 text-emerald-300 ring-emerald-300/40',
    'bg-emerald-500/30 text-emerald-300 ring-emerald-400/45',
    'bg-emerald-500/45 text-emerald-200 ring-emerald-400/50',
    'bg-emerald-600/50 text-emerald-200 ring-emerald-500/55',
    'bg-emerald-700/60 text-emerald-300 ring-emerald-500/60',
  ],
  ax: [
    'bg-orange-300/20 text-orange-200 ring-orange-200/40',
    'bg-orange-400/25 text-orange-300 ring-orange-300/40',
    'bg-orange-500/30 text-orange-300 ring-orange-400/45',
    'bg-orange-500/45 text-orange-200 ring-orange-400/50',
    'bg-orange-600/50 text-orange-200 ring-orange-500/55',
  ],
  //  분홍도 200 이 거의 흰색이라(채도 0.19) 300 · 400 만 씁니다
  admin: [
    'bg-rose-300/20 text-rose-300 ring-rose-200/40',
    'bg-rose-400/25 text-rose-400 ring-rose-300/40',
    'bg-rose-500/30 text-rose-300 ring-rose-400/45',
    'bg-rose-500/45 text-rose-400 ring-rose-400/50',
    'bg-rose-600/50 text-rose-300 ring-rose-500/55',
    'bg-rose-700/60 text-rose-400 ring-rose-500/60',
  ],
}

function SidebarLink({ item, muted = false, shade }: { item: NavItem; muted?: boolean; shade?: string }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.desc || undefined}
      className={({ isActive }) =>
        /*  AX 3차 — 메뉴 한 줄(설명 줄은 뺐습니다 · 마우스를 올리면 title 로 나옵니다).
            한 화면에 보이는 메뉴가 두 배가 됩니다. 글자는 16.5px — 0069 바닥(16px) 위. */
        `relative flex items-center gap-2.5 rounded-[11px] px-2.5 text-[0.927rem] transition ${
          muted ? 'min-h-[40px] font-semibold' : 'min-h-[42px] font-bold'
        } ${
          /*  AX 디자인 2차 — 지금 보는 줄은 강조색(포털 파랑) 칸 + 얇은 테두리.
              예전 흰 반투명(bg-white/14)은 어두운 바탕에서 회색으로 떠 보였습니다. */
          isActive
            ? 'bg-teal-600/30 text-white ring-1 ring-inset ring-teal-400/35'
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
      {({ isActive }) => (
        <>
      {/*  0103 — 지금 보는 메뉴 왼쪽의 짧은 청록 막대. 다른 메뉴를 누르면
           **그 줄로 미끄러져** 갑니다(layoutId). 배경(bg-white/14)은 줄 자체에
           두어 글자 대비는 그대로입니다. */}
      {isActive && (
        <motion.span
          layoutId="sidebar-accent"
          data-sidebar-accent
          aria-hidden="true"
          className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full bg-teal-400"
          transition={{ type: 'spring', stiffness: 520, damping: 42 }}
        />
      )}
      {/*  아이콘 타일은 **메뉴별 색(TONE)** 을 그대로 씁니다.
           ⚠ 0083 에서 이것을 테마 강조색 하나로 통일해 봤는데, 대표님이
             처음 색이 낫다고 하셔서 되돌렸습니다. 「덧칠된 느낌」의 원인은
             이 타일이 아니라 **글자가 뿌옇던 것**이었습니다(0084 에서
             글자를 무채색으로 바꿔 해결했습니다). 원인을 잘못 짚어
             멀쩡한 것을 건드렸던 셈입니다. */}
      {muted && shade ? (
        //  묶음 색 칸 (GROUP_SHADES) — 크기 · 모양은 「오늘 업무」 칸과 같게
        <span
          data-nav-shade
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isActive ? 'bg-teal-600 text-white' : `ring-1 ring-inset ${shade}`
          }`}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
      ) : muted ? (
        <Icon size={18} strokeWidth={2.2} className="ml-1 shrink-0" />
      ) : (
        //  AX 디자인 2차 — 색조는 그대로, **어두운 바탕용 칸**(반투명 + 밝은 아이콘)으로.
        //  흰 칸이 남색 바탕 위에서 하나씩 튀던 것을 아래 「추가 개발 예정」 아이콘과
        //  같은 방식으로 맞췄습니다. 지금 보는 메뉴만 강조색으로 채웁니다.
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isActive ? 'bg-teal-600 text-white' : `ring-1 ring-inset ${TONE[item.tone].side}`
          }`}
        >
          <Icon size={16} strokeWidth={2.4} />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-2 whitespace-nowrap">
          {item.label}
          {/*  임시로 올린 메뉴(신보 발표 시연)만 — 작은 글자 표 하나. 색 · 그림은 다른 메뉴와 같게. */}
          {item.badge && (
            <span data-nav-badge className="ms-auto shrink-0 rounded-md bg-teal-400/20 px-1.5 py-0.5 text-[0.787rem] font-extrabold tracking-wide text-teal-200 ring-1 ring-teal-300/40">
              {item.badge}
            </span>
          )}
        </span>
      </span>
        </>
      )}
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
      className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.843rem] font-extrabold tracking-wide text-navy-200 transition first:mt-1 hover:bg-white/5 hover:text-white"
    >
      {Icon && <Icon size={13} className="shrink-0" />}
      <span className="min-w-0 flex-1 break-keep text-left leading-snug">{title}</span>
      {!open && (
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.843rem] font-bold text-navy-200">
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
  defaultOpen = false,
  prominent = false,
}: {
  id: string
  title: string
  items: NavItem[]
  planned?: string[]
  onPlanned?: (label: string) => void
  /**
   * 처음 열었을 때 펼쳐 둘지 (0110).
   *
   *  ⚠ 「오늘 업무」 하나만 true 입니다. 한 번 접거나 펴면 그 뒤로는
   *    **사용자가 정한 쪽**을 기억합니다 — 기본값은 처음 한 번뿐입니다.
   */
  defaultOpen?: boolean
  /** 매일 쓰는 묶음 — 줄을 크게(아이콘 타일 + 설명) 그립니다 (0110) */
  prominent?: boolean
}) {
  const { pathname } = useLocation()
  const hasActive = items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  const [open, setOpen] = useState(() => readNavOpen(id, defaultOpen))

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
          {items.map((item, i) => {
            const shades = GROUP_SHADES[id]
            return <SidebarLink key={item.to} item={item} muted={!prominent} shade={shades?.[i % shades.length]} />
          })}
          {planned.length > 0 && (
            /*  ⚠ 0110 — navy-500 은 **밝은 바탕용** 색입니다. 어두운 사이드바에
                 얹으니 3.0:1 밖에 안 나왔습니다(기준 4.5). 예전에는 이 묶음이
                 거의 안 펼쳐져 눈에 안 띄었을 뿐, 색 자체가 틀렸습니다.
                 어두운 바탕의 보조 글자는 navy-200 입니다(0082·0086). */
            <p className="px-2.5 pb-1 pt-2 text-[0.843rem] font-bold tracking-wide text-navy-200">추가 개발 예정</p>
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
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-[11px] px-3 text-left text-[0.899rem] font-semibold text-navy-200 transition hover:bg-white/5 hover:text-white"
            >
              <Lock size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 break-keep text-left leading-snug">{label}</span>
              <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.787rem] font-bold text-navy-200">
                계획중
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * 「추가 개발 예정」 펼쳐 보이기 (0142 · 신보 발표 기간 임시 — nav.ts PLANNED_SHOWCASE)
 *
 *  「오늘 업무」와 「현장·운영」 사이에 일곱 줄을 늘 펼쳐 둡니다. 아이콘 타일은 **한 가지 색**.
 *  ⚠ 여전히 메뉴가 아닙니다 — 누르면 「계획 중 · 지금은 이렇게」 미리보기만 열립니다(0095).
 */
function PlannedShowcase({ onPlanned }: { onPlanned: (label: string) => void }) {
  return (
    <div data-nav-planned-showcase className="space-y-0.5">
      <p className="mt-3 flex items-center gap-2 px-2.5 py-1.5 text-[0.843rem] font-extrabold tracking-wide text-navy-200">
        <span className="min-w-0 flex-1 break-keep leading-snug">추가 개발 예정</span>
        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.787rem] font-bold text-navy-200">계획중</span>
      </p>
      {PLANNED.map((label) => {
        const Icon = PLANNED_ICON[label] ?? Lock
        return (
          <button
            key={label}
            type="button"
            data-nav-planned={label}
            onClick={() => onPlanned(label)}
            title="계획 중인 기능입니다 — 누르면 무엇을 검토 중인지 나옵니다"
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-[11px] px-2.5 text-left text-[0.899rem] font-semibold text-white transition hover:bg-white/10"
          >
            <span data-planned-icon className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-300/15 text-amber-300 ring-1 ring-amber-300/30">
              <Icon size={15} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1 truncate leading-snug">{label}</span>
            <span className="sr-only">계획중</span>
          </button>
        )
      })}
    </div>
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
  //  ⚠ 0110 — 묶음이 여섯입니다. 한 곳(lib/nav.ts)에서만 정하고 여기서는
  //    역할이 못 여는 것만 걸러서 그립니다. 관리자만 보던 「관리」도 같은
  //    규칙(canAccess)으로 갈립니다 — 예전에는 여기서 따로 판단했습니다.
  const groups = useVisibleGroups()
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다 — useVisibleNav 과 같은 규칙.
  const showPlanned = !configured || canAccess(profile?.role ?? null, '/roadmap')
  //  0074 — 못 여는 역할에게는 그 단추를 아예 안 보입니다 (아래 ⚠ 참고)
  const showMobilePreview = !configured || canAccess(profile?.role ?? null, '/mobile-preview')
  //  신용보증기금 방문용 영상 (0130) — 대표님: 「PC 위쪽 단추도 내려 줘」(이제 필요 없어짐, 기능은 그대로).
  //  위쪽 도구 줄에서 여기 아래 바로가기 위 한 줄로 옮겼습니다. 규칙은 그대로 — 대표·이사님 계정만.
  const showVisitVideo = configured && canAccess(profile?.role ?? null, '/visit-video')
  //  뉴본펭귄 사전 설문 (0145 · 임시) — 대표·관리자 · 사무실(이사님) 계정만
  const showSurvey = BIZ_SURVEY_ENABLED && (!configured || canAccess(profile?.role ?? null, SURVEY_PATH))

  return (
    /*  AX 3차 — 폭 336/392 → 288/304px. 메뉴가 한 줄이 되어 넓을 이유가 없어졌고,
        그만큼 본문(표)이 넓어집니다. */
    <aside data-app-sidebar className="side-bg sticky top-0 hidden h-[100dvh] w-[288px] shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] lg:flex">
      {/* 브랜드 */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="md" />
          <div className="min-w-0 leading-tight">
            <p className="break-keep text-[1.067rem] font-extrabold tracking-tight text-white">{COMPANY}</p>
            <p className="mt-1 break-keep text-[0.843rem] font-medium leading-snug text-navy-200">
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
          className="mt-2.5 select-none border-t border-white/10 pt-2.5 text-[0.73rem] font-black uppercase tracking-[0.2em] text-amber-300"
        >
          {SYSTEM_WORDMARK}
          {/*  0082 — 글자에 alpha 를 걸면 그만큼 대비가 깎입니다(3.8:1).
               투명도가 필요하면 배경색에만 씁니다. */}
          <span className="text-navy-200"> · </span>
          <span className="text-amber-200">{SYSTEM_WORDMARK_TAIL}</span>
        </p>
      </div>

      {/*  ⚠ 0121 — 묶음 **밖**입니다. 0110 에서 「AX·심사」가 접힌 채로 시작하게
           되면서 AX 코치로 들어가는 단추가 첫 화면에서 사라졌습니다. 여섯
           묶음 구조는 그대로 두고, 오늘 상태를 이고 있는 자리 하나만 더합니다. */}
      <div data-hide-presenting className="contents">
        <CoachPin />
      </div>
      {/*  병원이 보는 화면 — 어느 화면에서든 한 번에 (AX 디자인 2차 · 대표님 「전부 다」).
           열 수 없는 역할(현장)에게는 안에서 스스로 숨습니다. */}
      <PortalSwitchButton side />
      {/*  ★ 뉴본펭귄 사전 설문 (0145 · 임시) — 대표·사무실 계정. 링크 없이 눌러서 바로 답합니다. */}
      {showSurvey && (
        <div data-hide-presenting className="contents">
          <Link
            to={SURVEY_PATH}
            data-side-survey
            className="group mx-2.5 mb-1.5 flex min-h-[44px] items-center gap-2.5 rounded-xl bg-amber-300/15 px-2.5 py-1.5 ring-1 ring-inset ring-amber-300/60 transition hover:bg-amber-300/25"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-navy-900">
              <Star size={16} strokeWidth={2.4} className="fill-navy-900" />
            </span>
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[0.871rem] font-extrabold leading-tight text-amber-200">
              ★ {SURVEY_MENU_NAME}
            </span>
            <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[0.78rem] font-extrabold text-navy-900">시작</span>
          </Link>
        </div>
      )}

      <nav className="flex-1 px-2.5">
        {groups.map((g) => (
          <Fragment key={g.id}>
            <NavGroup
              id={g.id}
              title={g.title}
              items={g.items}
              defaultOpen={g.defaultOpen}
              prominent={g.defaultOpen}
              planned={g.planned && showPlanned && !PLANNED_SHOWCASE ? g.planned : []}
              onPlanned={setPlannedOpen}
            />
            {/*  0142 — 발표 기간 임시: 「오늘 업무」 바로 아래에 추가 개발 예정을 펼쳐 둠 */}
            {g.id === 'today' && PLANNED_SHOWCASE && showPlanned && <PlannedShowcase onPlanned={setPlannedOpen} />}
          </Fragment>
        ))}
      </nav>

      {/* 하단 — 계정 / 바로가기 */}
      <div className="space-y-1.5 px-2.5 pb-3 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-[0.98rem] font-black text-teal-300">
            {(profile?.name ?? '비').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="break-keep text-[0.899rem] font-bold text-white">
              {profile?.name || (configured ? '로그인 필요' : '비원미래 대표')}
            </p>
            {/*  0082 — 어두운 사이드바 위라 navy-300 입니다(navy-400 은 밝은
                 바탕용이라 여기서는 3.2:1 밖에 안 나옵니다). */}
            <p className="break-keep text-[0.843rem] text-navy-200">
              {profile ? ROLE_LABEL[profile.role] : configured ? '—' : '시연 모드'}
            </p>
            {/*  ⚠ 0129 — 여기 있던 시계를 **사이드바 맨 위로** 옮겼습니다.
                 대표님: 「왼쪽 아래 계정 아래에 두지 말고 상단에 고정시켜
                 잘 보이게」. 계정 카드는 스크롤을 끝까지 내려야 나오는
                 자리라, 시각을 확인하려면 매번 내려야 했습니다. */}
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
        <div data-company-contact className="rounded-xl bg-white/5 px-3 py-2">
          <div className="flex items-center gap-2.5">
            <Headset size={16} className="shrink-0 text-teal-300" />
            <div className="min-w-0 leading-tight">
              <p className="break-keep text-[0.899rem] font-bold text-white">{COMPANY_TEL}</p>
              <p className="break-keep text-[0.843rem] text-navy-200">{COMPANY_HOURS}</p>
            </div>
          </div>
          <p className="mt-1 break-keep text-[0.843rem] leading-snug text-navy-200">
            팩스 {COMPANY_FAX}
            <br />
            {COMPANY_EMAIL}
          </p>
        </div>
        {/*  바깥으로 나가는 길. 아이콘만 두었더니 무엇인지 눌러 보기 전에는
             알 수 없었습니다 — 이름을 함께 답니다. 글자와 아이콘을 같은
             크기 감각으로 맞추고 예전보다 10% 키웠습니다. */}
        {showVisitVideo && (
          <button
            type="button"
            data-visit-video-btn
            onClick={() => navigate('/visit-video')}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-navy-200 transition hover:bg-white/10 hover:text-white"
          >
            <PlayCircle size={17} strokeWidth={2.2} className="shrink-0" aria-hidden />
            <span className="whitespace-nowrap text-[0.843rem] font-semibold">신용보증기금 방문용 영상</span>
          </button>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => navigate('/company')}
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/5 py-2 text-navy-200 transition hover:bg-white/10 hover:text-white"
          >
            <Globe size={17} strokeWidth={2.2} />
            <span className="whitespace-nowrap text-[0.843rem] font-semibold">홈페이지</span>
          </button>
          {/*  ⚠ 0074 — 이 단추가 **막힌 곳으로 가는 단추**였습니다. 현장
               담당자에게도 보이는데 누르면 「접근 권한이 없는 화면입니다」가
               떴습니다. 권한은 위에서 열었고, 여기서는 **못 여는 역할에게는
               아예 안 보이게** 합니다. 보이면 눌리고, 눌리면 열려야 합니다. */}
          {showMobilePreview && (
            <button
              data-go-mobile-preview
              onClick={() => navigate('/mobile-preview')}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/5 py-2 text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              <Smartphone size={18} strokeWidth={2.2} />
              <span className="whitespace-nowrap text-[0.843rem] font-semibold">모바일 화면</span>
            </button>
          )}
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/5 py-2 text-navy-200 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={18} strokeWidth={2.2} />
            <span className="whitespace-nowrap text-[0.843rem] font-semibold">올바로</span>
          </a>
        </div>
      </div>
    
      <PlannedPreview label={plannedOpen} onClose={() => setPlannedOpen(null)} />
    </aside>
  )
}

// ── PC 제목 위 「묶음 › 화면 이름」 (AX 3차) ────────────────────────────────
/**
 *  흔한 ERP 화면처럼 지금 어디인지 한 줄로 적습니다. 이름은 왼쪽 메뉴(lib/nav.ts)와
 *  **같은 곳**에서 가져옵니다 — 따로 적어 두면 메뉴 이름이 바뀔 때 어긋납니다.
 *  거래처 상세처럼 메뉴 아래 화면이면 메뉴 이름을 눌러 목록으로 돌아갈 수 있습니다.
 *  ⚠ 시안에는 위쪽 흰 줄 맨 왼쪽이었는데, 거기 두면 1440px 에서 도구 줄이 두 줄로 꺾여
 *    「방문용 영상 ↔ 시계 ↔ 화면 색」 자리(check_clock · check_visit_video)가 흔들립니다.
 *    그래서 본문 맨 위(제목 바로 위)에 둡니다.
 */
function TopCrumb() {
  const { pathname } = useLocation()
  const hit = useMemo(() => {
    for (const g of NAV_GROUPS) {
      for (const i of g.items) {
        if (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`)) {
          return { group: g.title, label: i.label, to: i.to, sub: pathname !== i.to }
        }
      }
    }
    return null
  }, [pathname])
  if (!hit) return null
  return (
    <nav
      aria-label="지금 위치"
      data-page-crumb
      className="mb-2 hidden min-w-0 items-center gap-1.5 whitespace-nowrap text-[0.899rem] font-semibold text-navy-500 lg:flex"
    >
      <span>{hit.group}</span>
      <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" className="text-navy-300" />
      {hit.sub ? (
        <>
          <Link to={hit.to} className="transition hover:text-navy-900">{hit.label}</Link>
          <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" className="text-navy-300" />
          <span className="font-extrabold text-navy-900">상세</span>
        </>
      ) : (
        <span className="font-extrabold text-navy-900" aria-current="page">{hit.label}</span>
      )}
    </nav>
  )
}

// ── 모바일 상단 헤더 ─────────────────────────────────────────────────────────
//  AX 5차 — 대표님: 「레퍼런스 영상 바탕으로 예쁘게」(배민 · talabat).
//   예전: 밝은 바탕에 상호 · 영문 이름표 · 설명 세 줄 + 영상 단추(두 줄) · 시계.
//   지금: **브랜드 색 띠 하나** — 로고 · 상호 · 이름표 / 시계 / 그 화면 제목.
//   제목 자리(slot)는 화면이 채웁니다(PhoneBand). 첫 카드가 띠 끝에 겹쳐 올라옵니다.
//   ⚠ 띠 색은 테마 주색(teal-600 → 700)입니다 — 화면 색을 바꾸면 띠도 따라 바뀝니다.
//     바탕색(bg-teal-600)도 함께 둡니다 — 그라데이션의 **가장 밝은 끝**이라, 흰 글자 대비를 잴 때
//     가장 나쁜 경우로 잽니다(아홉 테마 모두 5.2:1 이상).
//   ⚠ 붙박이(sticky)가 아닙니다. 띠가 제목까지 품어 키가 커졌기 때문에, 붙여 두면
//     폰 화면의 4분의 1을 늘 먹습니다. 내리면 같이 올라가고, 아래 탭은 그대로입니다.
function MobileHeader({ onHelp, slotRef }: { onHelp: () => void; slotRef: (el: HTMLDivElement | null) => void }) {
  const { mode } = useAuth()
  const live = mode === 'live'
  return (
    /*  ⚠ 0080 — 폰을 **가로로 들면** 화면 높이가 390px 밖에 안 됩니다
        (트럭 안에서 실제로 이렇게 듭니다). 높이가 짧을 때만 이름표를 접고
        여백을 줄입니다. 폭이 아니라 **높이**로 가릅니다. 시계는 남깁니다:
        대표님이 「어느 계정이든 보이게」 요청한 것입니다. */
    <header
      data-phone-band
      className="relative rounded-b-[26px] bg-teal-600 bg-gradient-to-br from-teal-600 to-teal-700 px-4 pb-3 pt-2.5 text-white [@media(max-height:480px)]:py-1.5 lg:hidden"
    >
      <div className="flex items-center gap-2.5">
        <BrandLogo size="sm" tone="dark" className="!ring-0" />
        {/*  폰 머리띠는 가로가 390px 뿐입니다 — 이 칸만 줄어들게(min-w-0),
             오른쪽 단추는 절대 줄지 않게 둡니다. 여기만 px 입니다: 상호 · 이름표는
             앱 이름표라 글자 크기 설정과 같이 커질 이유가 없습니다(0080). */}
        <div className="min-w-0 flex-1 leading-none">
          <p className="truncate text-[15px] font-extrabold tracking-tight text-white">{COMPANY}</p>
          {/*  PC 사이드바와 **같은 이름표**. 잘리지 않게 접히도록 둡니다(0080). */}
          <p
            data-brand-ax-header
            className="mt-1 break-keep text-[10px] font-black uppercase leading-tight tracking-[0.08em] text-white [@media(max-height:480px)]:hidden"
          >
            {SYSTEM_WORDMARK}
            <span> · </span>
            {/*  접히더라도 「BUSINESS AX」는 한 덩어리로 — 「AX」만 홀로 다음 줄에 남지 않게 */}
            <span className="whitespace-nowrap">{SYSTEM_WORDMARK_TAIL}</span>
          </p>
        </div>
        {/*  화면 색 (0081) · 도움말 — 띠 위의 반투명 동그라미 두 개 (손가락 44px) */}
        <ThemeButton className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition active:bg-white/25 [&>span]:!hidden" />
        <button
          data-help-open
          onClick={onHelp}
          aria-label="도움말"
          title="도움말"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition active:bg-white/25"
        >
          <HelpCircle size={20} strokeWidth={2.3} className="shrink-0" />
          {/*  글자는 화면 읽기용으로만 — 띠 위 동그라미는 아이콘 하나가 깔끔합니다 */}
          <span className="sr-only">도움말</span>
        </button>
        {/*  「시연용」은 그대로 둡니다 — 안내가 아니라 경고입니다(시연 자료를 실제로 착각하면 사고). */}
        {!live && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[0.9rem] font-bold text-amber-700 ring-1 ring-amber-100">
            시연용
          </span>
        )}
        {/*  가로로 든 폰에서는 시계를 **이 줄 안**에 넣어 한 줄을 아낍니다. */}
        <span className="hidden shrink-0 whitespace-nowrap text-[0.98rem] font-bold text-white [@media(max-height:480px)]:inline">
          <LiveClock />
        </span>
      </div>
      {/*  ── 오늘 날짜 · 지금 시각 (0078) — 어느 계정이든 보이게 ────────────────
           ⚠ 「신용보증기금 방문용 영상」 단추(0130)는 더보기로 내렸습니다 — 대표님: 「이제 필요 없어졌으니
             기능은 지우지 말고 더보기에 넣어 줘」. 영상 화면(/visit-video)과 PC 위쪽 단추는 그대로입니다. */}
      <div className="mt-2 flex items-center justify-end [@media(max-height:480px)]:hidden">
        <p className="shrink-0 whitespace-nowrap text-right text-[0.95rem] font-bold text-white">
          <LiveClock />
        </p>
      </div>
      {/*  그 화면의 제목 자리 — 화면이 <PhoneBand> 로 채웁니다(없으면 비어 있음) */}
      <div ref={slotRef} data-phone-band-slot />
    </header>
  )
}

// ── 모바일 하단 탭바 ─────────────────────────────────────────────────────────
/**
 *  아래 탭 입체 그림 — 대표님이 주신 아이콘(public/icons3d). 주소로 고릅니다(현장 계정은 탭 구성이 달라서).
 *   그림이 없는 주소는 예전 선 아이콘 그대로입니다.
 */
const tabImg = (to: string) => icon3d(`tab:${to}`) ?? icon3d(to)

function NavTab({ active, icon: Icon, img, label, onClick, guideAt }: { active: boolean; icon: LucideIcon; img?: string; label: string; onClick: () => void; guideAt?: string }) {
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
      {img ? (
        //  이름이 아래 있으니 그림은 장식(alt=""). 대표님: 「아이콘이 너무 커」 → 선 아이콘과 비슷한 크기(1.27rem · 한 번 더 13% 줄임).
        <img
          src={img}
          alt=""
          aria-hidden="true"
          width={192}
          height={192}
          decoding="async"
          draggable={false}
          className="relative z-10 h-[1.27rem] w-[1.27rem] select-none object-contain [@media(max-height:480px)]:h-5 [@media(max-height:480px)]:w-5"
        />
      ) : (
        <Icon
          size={22}
          strokeWidth={active ? 2.4 : 2}
          className={`relative z-10 transition-colors ${active ? 'text-teal-600' : 'text-navy-400'}`}
        />
      )}
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
              img={tabImg(item.to)}
              label={item.label}
              guideAt={item.to === '/collection' ? 'guide-nav-collect' : undefined}
              onClick={() => {
                onCloseSheets()
                navigate(item.to)
              }}
            />
          )
        })}
        <NavTab active={moreActive} icon={MoreHorizontal} img={tabImg('more')} label="더보기" onClick={onMore} />
      </div>
    </nav>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  const { configured, role } = useAuth()
  /**
   *  심사 시연 중에는 **화면만 남깁니다** (0110).
   *
   *   오른쪽 위 도구 줄(색 바꾸기 · 만든 이유 · 사용 방법 · 후기)과 폰 하단 탭,
   *   「PC 화면으로 보는 중」 띠는 시연의 이야기와 아무 상관이 없습니다.
   *   보는 사람의 눈이 거기로 한 번 가면 그 순간을 잃습니다.
   *
   *   ⚠ 감추는 것은 **도구**뿐입니다. 저장 상태(SyncBar)나 서버 경고(SchemaBar)는
   *     그대로 둡니다 — 시연 중에 문제를 가리는 것은 다른 이야기입니다.
   *   ⚠ 일반 사용법 투어에는 compact 표시가 없으므로 예전 그대로입니다.
   */
  const { active: runningTour } = useTour()
  const minimal = !!runningTour?.compact
  //  시연 모드(설정 없음)에서는 기존과 동일하게 전부 보입니다.
  const showWhy = !configured || canAccess(role, '/why')
  //  0142 — 대표님: 「이 시스템을 만든 이유 · 화면 색 · 사용 방법 — 설정 안에 넣어 버려 줘. 상단에서 안 보여도 될 듯.」
  //    설정을 여는 계정(대표)은 위 줄에서 빼고 설정 맨 위 「도움말 · 화면 색」 칸에서 씁니다.
  //    ⚠ 설정을 못 여는 계정(사무실 · 현장)은 그대로 둡니다 — 빼면 「사용 방법」 들어갈 문이 없어집니다.
  const helpInSettings = !configured || canAccess(role, '/settings')
  //  신용보증기금 방문용 영상 (0130) — 위쪽 도구 줄에서 사이드바 아래(Sidebar)로 내렸습니다.
  const [moreOpen, setMoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  //  더보기 시트 안에서 열면 시트가 닫힐 때 함께 사라집니다 — 여기서 소유합니다.
  const [devOpen, setDevOpen] = useState(false)
  // PC 화면으로 보기 — 잠깐 확인하는 용도라 저장하지 않습니다.
  // 새로고침하면 언제나 모바일 화면으로 돌아옵니다.
  const [pcView, setPcView] = useState(false)
  usePcViewport(pcView)
  //  화면 폭 3단계 (0141) — 기본 「보통」, 이 기기에 기억
  const [contentWidth, setContentWidth] = useState<ContentWidth>(() => loadWidth())
  //  지금 켜져 있는 사용 안내 (0069)
  const store = useMemo(() => guideStore(), [])
  const guideOn = useSyncExternalStore(store.subscribe, store.get, store.get)
  //  AX 5차 — 폰 파란 띠 안 「그 화면 제목」 자리 (PhoneBand)
  const [bandSlot, setBandSlot] = useState<HTMLDivElement | null>(null)

  return (
    <div className="min-h-[100dvh] bg-app">
      <div className="flex w-full">
        <Sidebar />
        <div className="min-w-0 flex-1 overflow-x-hidden">
          {/* 서버 통신 상태 — 저장 중 / 실패 / 재시도 (실제 운영 모드에서만 표시) */}
          <SchemaBar />
          <SyncBar />
          <MobileHeader onHelp={() => setHelpOpen(true)} slotRef={setBandSlot} />
          <main className={`w-full ${pcView ? 'pb-32' : 'pb-24 lg:pb-14'}`}>
            {/*  AX 디자인 2차 — PC 도구 줄을 **흰 상단 바** 한 줄로 (ERP 머리줄).
                 예전에는 회색 바탕 위에 흰 알약들이 그림자를 달고 떠 있었습니다. 줄 안의
                 순서 · 단추는 그대로이고, 바만 화면 끝까지 깔았습니다.
                 ⚠ 안쪽 폭은 본문과 같은 WIDTH_CLASS — 오른쪽 끝이 본문 카드 끝과 맞습니다.
                 ⚠ main **안**의 첫 줄입니다 — 도구 줄은 예전부터 main 안에 있었고,
                   검사(check_phoneui · check_motion)도 거기서 찾습니다.
                 ⚠ 발표 집중 모드(minimal)에서는 예전처럼 통째로 숨습니다. */}
            <div
              data-topbar
              className={`${minimal ? 'hidden' : 'hidden lg:block'} border-b border-cardline bg-white px-[32px] 2xl:px-[48px]`}
            >
                {/* 상시 도움말 (PC) — 페이지 제목 바로 위 오른쪽.
                    사이드바 맨 아래에도 있지만 거기까지 눈이 가지 않습니다.
                    안내를 실수로 닫아도 모든 화면 같은 자리에서 다시 열 수 있습니다. */}
                {/*  ⚠ 0129 — 시계가 들어오면서 이 줄이 968px 를 넘었고, 그러자
                     「화면 색」 단추가 70px 로 **찌그러져 세 줄**이 됐습니다.
                     줄이 모자라면 단추를 짜부라뜨리는 대신 **접히게** 둡니다
                     (shrink-0 + flex-wrap). 글자 크기를 「크게」로 쓰시는 분에게도
                     같은 이유로 안전합니다. */}
              <div className={`mx-auto flex w-full flex-wrap items-center justify-end gap-1.5 py-2 ${WIDTH_CLASS[contentWidth]}`}>
                {/*  화면 색 바꾸기 (0081) — 대표님 요청으로 **오른쪽 위**에 둡니다.
                     설정 화면에도 같은 것이 있지만, 색은 보면서 고르는 것이라
                     설정까지 들어갔다 나오게 하면 고르는 맛이 없습니다.
                     새 줄을 만들지 않고 이미 있던 오른쪽 위 줄에 얹었습니다 —
                     배치를 바꾸지 않는 것이 이번 작업의 전제입니다. */}
                {/*  ── 오늘 날짜 · 지금 시각 (0129) ────────────────────────────
                     대표님: 「시간을 화면 색 옆으로, 간격 좀 띄워서」.
                     처음에는 왼쪽 계정 카드 아래에 있었고(끝까지 내려야 보임),
                     그다음 사이드바 맨 위였는데 자리가 마음에 안 드셨습니다.
                     이제 **오른쪽 위 도구 줄**의 맨 앞입니다.

                     ⚠ 단추가 아닙니다. 옆의 흰 알약들과 같은 모양으로 두면
                       눌러 보게 됩니다 — 알약 없이 글자만, 대신 굵게.
                     ⚠ `me-3` 은 「간격 좀 띄워서」입니다 (줄 기본 간격 8px + 12px). */}
                {/*  ── 신용보증기금 방문용 영상 (0130) — 예전에는 시계 왼쪽에 있었습니다.
                     대표님: 「이제 필요 없어졌으니 내려 줘(기능은 그대로)」 → 왼쪽 사이드바 맨 아래로. */}
                {/*  화면 폭 3단계 (0141) — 줄 맨 앞. 시계와 「화면 색」은 붙어 있어야 합니다(check_clock). */}
                <WidthToggle value={contentWidth} onChange={setContentWidth} />
                <p
                  data-clock-top
                  className="me-3 shrink-0 whitespace-nowrap text-[0.899rem] font-extrabold text-navy-700"
                >
                  {/*  ⚠ 날짜는 짧게 씁니다 — 이 줄에는 이미 단추가 넷입니다.
                       `full`(312px)·보통(226px)을 넣으면 968px 짜리 줄이 넘쳐
                       단추가 찌그러집니다. 시·분·초는 그대로 둡니다. */}
                  <LiveClock compact />
                </p>
                {!helpInSettings && (
                  <>
                    <ThemeButton className="flex shrink-0 min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-white px-3 py-1.5 text-[0.899rem] font-bold text-navy-600 ring-1 ring-navy-100 transition hover:text-navy-900" />
                    {/* 「만든 이유」는 회사 이야기입니다 — 현장 담당자에게는 띄우지 않습니다 */}
                    {showWhy && (
                      <TourWhyButton className="flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-white px-3 py-1.5 text-[0.899rem] font-bold text-navy-500 ring-1 ring-navy-100 transition hover:text-navy-800" />
                    )}
                    <TourButton
                      className="flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-white px-3 py-1.5 text-[0.899rem] font-bold text-navy-600 ring-1 ring-navy-100 transition hover:text-navy-900"
                      label="사용 방법"
                    />
                  </>
                )}
                {/*  사용 후기 남기기 — 왼쪽 목차에서 여기로 올렸습니다.
                     같은 입구를 두 군데 두면 어느 쪽이 진짜인지 헷갈립니다.
                     **여기만 살짝 색을 넣습니다** — 옆의 둘은 읽는 곳이고
                     이건 보내는 곳이라, 눈에 걸려야 실제로 눌립니다. */}
                <span data-hide-presenting className="contents">
                <FeedbackButton
                  className="flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-teal-50 px-3 py-1.5 text-[0.899rem] font-bold text-teal-700 ring-1 ring-teal-200 transition hover:bg-teal-100 hover:text-teal-800"
                  /*  PC 는 한 줄짜리 알약이라 아래에 붙일 자리가 없습니다 —
                      괄호를 뒤에 답니다. 폰 더보기·도움말에서는 제목 아래 줄에
                      들어갑니다(그쪽은 두 줄짜리 칸이라). */
                  label="사용 후기 남기기 (개발자에게 요청)"
                />
                </span>
                {/*  병원이 보는 화면 (AX 디자인 2차 · 대표님 「전부 다」) — 줄 **맨 끝**입니다.
                     ⚠ 맨 앞에 뒀더니 줄이 밀려 「방문용 영상 ↔ 시계 ↔ 화면 색」이 서로 다른 줄로
                       갈라졌습니다(check_clock · check_visit_video). 접히는 줄은 앞에서부터 채워지므로
                       맨 끝에 두면 앞의 자리는 하나도 안 바뀝니다. */}
                <PortalSwitchButton compact label="병원이 보는 화면" />
              </div>
            </div>
            <div className="px-4 pt-4 lg:px-[32px] lg:pt-6 2xl:px-[48px]">
            <div className={`mx-auto w-full ${WIDTH_CLASS[contentWidth]}`}>
            {/*
              안쪽 한 겹 — 본문만 터진 경우입니다. 이때 왼쪽 메뉴는 살아 있어
              다른 화면으로 그냥 넘어갈 수 있습니다. 예전에는 메뉴까지 사라져
              흰 화면만 남았습니다.

              `key={pathname}` 이 중요합니다 — React 의 오류 경계는 스스로
              풀리지 않아서, 키를 안 바꾸면 다른 화면으로 가도 계속 오류
              화면이 붙어 있습니다.
            */}
            {!minimal && <TopCrumb />}
            <PhoneBandSlot value={bandSlot}>
            <ErrorBoundary key={pathname} scope="page">
              <PageMotion key={pathname}>
                <Outlet />
              </PageMotion>
            </ErrorBoundary>
            </PhoneBandSlot>
            </div>
            </div>
          </main>
        </div>
      </div>

      {/* 모바일 하단 탭 + 더보기 바텀시트 */}
      {!minimal && (
      <BottomNav
        onMore={() => setMoreOpen(true)}
        moreOpen={moreOpen}
        onCloseSheets={() => {
          setMoreOpen(false)
          setHelpOpen(false)
        }}
      />
      )}
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
      {pcView && !minimal && <PcViewBar onExit={() => setPcView(false)} />}
    </div>
  )
}
