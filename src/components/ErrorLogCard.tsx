import { useEffect, useState } from 'react'
import { AlertOctagon, CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { recentErrors, type RecentErrors } from '../lib/repo'


// ─────────────────────────────────────────────────────────────────────────────
// 최근 오류
//
//  지금까지 저장이 실패하면 화면 위에 빨간 띠가 잠깐 떴다가, 다음 동작을
//  하면 사라졌습니다. 그것으로 끝이었습니다 — 「어제 저장이 안 됐다」고
//  하시면 확인할 자료가 아무 데도 없었습니다.
//
//  한 건씩 늘어놓으면 「많다」는 것만 압니다. 같은 화면에서 같은 문구가
//  **몇 번, 누구에게** 났는지가 원인을 좁혀 줍니다. 그래서 묶어서 셉니다.
//
//  오류 문구에는 거래처 이름이나 금액이 섞여 들어갈 수 있어 관리자만 봅니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 언제 났는지 — 한국 시간으로 「8월 15일 14:03」.
 *  서버가 준 값은 시간대가 붙은 ISO 입니다. 그대로 보여 주면 UTC 로 보여
 *  오후 일이 오전으로 보입니다.
 */
function whenText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const KIND_LABEL: Record<string, string> = {
  save: '저장',
  load: '자료 읽기',
  render: '화면',
}

export function ErrorLogCard() {
  const { role, mode } = useAuth()
  const [state, setState] = useState<'loading' | 'done' | 'unavailable'>('loading')
  const [log, setLog] = useState<RecentErrors | null>(null)

  useEffect(() => {
    //  관리자가 아니면 부르지도 않습니다 — 막힐 요청을 보내 놓고 오류를
    //  삼키지 않습니다.
    if (mode !== 'live' || role !== 'admin') return
    let alive = true
    void recentErrors(7)
      .then((r) => {
        if (!alive) return
        setLog(r)
        //  0046 이전 DB 에는 이 함수가 없습니다 — 고장이 아니라 구버전입니다.
        setState(r ? 'done' : 'unavailable')
      })
      .catch(() => {
        if (alive) setState('unavailable')
      })
    return () => {
      alive = false
    }
  }, [mode, role])

  if (mode !== 'live' || role !== 'admin') return null

  const groups = log?.groups ?? []
  const bad = (log?.total ?? 0) > 0

  return (
    <div data-error-log className={`card px-4 py-3.5 sm:px-5 ${bad ? 'border-amber-200 bg-amber-50/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            bad ? 'bg-amber-100 text-amber-700' : 'bg-navy-50 text-navy-500'
          }`}
        >
          <AlertOctagon size={20} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="t-body break-keep font-extrabold text-navy-900">최근 오류</p>
          <p className="t-muted mt-0.5 break-keep" data-error-log-line>
            {state === 'loading' ? (
              <>
                <Loader2 size={14} className="mr-1 inline animate-spin" /> 확인하는 중…
              </>
            ) : state === 'unavailable' ? (
              '이 DB 에는 오류 기록이 아직 없습니다 — RUN_32 를 실행하면 남기 시작합니다.'
            ) : bad ? (
              `지난 ${log?.days}일 동안 ${log?.total}건 — 같은 것끼리 묶으면 ${groups.length}가지입니다.`
            ) : (
              <>
                <CheckCircle2 size={14} className="mr-1 inline -translate-y-px text-emerald-600" />
                지난 {log?.days}일 동안 오류가 한 건도 없었습니다.
              </>
            )}
          </p>
        </div>
      </div>

      {bad && (
        <ul className="mt-3 space-y-2" data-error-log-list>
          {groups.map((g) => (
            <li
              key={`${g.kind}|${g.screen}|${g.action}|${g.message}`}
              data-error-group
              className="rounded-xl bg-white px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="pill bg-navy-50 text-navy-600">{KIND_LABEL[g.kind] ?? g.kind}</span>
                {g.screen && <span className="t-caption text-navy-500">{g.screen}</span>}
                {g.action && <span className="t-caption text-navy-500">· {g.action}</span>}
                {/*  한 번은 사고이고 여러 번은 원인입니다 — 몇 번인지가 제일 중요합니다. */}
                <span className={`pill ${g.times > 1 ? 'bg-amber-100 text-amber-700' : 'bg-navy-50 text-navy-500'}`}>
                  {g.times}번
                </span>
              </div>
              <p className="t-body mt-1 break-all font-bold text-navy-800">{g.message}</p>
              <p className="t-muted mt-0.5 break-keep">
                마지막 {whenText(g.last_at)}
                {g.who ? ` · ${g.who}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      {bad && (
        <p className="t-muted mt-3 break-keep">
          같은 문구가 여러 번 나오면 그 화면이나 그 거래처에 원인이 있습니다. 이 목록을 그대로 개발자에게 보내
          주시면 됩니다 — 언제·누가·어느 화면에서 났는지가 다 들어 있습니다.
        </p>
      )}
    </div>
  )
}
