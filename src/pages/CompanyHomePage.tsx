import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Package,
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
  type LucideIcon,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// 주식회사 비원미래 공식 반응형 홈페이지 (/company)
//  · Layout(사이드바/탭) 바깥의 독립 전체화면 라우트 — 공개용 웹사이트 톤
//  · 기존 MVP 데이터/기능과 분리된 정적 프론트엔드. 흰색/블루/네이비/그레이 중심.
//  · 회사명은 "주식회사 비원미래"만 사용, 사업자·법인 등록번호 미표시.
// ─────────────────────────────────────────────────────────────────────────────

const NAV = [
  { label: '회사소개', href: '#about' },
  { label: '서비스', href: '#services' },
  { label: '운영관리 시스템', href: '#system' },
  { label: '기술개발', href: '#tech' },
  { label: '문의', href: '#contact' },
]

const HERO_BADGES = ['서울·경기권 운영', '의료폐기물 수거·운반', '일회용기저귀 분리 운행', '특허출원 기반 시스템 개발']

const STATS: { icon: LucideIcon; value: string; label: string; desc: string }[] = [
  { icon: Building2, value: '거래처 49곳', label: '의료기관 배출기관', desc: '병원·요양병원·의원·요양시설 등' },
  { icon: Recycle, value: '월평균 105톤', label: '수거·운반 규모', desc: '의료폐기물 40톤 + 일회용기저귀 65톤' },
  { icon: Truck, value: '차량 5대', label: '폐기물 종류별 분리 운행', desc: '의료폐기물 3대 · 일회용기저귀 2대' },
  { icon: MapPin, value: '서울·경기권', label: '광역 운영', desc: '경기 남양주 기반 권역 운영' },
]

const PROBLEMS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Clock, title: '수거주기·보관기한 관리', desc: '병원·요양병원·의원마다 수거주기와 폐기물 보관기한이 달라 일정만으로는 관리가 어렵습니다.' },
  { icon: ShieldCheck, title: '격리의료폐기물 긴급수거', desc: '격리의료폐기물은 보관기한이 짧아, 병원 요청 시 긴급수거 대응이 필요합니다.' },
  { icon: Layers, title: '의료폐기물·일회용기저귀 분리 운행', desc: '같은 병원에서 나와도 차량·관리체계·처리장이 달라 분리 운행과 이력관리가 필요합니다.' },
  { icon: ClipboardList, title: '자재·수거대장·미수금 관리', desc: '자재공급, 수거대장, 결제·미수금이 수기·전화·엑셀에 의존하면 거래처 증가 시 부담이 커집니다.' },
  { icon: Route, title: '적재량·처리장 인계시간', desc: '차량 적재가능량과 처리장 인계시간을 함께 고려해야 실제 운행이 성립합니다.' },
]

const SERVICES: { icon: LucideIcon; title: string; desc: string; soon?: boolean }[] = [
  { icon: Syringe, title: '의료폐기물 수거·운반', desc: '병원·요양병원·의원 등 배출기관의 의료폐기물을 수거조건에 맞춰 수집·운반합니다.' },
  { icon: Boxes, title: '일회용기저귀 수거·운반', desc: '의료기관 일회용기저귀를 의료폐기물과 분리된 차량·체계로 수집·운반합니다.' },
  { icon: Package, title: '병원 자재공급·입출고 관리', desc: '거래처별 박스·비닐·바늘통 등 자재공급과 입출고 내역을 관리합니다.' },
  { icon: FileText, title: '수거이력·수거대장 관리', desc: '수거이력과 자재공급을 통합해 월간 수거대장으로 정리·출력합니다.' },
  { icon: Wallet, title: '결제·미수금 관리 지원', desc: '거래처별 청구·입금 현황과 미수금을 한 흐름에서 관리하도록 지원합니다.' },
  { icon: TrendingUp, title: '배출기관 운영지원 확장', desc: '수거대장 제공, 운영 리포트 등 부가 운영지원 서비스로 확장할 예정입니다.', soon: true },
]

