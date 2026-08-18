import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Clock, KeyRound, Loader2, RefreshCw, UserPlus, X } from 'lucide-react'
import { useAuth, ROLE_LABEL, type UserRole } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import {
  approveUser,
  createUser,
  isPending,
  loadProfiles,
  rejectUser,
  resetUserPassword,
  setProfileActive,
  setProfileClient,
  setProfileName,
  setProfileRole,
  setProfileVehicle,
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
//  여기서 다 됩니다 — 가입 신청 승인 · 계정 만들기 · 역할 바꾸기 · 사용/중지 ·
//  비밀번호 초기화 · 병원 계정의 소속 거래처 바꾸기.
//
//  「승인 대기」를 맨 위에 따로 둡니다(0021). 목록에 섞어 두고 '비활성' 표시만
//  달면, 신청이 들어온 줄 모르고 지나갑니다 — 신청한 사람은 로그인만 하면
//  되는 줄 알고 기다리고 있습니다. 할 일이 있으면 화면 맨 위에 있어야 합니다.
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
  //  폰에서 계정 한 줄이 세로로 길게 늘어졌습니다 — 역할 칩 3개 + 사용상태
  //  + 비밀번호 초기화 + 담당 차량 고르개가 각각 줄바꿈되기 때문입니다.
  //  계정이 6개면 화면을 한참 밀어야 했습니다. 폰에서는 **이름과 지금 상태만**
  //  줄에 두고, 손볼 때 눌러서 펼칩니다. 태블릿·PC 는 지금 그대로입니다.
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({})
  const activeAdmins = rows.filter((r) => r.role === 'admin' && r.active).length

  //  승인 대기는 먼저 신청한 순서로. 기다린 사람이 위에 옵니다.
  const pendingRows = useMemo(
    () => rows.filter(isPending).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [rows],
  )
  const approvedRows = useMemo(() => rows.filter((r) => !isPending(r)), [rows])

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

      {/* ── 승인 대기 ─────────────────────────────────────────────────────
          본인이 가입 신청한 계정입니다. 승인하기 전까지는 로그인해도 서버가
          모든 데이터를 막습니다(0021). 역할은 여기서 정합니다 — 신청자가
          고른 값은 서버가 아예 읽지 않습니다. */}
      {pendingRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border-2 border-teal-200 bg-teal-50/50">
          <div className="flex items-center gap-2 border-b border-teal-200 bg-teal-50 px-4 py-3">
            <Clock size={19} strokeWidth={2.4} className="shrink-0 text-teal-600" />
            <p className="t-card break-keep text-teal-800">승인 대기 {pendingRows.length}명</p>
          </div>
          <div className="divide-y divide-teal-100">
            {pendingRows.map((r) => (
              <PendingRow
                key={r.id}
                row={r}
                clients={clients}
                busy={busy}
                onApprove={(role, clientId) =>
                  change(
                    () => approveUser(r.id, role, clientId),
                    `${r.name || r.email} 을(를) ${ROLE_LABEL[role]}(으)로 승인했습니다.`,
                  )
                }
                onReject={() =>
                  change(() => rejectUser(r.id), `${r.name || r.email} 의 가입 신청을 거절했습니다.`)
                }
              />
            ))}
          </div>
        </div>
      )}

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
        {approvedRows.map((r) => {
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
                    {/*  호칭만 바꿉니다 — 권한은 하나도 안 건드립니다.
                        지금 대표님 계정 이름과 예비 계정 이름이 서로 바뀌어
                        있는데, 화면에 고칠 곳이 없어 SQL 을 써야 했습니다. */}
                    <button
                      data-user-rename={r.id}
                      disabled={busy}
                      className="ml-2 align-middle text-[0.95rem] font-bold text-navy-300 underline transition hover:text-navy-600 disabled:opacity-40"
                      onClick={() => {
                        const next = window.prompt(
                          `${r.email} 계정에 표시할 이름을 적어 주세요.\n\n권한은 바뀌지 않습니다 — 호칭만 바뀝니다.`,
                          r.name ?? '',
                        )
                        if (next == null) return
                        if (!next.trim()) {
                          setError('이름을 비워 둘 수 없습니다.')
                          return
                        }
                        void change(() => setProfileName(r.id, next))
                      }}
                    >
                      이름 바꾸기
                    </button>
                  </p>
                  <p className="t-muted break-keep">{r.email}</p>
                  {/*  접혀 있을 때도 「지금 무엇인지」는 보여야 합니다 —
                       역할과 사용 여부는 여기서 바로 읽힙니다. */}
                  <button
                    type="button"
                    data-user-expand={r.id}
                    aria-expanded={!!openRows[r.id]}
                    onClick={() => setOpenRows((m) => ({ ...m, [r.id]: !m[r.id] }))}
                    className="mt-1 flex min-h-[2.75rem] w-full items-center gap-2 text-left sm:hidden"
                  >
                    <span className="pill bg-navy-50 text-navy-600">{ROLE_LABEL[r.role]}</span>
                    <span className={`pill ${r.active ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'}`}>
                      {r.active ? '사용 중' : '비활성'}
                    </span>
                    <span className="t-muted ml-auto font-bold text-navy-400">
                      {openRows[r.id] ? '접기' : '바꾸기'}
                    </span>
                  </button>
                </div>

                <div className={`${openRows[r.id] ? 'flex' : 'hidden sm:flex'} flex-wrap gap-1`}>
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
                  className={`${openRows[r.id] ? '' : 'hidden sm:block'} shrink-0 rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-40 ${
                    r.active ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
                  }`}
                >
                  {r.active ? '사용 중' : '비활성'}
                </button>

                <span className={openRows[r.id] ? '' : 'hidden sm:inline'}>
                  <ResetPasswordButton row={r} busy={busy} onError={setError} onDone={setDone} />
                </span>
              </div>

              {/*  담당 차량 (0056) — 묶어 두면 그 사람의 수거 입력에서
                   차량·기사 칸이 사라집니다. 매번 같은 값을 고르지 않아도
                   되고, 기록에 남는 이름은 **로그인한 본인**입니다. */}
              {r.role !== 'client' && (
                <div className={`${openRows[r.id] ? 'flex' : 'hidden sm:flex'} mt-2.5 flex-wrap items-center gap-2 rounded-2xl bg-teal-50/60 px-3.5 py-2.5`}>
                  <span className="t-muted shrink-0 font-bold text-teal-700">담당 차량</span>
                  <select
                    data-user-vehicle={r.id}
                    disabled={busy}
                    aria-label={`${r.name || r.email} 담당 차량`}
                    value={r.vehicleId ?? ''}
                    onChange={(e) =>
                      void change(
                        () => setProfileVehicle(r.id, e.target.value || null),
                        e.target.value ? '담당 차량을 지정했습니다.' : '담당 차량을 해제했습니다.',
                      )
                    }
                    className="min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2 text-[1.02rem] font-bold text-navy-900"
                  >
                    <option value="">묶지 않음 (수거 입력에서 매번 고름)</option>
                    {data.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.wasteType})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 병원 계정 — 어느 병원 소속인지, 그리고 바꾸는 길 */}
              {r.role === 'client' && (
                <div className={`${openRows[r.id] ? 'flex' : 'hidden sm:flex'} mt-2.5 flex-wrap items-center gap-2 rounded-2xl bg-sky-50/70 px-3.5 py-2.5`}>
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
        {approvedRows.length === 0 && !busy && (
          <p className="t-body bg-white px-4 py-4 text-navy-400">사용 중인 계정이 없습니다.</p>
        )}
      </div>

      <p className="t-muted break-keep">
        비밀번호는 이 시스템에 저장되지 않습니다. 임시 비밀번호는 만든 사람이 직접 전해 주시고, 받은 분은 첫
        로그인 뒤 「설정 → 비밀번호 변경」에서 바꾸도록 안내해 주세요. 본인이 가입 신청한 계정은 승인하기
        전까지 로그인해도 아무 정보도 볼 수 없습니다 — 화면에서 가리는 것이 아니라 서버가 막습니다.
      </p>
    </div>
  )
}

/**
 * 승인 대기 한 줄 — 역할을 정해서 들여보내거나, 거절합니다.
 *
 *  기본값은 현장 담당자입니다. 승인은 눌러야 하는 일이고, 잘못 눌렀을 때
 *  피해가 가장 작은 쪽이 기본값이어야 합니다.
 */
function PendingRow({
  row,
  clients,
  busy,
  onApprove,
  onReject,
}: {
  row: ProfileRow
  clients: { id: string; name: string }[]
  busy: boolean
  onApprove: (role: UserRole, clientId: string | null) => void
  onReject: () => void
}) {
  const [role, setRole] = useState<UserRole>('field')
  const [clientId, setClientId] = useState('')
  const missingClient = role === 'client' && !clientId

  const applied = new Date(row.createdAt)
  const appliedLabel = Number.isNaN(applied.getTime())
    ? ''
    : `${applied.getMonth() + 1}월 ${applied.getDate()}일 신청`

  return (
    <div data-pending-row={row.id} className="bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="t-body break-keep font-extrabold text-navy-900">{row.name || row.email}</p>
        <p className="t-muted break-keep">{row.email}</p>
        {appliedLabel && <p className="t-muted ml-auto shrink-0 text-navy-400">{appliedLabel}</p>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="t-muted shrink-0 font-bold text-navy-500">역할</span>
        <div className="flex flex-wrap gap-1">
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              disabled={busy}
              onClick={() => setRole(r)}
              className={`rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-40 ${
                role === r ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {role === 'client' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50/70 px-3.5 py-2.5">
          <span className="t-muted shrink-0 font-bold text-sky-700">소속 병원</span>
          <select
            disabled={busy}
            aria-label={`${row.name || row.email} 소속 병원`}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2 text-[1.02rem] font-bold text-navy-900"
          >
            <option value="">병원을 선택하세요</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={busy || missingClient}
          title={missingClient ? '소속 병원을 골라 주세요' : ''}
          onClick={() => onApprove(role, clientId || null)}
          className="btn-primary disabled:opacity-40"
        >
          <Check size={17} strokeWidth={2.6} /> {ROLE_LABEL[role]}(으)로 승인
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                `${row.name || row.email} (${row.email}) 의 가입 신청을 거절합니다.\n\n` +
                  '계정이 삭제되며, 본인은 필요하면 다시 신청할 수 있습니다. 진행할까요?',
              )
            ) {
              onReject()
            }
          }}
          className="btn-ghost text-rose-600 disabled:opacity-40"
        >
          <X size={17} strokeWidth={2.4} /> 거절
        </button>
      </div>
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
