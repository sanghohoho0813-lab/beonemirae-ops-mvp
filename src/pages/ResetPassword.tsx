import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// 비밀번호 재설정 (/reset-password)
//
//  재설정 메일의 링크로 들어오면 Supabase 가 임시 세션을 만들어 주고,
//  이 화면에서 새 비밀번호를 저장합니다.
//  (비밀번호는 Supabase Auth 가 해시로 보관하며 이 앱 DB 에는 저장되지 않습니다)
// ─────────────────────────────────────────────────────────────────────────────

export function ResetPassword() {
  const { changePassword, session, configured } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (pw !== pw2) {
      setError('두 번 입력한 비밀번호가 서로 다릅니다.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await changePassword(pw)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '변경에 실패했습니다.')
      return
    }
    setDone(true)
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-[30rem]">
        <div className="mb-8 flex items-center gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-500 text-[1.5rem] font-extrabold text-white">
            비
          </span>
          <p className="t-section break-keep text-white">㈜비원미래 운영관리 시스템</p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          {!configured ? (
            <p className="t-body break-keep font-bold text-navy-500">
              서버 연결이 설정되지 않아 비밀번호를 변경할 수 없습니다.
            </p>
          ) : done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 size={44} className="mx-auto text-teal-500" />
              <p className="t-card break-keep text-navy-900">비밀번호가 변경되었습니다</p>
              <button onClick={() => navigate('/login')} className="btn-primary w-full">
                로그인 화면으로
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <h1 className="t-section text-navy-900">새 비밀번호 설정</h1>
                <p className="t-body mt-1.5 break-keep font-medium text-navy-400">
                  {session
                    ? '새로 사용할 비밀번호를 입력해 주세요. (8자 이상)'
                    : '재설정 메일의 링크로 접속해야 변경할 수 있습니다.'}
                </p>
              </div>

              <div>
                <label htmlFor="pw1" className="t-label block text-navy-600">
                  새 비밀번호
                </label>
                <input
                  id="pw1"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  className="field-input mt-1.5 w-full"
                />
              </div>
              <div>
                <label htmlFor="pw2" className="t-label block text-navy-600">
                  새 비밀번호 확인
                </label>
                <input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="field-input mt-1.5 w-full"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 px-4 py-3">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-500" />
                  <p className="t-body min-w-0 break-keep font-bold text-rose-600">{error}</p>
                </div>
              )}

              <button type="submit" disabled={busy || !session} className="btn-primary w-full disabled:opacity-60">
                {busy ? (
                  <>
                    <Loader2 size={19} className="animate-spin" /> 변경 중…
                  </>
                ) : (
                  <>
                    <KeyRound size={19} strokeWidth={2.4} /> 비밀번호 변경
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
