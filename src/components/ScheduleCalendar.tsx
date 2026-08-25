import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { useSchemaAtLeast } from '../lib/schemaGate'
import { BookVisitModal } from './BookVisit'
import { monthCalendar, shiftMonth, type CalendarDay } from '../lib/calendar'

// ─────────────────────────────────────────────────────────────────────────────
// 수거 달력 (대표님 요청)
//
//  지금까지 「오늘 일정」은 화살표로 하루씩 넘겨야 했습니다. 다음 주에 어디를
//  가는지 보려면 일곱 번 눌러야 하고, 병원이 「언제 오실 수 있어요?」 물으면
//  답할 화면이 없었습니다.
//
//  ⚠ **빈 날을 그냥 비워 두지 않습니다.** 앞으로 올 날에는 ＋ 를 놓아 그
//    자리에서 방문을 잡습니다 — 「비었네」를 보고 다른 화면으로 나가야 하면
//    결국 안 잡습니다.
//
//  ⚠ **지난 날에는 ＋ 를 안 놓습니다.** 서버가 어차피 막지만, 눌리는데 안
//    되는 단추를 두면 사람이 한 번은 누릅니다.
//
//  ⚠ 무른 방문은 세지 않습니다(0059) — 취소한 방문이 남아 그날이 찬 것처럼
//    보이면, 정작 비어 있는 날에 새 방문을 안 잡게 됩니다.
// ─────────────────────────────────────────────────────────────────────────────

const WD = ['일', '월', '화', '수', '목', '금', '토']

