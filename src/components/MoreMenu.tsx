import { useNavigate } from 'react-router-dom'
import { Boxes, Wallet, PieChart, Truck, Smartphone, Monitor, ChevronRight, Sparkles, Globe, Workflow, ExternalLink, FileBarChart, History, Lock, LogOut, MessageSquarePlus, SlidersHorizontal, Gauge, Inbox, type LucideIcon } from 'lucide-react'

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
import { canSendDevRequest } from '../lib/devRequests'

// ─────────────────────────────────────────────────────────────────────────────
// 더보기 메뉴 콘텐츠 — 디바이스별 분리
//  · 모바일: 배차·경로 / 자재 관리 / 미수금 관리 / 통계 (사이드바가 없으므로 노출)
//  · 데스크톱: 자재/미수금/통계는 사이드바에 있으므로 숨김, 모바일 미리보기 노출
//  공통: 시연용 핵심 요약 / 설정 바로가기 / 기술개발 / MVP 안내
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_SHORTCUTS: { to: string; label: string; icon: LucideIcon; desc: string }[] = [
  { to: '/requests', label: '병원 요청', icon: Inbox, desc: '병원이 올린 요청 처리·회신' },
  { to: '/reports', label: '운영 리포트', icon: FileBarChart, desc: '병원별 월간 운영 리포트' },
  { to: '/stats', label: '통계', icon: PieChart, desc: '수거량·거래처·차량 실적' },
  { to: '/materials', label: '자재 관리', icon: Boxes, desc: '박스·비닐·바늘통 공급 내역' },
  { to: '/receivables', label: '미수금 관리', icon: Wallet, desc: '청구·입금 현황 및 미수금' },
  { to: '/dispatch', label: '배차·경로', icon: Truck, desc: '차량별 배차·경로 추천' },
  { to: '/history', label: '수거이력', icon: History, desc: '전체 수거 입력 이력·감사기록' },
]

