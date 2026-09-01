import { useMemo, useState } from 'react'
import { CalendarPlus, CalendarX2, CheckCircle2, Info, Truck, Undo2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { PageHeader } from '../components/PageHeader'
import { AiButton } from '../components/AiAction'
import { PageShell, SectionTitle, ExpandableSection, PrimaryButton, SecondaryButton, EmptyState } from '../components/ui'
import { WasteBadge } from '../components/Badge'
import { today, prettyDate } from '../lib/format'
import { addDays } from '../lib/performance'
import { buildPlan, WEEKDAY_LABEL, type PlanResult } from '../lib/schedulePlan'
import { HolidayPanel } from '../components/HolidayPanel'
import { buildAssignment, dayLabel } from '../lib/vehiclePlan'
import type { AssignResultRow, PlanBatchResult } from '../lib/repo'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 일정 편성
//
//  매일 아침 "오늘 어디 가지"를 사람이 정하던 일을, 실제 수거 기록에서 읽은
//  요일 패턴으로 미리 만들어 둡니다.
//
//  화면이 지키는 것
//   · 만들기 전에 **무엇을 왜 만드는지** 전부 보여 줍니다 (거래처·요일·근거)
//   · 근거가 약한 거래처는 만들지 않고 이유를 적습니다
//   · 이미 있는 날짜는 손대지 않습니다
//   · 잘못 만들면 한 번에 되돌립니다
// ─────────────────────────────────────────────────────────────────────────────

const RANGES = [
  { weeks: 1, label: '1주' },
  { weeks: 2, label: '2주' },
  { weeks: 4, label: '4주' },
]

/** 서버가 한 번에 받는 최대 건수 (0028) */
const MAX_ROWS = 500

function Stat({ label, value, unit, tone = 'navy' }: { label: string; value: number; unit: string; tone?: 'navy' | 'teal' | 'amber' }) {
  const color = tone === 'teal' ? 'text-teal-600' : tone === 'amber' ? 'text-amber-700' : 'text-navy-900'
  return (
    <div className="card p-4">
      <p className="text-[1.03rem] font-semibold text-navy-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-extrabold ${color}`}>
        {value.toLocaleString('ko-KR')}
        <span className="ml-0.5 text-base text-navy-400">{unit}</span>
      </p>
    </div>
  )
}

/** 「① 일정 만들기」 처럼 지금 어느 단계인지 크게 알려 줍니다 */
function StepTitle({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-navy-800 text-[1.15rem] font-extrabold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="break-keep text-[1.25rem] font-extrabold text-navy-900">{title}</p>
        <p className="break-keep text-[1.0rem] font-medium text-navy-400">{desc}</p>
      </div>
    </div>
  )
}

/**
 * ② 차량 배정.
 *
 *  ①에서 만든 예정에는 차가 비어 있습니다. 여기서 붙여야 오늘 일정에
 *  「기사 미지정」이 사라지고 배차 화면에도 잡힙니다.
 */
function AssignStep({ from, to }: { from: string; to: string }) {
  const { data, assignVehicles, undoAssign, sync } = useData()
  const [done, setDone] = useState<AssignResultRow | null>(null)
  const [undone, setUndone] = useState<{ cleared: number; kept: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const plan = useMemo(() => buildAssignment(data, from, to), [data, from, to])

  const save = async () => {
    setBusy(true)
    setError(null)
    setUndone(null)
    const r = await assignVehicles(plan.rows.map((x) => ({ scheduleId: x.scheduleId, vehicleId: x.vehicleId })))
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '차량을 배정하지 못했습니다.')
      return
    }
    setDone(r.result)
  }

  const undo = async () => {
    if (!done) return
    setBusy(true)
    setError(null)
    const r = await undoAssign(done.ids)
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '되돌리지 못했습니다.')
      return
    }
    setUndone(r.result)
    setDone(null)
  }

  //  날짜별로 묶어 보여 줍니다 — 하루 단위로 봐야 차가 모자란 날이 보입니다.
  const days = [...new Set(plan.loads.map((l) => l.date))]

  return (
    <div data-assign-step className="contents">
      <StepTitle n={2} title="차량 배정" desc="어느 차가 · 하루에 얼마나" />

      <div className="card flex gap-3 p-4 sm:p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Truck size={18} />
        </span>
        <div className="min-w-0 space-y-2 text-[1.05rem] leading-relaxed text-navy-600">
          <p>
            <b className="text-navy-800">의료폐기물 차량과 기저귀 차량은 섞지 않습니다</b> — 법으로 분리 운행이라 규칙입니다. 그
            안에서 ① 최근 12주 그 거래처를 실제로 담당한 차 ② 그날 적재 여유가 가장 많은 차 순으로 붙입니다. 적재량은 명목
            적재량이 아니라 실적재 가능량(의료폐기물은 용기 부피 때문에 2/3 수준)을 씁니다.
          </p>
          <p className="rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] text-navy-500">
            경로 순서·운행거리·도착시간은 만들지 않습니다 — 거래처 좌표가 없어 실제로 계산할 수 없습니다. 하루에 몇 곳까지
            도는지의 상한도 실제 기록이 없어 두지 않았습니다. 대신 차량마다 정차 수를 함께 보여 드립니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-assign-summary>
        <Stat label="배정할 일정" value={plan.rows.length} unit="건" tone="teal" />
        <Stat label="쓰이는 차량" value={new Set(plan.rows.map((r) => r.vehicleId)).size} unit="대" />
        <Stat label="배정 못 함" value={plan.unassigned.length} unit="건" tone="amber" />
        <Stat label="대상 예정" value={plan.targets} unit="건" />
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <PrimaryButton onClick={save} disabled={busy || sync.saving || plan.rows.length === 0 || !!done}>
          <span data-assign-save>
            {busy ? '배정하는 중…' : `차량 ${plan.rows.length.toLocaleString('ko-KR')}건 배정하기`}
          </span>
        </PrimaryButton>
        {done && (
          <SecondaryButton onClick={undo} disabled={busy}>
            <span data-assign-undo className="flex items-center gap-1.5">
              <Undo2 size={16} /> 방금 배정 되돌리기
            </span>
          </SecondaryButton>
        )}
        {plan.rows.length === 0 && !done && (
          <p className="break-keep text-[1.03rem] text-navy-400">
            {plan.targets === 0 ? '차량이 비어 있는 예정이 없습니다.' : '붙일 수 있는 차량이 없습니다.'}
          </p>
        )}
      </div>

      {done && (
        <div data-assign-result className="card flex gap-3 border-teal-200 bg-teal-50 p-4 sm:p-5">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-600" />
          <div className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
            <p className="font-bold text-teal-700">
              {done.assigned.toLocaleString('ko-KR')}건에 차량을 붙였습니다
              {done.skipped > 0 && ` (이미 차가 있던 ${done.skipped.toLocaleString('ko-KR')}건은 건너뜀)`}
            </p>
            <p className="mt-1 text-navy-500">
              차량 {done.vehicles}대{done.from && ` · ${done.from} ~ ${done.to}`} · 「오늘 일정」의 기사 표시와 「배차·경로」에 반영됩니다.
            </p>
          </div>
        </div>
      )}

      {undone && (
        <div data-assign-undone className="card flex gap-3 p-4 sm:p-5">
          <Undo2 size={20} className="mt-0.5 shrink-0 text-navy-400" />
          <p className="min-w-0 text-[1.05rem] leading-relaxed text-navy-600">
            {undone.cleared.toLocaleString('ko-KR')}건의 차량 배정을 풀었습니다.
            {undone.kept > 0 && ` 그 사이 수거를 다녀온 ${undone.kept}건은 그대로 두었습니다.`}
          </p>
        </div>
      )}

      {error && (
        <div data-assign-error className="card border-rose-200 bg-rose-50 p-4 text-[1.05rem] font-semibold text-rose-600">
          {error}
        </div>
      )}

      {/* 날짜별 차량 적재 */}
      {days.length > 0 && (
        <section>
          <SectionTitle>날짜별 차량 적재</SectionTitle>
          <div className="space-y-3" data-assign-loads>
            {days.map((d) => (
              <div key={d} className="card p-4">
                <p className="mb-2.5 break-keep font-extrabold text-navy-900">{dayLabel(d)}</p>
                <div className="space-y-2">
                  {plan.loads.filter((l) => l.date === d).map((l) => (
                    <div
                      key={`${l.vehicleId}|${l.date}`}
                      data-assign-load={`${l.date}|${l.vehicleId}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-navy-50 px-3.5 py-3"
                    >
                      <WasteBadge type={l.wasteType} />
                      <span className="min-w-0 flex-1 basis-[10rem] break-keep font-bold text-navy-800">
                        {l.vehicleName} <span className="font-medium text-navy-400">· {l.driver}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-navy-200">
                          <span
                            className={`block h-full rounded-full ${l.loadPct > 100 ? 'bg-rose-500' : 'bg-teal-500'}`}
                            style={{ width: `${Math.min(100, l.loadPct)}%` }}
                          />
                        </span>
                        <span className={`text-[0.98rem] font-bold ${l.loadPct > 100 ? 'text-rose-500' : 'text-teal-600'}`}>
                          {l.loadPct}%
                        </span>
                      </span>
                      <span className="break-keep text-[0.98rem] font-medium text-navy-500">
                        {l.kg.toLocaleString('ko-KR')} / {l.capacity.toLocaleString('ko-KR')}kg · 정차 {l.stops}곳
                        {l.added !== l.stops && ` (새로 ${l.added}곳)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 배정 못 한 일정 — 차가 모자란 날을 미리 압니다 */}
      {plan.unassigned.length > 0 && (
        <section>
          <SectionTitle>차량을 붙이지 못한 일정</SectionTitle>
          <div className="card divide-y divide-navy-100" data-assign-unassigned>
            {plan.unassigned.map((u) => (
              <div key={u.scheduleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
                <span className="shrink-0 rounded-lg bg-amber-50 px-2.5 py-1 text-[0.98rem] font-bold text-amber-700">
                  {dayLabel(u.date)}
                </span>
                <WasteBadge type={u.wasteType} />
                <span className="min-w-0 flex-1 basis-[10rem] break-keep font-bold text-navy-700">{u.clientName}</span>
                <span className="break-keep text-[0.98rem] text-navy-500">{u.reason}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-[0.98rem] text-navy-400">
            그날 차가 모자랍니다. 용차를 부르거나 날짜를 옮겨야 합니다 — 억지로 실어 두지 않았습니다.
          </p>
        </section>
      )}

      {/* 어느 차에 왜 붙였는지 */}
      {plan.rows.length > 0 && (
        <section>
          <SectionTitle>배정 근거 {plan.rows.length.toLocaleString('ko-KR')}건</SectionTitle>
          <ExpandableSection label="한 건씩 확인하기">
            <div className="card divide-y divide-navy-100">
              {plan.rows.map((r) => (
                <div
                  key={r.scheduleId}
                  data-assign-row={r.scheduleId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5"
                >
                  <span className="shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-bold text-navy-700">
                    {dayLabel(r.date)}
                  </span>
                  <WasteBadge type={r.wasteType} />
                  <span className="min-w-0 flex-1 basis-[9rem] break-keep font-semibold text-navy-800">{r.clientName}</span>
                  <span className="shrink-0 break-keep font-bold text-navy-700">{r.vehicleName}</span>
                  <span className="break-keep text-[0.98rem] text-navy-400">
                    예상 {r.expectedAmount.toLocaleString('ko-KR')}kg · {r.basis}
                  </span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </section>
      )}
    </div>
  )
}

export function SchedulePlan() {
  const { data, planSchedules, undoPlan, sync } = useData()
  const [weeks, setWeeks] = useState(4)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<PlanBatchResult | null>(null)
  const [undone, setUndone] = useState<{ deleted: number; kept: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = today()
  const to = addDays(from, weeks * 7 - 1)

  //  data 가 바뀌면(저장 후 다시 읽어오면) 미리보기도 함께 다시 계산됩니다 —
  //  방금 만든 일정이 「이미 있음」으로 바뀌어 두 번 만들어지지 않습니다.
  const plan: PlanResult = useMemo(() => buildPlan(data, from, to), [data, from, to])

  const key = (clientId: string, wasteType: string) => `${clientId}|${wasteType}`
  const rows = plan.rows.filter((r) => !excluded.has(key(r.clientId, r.wasteType)))
  const overCap = rows.length > MAX_ROWS

  const toggle = (k: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    setUndone(null)
    const r = await planSchedules(
      rows.map((x) => ({
        clientId: x.clientId,
        date: x.date,
        wasteType: x.wasteType,
        expectedAmount: x.expectedAmount,
        basis: x.basis,
      })),
    )
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '일정을 만들지 못했습니다.')
      return
    }
    setDone(r.result)
  }

  const undo = async () => {
    if (!done) return
    setBusy(true)
    setError(null)
    const r = await undoPlan(done.batch)
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '되돌리지 못했습니다.')
      return
    }
    setUndone(r.result)
    setDone(null)
  }

  const patternCount = plan.usable.length
  //  「이미 있어 건너뜀」과 「휴무일이라 뺌」은 다른 이야기입니다.
  //  한 숫자로 묶으면 휴무일 때문에 빠진 것을 이미 있는 일정으로 읽습니다.
  const existsSkips = plan.skipped.filter((s) => s.kind === 'exists')
  const skippedCount = plan.skipped.length

  return (
    <PageShell>
      <div data-plan-page>
        {/*  ⚠ action 은 2단계 예정 기능의 입구입니다 — 아래 「예정 만들기」·
             「차량 배정」 같은 실제 버튼보다 튀지 않게 테두리로만 세웠습니다. */}
        <PageHeader
          title="수거 일정 편성"
          subtitle="① 실제 기록의 요일로 예정을 만들고 → ② 차를 붙입니다"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AiButton id="route" />
              <AiButton id="plan" />
            </div>
          }
        />
      </div>

      {/* 무엇을 근거로 만드는지 — 먼저 밝힙니다 */}
      <div className="card flex gap-3 p-4 sm:p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-500">
          <Info size={18} />
        </span>
        <div className="min-w-0 space-y-2 text-[1.05rem] leading-relaxed text-navy-600">
          <p>
            거래처 카드에 적힌 「수거주기」 문구가 아니라, <b className="text-navy-800">최근 12주 동안 실제로 완료된 수거의 요일</b>을
            세어 만듭니다. 한 요일에 3회 이상이면서 수거가 있었던 주의 절반 이상을 차지할 때만 반복 요일로 봅니다.
          </p>
          <p>
            만들어지는 것은 <b className="text-navy-800">예정</b>일 뿐입니다. 수거이력·정산·매출에는 잡히지 않고, 현장에서 수거
            입력을 해야 실적이 됩니다. 이미 일정이 있는 날은 손대지 않습니다.
          </p>
          <p className="rounded-xl bg-navy-50 px-3.5 py-2.5 text-[0.98rem] text-navy-500">
            공휴일은 아직 반영하지 않습니다 — 만들어진 뒤 「오늘 일정」에서 그날 건을 지우거나 옮겨 주세요.
          </p>
        </div>
      </div>

      {/* 기간 */}
      <section>
        <SectionTitle>편성 기간</SectionTitle>
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {RANGES.map((r) => (
              <button
                key={r.weeks}
                type="button"
                data-plan-range={r.weeks}
                onClick={() => {
                  setWeeks(r.weeks)
                  setDone(null)
                  setUndone(null)
                }}
                className={`rounded-2xl px-4 py-2.5 text-[1.05rem] font-bold transition ${
                  weeks === r.weeks ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                앞으로 {r.label}
              </button>
            ))}
            <span className="ml-1 break-keep text-[1.03rem] font-medium text-navy-500">
              {prettyDate(from)} ~ {prettyDate(to)}
            </span>
          </div>
        </div>
      </section>

      {/*  휴무일을 먼저 봅니다 — 편성 결과가 여기에 달려 있습니다. */}
      <HolidayPanel from={from} to={to} />

      <StepTitle n={1} title="일정 만들기" desc="언제 · 어디를" />

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5" data-plan-summary>
        <Stat label="만들 일정" value={rows.length} unit="건" tone="teal" />
        <Stat label="반영 거래처" value={new Set(rows.map((r) => r.clientId)).size} unit="곳" />
        <Stat label="이미 있어 건너뜀" value={existsSkips.length} unit="건" />
        <Stat label="휴무일이라 뺌" value={plan.holidaySkips} unit="건" tone="amber" />
        <Stat label="근거 부족해 제외" value={plan.unusable.length} unit="곳" tone="amber" />
      </div>

      {/* 만들기 */}
      <div className="card flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <PrimaryButton onClick={create} disabled={busy || sync.saving || rows.length === 0 || overCap || !!done}>
          <span data-plan-create>
            {busy ? '만드는 중…' : `일정 ${rows.length.toLocaleString('ko-KR')}건 만들기`}
          </span>
        </PrimaryButton>
        {done && (
          <SecondaryButton onClick={undo} disabled={busy}>
            <span data-plan-undo className="flex items-center gap-1.5">
              <Undo2 size={16} /> 방금 만든 편성 되돌리기
            </span>
          </SecondaryButton>
        )}
        {overCap && (
          <p className="break-keep text-[1.03rem] font-semibold text-rose-500">
            한 번에 {MAX_ROWS}건까지만 만들 수 있습니다 (지금 {rows.length.toLocaleString('ko-KR')}건). 기간을 줄여 주세요.
          </p>
        )}
        {rows.length === 0 && !done && (
          <p className="break-keep text-[1.03rem] text-navy-400">이 기간에 새로 만들 일정이 없습니다.</p>
        )}
      </div>

      {done && (
        <div
          data-plan-result
          className="card flex gap-3 border-teal-200 bg-teal-50 p-4 sm:p-5"
        >
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-600" />
          <div className="min-w-0 text-[1.05rem] leading-relaxed text-navy-700">
            <p className="font-bold text-teal-700">
              예정 {done.inserted.toLocaleString('ko-KR')}건을 만들었습니다
              {done.skipped > 0 && ` (이미 있던 ${done.skipped.toLocaleString('ko-KR')}건은 건너뜀)`}
            </p>
            <p className="mt-1 text-navy-500">
              거래처 {done.clients}곳{done.from && ` · ${done.from} ~ ${done.to}`} · 「오늘 일정」과 「배차·경로」에 바로 반영됩니다.
            </p>
          </div>
        </div>
      )}

      {undone && (
        <div data-plan-undone className="card flex gap-3 p-4 sm:p-5">
          <Undo2 size={20} className="mt-0.5 shrink-0 text-navy-400" />
          <p className="min-w-0 text-[1.05rem] leading-relaxed text-navy-600">
            {undone.deleted.toLocaleString('ko-KR')}건을 되돌렸습니다.
            {undone.kept > 0 && ` 이미 수거가 진행된 ${undone.kept}건은 그대로 두었습니다.`}
          </p>
        </div>
      )}

      {error && (
        <div data-plan-error className="card border-rose-200 bg-rose-50 p-4 text-[1.05rem] font-semibold text-rose-600">
          {error}
        </div>
      )}

      {/* 거래처별 근거 */}
      <section>
        <SectionTitle>거래처별 반복 요일 · 근거</SectionTitle>
        {patternCount === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="반복 요일을 찾은 거래처가 없습니다"
            subtitle="최근 12주 수거 기록이 쌓이면 자동으로 나타납니다. 엑셀 가져오기로 과거 기록을 넣어도 됩니다."
          />
        ) : (
          <div className="card divide-y divide-navy-100">
            {plan.usable.map((p) => {
              const k = key(p.clientId, p.wasteType)
              const off = excluded.has(k)
              const count = plan.rows.filter((r) => r.clientId === p.clientId && r.wasteType === p.wasteType).length
              return (
                <label
                  key={k}
                  data-plan-pattern={k}
                  className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 p-4"
                >
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => toggle(k)}
                    className="h-5 w-5 shrink-0 accent-navy-700"
                  />
                  <WasteBadge type={p.wasteType} />
                  <span className={`min-w-0 flex-1 basis-[12rem] break-keep font-bold ${off ? 'text-navy-400 line-through' : 'text-navy-900'}`}>
                    {p.clientName}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {p.weekdays.map((w) => (
                      <span key={w.weekday} className="rounded-lg bg-navy-800 px-2.5 py-1 text-[0.98rem] font-bold text-white">
                        {WEEKDAY_LABEL[w.weekday]}
                      </span>
                    ))}
                  </span>
                  <span className="break-keep text-[0.98rem] font-medium text-navy-500">
                    {p.weekdays.map((w) => `${WEEKDAY_LABEL[w.weekday]} ${w.hits}회 · 평소 ${w.medianKg.toLocaleString('ko-KR')}kg`).join(' / ')}
                  </span>
                  <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-[0.98rem] font-bold text-teal-700">
                    {count}건 생성
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </section>

      {/* 근거가 모자란 곳 — 왜 안 만들었는지 */}
      {plan.unusable.length > 0 && (
        <section>
          <SectionTitle>편성하지 않은 거래처</SectionTitle>
          <ExpandableSection label={`근거가 모자란 ${plan.unusable.length}건 보기`}>
            <div className="card divide-y divide-navy-100" data-plan-unusable>
              {plan.unusable.map((p) => (
                <div key={key(p.clientId, p.wasteType)} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
                  <WasteBadge type={p.wasteType} />
                  <span className="min-w-0 flex-1 basis-[11rem] break-keep font-bold text-navy-700">{p.clientName}</span>
                  <span className="break-keep text-[1.02rem] text-navy-500">{p.reason}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </section>
      )}

      {/* 만들 일정 전체 */}
      {rows.length > 0 && (
        <section>
          <SectionTitle>만들 일정 {rows.length.toLocaleString('ko-KR')}건</SectionTitle>
          <ExpandableSection label="날짜별로 하나씩 확인하기">
            <div className="card divide-y divide-navy-100">
              {rows.map((r) => (
                <div
                  key={`${r.clientId}|${r.date}|${r.wasteType}`}
                  data-plan-row={`${r.date}|${r.clientId}|${r.wasteType}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5"
                >
                  <span className="shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-bold text-navy-700">
                    {r.date} ({WEEKDAY_LABEL[r.weekday]})
                  </span>
                  <WasteBadge type={r.wasteType} />
                  <span className="min-w-0 flex-1 basis-[10rem] break-keep font-semibold text-navy-800">{r.clientName}</span>
                  <span className="break-keep text-[0.98rem] text-navy-400">
                    예상 {r.expectedAmount.toLocaleString('ko-KR')}kg · {r.basis}
                  </span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </section>
      )}

      {/* 건너뛴 날짜 */}
      {skippedCount > 0 && (
        <section>
          <SectionTitle>건너뛴 날</SectionTitle>
          <ExpandableSection label={`${skippedCount}건 보기`}>
            <div className="card divide-y divide-navy-100" data-plan-skipped>
              {plan.skipped.map((s) => (
                <div key={`${s.clientId}|${s.date}|${s.wasteType}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
                  <span className="shrink-0 rounded-lg bg-navy-50 px-2.5 py-1 text-[0.98rem] font-bold text-navy-500">{s.date}</span>
                  <WasteBadge type={s.wasteType} />
                  <span className="min-w-0 flex-1 break-keep font-semibold text-navy-600">{s.clientName}</span>
                  <span className="break-keep text-[0.98rem] text-navy-400">{s.reason}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </section>
      )}

      <AssignStep from={from} to={to} />

      <p className="flex items-center gap-1.5 px-1 text-[0.98rem] text-navy-400">
        <CalendarPlus size={14} /> 만든 일정과 배정은 감사로그에 묶음으로 남습니다 — 언제 누가 몇 건을 만들었는지 확인할 수 있습니다.
      </p>
    </PageShell>
  )
}
