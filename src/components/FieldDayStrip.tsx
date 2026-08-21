import { useEffect, useMemo, useRef } from 'react'
import { isLive } from '../lib/scheduleLive'
import { today } from '../lib/format'
import type { AppData } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// 날짜 띠 (0068) — 폰에서 「오늘 · 이번 주 · 앞으로 몇 주」를 한 줄로
//
//  대표님 말씀: "오늘 / 이번 주 / 향후 2~4주 흐름이 한눈에 보이게",
//  "일정 있는 날짜는 명확하게 표시", "날짜 누르면 그날 병원 목록을 바로
//  아래에서 확인".
//
//  한 달 달력(42칸·620px)은 기사님에게 너무 큽니다. 가로로 미는 날짜 띠는
//  손가락 하나로 넘기고, 일정이 있는 날에는 **건수를 숫자로** 답니다.
//
//  ⚠ 새 자료를 만들지 않습니다. 이미 읽어 둔 일정을 날짜별로 셀 뿐입니다.
//  ⚠ 「없는 날」도 그립니다. 빈 날을 건너뛰면 기사님이 날짜를 못 고릅니다.
// ─────────────────────────────────────────────────────────────────────────────

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE')
}

export function FieldDayStrip({
  data,
  selected,
  onPick,
  days = 28,
}: {
  data: AppData
  selected: string
  onPick: (date: string) => void
  days?: number
}) {
  const from = today()

  //  날짜별 건수 — 무른 방문은 빼고 셉니다 (isLive)
  const countBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of data.schedules) {
      if (!isLive(s)) continue
      m.set(s.date, (m.get(s.date) ?? 0) + 1)
    }
    return m
  }, [data.schedules])

  //  어제 하루도 넣습니다 — 저녁에 못 넣고 다음 날 아침에 적는 일이 흔합니다.
  const list = useMemo(
    () => Array.from({ length: days + 1 }, (_, i) => addDays(from, i - 1)),
    [from, days],
  )

  //  고른 날이 화면 밖이면 끌어옵니다. 화살표로 날짜를 넘길 때 띠가 안 따라
  //  오면, 기사님은 지금 어느 날을 보고 있는지 놓칩니다.
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = boxRef.current?.querySelector(`[data-day="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [selected])

  return (
    <div
      ref={boxRef}
      data-day-strip
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      style={{ scrollbarWidth: 'none' }}
    >
      {list.map((d) => {
        const n = countBy.get(d) ?? 0
        const isToday = d === from
        const on = d === selected
        const dow = new Date(`${d}T00:00:00`).getDay()
        return (
          <button
            key={d}
            data-day={d}
            data-day-count={n}
            onClick={() => onPick(d)}
            className={`flex min-h-[4.25rem] w-[3.4rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl transition active:scale-[0.96] ${
              on
                ? 'bg-navy-900 text-white shadow-sm'
                : isToday
                  ? 'bg-teal-50 text-teal-800'
                  : 'bg-white text-navy-600'
            }`}
          >
            <span
              className={`text-[0.9rem] font-bold ${
                //  ⚠ 0069 — 요일 글자가 navy-400 이라 대비가 3.4:1 이었습니다.
                //    날짜 띠 한 줄에 스물아홉 개라, 이 화면에서 흐린 글자의
                //    대부분이 여기였습니다. 기준(4.5:1)을 넘는 색으로 올립니다.
                on ? 'text-white' : dow === 0 ? 'text-rose-600' : dow === 6 ? 'text-sky-700' : 'text-navy-500'
              }`}
            >
              {isToday ? '오늘' : DOW[dow]}
            </span>
            <span className="text-[1.25rem] font-extrabold tabular-nums leading-none">
              {Number(d.slice(8, 10))}
            </span>
            {/*  일정이 있으면 **숫자로** 답니다. 점만 찍으면 몇 곳인지 모릅니다. */}
            {n > 0 ? (
              <span
                className={`min-w-[1.15rem] rounded-full px-1 text-[0.85rem] font-extrabold leading-[1.15rem] ${
                  on ? 'bg-white text-navy-900' : 'bg-teal-500 text-white'
                }`}
              >
                {n}
              </span>
            ) : (
              <span className="h-[1.15rem]" />
            )}
          </button>
        )
      })}
    </div>
  )
}
