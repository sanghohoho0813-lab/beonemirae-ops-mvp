import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, CalendarCheck, Check, CheckCircle2, ChevronRight, Clock3, Inbox, LogIn, MessageSquare, PackagePlus, Phone,
  RotateCw, Siren, Truck, type LucideIcon,
} from 'lucide-react'
import type { RequestItem } from '../../lib/ops'
import { today } from '../../lib/format'
import {
  PORTAL_STEPS, friendlyWhen, portalKindLabel, portalStatusLabel, portalStepIndex,
} from '../../lib/portalLabels'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면 공용 조각 — 상태 칩 · 진행 단계 · 요청 한 줄 · 섹션 머리
//
//  ⚠ 같은 것을 화면마다 따로 그리면 어느 화면은 「일정 반영」, 어느 화면은
//    「일정 확정」이 됩니다. 상태를 그리는 곳은 여기 한 군데입니다.
//
//  포털 3차 — 색을 넷으로 묶었습니다. 같은 상태는 어디서나 같은 색입니다.
//    접수 = 회색(아직 아무도 안 봄) · 확인 중 · 일정 확정 = 파랑(진행) ·
//    처리 완료 = 초록. 하늘색 · 호박색 · 보라색은 더 쓰지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LOOK: Record<string, { cls: string; icon: LucideIcon }> = {
  접수: { cls: 'bg-navy-100 text-navy-800', icon: Inbox },
  '확인 중': { cls: 'bg-teal-50 text-teal-800', icon: Clock3 },
  '일정 반영': { cls: 'bg-teal-100 text-teal-900', icon: CalendarCheck },
  '처리 완료': { cls: 'bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
}

/** 처리 상태 — 아이콘 + 글자. 색만으로 말하지 않습니다 */
export function StatusChip({ status }: { status: string }) {
  const look = STATUS_LOOK[status] ?? STATUS_LOOK['접수']
  const Icon = look.icon
  return (
    <span data-status-chip={portalStatusLabel(status)} className={`pill ${look.cls}`}>
      <Icon size={15} strokeWidth={2.6} aria-hidden="true" />
      {portalStatusLabel(status)}
    </span>
  )
}

/**
 * 접수 → 확인 중 → 일정 확정 → 처리 완료 — 가로 한 줄 (접수 완료 화면용).
 *  화면 읽기 프로그램에는 「4단계 중 2단계 확인 중」으로 읽힙니다.
 */
