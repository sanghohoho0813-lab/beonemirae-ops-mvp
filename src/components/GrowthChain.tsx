import { useMemo } from 'react'
import { TrendingUp, Hourglass, Workflow, Ruler, Truck, Flag, type LucideIcon } from 'lucide-react'
import type { AppData } from '../types'
import { COMPANY_FACTS, FACT_STATUS_LABEL, type FactStatus } from '../lib/companyFacts'
import { axEvidence } from '../lib/axEvidence'
import { breadthLine } from '../lib/evidenceBase'
import type { PerformanceSummary } from '../lib/performance'

// ─────────────────────────────────────────────────────────────────────────────
// 성장 → 병목 → AX 로 바뀐 업무 → 측정 결과 → 투자 필요 → 다음 목표 (0106)
//
//  심사 자리에서 이 여섯 칸이 한 줄로 이어져야 「왜 지금 이 회사에 자금이
//  필요한가」가 읽힙니다. 다만 칸마다 무게가 다릅니다 —
//   · 성장은 사업계획서 기재값과 대표 전달값 (원본 미확인)
//   · 병목은 아직 전언 (실측은 마감 기록이 쌓이면)
//   · AX 로 바뀐 업무는 시스템이 세는 사실
//   · 측정 결과는 표본 폭이 넘어야 대표값
//   · 투자·목표는 계획 (확정 아님)
//  그래서 줄마다 상태 배지를 붙입니다. 배지를 떼면 전부 같은 무게로 읽힙니다.
//
//  ⚠ 매출 성장 전체를 AX 효과라고 적지 않습니다. 성장은 회사가 한 일이고,
//    AX 가 바꾼 것은 4번 칸의 측정값이 말하는 만큼입니다.
// ─────────────────────────────────────────────────────────────────────────────

type LineStatus = FactStatus | 'measured' | 'measuring' | 'system'

const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  ...FACT_STATUS_LABEL,
  measured: '시스템 측정값',
  measuring: '측정 중',
  system: '시스템 집계',
}

const LINE_STATUS_STYLE: Record<LineStatus, string> = {
  plan_doc: 'bg-navy-100 text-navy-600',
  user_reported: 'bg-amber-50 text-amber-700',
  forecast: 'bg-amber-50 text-amber-700',
  ops_doc: 'bg-teal-50 text-teal-700',
  planned: 'bg-navy-100 text-navy-500',
  unverified: 'bg-amber-50 text-amber-700',
  not_entered: 'bg-navy-100 text-navy-400',
  measured: 'bg-teal-50 text-teal-700',
  measuring: 'bg-navy-100 text-navy-500',
  system: 'bg-sky-50 text-sky-700',
}

interface Line {
  text: string
  status: LineStatus
}

interface Step {
  n: number
  icon: LucideIcon
  title: string
  lines: Line[]
}

const fact = (key: string) => COMPANY_FACTS.find((f) => f.key === key)
const factLine = (key: string, prefix = ''): Line | null => {
  const f = fact(key)
  if (!f) return null
  return { text: `${prefix}${f.label} ${f.value}`, status: f.status }
}

