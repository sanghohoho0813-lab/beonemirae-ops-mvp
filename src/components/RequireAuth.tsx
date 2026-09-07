import type { ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Clock, CloudOff, Loader2, LogOut, RotateCw, ShieldAlert } from 'lucide-react'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { canAccess, landingPath } from '../lib/access'
import { isDemoMode } from '../lib/supabase'

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
  const { configured, loading, session, profile, unreachable, checking, role, signOut, refreshProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  //  시연 모드로 빌드한 것만 로그인 없이 엽니다 (VITE_DEMO_MODE=1).
  if (isDemoMode) return <>{children}</>

  //  설정이 없으면 — 열어 주는 게 아니라 닫습니다.
  //
  //  예전에는 여기서 children 을 그대로 돌려줬습니다. 그래서 Vercel 에
  //  환경변수를 넣지 않은 배포본이 로그인 없이 전부 열렸습니다. 로그인한
  //  적 없는 사람에게 대시보드가 그대로 보였고, 로그인한 계정이 없으니
  //  로그아웃 버튼도 없었습니다. 실제로 그렇게 배포되어 있었습니다.
  //  로그인 화면으로 보내면 거기서 무엇이 빠졌는지 알려 줍니다.
  if (!configured) return <Navigate to="/login" replace />


  if (loading) {
    return (
      <FullScreen>
        <p className="t-body flex items-center gap-2.5 font-bold text-navy-400">
          <Loader2 size={20} className="animate-spin" /> 로그인 상태를 확인하는 중…
        </p>
      </FullScreen>
    )
  }

  //  ⚠ 0102 — 프로필을 아직 읽는 중이면 기다립니다. 예전에는 여기서 곧바로
  //    로그인 화면으로 보냈습니다. 통신이 느린 곳에서 supabase 가 다시 시도하는
  //    몇 초 동안 화면이 로그인으로 튕겼다가 돌아왔습니다.
  if (session && !profile && checking) {
    return (
      <FullScreen>
        <p data-auth-checking className="t-body flex items-center gap-2.5 font-bold text-navy-400">
          <Loader2 size={20} className="animate-spin" /> 계정 정보를 확인하는 중…
        </p>
      </FullScreen>
    )
  }

  //  ── 세션은 살아 있는데 서버에 못 닿은 경우 (0079) ────────────────────
  //
  //   ⚠ 예전에는 여기서 곧바로 로그인 화면으로 보냈습니다. 그래서 기사님이
  //     **지하 보관실에서 앱을 열면 「로그인해 주세요」가 떴습니다.** 토큰은
  //     멀쩡히 있는데도요. 기사님은 자기가 로그아웃된 줄 알고, 비밀번호를
  //     모르면(50~60대에게 흔합니다) 거기서 아무것도 못 하고 사무실에
  //     전화합니다. 통신 문제를 **로그인 문제로 잘못 말한** 것입니다.
  //
  //   ⚠ 로그아웃시키지 않습니다. 신호가 돌아오면 그대로 이어서 일합니다.
  if (session && !profile && unreachable) {
    return (
      <FullScreen>
        <div data-auth-offline className="card max-w-[32rem] p-6 text-center sm:p-8">
          <CloudOff size={40} className="mx-auto text-navy-400" strokeWidth={1.9} />
          <p className="mt-4 break-keep text-[1.32rem] font-extrabold text-navy-900">
            지금 통신이 안 됩니다
          </p>
          <p className="mt-2.5 break-keep text-[1.08rem] leading-relaxed text-navy-600">
            <b className="text-navy-900">로그아웃된 것이 아닙니다.</b> 신호가 약한 곳(지하 보관실 등)에서는
            자료를 못 불러옵니다. 밖으로 나오신 뒤 아래를 눌러 주세요.
          </p>
          <button
            data-auth-offline-retry
            onClick={() => void refreshProfile()}
            className="btn-primary mx-auto mt-5 !text-[1.1rem]"
            style={{ minHeight: 52 }}
          >
            <RotateCw size={18} strokeWidth={2.4} /> 다시 시도
          </button>
          <p className="mt-3 break-keep text-[1rem] text-navy-400">
            여러 번 눌러도 안 되면 사무실에 알려 주세요.
          </p>
        </div>
      </FullScreen>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile.active) {
    //  예전에는 이 화면에 버튼이 하나도 없었습니다. 중지된 계정으로 로그인하면
    //  여기서 더 갈 데가 없고, 로그아웃도 못 해서 다음 사람이 로그인하려면
    //  브라우저 기록을 지워야 했습니다. 사무실 공용 PC 에서는 그대로 막힙니다.
    //
    //  「승인 대기」와 「중지」를 나눕니다(0021). 둘 다 active=false 지만
    //  본인이 해야 할 일이 정반대입니다 — 하나는 기다리는 것이고, 하나는
    //  담당자에게 왜 막혔는지 물어봐야 하는 것입니다. 한 문장으로 뭉뚱그리면
    //  방금 가입한 사람이 자기 계정이 정지당했다고 읽습니다.
    const pending = profile.approvedAt === null
    return (
      <FullScreen>
        <div className="card max-w-[32rem] p-6 text-center sm:p-8">
          {pending ? (
            <Clock size={40} className="mx-auto text-teal-500" />
          ) : (
            <ShieldAlert size={40} className="mx-auto text-amber-700" />
          )}
          <p className="t-card mt-4 break-keep text-navy-900">
            {pending ? '승인을 기다리는 중입니다' : '비활성화된 계정입니다'}
          </p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            {pending ? (
              <>
                가입 신청이 접수되었습니다 ({profile.email}). 관리자가 승인하면 그때부터 업무 화면이
                열립니다. 승인이 급하시면 담당자에게 직접 알려 주세요.
              </>
            ) : (
              <>관리자에게 계정 활성화를 요청해 주세요. ({profile.email})</>
            )}
          </p>
          <button
            onClick={() => {
              void signOut()
              navigate('/login', { replace: true })
            }}
            className="btn-navy mt-5 inline-flex"
          >
            <LogOut size={17} strokeWidth={2.4} /> 로그아웃 · 다른 계정으로 로그인
          </button>
        </div>
      </FullScreen>
    )
  }

  if (!canAccess(role, location.pathname)) {
    // 기본 진입 경로('/')는 차단 화면 대신 그 역할의 첫 업무 화면으로 보냅니다.
    // (현장 담당자는 대시보드 대신 오늘 일정이 첫 화면입니다)
    if (location.pathname === '/') return <Navigate to={landingPath(role)} replace />
    return (
      <FullScreen>
        <div className="card max-w-[32rem] p-6 text-center sm:p-8">
          <ShieldAlert size={40} className="mx-auto text-navy-400" />
          <p className="t-card mt-4 break-keep text-navy-900">접근 권한이 없는 화면입니다</p>
          <p className="t-body mt-2 break-keep font-medium text-navy-500">
            현재 역할({ROLE_LABEL[profile.role]})에게 허용되지 않은 메뉴입니다.
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
