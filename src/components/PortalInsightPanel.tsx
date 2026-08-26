import { ArrowDownRight, ArrowUpRight, Calculator, Info, Minus } from 'lucide-react'
import type { PortalInsight, PortalInsightResult } from '../lib/portalInsight'

// ─────────────────────────────────────────────────────────────────────────────
// 「우리 병원 배출 분석」 칸 (0086)
//
//  시안에서 오른쪽에 있던 AI Insight 자리입니다.
//
//  ⚠ **AI 라고 적지 않습니다.** 지금 계산은 뺄셈과 나눗셈이고(lib/portalInsight.ts),
//    그것을 AI 라고 부르면 병원은 저희가 안 가진 능력을 가졌다고 믿습니다.
//    나중에 실제 모형이 붙으면 그때 이름을 바꾸면 됩니다. 지금은 아닙니다.
//
//  ⚠ 각 줄마다 **근거 숫자**를 같이 답니다. 병원이 검산할 수 있어야
//    「그렇구나」가 아니라 「맞네」가 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
  note: Info,
} as const

const TILE = {
  up: 'bg-amber-50 text-amber-700',
  down: 'bg-sky-50 text-sky-700',
  flat: 'bg-emerald-50 text-emerald-700',
  note: 'bg-navy-100 text-navy-600',
} as const

function Row({ x }: { x: PortalInsight }) {
  const Icon = ICON[x.tone]
  return (
    <li data-insight={x.key} className="flex items-start gap-3 px-5 py-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TILE[x.tone]}`}>
        <Icon size={18} strokeWidth={2.4} />
      </span>
      <div className="min-w-0">
        <p className="t-body break-keep font-extrabold leading-snug text-navy-900">{x.title}</p>
        {/*  근거 — 작게, 그러나 **반드시** 있습니다 */}
        <p data-insight-basis className="t-muted mt-1 break-keep leading-snug">
          {x.basis}
        </p>
      </div>
    </li>
  )
}

export function PortalInsightPanel({ result }: { result: PortalInsightResult }) {
  return (
    <section data-portal-insight className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-navy-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white">
          <Calculator size={18} strokeWidth={2.4} />
        </span>
        <p className="t-card min-w-0 break-keep text-navy-900">우리 병원 배출 분석</p>
        {/*  ⚠ 이 꼬리표가 이 칸의 핵심입니다. 「무엇으로 계산했는가」를
             제목 옆에 붙여 둡니다. */}
        <span data-insight-method className="pill shrink-0 bg-navy-100 text-navy-600">
          수거 기록으로 계산 · AI 아님
        </span>
      </div>

      {result.items.length > 0 ? (
        <ul className="divide-y divide-navy-50">
          {result.items.map((x) => (
            <Row key={x.key} x={x} />
          ))}
        </ul>
      ) : (
        <p data-insight-why className="t-body break-keep px-5 py-5 leading-snug text-navy-500">
          {result.why}
        </p>
      )}
    </section>
  )
}