function DayCell({
  d,
  selected,
  canBook,
  onPick,
  onBook,
}: {
  d: CalendarDay
  selected: boolean
  canBook: boolean
  onPick: (date: string) => void
  onBook: (date: string) => void
}) {
  //  일요일·토요일과 휴무일은 글자색으로 구분합니다.
  //  ⚠ 0082 — 이번 달이 아닌 칸을 opacity-40 으로 통째 흐리게 두었습니다.
  //    **부모가 흐려지면 자식 글자도 같이 흐려져**, 날짜 숫자가 1.7~2.3:1 까지
  //    떨어졌습니다. 지난 달 날짜도 읽을 수는 있어야 합니다.
  //    흐림은 **배경색으로** 냅니다 — 글자는 그대로 두고 칸만 눌러 둡니다.
  const dim = !d.inMonth
  //  ⚠ 0082 — 주말·휴무일 **날짜 숫자**가 흰 바탕에서 3.4~4.1:1 이었습니다.
  //    0080 에서 요일 머리글(일·월·화…)은 진하게 고쳤는데, 정작 그 아래
  //    날짜 숫자는 그대로였습니다. 색이 뜻하는 바(일=빨강 · 토=파랑)는
  //    두고 한 단계씩 진하게만 합니다.
  const tone = d.holiday || d.weekday === 0 ? 'text-rose-600' : d.weekday === 6 ? 'text-sky-700' : 'text-navy-700'

  return (
    <div
      data-cal-day={d.date}
      className={`relative flex min-h-[4.2rem] flex-col border-b border-r border-navy-100 p-1 sm:min-h-[5.4rem] sm:p-1.5 ${
        selected ? 'bg-teal-50 ring-2 ring-inset ring-teal-400' : d.isToday ? 'bg-navy-50' : ''
      } ${dim ? 'bg-navy-50 text-navy-400' : ''}`}
    >
      {/*  ⚠ 누르는 곳은 **칸 전체**여야 합니다.
           예전에는 이 버튼이 글자 높이(27px)만 차지해서, 칸(67px)의 아래쪽을
           누르면 아무 일도 일어나지 않았습니다. 기사님이 달리는 차 안에서
           장갑 끼고 누르는 자리라 이게 그대로 「안 눌린다」가 됩니다.
           h-full 로 칸을 다 채웁니다 — 보이는 모양은 그대로입니다. */}
      <button
        type="button"
        data-cal-pick={d.date}
        onClick={() => onPick(d.date)}
        className="block w-full flex-1 text-left"
      >
        {/*  ⚠ 0071 — 17.6px 였습니다. 폰에서 한 칸이 53px 라 숫자를 키워도
             들어갑니다. 50~60대 기사님이 달리는 차 안에서 보는 숫자입니다. */}
        <span className={`text-[1.15rem] font-extrabold tabular-nums ${tone}`}>{d.dayOfMonth}</span>
        {d.isToday && <span className="ml-1 text-[1rem] font-bold text-teal-700">오늘</span>}
        {d.holiday && (
          <span className="ml-1 block truncate text-[0.9rem] font-bold text-rose-600">{d.holiday}</span>
        )}

        {/*  숫자만 놓습니다. 거래처 이름을 다 적으면 폰에서 칸이 터집니다 —
             누르면 위 목록에 그날 전체가 나옵니다. */}
        {d.total > 0 && (
          <span data-cal-count={d.date} className="mt-1 flex flex-wrap gap-0.5">
            {d.done > 0 && (
              <span className="rounded bg-teal-600 px-1 text-[0.95rem] font-extrabold text-white">
                {d.done}
              </span>
            )}
            {d.pending > 0 && (
              <span className="rounded bg-navy-700 px-1 text-[0.95rem] font-extrabold text-white">
                {d.pending}
              </span>
            )}
          </span>
        )}
      </button>

      {/*  앞으로 올 날에만 ＋. 오늘도 포함입니다(아침에 온 전화). */}
      {canBook && !d.isPast && (
        <button
          type="button"
          data-cal-book={d.date}
          onClick={() => onBook(d.date)}
          aria-label={`${d.date} 방문 잡기`}
          /*  누르는 자리를 폰에서는 36px 로 잡습니다. 폰에서 칸 하나가 56px 밖에
              안 되어 44px 로 키우면 ＋ 가 칸을 거의 다 덮어 **날짜 고르기를
              가로챕니다.** 날짜 숫자는 왼쪽 위에 있으니 오른쪽 아래 36px 이
              서로 안 겹칩니다.

              ⚠ 0080 — 그런데 이 「좁아서 어쩔 수 없다」가 **넓은 화면까지**
                따라가 있었습니다. 접는 폰을 편 673px 에서는 칸 하나가 96px 라
                자리가 남는데도 40px 그대로였습니다. 손가락 기준(44px)에
                1~4px 모자란 단추가 15개 잡혔습니다. 칸이 넓어지는 지점(sm:)
                부터는 44px 로 키웁니다 — 폰의 36px 은 그대로 둡니다.
                min-* 을 함께 두는 이유는 rem 이라 노트북(root 15.8px)에서
                2.75rem 이 43.45px 로 **1px 모자라게** 떨어지기 때문입니다. */
          className="absolute bottom-0 right-0 flex h-9 w-9 items-end justify-end rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-800 hover:text-white sm:h-11 sm:w-11 sm:min-h-[44px] sm:min-w-[44px] sm:items-center sm:justify-center"
        >
          <Plus className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" strokeWidth={3} />
        </button>
      )}
    </div>
  )
}

