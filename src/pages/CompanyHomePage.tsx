import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'

// ─────────────────────────────────────────────────────────────────────────────
// 주식회사 비원미래 공식 홈페이지 (/company)
//  · 8장 디자인 보드(이미지)를 각 섹션 배경(visual layer)로 사용
//  · 모든 텍스트 콘텐츠는 코드로 생성(coded layer)하여 이미지 위에 오버레이
//  · 텍스트는 이미지에 내장되지 않으므로: 선명함 + 반응형 + 선택 가능 + 접근성
//  · 상단 네비게이션(스크롤 시 나타남) + 각 섹션 CTA·폼을 실제 클릭 요소로
// ─────────────────────────────────────────────────────────────────────────────

const board = (n: number) => `/company/boards/${n}.png`

// 섹션(이미지 1~8) — id 는 네비게이션 앵커로 사용
const SECTIONS = [
  { n: 1, id: 'top' },
  { n: 2, id: 'about' },
  { n: 3, id: 'services' },
  { n: 4, id: 'coverage' },
  { n: 5, id: 'workflow' },
  { n: 6, id: 'tech' },
  { n: 7, id: 'contact' },
  { n: 8, id: 'footer' },
]

const NAV = [
  { label: '회사소개', id: 'about' },
  { label: '서비스', id: 'services' },
  { label: '운영현황', id: 'tech' },
  { label: '문의', id: 'contact' },
]

// 섹션별 컨텐츠 — 이미지 위에 오버레이할 텍스트/버튼
interface SectionContent {
  headline?: string
  subheadline?: string
  description?: string
  ctas?: Array<{ label: string; to?: string; href?: string; external?: boolean }>
  layout?: 'center' | 'top-left' | 'bottom-center' | 'bottom-left' // 텍스트 위치
  bgOverlay?: boolean // 배경 어둡게 처리
}

const SECTION_CONTENT: Record<number, SectionContent> = {
  1: {
    headline: '의료폐기물 운송을 운영 기준까지 관리합니다',
    description: '비원미래는 서울·경기권 병원, 요양병원, 의원, 요양시설을 대상으로 의료폐기물 수거·운반을 진행합니다.',
    ctas: [
      { label: '수거 상담', to: 'contact' },
      { label: '운영 범위 보기', to: 'services' },
    ],
    layout: 'center',
    bgOverlay: true,
  },
  2: {
    headline: '핵심 운영 기준',
    description: '수거만 맡기는 것이 아니라 운영 부담까지 줄입니다',
    ctas: [{ label: '관리 기준 확인하기', to: 'contact' }],
    layout: 'bottom-left',
  },
  3: {
    headline: '대상별 서비스',
    description: '기관 유형과 폐기물 종류에 따라 수거 기준을 나눕니다',
    ctas: [{ label: '대상 기관 확인하기', to: 'contact' }],
    layout: 'bottom-center',
  },
  4: {
    headline: '서울·경기권 수거망',
    description: '한눈에 관리합니다',
    ctas: [{ label: '권역 상담하기', to: 'contact' }],
    layout: 'bottom-center',
  },
  5: {
    headline: '현장 운영 기준',
    description: '보관기한부터 수거대장까지 현장에서 확인합니다',
    ctas: [{ label: '관리 항목 보기', to: 'contact' }],
    layout: 'bottom-center',
  },
  6: {
    headline: '운영관리 시스템',
    description: '현장 기준에 맞춰 고도화하고 있습니다',
    ctas: [{ label: '운영관리 화면 보기', to: 'contact' }],
    layout: 'bottom-center',
  },
  7: {
    headline: '상담 문의',
    description: '기관의 배출 조건을 알려주시면 수거 기준을 정리해드립니다',
    layout: 'center',
    bgOverlay: true,
  },
  8: {
    headline: '비원미래',
    description: '의료폐기물·기저귀 수거 기준, 지금 정리하세요',
    ctas: [
      { label: '수거 상담하기', to: 'contact' },
      { label: '올바로 시스템 바로가기', href: ALLBARO_URL, external: true },
    ],
    layout: 'bottom-center',
  },
}

