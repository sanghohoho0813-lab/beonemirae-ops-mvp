import { ArrowUpRight, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess, PORTAL_PREFIX } from '../lib/access'

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

export function PortalSwitchButton({ className = '' }: { className?: string }) {
  const { role, mode } = useAuth()
  //  시연 모드에는 역할이 없습니다 — 그때는 보여 줍니다(시연에서 보여 드리는
  //  핵심 중 하나입니다). 운영 모드에서는 실제로 열리는 사람에게만.
  const allowed = mode !== 'live' || canAccess(role, PORTAL_PREFIX)
  if (!allowed) return null
  return (
    <Link
      data-portal-switch
      to={PORTAL_PREFIX}
      className={`group inline-flex min-h-[3rem] items-center gap-2.5 rounded-2xl border-2 border-teal-500 bg-teal-50 px-4 py-2.5 transition hover:bg-teal-500 ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white transition group-hover:bg-white group-hover:text-teal-700">
        <Building2 size={18} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="t-btn block break-keep text-teal-800 transition group-hover:text-white">
          병원이 보는 화면
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
