import { execFileSync } from 'node:child_process'

//  시간 변환 규칙 (lib/timeField.ts).
//
//   여기서 틀리면 **점심에 한 수거가 새벽 0시로 저장됩니다**. 화면으로는
//   「오후 12:30」 이라 멀쩡해 보이고, 나중에 수거대장을 뽑았을 때에야
//   드러납니다. 그래서 화면이 아니라 규칙을 직접 두들깁니다.

const SRC = '/home/user/beonemirae-ops-mvp/src/lib/timeField.ts'
const OUT = `${process.env.TEST_OUT ?? '/tmp'}/.timefield.mjs`
execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
  [SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${OUT}`], { stdio: 'pipe' })
const T = await import(`${OUT}?v=${process.pid}`)

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

// ── 왕복 — 하루 1440분을 전부 ────────────────────────────────────────────────
//   한두 개만 골라 보면 자정·정오만 비껴갑니다. 전부 돌립니다.
{
  const bad = []
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 1) {
      const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const back = T.toHm(T.parseHm(hm))
      if (back !== hm) bad.push(`${hm}→${back}`)
    }
  }
  ok(bad.length === 0, '**1440분 전부 그대로 돌아옴** — 저장값이 바뀌지 않습니다', bad.slice(0, 4).join(' '))
}

// ── 자정·정오 ───────────────────────────────────────────────────────────────
{
  ok(T.parseHm('00:00').meridiem === '오전' && T.parseHm('00:00').hour12 === 12,
    '00:00 은 **오전 12시** — 0시라고 뜨지 않음', JSON.stringify(T.parseHm('00:00')))
  ok(T.parseHm('12:00').meridiem === '오후' && T.parseHm('12:00').hour12 === 12,
    '12:00 은 **오후 12시**', JSON.stringify(T.parseHm('12:00')))
  ok(T.parseHm('12:30').meridiem === '오후', '12:30 은 오후')
  ok(T.parseHm('11:59').meridiem === '오전', '11:59 는 오전')
  ok(T.toHm({ meridiem: '오전', hour12: 12, minute: 0 }) === '00:00', '오전 12시 → 00:00')
  ok(T.toHm({ meridiem: '오후', hour12: 12, minute: 0 }) === '12:00',
    '**오후 12시 → 12:00** (0시로 저장되지 않음)')
  ok(T.toHm({ meridiem: '오후', hour12: 1, minute: 5 }) === '13:05', '오후 1시 5분 → 13:05')
  ok(T.toHm({ meridiem: '오전', hour12: 9, minute: 0 }) === '09:00', '오전 9시 → 09:00')
}

// ── 못 읽는 값 ──────────────────────────────────────────────────────────────
//   예전 기록에 빈 값이 있어도 화면이 깨지면 안 됩니다. 다만 **아무 값이나
//   저장되지는 않습니다** — 사람이 고른 뒤에 저장됩니다.
{
  for (const junk of ['', '  ', 'abc', '25:00', '9시 30분', null, undefined]) {
    const p = T.parseHm(junk)
    const okShape = ['오전', '오후'].includes(p.meridiem) && p.hour12 >= 1 && p.hour12 <= 12
      && p.minute >= 0 && p.minute <= 59
    ok(okShape, `못 읽는 값도 화면이 깨지지 않음 (${JSON.stringify(junk)})`, JSON.stringify(p))
  }
  ok(T.parseHm('25:00').hour12 === 12 || T.parseHm('25:00').hour12 <= 12, '범위를 벗어난 시도 12 안으로')
}

// ── 직접 타이핑 ─────────────────────────────────────────────────────────────
{
  ok(T.typedNumber('', 1, 12) === null, '**지우는 도중에는 값을 밀어 넣지 않음** — 두 자리를 고칠 수 있어야')
  ok(T.typedNumber('7', 1, 12) === 7, '한 자리')
  ok(T.typedNumber('11', 1, 12) === 11, '두 자리')
  ok(T.typedNumber('13', 1, 12) === 12, '12 를 넘으면 12 로')
  ok(T.typedNumber('0', 1, 12) === 1, '시는 0 이 될 수 없음')
  ok(T.typedNumber('0', 0, 59) === 0, '분은 0 이 됨')
  ok(T.typedNumber('99', 0, 59) === 59, '분은 59 까지')
  ok(T.typedNumber('3a', 0, 59) === 3, '숫자가 아닌 글자는 버림')
  ok(T.typedNumber('305', 0, 59) === 5, '세 자리를 치면 마지막 두 자리')
}

// ── ＋/－ ───────────────────────────────────────────────────────────────────
{
  ok(T.stepHour(12, 1) === 1, '12시에서 ＋ 는 1시')
  ok(T.stepHour(1, -1) === 12, '1시에서 － 는 12시')
  ok(T.stepHour(9, 1) === 10, '9시에서 ＋ 는 10시')
  //  오전/오후는 안 바뀝니다 — 시 버튼 하나가 두 칸을 바꾸면 무엇이 바뀐 건지
  //  보고 알기 어렵습니다.
  ok(T.toHm({ meridiem: '오전', hour12: T.stepHour(12, 1), minute: 0 }) === '01:00',
    '**시를 넘겨도 오전/오후는 그대로**')
  ok(T.stepMinute(0, 1) === 5, '0분에서 ＋ 는 5분')
  ok(T.stepMinute(55, 1) === 0, '55분에서 ＋ 는 0분')
  ok(T.stepMinute(0, -1) === 55, '0분에서 － 는 55분')
  ok(T.stepMinute(23, 1) === 25, '23분에서 ＋ 는 25분 (5분 자리로 맞춤)')
  ok(T.stepMinute(23, -1) === 20, '23분에서 － 는 20분')
  //  시가 따라 올라가지 않습니다.
  ok(T.toHm({ meridiem: '오전', hour12: 9, minute: T.stepMinute(55, 1) }) === '09:00',
    '분이 넘어가도 시는 그대로')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
