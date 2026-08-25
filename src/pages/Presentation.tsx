import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X,
  ChevronRight,
  ChevronLeft,
  CalendarClock,
  PenLine,
  Hospital,
  Inbox,
  TrendingUp,
  Workflow,
  ArrowRight,
  CheckCircle2,
  BookOpen,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { todaySummary } from '../lib/selectors'
import { autoPerInput } from '../lib/performance'
import { customerServiceStats } from '../lib/portal'
import { weight } from '../lib/format'
import { DemoResetButton } from '../components/DemoControls'

// 심사 시연 동선 (약 5분) — "무엇을 하는 회사인가 → 어떻게 돈을 버는가" 순서
const DEMO_STEPS = [
  { t: '대시보드 상단', l: '수거 회사에서 병원 폐기물 운영지원 서비스로 넘어가는 여섯 단계를 한 줄로 보여줍니다.' },
  { t: '수거 완료 입력 1회', l: '현장에서 한 번 입력하면 일정·이력·자재·재고·통계·대장이 함께 갱신됩니다.' },
  { t: '병원 포털', l: '병원이 직접 수거 현황을 보고 긴급수거·소모품·자료를 요청합니다.' },
  { t: '병원 요청 처리', l: '요청 상태를 바꾸고 회신을 남기면 병원 화면에 그대로 보입니다.' },
  { t: '다음 행동 추천', l: '쌓인 기록에서 거래처별 다음 제안을 뽑고, 근거와 함께 병원에 전달합니다.' },
  { t: '병원 수락 → 추가 매출', l: '수락은 병원이 직접 누르고, 그 시점이 수거료 외 매출로 기록됩니다.' },
  { t: '매출 구조·도입 성과', l: '수거료 외 매출 다섯 가지를 구현됨·실증 중·개발 예정으로 나눠 보여줍니다.' },
  { t: '향후 계획·특허 매핑', l: '단계별 로드맵과 특허 구성요소가 현재 화면에 어떻게 연결되는지 확인합니다.' },
  { t: '시연 종료', l: '시연 상태를 초기화하면 동일한 기준 상태로 되돌아갑니다.' },
]
const SAY_DO = [
  '현재 MVP 단계',
  '규칙 기반 추천 (학습형 아님)',
  '기존 거래처 시범 적용 예정',
  '실제 운행데이터 기반 고도화 예정',
  '병원 포털은 실증 단계',
  '실증지표로 효과 검증 예정',
]
const SAY_DONT = [
  '완성형 AI',
  '자동 최적 경로 완성',
  '올바로 자동 연동 완료',
  '실시간 다중 사용자 연동 완료',
  '확정 절감률',
  '이미 병원에서 정식 사용 중',
]
const PRE_CHECK = [
  '인터넷 연결 확인',
  '브라우저 새로고침',
  '시연 상태 초기화',
  '대시보드 여섯 단계 숫자 확인',
  '수거 완료 입력 대상 확인',
  '병원 포털 요청 1건 이상',
  '처리 대기 요청 확인',
  '전달할 제안 1건 이상',
  '매출 구조·도입 성과 확인',
]

// ─────────────────────────────────────────────────────────────────────────────
// 심사 시연 — 5분 가이드 흐름 (요약 슬라이드 → 실제 화면 진입)
// ─────────────────────────────────────────────────────────────────────────────

