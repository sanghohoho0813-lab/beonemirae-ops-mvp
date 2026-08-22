import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

//  **지어낸 값이 화면에 나가지 않는가** (대표님이 「성상」을 지적하신 뒤 전수).
//
//   「성상」은 일정 id 를 해시해 셋 중 하나를 찍어 내던 값이었습니다. 같은
//   방식으로 만들어지던 것이 더 있는지 훑어 다섯 개를 찾았습니다 —
//
//    ① 배출자 교육 「23개월 전 · 법정 주기 도래 임박」  ← id 해시
//    ② 교육 1회 예상 매출 150,000원                    ← 근거 없음
//    ③ 소모품 공급 예상 매출 (개수 × 3,500원)          ← 근거 없음
//    ④ kg 단가 fallback 1,200원                        ← 근거 없음
//    ⑤ 수거이력 성상·용기 종류·개수                     ← id 해시 (앞 판에서 제거)
//
//   ①②③ 은 **금액이 붙어 화면에 나갑니다.** 그 금액을 보고 어느 거래처를
//   먼저 도는지 정하면, 지어낸 숫자가 실제 영업 순서를 정하게 됩니다.
//
//   이 검사는 값 하나하나를 보는 동시에, **소스에 그 패턴이 다시 들어오는지**
//   도 함께 봅니다 — 다음에 누가 또 만들면 여기서 걸립니다.

const D = '/home/user/beonemirae-ops-mvp/src'
const O = (process.env.TEST_OUT ?? '/tmp')
const bundle = (name) => {
  execFileSync('/home/user/beonemirae-ops-mvp/node_modules/.bin/esbuild',
    [`${D}/lib/${name}.ts`, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${O}/.${name}.mjs`],
    { stdio: 'pipe' })
  return import(`${O}/.${name}.mjs?v=${process.pid}`)
}
const I = await bundle('insights')
const OPS = await bundle('ops')

const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const MONTH = TODAY.slice(0, 7)
const back = (n) => {
  const t = new Date(`${TODAY}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() - n)
  return t.toISOString().slice(0, 10)
}
const monthsBack = (n) => {
  const [y, m, d] = TODAY.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 - n, d))
  return t.toISOString().slice(0, 10)
}

const client = (id, name, over = {}) => ({
  id, name, type: '병원', address: '', manager: '', phone: '',
  collectionCycle: '주 1회', collectsMedicalWaste: true, collectsDiaper: false,
  storageSize: '보통', note: '', active: true, pricing: {},
  paymentDueDay: 20, paymentTerms: '', vatMode: '포함', bizNo: '',
  contractStart: null, contractEnd: null, educationAt: null,
  createdAt: '', updatedAt: '', ...over,
})
const done = (id, cid, date, kg) => ({
  id, date, clientId: cid, wasteType: '의료폐기물', vehicleId: 'v1',
  scheduledTime: '09:00', status: '완료', expectedAmount: kg, actualAmount: kg,
  completedAt: `${date}T10:00:00Z`, memo: '', origin: 'field',
  canceledAt: null, cancelReason: '',
})
const empty = {
  vehicles: [], materials: [], payments: [], officeStock: {}, notes: [],
  events: [], schedules: [], holidays: [], requests: [], productOrders: [],
}

