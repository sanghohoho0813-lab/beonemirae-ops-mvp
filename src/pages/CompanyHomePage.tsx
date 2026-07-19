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
  ClipboardList,
  ShieldCheck,
  FlaskConical,
  Layers,
  Database,
  Clock,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'

// 폐기물 적법처리 국가시스템 '올바로' (환경부/한국환경공단)
const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'

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
  { label: '운영현황', href: '#tech' },
  { label: '문의', href: '#contact' },
]

const HERO_BADGES = ['의료폐기물 수거·운반', '병원·요양병원·의원 정기 수거', '보관기한·추가수거 대응', '자재공급·수거대장 관리', '서울·경기권 운영']

// 핵심 신뢰 포인트 — 수거만 하지 않고 관리 부담까지 줄이는 4가지
const TRUST_CHECKS: { icon: LucideIcon; tone: 'teal' | 'emerald' | 'amber' | 'navy'; title: string; desc: string }[] = [
  { icon: Clock, tone: 'teal', title: '정기 수거', desc: '병원별 수거주기와 보관기한에 맞춰 정기 수거 일정을 관리합니다.' },
  { icon: ShieldCheck, tone: 'amber', title: '추가 수거', desc: '격리의료폐기물, 실사·인증 전 요청 등 추가 수거에도 대응합니다.' },
  { icon: Container, tone: 'emerald', title: '자재공급', desc: '전용 용기·봉투·박스 등 자재 요청과 공급 이력을 함께 관리합니다.' },
  { icon: FileText, tone: 'navy', title: '수거대장 관리', desc: '수거이력과 대장 확인이 쉽도록 거래처 단위로 정리합니다.' },
]

// 수거 관리 방식 체크리스트 — 이미지 1장 + 체크리스트
const LEGAL_CHECKS = [
  '수거주기·보관기한 관리',
  '전용 용기·자재 공급 이력 관리',
  '수거완료 내역·수거대장 확인',
  '의료폐기물·관련 배출물 분리 관리',
  '실사·인증 전 자료 요청 대응',
]

// 보조색 톤 — 아이콘 배경 (teal 위생·안정 / emerald 완료·관리 / amber 현장 대응 / navy 기본)
const TONE_CHIP: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-600 group-hover:bg-teal-500 group-hover:text-white',
  emerald: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white',
  amber: 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
  navy: 'bg-navy-100 text-navy-700 group-hover:bg-navy-900 group-hover:text-teal-300',
}

