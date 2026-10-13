import { CalendarClock, ChevronRight, MessageSquare, PackagePlus, Siren, Truck, type LucideIcon } from 'lucide-react'
import type { Client } from '../types'
import type { PortalSummary } from '../lib/portal'
import { prettyDate, today, weight } from '../lib/format'
import { daysFromToday, timeBand } from '../lib/portalLabels'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 홈 첫 줄 — 「다음 수거」와 「요청하기」 (포털 1차 고도화)
//
//  대표님 브리프: 「병원 직원이 처음 들어왔을 때 5초 안에 ① 오늘 또는 다음
//  수거 일정 ② 급하게 요청할 곳 ③ 최근 요청과 처리 결과를 알 수 있어야
//  한다」 · 「회사 소개 문구를 넣지 않는다」.
//
//  ── 예전과 무엇이 다른가 ────────────────────────────────────────────────
//   예전 머리 칸은 짙은 남색 사진 띠에 「…님, 환영합니다」와 회사 한 줄
//   소개가 먼저 나오고, 다음 수거는 그 아래 작은 줄이었습니다. 그 아래에
//   같은 크기의 카드 여덟 장이 있어 「긴급 수거」는 세 번째, 폰에서는 아래
//   메뉴에 반쯤 가려져 있었습니다.
//   이제 첫 칸은 **다음 수거 하나**만 크게 말하고, 바로 아래 **큰 단추
//   둘**(긴급수거 요청 · 자재·용기 요청)이 옵니다.
//
//  ⚠ 「다음 수거」가 **확정인지 예상인지** 반드시 글자로 구분합니다(0083).
//    수거주기로 계산한 값을 확정처럼 두면 병원은 그날 사람을 대기시켜 놓고
//    헛수고를 합니다.
//  ⚠ 지어낸 숫자(기관 코드 · 무사고 일수)는 넣지 않습니다(0083) — 저희
//    서버에 없는 값입니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHero({ client, s }: { client: Client; s: PortalSummary }) {
  const t = today()
  const rel = s.nextDate ? daysFromToday(s.nextDate, t) : null
  const isToday = rel === '오늘'
  const time = timeBand(s.nextTime)

  return (
    <section data-portal-hero data-tour="portal-status" className="card flex flex-col overflow-hidden">
      {/*  ⚠ 병원 이름은 바로 위 머리띠에 이미 크게 있습니다. 같은 이름을 또
           크게 쓰면 첫 화면의 1/5 을 같은 말이 먹습니다. 화면 읽기 프로그램에는
           「어느 병원의 어떤 화면인가」를 제목으로 알려 드립니다. */}
      <h1 className="sr-only">{client.name} 고객 포털 홈</h1>
      {/*  ⚠ 폰에서는 달력 아이콘을 접습니다 — 그 48px 때문에 날짜가 세 줄로
           접혔습니다. 날짜가 이 칸의 주인공입니다. */}
      <div data-hero-next className="flex flex-1 items-start gap-4 px-5 py-3.5 sm:px-7 sm:py-6 xl:items-center">
        <span
          aria-hidden="true"
          className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 sm:flex"
        >
          <CalendarClock size={26} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-label text-navy-500">{isToday ? '오늘 수거 예정' : '다음 수거'}</p>
          {s.nextDate ? (
            <>
              <p className="mt-1 break-keep text-[1.6rem] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[2rem]">
                {prettyDate(s.nextDate)}
                {time && <span className="block whitespace-nowrap sm:ml-2 sm:inline">{time}</span>}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:mt-3">
                {s.nextIsEstimate ? (
                  //  ⚠ 확정이 아니라는 말을 **눈에 띄게** 답니다.
                  <span data-hero-estimate className="pill bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                    수거주기로 본 예상
                  </span>
                ) : (
                  <span className="pill bg-teal-50 text-teal-800 ring-1 ring-teal-200">일정 확정</span>
                )}
                {rel && !isToday && <span className="t-body font-bold text-navy-600">{rel}</span>}
                {/*  폰에서는 아래 정보 줄을 접고, 수거 주기만 여기 한 줄에 붙입니다. */}
                {client.collectionCycle && (
                  <span className="t-body text-navy-600 sm:hidden">· {client.collectionCycle} 정기 수거</span>
                )}
              </div>
              {s.nextIsEstimate && (
                <p className="t-muted mt-2 break-keep leading-snug">
                  지난 수거일과 수거 주기로 계산한 날짜입니다. 일정이 확정되면 여기에 바로 표시됩니다.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 break-keep text-[1.35rem] font-extrabold leading-snug text-navy-900">
                아직 정해진 일정이 없습니다
              </p>
              <p className="t-muted mt-1.5 break-keep leading-snug">
                비원미래에서 일정을 잡으면 여기에 바로 표시됩니다.
              </p>
            </>
          )}
        </div>
      </div>
      {/*  우리 병원 기본 정보 — 작게, 한 줄. 실제 등록된 값만. */}
      {/*  ⚠ 묶음 단위로 접힙니다 — 가운뎃점이 줄 끝에 홀로 남지 않게. */}
      {/*  ⚠ 폰에서는 접습니다 — 첫 화면에 큰 단추 둘이 아래 메뉴에 가리지 않고
           들어가야 합니다(직원 미리보기 띠가 붙어도). 수거 주기는 위 줄에 붙였습니다. */}
      <p className="t-muted hidden flex-wrap gap-x-4 gap-y-1 border-t border-navy-50 bg-navy-50/60 px-5 py-2 sm:flex sm:px-7 sm:py-3">
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
//  ⚠ 단추 이름 아래에 「언제 누르는지」를 적습니다. 병원 직원은 「긴급」이
//    어느 정도여야 긴급인지 망설입니다.
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
    box: 'ring-rose-200 hover:bg-rose-50/60 hover:ring-rose-300',
    tile: 'bg-rose-600 text-white',
    arrow: 'text-rose-600',
  },
  teal: {
    box: 'ring-teal-200 hover:bg-teal-50/60 hover:ring-teal-300',
    tile: 'bg-teal-600 text-white',
    arrow: 'text-teal-700',
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
      className={`pressable group flex min-h-[5.5rem] w-full items-center gap-4 rounded-3xl bg-white px-5 py-4 text-left shadow-card ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 sm:min-h-[6.5rem] sm:px-6 ${t.box}`}
    >
      <span
        data-action-icon
        aria-hidden="true"
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${t.tile}`}
      >
        <Icon size={28} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-keep text-[1.3rem] font-extrabold leading-tight text-navy-900 sm:text-[1.4rem]">
          {a.label}
        </span>
        <span className="t-body mt-1 block break-keep leading-snug text-navy-600">{a.when}</span>
      </span>
      <ChevronRight
        size={24}
        strokeWidth={2.4}
        data-action-arrow
        aria-hidden="true"
        className={`shrink-0 transition-transform duration-200 group-hover:translate-x-1 ${t.arrow}`}
      />
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
      className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[1.05rem] font-bold text-navy-800 ring-1 ring-navy-200 transition hover:bg-navy-50 hover:ring-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
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
      <div className="grid grid-cols-2 gap-2.5">
        <SmallActionButton label="추가수거 요청" cta="collect" icon={Truck} onClick={onPickup} />
        <SmallActionButton label="문의하기" icon={MessageSquare} onClick={onAsk} />
      </div>
    </section>
  )
}
