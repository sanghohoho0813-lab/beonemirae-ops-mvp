import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  Siren,
  Printer,
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

const HERO_BADGES = ['의료폐기물 수거·운반', '의료기관 일회용기저귀 분리 운행', '병원·요양병원 정기 수거', '서울·경기권 운영', '운영관리 시스템 개발 중']

// 현장 이미지 슬롯 — 실제 사진이 들어오면 src만 채우면 교체되는 구조
type FieldFrame = { icon: LucideIcon; title: string; alt: string; src?: string }
const HERO_FIELD: FieldFrame = { icon: Truck, title: '의료폐기물 전용 수거 차량', alt: '의료폐기물 전용 수거 차량 이미지' }
const FIELD_CARDS: { icon: LucideIcon; title: string; alt: string; desc: string; src?: string }[] = [
  { icon: Building2, title: '병원·요양병원·의원 수거 현장', alt: '병원 의료폐기물 수거 현장 이미지', desc: '병원별 수거주기와 보관기한을 고려해 정기적으로 의료폐기물을 수거·운반합니다.' },
  { icon: Truck, title: '의료폐기물·일회용기저귀 분리 운행', alt: '폐기물 종류별 분리 운행 이미지', desc: '폐기물 종류에 따라 차량·관리체계·처리 흐름을 분리해 운행합니다.' },
  { icon: Container, title: '자재공급·수거대장·미수금 관리', alt: '의료폐기물 전용 용기·자재 관리 이미지', desc: '전용 용기·봉투·박스 공급부터 수거대장·미수금까지 현장 운영을 함께 관리합니다.' },
]

const STATS: { icon: LucideIcon; prefix: string; count: number | null; text?: string; suffix: string; label: string; desc: string }[] = [
  { icon: Building2, prefix: '거래처 ', count: 49, suffix: '곳', label: '의료기관 배출기관', desc: '병원·요양병원·의원·요양시설 등' },
  { icon: Recycle, prefix: '월평균 ', count: 105, suffix: '톤', label: '수거·운반 규모', desc: '의료폐기물 40톤 + 일회용기저귀 65톤' },
  { icon: Truck, prefix: '차량 ', count: 5, suffix: '대', label: '폐기물 종류별 분리 운행', desc: '의료폐기물 3대 · 일회용기저귀 2대' },
  { icon: MapPin, prefix: '', count: null, text: '서울·경기권', suffix: '', label: '광역 운영', desc: '경기 남양주 기반 권역 운영' },
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
  return <p className={`text-[15px] font-bold uppercase tracking-wide ${light ? 'text-teal-300' : 'text-teal-600'}`}>{children}</p>
}

