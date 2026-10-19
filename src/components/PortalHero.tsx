import { CalendarCheck, Truck } from 'lucide-react'
import type { Client } from '../types'
import { icon3d } from '../lib/icons3d'
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

export function PortalHero({ client, s, lastPickup }: { client: Client; s: PortalSummary; lastPickup?: string | null }) {
  const t = today()
  const rel = s.nextDate ? daysFromToday(s.nextDate, t) : null
  const isToday = rel === '오늘'
  const isTomorrow = rel === '내일'
  const time = timeBand(s.nextTime)
  //  둘째 줄 — 시각 · 며칠 뒤 · 우리 병원 수거 주기 (등록된 값만)
  const cycle = client.collectionCycle ? `${client.collectionCycle} 정기수거` : null

  //  포털 4차 — 파란 머리 위에 겹쳐 올라앉는 **흰 카드**(흔한 생활 앱의 주문 추적 카드 자리).
  //  포털 3차 시안(적용) — 배달 앱처럼 **진행 단계**를 그립니다. 단계는 모두 실제 기록입니다:
  //    지난 수거(끝난 기록이 있으면 ✓) → 일정 확정(또는 「예상」) → 수거 → 처리장 인계.
  //  ⚠ 「기사 출발 · 도착 예정」 같은 실시간 단계는 아직 기록이 없어 그리지 않습니다.
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
            <p className="mt-1 break-keep text-[1.15rem] font-bold leading-snug text-navy-700 sm:text-[1.3rem]">
              {[time, rel && !isToday && !isTomorrow ? rel : null].filter(Boolean).join(' · ')}
              {/*  기관 구분 · 수거 주기 — 실제로 등록된 값만 (지어낸 기관코드 · 무사고일수 금지, check_portal83) */}
              {(client.type || cycle) && (
                <span className="font-semibold text-navy-500">
                  {time || (rel && !isToday && !isTomorrow) ? ' · ' : ''}
                  {client.type && <span data-hero-type>{client.type}</span>}
                  {client.type && cycle ? ' · ' : ''}
                  {cycle && <span data-hero-cycle>{cycle}</span>}
                </span>
              )}
            </p>
            {s.nextIsEstimate && (
              <p className="p-sub mt-2 break-keep">
                지난 수거일과 수거 주기로 계산한 날짜입니다. 일정이 확정되면 바로 바뀝니다.
              </p>
            )}
            <HeroTrack lastPickup={lastPickup ?? null} estimate={s.nextIsEstimate} />
          </>
        ) : (
          <>
            <p className="mt-2.5 break-keep text-[1.5rem] font-extrabold leading-snug text-navy-900">아직 정해진 일정이 없습니다</p>
            <p className="p-sub mt-1.5 break-keep">비원미래에서 일정을 잡으면 여기에 바로 표시됩니다.</p>
            <p className="p-sub mt-3 border-t border-navy-100 pt-3 break-keep">
              <span data-hero-type>{client.type || '기관 구분 미등록'}</span>
              {' · '}
              <span data-hero-cycle>{cycle ?? '수거 주기 미등록'}</span>
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/** 다음 수거까지의 단계 — 동그라미 + 잇는 선 (배달 앱의 주문 추적 모양)
 *  대표님이 만들어 주신 입체 그림 4개를 씁니다. 아직 안 온 단계는 그림을 옅게(흑백 쪽으로) 둡니다. */
function HeroTrack({ lastPickup, estimate }: { lastPickup: string | null; estimate: boolean }) {
  const steps: { key: string; label: string; img: string; state: 'done' | 'now' | 'todo' }[] = [
    { key: 'last', label: '지난 수거', img: 'portal:step-last', state: lastPickup ? 'done' : 'todo' },
    { key: 'plan', label: estimate ? '예상' : '일정 확정', img: 'portal:step-plan', state: 'now' },
    { key: 'pick', label: '수거', img: 'portal:step-pick', state: 'todo' },
    { key: 'hand', label: '처리장 인계', img: 'portal:step-hand', state: 'todo' },
  ]
  return (
    <ol data-hero-track aria-label={`다음 수거 진행 — ${estimate ? '예상 날짜' : '일정 확정'}`} className="mt-4 grid grid-cols-4">
      {steps.map((x, i) => (
        <li key={x.key} data-track-step={x.key} data-track-state={x.state} className="relative flex flex-col items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute -left-1/2 right-1/2 top-[1.3rem] h-1 -translate-y-1/2 ${x.state === 'todo' ? 'bg-navy-100' : 'bg-teal-600'}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative z-[1] flex h-[2.6rem] w-[2.6rem] items-center justify-center rounded-full ${
              x.state === 'done'
                ? 'bg-teal-50 ring-2 ring-teal-600'
                : x.state === 'now'
                  ? estimate
                    ? 'border-2 border-dashed border-teal-500 bg-white'
                    : 'bg-white ring-2 ring-teal-600 outline outline-4 outline-teal-100'
                  : 'bg-navy-50'
            }`}
          >
            <img
              src={icon3d(x.img)}
              alt=""
              width={192}
              height={192}
              decoding="async"
              draggable={false}
              className={`h-[1.85rem] w-[1.85rem] select-none object-contain ${x.state === 'todo' ? 'opacity-50 grayscale-[0.6]' : ''}`}
            />
          </span>
          <span className={`break-keep text-center text-[0.9rem] font-semibold ${x.state === 'now' ? 'font-extrabold text-teal-700' : 'text-navy-500'}`}>
            {x.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 빠른 메뉴 — 아이콘 여덟 칸 한 판 (포털 3차 시안 · 대표님 「맘에 든다 · 실제로 적용」)
//
//  예전에는 큰 단추 둘(긴급수거 · 자재·용기) + 작은 넷이었습니다. 흔한 생활 앱처럼
//  같은 크기 여덟 칸으로 모읍니다. 급한 일(긴급수거)이 **맨 앞 · 빨강**입니다.
//  ⚠ 모두 **지금 있는 기능**으로만 갑니다 — 없는 화면을 칸으로 만들지 않습니다.
//  ⚠ 색만으로 가르지 않습니다 — 아이콘 · 이름이 칸마다 다릅니다.
// ─────────────────────────────────────────────────────────────────────────────

//  칸 색 이름 — 입체 그림이 들어오면서 색 네모는 그리지 않지만, 칸마다 어느 색 무리인지는
//  그대로 적어 둡니다(data-card-tone). 그림 자체가 그 색입니다(긴급 = 빨강, 자재 = 노랑 상자).
const TILE_TONE = ['rose', 'blue', 'orange', 'green', 'violet', 'gray'] as const

function GridTile({
  label,
  short,
  cta,
  img,
  tone,
  onClick,
}: {
  /** 화면 읽기 · 검사가 읽는 온전한 이름 */
  label: string
  /** 칸에 적는 짧은 이름 */
  short: string
  cta?: string
  /** 입체 그림 이름 (icons3d 의 portal:…) */
  img: string
  tone: (typeof TILE_TONE)[number]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-portal-action={label}
      data-portal-cta={cta}
      data-card-tone={tone}
      aria-label={label}
      onClick={onClick}
      className="p-tile group !px-0"
    >
      {/*  대표님: 「글자 크기와 그림 비율을 AX 화면에 맞춰」 — AX 홈 8칸은 그림 2rem : 이름 0.86rem.
           여기 이름은 0.95rem 이라 같은 비율로 그림 2.2rem. 색 네모는 씌우지 않습니다(그림이 이미 입체). */}
      <span
        aria-hidden="true"
        data-action-icon
        className="flex h-[2.2rem] w-[2.2rem] items-center justify-center transition-transform duration-200 group-hover:scale-105"
      >
        <img
          src={icon3d(img)}
          alt=""
          width={192}
          height={192}
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-contain drop-shadow-[0_2px_3px_rgba(15,26,46,0.12)]"
        />
      </span>
      <span aria-hidden="true" className="whitespace-nowrap tracking-[-0.01em]">{short}</span>
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
  onBilling,
  onHistory,
}: {
  onUrgent: () => void
  onSupply: () => void
  onPickup: () => void
  onAsk: () => void
  onReport?: () => void
  onDocs?: () => void
  onBilling?: () => void
  onHistory?: () => void
}) {
  return (
    <section aria-label="빠른 메뉴" data-portal-actions data-tour="portal-request">
      <div data-portal-grid className="p-card grid grid-cols-4 gap-x-1 gap-y-3 px-1.5 py-4 sm:px-3">
        <GridTile label="긴급수거 요청" short="긴급수거" cta="urgent" img="portal:urgent" tone="rose" onClick={onUrgent} />
        <GridTile label="추가수거 요청" short="추가수거" cta="collect" img="portal:pickup" tone="blue" onClick={onPickup} />
        <GridTile label="자재·용기 요청" short="자재·용기" cta="supplies" img="portal:supplies" tone="orange" onClick={onSupply} />
        {onBilling && <GridTile label="정산·청구" short="정산·청구" img="portal:billing" tone="green" onClick={onBilling} />}
        {onReport && <GridTile label="배출 리포트" short="배출 리포트" img="portal:report" tone="violet" onClick={onReport} />}
        {onHistory && <GridTile label="수거 이력" short="수거 이력" img="portal:history" tone="blue" onClick={onHistory} />}
        {onDocs && <GridTile label="증빙자료" short="증빙자료" img="portal:docs" tone="green" onClick={onDocs} />}
        <GridTile label="문의하기" short="문의하기" img="portal:ask" tone="gray" onClick={onAsk} />
      </div>
    </section>
  )
}
