import { useMemo } from 'react'
import { Hospital, Package, Repeat, CalendarClock, Phone, TrendingUp } from 'lucide-react'
import type { AppData } from '../types'
import { clientAx } from '../lib/clientAx'
import { prettyDate, won } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 이 병원에 대해 **지금 아는 것**
//
//  ⚠ 「이 병원에 이것을 파세요」라고 하지 않습니다.
//
//   근거 없는 영업추천은 한 번만 틀려도 그다음부터 화면의 모든 숫자를
//   안 믿게 만듭니다. 여기 있는 것은 전부 **이미 일어난 일**입니다 —
//   무엇을 얼마나 가져갔고, 언제 마지막이었고, 포털을 쓰는가.
//   그걸 보고 무엇을 할지는 사람이 정합니다.
//
//  금액 칸은 **사무실·관리자에게만** 보입니다 (0063 과 같은 규칙).
// ─────────────────────────────────────────────────────────────────────────────

function Line({
  icon: Icon,
  label,
  children,
  hint,
}: {
  icon: typeof Hospital
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-400">
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-muted break-keep font-bold text-navy-400">{label}</p>
        <div className="t-body mt-0.5 break-keep leading-snug text-navy-800">{children}</div>
        {hint && <p className="t-caption mt-1 break-keep text-navy-400">{hint}</p>}
      </div>
    </div>
  )
}

export function ClientAxPanel({
  data,
  clientId,
  today,
  canSeeMoney,
}: {
  data: AppData
  clientId: string
  today: string
  canSeeMoney: boolean
}) {
  const r = useMemo(() => clientAx(data, clientId, today), [data, clientId, today])

  const nothing =
    r.bought.length === 0 &&
    r.needs.length === 0 &&
    !r.usesPortal &&
    r.unplannedVisits === 0 &&
    r.additionalSupplies === 0

  return (
    <div data-client-ax className="card divide-y divide-navy-50">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        <p className="t-card font-extrabold text-navy-900">이 병원에 대해 지금 아는 것</p>
        <span className="pill bg-navy-100 text-navy-500">실제 기록만</span>
      </div>

      {nothing && (
        <p data-client-ax-empty className="t-body break-keep px-4 py-5 text-navy-500">
          아직 이 병원에 대해 쌓인 기록이 적습니다. 수거·자재공급·요청이 몇 번 쌓이면 여기에 사용량과 주기가
          나옵니다. <b className="text-navy-600">없는 것을 지어내지 않습니다.</b>
        </p>
      )}

      {/* ── 무엇을 얼마나 가져갔는가 ────────────────────────────────────── */}
      {r.repeat.length > 0 && (
        <Line icon={Repeat} label="자주 가져가시는 물품">
          <span data-client-ax-repeat>
            {r.repeat.map((b) => `${b.label} (${b.times}번 · 모두 ${b.qty}개)`).join(' · ')}
          </span>
        </Line>
      )}

      {/* ── 다음에 필요할 때 ────────────────────────────────────────────── */}
      {r.needs.length > 0 ? (
        <Line
          icon={CalendarClock}
          label="다음에 필요할 것으로 보이는 것"
          hint={r.needs[0].why}
        >
          <span data-client-ax-need>
            {r.needs[0].label}
            {r.needs[0].dueOn && ` — 이대로면 ${prettyDate(r.needs[0].dueOn)}쯤`}
            {r.needs[0].runsOutBeforeNextVisit && (
              <b className="ml-1.5 text-rose-600">다음 수거 전에 떨어집니다</b>
            )}
          </span>
        </Line>
      ) : (
        r.needsBlocked && (
          <Line icon={CalendarClock} label="다음에 필요할 것으로 보이는 것">
            {/*  근거가 모자라면 **모자란다고 적습니다.** 짐작으로 채우지 않습니다. */}
            <span data-client-ax-need-blocked className="text-navy-500">{r.needsBlocked}</span>
          </Line>
        )
      )}

      {/* ── 포털을 쓰는가 ───────────────────────────────────────────────── */}
      <Line
        icon={r.usesPortal ? Hospital : Phone}
        label="병원이 직접 올리는가"
        hint="이 값이 오르는 것이 「전화·카톡 대신 쓰기 시작했다」입니다"
      >
        <span data-client-ax-portal={r.usesPortal ? 'yes' : 'no'}>
          {r.usesPortal ? (
            <>
              포털에서 직접 올림 — 요청 {r.portalRequests}건 · 물품 주문 {r.portalOrders}건
              {r.phoneRequests > 0 && (
                <span className="text-navy-500"> (전화·카톡 접수도 {r.phoneRequests}건)</span>
              )}
            </>
          ) : (
            <span className="text-navy-500">
              아직 포털로 올린 기록이 없습니다{r.phoneRequests > 0 && ` — 전화·카톡 접수 ${r.phoneRequests}건`}
            </span>
          )}
        </span>
      </Line>

      {/* ── 운영 ───────────────────────────────────────────────────────── */}
      {(r.unplannedVisits > 0 || r.additionalSupplies > 0) && (
        <Line icon={Package} label="예정에 없던 일" hint="최근 180일 · 잦으면 수거주기를 다시 볼 자리입니다">
          <span data-client-ax-unplanned>
            {r.unplannedVisits > 0 && `예정에 없던 방문 ${r.unplannedVisits}건`}
            {r.unplannedVisits > 0 && r.additionalSupplies > 0 && ' · '}
            {r.additionalSupplies > 0 && `추가요청 자재공급 ${r.additionalSupplies}건`}
          </span>
        </Line>
      )}

      {/* ── 금액 — 사무실·관리자만 ──────────────────────────────────────── */}
      {canSeeMoney && r.productRevenue > 0 && (
        <Line
          icon={TrendingUp}
          label="이 병원에서 생긴 소모품 판매"
          hint="⚠ 전달 ≠ 입금입니다. 두 숫자를 한 칸으로 합치지 않습니다"
        >
          <span data-client-ax-revenue>
            전달까지 <b>{won(r.productRevenue)}</b>
            <span className="text-navy-500">
              {' · '}입금까지 {won(r.paidRevenue)}
            </span>
          </span>
        </Line>
      )}
    </div>
  )
}
