import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Smartphone, Monitor, ChevronDown, Sparkles, Globe, ExternalLink, Lock, LogOut, MessageSquarePlus, BookOpen, Lightbulb } from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
import { FontSizeControl } from './FontSizeControl'
import { InfoBanner } from './InfoBanner'
import { RnDCard } from './RnDCard'
import { IconChip } from './ui'
import { TourButton, TourWhyButton } from './TourEntry'
import { Tappable } from './motion'
import { useAuth } from '../context/AuthContext'
import { canAccess, canSeeShowcase } from '../lib/access'
import { SERVICE_NAV, TOOL_NAV, ADMIN_NAV, PLANNED, type NavItem } from '../lib/nav'
import type { Tone } from '../lib/tone'
import { canSendDevRequest } from '../lib/devRequests'
import { COMPANY, SYSTEM_TAGLINE, SYSTEM_WORDMARK, SYSTEM_WORDMARK_TAIL } from '../lib/brand'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 메뉴 — 폰에서는 이곳이 목차 전부입니다
//
//  차례
//   도움말 (사용 방법 · 만든 이유) → 개발자에게 요청하기 → PC 화면으로 보기
//   → 시연용 핵심 요약 → 병원 서비스 · 성과 → 운영 도구 · 추가 고도화 예정
//   → 추가 개발 예정 → 관리 → 바로가기 → 기술개발 현황 → 계정
//
//  목차는 PC 사이드바와 같은 것을 씁니다 (lib/nav.ts).
//
//   예전에는 폰의 「더보기」가 자기 목록을 따로 들고 있었습니다. 순서도
//   분류도 PC 와 달라서, PC 에서 익힌 자리가 폰에서는 다른 곳에 있었고
//   무엇이 어느 묶음인지 알 수 없었습니다. 이제 두 화면이 같은 목록을
//   같은 순서로 읽습니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 목차 한 묶음 — 두 칸 격자.
 *
 *  한 줄에 하나씩 놓으면 열 개짜리 묶음이 화면 세 개 길이가 됩니다. 폰에서
 *  아래로 계속 밀어야 하고, 무엇이 있는지 한눈에 안 들어옵니다. 두 칸으로
 *  놓되 설명 한 줄은 그대로 둡니다 — 이름만 있으면 무엇을 하는 곳인지
 *  모르는 메뉴가 있습니다(거래처 점검·통장 대사).
 */
//  목차의 색은 아홉 가지인데 아이콘 타일은 다섯 가지만 씁니다.
//  없는 색은 가장 가까운 것으로 보냅니다.
const CHIP: Record<string, 'navy' | 'teal' | 'rose' | 'amber' | 'emerald'> = {
  blue: 'navy', sky: 'teal', violet: 'rose', orange: 'amber',
}
const chipTone = (t: Tone) => CHIP[t] ?? (t as 'navy' | 'teal' | 'rose' | 'amber' | 'emerald')

