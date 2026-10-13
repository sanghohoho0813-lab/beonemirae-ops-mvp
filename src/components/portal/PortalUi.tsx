import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CheckCircle2, ChevronRight, Clock3, Inbox, LogIn, Phone, RotateCw, type LucideIcon } from 'lucide-react'
import type { RequestItem } from '../../lib/ops'
import { prettyDate } from '../../lib/format'
import {
  PORTAL_STEPS, portalKindLabel, portalStatusLabel, portalStepIndex, shortDateTime,
} from '../../lib/portalLabels'

// ─────────────────────────────────────────────────────────────────────────────
// 병원 화면 공용 조각 — 상태 칩 · 진행 단계 · 요청 한 줄 · 카드 머리
//
//  ⚠ 같은 것을 화면마다 따로 그리면 어느 화면은 「일정 반영」, 어느 화면은
//    「일정 확정」이 됩니다. 병원은 그 둘이 같은 말인지 모릅니다.
//    상태를 그리는 곳은 여기 한 군데입니다.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LOOK: Record<string, { cls: string; icon: LucideIcon }> = {
  접수: { cls: 'bg-sky-50 text-sky-800 ring-sky-100', icon: Inbox },
  '확인 중': { cls: 'bg-amber-50 text-amber-800 ring-amber-100', icon: Clock3 },
  '일정 반영': { cls: 'bg-blue-50 text-blue-800 ring-blue-100', icon: CalendarCheck },
  '처리 완료': { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-100', icon: CheckCircle2 },
}

/** 처리 상태 — 아이콘 + 글자. 색만으로 말하지 않습니다 */
export function StatusChip({ status }: { status: string }) {
  const look = STATUS_LOOK[status] ?? STATUS_LOOK['접수']
  const Icon = look.icon
  return (
    <span data-status-chip={portalStatusLabel(status)} className={`pill ring-1 ${look.cls}`}>
      <Icon size={15} strokeWidth={2.6} aria-hidden="true" />
      {portalStatusLabel(status)}
    </span>
  )
}

/**
 * 접수 → 확인 중 → 일정 확정 → 처리 완료.
 *
 *  ⚠ 「지금 어디까지 왔나」를 한 줄로 보여 줍니다. 지난 단계는 체크, 지금
 *    단계는 굵게. 화면 읽기 프로그램에는 「4단계 중 2단계 확인 중」으로 읽힙니다.
 */
export function StatusSteps({ status }: { status: string }) {
  const at = portalStepIndex(status)
  return (
    <ol
      data-status-steps
      aria-label={`${PORTAL_STEPS.length}단계 중 ${at + 1}단계 ${portalStatusLabel(status)}`}
      className="grid grid-cols-4 gap-1"
    >
      {PORTAL_STEPS.map((s, i) => {
        const done = i < at
        const now = i === at
        return (
          <li key={s.status} aria-current={now ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full ${i <= at ? 'bg-teal-500' : 'bg-navy-100'}`}
            />
            <span
              className={`mt-1.5 block break-keep text-[0.95rem] leading-tight ${
                now ? 'font-extrabold text-navy-900' : done ? 'font-bold text-navy-600' : 'font-medium text-navy-500'
              }`}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 요청 한 건.
 *
 *  compact — 홈 「최근 요청」: 무엇을 · 언제 · 지금 상태 세 가지만.
 *  full    — 「요청 내역」: 보낸 내용 · 희망일 · 진행 단계 · 비원미래 회신까지.
 */
export function RequestRow({ r, compact = false }: { r: RequestItem; compact?: boolean }) {
  return (
    <li data-req-row={r.id} className={compact ? 'px-5 py-4' : 'px-5 py-5'}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="t-body min-w-0 break-keep font-extrabold text-navy-900">{portalKindLabel(r.type)}</span>
        {/*  ⚠ 「긴급수거 요청」은 이름에 이미 긴급이 들어 있습니다. 같은 말을
             두 번 달지 않습니다. 다른 요청인데 급하다고 표시하신 것만 답니다. */}
        {r.urgent && r.type !== '긴급수거' && (
          <span className="pill bg-rose-50 text-rose-700 ring-1 ring-rose-100">급함</span>
        )}
        <span className="ml-auto">
          <StatusChip status={r.status} />
        </span>
      </div>
      <p className="t-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
        <span>{shortDateTime(r.when)} 요청</span>
        {/*  ⚠ 전화로 말씀하신 것도 여기 같이 보입니다 — 앱으로만 하시라는
             뜻이 아니라, 어떻게 요청하셨든 진행 상태는 여기서 보실 수 있다는
             뜻입니다. */}
        {r.source === 'staff' && (
          <span className="inline-flex items-center gap-1">
            <Phone size={14} strokeWidth={2.5} aria-hidden="true" /> 전화 접수
          </span>
        )}
      </p>

      {!compact && (
        <>
          <p className="t-body mt-3 whitespace-pre-line break-keep leading-snug text-navy-700">{r.content}</p>
          {(r.desiredDate || r.wasteType || r.expectedKg != null) && (
            <p data-req-detail={r.id} className="t-muted mt-1.5 break-keep">
              {[
                r.desiredDate ? `희망일 ${prettyDate(r.desiredDate)}` : null,
                r.wasteType,
                r.expectedKg != null ? `예상 ${r.expectedKg}kg` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="mt-4">
            <StatusSteps status={r.status} />
          </div>
          {r.reply && (
            <p className="t-body mt-4 break-keep rounded-2xl bg-sky-50 px-4 py-3 leading-snug text-sky-900">
              <b className="font-extrabold">비원미래 회신</b> · {r.reply}
            </p>
          )}
        </>
      )}
    </li>
  )
}

/** 카드 머리 — 제목 + 오른쪽 「전체 보기」 */
export function CardHead({
  title,
  icon: Icon,
  more,
}: {
  title: string
  icon: LucideIcon
  more?: { label: string; onClick: () => void; data?: string }
}) {
  return (
    <div className="flex items-center gap-3 border-b border-navy-50 px-5 py-3.5">
      <Icon size={20} strokeWidth={2.4} className="shrink-0 text-navy-500" aria-hidden="true" />
      <h2 className="t-body min-w-0 flex-1 break-keep font-extrabold text-navy-900">{title}</h2>
      {more && (
        <button
          type="button"
          data-card-more={more.data}
          onClick={more.onClick}
          className="-mr-2 flex min-h-[2.75rem] shrink-0 items-center gap-1 rounded-xl px-2.5 text-[1rem] font-bold text-teal-700 transition hover:bg-teal-50"
        >
          {more.label}
          <ChevronRight size={17} strokeWidth={2.6} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** 비어 있을 때 — 조용히 한 줄 */
export function QuietEmpty({ children }: { children: ReactNode }) {
  return <p className="t-body break-keep px-5 py-5 leading-snug text-navy-500">{children}</p>
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
    <div {...{ [data]: '' }} role="alert" className="mb-4 rounded-2xl bg-rose-50 px-4 py-3.5 ring-1 ring-rose-100">
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