function Heading({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <h2 className={`mt-3 text-[1.7rem] font-extrabold leading-[1.15] tracking-tight sm:text-[2.1rem] lg:text-[2.4rem] ${light ? 'text-white' : 'text-navy-900'}`}>
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
function ImageSlot({ frame, className = '' }: { frame: FieldFrame; className?: string }) {
  const Icon = frame.icon
  return (
    <figure className={`group relative overflow-hidden rounded-2xl bg-navy-900 shadow-card ring-1 ring-navy-100 ${className}`}>
      {frame.src ? (
        <img src={frame.src} alt={frame.alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" role="img" aria-label={frame.alt}>
          {/* 실사형 프레임 — 어두운 navy 그라데이션 + 은은한 그리드 */}
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
          {/* 중앙 대형 아이콘 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-white/15 transition group-hover:scale-105">
              <Icon size={30} strokeWidth={1.9} />
            </span>
          </div>
        </div>
      )}
      {/* 하단 캡션 바 */}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-navy-950/85 to-transparent p-4 pt-10">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
        <span className="text-[13px] font-bold text-white sm:text-sm">{frame.title}</span>
      </figcaption>
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

// ── 히어로 콕핏 목업 (홈페이지 전용 정적 UI) ─────────────────────────────────
//  · 진입/플로팅은 순수 CSS 애니메이션 — 최종 상태(보임)를 항상 보장(프레이머 스케줄러 비의존)
function CockpitMockup() {
  const reduced = useReducedMotion()
  const enter = (i: number): CSSProperties =>
    reduced ? {} : { animation: 'bmFadeUp 0.5s ease-out both', animationDelay: `${0.12 + i * 0.1}s` }
  const schedule = [
    { t: '09:00', name: '다산365의원', kind: '의료', status: '완료', done: true },
    { t: '09:40', name: '별내우리요양병원', kind: '기저귀', status: '진행', done: false },
    { t: '10:10', name: '구리중앙내과의원', kind: '의료', status: '예정', done: false },
  ]
  return (
    <div className="w-full" style={reduced ? undefined : { animation: 'bmFloat 6.5s ease-in-out infinite' }}>
      <style>{`
        @keyframes bmFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bmFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes bmGrow { from { width: 0; } to { width: 67%; } }
      `}</style>
      <div className="rounded-2xl bg-white p-5 shadow-[0_24px_60px_-24px_rgba(15,26,46,0.35)] ring-1 ring-navy-100 sm:p-6">
        {/* 상단 바 */}
        <div style={enter(0)} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={34} />
            <div className="leading-tight">
              <p className="text-[16px] font-extrabold text-navy-900">오늘 운영 현황</p>
              <p className="text-[12px] font-semibold text-navy-400">beonemirae ops</p>
            </div>
          </div>
          <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[12px] font-bold text-navy-500">예시 운영 현황</span>
        </div>

        {/* 미니 지표 */}
        <div style={enter(1)} className="mt-4 grid grid-cols-3 gap-2.5">
          {[
            { k: '오늘 수거', v: '10건', tone: 'text-navy-900' },
            { k: '긴급', v: '1건', tone: 'text-rose-500' },
            { k: '자재요청', v: '4건', tone: 'text-amber-600' },
          ].map((m) => (
            <div key={m.k} className="rounded-xl bg-navy-50 p-3">
              <p className="text-[12px] font-semibold text-navy-500">{m.k}</p>
              <p className={`mt-0.5 text-2xl font-extrabold ${m.tone}`}>{m.v}</p>
            </div>
          ))}
        </div>

        {/* 오늘 수거 일정 */}
        <div style={enter(2)} className="mt-4">
          <p className="mb-2 text-[13px] font-bold text-navy-600">오늘 수거 일정</p>
          <div className="space-y-2">
            {schedule.map((s) => (
              <div key={s.name} className="flex items-center gap-2.5 rounded-xl bg-white p-2.5 ring-1 ring-navy-100">
                <span className="text-[13px] font-bold tabular-nums text-navy-500">{s.t}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-navy-900">{s.name}</span>
                <span className={`rounded-md px-2 py-1 text-[12px] font-bold ${s.kind === '의료' ? 'bg-rose-50 text-rose-500' : 'bg-teal-50 text-teal-600'}`}>
                  {s.kind}
                </span>
                <span className={`rounded-md px-2 py-1 text-[12px] font-bold ${s.done ? 'bg-emerald-50 text-emerald-600' : 'bg-navy-100 text-navy-500'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 배차 상태 */}
        <div style={enter(3)} className="mt-4 rounded-xl bg-navy-900 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck size={17} className="text-teal-300" />
              <span className="text-[14px] font-bold">1톤 A · 남양주 권역</span>
            </div>
            <span className="text-[14px] font-extrabold text-teal-300">적재율 67%</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-teal-400"
              style={reduced ? { width: '67%' } : { width: '67%', animation: 'bmGrow 1.1s ease-out both', animationDelay: '0.7s' }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-rose-500/25 px-2.5 py-1 text-[12px] font-bold text-rose-100">의료폐기물 분리</span>
            <span className="rounded-full bg-teal-500/25 px-2.5 py-1 text-[12px] font-bold text-teal-100">일회용기저귀 분리</span>
          </div>
        </div>

        {/* 알림 + 수거대장 */}
        <div style={enter(4)} className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 p-3">
            <Siren size={18} className="shrink-0 text-rose-500" />
            <p className="text-[13px] font-bold leading-tight text-rose-600">격리의료폐기물 보관기한 임박 · 긴급수거</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl bg-teal-50 p-3">
            <Printer size={18} className="shrink-0 text-teal-600" />
            <p className="text-[13px] font-bold leading-tight text-teal-700">수거대장 출력 예정</p>
          </div>
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
  const goDemo = () => navigate('/demo')

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
                className="rounded-lg px-3 py-2 text-[15px] font-bold text-navy-600 transition-colors hover:bg-navy-50 hover:text-teal-600"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={goDemo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
            >
              시스템 시연 보기 <ArrowRight size={17} strokeWidth={2.4} />
            </button>
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
                <button
                  onClick={() => { setMenuOpen(false); goDemo() }}
                  className="mb-3 mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-teal-600"
                >
                  시스템 시연 보기 <ArrowRight size={17} strokeWidth={2.4} />
                </button>
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
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-teal-600 shadow-card ring-1 ring-navy-100">
                <Recycle size={15} /> 의료폐기물 수거·운반 · 운영관리 전문기업
              </div>
              <h1 className="mt-5 text-[1.7rem] font-extrabold leading-[1.15] tracking-tight text-navy-900 sm:text-[2.1rem] lg:text-[2.5rem]">
                <span className="block">의료폐기물 수거·운반,</span>
                <span className="block">현장 운영까지</span>
                <span className="block"><span className="text-teal-600">데이터로 관리</span>합니다</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
                주식회사 비원미래는 서울·경기권 병원·요양병원·의원 등 배출기관의 의료폐기물과 의료기관 일회용기저귀
                수거·운반을 수행하며, 수거조건·차량·자재·이력 데이터를 통합 관리하는 운영관리 시스템을 개발하고 있습니다.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={goSystem}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
                >
                  운영관리 시스템 보기 <ArrowRight size={18} strokeWidth={2.4} />
                </button>
                <a
                  href="#services"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-6 py-3.5 text-base font-bold text-navy-700 ring-1 ring-navy-200 transition hover:-translate-y-0.5 hover:bg-navy-50"
                >
                  서비스 살펴보기
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {HERO_BADGES.map((b) => (
                  <span key={b} className="rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-navy-600 shadow-card ring-1 ring-navy-100">
                    {b}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* 현장 이미지 + 운영 현황 목업 */}
            <div className="space-y-5">
              <ImageSlot frame={HERO_FIELD} className="aspect-[16/9]" />
              <CockpitMockup />
              <div className="flex flex-wrap gap-2">
                {['서울·경기권 수거 운행', '폐기물 종류별 분리 운행', '수거이력 관리'].map((b) => (
                  <span key={b} className="rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-navy-600 shadow-card ring-1 ring-navy-100">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 현장에서 시작한 운영관리 ──────────────────────────────────────── */}
        <Section>
          <Reveal>
            <Eyebrow>현장 기반</Eyebrow>
            <Heading>현장에서 시작한 의료폐기물 운영관리</Heading>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
              의료폐기물 수거·운반은 단순 배송 업무가 아니라, 배출기관별 보관기한·수거주기·폐기물 종류·전용 용기·차량
              적재량·처리장 인계시간을 함께 관리해야 하는 현장 운영 업무입니다. 비원미래는 실제 수거·운반 현장에서 발생하는
              요청과 이력을 데이터로 구조화하고 있습니다.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {FIELD_CARDS.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08}>
                <div className="group h-full overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                  <ImageSlot frame={f} className="aspect-[16/10] rounded-b-none ring-0 shadow-none" />
                  <div className="p-6">
                    <p className="text-[15px] leading-relaxed text-navy-600">{f.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── 운영 기반 숫자 ────────────────────────────────────────────────── */}
        <Section id="about" className="pt-16 sm:pt-20">
          <Reveal>
            <Eyebrow>운영 기반</Eyebrow>
            <Heading>현장 데이터로 운영되는 회사입니다</Heading>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
              경기 남양주에 기반을 두고 서울·경기권 의료기관을 대상으로 실제 수거·운반을 운영하고 있습니다.
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
                  <div className="group h-full rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-50 text-teal-600 transition group-hover:bg-teal-500 group-hover:text-white">
                      <Icon size={24} strokeWidth={2.2} />
                    </span>
                    <p className="mt-4 text-[1.7rem] font-extrabold tracking-tight text-navy-900">
                      {s.prefix}
                      {s.count !== null ? <CountNumber to={s.count} run={statsRun} /> : s.text}
                      {s.suffix}
                    </p>
                    <p className="mt-1.5 text-base font-bold text-navy-700">{s.label}</p>
                    <p className="mt-1 text-sm leading-snug text-navy-500">{s.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </motion.div>

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

        {/* ── 서비스 ────────────────────────────────────────────────────────── */}
        <Section id="services">
          <Reveal>
            <Eyebrow>서비스</Eyebrow>
            <Heading>비원미래의 주요 서비스</Heading>
          </Reveal>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => {
              const Icon = s.icon
              return (
                <Reveal key={s.title} delay={i * 0.05}>
                  <div className="group flex h-full flex-col rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600 transition group-hover:bg-teal-500 group-hover:text-white">
                      <Icon size={22} strokeWidth={2.2} />
                    </span>
                    <div className="mt-4 flex items-center gap-2">
                      <p className="text-[17px] font-bold text-navy-900">{s.title}</p>
                      {s.soon && (
                        <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-500">확장 예정</span>
                      )}
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-navy-600">{s.desc}</p>
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
              <Eyebrow light>운영관리 시스템</Eyebrow>
              <Heading light>현장 데이터를 하나의 운영 흐름으로 연결합니다</Heading>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-100 sm:text-[17px]">
                거래처 정보부터 수거이력·출력까지, 의료폐기물 운영 데이터를 통합관리하는 흐름을 개발하고 있습니다. 각
                단계는 특허 구성요소와 연결됩니다.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3">
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
                      <p className="mt-4 text-[17px] font-bold text-white">{f.title}</p>
                      <p className="mt-2 text-[14px] leading-relaxed text-navy-100">{f.desc}</p>
                      <span className="mt-3 inline-block rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-teal-200">
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
              <Heading>같은 병원에서 나와도, 운영관리는 분리되어야 합니다</Heading>
              <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
                의료폐기물과 의료기관 일회용기저귀는 동일 의료기관에서 함께 발생할 수 있지만, 수거차량·관리체계·처리
                흐름이 달라 별도 운행과 이력관리가 필요합니다.
              </p>
            </div>
          </Reveal>

          <Reveal className="mt-10" delay={0.05}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 의료폐기물 */}
              <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-rose-100 sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                    <Syringe size={22} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-lg font-extrabold text-navy-900">의료폐기물</p>
                    <p className="text-[13px] font-medium text-navy-500">전용 관리체계</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {['전용 수거차량', '전용 처리장 인계', '보관기한·격리 조건 관리'].map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-lg bg-rose-50/60 px-3.5 py-2.5 text-[15px] font-semibold text-navy-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 일회용기저귀 */}
              <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-teal-100 sm:p-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Boxes size={22} strokeWidth={2.2} />
                  </span>
                  <div>
                    <p className="text-lg font-extrabold text-navy-900">의료기관 일회용기저귀</p>
                    <p className="text-[13px] font-medium text-navy-500">별도 관리체계</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {['별도 수거차량', '별도 처리 흐름', '분리 수거이력 관리'].map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-lg bg-teal-50/60 px-3.5 py-2.5 text-[15px] font-semibold text-navy-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-navy-900 px-6 py-5 text-center">
              <p className="text-[17px] font-bold text-white sm:text-xl">
                같은 병원에서 발생해도 차량·관리체계·처리 흐름은 <span className="text-teal-300">분리</span>됩니다
              </p>
              <p className="mt-2 text-sm leading-relaxed text-navy-100 sm:text-[15px]">
                비원미래는 한 업체가 두 흐름을 함께 관리하되, 폐기물 종류별 차량·수거조건·자재공급·처리장 정보를 분리
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
              <Heading>특허출원과 연구개발전담부서를 기반으로 고도화하고 있습니다</Heading>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600 sm:text-[17px]">
                작은 연구개발전담부서가 실제 현장 문제를 하나씩 구조화하며 운영관리 시스템을 단계적으로 개발하고 있습니다.
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

        {/* ── 문의 CTA ──────────────────────────────────────────────────────── */}
        <Section id="contact">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-navy-900 px-6 py-14 text-center sm:px-10 sm:py-20">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
                  backgroundSize: '36px 36px',
                  maskImage: 'radial-gradient(ellipse 70% 90% at 50% 50%, black 20%, transparent 100%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 50% 50%, black 20%, transparent 100%)',
                }}
              />
              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-[1.9rem] font-extrabold leading-[1.18] tracking-tight text-white sm:text-[2.4rem]">
                  의료폐기물 수거·운반과 운영관리, 비원미래가 함께합니다
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-navy-100">
                  서울·경기권 병원·요양병원·의원 등 의료기관의 폐기물 수거·운반과 운영관리 상담을 받고 있습니다.
                </p>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    onClick={goSystem}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-7 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600"
                  >
                    운영관리 시스템 보기 <ArrowRight size={19} strokeWidth={2.4} />
                  </button>
                  <a
                    href="#contact-info"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-7 py-4 text-[17px] font-bold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
                  >
                    문의하기
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
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
              <p className="font-bold text-navy-900">회사 정보</p>
              <dl className="mt-3 space-y-2 text-navy-500">
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">대표자</dt><dd>송명근</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">설립</dt><dd>2022년 10월 5일</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">주소</dt><dd>경기도 남양주시 오남읍 양지로 47-35, 바동 1층</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">영업권역</dt><dd>서울·경기권 (남양주 기반)</dd></div>
              </dl>
            </div>

            <div className="text-[15px]">
              <p className="font-bold text-navy-900">주요 서비스</p>
              <ul className="mt-3 space-y-2 text-navy-500">
                <li>의료폐기물 수거·운반</li>
                <li>의료기관 일회용기저귀 수거·운반</li>
                <li>자재공급·수거대장·미수금 관리</li>
              </ul>
              <button
                onClick={goDemo}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-4 py-3 text-[15px] font-bold text-navy-700 transition hover:bg-navy-100"
              >
                시스템 시연 보기 <ArrowRight size={16} strokeWidth={2.4} />
              </button>
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
