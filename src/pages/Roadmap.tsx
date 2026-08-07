import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Truck,
  Building2,
  CalendarClock,
  Route,
  PlusCircle,
  Boxes,
  FileText,
  Wallet,
  PieChart,
  Workflow,
  FlaskConical,
  Database,
  Layers,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageShell, SectionTitle } from '../components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// 활용 계획·업무흐름도 (/roadmap)
//  · 대표자·벤처인증 실사담당자가 "이 시스템을 어떻게 쓰고, 어디까지 갈 것인지"를
//    한눈에 보는 화면. 업무흐름도의 각 단계는 실제 MVP 화면으로 바로 이동합니다.
//  · 데이터 로직 변경 없음 — 안내·내비게이션 전용 페이지.
// ─────────────────────────────────────────────────────────────────────────────

type StepStatus = '운영 중' | '개발 중' | '고도화 예정'

const STATUS_STYLE: Record<StepStatus, string> = {
  '운영 중': 'bg-emerald-50 text-emerald-600',
  '개발 중': 'bg-teal-50 text-teal-600',
  '고도화 예정': 'bg-amber-50 text-amber-600',
}

interface FlowStep {
  n: number
  icon: LucideIcon
  title: string
  desc: string
  status: StepStatus
  to: string
}

const WORKFLOW: FlowStep[] = [
  { n: 1, icon: Building2, title: '거래처·수거조건 등록', desc: '병원별 주소·폐기물 종류·수거주기·요청사항을 등록합니다.', status: '운영 중', to: '/clients' },
  { n: 2, icon: CalendarClock, title: '오늘 일정·보관기한 확인', desc: '수거주기와 보관기한 기준으로 오늘 방문할 곳을 확인합니다.', status: '운영 중', to: '/today' },
  { n: 3, icon: Route, title: '배차·경로 추천', desc: '차량 적재율·긴급수거·처리장 인계시간을 반영해 추천합니다.', status: '개발 중', to: '/dispatch' },
  { n: 4, icon: PlusCircle, title: '현장 수거 입력', desc: '현장에서 수거량·용기 수를 바로 입력해 이력으로 남깁니다.', status: '운영 중', to: '/collection' },
  { n: 5, icon: Boxes, title: '자재공급 관리', desc: '전용 용기·봉투·박스 요청과 공급 이력을 함께 관리합니다.', status: '운영 중', to: '/materials' },
  { n: 6, icon: FileText, title: '수거대장·이력 정리', desc: '수거이력과 자재공급을 합쳐 월간 수거대장으로 출력(예정)합니다.', status: '고도화 예정', to: '/clients' },
  { n: 7, icon: Wallet, title: '청구·미수금 관리', desc: '거래처별 청구·입금 현황과 미수금을 한 흐름에서 확인합니다.', status: '운영 중', to: '/receivables' },
  { n: 8, icon: PieChart, title: '통계·데이터 축적', desc: '수거량·거래처·차량 실적이 쌓여 최적화의 재료가 됩니다.', status: '운영 중', to: '/stats' },
]

type PhaseState = '완료' | 'MVP 구현' | '준비 중' | '예정'
interface Phase {
  tag: string
  period: string
  title: string
  purpose: string
  points: string[]
  state: PhaseState
  current?: boolean
}
const phaseStateStyle: Record<PhaseState, string> = {
  완료: 'bg-emerald-500 text-white',
  'MVP 구현': 'bg-teal-500 text-white',
  '준비 중': 'bg-teal-500 text-white',
  예정: 'bg-amber-50 text-amber-600',
}

// 활용 계획 하단 시연 진입 버튼 노출 여부 (당분간 숨김 — true 로 바꾸면 다시 표시)
const SHOW_DEMO_CTA = false

