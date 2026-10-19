import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Smartphone, ChevronDown, ChevronRight, ExternalLink, Lock, LogOut, Globe, PlayCircle, type LucideIcon } from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { FontSizeControl } from './FontSizeControl'
import { PortalSwitchButton } from './PortalSwitch'
import { InfoBanner } from './InfoBanner'
import { IconChip } from './ui'
import { TourButton } from './TourEntry'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { canAccess, canSeeShowcase } from '../lib/access'
import { NAV_GROUPS, hiddenInMenu, type NavItem } from '../lib/nav'
import { PlannedPreview } from './PlannedPreview'
import { canSendDevRequest } from '../lib/devRequests'
import { icon3d } from '../lib/icons3d'
import { COMPANY, SYSTEM_TAGLINE, SYSTEM_WORDMARK, SYSTEM_WORDMARK_TAIL } from '../lib/brand'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 메뉴 — 폰에서는 이곳이 목차 전부입니다
//
//  AX 5차 — 대표님: 「더보기 눌렀을 때 예전 것도 섞여 있고 잘 안 쓰는 것도 있어. 다 정리해 줘」.
//   차례: 내 계정(로그아웃) → 병원이 보는 화면 → (글자 크기) → 목차 다섯 묶음 → 안내 · 바로가기 한 목록.
//   목차는 **색 아이콘 칸 4개씩** — PC 사이드바와 같은 묶음 · 같은 색(같은 묶음 = 같은 색, 톤만 차이).
//   뺀 것: 「시연용 핵심 요약」(신보 발표용) · 「기술개발 현황」 펼침 · 두 번 나오던 「이 시스템을 만든 이유」
//         (AX·심사 「만든 이유」 하나만 남김). 계획 중인 기능은 맨 아래 한 줄로 접었습니다.
//
//  목차는 PC 사이드바와 같은 것을 씁니다 (lib/nav.ts) — 순서도 분류도 같습니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 *  묶음 색 (밝은 바탕용) — 사이드바 GROUP_SHADES 와 같은 색상, 줄 순서대로 옅은 톤 → 짙은 톤.
 *   현장·운영 = 하늘 · 병원 서비스 = 보라 · 정산·매출 = 초록 · AX·심사 = 주황 · 관리 = 분홍
 */
const GROUP_TILE: Record<string, { dot: string; tiles: string[] }> = {
  ops: { dot: 'bg-sky-500', tiles: ['bg-sky-50 text-sky-600', 'bg-sky-100 text-sky-700', 'bg-sky-100 text-sky-800', 'bg-sky-200 text-sky-800'] },
  service: { dot: 'bg-violet-500', tiles: ['bg-violet-50 text-violet-600', 'bg-violet-100 text-violet-700', 'bg-violet-100 text-violet-800', 'bg-violet-200 text-violet-800'] },
  money: {
    dot: 'bg-emerald-500',
    tiles: ['bg-emerald-50 text-emerald-600', 'bg-emerald-100 text-emerald-700', 'bg-emerald-100 text-emerald-800', 'bg-emerald-200 text-emerald-700', 'bg-emerald-200 text-emerald-800', 'bg-emerald-300 text-emerald-900'],
  },
  ax: {
    dot: 'bg-orange-500',
    tiles: ['bg-orange-50 text-orange-600', 'bg-orange-100 text-orange-700', 'bg-orange-100 text-orange-800', 'bg-orange-200 text-orange-700', 'bg-orange-200 text-orange-800'],
  },
  admin: {
    dot: 'bg-rose-500',
    tiles: ['bg-rose-50 text-rose-600', 'bg-rose-100 text-rose-700', 'bg-rose-100 text-rose-800', 'bg-rose-200 text-rose-700', 'bg-rose-200 text-rose-800', 'bg-rose-300 text-rose-900'],
  },
}
const FALLBACK_TILE = { dot: 'bg-navy-400', tiles: ['bg-navy-50 text-navy-600'] }