export function CompanyHomePage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', phone: '', content: '' })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.75)
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

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    alert(`요청이 전송되었습니다.\n이름: ${contactForm.name}\n전화: ${contactForm.phone}\n문의: ${contactForm.content}`)
    setContactForm({ name: '', phone: '', content: '' })
  }

  return (
    <div className="min-h-[100dvh] bg-navy-950 font-sans">
      {/* 스크롤 시 나타나는 상단 네비게이션 */}
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-navy-950/90 backdrop-blur-lg transition-opacity duration-300 ${
          scrolled ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="mx-auto flex h-[64px] w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <button onClick={() => goTo('top')} className="flex items-center gap-2 text-[18px] font-extrabold text-white" aria-label="맨 위로">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-400/40 text-accent-300">
              <svg viewBox="0 0 40 40" width={18} height={18} fill="none">
                <path d="M20 4 L33 11.5 V28.5 L20 36 L7 28.5 V11.5 Z" stroke="#2dd4bf" strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
            </span>
            비원미래
          </button>
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => goTo(n.id)} className="text-[15px] font-bold text-white/80 transition-colors hover:text-white">
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hidden lg:block">
            <button
              onClick={() => goTo('contact')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-[15px] font-bold text-white transition hover:bg-accent-400"
            >
              수거 상담 <ArrowRight size={16} strokeWidth={2.4} />
            </button>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white lg:hidden" aria-label="메뉴">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/10 bg-navy-950/95 lg:hidden">
            <nav className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="rounded-lg px-2 py-3 text-left text-[15px] font-bold text-white/85 hover:bg-white/10">
                  {n.label}
                </button>
              ))}
              <button onClick={() => goTo('contact')} className="my-2 rounded-lg bg-accent-500 px-4 py-3 text-[15px] font-bold text-white">
                수거 상담
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* 메인 섹션 — 이미지 배경 + 코딩된 텍스트 오버레이 */}
      <main>
        {SECTIONS.map((s) => {
          const content = SECTION_CONTENT[s.n]
          const isContactSection = s.n === 7

          return (
            <section
              key={s.n}
              id={s.id}
              className="relative w-full scroll-mt-16 overflow-hidden"
              style={{
                backgroundImage: `url(${board(s.n)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* 배경 이미지 — fallback 및 명시적 표시 */}
              <img
                src={board(s.n)}
                alt={`Section ${s.n}`}
                className="block w-full"
                draggable={false}
              />

              {/* 배경 어두운 처리 (선택) */}
              {content?.bgOverlay && <div className="absolute inset-0 bg-black/40" />}

              {/* 코딩된 텍스트 및 상호작용 요소 오버레이 */}
              <div
                className={`absolute inset-0 flex flex-col px-5 py-12 text-white sm:px-6 lg:px-8 ${
                  content?.layout === 'center'
                    ? 'items-center justify-center text-center'
                    : content?.layout === 'top-left'
                      ? 'items-start justify-start pt-20'
                      : content?.layout === 'bottom-left'
                        ? 'items-start justify-end pb-16'
                        : 'items-center justify-end pb-16 text-center'
                }`}
              >
                {content?.headline && (
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-4 max-w-2xl">
                    {content.headline}
                  </h2>
                )}
                {content?.description && (
                  <p className="text-lg sm:text-xl text-white/90 mb-8 max-w-2xl">
                    {content.description}
                  </p>
                )}

                {/* 연락처 폼 (섹션 7) */}
                {isContactSection && (
                  <form onSubmit={handleContactSubmit} className="w-full max-w-md space-y-4 bg-white/10 backdrop-blur-sm p-6 rounded-2xl">
                    <input
                      type="text"
                      placeholder="이름"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:ring-2 focus:ring-accent-400"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="연락처"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:ring-2 focus:ring-accent-400"
                      required
                    />
                    <textarea
                      placeholder="문의 내용"
                      value={contactForm.content}
                      onChange={(e) => setContactForm({ ...contactForm, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:ring-2 focus:ring-accent-400 h-24 resize-none"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full px-6 py-3 bg-accent-500 hover:bg-accent-400 text-white font-bold rounded-lg transition"
                    >
                      문의 보내기
                    </button>
                  </form>
                )}

                {/* CTA 버튼 */}
                {content?.ctas && !isContactSection && (
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    {content.ctas.map((cta, i) => (
                      cta.external ? (
                        <a
                          key={i}
                          href={cta.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-400 text-white font-bold rounded-lg transition"
                        >
                          {cta.label} <ArrowRight size={16} strokeWidth={2.4} />
                        </a>
                      ) : (
                        <button
                          key={i}
                          onClick={() => goTo(cta.to || 'contact')}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-400 text-white font-bold rounded-lg transition"
                        >
                          {cta.label} <ArrowRight size={16} strokeWidth={2.4} />
                        </button>
                      )
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </main>

      <button onClick={() => navigate('/')} className="sr-only">운영 대시보드 열기</button>
    </div>
  )
}