const FLOW: { icon: LucideIcon; step: string; title: string; desc: string }[] = [
  { icon: Building2, step: '01', title: '거래처 정보', desc: '병원별 주소·폐기물 종류·수거주기·요청사항을 관리합니다.' },
  { icon: Clock, step: '02', title: '수거조건', desc: '보관기한·수거 가능 시간·긴급수거 조건을 반영합니다.' },
  { icon: Truck, step: '03', title: '차량·처리장 정보', desc: '차량별 적재가능량과 처리장 인계시간을 고려합니다.' },
  { icon: Route, step: '04', title: '배차·경로 추천', desc: '운영 데이터 기반 추천 로직을 개발 중입니다.' },
  { icon: FileText, step: '05', title: '수거이력·출력', desc: '수거대장 미리보기 및 출력 기능을 고도화할 예정입니다.' },
]

const TECH_CARDS: { icon: LucideIcon; tag: string; title: string; desc: string }[] = [
  {
    icon: FlaskConical,
    tag: '특허출원',
    title: '의료폐기물 수거·운반 경로 최적화 시스템',
    desc: '출원번호 10-2026-0101187 · 출원일 2026.06.04 · 출원인 주식회사 비원미래',
  },
  {
    icon: Database,
    tag: '연구개발전담부서',
    title: '데이터 기반 통합관리 시스템 개발',
    desc: '2026.04.20 설립 · 연구전담요원 1명 운영 · 수거·운반 및 자재·이력 통합관리 연구',
  },
  {
    icon: Layers,
    tag: 'MVP 개발',
    title: '운영관리 화면 구현',
    desc: '거래처 관리 · 배차·경로 · 수거이력 · 자재관리 · 미수금 관리 화면을 구현했습니다.',
  },
  {
    icon: TrendingUp,
    tag: '실증 예정 지표',
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

// ── 공용 소섹션 ──────────────────────────────────────────────────────────────
function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-20 lg:py-24 ${className}`}>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-bold uppercase tracking-wide text-teal-600">{children}</p>
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{children}</h2>
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export function CompanyHomePage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

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
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5" aria-label="주식회사 비원미래 홈">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-sm font-black text-teal-300">
              비
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-extrabold tracking-tight text-navy-900">주식회사 비원미래</span>
              <span className="block text-[11px] font-semibold tracking-wide text-navy-400">BEONE MIRAE CO.</span>
            </span>
          </a>

          {/* 데스크톱 내비 */}
          <nav className="hidden items-center gap-7 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-bold text-navy-600 transition-colors hover:text-teal-600">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={goDemo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
            >
              시스템 시연 보기 <ArrowRight size={16} strokeWidth={2.4} />
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
        {menuOpen && (
          <div className="border-t border-navy-100 bg-white lg:hidden">
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
                className="mt-2 mb-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-600"
              >
                시스템 시연 보기 <ArrowRight size={16} strokeWidth={2.4} />
              </button>
            </nav>
          </div>
        )}
      </header>

      <main id="top">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-navy-50 to-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-teal-600 shadow-card ring-1 ring-navy-100">
                <Recycle size={14} /> 의료폐기물 운영관리 전문기업
              </div>
              <h1 className="mt-5 text-3xl font-extrabold leading-[1.2] tracking-tight text-navy-900 sm:text-4xl lg:text-5xl">
                의료폐기물 수거·운반을
                <br />
                <span className="text-teal-600">데이터 기반 운영관리</span>로 전환합니다
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-navy-500 sm:text-base">
                주식회사 비원미래는 병원·요양병원·의원 등 다양한 의료폐기물 배출기관의 수거조건, 차량, 처리장, 자재공급,
                수거이력 데이터를 통합 관리하는 운영관리 시스템을 개발하고 있습니다.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={goSystem}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:bg-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
                >
                  운영관리 시스템 보기 <ArrowRight size={17} strokeWidth={2.4} />
                </button>
                <a
                  href="#services"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-5 py-3 text-[15px] font-bold text-navy-700 ring-1 ring-navy-200 transition hover:bg-navy-50"
                >
                  서비스 살펴보기
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {HERO_BADGES.map((b) => (
                  <span key={b} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-navy-600 shadow-card ring-1 ring-navy-100">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── 운영 기반 숫자 ────────────────────────────────────────────────── */}
        <Section id="about" className="pt-16 sm:pt-20">
          <Eyebrow>운영 기반</Eyebrow>
          <Heading>현장 데이터로 운영되는 회사입니다</Heading>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-500">
            경기 남양주에 기반을 두고 서울·경기권 의료기관을 대상으로 실제 수거·운반을 운영하고 있습니다.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.value} className="rounded-xl bg-white p-5 shadow-card ring-1 ring-navy-100">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <p className="mt-4 text-xl font-extrabold tracking-tight text-navy-900">{s.value}</p>
                  <p className="mt-1 text-sm font-bold text-navy-600">{s.label}</p>
                  <p className="mt-1 text-[13px] leading-snug text-navy-400">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── 문제 정의 ─────────────────────────────────────────────────────── */}
        <div className="bg-navy-50">
          <Section>
            <Eyebrow>현장 특수성</Eyebrow>
            <Heading>의료폐기물 수거·운반은 단순 일정관리로 해결되지 않습니다</Heading>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-500">
              배출기관마다 조건이 다르고, 폐기물 종류와 처리 흐름이 달라 현장 특수성을 반영한 운영관리가 필요합니다.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((p) => {
                const Icon = p.icon
                return (
                  <div key={p.title} className="rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-700">
                      <Icon size={20} strokeWidth={2.2} />
                    </span>
                    <p className="mt-4 font-bold text-navy-900">{p.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{p.desc}</p>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>

        {/* ── 서비스 ────────────────────────────────────────────────────────── */}
        <Section id="services">
          <Eyebrow>서비스</Eyebrow>
          <Heading>비원미래의 주요 서비스</Heading>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.title} className="flex flex-col rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Icon size={22} strokeWidth={2.2} />
                  </span>
                  <div className="mt-4 flex items-center gap-2">
                    <p className="font-bold text-navy-900">{s.title}</p>
                    {s.soon && (
                      <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-500">확장 예정</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{s.desc}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* ── 통합 운영관리 시스템 흐름 ─────────────────────────────────────── */}
        <div className="bg-navy-900 text-white">
          <Section id="system">
            <Eyebrow>운영관리 시스템</Eyebrow>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              현장 데이터를 하나의 운영 흐름으로 연결합니다
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-200">
              거래처 정보부터 수거이력·출력까지, 의료폐기물 운영 데이터를 통합관리하는 흐름을 개발하고 있습니다.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {FLOW.map((f, i) => {
                const Icon = f.icon
                return (
                  <div key={f.step} className="relative rounded-xl bg-white/[0.06] p-5 ring-1 ring-white/10">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
                        <Icon size={20} strokeWidth={2.2} />
                      </span>
                      <span className="text-sm font-black text-white/30">{f.step}</span>
                    </div>
                    <p className="mt-4 font-bold text-white">{f.title}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-navy-200">{f.desc}</p>
                    {i < FLOW.length - 1 && (
                      <ArrowRight size={16} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-white/20 lg:block" />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-8">
              <button
                onClick={goSystem}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:bg-teal-600"
              >
                운영관리 시스템 보기 <ArrowRight size={17} strokeWidth={2.4} />
              </button>
            </div>
          </Section>
        </div>

        {/* ── 분리 운행 차별화 ──────────────────────────────────────────────── */}
        <Section>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <Eyebrow>차별화</Eyebrow>
              <Heading>같은 병원에서 나와도, 운영관리는 분리되어야 합니다</Heading>
              <p className="mt-4 text-[15px] leading-relaxed text-navy-500">
                의료폐기물과 의료기관 일회용기저귀는 동일 의료기관에서 함께 발생할 수 있지만, 수거차량과 관리체계, 처리
                흐름이 달라 별도 운행과 이력관리가 필요합니다. 비원미래는 이 현장 특수성을 반영해 폐기물 종류별 차량,
                수거조건, 자재공급, 처리장 정보를 분리 관리하는 구조를 개발하고 있습니다.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-navy-500">
                병원 입장에서는 두 업체를 따로 두기보다, 한 업체가 두 가지를 함께 관리해주는 방식을 선호할 수 있습니다.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                  <Syringe size={22} strokeWidth={2.2} />
                </span>
                <p className="mt-4 font-bold text-navy-900">의료폐기물</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">전용 차량·관리체계·처리장으로 수집·운반합니다.</p>
              </div>
              <div className="rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100 sm:mt-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <Boxes size={22} strokeWidth={2.2} />
                </span>
                <p className="mt-4 font-bold text-navy-900">일회용기저귀</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">별도 차량·이력관리로 분리 수집·운반합니다.</p>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 기술개발/특허/연구조직 ────────────────────────────────────────── */}
        <div className="bg-navy-50">
          <Section id="tech">
            <Eyebrow>기술개발</Eyebrow>
            <Heading>특허출원과 연구개발전담부서를 기반으로 고도화하고 있습니다</Heading>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-500">
              작은 연구개발전담부서가 실제 현장 문제를 하나씩 구조화하며 운영관리 시스템을 단계적으로 개발하고 있습니다.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TECH_CARDS.map((t) => {
                const Icon = t.icon
                return (
                  <div key={t.tag} className="rounded-xl bg-white p-6 shadow-card ring-1 ring-navy-100">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                        <Icon size={22} strokeWidth={2.2} />
                      </span>
                      <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[11px] font-bold text-navy-600">{t.tag}</span>
                    </div>
                    <p className="mt-4 font-bold text-navy-900">{t.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{t.desc}</p>
                  </div>
                )
              })}
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-navy-400">
              ※ 개선효과는 실제 운행데이터 축적 후 실증지표로 검증할 예정이며, 확정된 수치가 아닙니다.
            </p>
          </Section>
        </div>

        {/* ── 성장 방향 ─────────────────────────────────────────────────────── */}
        <Section>
          <Eyebrow>성장 방향</Eyebrow>
          <Heading>서울·경기권 의료기관 운영지원 서비스로 확장합니다</Heading>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GROWTH.map((g) => (
              <div key={g} className="flex items-start gap-3 rounded-xl bg-white p-5 shadow-card ring-1 ring-navy-100">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-500" strokeWidth={2.2} />
                <p className="text-[15px] leading-relaxed text-navy-700">{g}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 문의 CTA ──────────────────────────────────────────────────────── */}
        <Section id="contact">
          <div className="overflow-hidden rounded-2xl bg-navy-900 px-6 py-12 text-center sm:px-10 sm:py-16">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              의료폐기물 수거·운반과 운영관리, 비원미래가 함께합니다
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-navy-200">
              서울·경기권 병원·요양병원·의원 등 의료기관의 폐기물 수거·운반과 운영관리 상담을 받고 있습니다.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="#contact-info"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:bg-teal-600"
              >
                문의하기
              </a>
              <button
                onClick={goSystem}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-5 py-3 text-[15px] font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                운영관리 시스템 보기 <ArrowRight size={17} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </Section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer id="contact-info" className="border-t border-navy-100 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-sm font-black text-teal-300">
                  비
                </span>
                <span className="leading-tight">
                  <span className="block text-[15px] font-extrabold tracking-tight text-navy-900">주식회사 비원미래</span>
                  <span className="block text-[11px] font-semibold tracking-wide text-navy-400">BEONE MIRAE CO.</span>
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-navy-500">
                데이터 기반 의료폐기물 수거·운반 및 통합 운영관리 시스템을 개발하는 의료폐기물 운영관리 전문기업입니다.
              </p>
            </div>

            <div className="text-sm">
              <p className="font-bold text-navy-900">회사 정보</p>
              <dl className="mt-3 space-y-2 text-navy-500">
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">대표자</dt><dd>송명근</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">설립</dt><dd>2022년 10월 5일</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">주소</dt><dd>경기도 남양주시 오남읍 양지로 47-35, 바동 1층</dd></div>
                <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold text-navy-400">영업권역</dt><dd>서울·경기권 (남양주 기반)</dd></div>
              </dl>
            </div>

            <div className="text-sm">
              <p className="font-bold text-navy-900">상담 문의</p>
              <p className="mt-3 leading-relaxed text-navy-500">
                의료폐기물 수거·운반 및 운영관리 상담 문의는 준비 중입니다.
              </p>
              <button
                onClick={goDemo}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-4 py-2.5 text-sm font-bold text-navy-700 transition hover:bg-navy-100"
              >
                시스템 시연 보기 <ArrowRight size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="mt-10 border-t border-navy-100 pt-6 text-xs text-navy-400">
            © {2026} 주식회사 비원미래 (BEONE MIRAE CO.) · 서울·경기권 의료폐기물 수거·운반 운영관리
          </div>
        </div>
      </footer>
    </div>
  )
}
