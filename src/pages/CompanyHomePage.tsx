import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'

// ─────────────────────────────────────────────────────────────────────────────
// 주식회사 비원미래 공식 홈페이지 (/company)
//  · 확정 디자인 시안 8장(다크 프리미엄)을 각 섹션 배경으로 그대로 사용.
//  · 시안 자체가 완성 디자인이므로, 그 위에 "기능"만 코드로 얹음:
//     상단 스크롤 헤더(네비게이션) + 각 시안의 CTA·링크를 실제 클릭 영역(핫스팟)으로.
//  · 이미지는 % 기준 오버레이라 반응형으로 함께 스케일됨.
// ─────────────────────────────────────────────────────────────────────────────

const board = (n: number) => `/company/boards/${n}.png`

// 섹션(시안 1~8) — id 는 네비게이션 앵커로 사용
const SECTIONS: { n: number; id: string; alt: string }[] = [
  { n: 1, id: 'top', alt: '히어로 — 의료폐기물 운송을 운영 기준까지 관리합니다' },
  { n: 2, id: 'about', alt: '핵심 운영 기준 — 수거만 맡기는 것이 아니라 운영 부담까지 줄입니다' },
  { n: 3, id: 'services', alt: '대상별 서비스 — 기관 유형과 폐기물 종류에 따라 수거 기준을 나눕니다' },
  { n: 4, id: 'coverage', alt: '서울·경기권 수거망을 한눈에 관리합니다' },
  { n: 5, id: 'workflow', alt: '보관기한부터 수거대장까지 현장에서 확인합니다' },
  { n: 6, id: 'tech', alt: '운영관리 시스템을 현장 기준에 맞춰 고도화하고 있습니다' },
  { n: 7, id: 'contact', alt: '상담 문의 — 기관의 배출 조건을 알려주시면 수거 기준을 정리해드립니다' },
  { n: 8, id: 'footer', alt: '비원미래 — 의료폐기물·기저귀 수거 기준, 지금 정리하세요' },
]

const NAV = [
  { label: '회사소개', id: 'about' },
  { label: '서비스', id: 'services' },
  { label: '운영현황', id: 'tech' },
  { label: '문의', id: 'contact' },
]

type Spot = {
  left: number
  top: number
  width: number
  height: number
  to: string // 섹션 id 또는 'external'
  href?: string
  label: string
}

// 각 시안의 클릭 가능한 버튼/링크 위치(이미지 대비 %). 대략치 — 피드백 후 미세조정.
const SPOTS: Record<number, Spot[]> = {
  1: [
    { left: 87.5, top: 3, width: 9.5, height: 7.5, to: 'contact', label: '수거 상담' },
    { left: 3.5, top: 71, width: 13, height: 8, to: 'contact', label: '수거 상담 요청' },
    { left: 17.5, top: 71, width: 11.5, height: 8, to: 'services', label: '운영 범위 보기' },
  ],
  2: [{ left: 4, top: 79, width: 13, height: 6, to: 'contact', label: '관리 기준 확인하기' }],
  3: [{ left: 40, top: 92, width: 20, height: 6, to: 'contact', label: '대상 기관 확인하기' }],
  4: [{ left: 60, top: 75, width: 22, height: 9, to: 'contact', label: '권역 상담하기' }],
  5: [{ left: 62, top: 78, width: 17, height: 8, to: 'contact', label: '관리 항목 보기' }],
  6: [{ left: 55, top: 88, width: 20, height: 8, to: 'contact', label: '운영관리 화면 보기' }],
  7: [{ left: 47, top: 78, width: 45, height: 6, to: 'contact', label: '상담 문의 보내기' }],
  8: [
    { left: 77, top: 9, width: 20, height: 12, to: 'contact', label: '수거 상담하기' },
    { left: 77, top: 53, width: 20, height: 10, to: 'external', href: ALLBARO_URL, label: '올바로 시스템 바로가기' },
  ],
}

export function CompanyHomePage() {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // 히어로를 지나면 상단 네비게이션 헤더가 나타남
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.75)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // SEO
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

  return (
    <div className="min-h-[100dvh] bg-navy-950 font-sans">
      {/* 스크롤 시 나타나는 상단 네비게이션 (히어로 위에서는 숨김 — 시안의 baked 네비 노출) */}
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

      {/* 시안 8장 = 8개 섹션. 이미지 그대로 + 클릭 핫스팟 오버레이 */}
      <main>
        {SECTIONS.map((s) => (
          <section key={s.n} id={s.id} className="relative w-full scroll-mt-16">
            <img src={board(s.n)} alt={s.alt} className="block w-full select-none" draggable={false} />
            {(SPOTS[s.n] ?? []).map((sp, i) =>
              sp.to === 'external' ? (
                <a
                  key={i}
                  href={sp.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={sp.label}
                  title={sp.label}
                  className="absolute rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                  style={{ left: `${sp.left}%`, top: `${sp.top}%`, width: `${sp.width}%`, height: `${sp.height}%` }}
                />
              ) : (
                <button
                  key={i}
                  onClick={() => goTo(sp.to)}
                  aria-label={sp.label}
                  title={sp.label}
                  className="absolute rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                  style={{ left: `${sp.left}%`, top: `${sp.top}%`, width: `${sp.width}%`, height: `${sp.height}%` }}
                />
              ),
            )}
          </section>
        ))}
      </main>

      {/* 앱(운영 대시보드)로 진입 — 시연용 숨은 진입점 유지 */}
      <button onClick={() => navigate('/')} className="sr-only">운영 대시보드 열기</button>
    </div>
  )
}