// ── ① 배출자 교육 — 적어 둔 날짜가 없으면 아무 말도 안 한다 ────────────────
{
  const data = {
    ...empty,
    clients: [client('c1', '가나요양병원')],
    schedules: [done('a', 'c1', back(7), 100), done('b', 'c1', back(14), 100)],
  }
  const s = I.clientSignals(data, data.clients[0], MONTH)
  ok(s.educationMonthsAgo === null,
    '**교육일이 없으면 null** (예전에는 id 해시로 6~27개월을 지어냈습니다)',
    `${s.educationMonthsAgo}`)

  const acts = I.nextActionsFor(data, data.clients[0], MONTH)
  ok(!acts.some((a) => a.kind === '배출자교육'),
    '**교육 추천이 안 뜸** (모르는 것을 「임박」이라고 하지 않습니다)',
    acts.map((a) => a.kind).join(','))

  //  ⚠ 거래처 id 만 바꿔도 값이 달라지면 아직 해시를 쓰는 것입니다.
  const other = { ...data, clients: [client('zzzzzzzz', '가나요양병원')] }
  const s2 = I.clientSignals(other, other.clients[0], MONTH)
  ok(s2.educationMonthsAgo === null,
    '**id 를 바꿔도 여전히 null** (해시가 남아 있으면 값이 달라집니다)', `${s2.educationMonthsAgo}`)

  const rep = I.clientMonthlyReport(data, data.clients[0], MONTH)
  ok(rep.education.known === false && rep.education.needed === false,
    '**월간 리포트도 「정상」이라고 안 함** — 모르는 것입니다',
    `known=${rep.education.known} · needed=${rep.education.needed}`)
}

// ── ② 교육일을 넣으면 그때부터 계산 ────────────────────────────────────────
{
  const mk = (edu) => {
    const c = client('c1', '가나요양병원', { educationAt: edu })
    return { ...empty, clients: [c], schedules: [done('a', 'c1', back(7), 100)] }
  }
  const recent = mk(monthsBack(6))
  ok(I.clientSignals(recent, recent.clients[0], MONTH).educationMonthsAgo === 6,
    '6개월 전에 했으면 6', `${I.clientSignals(recent, recent.clients[0], MONTH).educationMonthsAgo}`)
  ok(!I.nextActionsFor(recent, recent.clients[0], MONTH).some((a) => a.kind === '배출자교육'),
    '아직 멀었으면 추천 안 뜸')

  const due = mk(monthsBack(22))
  const acts = I.nextActionsFor(due, due.clients[0], MONTH)
  const edu = acts.find((a) => a.kind === '배출자교육')
  ok(edu != null, '**22개월 지났으면 추천이 뜸** (실제 날짜 근거로)')
  ok(/22개월/.test(edu?.reason ?? ''), '근거에 실제 개월 수', edu?.reason)
  //  ⚠ 금액은 안 붙입니다 — 교육 단가를 시스템이 모릅니다.
  ok(edu?.estValue === 0,
    '**예상 매출을 안 붙임** (예전에는 15만원이라고 적어 두었습니다)', `${edu?.estValue}원`)

  const rep = I.clientMonthlyReport(due, due.clients[0], MONTH)
  ok(rep.education.known === true && rep.education.needed === true, '리포트도 「임박」으로')
}

// ── ③ 소모품 공급 제안 — 실제 단가가 있을 때만 금액 ────────────────────────
{
  const mats = (cid) => [{
    id: 'm1', date: `${MONTH}-05`, clientId: cid, boxCount: 10, vinylCount: 0,
    needleBoxCount: 0, isAdditionalRequest: true, items: {}, memo: '', createdAt: '',
  }]
  //  단가를 안 매겨 둔 거래처
  const noPrice = {
    ...empty, clients: [client('c1', '단가없는병원')],
    schedules: [done('a', 'c1', back(7), 100)], materials: mats('c1'),
  }
  const a1 = I.nextActionsFor(noPrice, noPrice.clients[0], MONTH).find((a) => a.kind === '소모품공급')
  ok(a1 != null, '소모품 제안 자체는 뜸 (추가요청이 있었으니까)')
  ok(a1?.estValue === 0,
    '**단가를 안 매겨 뒀으면 금액을 안 붙임** (예전에는 개당 3,500원을 썼습니다)',
    `${a1?.estValue}원`)

  //  실제로 단가를 매겨 둔 거래처
  const priced = {
    ...noPrice,
    clients: [client('c1', '단가있는병원', { pricing: { plastic5: { sale: 5000, cost: 1600 } } })],
  }
  const a2 = I.nextActionsFor(priced, priced.clients[0], MONTH).find((a) => a.kind === '소모품공급')
  ok((a2?.estValue ?? 0) > 0, '**단가가 있으면 그 단가로 계산**', `${a2?.estValue}원`)
  ok(a2.estValue % 5000 === 0, '실제 단가(5,000원)의 배수', `${a2?.estValue}원`)

  //  ⚠ 기본 단가표로 대신 채우면 안 됩니다 — 남의 단가입니다.
  ok(a1?.estValue === 0, '기본 단가표로 몰래 채우지 않음')
}

