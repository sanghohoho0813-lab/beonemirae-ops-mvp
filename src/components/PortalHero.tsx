import { CalendarClock, ChevronRight, MessageSquare, PackagePlus, Siren, Truck, type LucideIcon } from 'lucide-react'
import type { Client } from '../types'
import type { PortalSummary } from '../lib/portal'
import type { WeekDay } from '../lib/portalWeek'
import { prettyDate, today, weight } from '../lib/format'
import { daysFromToday, timeBand } from '../lib/portalLabels'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 홈 첫 줄 — 「다음 수거」와 「요청하기」
//
//  대표님 브리프: 「병원 직원이 처음 들어왔을 때 5초 안에 ① 오늘 또는 다음
//  수거 일정 ② 급하게 요청할 곳 ③ 최근 요청과 처리 결과를 알 수 있어야
//  한다」 · 「회사 소개 문구를 넣지 않는다」.
//
//  ── 포털 2차 ────────────────────────────────────────────────────────────
//   「다음 수거」를 화면에서 **가장 짙은 칸**으로 바꿨습니다(머리띠는 밝게).
//   눈이 제일 먼저 가는 자리에 제일 먼저 알아야 할 것을 둡니다.
//   아래에 **앞으로 7일** 한 줄을 붙였습니다 — 「이번 주 언제 오지?」를
//   날짜 하나가 아니라 한 주로 봅니다. 등록된 일정만 칠하고, 수거주기로
//   계산한 날은 점선(예상)으로 따로 둡니다.
//
//  ⚠ 「다음 수거」가 **확정인지 예상인지** 반드시 글자로 구분합니다(0083).
//  ⚠ 지어낸 숫자(기관 코드 · 무사고 일수)는 넣지 않습니다(0083).
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHero({ client, s, week }: { client: Client; s: PortalSummary; week: WeekDay[] }) {
  const t = today()
  const rel = s.nextDate ? daysFromToday(s.nextDate, t) : null
  const isToday = rel === '오늘'
  const time = timeBand(s.nextTime)
  const hasEstimate = week.some((d) => d.mark === 'estimate')

  return (
    <section
      data-portal-hero
      data-tour="portal-status"
      className="flex flex-col overflow-hidden rounded-3xl bg-navy-900 text-white shadow-lg"
    >
      {/*  ⚠ 병원 이름은 바로 위 머리띠에 이미 크게 있습니다. 화면 읽기
           프로그램에는 「어느 병원의 어떤 화면인가」를 제목으로 알려 드립니다. */}
      <h1 className="sr-only">{client.name} 고객 포털 홈</h1>
      <div data-hero-next className="flex-1 px-5 pb-3.5 pt-4 sm:px-7 sm:pb-4 sm:pt-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <CalendarClock size={20} strokeWidth={2.3} aria-hidden="true" className="shrink-0 text-teal-300" />
          <p className="t-label text-navy-100">{isToday ? '오늘 수거 예정' : '다음 수거'}</p>
          {s.nextDate &&
            (s.nextIsEstimate ? (
              //  ⚠ 확정이 아니라는 말을 **눈에 띄게** 답니다.
              <span data-hero-estimate className="pill ml-auto bg-amber-200 text-amber-900">
                수거주기로 본 예상
              </span>
            ) : (
              <span className="pill ml-auto bg-teal-300 text-navy-950">일정 확정</span>
            ))}
        </div>
        {s.nextDate ? (
          <>
            <p className="mt-2 break-keep text-[1.65rem] font-extrabold leading-tight tracking-tight sm:mt-2.5 sm:text-[2.2rem]">
              {prettyDate(s.nextDate)}
            </p>
            <p className="t-body mt-1.5 flex flex-wrap gap-x-2 break-keep font-bold text-navy-100">
              {time && <span>{time}</span>}
              {rel && !isToday && (
                <span>
                  {time && <span aria-hidden="true">· </span>}
                  {rel}
                </span>
              )}
              {/*  폰에서는 아래 정보 줄을 접고, 수거 주기만 여기 한 줄에 붙입니다. */}
              {client.collectionCycle && (
                <span className="font-medium text-navy-200 sm:hidden">
                  {(time || (rel && !isToday)) && <span aria-hidden="true">· </span>}
                  {client.collectionCycle} 정기 수거
                </span>
              )}
            </p>
            {s.nextIsEstimate && (
              <p className="t-body mt-2 break-keep leading-snug text-navy-200">
                지난 수거일과 수거 주기로 계산한 날짜입니다. 일정이 확정되면 여기에 바로 표시됩니다.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2.5 break-keep text-[1.4rem] font-extrabold leading-snug">아직 정해진 일정이 없습니다</p>
            <p className="t-body mt-1.5 break-keep leading-snug text-navy-200">
              비원미래에서 일정을 잡으면 여기에 바로 표시됩니다.
            </p>
          </>
        )}
      </div>

      {/*  ── 앞으로 7일 ── 글자 하나하나가 아니라 **한 주의 모양**으로 봅니다. */}
      <div data-hero-week className="border-t border-white/10 px-3 pb-3 pt-2.5 sm:px-6 sm:pt-3">
        <ol aria-label="앞으로 7일 수거 일정" className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const label = `${d.month}월 ${d.day}일 ${d.dow}요일${
              d.mark === 'scheduled'
                ? ` 수거 예정${d.time ? ` ${timeBand(d.time) ?? ''}` : ''}`
                : d.mark === 'done'
                  ? ' 수거 완료'
                  : d.mark === 'estimate'
                    ? ' 수거 예상'
                    : ''
            }`
            return (
              <li key={d.date} data-week-day={d.date} data-week-mark={d.mark ?? ''} aria-label={label} className="text-center">
                <span aria-hidden="true" className={`block text-[0.95rem] font-bold ${d.isToday ? 'text-white' : 'text-navy-200'}`}>
                  {d.isToday ? '오늘' : d.dow}
                </span>
                <span
                  aria-hidden="true"
                  className={`mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[1.05rem] font-extrabold tabular-nums sm:h-10 sm:w-10 ${
                    d.mark === 'scheduled'
                      ? 'bg-teal-300 text-navy-950'
                      : d.mark === 'done'
                        ? 'bg-emerald-200 text-emerald-900'
                        : d.mark === 'estimate'
                          ? 'border-2 border-dashed border-amber-200 text-white'
                          : d.isToday
                            ? 'bg-navy-800 text-white'
                            : 'text-navy-100'
                  }`}
                >
                  {d.day}
                </span>
              </li>
            )
          })}
        </ol>
        {/*  ⚠ 폰에서는 「수거 일정」 한 가지뿐이면 범례를 접습니다 — 위 칸이 이미
             「다음 수거 · 날짜」를 말하고 있어 칠한 날이 무엇인지 보입니다.
             예상·완료가 섞일 때는 늘 보입니다. */}
        <p
          aria-hidden="true"
          className={`mt-2.5 flex-wrap gap-x-4 gap-y-1 px-2 text-[0.95rem] font-medium text-navy-200 ${
            hasEstimate || week.some((d) => d.mark === 'done') ? 'flex' : 'hidden sm:flex'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-teal-300" /> 수거 일정
          </span>
          {week.some((d) => d.mark === 'done') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-200" /> 수거 완료
            </span>
          )}
          {hasEstimate && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-dashed border-amber-200" /> 예상
            </span>
          )}
        </p>
      </div>

      {/*  우리 병원 기본 정보 — 넓은 화면에서만, 작게 한 줄. 실제 등록된 값만. */}
      <p className="hidden flex-wrap gap-x-4 gap-y-1 bg-navy-950 px-5 py-3 text-[1rem] font-medium text-navy-200 sm:flex sm:px-7">
        <span>
          <span data-hero-type>{client.type || '기관 구분 미등록'}</span>
          {' · '}
          <span data-hero-cycle>{client.collectionCycle ? `${client.collectionCycle} 정기 수거` : '수거 주기 미등록'}</span>
        </span>
        {s.monthVisits > 0 && (
          <span>
            이번 달 {s.monthVisits}회 · {weight(s.monthKg)}
          </span>
        )}
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 큰 단추 둘 — 긴급수거 요청 · 자재·용기 요청
//
//  ⚠ 둘이 **한눈에 구분**되어야 합니다. 색(빨강 · 청록)과 아이콘과 이름이
//    셋 다 다릅니다. 색만으로 가르지 않습니다.
//  ⚠ 단추 이름 아래에 「언제 누르는지」를 적습니다.
//  포털 2차 — 폰에서는 한 줄씩(엄지로 누르기 편하게), 넓은 화면에서는 나란히
//  선 큰 타일로 바뀝니다.
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
  rose: {
    box: 'ring-rose-200 hover:bg-rose-50 hover:ring-rose-300',
    tile: 'bg-rose-600 text-white shadow-[0_8px_18px_-8px_rgb(225_29_72/0.7)]',
    arrow: 'bg-rose-50 text-rose-600',
  },
  teal: {
    box: 'ring-teal-200 hover:bg-teal-50 hover:ring-teal-300',
    tile: 'bg-teal-600 text-white shadow-[0_8px_18px_-8px_rgb(var(--c-teal-600)/0.7)]',
    arrow: 'bg-teal-50 text-teal-700',
  },
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
      className={`pressable group relative flex min-h-[5.5rem] w-full items-center gap-4 rounded-3xl bg-white px-5 py-4 text-left shadow-card ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 sm:min-h-[11rem] sm:flex-col sm:items-start sm:justify-between sm:gap-3 sm:p-6 xl:min-h-0 xl:flex-row xl:items-center xl:justify-start xl:gap-5 ${t.box}`}
    >
      <span
        data-action-icon
        aria-hidden="true"
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${t.tile}`}
      >
        <Icon size={28} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1 sm:flex-none xl:flex-1">
        <span className="block break-keep text-[1.3rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[1.45rem]">
          {a.label}
        </span>
        <span className="t-body mt-1 block break-keep leading-snug text-navy-600">{a.when}</span>
      </span>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:absolute sm:right-5 sm:top-6 xl:static ${t.arrow}`}
      >
        <ChevronRight
          size={20}
          strokeWidth={2.6}
          data-action-arrow
          className="transition-transform duration-200 group-hover:translate-x-1"
        />
      </span>
    </button>
  )
}

/** 작은 단추 — 덜 급한 요청 · 문의 */
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
      className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[1.05rem] font-bold text-navy-800 shadow-card ring-1 ring-cardline transition hover:bg-navy-50 hover:ring-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
    >
      <Icon size={20} strokeWidth={2.3} aria-hidden="true" className="shrink-0 text-navy-500" />
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
    <section aria-label="요청하기" data-portal-actions data-tour="portal-request" className="flex flex-col gap-2.5 sm:gap-3">
      {/*  폰: 한 줄씩 · 태블릿: 나란히 큰 타일 · PC(옆에 「다음 수거」): 다시 한 줄씩 —
           PC 에서 타일로 두면 옆 칸 키에 맞춰 늘어나 가운데가 텅 비었습니다. */}
      <div className="grid flex-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:auto-rows-fr xl:grid-cols-1">
        <BigActionButton
          a={{ label: '긴급수거 요청', when: '폐기물이 예상보다 빨리 찼을 때', icon: Siren, tone: 'rose', cta: 'urgent', onClick: onUrgent }}
        />
        <BigActionButton
          a={{
            label: '자재·용기 요청',
            when: '전용 용기·봉투·바늘통 등이 부족할 때',
            icon: PackagePlus,
            tone: 'teal',
            cta: 'supplies',
            onClick: onSupply,
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <SmallActionButton label="추가수거 요청" cta="collect" icon={Truck} onClick={onPickup} />
        <SmallActionButton label="문의하기" icon={MessageSquare} onClick={onAsk} />
      </div>
    </section>
  )
}