export function ScheduleCalendar({
  selected,
  onPick,
}: {
  /** 위 목록이 보고 있는 날짜 — 달력에서 그 칸을 표시합니다 */
  selected: string
  onPick: (date: string) => void
}) {
  const { data } = useData()
  const { role, mode } = useAuth()
  //  ── 기사님도 본인 담당 거래처는 스스로 잡습니다 (0067) ──────────────────
  //   ⚠ 서버 판이 67 이상일 때만 열어 줍니다. 66 이하에서는 book_visit 이
  //     사무실·관리자 전용이라, ＋ 를 그려 놓으면 눌러도 거절당합니다.
  //     판이 올라가면 저절로 나타납니다.
  const fieldCanBook = useSchemaAtLeast(67) === true && role === 'field'
  const canBook = role === 'admin' || role === 'office' || !mode || fieldCanBook

  const [month, setMonth] = useState(() => selected.slice(0, 7))
  const [bookDate, setBookDate] = useState<string | null>(null)
  const cal = useMemo(() => monthCalendar(data, month), [data, month])

  //  고른 날이 다른 달로 넘어가면 달력도 따라갑니다 — 화살표로 날짜를
  //  넘기다 달이 바뀌었는데 달력만 지난달에 머무르면 어긋나 보입니다.
  //
  //  ⚠ 「selected 의 달 ≠ month 면 맞춘다」로 쓰면 안 됩니다. 그러면 달
  //    이동 버튼을 눌러도 그 자리에서 곧바로 되돌려집니다(다음 달을 볼 수
  //    없습니다). **selected 가 실제로 바뀐 순간에만** 맞춥니다.
  const [lastSel, setLastSel] = useState(selected)
  if (selected !== lastSel) {
    setLastSel(selected)
    if (selected.slice(0, 7) !== month) setMonth(selected.slice(0, 7))
  }

  return (
    <section data-schedule-calendar className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-navy-100 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          data-cal-prev
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="지난달"
          /*  폰에서 달을 넘기는 자리입니다. 36px 는 장갑 낀 손으로 자꾸 빗나갑니다. */
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-navy-500 transition hover:bg-navy-50"
        >
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>
        <p data-cal-month className="t-card min-w-0 flex-1 text-center text-navy-900">
          {month.replace('-', '년 ')}월
        </p>
        <button
          type="button"
          data-cal-next
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="다음달"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-navy-500 transition hover:bg-navy-50"
        >
          <ChevronRight size={19} strokeWidth={2.4} />
        </button>
      </div>

      <div className="grid grid-cols-7 border-t border-navy-100 bg-navy-50">
        {WD.map((w, i) => (
          <p
            key={w}
            /*  ⚠ 0080 — 요일 머리글이 흰 바탕에서 대비 기준에 못 미쳤습니다:
                  일 2.5:1 · 월~금 3.2:1 (기준 4.5:1). 요일은 「무슨 색인지」가
                  아니라 「무슨 글자인지」를 읽는 자리라, 옅은 색은 그냥 안
                  읽히는 것입니다. 색이 뜻하는 바(일=빨강 · 토=파랑)는 그대로
                  두고 **한 단계씩 진하게**만 했습니다.
                  (이 표는 접는 폰·태블릿·노트북에서 함께 보입니다.
                   폰 390px 에서는 날짜 띠를 쓰기 때문에 여태 안 잡혔습니다.) */
            className={`border-r border-navy-100 py-1.5 text-center text-[1rem] font-extrabold ${
              i === 0 ? 'text-rose-700' : i === 6 ? 'text-sky-700' : 'text-navy-500'
            }`}
          >
            {w}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-navy-100">
        {cal.weeks.flat().map((d) => (
          <DayCell
            key={d.date}
            d={d}
            selected={d.date === selected}
            canBook={canBook}
            onPick={onPick}
            onBook={setBookDate}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:px-4">
        <span className="t-muted flex items-center gap-1 text-navy-500">
          <span className="rounded bg-teal-600 px-1 text-[0.95rem] font-extrabold text-white">n</span> 다녀옴
        </span>
        <span className="t-muted flex items-center gap-1 text-navy-500">
          <span className="rounded bg-navy-700 px-1 text-[0.95rem] font-extrabold text-white">n</span> 갈 곳
        </span>
        <span data-cal-total className="t-muted ml-auto text-navy-500">
          이 달 다녀옴 {cal.done}건 · 남은 방문 {cal.pending}건
        </span>
      </div>

      {canBook && (
        <p className="t-muted break-keep border-t border-navy-100 bg-navy-50 px-3 py-2.5 text-navy-500 sm:px-4">
          날짜를 누르면 그날 일정이 위에 나옵니다. <b className="text-navy-600">앞으로 올 날의 ＋ 를 누르면 그
          자리에서 방문을 잡습니다.</b>
        </p>
      )}

      {bookDate && canBook && (
        <BookVisitModal
          open
          onClose={() => setBookDate(null)}
          desiredDate={bookDate}
          onDone={() => onPick(bookDate)}
        />
      )}
    </section>
  )
}
