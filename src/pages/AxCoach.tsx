import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck2, ClipboardList, Gauge, Info } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell, SectionTitle } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import { LoadGate, useLoadState } from '../components/LoadState'
import { CoverageCard } from '../components/axCoach/CoverageCard'
import { MissionCardView } from '../components/axCoach/MissionCardView'
import { issueCoachMission, markCoachMissionVerified } from '../lib/evidenceRepo'
import { today } from '../lib/format'
import {
  coachMissions,
  coachReport,
  coverageOf,
  earliestRecord,
  type CoachReport,
  type MissionCard,
} from '../lib/axCoach'

// ─────────────────────────────────────────────────────────────────────────────
//  AX Coach (/ax-coach) — 「오늘 무엇을 하면 실증 자료가 쌓이는가」
//
//  성과 화면(/performance)과 하는 일이 다릅니다.
//
//    성과 화면    이미 나온 결과를 자세히 보는 곳
//    AX Coach     지금 무엇을 해야 결과가 생기는지 알려 주는 곳
//
//  ⚠ 이 화면에는 **「완료」 단추가 없습니다.** 단추는 「업무하러 가기」 하나
//    뿐이고, 다 했다는 판정은 실제 업무 기록(수거 · 포털 요청 · 전달 · 입금 ·
//    마감 · 거래처 값)이 생겼을 때 시스템이 합니다.
//
//  ⚠ 준비도는 **성과가 아닙니다.** 「자료가 얼마나 쌓였는가」입니다.
// ─────────────────────────────────────────────────────────────────────────────