const PHASES: Phase[] = [
  {
    tag: '1단계',
    period: '완료',
    title: '현재 MVP 안정화',
    purpose: '실제 거래처 조건과 현장 특수성을 반영해 핵심 구조를 검증했습니다.',
    points: ['실제 거래처 수거조건·분리 운행 반영', '자재·수거이력·긴급요청 구조 검증', '기존 거래처 일부 시범 적용'],
    state: '완료',
  },
  {
    tag: '2단계',
    period: 'MVP 구현',
    title: '반복입력 자동화',
    purpose:
      '현장 직원이 수거정보를 한 번 입력하면 오늘 일정·수거이력·자재·재고·통계·수거대장 초안까지 자동으로 연결됩니다. (수거대장·명세의 PDF 출력은 향후 고도화 예정)',
    points: ['수거 입력 1회 → 수거이력 자동 생성', '자재 동시공급 → 사무실 재고 자동 차감', '수거대장·월간 명세 초안 자동 생성'],
    state: 'MVP 구현',
    current: true,
  },
  {
    tag: '3단계',
    period: '중기',
    title: '서버 전환 및 권한 분리',
    purpose: '기기에만 남던 기록을 서버로 옮기고, 누가 무엇까지 볼 수 있는지를 역할별로 나눕니다.',
    points: ['PC·모바일 동일 데이터 연동', '관리자·사무실·현장·병원 열람 범위 분리', '감사로그·수정이력'],
    state: '완료',
  },
  {
    tag: '4단계',
    period: '중장기',
    title: '병원 고객 서비스',
    purpose: '병원이 직접 현황을 확인하고 요청하며, 데이터 기반 제안을 받아 수락합니다.',
    points: [
      '병원 포털 — 우리 병원 현황 · 월간 리포트 · 수거 이력',
      '병원이 직접 올리는 수거·소모품·자료 요청 (처리 상태·회신 공유)',
      '데이터 기반 제안 전달 → 병원이 직접 수락 → 추가 매출 기록',
    ],
    state: 'MVP 구현',
  },
  {
    tag: '5단계',
    period: '장기',
    title: '정기 운영관리 서비스 · SaaS 확장',
    purpose: '소모품 주문·배출자 교육까지 묶어 정기 운영관리 서비스로 확장합니다.',
    points: [
      '소모품 주문·결제 및 배출자 교육 이력 관리',
      '리포트 자동 발송(PDF·메일) · 올바로 API 연동',
      '운행데이터 기반 배차·경로 추천 고도화 · 업종 특화 SaaS',
    ],
    state: '예정',
  },
]

// 기대 효과 — 확정 수치가 아닌 "실증지표로 검증 예정" 항목
const EXPECTED = [
  { k: '운행거리·유류비', v: '경로 추천으로 절감 검증' },
  { k: '수거대장 작성시간', v: '자동 정리로 단축 검증' },
  { k: '자재 추가방문', v: '수거 동선 통합으로 감소 검증' },
  { k: '긴급수거 대응', v: '보관기한 알림으로 개선 검증' },
]

const BASIS = [
  { icon: FlaskConical, t: '특허출원 · 의료폐기물 수거·운반 경로 최적화 시스템 (10-2026-0101187)' },
  { icon: Database, t: '연구개발전담부서 운영 (2026.04 설립)' },
  { icon: Layers, t: 'MVP 시연 화면 보유 — 이 앱의 모든 화면' },
]

