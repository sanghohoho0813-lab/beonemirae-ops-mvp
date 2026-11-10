import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, HardDriveDownload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { lastSnapshot, type LastSnapshot } from '../lib/repo'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 「마지막으로 전체 스냅샷을 받은 날」
//
//  Supabase 무료 플랜에는 자동 백업이 없습니다. 설정 화면에서 내려받는 전체 스냅샷이
//  **유일한 백업**입니다. 그런데 언제 마지막으로 받았는지 화면 어디에도 없어서,
//  「받아 둔 줄 알았는데 석 달 전」이 될 수 있었습니다.
//
//  받을 때 감사기록에 한 줄을 남기고(repo.recordSnapshot), 여기서 그 줄을 읽습니다.
//  새 표 · 새 SQL 은 없습니다. 감사기록은 관리자만 읽히므로 관리자에게만 보입니다.
//
//  ⚠ 「기록이 없다」와 「받은 적이 없다」는 다릅니다. 이 기능이 생기기 전에 받은 파일은
//    기록이 없습니다 — 그래서 「받은 기록이 없습니다」라고만 말합니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 날수가 지나면 알립니다 — docs/RESTORE.md 의 「한 달에 한 번」 */
export const BACKUP_REMIND_DAYS = 30

type Loaded = { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; last: LastSnapshot | null }

//  첫 화면과 설정 화면이 같은 답을 씁니다 (한 번만 묻고, 받으면 다시 묻습니다)
let cache: Promise<LastSnapshot | null> | null = null
const listeners = new Set<() => void>()

/** 방금 스냅샷을 받았습니다 — 열려 있는 화면들이 다시 읽습니다 */
export function refreshLastSnapshot() {
  cache = null
  listeners.forEach((fn) => fn())
}

/** 한국 날짜로 며칠 전인가 (오늘 = 0) */
export function daysSince(at: string): number {
  const day = new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.max(0, Math.round((utc(today()) - utc(day)) / 86400000))
}

export function useLastSnapshot(): Loaded {
  const { role, mode } = useAuth()
  const on = mode === 'live' && role === 'admin'
  const [v, setV] = useState<Loaded>({ state: 'loading' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const again = () => setTick((n) => n + 1)
    listeners.add(again)
    return () => {
      listeners.delete(again)
    }
  }, [])

  useEffect(() => {
    if (!on) return
    let alive = true
    cache ??= lastSnapshot()
    const mine = cache
    mine
      .then((last) => alive && setV({ state: 'ready', last }))
      .catch(() => {
        //  통신이 끊겼거나 권한이 없으면 아무 말도 하지 않습니다 — 모르는 것을 「없다」고 하지 않습니다
        if (cache === mine) cache = null
        if (alive) setV({ state: 'unavailable' })
      })
    return () => {
      alive = false
    }
  }, [on, tick])

  return on ? v : { state: 'unavailable' }
}

/** 알릴 일이 있는가 — 기록 없음 · 한 달 넘음 · 마지막 것이 반쪽 */
export function backupDue(last: LastSnapshot | null): 'none' | 'old' | 'partial' | null {
  if (!last) return 'none'
  if (!last.complete) return 'partial'
  return daysSince(last.at) >= BACKUP_REMIND_DAYS ? 'old' : null
}

/** 첫 화면의 한 줄 — 알릴 일이 없으면 이 자리도 없습니다 (관리자 · 운영 연결에서만) */
export function BackupLine({ className = '' }: { className?: string } = {}) {
  const v = useLastSnapshot()
  if (v.state !== 'ready') return null
  const due = backupDue(v.last)
  if (!due) return null
  return (
    <Link
      to="/settings#backup"
      data-backup-line={due}
      className={`flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-card transition hover:bg-navy-50 ${className}`}
    >
      <HardDriveDownload size={17} className="shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 break-keep text-[1.02rem] font-bold text-navy-700">
        {due === 'none'
          ? '전체 스냅샷을 받은 기록이 없습니다'
          : due === 'partial'
            ? '마지막 전체 스냅샷이 반쪽이었습니다 (못 읽은 표가 있었음)'
            : `전체 스냅샷을 받은 지 ${daysSince(v.last!.at)}일 지났습니다`}
        <span className="font-semibold text-navy-500"> · 무료 서버에는 자동 백업이 없습니다</span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-navy-400" strokeWidth={2.6} />
    </Link>
  )
}

/** 설정 화면 스냅샷 카드 안의 한 줄 — 언제 · 누가 */
export function BackupLastNote() {
  const v = useLastSnapshot()
  if (v.state !== 'ready') return null
  const due = backupDue(v.last)
  const days = v.last ? daysSince(v.last.at) : 0
  const day = v.last ? new Date(v.last.at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : ''
  return (
    <p
      data-snapshot-last={due ?? 'fresh'}
      className={`t-body mt-3 break-keep rounded-xl px-3 py-2.5 font-bold ${
        due ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'
      }`}
    >
      {!v.last ? (
        <>마지막으로 받은 기록이 없습니다 — 지금 한 번 받아 회사 밖(개인 드라이브 등)에 두세요.</>
      ) : (
        <>
          마지막으로 받은 날 {day} ({days === 0 ? '오늘' : `${days}일 전`}
          {v.last.by ? ` · ${v.last.by}` : ''})
          {due === 'partial' && ' — 못 읽은 표가 있던 반쪽 파일입니다. 다시 받아 주세요.'}
          {due === 'old' && ` — ${BACKUP_REMIND_DAYS}일이 지났습니다. 다시 받아 주세요.`}
        </>
      )}
    </p>
  )
}