export function StatusSteps({ status }: { status: string }) {
  const at = portalStepIndex(status)
  return (
    <ol
      data-status-steps
      aria-label={`${PORTAL_STEPS.length}단계 중 ${at + 1}단계 ${portalStatusLabel(status)}`}
      className="grid grid-cols-4 gap-1"
    >
      {PORTAL_STEPS.map((x, i) => {
        const now = i === at
        return (
          <li key={x.status} aria-current={now ? 'step' : undefined} className="min-w-0">
            <span aria-hidden="true" className={`block h-1.5 rounded-full ${i <= at ? 'bg-teal-500' : 'bg-navy-100'}`} />
            <span
              className={`mt-1.5 block break-keep text-[0.95rem] leading-tight ${
                now ? 'font-extrabold text-navy-900' : i < at ? 'font-bold text-navy-700' : 'font-medium text-navy-500'
              }`}
            >
              {x.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 같은 단계 — **세로** (요청 상세용, 포털 3차).
 *  지난 단계 = 체크(완료) · 지금 단계 = 굵게 + 「지금」 · 다음 단계 = 흐리게.
 */
export function StatusTimeline({ status }: { status: string }) {
  const at = portalStepIndex(status)
  return (
    <ol
      data-status-steps
      aria-label={`${PORTAL_STEPS.length}단계 중 ${at + 1}단계 ${portalStatusLabel(status)}`}
    >
      {PORTAL_STEPS.map((x, i) => {
        const done = i < at
        const now = i === at
        const last = i === PORTAL_STEPS.length - 1
        return (
          <li key={x.status} aria-current={now ? 'step' : undefined} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-[15px] top-9 w-0.5 rounded-full ${i < at ? 'bg-teal-500' : 'bg-navy-100'}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-black ${
                done
                  ? 'bg-teal-600 text-white'
                  : now
                    ? 'bg-white text-teal-700 ring-[3px] ring-teal-600'
                    : 'bg-navy-100 text-navy-500'
              }`}
            >
              {done ? <Check size={17} strokeWidth={3.2} /> : i + 1}
            </span>
            <span className="min-w-0 pt-1">
              <span
                className={`block break-keep text-[1.08rem] leading-snug ${
                  now ? 'font-extrabold text-navy-900' : done ? 'font-bold text-navy-700' : 'font-medium text-navy-500'
                }`}
              >
                {x.label}
                {now && <span className="ml-2 text-[0.95rem] font-extrabold text-teal-700">지금</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 요청 종류 아이콘 — 긴급만 빨강, 나머지는 같은 회색 (색을 늘리지 않습니다) */
const KIND_ICON: Record<string, LucideIcon> = {
  긴급수거: Siren,
  추가수거: Truck,
  소모품: PackagePlus,
  '교육·자료': BookOpen,
  기타: MessageSquare,
}

/** 요청 종류 → 아이콘 (요청 상세 창 머리에도 같은 것을 씁니다) */
export function kindIcon(type: string): LucideIcon {
  return KIND_ICON[type] ?? MessageSquare
}

export function KindIcon({ type, size = 'md' }: { type: string; size?: 'md' | 'lg' }) {
  const Icon = KIND_ICON[type] ?? MessageSquare
  const urgent = type === '긴급수거'
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${size === 'lg' ? 'h-11 w-11' : 'h-10 w-10'} ${
        urgent ? 'bg-rose-50 text-rose-600' : 'bg-navy-50 text-navy-600'
      }`}
    >
      <Icon size={size === 'lg' ? 22 : 20} strokeWidth={2.3} />
    </span>
  )
}

/**
 * 요청 한 줄 — 활동 목록 (포털 3차).
 *
 *  [아이콘] 긴급수거 요청            [접수] ›
 *           오늘 10:49 · 전화 접수
 *
 *  ⚠ 목록에는 **지금 상태 칩만**. 접수 → 처리 완료 전체 단계는 누르면 열리는
 *    요청 상세에서만 보여 줍니다(카드마다 막대를 그리면 목록이 무거워집니다).
 *  preview — 요청 내역 화면에서는 보낸 내용 첫 줄을 한 줄 덧붙입니다.
 */
export function FeedRow({ r, onOpen, preview = false }: { r: RequestItem; onOpen: () => void; preview?: boolean }) {
  return (
    <li data-req-row={r.id}>
      <button
        type="button"
        data-req-open={r.id}
        onClick={onOpen}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-3.5 text-left transition hover:bg-navy-50 focus-visible:bg-navy-50 focus-visible:outline-none"
      >
        <KindIcon type={r.type} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="p-body font-extrabold">{portalKindLabel(r.type)}</span>
            {/*  ⚠ 「긴급수거 요청」은 이름에 이미 긴급이 들어 있습니다. */}
            {r.urgent && r.type !== '긴급수거' && <span className="pill bg-rose-50 text-rose-700">급함</span>}
          </span>
          <span className="p-sub mt-0.5 flex flex-wrap items-center gap-x-2 tabular-nums">
            <span>{friendlyWhen(r.when, today())}</span>
            {/*  ⚠ 전화로 말씀하신 것도 여기 같이 보입니다 — 앱으로만 하시라는
                 뜻이 아니라, 어떻게 요청하셨든 진행 상태는 여기서 보실 수 있다는 뜻. */}
            {r.source === 'staff' && (
              <span className="inline-flex items-center gap-1">
                <Phone size={14} strokeWidth={2.5} aria-hidden="true" /> 전화 접수
              </span>
            )}
          </span>
          {preview && r.content && (
            <span className="p-sub mt-0.5 block truncate text-navy-700">{r.content.split('\n')[0]}</span>
          )}
        </span>
        <StatusChip status={r.status} />
        <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" className="shrink-0 text-navy-400" />
      </button>
    </li>
  )
}

/** 섹션 머리 — 칸(카드)이 아니라 **제목 한 줄**로 나눕니다 */
export function SectionHead({
  title,
  more,
}: {
  title: string
  more?: { label: string; onClick: () => void; data?: string }
}) {
  return (
    <div className="flex min-h-[2.75rem] items-center justify-between gap-3">
      <h2 className="p-title">{title}</h2>
      {more && (
        <button
          type="button"
          data-card-more={more.data}
          onClick={more.onClick}
          className="-mr-2 flex min-h-[2.75rem] shrink-0 items-center gap-0.5 rounded-xl px-2 text-[1.02rem] font-bold text-teal-700 transition hover:bg-teal-50"
        >
          {more.label}
          <ChevronRight size={17} strokeWidth={2.6} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/**
 * 목록이 비었을 때 (화면 하나 전체) — 상자 없이 가운데 아이콘 · 제목 · 다음 할 일.
 *  ⚠ 「없다」만 말하고 끝내지 않습니다. 무엇을 하면 채워지는지 함께 적습니다.
 */
export function PortalEmpty({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div data-portal-empty className="flex flex-col items-center px-4 py-10 text-center">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-50 text-navy-500">
        <Icon size={26} strokeWidth={2.2} />
      </span>
      <p className="p-body mt-3.5 break-keep font-extrabold">{title}</p>
      {subtitle && <p className="p-sub mt-1 max-w-md break-keep">{subtitle}</p>}
    </div>
  )
}

/** 비어 있을 때 — 조용히 한 줄 */
export function QuietEmpty({ children }: { children: ReactNode }) {
  return <p className="p-sub py-4">{children}</p>
}

/**
 * 저장 실패 — 「무엇이 안 됐는지 · 고른 것은 남아 있는지 · 무엇을 누르면 되는지」.
 *
 *  ⚠ 로그인이 만료된 경우는 「잠시 후 다시 시도」가 답이 아닙니다. 몇 번을
 *    눌러도 안 됩니다. 그때만 「다시 로그인」을 드립니다.
 */
export function SaveError({
  detail,
  onRetry,
  busy,
  kept,
  data,
}: {
  /** 서버가 준 까닭 (lib/supabase friendlyError) — 없으면 빈 글 */
  detail: string
  onRetry: () => void
  busy: boolean
  /** 「고르신 것은 그대로 있습니다」 */
  kept: string
  /** 검사가 찾는 표시 */
  data: string
}) {
  const expired = /만료/.test(detail)
  return (
    <div {...{ [data]: '' }} role="alert" className="mb-4 rounded-[14px] bg-rose-50 px-4 py-3.5 ring-1 ring-rose-100">
      <p className="t-body break-keep font-bold text-rose-700">
        {expired ? '로그인이 만료되어 저장하지 못했습니다.' : '요청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.'}
      </p>
      <p className="t-muted mt-1 break-keep">
        {kept}
        {detail && !expired ? ` (${detail})` : ''}
      </p>
      {expired ? (
        <Link
          to="/login"
          className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-white px-4 text-[1.02rem] font-extrabold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
        >
          <LogIn size={17} strokeWidth={2.5} aria-hidden="true" /> 다시 로그인
        </Link>
      ) : (
        <button
          type="button"
          data-save-retry
          onClick={onRetry}
          disabled={busy}
          className="mt-2.5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-xl bg-white px-4 text-[1.02rem] font-extrabold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
        >
          <RotateCw size={17} strokeWidth={2.5} aria-hidden="true" /> 다시 시도
        </button>
      )}
    </div>
  )
}
