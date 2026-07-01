import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Menu,
  X,
  ArrowRight,
  Building2,
  Truck,
  Recycle,
  MapPin,
  Route,
  FileText,
  Container,
  Wallet,
  Syringe,
  ClipboardList,
  Boxes,
  ShieldCheck,
  FlaskConical,
  Layers,
  Database,
  TrendingUp,
  Clock,
  CheckCircle2,
  Navigation,
  type LucideIcon,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 주식회사 비원미래 공식 반응형 홈페이지 (/company)
//  · Layout(사이드바/탭) 바깥의 독립 전체화면 라우트 — 공개용 웹사이트 톤
//  · 홈페이지 전용 컴포넌트/모션. 기존 MVP 데이터·기능과 분리된 정적 프론트엔드.
//  · 흰색/slate/blue/navy 중심. 회사명은 "주식회사 비원미래"만, 등록번호 미표시.
//  · framer-motion + prefers-reduced-motion 고려한 스크롤 리빌·시각 요소.
// ─────────────────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

const NAV = [
  { label: '회사소개', href: '#about' },
  { label: '서비스', href: '#services' },
  { label: '운영관리 시스템', href: '#system' },
  { label: '기술개발', href: '#tech' },
  { label: '문의', href: '#contact' },
]

const HERO_BADGES = ['병원·요양병원 정기 수거', '의료폐기물 수거·운반', '폐기물 종류별 분리 운행', '자재공급·수거대장 관리', '서울·경기권 운영']

// 보조색 톤 — 아이콘 배경 (teal 위생·안정 / emerald 완료·관리 / amber 현장 대응 / navy 기본)
const TONE_CHIP: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-600 group-hover:bg-teal-500 group-hover:text-white',
  emerald: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white',
  amber: 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
  navy: 'bg-navy-100 text-navy-700 group-hover:bg-navy-900 group-hover:text-teal-300',
}

// 서비스 대상(고객 상황) — 서비스 섹션 상단에 "이런 기관과 함께합니다"로 노출
const SERVICE_FITS = [
  '정기 수거가 필요한 병원·요양병원',
  '의료폐기물과 일회용기저귀를 함께 관리해야 하는 기관',
  '수거대장·자재공급·미수금 관리까지 필요한 거래처',
  '실사·인증 전 추가 수거 요청이 잦은 기관',
]

// 현장 이미지 슬롯 — 실제 사진이 들어오면 src만 채우면 교체되는 구조
type FieldFrame = { icon: LucideIcon; title: string; alt: string; src?: string }
const HERO_FIELD: FieldFrame = {
  icon: Truck,
  title: '의료폐기물 전용 수거 차량 · 수거 준비',
  alt: '병원 앞에서 의료폐기물 전용 용기와 수거 차량을 두고 수거를 준비하는 현장',
  src: '/company/field-truck-hospital.webp',
}
// 섹션별 현장 이미지 — 같은 사진을 2회 이상 재사용하지 않도록 용도별로 분리
const IMG: Record<string, FieldFrame> = {
  consultation: { icon: ClipboardList, title: '병원 담당자와 수거 조건 상담', alt: '병원 담당자와 수거 조건·자재 요청을 함께 확인하는 상담 장면', src: '/company/consultation-hospital-admin.webp' },
  band: { icon: Truck, title: '', alt: '전용 차량에 의료폐기물 용기를 적재하고 운송을 준비하는 수거 현장', src: '/company/loading-collection-truck.webp' },
  smallClinic: { icon: Building2, title: '의원급 정기 수거 포인트', alt: '의원급 수거 포인트에서 밀봉 용기와 라벨을 확인하는 장면', src: '/company/small-clinic-pickup-point.webp' },
  supply: { icon: Container, title: '자재·전용 용기 공급 준비', alt: '자재 재고를 확인하고 전용 용기·자재 공급을 준비하는 장면', src: '/company/supply-inventory-prep.webp' },
  record: { icon: FileText, title: '수거대장·이력 관리', alt: '태블릿과 수기 대장으로 수거이력을 함께 관리하는 장면', src: '/company/pickup-record-management.webp' },
  route: { icon: Route, title: '배차·경로 · 수거 데이터 운영', alt: '운행 경로와 수거 데이터를 확인하는 운영관리 장면', src: '/company/route-operations-desk.webp' },
  separated: { icon: Truck, title: '폐기물 종류별 분리 운행 현장', alt: '의료폐기물과 관련 배출물을 두 대의 차량으로 분리 운행하는 현장', src: '/company/separated-transport-flows.webp' },
}

const STATS: { icon: LucideIcon; prefix: string; count: number | null; text?: string; suffix: string; label: string; desc: string; tone: 'teal' | 'emerald' | 'amber' | 'navy' }[] = [
  { icon: Building2, prefix: '', count: 50, suffix: '곳+', label: '관리 거래처', desc: '병원·요양병원·의원 등 서울·경기권 배출기관', tone: 'navy' },
  { icon: Recycle, prefix: '월 ', count: 100, suffix: '톤+', label: '수거·운반 규모', desc: '의료폐기물 및 관련 배출물 수거·운반', tone: 'teal' },
  { icon: MapPin, prefix: '', count: null, text: '서울·경기권', suffix: '', label: '광역 수거 운영', desc: '남양주 기반 권역 정기 수거', tone: 'emerald' },
  { icon: Clock, prefix: '', count: null, text: '정기·긴급', suffix: ' 대응', label: '수거 대응 체계', desc: '정기 수거, 추가 수거, 자재공급 요청 관리', tone: 'amber' },
]