function ReportBlock({ r }: { r: CoachReport }) {
  const delta = r.pctBefore == null ? null : r.pctNow - r.pctBefore
  return (
    <div data-coach-report={r.days} className="card p-5 sm:p-6">
      {r.beforeStart ? (
        <p className="t-body break-keep text-navy-600">
          이 기간은 실증 시작일보다 앞입니다 — 기록이 없습니다. 0 건이라고 적지 않습니다.
        </p>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {r.lines.map((l) => (
              <li key={l.label} data-coach-stat={l.label} className="flex items-baseline justify-between gap-3 rounded-2xl bg-navy-50 px-4 py-3">
                <span className="t-body min-w-0 break-keep font-bold text-navy-700">{l.label}</span>
                <b className="t-body shrink-0 tabular-nums text-navy-900">
                  {l.value == null ? <span className="text-navy-400">아직 못 셈</span> : `${l.value.toLocaleString('ko-KR')}${l.unit}`}
                </b>
              </li>
            ))}
          </ul>

          <div data-coach-report-pct className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl bg-navy-900 px-5 py-4 text-white">
            <span className="t-body font-bold text-white/70">실증 자료 준비도</span>
            <b className="t-kpi-sm tabular-nums">
              {r.pctBefore == null ? '기록 없음' : `${r.pctBefore}%`} → {r.pctNow}%
            </b>
            {delta != null && delta !== 0 && (
              <span className="t-body font-extrabold text-teal-300">{delta > 0 ? `+${delta}` : delta}%p</span>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="t-label text-navy-900">이번 기간에 새로 확인된 것</p>
              {r.gained.length === 0 ? (
                <p data-coach-gained="none" className="t-body mt-1.5 break-keep text-navy-500">새로 확인된 것이 없습니다.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {r.gained.slice(0, 5).map((g) => (
                    <li key={g} data-coach-gained className="t-body break-keep text-navy-700">· {g}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="t-label text-navy-900">아직 부족한 것</p>
              <ul className="mt-1.5 space-y-1">
                {r.missing.slice(0, 5).map((m) => (
                  <li key={m} data-coach-missing className="t-body break-keep text-navy-600">· {m}</li>
                ))}
                {r.missing.length === 0 && <li className="t-body text-navy-500">없습니다 — 네 갈래가 다 찼습니다.</li>}
              </ul>
            </div>
          </div>

          <p data-coach-next className="t-body mt-4 break-keep rounded-2xl bg-navy-50 px-4 py-3 font-bold text-navy-700">
            다음 {r.days}일에는 먼저 — {r.next.join(' · ')}
          </p>

          <p className="t-caption mt-2.5 break-keep text-navy-500">
            {r.missionsIssued == null
              ? '오늘 할 일 발행 이력은 표가 아직 없어 세지 못했습니다 (0 건이 아닙니다).'
              : `이 기간에 받은 오늘 할 일 ${r.missionsIssued}건 · 실제 업무기록으로 확인된 것 ${r.missionsVerified}건.`}
          </p>
        </>
      )}
    </div>
  )
}

export function AxCoach() {
  const { data, reload } = useData()
  const { role, profile, mode } = useAuth()
  const navigate = useNavigate()
  const loadState = useLoadState()
  const [days, setDays] = useState<7 | 14>(7)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const t = today()
  const live = mode === 'live'

  //  준비도는 실증 시작일부터 오늘까지 쌓인 것으로 봅니다. 시작일이 없으면
  //  시스템에 남은 가장 이른 기록부터 — 없는 날짜를 지어내지 않습니다.
  const period = useMemo(() => {
    const start = data.experiment?.startDate ?? earliestRecord(data) ?? t
    return { from: start <= t ? start : t, to: t }
  }, [data, t])

  const cov = useMemo(() => coverageOf(data, period), [data, period])
  const issued = data.coachMissions
  const missions = useMemo(
    () => coachMissions(data, cov, { role: role ?? 'office', today: t, issued }),
    [data, cov, role, t, issued],
  )
  //  오늘 확인된 일은 화면의 판정을 리포트에도 그대로 씁니다 — 확인 메모가
  //  적히기 전에 「위는 ✓ 인데 아래는 0건」이 되지 않도록.
  const verifiedTodayKeys = useMemo(() => missions.done.map((m) => m.key), [missions.done])
  const report = useMemo(
    () => coachReport(data, days, { today: t, issued, verifiedTodayKeys }),
    [data, days, t, issued, verifiedTodayKeys],
  )

  //  확인된 일은 발행 이력에도 적어 둡니다 — 화면의 판정은 이미 실제 기록으로
  //  끝났고, 이 쓰기는 「그때 무엇으로 확인했나」를 남기는 것뿐입니다.
  //  실패해도 화면은 그대로입니다.
  //  ⚠ 한 번 시도한 것은 다시 시도하지 않습니다. 쓰기가 실패했을 때(권한·표
  //    없음) 다시 읽고 → 또 쓰고 → 또 읽는 되돌이가 생기면 화면이 멈춥니다.
  const marked = useRef(new Set<string>())
  useEffect(() => {
    if (!live) return
    const toMark = missions.done.filter((m) => m.issued && !m.issued.verifiedAt && !marked.current.has(m.issued.id))
    if (toMark.length === 0) return
    for (const m of toMark) marked.current.add(m.issued!.id)
    let alive = true
    void (async () => {
      let wrote = false
      for (const m of toMark) {
        try {
          await markCoachMissionVerified(m.issued!.id, m.verification.what)
          wrote = true
        } catch {
          /* 표가 없거나 권한이 없으면 그냥 둡니다 — 판정에는 쓰이지 않는 값입니다 */
        }
      }
      if (alive && wrote) void reload()
    })()
    return () => {
      alive = false
    }
  }, [live, reload, missions.done])

  const go = useCallback(
    async (m: MissionCard) => {
      setBusy(m.key)
      setNote('')
      //  「업무하러 간다」는 사실만 남깁니다. 완료가 아닙니다.
      if (live && !m.issued) {
        try {
          await issueCoachMission({
            missionKey: m.key,
            area: m.area,
            issuedOn: t,
            issuedName: profile?.name ?? '',
            issuedRole: role ?? '',
            targetId: m.targetId,
          })
          //  ⚠ 기다리지 않고 배경에서 다시 읽습니다. 이동을 늦추면 안 됩니다 —
          //    누른 사람은 업무를 하러 가는 길입니다.
          void reload()
        } catch {
          setNote('받은 기록은 남기지 못했습니다 (발행 이력 표가 아직 없을 수 있습니다). 업무 화면으로 이동합니다 — 확인은 실제 업무기록으로 합니다.')
        }
      }
      setBusy(null)
      navigate(m.to)
    },
    [live, t, profile, role, navigate, reload],
  )

  if (loadState !== 'ready') {
    return (
      <PageShell>
        <PageHeader title="AX 코치" subtitle="오늘 무엇을 하면 실증 자료가 쌓이는지 알려 드립니다" />
        <LoadGate loadingTitle="업무 기록을 불러오는 중입니다" loadingSubtitle="다 읽은 뒤에 오늘 할 일을 골라 드립니다." empty={<span />} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader title="AX 코치" subtitle="오늘 무엇을 하면 실증 자료가 쌓이는지 알려 드립니다" />

      {/* ── 실증 자료 준비도 ─────────────────────────────────────────────── */}
      <section data-coach-total className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <Gauge size={26} className="mb-1 shrink-0 text-teal-600" strokeWidth={2.3} />
          <p className="t-card text-navy-900">실증 자료 준비도</p>
          <b data-coach-total-pct className="t-kpi ml-auto tabular-nums text-navy-900">{cov.pct}%</b>
        </div>
        <div className="mt-4 h-4 overflow-hidden rounded-full bg-navy-100">
          <div className="h-full rounded-full bg-teal-500 transition-[width] duration-500" style={{ width: `${Math.max(cov.pct, cov.pct > 0 ? 3 : 0)}%` }} />
        </div>
        <p className="t-body mt-3.5 break-keep text-navy-600">실제 업무기록이 쌓일수록 자동으로 올라갑니다.</p>
        <p data-coach-caveat className="t-body mt-1 break-keep font-bold text-navy-500">
          ※ 자료가 얼마나 모였는지입니다 — 성과가 {cov.pct}% 좋아졌다는 뜻이 아닙니다.
        </p>
        {cov.experimentStart ? (
          <p className="t-caption mt-2 text-navy-500">실증 시작 {cov.experimentStart} 부터 오늘까지 쌓인 기록으로 셉니다.</p>
        ) : (
          <p data-coach-nostart className="t-caption mt-2 break-keep font-bold text-amber-700">
            실증 시작일이 없어 연습 입력과 실제 기록을 가르지 못합니다 — 설정에서 시작일을 먼저 정해 주세요.
          </p>
        )}
      </section>

      {/* ── 네 갈래 ───────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle hint="누르면 무엇이 얼마나 모였는지 항목별로 보입니다">무엇이 쌓였고 무엇이 비었나</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {cov.areas.map((a) => <CoverageCard key={a.area} a={a} detail={role === 'admin' || role === 'office'} />)}
        </div>
      </section>

      {/* ── 오늘 할 일 ────────────────────────────────────────────────────── */}
      <section data-coach-today>
        <SectionTitle hint="실제 업무를 하면서 실증자료도 같이 쌓입니다">오늘 이것만 해주세요</SectionTitle>
        {note && <p data-coach-note className="t-body mb-3 break-keep rounded-2xl bg-amber-50 px-4 py-3 font-bold text-amber-800">{note}</p>}
        {missions.todo.length === 0 ? (
          <div data-coach-none className="card p-5 sm:p-6">
            <p className="t-card text-navy-900">오늘 드릴 일이 없습니다</p>
            <p className="t-body mt-1.5 break-keep text-navy-600">
              오늘 예정된 방문 · 처리할 주문 · 입금 확인할 청구가 없습니다. 할 수 있는 일이 없을 때는 만들어 내지 않습니다.
            </p>
          </div>
        ) : (
          <ol className="grid gap-3">
            {missions.todo.map((m, i) => (
              <MissionCardView key={m.key} m={m} no={i + 1} busy={busy === m.key} onGo={(x) => void go(x)} />
            ))}
          </ol>
        )}

        {missions.done.length > 0 && (
          <div data-coach-done className="mt-4">
            <p className="t-label mb-2 text-navy-900">오늘 확인된 것</p>
            <ol className="grid gap-3">
              {missions.done.map((m, i) => (
                <MissionCardView key={m.key} m={m} no={i + 1} busy={false} onGo={() => undefined} />
              ))}
            </ol>
          </div>
        )}

        <p className="t-caption mt-3 flex items-start gap-1.5 break-keep text-navy-500">
          <Info size={15} className="mt-0.5 shrink-0" />
          <span>
            「했다」 단추는 없습니다. 실제 업무기록(수거 입력 · 포털 요청 · 전달 · 입금 · 마감)이 생기면 그때 확인됩니다.
            {!missions.historyAvailable && ' 받은 일을 남기는 표가 아직 없어, 오늘 0시부터의 기록으로 확인합니다.'}
          </span>
        </p>
      </section>

      {/* ── 최근 변화 ─────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle
          action={
            <div className="flex gap-1 rounded-2xl bg-navy-50 p-1">
              {([7, 14] as const).map((d) => (
                <button
                  key={d}
                  data-coach-days={d}
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`min-h-[2.75rem] rounded-xl px-4 text-[1.05rem] font-extrabold transition ${days === d ? 'bg-white text-teal-700 shadow-sm' : 'text-navy-500 hover:text-navy-700'}`}
                >
                  {d}일
                </button>
              ))}
            </div>
          }
        >
          최근 {days}일 변화
        </SectionTitle>
        <ReportBlock r={report} />
      </section>

      {/* ── 성과 화면과의 관계 ────────────────────────────────────────────── */}
      {/*  ⚠ 폰에서는 **세로로 쌓습니다.** 한 줄에 글과 단추를 같이 두면 390px
           에서 글자가 폭 50px 짜리 기둥으로 늘어집니다 (실제로 그랬습니다). */}
      {(role === 'admin' || role === 'office') && (
        <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <ClipboardList size={20} className="mt-0.5 shrink-0 text-navy-400" />
            <p className="t-body min-w-0 break-keep text-navy-600">
              쌓인 자료로 나온 <b className="text-navy-800">결과</b>는 성과 화면에서 자세히 봅니다. 여기는 <b className="text-navy-800">지금 무엇을 할지</b>만 알려 드립니다.
            </p>
          </div>
          <button data-coach-to-perf onClick={() => navigate('/performance')} className="btn-ghost w-full sm:w-auto sm:shrink-0">
            <CalendarCheck2 size={17} /> AX 도입 성과 보기
          </button>
        </section>
      )}
    </PageShell>
  )
}