// 현장 이미지 슬롯 — 실제 사진이 들어오면 src만 채우면 교체되는 구조
type FieldFrame = { icon: LucideIcon; title: string; alt: string; src?: string }
const HERO_FIELD: FieldFrame = {
  icon: Truck,
  title: '종합병원 캠퍼스 의료폐기물 수거 현장',
  alt: '종합병원 캠퍼스 앞에서 여러 작업자가 의료폐기물 전용 용기를 수거 차량에 적재하는 현장',
  src: '/company/medical-campus-wide-pickup.webp',
}
// 섹션별 현장 이미지 — 같은 사진을 2회 이상 재사용하지 않도록 용도별로 분리
const IMG: Record<string, FieldFrame> = {
  consultation: { icon: ClipboardList, title: '병원 담당자와 수거 조건 상담', alt: '병원 담당자와 수거 조건·자재 요청을 함께 확인하는 상담 장면', src: '/company/consultation-hospital-admin.webp' },
  clients: { icon: MapPin, title: '거래처·권역 관리', alt: '서울·경기권 병원·요양병원·의원 등 거래처와 권역을 지도 보드로 관리하는 장면', src: '/company/client-network-board.webp' },
  band: { icon: Truck, title: '', alt: '여러 대의 전용 수거 차량에 의료폐기물 용기를 나눠 싣고 권역별 배차를 준비하는 현장', src: '/company/multi-vehicle-route-dispatch.webp' },
  hospital: { icon: Building2, title: '병원·요양병원 정기 수거', alt: '병원·요양병원 건물 앞에서 대형 카트로 의료폐기물 전용 용기를 옮겨 수거 차량에 싣는 현장', src: '/company/nursing-hospital-pickup.webp' },
  clinic: { icon: Building2, title: '의원·치과·한의원 수거', alt: '의원·치과·한의원 앞 도로에서 전용 용기를 카트로 옮겨 수거 차량에 싣는 현장', src: '/company/local-clinic-pickup.webp' },
  careFacility: { icon: Building2, title: '요양시설 등 수거', alt: '요양시설 출입구 앞에서 전용 용기를 카트로 옮겨 수거 차량에 싣는 현장', src: '/company/care-facility-pickup.webp' },
  supply: { icon: Container, title: '자재·전용 용기 공급 준비', alt: '자재 재고를 확인하고 전용 용기·자재 공급을 준비하는 장면', src: '/company/supply-inventory-prep.webp' },
  record: { icon: FileText, title: '수거이력·수거대장 관리', alt: '태블릿 대시보드로 수거 실적을 확인하고 전용 용기 QR을 스캔해 수거대장에 기록하는 장면', src: '/company/collection-record-dashboard.webp' },
  inspection: { icon: ClipboardList, title: '실사·인증 수거 지원', alt: '병원 담당자와 함께 밀봉된 의료폐기물 용기를 체크리스트와 태블릿으로 확인하는 장면', src: '/company/inspection-record-support.webp' },
  route: { icon: Route, title: '배차·경로 · 수거 데이터 운영', alt: '운행 경로와 수거 데이터를 확인하는 운영관리 장면', src: '/company/route-operations-desk.webp' },
  separated: { icon: Truck, title: '폐기물 종류별 분리 운행 현장', alt: '의료폐기물과 관련 배출물을 두 대의 차량으로 분리 운행하는 현장', src: '/company/separated-transport-flows.webp' },
}

// 대상별(기관 유형) 수거 운영 — 실제 현장 이미지 기반 4종
const TARGETS: { img: FieldFrame; tag: string; tone: string; desc: string }[] = [
  { img: IMG.hospital, tag: '병원·요양병원', tone: 'bg-teal-50 text-teal-600', desc: '주 1~3회 정기 수거, 추가 수거 요청, 자재공급 이력까지 함께 확인합니다.' },
  { img: IMG.clinic, tag: '의원·치과·한의원', tone: 'bg-amber-50 text-amber-600', desc: '격주 수거 등 소규모 배출기관의 수거 주기와 전용 용기 관리를 지원합니다.' },
  { img: IMG.careFacility, tag: '요양시설·장례식장', tone: 'bg-emerald-50 text-emerald-600', desc: '기관 특성에 맞춰 관련 배출물과 자재 요청을 함께 관리합니다.' },
  { img: IMG.clients, tag: '다수 거래처 관리', tone: 'bg-navy-100 text-navy-700', desc: '서울·경기권 분산형 거래처의 수거조건과 요청사항을 권역별로 정리합니다.' },
]

const STATS: { icon: LucideIcon; prefix: string; count: number | null; text?: string; suffix: string; label: string; desc: string; tone: 'teal' | 'emerald' | 'amber' | 'navy' }[] = [
  { icon: Building2, prefix: '', count: 50, suffix: '곳+', label: '관리 거래처', desc: '병원·요양병원·의원 등 서울·경기권 배출기관', tone: 'navy' },
  { icon: Recycle, prefix: '월 ', count: 100, suffix: '톤+', label: '수거·운반 규모', desc: '의료폐기물 및 관련 배출물 수거·운반', tone: 'teal' },
  { icon: MapPin, prefix: '', count: null, text: '서울·경기권', suffix: '', label: '광역 수거 운영', desc: '남양주 기반 권역 정기 수거', tone: 'emerald' },
  { icon: Clock, prefix: '', count: null, text: '정기·추가', suffix: ' 수거', label: '수거 대응 체계', desc: '정기 수거, 추가·긴급 수거, 자재공급 요청 관리', tone: 'amber' },
]

