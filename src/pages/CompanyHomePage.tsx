import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Container,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Menu,
  MessageCircle,
  Route,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react'

const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
const EASE = [0.22, 1, 0.36, 1] as const

const NAV = [
  { label: '회사소개', href: 'about' },
  { label: '서비스', href: 'services' },
  { label: '운영 현황', href: 'tech' },
  { label: '문의', href: 'contact' },
]

const INQUIRY_TYPES = ['의료폐기물 수거·운반', '의료기관 폐기물 운영관리', '자재공급', '기타']

const IMG = {
  hero: '/company/medical-campus-wide-pickup.webp',
  hospital: '/company/nursing-hospital-pickup.webp',
  clinic: '/company/local-clinic-pickup.webp',
  care: '/company/care-facility-pickup.webp',
  network: '/company/client-network-board.webp',
  workflow: '/company/collection-record-dashboard.webp',
  inspection: '/company/inspection-record-support.webp',
  route: '/company/route-operations-desk.webp',
}

type Tone = 'teal' | 'blue' | 'amber' | 'slate'

const toneClass: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  blue: 'bg-sky-50 text-sky-700 ring-sky-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Section({
  id,
  children,
  className = '',
}: {
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`scroll-mt-20 py-20 lg:py-28 ${className}`}>
      <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-10">{children}</div>
    </section>
  )
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

