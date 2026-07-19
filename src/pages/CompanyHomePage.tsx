import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Container,
  ExternalLink,
  FileText,
  Menu,
  MessageCircle,
  Monitor,
  Route,
  ShieldCheck,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react'

const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'
const EASE = [0.22, 1, 0.36, 1] as const

const ART = {
  hero: '/company/design-section-1.png',
  operations: '/company/design-section-2.png',
  services: '/company/design-section-3.png',
  coverage: '/company/design-section-4.png',
  workflow: '/company/design-section-5.png',
  tech: '/company/design-section-6.png',
  contact: '/company/design-section-7.png',
  footer: '/company/design-section-8.png',
}

const NAV = [
  { label: '회사소개', href: 'about' },
  { label: '서비스', href: 'services' },
  { label: '운영현황', href: 'tech' },
  { label: '문의', href: 'contact' },
]

const INQUIRY_TYPES = ['일반 상담', '수거 문의', '계약 문의', '기타 문의']

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      initial={reduced ? false : { opacity: 0, y: 22 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

function ArtImage({
  src,
  alt,
  opacity = 'opacity-100',
  className = '',
}: {
  src: string
  alt: string
  opacity?: string
  className?: string
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 h-full w-full object-cover ${opacity} ${className}`}
      draggable={false}
    />
  )
}

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`flex h-11 w-11 items-center justify-center rounded-[10px] border ${
        light ? 'border-teal-300/45 bg-teal-400/12 text-teal-200' : 'border-teal-200 bg-white text-teal-700'
      }`}
    >
      <span className="text-[24px] font-black leading-none">B</span>
    </span>
  )
}

function ActionButton({
  children,
  onClick,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'dark' | 'outline'
  className?: string
}) {
  const base =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-[6px] px-6 text-[15px] font-black transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-300'
  const styles = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 shadow-[0_18px_40px_-22px_rgba(13,148,136,0.9)]',
    ghost: 'bg-white text-slate-950 ring-1 ring-slate-200 hover:bg-slate-50',
    dark: 'bg-slate-950 text-white hover:bg-slate-800',
    outline: 'bg-transparent text-teal-700 ring-1 ring-teal-600 hover:bg-teal-50',
  }

  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Header({ onContact }: { onContact: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-950/58 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1800px] items-center justify-between px-7 lg:px-9">
        <button type="button" onClick={() => scrollToSection('top')} className="flex items-center gap-3 text-left">
          <BrandMark light />
          <span className="text-[22px] font-black tracking-normal">비원미래</span>
        </button>

        <nav className="hidden items-center gap-12 text-[17px] font-extrabold lg:flex">
          {NAV.map((item) => (
            <button key={item.href} type="button" onClick={() => scrollToSection(item.href)} className="hover:text-teal-200">
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden lg:block">
          <ActionButton onClick={onContact}>수거 상담</ActionButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-white/10 lg:hidden"
          aria-label="메뉴 열기"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border-t border-white/10 bg-slate-950 px-6 py-5 lg:hidden"
          >
            <div className="grid gap-2">
              {NAV.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    scrollToSection(item.href)
                  }}
                  className="rounded-[6px] px-3 py-3 text-left text-[16px] font-black hover:bg-white/8"
                >
                  {item.label}
                </button>
              ))}
              <ActionButton
                onClick={() => {
                  setOpen(false)
                  onContact()
                }}
                className="mt-2"
              >
                수거 상담 <ArrowRight size={17} />
              </ActionButton>
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
    <section id="top" className="relative isolate min-h-[100dvh] overflow-hidden bg-slate-950 pt-[76px] text-white">
      <ArtImage src={ART.hero} alt="비원미래 의료폐기물 운송 랜딩페이지 시안" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/72 to-slate-950/12" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-76px)] max-w-[1800px] flex-col justify-end px-7 pb-9 lg:px-16">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 28 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="max-w-[760px] pb-6 lg:pb-12"
        >
          <h1 className="text-[2.8rem] font-black leading-[1.08] tracking-normal sm:text-[4rem] lg:text-[4.7rem]">
            의료폐기물 운송을
            <br />
            운영 기준까지 관리합니다
          </h1>
          <p className="mt-7 max-w-[720px] text-[18px] font-semibold leading-relaxed text-white/84 lg:text-[20px]">
            서울·경기권 의료기관의 정기 수거, 긴급 대응, 용기 공급, 수거대장 관리.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ActionButton onClick={onContact} className="sm:min-w-[230px]">
              수거 상담 요청 <ArrowRight size={18} />
            </ActionButton>
            <ActionButton onClick={() => scrollToSection('services')} variant="outline" className="border-white/30 text-white ring-white/30 hover:bg-white/10">
              운영 범위 보기
            </ActionButton>
          </div>
        </motion.div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: EASE, delay: 0.12 }}
          className="grid gap-0 overflow-hidden rounded-[8px] border border-white/12 bg-slate-950/76 backdrop-blur-md lg:grid-cols-3"
        >
          {[
            [ShieldCheck, '허가 기반 운송', '관할 기관 허가 기반의 안전한 운송 체계'],
            [Container, '전용 용기 관리', '규격 용기 사용 및 회수·세척·소독 관리'],
            [FileText, '수거이력 기록', '수거부터 폐기까지 전 과정 기록·보관'],
          ].map(([Icon, title, desc], index) => {
            const TypedIcon = Icon as LucideIcon
            return (
              <div key={title as string} className={`flex gap-5 p-6 ${index > 0 ? 'border-t border-white/12 lg:border-l lg:border-t-0' : ''}`}>
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] border border-white/14 bg-white/6 text-teal-300">
                  <TypedIcon size={30} />
                </span>
                <div>
                  <p className="text-[21px] font-black">{title as string}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/64">{desc as string}</p>
                </div>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

function OperationsSection({ onContact }: { onContact: () => void }) {
  return (
    <section id="about" className="relative isolate overflow-hidden bg-[#f6f9fc] py-20 lg:py-28">
      <ArtImage src={ART.operations} alt="운영 부담을 줄이는 수거 일정 보드 시안" opacity="opacity-90" />
      <div className="absolute inset-0 bg-white/58 backdrop-blur-[1px]" />
      <div className="relative mx-auto grid max-w-[1800px] gap-12 px-7 lg:grid-cols-[0.8fr_1.2fr] lg:px-16">
        <Reveal className="rounded-[8px] bg-white/88 p-7 shadow-[0_24px_90px_-50px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80 backdrop-blur-md lg:p-10">
          <p className="text-[16px] font-black text-teal-700">핵심 운영 기준</p>
          <h2 className="mt-5 text-[2.5rem] font-black leading-[1.12] tracking-normal text-slate-950 lg:text-[4rem]">
            수거만 맡기는 것이 아니라,
            <br />
            운영 부담까지 줄입니다
          </h2>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-slate-600">
            정기 수거, 추가 요청, 전용 용기, 수거대장까지 의료기관 담당자가 챙겨야 할 일을 함께 관리합니다.
          </p>
          <span className="mt-8 inline-flex items-center gap-2 rounded-[6px] border border-amber-300 bg-amber-50 px-4 py-2 text-[15px] font-black text-amber-700">
            <CheckCircle2 size={18} /> 일회용기저귀 수거 포함
          </span>
          <div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">
            {['정기·추가 수거 대응', '보관기한 알림', '전용 용기·자재 공급 이력', '수거대장 정리'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={item.includes('수거') ? onContact : undefined}
                className="flex w-full items-center justify-between py-4 text-left text-[18px] font-black text-slate-900"
              >
                <span className="flex items-center gap-3">
                  <Check className="text-teal-600" size={22} />
                  {item}
                </span>
                <ArrowRight className="text-slate-400" size={20} />
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08} className="relative min-h-[620px] overflow-hidden rounded-[10px] border border-slate-200 bg-white/75 p-5 shadow-[0_34px_100px_-50px_rgba(15,23,42,0.55)] backdrop-blur-md">
          <div className="grid h-full gap-5 lg:grid-cols-[190px_1fr]">
            <aside className="rounded-[8px] bg-slate-950 p-5 text-white">
              <p className="text-[15px] font-black">BEONE MIRAE</p>
              <p className="mt-1 text-xs font-bold text-teal-200">운영 대시보드</p>
              <div className="mt-8 space-y-2">
                {['운영 개요', '수거 일정', '수거 요청', '용기·자재 관리', '수거대장', '알림', '보고서'].map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    onClick={index === 1 ? () => scrollToSection('workflow') : undefined}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-3 py-3 text-left text-sm font-black ${
                      index === 0 ? 'bg-teal-600 text-white' : 'text-white/66 hover:bg-white/8'
                    }`}
                  >
                    <CalendarCheck size={16} />
                    {item}
                  </button>
                ))}
              </div>
              <p className="mt-10 text-xs font-bold text-slate-400">고객센터</p>
              <p className="mt-1 text-[17px] font-black text-teal-300">1688-2028</p>
            </aside>

            <div className="grid gap-5">
              <div className="rounded-[8px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[21px] font-black text-slate-950">수거 일정 보드</h3>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-[5px] border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">전체 지역</button>
                    <button type="button" className="rounded-[5px] border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">내보내기</button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-7 overflow-hidden rounded-[8px] border border-slate-200">
                  {['05.20', '05.21', '05.22', '05.23', '05.24', '05.25', '05.26'].map((day) => (
                    <div key={day} className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-black text-slate-500 last:border-r-0">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: 14 }).map((_, index) => {
                    const active = [0, 1, 3, 6, 8, 10].includes(index)
                    const diaper = [3, 10].includes(index)
                    return (
                      <div key={index} className="min-h-[98px] border-r border-t border-slate-200 bg-white p-2 last:border-r-0">
                        {active && (
                          <button
                            type="button"
                            onClick={onContact}
                            className="w-full rounded-[6px] border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5"
                          >
                            <p className="text-xs font-black text-teal-700">{index % 2 ? '13:30' : '09:00'}</p>
                            <p className="mt-1 truncate text-[13px] font-black text-slate-950">
                              {diaper ? '요양시설' : '종합병원'}
                            </p>
                            <p className="text-[11px] font-bold text-slate-500">{diaper ? '기저귀' : '일반'}</p>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                {[
                  ['전용 용기 보유 현황', '124개', '다음 공급 예정 2024.05.28'],
                  ['수거 현황', '18건', '완료 12건, 진행 4건'],
                  ['준수 관리 체크리스트', '정상', '보관기한·차량·대장 확인'],
                ].map(([title, value, desc]) => (
                  <button key={title} type="button" onClick={onContact} className="rounded-[8px] bg-white p-5 text-left shadow-card ring-1 ring-slate-200 transition hover:-translate-y-0.5">
                    <p className="text-sm font-black text-slate-500">{title}</p>
                    <p className="mt-4 text-3xl font-black text-slate-950">{value}</p>
                    <p className="mt-2 text-sm font-bold text-slate-500">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function ServicesSection({ onContact }: { onContact: () => void }) {
  const services = [
    { label: '병원·요양병원', tag: '의료폐기물 팀', text: '정기·추가·용기·대장' },
    { label: '의원·치과·한의원', tag: '의료폐기물 팀', text: '소규모 배출기관 기준 관리' },
    { label: '요양시설·장례식장', tag: '기저귀 수거 포함', text: '시설 조건에 맞춘 분리 운행' },
    { label: '다수 거래처 관리', tag: '통합 배차', text: '서울·경기권 수거망 관리' },
  ]

  return (
    <section id="services" className="relative isolate overflow-hidden bg-white py-20 lg:py-28">
      <ArtImage src={ART.services} alt="대상별 서비스 시안" opacity="opacity-95" />
      <div className="absolute inset-0 bg-white/38" />
      <div className="relative mx-auto max-w-[1800px] px-7 lg:px-16">
        <Reveal className="max-w-[980px] rounded-[8px] bg-white/86 p-7 shadow-[0_24px_80px_-54px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/75 backdrop-blur-md">
          <p className="text-[16px] font-black text-teal-700">대상별 서비스</p>
          <h2 className="mt-5 text-[2.4rem] font-black leading-[1.15] tracking-normal text-slate-950 lg:text-[4.1rem]">
            기관 유형과 폐기물 종류에 따라
            <br />
            수거 기준을 나눕니다
          </h2>
          <p className="mt-6 max-w-3xl text-[19px] leading-relaxed text-slate-600">
            병원·의원은 의료폐기물 중심으로, 요양시설·장례식장은 일회용기저귀 수거를 포함해 조건에 맞게 운영합니다.
          </p>
        </Reveal>

        <div className="mt-24 grid gap-3 md:grid-cols-2 xl:grid-cols-4 xl:gap-0">
          {services.map((service, index) => (
            <Reveal key={service.label} delay={index * 0.05}>
              <button
                type="button"
                onClick={onContact}
                className={`group min-h-[300px] w-full overflow-hidden bg-slate-950/72 p-6 text-left text-white shadow-[0_22px_80px_-42px_rgba(15,23,42,0.75)] backdrop-blur-sm transition hover:-translate-y-1 xl:min-h-[360px] ${
                  index > 0 ? 'xl:-ml-7' : ''
                }`}
                style={{ clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)' }}
              >
                <div className="flex h-full flex-col justify-end">
                  <span className={`w-fit rounded-[6px] px-4 py-2 text-[14px] font-black ${service.tag.includes('기저귀') ? 'bg-amber-500' : 'bg-teal-600'}`}>
                    {service.tag}
                  </span>
                  <p className="mt-4 text-[2rem] font-black leading-tight lg:text-[2.3rem]">{service.label}</p>
                  <p className="mt-3 text-[15px] font-semibold text-white/72">{service.text}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {['정기', '추가', '용기', '대장'].map((item) => (
                      <span key={item} className="rounded-[5px] bg-white/12 px-3 py-1.5 text-xs font-black">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function CoverageSection({ onContact }: { onContact: () => void }) {
  return (
    <section id="coverage" className="relative isolate min-h-[100dvh] overflow-hidden bg-slate-950 py-20 text-white lg:py-28">
      <ArtImage src={ART.coverage} alt="서울 경기권 수거망 지도 시안" />
      <div className="absolute inset-0 bg-slate-950/28" />
      <div className="relative mx-auto grid min-h-[760px] max-w-[1800px] items-center px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-16">
        <div />
        <Reveal className="rounded-[8px] bg-slate-950/66 p-8 ring-1 ring-white/12 backdrop-blur-md lg:p-12">
          <p className="text-[18px] font-black text-teal-300">거래처·권역</p>
          <h2 className="mt-6 text-[2.5rem] font-black leading-[1.12] tracking-normal lg:text-[4rem]">
            서울·경기권 수거망을
            <br />
            <span className="text-teal-300">한눈에</span> 관리합니다
          </h2>
          <p className="mt-7 max-w-xl text-[20px] leading-relaxed text-white/75">
            남양주 기반 운영으로 병원, 요양병원, 의원, 요양시설의 정기·추가 수거 조건을 축적합니다.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {[
              ['50곳+', '관리 거래처'],
              ['월 100톤+', '수거·운반'],
              ['정기·추가', '수거 대응'],
              ['전용 차량', '운영'],
            ].map(([value, label]) => (
              <div key={label} className="border-l border-white/20 pl-5 first:border-l-0 first:pl-0">
                <p className="text-[2.3rem] font-black text-teal-300">{value}</p>
                <p className="mt-2 text-[16px] font-bold text-white/78">{label}</p>
              </div>
            ))}
          </div>
          <ActionButton onClick={onContact} variant="outline" className="mt-12 min-w-[330px] border-teal-400 text-teal-200 ring-teal-400 hover:bg-teal-400/10">
            권역 상담하기 <ArrowRight size={18} />
          </ActionButton>
        </Reveal>
      </div>
    </section>
  )
}

function WorkflowSection() {
  const checks = [
    '수거주기·보관기한 관리',
    '전용 용기·자재 공급 이력',
    '수거완료 내역·수거대장 확인',
    '의료폐기물 및 일회용기저귀 배출물 분리 관리',
    '실사·인증 전 자료 요청 대응',
  ]

  return (
    <section id="workflow" className="relative isolate overflow-hidden bg-[#f7fafc] py-20 lg:py-28">
      <ArtImage src={ART.workflow} alt="보관기한부터 수거대장까지 현장 확인 시안" opacity="opacity-95" />
      <div className="absolute inset-0 bg-white/42" />
      <div className="relative mx-auto grid max-w-[1800px] items-center gap-10 px-7 lg:grid-cols-[1.1fr_0.9fr] lg:px-16">
        <div className="min-h-[640px]" />
        <Reveal className="rounded-[8px] bg-white/88 p-8 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80 backdrop-blur-md lg:p-11">
          <p className="text-[17px] font-black text-teal-700">수거 관리 방식</p>
          <h2 className="mt-5 text-[2.35rem] font-black leading-[1.14] tracking-normal text-slate-950 lg:text-[3.7rem]">
            보관기한부터 수거대장까지
            <br />
            현장에서 확인합니다
          </h2>
          <p className="mt-6 max-w-xl text-[19px] leading-relaxed text-slate-600">
            보관기한, 전용 용기, 자재 요청, 수거이력을 현장에서 확인하고 정리해 의료기관의 관리 부담을 줄입니다.
          </p>
          <div className="mt-8 divide-y divide-slate-200">
            {checks.map((check) => (
              <div key={check} className="flex items-center gap-4 py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                  <Check size={18} />
                </span>
                <p className="text-[18px] font-black text-slate-900">{check}</p>
              </div>
            ))}
          </div>
          <ActionButton onClick={() => scrollToSection('tech')} variant="outline" className="mt-8 min-w-[300px]">
            관리 항목 보기 <ArrowRight size={18} />
          </ActionButton>
        </Reveal>
      </div>
    </section>
  )
}

function TechSection({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  const points = [
    [Route, '경로 최적화 특허출원', '의료폐기물 수거·운반 경로 최적화 시스템'],
    [ClipboardList, '연구개발전담부서 운영', '수거·운반 및 자재·이력 통합관리를 위한 연구개발 체계'],
    [Monitor, '운영관리 화면 구축', '거래처·배차·수거이력·자재·미수금 관리 화면 구현'],
    [Truck, '배차·경로 추천 로직 개발', '운영 데이터 기반 추천 시뮬레이션 고도화'],
  ] as const

  return (
    <section id="tech" className="relative isolate overflow-hidden bg-[#f7fafc] py-20 lg:py-28">
      <ArtImage src={ART.tech} alt="운영관리 시스템 개발 현황 시안" opacity="opacity-92" />
      <div className="absolute inset-0 bg-white/34" />
      <div className="relative mx-auto grid max-w-[1800px] gap-9 px-7 lg:grid-cols-[0.72fr_1.28fr] lg:px-16">
        <Reveal className="rounded-[8px] bg-white/88 p-8 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80 backdrop-blur-md lg:p-10">
          <p className="text-[17px] font-black text-teal-700">개발 현황</p>
          <h2 className="mt-5 text-[2.4rem] font-black leading-[1.13] tracking-normal text-slate-950 lg:text-[3.8rem]">
            운영관리 시스템을
            <br />
            현장 기준에 맞춰
            <br />
            고도화하고 있습니다
          </h2>
          <p className="mt-6 text-[18px] leading-relaxed text-slate-600">
            수거·운반 현장에서 발생하는 거래처 정보, 수거조건, 차량 운행, 자재 요청, 수거이력을 체계적으로 관리하기 위한 화면을 구축하고 있습니다.
          </p>
          <div className="mt-8 space-y-3">
            {points.map(([Icon, title, desc]) => (
              <button key={title} type="button" onClick={title.includes('화면') ? onSystem : undefined} className="flex w-full gap-4 rounded-[8px] bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Icon size={24} />
                </span>
                <span>
                  <span className="block text-[17px] font-black text-slate-950">{title}</span>
                  <span className="mt-1 block text-sm font-semibold leading-relaxed text-slate-500">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08} className="flex min-h-[640px] items-end">
          <div className="w-full rounded-[8px] border border-slate-200 bg-white/86 p-5 shadow-[0_26px_110px_-58px_rgba(15,23,42,0.6)] backdrop-blur-md">
            <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-[8px] border border-slate-200 bg-white p-5">
                <h3 className="text-[22px] font-black text-slate-950">경로 최적화</h3>
                <div className="mt-5 aspect-[16/10] rounded-[6px] bg-[linear-gradient(135deg,#eef7f8,#ffffff)] p-4">
                  <div className="relative h-full rounded-[6px] border border-teal-100 bg-white/70">
                    {[20, 44, 68, 82].map((left, index) => (
                      <span
                        key={left}
                        className="absolute flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 text-sm font-black text-white shadow-[0_0_0_8px_rgba(13,148,136,0.12)]"
                        style={{ left: `${left}%`, top: `${[32, 58, 25, 70][index]}%` }}
                      >
                        {index + 3}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-[8px] border border-slate-200 bg-white p-5">
                <h3 className="text-[22px] font-black text-slate-950">수거 이력</h3>
                <div className="mt-5 overflow-hidden rounded-[6px] border border-slate-200">
                  {[
                    ['2025.05.20', '서울대학교병원', '의료폐기물', '120.5 kg'],
                    ['2025.05.20', '참조은요양병원', '일회용기저귀', '33.7 kg'],
                    ['2025.05.19', '미래클리닉', '의료폐기물', '28.9 kg'],
                    ['2025.05.18', '하나이비인후과', '의료폐기물', '45.3 kg'],
                  ].map(([date, place, type, amount]) => (
                    <div key={`${date}-${place}`} className="grid grid-cols-[1fr_1.35fr_1fr_0.8fr] border-b border-slate-200 px-3 py-3 text-sm last:border-b-0">
                      <span className="font-bold text-slate-500">{date}</span>
                      <span className="font-black text-slate-950">{place}</span>
                      <span className={`font-black ${type.includes('기저귀') ? 'text-amber-700' : 'text-teal-700'}`}>{type}</span>
                      <span className="text-right font-black text-slate-700">{amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-4 rounded-[8px] bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-600">개선효과는 실제 운행데이터 축적 후 실증지표로 검증할 예정입니다.</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <ActionButton onClick={onSystem}>운영관리 화면 보기 <ArrowRight size={17} /></ActionButton>
                <ActionButton onClick={onContact} variant="outline">개발 현황 문의</ActionButton>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section id="contact" className="relative isolate overflow-hidden bg-[#f8fafc] py-20 lg:py-28">
      <ArtImage src={ART.contact} alt="상담 문의 폼 시안" opacity="opacity-92" />
      <div className="absolute inset-0 bg-white/50" />
      <div className="relative mx-auto grid max-w-[1800px] gap-10 px-7 lg:grid-cols-[0.9fr_1.1fr] lg:px-16">
        <Reveal className="rounded-[8px] bg-white/84 p-8 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/80 backdrop-blur-md lg:p-10">
          <p className="text-[17px] font-black text-teal-700">상담 문의</p>
          <h2 className="mt-5 text-[2.45rem] font-black leading-[1.13] tracking-normal text-slate-950 lg:text-[4rem]">
            기관의 배출 조건을 알려주시면
            <br />
            수거 기준을 정리해드립니다
          </h2>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-slate-600">
            지역, 기관 유형, 수거 주기, 용기·자재 필요 여부를 바탕으로 상담합니다.
          </p>
          <div className="mt-10 divide-y divide-slate-200">
            {[
              ['전문 상담 지원', '의료폐기물 관리 전문 상담원이 맞춤 안내'],
              ['정확한 기준 안내', '관련 법규 및 지역 기준을 반영한 수거 기준 정리'],
              ['안전하고 신속한 처리', '안전 수거·운반 체계에 기반한 처리 방안 제안'],
            ].map(([title, desc]) => (
              <div key={title} className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
                <p className="flex items-center gap-3 font-black text-slate-950">
                  <CheckCircle2 className="text-teal-600" size={22} />
                  {title}
                </p>
                <p className="font-semibold text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <ConsultForm />
        </Reveal>
      </div>
    </section>
  )
}

type FormState = {
  inquiryType: string
  organization: string
  manager: string
  phone: string
  email: string
  region: string
  facilityType: string
  message: string
  privacy: boolean
}

function ConsultForm() {
  const [form, setForm] = useState<FormState>({
    inquiryType: INQUIRY_TYPES[0],
    organization: '',
    manager: '',
    phone: '',
    email: '',
    region: '',
    facilityType: '',
    message: '',
    privacy: false,
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const update = (key: keyof FormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!form.organization || !form.manager || !form.phone || !form.email || !form.message || !form.privacy) {
      setError('필수 항목과 개인정보 동의를 확인해주세요.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('이메일 형식을 확인해주세요.')
      return
    }

    setStatus('loading')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) throw new Error('submit failed')
      setStatus('success')
      setForm({
        inquiryType: INQUIRY_TYPES[0],
        organization: '',
        manager: '',
        phone: '',
        email: '',
        region: '',
        facilityType: '',
        message: '',
        privacy: false,
      })
    } catch {
      setStatus('error')
      setError('문의 전송 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[8px] bg-white/92 p-6 shadow-[0_28px_90px_-54px_rgba(15,23,42,0.55)] ring-1 ring-slate-200 backdrop-blur-md lg:p-8">
      <h3 className="text-[24px] font-black text-slate-950">문의 유형</h3>
      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[6px] border border-slate-200 lg:grid-cols-4">
        {INQUIRY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => update('inquiryType', type)}
            className={`flex min-h-20 flex-col items-center justify-center gap-2 border-r border-slate-200 px-3 text-[15px] font-black last:border-r-0 ${
              form.inquiryType === type ? 'bg-teal-50 text-teal-700 ring-2 ring-inset ring-teal-600' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {type === '수거 문의' ? <Truck size={22} /> : type === '계약 문의' ? <FileText size={22} /> : type === '기타 문의' ? <Menu size={22} /> : <MessageCircle size={22} />}
            {type}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="기관명" required value={form.organization} onChange={(value) => update('organization', value)} placeholder="기관명을 입력해주세요." />
        <Field label="담당자명" required value={form.manager} onChange={(value) => update('manager', value)} placeholder="담당자명을 입력해주세요." />
        <Field label="연락처" required value={form.phone} onChange={(value) => update('phone', value)} placeholder="예) 010-1234-5678" />
        <Field label="이메일" required type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="예) example@domain.com" />
        <Field label="지역" value={form.region} onChange={(value) => update('region', value)} placeholder="지역을 선택해주세요." />
        <label className="block">
          <span className="text-sm font-black text-slate-900">배출기관 유형 <span className="text-orange-600">*</span></span>
          <select
            value={form.facilityType}
            onChange={(event) => update('facilityType', event.target.value)}
            className="mt-2 h-12 w-full rounded-[6px] border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
          >
            <option value="">유형을 선택해주세요.</option>
            <option value="hospital">병원·요양병원</option>
            <option value="clinic">의원·치과·한의원</option>
            <option value="care">요양시설·장례식장</option>
            <option value="multi">다수 거래처</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-black text-slate-900">문의 내용 <span className="text-orange-600">*</span></span>
        <textarea
          value={form.message}
          onChange={(event) => update('message', event.target.value)}
          placeholder="배출 조건, 수거 주기, 용기·자재 필요 여부 등을 자세히 입력해주시면 상담에 도움이 됩니다."
          maxLength={500}
          className="mt-2 min-h-[150px] w-full resize-none rounded-[6px] border border-slate-200 bg-white px-4 py-3 text-[15px] font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
        />
        <span className="mt-1 block text-right text-xs font-bold text-slate-400">{form.message.length} / 500</span>
      </label>

      <label className="mt-4 flex items-center justify-between gap-4 rounded-[6px] border border-slate-200 bg-slate-50 px-4 py-4">
        <span className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.privacy}
            onChange={(event) => update('privacy', event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
          />
          <span className="text-sm font-black text-slate-900">개인정보 수집 및 이용에 동의합니다. <span className="text-orange-600">*</span></span>
        </span>
        <button type="button" className="shrink-0 text-sm font-black text-slate-500">자세히 보기</button>
      </label>

      {error && <p className="mt-4 rounded-[6px] bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</p>}
      {status === 'success' && <p className="mt-4 rounded-[6px] bg-teal-50 px-4 py-3 text-sm font-black text-teal-700">문의가 접수되었습니다. 담당자가 확인 후 연락드립니다.</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-[6px] bg-teal-600 text-[18px] font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === 'loading' ? '전송 중입니다' : '상담 문의 보내기'} <ArrowRight size={19} />
      </button>
      <p className="mt-3 text-xs font-bold text-slate-400">표시 항목은 필수 입력 사항입니다.</p>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-900">
        {label} {required && <span className="text-orange-600">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-[6px] border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
      />
    </label>
  )
}

function SiteFooter({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  return (
    <footer className="relative isolate overflow-hidden bg-slate-950 text-white">
      <ArtImage src={ART.footer} alt="비원미래 푸터 시안" opacity="opacity-100" />
      <div className="absolute inset-0 bg-slate-950/38" />
      <div className="relative mx-auto max-w-[1800px] px-7 py-14 lg:px-16 lg:py-20">
        <div className="mb-14 flex flex-col gap-6 rounded-[8px] border border-teal-500/30 bg-slate-950/70 p-8 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between lg:p-14">
          <h2 className="text-[2rem] font-black leading-tight lg:text-[3.2rem]">의료폐기물·기저귀 수거 기준, 지금 정리하세요</h2>
          <ActionButton onClick={onContact} className="min-w-[260px]">수거 상담하기 <ArrowRight size={20} /></ActionButton>
        </div>

        <div className="grid gap-10 border-y border-white/10 py-12 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr_0.9fr]">
          <div>
            <div className="flex items-center gap-4">
              <BrandMark light />
              <div>
                <p className="text-2xl font-black">BEONE MIRAE</p>
                <p className="text-sm font-black text-teal-300">비원미래</p>
              </div>
            </div>
            <p className="mt-8 max-w-sm text-[18px] font-black">주식회사 비원미래</p>
            <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-white/68">
              경기도 남양주시 오남읍 양지로 47-35, 바동 1층
              <br />
              서울·경기권 운영
            </p>
          </div>
          {[
            ['회사', ['회사 소개', '대표 인사말', '연혁', '인증 및 허가', '오시는 길']],
            ['서비스', ['의료폐기물 수거·운반', '일회용기저귀 수거·운반', '전용 용기·자재 공급', '운영관리 시스템 개발']],
            ['운영', ['의료폐기물 팀', '기저귀 팀', '차량 및 이력 관리', '안전·교육 체계']],
          ].map(([title, links]) => (
            <div key={title as string}>
              <p className="text-[22px] font-black text-teal-300">{title as string}</p>
              <div className="mt-7 grid gap-4">
                {(links as string[]).map((link) => (
                  <button key={link} type="button" onClick={() => scrollToSection('services')} className="text-left text-[17px] font-semibold text-white/75 hover:text-white">
                    {link}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-[22px] font-black text-teal-300">관련 시스템</p>
            <button
              type="button"
              onClick={onSystem}
              className="mt-7 flex w-full items-center justify-between rounded-[8px] border border-teal-500/45 bg-slate-950/58 px-6 py-5 text-left text-[17px] font-black text-white transition hover:bg-teal-500/10"
            >
              올바로 시스템 바로가기 <ExternalLink size={20} />
            </button>
            <button type="button" onClick={() => window.open(ALLBARO_URL, '_blank', 'noopener,noreferrer')} className="mt-4 text-left text-sm font-semibold text-white/52">
              폐기물 적법처리 국가시스템(환경부·한국환경공단)
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5 py-6 text-[15px] font-semibold text-white/58 lg:flex-row lg:items-center">
          <p>© 2026 BEONE MIRAE CO.</p>
          <span className="hidden h-5 w-px bg-white/20 lg:block" />
          {['개인정보처리방침', '이용약관', '정보보호 정책', '이메일무단수집거부', '윤리경영 신고센터'].map((item) => (
            <button key={item} type="button" className="text-left hover:text-white">
              {item}
            </button>
          ))}
        </div>
      </div>
    </footer>
  )
}

function FloatingActions({ onContact }: { onContact: () => void }) {
  return (
    <div className="fixed bottom-5 left-4 right-4 z-40 flex gap-3 lg:hidden">
      <button type="button" onClick={onContact} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[6px] bg-teal-600 text-[15px] font-black text-white shadow-lg">
        <MessageCircle size={18} />
        상담 문의
      </button>
      <button type="button" onClick={() => window.open(ALLBARO_URL, '_blank', 'noopener,noreferrer')} className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[6px] bg-slate-950 text-[15px] font-black text-white shadow-lg">
        <ExternalLink size={18} />
        올바로
      </button>
    </div>
  )
}

export function CompanyHomePage() {
  const navigate = useNavigate()
  const openContact = () => scrollToSection('contact')
  const openSystem = () => navigate('/')

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (hash) window.setTimeout(() => scrollToSection(hash), 80)
  }, [])

  return (
    <main className="min-h-screen bg-white font-sans text-slate-950">
      <Header onContact={openContact} />
      <Hero onContact={openContact} />
      <OperationsSection onContact={openContact} />
      <ServicesSection onContact={openContact} />
      <CoverageSection onContact={openContact} />
      <WorkflowSection />
      <TechSection onContact={openContact} onSystem={openSystem} />
      <ContactSection />
      <SiteFooter onContact={openContact} onSystem={openSystem} />
      <FloatingActions onContact={openContact} />
    </main>
  )
}

export default CompanyHomePage