// ── ④ kg 단가 — 근거가 없으면 지어내지 않는다 ──────────────────────────────
{
  const none = { ...empty, clients: [client('c1', '가나')] }
  const p = I.unitPricePerKg(none, MONTH)
  ok(p === null, '**청구 기록이 없으면 null** (예전에는 1,200원을 썼습니다)', `${p}`)

  //  실제 청구가 있으면 그 값으로
  const withBill = {
    ...empty,
    clients: [client('c1', '가나')],
    schedules: [done('a', 'c1', `${MONTH}-05`, 100)],
    payments: [{
      id: 'p1', clientId: 'c1', billingMonth: MONTH, amount: 95000, status: '미수금',
      method: '무통장', paidAt: null, memo: '', snapshot: null, createdAt: '', updatedAt: '',
    }],
  }
  const p2 = I.unitPricePerKg(withBill, MONTH)
  ok(p2 === 950, '**실제 청구 ÷ 실제 kg**', `${p2}원/kg`)
}

// ── ⑤ 수거이력 — 성상·용기를 안 지어낸다 (앞 판 확인) ──────────────────────
{
  const data = {
    ...empty,
    clients: [client('c1', '가나')],
    schedules: [
      done('a', 'c1', back(3), 100),
      { ...done('b', 'c1', back(10), 80), containers: { corrugated: 3, plastic: 2, bag: 0, etc: 0 } },
    ],
  }
  const rows = OPS.collectionHistory(data, 'c1')
  ok(rows.length === 2, '이력 2건', `${rows.length}건`)
  ok(!('form' in rows[0]), '**성상 칸 자체가 없음**')
  const bare = rows.find((r) => r.id === 'a')
  ok(bare.containerType === null && bare.containerCount === null,
    '**안 적은 용기는 비움** (예전에는 2~9 사이 아무 값)',
    `${bare.containerType} / ${bare.containerCount}`)
  const kept = rows.find((r) => r.id === 'b')
  ok(kept.containerType === '골판지 3 · 합성수지 2' && kept.containerCount === 5,
    '**적은 것은 그대로**', `${kept.containerType} (${kept.containerCount})`)
}

// ── ⑥ 소스에 그 패턴이 다시 들어오는지 ─────────────────────────────────────
//
//   값 하나하나만 보면, 다음에 누가 또 「id 해시로 그럴듯한 값」을 만들 때
//   이 검사가 못 잡습니다. 소스를 직접 봅니다.
{
  const files = ['lib/insights.ts', 'lib/ops.ts']
  const bad = []
  for (const f of files) {
    const src = readFileSync(`${D}/${f}`, 'utf8')
    //  주석은 빼고 봅니다 — 「예전에는 해시를 썼다」는 설명은 남겨야 합니다.
    const code = src
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
      .join('\n')
    if (/charCodeAt/.test(code)) bad.push(`${f}: charCodeAt`)
    if (/Math\.random/.test(code)) bad.push(`${f}: Math.random`)
    if (/seedOf/.test(code)) bad.push(`${f}: seedOf`)
  }
  ok(bad.length === 0,
    '**id 를 해시해 값을 만드는 코드가 남아 있지 않음**', bad.join(' / ') || '없음')

  //  지어낸 상수도 사라졌는지
  const ins = readFileSync(`${D}/lib/insights.ts`, 'utf8')
  const code = ins.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
  ok(!/SUPPLY_UNIT_PRICE\s*=/.test(code), '소모품 기준단가 상수가 없음')
  ok(!/EDUCATION_PRICE\s*=/.test(code), '교육 기준단가 상수가 없음')
  ok(!/return 1_200|return 1200/.test(code), '**kg 단가 fallback 1,200원이 없음**')
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
