import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, RefreshCw, UserPlus, X } from 'lucide-react'
import { useAuth, ROLE_LABEL, type UserRole } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import {
  createUser,
  loadProfiles,
  resetUserPassword,
  setProfileActive,
  setProfileClient,
  setProfileRole,
  type ProfileRow,
} from '../lib/repo'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 사용자 · 권한 관리 (관리자 전용)
//
//  예전에는 직원 한 명을 추가하려면 Supabase 대시보드에 들어가 계정을 만들고,
//  병원 담당자면 거래처 uuid 를 손으로 복사해 붙여야 했습니다. 대표님이
//  하실 수 있는 일이 아니었습니다.
//
//  여기서 다 됩니다 — 계정 만들기 · 역할 바꾸기 · 사용/중지 · 비밀번호
//  초기화 · 병원 계정의 소속 거래처 바꾸기.
//
//  화면에서 잠그는 것만으로 끝내지 않습니다. 계정을 만드는 힘(service_role)은
//  브라우저에 두지 않고 서버에 두었고, 서버가 '부른 사람이 관리자인가'를
//  다시 확인합니다(0018). 아래 잠금 규칙도 서버가 같이 막습니다(0016·0018).
//
//   · 자기 계정은 스스로 중지할 수 없습니다
//   · 자기 관리자 권한은 스스로 내릴 수 없습니다
//   · 마지막 남은 관리자는 중지도 강등도 되지 않습니다
//
//  비밀번호는 이 시스템에 저장되지 않습니다. 임시 비밀번호는 만든 사람이
//  직접 전해 주고, 받은 사람이 첫 로그인 뒤 스스로 바꿉니다.
// ─────────────────────────────────────────────────────────────────────────────

const STAFF_ROLES: UserRole[] = ['admin', 'office', 'field']
const ALL_ROLES: UserRole[] = ['admin', 'office', 'field', 'client']

/** 여덟 자리 임시 비밀번호 — 헷갈리는 글자(0/O, 1/l)는 빼고 만듭니다 */
function suggestPassword(): string {
  const pool = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(10)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => pool[n % pool.length]).join('')
}

