import { Building2, CalendarClock, ChevronRight, Recycle, type LucideIcon } from 'lucide-react'
import type { Client } from '../types'
import type { PortalSummary } from '../lib/portal'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 포털 머리 — 「어디에 로그인했는지」와 「다음에 언제 오는지」 (0083)
//
//  대표님이 주신 시안의 짙은 남색 머리 칸을 그대로 따릅니다.
//
//  ⚠ 시안에는 「기관 코드 BWM-2024-0001」·「안전 무사고 1,248일째 유지 중」이
//    적혀 있습니다. **둘 다 저희 서버에 없는 값입니다.** 그럴듯하게 만들어
//    넣으면 병원 담당자가 그 숫자를 믿게 되고, 그건 지어낸 숫자입니다.
//    대신 **실제로 가지고 있는 사실**을 같은 자리에 넣습니다 —
//    수거주기와 다음 수거일입니다.
//
//  ⚠ 「다음 수거」가 **확정인지 예상인지** 반드시 구분해 적습니다. 수거주기로
//    계산한 값을 확정처럼 보이게 두면, 병원은 그날 사람을 대기시켜 놓고
//    헛수고를 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalHero({ client, s }: { client: Client; s: PortalSummary }) {
  return (
    <section
      data-portal-hero
      className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-800 to-navy-950 px-5 py-5 text-white shadow-lg sm:px-7 sm:py-8"
    >
      {/*  ⚠ 폰에서는 접습니다 — 머리띠에 이미 「고객 포털」이라고 적혀
           있습니다. 병원 이름이 긴 곳(「의료법인 한마음의료재단 …」)에서는
           이 한 줄 때문에 정작 「수거 요청」이 화면 밖으로 밀립니다. */}
      <p className="hidden break-keep font-bold text-teal-300 sm:block sm:t-body">(주)비원미래 고객 포털</p>
      {/*  ⚠ 이름은 **줄이지 않습니다.** 등록된 이름을 저희가 줄여 부를 일이
           아닙니다. 대신 폰에서 글자를 조금 작게 하여 줄 수를 줄입니다. */}
      <h1 className="break-keep text-[1.45rem] font-extrabold leading-tight tracking-tight sm:mt-1.5 sm:text-[2.1rem]">
        {client.name}님, 환영합니다
      </h1>
      {/*  ⚠ 폰에서는 감춥니다 — 이 한 줄이 머리 칸을 키워서 정작 「수거
           요청」을 화면 밖으로 밀어냅니다. 인사말보다 누를 것이 먼저입니다. */}
      <p className="t-body mt-2 hidden break-keep text-navy-200 sm:block">
        안전하고 투명한 의료폐기물 관리, (주)비원미래가 함께합니다.
      </p>

      <div className="mt-3.5 flex flex-wrap gap-2 sm:mt-5 sm:gap-2.5">
        {/*  ⚠ 지어낸 코드 대신 **실제로 아는 것**을 답니다. */}
        <span className="inline-flex min-w-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 sm:gap-2.5 sm:px-3.5 sm:py-2.5">
          <Building2 size={18} strokeWidth={2.3} className="shrink-0 text-teal-300" />
          <span className="min-w-0 sm:leading-tight">
            <span className="hidden break-keep text-[0.95rem] font-semibold text-navy-200 sm:block">기관 구분</span>
            <span data-hero-type className="block break-keep font-extrabold">
              {client.type || '미설정'}
            </span>
          </span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 sm:gap-2.5 sm:px-3.5 sm:py-2.5">
          <Recycle size={18} strokeWidth={2.3} className="shrink-0 text-teal-300" />
          <span className="min-w-0 sm:leading-tight">
            <span className="hidden break-keep text-[0.95rem] font-semibold text-navy-200 sm:block">수거 주기</span>
            <span data-hero-cycle className="block break-keep font-extrabold">
              {client.collectionCycle || '미설정'}
            </span>
          </span>
        </span>
      </div>

      {/*  다음 수거 — 이 화면에서 제일 많이 확인하는 한 줄입니다. */}
      <div
        data-hero-next
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-white/10 px-4 py-3 sm:mt-4 sm:py-3.5"
      >
        <CalendarClock size={20} strokeWidth={2.4} className="shrink-0 text-teal-300" />
        <span className="t-body min-w-0 break-keep font-extrabold">
          다음 수거 {s.nextDate ? prettyDate(s.nextDate) : '예정 없음'}
          {s.nextTime && ` ${s.nextTime}`}
        </span>
        {s.nextIsEstimate && (
          //  ⚠ 확정이 아니라는 말을 **눈에 띄게** 답니다.
          <span data-hero-estimate className="rounded-full bg-amber-100 px-3 py-1 text-[0.95rem] font-extrabold text-amber-800">
            수거주기로 본 예상
          </span>
        )}
        {s.nextDate && !s.nextIsEstimate && (
          <span className="rounded-full bg-teal-500 px-3 py-1 text-[0.95rem] font-extrabold text-white">
            일정 확정
          </span>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 번호가 붙은 큰 칸 — 시안의 01 · 02 · 03 … 카드
//
//  ⚠ **누르면 실제로 되는 것만** 답니다. 대표님: 「작동하지 않는 버튼 생성
//    금지 · 의미 없는 Coming Soon 남발 금지」.
//
//  ⚠ 0089 — 카드마다 **아주 옅은** 색을 다르게 둡니다. 대표님: 「카드 전체를
//    강한 색으로 칠하지 않는다 … 아이콘 배경 / 카드 상단 라인 / 아주 약한
//    background tint / badge / CTA arrow 정도만」.
//    여덟 장이 전부 같은 흰 칸이면 눈이 어디에 멈출 곳을 못 찾습니다.
//    그렇다고 여덟 가지 색을 칠하면 그건 그냥 어지러운 화면입니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 카드 색 — 아이콘 자리와 위 선에만 씁니다 */
export type CardTone = 'teal' | 'rose' | 'cyan' | 'blue' | 'violet' | 'emerald' | 'sky' | 'aqua'

const TONE: Record<CardTone, { tile: string; line: string; arrow: string }> = {
  teal: { tile: 'bg-teal-50 text-teal-700', line: 'bg-teal-400', arrow: 'text-teal-700' },
  rose: { tile: 'bg-rose-50 text-rose-600', line: 'bg-rose-400', arrow: 'text-rose-600' },
  cyan: { tile: 'bg-cyan-50 text-cyan-700', line: 'bg-cyan-400', arrow: 'text-cyan-700' },
  blue: { tile: 'bg-blue-50 text-blue-700', line: 'bg-blue-400', arrow: 'text-blue-700' },
  violet: { tile: 'bg-violet-50 text-violet-700', line: 'bg-violet-400', arrow: 'text-violet-700' },
  emerald: { tile: 'bg-emerald-50 text-emerald-700', line: 'bg-emerald-400', arrow: 'text-emerald-700' },
  sky: { tile: 'bg-sky-50 text-sky-700', line: 'bg-sky-400', arrow: 'text-sky-700' },
  aqua: { tile: 'bg-teal-100 text-teal-800', line: 'bg-teal-500', arrow: 'text-teal-800' },
}

export interface PortalAction {
  no: string
  label: string
  desc: string
  icon: LucideIcon
  tone: CardTone
  /** 지금 상태 — 있는 값만. 없으면 안 적습니다 */
  value?: string
  onClick: () => void
  /**
   * 예전 큰 단추의 표시 (0083). 검사와 안내가 이 이름으로 이 자리를
   * 찾습니다 — 단추를 카드로 합치면서 표시도 같이 옮겼습니다.
   */
  cta?: string
}

export function PortalActionCard({ a }: { a: PortalAction }) {
  const Icon = a.icon
  const t = TONE[a.tone]
  return (
    <button
      data-portal-action={a.label}
      data-portal-cta={a.cta}
      data-card-tone={a.tone}
      onClick={a.onClick}
      className="card pressable relative flex min-h-[9rem] w-full flex-col overflow-hidden p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[11.5rem] sm:p-5"
    >
      {/*  카드마다 다른 것은 이 **한 줄**과 아이콘 자리뿐입니다 */}
      <span className={`absolute inset-x-0 top-0 h-1 ${t.line}`} />
      <span className="flex items-center gap-2.5">
        <span className="text-[1.05rem] font-black tabular-nums text-navy-400">{a.no}</span>
        <span className="t-card min-w-0 break-keep text-navy-900">{a.label}</span>
      </span>
      <span className="mt-2.5 flex flex-col items-start gap-2 sm:mt-3 sm:flex-row sm:gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${t.tile}`}>
          <Icon size={23} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          {a.value && (
            <span data-action-value className="block break-keep text-[1.25rem] font-extrabold leading-tight text-navy-900">
              {a.value}
            </span>
          )}
          <span className="t-muted mt-0.5 line-clamp-2 block break-keep leading-snug sm:line-clamp-none">
            {a.desc}
          </span>
        </span>
      </span>
      <span className="mt-3.5 hidden items-center justify-between border-t border-navy-100 pt-3 sm:flex">
        <span className={`t-btn break-keep ${t.arrow}`}>바로 하기</span>
        <ChevronRight size={19} className={`shrink-0 ${t.arrow}`} />
      </span>
    </button>
  )
}
