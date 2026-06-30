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
  ArrowRight,
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
      line: '거래처별 수거조건·이력·자재·미수금을 한눈에 봅니다.',
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
  ]

  const step = steps[i]
  const Icon = step.icon
  const last = i === steps.length - 1

  return (
    <div className="mx-auto max-w-lg">
      {/* 상단 */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold text-teal-600">대표님 시연 · 3분</p>
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
          <p className="mt-2 text-[15px] leading-relaxed text-navy-500">{step.line}</p>

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

      <p className="mt-3 text-center text-xs text-navy-300">{weight(105000)} 규모 · ㈜비원미래 운영관리 시연</p>
    </div>
  )
}
