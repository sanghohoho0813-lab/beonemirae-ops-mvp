import { useMemo, useState } from 'react'
import { CalendarOff, Trash2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { SectionTitle, ExpandableSection, SecondaryButton } from './ui'
import { prettyDate } from '../lib/format'
import { hasHolidaysIn, holidayClashes, parseHolidays } from '../lib/holidays'

// ─────────────────────────────────────────────────────────────────────────────
// 휴무일
//
//  편성은 실제 이력에서 요일 패턴을 찾으므로 일요일에 안 가던 곳은
//  일요일이 잡히지 않습니다. 그런데 평일에 떨어지는 공휴일은 그냥 평일로
//  봅니다 — 한 달치를 편성하면 그 달 공휴일만큼 잘못된 예정이 기사에게
//  나가고, 그걸 손으로 지웁니다.
//
//  목록을 코드에 박아 두지 않습니다. 해마다 바뀌고 임시공휴일이 생깁니다.
//  박아 두면 그 해가 지나는 순간 조용히 틀리는데, **일하는 날을 쉬는
//  날로 착각해 수거를 빠뜨리는 쪽이 더 위험합니다.**
// ─────────────────────────────────────────────────────────────────────────────

export function HolidayPanel({ from, to }: { from: string; to: string }) {
  const { data, saveHolidays, removeHoliday, sync } = useData()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const year = Number(from.slice(0, 4))
  const parsed = useMemo(() => parseHolidays(text, year), [text, year])
  const all = useMemo(
    () => (data.holidays ?? []).slice().sort((a, b) => a.day.localeCompare(b.day)),
    [data.holidays],
  )
  const inRange = all.filter((h) => h.day >= from && h.day <= to)
  const covered = hasHolidaysIn(data, from, to)
  const clashes = useMemo(() => holidayClashes(data, from, to), [data, from, to])

  async function save() {
    if (parsed.rows.length === 0) return
    setBusy(true)
    setError(null)
    setMsg(null)
    const r = await saveHolidays(parsed.rows)
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? '저장하지 못했습니다.')
      return
    }
    setText('')
    setMsg(`휴무일 ${r.result?.added ?? 0}일 등록 · ${r.result?.updated ?? 0}일 수정했습니다.`)
  }

  async function drop(day: string, name: string) {
    if (!window.confirm(`${prettyDate(day)} ${name} 을(를) 휴무일에서 지울까요?`)) return
    setError(null)
    const r = await removeHoliday(day)
    if (!r.ok) setError(r.error ?? '지우지 못했습니다.')
  }

  return (
    <section data-holiday className="space-y-2.5">
      <SectionTitle>휴무일</SectionTitle>

      {/*
        넣어 둔 휴무일이 이 기간에 하나도 없으면 그 사실을 말해 줍니다.
        조용히 있으면 「공휴일도 알아서 빼 주겠지」로 읽힙니다.
      */}
      <div
        data-holiday-status
        className={`card flex gap-3 p-4 sm:p-5 ${covered ? '' : 'border-amber-200 bg-amber-50/50'}`}
      >
        <CalendarOff size={19} className={`mt-0.5 shrink-0 ${covered ? 'text-navy-400' : 'text-amber-600'}`} strokeWidth={2.4} />
        <div className="min-w-0 flex-1 text-[1.05rem] leading-relaxed text-navy-700">
          {covered ? (
            <p>
              이 기간에 <b className="text-navy-900">휴무일 {inRange.length}일</b>이 등록돼 있습니다 —{' '}
              {inRange.slice(0, 4).map((h) => `${h.day.slice(5)} ${h.name}`).join(' · ')}
              {inRange.length > 4 && ` 외 ${inRange.length - 4}일`}. 이 날짜는 편성에서 빠집니다.
            </p>
          ) : (
            <p className="break-keep">
              <b className="text-amber-700">이 기간에 등록된 휴무일이 없습니다.</b> 공휴일에도 방문 예정이 만들어집니다.
              공휴일 목록은 해마다 바뀌어 시스템이 짐작하지 않습니다 — 아래에 붙여 넣어 주세요.
            </p>
          )}
        </div>
      </div>

      {/*
        이미 만들어 둔 예정이 휴무일에 걸린 경우. 휴무일을 나중에 넣으면
        생깁니다. 저절로 지우지 않습니다 — 명절에도 가야 하는 병원이
        실제로 있고, 그건 사람이 정할 일입니다.
      */}
      {clashes.length > 0 && (
        <div data-holiday-clash className="card border-rose-200 bg-rose-50/50 p-4 sm:p-5">
          <p className="t-body font-extrabold text-navy-900">
            이미 만들어 둔 예정 {clashes.length}건이 휴무일에 잡혀 있습니다
          </p>
          <p className="t-caption mt-1 break-keep">
            저절로 지우지 않습니다. 명절에도 가야 하는 곳이 있어 사람이 정할 일입니다 — 「오늘 일정」에서 확인해 주세요.
          </p>
          <ExpandableSection label={`${clashes.length}건 보기`}>
            <div className="divide-y divide-rose-100">
              {clashes.slice(0, 60).map((c) => (
                <div key={c.scheduleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="shrink-0 tabular-nums text-navy-500">{c.date.slice(5)}</span>
                  <span className="min-w-0 flex-1 basis-[8rem] break-keep font-bold text-navy-800">{c.clientName}</span>
                  <span className="t-caption text-navy-500">{c.wasteType}</span>
                  <span className="t-caption text-rose-600">{c.holidayName}</span>
                </div>
              ))}
            </div>
          </ExpandableSection>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <label className="field-label" htmlFor="holiday-input">
          휴무일 붙여 넣기 (한 줄에 하나)
        </label>
        <textarea
          id="holiday-input"
          data-holiday-input
          rows={5}
          className="field-input w-full resize-y font-mono text-[1rem]"
          placeholder={'2026-01-01 신정\n2026-03-01 삼일절\n8월 15일 광복절'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="t-muted mt-1.5 break-keep">
          「2026-01-01 신정」·「2026.1.1 신정」·「1월 1일 신정」 모두 됩니다. 연도를 안 적으면 {year}년으로 봅니다. 회사
          휴무(창립기념일·하계휴가)도 같이 넣으시면 됩니다.
        </p>

        {parsed.rows.length > 0 && (
          <div data-holiday-preview className="mt-3 rounded-xl bg-navy-50/70 p-3.5">
            <p className="t-body font-bold text-navy-800">{parsed.rows.length}일을 읽었습니다</p>
            <p className="t-caption mt-1 break-keep text-navy-600">
              {parsed.rows.slice(0, 12).map((h) => `${h.day} ${h.name}`).join(' · ')}
              {parsed.rows.length > 12 && ` 외 ${parsed.rows.length - 12}일`}
            </p>
            {parsed.duplicates.length > 0 && (
              <p className="t-caption mt-1 text-navy-500">
                같은 날이 두 번 나와 뒤엣것을 씁니다 — {parsed.duplicates.join(', ')}
              </p>
            )}
          </div>
        )}

        {/*  읽지 못한 줄은 조용히 버리지 않습니다. 버리면 그 날만 휴무일이
            안 되고 아무도 그 사실을 모릅니다. */}
        {parsed.bad.length > 0 && (
          <div data-holiday-bad className="mt-2 rounded-xl bg-amber-50 p-3.5">
            <p className="t-body font-bold text-amber-700">읽지 못한 줄 {parsed.bad.length}개 — 이 줄은 등록되지 않습니다</p>
            <p className="t-caption mt-1 break-all text-navy-600">{parsed.bad.slice(0, 6).join(' / ')}</p>
          </div>
        )}

        {error && (
          <p data-holiday-error className="mt-2 text-[1.03rem] font-semibold text-rose-600">
            {error}
          </p>
        )}
        {msg && (
          <p data-holiday-msg className="mt-2 text-[1.03rem] font-semibold text-teal-700">
            {msg}
          </p>
        )}

        <div className="mt-3">
          <SecondaryButton onClick={() => void save()} disabled={busy || sync.saving || parsed.rows.length === 0}>
            <span data-holiday-save>{busy ? '저장하는 중…' : `${parsed.rows.length}일 등록하기`}</span>
          </SecondaryButton>
        </div>
      </div>

      {all.length > 0 && (
        <ExpandableSection label={`등록된 휴무일 ${all.length}일 보기`}>
          <div data-holiday-list className="card divide-y divide-navy-100">
            {all.map((h) => (
              <div key={h.day} data-holiday-row={h.day} className="flex items-center gap-3 p-3">
                <span className="shrink-0 tabular-nums text-navy-600">{h.day}</span>
                <span className="min-w-0 flex-1 break-keep font-bold text-navy-800">{h.name}</span>
                <button
                  data-holiday-del={h.day}
                  className="shrink-0 rounded-full p-2 text-navy-400 transition hover:bg-rose-50 hover:text-rose-500"
                  onClick={() => void drop(h.day, h.name)}
                  aria-label={`${h.day} 휴무일 삭제`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </ExpandableSection>
      )}
    </section>
  )
}
