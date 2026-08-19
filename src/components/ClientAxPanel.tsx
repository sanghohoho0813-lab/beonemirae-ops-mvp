import { useMemo, useState } from 'react'
import { Hospital, Package, Repeat, CalendarClock, ChevronDown, Phone, TrendingUp } from 'lucide-react'
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

  //  ── 폰에서는 접습니다 ────────────────────────────────────────────────
  //
  //   이 패널을 다 펴 두었더니 거래처 상세 폰 길이가 3,273px 이 됐습니다
  //   (한도 3,100px). 아래로 더 밀어야 한다는 뜻이라 그냥 두면 안 됩니다.
  //   폰에서 이 화면을 여는 사람이 먼저 볼 것은 **다음에 필요할 것**과
  //   **병원이 직접 올리는가** 두 줄입니다. 나머지는 눌러서 봅니다.
  //   ⚠ 줄은 **한 번만** 그립니다 — 접힌 사본을 따로 그리면 검사가 늘
  //     숨은 쪽을 집어 「접혀 있다」가 언제나 통과합니다.
  const [open, setOpen] = useState(false)

  const nothing =
    r.bought.length === 0 &&
    r.needs.length === 0 &&
    !r.usesPortal &&
    r.unplannedVisits === 0 &&
    r.additionalSupplies === 0

  //  ── 줄을 배열로 만듭니다 ─────────────────────────────────────────────
  //   폰에서 앞 두 줄만 펴 두고 나머지를 접기 위해서입니다. 줄 자체는
  //   **한 번만** 그립니다.
  const rows: { key: string; el: React.ReactNode }[] = []

  if (r.needs.length > 0) {
    rows.push({
      key: 'need',
      el: (
        <Line icon={CalendarClock} label="다음에 필요할 것으로 보이는 것" hint={r.needs[0].why}>
          <span data-client-ax-need>
            {r.needs[0].label}
            {r.needs[0].dueOn && ` — 이대로면 ${prettyDate(r.needs[0].dueOn)}쯤`}
            {r.needs[0].runsOutBeforeNextVisit && (
              <b className="ml-1.5 text-rose-600">다음 수거 전에 떨어집니다</b>
            )}
          </span>
        </Line>
      ),
    })
  } else if (r.needsBlocked) {
    rows.push({
      key: 'need-blocked',
      el: (
        <Line icon={CalendarClock} label="다음에 필요할 것으로 보이는 것">
          {/*  근거가 모자라면 **모자란다고 적습니다.** 짐작으로 채우지 않습니다. */}
          <span data-client-ax-need-blocked className="text-navy-500">{r.needsBlocked}</span>
        </Line>
      ),
    })
  }

  rows.push({
    key: 'portal',
    el: (
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
    ),
  })

  if (r.repeat.length > 0) {
    rows.push({
      key: 'repeat',
      el: (
        <Line icon={Repeat} label="자주 가져가시는 물품">
          <span data-client-ax-repeat>
            {r.repeat.map((b) => `${b.label} (${b.times}번 · 모두 ${b.qty}개)`).join(' · ')}
          </span>
        </Line>
      ),
    })
  }

  if (r.unplannedVisits > 0 || r.additionalSupplies > 0) {
    rows.push({
      key: 'unplanned',
      el: (
        <Line icon={Package} label="예정에 없던 일" hint="최근 180일 · 잦으면 수거주기를 다시 볼 자리입니다">
          <span data-client-ax-unplanned>
            {r.unplannedVisits > 0 && `예정에 없던 방문 ${r.unplannedVisits}건`}
            {r.unplannedVisits > 0 && r.additionalSupplies > 0 && ' · '}
            {r.additionalSupplies > 0 && `추가요청 자재공급 ${r.additionalSupplies}건`}
          </span>
        </Line>
      ),
    })
  }

  //  금액은 사무실·관리자에게만 (0063 과 같은 규칙)
  if (canSeeMoney && r.productRevenue > 0) {
    rows.push({
      key: 'revenue',
      el: (
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
      ),
    })
  }

  return (
    <div data-client-ax className="card divide-y divide-navy-50">
      {/*  ── 폰에서는 **한 줄**로 접습니다 ──────────────────────────────────
           다 펴 두었더니 거래처 상세 폰 길이가 3,273px 이 됐습니다(한도
           3,100px). 아래로 더 밀어야 한다는 뜻이라 그냥 두면 안 됩니다.
           이 화면의 「다음 행동 추천」도 폰에서는 같은 방식으로 접혀 있습니다.
           ⚠ 줄은 **한 번만** 그립니다 — 접힌 사본을 따로 그리면 검사가 늘
             숨은 쪽을 집어 「접혀 있다」가 언제나 통과합니다. */}
      {!open && rows.length > 0 && (
        <button
          data-client-ax-more
          onClick={() => setOpen(true)}
          className="flex min-h-[2.75rem] w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left transition hover:bg-navy-50 sm:hidden"
        >
          <span className="t-card font-extrabold text-navy-900">이 병원에 대해 지금 아는 것</span>
          <span className="pill bg-navy-100 text-navy-500">{rows.length}가지</span>
          <ChevronDown size={16} strokeWidth={2.6} className="ml-auto shrink-0 text-navy-400" />
        </button>
      )}

      <div data-client-ax-body className={open || rows.length === 0 ? '' : 'hidden sm:block'}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
          <p className="t-card font-extrabold text-navy-900">이 병원에 대해 지금 아는 것</p>
          <span className="pill bg-navy-100 text-navy-500">실제 기록만</span>
        </div>

        {nothing && (
          <p data-client-ax-empty className="t-body break-keep border-t border-navy-50 px-4 py-5 text-navy-500">
            아직 이 병원에 대해 쌓인 기록이 적습니다. 수거·자재공급·요청이 몇 번 쌓이면 여기에 사용량과 주기가
            나옵니다. <b className="text-navy-600">없는 것을 지어내지 않습니다.</b>
          </p>
        )}

        {rows.map((x) => (
          <div key={x.key} className="border-t border-navy-50">
            {x.el}
          </div>
        ))}
      </div>
    </div>
  )
}
