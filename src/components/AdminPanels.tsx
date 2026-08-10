import { useState } from 'react'
import { AlertTriangle, Database, Loader2, UserCog } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { loadData } from '../lib/storage'
import { importFromLocal, previewImport, type ImportPreview } from '../lib/repo'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 관리자 설정 패널 — 브라우저 데이터 가져오기
//
//  사용자 계정은 components/UserAdmin.tsx 로 옮겼습니다 (계정 생성·비밀번호
//  초기화까지 들어가면서 한 카드에 담기에 커졌습니다).
// ─────────────────────────────────────────────────────────────────────────────

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
