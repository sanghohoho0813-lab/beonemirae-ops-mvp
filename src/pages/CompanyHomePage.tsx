import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  X,
} from 'lucide-react'

const ALLBARO_URL = 'https://www.allbaro.or.kr/index.jsp'

const EASE = [0.22, 1, 0.36, 1] as const

const INQUIRY_TYPES = ['의료폐기물 수거·운반', '의료기관 폐기물 운영관리', '자재공급', '기타']

type HotspotAction = 'about' | 'services' | 'tech' | 'contact' | 'system' | 'allbaro'

type Hotspot = {
  label: string
  action: HotspotAction
  left: number
  top: number
  width: number
  height: number
  visible?: boolean
}

type VisualSection = {
  id: string
  title: string
  image: string
  alt: string
  bg: string
  priority?: boolean
  hotspots?: Hotspot[]
}

const sections: VisualSection[] = [
  {
    id: 'top',
    title: '의료폐기물 운송을 운영 기준까지 관리합니다',
    image: '/company-redesign/01-hero.png',
    alt: '비원미래 의료폐기물 운송 랜딩페이지 첫 화면',
    bg: 'bg-[#06111f]',
    priority: true,
    hotspots: [
      { label: '회사소개로 이동', action: 'about', left: 34, top: 3.5, width: 8, height: 5 },
      { label: '서비스로 이동', action: 'services', left: 43, top: 3.5, width: 8, height: 5 },
      { label: '운영현황으로 이동', action: 'tech', left: 51, top: 3.5, width: 10, height: 5 },
      { label: '문의로 이동', action: 'contact', left: 60, top: 3.5, width: 8, height: 5 },
      { label: '수거 상담 열기', action: 'contact', left: 89, top: 2.6, width: 8.5, height: 6 },
      { label: '수거 상담 요청', action: 'contact', left: 3.4, top: 73, width: 13, height: 7 },
      { label: '운영 범위 보기', action: 'services', left: 17, top: 73, width: 13, height: 7 },
    ],
  },
  {
    id: 'about',
    title: '수거만 맡기는 것이 아니라 운영 부담까지 줄입니다',
    image: '/company-redesign/02-operations.png',
    alt: '수거 일정, 전용 용기, 수거 현황, 준수 체크리스트를 보여주는 운영 기준 섹션',
    bg: 'bg-[#f8fbff]',
    hotspots: [
      { label: '관리 기준 확인하기', action: 'services', left: 4, top: 82, width: 16, height: 7 },
    ],
  },
  {
    id: 'services',
    title: '기관 유형과 폐기물 종류에 따라 수거 기준을 나눕니다',
    image: '/company-redesign/03-services.png',
    alt: '병원, 의원, 요양시설, 다수 거래처 관리 기준을 보여주는 대상별 서비스 섹션',
    bg: 'bg-[#f8fbff]',
    hotspots: [
      { label: '대상 기관 확인하기', action: 'contact', left: 40, top: 91, width: 20, height: 6 },
    ],
  },
  {
    id: 'coverage',
    title: '서울 경기권 수거망을 한눈에 관리합니다',
    image: '/company-redesign/04-coverage.png',
    alt: '서울 경기권 의료폐기물 수거망 지도와 권역 상담 버튼',
    bg: 'bg-[#06111f]',
    hotspots: [
      { label: '권역 상담하기', action: 'contact', left: 60.5, top: 79, width: 21, height: 8 },
    ],
  },
  {
    id: 'workflow',
    title: '보관기한부터 수거대장까지 현장에서 확인합니다',
    image: '/company-redesign/05-workflow.png',
    alt: '보관기한, 전용 용기, 수거대장, 자료 요청 대응을 설명하는 수거 관리 방식 섹션',
    bg: 'bg-[#f8fbff]',
    hotspots: [
      { label: '관리 항목 보기', action: 'tech', left: 64, top: 81, width: 18, height: 8 },
    ],
  },
  {
    id: 'tech',
    title: '운영관리 시스템을 현장 기준에 맞춰 고도화하고 있습니다',
    image: '/company-redesign/06-development.png',
    alt: '운영관리 시스템 개발 현황과 배차 보드, 수거 이력 화면',
    bg: 'bg-[#f8fbff]',
    hotspots: [
      { label: '운영관리 화면 보기', action: 'system', left: 54.5, top: 86, width: 20, height: 7 },
      { label: '개발 현황 문의', action: 'contact', left: 76.5, top: 86, width: 16, height: 7 },
    ],
  },
  {
    id: 'contact',
    title: '기관의 배출 조건을 알려주시면 수거 기준을 정리해드립니다',
    image: '/company-redesign/07-contact.png',
    alt: '의료폐기물 상담 문의 폼 화면',
    bg: 'bg-[#f8fbff]',
    hotspots: [
      { label: '상담 폼 열기', action: 'contact', left: 46, top: 6, width: 47, height: 86 },
      { label: '상담 문의 보내기', action: 'contact', left: 48, top: 82, width: 40, height: 7 },
    ],
  },
  {
    id: 'footer',
    title: '의료폐기물과 기저귀 수거 기준을 지금 정리하세요',
    image: '/company-redesign/08-footer.png',
    alt: '비원미래 푸터와 수거 상담 CTA',
    bg: 'bg-[#020b10]',
    hotspots: [
      { label: '수거 상담하기', action: 'contact', left: 77, top: 9, width: 18, height: 9 },
      { label: '회사 소개', action: 'about', left: 29, top: 54, width: 9, height: 5 },
      { label: '서비스', action: 'services', left: 44, top: 54, width: 13, height: 11 },
      { label: '운영관리 시스템', action: 'system', left: 61, top: 54, width: 12, height: 11 },
      { label: '올바로 시스템 바로가기', action: 'allbaro', left: 77, top: 54, width: 19, height: 8 },
    ],
  },
]

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
      <div className="rounded-lg bg-white p-6 text-center shadow-2xl ring-1 ring-slate-200 sm:p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" strokeWidth={2.2} />
        <p className="mt-4 text-xl font-extrabold text-slate-950">문의가 접수되었습니다</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          담당자 확인 후 회신드리겠습니다. 급한 수거 조건은 연락처를 기준으로 먼저 확인합니다.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700"
        >
          새 문의 작성
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:p-7" noValidate>
      <input
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        value={form.company}
        onChange={update('company')}
        aria-hidden
      />

      <p className="text-lg font-extrabold text-slate-950">상담 문의</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        이미지 시안 위 버튼과 연결된 실제 입력 폼입니다.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {INQUIRY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, inquiry: type }))}
            className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
              form.inquiry === type
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="기관명 *" value={form.org} onChange={update('org')} placeholder="예: 다산365의원" />
        <Field label="담당자명 *" value={form.manager} onChange={update('manager')} placeholder="담당자 성함" />
        <Field label="연락처 *" value={form.contact} onChange={update('contact')} placeholder="010-1234-5678" />
        <Field label="이메일 *" value={form.email} onChange={update('email')} placeholder="example@hospital.com" />
        <Field label="지역" value={form.region} onChange={update('region')} placeholder="예: 경기 남양주시" />
        <Field label="배출기관 유형" value={form.type} onChange={update('type')} placeholder="병원, 의원, 요양시설 등" />
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-bold text-slate-700">문의 내용</span>
        <textarea
          value={form.message}
          onChange={update('message')}
          rows={4}
          className="w-full resize-none rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-500"
          placeholder="수거 주기, 폐기물 종류, 전용 용기, 자재공급 필요 여부를 남겨주세요."
        />
      </label>

      <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
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
          <span className="font-bold text-slate-800">개인정보 수집 및 이용에 동의합니다. *</span>
          <br />
          상담 응대와 회신 목적으로만 사용하며, 상담 처리 후 파기됩니다.
        </span>
      </label>

      {status === 'invalid' && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{invalidMsg}</p>
      )}
      {status === 'error' && (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          일시적으로 문의 접수가 원활하지 않습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-4 text-base font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? '전송 중...' : <>상담 문의 보내기 <ArrowRight size={18} strokeWidth={2.4} /></>}
      </button>
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
      <span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={onChange}
        className="w-full rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-500"
        placeholder={placeholder}
      />
    </label>
  )
}

