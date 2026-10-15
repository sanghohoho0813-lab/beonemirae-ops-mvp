import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowDown, ClipboardCheck, FlaskConical, Users, CalendarRange, FileCheck2, type LucideIcon } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { PageShell } from '../components/ui'
import { LoadGate, useLoadState } from '../components/LoadState'
import { loadDevRequests, missingParts } from '../lib/repo'
import { parseTrials, type Trial } from '../lib/trials'
import { IR_WINDOW_DAYS, irSummary, type IrNext } from '../lib/irSummary'

// ─────────────────────────────────────────────────────────────────────────────
// 발표용 성과 요약 (/performance/ir) — 0137
//
//  대표님: 「이 화면의 목적은 데이터를 더 많이 보여주는 것이 아니라, 실제
//  데이터를 숨기지 않고, 확인된 것만 아주 쉽게 보여주는 것」.
//
//   [위]   AX 운영혁신 — 초기 실증 결과
//   [가운데] 도입 전 업무부담 3.5~4.7시간/일  →  동일 업무 처리 ○분 → ○분
//   [아래]  실사용자 ○명 · 실제 업무기록 ○건 · 실증기간 ○일
//   [끝]   다음에 검증할 사업효과 (측정 예정) · 「근거 보기」 → /performance?tab=basis
//
//  ⚠ /performance(요약 · 측정 근거 · 설정)는 **그대로** 둡니다. 이 화면은 그
//    위에 얹은 발표용 창 하나이고, 숫자는 같은 함수에서 나옵니다(lib/irSummary).
//  ⚠ 값이 없으면 큰 숫자 자리에 「측정 전」을 씁니다 — 0 을 쓰지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

const fmtMin = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))
const n = (v: number) => v.toLocaleString('ko-KR')

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  data,
}: {
  icon: LucideIcon
  label: string
  value: string | null
  unit?: string
  sub: string
  data: string
}) {
  return (
    <div data-ir-stat={data} className="min-w-0 px-1 py-4 sm:px-6 sm:py-2">
      <p className="flex items-center gap-2 text-[1.05rem] font-bold text-navy-600">
        <Icon size={19} strokeWidth={2.4} aria-hidden="true" className="shrink-0 text-navy-500" />
        {label}
      </p>
      {value == null ? (
        <p data-ir-pending className="mt-1.5 text-[1.9rem] font-extrabold leading-tight text-navy-500 sm:text-[2.2rem]">확인 전</p>
      ) : (
        <p className="mt-1.5 text-[2.6rem] font-black leading-none tracking-tight text-navy-900 tabular-nums sm:text-[3.1rem]">
          {value}
          {unit && <span className="ml-1 text-[1.5rem] font-extrabold text-navy-700 sm:text-[1.7rem]">{unit}</span>}
        </p>
      )}
      <p className="mt-2 break-keep text-[1rem] leading-snug text-navy-600">{sub}</p>
    </div>
  )
}

const NEXT_STATUS: Record<IrNext['status'], { label: string; cls: string }> = {
  planned: { label: '측정 예정', cls: 'bg-navy-100 text-navy-700' },
  recording: { label: '기록 중', cls: 'bg-teal-50 text-teal-800' },
}

