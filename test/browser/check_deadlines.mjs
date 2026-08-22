import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

//  밀린 마감 훑기 (deadlines.ts).
//
//   알림은 **틀리면 죽습니다.** 아무 일도 없던 달을 「청구 안 했다」고
//   띄우면 지워지지 않는 빨간 줄이 생기고, 사람은 곧 그것을 안 보게
//   됩니다. 그러면 진짜로 빠뜨린 달도 같이 안 보입니다.
//
//   확인하는 것
//    · 일이 있던 달만 세는가 (빈 달은 조용한가)
//    · 이번 달을 「마감 안 했다」고 하지 않는가
//    · 사람이 표시하면 조용해지는가
//    · 오래된 달이 먼저 오는가
//    · **법정 기한을 단정하지 않는가** (며칠 지났다는 사실만)
//    · 취소한 청구를 청구로 세지 않는가

const ROOT = '/home/user/beonemirae-ops-mvp'
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const dir = mkdtempSync(join(tmpdir(), 'dl-'))
const bundle = join(dir, 'dl.mjs')
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
  join(ROOT, 'src/lib/deadlines.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outfile=${bundle}`,
], { stdio: 'pipe' })
const D = await import(bundle)

const ASOF = '2026-08-16'
const CA = 'c1'
const CB = 'c2'

const mkSched = (id, date, status = '완료') => ({
  id, date, clientId: CA, wasteType: '의료폐기물', vehicleId: 'v1', scheduledTime: '',
  status, expectedAmount: 50, actualAmount: status === '완료' ? 50 : null,
  completedAt: status === '완료' ? `${date}T09:00:00Z` : null, memo: '',
})
//  ⚠ status 는 실제 값이어야 합니다 — '입금완료' | '미수금' | '확인필요' | '취소'.
//    없는 값을 쓰면 outstandingOf 가 전액 미수로 보고 검사가 엉뚱하게 틀립니다.
const mkPay = (id, month, clientId, amount, over = {}) => ({
  id, clientId, billingMonth: month, amount, status: '입금완료', method: '무통장',
  paidAt: null, memo: '', canceledAt: null,
  snapshot: { invoice: { rows: [], total: amount } }, ...over,
})
const mkData = (over = {}) => ({
  clients: [{ id: CA, name: '가나요양병원' }, { id: CB, name: '다라병원' }],
  schedules: [], payments: [], receipts: [], monthCloseMarks: [], ...over,
})

// ── 1. 달 계산 ──────────────────────────────────────────────────────────────
{
  ok(D.shiftMonth('2026-08', -1) === '2026-07', '한 달 전', D.shiftMonth('2026-08', -1))
  ok(D.shiftMonth('2026-01', -1) === '2025-12', '해를 넘어가는 한 달 전', D.shiftMonth('2026-01', -1))
  ok(D.shiftMonth('2026-01', -6) === '2025-07', '반년 전', D.shiftMonth('2026-01', -6))
  ok(D.monthEnd('2026-02') === '2026-02-28', '2월 말일', D.monthEnd('2026-02'))
  ok(D.monthEnd('2024-02') === '2024-02-29', '윤년 2월 말일', D.monthEnd('2024-02'))
  ok(D.monthEnd('2026-08') === '2026-08-31', '31일 달', D.monthEnd('2026-08'))
}

// ── 2. 아무 일도 없던 달은 조용하다 ─────────────────────────────────────────
//   이게 가장 중요합니다. 매달 뜨는 빨간 줄은 알림을 죽입니다.
{
  const s = D.scanDeadlines(mkData(), ASOF)
  ok(s.items.length === 0, '**수거도 청구도 없는 달은 아무 말도 안 함**', `${s.items.length}건`)
  ok(s.months.length === 6, '지난 6달을 훑음', s.months.join(' '))
  ok(!s.months.includes('2026-08'), '**이번 달은 안 훑음** — 아직 안 끝난 달을 마감 안 했다고 하면 매일 울립니다',
    s.months.join(' '))
  ok(s.months[0] === '2026-02' && s.months[5] === '2026-07', '오래된 달부터', `${s.months[0]} … ${s.months[5]}`)
}

// ── 3. 수거는 있는데 청구가 없다 ────────────────────────────────────────────
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10'), mkSched('s2', '2026-06-20')],
  }), ASOF)
  const confirm = s.items.filter((i) => i.kind === 'confirm')
  ok(confirm.length === 1 && confirm[0].month === '2026-06', '청구가 한 건도 없으면 알려 줌', confirm[0]?.detail)
  ok(/수거 2건/.test(confirm[0].detail), '**실제 수거 건수를 적음**', confirm[0].detail)
  //  청구가 없으면 명세서·세금계산서·입금은 아직 할 수 없는 일입니다.
  ok(!s.items.some((i) => ['invoice_sent', 'tax_issued', 'bank'].includes(i.kind)),
    '**청구가 없으면 그 뒤 단계는 재촉하지 않음** — 아직 할 수 없는 일입니다',
    s.items.map((i) => i.kind).join(' '))
  ok(confirm[0].daysAfterMonthEnd === 47, '그 달이 끝난 지 며칠인지 (6-30 → 8-16 = 47일)', String(confirm[0].daysAfterMonthEnd))
}