const PROBLEMS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Clock, title: '수거주기·보관기한 관리', desc: '병원·요양병원·의원마다 수거주기와 폐기물 보관기한이 달라 일정만으로는 관리가 어렵습니다.' },
  { icon: ShieldCheck, title: '격리의료폐기물 긴급수거', desc: '격리의료폐기물은 보관기한이 짧아, 병원 요청 시 긴급수거 대응이 필요합니다.' },
  { icon: Layers, title: '의료폐기물·일회용기저귀 분리 운행', desc: '같은 병원에서 나와도 차량·관리체계·처리장이 달라 분리 운행과 이력관리가 필요합니다.' },
  { icon: ClipboardList, title: '자재·수거대장·미수금 관리', desc: '자재공급, 수거대장, 결제·미수금이 수기·전화·엑셀에 의존하면 거래처 증가 시 부담이 커집니다.' },
  { icon: Route, title: '적재량·처리장 인계시간', desc: '차량 적재가능량과 처리장 인계시간을 함께 고려해야 실제 운행이 성립합니다.' },
]

const SERVICES: { icon: LucideIcon; title: string; desc: string; soon?: boolean }[] = [
  { icon: Syringe, title: '의료폐기물 수거·운반', desc: '병원별 수거주기와 보관기한을 고려해 정기 수거를 수행합니다.' },
  { icon: Boxes, title: '의료기관 일회용기저귀 수거·운반', desc: '의료폐기물과 의료기관 일회용기저귀를 차량·관리체계별로 분리 운행합니다.' },
  { icon: Container, title: '전용 용기·자재 공급', desc: '전용 용기·봉투·박스 등 자재 요청과 공급 이력을 함께 관리합니다.' },
  { icon: FileText, title: '수거이력 및 수거대장 관리', desc: '수거이력과 자재공급을 통합해 월간 수거대장으로 정리·출력합니다.' },
  { icon: Wallet, title: '거래처별 결제·미수금 관리', desc: '거래처별 청구·입금 현황과 미수금을 한 흐름에서 관리합니다.' },
  { icon: Route, title: '배차·경로 추천 시뮬레이션', desc: '운영 데이터 기반 배차·경로 추천 로직을 개발하고 있습니다.', soon: true },
]

const FLOW: { icon: LucideIcon; step: string; title: string; desc: string; part: string }[] = [
  { icon: Building2, step: '01', title: '거래처 정보', desc: '병원별 주소·폐기물 종류·수거주기·요청사항을 관리합니다.', part: '110' },
  { icon: Clock, step: '02', title: '수거조건', desc: '보관기한·수거 가능 시간·긴급수거 조건을 반영합니다.', part: '120' },
  { icon: Truck, step: '03', title: '차량·처리장 정보', desc: '차량별 적재가능량과 처리장 인계시간을 고려합니다.', part: '130·140' },
  { icon: Route, step: '04', title: '배차·경로 추천', desc: '운영 데이터 기반 추천 로직을 개발 중입니다.', part: '150·160' },
  { icon: FileText, step: '05', title: '수거이력·출력', desc: '수거대장 미리보기 및 출력 기능을 고도화할 예정입니다.', part: '170·180' },
]

const TIMELINE: { icon: LucideIcon; tag: string; title: string; desc: string }[] = [
  {
    icon: FlaskConical,
    tag: '특허출원 기반 기술개발',
    title: '의료폐기물 수거·운반 경로 최적화 시스템',
    desc: '출원번호 10-2026-0101187 · 출원일 2026.06.04 · 출원인 주식회사 비원미래',
  },
  {
    icon: Database,
    tag: '연구개발전담부서 운영',
    title: '데이터 기반 통합관리 시스템 개발',
    desc: '2026.04.20 설립 · 연구전담요원 1명 운영 · 수거·운반 및 자재·이력 통합관리 연구',
  },
  {
    icon: Layers,
    tag: 'MVP 시연 화면 보유',
    title: '운영관리 화면 구현',
    desc: '거래처 관리 · 배차·경로 · 수거이력 · 자재관리 · 미수금 관리 화면을 구현했습니다.',
  },
  {
    icon: TrendingUp,
    tag: '실증지표 검증 예정',
    title: '개선효과 검증 예정',
    desc: '운행거리·유류비·근로시간·자재 추가방문 건수·수거대장 작성시간을 실증지표로 검증할 예정입니다.',
  },
]

const GROWTH = [
  '기존 거래처 운영 데이터 축적',
  '서울·경기권 병원·요양병원·의원·요양시설 신규 거래처 확대',
  '병원 소모품 공급 및 자재관리 고도화',
  '배출자 교육·수거대장 제공·운영 리포트 등 부가 서비스 확대',
  '장기적으로 의료기관 폐기물 운영관리 전문기업으로 성장',
]

const ROUTE_STOPS = ['남양주', '구리', '서울 노원', '서울 중랑', '처리장 인계']

