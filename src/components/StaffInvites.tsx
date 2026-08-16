import { useMemo, useState } from 'react'
import { Mail, Trash2, UserPlus, X } from 'lucide-react'
import { useAuth, ROLE_LABEL, type UserRole } from '../context/AuthContext'
import { useData } from '../context/DataContext'

// ─────────────────────────────────────────────────────────────────────────────
// 사전 등록 (초대) — 0056
//
//  대표님 말씀: "그 담당자 아이디들도 그냥 내가 다 따로 만들어 주는 게 좋을 것
//  같아."
//
//  여기서 이메일·역할·차량·담당 거래처를 미리 적어 둡니다. 그 이메일로 가입하면
//  적어 둔 대로 바로 붙고 승인도 자동입니다 — 기사님이 가입한 뒤 대표님이 다시
//  승인을 누를 때까지 기다리지 않습니다.
//
//  **비밀번호는 여기서 정하지 않습니다.** 본인이 가입 화면에서 직접 정합니다.
//  대표님이 정해 주면 그 값을 카톡으로 보내게 되고, 그 방이 그대로 남습니다.
//
//  이미 가입한 이메일은 여기서 못 덮습니다 — 역할·담당은 위 계정 목록에서
//  바꿉니다. (서버가 같은 규칙으로 다시 막습니다)
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_ROLES: Exclude<UserRole, 'client'>[] = ['field', 'office', 'admin']

