import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Moon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { closeDay, dayCloses, type DayClose as DayCloseRow, type DayCloseSummary } from '../lib/repo'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 업무 마감 (0073)
//
//  기사님이 하루치를 다 넣고 나서, **같은 내용을 카톡으로 다시 보고**하는
//  일을 없애려는 것입니다.
//
//  ⚠ 기사님에게 아무것도 다시 입력받지 않습니다. 건수·수거량은 시스템이
//    이미 압니다 — 서버가 세어서 그대로 보여 줍니다. 다시 적게 하면
//    그건 마감이 아니라 **두 번째 보고**입니다.
//  ⚠ 하루 한 번입니다. 연타해도 한 줄입니다(서버가 막습니다).
//  ⚠ 마감은 나중에 고칠 수 없습니다 — 근무 기록입니다.
//  ⚠ 판 73 이 아직이면 **아무것도 그리지 않습니다.** 눌러도 안 되는 단추를
//    만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DayClose({ date = today() }: { date?: string }) {
  const { profile, role, mode } = useAuth()
  const ready = useSchemaAtLeast(73) === true
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [summary, setSummary] = useState<DayCloseSummary | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [closedAt, setClosedAt] = useState<string | null>(null)

  //  이미 마감했는지 먼저 봅니다 — 새로고침해도 「끝냈다」가 남아야 합니다.
  useEffect(() => {
    let alive = true
    if (!ready || mode !== 'live' || !profile) return
    dayCloses(date)
      .then((rows) => {
        if (!alive) return
        const mine = rows.find((r) => r.profileId === profile.id)
        if (mine) {
          setState('done')
          setClosedAt(mine.closedAt)
          setSummary({
            planned: Number(mine.summary.planned ?? 0), done: Number(mine.summary.done ?? 0),
            left: Number(mine.summary.left ?? 0), kg: Number(mine.summary.kg ?? 0),
            openVehicles: Number(mine.summary.openVehicles ?? 0),
          })
        }
      })
      .catch(() => { /* 못 읽어도 화면은 그대로 — 눌러 보면 서버가 알려 줍니다 */ })
    return () => { alive = false }
  }, [ready, mode, profile, date])

  if (!ready || mode !== 'live') return null
  //  병원 계정에는 없습니다. 사무실·관리자는 자기 마감이 필요 없습니다.
  if (role !== 'field') return null

  async function go() {
    setState('busy')
    setError(null)
    try {
      const r = await closeDay(date, note.trim())
      setSummary(r.summary)
      setState('done')
      setClosedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : '마감하지 못했습니다.')
      setState('idle')
    }
  }

  if (state === 'done' && summary) {
    return (
      <section data-day-close="done" className="card border-2 border-emerald-200 bg-emerald-50 p-5">
        <p className="flex items-center gap-2.5 break-keep text-[1.3rem] font-extrabold text-emerald-800">
          <CheckCircle2 size={24} strokeWidth={2.4} className="shrink-0" />
          오늘 업무 마감했습니다
        </p>
        <p className="t-body mt-1.5 break-keep text-emerald-900">
          완료 {summary.done}건 · 남은 곳 {summary.left}건 · 모두{' '}
          {summary.kg.toLocaleString('ko-KR')}kg
        </p>
        {/*  ⚠ 사무실에 자동으로 갑니다 — 따로 알릴 필요가 없다는 것을
             **글자로** 적습니다. 안 적으면 그래도 카톡을 보냅니다. */}
        <p className="t-caption mt-2 break-keep font-bold text-emerald-700">
          사무실·대표님 화면에 자동으로 올라갔습니다. 따로 알리지 않으셔도 됩니다.
        </p>
        {closedAt && (
          <p className="t-caption mt-1 text-emerald-700">
            {new Date(closedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })} 마감
          </p>
        )}
      </section>
    )
  }

  return (
    <section data-day-close="open" className="card p-5">
      <p className="flex items-center gap-2.5 break-keep text-[1.24rem] font-extrabold text-navy-900">
        <Moon size={22} strokeWidth={2.3} className="shrink-0 text-navy-500" />
        오늘 업무 마감
      </p>
      <p className="t-body mt-1.5 break-keep text-navy-500">
        오늘 넣으신 내용은 시스템이 이미 압니다. 누르시면 사무실에 그대로 올라갑니다 —
        <b className="text-navy-700"> 다시 적지 않으셔도 됩니다.</b>
      </p>

      {/*  한 줄만. 없으면 비워 두셔도 됩니다. */}
      <input
        data-day-close-note
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="남길 말이 있으면 한 줄 (없으면 비워 두세요)"
        className="input mt-3.5"
        maxLength={200}
      />

      {error && (
        <p data-day-close-error className="t-body mt-3 break-keep font-bold text-rose-600">{error}</p>
      )}

      <button
        data-day-close-go
        disabled={state === 'busy'}
        onClick={() => void go()}
        className="btn-primary mt-3.5 w-full py-4 !text-[1.15rem] disabled:opacity-50"
      >
        {state === 'busy' ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} strokeWidth={2.5} />}
        오늘 업무 마감
      </button>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 「누가 오늘 마감했나」 — 대표·사무실 화면 한 줄 (0088)
