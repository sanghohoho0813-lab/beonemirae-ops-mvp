import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Database, Loader2, RefreshCw, UserCog } from 'lucide-react'
import { useAuth, ROLE_LABEL, type UserRole } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { loadData } from '../lib/storage'
import {
  importFromLocal,
  loadProfiles,
  previewImport,
  setProfileActive,
  setProfileRole,
  type ImportPreview,
  type ProfileRow,
} from '../lib/repo'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 관리자 설정 패널 — 사용자 계정 / 브라우저 데이터 가져오기
//
//  복잡한 SaaS 관리자 패널은 만들지 않습니다. 실제 운영에 꼭 필요한
//  "누가 어떤 역할인지"와 "기존 브라우저 데이터를 서버로 올리기"만 제공합니다.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES: UserRole[] = ['admin', 'office', 'field']

/** 사용자 계정 현황 + 역할 변경 */
export function UserManagementCard() {
  const { mode, profile } = useAuth()
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const change = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  if (mode !== 'live') {
    return (
      <p className="t-body break-keep font-bold text-navy-400">
        사용자 계정 관리는 서버에 로그인한 실제 운영 모드에서만 사용할 수 있습니다.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={load} disabled={busy} className="btn-ghost disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />}
          새로고침
        </button>
        <span className="t-muted ml-auto font-bold text-navy-400">{rows.length}개 계정</span>
      </div>

      {error && <p className="t-body break-keep font-bold text-rose-600">{error}</p>}

      <div className="divide-y divide-navy-50 overflow-hidden rounded-2xl bg-navy-50/60">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-white px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="t-body break-keep font-extrabold text-navy-900">
                {r.name || r.email}
                {r.id === profile?.id && <span className="ml-2 font-bold text-teal-600">본인</span>}
              </p>
              <p className="t-muted break-keep">{r.email}</p>
            </div>

            <div className="flex flex-wrap gap-1">
              {ROLES.map((role) => (
                <button
                  key={role}
                  disabled={busy || r.id === profile?.id}
                  onClick={() => void change(() => setProfileRole(r.id, role))}
                  title={r.id === profile?.id ? '본인 역할은 변경할 수 없습니다' : ROLE_LABEL[role]}
                  className={`rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-50 ${
                    r.role === role ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-700'
                  }`}
                >
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>

            <button
              disabled={busy || r.id === profile?.id}
              onClick={() => void change(() => setProfileActive(r.id, !r.active))}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-50 ${
                r.active ? 'bg-teal-50 text-teal-700' : 'bg-navy-100 text-navy-500'
              }`}
            >
              {r.active ? '사용 중' : '비활성'}
            </button>
          </div>
        ))}
        {rows.length === 0 && !busy && (
          <p className="t-body bg-white px-4 py-4 text-navy-400">계정이 없습니다.</p>
        )}
      </div>

      <p className="t-muted break-keep">
        계정 생성은 Supabase 대시보드(Authentication → Users)에서 초대하거나 직접 추가합니다. 공개 가입은
        제공하지 않으며, 비밀번호는 이 시스템에 저장되지 않습니다. 본인 계정의 역할·활성 상태는 실수를 막기 위해
        스스로 바꿀 수 없습니다.
      </p>
    </div>
  )
}

/** 브라우저(localStorage) 데이터 → 서버 가져오기 */
export function ImportLocalCard() {
  const { mode } = useAuth()
  const { reload } = useData()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (mode !== 'live') {
    return (
      <p className="t-body break-keep font-bold text-navy-400">
        서버에 로그인한 뒤 이 브라우저에 저장된 실제 데이터를 올릴 수 있습니다.
      </p>
    )
  }

  const scan = () => {
    setError(null)
    setDone(null)
    // 로컬 저장소를 그대로 읽어 무엇이 올라갈지 먼저 보여줍니다.
    setPreview(previewImport(loadData()))
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await importFromLocal(loadData())
      setDone(
        `거래처 ${res.clients - res.skipped}건 신규 · ${res.skipped}건 기존 연결 · 일정 ${res.schedules}건 · 자재 ${res.materials}건 · 메모 ${res.notes}건을 가져왔습니다.`,
      )
      setPreview(null)
      await reload()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={scan} disabled={busy} className="btn-ghost w-full justify-start disabled:opacity-60">
        <Database size={17} strokeWidth={2.4} /> 현재 브라우저 데이터 확인하기
      </button>

      {preview && (
        <div className="rounded-2xl bg-navy-50 px-4 py-3.5">
          <p className="t-body font-extrabold text-navy-900">가져올 내용</p>
          <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {[
              ['거래처', preview.clients],
              ['일정', preview.schedules],
              ['수거이력(이벤트)', preview.events],
              ['자재 기록', preview.materials],
              ['현장 메모', preview.notes],
              ['청구·입금', preview.payments],
            ].map(([label, n]) => (
              <p key={String(label)} className="t-body text-navy-600">
                {label} <span className="font-extrabold text-navy-900">{n}건</span>
              </p>
            ))}
          </div>
          <p className="t-muted mt-2.5 break-keep font-bold text-amber-700">
            <AlertTriangle size={13} className="mr-1 inline -translate-y-px" />
            시연용으로 생성된 거래처 {preview.demoClients}곳과 시연 세션 기록은 올리지 않습니다. 이름·주소가 같은
            거래처는 이미 등록된 것으로 보고 중복 생성하지 않습니다.
          </p>
          <button onClick={() => void run()} disabled={busy} className="btn-navy mt-3.5 w-full disabled:opacity-60">
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" /> 가져오는 중…
              </>
            ) : (
              '확인했습니다 · 서버로 가져오기'
            )}
          </button>
        </div>
      )}

      {done && <p className="t-body break-keep font-bold text-teal-600">{done}</p>}
      {error && <p className="t-body break-keep font-bold text-rose-600">{error}</p>}

      <p className="t-muted break-keep">
        <UserCog size={13} className="mr-1 inline -translate-y-px" />
        가져오기는 서버가 새 id 를 발급하므로 기존 데이터와 id 가 충돌하지 않습니다. 실행 전 위의 목록을 반드시
        확인해 주세요.
      </p>
    </div>
  )
}