export function GrowthChain({
  data,
  summary,
  compact = false,
}: {
  data: AppData
  summary: PerformanceSummary
  compact?: boolean
}) {
  const ev = useMemo(
    () => axEvidence(data, { from: summary.period.from, to: summary.period.to }),
    [data, summary.period.from, summary.period.to],
  )
  const num = (list: { key: string; value: number | null; unit: string; state: string }[], key: string) =>
    list.find((n) => n.key === key)

  const realClients = (data.clients ?? []).filter((c) => !c.isDemoGenerated).length
  const wait = num(ev.capacity.numbers, 'facilityWaitMin')
  const km = num(ev.capacity.numbers, 'kmPerDay')
  const cost = num(ev.capacity.numbers, 'costPerVisit')
  const sameDay = num(ev.work.numbers, 'sameDayRate')
  const portal = num(ev.customer.numbers, 'portalClients')
  const inputTime = summary.metrics.find((m) => m.key === 'inputTime')
  const okMetrics = summary.metrics.filter((m) => m.status === 'ok')

  const steps: Step[] = [
    {
      n: 1,
      icon: TrendingUp,
      title: '현재 사업 성장',
      lines: [
        { text: `매출 ${fact('rev2023')?.value} (2023) → ${fact('rev2024')?.value} (2024) → ${fact('rev2025')?.value} (2025)`, status: 'plan_doc' },
        factLine('rev2026h1'),
        factLine('rev2026f'),
        { text: `거래처 ${fact('clients')?.value} (대표 전달) · 시스템 등록 ${realClients}곳 — 두 수는 따로 둡니다`, status: 'user_reported' },
      ].filter((l): l is Line => !!l),
    },
    {
      n: 2,
      icon: Hourglass,
      title: '운영상의 병목',
      lines: [
        factLine('facilityWait'),
        wait && wait.value != null
          ? { text: `실측: 처리시설 대기 중앙값 ${wait.value}분 (마감 기록 ${wait.state === 'ok' ? '충분' : '적음'})`, status: 'measured' }
          : { text: '실측: 마감 기록에 대기시간이 쌓이면 여기 적힙니다 (아직 없음)', status: 'measuring' },
        factLine('capacityNeed'),
      ].filter((l): l is Line => !!l),
    },
    {
      n: 3,
      icon: Workflow,
      title: 'AX 로 바뀐 업무',
      lines: [
        {
          text: `현장 1회 입력 ${summary.collectionCount}건 → 일정·이력·자재·재고·통계·문서에 자동 반영 ${summary.autoLink.total}건`,
          status: 'system',
        },
        {
          text: portal && portal.value != null ? `병원이 포털에서 직접 요청·주문한 곳 ${portal.value}곳` : '병원 포털 직접 사용 — 아직 기록 없음',
          status: portal && portal.value ? 'system' : 'measuring',
        },
        { text: '기사 오늘 업무 마감으로 카톡 보고를 대체 (마감 기록이 근거)', status: 'system' },
      ],
    },
    {
      n: 4,
      icon: Ruler,
      title: '측정 결과',
      lines: [
        { text: breadthLine(summary.fieldCount, summary.breadth), status: summary.breadthOk ? 'measured' : 'measuring' },
        inputTime && inputTime.after != null
          ? { text: `수거 1건 입력 소요시간 ${inputTime.after}분 (측정값만 · 도입 전 사무시간과 범위가 달라 개선율 없음)`, status: 'measured' }
          : { text: '수거 1건 입력 소요시간 — 측정 중', status: 'measuring' },
        sameDay && sameDay.value != null
          ? { text: `당일 입력 완료율 ${sameDay.value}%`, status: 'measured' }
          : { text: '당일 입력 완료율 — 기록 없음', status: 'measuring' },
        okMetrics.length > 0
          ? { text: `같은 범위로 견준 개선율 ${okMetrics.length}개${summary.confounding.overlapping.length ? ' · 복합 개선 (AX 단독 효과 분리 불가)' : ''}`, status: 'measured' }
          : { text: '같은 범위로 견준 개선율 — 아직 없음 (도입 후 같은 범위 조사값이 들어오면 산출)', status: 'measuring' },
        km && km.value != null ? { text: `운행거리(계기판) 마감 1건당 ${km.value}km`, status: 'measured' } : null,
        cost && cost.value != null ? { text: `방문 1건당 운영비 ${cost.value.toLocaleString('ko-KR')}원`, status: 'measured' } : null,
      ].filter((l): l is Line => !!l),
    },
    {
      n: 5,
      icon: Truck,
      title: '차량 · 거점 · 인력 투자 필요',
      lines: [
        factLine('vehicles'),
        factLine('vehiclePlan'),
        factLine('relocation'),
        { text: '적용되면 「운영 변화 기록」에 적용일을 적어야 성과와 분리해 셉니다', status: 'system' },
      ].filter((l): l is Line => !!l),
    },
    {
      n: 6,
      icon: Flag,
      title: '다음 성장 목표',
      lines: [
        factLine('funding'),
        {
          text: summary.breadthOk
            ? '실증: 내부 표시 기준을 넘었습니다 — 다음은 도입 후 같은 범위 조사와 운행 기록 실측'
            : `실증: 아직 모자란 것 — ${summary.breadthGaps.join(' · ') || '없음'}`,
          status: summary.breadthOk ? 'measured' : 'measuring',
        },
      ].filter((l): l is Line => !!l),
    },
  ]

  return (
    <div data-growth-chain className={compact ? 'grid gap-2' : 'grid gap-3 lg:grid-cols-2'}>
      {steps.map((st) => {
        const Icon = st.icon
        return (
          <div key={st.n} data-growth-step={st.n} className="rounded-2xl bg-navy-50 px-4 py-3.5 print:border print:border-navy-200">
            <p className="flex items-center gap-2 break-keep text-[1.08rem] font-extrabold text-navy-900">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-navy-500">
                <Icon size={16} strokeWidth={2.4} />
              </span>
              {st.n}. {st.title}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {st.lines.map((l, i) => (
                <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.86rem] font-bold ${LINE_STATUS_STYLE[l.status]}`}>
                    {LINE_STATUS_LABEL[l.status]}
                  </span>
                  <span className="t-body min-w-0 break-keep leading-snug text-navy-700">{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
