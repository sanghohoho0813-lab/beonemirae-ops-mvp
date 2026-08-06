import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, LogIn, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { landingPath } from '../lib/access'

// ─────────────────────────────────────────────────────────────────────────────
// 로그인 — 비원미래 운영관리 시스템
//
//  공개 회원가입은 제공하지 않습니다. 관리자가 생성하거나 초대한 계정만
//  사용할 수 있습니다. (SaaS 가입 화면이 아니라 사내 업무 시스템 로그인)
// ─────────────────────────────────────────────────────────────────────────────

export function Login() {
  const { signIn, session, profile, loading, configured, role } = useAuth()
  const navigate = useNavigate()   // 시연 모드 안내 버튼에서 사용
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 이미 로그인되어 있으면 원래 가려던 곳(또는 역할별 첫 화면)으로
  if (!loading && session && profile) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : landingPath(role)} replace />
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
      <div className="w-full max-w-[30rem]">
        {/* 브랜드 */}
        <div className="mb-8 flex items-center gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.5rem] font-extrabold text-white">
            비
          </span>
          <div className="min-w-0">
            <p className="t-section break-keep text-white">㈜비원미래 운영관리 시스템</p>
            <p className="t-body mt-1 font-medium text-navy-300">의료폐기물 수거·운반 통합 운영관리</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          {!configured ? (
            // 환경변수가 없으면 가짜 로그인을 만들지 않고 사실을 그대로 알립니다.
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5">
                <AlertCircle size={22} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="t-card break-keep text-amber-800">서버 연결이 설정되지 않았습니다</p>
                  <p className="t-body mt-1.5 break-keep font-medium text-amber-700">
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_URL</code> ·{' '}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_ANON_KEY</code>{' '}
                    환경변수를 설정하면 실제 계정으로 로그인할 수 있습니다.
                  </p>
                </div>
              </div>
              <button onClick={() => navigate('/')} className="btn-navy w-full">
                시연 모드로 둘러보기
              </button>
              <p className="t-muted break-keep text-center">
                시연 모드는 이 브라우저에만 저장되며 실제 운영 데이터와 섞이지 않습니다.
              </p>
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
                  <Mail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
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
                  <Lock size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
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

              <div className="flex items-start gap-2.5 border-t border-navy-100 pt-4">
                <ShieldCheck size={19} className="mt-0.5 shrink-0 text-navy-300" />
                <p className="t-muted min-w-0 break-keep">
                  계정은 관리자가 발급합니다. 공개 가입은 제공하지 않으며, 비밀번호는 시스템에 저장되지 않습니다.
                </p>
              </div>
            </form>
          )}
        </div>

        <p className="t-muted mt-6 text-center text-navy-400">
          ㈜비원미래 · 1533-8876 · 평일 09:00 ~ 18:00
        </p>
      </div>
    </div>
  )
}