function VisualHotspot({
  hotspot,
  onAction,
}: {
  hotspot: Hotspot
  onAction: (action: HotspotAction) => void
}) {
  return (
    <button
      type="button"
      aria-label={hotspot.label}
      title={hotspot.label}
      onClick={() => onAction(hotspot.action)}
      className={`absolute z-10 rounded-lg transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-400/80 ${
        hotspot.visible ? 'bg-teal-500/90 text-white shadow-xl' : 'bg-transparent hover:bg-teal-400/10'
      }`}
      style={{
        left: `${hotspot.left}%`,
        top: `${hotspot.top}%`,
        width: `${hotspot.width}%`,
        height: `${hotspot.height}%`,
      }}
    >
      {hotspot.visible ? hotspot.label : <span className="sr-only">{hotspot.label}</span>}
    </button>
  )
}

function VisualSectionCard({
  section,
  onAction,
}: {
  section: VisualSection
  onAction: (action: HotspotAction) => void
}) {
  const reduced = useReducedMotion()

  return (
    <section id={section.id} className={`${section.bg} scroll-mt-20`}>
      <motion.div
        className="mx-auto w-full max-w-[1792px]"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <figure className="relative overflow-hidden bg-white">
          <img
            src={section.image}
            alt={section.alt}
            width={1792}
            height={1024}
            loading={section.priority ? 'eager' : 'lazy'}
            fetchPriority={section.priority ? 'high' : 'auto'}
            decoding={section.priority ? 'sync' : 'async'}
            className="block h-auto w-full select-none"
            draggable={false}
          />
          <figcaption className="sr-only">{section.title}</figcaption>
          {section.hotspots?.map((hotspot) => (
            <VisualHotspot key={`${section.id}-${hotspot.label}`} hotspot={hotspot} onAction={onAction} />
          ))}
        </figure>
      </motion.div>
    </section>
  )
}