export function UserAdmin() {
  const { mode, profile } = useAuth()
  const { data } = useData()
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState(false)

  //  data.clients 에는 거래 중인 곳만 들어 있습니다(그만둔 곳은 retiredClients).
  //  그만둔 병원에 계정을 새로 붙이는 일은 없어야 하므로 이대로 씁니다.
  const clients = useMemo(
    () => data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [data.clients],
  )
  const activeAdmins = rows.filter((r) => r.role === 'admin' && r.active).length

  const load = useCallback(async () => {
    if (mode !== 'live') return
    setBusy(true)
    setError(null)
    try {
      setRows(await loadProfiles())
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }, [mode])

  useEffect(() => {
    void load()
  }, [load])

  const change = async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await fn()
      await load()
      if (okMsg) setDone(okMsg)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  if (mode !== 'live') {
    return (
      <p className="t-body break-keep font-bold text-navy-400">
        사용자 관리는 서버에 로그인한 실제 운영 모드에서만 쓸 수 있습니다. 시연 모드에는 계정이 없습니다.
      </p>
    )
  }

  /** 이 사람을 중지할 수 있는가 — 서버가 막는 것과 같은 규칙을 화면에도 씁니다 */
  const lockReason = (r: ProfileRow, next: { role?: UserRole; active?: boolean }): string | null => {
    if (r.id === profile?.id && next.active === false) return '자기 계정은 중지할 수 없습니다'
    if (r.id === profile?.id && next.role && next.role !== 'admin' && r.role === 'admin')
      return '자기 관리자 권한은 스스로 내릴 수 없습니다'
    if (r.role === 'admin' && r.active && activeAdmins <= 1) {
      if (next.active === false) return '관리자가 한 명뿐입니다 — 다른 관리자를 먼저 지정해 주세요'
      if (next.role && next.role !== 'admin') return '관리자가 한 명뿐입니다 — 다른 관리자를 먼저 지정해 주세요'
    }
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOpenForm((v) => !v)} className="btn-navy">
          {openForm ? <X size={17} strokeWidth={2.4} /> : <UserPlus size={17} strokeWidth={2.4} />}
          {openForm ? '닫기' : '계정 만들기'}
        </button>
        <button onClick={load} disabled={busy} className="btn-ghost disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />}
          새로고침
        </button>
        <span className="t-muted ml-auto font-bold text-navy-400">
          {rows.length}개 계정 · 관리자 {activeAdmins}명
        </span>
      </div>

      {openForm && (
        <CreateUserForm
          clients={clients}
          onDone={async (msg) => {
            setOpenForm(false)
            await load()
            setDone(msg)
          }}
        />
      )}

      {error && <p className="t-body break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>}
      {done && <p className="t-body break-keep rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-700">{done}</p>}

      <div className="divide-y divide-navy-50 overflow-hidden rounded-2xl bg-navy-50/60">
        {rows.map((r) => {
          const self = r.id === profile?.id
          return (
            /*  줄 전체를 집을 수 있는 표시를 답니다. 없으면 검사가 "이메일이
                적힌 곳에서 div 를 두 번 올라간 자리" 같은 식으로 집게 되는데,
                줄 안에 무엇이 하나 늘어나는 순간 엉뚱한 데를 잡습니다. */
            <div key={r.id} data-user-row={r.id} className="bg-white px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="t-body break-keep font-extrabold text-navy-900">
                    {r.name || r.email}
                    {self && <span className="ml-2 font-bold text-teal-600">본인</span>}
                  </p>
                  <p className="t-muted break-keep">{r.email}</p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(r.role === 'client' ? ALL_ROLES : STAFF_ROLES).map((role) => {
                    const why = lockReason(r, { role })
                    return (
                      <button
                        key={role}
                        disabled={busy || !!why || (role === 'client' && r.role !== 'client')}
                        title={why ?? ROLE_LABEL[role]}
                        onClick={() => void change(() => setProfileRole(r.id, role, r.clientId))}
                        className={`rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-40 ${
                          r.role === role ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
                        }`}
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    )
                  })}
                </div>

                <button
                  disabled={busy || !!lockReason(r, { active: !r.active ? undefined : false })}
                  title={lockReason(r, { active: !r.active ? undefined : false }) ?? ''}
                  onClick={() => void change(() => setProfileActive(r.id, !r.active))}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-40 ${
                    r.active ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
                  }`}
                >
                  {r.active ? '사용 중' : '비활성'}
                </button>

                <ResetPasswordButton row={r} busy={busy} onError={setError} onDone={setDone} />
              </div>

              {/* 병원 계정 — 어느 병원 소속인지, 그리고 바꾸는 길 */}
              {r.role === 'client' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50/70 px-3.5 py-2.5">
                  <span className="t-muted shrink-0 font-bold text-sky-700">소속 병원</span>
                  <select
                    disabled={busy}
                    aria-label={`${r.name || r.email} 소속 병원`}
                    value={r.clientId ?? ''}
                    onChange={(e) => void change(() => setProfileClient(r.id, e.target.value), '소속 병원을 바꿨습니다.')}
                    className="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-[1.02rem] font-bold text-navy-900"
                  >
                    <option value="" disabled>
                      병원을 선택하세요
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
        {rows.length === 0 && !busy && <p className="t-body bg-white px-4 py-4 text-navy-400">계정이 없습니다.</p>}
      </div>

      <p className="t-muted break-keep">
        비밀번호는 이 시스템에 저장되지 않습니다. 임시 비밀번호는 만든 사람이 직접 전해 주시고, 받은 분은 첫
        로그인 뒤 「설정 → 비밀번호 변경」에서 바꾸도록 안내해 주세요. 공개 가입은 열려 있지 않아, 여기서 만든
        계정만 로그인할 수 있습니다.
      </p>
    </div>
  )
}

/** 비밀번호 초기화 — 새 임시 비밀번호를 만들어 화면에 한 번만 보여 줍니다 */
function ResetPasswordButton({
  row,
  busy,
  onError,
  onDone,
}: {
  row: ProfileRow
  busy: boolean
  onError: (m: string | null) => void
  onDone: (m: string | null) => void
}) {
  const [working, setWorking] = useState(false)

  const run = async () => {
    const pw = suggestPassword()
    if (
      !window.confirm(
        `${row.name || row.email} 의 비밀번호를 초기화합니다.\n\n` +
          `새 임시 비밀번호 : ${pw}\n\n` +
          '이 값은 지금 한 번만 보여 드립니다. 본인에게 직접 전해 주세요. 진행할까요?',
      )
    ) {
      return
    }
    setWorking(true)
    onError(null)
    try {
      await resetUserPassword(row.id, pw)
      onDone(`${row.name || row.email} 의 임시 비밀번호는 ${pw} 입니다. 본인에게 전달해 주세요.`)
    } catch (e) {
      onError(friendlyError(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <button
      disabled={busy || working}
      onClick={() => void run()}
      title="비밀번호 초기화"
      className="shrink-0 rounded-full bg-navy-50 px-3 py-1.5 text-[0.95rem] font-extrabold text-navy-500 transition hover:text-navy-800 disabled:opacity-40"
    >
      {working ? (
        <Loader2 size={14} className="mr-1 inline animate-spin" />
      ) : (
        <KeyRound size={14} className="mr-1 inline -translate-y-px" />
      )}
      비밀번호 초기화
    </button>
  )
}

/** 새 계정 만들기 */
function CreateUserForm({
  clients,
  onDone,
}: {
  clients: { id: string; name: string }[]
  onDone: (msg: string) => Promise<void> | void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(suggestPassword)
  const [role, setRole] = useState<UserRole>('field')
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  //  병원 계정인데 소속을 안 골랐으면 서버가 거절합니다. 누르기 전에 알려 줍니다.
  const missingClient = role === 'client' && !clientId
  const tooShort = password.trim().length < 8
  const canSave = name.trim() && email.trim() && !tooShort && !missingClient && !busy

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await createUser({ email: email.trim(), password: password.trim(), name: name.trim(), role, clientId })
      await onDone(
        `${name.trim()} (${email.trim()}) 계정을 만들었습니다. 임시 비밀번호는 ${password.trim()} 입니다 — 본인에게 전달해 주세요.`,
      )
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <p className="t-card mb-3 break-keep text-navy-900">새 계정 만들기</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="이름">
          <input
            id="new-user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 홍현주"
            className="field-input"
          />
        </Field>
        <Field label="이메일">
          <input
            id="new-user-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="예) hong@beonemirae.co.kr"
            className="field-input"
          />
        </Field>
        <Field label="임시 비밀번호 (8자 이상)">
          <div className="flex gap-2">
            <input
              id="new-user-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input min-w-0 flex-1"
            />
            <button type="button" onClick={() => setPassword(suggestPassword())} className="btn-ghost shrink-0">
              다시 만들기
            </button>
          </div>
        </Field>
        <Field label="역할">
          <select
            id="new-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="field-input"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {role === 'client' && (
          <Field label="소속 병원 (병원 계정은 필수)">
            <select
              id="new-user-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="field-input"
            >
              <option value="">병원을 선택하세요</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {role === 'client' && (
        <p className="t-muted mt-2.5 break-keep">
          병원 계정은 포털만 열립니다. 자기 병원의 일정·자재·요청만 보이고, 다른 병원과 비원미래 내부 화면은
          화면과 서버 양쪽에서 막혀 있습니다.
        </p>
      )}
      {missingClient && <p className="t-body mt-2.5 break-keep font-bold text-rose-600">소속 병원을 골라 주세요.</p>}
      {tooShort && <p className="t-body mt-2.5 break-keep font-bold text-rose-600">임시 비밀번호는 8자 이상이어야 합니다.</p>}
      {error && <p className="t-body mt-2.5 break-keep font-bold text-rose-600">{error}</p>}

      <button disabled={!canSave} onClick={() => void submit()} className="btn-navy mt-3.5 disabled:opacity-40">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} strokeWidth={2.4} />}
        계정 만들기
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="t-muted mb-1 block break-keep font-bold text-navy-500">{label}</span>
      {children}
    </label>
  )
}
