import { execFileSync, spawn } from 'node:child_process'

//  동시·대량 처리 실측.
//
//   지금까지 문서에 「미실측」으로 남아 있던 자리입니다. 사무실 두 사람이
//   같은 시각에 같은 일을 하면 어떻게 되는지를 **실제로 두 개의 접속으로**
//   확인합니다. 화면의 버튼 잠금은 내 브라우저에서만 도는 잠금이라 이걸
//   막지 못합니다.
//
//   재현하는 것
//    1. 같은 청구에 동시에 입금 — 합계가 청구액을 넘으면 안 됩니다
//    2. 같은 통장 줄을 동시에 두 번 — 돈이 두 배가 되면 안 됩니다
//    3. 같은 거래처·달을 동시에 확정 — 병원에 두 번 청구되면 안 됩니다
//    4. 같은 예정을 동시에 편성 — 기사에게 같은 방문이 두 번 나가면 안 됩니다
//    5. 대량 등록 중간에 끊김 — 반쪽만 저장되고 다시 올리면 어떻게 되는가
const DB = 'concq'
const ARGS = ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA']

const psql = (sql) =>
  execFileSync('sudo', [...ARGS, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const asRole = (uid, sql) =>
  execFileSync('sudo', [...ARGS, '-v', 'ON_ERROR_STOP=1', '-c',
    `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`],
    { encoding: 'utf8' }).trim()

/**
 * 진짜 동시 실행 — psql 프로세스를 여러 개 한꺼번에 띄웁니다.
 *  하나씩 순서대로 부르면 「동시」가 아니라 「연달아」입니다. 그건 이미
 *  다른 스위트에서 확인했고, 여기서 보려는 것은 두 접속이 겹칠 때입니다.
 */
function race(uid, sql, n) {
  const runs = Array.from({ length: n }, () =>
    new Promise((resolve) => {
      const ch = spawn('sudo', [...ARGS, '-c',
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`])
      let out = ''
      let err = ''
      ch.stdout.on('data', (d) => { out += d })
      ch.stderr.on('data', (d) => { err += d })
      ch.on('close', (code) => resolve({ ok: code === 0, out: out.trim(), err: err.trim() }))
    }),
  )
  return Promise.all(runs)
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}', '${email}', '${role}', '${role}', true, now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}
const OFFICE = mk('conc-office@beonemirae.test', 'office')

const TODAY = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)
const MONTH = TODAY.slice(0, 7)

psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper, pricing)
      values ('[검증]동시병원','병원','',true,false,'{"medical":{"sale":950,"cost":350}}'::jsonb)
      on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증]동시병원'`)

// ── 1. 같은 청구에 동시에 입금 ────────────────────────────────────────────
//  청구 100만원에 60만원씩 두 사람이 같은 순간에 넣습니다.
//  하나만 들어가야 합니다 — 둘 다 들어가면 120만원이 되어 청구액을 넘습니다.
psql(`insert into public.payments (client_id, billing_month, amount, status)
      values ('${CID}', '${MONTH}', 1000000, '미수금')`)
const PAY = psql(`select id from public.payments where client_id='${CID}' order by created_at desc limit 1`)

const r1 = await race(OFFICE,
  `select public.add_payment_receipt('${PAY}'::uuid, '${TODAY}'::date, 600000, '계좌이체', '동시')`, 2)
const won1 = r1.filter((r) => r.ok).length
const paid1 = Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${PAY}'`))
ok(won1 === 1, '같은 청구에 동시 입금 — 하나만 들어감', `성공 ${won1}건`)
ok(paid1 === 600000, '입금 합계가 60만원 (120만원이 되지 않음)', `${paid1.toLocaleString('ko-KR')}원`)
ok(r1.some((r) => !r.ok && /청구액을 넘습니다/.test(r.err)),
  '거부된 쪽은 이유를 알려 줌 — 「입금 합계가 청구액을 넘습니다」',
  (r1.find((r) => !r.ok)?.err ?? '').split('\n')[0].slice(0, 70))
ok(psql(`select status from public.payments where id='${PAY}'`) === '미수금',
  '부분입금이므로 상태는 미수금 그대로')

// ── 2. 같은 통장 줄을 동시에 두 번 ────────────────────────────────────────
//  같은 파일을 두 사람이 같은 순간에 올리는 경우입니다.
psql(`insert into public.payments (client_id, billing_month, amount, status)
      values ('${CID}', '2026-01', 500000, '미수금')`)
const PAY2 = psql(`select id from public.payments where client_id='${CID}' and billing_month='2026-01'`)
const REF = `2026-01-15|500000|동시병원`

const r2 = await race(OFFICE,
  `select public.add_payment_receipt('${PAY2}'::uuid, '2026-01-15'::date, 500000, '계좌이체', '', '${REF}')`, 3)
const won2 = r2.filter((r) => r.ok).length
const cnt2 = Number(psql(`select count(*) from public.payment_receipts where source_ref='${REF}'`))
ok(won2 === 1, '같은 통장 줄을 세 접속이 동시에 올려도 하나만', `성공 ${won2}건`)
ok(cnt2 === 1, '입금 기록이 한 건만 남음 — 돈이 세 배가 되지 않음', `${cnt2}건`)
const paid2 = Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${PAY2}'`))
ok(paid2 === 500000, '받은 돈은 50만원 그대로', `${paid2.toLocaleString('ko-KR')}원`)

// ── 3. 같은 거래처·달을 동시에 확정 (0032 회귀) ───────────────────────────
//  돈이 걸린 자리입니다 — 두 번 확정되면 병원에 두 배로 청구됩니다.
//  앞 단계가 만든 청구와 섞이지 않게 **깨끗한 거래처**로 확인합니다.
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper, pricing)
      values ('[검증]확정병원','병원','',true,false,'{"medical":{"sale":950,"cost":350}}'::jsonb)
      on conflict do nothing`)
const CID2 = psql(`select id from public.clients where name='[검증]확정병원'`)
psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at)
      values ('${MONTH}-03', '${CID2}', '의료폐기물', '완료', 100, 100, now())`)
const SCH = psql(`select id from public.schedules where client_id='${CID2}' and date='${MONTH}-03'`)
ok(psql(`select count(*) from public.payments where client_id='${CID2}'`) === '0',
  '확정 전에는 청구가 0건 (깨끗한 조건)')

const snap = `{"kind":"정기","confirmedAt":"${TODAY}T00:00:00Z","scheduleIds":["${SCH}"],"materialIds":[]}`
//  p_month 는 'YYYY-MM' 입니다 (날짜가 아니라 청구월).
const r3 = await race(OFFICE,
  `select public.confirm_billing('${CID2}'::uuid, '${MONTH}'::text, 95000, '${snap}'::jsonb)`, 3)
const bills = Number(psql(`select count(*) from public.payments where client_id='${CID2}'`))
const billed = Number(psql(`select coalesce(sum(amount),0) from public.payments where client_id='${CID2}'`))
ok(bills === 1, '세 접속이 같은 달을 동시에 확정해도 청구는 한 건 — 병원에 두 배로 안 나감',
  `${bills}건 · 성공 ${r3.filter((r) => r.ok).length}건`)
ok(billed === 95000, '청구 금액이 95,000원 한 번만', `${billed.toLocaleString('ko-KR')}원`)
ok(r3.some((r) => !r.ok && /이미 청구한|화면을 새로 고쳐/.test(r.err)),
  '거부된 쪽은 무엇을 하면 되는지 알려 줌',
  (r3.find((r) => !r.ok)?.err ?? '').split('\n')[0].slice(0, 70))

// ── 4. 같은 예정을 동시에 편성 ────────────────────────────────────────────
//  두 사람이 같은 시각에 「편성」을 누르면 기사에게 같은 방문이 두 번
//  나갈 수 있습니다.
const FUTURE = psql(`select to_char((now() at time zone 'Asia/Seoul')::date + 40, 'YYYY-MM-DD')`)
const rows = `[{"clientId":"${CID}","date":"${FUTURE}","wasteType":"의료폐기물","expectedAmount":100,"basis":"실측"}]`
const r4 = await race(OFFICE, `select public.create_planned_schedules('${rows}'::jsonb)`, 3)
const planned = Number(psql(`select count(*) from public.schedules
                             where client_id='${CID}' and date='${FUTURE}'`))
ok(planned === 1, '같은 예정을 세 접속이 동시에 편성해도 한 건만 — 기사에게 두 번 안 나감',
  `${planned}건 · 성공 ${r4.filter((r) => r.ok).length}건`)

// ── 5. 대량 등록 중간에 끊김 → 다시 올리기 ────────────────────────────────
//  통장 파일을 올리다 네트워크가 끊기면 앞부분만 저장됩니다. 다시 올렸을 때
//  앞부분이 두 번 들어가면 안 됩니다.
psql(`insert into public.payments (client_id, billing_month, amount, status)
      values ('${CID}', '2026-02', 300000, '미수금')`)
const PAY3 = psql(`select id from public.payments where client_id='${CID}' and billing_month='2026-02'`)
const R = (n) => `2026-02-0${n}|100000|동시병원`

//  1차 — 두 줄까지 들어가고 끊겼다고 가정
asRole(OFFICE, `select public.add_payment_receipt('${PAY3}'::uuid, '2026-02-01'::date, 100000, '계좌이체', '', '${R(1)}')`)
asRole(OFFICE, `select public.add_payment_receipt('${PAY3}'::uuid, '2026-02-02'::date, 100000, '계좌이체', '', '${R(2)}')`)
ok(Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${PAY3}'`)) === 200000,
  '끊기기 전까지 두 줄이 저장됨 (반쪽 저장은 설계상 정상 — 건마다 독립)')

//  2차 — 같은 파일을 처음부터 다시 올립니다
let again = 0
for (const n of [1, 2, 3]) {
  try {
    asRole(OFFICE, `select public.add_payment_receipt('${PAY3}'::uuid, '2026-02-0${n}'::date, 100000, '계좌이체', '', '${R(n)}')`)
    again += 1
  } catch { /* 이미 있는 줄은 거부됩니다 */ }
}
ok(again === 1, '다시 올리면 못 들어갔던 한 줄만 들어감 (앞의 두 줄은 거부)', `${again}줄`)
const paid3 = Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${PAY3}'`))
ok(paid3 === 300000, '받은 돈이 30만원 — 두 번 세지 않음', `${paid3.toLocaleString('ko-KR')}원`)
ok(psql(`select status from public.payments where id='${PAY3}'`) === '입금완료', '완납으로 바뀜')

// ── 6. 대량 — 100건을 한꺼번에 ────────────────────────────────────────────
//  실사용에서 통장 파일 한 장이 100줄쯤 됩니다. 그만큼을 동시에 밀어
//  넣어도 합계가 정확해야 합니다.
psql(`insert into public.payments (client_id, billing_month, amount, status)
      values ('${CID}', '2026-03', 1000000, '미수금')`)
const PAY4 = psql(`select id from public.payments where client_id='${CID}' and billing_month='2026-03'`)
const many = Array.from({ length: 100 }, (_, i) =>
  `select public.add_payment_receipt('${PAY4}'::uuid, '2026-03-01'::date, 10000, '계좌이체', '', '2026-03|10000|${i}')`)
//  20개씩 다섯 묶음을 동시에
for (let i = 0; i < 5; i += 1) {
  await Promise.all(many.slice(i * 20, i * 20 + 20).map((sql) =>
    new Promise((resolve) => {
      const ch = spawn('sudo', [...ARGS, '-c',
        `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}'; ${sql}`])
      ch.on('close', () => resolve(null))
      ch.stdout.on('data', () => {})
      ch.stderr.on('data', () => {})
    })))
}
const paid4 = Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${PAY4}'`))
const cnt4 = Number(psql(`select count(*) from public.payment_receipts where payment_id='${PAY4}'`))
ok(cnt4 === 100, '100줄이 전부 들어감', `${cnt4}건`)
ok(paid4 === 1000000, '합계가 1원까지 정확 (1,000,000원)', `${paid4.toLocaleString('ko-KR')}원`)
ok(psql(`select status from public.payments where id='${PAY4}'`) === '입금완료', '완납 처리')

//  한 줄 더 넣으면 청구액을 넘으므로 거부되어야 합니다
let over = false
try { asRole(OFFICE, `select public.add_payment_receipt('${PAY4}'::uuid, '2026-03-02'::date, 1, '계좌이체', '', 'over')`) }
catch (e) { over = /청구액을 넘습니다/.test(String(e.stderr ?? '')) }
ok(over, '101번째 1원도 거부 — 받은 돈이 청구액을 넘지 않음')

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
