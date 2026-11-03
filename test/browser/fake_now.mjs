//  ─────────────────────────────────────────────────────────────────────────
//  검사용 「지금」 옮기기 — FAKE_NOW=2026-12-01T08:30:00+09:00 처럼 주면
//  이 검사 프로세스(Node)의 시계가 그 시각부터 흐릅니다.
//
//   ⚠ **맨 먼저** import 해야 합니다. 공용 자료(perf_fixtures)는 읽히는 순간의
//     「오늘」로 날짜를 만들기 때문에, 그보다 먼저 시계를 옮겨야 화면(브라우저
//     시계는 page.clock 으로 같은 시각) · 자료 · 기대값이 같은 날을 봅니다.
//   ⚠ FAKE_NOW 가 없으면 아무것도 안 합니다.
//  ─────────────────────────────────────────────────────────────────────────
const FAKE = process.env.FAKE_NOW
if (FAKE) {
  const RealDate = Date
  const offset = new RealDate(FAKE).getTime() - RealDate.now()
  if (Number.isNaN(offset)) throw new Error(`FAKE_NOW 를 읽을 수 없습니다: ${FAKE}`)
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset)
      else super(...args)
    }
    static now() {
      return RealDate.now() + offset
    }
  }
  globalThis.Date = ShiftedDate
}
export const FAKE_NOW = FAKE ?? null