function NavSection({
  title,
  items,
  onGo,
  hook,
  collapsible = false,
  defaultOpen = true,
  planned = [],
}: {
  title: string
  items: NavItem[]
  onGo: (to: string) => void
  hook: string
  /** 접었다 폈다 할 수 있는가 (운영 도구처럼 길고 매일 안 쓰는 묶음) */
  collapsible?: boolean
  defaultOpen?: boolean
  /** 아직 못 쓰는 것 — 자물쇠를 달고 **누를 수 없게** 둡니다 */
  planned?: string[]
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shown = !collapsible || open
  return (
    <section data-more-section={hook}>
      {collapsible ? (
        //  운영 도구는 열 개짜리라 펼치면 화면 두 개를 씁니다. 접어 두면
        //  그 아래 「추가 개발 예정 · 관리」가 첫 화면 안에 들어옵니다.
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-more-toggle={hook}
          /*  묶음을 여닫는 자리입니다. 30px 이라 폰에서 자꾸 빗나갔습니다. */
          className="mb-1 flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl px-2 text-left text-[1.08rem] font-semibold text-navy-500 transition hover:bg-navy-50"
        >
          <span className="min-w-0 flex-1 break-keep">{title}</span>
          {!open && (
            <span className="shrink-0 rounded-md bg-navy-100 px-1.5 py-0.5 text-[0.95rem] font-bold text-navy-500">
              {items.length + planned.length}
            </span>
          )}
          <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">{title}</h3>
      )}
      <div className={`grid grid-cols-2 gap-2.5 ${shown ? '' : 'hidden'}`}>
        {items.map((item) => (
          <Tappable
            key={item.to}
            as="div"
            onClick={() => onGo(item.to)}
            className="card flex cursor-pointer flex-col gap-2 p-3.5"
          >
            <IconChip icon={item.icon} tone={chipTone(item.tone)} />
            {/*  Tappable 은 정해진 속성만 넘깁니다 — 표시는 안쪽에 답니다 */}
            <span data-more-item={item.to} className="min-w-0">
              <span className="block break-keep font-bold leading-snug text-navy-900">{item.label}</span>
              {item.desc && (
                <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                  {item.desc}
                </span>
              )}
            </span>
          </Tappable>
        ))}
      </div>
      {/*  아직 못 쓰는 것. **단추가 아니라 글자**입니다 — 눌리는데 아무 일도
           안 일어나는 것이 제일 나쁩니다. */}
      {planned.length > 0 && shown && (
        <>
          <p className="mb-1.5 mt-3 px-1 text-[0.98rem] font-bold text-navy-400">추가 개발 예정</p>
          <div className="flex flex-wrap gap-1.5">
            {planned.map((label) => (
              <span
                key={label}
                data-more-planned-item={label}
                aria-disabled="true"
                className="inline-flex cursor-default select-none items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-[0.98rem] font-semibold text-navy-400"
              >
                <Lock size={12} /> {label}
              </span>
            ))}
          </div>
          <p className="t-muted mt-2 break-keep px-1">
            위 기능은 아직 개발 전이라 눌러도 열리지 않습니다. 단계별 계획은 「활용 계획」에 있습니다.
          </p>
        </>
      )}
    </section>
  )
}

export function MoreMenu({
  variant = 'mobile',
  onNavigate,
  /** 폰에서만 넘어옵니다 — PC 화면 보기 모드로 전환 */
  onPcView,
  /**
   * 개발자에게 요청하기.
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
  const [rndOpen, setRndOpen] = useState(false)
  //  현장 담당자에게는 미수금·통계·배차가 열리지 않습니다. 사이드바에서는
  //  이미 숨기고 있었는데 폰의 더보기에는 그대로 남아 있어서, 눌렀다가
  //  튕기는 메뉴가 보였습니다. 같은 규칙(canAccess)으로 맞춥니다.
  //  PC 사이드바(Layout.tsx 의 useVisibleNav)와 완전히 같은 규칙입니다.
  const visible = (items: NavItem[]) =>
    configured ? items.filter((i) => canAccess(role, i.to)) : items
  const serviceNav = visible(SERVICE_NAV)
  const toolNav = visible(TOOL_NAV)
  //  관리는 사이드바와 같이 관리자에게만 (시연 모드에서는 그대로 보입니다)
  const adminNav = !configured || role === 'admin' ? ADMIN_NAV : []
  //  회사 이야기·시연 자료 묶음. PC 사이드바에서는 이미 내렸는데 폰의
  //  「더보기」에는 그대로 남아 있었습니다 — 같은 규칙으로 맞춥니다.
  const showcase = canSeeShowcase(role)
  const showWhy = canAccess(role, '/why')
  const showDemo = canAccess(role, '/demo')
  const showRoadmap = canAccess(role, '/roadmap')
  function go(to: string) {
    onNavigate?.()
    navigate(to)
  }

  return (
    <div className="space-y-5">
      {/* 도움말 — 두 갈래를 맨 위에 둡니다.
          아래로 내려두면 폰에서는 있는 줄도 모릅니다.
          네 가지 설명 화면의 역할이 겹치지 않게 한 줄로 구분해 둡니다.
            사용 방법  어떻게 쓰는가        만든 이유  왜 만들었고 어디로 가는가
            AX 성과    얼마나 좋아졌는가    시연 요약  발표용 핵심 숫자 */}
      {/*  안내 · 요청 — 세 가지를 한 묶음으로.
           예전에는 「도움말」과 「요청」이 따로 있었는데, 셋 다 **업무가
           아니라 시스템에 대해 묻는 자리**라 묶음이 갈릴 이유가 없었습니다.
           두 칸 격자라 세 개가 한 줄 반이면 끝납니다. */}
      <section data-more-help>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">안내 · 요청</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {/*  ── 현장 담당자에게는 이 칸이 **아예 없습니다** (0078) ──────────
               대표님: 「모바일 우측 상단 도움말이 정상 진입점으로 잘 작동하므로,
               더보기의 "사용 방법" 또는 "오른쪽 위 도움말에서 여세요" 같은
               중복 안내 카드는 아예 제거해줘.」

               0077 에서는 없애는 대신 「오른쪽 위에서 여세요」를 적어 뒀습니다.
               그런데 그것도 결국 **도움말 이야기가 두 군데**라는 뜻입니다.
               찾을 곳이 하나면 안내문도 필요 없습니다 — 지웁니다.

               ⚠ 사무실·관리자는 그대로 둡니다. 그쪽은 폰 위쪽 「도움말」이
                 아니라 PC 오른쪽 위에서 여는 다른 흐름입니다. */}
          {role !== 'field' && (
            <TourButton className="card flex cursor-pointer flex-col gap-2 p-3.5 text-left" label="">
              <IconChip icon={BookOpen} tone="teal" />
              <span className="min-w-0">
                <span className="block break-keep font-bold text-navy-900">사용 방법</span>
                <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                  어떻게 쓰는지 안내합니다
                </span>
              </span>
            </TourButton>
          )}
          {showWhy && (
            <TourWhyButton className="card flex cursor-pointer flex-col gap-2 p-3.5 text-left" label="">
              <IconChip icon={Lightbulb} tone="amber" />
              <span className="min-w-0">
                <span className="block break-keep font-bold text-navy-900">이 시스템을 만든 이유</span>
                <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                  AX 전환 · 정책자금 · 개발 방향
                </span>
              </span>
            </TourWhyButton>
          )}
          {/*  개발자에게 요청하기 — 폰에서 이 자리가 유일한 통로입니다.
               현장 담당자는 사이드바가 없어 더보기밖에 열 곳이 없습니다(0022). */}
          {onDevRequest && canSendDevRequest(role) && (
            <Tappable
              as="div"
              onClick={() => {
                onNavigate?.()
                onDevRequest()
              }}
              className="card flex cursor-pointer flex-col gap-2 p-3.5"
            >
              <IconChip icon={MessageSquarePlus} tone="rose" />
              {/*  Tappable 은 정해진 속성만 넘깁니다 — 표시는 안쪽에 답니다
                  (목차 칸과 같은 이유). */}
              <span data-dev-request-more className="min-w-0">
                <span className="block break-keep font-bold text-navy-900">개발자에게 요청하기</span>
                <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                  불편한 것·실제와 다른 것
                </span>
              </span>
            </Tappable>
          )}
        </div>
      </section>

      {/*
        ── 글자 크기를 위로 (0075) ────────────────────────────────────────
        대표님 요청: 「현장직원이 매일 쓰는 기능 우선, 드물게 쓰는 기능은
        아래로」. 눈이 침침하신 분에게 글자 크기는 **매일 쓰는 것**인데
        예전에는 회사 홈페이지·올바로 링크보다 아래에 있어, 스크롤을 네 번
        내려야 나왔습니다. 안내 바로 다음으로 올립니다.
      */}
      {/*
        글자 크기.

         글자 크기를 바꾸는 곳이 설정 화면 한 군데뿐인데 그 화면이 관리자
         전용이라, 정작 폰으로만 일하는 현장 담당자는 글자를 키울 방법이
         아예 없었습니다. 설정에 못 들어가는 분에게는 같은 조절기를 여기
         그대로 놓아 둡니다. (설정에 들어갈 수 있으면 위 「관리」에 있습니다)
      */}
      {!canAccess(role, '/settings') && (
        <section>
          <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">글자 크기</h3>
          <div className="card p-4">
            <p className="mb-2.5 text-[0.98rem] text-navy-400">화면 글자가 작으면 크기를 올리세요</p>
            <FontSizeControl />
          </div>
        </section>
      )}


      {/*
        여기부터가 목차입니다 — PC 사이드바와 **같은 순서, 같은 분류**.

         병원 서비스 · 성과 → 운영 도구 · 추가 고도화 예정 → 추가 개발 예정
         → 관리 → 바로가기.

         핵심 운영(대시보드·오늘 일정·수거 입력·거래처)은 폰 하단 고정
         메뉴가 맡고 있어 여기에 다시 넣지 않습니다. 같은 것을 두 군데
         두면 어느 쪽이 진짜인지 헷갈립니다.

         한 줄에 하나씩 놓으면 목록이 화면 세 개 길이가 됩니다. 두 칸으로
         놓아 한눈에 들어오게 합니다.
      */}
      {/*  ⚠ 0075 — 현장 담당자에게 이 묶음은 「병원 요청」 하나뿐인데 제목이
           「병원 서비스 · 성과」였습니다. 없는 성과를 제목이 약속하면
           기사님은 눌러 보고 없어서 헤맵니다. 들어 있는 만큼만 적습니다. */}
      {serviceNav.length > 0 && (
        <NavSection
          title={serviceNav.length === 1 ? serviceNav[0].label : '병원 서비스 · 성과'}
          items={serviceNav}
          onGo={go}
          hook="more-service"
        />
      )}
      {toolNav.length > 0 && (
        <NavSection
          title="운영 도구"
          items={toolNav}
          onGo={go}
          hook="more-tools"
          collapsible
          defaultOpen={false}
          planned={showRoadmap ? PLANNED : []}
        />
      )}

      {/*  관리 — PC 사이드바와 같이 맨 아래. 관리자에게만 열립니다. */}
      {adminNav.length > 0 && (
        <NavSection title="관리" items={adminNav} onGo={go} hook="more-admin" />
      )}

      {/*  바로가기 — 메뉴가 아니라 바깥으로 나가는 길입니다. 목차 아래에 둡니다. */}
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">바로가기</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <Tappable as="div" onClick={() => go('/company')} className="card flex cursor-pointer flex-col gap-2 p-3.5">
            <IconChip icon={Globe} tone="navy" />
            <span className="min-w-0">
              <span className="block break-keep font-bold text-navy-900">회사 홈페이지</span>
              <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                ㈜비원미래 공식 홈페이지
              </span>
            </span>
          </Tappable>
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex flex-col gap-2 p-3.5 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <IconChip icon={ExternalLink} tone="teal" />
            <span className="min-w-0">
              <span className="block break-keep font-bold text-navy-900">올바로 시스템</span>
              <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                폐기물 적법처리 국가시스템
              </span>
            </span>
          </a>
          {variant === 'desktop' && (
            <Tappable as="div" onClick={() => go('/mobile-preview')} className="card flex cursor-pointer flex-col gap-2 p-3.5">
              <IconChip icon={Smartphone} tone="navy" />
              <span className="min-w-0">
                <span className="block break-keep font-bold text-navy-900">모바일 프레임으로 보기</span>
                <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                  시연용 모바일 미리보기
                </span>
              </span>
            </Tappable>
          )}
        </div>
      </section>

      {/*  발표·확인용 — 매일 쓰는 것이 아니라 **가끔** 여는 것들입니다.
           예전에는 맨 위에 있어서, 목차를 보러 들어온 사람이 매번 이 둘을
           지나쳐 내려가야 했습니다. 성격이 같은 기술개발 현황 옆으로
           내립니다(특허출원번호가 여기 있습니다). */}
      {(onPcView || showDemo) && (
        <section data-more-showcase>
          {/*  ⚠ 0075 — 현장 담당자에게는 이 칸에 「PC 화면으로 보기」 하나만
               있습니다. 그런데 제목이 「발표 · 확인용」이라, 기사님에게는
               **자기와 상관없는 묶음**처럼 읽혔습니다. 들어 있는 것에 맞는
               이름을 답니다. */}
          <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">
            {showDemo ? '발표 · 확인용' : '화면'}
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {showDemo && (
              <Tappable
                as="div"
                onClick={() => go('/demo')}
                className="flex cursor-pointer flex-col gap-2 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-3.5 text-white shadow-lg"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Sparkles size={18} className="text-teal-300" />
                </span>
                <span className="min-w-0">
                  <span className="block break-keep font-bold">시연용 핵심 요약</span>
                  {/*  ⚠ 어두운 바탕입니다 — 여기서는 **밝은** 색이 맞습니다 (0082).
                       밝은 바탕의 흐린 글자를 navy-400 으로 옮길 때 여기까지
                       같이 딸려 와서 3:1 이 됐습니다. */}
                  <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-300">
                    발표용 숫자 — 회사 규모 · 실적
                  </span>
                </span>
              </Tappable>
            )}
            {onPcView && (
              <Tappable as="div" onClick={onPcView} className="card flex cursor-pointer flex-col gap-2 p-3.5">
                <IconChip icon={Monitor} tone="navy" />
                <span className="min-w-0">
                  <span data-pc-view-open className="block break-keep font-bold text-navy-900">
                    PC 화면으로 보기
                  </span>
                  {/*  설명을 줄입니다 — 제목만으로 뜻이 통합니다 (0075) */}
                  {showDemo && (
                    <span className="mt-0.5 block break-keep text-[0.96rem] leading-snug text-navy-400">
                      PC 전체 화면 구성 확인
                    </span>
                  )}
                </span>
              </Tappable>
            )}
          </div>
        </section>
      )}

      {/*  기술개발 현황 — 회사 소개 자료입니다 (현장 담당자 제외).
           407px 짜리라 접어 둡니다. 매일 보는 것이 아니라 발표할 때
           여는 것이고, 바로 위 「발표·확인용」과 성격이 같습니다. */}
      {showcase && (
        <section>
          <button
            type="button"
            onClick={() => setRndOpen((v) => !v)}
            aria-expanded={rndOpen}
            data-more-toggle="more-rnd"
            /*  묶음을 여닫는 자리입니다. 30px 이라 폰에서 자꾸 빗나갔습니다. */
            className="mb-1 flex min-h-[2.75rem] w-full items-center gap-2 rounded-xl px-2 text-left text-[1.08rem] font-semibold text-navy-500 transition hover:bg-navy-50"
          >
            <span className="min-w-0 flex-1 break-keep">기술개발 현황</span>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${rndOpen ? 'rotate-180' : ''}`} />
          </button>
          {rndOpen && <RnDCard />}
        </section>
      )}

      {showcase && <InfoBanner />}

      {/* 계정 — 폰에는 사이드바가 없어 로그아웃할 곳이 여기뿐입니다.
          예전에는 로그아웃 버튼이 PC 전용 사이드바(hidden lg:flex)에만
          있어서, 폰만 쓰는 현장 담당자는 로그아웃할 방법이 아예 없었습니다.
          공용 폰을 넘겨줄 때 앞사람 계정이 그대로 남았습니다. */}
      {profile && (
        <section>
          <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">계정</h3>
          <div className="card p-4">
            <p className="t-body break-keep font-bold text-navy-900">{profile.name}</p>
            <p className="t-muted mt-0.5 break-all">{profile.email}</p>
            <button
              onClick={() => {
                onNavigate?.()
                void signOut()
                navigate('/login', { replace: true })
              }}
              aria-label="로그아웃"
              className="btn-ghost mt-3 w-full justify-center"
            >
              <LogOut size={17} strokeWidth={2.4} /> 로그아웃
            </button>
          </div>
        </section>
      )}

      {/*  이름표 — PC 사이드바와 **같은 문구**입니다(lib/brand.ts).
           폰에는 사이드바가 없어 이 자리가 시스템 이름을 보는 유일한 곳입니다.
           예전에는 여기만 다른 말이 적혀 있었습니다. */}
      <div data-brand-ax-mobile className="pb-1 text-center">
        <p className="text-[0.98rem] font-semibold text-navy-400">{SYSTEM_TAGLINE}</p>
        <p className="mt-1 select-none text-[0.92rem] font-black uppercase tracking-[0.22em] text-amber-700">
          {SYSTEM_WORDMARK}
          <span className="text-navy-400"> · </span>
          {SYSTEM_WORDMARK_TAIL}
        </p>
        {/*  「시연용 MVP」를 뗐습니다 — 실제 운영에 쓰는 지금은 맞지 않고,
            현장에서는 자기가 넣은 기록이 연습용처럼 읽혔습니다. */}
        <p className="mt-1 text-[0.92rem] text-navy-400">{COMPANY}</p>
      </div>
    </div>
  )
}