function BrandMark() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
      <span className="text-xl font-black">B</span>
    </span>
  )
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[15px] font-extrabold ${light ? 'text-teal-300' : 'text-teal-700'}`}>
      {children}
    </p>
  )
}

function Heading({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <h2
      className={`mt-3 max-w-4xl text-[2rem] font-black leading-[1.15] tracking-normal sm:text-[2.7rem] lg:text-[3.2rem] ${
        light ? 'text-white' : 'text-slate-950'
      }`}
    >
      {children}
    </h2>
  )
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'dark'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 text-[15px] font-extrabold transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-300'
  const styles = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700',
    ghost: 'bg-white text-slate-950 ring-1 ring-slate-200 hover:bg-slate-50',
    dark: 'bg-slate-950 text-white hover:bg-slate-800',
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  )
}

function Header({ onContact }: { onContact: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-950/88 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-6 lg:px-10">
        <button
          type="button"
          onClick={() => scrollToSection('top')}
          className="flex items-center gap-3"
          aria-label="비원미래 첫 화면으로 이동"
        >
          <BrandMark />
          <span className="text-left leading-tight">
            <span className="block text-[17px] font-black">비원미래</span>
            <span className="block text-[11px] font-bold tracking-[0.18em] text-white/55">BEONE MIRAE</span>
          </span>
        </button>

        <nav className="hidden items-center gap-2 lg:flex">
          {NAV.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => scrollToSection(item.href)}
              className="rounded-lg px-4 py-2.5 text-[15px] font-bold text-white/78 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden lg:block">
          <ActionButton onClick={onContact}>수거 상담 <ArrowRight size={17} /></ActionButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 lg:hidden"
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 bg-slate-950 lg:hidden"
          >
            <div className="space-y-1 px-6 py-4">
              {NAV.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    scrollToSection(item.href)
                  }}
                  className="block w-full rounded-lg px-3 py-3 text-left text-[15px] font-bold text-white/86 hover:bg-white/10"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onContact()
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3.5 text-[15px] font-extrabold text-white"
              >
                수거 상담 <ArrowRight size={17} />
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function Hero({ onContact }: { onContact: () => void }) {
  const reduced = useReducedMotion()

  return (
    <section id="top" className="relative min-h-[100dvh] overflow-hidden bg-slate-950 pt-[76px] text-white">
      <img
        src={IMG.hero}
        alt="종합병원 앞에서 의료폐기물 전용 용기를 수거 차량으로 옮기는 현장"
        className="absolute inset-0 h-full w-full object-cover opacity-72"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/78 to-slate-950/18" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative mx-auto grid min-h-[calc(100dvh-76px)] w-full max-w-[1440px] grid-cols-1 items-end gap-8 px-6 pb-10 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:px-10">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-3xl pb-4 lg:pb-16"
        >
          <p className="inline-flex rounded-lg bg-white/12 px-4 py-2 text-[14px] font-extrabold text-teal-200 ring-1 ring-white/18">
            의료폐기물 수집 운반 전문기업
          </p>
          <h1 className="mt-6 text-[2.35rem] font-black leading-[1.08] tracking-normal sm:text-[4rem] lg:text-[4.7rem]">
            의료폐기물 운송을
            <br />
            운영 기준까지 관리합니다
          </h1>
          <p className="mt-6 max-w-2xl text-[18px] font-semibold leading-relaxed text-white/84">
            서울 경기권 의료기관의 정기 수거, 긴급 대응, 전용 용기 공급, 수거대장 관리를 한 흐름으로 지원합니다.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ActionButton onClick={onContact}>수거 상담 요청 <ArrowRight size={18} /></ActionButton>
            <ActionButton onClick={() => scrollToSection('services')} variant="ghost">
              운영 범위 보기
            </ActionButton>
          </div>
        </motion.div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 28 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE, delay: 0.08 }}
          className="grid grid-cols-1 gap-4 rounded-lg bg-slate-950/72 p-4 ring-1 ring-white/12 backdrop-blur-md sm:grid-cols-3 lg:mb-10"
        >
          {[
            [ShieldCheck, '허가 기반 운송', '관할 기관 기준에 맞춘 안전 운송 체계'],
            [Container, '전용 용기 관리', '규격 용기 사용 및 회수 세척 관리'],
            [FileText, '수거이력 기록', '수거부터 폐기까지 전 과정 기록 보관'],
          ].map(([Icon, title, desc]) => {
            const TypedIcon = Icon as LucideIcon
            return (
              <div key={title as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <TypedIcon className="text-teal-300" size={25} />
                <p className="mt-4 text-[17px] font-black">{title as string}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/62">{desc as string}</p>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

function OperationsSection() {
  const items = [
    { icon: CalendarCheck, title: '정기 및 추가 수거 대응', desc: '수거 주기, 보관기한, 긴급 요청을 거래처별로 정리합니다.', tone: 'teal' as Tone },
    { icon: Container, title: '전용 용기와 자재 이력', desc: '전용 용기, 봉투, 박스 등 요청과 공급 이력을 함께 확인합니다.', tone: 'blue' as Tone },
    { icon: ClipboardList, title: '수거대장 정리', desc: '수거 완료 내역과 대장 확인이 쉽도록 기관 단위로 관리합니다.', tone: 'slate' as Tone },
  ]

  return (
    <Section id="about" className="bg-[#f5f8fb]">
      <Reveal>
        <Eyebrow>핵심 운영 기준</Eyebrow>
        <Heading>수거만 맡기는 것이 아니라 운영 부담까지 줄입니다</Heading>
        <p className="mt-5 max-w-4xl text-[18px] leading-relaxed text-slate-600">
          의료기관 담당자가 매번 확인해야 하는 일정, 자재, 기록 업무를 현장 수거 흐름에 맞춰 정리합니다.
        </p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal className="space-y-4">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="rounded-lg bg-white p-6 shadow-card ring-1 ring-slate-200">
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ring-1 ${toneClass[item.tone]}`}>
                  <Icon size={23} />
                </span>
                <p className="mt-4 text-xl font-black text-slate-950">{item.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            )
          })}
        </Reveal>

        <Reveal delay={0.08}>
          <div className="rounded-lg bg-white p-5 shadow-card ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-sm font-black text-teal-700">BEONE MIRAE</p>
                <p className="text-lg font-black text-slate-950">수거 일정 보드</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">오늘 기준</span>
            </div>
            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-black text-slate-500">
              {['월', '화', '수', '목', '금', '토', '일'].map((day) => (
                <div key={day} className="rounded-lg bg-slate-50 py-2">{day}</div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, index) => {
                const active = [1, 3, 4, 8, 11].includes(index)
                const diaper = [4, 11].includes(index)
                return (
                  <div key={index} className="min-h-24 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    {active && (
                      <div className="rounded-lg bg-white p-2 shadow-sm">
                        <p className="text-[11px] font-black text-slate-500">{index % 2 ? '10:30' : '09:00'}</p>
                        <p className="mt-1 truncate text-[12px] font-black text-slate-950">
                          {diaper ? '요양시설' : '종합병원'}
                        </p>
                        <span className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-black ${diaper ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                          {diaper ? '기저귀' : '의료폐기물'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

function ServicesSection({ onContact }: { onContact: () => void }) {
  const services = [
    { label: '병원 및 요양병원', team: '의료폐기물 팀', image: IMG.hospital, desc: '정기 수거와 추가 수거 요청, 전용 용기 공급을 함께 관리합니다.' },
    { label: '의원, 치과, 한의원', team: '의료폐기물 팀', image: IMG.clinic, desc: '소규모 배출기관의 수거 주기와 보관 기준을 맞춰 운영합니다.' },
    { label: '요양시설 및 장례식장', team: '기저귀 수거 포함', image: IMG.care, desc: '의료기관 일회용기저귀와 관련 배출물을 조건에 맞춰 분리 관리합니다.' },
    { label: '다수 거래처 관리', team: '통합 배차', image: IMG.network, desc: '서울 경기권 분산 거래처의 수거조건과 이력을 한눈에 정리합니다.' },
  ]

  return (
    <Section id="services" className="bg-white">
      <Reveal>
        <Eyebrow>대상별 서비스</Eyebrow>
        <Heading>기관 유형과 폐기물 종류에 따라 수거 기준을 나눕니다</Heading>
        <p className="mt-5 max-w-4xl text-[18px] leading-relaxed text-slate-600">
          병원과 의원은 의료폐기물 중심으로, 요양시설과 장례식장은 일회용기저귀 수거까지 자연스럽게 포함해 운영 기준을 구분합니다.
        </p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {services.map((service, index) => (
          <Reveal key={service.label} delay={index * 0.05}>
            <article className="group overflow-hidden rounded-lg bg-slate-950 shadow-card">
              <div className="aspect-[4/3] overflow-hidden">
                <img src={service.image} alt={service.label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
              </div>
              <div className="p-5 text-white">
                <span className="inline-flex rounded-lg bg-teal-500 px-3 py-1 text-xs font-black text-white">
                  {service.team}
                </span>
                <p className="mt-4 text-2xl font-black">{service.label}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-white/72">{service.desc}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10 text-center">
        <ActionButton onClick={onContact} variant="ghost">대상 기관 확인하기 <ArrowRight size={17} /></ActionButton>
      </Reveal>
    </Section>
  )
}

function CoverageSection({ onContact }: { onContact: () => void }) {
  return (
    <Section id="coverage" className="overflow-hidden bg-slate-950 text-white">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <Reveal>
          <div className="relative min-h-[520px] overflow-hidden rounded-lg bg-[#071420] ring-1 ring-white/10">
            <img src={IMG.network} alt="서울 경기권 거래처 권역 관리 화면" className="absolute inset-0 h-full w-full object-cover opacity-34" />
            <div className="absolute inset-0 bg-slate-950/42" />
            <div className="absolute left-[12%] top-[30%] h-4 w-4 rounded-full bg-teal-300 shadow-[0_0_0_12px_rgba(20,184,166,0.18)]" />
            <div className="absolute left-[38%] top-[45%] h-4 w-4 rounded-full bg-teal-300 shadow-[0_0_0_12px_rgba(20,184,166,0.18)]" />
            <div className="absolute left-[62%] top-[34%] h-5 w-5 rounded-full bg-teal-300 shadow-[0_0_0_18px_rgba(20,184,166,0.20)]" />
            <div className="absolute left-[72%] top-[62%] h-4 w-4 rounded-full bg-amber-400 shadow-[0_0_0_12px_rgba(245,158,11,0.20)]" />
            <div className="absolute bottom-6 left-6 rounded-lg bg-slate-950/78 p-5 ring-1 ring-white/12 backdrop-blur-md">
              <p className="text-sm font-black text-teal-300">남양주 운영 거점</p>
              <p className="mt-1 text-[15px] font-semibold text-white/76">서울 경기권 병원, 의원, 요양시설 권역 운영</p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <Eyebrow light>거래처 및 권역</Eyebrow>
          <Heading light>서울 경기권 수거망을 한눈에 관리합니다</Heading>
          <p className="mt-5 text-[18px] leading-relaxed text-white/72">
            남양주 기반 운영으로 병원, 요양병원, 의원, 요양시설의 정기 및 추가 수거 조건을 축적합니다.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              ['50곳+', '관리 거래처'],
              ['월 100톤+', '수거 운반'],
              ['정기 추가', '수거 대응'],
              ['전용 차량', '분리 운행'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <p className="text-3xl font-black text-teal-300">{value}</p>
                <p className="mt-1 text-[15px] font-bold text-white/66">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <ActionButton onClick={onContact}>권역 상담하기 <ArrowRight size={17} /></ActionButton>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

function WorkflowSection() {
  const checks = [
    '수거주기 및 보관기한 관리',
    '전용 용기와 자재 공급 이력',
    '수거완료 내역과 수거대장 확인',
    '의료폐기물 및 일회용기저귀 배출물 분리 관리',
    '실사 및 인증 전 자료 요청 대응',
  ]

  return (
    <Section id="workflow" className="bg-[#f5f8fb]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <Reveal>
          <img src={IMG.workflow} alt="현장에서 수거이력과 용기 정보를 확인하는 모습" className="aspect-[4/3] w-full rounded-lg object-cover shadow-card" />
        </Reveal>

        <Reveal delay={0.05}>
          <Eyebrow>수거 관리 방식</Eyebrow>
          <Heading>보관기한부터 수거대장까지 현장에서 확인합니다</Heading>
          <p className="mt-5 text-[18px] leading-relaxed text-slate-600">
            현장에서 확인한 정보를 기준으로 기관 담당자의 관리 부담을 줄이고, 요청 사항을 다음 수거 흐름에 반영합니다.
          </p>
          <div className="mt-8 divide-y divide-slate-200 rounded-lg bg-white shadow-card ring-1 ring-slate-200">
            {checks.map((check) => (
              <div key={check} className="flex items-start gap-4 p-5">
                <CheckCircle2 className="mt-0.5 shrink-0 text-teal-600" size={22} />
                <p className="text-[17px] font-extrabold text-slate-900">{check}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

function TechSection({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  const tech = [
    { icon: FlaskConical, title: '경로 최적화 특허출원', desc: '의료폐기물 수거 운반 경로 최적화 시스템' },
    { icon: Database, title: '연구개발전담부서 운영', desc: '수거, 자재, 이력 통합관리 연구개발 체계 운영' },
    { icon: Route, title: '배차 경로 추천 로직', desc: '운영 데이터 기반 추천 시뮬레이션 고도화' },
  ]

  return (
    <Section id="tech" className="bg-white">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <Reveal>
          <Eyebrow>개발 현황</Eyebrow>
          <Heading>운영관리 시스템을 현장 기준에 맞춰 고도화하고 있습니다</Heading>
          <p className="mt-5 text-[18px] leading-relaxed text-slate-600">
            거래처 정보, 배차, 수거이력, 자재 요청을 실제 수거 현장 기준에 맞춰 한 화면에서 관리하도록 개발하고 있습니다.
          </p>
          <div className="mt-8 space-y-3">
            {tech.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="flex gap-4 rounded-lg bg-[#f5f8fb] p-5 ring-1 ring-slate-200">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className="text-[17px] font-black text-slate-950">{item.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-slate-600">{item.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <div className="rounded-lg bg-white p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <BrandMark />
                <div>
                  <p className="text-sm font-black text-slate-950">BEONE MIRAE</p>
                  <p className="text-xs font-bold text-slate-500">운영관리 시스템</p>
                </div>
              </div>
              <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700">구축 중</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg bg-[#f5f8fb] p-4 ring-1 ring-slate-200">
                <p className="text-sm font-black text-slate-950">배차 보드</p>
                <div className="mt-3 space-y-2">
                  {[
                    ['09:00', '서울대교병원', '의료폐기물'],
                    ['10:30', '참조은요양병원', '의료폐기물'],
                    ['13:30', '미래클리닉', '일회용기저귀'],
                  ].map(([time, place, type]) => (
                    <div key={place} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                      <span className="text-xs font-black text-slate-400">{time}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{place}</span>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-black ${type === '일회용기저귀' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                        {type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-[#f5f8fb] p-4 ring-1 ring-slate-200">
                <p className="text-sm font-black text-slate-950">수거 이력</p>
                <div className="mt-3 space-y-2">
                  {[
                    ['의료폐기물', '250.8 kg', '완료'],
                    ['일회용기저귀', '62.6 kg', '완료'],
                    ['자재 요청', '전용 용기 24개', '확인'],
                  ].map(([type, amount, status]) => (
                    <div key={type} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                      <span className="font-black text-slate-950">{type}</span>
                      <span className="font-bold text-slate-500">{amount}</span>
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-[#f5f8fb] p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] font-bold leading-relaxed text-slate-600">
                개선효과는 실제 운행데이터 축적 후 실증지표로 검증할 예정입니다.
              </p>
              <div className="flex shrink-0 gap-2">
                <ActionButton onClick={onSystem}>운영화면 보기 <ArrowRight size={17} /></ActionButton>
                <ActionButton onClick={onContact} variant="ghost">문의</ActionButton>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

function ContactSection() {
  return (
    <Section id="contact" className="bg-[#f5f8fb]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <Reveal>
          <Eyebrow>상담 문의</Eyebrow>
          <Heading>기관의 배출 조건을 알려주시면 수거 기준을 정리해드립니다</Heading>
          <p className="mt-5 text-[18px] leading-relaxed text-slate-600">
            지역, 기관 유형, 수거 주기, 용기와 자재 필요 여부를 바탕으로 상담합니다.
          </p>
          <img src={IMG.inspection} alt="의료기관 담당자와 수거 조건을 확인하는 상담 장면" className="mt-8 aspect-[16/10] w-full rounded-lg object-cover shadow-card" />
          <div className="mt-6 divide-y divide-slate-200 rounded-lg bg-white shadow-card ring-1 ring-slate-200">
            {[
              ['전문 상담 지원', '의료폐기물 관리 전문 상담원이 맞춤 안내'],
              ['정확한 기준 안내', '관련 법규와 지역 기준을 반영한 수거 기준 정리'],
              ['안전하고 신속한 처리', '안전 수거 운반 체계에 기반한 처리 방안 제안'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-4 p-5">
                <CheckCircle2 className="mt-0.5 shrink-0 text-teal-600" size={22} />
                <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
                  <p className="font-black text-slate-950">{title}</p>
                  <p className="text-[15px] leading-relaxed text-slate-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <ConsultForm />
        </Reveal>
      </div>
    </Section>
  )
}

function ConsultForm() {
  const [form, setForm] = useState({
    inquiry: INQUIRY_TYPES[0],
    org: '',
    manager: '',
    contact: '',
    email: '',
    region: '',
    type: '',
    message: '',
    agree: false,
    company: '',
  })
  const [status, setStatus] = useState<'idle' | 'invalid' | 'sending' | 'success' | 'error'>('idle')
  const [invalidMsg, setInvalidMsg] = useState('')
  const sending = status === 'sending'

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
    setStatus((prev) => (prev === 'invalid' || prev === 'error' ? 'idle' : prev))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (sending) return

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    if (!form.org.trim() || !form.manager.trim() || !form.contact.trim() || !form.email.trim()) {
      setInvalidMsg('기관명, 담당자명, 연락처, 이메일을 입력해 주세요.')
      setStatus('invalid')
      return
    }
    if (!emailOk) {
      setInvalidMsg('이메일 형식을 다시 확인해 주세요.')
      setStatus('invalid')
      return
    }
    if (!form.agree) {
      setInvalidMsg('개인정보 수집 및 이용에 동의해 주세요.')
      setStatus('invalid')
      return
    }

    setStatus('sending')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('submit failed')
      setStatus('success')
      setForm({
        inquiry: INQUIRY_TYPES[0],
        org: '',
        manager: '',
        contact: '',
        email: '',
        region: '',
        type: '',
        message: '',
        agree: false,
        company: '',
      })
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-lg bg-white p-8 text-center shadow-card ring-1 ring-slate-200">
        <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
        <p className="mt-4 text-2xl font-black text-slate-950">문의가 접수되었습니다</p>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          담당자 확인 후 회신드리겠습니다.
        </p>
        <ActionButton onClick={() => setStatus('idle')}>새 문의 작성</ActionButton>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg bg-white p-6 shadow-card ring-1 ring-slate-200 sm:p-8" noValidate>
      <input className="hidden" value={form.company} onChange={update('company')} tabIndex={-1} autoComplete="off" aria-hidden />
      <p className="text-2xl font-black text-slate-950">문의 유형</p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INQUIRY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, inquiry: type }))}
            className={`rounded-lg px-3 py-3 text-sm font-black transition ${
              form.inquiry === type ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="기관명 *" value={form.org} onChange={update('org')} placeholder="기관명을 입력해주세요." />
        <Field label="담당자명 *" value={form.manager} onChange={update('manager')} placeholder="담당자명을 입력해주세요." />
        <Field label="연락처 *" value={form.contact} onChange={update('contact')} placeholder="예) 010-1234-5678" />
        <Field label="이메일 *" value={form.email} onChange={update('email')} placeholder="예) example@domain.com" />
        <Field label="지역" value={form.region} onChange={update('region')} placeholder="지역을 선택해주세요." />
        <Field label="배출기관 유형" value={form.type} onChange={update('type')} placeholder="유형을 선택해주세요." />
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-black text-slate-700">문의 내용</span>
        <textarea
          value={form.message}
          onChange={update('message')}
          rows={5}
          className="w-full resize-none rounded-lg bg-slate-50 px-4 py-3 text-[15px] font-semibold text-slate-950 outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-500"
          placeholder="배출 조건, 수거 주기, 용기와 자재 필요 여부 등을 자세히 입력해주세요."
        />
      </label>

      <label className="mt-4 flex gap-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
        <input
          type="checkbox"
          checked={form.agree}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, agree: event.target.checked }))
            setStatus((prev) => (prev === 'invalid' ? 'idle' : prev))
          }}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm leading-relaxed text-slate-600">
          <span className="font-black text-slate-900">개인정보 수집 및 이용에 동의합니다. *</span>
          <br />
          상담 응대와 회신 목적으로만 사용하며, 상담 처리 후 파기됩니다.
        </span>
      </label>

      {status === 'invalid' && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{invalidMsg}</p>}
      {status === 'error' && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">일시적으로 문의 접수가 원활하지 않습니다. 잠시 후 다시 시도해 주세요.</p>}

      <button
        type="submit"
        disabled={sending}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-4 text-[17px] font-black text-white transition hover:-translate-y-0.5 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? '전송 중...' : <>상담 문의 보내기 <ArrowRight size={18} /></>}
      </button>
      <p className="mt-3 text-xs font-semibold text-slate-400">
        입력하신 정보는 상담 응대 목적에 한해 사용됩니다.
      </p>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (event: { target: { value: string } }) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      <input
        value={value}
        onChange={onChange}
        className="w-full rounded-lg bg-slate-50 px-4 py-3 text-[15px] font-semibold text-slate-950 outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-500"
        placeholder={placeholder}
      />
    </label>
  )
}

function SiteFooter({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  return (
    <footer className="bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-[1440px] px-6 py-16 lg:px-10">
        <div className="rounded-lg border border-teal-400/30 bg-white/[0.03] p-8 lg:flex lg:items-center lg:justify-between">
          <p className="text-[2rem] font-black leading-tight lg:text-[3rem]">
            의료폐기물과 기저귀 수거 기준,
            <br />
            지금 정리하세요
          </p>
          <div className="mt-6 lg:mt-0">
            <ActionButton onClick={onContact}>수거 상담하기 <ArrowRight size={18} /></ActionButton>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark />
              <div>
                <p className="text-xl font-black">BEONE MIRAE</p>
                <p className="text-sm font-bold text-teal-300">주식회사 비원미래</p>
              </div>
            </div>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/62">
              경기도 남양주시 오남읍 양지로 47-35, 바동 1층
              <br />
              서울 경기권 운영
            </p>
          </div>

          <FooterColumn title="회사" items={[['회사 소개', () => scrollToSection('about')], ['서비스', () => scrollToSection('services')], ['문의', onContact]]} />
          <FooterColumn title="운영" items={[['의료폐기물 팀', () => scrollToSection('services')], ['기저귀 수거 포함', () => scrollToSection('services')], ['운영관리 화면', onSystem]]} />
          <div>
            <p className="text-lg font-black text-teal-300">관련 시스템</p>
            <button
              type="button"
              onClick={() => window.open(ALLBARO_URL, '_blank', 'noopener,noreferrer')}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-teal-400/50 px-5 py-3 text-[15px] font-black text-white transition hover:bg-white/10"
            >
              올바로 시스템 바로가기 <ExternalLink size={16} />
            </button>
            <p className="mt-3 text-xs font-semibold text-white/42">폐기물 적법처리 국가시스템</p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-sm font-semibold text-white/42">
          © 2026 BEONE MIRAE CO.
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, items }: { title: string; items: [string, () => void][] }) {
  return (
    <div>
      <p className="text-lg font-black text-teal-300">{title}</p>
      <div className="mt-5 space-y-3">
        {items.map(([label, action]) => (
          <button key={label} type="button" onClick={action} className="block text-left text-[15px] font-semibold text-white/70 hover:text-white">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FloatingActions({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-lg bg-white/92 p-2 shadow-2xl ring-1 ring-slate-200 backdrop-blur lg:hidden">
      <button type="button" onClick={onContact} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-3 text-sm font-black text-white">
        <MessageCircle size={16} /> 상담
      </button>
      <button type="button" onClick={onSystem} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-3 text-sm font-black text-white">
        운영화면 <ArrowRight size={16} />
      </button>
    </div>
  )
}

export function CompanyHomePage() {
  const navigate = useNavigate()
  const goSystem = () => navigate('/')

  useEffect(() => {
    const prevTitle = document.title
    document.title = '주식회사 비원미래 | 서울 경기 의료폐기물 수거 운반'
    const meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content') ?? ''
    meta?.setAttribute(
      'content',
      '주식회사 비원미래는 서울 경기권 의료기관의 의료폐기물과 의료기관 일회용기저귀 수거 운반, 전용 용기 공급, 수거이력 관리를 지원합니다.',
    )
    return () => {
      document.title = prevTitle
      meta?.setAttribute('content', prevDesc)
    }
  }, [])

  const openContact = () => scrollToSection('contact')

  return (
    <div className="min-h-[100dvh] bg-[#f5f8fb] font-sans text-slate-900">
      <Header onContact={openContact} />
      <main>
        <Hero onContact={openContact} />
        <OperationsSection />
        <ServicesSection onContact={openContact} />
        <CoverageSection onContact={openContact} />
        <WorkflowSection />
        <TechSection onContact={openContact} onSystem={goSystem} />
        <ContactSection />
      </main>
      <SiteFooter onContact={openContact} onSystem={goSystem} />
      <FloatingActions onContact={openContact} onSystem={goSystem} />
    </div>
  )
}
