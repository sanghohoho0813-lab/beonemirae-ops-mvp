import { useState, type FormEvent } from 'react'
import { COMPANY_HOURS, COMPANY_TEL, SYSTEM_TAGLINE } from '../lib/brand'
import { Link, Navigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, User, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 가입 신청
//
//  본인이 자기 이메일로 신청하고, 관리자가 승인합니다. 승인 전까지는
//  로그인해도 아무 데이터도 열리지 않습니다 — 화면에서 가리는 게 아니라
//  서버(RLS)가 막습니다. 자세한 내용은 0021 마이그레이션 머리말에 있습니다.
//
//  여기서 역할을 고르게 하지 않는 이유
//   고르게 해 봐야 서버가 읽지 않습니다. 신청자가 보내는 값(user_metadata)은
//   본인이 무엇이든 적을 수 있어서, 그걸 신뢰하면 스스로 관리자가 될 수
//   있습니다. 역할은 승인하는 관리자가 정합니다. 화면에 고르는 칸을 두면
//   "내가 고른 대로 될 것"이라는 잘못된 기대만 생깁니다.
// ─────────────────────────────────────────────────────────────────────────────

export function Signup() {
  const { signUp, session, profile, loading, configured } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  //  이미 승인까지 끝난 계정으로 들어왔으면 업무 화면으로 보냅니다.
  //  (승인 대기 상태면 profile.active 가 false 라 RequireAuth 가 안내를 띄웁니다)
  if (!loading && session && profile?.active) return <Navigate to="/" replace />

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = password2.length > 0 && password !== password2
  const canSubmit =
    !!name.trim() && !!email.trim() && password.length >= 8 && password === password2 && !busy

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    const res = await signUp({ email, password, name })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '가입 신청에 실패했습니다.')
      return
    }
    setSent(true)
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-[30rem]">
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
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5">
                <AlertCircle size={22} className="mt-0.5 shrink-0 text-amber-700" />
                <p className="t-body min-w-0 break-keep font-medium text-amber-700">
                  서버 연결이 설정되지 않아 가입 신청을 받을 수 없습니다.
                </p>
              </div>
              <Link to="/login" className="btn-navy w-full justify-center">
                로그인 화면으로
              </Link>
            </div>
          ) : sent ? (
            //  신청 완료. 여기서 「로그인하세요」라고 하면 안 됩니다 — 로그인은
            //  되지만 아무것도 안 보여서, 본인은 고장 났다고 생각합니다.
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-4">
                <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="t-card break-keep text-emerald-800">가입 신청이 접수되었습니다</p>
                  <p className="t-body mt-1.5 break-keep font-medium text-emerald-700">
                    {email.trim()}
                  </p>
                </div>
              </div>
              <p className="t-body break-keep font-medium text-navy-500" data-signup-note>
                <b className="text-navy-700">여기서 하실 일은 끝났습니다.</b> 관리자가 승인하면 그때부터
                바로 사용할 수 있습니다. 승인 전에는 로그인하셔도 업무 화면이 열리지 않습니다 — 고장이
                아니라 원래 그렇습니다. 승인이 급하시면 담당자에게 직접 알려 주세요.
              </p>
              {/*
                영문 확인 메일 안내.

                 Supabase 설정에 따라 「Confirm your email address」 라는 영문 메일이
                 한 통 갈 수 있습니다. 예전에는 그걸 누르면 `localhost:3000` 으로 가서
                 「사이트에 연결할 수 없음」이 떴습니다 — 신청한 사람은 자기가 뭘
                 고장 냈다고 생각합니다.

                 이제 승인이 곧 인증이라(0041) 그 메일은 눌러도 되고 안 눌러도 됩니다.
                 화면이 먼저 말해 줍니다. 모르고 눌러서 당황하는 것보다 낫습니다.
              */}
              <div className="flex items-start gap-2.5 rounded-2xl bg-navy-50 px-4 py-3.5" data-signup-mail>
                <Mail size={19} className="mt-0.5 shrink-0 text-navy-400" />
                <p className="t-body min-w-0 break-keep font-medium text-navy-500">
                  영어로 된 확인 메일(<span className="font-bold">Confirm your email address</span>)이 한 통
                  갈 수 있습니다. <b className="text-navy-700">누르지 않으셔도 됩니다.</b> 승인만 되면 바로
                  로그인됩니다.
                </p>
              </div>
              <Link to="/login" className="btn-navy w-full justify-center">
                <ArrowLeft size={17} strokeWidth={2.4} /> 로그인 화면으로
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <h1 className="t-section text-navy-900">가입 신청</h1>
                <p className="t-body mt-1.5 break-keep font-medium text-navy-400">
                  본인 이메일로 신청하시면 관리자가 확인 후 승인합니다.
                </p>
              </div>

              <div>
                <label htmlFor="signup-name" className="t-label block text-navy-600">
                  이름
                </label>
                <div className="relative mt-1.5">
                  <User size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="signup-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예) 홍현주"
                    className="field-input w-full pl-12"
                  />
                </div>
                <p className="t-muted mt-1.5 break-keep">
                  관리자가 승인 목록에서 누구인지 알아볼 수 있도록 실명으로 적어 주세요.
                </p>
              </div>

              <div>
                <label htmlFor="signup-email" className="t-label block text-navy-600">
                  이메일
                </label>
                <div className="relative mt-1.5">
                  <Mail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="본인이 쓰는 이메일 주소"
                    className="field-input w-full pl-12"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" className="t-label block text-navy-600">
                  비밀번호 (8자 이상)
                </label>
                <div className="relative mt-1.5">
                  <Lock size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="field-input w-full pl-12"
                  />
                </div>
                {tooShort && (
                  <p className="t-body mt-1.5 break-keep font-bold text-rose-600">
                    8자 이상으로 정해 주세요.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="signup-password2" className="t-label block text-navy-600">
                  비밀번호 확인
                </label>
                <div className="relative mt-1.5">
                  <Lock size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    id="signup-password2"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="한 번 더 입력"
                    className="field-input w-full pl-12"
                  />
                </div>
                {mismatch && (
                  <p className="t-body mt-1.5 break-keep font-bold text-rose-600">
                    두 비밀번호가 서로 다릅니다.
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 px-4 py-3">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-500" />
                  <p className="t-body min-w-0 break-keep font-bold text-rose-600">{error}</p>
                </div>
              )}

              <button type="submit" disabled={!canSubmit} className="btn-primary w-full disabled:opacity-60">
                {busy ? (
                  <>
                    <Loader2 size={19} className="animate-spin" /> 신청하는 중…
                  </>
                ) : (
                  <>
                    <UserPlus size={19} strokeWidth={2.4} /> 가입 신청
                  </>
                )}
              </button>

              <Link
                to="/login"
                className="t-body block w-full text-center font-bold text-navy-500 underline underline-offset-4 transition hover:text-navy-700"
              >
                이미 계정이 있으신가요? 로그인
              </Link>

              <div className="flex items-start gap-2.5 border-t border-navy-100 pt-4">
                <ShieldCheck size={19} className="mt-0.5 shrink-0 text-navy-400" />
                <p className="t-muted min-w-0 break-keep">
                  신청만으로는 아무 정보도 열리지 않습니다. 관리자가 승인하면서 권한을 정합니다.
                  비밀번호는 이 시스템에 저장되지 않습니다.
                </p>
              </div>
            </form>
          )}
        </div>

        <p className="t-muted mt-6 text-center text-navy-400">
          {/*  로그인 화면은 직원·병원이 함께 씁니다. 병원 상담번호가 아니라
              **회사 대표번호**를 둡니다 — 직원이 자기 회사 상담센터로
              전화할 일은 없습니다. */}
          ㈜비원미래 · {COMPANY_TEL} · {COMPANY_HOURS}
        </p>
      </div>
    </div>
  )
}