function StatusBadge({ status }: { status: StepStatus }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.95rem] font-bold ${STATUS_STYLE[status]}`}>{status}</span>
}

// ── 한눈에 보는 활용 구조 인포그래픽 ─────────────────────────────────────────
//  8단계를 4개 국면(준비→운행→정리→축적)으로 묶고, 축적된 데이터가 다시
//  "② 운행(배차·경로)"으로 돌아가는 환류 루프를 화살표로 그립니다.
const PHASES_VIS: {
  no: string
  title: string
  desc: string
  steps: string
  icons: LucideIcon[]
  chip: string
  ring: string
}[] = [
  { no: '①', title: '준비', desc: '거래처·수거조건 등록\n오늘 일정 확인', steps: 'STEP 1–2', icons: [Building2, CalendarClock], chip: 'bg-navy-100 text-navy-700', ring: 'ring-navy-100' },
  { no: '②', title: '운행', desc: '배차·경로 추천\n현장 수거 입력', steps: 'STEP 3–4', icons: [Truck, PlusCircle], chip: 'bg-teal-50 text-teal-600', ring: 'ring-teal-200' },
  { no: '③', title: '정리', desc: '자재공급·수거대장\n청구·미수금', steps: 'STEP 5–7', icons: [Boxes, FileText, Wallet], chip: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
  { no: '④', title: '축적', desc: '통계·운영 데이터\n축적', steps: 'STEP 8', icons: [PieChart, Database], chip: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
]

function FlowInfographic() {
  return (
    <div className="card p-4 sm:p-5">
      {/* 4개 국면 카드 + 사이 화살표 */}
      <div className="grid grid-cols-2 gap-2.5 xl:flex xl:items-stretch xl:gap-0">
        {PHASES_VIS.map((p, i) => (
          <Fragment key={p.title}>
            <div className={`flex min-w-0 flex-1 flex-col items-center rounded-2xl bg-white p-4 text-center ring-2 ${p.ring}`}>
              <div className="flex items-center gap-1.5">
                {p.icons.map((Icon, k) => (
                  <span key={k} className={`flex h-9 w-9 items-center justify-center rounded-xl ${p.chip}`}>
                    <Icon size={18} strokeWidth={2.2} />
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[1.07rem] font-extrabold text-navy-900">
                {p.no} {p.title}
              </p>
              <p className="mt-1 whitespace-pre-line text-[0.98rem] leading-snug text-navy-500">{p.desc}</p>
              <span className="mt-2 rounded-full bg-navy-50 px-2.5 py-0.5 text-[0.95rem] font-bold text-navy-500">{p.steps}</span>
            </div>
            {i < PHASES_VIS.length - 1 && (
              <div className="hidden items-center px-1 xl:flex">
                <ArrowRight size={18} className="shrink-0 text-navy-300" strokeWidth={2.6} />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* 환류 루프 화살표 (데스크톱) — ④ 축적 → ② 운행 */}
      <div className="relative mt-1 hidden h-16 xl:block" aria-hidden>
        <div className="absolute bottom-4 left-[37%] right-[13%] top-0 rounded-b-2xl border-b-2 border-l-2 border-r-2 border-dashed border-teal-400" />
        <span className="absolute left-[37%] top-[-4px] -translate-x-1/2 text-teal-500">
          <ArrowUp size={18} strokeWidth={2.8} />
        </span>
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full bg-teal-500 px-3.5 py-1.5 text-[0.98rem] font-bold text-white shadow-sm">
          <RefreshCw size={12} className="mr-1 inline -translate-y-px" strokeWidth={2.8} />
          운영 데이터 환류 — 쓸수록 배차·경로가 정교해집니다
        </span>
      </div>

      {/* 환류 안내 (모바일) */}
      <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-teal-50 px-3.5 py-2.5 xl:hidden">
        <RefreshCw size={15} className="shrink-0 text-teal-600" strokeWidth={2.6} />
        <p className="text-[0.98rem] font-bold leading-snug text-teal-700">④ 축적된 데이터가 ② 배차·경로를 다시 정교하게 만듭니다</p>
      </div>
    </div>
  )
}

export function Roadmap() {
  const navigate = useNavigate()
  const { data } = useData()
  const firstClient = data.clients[0]
  const stepTo = (s: FlowStep) => (s.n === 6 && firstClient ? `/clients/${firstClient.id}` : s.to)

  return (
    <PageShell>
      {/* 상단 바 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy-500 shadow-card transition active:scale-95"
          aria-label="뒤로"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-[1.08rem] font-bold text-navy-500">활용 계획 · 업무흐름도</span>
        <button
          onClick={() => navigate('/demo')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[1.08rem] font-bold text-navy-600 shadow-card transition hover:bg-navy-50"
        >
          <Sparkles size={15} /> 시연 요약
        </button>
      </div>

      {/* 히어로 — 한 문장 요약 */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-900 p-6 text-white shadow-lg">
        <div className="flex items-center gap-1.5 text-teal-300">
          <Workflow size={16} />
          <span className="text-[0.98rem] font-bold">이 시스템을 어떻게 활용하는가</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">
          현장 수거·운반을 데이터로 남기고,
          <br />
          그 데이터로 배차·경로를 최적화합니다
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[0.98rem] font-bold">
          <span className="rounded-full bg-white/10 px-3 py-1.5">① 현장 운영 기록</span>
          <ArrowRight size={13} className="text-teal-300" />
          <span className="rounded-full bg-white/10 px-3 py-1.5">② 운영 데이터 축적</span>
          <ArrowRight size={13} className="text-teal-300" />
          <span className="rounded-full bg-teal-500/90 px-3 py-1.5">③ 경로 최적화·수거대장 자동화</span>
        </div>
      </div>

      {/* 한눈에 보는 활용 구조 — 인포그래픽 */}
      <section>
        <SectionTitle>한눈에 보는 활용 구조</SectionTitle>
        <FlowInfographic />
      </section>

      {/* 업무흐름도 — 각 단계에서 실제 화면으로 이동 */}
      <section>
        <SectionTitle>상세 업무흐름 — 단계를 누르면 실제 화면으로 이동</SectionTitle>
        <div className="relative">
          {/* 세로 연결선 */}
          <div aria-hidden className="absolute bottom-5 left-[21px] top-5 w-0.5 bg-navy-100 lg:hidden" />
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {WORKFLOW.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.n}
                  onClick={() => navigate(stepTo(s))}
                  className="card pressable relative flex items-start gap-3.5 p-4 text-left"
                >
                  <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-900 text-teal-300">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.98rem] font-extrabold text-teal-600">STEP {s.n}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="mt-1 font-bold text-navy-900">{s.title}</p>
                    <p className="mt-0.5 text-[1.03rem] leading-snug text-navy-500">{s.desc}</p>
                  </div>
                  <ArrowRight size={16} className="mt-1 shrink-0 text-navy-300" />
                </button>
              )
            })}
          </div>
        </div>

      </section>

      {/* 단계별 활용 로드맵 */}
      <section>
        <SectionTitle>단계별 활용 로드맵</SectionTitle>
        <div className="relative">
          <div aria-hidden className="absolute bottom-6 left-[15px] top-6 w-0.5 bg-navy-100" />
          <div className="space-y-2.5">
            {PHASES.map((p) => (
              <div key={p.tag} className="relative flex gap-3.5">
                <span
                  className={`relative z-10 mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-extrabold ring-4 ring-[#f5f7fa] ${
                    p.current ? 'bg-teal-500 text-white' : 'bg-white text-navy-500 shadow-card'
                  }`}
                >
                  {p.tag.replace('단계', '')}
                </span>
                <div className={`card flex-1 p-4 sm:p-5 ${p.current ? 'ring-2 ring-teal-400' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-extrabold text-navy-900 sm:text-[1.15rem]">{p.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[0.95rem] font-bold ${phaseStateStyle[p.state]}`}>
                      {p.state}
                    </span>
                    <span className="rounded-full bg-navy-50 px-2.5 py-1 text-[0.95rem] font-bold text-navy-500">
                      {p.tag} · {p.period}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[1.03rem] font-semibold leading-snug text-navy-600 sm:text-[1.08rem]">{p.purpose}</p>
                  <ul className="mt-2.5 space-y-1.5">
                    {p.points.map((pt) => (
                      <li key={pt} className="flex gap-2 text-[1.03rem] leading-snug text-navy-700 sm:text-[1.08rem]">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-teal-500" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 기대 효과 — 검증 예정 지표 */}
      <section>
        <SectionTitle>기대 효과 (실증지표로 검증 예정)</SectionTitle>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EXPECTED.map((e) => (
            <div key={e.k} className="card flex items-center gap-3 p-4">
              <ArrowDown size={18} className="shrink-0 text-teal-500" strokeWidth={2.4} />
              <div>
                <p className="text-[1.07rem] font-bold text-navy-900">{e.k}</p>
                <p className="text-[0.98rem] text-navy-500">{e.v}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[0.98rem] leading-snug text-navy-400">
          ※ 위 항목은 확정 수치가 아니며, 실제 운행데이터 축적 후 실증지표로 검증할 예정입니다.
        </p>
      </section>

      {/* 기술 근거 */}
      <section>
        <SectionTitle>기술 근거</SectionTitle>
        <div className="card divide-y divide-navy-50 p-2">
          {BASIS.map(({ icon: Icon, t }) => (
            <div key={t} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Icon size={17} strokeWidth={2.2} />
              </span>
              <p className="text-[1.08rem] font-semibold leading-snug text-navy-700">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 하단 CTA — 시연 진입 버튼(대표님 3분 시연 / 심사관 시연 요약)은
          당분간 숨김 처리. 기능·라우트(/presentation, /demo)는 그대로이며,
          다시 노출하려면 아래 SHOW_DEMO_CTA 를 true 로 바꾸면 됩니다. */}
      {SHOW_DEMO_CTA && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-primary flex-1" onClick={() => navigate('/presentation')}>
            대표님 3분 시연 시작 <ArrowRight size={17} strokeWidth={2.4} />
          </button>
          <button className="btn-navy flex-1" onClick={() => navigate('/demo')}>
            심사관 시연 요약 보기
          </button>
        </div>
      )}

      <p className="pb-2 text-center text-[0.98rem] text-navy-300">활용 계획·업무흐름도 · ㈜비원미래 운영관리</p>
    </PageShell>
  )
}