// ── 공용 소섹션 ──────────────────────────────────────────────────────────────
function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-20 lg:py-24 ${className}`}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

/** 스크롤 진입 시 부드럽게 등장 (prefers-reduced-motion 시 즉시 표시) */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <p className={`text-base font-bold uppercase tracking-wide ${light ? 'text-teal-300' : 'text-teal-600'}`}>{children}</p>
}

function Heading({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <h2 className={`mt-3 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight sm:text-[2.3rem] lg:text-[2.7rem] ${light ? 'text-white' : 'text-navy-900'}`}>
      {children}
    </h2>
  )
}

/** 문자 없는 추상 브랜드 마크 — 데이터/운송 흐름(점·선) */
function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-teal-50 ring-1 ring-teal-100 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M11 24 L20 13 L29 20" stroke="#93c5fd" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="11" cy="24" r="3.6" fill="#3182f6" />
        <circle cx="20" cy="13" r="3.6" fill="#2563eb" />
        <circle cx="29" cy="20" r="3" fill="#0f1a2e" />
      </svg>
    </span>
  )
}

/**
 * 현장 이미지 슬롯 — 실제 사진(frame.src)이 있으면 사진을, 없으면 실사형 placeholder 프레임을 렌더.
 * 추후 public 또는 src/assets 이미지를 frame.src 로 넣으면 그대로 교체됩니다.
 */
function ImageSlot({ frame, className = '', hideCaption = false }: { frame: FieldFrame; className?: string; hideCaption?: boolean }) {
  const Icon = frame.icon
  const [failed, setFailed] = useState(false)
  const showImg = Boolean(frame.src) && !failed
  return (
    <figure className={`group relative overflow-hidden rounded-2xl bg-navy-900 shadow-card ring-1 ring-navy-100 ${className}`}>
      {showImg ? (
        <img
          src={frame.src}
          alt={frame.alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        // 실제 이미지가 아직 없을 때만 실사형 placeholder (navy 프레임 + 아이콘)
        <div className="absolute inset-0" role="img" aria-label={frame.alt}>
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 via-navy-800 to-navy-950" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, black 30%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, black 30%, transparent 100%)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-white/15">
              <Icon size={30} strokeWidth={1.9} />
            </span>
          </div>
        </div>
      )}
      {/* 하단 캡션 바 — 사진을 가리지 않는 얇은 그라데이션 */}
      {!hideCaption && (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-navy-950/80 via-navy-950/30 to-transparent p-4 pt-12">
          <span className="h-2 w-2 shrink-0 rounded-full bg-teal-400" />
          <span className="text-[15px] font-bold text-white">{frame.title}</span>
        </figcaption>
      )}
    </figure>
  )
}

// ── 카운트업 숫자 ────────────────────────────────────────────────────────────
function CountNumber({ to, run }: { to: number; run: boolean }) {
  const reduced = useReducedMotion()
  const [val, setVal] = useState(reduced ? to : 0)
  useEffect(() => {
    if (reduced) { setVal(to); return }
    if (!run) return
    let raf = 0
    let startTs = 0
    const dur = 1100
    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const p = Math.min(1, (ts - startTs) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, to, reduced])
  return <>{val}</>
}

// ── 히어로 플로팅 운영현황 카드 (컴팩트) ─────────────────────────────────────
//  · 큰 현장 이미지 위에 겹쳐지는 작은 카드 — 핵심만 선명하게
function HeroStatusCard() {
  const reduced = useReducedMotion()
  return (
    <div style={reduced ? undefined : { animation: 'bmFloat 6.5s ease-in-out infinite' }}>
      <style>{`@keyframes bmFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }`}</style>
      <div className="w-[15.5rem] rounded-2xl bg-white p-4 shadow-[0_24px_60px_-18px_rgba(15,26,46,0.5)] ring-1 ring-navy-100 sm:w-[18rem] sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark size={30} />
            <p className="text-[15px] font-extrabold text-navy-900">오늘 운영 현황</p>
          </div>
          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-500">예시</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-navy-50 p-3">
            <p className="text-[12px] font-semibold text-navy-500">오늘 수거</p>
            <p className="mt-0.5 text-2xl font-extrabold text-navy-900">10건</p>
          </div>
          <div className="rounded-xl bg-rose-50 p-3">
            <p className="text-[12px] font-semibold text-rose-500">긴급 수거</p>
            <p className="mt-0.5 text-2xl font-extrabold text-rose-500">1건</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-navy-100">
          <span className="text-[13px] font-bold tabular-nums text-navy-500">09:40</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-navy-900">별내우리요양병원</span>
          <span className="shrink-0 rounded-md bg-teal-50 px-2 py-0.5 text-[12px] font-bold text-teal-600">기저귀</span>
        </div>
        <div className="mt-2.5 flex gap-1.5">
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-bold text-rose-500">의료폐기물 분리</span>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-bold text-teal-600">기저귀 분리</span>
        </div>
      </div>
    </div>
  )
}

// ── 배차·경로 시뮬레이션 그래픽 (SVG) ────────────────────────────────────────
function RouteGraphic() {
  const reduced = useReducedMotion()
  const pts = [
    { x: 60, y: 72 },
    { x: 230, y: 50 },
    { x: 400, y: 82 },
    { x: 570, y: 52 },
    { x: 740, y: 72 },
  ]
  const d = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy-100 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <Navigation size={18} strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-sm font-extrabold text-navy-900">배차·경로 추천 시뮬레이션</p>
            <p className="text-[12px] text-navy-400">서울·경기권 권역 · 운영 데이터 기반 추천 로직 개발 중</p>
          </div>
        </div>
        <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[11px] font-bold text-navy-500">개발 중</span>
      </div>

      <svg viewBox="0 0 800 140" className="h-auto w-full" role="img" aria-label="남양주에서 서울·경기권을 거쳐 처리장으로 인계되는 수거 동선 시뮬레이션">
        <defs>
          <pattern id="hpgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="rgba(15,26,46,0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="800" height="140" fill="url(#hpgrid)" />

        {/* 경로 베이스 라인 */}
        <path d={d} fill="none" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* 그려지는 라인 */}
        <motion.path
          id="routePath"
          d={d}
          fill="none"
          stroke="#3182f6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={reduced ? undefined : { pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.8, ease: EASE }}
        />

        {/* 노드 */}
        {pts.map((p, i) => (
          <g key={i}>
            <motion.circle
              cx={p.x}
              cy={p.y}
              r="7"
              fill="#ffffff"
              stroke={i === pts.length - 1 ? '#0f1a2e' : '#3182f6'}
              strokeWidth="3"
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              whileInView={reduced ? undefined : { scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, ease: EASE, delay: 0.2 + i * 0.28 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            />
            <text x={p.x} y={128} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: '#5b6677' }}>
              {ROUTE_STOPS[i]}
            </text>
          </g>
        ))}

        {/* 이동 점 (reduced motion 시 생략) */}
        {!reduced && (
          <circle r="6" fill="#2563eb">
            <animateMotion dur="5s" repeatCount="indefinite" rotate="auto" path={d} />
          </circle>
        )}
      </svg>
    </div>
  )
}

// ── 상담 문의 폼 (프론트 전용 — 백엔드 미연동) ───────────────────────────────
const CLIENT_TYPE_OPTIONS = ['병원', '요양병원', '의원', '치과', '한의원·한방병원', '요양시설', '장례식장', '기타']
const INQUIRY_TYPES = ['정기 수거 상담', '추가 수거 문의', '자재공급 문의', '수거대장·이력 문의', '기타']

function ConsultForm() {
  const [form, setForm] = useState({ inquiry: '정기 수거 상담', org: '', manager: '', contact: '', region: '', type: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'invalid' | 'done'>('idle')
  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setStatus((s) => (s === 'idle' ? s : 'idle'))
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.org.trim() || !form.manager.trim() || !form.contact.trim() || !form.type) {
      setStatus('invalid')
      return
    }
    setStatus('done')
  }
  const field = 'w-full rounded-lg bg-navy-50 px-4 py-3 text-[15px] font-medium text-navy-900 outline-none ring-1 ring-transparent transition placeholder:font-normal placeholder:text-navy-400 focus:bg-white focus:ring-2 focus:ring-teal-400'
  const label = 'mb-1.5 block text-[14px] font-bold text-navy-700'
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy-100 sm:p-8" noValidate>
      {/* 문의 유형 칩 */}
      <p className={label}>문의 유형</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {INQUIRY_TYPES.map((t) => {
          const on = form.inquiry === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, inquiry: t }))}
              className={`rounded-full px-4 py-2 text-[14px] font-bold transition ${on ? 'bg-teal-500 text-white shadow-sm' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'}`}
            >
              {t}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="cf-org">기관명 <span className="text-rose-500">*</span></label>
          <input id="cf-org" className={field} value={form.org} onChange={upd('org')} placeholder="예: 다산365의원" />
        </div>
        <div>
          <label className={label} htmlFor="cf-manager">담당자명 <span className="text-rose-500">*</span></label>
          <input id="cf-manager" className={field} value={form.manager} onChange={upd('manager')} placeholder="담당자 성함" />
        </div>
        <div>
          <label className={label} htmlFor="cf-contact">연락처 <span className="text-rose-500">*</span></label>
          <input id="cf-contact" className={field} value={form.contact} onChange={upd('contact')} placeholder="연락 가능한 전화 또는 이메일" />
        </div>
        <div>
          <label className={label} htmlFor="cf-region">지역</label>
          <input id="cf-region" className={field} value={form.region} onChange={upd('region')} placeholder="예: 경기 남양주시" />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="cf-type">배출기관 유형 <span className="text-rose-500">*</span></label>
          <select id="cf-type" className={field} value={form.type} onChange={upd('type')}>
            <option value="">선택해 주세요</option>
            {CLIENT_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="cf-message">문의 내용</label>
          <textarea id="cf-message" rows={4} className={`${field} resize-none`} value={form.message} onChange={upd('message')} placeholder="수거 주기, 폐기물 종류, 자재공급 필요 여부 등을 남겨주세요." />
        </div>
      </div>

      {status === 'invalid' && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-[14px] font-semibold text-rose-600">
          기관명·담당자명·연락처·배출기관 유형을 입력해 주세요.
        </p>
      )}
      {status === 'done' && (
        <p className="mt-4 rounded-lg bg-teal-50 px-4 py-3 text-[14px] font-semibold text-teal-700">
          상담 문의 기능은 연동 준비 중입니다. 입력하신 내용을 확인 후 실제 문의 연동 시 사용할 수 있도록 구성되었습니다.
        </p>
      )}

      <button
        type="submit"
        className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-6 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 sm:w-auto"
      >
        상담 내용 확인하기 <ArrowRight size={19} strokeWidth={2.4} />
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-navy-400">
        입력하신 정보는 상담 연동 준비를 위한 화면 구성 용도로만 사용되며, 현재는 외부로 전송되지 않습니다.
      </p>
    </form>
  )
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export function CompanyHomePage() {
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [statsRun, setStatsRun] = useState(false)
  const statsRef = useRef(false)

  // SEO — 홈페이지 진입 시 문서 타이틀/설명 지정, 이탈 시 복원
  useEffect(() => {
    const prevTitle = document.title
    document.title = '주식회사 비원미래 | 의료폐기물 수거·운반 통합 운영관리'
    const meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content') ?? ''
    meta?.setAttribute(
      'content',
      '주식회사 비원미래(BEONE MIRAE CO.)는 서울·경기권 의료폐기물 수거·운반과 데이터 기반 통합 운영관리 시스템을 개발하는 의료폐기물 운영관리 전문기업입니다.',
    )
    return () => {
      document.title = prevTitle
      meta?.setAttribute('content', prevDesc)
    }
  }, [])

  const goSystem = () => navigate('/')

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-navy-700">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur-lg">
        <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5" aria-label="주식회사 비원미래 홈">
            <BrandMark size={40} />
            <span className="leading-tight">
              <span className="block text-[17px] font-extrabold tracking-tight text-navy-900">주식회사 비원미래</span>
              <span className="block text-[12px] font-semibold tracking-wide text-navy-400">BEONE MIRAE CO.</span>
            </span>
          </a>

          {/* 데스크톱 내비 */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-2 text-base font-bold text-navy-600 transition-colors hover:bg-navy-50 hover:text-teal-600"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
            >
              수거 상담 <ArrowRight size={18} strokeWidth={2.4} />
            </a>
          </div>

          {/* 모바일 햄버거 */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-navy-700 transition hover:bg-navy-50 lg:hidden"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* 모바일 메뉴 패널 */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden border-t border-navy-100 bg-white lg:hidden"
            >
              <nav className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2 sm:px-6">
                {NAV.map((n) => (
                  <a
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-3 text-[15px] font-bold text-navy-700 transition hover:bg-navy-50"
                  >
                    {n.label}
                  </a>
                ))}
                <a
                  href="#contact"
                  onClick={() => setMenuOpen(false)}
                  className="mb-3 mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-teal-600"
                >
                  수거 상담 <ArrowRight size={18} strokeWidth={2.4} />
                </a>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="top">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-navy-100 bg-gradient-to-b from-navy-50 to-white">
          {/* 은은한 grid 배경 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(15,26,46,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,26,46,0.04) 1px, transparent 1px)',
              backgroundSize: '34px 34px',
              maskImage: 'radial-gradient(ellipse 90% 80% at 70% 10%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 70% 10%, black 40%, transparent 100%)',
            }}
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-start gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:py-24">
            <motion.div
              className="lg:pt-6"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-teal-600 shadow-card ring-1 ring-navy-100">
                <Recycle size={16} /> 서울·경기권 의료폐기물 수거·운반 전문기업
              </div>
              <h1 className="mt-5 text-[1.75rem] font-extrabold leading-[1.16] tracking-tight text-navy-900 sm:text-[2.4rem] lg:text-[3rem]">
                <span className="block">병원 의료폐기물 수거·운반,</span>
                <span className="block"><span className="text-teal-600">비원미래</span>가 현장부터 관리합니다</span>
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-navy-600 sm:text-lg">
                서울·경기권 병원·요양병원·의원 등 배출기관의 의료폐기물 수거·운반을 수행하며, 폐기물 종류별 분리 운행부터
                자재공급·수거이력·수거대장·배차 데이터까지 함께 관리하는 운영관리 시스템을 개발하고 있습니다.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-7 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
                >
                  정기 수거 상담하기 <ArrowRight size={19} strokeWidth={2.4} />
                </a>
                <button
                  onClick={goSystem}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-7 py-4 text-[17px] font-bold text-navy-700 ring-1 ring-navy-200 transition hover:-translate-y-0.5 hover:bg-navy-50"
                >
                  운영관리 시스템 보기 <ArrowRight size={19} strokeWidth={2.4} />
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {HERO_BADGES.map((b) => (
                  <span key={b} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-navy-600 shadow-card ring-1 ring-navy-100">
                    {b}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* 큰 현장 이미지 + 겹치는 운영 현황 카드 */}
            <div className="relative">
              <ImageSlot frame={HERO_FIELD} hideCaption className="aspect-[4/5] shadow-xl sm:aspect-[4/3] lg:aspect-[5/6]" />
              {/* 좌하단 겹침 상태 카드 */}
              <div className="absolute -bottom-5 left-3 z-10 sm:-bottom-6 sm:left-5">
                <HeroStatusCard />
              </div>
              {/* 우상단 캡션 칩 */}
              <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-navy-900/85 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm sm:left-4 sm:top-4">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> 의료폐기물 전용 수거 차량 · 수거 준비
              </div>
            </div>
          </div>
        </section>

        {/* ── 고객 편익: 맡기면 편해지는 일 (상담) ────────────────────────────── */}
        <Section>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <ImageSlot frame={IMG.consultation} hideCaption className="aspect-[4/3] shadow-lg" />
            </Reveal>
            <Reveal delay={0.05}>
              <Eyebrow>의료기관이 맡기면 편해지는 일</Eyebrow>
              <Heading>수거 조건부터 자재 요청까지 함께 확인합니다</Heading>
              <p className="mt-5 text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                기관 유형, 수거 주기, 배출량, 자재공급 필요 여부를 확인해 의료기관별 운영 조건에 맞춰 상담합니다.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  { t: '정기 수거 주기 설계', d: '병원·요양병원·의원 유형과 배출량에 맞춰 방문 주기를 정합니다.', tone: 'bg-emerald-50 text-emerald-600' },
                  { t: '자재공급까지 함께', d: '전용 용기·봉투·박스 공급을 수거 흐름에 포함해 별도 방문을 줄입니다.', tone: 'bg-teal-50 text-teal-600' },
                  { t: '추가·긴급 수거 대응', d: '실사·인증 전 추가 수거 요청도 누락 없이 관리합니다.', tone: 'bg-amber-50 text-amber-600' },
                ].map((it) => (
                  <li key={it.t} className="flex items-start gap-3.5 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy-100">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${it.tone}`}>
                      <CheckCircle2 size={20} strokeWidth={2.3} />
                    </span>
                    <div>
                      <p className="text-lg font-bold text-navy-900">{it.t}</p>
                      <p className="mt-1 text-base leading-relaxed text-navy-600">{it.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Section>

        {/* ── 중간 CTA 밴드 (진한 배경) ─────────────────────────────────────── */}
        <div className="bg-navy-900">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-5 px-5 py-12 sm:px-6 lg:flex-row lg:px-8">
            <p className="text-center text-[20px] font-extrabold leading-snug text-white sm:text-2xl lg:text-left">
              우리 병원 수거 조건에 맞는 정기 수거가 필요하신가요?
            </p>
            <a
              href="#contact"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-7 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600"
            >
              수거 가능 여부 문의 <ArrowRight size={19} strokeWidth={2.4} />
            </a>
          </div>
        </div>

        {/* ── 운영 기반 숫자 ────────────────────────────────────────────────── */}
        <Section id="about" className="pt-16 sm:pt-20">
          <Reveal>
            <Eyebrow>운영 기반</Eyebrow>
            <Heading>현장 데이터로 운영되는 회사입니다</Heading>
            <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-navy-700 sm:text-lg">
              남양주를 기반으로 서울·경기권 의료기관을 중심으로 운영하고 있습니다. 현재 권역 내 정기 수거 체계를 안정적으로
              운영하며, 거래처 확대에 맞춰 운행 데이터를 축적하고 있습니다.
            </p>
          </Reveal>
          <motion.div
            className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onViewportEnter={() => {
              if (!statsRef.current) {
                statsRef.current = true
                setStatsRun(true)
              }
            }}
            viewport={{ once: true, margin: '-60px' }}
          >
            {STATS.map((s, i) => {
              const Icon = s.icon
              return (
                <Reveal key={s.label} delay={i * 0.08}>
                  <div className="group h-full rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-lg transition ${TONE_CHIP[s.tone]}`}>
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                    <p className="mt-4 text-[2.1rem] font-extrabold tracking-tight text-navy-900">
                      {s.prefix}
                      {s.count !== null ? <CountNumber to={s.count} run={statsRun} /> : s.text}
                      {s.suffix}
                    </p>
                    <p className="mt-1.5 text-lg font-bold text-navy-800">{s.label}</p>
                    <p className="mt-1 text-base leading-snug text-navy-600">{s.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </motion.div>

          <Reveal className="mt-4">
            <p className="rounded-2xl bg-navy-50 px-5 py-4 text-[15px] leading-relaxed text-navy-600 sm:text-base">
              현재 폐기물 종류별 차량을 운영하며, 향후 거래처 확대에 맞춰 운행 체계와 운영관리 데이터를 고도화할 계획입니다.
            </p>
          </Reveal>

          {/* 신뢰 요소 스트립 */}
          <Reveal className="mt-4">
            <div className="flex flex-wrap gap-2.5">
              {[
                { icon: FlaskConical, t: '특허출원 기반 시스템 개발' },
                { icon: Database, t: '연구개발전담부서 운영' },
                { icon: Route, t: '배차·경로 추천 로직 개발 중' },
              ].map(({ icon: Ico, t }) => (
                <span key={t} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[15px] font-bold text-navy-700 shadow-card ring-1 ring-navy-100">
                  <Ico size={17} className="text-teal-600" strokeWidth={2.2} /> {t}
                </span>
              ))}
            </div>
          </Reveal>

          {/* 배차·경로 시뮬레이션 그래픽 */}
          <Reveal className="mt-6">
            <RouteGraphic />
          </Reveal>
        </Section>

        {/* ── 문제 정의 ─────────────────────────────────────────────────────── */}
        <div className="bg-navy-50">
          <Section>
            <Reveal>
              <Eyebrow>현장 특수성</Eyebrow>
              <Heading>의료폐기물 수거·운반은 단순 일정관리로 해결되지 않습니다</Heading>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
                배출기관마다 조건이 다르고, 폐기물 종류와 처리 흐름이 달라 현장 특수성을 반영한 운영관리가 필요합니다.
              </p>
            </Reveal>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((p, i) => {
                const Icon = p.icon
                return (
                  <Reveal key={p.title} delay={i * 0.06}>
                    <div className="group h-full rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-700 transition group-hover:bg-navy-900 group-hover:text-teal-300">
                        <Icon size={20} strokeWidth={2.2} />
                      </span>
                      <p className="mt-4 text-[17px] font-bold text-navy-900">{p.title}</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-navy-600">{p.desc}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </Section>
        </div>

        {/* ── 대표 현장 이미지 밴드 ─────────────────────────────────────────── */}
        <div className="bg-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
            <Reveal>
              <figure className="relative overflow-hidden rounded-3xl shadow-xl ring-1 ring-navy-100">
                <ImageSlot
                  frame={IMG.band}
                  hideCaption
                  className="aspect-[3/4] rounded-none ring-0 shadow-none sm:aspect-[16/9] lg:aspect-[21/9]"
                />
                <figcaption className="absolute inset-0 flex items-end bg-gradient-to-t from-navy-950/85 via-navy-950/25 to-transparent p-6 sm:p-9 lg:p-12">
                  <div className="max-w-2xl">
                    <p className="text-[13px] font-bold uppercase tracking-wide text-teal-300">현장 → 데이터</p>
                    <h2 className="mt-2 text-[1.65rem] font-extrabold leading-[1.18] tracking-tight text-white sm:text-[2.2rem] lg:text-[2.5rem]">
                      수거 현장에서 시작해, 운영 데이터로 연결합니다
                    </h2>
                    <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-navy-100 sm:text-[17px]">
                      비원미래는 의료기관별 수거주기, 폐기물 종류, 자재 요청, 차량 운행, 수거이력을 현장에서 확인하고 이를
                      운영관리 데이터로 구조화하고 있습니다.
                    </p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>

        {/* ── 서비스 ────────────────────────────────────────────────────────── */}
        <Section id="services">
          <Reveal>
            <Eyebrow>서비스</Eyebrow>
            <Heading>이런 의료기관과 함께합니다</Heading>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
              정기 수거부터 분리 운행, 자재공급·수거대장·미수금 관리까지 — 의료기관의 폐기물 운영을 한 곳에서 지원합니다.
            </p>
          </Reveal>

          {/* 대상 고객(상황) 칩 */}
          <Reveal className="mt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SERVICE_FITS.map((t) => (
                <div key={t} className="flex items-center gap-3 rounded-xl bg-navy-50 px-5 py-4 ring-1 ring-navy-100">
                  <CheckCircle2 size={20} className="shrink-0 text-teal-500" strokeWidth={2.2} />
                  <p className="text-[16px] font-semibold text-navy-800">{t}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* 이미지 + 텍스트 좌우 split 3종 (좌우 교차) */}
          <div className="mt-12 space-y-12 sm:space-y-16">
            {[
              {
                img: IMG.smallClinic,
                tag: '의원급 정기 수거',
                tone: 'bg-teal-50 text-teal-600',
                title: '의원급 의료기관도 정기 수거 기준에 맞춰 관리합니다',
                desc: '격주 수거가 많은 의원급 거래처도 보관기한, 전용 용기, 방문 일정이 누락되지 않도록 관리합니다.',
              },
              {
                img: IMG.supply,
                tag: '자재·전용 용기 공급',
                tone: 'bg-amber-50 text-amber-600',
                title: '전용 용기와 자재 공급도 운영 흐름에 포함합니다',
                desc: '전용 용기, 봉투, 박스 등 자재 요청과 공급 주기를 함께 확인해 별도 방문과 누락을 줄이는 방향으로 관리합니다.',
              },
              {
                img: IMG.record,
                tag: '수거대장·이력 관리',
                tone: 'bg-emerald-50 text-emerald-600',
                title: '수거이력과 대장 요청도 더 쉽게 확인할 수 있도록',
                desc: '수거 완료 내역, 자재공급 기록, 병원 요청 자료를 거래처 단위로 정리하는 구조를 고도화하고 있습니다.',
              },
            ].map((f, i) => (
              <Reveal key={f.title}>
                <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
                  <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                    <ImageSlot frame={f.img} hideCaption className="aspect-[16/10] shadow-lg" />
                  </div>
                  <div className={i % 2 === 1 ? 'lg:order-1' : ''}>
                    <span className={`inline-block rounded-full px-3.5 py-1.5 text-sm font-bold ${f.tone}`}>{f.tag}</span>
                    <h3 className="mt-3 text-[1.5rem] font-extrabold leading-snug tracking-tight text-navy-900 sm:text-[1.85rem]">
                      {f.title}
                    </h3>
                    <p className="mt-4 text-[17px] leading-relaxed text-navy-700 sm:text-lg">{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => {
              const Icon = s.icon
              const sTone = ['teal', 'teal', 'amber', 'emerald', 'navy', 'teal'][i] ?? 'teal'
              return (
                <Reveal key={s.title} delay={i * 0.05}>
                  <div className="group flex h-full flex-col rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-lg transition ${TONE_CHIP[sTone]}`}>
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold text-navy-900">{s.title}</p>
                      {s.soon && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-600">개발 중</span>
                      )}
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-navy-600">{s.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </Section>

        {/* ── 통합 운영관리 시스템 흐름 ─────────────────────────────────────── */}
        <div className="relative overflow-hidden bg-navy-900 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '38px 38px',
              maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 30%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 30%, transparent 100%)',
            }}
          />
          <Section id="system" className="relative">
            <Reveal>
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
                <div>
                  <Eyebrow light>운영관리 시스템</Eyebrow>
                  <Heading light>현장 관리를 더 정확하게 하기 위한 운영관리 시스템</Heading>
                  <p className="mt-4 text-[17px] leading-relaxed text-navy-100 sm:text-lg">
                    비원미래는 수거조건, 차량 운행, 처리장 인계시간, 자재 요청, 수거이력 데이터를 체계적으로 관리하기 위해
                    운영관리 시스템을 개발하고 있습니다. 실제 운행 데이터를 축적하며 배차·경로 추천 로직과 수거대장 출력
                    기능을 고도화할 계획입니다.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-4 py-2 text-[15px] font-bold text-teal-200 ring-1 ring-teal-400/30">
                    <Navigation size={17} strokeWidth={2.3} /> 배차·경로 추천 시뮬레이션 개발 중
                  </span>
                </div>
                <ImageSlot
                  frame={IMG.route}
                  hideCaption
                  className="aspect-[16/10] ring-white/10"
                />
              </div>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
              {FLOW.map((f, i) => {
                const Icon = f.icon
                const active = f.step === '04'
                return (
                  <Reveal key={f.step} delay={i * 0.1}>
                    <div className={`relative h-full rounded-xl p-5 ring-1 transition duration-300 hover:-translate-y-1 ${active ? 'bg-teal-500/[0.12] ring-teal-400/40' : 'bg-white/[0.05] ring-white/10 hover:bg-white/[0.08]'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`relative flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-teal-500 text-white' : 'bg-white/10 text-teal-300'}`}>
                          <Icon size={20} strokeWidth={2.2} />
                          {active && !reduced && (
                            <motion.span
                              className="absolute inset-0 rounded-lg ring-2 ring-teal-400"
                              animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                            />
                          )}
                        </span>
                        <span className="text-base font-black text-white/30">{f.step}</span>
                      </div>
                      <p className="mt-4 text-lg font-bold text-white">{f.title}</p>
                      <p className="mt-2 text-[15px] leading-relaxed text-navy-100">{f.desc}</p>
                      <span className="mt-3 inline-block rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-bold text-teal-200">
                        구성요소 {f.part}
                      </span>
                      {/* 연결선 (데스크톱) */}
                      {i < FLOW.length - 1 && (
                        <ArrowRight size={18} className="absolute -right-[11px] top-9 z-10 hidden text-teal-400/50 lg:block" />
                      )}
                    </div>
                  </Reveal>
                )
              })}
            </div>

            <p className="mt-6 text-sm text-navy-200">
              ※ 배차·경로 추천은 운영 데이터 기반 추천 로직을 개발 중이며, 개선효과는 실증지표로 검증할 예정입니다.
            </p>

            <div className="mt-8">
              <button
                onClick={goSystem}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600"
              >
                운영관리 시스템 보기 <ArrowRight size={18} strokeWidth={2.4} />
              </button>
            </div>
          </Section>
        </div>

        {/* ── 분리 운행 차별화 (split panel) ────────────────────────────────── */}
        <Section>
          <Reveal>
            <div className="text-center">
              <Eyebrow>차별화</Eyebrow>
              <Heading>폐기물 종류에 따라 운행과 관리 방식이 달라집니다</Heading>
              <p className="mx-auto mt-4 max-w-3xl text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                의료기관에서는 의료폐기물 외에도 별도 관리가 필요한 배출물이 함께 발생할 수 있습니다. 특히 의료기관
                일회용기저귀는 의료폐기물과 차량·관리체계·처리 흐름이 달라 분리 운행과 이력관리가 필요합니다. 비원미래는
                이러한 현장 특수성을 반영해 폐기물 종류별 수거조건과 운행 흐름을 구분해 관리합니다.
              </p>
            </div>
          </Reveal>

          <Reveal className="mt-10">
            <ImageSlot frame={IMG.separated} hideCaption className="aspect-[21/9]" />
          </Reveal>

          <Reveal className="mt-6" delay={0.05}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 의료폐기물 */}
              <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-rose-100 sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                    <Syringe size={22} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-xl font-extrabold text-navy-900">의료폐기물</p>
                    <p className="text-[14px] font-medium text-navy-600">전용 관리체계</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {['보관기한 관리', '전용 용기', '수거대장', '처리장 인계'].map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-lg bg-rose-50/60 px-3.5 py-3 text-base font-semibold text-navy-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 관련 배출물 */}
              <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-teal-100 sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Boxes size={22} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-xl font-extrabold text-navy-900">관련 배출물</p>
                    <p className="text-[14px] font-medium text-navy-600">의료기관 일회용기저귀 등 별도 관리</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {['별도 차량', '별도 관리체계', '기관 요청 대응', '자재공급 연계'].map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-lg bg-teal-50/60 px-3.5 py-3 text-base font-semibold text-navy-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-navy-900 px-6 py-6 text-center">
              <p className="text-xl font-bold text-white sm:text-2xl">
                같은 병원에서 발생해도 차량·관리체계·처리 흐름은 <span className="text-teal-300">분리</span>됩니다
              </p>
              <p className="mx-auto mt-3 max-w-3xl text-base leading-relaxed text-navy-100 sm:text-[17px]">
                비원미래는 한 업체가 여러 흐름을 함께 관리하되, 폐기물 종류별 차량·수거조건·자재공급·처리장 정보를 분리해
                관리하는 구조를 개발하고 있습니다.
              </p>
            </div>
          </Reveal>
        </Section>

        {/* ── 기술개발/특허/연구조직 (timeline) ─────────────────────────────── */}
        <div className="bg-navy-50">
          <Section id="tech">
            <Reveal>
              <Eyebrow>기술개발</Eyebrow>
              <Heading>더 정확한 수거·운영관리를 위한 기술개발</Heading>
              <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                고객에게 더 정확한 수거·운영관리를 제공하기 위해, 특허출원과 연구개발전담부서를 기반으로 운영관리 시스템을
                단계적으로 개발하고 있습니다. 실제 운행 데이터를 축적하며 현장 관리 정확도를 높여가고 있습니다.
              </p>
            </Reveal>

            <div className="relative mt-10">
              {/* 세로 타임라인 라인 */}
              <div aria-hidden className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-navy-200 sm:left-[23px]" />
              <div className="space-y-4">
                {TIMELINE.map((t, i) => {
                  const Icon = t.icon
                  return (
                    <Reveal key={t.tag} delay={i * 0.08}>
                      <div className="relative flex gap-4 sm:gap-5">
                        <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-teal-600 shadow-card ring-1 ring-navy-100 sm:h-12 sm:w-12">
                          <Icon size={20} strokeWidth={2.2} />
                        </span>
                        <div className="flex-1 rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                          <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-600">{t.tag}</span>
                          <p className="mt-2.5 text-[17px] font-bold text-navy-900">{t.title}</p>
                          <p className="mt-1.5 text-[15px] leading-relaxed text-navy-600">{t.desc}</p>
                        </div>
                      </div>
                    </Reveal>
                  )
                })}
              </div>
            </div>

            <p className="mt-6 text-sm leading-relaxed text-navy-500">
              ※ 개선효과는 실제 운행데이터 축적 후 실증지표로 검증할 예정이며, 확정된 수치가 아닙니다.
            </p>
          </Section>
        </div>

        {/* ── 성장 방향 ─────────────────────────────────────────────────────── */}
        <Section>
          <Reveal>
            <Eyebrow>성장 방향</Eyebrow>
            <Heading>서울·경기권 의료기관 운영지원 서비스로 확장합니다</Heading>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GROWTH.map((g, i) => (
              <Reveal key={g} delay={i * 0.05}>
                <div className="flex items-start gap-3 rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-0.5 hover:ring-teal-200">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-teal-500" strokeWidth={2.2} />
                  <p className="text-base leading-relaxed text-navy-700 sm:text-[17px]">{g}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── 상담 문의 ─────────────────────────────────────────────────────── */}
        <Section id="contact">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <Reveal>
              <Eyebrow>상담 문의</Eyebrow>
              <Heading>의료폐기물 정기 수거 상담을 남겨주세요</Heading>
              <p className="mt-4 text-[17px] leading-relaxed text-navy-600 sm:text-lg">
                배출기관 유형, 수거 주기, 폐기물 종류, 자재공급 필요 여부를 남겨주시면 상담에 필요한 정보를 정리해 확인할 수
                있습니다.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  '서울·경기권 병원·요양병원·의원 등 배출기관 대상',
                  '의료폐기물 · 의료기관 일회용기저귀 분리 운행',
                  '전용 용기·자재 공급부터 수거대장·미수금 관리까지',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[16px] font-medium text-navy-700">
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-500" strokeWidth={2.2} /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl bg-navy-50 p-5 text-[15px] text-navy-600">
                <p className="font-bold text-navy-900">주식회사 비원미래</p>
                <p className="mt-1">경기도 남양주시 오남읍 양지로 47-35, 바동 1층</p>
                <p className="mt-0.5">서울·경기권 의료폐기물 수거·운반 운영관리</p>
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <ConsultForm />
            </Reveal>
          </div>
        </Section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer id="contact-info" className="border-t border-navy-100 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark size={40} />
                <span className="leading-tight">
                  <span className="block text-[17px] font-extrabold tracking-tight text-navy-900">주식회사 비원미래</span>
                  <span className="block text-[12px] font-semibold tracking-wide text-navy-400">BEONE MIRAE CO.</span>
                </span>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-navy-500">
                데이터 기반 의료폐기물 수거·운반 및 통합 운영관리 시스템을 개발하는 의료폐기물 운영관리 전문기업입니다.
              </p>
            </div>

            <div className="text-[15px]">
              <p className="font-bold text-navy-900">사업장</p>
              <p className="mt-3 leading-relaxed text-navy-500">경기도 남양주시 오남읍 양지로 47-35, 바동 1층</p>
              <p className="mt-1 text-navy-500">서울·경기권 운영</p>
              <a
                href="#contact"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-4 py-3 text-[15px] font-bold text-navy-700 transition hover:bg-navy-100"
              >
                상담 문의하기 <ArrowRight size={16} strokeWidth={2.4} />
              </a>
            </div>

            <div className="text-[15px]">
              <p className="font-bold text-navy-900">주요 서비스</p>
              <ul className="mt-3 space-y-2 text-navy-500">
                <li>의료폐기물 수거·운반</li>
                <li>의료기관 일회용기저귀 수거·운반</li>
                <li>전용 용기·자재 공급</li>
                <li>운영관리 시스템 개발</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-navy-100 pt-6 text-[13px] text-navy-400">
            © {2026} 주식회사 비원미래 (BEONE MIRAE CO.) · 서울·경기권 의료폐기물 수거·운반 운영관리
          </div>
        </div>
      </footer>
    </div>
  )
}
