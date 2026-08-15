import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isPending, loadProfiles, type ProfileRow } from '../lib/repo'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 가입 승인 기다리는 사람
//
//  직원이 가입 신청을 해도 **관리자가 사용자 관리 화면을 열어 봐야** 압니다.
//  신청한 사람은 로그인해도 아무것도 안 보이니 「고장 났나」 하고 기다립니다.
//  그 사이에는 일을 못 합니다.
//
//  실제로 이 일이 있었습니다 — 직원이 신청한 걸 아무도 모르고 있었고,
//  신청자는 영문 메일과 오류 화면을 보며 자기가 뭘 잘못했다고 생각했습니다.
//
//  대기가 없으면 아무것도 그리지 않습니다. 있을 때만 말합니다.
//
//  ※ 이 조회는 관리자만 할 수 있습니다(profiles RLS). 사무실·현장 화면에서는
//    호출조차 하지 않습니다 — 막힐 요청을 보내 놓고 오류를 삼키지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/** 며칠째 기다리는가 (신청일 포함) */
function waitedDays(createdAt: string): number {
  const d = createdAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 0
  const a = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  const t = today()
  const b = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))
  return Math.max(0, Math.round((b - a) / 86400000))
}

function waitedLabel(days: number): string {
  if (days <= 0) return '오늘 신청'
  if (days === 1) return '어제 신청'
  return `${days}일째 기다리는 중`
}

export function PendingApprovals() {
  const { role, mode } = useAuth()
  const [rows, setRows] = useState<ProfileRow[]>([])

  useEffect(() => {
    if (mode !== 'live' || role !== 'admin') return
    let alive = true
    void loadProfiles()
      .then((all) => {
        if (alive) setRows(all.filter(isPending))
      })
      //  못 읽어도 화면을 망가뜨리지 않습니다. 이 칸이 없어도 사용자 관리
      //  화면에서 그대로 승인할 수 있습니다.
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [mode, role])

  if (rows.length === 0) return null

  //  가장 오래 기다린 사람이 먼저입니다.
  const sorted = rows.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const oldest = sorted[0]
  const days = waitedDays(oldest.createdAt)

  return (
    <Link
      to="/users"
      data-pending-approvals
      className={`card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 transition hover:bg-navy-50 sm:px-5 ${
        days >= 2 ? 'border-amber-200 bg-amber-50/60' : ''
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          days >= 2 ? 'bg-amber-100 text-amber-600' : 'bg-teal-50 text-teal-600'
        }`}
      >
        <UserPlus size={20} strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1 basis-[12rem]">
        <span className="t-body block break-keep font-extrabold text-navy-900">
          가입 승인을 기다리는 사람 {rows.length}명
        </span>
        <span className="t-muted mt-0.5 block break-keep" data-pending-detail>
          {oldest.name?.trim() || oldest.email} · {waitedLabel(days)}
          {rows.length > 1 ? ` 외 ${rows.length - 1}명` : ''} — 승인하면 바로 쓸 수 있습니다
        </span>
      </span>
      <span className="t-body shrink-0 font-bold text-navy-500">
        승인하러 가기 <ChevronRight size={17} className="inline -translate-y-px" />
      </span>
    </Link>
  )
}
