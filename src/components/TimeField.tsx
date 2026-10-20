import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { parseHm, stepHour, stepMinute, toHm, typedNumber, type Meridiem } from '../lib/timeField'

// ─────────────────────────────────────────────────────────────────────────────
// 큰 시간 입력 (오전/오후 · 시 · 분)
//
//  대표님 말씀: "시계로 이렇게 터치로 조정하게 하는 거 말고 그냥 숫자 패드로
//  넣는 방식이 좋을 것 같고, 지금은 그렇게도 가능은 한데 왼쪽에 너무 조그맣게
//  있어서 입력하기 되게 불편하거든."
//
//  그래서
//   · 오전/오후는 손가락으로 누르는 큰 버튼 두 개
//   · 시·분은 숫자 칸 — 폰에서 숫자 자판이 바로 뜹니다 (inputMode)
//   · 옆의 ＋/－ 로도 고칠 수 있습니다 (분은 5분 단위)
//
//  저장되는 값은 지금까지와 같은 'HH:MM' 입니다. 부르는 쪽은 바꿀 것이 없습니다.
// ─────────────────────────────────────────────────────────────────────────────

export function TimeField({
  value,
  onChange,
  label = '실제 수거 시간',
  optional = false,
}: {
  value: string
  onChange: (next: string) => void
  /** 빈 글자면 제목 줄을 안 그립니다 — 부르는 쪽이 이미 제목을 단 경우 (0148) */
  label?: string
  /** 「안 정해도 됩니다」 칸 — 비어 있으면 「안 정함」이라고 적고, 정한 뒤에는 지울 수 있게 (0148) */
  optional?: boolean
}) {
  const parts = parseHm(value)
  //  치는 도중에는 칸이 비어 있을 수 있습니다. 그 순간을 저장하지는 않습니다 —
  //  화면에만 비워 두고, 다 치면 그때 올려 보냅니다.
  const [hourText, setHourText] = useState(String(parts.hour12))
  const [minText, setMinText] = useState(String(parts.minute).padStart(2, '0'))

  //  바깥에서 값이 바뀌면(일정 선택 등) 칸도 따라갑니다.
  useEffect(() => {
    const p = parseHm(value)
    setHourText(String(p.hour12))
    setMinText(String(p.minute).padStart(2, '0'))
  }, [value])

  const push = (next: { meridiem?: Meridiem; hour12?: number; minute?: number }) =>
    onChange(toHm({ ...parts, ...next }))

  return (
    <div data-timefield>
      {label && <label className="field-label">{label}</label>}

      {/* 오전 / 오후 — 누르는 자리를 크게 */}
      <div className="grid grid-cols-2 gap-2">
        {(['오전', '오후'] as Meridiem[]).map((m) => (
          <button
            key={m}
            type="button"
            data-time-ampm={m}
            //  비어 있으면(안 정함) 둘 다 눌리지 않은 모양 — 오전이 켜져 보이면 정해진 줄 압니다 (0148)
            aria-pressed={!!value && parts.meridiem === m}
            onClick={() => push({ meridiem: m })}
            className={`rounded-2xl px-4 py-3.5 text-[1.15rem] font-extrabold transition active:scale-[0.97] ${
              value && parts.meridiem === m ? 'bg-navy-900 text-white shadow-sm' : 'bg-navy-50 text-navy-500'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/*  시 · 분.
           폰에서는 위아래로 놓습니다. 나란히 두면 한 칸이 30px 까지 좁아져서
           숫자 두 자리가 안 보이고, 손가락으로 짚기도 어렵습니다 — 고치려던
           바로 그 문제로 돌아갑니다. 넓은 화면에서만 한 줄로 둡니다. */}
      <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row">
        <NumberBox
          testId="hour"
          aria="시"
          text={hourText}
          onText={(t) => {
            setHourText(t)
            const n = typedNumber(t, 1, 12)
            if (n != null) push({ hour12: n })
          }}
          onBlur={() => setHourText(String(parseHm(value).hour12))}
          onStep={(by) => push({ hour12: stepHour(parts.hour12, by) })}
          unit="시"
        />
        {/*  0080 — navy-300 은 흰 바탕에서 2:1 입니다. 시와 분을 가르는
             기호라 안 보이면 두 칸이 무슨 관계인지 읽히지 않습니다. */}
        <span className="hidden self-center text-[1.4rem] font-extrabold text-navy-500 sm:block">:</span>
        <NumberBox
          testId="min"
          aria="분"
          text={minText}
          onText={(t) => {
            setMinText(t)
            const n = typedNumber(t, 0, 59)
            if (n != null) push({ minute: n })
          }}
          onBlur={() => setMinText(String(parseHm(value).minute).padStart(2, '0'))}
          onStep={(by) => push({ minute: stepMinute(parts.minute, by) })}
          unit="분"
        />
      </div>

      {/*  실제로 저장되는 값을 그대로 보여 줍니다. 오전/오후를 잘못 눌러
           점심 수거가 새벽으로 남는 일을 여기서 눈으로 잡습니다. */}
      {/*  0080 — navy-400 은 3.5:1 로 기준(4.5)에 못 미쳤습니다. 하필 이 줄은
           「눈으로 잡으라」고 만든 줄이라, 안 읽히면 있으나 마나입니다. */}
      {/*  ⚠ 0148 — 방문 예약처럼 「안 정해도 되는」 칸은 값이 비어 있어도 칸에는 오전 9:00 이 보입니다.
           예전에는 「저장될 시간」 뒤가 그냥 비어 있어, 9시로 잡힌 줄 알았습니다. 비었으면 비었다고 적습니다. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3">
        <p data-time-value={value} className="t-muted font-bold text-navy-500">
          저장될 시간{' '}
          {value ? (
            <span className="tabular-nums text-navy-700">{value}</span>
          ) : (
            <span data-time-unset className="text-navy-700">안 정함 — 위에서 고르면 정해집니다</span>
          )}
        </p>
        {optional && value && (
          <button
            type="button"
            data-time-clear
            onClick={() => onChange('')}
            className="t-btn -mx-1 inline-flex min-h-[2.75rem] items-center px-1 font-bold text-navy-500 underline underline-offset-2"
          >
            시각 지우기
          </button>
        )}
      </div>
    </div>
  )
}

function NumberBox({
  testId,
  aria,
  unit,
  text,
  onText,
  onBlur,
  onStep,
}: {
  testId: string
  aria: string
  unit: string
  text: string
  onText: (t: string) => void
  onBlur: () => void
  onStep: (by: number) => void
}) {
  const btn =
    'flex w-11 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600 transition active:scale-[0.94]'
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
      <button type="button" aria-label={`${aria} 줄이기`} data-time-step={`${testId}-`} onClick={() => onStep(-1)} className={btn}>
        <Minus size={20} strokeWidth={2.6} />
      </button>
      <input
        data-time-input={testId}
        aria-label={aria}
        //  숫자 자판이 바로 뜨게 합니다. type="number" 는 폰에서 위아래 화살표가
        //  붙어 칸이 좁아지고, 실수로 스크롤하면 값이 바뀝니다.
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onBlur={onBlur}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full min-w-0 rounded-xl border-2 border-navy-100 bg-white py-3 text-center text-[1.5rem] font-extrabold tabular-nums text-navy-900 focus:border-teal-500 focus:outline-none"
      />
      <button type="button" aria-label={`${aria} 늘리기`} data-time-step={`${testId}+`} onClick={() => onStep(1)} className={btn}>
        <Plus size={20} strokeWidth={2.6} />
      </button>
      <span className="self-center text-[1.05rem] font-extrabold text-navy-400">{unit}</span>
    </div>
  )
}
