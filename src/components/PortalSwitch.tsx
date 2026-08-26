import { ArrowUpRight, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess, PORTAL_PREFIX } from '../lib/access'
import { portalPath } from '../lib/portalClient'

// ─────────────────────────────────────────────────────────────────────────────
// 내부 화면 → 고객 화면으로 넘어가는 단추 (0083)
//
//  대표님: 「기존 내부 AX 화면에서 고객용 화면으로 넘어가는 버튼 예쁘고
//  눈에 띄게 만들어주고」
//
//  ── 여기서 지키는 것 ──────────────────────────────────────────────────────
//
//  ⚠ **열리는 사람에게만 보입니다.** 병원 포털은 admin 만 열 수 있습니다
//    (access.ts). 사무실·현장에게 보여 놓고 누르면 「접근 권한이 없는
//    화면입니다」가 뜨는 것이 제일 나쁜 단추입니다.
//
//  ⚠ 「보고 있는 화면이 바뀐다」는 것을 분명히 적습니다. 같은 앱 안에서
//    전혀 다른 화면으로 가는 것이라, 갑자기 바뀌면 길을 잃습니다.
//    그래서 「병원이 보는 화면」이라고 그대로 적습니다.
//
//  ⚠ 저장·배차확정 같은 **업무 단추보다 튀지 않게** 둡니다. 이건 매일
//    누르는 것이 아니라 확인용입니다. 그래서 채우지 않고 테두리로 둡니다.
// ─────────────────────────────────────────────────────────────────────────────

export function PortalSwitchButton({
  className = '',
  compact = false,
  clientId,
  label,
}: {
  className?: string
  /**
   * 어느 병원 화면을 열 것인가 (0085).
   *
   *  ⚠ 안 주면 「어느 병원을 보시겠습니까」 고르는 화면으로 갑니다.
   *    예전에는 목록의 **첫 병원**이 열렸습니다 — 대표님은 그것을 지금
   *    보려던 병원으로 읽으십니다.
   */
  clientId?: string
  /** 단추에 적을 말 (거래처 화면에서는 「이 병원 화면 미리보기」) */
  label?: string
  /**
   * 한 줄짜리 (0084).
   *
   *  ⚠ 폰에서 쓰려고 만들었습니다. 원래 모양은 세로 두 줄이라 74px 인데,
   *    그만큼 오늘 할 일이 아래로 밀립니다. 한 줄로 줄이면 48px 입니다.
   *    **없애거나 저 아래로 숨기지 않고** 크기를 줄이는 쪽을 골랐습니다 —
   *    y=1,458px(2화면 아래)에 있는 단추는 있으나 마나입니다.
   */
  compact?: boolean
}) {
  const { role, mode } = useAuth()
  //  시연 모드에는 역할이 없습니다 — 그때는 보여 줍니다(시연에서 보여 드리는
  //  핵심 중 하나입니다). 운영 모드에서는 실제로 열리는 사람에게만.
  const allowed = mode !== 'live' || canAccess(role, PORTAL_PREFIX)
  if (!allowed) return null
  //  ⚠ 0088 — 병원 id 는 **경로 안**에 넣습니다(/portal/c/<id>).
  //    예전의 `?client=` 는 메뉴를 한 번 누르면 떨어져 나갔습니다.
  const to = portalPath(clientId ?? null)

  if (compact) {
    return (
      <Link
        data-portal-switch
        to={to}
        aria-label={label ?? '병원이 보는 화면 열기'}
        className={`group flex min-h-[2.75rem] shrink-0 items-center gap-1.5 rounded-2xl border-2 border-teal-500 bg-teal-50 px-2.5 transition active:bg-teal-500 ${className}`}
      >
        <Building2 size={17} strokeWidth={2.6} className="shrink-0 text-teal-700 group-active:text-white" />
        <span className="whitespace-nowrap text-[1rem] font-extrabold text-teal-800 group-active:text-white">
          {label ?? '병원 화면'}
        </span>
        <ArrowUpRight size={15} strokeWidth={2.8} className="shrink-0 text-teal-700 group-active:text-white" />
      </Link>
    )
  }

  return (
    <Link
      data-portal-switch
      to={to}
      className={`group inline-flex min-h-[3rem] items-center gap-2.5 rounded-2xl border-2 border-teal-500 bg-teal-50 px-4 py-2.5 transition hover:bg-teal-500 ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white transition group-hover:bg-white group-hover:text-teal-700">
        <Building2 size={18} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="t-btn block break-keep text-teal-800 transition group-hover:text-white">
          {label ?? '병원이 보는 화면'}
        </span>
        <span className="block break-keep text-[0.95rem] font-bold text-teal-700 transition group-hover:text-white/90">
          고객 포털 열기
        </span>
      </span>
      <ArrowUpRight
        size={19}
        strokeWidth={2.6}
        className="shrink-0 text-teal-700 transition group-hover:text-white"
      />
    </Link>
  )
}