//
//  대표님 요청: "대표/admin 에서는 '김OO 기사 오늘 업무 마감 완료' 여부를
//  확인 가능하게."
//
//  ⚠ 이름은 **마감 순간에 서버가 적어 둔 값**입니다. 여기서 프로필을 다시
//    읽지 않습니다 — 그 권한을 열면 현장 계정이 남의 개인정보를 읽습니다.
//  ⚠ 아직 아무도 안 눌렀으면 **「아직」이라고만** 적습니다. 「미이행」이
//    아닙니다 — 아직 일하는 중일 수 있습니다.
//  ⚠ 판 73 이 아직이면 아무것도 안 그립니다.
// ─────────────────────────────────────────────────────────────────────────────

export function DayCloseStatus({ date = today() }: { date?: string }) {
  const { role, mode } = useAuth()
  const ready = useSchemaAtLeast(73) === true
  const staff = role === 'admin' || role === 'office'
  const [rows, setRows] = useState<DayCloseRow[] | null>(null)

  useEffect(() => {
    let alive = true
    if (!ready || mode !== 'live' || !staff) return
    dayCloses(date)
      .then((r) => { if (alive) setRows(r) })
      .catch(() => { if (alive) setRows(null) })
    return () => { alive = false }
  }, [ready, mode, staff, date])

  if (!ready || mode !== 'live' || !staff || rows === null) return null

  return (
    <div data-day-close-status className="mt-3 rounded-2xl bg-navy-50 px-3.5 py-3">
      {rows.length === 0 ? (
        <p data-day-close-none className="t-body break-keep font-bold text-navy-500">
          오늘 업무 마감을 누른 분은 아직 없습니다
        </p>
      ) : (
        <>
          <p className="t-body break-keep font-extrabold text-navy-900">
            오늘 업무 마감 {rows.length}명
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.profileId} data-day-close-who={r.profileId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {/*  이름이 안 적혀 있으면 지어내지 않고 그 자리를 비웁니다. */}
                <b className="break-keep text-[1.05rem] font-extrabold text-navy-900">
                  {r.who || '이름 미기재'}
                </b>
                <span className="t-caption tabular-nums text-navy-500">
                  완료 {Number(r.summary.done ?? 0)}건 · {Number(r.summary.kg ?? 0).toLocaleString('ko-KR')}kg
                </span>
                <span className="t-caption tabular-nums text-navy-400">
                  {new Date(r.closedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })} 마감
                </span>
                {r.note && (
                  <span data-day-close-memo={r.profileId} className="t-caption w-full break-keep text-navy-600">
                    “{r.note}”
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