function FloatingMobileActions({ onContact, onSystem }: { onContact: () => void; onSystem: () => void }) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-lg bg-white/92 p-2 shadow-2xl ring-1 ring-slate-200 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onContact}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-3 text-sm font-bold text-white"
      >
        <MessageCircle size={16} /> 상담
      </button>
      <button
        type="button"
        onClick={onSystem}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-3 text-sm font-bold text-white"
      >
        운영화면 <ArrowRight size={16} />
      </button>
    </div>
  )
}

export function CompanyHomePage() {
  const navigate = useNavigate()
  const [contactOpen, setContactOpen] = useState(false)

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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goSystem = () => navigate('/')

  const handleAction = (action: HotspotAction) => {
    if (action === 'contact') {
      setContactOpen(true)
      return
    }
    if (action === 'system') {
      goSystem()
      return
    }
    if (action === 'allbaro') {
      window.open(ALLBARO_URL, '_blank', 'noopener,noreferrer')
      return
    }
    scrollTo(action)
  }

  return (
    <div className="min-h-[100dvh] bg-[#06111f] font-sans text-slate-900">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-slate-950"
      >
        본문으로 이동
      </a>

      <main>
        {sections.map((section) => (
          <VisualSectionCard key={section.id} section={section} onAction={handleAction} />
        ))}
      </main>

      <FloatingMobileActions onContact={() => setContactOpen(true)} onSystem={goSystem} />

      <AnimatePresence>
        {contactOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="상담 문의"
              className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                aria-label="상담 폼 닫기"
                className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-lg transition hover:bg-slate-800"
              >
                <X size={20} />
              </button>
              <ConsultForm />
              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-white/85">
                <ExternalLink size={13} /> 실제 문의 전송 기능은 기존 `/api/contact`와 연결되어 있습니다.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
