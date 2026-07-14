import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X,
  ChevronRight,
  ChevronLeft,
  CalendarClock,
  Truck,
  Building2,
  FileText,
  FileBadge,
  Workflow,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { todaySummary } from '../lib/selectors'
import { dispatchPlans } from '../lib/ops'
import { weight } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 대표님 시연 — 3분 가이드 흐름 (요약 슬라이드 → 실제 화면 진입)
// ─────────────────────────────────────────────────────────────────────────────

export function Presentation() {
  const navigate = useNavigate()
  const { data } = useData()
  const [i, setI] = useState(0)

  const summary = todaySummary(data)
  const topPlan = dispatchPlans(data).find((p) => p.stops.length > 0)
  const firstClient = data.clients[0]

  const steps = [
    {
      icon: CalendarClock,
      title: '오늘 운영 현황',
      line: '오늘 수거 일정과 확인할 일을 한 화면에서 봅니다.',
      stats: [
        { k: '오늘 수거 예정', v: `${summary.total}건` },
        { k: '긴급·지연', v: `${summary.긴급 + summary.지연}건` },
      ],
      cta: '오늘 일정 보기',
      to: '/today',
    },
    {
      icon: Truck,
      title: '배차·경로 추천',
      line: '차량 적재율·긴급수거·처리장 인계를 함께 고려한 추천(개발 중).',
      stats: [
        { k: '추천 차량', v: `${dispatchPlans(data).filter((p) => p.stops.length > 0).length}대` },
        { k: '예상 적재율', v: topPlan ? `${topPlan.loadRate}%` : '-' },
      ],
      cta: '배차·경로 보기',
      to: '/dispatch',
    },
    {
      icon: Building2,
      title: '거래처 상세관리',
      line: '주요거래처 5곳 기반 · 서울·경기권 시연용으로 15/25/35곳 확장.',
      stats: [
        { k: '관리 거래처', v: `${data.clients.length}곳` },
        { k: '차량', v: `${data.vehicles.length}대` },
      ],
      cta: firstClient ? `${firstClient.name} 보기` : '거래처 보기',
      to: firstClient ? `/clients/${firstClient.id}` : '/clients',
    },
    {
      icon: FileText,
      title: '수거대장 미리보기',
      line: '수거이력과 자재공급을 통합해 월간 수거대장으로 출력(예정).',
      stats: [{ k: '출력', v: 'PDF 예정' }],
      cta: '거래처에서 수거대장 보기',
      to: firstClient ? `/clients/${firstClient.id}` : '/clients',
    },
    {
      icon: FileBadge,
      title: '특허·사업계획서 정합성',
      line: '특허 구성요소·사업계획 방향과 앱 기능을 연결해 보여줍니다.',
      stats: [{ k: '특허출원', v: '10-2026-0101187' }],
      cta: '심사관 시연 요약 보기',
      to: '/demo',
    },
    {
      icon: Workflow,
      title: '향후 활용 계획',
      line: '일일 업무흐름도와 단계별 고도화 로드맵을 한 화면에서 봅니다.',
      stats: [
        { k: '현재', v: '1단계 · MVP 운영' },
        { k: '다음', v: '실데이터 · 경로 최적화' },
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
          <p className="text-[0.8125rem] font-bold text-teal-600">대표님 시연 · 3분</p>
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
            <span className="text-sm font-bold">STEP {i + 1} / {steps.length}</span>
          </div>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{step.title}</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-navy-500">{step.line}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {step.stats.map((s) => (
              <div key={s.k} className="rounded-2xl bg-navy-50 p-3.5">
                <p className="text-xs font-semibold text-navy-400">{s.k}</p>
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
        <p className="flex items-center gap-2 text-[0.9375rem] font-extrabold">
          <Workflow size={17} className="text-teal-300" /> 한 번 입력, 여러 화면 자동 연결
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-navy-100">
          현장 담당자가 수거정보를 한 번 입력하면 오늘 일정, 수거이력, 자재와 통계에 연결됩니다. 여러 엑셀·수기대장에
          반복 입력할 필요가 없습니다.
        </p>
      </div>

      {/* 업무가 어떻게 달라지는가 (Before / After) */}
      <div className="mt-6">
        <p className="mb-2 px-1 text-[0.9375rem] font-extrabold text-navy-800">업무가 어떻게 달라지는가</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <span className="rounded-full bg-navy-100 px-2.5 py-1 text-[0.6875rem] font-bold text-navy-500">Before</span>
            <ul className="mt-2.5 space-y-1.5 text-[0.8125rem] leading-snug text-navy-600">
              {['여러 개의 엑셀', '전화·카톡 요청', '수기대장', '담당자별 중복 입력', '자재·수거·정산 분산', '인증 직전 긴급 대응'].map((t) => (
                <li key={t} className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="card p-4 ring-1 ring-teal-200">
            <span className="rounded-full bg-teal-500 px-2.5 py-1 text-[0.6875rem] font-bold text-white">After</span>
            <ul className="mt-2.5 space-y-1.5 text-[0.8125rem] leading-snug text-navy-700">
              {['하나의 운영 시스템', 'PC·모바일 동일 데이터', '수거·자재·이력 통합', '요청사항 기록', '월간 자료 자동화(예정)', '배차·경로 추천'].map((t) => (
                <li key={t} className="flex gap-1.5"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-teal-500" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-2 px-1 text-[0.75rem] text-navy-400">※ 월간 자료 자동화·실시간 공유는 향후 고도화 예정입니다.</p>
      </div>

      <p className="mt-4 text-center text-xs text-navy-300">{weight(105000)} 규모 · ㈜비원미래 운영관리 시연</p>
    </div>
  )
}