// 접이식 개발 현황 — 신규 고객에겐 요약만, 관심 있는 사람만 펼쳐보는 근거 카드
const TECH_DETAILS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: FlaskConical, title: '특허출원', desc: '의료폐기물 수거·운반 경로 최적화 시스템 · 출원번호 10-2026-0101187' },
  { icon: Database, title: '연구개발전담부서 운영', desc: '수거·운반 및 자재·이력 통합관리를 위한 연구개발전담부서를 운영하고 있습니다.' },
  { icon: Layers, title: 'MVP 시연 화면 보유', desc: '거래처·배차·수거이력·자재·미수금 관리 화면을 구현했습니다.' },
  { icon: Route, title: '배차·경로 추천 시뮬레이션', desc: '운영 데이터 기반 배차·경로 추천 로직을 개발 중입니다.' },
  { icon: FileText, title: '수거대장 출력·이력관리 고도화', desc: '수거대장 출력과 수거이력 관리 기능을 고도화할 예정입니다.' },
  { icon: CheckCircle2, title: '개선효과 검증 예정', desc: '실제 운행데이터 축적 후 개선효과를 실증지표로 검증할 예정입니다.' },
]

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

// 다크 헤더/푸터용 브랜드 마크 — 틸 육각형 안에 'B' 모노그램
function BrandMarkDark({ size = 38 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40" width={size} height={size} fill="none">
        <path
          d="M20 3.2 L33.5 11 V29 L20 36.8 L6.5 29 V11 Z"
          stroke="#2dd4bf"
          strokeWidth="2"
          fill="rgba(20,184,166,0.10)"
          strokeLinejoin="round"
        />
        <path d="M15.5 13 H21.2 a4 4 0 0 1 0 8 H15.5 Z M15.5 20 H21.8 a4 4 0 0 1 0 8 H15.5 Z"
          stroke="#5eead4" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
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

// ── 상담 문의 폼 (/api/contact 로 전송 — 이메일 발송) ─────────────────────────
const CLIENT_TYPE_OPTIONS = ['병원', '요양병원', '의원', '치과', '한의원·한방병원', '요양시설', '장례식장', '기타']
// 문의유형 — 이메일 제목([비원미래 홈페이지 문의] {기관명} - {문의유형})에 사용
const INQUIRY_TYPES = ['의료폐기물 수거·운반', '의료기관 폐기물 운영관리', '자재공급', '기타']

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
    company: '', // honeypot (숨김) — 스팸봇이 채우면 서버에서 무시
  })
  const [status, setStatus] = useState<'idle' | 'invalid' | 'sending' | 'success' | 'error'>('idle')
  const [invalidMsg, setInvalidMsg] = useState('')
  const sending = status === 'sending'

  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setStatus((s) => (s === 'invalid' || s === 'error' ? 'idle' : s))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    if (!form.org.trim() || !form.manager.trim() || !form.contact.trim() || !form.email.trim()) {
      setInvalidMsg('기관명·담당자명·연락처·이메일을 입력해 주세요.')
      setStatus('invalid')
      return
    }
    if (!emailOk) {
      setInvalidMsg('이메일 형식을 다시 확인해 주세요.')
      setStatus('invalid')
      return
    }
    if (!form.agree) {
      setInvalidMsg('개인정보 수집·이용에 동의해 주세요.')
      setStatus('invalid')
      return
    }
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
      setStatus(res.ok && data?.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const field = 'w-full rounded-lg bg-navy-50 px-4 py-3 text-[15px] font-medium text-navy-900 outline-none ring-1 ring-transparent transition placeholder:font-normal placeholder:text-navy-400 focus:bg-white focus:ring-2 focus:ring-teal-400'
  const label = 'mb-1.5 block text-[14px] font-bold text-navy-700'

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-navy-100 sm:p-10">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <CheckCircle2 size={34} strokeWidth={2.2} />
        </span>
        <p className="mt-5 text-xl font-extrabold text-navy-900">문의가 접수되었습니다.</p>
        <p className="mt-2 text-[15px] leading-relaxed text-navy-600">
          담당자가 확인 후 연락드리겠습니다. 감사합니다.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy-100 sm:p-8" noValidate>
      {/* honeypot — 사람에게는 보이지 않는 필드 */}
      <div className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="cf-company">회사 웹사이트</label>
        <input id="cf-company" name="company" tabIndex={-1} autoComplete="off" value={form.company} onChange={upd('company')} />
      </div>

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
          <input id="cf-contact" className={field} value={form.contact} onChange={upd('contact')} placeholder="연락 가능한 전화번호" />
        </div>
        <div>
          <label className={label} htmlFor="cf-email">이메일 <span className="text-rose-500">*</span></label>
          <input id="cf-email" type="email" className={field} value={form.email} onChange={upd('email')} placeholder="example@hospital.com" />
        </div>
        <div>
          <label className={label} htmlFor="cf-region">지역</label>
          <input id="cf-region" className={field} value={form.region} onChange={upd('region')} placeholder="예: 경기 남양주시" />
        </div>
        <div>
          <label className={label} htmlFor="cf-type">배출기관 유형</label>
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

      {/* 개인정보 수집·이용 동의 */}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-navy-50 p-4">
        <input
          type="checkbox"
          checked={form.agree}
          onChange={(e) => {
            setForm((f) => ({ ...f, agree: e.target.checked }))
            setStatus((s) => (s === 'invalid' ? 'idle' : s))
          }}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-navy-300 text-teal-500 focus:ring-teal-400"
        />
        <span className="text-[14px] leading-relaxed text-navy-600">
          <span className="font-bold text-navy-800">개인정보 수집·이용에 동의합니다. <span className="text-rose-500">*</span></span>
          <br />
          수집 항목: 기관명·담당자명·연락처·이메일·문의내용 / 이용 목적: 상담 응대 및 회신 / 상담 처리 후 파기됩니다.
        </span>
      </label>

      {status === 'invalid' && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-[14px] font-semibold text-rose-600">{invalidMsg}</p>
      )}
      {status === 'error' && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-[14px] font-semibold text-rose-600">
          일시적으로 문의 접수가 원활하지 않습니다. 잠시 후 다시 시도해주세요.
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-6 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
      >
        {sending ? '전송 중...' : <>상담 문의 보내기 <ArrowRight size={19} strokeWidth={2.4} /></>}
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-navy-400">
        입력하신 정보는 상담 응대 목적에 한해 사용되며, 담당자 확인 후 회신드립니다.
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
  const [techOpen, setTechOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const statsRef = useRef(false)

  // 헤더 톤 전환 — 히어로 위에서는 투명, 스크롤하면 다크 솔리드
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // SEO — 홈페이지 진입 시 문서 타이틀/설명 지정, 이탈 시 복원
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

  const goSystem = () => navigate('/')

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-navy-700">
      {/* ── Header (히어로 위 투명 → 스크롤 시 다크 솔리드) ───────────────────── */}
      <header
        className={`fixed top-0 z-50 w-full transition-colors duration-300 ${
          scrolled || menuOpen ? 'border-b border-white/10 bg-navy-950/90 backdrop-blur-lg' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2.5" aria-label="주식회사 비원미래 홈">
            <BrandMarkDark size={34} />
            <span className="text-[20px] font-extrabold tracking-tight text-white">비원미래</span>
          </a>

          {/* 데스크톱 내비 */}
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[15px] font-bold text-white/80 transition-colors hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-[15px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
            >
              수거 상담
            </a>
          </div>

          {/* 모바일 햄버거 */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white transition hover:bg-white/10 lg:hidden"
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
              className="overflow-hidden border-t border-white/10 bg-navy-950/95 lg:hidden"
            >
              <nav className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2 sm:px-6">
                {NAV.map((n) => (
                  <a
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-3 text-[15px] font-bold text-white/85 transition hover:bg-white/10"
                  >
                    {n.label}
                  </a>
                ))}
                <a
                  href="#contact"
                  onClick={() => setMenuOpen(false)}
                  className="mb-3 mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-accent-400"
                >
                  수거 상담 <ArrowRight size={18} strokeWidth={2.4} />
                </a>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="top">
        {/* ── Hero (다크 풀블리드 · 밴/병원 현장 배경 + 코드 텍스트) ─────────────── */}
        <section className="relative w-full overflow-hidden bg-navy-950 sm:min-h-[100svh]">
          {/* 배경 사진 */}
          <img
            src="/company/field-truck-hospital.webp"
            alt="종합병원 앞에서 전용 용기를 수거 차량에 싣는 비원미래 현장"
            className="absolute inset-0 h-full w-full object-cover object-center"
            loading="eager"
          />
          {/* 가독성 오버레이 — 좌측 진하게, 하단 진하게 */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/80 to-navy-950/25" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/10 to-navy-950/60" />

          <div className="relative mx-auto flex w-full max-w-6xl flex-col justify-center px-5 pb-14 pt-28 sm:min-h-[100svh] sm:px-6 sm:pb-52 sm:pt-32 lg:px-8">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="max-w-2xl"
            >
              <h1 className="text-[2.1rem] font-extrabold leading-[1.14] tracking-tight text-white sm:text-[3rem] lg:text-[3.6rem]">
                <span className="block">의료폐기물 운송을</span>
                <span className="block">운영 기준까지 관리합니다</span>
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/75 sm:text-[19px]">
                서울·경기권 의료기관의 정기 수거, 긴급 대응, 용기 공급, 수거대장 관리.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-7 py-4 text-[17px] font-bold text-white shadow-lg shadow-accent-500/20 transition hover:-translate-y-0.5 hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
                >
                  수거 상담 요청 <ArrowRight size={19} strokeWidth={2.4} />
                </a>
                <a
                  href="#services"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/5 px-7 py-4 text-[17px] font-bold text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/10"
                >
                  운영 범위 보기
                </a>
              </div>
            </motion.div>
          </div>

          {/* 하단 특징 바 — 3열 (코드로 렌더) · 모바일은 본문 아래로 흐름 */}
          <div className="relative z-10 border-t border-white/10 bg-navy-950/55 backdrop-blur-md sm:absolute sm:inset-x-0 sm:bottom-0">
            <div className="mx-auto grid w-full max-w-6xl grid-cols-1 divide-y divide-white/10 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6 lg:px-8">
              {[
                { icon: ShieldCheck, title: '허가 기반 운송', desc: '관할 기관 허가 기반의 안전한 운송 체계' },
                { icon: Container, title: '전용 용기 관리', desc: '규격 용기 사용 및 회수·세척·소독 관리' },
                { icon: FileText, title: '수거이력 기록', desc: '수거부터 폐기까지 전 과정 기록·보관' },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <div key={f.title} className="flex items-center gap-3.5 py-5 sm:px-6 sm:first:pl-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-400/30 bg-accent-500/10 text-accent-300">
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-white">{f.title}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-white/55">{f.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ▼▼▼ 아래 섹션들은 다음 단계에서 순차적으로 다크 시안에 맞춰 교체 예정 ▼▼▼ */}
        {false && (
        <section className="relative overflow-hidden border-b border-navy-100 bg-gradient-to-b from-navy-50 to-white">
          <div className="relative mx-auto grid w-full max-w-6xl items-start gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:py-24">
            <motion.div
              className="lg:pt-6"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <h1 className="mt-5 text-[1.75rem] font-extrabold leading-[1.16] tracking-tight text-navy-900 sm:text-[2.4rem] lg:text-[3rem]">
                <span className="block">의료기관 폐기물 수거·운반,</span>
              </h1>

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
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> 종합병원 캠퍼스 의료폐기물 수거 현장
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ── 핵심 신뢰 포인트 (흰 배경 · 큰 아이콘 카드 4개) ─────────────────── */}
        <Section>
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>핵심 신뢰 포인트</Eyebrow>
              <Heading>수거만 하지 않습니다, 관리 부담까지 줄입니다</Heading>
              <p className="mt-4 text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                정기 수거부터 추가 수거, 자재공급, 수거대장까지 — 의료기관 담당자가 챙겨야 할 일을 함께 관리합니다.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_CHECKS.map((c, i) => {
              const Icon = c.icon
              return (
                <Reveal key={c.title} delay={i * 0.06}>
                  <div className="group flex h-full flex-col rounded-2xl bg-white p-7 shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${TONE_CHIP[c.tone]}`}>
                      <Icon size={28} strokeWidth={2.1} />
                    </span>
                    <p className="mt-5 text-xl font-extrabold text-navy-900">{c.title}</p>
                    <p className="mt-2.5 text-base leading-relaxed text-navy-600 sm:text-[17px]">{c.desc}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </Section>

        {/* ── 운영 기반 숫자 (거래처·권역) ──────────────────────────────────── */}
        <div className="bg-slate-50">
        <Section id="about">
          <Reveal>
            <div className="max-w-3xl">
              <Eyebrow>거래처·권역</Eyebrow>
              <Heading>병원·요양병원·의원 등 다양한 의료기관을 관리합니다</Heading>
              <p className="mt-5 text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                남양주를 기반으로 서울·경기권 병원·요양병원·의원·요양시설 등 다양한 의료기관의 의료폐기물을 수거·운반합니다.
                권역 내 정기 수거 체계를 안정적으로 운영하며, 거래처 확대에 맞춰 운행 데이터를 축적하고 있습니다.
              </p>
            </div>
          </Reveal>
          <motion.div
            className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
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

          <Reveal className="mt-5">
            <p className="text-[15px] leading-relaxed text-navy-500 sm:text-base">
              폐기물 종류와 수거 조건에 맞춰 차량을 구분해 운영하며, 거래처 확대에 맞춰 운행 체계를 고도화하고 있습니다.
            </p>
          </Reveal>
        </Section>
        </div>

        {/* ── 대상별 서비스 (기관 유형) ─────────────────────────────────────── */}
        <Section id="services">
          <Reveal>
            <Eyebrow>대상별 서비스</Eyebrow>
            <Heading>기관 유형에 따라 수거 방식도 달라집니다</Heading>
            <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-navy-700 sm:text-lg">
              같은 의료폐기물이라도 병원·의원·요양시설마다 배출량과 수거 주기, 현장 여건이 다릅니다. 비원미래는 기관 유형에
              맞춰 방문 주기와 전용 용기, 운행 동선을 조정해 관리합니다.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TARGETS.map((t, i) => (
              <Reveal key={t.tag} delay={i * 0.06}>
                <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-teal-200">
                  <ImageSlot frame={t.img} hideCaption className="aspect-[16/10] rounded-none ring-0 shadow-none" />
                  <div className="flex flex-1 flex-col p-6">
                    <span className={`inline-block w-fit rounded-full px-3.5 py-1.5 text-sm font-bold ${t.tone}`}>{t.tag}</span>
                    <p className="mt-3 text-base leading-relaxed text-navy-700 sm:text-[17px]">{t.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── 수거 관리 방식 (light slate · 사진 1장 + 체크리스트) ──────────── */}
        <div className="bg-slate-50">
          <Section>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <Reveal>
                <ImageSlot frame={IMG.record} hideCaption className="aspect-[4/3] shadow-lg" />
              </Reveal>
              <Reveal delay={0.05}>
                <Eyebrow>수거 관리 방식</Eyebrow>
                <Heading>보관기한부터 수거대장까지 함께 챙깁니다</Heading>
                <p className="mt-5 text-[17px] leading-relaxed text-navy-700 sm:text-lg">
                  보관기한, 전용 용기, 자재 요청, 수거이력을 현장에서 확인하고 정리해 의료기관의 관리 부담을 줄입니다.
                </p>
                <ul className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {LEGAL_CHECKS.map((t) => (
                    <li key={t} className="flex items-start gap-3 rounded-xl bg-white px-4 py-4 shadow-card ring-1 ring-navy-100">
                      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-500" strokeWidth={2.3} />
                      <span className="text-base font-semibold leading-snug text-navy-800">{t}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </Section>
        </div>

        {/* ── 중간 CTA 밴드 (진한 배경) ─────────────────────────────────────── */}
        <div className="bg-navy-900">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-5 px-5 py-12 sm:px-6 lg:flex-row lg:px-8">
            <p className="text-center text-[20px] font-extrabold leading-snug text-white sm:text-2xl lg:text-left">
              우리 기관 수거 조건에 맞는 정기 수거가 필요하신가요?
            </p>
            <a
              href="#contact"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-7 py-4 text-[17px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600"
            >
              수거 상담하기 <ArrowRight size={19} strokeWidth={2.4} />
            </a>
          </div>
        </div>

        {/* ── 접이식 개발 현황 (운영관리 시스템 · 특허 · MVP 통합) ───────────── */}
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
          <Section id="tech" className="relative">
            <Reveal>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow light>개발 현황</Eyebrow>
                <Heading light>운영관리 시스템 개발 현황이 궁금하신가요?</Heading>
                <p className="mt-4 text-[16px] leading-relaxed text-navy-100 sm:text-[17px]">
                  비원미래는 실제 수거·운반 현장에서 발생하는 거래처 정보, 수거조건, 차량 운행, 자재 요청, 수거이력을
                  체계적으로 관리하기 위한 운영관리 시스템을 개발하고 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => setTechOpen((v) => !v)}
                  aria-expanded={techOpen}
                  className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3.5 text-[16px] font-bold text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  {techOpen ? '접기' : '자세히 보기'}
                  <ChevronDown size={18} strokeWidth={2.4} className={`transition-transform ${techOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </Reveal>

            <AnimatePresence initial={false}>
              {techOpen && (
                <motion.div
                  key="tech-panel"
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {TECH_DETAILS.map((d) => {
                      const Icon = d.icon
                      return (
                        <div key={d.title} className="rounded-xl bg-white/[0.05] p-6 ring-1 ring-white/10">
                          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-teal-300">
                            <Icon size={22} strokeWidth={2.2} />
                          </span>
                          <p className="mt-4 text-lg font-bold text-white">{d.title}</p>
                          <p className="mt-2 text-[15px] leading-relaxed text-navy-100">{d.desc}</p>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex flex-col items-start gap-4 rounded-xl bg-white/[0.05] p-6 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[15px] leading-relaxed text-navy-100">
                      기술개발 성과를 정리해 벤처기업확인 등 성장 기반을 준비하고 있습니다. 개선효과는 실제 운행데이터
                      축적 후 실증지표로 검증할 예정입니다.
                    </p>
                    <button
                      type="button"
                      onClick={goSystem}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-500 px-5 py-3 text-[15px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-600"
                    >
                      운영관리 시스템 화면 보기 <ArrowRight size={17} strokeWidth={2.4} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>
        </div>

        {/* ── (제거) 분리 운행 차별화 → 수거 관리 방식 체크리스트로 통합 ─────── */}
        {/* ── (제거) 기술개발 timeline → 접이식 개발 현황으로 통합 ───────────── */}
        {/* ── 상담 문의 ─────────────────────────────────────────────────────── */}
        <Section id="contact">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <Reveal>
              <Eyebrow>상담 문의</Eyebrow>
              <Heading>의료폐기물 수거·운반 상담을 남겨주세요</Heading>
              <p className="mt-4 text-[17px] leading-relaxed text-navy-600 sm:text-lg">
                기관 유형, 지역, 수거 주기, 자재공급 필요 여부를 알려주시면 상담에 필요한 내용을 확인할 수 있습니다.
              </p>
              <ImageSlot frame={IMG.inspection} hideCaption className="mt-6 aspect-[16/9] shadow-lg" />
              <ul className="mt-6 space-y-3">
                {[
                  '서울·경기권 병원·요양병원·의원 등 배출기관 대상',
                  '의료폐기물 · 의료기관 일회용기저귀 분리 운행',
                  '전용 용기·자재 공급부터 수거대장·이력 확인까지',
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
              <p className="mt-5 font-bold text-navy-900">관련 시스템</p>
              <a
                href={ALLBARO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-4 py-3 text-[15px] font-bold text-teal-700 transition hover:bg-teal-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                올바로 시스템 바로가기 <ExternalLink size={15} strokeWidth={2.4} />
              </a>
              <p className="mt-2 text-[13px] leading-snug text-navy-400">폐기물 적법처리 국가시스템(환경부·한국환경공단)</p>
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
