import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, PenLine, Share2, Lightbulb, TrendingUp, BarChart3 } from 'lucide-react'
import type { AppData } from '../types'
import { autoPerInput, evidenceStatus } from '../lib/performance'
import { salesFunnel } from '../lib/sales'

// ─────────────────────────────────────────────────────────────────────────────
// AX 전환 스토리 — 첫 화면에서 5초 안에 "이 시스템이 무엇을 하는가"를 보여줍니다.
//
//   현장 1회 입력 → 업무 자동 연결 → 병원 데이터 축적 → 다음 행동 추천 → 추가 매출
//
//  · 각 단계에 실제 데이터가 있으면 숫자를, 없으면 '시작 전'을 그대로 씁니다.
//    (없는 데이터를 그럴듯한 숫자로 채우지 않습니다)
//  · 데이터가 하나도 없어도 '무엇을 하는 시스템인지'는 항상 읽힙니다.
// ─────────────────────────────────────────────────────────────────────────────

const won = (v: number) => (v >= 10000 ? `${Math.round(v / 10000).toLocaleString('ko-KR')}만원` : `${v.toLocaleString('ko-KR')}원`)

export function AxStoryStrip({ data }: { data: AppData }) {
  const auto = autoPerInput(data)
  const f = salesFunnel(data)
  const ev = evidenceStatus(data)

  const steps = [
    {
      icon: PenLine,
      label: '현장 1회 입력',
      value: auto.count > 0 ? `${auto.count}건` : '시작 전',
      sub: '수거 완료를 한 번만 입력',
      on: auto.count > 0,
    },
    {
      icon: Share2,
      label: '업무 자동 연결',
      value: auto.total > 0 ? `${auto.total}건` : '—',
      sub: '일정·이력·자재·통계·문서',
      on: auto.total > 0,
    },
    {
      icon: BarChart3,
      label: '병원 데이터 축적',
      value: `${data.clients.length}곳`,
      sub: '거래처별 수거·자재·메모',
      on: data.clients.length > 0,
    },
    {
      icon: Lightbulb,
      label: '다음 행동 추천',
      value: f.recommended > 0 ? `${f.recommended}건` : '—',
      sub: '추가 수거·소모품·교육',
      on: f.recommended > 0,
    },
    {
      icon: TrendingUp,
      label: '추가 매출',
      value: f.accepted > 0 && f.actualRevenue > 0 ? won(f.actualRevenue) : f.proposed > 0 ? `제안 ${f.proposed}건` : '—',
      sub: '제안 → 수락 → 실제 매출',
      on: f.proposed > 0,
    },
  ]

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-navy-900 px-5 py-4 sm:px-6">
        <p className="t-card min-w-0 flex-1 break-keep text-white">
          전화·수기·엑셀 반복 입력을 <span className="text-teal-300">현장 1회 입력</span>으로 바꾸고, 쌓인 병원
          데이터로 <span className="text-teal-300">다음 행동을 추천</span>해 추가 매출까지 잇습니다
        </p>
      </div>

      <div className="grid gap-px bg-navy-100 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="relative flex flex-col bg-white px-5 py-4">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    s.on ? 'bg-teal-50 text-teal-600' : 'bg-navy-50 text-navy-300'
                  }`}
                >
                  <Icon size={19} strokeWidth={2.3} />
                </span>
                <p className="t-label min-w-0 break-keep text-navy-500">{s.label}</p>
                {i < steps.length - 1 && (
                  <ArrowRight size={18} className="ml-auto hidden shrink-0 text-navy-200 xl:block" strokeWidth={2.6} />
                )}
              </div>
              <p className={`t-kpi-sm mt-2.5 break-keep ${s.on ? 'text-navy-900' : 'text-navy-300'}`}>{s.value}</p>
              <p className="t-muted mt-auto break-keep pt-1.5">{s.sub}</p>
            </div>
          )
        })}
      </div>

      <Link
        to="/performance"
        className="flex w-full items-center justify-center gap-1.5 border-t border-navy-100 py-3.5 text-[1.05rem] font-bold text-navy-600 transition hover:bg-navy-50"
      >
        {ev.tier === 'none'
          ? '도입 성과는 현장 데이터가 쌓이면 자동으로 측정됩니다'
          : `AX 도입 성과 보기 · ${ev.label}`}
        <ChevronRight size={18} />
      </Link>
    </section>
  )
}
