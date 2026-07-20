import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  Menu,
  X,
  ShieldCheck,
  Trash2,
  FileText,
  Check,
  CheckCircle2,
  CalendarClock,
  Truck,
  Award,
  FlaskConical,
  Monitor,
  Route,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 주식회사 비원미래 공식 홈페이지 (/company)
//  · 8장 디자인 보드(이미지)를 "그림(배경)"으로만 사용 — 데스크톱 d1~d8 / 모바일 m1~m8
//  · 보드에 있던 모든 문구·UI는 코드(HTML/CSS)로 재현하여 이미지 위에 올림
//    → 텍스트가 선명 + 선택 가능 + 반응형 + 접근성 확보 (이미지에 박힌 글자 없음)
//  · 스크롤 등장 모션 + 버튼/카드 호버 효과 포함
// ─────────────────────────────────────────────────────────────────────────────

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'

const D = (n: number) => `/company/boards/d${n}.png`
const M = (n: number) => `/company/boards/m${n}.png`

const NAV = [
  { label: '회사소개', id: 'about' },
  { label: '서비스', id: 'services' },
  { label: '운영현황', id: 'tech' },
  { label: '문의', id: 'contact' },
]

const EASE = [0.22, 1, 0.36, 1] as const

// 스크롤 진입 시 페이드/슬라이드업
function Reveal({
  children,
  className = '',
  delay = 0,
  y = 26,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-70px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

// 공용 CTA 버튼 (호버: 살짝 확대 + 화살표 슬라이드)
function CtaButton({
  children,
  onClick,
  href,
  external,
  variant = 'solid',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  external?: boolean
  variant?: 'solid' | 'outline' | 'outlineDark'
  className?: string
}) {
  const base =
    'group inline-flex items-center justify-center gap-2 rounded-xl px-[clamp(18px,1.7vw,28px)] py-[clamp(12px,1.1vw,17px)] text-[clamp(15px,1.2vw,18px)] font-bold transition-colors'
  const styles = {
    solid: 'bg-accent-500 text-white hover:bg-accent-400 shadow-lg shadow-accent-500/20',
    outline: 'border border-navy-300 text-navy-700 hover:border-accent-400 hover:text-accent-600',
    outlineDark: 'border border-white/30 text-white hover:border-accent-300 hover:bg-white/5',
  }[variant]
  const inner = (
    <>
      {children}
      <ArrowRight size={17} strokeWidth={2.4} className="transition-transform duration-300 group-hover:translate-x-1" />
    </>
  )
  if (href) {
    return (
      <motion.a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15, ease: EASE }}
        className={`${base} ${styles} ${className}`}
      >
        {inner}
      </motion.a>
    )
  }
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: EASE }}
      className={`${base} ${styles} ${className}`}
    >
      {inner}
    </motion.button>
  )
}

// 섹션 배경 보드(반응형 이미지 스왑). 자연 비율로 섹션 높이를 결정.
function BoardBg({ n, alt }: { n: number; alt: string }) {
  return (
    <>
      <img src={M(n)} alt={alt} className="block w-full select-none md:hidden" draggable={false} />
      <img src={D(n)} alt="" aria-hidden className="hidden w-full select-none md:block" draggable={false} />
    </>
  )
}

// 분할 레이아웃용 보드 프레임 — 그래픽 영역만 보이도록 크롭(빈 여백 제거).
//  dPos: 데스크톱 이미지의 object-position (그래픽이 있는 쪽)
function SplitImage({ n, alt, dPos, className = '' }: { n: number; alt: string; dPos: string; className?: string }) {
  return (
    <Reveal className={className}>
      <div className="overflow-hidden rounded-3xl border border-navy-100 bg-white shadow-card">
        <img
          src={M(n)}
          alt={alt}
          className="block aspect-[4/3] w-full select-none object-cover object-bottom lg:hidden"
          draggable={false}
        />
        <img
          src={D(n)}
          alt=""
          aria-hidden
          className={`hidden aspect-[3/2] w-full select-none object-cover lg:block ${dPos}`}
          draggable={false}
        />
      </div>
    </Reveal>
  )
}

// 문의 유형 탭
const INQUIRY_TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: '일반 상담', icon: MessageSquare },
  { key: 'pickup', label: '수거 문의', icon: Truck },
  { key: 'contract', label: '계약 문의', icon: FileText },
  { key: 'etc', label: '기타 문의', icon: MoreHorizontal },
]

