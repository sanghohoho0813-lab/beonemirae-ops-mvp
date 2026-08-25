import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, PenLine, Share2, Lightbulb, TrendingUp, BarChart3, Hospital } from 'lucide-react'
import type { AppData } from '../types'
import { autoPerInput, evidenceStatus } from '../lib/performance'
import { salesFunnel } from '../lib/sales'
import { customerServiceStats } from '../lib/portal'
import { ACTOR_TONE, TONE, type Actor } from '../lib/tone'

// ─────────────────────────────────────────────────────────────────────────────
// AX 전환 스토리 — 첫 화면에서 5초 안에 "이 시스템이 무엇을 하는가"를 보여줍니다.
//
//   현장 1회 입력 → 업무 자동 연결 → 병원 데이터 축적
//     → 병원이 직접 확인·요청 → 데이터 기반 제안 → 추가 매출
//
//  · 각 칸에 "누가 하는 일인지"(현장/시스템/병원/비원미래)를 색 배지로 표시합니다.
//    흐름 한가운데에 보라색 '병원'이 들어가 있어, 이 시스템이 내부 운영툴이 아니라
//    병원도 함께 쓰는 서비스라는 사실이 설명 없이 읽힙니다.
//  · 각 단계에 실제 데이터가 있으면 숫자를, 없으면 '시작 전'을 그대로 씁니다.
//    (없는 데이터를 그럴듯한 숫자로 채우지 않습니다)
// ─────────────────────────────────────────────────────────────────────────────

const won = (v: number) => (v >= 10000 ? `${Math.round(v / 10000).toLocaleString('ko-KR')}만원` : `${v.toLocaleString('ko-KR')}원`)

export function AxStoryStrip({ data }: { data: AppData }) {
  const auto = autoPerInput(data)
  const f = salesFunnel(data)
  const ev = evidenceStatus(data)
  const cs = customerServiceStats(data)

  const steps: {
    icon: typeof PenLine
    actor: Actor
    label: string
    value: string
    sub: string
    on: boolean
  }[] = [
    {
      icon: PenLine,
      actor: '현장',
      label: '현장 1회 입력',
      value: auto.count > 0 ? `${auto.count}건` : '시작 전',
      sub: '수거 완료를 한 번만 입력',
      on: auto.count > 0,
    },
    {
      icon: Share2,
      actor: '시스템',
      label: '업무 자동 연결',
      value: auto.total > 0 ? `${auto.total}건` : '—',
      sub: '일정·이력·자재·통계·문서',
      on: auto.total > 0,
    },
    {
      icon: BarChart3,
      actor: '시스템',
      label: '병원 데이터 축적',
      value: `${data.clients.length}곳`,
      sub: '거래처별 수거·자재·메모',
      on: data.clients.length > 0,
    },
    {
      icon: Hospital,
      actor: '병원',
      label: '병원이 직접 확인·요청',
      value: cs.requestsTotal > 0 ? `${cs.requestsTotal}건` : '—',
      sub: '현황·리포트 확인 후 요청',
      on: cs.requestsTotal > 0,
    },
    {
      icon: Lightbulb,
      actor: '비원미래',
      label: '데이터 기반 제안',
      value: cs.proposalsShared > 0 ? `${cs.proposalsShared}건` : f.recommended > 0 ? `추천 ${f.recommended}건` : '—',
      sub: '추가 수거·소모품·교육 제안',
      on: cs.proposalsShared > 0 || f.recommended > 0,
    },
    {
      icon: TrendingUp,
      actor: '병원',
      label: '병원 수락 → 추가 매출',
      value: f.accepted > 0 && f.actualRevenue > 0 ? won(f.actualRevenue) : f.accepted > 0 ? `수락 ${f.accepted}건` : '—',
      sub: '수거료 외 거래처당 매출',
      on: f.accepted > 0,
    },
  ]

  return (
    <section className="card overflow-hidden">
      {/* 사업 전환 한 줄 — 무엇에서 무엇으로 가는 회사인지 */}
      <div data-tour="story" className="bg-navy-900 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="pill bg-white/10 text-navy-200">의료폐기물 수거·운반</span>
          <ArrowRight size={16} className="shrink-0 text-teal-300" strokeWidth={2.8} />
          <span className="pill bg-teal-500 text-white">병원 폐기물 운영지원 서비스</span>
        </div>
        <p className="t-body mt-2.5 break-keep text-navy-200">
          전화·수기·엑셀 반복 입력을 <span className="font-bold text-white">현장 1회 입력</span>으로 바꾸고, 쌓인
          데이터를 <span className="font-bold text-white">병원과 함께 보며</span> 다음에 필요한 수거·소모품·교육까지
          잇습니다
        </p>
      </div>

      {/* 6단계 — 좁은 화면에서는 세로로 길어지지 않도록 가로로 훑어보는 한 줄입니다.
          넓은 화면에서는 6칸이 한 줄로 들어와, 왼쪽에서 오른쪽으로 읽으면 흐름이 그대로 보입니다. */}
      <div
        data-tour="story-steps"
        className="flex gap-px overflow-x-auto bg-navy-100 lg:grid lg:grid-cols-3 lg:overflow-visible min-[1700px]:grid-cols-6"
      >
        {steps.map((s, i) => {
          const Icon = s.icon
          const at = TONE[ACTOR_TONE[s.actor]]
          return (
            <div
              key={s.label}
              className="kpi-box relative flex w-[11.5rem] shrink-0 flex-col bg-white px-4 py-3.5 sm:w-[13rem] lg:w-auto lg:px-4"
            >
              {/* 흐름 방향 화살표는 칸 오른쪽 끝에 겹쳐 둡니다.
                  줄 안에 두면 좁은 화면에서 배지를 밀어내 글자가 잘립니다. */}
              {i < steps.length - 1 && (
                <ArrowRight
                  size={16}
                  strokeWidth={2.6}
                  className="pointer-events-none absolute right-1.5 top-6 text-navy-200"
                />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    s.on ? at.tile : 'bg-navy-50 text-navy-400'
                  }`}
                >
                  <Icon size={19} strokeWidth={2.3} />
                </span>
                {/* 누가 하는 일인지 — 흐름 가운데의 '병원'이 눈에 띄게 */}
                <span
                  className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-[0.88rem] font-extrabold ${at.chip}`}
                >
                  {s.actor}
                </span>
              </div>
              <p className="t-label mt-2 min-w-0 break-keep text-navy-500">{s.label}</p>
              <p className={`t-stat mt-1 ${s.on ? 'text-navy-900' : 'text-navy-400'}`}>{s.value}</p>
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