export function StaffInvites() {
  const { data, saveStaffInvite, removeStaffInvite } = useData()
  const { role, mode } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<UserRole, 'client'>>('field')
  const [vehicleId, setVehicleId] = useState('')
  const [clientIds, setClientIds] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const invites = useMemo(
    () => (data.staffInvites ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data.staffInvites],
  )
  const waiting = invites.filter((i) => !i.usedAt)
  const used = invites.filter((i) => i.usedAt)
  const clients = useMemo(
    () => data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [data.clients],
  )
  const shown = filter.trim() ? clients.filter((c) => c.name.includes(filter.trim())) : clients

  if (role !== 'admin' || mode !== 'live') return null

  function reset() {
    setEmail('')
    setName('')
    setInviteRole('field')
    setVehicleId('')
    setClientIds([])
    setNote('')
    setFilter('')
  }

  async function save() {
    setBusy(true)
    setError(null)
    setDone(null)
    const r = await saveStaffInvite({
      email, name, role: inviteRole,
      vehicleId: vehicleId || null,
      clientIds,
      note,
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '등록하지 못했습니다.')
      return
    }
    setDone(`${email.trim().toLowerCase()} 을(를) 사전 등록했습니다. 이 주소로 가입하면 바로 쓸 수 있습니다.`)
    setOpen(false)
    reset()
  }

  async function drop(target: string) {
    if (!window.confirm(`${target} 사전 등록을 지울까요?`)) return
    setError(null)
    setDone(null)
    const r = await removeStaffInvite(target)
    if (!r.ok) setError(r.error ?? '지우지 못했습니다.')
  }

  return (
    <div data-staff-invites className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Mail size={19} strokeWidth={2.4} className="shrink-0 text-teal-600" />
        <h2 className="t-card text-navy-900">직원 사전 등록</h2>
        <button data-invite-open onClick={() => setOpen((v) => !v)} className="btn-navy ml-auto">
          {open ? <X size={17} strokeWidth={2.4} /> : <UserPlus size={17} strokeWidth={2.4} />}
          {open ? '닫기' : '사전 등록'}
        </button>
      </div>

      <p className="t-muted mt-2 break-keep text-navy-400">
        미리 적어 두면 그 이메일로 가입하는 순간 역할·차량·담당 거래처가 붙고 바로 씁니다. 비밀번호는 본인이
        가입 화면에서 정합니다 — 여기서 정해 주지 않습니다.
      </p>

      {open && (
        <div data-invite-form className="mt-3 space-y-3 rounded-2xl bg-navy-50/70 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">이메일 *</label>
              <input
                data-invite-email
                className="field-input"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@beonemirae.co.kr"
              />
            </div>
            <div>
              <label className="field-label">이름</label>
              <input
                data-invite-name
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 김준기"
              />
            </div>
          </div>

          <div>
            <label className="field-label">역할 *</label>
            <div className="grid grid-cols-3 gap-2">
              {INVITE_ROLES.map((r) => (
                <button
                  key={r}
                  data-invite-role={r}
                  aria-pressed={inviteRole === r}
                  onClick={() => setInviteRole(r)}
                  className={`rounded-xl px-3 py-3 text-[1.05rem] font-extrabold transition active:scale-[0.97] ${
                    inviteRole === r ? 'bg-navy-900 text-white' : 'bg-white text-navy-500'
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {/*  차량을 묶어 두면 수거 입력에서 차량·기사 칸이 사라집니다 —
               기사님이 매번 같은 값을 고르지 않아도 됩니다. */}
          <div>
            <label className="field-label">차량 (선택)</label>
            <select
              data-invite-vehicle
              className="field-input"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">묶지 않음</option>
              {data.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.wasteType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">담당 거래처 (선택 · {clientIds.length}곳)</label>
            <input
              data-invite-filter
              className="field-input mb-2"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="거래처 이름으로 찾기"
            />
            <div className="max-h-52 overflow-y-auto rounded-2xl bg-white p-2">
              <div className="flex flex-wrap gap-1.5">
                {shown.map((c) => {
                  const on = clientIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      data-invite-client={c.id}
                      aria-pressed={on}
                      onClick={() =>
                        setClientIds((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                      }
                      className={`rounded-full px-3 py-1.5 text-[0.98rem] font-bold transition ${
                        on ? 'bg-teal-600 text-white' : 'bg-navy-50 text-navy-500'
                      }`}
                    >
                      {c.name}
                    </button>
                  )
                })}
                {shown.length === 0 && <p className="t-muted p-2 text-navy-400">찾는 거래처가 없습니다.</p>}
              </div>
            </div>
            <p className="t-muted mt-1.5 break-keep text-navy-400">
              한 곳도 고르지 않으면 이 사람은 모든 거래처를 봅니다. 한 곳이라도 고르면 그 거래처만 보입니다.
            </p>
          </div>

          <div>
            <label className="field-label">메모 (선택)</label>
            <input
              data-invite-note
              className="field-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 의료폐기물 담당"
            />
          </div>

          <button
            data-invite-save
            disabled={busy || !email.trim()}
            onClick={() => void save()}
            className="btn-navy w-full justify-center disabled:opacity-50"
          >
            사전 등록하기
          </button>
        </div>
      )}

      {error && (
        <p data-invite-error className="t-body mt-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">
          {error}
        </p>
      )}
      {done && !error && (
        <p data-invite-done className="t-body mt-3 break-keep rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-700">
          {done}
        </p>
      )}

      {waiting.length > 0 && (
        <div className="mt-3 divide-y divide-navy-50 overflow-hidden rounded-2xl bg-navy-50/60">
          {waiting.map((i) => (
            <div key={i.email} data-invite-row={i.email} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="t-body break-keep font-extrabold text-navy-900">
                  {i.name || i.email}
                  <span className="ml-2 text-[0.95rem] font-bold text-navy-400">{ROLE_LABEL[i.role]}</span>
                </p>
                <p className="t-muted break-keep text-navy-400">
                  {i.email}
                  {i.vehicleId && ` · ${data.vehicles.find((v) => v.id === i.vehicleId)?.name ?? '차량'}`}
                  {i.clientIds.length > 0 && ` · 담당 ${i.clientIds.length}곳`}
                  {i.note && ` · ${i.note}`}
                </p>
              </div>
              <span className="pill bg-amber-50 text-amber-700">가입 대기</span>
              <button
                data-invite-drop={i.email}
                onClick={() => void drop(i.email)}
                className="shrink-0 rounded-xl bg-navy-50 p-2 text-navy-400 transition hover:text-rose-500"
                aria-label={`${i.email} 사전 등록 지우기`}
              >
                <Trash2 size={17} strokeWidth={2.3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/*  이미 가입한 초대도 남깁니다 — 「이 사람 권한을 왜 이렇게 줬더라」의
           근거입니다. 지울 수는 없습니다(서버가 막습니다). */}
      {used.length > 0 && (
        <p data-invite-used className="t-muted mt-2 break-keep text-navy-400">
          가입 완료 {used.length}명 — {used.map((i) => i.name || i.email).join(' · ')}
        </p>
      )}
    </div>
  )
}