export function Presentation() {
  const navigate = useNavigate()
  const { data } = useData()
  const [i, setI] = useState(0)

  const summary = todaySummary(data)
  const auto = autoPerInput(data)
  const cs = customerServiceStats(data)

  // 심사 5분 동선 — 내부 효율(1~2) → 병원 서비스(3~4) → 추가 매출(5) → 근거(6)
  const steps = [
    {
      icon: CalendarClock,
      title: '오늘 운영 현황',
      line: '오늘 수거 일정과 확인할 일을 한 화면에서 봅니다. 여기가 매일 여는 화면입니다.',
      stats: [
        { k: '오늘 수거 예정', v: `${summary.total}건` },
        { k: '긴급·지연', v: `${summary.긴급 + summary.지연}건` },
      ],
      cta: '오늘 일정 보기',
      to: '/today',
    },
    {
      icon: PenLine,
      title: '현장 1회 입력 → 자동 연결',
      line: '현장에서 수거 완료를 한 번만 입력하면 일정·이력·자재·재고·통계·대장이 함께 갱신됩니다.',
      stats: [
        { k: '입력 1회당 자동 처리', v: auto.avg != null ? `${auto.avg}건` : '—' },
        { k: '누적 자동 처리', v: `${auto.total}건` },
      ],
      cta: '수거 완료 입력 열기',
      to: '/collection',
    },
    {
      icon: Hospital,
      title: '병원이 직접 확인하고 요청합니다',
      line: '병원은 전화 대신 포털에서 수거 현황을 보고 긴급수거·소모품·자료를 요청합니다.',
      stats: [
        { k: '병원 요청', v: `${cs.requestsTotal}건` },
        { k: '처리 대기', v: `${cs.requestsOpen}건` },
      ],
      cta: '병원 화면 그대로 보기',
      to: '/portal',
    },
    {
      icon: Inbox,
      title: '요청 처리 → 병원에 회신',
      line: '접수 → 확인 중 → 일정 반영 → 처리 완료. 바꾼 상태와 회신이 병원 화면에 그대로 보입니다.',
      stats: [
        { k: '처리 완료', v: `${cs.requestsDone}건` },
        { k: '수거 완료 시', v: '요청 자동 종료' },
      ],
      cta: '병원 요청 처리 화면',
      to: '/requests',
    },
    {
      icon: TrendingUp,
      title: '데이터 기반 제안 → 병원 수락 → 추가 매출',
      line: '쌓인 기록에서 다음 제안을 뽑아 병원에 전달하고, 수락은 병원이 직접 누릅니다.',
      stats: [
        { k: '전달한 제안', v: `${cs.proposalsShared}건` },
        { k: '병원 수락', v: `${cs.proposalsAccepted}건` },
      ],
      cta: '거래처당 매출 구조 보기',
      to: '/performance',
    },
    {
      icon: Workflow,
      title: '근거 · 향후 계획',
      line: '성과는 실제 입력에서만 계산하고, 아직 만들지 않은 것은 개발 예정으로 표시합니다.',
      stats: [
        { k: '특허출원', v: '10-2026-0101187' },
        { k: '다음 단계', v: '소모품 주문 · 배출자 교육' },
      ],
      cta: '활용 계획·업무흐름도 보기',
      to: '/roadmap',
    },
  ]

  const step = steps[i]
  const Icon = step.icon
  const last = i === steps.length - 1

  return (
    <div className="mx-auto max-w-lg">
      {/* 상단 */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[1.03rem] font-bold text-teal-600">심사 시연 · 5분</p>
          <h1 className="text-xl font-extrabold text-navy-900">단계별로 보기</h1>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-navy-400 shadow-card transition active:scale-95"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      {/* 진행 도트 */}
      <div className="mb-5 flex gap-1.5">
        {steps.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 flex-1 rounded-full transition-colors ${idx <= i ? 'bg-teal-500' : 'bg-navy-100'}`}
          />
        ))}
      </div>

      {/* 슬라이드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="card p-6"
        >
          <div className="flex items-center gap-2 text-teal-600">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50">
              <Icon size={18} strokeWidth={2.3} />
            </span>
            <span className="text-[1.08rem] font-bold">STEP {i + 1} / {steps.length}</span>
          </div>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{step.title}</h2>
          <p className="mt-2 text-[1.07rem] leading-relaxed text-navy-500">{step.line}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {step.stats.map((s) => (
              <div key={s.k} className="rounded-2xl bg-navy-50 p-3.5">
                <p className="text-[0.98rem] font-semibold text-navy-400">{s.k}</p>
                <p className="mt-1 text-lg font-extrabold text-navy-900">{s.v}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate(step.to)}
            className="btn-primary mt-4 w-full"
          >
            {step.cta} <ArrowRight size={17} strokeWidth={2.4} />
          </button>
        </motion.div>
      </AnimatePresence>

      {/* 이전/다음 */}
      <div className="mt-5 flex gap-2">
        <button
          className="btn-ghost flex-1 disabled:opacity-40"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
        >
          <ChevronLeft size={17} /> 이전
        </button>
        {last ? (
          <button className="btn-navy flex-1" onClick={() => navigate('/demo')}>
            상세 시연 자료 →
          </button>
        ) : (
          <button className="btn-navy flex-1" onClick={() => setI((v) => Math.min(steps.length - 1, v + 1))}>
            다음 <ChevronRight size={17} />
          </button>
        )}
      </div>

      {/* 한 번 입력 → 자동 연결 (3단계 핵심) */}
      <div className="mt-6 rounded-2xl bg-navy-900 p-4 text-white">
        <p className="flex items-center gap-2 text-[1.07rem] font-extrabold">
          <Workflow size={17} className="text-teal-300" /> 한 번 입력, 여러 화면 자동 연결
        </p>
        <p className="mt-1.5 text-[1.03rem] leading-relaxed text-navy-100">
          현장 담당자가 수거정보를 한 번 입력하면 오늘 일정, 수거이력, 자재, 통계, 그리고 병원이 보는 화면까지 함께
          갱신됩니다. 여러 엑셀·수기대장에 반복 입력할 필요가 없습니다.
        </p>
      </div>

      {/* 업무가 어떻게 달라지는가 (Before / After) */}
      <div className="mt-6">
        <p className="mb-2 px-1 text-[1.07rem] font-extrabold text-navy-800">업무가 어떻게 달라지는가</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[0.95rem] font-bold text-navy-500">Before</span>
            <ul className="mt-2.5 space-y-1.5 text-[1.03rem] leading-snug text-navy-600">
              {['여러 개의 엑셀', '전화·카톡 요청', '수기대장', '담당자별 중복 입력', '자재·수거·정산 분산', '인증 직전 긴급 대응'].map((t) => (
                <li key={t} className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="card p-4 ring-1 ring-teal-200">
            <span className="rounded-full bg-teal-500 px-2.5 py-1 text-[0.95rem] font-bold text-white">After</span>
            <ul className="mt-2.5 space-y-1.5 text-[1.03rem] leading-snug text-navy-700">
              {['하나의 운영 시스템', 'PC·모바일 동일 데이터', '수거·자재·이력 통합', '병원이 직접 확인·요청', '요청 처리·회신 기록', '데이터 기반 제안 → 추가 매출'].map((t) => (
                <li key={t} className="flex gap-1.5"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-teal-500" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-2 px-1 text-[0.98rem] text-navy-400">※ 소모품 주문·배출자 교육·리포트 자동 발송은 개발 예정입니다.</p>
      </div>

      {/* 대표자 시연 가이드 (기본 접힘) */}
      <details className="card mt-6 p-0">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-[1.07rem] font-extrabold text-navy-800">
          <BookOpen size={16} className="text-teal-500" /> 대표자 시연 가이드
          <span className="ml-auto text-[0.98rem] font-semibold text-navy-400">펼치기</span>
        </summary>
        <div className="space-y-4 border-t border-navy-50 p-4">
          {/* 5분 시연 순서 */}
          <div>
            <p className="mb-2 text-[1.03rem] font-bold text-navy-600">추천 시연 순서 (약 5분)</p>
            <ol className="space-y-1.5">
              {DEMO_STEPS.map((s, i) => (
                <li key={s.t} className="flex gap-2 text-[1.03rem] leading-snug text-navy-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-navy-100 text-[0.9rem] font-extrabold text-navy-500">
                    {i + 1}
                  </span>
                  <span>
                    <b className="text-navy-900">{s.t}</b> — {s.l}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* 표현 가이드 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-teal-50 p-3">
              <p className="text-[0.98rem] font-bold text-teal-700">권장 표현</p>
              <ul className="mt-1.5 space-y-1 text-[0.98rem] leading-snug text-navy-600">
                {SAY_DO.map((t) => (
                  <li key={t} className="flex gap-1.5"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-teal-500" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3">
              <p className="text-[0.98rem] font-bold text-rose-600">피해야 할 표현</p>
              <ul className="mt-1.5 space-y-1 text-[0.98rem] leading-snug text-navy-600">
                {SAY_DONT.map((t) => (
                  <li key={t} className="flex gap-1.5"><span className="mt-0.5 shrink-0 font-bold text-rose-400">✕</span>{t}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 시연 전 확인 */}
          <div>
            <p className="mb-2 text-[1.03rem] font-bold text-navy-600">시연 전 확인</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {PRE_CHECK.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[1.03rem] text-navy-600">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-teal-500" /> {t}
                </label>
              ))}
            </div>
          </div>

          {/* 초기화 */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-navy-50 p-3">
            <p className="text-[0.98rem] leading-snug text-navy-500">시연이 끝나면 기준 상태로 되돌립니다.</p>
            <DemoResetButton />
          </div>
        </div>
      </details>

      <p className="mt-4 text-center text-[0.98rem] text-navy-400">{weight(105000)} 규모 · ㈜비원미래 운영관리 시연</p>
    </div>
  )
}
