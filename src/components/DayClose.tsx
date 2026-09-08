import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Moon, Gauge, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { schedulesOn } from '../lib/selectors'
import { SUPPLY_ITEMS, itemsOf, type ItemKey } from '../lib/billing'
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
  const { data } = useData()
  const ready = useSchemaAtLeast(73) === true
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [summary, setSummary] = useState<DayCloseSummary | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  //  0106 — 운행 기록 (선택). 계기판·처리시설 대기시간. 판 106 이후에만 칸이 있습니다.
  const ready106 = useSchemaAtLeast(106) === true
  const [tripOpen, setTripOpen] = useState(false)
  const [odoStart, setOdoStart] = useState('')
  const [odoEnd, setOdoEnd] = useState('')
  const [waitMin, setWaitMin] = useState('')
  const [trips, setTrips] = useState('')
  //  마감 여부 조회 실패는 삼키지 않습니다 — 「아직 안 했다」로 보이면 두 번 누르게 됩니다.
  const [lookup, setLookup] = useState<'ok' | 'failed'>('ok')
  const [lookupTick, setLookupTick] = useState(0)

  //  이미 마감했는지 먼저 봅니다 — 새로고침해도 「끝냈다」가 남아야 합니다.
  useEffect(() => {
    let alive = true
    if (!ready || mode !== 'live' || !profile) return
    setLookup('ok')
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
      .catch(() => { if (alive) setLookup('failed') })
    return () => { alive = false }
  }, [ready, mode, profile, date, lookupTick])

  //  ── 눌러야 할 것을 **누르기 전에** 보여 줍니다 ────────────────────────
  //
  //   ⚠ 예전에는 마감을 누른 **뒤에야** 숫자가 나왔습니다. 그러면 기사님은
  //     「내가 뭘 마감하는 건지」 모른 채 누르게 되고, 결국 확인하려고
  //     오늘 일정 화면으로 다시 갑니다. 시스템이 이미 아는 것을 미리 적습니다.
  //   ⚠ 이 숫자는 **화면이 지금 가지고 있는 것**입니다. 마감을 누르면 서버가
  //     다시 셉니다 — 그래서 「지금까지 들어온 것」이라고만 적습니다.
  //   ⚠ 기사 계정에 보이는 일정은 서버가 이미 본인 것만 줍니다(RLS).
  const list = schedulesOn(data, date)
  const doneN = list.filter((s) => s.status === '완료').length
  const leftN = list.length - doneN
  const kgN = list.reduce((n, s) => n + (s.status === '완료' ? s.actualAmount ?? 0 : 0), 0)
  //  그날 나간 자재 — 「무엇을 몇 개 드리고 왔나」. 없으면 줄을 안 그립니다.
  const supplyLine = (() => {
    const sum: Partial<Record<ItemKey, number>> = {}
    for (const m of data.materials.filter((m) => m.date === date)) {
      for (const [k, n] of Object.entries(itemsOf(m))) sum[k as ItemKey] = (sum[k as ItemKey] ?? 0) + (n ?? 0)
    }
    return SUPPLY_ITEMS.filter((it) => (sum[it.key as ItemKey] ?? 0) > 0)
      .map((it) => `${it.label} ${sum[it.key as ItemKey]}`)
      .join(' · ')
  })()
  //  아직 안 놓은 공용차 — 있으면 마감 전에 알려 줍니다(막지는 않습니다).
  const openTrucks = (data.vehicleReservations ?? []).filter(
    (r) => r.profileId === profile?.id && r.date <= date,
  )

  if (!ready || mode !== 'live') return null
  //  병원 계정에는 없습니다. 사무실·관리자는 자기 마감이 필요 없습니다.
  if (role !== 'field') return null

  async function go() {
    setState('busy')
    setError(null)
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const os = num(odoStart), oe = num(odoEnd), wm = num(waitMin), tp = num(trips)
    if ([os, oe, wm, tp].some((v) => v != null && !(Number.isFinite(v) && v >= 0))) {
      setError('운행 기록은 0 이상의 숫자만 넣어 주세요.'); setState('idle'); return
    }
    if (os != null && oe != null && oe < os) {
      setError('도착 계기판이 출발보다 작습니다.'); setState('idle'); return
    }
    try {
      const r = await closeDay(date, note.trim(), ready106 ? { odometerStart: os, odometerEnd: oe, facilityWaitMin: wm, facilityTrips: tp } : {})
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

      {/*  ⚠ 누르기 전에 보여 줍니다 — 확인만 하시면 됩니다. */}
      <div data-day-close-preview className="mt-3 rounded-2xl bg-navy-50 px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: 'planned', label: '오늘 예정', v: list.length, tone: 'text-navy-900' },
            { k: 'done', label: '완료', v: doneN, tone: doneN > 0 ? 'text-teal-700' : 'text-navy-400' },
            { k: 'left', label: '아직', v: leftN, tone: leftN > 0 ? 'text-amber-700' : 'text-navy-400' },
          ].map((c) => (
            <div key={c.k} data-day-close-count={c.k}>
              <p className="t-caption break-keep font-bold text-navy-500">{c.label}</p>
              <p className={`text-[1.6rem] font-extrabold leading-none tabular-nums ${c.tone}`}>
                {c.v}
                <span className="t-caption ml-0.5 font-bold text-navy-400">건</span>
              </p>
            </div>
          ))}
        </div>
        <p data-day-close-kg className="t-body mt-2 break-keep font-bold text-navy-800">
          모두 {kgN.toLocaleString('ko-KR')}kg
        </p>
        {supplyLine && (
          <p data-day-close-supply className="t-caption mt-0.5 break-keep text-navy-600">
            드린 자재 {supplyLine}
          </p>
        )}
        {/*  ⚠ 공용차는 **막지 않습니다.** 밤늦게 마감하고 아침에 놓는 일이
             실제로 있습니다 — 사실만 알려 드립니다. */}
        {openTrucks.length > 0 && (
          <p data-day-close-truck className="t-body mt-1.5 break-keep font-bold text-rose-700">
            공용차가 아직 잡혀 있습니다 — 반납 처리를 잊지 마세요.
          </p>
        )}
        {leftN > 0 && (
          <p className="t-caption mt-1.5 break-keep leading-snug text-navy-500">
            아직 {leftN}곳이 남아 있어도 마감하실 수 있습니다 — 사무실에 그대로 보입니다.
          </p>
        )}
      </div>

      {/*  0106 — 운행 기록 (선택). 지도 API 전까지 계기판과 시계로 시작합니다.
           안 적으셔도 마감됩니다. 적은 값만 셉니다 — 0 으로 채우지 않습니다. */}
      {ready106 && (
        <div data-day-close-trip className="mt-3 rounded-2xl bg-navy-50 px-4 py-3">
          <button
            type="button"
            data-day-close-trip-toggle
            onClick={() => setTripOpen((v) => !v)}
            className="flex min-h-[2.75rem] w-full items-center gap-2 text-left"
          >
            <Gauge size={18} strokeWidth={2.3} className="shrink-0 text-navy-500" />
            <span className="t-body min-w-0 flex-1 break-keep font-bold text-navy-800">운행 기록 적기 (선택 · 계기판 · 처리시설 대기)</span>
            <ChevronDown size={18} className={`shrink-0 text-navy-400 transition-transform ${tripOpen ? 'rotate-180' : ''}`} />
          </button>
          {tripOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="t-caption font-bold text-navy-600">출발 계기판 (km)
                <input data-day-close-odo-start inputMode="numeric" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} className="input mt-1" placeholder="예: 84210" />
              </label>
              <label className="t-caption font-bold text-navy-600">도착 계기판 (km)
                <input data-day-close-odo-end inputMode="numeric" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} className="input mt-1" placeholder="예: 84395" />
              </label>
              <label className="t-caption font-bold text-navy-600">처리시설 대기 (분)
                <input data-day-close-wait inputMode="numeric" value={waitMin} onChange={(e) => setWaitMin(e.target.value)} className="input mt-1" placeholder="기다린 시간" />
              </label>
              <label className="t-caption font-bold text-navy-600">처리시설 간 횟수
                <input data-day-close-trips inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value)} className="input mt-1" placeholder="예: 1" />
              </label>
              <p className="t-caption col-span-2 break-keep text-navy-500">모르는 칸은 비워 두세요. 적은 것만 셉니다.</p>
            </div>
          )}
        </div>
      )}

      {lookup === 'failed' && (
        <p data-day-close-lookup-failed className="t-caption mt-3 break-keep font-bold text-amber-800">
          오늘 이미 마감했는지 확인하지 못했습니다(통신). 마감을 누르면 서버가 다시 확인합니다 — 두 번 눌러도 한 번만 남습니다.{' '}
          <button type="button" onClick={() => setLookupTick((n) => n + 1)} className="underline underline-offset-2">다시 확인</button>
        </p>
      )}

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
        확인했습니다 · 오늘 업무 마감
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
