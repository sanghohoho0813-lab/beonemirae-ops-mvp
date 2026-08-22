import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// 지금 날짜와 시각 (0078)
//
//  대표님 요청: 「그 어떤 계정이든, PC 든 스마트폰이든, 오늘 날짜와 현재 시각을
//  분·초까지 볼 수 있게」.
//
//  ⚠ **한국 시각(Asia/Seoul)** 으로 그립니다. 이 시스템의 다른 모든 날짜
//    계산(today() · nowTime() · 당일 입력률)이 한국 시각 기준이라, 시계만
//    기기 시간대를 따르면 「화면 시계는 오늘인데 저장은 어제로 들어가는」
//    일이 생깁니다. 기기 시간대가 어긋나 있어도 같은 값을 보게 합니다.
//
//  ⚠ 1초마다 다시 그립니다. 그래서 **이 부품만** 따로 두었습니다 — 화면
//    전체가 1초마다 다시 그려지면 긴 목록이 있는 화면이 눈에 띄게 무거워집니다.
//
//  ⚠ 숫자는 tabular-nums 로 둡니다. 아니면 초가 바뀔 때마다 글자 폭이 달라져
//    시계가 좌우로 떨립니다.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'Asia/Seoul'
const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 한국 시각으로 「연·월·일·요일·시·분·초」를 뜯어 옵니다 */
function seoulNow() {
  const now = new Date()
  //  sv-SE 는 「2026-08-22 14:37:12」 꼴이라 자르기 쉽습니다
  const s = now.toLocaleString('sv-SE', { timeZone: TZ })
  const [date, time] = s.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss] = (time ?? '00:00:00').split(':')
  //  요일은 **한국 날짜**로 구해야 합니다 — 기기 시간대로 구하면 자정 근처에
  //  하루가 어긋납니다.
  const dow = DOW[new Date(`${date}T00:00:00`).getDay()]
  const h = Number(hh)
  return {
    y, m, d, dow,
    ampm: h < 12 ? '오전' : '오후',
    h12: String(h % 12 === 0 ? 12 : h % 12),
    mm, ss,
  }
}

/**
 *  @param full 연도까지 보입니다 (PC). 폰에서는 자리가 좁아 월·일부터 씁니다.
 */
export function LiveClock({ full = false, className = '' }: { full?: boolean; className?: string }) {
  const [t, setT] = useState(seoulNow)

  useEffect(() => {
    //  ⚠ 1초 간격으로 「맞춰」 둡니다. setInterval(1000) 만 쓰면 처음 건 시각에
    //    따라 초가 어중간하게 넘어가, 시계가 한 박자 늦게 바뀌는 것처럼 보입니다.
    let id = 0
    const tick = () => {
      setT(seoulNow())
      id = window.setTimeout(tick, 1000 - (Date.now() % 1000))
    }
    id = window.setTimeout(tick, 1000 - (Date.now() % 1000))
    return () => window.clearTimeout(id)
  }, [])

  return (
    <span data-live-clock className={`tabular-nums whitespace-nowrap ${className}`}>
      {full && <>{t.y}년 </>}
      {t.m}월 {t.d}일 ({t.dow}) <span className="text-navy-300">·</span> {t.ampm}{' '}
      {t.h12}:{t.mm}:{t.ss}
    </span>
  )
}
