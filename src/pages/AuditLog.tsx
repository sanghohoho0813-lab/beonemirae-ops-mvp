import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react'
import { PageShell } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { useAuth, ROLE_LABEL, type UserRole } from '../context/AuthContext'
import { loadAuditLogs, type AuditRow } from '../lib/repo'
import { friendlyError } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// 감사로그 (관리자 전용)
//
//  누가 · 언제 · 어떤 거래처에 · 무엇을 했는지 그대로 보여줍니다.
//  복잡한 관리자 시스템을 만들지 않고, 조회와 새로고침만 제공합니다.
// ─────────────────────────────────────────────────────────────────────────────

//  화면에 한 번에 불러오는 건수. 이 수만큼 찼으면 그 이전 기록이 더 있다는
//  뜻이므로 아래 안내 문구가 달라집니다("최근 200건" 만 적어 두면 그게
//  전부인 줄 알고 "그런 기록은 없다" 고 판단하게 됩니다).
const AUDIT_LIMIT = 200

//  감사기록에 새 동작을 추가하면 **여기에 한국어 이름도 같이 넣어야 합니다.**
//  빠뜨리면 화면에 'profile.create' 같은 영어 코드가 그대로 나가고, 직원은
//  그게 무슨 일인지 알 수 없습니다. (23번 검사가 이것을 잡습니다 — 실제로
//  계정 관리·엑셀 가져오기를 만들면서 네 개를 빠뜨렸습니다)
const ACTION_LABEL: Record<string, string> = {
  'collection.complete': '수거 완료',
  'collection.revert': '수거 완료 취소',
  'client.create': '거래처 등록',
  'client.update': '거래처 수정',
  'client.deactivate': '거래처 비활성화',
  'schedule.create': '일정 생성',
  'schedule.update': '일정 수정',
  'schedule.delete': '일정 삭제',
  'schedule.complete': '수거 완료 처리',
  'material.supply': '자재 공급',
  'material.delete': '자재 공급 삭제',
  'stock.receive': '자재 입고',
  'payment.create': '청구 등록',
  'payment.confirm': '청구 확정',
  'payment.cancel': '청구 취소',
  'payment.paid': '입금 완료',
  'payment.update': '청구 상태 변경',
  'vehicle.create': '차량 등록',
  'vehicle.update': '차량 수정',
  'vehicle.deactivate': '차량 비활성화',
  'profile.create': '계정 생성',
  'profile.role': '역할 변경',
  'profile.active': '계정 사용·중지',
  'profile.password': '비밀번호 초기화',
  'profile.client': '병원 계정 소속 변경',
  'import.excel': '엑셀 가져오기',
  'request.handle': '병원 요청 처리',
  'proposal.share': '제안 공유',
  'proposal.respond': '병원이 제안에 응답', // DB 함수(respond_to_proposal)가 남깁니다
  'lead.stage': '영업 진행상태 변경',
  'lead.revenue': '전환 매출 기록',
  'data.import': '데이터 가져오기',
  'demo.reset': '시연 데이터 초기화',
}

const fmtAt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function AuditLog() {
  const { mode, role } = useAuth()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (mode !== 'live') return
    setLoading(true)
    setError(null)
    try {
      setRows(await loadAuditLogs(AUDIT_LIMIT))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageShell>
      <PageHeader
        title="감사로그"
        subtitle="누가 · 언제 · 어떤 작업을 했는지 기록합니다"
        action={
          <button onClick={load} disabled={loading} className="btn-ghost shrink-0 disabled:opacity-60">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} strokeWidth={2.4} />}
            새로고침
          </button>
        }
      />

      {mode !== 'live' ? (
        <div className="card flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <ShieldAlert size={22} className="shrink-0 text-amber-500" />
          <p className="t-body min-w-0 flex-1 break-keep font-bold text-navy-500">
            감사로그는 서버(Supabase)에 로그인한 실제 운영 모드에서만 기록·조회됩니다. 현재는 시연 모드입니다.
          </p>
        </div>
      ) : error ? (
        <div className="card p-5 sm:p-6">
          <p className="t-body break-keep font-bold text-rose-600">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-5 sm:p-6">
          <p className="t-body text-navy-400">{loading ? '불러오는 중…' : '아직 기록된 작업이 없습니다.'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-navy-50">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-5 py-4">
                <p className="t-body w-full shrink-0 font-bold text-navy-400 sm:w-[10.5rem]">{fmtAt(r.at)}</p>
                <div className="min-w-0 flex-1">
                  <p className="t-body break-keep font-extrabold text-navy-900">
                    {r.actorName || '알 수 없음'}
                    {r.actorRole && (
                      <span className="ml-2 font-bold text-navy-400">
                        {ROLE_LABEL[r.actorRole as UserRole] ?? r.actorRole}
                      </span>
                    )}
                  </p>
                  <p className="t-body mt-0.5 break-keep text-navy-600">{r.summary}</p>
                  {r.screen && <p className="t-muted mt-0.5">입력 화면 · {r.screen}</p>}
                </div>
                <span className="pill shrink-0 bg-navy-50 text-navy-600">
                  {ACTION_LABEL[r.action] ?? r.action}
                </span>
              </div>
            ))}
          </div>
          <p className="t-muted border-t border-navy-100 px-5 py-3.5">
            <ScrollText size={14} className="mr-1.5 inline -translate-y-px" />
            최근 {rows.length}건
            {rows.length >= AUDIT_LIMIT && '만 화면에 나옵니다 (그 이전 기록도 서버에는 그대로 남아 있습니다)'}.
            감사로그는 수정·삭제할 수 없습니다{role === 'admin' ? ' (관리자도 동일)' : ''}.
          </p>
        </div>
      )}
    </PageShell>
  )
}
