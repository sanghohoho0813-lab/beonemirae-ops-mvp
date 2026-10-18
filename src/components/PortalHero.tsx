import { BarChart3, CalendarCheck, ChevronRight, FileText, Hospital, MessageSquare, PackagePlus, Siren, Truck, type LucideIcon } from 'lucide-react'
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

  //  포털 4차 — 파란 머리 위에 겹쳐 올라앉는 **흰 카드**(흔한 생활 앱의 주문 추적 카드 자리).
  //  ⚠ 「기사 출발 · 도착 예정」 같은 실시간 단계는 아직 기록이 없어 그리지 않습니다.
  //    지금 있는 자료(일정 날짜 · 시각 · 확정/예상 · 주기)만 크게 보여 줍니다.
  return (
    <section data-portal-hero data-tour="portal-status" className="p-card rounded-[22px] px-5 py-5 sm:px-6 sm:py-6">
      {/*  ⚠ 병원 이름은 바로 위 머리띠에 있습니다. 화면 읽기 프로그램에는
           「어느 병원의 어떤 화면인가」를 제목으로 알려 드립니다. */}
      <h1 className="sr-only">{client.name} 고객 포털 홈</h1>
      <div data-hero-next>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/*  오늘 · 내일이면 그 말이 제목이 됩니다 */}
          <p className="flex items-center gap-1.5 text-[1.05rem] font-extrabold text-teal-700">
            <Truck size={19} strokeWidth={2.4} aria-hidden="true" />
            {isToday ? '오늘 수거 예정' : isTomorrow ? '내일 수거 예정' : '다음 수거'}
          </p>
          {s.nextDate &&
            (s.nextIsEstimate ? (
              //  ⚠ 확정이 아니라는 말을 **눈에 띄게** — 점선 테두리 + 글자.
              <span data-hero-estimate className="pill border-2 border-dashed border-navy-300 text-navy-700">
                수거주기로 본 예상
              </span>
            ) : (
              <span className="pill bg-emerald-50 text-emerald-800">
                <CalendarCheck size={15} strokeWidth={2.6} aria-hidden="true" />
                일정 확정
              </span>
            ))}
        </div>

        {s.nextDate ? (
          <>
            <p className="p-hero-date mt-2.5 text-navy-900">{prettyDate(s.nextDate)}</p>
            {(time || (rel && !isToday && !isTomorrow)) && (
              <p className="mt-1 text-[1.25rem] font-bold leading-snug text-navy-700 sm:text-[1.4rem]">
                {[time, rel && !isToday && !isTomorrow ? rel : null].filter(Boolean).join(' · ')}
              </p>
            )}
            {s.nextIsEstimate && (
              <p className="p-sub mt-2 break-keep">
                지난 수거일과 수거 주기로 계산한 날짜입니다. 일정이 확정되면 바로 바뀝니다.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2.5 break-keep text-[1.5rem] font-extrabold leading-snug text-navy-900">아직 정해진 일정이 없습니다</p>
            <p className="p-sub mt-1.5 break-keep">비원미래에서 일정을 잡으면 여기에 바로 표시됩니다.</p>
          </>
        )}
      </div>
      {/*  우리 병원 기본 — 한 줄만. 실제 등록된 값만. */}
      <p className="p-sub mt-4 flex items-center gap-2 border-t border-navy-100 pt-3.5 break-keep">
        <Hospital size={17} strokeWidth={2.3} aria-hidden="true" className="shrink-0 text-navy-400" />
        <span>
          <span data-hero-type>{client.type || '기관 구분 미등록'}</span>
          {' · '}
          <span data-hero-cycle>{client.collectionCycle ? `${client.collectionCycle} 정기수거` : '수거 주기 미등록'}</span>
        </span>
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
//  포털 4차 — 작은 둘(추가수거 · 문의)은 아이콘 메뉴 줄로 옮기고 리포트 · 증빙을 더했습니다.
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
      className={`pressable group relative flex min-h-[8rem] w-full flex-col items-start justify-between gap-3 rounded-[18px] p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 sm:min-h-[9.5rem] sm:p-5 ${t.box}`}
    >
      <span
        data-action-icon
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${t.tile}`}
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

//  아이콘 메뉴 한 칸 — 옅은 색 둥근 네모 + 짧은 이름 (흔한 생활 앱의 메뉴 그리드)
const TILE_TONE = {
  blue: 'bg-teal-50 text-teal-700',
  gray: 'bg-navy-100 text-navy-700',
  violet: 'bg-violet-50 text-violet-700',
  green: 'bg-emerald-50 text-emerald-700',
} as const

function GridTile({
  label,
  short,
  cta,
  icon: Icon,
  tone,
  onClick,
}: {
  /** 화면 읽기 · 검사가 읽는 온전한 이름 */
  label: string
  /** 칸에 적는 짧은 이름 */
  short: string
  cta?: string
  icon: LucideIcon
  tone: keyof typeof TILE_TONE
  onClick: () => void
}) {
  return (
    <button type="button" data-portal-action={label} data-portal-cta={cta} aria-label={label} onClick={onClick} className="p-tile">
      <span aria-hidden="true" className={`flex h-14 w-14 items-center justify-center rounded-[18px] ${TILE_TONE[tone]}`}>
        <Icon size={26} strokeWidth={2.2} />
      </span>
      <span aria-hidden="true" className="break-keep">{short}</span>
    </button>
  )
}

export function PortalActions({
  onUrgent,
  onSupply,
  onPickup,
  onAsk,
  onReport,
  onDocs,
}: {
  onUrgent: () => void
  onSupply: () => void
  onPickup: () => void
  onAsk: () => void
  onReport?: () => void
  onDocs?: () => void
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
      {/*  포털 4차 — 덜 급한 일은 아이콘 메뉴 한 줄로(흔한 생활 앱 메뉴 그리드).
           ⚠ 모두 **지금 있는 기능**으로만 갑니다 — 없는 화면을 칸으로 만들지 않습니다. */}
      <div data-portal-grid className="p-card grid grid-cols-4 gap-1 px-2 py-3 sm:px-3">
        <GridTile label="추가수거 요청" short="추가수거" cta="collect" icon={Truck} tone="blue" onClick={onPickup} />
        <GridTile label="문의하기" short="문의하기" icon={MessageSquare} tone="gray" onClick={onAsk} />
        {onReport && <GridTile label="배출 리포트" short="리포트" icon={BarChart3} tone="violet" onClick={onReport} />}
        {onDocs && <GridTile label="증빙자료" short="증빙자료" icon={FileText} tone="green" onClick={onDocs} />}
      </div>
    </section>
  )
}