/** 추가 개발 예정 — 아직 실사용 단계가 아닌 확장 기능 */
const PLANNED_FEATURES = [
  'AI 배차·경로 고도화',
  '소모품 주문·결제',
  '배출자 교육 이력 관리',
  '리포트 자동 발송(PDF·메일)',
  '올바로 API 연동',
  '병원 다중 담당자 계정',
  'SaaS 서비스 확장',
]

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
  const { role, profile, signOut } = useAuth()
  //  현장 담당자에게는 미수금·통계·배차가 열리지 않습니다. 사이드바에서는
  //  이미 숨기고 있었는데 폰의 더보기에는 그대로 남아 있어서, 눌렀다가
  //  튕기는 메뉴가 보였습니다. 같은 규칙(canAccess)으로 맞춥니다.
  const shortcuts = MOBILE_SHORTCUTS.filter((s) => canAccess(role, s.to))
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
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">도움말</h3>
        <div className="card divide-y divide-navy-50 overflow-hidden">
          <TourButton className="flex w-full cursor-pointer items-start gap-3 p-4 text-left" label="">
            <span className="min-w-0 flex-1">
              <span className="block break-keep font-bold text-navy-900">사용 방법</span>
              <span className="mt-0.5 block break-keep text-[0.98rem] text-navy-400">
                실제 화면과 기능을 어떻게 쓰는지 안내합니다
              </span>
            </span>
            <ChevronRight size={18} className="mt-1 shrink-0 text-navy-300" />
          </TourButton>
          {showWhy && (
            <TourWhyButton className="flex w-full cursor-pointer items-start gap-3 p-4 text-left" label="">
              <span className="min-w-0 flex-1">
                <span className="block break-keep font-bold text-navy-900">이 시스템을 만든 이유</span>
                <span className="mt-0.5 block break-keep text-[0.98rem] text-navy-400">
                  AX 전환 · 정책자금 · 사업고도화 · 향후 개발 방향
                </span>
              </span>
              <ChevronRight size={18} className="mt-1 shrink-0 text-navy-300" />
            </TourWhyButton>
          )}
        </div>
      </section>

      {/*  개발자에게 요청하기 — 폰에서 이 자리가 유일한 통로입니다.
           현장 담당자는 사이드바가 없어 더보기밖에 열 곳이 없습니다(0022). */}
      {onDevRequest && canSendDevRequest(role) && (
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">요청</h3>
        <div data-dev-request-more className="card overflow-hidden">
          <Tappable
            as="div"
            onClick={() => {
              onNavigate?.()
              onDevRequest()
            }}
            className="flex cursor-pointer items-center gap-3 p-4"
          >
            <IconChip icon={MessageSquarePlus} tone="teal" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">개발자에게 요청하기</p>
              <p className="text-[0.98rem] text-navy-400">불편한 것·실제와 다른 것을 알려 주세요</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
        </div>
        <p className="t-muted mt-1.5 break-keep px-1">
          해당하는 항목을 고르기만 하셔도 됩니다. 대표님이 요청함에서 확인합니다.
        </p>
      </section>
      )}

      {/* PC 화면으로 보기 — 폰에서만. 실제 데스크톱 레이아웃을 그대로 그립니다.
          업무용 기본 모드가 아니라 "PC 에서는 어떻게 보이는지" 확인하는 보기 기능입니다. */}
      {onPcView && (
        <section>
          <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">화면 보기</h3>
          <Tappable as="div" onClick={onPcView} className="card flex cursor-pointer items-center gap-3 p-4">
            <IconChip icon={Monitor} tone="navy" />
            <div className="min-w-0">
              <p data-pc-view-open className="font-bold text-navy-900">PC 화면으로 보기</p>
              <p className="text-[0.98rem] text-navy-400">PC 에서 보이는 전체 화면 구성을 확인합니다</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
        </section>
      )}

      {/* 시연용 핵심 요약 — 발표용 자료라 현장 담당자에게는 내립니다 */}
      {showDemo && (
      <Tappable
        as="div"
        onClick={() => go('/demo')}
        className="flex cursor-pointer items-center gap-3 rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-4 text-white shadow-lg"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          <Sparkles size={20} className="text-teal-300" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">시연용 핵심 요약</p>
          <p className="text-[0.95rem] text-navy-300">발표할 때 쓰는 숫자 — 회사 규모 · 수거 실적 · 기술개발</p>
        </div>
        <ChevronRight size={18} className="ml-auto shrink-0 text-white/60" />
      </Tappable>
      )}

      {/* 활용 계획·업무흐름도 — 대표·실사용 한눈에 보기 */}
      {showRoadmap && (
      <Tappable
        as="div"
        onClick={() => go('/roadmap')}
        className="flex cursor-pointer items-center gap-3 rounded-3xl bg-teal-500 p-4 text-white shadow-lg"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Workflow size={20} className="text-white" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">활용 계획 · 업무흐름도</p>
          <p className="text-[0.95rem] text-teal-100">어떤 기능을 언제 쓰는지 — 화면 단위 도입 순서</p>
        </div>
        <ChevronRight size={18} className="ml-auto shrink-0 text-white/70" />
      </Tappable>
      )}

      {/* 바로가기 — 모바일: 배차·경로/자재/미수금/통계, 데스크톱: 모바일 미리보기 */}
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">메뉴</h3>
        <div className="space-y-2.5">
          <Tappable as="div" onClick={() => go('/company')} className="card flex cursor-pointer items-center gap-3 p-4">
            <IconChip icon={Globe} tone="navy" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">회사 홈페이지</p>
              <p className="text-[0.98rem] text-navy-400">주식회사 비원미래 공식 홈페이지</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
          <a
            href={ALLBARO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex items-center gap-3 p-4 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <IconChip icon={ExternalLink} tone="teal" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">올바로 시스템</p>
              <p className="text-[0.98rem] text-navy-400">폐기물 적법처리 국가시스템 바로가기</p>
            </div>
            <ExternalLink size={16} className="ml-auto shrink-0 text-navy-300" />
          </a>
          {variant === 'mobile' &&
            shortcuts.map((s) => (
              <Tappable key={s.to} as="div" onClick={() => go(s.to)} className="card flex cursor-pointer items-center gap-3 p-4">
                <IconChip icon={s.icon} tone="navy" />
                <div className="min-w-0">
                  <p className="font-bold text-navy-900">{s.label}</p>
                  <p className="text-[0.98rem] text-navy-400">{s.desc}</p>
                </div>
                <ChevronRight size={18} className="ml-auto text-navy-300" />
              </Tappable>
            ))}
          {variant === 'desktop' && (
            <Tappable as="div" onClick={() => go('/mobile-preview')} className="card flex cursor-pointer items-center gap-3 p-4">
              <IconChip icon={Smartphone} tone="navy" />
              <div className="min-w-0">
                <p className="font-bold text-navy-900">모바일 프레임으로 보기</p>
                <p className="text-[0.98rem] text-navy-400">시연용 모바일 미리보기</p>
              </div>
              <ChevronRight size={18} className="ml-auto text-navy-300" />
            </Tappable>
          )}
        </div>
      </section>

      {/* 추가 개발 예정 — 현재 사용 기능과 확장 예정 기능을 명확히 구분.
          아직 없는 기능 목록이라 현장 담당자의 폰에서는 자리만 차지합니다. */}
      {showRoadmap && (
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">추가 개발 예정</h3>
        <div className="card p-4">
          <div className="flex flex-wrap gap-1.5">
            {PLANNED_FEATURES.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5 text-[0.98rem] font-semibold text-navy-500"
              >
                <Lock size={12} /> {f}
              </span>
            ))}
          </div>
          <button className="btn-ghost mt-3 w-full" onClick={() => go('/roadmap')}>
            <Workflow size={16} strokeWidth={2.4} /> 단계별 활용 계획 보기
          </button>
          <p className="mt-2.5 text-[0.98rem] text-navy-400">
            위 기능은 아직 실사용 단계가 아니며, 단계별 로드맵에 따라 개발 예정입니다.
          </p>
        </div>
      </section>
      )}

      {/* 설정 — 글자 크기 · 데이터 백업 · 시연 데이터 관리 */}
      {/*
        여기도 위 바로가기와 같은 문제가 있었습니다. '설정'·'AX 도입 성과' 카드가
        모든 역할에게 보였는데 두 화면 모두 열리지 않아서, 누르면 "접근 권한이
        없는 화면입니다" 만 떴습니다. 실제로 현장·사무실 계정에서 재현했습니다.

        더 곤란한 것은 글자 크기였습니다. 글자 크기를 바꾸는 곳이 설정 화면
        한 군데뿐인데 그 화면이 관리자 전용이라, 정작 폰으로만 일하는 현장
        담당자는 글자를 키울 방법이 아예 없었습니다. 그래서 설정 화면에 못
        들어가는 분에게는 같은 조절기를 더보기 안에 그대로 놓아 둡니다.
      */}
      <section>
        <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">
          {canAccess(role, '/settings') ? '성과 · 설정' : '글자 크기'}
        </h3>
        {canAccess(role, '/performance') && (
          <Tappable as="div" onClick={() => go('/performance')} className="card mb-2.5 flex cursor-pointer items-center gap-3 p-4">
            <IconChip icon={Gauge} tone="teal" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">AX 도입 성과</p>
              <p className="text-[0.98rem] text-navy-400">실제로 얼마나 좋아졌는지 — 도입 전 → 후 측정값</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
        )}
        {canAccess(role, '/settings') ? (
          <Tappable as="div" onClick={() => go('/settings')} className="card flex cursor-pointer items-center gap-3 p-4">
            <IconChip icon={SlidersHorizontal} tone="teal" />
            <div className="min-w-0">
              <p className="font-bold text-navy-900">설정</p>
              <p className="text-[0.98rem] text-navy-400">글자 크기 · 거래처 세트 · 데이터 백업 · 초기화</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-navy-300" />
          </Tappable>
        ) : (
          <div className="card p-4">
            <p className="mb-2.5 text-[0.98rem] text-navy-400">화면 글자가 작으면 크기를 올리세요</p>
            <FontSizeControl />
          </div>
        )}
      </section>

      {/* 기술개발 현황 — 회사 소개 자료입니다 (현장 담당자 제외) */}
      {showcase && (
        <section>
          <h3 className="mb-2 px-1 text-[1.08rem] font-semibold text-navy-500">기술개발 현황</h3>
          <RnDCard />
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

      {/*  「시연용 MVP」는 실제로 운영에 쓰기 시작한 지금은 맞지 않는 문구입니다.
           현장 담당자에게는 자기가 넣은 기록이 연습용처럼 읽힙니다. */}
      <p className="pb-1 text-center text-[0.98rem] text-navy-300">
        ㈜비원미래 · beonemirae ops{showcase ? ' · 시연용 MVP' : ''}
      </p>
    </div>
  )
}
