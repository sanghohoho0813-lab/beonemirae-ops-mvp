import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, Loader2, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, FilterChip } from '../components/ui'
import { DevRequestButton } from '../components/DevRequestSheet'
import { useAuth, ROLE_LABEL } from '../context/AuthContext'
import { loadDevRequests, updateDevRequest, type DevRequestRow } from '../lib/repo'
import { DEV_REQUEST_STATUSES, DEV_STATUS_STYLE, type DevRequestStatus } from '../lib/devRequests'
import { friendlyError } from '../lib/supabase'
import { prettyDate } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 개발 요청함 (관리자 전용)
//
//  현장·사무실·대표가 보낸 요청이 한 화면에 쌓입니다. 누가 언제 무엇을
//  요청했는지 그대로 남고, 지울 수 없습니다(0022) — 불편했다는 기록이
//  사라지면 같은 문제가 반복돼도 알 수 없습니다.
//
//  기본 화면은 「남은 것」입니다. 처리 완료까지 전부 보이면 목록이 길어져
//  아직 답하지 않은 요청이 묻힙니다.
//
//  같은 항목을 여러 사람이 골랐다면 그것부터 봐야 합니다. 위에 몇 명이
//  골랐는지 세어 둡니다 — 한 사람의 불편과 모두의 불편은 다릅니다.
// ─────────────────────────────────────────────────────────────────────────────

type Tab = '남은 것' | '전체'

export function DevRequests() {
  const { mode } = useAuth()
  const [rows, setRows] = useState<DevRequestRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('남은 것')

  const load = useCallback(async () => {
    if (mode !== 'live') return
    setBusy(true)
    setError(null)
    try {
      setRows(await loadDevRequests())
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

  const open = useMemo(() => rows.filter((r) => r.status !== '처리 완료'), [rows])
  const shown = tab === '남은 것' ? open : rows

  //  여러 사람이 고른 항목 — 한 사람의 불편과 모두의 불편은 다릅니다.
  const hot = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of open) for (const t of r.topics) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  }, [open])

  if (mode !== 'live') {
    return (
      <div>
        <PageHeader title="개발 요청함" subtitle="직원들이 보낸 요청" />
        <p className="t-body break-keep font-bold text-navy-400">
          요청함은 서버에 로그인한 실제 운영 모드에서만 쓸 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="개발 요청함"
        subtitle={`남은 요청 ${open.length}건 · 전체 ${rows.length}건`}
        action={<DevRequestButton className="btn-navy" label="요청 보내기" />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['남은 것', '전체'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === '남은 것' ? `남은 것 ${open.length}` : `전체 ${rows.length}`}
          </FilterChip>
        ))}
        <button onClick={() => void load()} disabled={busy} className="btn-ghost ml-auto disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} strokeWidth={2.4} />}
          새로고침
        </button>
      </div>

      {error && (
        <p className="t-body mb-3 break-keep rounded-2xl bg-rose-50 px-4 py-3 font-bold text-rose-600">{error}</p>
      )}

      {/* 여러 사람이 같이 고른 것 — 먼저 볼 것 */}
      {hot.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4">
          <p className="t-card mb-2 break-keep text-amber-900">여러 사람이 함께 고른 항목</p>
          <ul className="space-y-1.5">
            {hot.map(([t, n]) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-lg bg-amber-500 px-2 py-0.5 text-[0.95rem] font-extrabold text-white">
                  {n}명
                </span>
                <span className="t-body min-w-0 break-keep font-bold text-amber-900">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === '남은 것' ? '남은 요청이 없습니다' : '아직 들어온 요청이 없습니다'}
          subtitle="직원들이 「더보기 → 개발자에게 요청하기」에서 보낼 수 있습니다."
        />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.id} data-dev-request={r.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className="t-body break-keep font-extrabold text-navy-900">{r.requesterName}</span>
                <span className="pill bg-navy-50 text-navy-500">{ROLE_LABEL[r.requesterRole]}</span>
                <span className={`pill ${DEV_STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="t-muted ml-auto shrink-0 text-navy-400">{prettyDate(r.createdAt.slice(0, 10))}</span>
              </div>

              {r.topics.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {r.topics.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      <span className="t-body min-w-0 break-keep font-bold text-navy-800">{t}</span>
                    </li>
                  ))}
                </ul>
              )}

              {r.message && (
                <p className="t-body mt-3 whitespace-pre-wrap break-keep rounded-2xl bg-navy-50 px-4 py-3 font-medium text-navy-700">
                  {r.message}
                </p>
              )}

              <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-navy-50 pt-3.5">
                <span className="t-muted mr-1 shrink-0 font-bold text-navy-500">처리</span>
                {DEV_REQUEST_STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={busy || r.status === s}
                    onClick={() => void change(() => updateDevRequest(r.id, { status: s as DevRequestStatus }))}
                    className={`rounded-full px-3 py-1.5 text-[0.95rem] font-extrabold transition disabled:opacity-100 ${
                      r.status === s ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-500 hover:text-navy-800'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <AdminNote row={r} busy={busy} onSave={(note) => change(() => updateDevRequest(r.id, { adminNote: note }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 관리자 메모 — 무엇을 하기로 했는지 적어 둡니다 (보낸 사람에게도 보입니다) */
function AdminNote({
  row,
  busy,
  onSave,
}: {
  row: DevRequestRow
  busy: boolean
  onSave: (note: string) => void
}) {
  const [text, setText] = useState(row.adminNote)
  const dirty = text.trim() !== row.adminNote.trim()

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="처리 메모 (예: 다음 배포에 반영)"
          aria-label={`${row.requesterName} 요청 처리 메모`}
          className="field-input min-w-0 flex-1"
        />
        <button
          disabled={busy || !dirty}
          onClick={() => onSave(text)}
          className="btn-ghost shrink-0 disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </div>
  )
}
