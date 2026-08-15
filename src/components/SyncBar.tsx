import { AlertTriangle, CloudOff, Loader2, RotateCw, X } from 'lucide-react'
import { useData } from '../context/DataContext'

// ─────────────────────────────────────────────────────────────────────────────
// 서버 통신 상태 표시
//
//  실제 사용 시스템이므로 네트워크 오류를 숨기지 않습니다.
//  저장 실패 시 입력값을 지우지 않고, 같은 작업을 그대로 재시도할 수 있게 합니다.
// ─────────────────────────────────────────────────────────────────────────────

export function SyncBar() {
  const { mode, sync, retry, clearSyncError } = useData()
  if (mode !== 'live') return null

  if (sync.error) {
    return (
      <div
        data-sync-error
        className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 bg-rose-600 px-4 py-3 text-white sm:px-6"
      >
        <AlertTriangle size={19} className="shrink-0" strokeWidth={2.6} />
        <p className="t-body min-w-0 flex-1 break-keep font-bold">{sync.error}</p>
        <button
          onClick={() => void retry()}
          className="shrink-0 rounded-full bg-white/20 px-3.5 py-1.5 text-[1rem] font-extrabold transition hover:bg-white/30"
        >
          <RotateCw size={14} className="mr-1 inline -translate-y-px" />
          다시 시도
        </button>
        <button onClick={clearSyncError} aria-label="닫기" className="shrink-0 rounded-full p-1.5 hover:bg-white/20">
          <X size={16} />
        </button>
      </div>
    )
  }

  if (sync.loading || sync.saving) {
    return (
      <div className="sticky top-0 z-40 flex items-center gap-2.5 bg-navy-900 px-4 py-2.5 text-white sm:px-6">
        <Loader2 size={17} className="shrink-0 animate-spin" />
        <p className="t-body font-bold">{sync.saving ? '저장 중…' : '불러오는 중…'}</p>
      </div>
    )
  }

  return null
}

/** 오프라인 알림 — 통신이 끊긴 상태를 현장에서 바로 알 수 있게 합니다. */
export function OfflineBar({ online }: { online: boolean }) {
  if (online) return null
  return (
    <div className="sticky top-0 z-40 flex items-center gap-2.5 bg-amber-500 px-4 py-2.5 text-white sm:px-6">
      <CloudOff size={17} className="shrink-0" strokeWidth={2.6} />
      <p className="t-body break-keep font-bold">
        네트워크에 연결되어 있지 않습니다. 입력한 내용은 사라지지 않으니 연결 후 다시 저장해 주세요.
      </p>
    </div>
  )
}