// ── 4. 청구는 했는데 표시가 없다 ────────────────────────────────────────────
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10')],
    payments: [mkPay('p1', '2026-06', CA, 1000000, { paidAt: '2026-07-20' })],
  }), ASOF)
  const kinds = s.items.map((i) => i.kind)
  ok(kinds.includes('invoice_sent'), '명세서 발송 표시가 없으면 알려 줌')
  ok(kinds.includes('tax_issued'), '세금계산서 표시가 없으면 알려 줌')
  ok(!kinds.includes('confirm'), '청구를 했으면 확정은 재촉하지 않음')
  const inv = s.items.find((i) => i.kind === 'invoice_sent')
  ok(/청구 1건을 확정했는데/.test(inv.detail), '무엇 때문에 떴는지 적음', inv.detail)
  ok(/사람이 표시한 기록 \(없음\)/.test(inv.source), '출처가 「사람이 표시한 기록(없음)」', inv.source)
}

// ── 5. 사람이 표시하면 조용해진다 ───────────────────────────────────────────
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10')],
    payments: [mkPay('p1', '2026-06', CA, 1000000, { paidAt: '2026-07-20' })],
    monthCloseMarks: [
      { month: '2026-06', step: 'invoice_sent', markedAt: '2026-07-05T00:00:00Z', markedName: '송명근', note: '' },
      { month: '2026-06', step: 'tax_issued', markedAt: '2026-07-08T00:00:00Z', markedName: '송명근', note: '' },
    ],
  }), ASOF)
  ok(s.items.length === 0, '**표시하면 그 달은 조용해짐**', s.items.map((i) => i.kind).join(' '))
  ok(s.monthsBehind === 0, '밀린 달 0', String(s.monthsBehind))
}

// ── 6. 오래된 달이 먼저 ─────────────────────────────────────────────────────
//   3개월 전에 빠뜨린 것이 어제 것보다 급합니다.
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('a', '2026-03-10'), mkSched('b', '2026-07-10')],
    payments: [
      mkPay('p1', '2026-03', CA, 500000, { status: '미수금', paidAt: null }),
      mkPay('p2', '2026-07', CA, 800000, { paidAt: '2026-08-05' }),
    ],
  }), ASOF)
  ok(s.items[0].month === '2026-03', '**오래된 달이 맨 위**', s.items.map((i) => i.month).join(' '))
  ok(s.monthsBehind === 2, '밀린 달 수를 셈', String(s.monthsBehind))
  //  같은 달 안에서는 업무 흐름 순서
  const june = s.items.filter((i) => i.month === '2026-03').map((i) => i.kind)
  ok(june.join(',') === 'invoice_sent,tax_issued,bank', '한 달 안에서는 흐름 순서', june.join(','))
}

// ── 7. 법정 기한을 단정하지 않는다 ──────────────────────────────────────────
//   「다음 달 10일까지」 같은 세법 기한을 시스템이 단정하면, 틀렸을 때
//   책임질 곳이 없습니다. 며칠 지났다는 **사실**만 적습니다.
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10')],
    payments: [mkPay('p1', '2026-06', CA, 1000000, { paidAt: '2026-07-20' })],
  }), ASOF)
  const text = JSON.stringify(s)
  for (const word of ['법정', '기한', '가산세', '10일까지', '지연', '위반']) {
    ok(!text.includes(word), `「${word}」이라고 말하지 않음 — 세법 판단은 시스템이 할 일이 아닙니다`)
  }
  ok(s.items.every((i) => typeof i.daysAfterMonthEnd === 'number'), '대신 며칠 지났는지 사실만 적음')
}

// ── 8. 취소한 청구는 청구가 아니다 ──────────────────────────────────────────
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10')],
    payments: [mkPay('p1', '2026-06', CA, 1000000, { status: '취소', canceledAt: '2026-07-01T00:00:00Z' })],
  }), ASOF)
  const kinds = s.items.map((i) => i.kind)
  ok(kinds.includes('confirm'), '**취소한 청구는 「확정한 청구」로 안 셈**', kinds.join(' '))
  ok(!kinds.includes('invoice_sent'), '취소된 것에 명세서를 보내라고 하지 않음')
}

// ── 9. 입금 ─────────────────────────────────────────────────────────────────
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('s1', '2026-06-10')],
    payments: [mkPay('p1', '2026-06', CA, 1000000, { status: '미수금', paidAt: null })],
    monthCloseMarks: [
      { month: '2026-06', step: 'invoice_sent', markedAt: '2026-07-05T00:00:00Z', markedName: '송', note: '' },
      { month: '2026-06', step: 'tax_issued', markedAt: '2026-07-05T00:00:00Z', markedName: '송', note: '' },
    ],
  }), ASOF)
  const bank = s.items.find((i) => i.kind === 'bank')
  ok(bank !== undefined, '안 들어온 돈을 알려 줌')
  ok(/1,000,000원/.test(bank.detail), '**남은 금액을 그대로**', bank.detail)
  ok(/1곳/.test(bank.detail), '몇 곳인지도', bank.detail)
}

// ── 10. 훑는 범위 밖은 안 본다 ──────────────────────────────────────────────
//    끝없이 거슬러 올라가면 시스템을 쓰기 전의 달까지 빨갛게 뜹니다.
{
  const s = D.scanDeadlines(mkData({
    schedules: [mkSched('old', '2025-06-10')],
    payments: [mkPay('p0', '2025-06', CA, 100000)],
  }), ASOF)
  ok(s.items.length === 0, '**6달보다 오래된 달은 안 봄** — 시스템 쓰기 전 달까지 빨개지면 안 됩니다',
    s.items.map((i) => i.month).join(' '))
  //  범위를 넓히면 보입니다 — 못 보는 게 아니라 기본값이 6달입니다.
  const wide = D.scanDeadlines(mkData({
    schedules: [mkSched('old', '2025-06-10')],
    payments: [mkPay('p0', '2025-06', CA, 100000)],
  }), ASOF, 15)
  ok(wide.items.length > 0, '범위를 넓히면 보임 (기본이 6달일 뿐)', `${wide.items.length}건`)
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
