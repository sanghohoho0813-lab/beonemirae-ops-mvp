import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/**
 * 본인 비밀번호 변경 — 관리자를 거치지 않고 직접 바꿀 수 있어야
 * 실제 직원이 계속 쓸 수 있습니다. 비밀번호는 Supabase Auth 가 관리합니다.
 */
export function PasswordCard() {
  const { changePassword } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    if (pw !== pw2) {
      setMsg({ ok: false, text: '두 번 입력한 비밀번호가 서로 다릅니다.' })
      return
    }
    setBusy(true)
    const r = await changePassword(pw)
    setBusy(false)
    setMsg({ ok: r.ok, text: r.ok ? '비밀번호가 변경되었습니다.' : (r.error ?? '변경에 실패했습니다.') })
    if (r.ok) {
      setPw('')
      setPw2('')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor="np1">새 비밀번호 (8자 이상)</label>
        <input id="np1" type="password" autoComplete="new-password" className="field-input"
          value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="np2">새 비밀번호 확인</label>
        <input id="np2" type="password" autoComplete="new-password" className="field-input"
          value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <button onClick={() => void save()} disabled={busy || pw.length < 8} className="btn-navy w-full disabled:opacity-50">
        {busy ? <><Loader2 size={18} className="animate-spin" /> 변경 중…</> : '비밀번호 변경'}
      </button>
      {msg && (
        <p className={`t-body break-keep font-bold ${msg.ok ? 'text-teal-600' : 'text-rose-600'}`}>
          {msg.ok && <CheckCircle2 size={16} className="mr-1 inline -translate-y-px" />}
          {msg.text}
        </p>
      )}
    </div>
  )
}
