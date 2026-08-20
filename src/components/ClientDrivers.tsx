import { useEffect, useMemo, useState } from 'react'
import { Loader2, UserCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { loadProfiles, type ProfileRow } from '../lib/repo'
import { friendlyError } from '../lib/supabase'
import { isTestAccount } from '../lib/testAccounts'

// ─────────────────────────────────────────────────────────────────────────────
// 담당 기사 (0056)
//
//  대표님 말씀: "기사님들마다 본인이 배정받은 거래처만 보이게 하는 게 좋을 것
//  같거든. 50여 개의 거래처를 전부 다 공유하지는 않을 것 같아. 거래처에서
//  담당 기사를 클릭해서 선택할 수 있게."
//
//  여기서 고른 사람에게만 이 거래처가 보입니다. 화면에서 숨기는 것이 아니라
//  서버(RLS)가 막습니다 — 주소를 직접 쳐도 안 열립니다.
//
//  **아무도 안 고른 상태**가 기본입니다. 그때는 지금까지처럼 모든 기사에게
//  보입니다. 「배정을 켰더니 기사 화면이 텅 비었다」가 제일 위험한 실패라서,
//  한 사람이라도 배정이 붙은 그 사람만 좁아지게 했습니다.
//
//  관리자에게만 보입니다. 사무실 담당자에게도 안 보입니다 — 서버가 관리자만
//  받으므로, 여기서 보여 주면 누를 수는 있는데 계속 거절당하는 화면이 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export function ClientDrivers({ clientId }: { clientId: string }) {
  const { data, setClientDrivers } = useData()
  const { role, mode } = useAuth()
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const isAdmin = role === 'admin'

  //  기사 명단은 계정 표에서 옵니다. AppData 에는 계정이 없습니다.
  useEffect(() => {
    if (!isAdmin || mode !== 'live') return
    let alive = true
    loadProfiles()
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(friendlyError(e)))
    return () => {
      alive = false
    }
  }, [isAdmin, mode])

  //  배정할 수 있는 사람 — 쓰고 있는 직원 계정만. 병원 계정은 서버가 거절합니다.
  //
  //  ⚠ 점검하며 만든 계정(「[검증]…」, 「김상호(테스트용)」)은 여기서 뺍니다.
  //    실제 거래처에 배정할 사람이 아닌데 목록에 섞여 있으면, 누르다 잘못
  //    배정되고 그 순간 **그 거래처가 진짜 기사에게서 사라집니다**
  //    (한 명이라도 배정되면 그 사람에게만 보이는 규칙이라서).
  //    계정을 지우는 것이 아니라 **고르는 목록에서만** 뺍니다.
  const staff = useMemo(
    () =>
      rows
        .filter((r) => r.active && (r.role === 'field' || r.role === 'office' || r.role === 'admin'))
        .filter((r) => !isTestAccount(r.name, r.email))
        .sort((a, b) => {
          //  기사(현장)를 먼저 — 실제로 고르는 사람이 거의 현장입니다.
          if (a.role !== b.role) return a.role === 'field' ? -1 : b.role === 'field' ? 1 : 0
          return (a.name || a.email).localeCompare(b.name || b.email, 'ko')
        }),
    [rows],
  )

  const assigned = useMemo(
    () =>
      new Set(
        (data.clientAssignments ?? []).filter((a) => a.clientId === clientId).map((a) => a.profileId),
      ),
    [data.clientAssignments, clientId],
  )

  if (!isAdmin || mode !== 'live') return null

  async function toggle(profileId: string) {
    const next = new Set(assigned)
    if (next.has(profileId)) next.delete(profileId)
    else next.add(profileId)
    setBusy(true)
    setError(null)
    setDone(null)
    const r = await setClientDrivers(clientId, [...next])
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '바꾸지 못했습니다.')
      return
    }
    const who = staff.find((s) => s.id === profileId)
    setDone(
      next.size === 0
        ? '담당을 비웠습니다 — 이 거래처는 다시 모든 기사에게 보입니다.'
        : next.has(profileId)
          ? `${who?.name || who?.email} 님에게 이 거래처가 보입니다.`
          : `${who?.name || who?.email} 님 담당에서 뺐습니다.`,
    )
  }

  return (
    <div data-client-drivers className="mt-4 border-t border-navy-50 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <UserCheck size={18} strokeWidth={2.4} className="shrink-0 text-teal-600" />
        <p className="t-body font-extrabold text-navy-900">담당 기사</p>
        {busy && <Loader2 size={15} className="animate-spin text-navy-300" />}
      </div>

      {/*  대표님 요청 — 누르는 규칙을 옆에 적어 둡니다. 안 적으면 이미 배정된
           사람을 한 번 더 눌러서 **모르는 사이에 해제**됩니다. */}
      <p data-drivers-howto className="t-muted mb-2 break-keep text-navy-400">
        한 번 누르면 배정, 다시 누르면 해제됩니다.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {staff.map((s) => {
          const on = assigned.has(s.id)
          return (
            <button
              key={s.id}
              data-driver-pick={s.id}
              aria-pressed={on}
              disabled={busy}
              onClick={() => void toggle(s.id)}
              className={`rounded-full px-3.5 py-2 text-[1rem] font-extrabold transition active:scale-[0.97] disabled:opacity-50 ${
                on ? 'bg-teal-600 text-white shadow-sm' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
              }`}
            >
              {s.name || s.email}
              {s.role !== 'field' && <span className="ml-1 text-[0.85rem] font-bold opacity-70">사무</span>}
            </button>
          )
        })}
        {staff.length === 0 && !error && (
          <p className="t-muted text-navy-400">배정할 직원 계정이 없습니다.</p>
        )}
      </div>

      {/*  아무도 안 골랐을 때 무슨 일이 일어나는지 적어 둡니다. 안 적으면
           「배정 안 하면 아무도 못 본다」로 읽고 50곳을 손으로 다 누릅니다. */}
      <p data-drivers-note className="t-muted mt-2 break-keep text-navy-400">
        {assigned.size === 0
          ? '아무도 고르지 않으면 모든 기사에게 보입니다. 한 명이라도 고르면 그 사람에게만 보입니다.'
          : `고른 ${assigned.size}명에게만 이 거래처와 수거 일정이 보입니다. 관리자·사무실은 그대로 전부 봅니다.`}
      </p>

      {error && <p className="t-muted mt-2 break-keep font-bold text-rose-600">{error}</p>}
      {done && !error && <p data-drivers-done className="t-muted mt-2 break-keep font-bold text-emerald-700">{done}</p>}
    </div>
  )
}