export function PerformanceIr() {
  const { data } = useData()
  const { role, mode } = useAuth()
  const navigate = useNavigate()
  const loadState = useLoadState()
  const live = mode === 'live'
  const isStaff = role === 'admin' || role === 'office'

  //  업무 재현시험 — /performance 와 같은 곳(사용자 피드백 표)에서 읽습니다.
  //  undefined = 읽는 중 (그동안 「측정 전」을 띄우지 않습니다)
  const [trials, setTrials] = useState<Trial[] | null | undefined>(undefined)
  useEffect(() => {
    if (!isStaff || !live) { setTrials(null); return }
    let alive = true
    loadDevRequests()
      .then((rows) => alive && setTrials(parseTrials(rows)))
      .catch(() => alive && setTrials(null))
    return () => { alive = false }
  }, [isStaff, live])

  const unreadable = useMemo(() => missingParts.filter((m) => /고객 문의/.test(m)), [loadState])
  const s = useMemo(
    () => irSummary(data, { live, trials: trials ?? null, trialsReason: '재현시험 기록을 읽지 못했습니다', unreadable }),
    [data, live, trials, unreadable],
  )

  if (loadState !== 'ready' || trials === undefined) {
    return (
      <PageShell>
        <LoadGate loadingTitle="실증 자료를 불러오는 중입니다" loadingSubtitle="다 읽은 뒤에 숫자를 보여 드립니다." empty={<span />} />
      </PageShell>
    )
  }

  const tr = s.trial
  const u = s.usage

  return (
    <PageShell>
      <div data-ir className="mx-auto w-full max-w-[1180px] space-y-8 sm:space-y-10">
        {/* ── 위 ─────────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-[1_1_22rem]">
            <p className="text-[1.05rem] font-extrabold tracking-wide text-teal-700">비원미래 · 발표용 성과 요약</p>
            <h1 data-ir-title className="mt-1 break-keep text-[2rem] font-black leading-tight tracking-tight text-navy-900 sm:text-[2.6rem]">
              AX 운영혁신 — 초기 실증 결과
            </h1>
            <p className="mt-2 break-keep text-[1.05rem] text-navy-600">
              {s.asOf} 기준 · {live ? '운영 DB 실제 기록 · 시연 자료 제외' : '시연 모드 — 실제 운영 기록이 아닙니다'}
            </p>
          </div>
          <button
            type="button"
            data-ir-basis
            onClick={() => navigate('/performance?tab=basis')}
            className="flex min-h-[3rem] shrink-0 items-center gap-2 rounded-full bg-navy-50 px-5 text-[1.05rem] font-extrabold text-navy-800 transition hover:bg-navy-100 print:hidden"
          >
            <ClipboardCheck size={19} strokeWidth={2.4} aria-hidden="true" /> 근거 보기
          </button>
        </header>

        {!live && (
          <p data-ir-demo-warning role="status" className="rounded-[14px] bg-rose-50 px-5 py-3.5 text-[1.05rem] font-bold text-rose-800">
            시연 모드입니다. 실제 사용 · 재현시험 숫자는 운영 계정으로 들어와야 보입니다.
          </p>
        )}

        {/* ── 가운데 — 도입 전 → 동일 업무 처리 ────────────────────────────── */}
        <section aria-label="도입 전과 동일 업무 처리" className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div data-ir-before className="flex flex-col rounded-[22px] bg-navy-900 px-7 py-7 text-white sm:px-9 sm:py-8">
            <p className="text-[1.15rem] font-extrabold text-navy-200">도입 전 업무부담</p>
            {/*  ⚠ 단위가 따로 줄을 넘지 않게 — 「시간/」 「일」로 갈리면 읽기 어렵습니다. */}
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[3rem] font-black leading-none tracking-tight tabular-nums sm:text-[4rem]">
              <span className="whitespace-nowrap">{fmtMin(s.baseline.minH)}~{fmtMin(s.baseline.maxH)}</span>
              <span className="whitespace-nowrap text-[1.6rem] font-extrabold text-navy-100 sm:text-[2rem]">시간/일</span>
            </p>
            <p className="mt-4 break-keep text-[1.08rem] font-bold text-white">하루 사무업무 — 실제 업무조사값</p>
            <p className="mt-1 break-keep text-[1rem] leading-snug text-navy-200">
              {s.baseline.parts.map((p) => `${p.label} ${p.quote.replace(/^일요일(을)? 제외(하고)? /, '').replace(/ 소요$/, '')}`).join(' + ')}
              {' '}(일요일 제외 매일)
            </p>
            <p className="mt-auto pt-4 text-[0.98rem] text-navy-300">운영이사 업무조사 답변 ({s.baseline.takenOn})</p>
          </div>

          <div aria-hidden="true" className="flex items-center justify-center text-navy-400">
            <ArrowRight size={40} strokeWidth={2.6} className="hidden lg:block" />
            <ArrowDown size={34} strokeWidth={2.6} className="lg:hidden" />
          </div>

          {/*  0141 — 오른쪽 = 도입 후. 답변(운영이사 · 현장 직원)과 줄어든 양(최소치 · 계산식 함께),
               그 아래 작게 재현시험(잰 값). 답변은 답변이라고, 잰 값은 잰 값이라고 적습니다. */}
          <div data-ir-after className="flex flex-col rounded-[22px] bg-teal-50 px-7 py-7 sm:px-9 sm:py-8">
            <p className="text-[1.15rem] font-extrabold text-teal-800">도입 후 업무부담</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[3rem] font-black leading-none tracking-tight text-navy-900 tabular-nums sm:text-[4rem]">
              <span className="whitespace-nowrap">{s.after.afterMaxMin}분</span>
              <span className="whitespace-nowrap text-[1.6rem] font-extrabold text-navy-700 sm:text-[2rem]">이내/일</span>
            </p>
            <p data-ir-cut className="mt-4 break-keep rounded-[14px] bg-teal-600 px-4 py-3 text-[1.25rem] font-black text-white sm:text-[1.4rem]">
              하루 {fmtMin(s.after.cutMinH)}시간 이상 줄어듦
              <span className="mt-0.5 block text-[1.02rem] font-bold text-teal-50">
                한 달 약 {n(s.after.monthCutMinH)}시간 이상 — 하루 {fmtMin(s.after.cutMinH)}시간 × 주 {s.after.daysPerWeek}일 × 4.345주
              </span>
            </p>
            <p className="mt-3 break-keep text-[1.08rem] font-bold text-navy-900">
              현장 기사 퇴근 후 카톡 정리 {s.after.field.beforeMinMin}분 이상 → 0분
            </p>
            <p className="mt-1 break-keep text-[1rem] leading-snug text-navy-600">
              현장에서 클릭 몇 번으로 바로 입력 — {s.after.field.who} 답변
            </p>
            <p className="mt-3 text-[0.98rem] text-navy-600">
              {s.after.who} 답변 ({s.after.takenOn}) · 줄어든 양은 두 답변으로 계산한 최소치
            </p>

            {/*  재현시험 — 같은 업무를 두 방식으로 실제로 잰 값 (잰 뒤에만 숫자) */}
            <div data-ir-trial={tr.state} className="mt-auto rounded-[14px] bg-white/70 px-4 py-3.5 ring-1 ring-teal-100" style={{ marginTop: '1.25rem' }}>
              <p className="text-[1rem] font-extrabold text-teal-800">동일 업무 재현시험</p>
              {role !== 'admin' && tr.state !== 'unavailable' && (
                <p data-ir-trial-scope className="mt-0.5 text-[0.95rem] text-navy-600">사무실 계정에서는 본인이 기록한 재현시험만 보입니다 — 관리자 계정에서 전체가 보입니다</p>
              )}
              {tr.state === 'measured' ? (
                <>
                  <p className="mt-1 text-[1.6rem] font-black tabular-nums text-navy-900">
                    {fmtMin(tr.main.oldMedianMin)}분 → {fmtMin(tr.main.newMedianMin)}분
                  </p>
                  <p className="break-keep text-[0.98rem] font-bold text-navy-800">
                    {tr.main.label} · <span data-ir-trial-n>초기 재현시험 {tr.main.n}회</span>{tr.main.n > 1 ? ' · 중앙값' : ''}
                    {(tr.main.oldErrors > 0 || tr.main.newErrors > 0) && ` · 오류 ${tr.main.oldErrors}건 → ${tr.main.newErrors}건`}
                  </p>
                  {tr.others.length > 0 && (
                    <p className="mt-0.5 break-keep text-[0.95rem] text-navy-600">
                      그 밖에 {tr.others.map((o) => `${o.label} ${o.n}회 (${fmtMin(o.oldMedianMin)}→${fmtMin(o.newMedianMin)}분)`).join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 break-keep text-[0.98rem] text-navy-700">
                  <b className="text-navy-900">측정 전</b> — {tr.state === 'unavailable' ? tr.reason : '같은 업무를 예전 방식과 시스템으로 각각 해 보고 시간 · 오류를 잽니다. 숫자는 잰 뒤에만 나옵니다.'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── 아래 — 실제 사용 증거 ────────────────────────────────────────── */}
        <section aria-label="실제 사용 증거" data-ir-usage={u.state} className="border-y border-navy-100 py-4 sm:py-6">
          <div className="grid divide-y divide-navy-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              icon={Users}
              label="실사용자"
              data="users"
              value={u.state === 'ok' ? n(u.users) : null}
              unit="명"
              sub={u.state === 'ok' ? `직원 ${u.staffUsers} · 병원 ${u.clientUsers} · 이름·계정이 기록에 남은 사람만` : u.reason}
            />
            <Stat
              icon={FileCheck2}
              label="실제 업무기록"
              data="records"
              value={u.state === 'ok' ? n(u.records) : null}
              unit="건"
              sub={
                u.state === 'ok'
                  ? `수거 입력 ${u.byKind.collections} · 병원 요청 ${u.byKind.requests} · 문의 ${u.byKind.inquiries}`
                  : '운영 DB 를 읽은 뒤에 셉니다'
              }
            />
            <Stat
              icon={CalendarRange}
              label="실증기간"
              data="pilot"
              value={s.pilot.days != null && s.pilot.days > 0 ? n(s.pilot.days) : null}
              unit="일"
              sub={
                s.pilot.startDate == null
                  ? '실증 시작일이 설정되지 않았습니다'
                  : s.pilot.days === 0
                    ? `실증 시작 전 (${s.pilot.startDate} 시작 예정)`
                    : `${s.pilot.startDate}부터`
              }
            />
          </div>
          {u.state === 'ok' && (
            <p data-ir-usage-note className="mt-3 break-keep px-1 text-[0.98rem] text-navy-600 sm:px-6">
              {u.window
                ? `최근 ${IR_WINDOW_DAYS}일 중 실증 기간(${u.window.from} ~ ${u.window.to}) · 운영 DB 기록`
                : '실증 시작 전이라 센 기간이 없습니다'}
              {(u.excluded.demo > 0 || u.excluded.reverted > 0) &&
                ` · 시연 ${u.excluded.demo}건 · 취소 ${u.excluded.reverted}건 제외`}
            </p>
          )}
        </section>

        {/* ── 다음에 검증할 사업효과 — 목표값 없이 ─────────────────────────── */}
        <section aria-label="다음에 검증할 사업효과" data-ir-next>
          <h2 className="flex items-center gap-2 text-[1.25rem] font-extrabold text-navy-900">
            <FlaskConical size={21} strokeWidth={2.4} aria-hidden="true" className="text-navy-500" />
            다음에 검증할 사업효과
          </h2>
          <ul className="mt-3 grid gap-x-8 sm:grid-cols-3">
            {s.next.map((x) => (
              <li key={x.key} data-ir-next-item={x.key} data-ir-next-status={x.status} className="border-t border-navy-100 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[1.12rem] font-extrabold text-navy-900">{x.label}</p>
                  <span className={`pill ${NEXT_STATUS[x.status].cls}`}>{NEXT_STATUS[x.status].label}</span>
                </div>
                <p className="mt-1 break-keep text-[1rem] leading-snug text-navy-600">{x.how}</p>
                {x.note && <p className="mt-1 text-[1rem] font-bold text-navy-700">{x.note}</p>}
              </li>
            ))}
          </ul>
        </section>

        <footer className="space-y-1.5 border-t border-navy-100 pt-4">
          <p data-ir-disclaimer className="break-keep text-[1rem] font-bold text-navy-700">
            초기 실측값이며 전체 회사 성과로 확대해석하지 않습니다.
          </p>
          <p className="break-keep text-[0.98rem] text-navy-600">
            매출 등 회사 실적은 AX 효과와 섞지 않습니다. 계산식 · 원천자료 · 표본 수는 「근거 보기」(AX 도입 성과 · 측정 근거)에 그대로 있습니다.
          </p>
        </footer>
      </div>
    </PageShell>
  )
}