export function CompanyHomePage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // 문의 폼 상태
  const [form, setForm] = useState({
    type: 'general',
    org: '',
    manager: '',
    phone: '',
    email: '',
    region: '',
    orgType: '',
    content: '',
    agree: false,
  })
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const prevTitle = document.title
    document.title = '주식회사 비원미래 | 서울·경기 의료폐기물 수거·운반'
    const meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content') ?? ''
    meta?.setAttribute(
      'content',
      '주식회사 비원미래는 서울·경기권 병원, 요양병원, 의원, 요양시설을 대상으로 의료폐기물 수거·운반, 의료기관 폐기물 운영관리, 자재공급, 수거이력 관리를 수행하는 전문기업입니다.',
    )
    return () => {
      document.title = prevTitle
      meta?.setAttribute('content', prevDesc)
    }
  }, [])

  const goTo = (id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-[100dvh] bg-white font-sans">
      {/* ── 상단 네비게이션 (히어로에선 투명, 스크롤 시 다크 솔리드) ───────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled ? 'border-b border-white/10 bg-navy-950/90 backdrop-blur-lg' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-[60px] w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:h-[64px] lg:px-8">
          <button onClick={() => goTo('top')} className="flex items-center gap-2 text-[18px] font-extrabold text-white" aria-label="맨 위로">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/50 text-accent-300">
              <svg viewBox="0 0 40 40" width={18} height={18} fill="none">
                <path d="M20 4 L33 11.5 V28.5 L20 36 L7 28.5 V11.5 Z" stroke="#2dd4bf" strokeWidth="2.4" strokeLinejoin="round" />
              </svg>
            </span>
            비원미래
          </button>
          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => goTo(n.id)}
                className="text-[16px] font-bold text-white/80 transition-colors hover:text-white"
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden lg:block">
            <CtaButton onClick={() => goTo('contact')} className="!px-5 !py-2.5 !text-[15px]">
              수거 상담
            </CtaButton>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white lg:hidden"
            aria-label="메뉴"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/10 bg-navy-950/95 backdrop-blur-lg lg:hidden">
            <nav className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => goTo(n.id)}
                  className="rounded-lg px-2 py-3 text-left text-[15px] font-bold text-white/85 hover:bg-white/10"
                >
                  {n.label}
                </button>
              ))}
              <button
                onClick={() => goTo('contact')}
                className="my-2 rounded-lg bg-accent-500 px-4 py-3 text-[15px] font-bold text-white"
              >
                수거 상담
              </button>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* ═══ 섹션 1 · 히어로 (다크 사진) ═══════════════════════════════════ */}
        <section id="top" className="relative w-full overflow-hidden">
          <BoardBg n={1} alt="비원미래 의료폐기물 운송 차량과 현장 작업자" />
          {/* 좌측 가독성 스크림 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-6 pt-14 sm:px-10 lg:px-[6%]">
            <div className="max-w-[50rem] text-white">
              <Reveal>
                <h1 className="text-[clamp(30px,4.4vw,66px)] font-extrabold leading-[1.16] tracking-tight [text-shadow:0_2px_18px_rgba(0,0,0,0.35)]">
                  의료폐기물 운송을
                  <br />
                  운영 기준까지 관리합니다
                </h1>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-[clamp(14px,1.6vw,26px)] max-w-[42rem] text-[clamp(16px,1.75vw,25px)] font-medium leading-relaxed text-white/85">
                  서울·경기권 의료기관의 정기 수거, 긴급 대응, 용기 공급, 수거대장 관리.
                </p>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="mt-[clamp(18px,2vw,32px)] flex flex-wrap gap-3">
                  <CtaButton onClick={() => goTo('contact')}>수거 상담 요청</CtaButton>
                  <CtaButton variant="outlineDark" onClick={() => goTo('services')}>
                    운영 범위 보기
                  </CtaButton>
                </div>
              </Reveal>
            </div>
          </div>
          {/* 하단 3대 특징 바 */}
          <div className="absolute inset-x-0 bottom-0 hidden border-t border-white/10 bg-black/30 backdrop-blur-sm md:block">
            <div className="mx-auto grid max-w-6xl grid-cols-3 gap-6 px-[6%] py-[clamp(12px,1.6vw,22px)] lg:px-8">
              {[
                { icon: ShieldCheck, t: '허가 기반 운송', d: '관할 기관 허가 기반의 안전한 운송 체계' },
                { icon: Trash2, t: '전용 용기 관리', d: '규격 용기 사용 및 회수·세척·소독 관리' },
                { icon: FileText, t: '수거이력 기록', d: '수거부터 폐기까지 전 과정 기록·보관' },
              ].map(({ icon: Icon, t, d }) => (
                <div key={t} className="flex items-center gap-3 text-white">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent-300/40 text-accent-300">
                    <Icon size={23} strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[clamp(15px,1.2vw,18px)] font-bold">{t}</p>
                    <p className="truncate text-[clamp(12px,0.95vw,15px)] text-white/70">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 섹션 2 · 핵심 운영 기준 (분할: 텍스트 좌 / 대시보드 우) ═══════ */}
        <section id="about" className="w-full scroll-mt-16 overflow-hidden bg-[#f5f7fa] py-[clamp(48px,6vw,90px)]">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
            <div>
              <Reveal>
                <p className="flex items-center gap-2 text-[16px] font-bold text-accent-600">
                  <span className="h-2 w-2 rounded-full bg-accent-500" /> 핵심 운영 기준
                </p>
                <h2 className="mt-3 text-[30px] font-extrabold leading-[1.2] tracking-tight text-navy-900 sm:text-4xl lg:text-[46px]">
                  수거만 맡기는 것이 아니라,
                  <br />
                  운영 부담까지 줄입니다
                </h2>
                <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-navy-500 sm:text-[19px]">
                  정기 수거, 추가 요청, 전용 용기, 수거대장까지 의료기관 담당자가 챙겨야 할 일을 함께 관리합니다.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-[15px] font-bold text-amber-600">
                  <Check size={16} strokeWidth={3} /> 일회용기저귀 수거 포함
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <ul className="mt-7 space-y-3.5">
                  {['정기·추가 수거 대응', '보관기한 알림', '전용 용기·자재 공급 이력', '수거대장 정리'].map((t) => (
                    <li key={t} className="flex items-center gap-3 text-[18px] font-semibold text-navy-700">
                      <CheckCircle2 size={22} className="shrink-0 text-accent-500" />
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <CtaButton onClick={() => goTo('contact')}>관리 기준 확인하기</CtaButton>
                </div>
              </Reveal>
            </div>
            <SplitImage n={2} alt="비원미래 운영 대시보드 · 수거 일정 보드" dPos="object-right" className="lg:order-last" />
          </div>
        </section>

        {/* ═══ 섹션 3 · 대상별 서비스 (라이트, 4분할 사진) ═════════════════════ */}
        <section id="services" className="w-full scroll-mt-16 bg-[#f2f4f7]">
          {/* 이미지 + 오버레이 (자체 relative 블록 → 오버레이가 이미지 기준) */}
          <div className="relative w-full overflow-hidden">
            <BoardBg n={3} alt="병원·요양병원·요양시설 등 대상별 수거 서비스" />
            {/* 헤딩 (상단 여백) */}
            <div className="absolute inset-x-0 top-0 px-6 pt-[5%] sm:px-10 md:pl-[6%] md:pr-[40%]">
              <Reveal>
                <p className="flex items-center gap-2 text-[clamp(13px,1.2vw,17px)] font-bold text-accent-600">
                  <span className="h-3.5 w-1 rounded-full bg-accent-500" /> 대상별 서비스
                </p>
                <h2 className="mt-2 text-[clamp(22px,3vw,46px)] font-extrabold leading-[1.2] tracking-tight text-navy-900">
                  기관 유형과 폐기물 종류에 따라
                  <br />
                  수거 기준을 나눕니다
                </h2>
                <p className="mt-3 hidden text-[clamp(14px,1.35vw,19px)] leading-relaxed text-navy-500 sm:block">
                  병원·의원은 의료폐기물 팀이, 요양시설·장례식장 등은 조건에 따라 기저귀 팀과 분리 운영합니다.
                </p>
              </Reveal>
            </div>
            {/* 4개 카드 라벨 — 사진 하단에 오버레이 (데스크톱 4열 / 모바일 2x2) */}
            <div className="absolute inset-x-0 bottom-0 top-[40%] grid grid-cols-2 grid-rows-2 md:grid-cols-4 md:grid-rows-1">
              {[
                { tag: '의료폐기물 팀', title: '병원·요양병원', tone: 'teal' },
                { tag: '의료폐기물 팀', title: '의원·치과·한의원', tone: 'teal' },
                { tag: '기저귀 팀', title: '요양시설·장례식장', tone: 'amber' },
                { tag: '통합 배차', title: '다수 거래처 관리', tone: 'sky' },
              ].map((c, i) => (
                <div key={i} className="relative flex flex-col justify-end p-[3%]">
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                  <Reveal delay={i * 0.06} className="relative">
                    <span
                      className={`inline-block rounded-md px-2.5 py-1 text-[clamp(11px,0.95vw,14px)] font-bold text-white ${
                        c.tone === 'teal' ? 'bg-accent-500' : c.tone === 'amber' ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                    >
                      {c.tag}
                    </span>
                    <p className="mt-2 text-[clamp(16px,1.6vw,24px)] font-extrabold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                      {c.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['정기', '추가', '용기', '대장'].map((chip) => (
                        <span
                          key={chip}
                          className="rounded border border-white/30 bg-white/15 px-2 py-0.5 text-[clamp(10px,0.85vw,13px)] font-semibold text-white backdrop-blur-sm"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
          {/* CTA — 이미지 아래 별도 바 */}
          <div className="flex justify-center py-7">
            <CtaButton variant="outline" onClick={() => goTo('contact')}>
              대상 기관 확인하기
            </CtaButton>
          </div>
        </section>

        {/* ═══ 섹션 4 · 서울·경기권 수거망 (다크 지도, 텍스트 우측) ═══════════ */}
        <section id="coverage" className="relative w-full overflow-hidden scroll-mt-16 bg-[#0b1220]">
          <BoardBg n={4} alt="서울·경기권 수거망 지도" />

          {/* 지도 위 라벨(그림 속 글자) — 데스크톱 전용 (지도 좌측 영역) */}
          <div className="pointer-events-none absolute inset-0 hidden md:block">
            {/* 광역 지명 (은은하게) */}
            <span className="absolute left-[13%] top-[12%] text-[clamp(15px,1.5vw,22px)] font-bold tracking-wide text-white/25">경기도</span>
            <span className="absolute left-[25%] top-[40%] text-[clamp(15px,1.5vw,22px)] font-bold tracking-wide text-white/30">서울특별시</span>
            {/* 도시명 */}
            {[
              { t: '고양시', l: 21, top: 17 },
              { t: '의정부시', l: 41, top: 14 },
              { t: '김포시', l: 4.5, top: 41 },
              { t: '광명시', l: 15, top: 62 },
              { t: '성남시', l: 40, top: 82 },
              { t: '수원시', l: 26, top: 92 },
            ].map((c) => (
              <span key={c.t} className="absolute text-[clamp(11px,0.95vw,14px)] font-semibold text-white/50" style={{ left: `${c.l}%`, top: `${c.top}%` }}>
                {c.t}
              </span>
            ))}
            {/* 남양주 운영 거점 콜아웃 (허브 근처) */}
            <div className="absolute left-[33%] top-[27%] rounded-lg border border-accent-400/40 bg-navy-950/70 px-3 py-2 backdrop-blur-sm">
              <p className="flex items-center gap-1.5 text-[clamp(12px,1.05vw,15px)] font-bold text-accent-200">
                <MapPin size={14} className="text-accent-300" /> 남양주 운영 거점
              </p>
              <p className="mt-0.5 text-[clamp(10px,0.85vw,12px)] text-white/60">수거 · 보관 · 출고</p>
            </div>
            {/* 긴급 요청 라벨 (주황 마커 근처) */}
            <span className="absolute left-[37%] top-[71%] rounded-md bg-amber-500/20 px-2 py-0.5 text-[clamp(11px,0.95vw,14px)] font-bold text-amber-300">
              긴급 요청
            </span>
            {/* 범례 */}
            <div className="absolute bottom-[6%] left-[3%] rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3 backdrop-blur-sm">
              {[
                { c: 'text-accent-300', label: '남양주 운영 거점', pin: true },
                { c: 'text-white', label: '병원·의료기관 거점', pin: true },
                { c: 'bg-accent-400', label: '수거 진행 중' },
                { c: 'bg-white/50', label: '회차 복귀 중' },
                { c: 'bg-amber-400', label: '긴급 요청' },
              ].map((it) => (
                <div key={it.label} className="flex items-center gap-2 py-0.5">
                  {it.pin ? (
                    <MapPin size={13} className={it.c} />
                  ) : (
                    <span className={`h-2.5 w-2.5 rounded-full ${it.c}`} />
                  )}
                  <span className="text-[clamp(10px,0.9vw,13px)] font-medium text-white/70">{it.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute inset-0 flex flex-col items-start justify-end px-6 pb-[7%] sm:px-10 md:items-end md:justify-center md:pb-0 md:pl-[52%] md:pr-[6%]">
            <div className="max-w-[36rem] text-white">
              <Reveal>
                <p className="text-[clamp(13px,1.2vw,16px)] font-bold text-accent-300">거래처·권역</p>
                <h2 className="mt-2 text-[clamp(24px,3.2vw,48px)] font-extrabold leading-[1.2] tracking-tight">
                  서울·경기권 수거망을
                  <br />
                  <span className="text-accent-300">한눈에</span> 관리합니다
                </h2>
              </Reveal>
              <Reveal delay={0.08}>
                <p className="mt-[clamp(12px,1.2vw,20px)] text-[clamp(14px,1.35vw,19px)] leading-relaxed text-white/75">
                  남양주 기반 운영으로 병원, 요양병원, 의원, 요양시설의 정기·추가 수거 조건을 축적합니다.
                </p>
              </Reveal>
              <Reveal delay={0.14}>
                <div className="mt-[clamp(18px,2vw,32px)] grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                  <div>
                    <p className="whitespace-nowrap text-[clamp(22px,2.4vw,34px)] font-extrabold text-accent-300">
                      50<span className="text-[0.7em]">곳+</span>
                    </p>
                    <p className="text-[clamp(12px,1.05vw,15px)] text-white/60">관리 거래처</p>
                  </div>
                  <div>
                    <p className="whitespace-nowrap text-[clamp(22px,2.4vw,34px)] font-extrabold text-accent-300">
                      월100<span className="text-[0.7em]">톤+</span>
                    </p>
                    <p className="text-[clamp(12px,1.05vw,15px)] text-white/60">수거·운반</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <CalendarClock size={26} className="text-accent-300" />
                    <p className="text-[clamp(12px,1.05vw,15px)] leading-tight text-white/70">
                      정기·추가
                      <br />
                      수거 대응
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Truck size={26} className="text-accent-300" />
                    <p className="text-[clamp(12px,1.05vw,15px)] leading-tight text-white/70">
                      전용 차량
                      <br />
                      운영
                    </p>
                  </div>
                </div>
                <div className="mt-[clamp(18px,2vw,32px)]">
                  <CtaButton variant="outlineDark" onClick={() => goTo('contact')}>
                    권역 상담하기
                  </CtaButton>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ═══ 섹션 5 · 현장 관리 (분할: 사진 좌 / 텍스트 우) ═══════════════ */}
        <section id="workflow" className="w-full scroll-mt-16 overflow-hidden bg-white py-[clamp(48px,6vw,90px)]">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
            <SplitImage n={5} alt="현장에서 전용 용기를 스캔·확인하는 작업자" dPos="object-left" />
            <div>
              <Reveal>
                <p className="text-[13px] font-bold tracking-wider text-navy-400">05 / 08 · WORKFLOW CONTROL</p>
                <p className="mt-3 text-[16px] font-bold text-accent-600">수거 관리 방식</p>
                <h2 className="mt-2 text-[30px] font-extrabold leading-[1.2] tracking-tight text-navy-900 sm:text-4xl lg:text-[46px]">
                  보관기한부터 수거대장까지
                  <br />
                  현장에서 확인합니다
                </h2>
                <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-navy-500 sm:text-[19px]">
                  보관기한, 전용 용기, 자재 요청, 수거이력을 현장에서 확인하고 정리해 의료기관의 관리 부담을 줄입니다.
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <ul className="mt-7 space-y-3.5">
                  {[
                    '수거주기 · 보관기한 관리',
                    '전용 용기 · 자재 공급 이력',
                    '수거완료 내역 · 수거대장 확인',
                    '의료폐기물 및 일회용기저귀 배출물 분리 관리',
                    '실사 · 인증 전 자료 요청 대응',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[18px] font-semibold text-navy-700">
                      <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-accent-500" />
                      {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <CtaButton variant="outline" onClick={() => goTo('contact')}>
                    관리 항목 보기
                  </CtaButton>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ═══ 섹션 6 · 개발 현황 (분할: 텍스트 좌 / 대시보드 우) ═══════════ */}
        <section id="tech" className="w-full scroll-mt-16 overflow-hidden bg-[#eef2f7] py-[clamp(48px,6vw,90px)]">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
            <div>
              <Reveal>
                <p className="text-[13px] font-bold tracking-wider text-accent-600">06 / 08 · 개발 현황</p>
                <h2 className="mt-2 text-[30px] font-extrabold leading-[1.18] tracking-tight text-navy-900 sm:text-4xl lg:text-[44px]">
                  운영관리 시스템을 현장 기준에 맞춰 고도화하고 있습니다
                </h2>
                <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-navy-500 sm:text-[19px]">
                  수거·운반 현장에서 발생하는 거래처 정보, 수거조건, 차량 운행, 자재 요청, 수거이력을 체계적으로 관리하기 위한 운영관리 화면을 구축하고 있습니다.
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { icon: Award, t: '경로 최적화 특허출원', d: '경로 최적화 시스템 · 출원번호 10-2026-0101187' },
                    { icon: FlaskConical, t: '연구개발전담부서 운영', d: '수거·운반·자재·이력 통합관리 연구개발 체계' },
                    { icon: Monitor, t: '운영관리 화면 구축', d: '거래처·배차·수거이력·자재·미수금 관리 구현' },
                    { icon: Route, t: '배차·경로 추천 로직 개발', d: '운영 데이터 기반 추천 시뮬레이션 고도화' },
                  ].map(({ icon: Icon, t, d }) => (
                    <motion.div
                      key={t}
                      whileHover={{ y: -3 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex items-start gap-3 rounded-xl border border-navy-100 bg-white p-4 shadow-sm"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                        <Icon size={19} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-navy-900">{t}</p>
                        <p className="text-[13px] leading-snug text-navy-400">{d}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <CtaButton onClick={() => goTo('contact')}>운영관리 화면 보기</CtaButton>
                  <button
                    onClick={() => goTo('contact')}
                    className="group inline-flex items-center gap-1.5 text-[15px] font-bold text-navy-600 transition-colors hover:text-accent-600"
                  >
                    개발 현황 문의
                    <ArrowRight size={16} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              </Reveal>
            </div>
            <SplitImage n={6} alt="비원미래 운영관리 시스템 화면" dPos="object-right" className="lg:order-last" />
          </div>
        </section>

        {/* ═══ 섹션 7 · 상담 문의 (라이트, 사진 + 코딩 폼) ═══════════════════ */}
        <section id="contact" className="relative w-full scroll-mt-16 overflow-hidden bg-[#eef1f5] py-[clamp(48px,6vw,88px)]">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:px-8">
            {/* 좌: 안내 + 사진 + 체크 */}
            <div>
              <Reveal>
                <p className="flex items-center gap-2 text-[16px] font-bold text-accent-600">
                  <span className="h-3.5 w-1 rounded-full bg-accent-500" /> 상담 문의
                </p>
                <h2 className="mt-2 text-[clamp(26px,3.4vw,44px)] font-extrabold leading-[1.2] tracking-tight text-navy-900">
                  기관의 배출 조건을 알려주시면
                  <br />
                  수거 기준을 정리해드립니다
                </h2>
                <p className="mt-3 text-[17px] leading-relaxed text-navy-500">
                  지역, 기관 유형, 수거 주기, 용기·자재 필요 여부를 바탕으로 상담합니다.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="mt-5 overflow-hidden rounded-2xl shadow-card">
                  <img
                    src={M(7)}
                    alt="비원미래 담당자와 의료기관 담당자의 상담 장면"
                    className="block aspect-[3/2] w-full object-cover object-[center_62%]"
                  />
                </div>
              </Reveal>
              <Reveal delay={0.16}>
                <ul className="mt-6 space-y-4">
                  {[
                    { t: '전문 상담 지원', d: '의료폐기물 관리 전문 상담원이 맞춤 안내' },
                    { t: '정확한 기준 안내', d: '관련 법규 및 지역 기준을 반영한 수거 기준 정리' },
                    { t: '안전하고 신속한 처리', d: '안전 수거·운반 체계에 기반한 최적의 처리 방안 제안' },
                  ].map((c) => (
                    <li key={c.t} className="flex items-start gap-3">
                      <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-accent-500" />
                      <div>
                        <p className="text-[17px] font-bold text-navy-900">{c.t}</p>
                        <p className="text-[14px] text-navy-500">{c.d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* 우: 문의 폼 (코딩) */}
            <Reveal delay={0.1}>
              <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
                {submitted ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-50 text-accent-500">
                      <CheckCircle2 size={34} strokeWidth={2} />
                    </span>
                    <p className="mt-4 text-xl font-extrabold text-navy-900">상담 문의가 접수되었습니다</p>
                    <p className="mt-2 text-sm text-navy-500">
                      담당자가 확인 후 빠르게 연락드리겠습니다.
                      <br />
                      감사합니다.
                    </p>
                    <button
                      onClick={() => {
                        setSubmitted(false)
                        setForm({ type: 'general', org: '', manager: '', phone: '', email: '', region: '', orgType: '', content: '', agree: false })
                      }}
                      className="mt-6 rounded-xl border border-navy-200 px-5 py-2.5 text-sm font-bold text-navy-600 transition hover:bg-navy-50"
                    >
                      새 문의 작성
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit} className="space-y-5">
                    <p className="text-xl font-extrabold text-navy-900">문의 유형</p>
                    <div className="grid grid-cols-4 gap-2">
                      {INQUIRY_TABS.map(({ key, label, icon: Icon }) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setForm((f) => ({ ...f, type: key }))}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3.5 text-[13px] font-bold transition ${
                            form.type === key
                              ? 'border-accent-400 bg-accent-50 text-accent-600'
                              : 'border-navy-100 text-navy-400 hover:border-navy-200'
                          }`}
                        >
                          <Icon size={20} strokeWidth={2.1} />
                          {label}
                        </button>
                      ))}
                    </div>

                    <Field label="기관명" required>
                      <input
                        required
                        value={form.org}
                        onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
                        placeholder="기관명을 입력해주세요."
                        className={inputCls}
                      />
                    </Field>
                    <Field label="담당자명" required>
                      <input
                        required
                        value={form.manager}
                        onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))}
                        placeholder="담당자명을 입력해주세요."
                        className={inputCls}
                      />
                    </Field>
                    <Field label="연락처" required>
                      <input
                        required
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="예) 010-1234-5678"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="이메일" required>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="예) example@domain.com"
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="지역" required>
                        <select
                          required
                          value={form.region}
                          onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                          className={`${inputCls} ${form.region ? '' : 'text-navy-300'}`}
                        >
                          <option value="" disabled>
                            지역을 선택해주세요.
                          </option>
                          {['서울', '경기 북부', '경기 남부', '인천', '기타'].map((o) => (
                            <option key={o} value={o} className="text-navy-900">
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="배출기관 유형" required>
                        <select
                          required
                          value={form.orgType}
                          onChange={(e) => setForm((f) => ({ ...f, orgType: e.target.value }))}
                          className={`${inputCls} ${form.orgType ? '' : 'text-navy-300'}`}
                        >
                          <option value="" disabled>
                            유형을 선택해주세요.
                          </option>
                          {['병원·요양병원', '의원·치과·한의원', '요양시설·장례식장', '기타'].map((o) => (
                            <option key={o} value={o} className="text-navy-900">
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label="문의 내용" required>
                      <textarea
                        required
                        maxLength={500}
                        value={form.content}
                        onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                        placeholder="배출 조건, 수거 주기, 용기·자재 필요 여부 등 자세히 입력해주시면 상담에 도움이 됩니다."
                        className={`${inputCls} h-28 resize-none`}
                      />
                      <p className="mt-1 text-right text-[13px] text-navy-300">{form.content.length} / 500</p>
                    </Field>

                    <label className="flex items-center justify-between rounded-xl bg-navy-50 px-4 py-3.5">
                      <span className="flex items-center gap-2 text-[14px] font-semibold text-navy-600">
                        <input
                          type="checkbox"
                          required
                          checked={form.agree}
                          onChange={(e) => setForm((f) => ({ ...f, agree: e.target.checked }))}
                          className="h-4 w-4 accent-accent-500"
                        />
                        개인정보 수집 및 이용에 동의합니다. (필수)
                      </span>
                      <span className="hidden text-[13px] font-bold text-navy-400 sm:inline">자세히 보기 ›</span>
                    </label>

                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 py-4 text-[17px] font-bold text-white transition hover:bg-accent-500"
                    >
                      상담 문의 보내기
                      <ArrowRight size={18} strokeWidth={2.4} className="transition-transform group-hover:translate-x-1" />
                    </motion.button>
                    <p className="text-[13px] text-navy-400">* 표시 항목은 필수 입력 사항입니다.</p>
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ═══ 섹션 8 · 푸터 (다크) ═══════════════════════════════════════════ */}
        <footer id="footer" className="relative w-full overflow-hidden bg-[#0a1220] text-white">
          {/* 배경 지도 텍스처 */}
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
            style={{ backgroundImage: `url(${D(8)})` }}
          />
          <div className="relative mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
            {/* 상단 CTA 바 */}
            <Reveal>
              <div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 sm:flex-row sm:items-center mt-[clamp(40px,5vw,72px)] sm:px-9">
                <p className="text-[clamp(20px,2.7vw,36px)] font-extrabold leading-tight tracking-tight">
                  의료폐기물·기저귀 수거 기준, 지금 정리하세요
                </p>
                <CtaButton onClick={() => goTo('contact')} className="shrink-0">
                  수거 상담하기
                </CtaButton>
              </div>
            </Reveal>

            {/* 구분선 */}
            <div className="mt-8 flex items-center gap-3 border-t border-dashed border-amber-400/30 pt-4 text-amber-400/70">
              <span className="text-[13px] font-bold tracking-wider">MEDICAL &amp; DIAPER WASTE MANAGEMENT</span>
              <ShieldCheck size={16} className="ml-auto" />
            </div>

            {/* 푸터 컬럼 */}
            <div className="grid grid-cols-2 gap-8 py-12 md:grid-cols-5">
              {/* 브랜드 */}
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 text-[19px] font-extrabold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/50 text-accent-300">
                    <svg viewBox="0 0 40 40" width={18} height={18} fill="none">
                      <path d="M20 4 L33 11.5 V28.5 L20 36 L7 28.5 V11.5 Z" stroke="#2dd4bf" strokeWidth="2.4" strokeLinejoin="round" />
                    </svg>
                  </span>
                  BEONE MIRAE
                </div>
                <p className="mt-3 text-[15px] font-bold text-white/80">주식회사 비원미래</p>
                <p className="mt-3 flex items-start gap-2 text-[14px] leading-relaxed text-white/55">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-accent-300" />
                  경기도 남양주시 오남읍
                  <br />
                  양지로 47-35, 바동 1층
                </p>
                <p className="mt-2 flex items-center gap-2 text-[14px] text-white/55">
                  <Truck size={16} className="shrink-0 text-accent-300" />
                  서울·경기권 운영
                </p>
              </div>

              {/* 링크 컬럼들 */}
              {[
                { h: '회사', items: ['회사 소개', '대표 인사말', '연혁', '인증 및 허가', '오시는 길'] },
                { h: '서비스', items: ['의료폐기물 수거·운반', '일회용기저귀 수거·운반', '전용 용기·자재 공급', '운영관리 시스템 개발'] },
                { h: '운영', items: ['의료폐기물 팀', '기저귀 팀', '차량 및 이력 관리', '안전·교육 체계'] },
              ].map((col) => (
                <div key={col.h}>
                  <p className="text-[16px] font-bold text-white">{col.h}</p>
                  <span className="mt-3 block h-0.5 w-6 rounded-full bg-accent-400" />
                  <ul className="mt-4 space-y-3">
                    {col.items.map((it) => (
                      <li key={it}>
                        <button
                          onClick={() => goTo('contact')}
                          className="text-left text-[14px] text-white/55 transition-colors hover:text-white"
                        >
                          {it}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* 관련 시스템 */}
              <div>
                <p className="text-[16px] font-bold text-white">관련 시스템</p>
                <span className="mt-3 block h-0.5 w-6 rounded-full bg-accent-400" />
                <a
                  href={ALLBARO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="group mt-4 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-[14px] font-bold text-white/80 transition hover:border-accent-300 hover:text-white"
                >
                  올바로 시스템 바로가기
                  <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
            </div>

            {/* 하단 저작권 */}
            <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-white/45 sm:flex-row sm:items-center">
              <p className="text-[14px]">© 2026 BEONE MIRAE CO.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] sm:ml-6">
                {['개인정보처리방침', '이용약관', '정보보호 정책', '이메일무단수집거부', '윤리경영 신고센터'].map((t) => (
                  <button key={t} className="transition-colors hover:text-white/80">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* 앱(운영 대시보드) 진입 — 시연용 숨은 진입점 유지 */}
      <button onClick={() => navigate('/')} className="sr-only">
        운영 대시보드 열기
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-navy-200 bg-white px-4 py-3.5 text-[15px] text-navy-900 placeholder-navy-300 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-100'

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-bold text-navy-700">
        {label} {required && <span className="text-accent-500">*</span>}
      </span>
      {children}
    </label>
  )
}
