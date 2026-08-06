import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { canAccess, landingPath } from '../lib/access'

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 보호
//
//  · Supabase 가 설정된 상태에서는 로그인하지 않은 사용자가 운영 데이터 화면에
//    접근할 수 없습니다. 로그인 화면으로 보내고, 로그인 후 원래 경로로 돌아옵니다.
//  · Supabase 미설정(시연 모드)에서는 기존처럼 그대로 사용할 수 있습니다.
//    가짜 로그인을 만들지 않기 위한 의도적인 분기입니다.
//  · 역할이 허용하지 않는 경로는 접근 자체를 막습니다(메뉴 숨김과 별개).
// ─────────────────────────────────────────────────────────────────────────────

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center px-6">{children}</div>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, session, profile, role } = useAuth()
  const location = useLocation()

  // 시연 모드(서버 미설정) — 기존 동작 유지
  if (!configured) return <>{children}</>

  if (loading) {
    return (
      <FullScreen>
        <p className="t-body flex items-center gap-2.5 font-bold text-navy-400">
          <Loader2 size={20} className="animate-spin" /> 로그인 상태를 확인하는 중…
        </p>
      </FullScreen>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile.active) {
    return (
      <FullScreen>
        <div className="card max-w-[32rem] p-6 text-center sm:p-8">
          <ShieldAlert size={40} className="mx-auto text-amber-500" />
          <p className="t-card mt-4 break-keep text-navy-900">비활성화된 계정입니다</p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            관리자에게 계정 활성화를 요청해 주세요.
          </p>
        </div>
      </FullScreen>
    )
  }

  if (!canAccess(role, location.pathname)) {
    return (
      <FullScreen>
        <div className="card max-w-[32rem] p-6 text-center sm:p-8">
          <ShieldAlert size={40} className="mx-auto text-navy-300" />
          <p className="t-card mt-4 break-keep text-navy-900">접근 권한이 없는 화면입니다</p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            현재 역할({profile.role === 'field' ? '현장 담당자' : '사무실 담당자'})에게 허용되지 않은 메뉴입니다.
          </p>
          <a href={landingPath(role)} className="btn-navy mt-5 inline-flex">
            내 업무 화면으로 이동
          </a>
        </div>
      </FullScreen>
    )
  }

  return <>{children}</>
}
