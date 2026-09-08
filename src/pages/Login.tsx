import { useState, type FormEvent } from 'react'
import { COMPANY_HOURS, COMPANY_TEL, SYSTEM_TAGLINE } from '../lib/brand'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CloudOff, Loader2, LogIn, Lock, LogOut, Mail, RotateCw, ShieldCheck, UserX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { canAccess, landingPath } from '../lib/access'
import { isDemoMode } from '../lib/supabase'
import { BRAND_IMG } from '../lib/brandAssets'
import { BrandImg } from '../components/BrandImg'

// ─────────────────────────────────────────────────────────────────────────────
// 로그인 — 비원미래 운영관리 시스템
//
//  공개 회원가입은 제공하지 않습니다. 관리자가 생성하거나 초대한 계정만
//  사용할 수 있습니다. (SaaS 가입 화면이 아니라 사내 업무 시스템 로그인)
// ─────────────────────────────────────────────────────────────────────────────

export function Login() {
  const { signIn, session, profile, loading, configured, role, sendPasswordReset, unreachable, checking, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()   // 시연 모드 안내 버튼에서 사용
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  // 이미 로그인되어 있으면 원래 가려던 곳(또는 역할별 첫 화면)으로
  //
  //  단, 그 역할이 열 수 없는 화면이었다면 첫 업무 화면으로 보냅니다.
  //  누가 미수금 화면 주소를 현장 담당자에게 보내면, 로그인하자마자
  //  「접근 권한이 없는 화면입니다」 벽을 보게 됩니다 — 로그인은 됐는데
  //  자기 업무 화면은 직접 찾아 들어가야 했습니다.
  if (!loading && session && profile) {
    const from = (location.state as { from?: string } | null)?.from
    const back = from && from !== '/login' && canAccess(role, from) ? from : landingPath(role)
    return <Navigate to={back} replace />
  }

  //  ── 로그인은 됐는데 사용자 정보를 못 받은 경우 (0102) ───────────────────
  //
  //   ⚠ 여태 이 자리에서 **아무 말도 하지 않았습니다.** 비밀번호가 맞아
  //     로그인은 성공했는데 profiles 한 줄이 없으면, 위의 Navigate 가 안 되고
  //     화면 보호(RequireAuth)가 다시 로그인으로 돌려보냅니다. 쓰는 사람 눈에는
  //     **「로그인」을 눌렀는데 잠깐 돌다가 그대로 로그인 화면** 입니다.
  //     오류도 없고 안내도 없어서, 비밀번호를 몇 번이고 다시 칩니다.
  //
  //   서버에 못 닿은 것(통신)과 정보가 없는 것(계정)을 나눠서 말합니다.
  //   무엇을 해야 하는지까지 적습니다 — 고칠 수 없는 안내는 없는 것과 같습니다.
  //  ⚠ 아직 읽는 중이면 아무 판정도 하지 않습니다. supabase 는 통신이
  //    끊기면 몇 초에 걸쳐 다시 시도하는데, 그 사이에 「계정 정보가 없습니다」를
  //    띄우면 멀쩡한 계정을 고장 났다고 말하는 셈입니다.
  if (!loading && session && !profile && checking) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950 px-4">
        <p data-login-checking className="t-body flex items-center gap-2.5 font-bold text-navy-300">
          <Loader2 size={20} className="animate-spin" /> 계정 정보를 확인하는 중…
        </p>
      </div>
    )
  }

  if (!loading && session && !profile) {
    const who = session.user?.email ?? ''
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950 px-4 py-10">
        <div data-login-stuck={unreachable ? 'offline' : 'no-profile'} className="w-full max-w-[30rem] rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
          {unreachable ? (
            <CloudOff size={40} className="mx-auto text-navy-400" strokeWidth={1.9} />
          ) : (
            <UserX size={40} className="mx-auto text-amber-600" strokeWidth={1.9} />
          )}
          <p className="t-card mt-4 break-keep text-navy-900">
            {unreachable ? '지금 통신이 안 됩니다' : '로그인은 됐지만 계정 정보를 찾지 못했습니다'}
          </p>
          <p className="t-body mt-2.5 break-keep font-medium text-navy-600">
            {unreachable ? (
              <>
                <b className="text-navy-900">비밀번호 문제가 아닙니다.</b> 신호가 약한 곳에서는 자료를 못
                불러옵니다. 잠시 뒤 아래를 눌러 주세요.
              </>
            ) : (
              <>
                <b className="text-navy-900">비밀번호는 맞습니다.</b> 그런데 이 계정({who})의 사용자 정보가
                서버에 없어서 업무 화면을 열 수 없습니다. 관리자에게 이 문장을 그대로 알려 주세요 —
                「사용자 관리에서 계정을 다시 만들어야 합니다」.
              </>
            )}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button data-login-retry onClick={() => void refreshProfile()} className="btn-primary">
              <RotateCw size={17} strokeWidth={2.4} /> 다시 시도
            </button>
            <button onClick={() => void signOut()} className="btn-ghost">
              <LogOut size={17} strokeWidth={2.4} /> 로그아웃
            </button>
          </div>
        </div>
      </div>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    const res = await signIn(email, password)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '로그인에 실패했습니다.')
      return
    }
    // 여기서 곧바로 이동하지 않습니다. 로그인 직후에는 아직 profile(역할)이
    // 로드되지 않아 역할별 첫 화면을 알 수 없기 때문입니다.
    // 프로필이 도착하면 위의 <Navigate> 가 올바른 화면으로 보냅니다.
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950 px-4 py-10">
      {/*  0103 — PC 에서는 왼쪽에 세로 브랜드 사진(mobile_card_vertical)을
           둡니다. 직원도 병원도 제일 먼저 보는 화면인데 검은 바탕에 칸 하나뿐
           이었습니다. 폰(lg 미만)에서는 그리지 않습니다 — 폭이 없고, 로그인
           칸이 첫 화면 아래로 밀리면 안 됩니다. 로그인 칸 자체는 그대로입니다. */}
      <div className="w-full max-w-[30rem] lg:max-w-[62rem]">
      <div className="lg:flex lg:items-stretch lg:gap-8">
        <aside
          data-login-brand
          className="relative hidden overflow-hidden rounded-3xl bg-navy-900 shadow-2xl lg:block lg:w-[22rem] lg:shrink-0"
        >
          <BrandImg src={BRAND_IMG.mobileCard} eager className="img-drift absolute inset-0 h-full w-full" />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-navy-950/10"
          />
          <div className="relative flex h-full flex-col justify-end p-7 text-white">
            <p className="t-body font-bold text-teal-300">㈜비원미래 · BUSINESS AX</p>
            <p className="mt-1.5 break-keep text-[1.35rem] font-extrabold leading-tight">{SYSTEM_TAGLINE}</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
        {/* 브랜드 */}
        <div className="mb-8 flex items-center gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.62rem] font-extrabold text-white">
            비
          </span>
          <div className="min-w-0">
            <p className="t-section break-keep text-white">㈜비원미래 운영관리 시스템</p>
            <p className="t-body mt-1 break-keep font-medium text-navy-400">{SYSTEM_TAGLINE}</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          {!configured ? (
            // 환경변수가 없으면 가짜 로그인을 만들지 않고 사실을 그대로 알립니다.
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5">
                <AlertCircle size={22} className="mt-0.5 shrink-0 text-amber-700" />
                <div className="min-w-0">
                  <p className="t-card break-keep text-amber-800">서버 연결이 설정되지 않았습니다</p>
                  <p className="t-body mt-1.5 break-keep font-medium text-amber-700">
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_URL</code> ·{' '}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_ANON_KEY</code>{' '}
                    환경변수를 설정하면 실제 계정으로 로그인할 수 있습니다.
                  </p>
                </div>
              </div>
              {/*
                「둘러보기」는 시연용으로 빌드했을 때만 나옵니다.
                환경변수를 빠뜨린 배포본에서 이 버튼이 보이면, 로그인한 적
                없는 사람이 눌러서 운영 화면을 그대로 열게 됩니다.
              */}
              {isDemoMode ? (
                <>
                  <button onClick={() => navigate('/')} className="btn-navy w-full">
                    시연 모드로 둘러보기
                  </button>
                  <p className="t-muted break-keep text-center">
                    시연 모드는 이 브라우저에만 저장되며 실제 운영 데이터와 섞이지 않습니다.
                  </p>
                </>
              ) : (
                <p className="t-muted break-keep text-center">
                  설정이 끝나기 전에는 로그인할 수 없습니다. 관리자에게 문의해 주세요.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <h1 className="t-section text-navy-900">로그인</h1>
                <p className="t-body mt-1.5 font-medium text-navy-400">
                  회사에서 발급받은 계정으로 로그인해 주세요.
                </p>
              </div>

              <div>
                <label htmlFor="login-email" className="t-label block text-navy-600">
                  이메일
                </label>
                <div className="relative mt-1.5">
                  <Mail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@beonemirae.co.kr"
                    className="field-input w-full pl-12"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="t-label block text-navy-600">
                  비밀번호
                </label>
                <div className="relative mt-1.5">
                  <Lock size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="field-input w-full pl-12"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 px-4 py-3">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-500" />
                  <p className="t-body min-w-0 break-keep font-bold text-rose-600">{error}</p>
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
                {busy ? (
                  <>
                    <Loader2 size={19} className="animate-spin" /> 로그인 중…
                  </>
                ) : (
                  <>
                    <LogIn size={19} strokeWidth={2.4} /> 로그인
                  </>
                )}
              </button>

              {/* 비밀번호를 잊었을 때 — 관리자를 거치지 않고 본인이 재설정 */}
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setResetMsg('먼저 이메일을 입력해 주세요.')
                    return
                  }
                  const r = await sendPasswordReset(email)
                  setResetMsg(r.ok ? '재설정 메일을 보냈습니다. 메일함을 확인해 주세요.' : (r.error ?? '발송 실패'))
                }}
                className="t-body w-full font-bold text-navy-500 underline underline-offset-4 transition hover:text-navy-700"
              >
                비밀번호를 잊으셨나요?
              </button>
              {resetMsg && <p className="t-body break-keep font-bold text-teal-600">{resetMsg}</p>}

              <Link
                to="/signup"
                className="t-body block w-full text-center font-bold text-navy-500 underline underline-offset-4 transition hover:text-navy-700"
              >
                계정이 없으신가요? 가입 신청
              </Link>

              <div className="flex items-start gap-2.5 border-t border-navy-100 pt-4">
                <ShieldCheck size={19} className="mt-0.5 shrink-0 text-navy-400" />
                <p className="t-muted min-w-0 break-keep">
                  가입 신청은 관리자가 승인해야 사용할 수 있습니다. 승인 전에는 어떤 정보도 열리지 않으며,
                  비밀번호는 시스템에 저장되지 않습니다.
                </p>
              </div>
            </form>
          )}
        </div>

        </div>
      </div>
        {/*  로그인 화면은 직원·병원이 함께 씁니다. 병원 상담번호가 아니라
            **회사 대표번호**를 둡니다 — 직원이 자기 회사 상담센터로
            전화할 일은 없습니다.
            0103 — 두 칸(사진·로그인) **아래**에 둡니다. 로그인 칸 안에 두면
            왼쪽 사진 패널이 그만큼 더 길어져 둘의 아래 선이 안 맞습니다. */}
        <p className="t-muted mt-6 text-center text-navy-400">
          ㈜비원미래 · {COMPANY_TEL} · {COMPANY_HOURS}
        </p>
      </div>
    </div>
  )
}
