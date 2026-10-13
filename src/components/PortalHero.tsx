import { ChevronRight, MessageSquare, PackagePlus, Siren, Truck, type LucideIcon } from 'lucide-react'
import type { Client } from '../types'
import type { PortalSummary } from '../lib/portal'
import { prettyDate, today } from '../lib/format'
import { daysFromToday, timeBand } from '../lib/portalLabels'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 홈 첫 줄 — 「다음 수거」와 빠른 요청 (포털 3차)
//
//  대표님 브리프: 「홈의 첫 번째 시선은 반드시 다음 수거 일정 · Hero 안에 너무
//  많은 정보나 작은 메뉴를 넣지 않는다」.
//
//  ── 3차에서 뺀 것 ───────────────────────────────────────────────────────
//   · 앞으로 7일 줄 · 이번 달 횟수/무게 줄 — 날짜 하나를 크게 말하는 칸에
//     작은 정보가 여러 겹 붙어 있었습니다. 예정된 수거는 「수거 이력」 맨 위에
//     있습니다.
//   · 단추의 흰 바탕 · 테두리 · 그림자 — 「카드 두 장」이 아니라 앱의 빠른
//     요청 단추처럼, 옅은 색 면 하나로 둡니다. 긴급만 빨강, 자재는 파랑.
//
//  ⚠ 「다음 수거」가 **확정인지 예상인지** 반드시 글자로 구분합니다(0083).
//  ⚠ 지어낸 숫자(기관 코드 · 무사고 일수)는 넣지 않습니다(0083).
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHero({ client, s }: { client: Client; s: PortalSummary }) {
  const t = today()
  const rel = s.nextDate ? daysFromToday(s.nextDate, t) : null
  const isToday = rel === '오늘'
  const isTomorrow = rel === '내일'
  const time = timeBand(s.nextTime)

  return (
    <section data-portal-hero data-tour="portal-status" className="rounded-[22px] bg-navy-900 px-6 py-6 text-white sm:px-8 sm:py-7">
      {/*  ⚠ 병원 이름은 바로 위 머리띠에 있습니다. 화면 읽기 프로그램에는
           「어느 병원의 어떤 화면인가」를 제목으로 알려 드립니다. */}
      <h1 className="sr-only">{client.name} 고객 포털 홈</h1>
      <div data-hero-next>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/*  오늘 · 내일이면 그 말이 제목이 됩니다 */}
          <p className={`text-[1.08rem] font-extrabold ${isToday || isTomorrow ? 'text-teal-300' : 'text-navy-200'}`}>
            {isToday ? '오늘 수거 예정' : isTomorrow ? '내일 수거 예정' : '다음 수거'}
          </p>
          {s.nextDate &&
            (s.nextIsEstimate ? (
              //  ⚠ 확정이 아니라는 말을 **눈에 띄게** — 점선 테두리 + 글자.
              <span data-hero-estimate className="pill border-2 border-dashed border-navy-300 text-navy-100">
                수거주기로 본 예상
              </span>
            ) : (
              <span className="pill bg-teal-300 text-navy-950">일정 확정</span>
            ))}
        </div>

        {s.nextDate ? (
          <>
            <p className="p-hero-date mt-3">{prettyDate(s.nextDate)}</p>
            {(time || (rel && !isToday && !isTomorrow)) && (
              <p className="mt-1.5 text-[1.3rem] font-bold leading-snug text-white sm:text-[1.45rem]">
                {[time, rel && !isToday && !isTomorrow ? rel : null].filter(Boolean).join(' · ')}
              </p>
            )}
            {s.nextIsEstimate && (
              <p className="mt-2.5 break-keep text-[1.02rem] leading-snug text-navy-200">
                지난 수거일과 수거 주기로 계산한 날짜입니다. 일정이 확정되면 바로 바뀝니다.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 break-keep text-[1.5rem] font-extrabold leading-snug">아직 정해진 일정이 없습니다</p>
            <p className="mt-1.5 break-keep text-[1.02rem] leading-snug text-navy-200">
              비원미래에서 일정을 잡으면 여기에 바로 표시됩니다.
            </p>
          </>
        )}
      </div>
      {/*  우리 병원 기본 — 한 줄만. 실제 등록된 값만. */}
      <p className="mt-5 break-keep text-[1.02rem] font-medium text-navy-200">
        <span data-hero-type>{client.type || '기관 구분 미등록'}</span>
        {' · '}
        <span data-hero-cycle>{client.collectionCycle ? `${client.collectionCycle} 정기수거` : '수거 주기 미등록'}</span>
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 빠른 요청 — 긴급수거 요청 · 자재·용기 요청 (+ 작은 둘)
//
//  ⚠ 둘이 **한눈에 구분**되어야 합니다. 색(빨강 · 파랑) · 아이콘 · 이름이
//    셋 다 다릅니다. 색만으로 가르지 않습니다.
//  ⚠ 이름 아래 「언제 누르는지」 — 병원 직원은 어느 정도여야 긴급인지 망설입니다.
// ─────────────────────────────────────────────────────────────────────────────

interface BigAction {
  label: string
  when: string
  icon: LucideIcon
  tone: 'rose' | 'teal'
  cta: string
  onClick: () => void
}

const BIG_TONE = {
  rose: { box: 'bg-rose-50 hover:bg-rose-100', tile: 'bg-rose-600 text-white', arrow: 'text-rose-600' },
  teal: { box: 'bg-teal-50 hover:bg-teal-100', tile: 'bg-teal-600 text-white', arrow: 'text-teal-700' },
} as const

function BigActionButton({ a }: { a: BigAction }) {
  const Icon = a.icon
  const t = BIG_TONE[a.tone]
  return (
    <button
      type="button"
      data-portal-action={a.label}
      data-portal-cta={a.cta}
      data-card-tone={a.tone}
      onClick={a.onClick}
      className={`pressable group relative flex min-h-[9rem] w-full flex-col items-start justify-between gap-4 rounded-[18px] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 sm:min-h-[10rem] sm:p-5 ${t.box}`}
    >
      <span
        data-action-icon
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105 ${t.tile}`}
      >
        <Icon size={24} strokeWidth={2.2} />
      </span>
      <ChevronRight
        size={22}
        strokeWidth={2.6}
        data-action-arrow
        aria-hidden="true"
        className={`absolute right-4 top-5 transition-transform duration-200 group-hover:translate-x-1 ${t.arrow}`}
      />
      <span className="min-w-0">
        <span className="block break-keep text-[1.15rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[1.3rem]">
          {a.label}
        </span>
        <span className="p-sub mt-1 block text-navy-700">{a.when}</span>
      </span>
    </button>
  )
}

/** 작은 단추 — 덜 급한 요청 · 문의. 색 없이, 면 하나 */
function SmallActionButton({
  label,
  cta,
  icon: Icon,
  onClick,
}: {
  label: string
  cta?: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-portal-action={label}
      data-portal-cta={cta}
      onClick={onClick}
      className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-full bg-navy-50 px-3 py-2 text-[1.05rem] font-bold text-navy-800 transition hover:bg-navy-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
    >
      <Icon size={19} strokeWidth={2.3} aria-hidden="true" className="shrink-0 text-navy-600" />
      <span className="break-keep">{label}</span>
    </button>
  )
}

export function PortalActions({
  onUrgent,
  onSupply,
  onPickup,
  onAsk,
}: {
  onUrgent: () => void
  onSupply: () => void
  onPickup: () => void
  onAsk: () => void
}) {
  return (
    <section aria-label="빠른 요청" data-portal-actions data-tour="portal-request" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <BigActionButton
          a={{ label: '긴급수거 요청', when: '폐기물이 예상보다 빨리 찼을 때', icon: Siren, tone: 'rose', cta: 'urgent', onClick: onUrgent }}
        />
        <BigActionButton
          a={{
            label: '자재·용기 요청',
            when: '용기·봉투·바늘통이 부족할 때',
            icon: PackagePlus,
            tone: 'teal',
            cta: 'supplies',
            onClick: onSupply,
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SmallActionButton label="추가수거 요청" cta="collect" icon={Truck} onClick={onPickup} />
        <SmallActionButton label="문의하기" icon={MessageSquare} onClick={onAsk} />
      </div>
    </section>
  )
}