/** 입체 아이콘 한 장 — 이름이 옆에 있으니 장식(alt="") */
function Img3d({ src, className }: { src: string; className: string }) {
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

/** 목차 한 묶음 — 흰 카드 한 장에 아이콘 칸 4개씩 (배민 「카테고리」 칸처럼).
 *  대표님이 주신 입체 아이콘을 씁니다(lib/icons3d). 그림이 없는 주소만 예전 색 칸 + 선 아이콘. */
function NavGrid({ groupId, title, items, onGo }: { groupId: string; title: string; items: NavItem[]; onGo: (to: string) => void }) {
  const tone = GROUP_TILE[groupId] ?? FALLBACK_TILE
  return (
    <section data-more-section={`more-${groupId}`} className="card px-3 pb-4 pt-3.5">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <h3 className="min-w-0 flex-1 break-keep text-[1.02rem] font-extrabold text-navy-900">{title}</h3>
        <span className="shrink-0 text-[0.86rem] font-bold text-navy-500">{items.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-x-1 gap-y-3.5">
        {items.map((item, i) => {
          const Icon = item.icon
          const img = icon3d(item.to)
          return (
            <button
              key={item.to}
              type="button"
              data-more-item={item.to}
              onClick={() => onGo(item.to)}
              title={item.desc}
              className="flex min-w-0 flex-col items-center gap-1 rounded-2xl py-0.5 transition active:scale-95 active:bg-navy-50"
            >
              {img ? (
                <span data-more-tile className="flex h-[3rem] w-[3rem] items-center justify-center">
                  <Img3d src={img} className="h-[3rem] w-[3rem] drop-shadow-[0_3px_4px_rgba(15,26,46,0.12)]" />
                </span>
              ) : (
                <span data-more-tile className={`flex h-[2.7rem] w-[2.7rem] items-center justify-center rounded-[15px] ${tone.tiles[i % tone.tiles.length]}`}>
                  <Icon size={21} strokeWidth={2.2} aria-hidden="true" />
                </span>
              )}
              <span className="w-full break-keep text-center text-[0.76rem] font-bold leading-tight text-navy-700">{item.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** 아래 한 목록의 한 줄 */
function Row({
  icon: Icon,
  img,
  label,
  note,
  onClick,
  href,
  children,
  hook,
}: {
  icon: LucideIcon
  /** 입체 아이콘 (있으면 선 아이콘 대신) */
  img?: string
  label: string
  note?: string
  onClick?: () => void
  href?: string
  children?: ReactNode
  hook?: Record<string, string>
}) {
  const inner = (
    <>
      {img ? <Img3d src={img} className="h-[1.9rem] w-[1.9rem]" /> : <Icon size={18} strokeWidth={2.3} className="shrink-0 text-navy-500" aria-hidden="true" />}
      <span className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-900">
        {label}
        {note && <span className="ms-1 text-[0.84rem] font-semibold text-navy-500">{note}</span>}
      </span>
      {children ?? <ChevronRight size={17} className="shrink-0 text-navy-400" aria-hidden="true" />}
    </>
  )
  const cls = 'flex min-h-[3.1rem] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-navy-50'
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...hook}>{inner}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls} {...hook}>{inner}</button>
  )
}

export function MoreMenu({
  variant = 'mobile',
  onNavigate,
  /** 폰에서만 넘어옵니다 — PC 화면 보기 모드로 전환 */
  onPcView,
  /**
   * 사용 후기 남기기.
   *
   *  이 시트 안에서 모달을 직접 띄우면 안 됩니다. 버튼을 누르면 시트가 닫히고,
   *  닫히면 이 컴포넌트가 통째로 언마운트되면서 모달도 함께 사라집니다.
   *  그래서 여는 일은 Layout 이 합니다.
   */
  onDevRequest,
}: {
  variant?: 'mobile' | 'desktop'
  onNavigate?: () => void
  onPcView?: () => void
  onDevRequest?: () => void
}) {
  const navigate = useNavigate()
  const { role, configured, profile, signOut } = useAuth()
  //  계획 중 기능 한 줄 — 눌러야 펼쳐집니다 (0095 미리보기는 그대로)
  const [plannedOpen, setPlannedOpen] = useState(false)
  const [plannedPreview, setPlannedPreview] = useState<string | null>(null)
  //  현장 담당자에게는 미수금·통계·배차가 열리지 않습니다 — PC 사이드바(useVisibleNav)와 같은 규칙.
  const visible = (items: NavItem[]) =>
    configured ? items.filter((i) => canAccess(role, i.to) && !hiddenInMenu(role, i.to)) : items
  //  첫 묶음(오늘 업무)은 아래 고정 탭이 맡고 있어 뺍니다. 표(badge)가 붙은 것만 맨 위 한 줄로.
  const pinned = visible(NAV_GROUPS.find((g) => g.id === 'today')?.items.filter((i) => i.badge) ?? [])
  const groups = NAV_GROUPS.filter((g) => g.id !== 'today')
    .map((g) => ({ ...g, items: visible(g.items) }))
    .filter((g) => g.items.length > 0)
  const showcase = canSeeShowcase(role)
  const showRoadmap = canAccess(role, '/roadmap')
  //  신용보증기금 방문용 영상 (0130) — 폰 머리띠에서 여기로 내렸습니다(대표님: 「이제 필요 없어졌으니
  //  지우지 말고 더보기에」). 규칙은 그대로 — 대표·이사님 계정만, 시연 모드에서는 안 띄웁니다.
  //  PC 는 위쪽 도구 줄 단추가 그대로 있어 폰 시트에만 둡니다.
  const showVisitVideo = variant === 'mobile' && configured && canAccess(role, '/visit-video')
  //  계획 중 기능 — 묶음에 붙어 있던 것을 한 줄로 모읍니다(활용 계획을 볼 수 있는 계정만)
  const planned = showRoadmap ? groups.flatMap((g) => g.planned ?? []) : []
  function go(to: string) {
    onNavigate?.()
    navigate(to)
  }

  return (
    <div className="space-y-3">
      {/*  내 계정 — 맨 위. 폰에는 사이드바가 없어 로그아웃할 곳이 여기뿐입니다
           (공용 폰을 넘겨줄 때 앞사람 계정이 남지 않게). */}
      {profile && (
        <section data-more-account className="card flex items-center gap-3 p-3.5">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-teal-600 text-[1.1rem] font-black text-white">
            {profile.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[1.05rem] font-extrabold text-navy-900">{profile.name}</p>
            <p className="t-muted truncate">
              {role ? `${ROLE_LABEL[role]} · ` : ''}
              {profile.email}
            </p>
          </div>
          <button
            onClick={() => {
              onNavigate?.()
              void signOut()
              navigate('/login', { replace: true })
            }}
            aria-label="로그아웃"
            className="flex min-h-[2.75rem] shrink-0 items-center gap-1 rounded-full bg-navy-50 px-3 text-[0.9rem] font-bold text-navy-600 transition active:bg-navy-100"
          >
            <LogOut size={15} strokeWidth={2.4} /> 로그아웃
          </button>
        </section>
      )}

      {/*  병원이 보는 화면 — 열리는 사람에게만 보입니다(현장 담당자에게는 안 나옵니다). */}
      <PortalSwitchButton compact className="w-full" label="병원이 보는 화면" />

      {pinned.length > 0 && (
        <section data-more-section="more-today" className="space-y-2">
          {pinned.map((i) => (
            <button
              key={i.to}
              type="button"
              data-more-item={i.to}
              onClick={() => go(i.to)}
              className="card flex w-full items-center gap-3 p-3.5 text-left ring-1 ring-violet-200"
            >
              <IconChip icon={i.icon} tone="teal" />
              <span className="min-w-0 flex-1 break-keep font-bold text-navy-900">{i.label}</span>
              {i.badge && <span data-nav-badge className="pill bg-violet-50 text-violet-700">{i.badge}</span>}
            </button>
          ))}
        </section>
      )}

      {/*  글자 크기 (0075) — 설정 화면에 못 들어가는 분(현장 담당자 등)에게만, 위쪽에.
           눈이 침침하신 분에게는 매일 쓰는 것입니다. 설정을 여는 계정은 「관리 › 설정」에 있습니다. */}
      {!canAccess(role, '/settings') && (
        <section data-more-font className="card p-4">
          <h3 className="mb-1 text-[1.02rem] font-extrabold text-navy-900">글자 크기</h3>
          <p className="mb-2.5 text-[0.95rem] text-navy-500">화면 글자가 작으면 크기를 올리세요</p>
          <FontSizeControl />
        </section>
      )}

      {/*  목차 — PC 사이드바와 같은 묶음 · 같은 순서 · 같은 색.
           ⚠ 묶음 안이 하나뿐이면 그 화면 이름을 제목으로 씁니다(없는 성과를 제목이 약속하지 않게). */}
      {groups.map((g) => (
        <NavGrid key={g.id} groupId={g.id} title={g.items.length === 1 ? g.items[0].label : g.title} items={g.items} onGo={go} />
      ))}

      {/*  안내 · 바로가기 — 흩어져 있던 것을 한 목록으로 (업무가 아니라 시스템 · 바깥으로 가는 길) */}
      <section data-more-help className="card divide-y divide-navy-50 overflow-hidden">
        {/*  사용 방법 — 현장 담당자에게는 없습니다(0078: 위쪽 「도움말」 하나로). */}
        {role !== 'field' && (
          //  ⚠ TourButton 이 ▶ 아이콘을 스스로 그립니다 — 여기서 하나 더 그리지 않습니다
          <TourButton
            className="flex min-h-[3.1rem] w-full items-center gap-3 px-4 py-2.5 text-left text-navy-500 transition active:bg-navy-50"
            label=""
            icon={<Img3d src={icon3d('tour') ?? ''} className="h-[1.9rem] w-[1.9rem]" />}
          >
            <span className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-900">사용 방법</span>
            <ChevronRight size={17} className="shrink-0 text-navy-400" aria-hidden="true" />
          </TourButton>
        )}
        {/*  사용 후기 남기기 — 폰에서 이 자리가 유일한 통로입니다(현장 담당자는 더보기밖에 없습니다). */}
        {onDevRequest && canSendDevRequest(role) && (
          <button
            type="button"
            data-dev-request-more
            onClick={() => {
              onNavigate?.()
              onDevRequest()
            }}
            className="flex min-h-[3.1rem] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-navy-50"
          >
            <Img3d src={icon3d('feedback') ?? ''} className="h-[1.9rem] w-[1.9rem]" />
            <span className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-900">
              사용 후기 남기기 <span className="text-[0.84rem] font-semibold text-navy-500">(개발자에게 요청)</span>
            </span>
            <ChevronRight size={17} className="shrink-0 text-navy-400" aria-hidden="true" />
          </button>
        )}
        <Row icon={Globe} img={icon3d('/company')} label="회사 홈페이지" onClick={() => go('/company')} />
        <Row icon={ExternalLink} img={icon3d('allbaro')} label="올바로 시스템" note="폐기물 적법처리" href={ALLBARO_URL} />
        {variant === 'desktop' && <Row icon={Smartphone} label="모바일 프레임으로 보기" onClick={() => go('/mobile-preview')} />}
        {onPcView && (
          <button
            type="button"
            data-more-showcase
            onClick={onPcView}
            className="flex min-h-[3.1rem] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-navy-50"
          >
            <Img3d src={icon3d('pcview') ?? ''} className="h-[1.9rem] w-[1.9rem]" />
            <span data-pc-view-open className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-900">
              PC 화면으로 보기
            </span>
            <ChevronRight size={17} className="shrink-0 text-navy-400" aria-hidden="true" />
          </button>
        )}
        {showVisitVideo && (
          <Row icon={PlayCircle} img={icon3d('/visit-video')} label="신용보증기금 방문용 영상" onClick={() => go('/visit-video')} hook={{ 'data-visit-video-btn': '' }} />
        )}
        {/*  계획 중 기능 — **단추가 아니라 미리보기**입니다(눌리는데 아무 일도 안 일어나는 것이 제일 나쁩니다).
             한 줄로 접어 두고, 펼치면 이름마다 「계획 중 · 지금은 이렇게」가 열립니다(0095). */}
        {planned.length > 0 && (
          <div>
            <button
              type="button"
              data-more-toggle="more-planned"
              aria-expanded={plannedOpen}
              onClick={() => setPlannedOpen((v) => !v)}
              className="flex min-h-[3.1rem] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-navy-50"
            >
              <Img3d src={icon3d('planned') ?? ''} className="h-[1.9rem] w-[1.9rem]" />
              <span className="min-w-0 flex-1 break-keep text-[1rem] font-bold text-navy-600">추가 개발 예정 {planned.length}가지</span>
              <span className="pill shrink-0 bg-navy-50 text-navy-600">계획중</span>
              <ChevronDown size={17} className={`shrink-0 text-navy-400 transition-transform ${plannedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {plannedOpen && (
              <div className="px-4 pb-3.5">
                <div className="flex flex-wrap gap-1.5">
                  {planned.map((label) => (
                    <button
                      key={label}
                      data-more-planned-item={label}
                      onClick={() => setPlannedPreview(label)}
                      className="inline-flex min-h-[2.75rem] items-center gap-1 rounded-lg bg-navy-50 px-3 py-1.5 text-[0.95rem] font-semibold text-navy-600 transition active:scale-[0.98]"
                    >
                      <Lock size={12} /> {label}
                    </button>
                  ))}
                </div>
                <p className="t-muted mt-2 break-keep">
                  아직 개발 전입니다. 누르면 무엇을 검토 중인지 나오고, 단계별 계획은 「관리 › 활용 계획」에 있습니다.
                </p>
              </div>
            )}
            <PlannedPreview label={plannedPreview} onClose={() => setPlannedPreview(null)} />
          </div>
        )}
      </section>

      {showcase && <InfoBanner />}

      {/*  이름표 — PC 사이드바와 **같은 문구**입니다(lib/brand.ts). */}
      <div data-brand-ax-mobile className="pb-1 pt-1 text-center">
        <p className="text-[0.92rem] font-semibold text-navy-500">{SYSTEM_TAGLINE}</p>
        <p className="mt-1 select-none text-[0.86rem] font-black uppercase tracking-[0.2em] text-amber-700">
          {SYSTEM_WORDMARK}
          <span className="text-navy-500"> · </span>
          {SYSTEM_WORDMARK_TAIL}
        </p>
        <p className="mt-1 text-[0.86rem] text-navy-500">{COMPANY}</p>
      </div>
    </div>
  )
}
