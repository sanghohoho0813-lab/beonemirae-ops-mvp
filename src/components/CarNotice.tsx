import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { today } from '../lib/format'

// ─────────────────────────────────────────────────────────────────────────────
// 호차 배정 안내 (0070) — 2주만 떴다가 사라집니다
//
//  대표님 말씀: "혹시나 입사일이 더 빠른 사람이 왜 4호차냐 뭐 이런 아주
//  사소한 걸로 궁금해 할 수도 있기 때문에, 출생연도 순으로 호차를 배정한
//  거고 추후 변경도 가능하다 정도로 아주 조그만 글씨로 2주 정도만."
//
//  ⚠ 날짜로 끝냅니다. 「본 지 2주」로 하면 늦게 입사한 분에게는 몇 달 뒤에
//    뜹니다. 모두에게 **같은 날** 사라지는 것이 맞습니다.
//  ⚠ 닫으면 그 기기에서는 다시 안 뜹니다. 저장할 곳은 그 기기뿐입니다 —
//    이런 안내 하나 때문에 DB 에 칸을 만들지 않습니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 *  안내가 사라지는 날. 0070 을 올린 날(2026-08-21)에서 2주 뒤입니다.
 *  ⚠ 이 날짜가 지나면 이 파일은 아무것도 그리지 않습니다. 지워도 됩니다.
 */
const UNTIL = '2026-09-04'
const KEY = 'beonemirae-ops:car-notice'

export function CarNotice() {
  const { role } = useAuth()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(KEY) === 'off')
    } catch {
      //  기기가 저장을 막아 두면 그냥 보여 줍니다 — 안 보이는 것보다 낫습니다.
      setHidden(false)
    }
  }, [])

  if (role !== 'field') return null
  if (today() > UNTIL) return null
  if (hidden) return null

  return (
    //  ⚠ 0071 — 세 줄이라 첫 화면 위쪽 90px 을 차지했습니다. 매일 아침
    //    여는 화면에서 **오늘 갈 곳보다 먼저** 읽히면 안 됩니다.
    //    한 줄로 줄이고, 자리도 오늘 일정 아래로 내렸습니다.
    //    자세한 것은 「도움말 → 사용 방법」에 늘 있습니다.
    <div data-car-notice className="mt-3 flex items-center gap-2 rounded-2xl bg-navy-50 px-3.5 py-2">
      {/*  ⚠ truncate 로 한 줄에 욱여넣었더니 「바꾸실 수 있습니다」가 잘려
             나갔습니다. 대표님이 붙이라 하신 **안심시키는 쪽**이 잘리면
             안내를 붙인 뜻이 없어집니다. 두 줄까지 허용합니다 — 이 칸은
             이제 오늘 일정 **아래**에 있어서 첫 화면을 밀지 않습니다.
             말투도 「사용 방법」의 안내와 같게 맞춥니다 (바꾸실 수 있습니다). */}
      <p className="min-w-0 flex-1 break-keep text-[0.95rem] leading-snug text-navy-500">
        호차는 출생연도 순입니다 · 바꾸실 수 있습니다
      </p>
      <button
        data-car-notice-close
        aria-label="안내 닫기"
        onClick={() => {
          setHidden(true)
          try {
            window.localStorage.setItem(KEY, 'off')
          } catch {
            /* 저장 못 해도 이번 화면에서는 사라집니다 */
          }
        }}
        className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-navy-400 transition active:scale-95"
      >
        <X size={17} strokeWidth={2.5} />
      </button>
    </div>
  )
}
