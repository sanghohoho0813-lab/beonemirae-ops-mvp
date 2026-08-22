import { execFileSync, spawn as spawnProc } from 'node:child_process'

//  「다시 눌렀을 때」 — 통신이 끊긴 뒤 사람이 하는 유일한 행동.
//
//   실제로 이런 일이 납니다.
//    사무실에서 입금 30만원을 넣고 저장을 누릅니다. 서버에는 들어갔는데
//    응답이 오는 길에 끊깁니다. 화면에는 「저장 실패」가 뜹니다.
//    담당자는 당연히 다시 누릅니다.
//
//   서버가 그걸 구분하지 못하면 **입금이 두 번 기록됩니다.** 미수금이
//   30만원 적게 보이고, 아무도 모릅니다 — 오류가 안 나기 때문입니다.
//
//   여기서 재현합니다. 「같은 저장을 두 번」이 무엇을 만드는지 봅니다.
const DB = 'retryq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: asRole(uid, sql) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const won = (n) => Number(n).toLocaleString('ko-KR')

// ── 계정 · 자료 ───────────────────────────────────────────────────────────
const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}','${email}','${role}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now()`)
  return id
}
const OFFICE = mk('retry-office@beonemirae.test', 'office')

psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[재시도]가나병원','병원','',true,false) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[재시도]가나병원' limit 1`)
const TODAY = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)
const MONTH = TODAY.slice(0, 7)

const mkBill = (amount, month) => {
  psql(`insert into public.payments (client_id, billing_month, amount, status, snapshot)
        values ('${CID}', '${month}', ${amount}, '미수금', '{"kind":"정기"}'::jsonb)`)
  return psql(`select id from public.payments where client_id='${CID}' and billing_month='${month}'
               order by created_at desc limit 1`)
}
const paidOf = (pid) => psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${pid}'`)

// ── 1. 부분입금을 두 번 저장하면? ─────────────────────────────────────────
//   통신이 끊긴 줄 알고 다시 누른 상황입니다.
{
  const bill = mkBill(1000000, `${MONTH}`)
  const RID = psql(`select gen_random_uuid()`)
  const call = (rid) =>
    tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 300000, '계좌이체', '', null, ${rid})`)

  const first = call(`'${RID}'::uuid`)
  ok(first.ok, '입금 30만원이 기록됨')
  const second = call(`'${RID}'::uuid`)
  ok(second.ok, '다시 눌러도 오류가 아니라 성공으로 돌아옴 (담당자는 잘못한 게 없습니다)')
  ok(/"alreadySaved" *: *true/.test(second.out), '「이미 저장됨」이라고 알려 줌', second.out.slice(0, 70))

  const paid = Number(paidOf(bill))
  const rows = Number(psql(`select count(*) from public.payment_receipts where payment_id='${bill}'`))
  ok(rows === 1 && paid === 300000,
    '같은 저장을 다시 눌러도 장부에는 한 줄',
    `${rows}줄 · 받은 돈 ${won(paid)}원`)
  const outstanding = Number(psql(`select amount from public.payments where id='${bill}'`)) - paid
  ok(outstanding === 700000, '미수금이 70만원 그대로', `${won(outstanding)}원`)

  //  창을 새로 열면 새 표입니다 — 진짜 두 번째 입금은 그대로 들어가야 합니다
  const third = call(`gen_random_uuid()`)
  ok(third.ok, '새로 연 저장(다른 표)은 정상적으로 들어감')
  ok(paidOf(bill) === '600000', '받은 돈 60만원 — 진짜 두 번 받은 것은 두 줄', `${won(paidOf(bill))}원`)

  //  표를 안 보내던 옛 화면도 계속 동작해야 합니다 (배포 시차)
  const legacy = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 100000, '계좌이체', '')`)
  ok(legacy.ok, '표를 안 보내는 옛 화면도 그대로 저장됨 (배포 시차에 안 깨짐)')
  ok(paidOf(bill) === '700000', '받은 돈 70만원')
}

// ── 1-b. 같은 순간에 두 번 도착하면? (진짜 동시성) ────────────────────────
//   버튼을 두 번 빠르게 누르면 두 요청이 **같은 순간에** 서버에 닿습니다.
//   「먼저 확인하고 넣기」는 이런 순간에 뚫립니다 — 접속을 실제로 두 개
//   띄워서 확인합니다.
{
  const bill = mkBill(1000000, `${MONTH}`)
  const RID = psql(`select gen_random_uuid()`)
  const sql = `set local role authenticated; set local request.jwt.claims = '{"sub":"${OFFICE}","role":"authenticated"}'; ` +
    `select pg_sleep(0.2); select public.add_payment_receipt('${bill}', '${TODAY}'::date, 250000, '계좌이체', '', null, '${RID}'::uuid)`
  const spawn = () =>
    new Promise((resolve) => {
      const cp = spawnProc('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
        '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql])
      let so = ''
      let se = ''
      cp.stdout.on('data', (d) => { so += d })
      cp.stderr.on('data', (d) => { se += d })
      cp.on('close', (code) => resolve({ code, so, se }))
    })
  const results = await Promise.all([spawn(), spawn(), spawn()])
  const okCount = results.filter((r) => r.code === 0).length
  const rows = Number(psql(`select count(*) from public.payment_receipts where payment_id='${bill}'`))
  ok(rows === 1, '접속 3개가 같은 순간에 같은 표로 저장해도 한 줄만 생김', `${rows}줄 · 성공 ${okCount}개`)
  ok(paidOf(bill) === '250000', '받은 돈 25만원 (75만원이 아님)', `${won(paidOf(bill))}원`)
}

// ── 2. 완납액을 두 번 저장하면? (초과 검사가 막아 주는 경우) ──────────────
{
  const bill = mkBill(500000, `${MONTH}`)
  tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 500000, '계좌이체', '')`)
  const again = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 500000, '계좌이체', '')`)
  ok(!again.ok, '청구액을 넘는 두 번째 저장은 막힘 (초과 검사)',
    (again.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 50))
  ok(paidOf(bill) === '500000', '받은 돈이 50만원 그대로')
}

// ── 3. 진짜로 같은 날 같은 금액을 두 번 받는 일도 있습니다 ────────────────
//   병원이 오전·오후에 나눠 보내는 경우입니다. 이건 **막으면 안 됩니다.**
{
  const bill = mkBill(1000000, `${MONTH}`)
  const a = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 200000, '계좌이체', '오전분')`)
  const b = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 200000, '계좌이체', '오후분')`)
  ok(a.ok && b.ok, '같은 날 같은 금액을 나눠 받은 것은 두 번 다 기록됨 (막으면 안 되는 경우)')
  ok(paidOf(bill) === '400000', '받은 돈 40만원', `${won(paidOf(bill))}원`)
}

// ── 4. 청구 확정을 두 번 누르면? ──────────────────────────────────────────
//   수거가 걸린 청구는 0032/0040 이 「이미 청구한 수거」로 막습니다.
//   통신이 끊겨 다시 누른 경우에도 그 방어가 도는지 확인합니다.
{
  const M2 = `${MONTH}`
  psql(`delete from public.payment_receipts where payment_id in
        (select id from public.payments where client_id='${CID}' and billing_month='${M2}')`)
  psql(`insert into public.schedules (client_id, date, waste_type, status, expected_amount, actual_amount, completed_at)
        values ('${CID}', '${TODAY}'::date, '의료폐기물', '완료', 100, 120, now())`)
  const SID = psql(`select id from public.schedules where client_id='${CID}' order by created_at desc limit 1`)
  const snap = `jsonb_build_object('kind','정기','scheduleIds', jsonb_build_array('${SID}'), 'materialIds', '[]'::jsonb)`
  const before = Number(psql(`select count(*) from public.payments where client_id='${CID}' and billing_month='${M2}'`))
  const c1 = tryAs(OFFICE, `select public.confirm_billing('${CID}', '${M2}', 800000, ${snap})`)
  const c2 = tryAs(OFFICE, `select public.confirm_billing('${CID}', '${M2}', 800000, ${snap})`)
  const after = Number(psql(`select count(*) from public.payments where client_id='${CID}' and billing_month='${M2}'`))
  ok(c1.ok, '청구가 확정됨', c1.ok ? '' : c1.out.slice(0, 60))
  ok(!c2.ok && /이미 청구한 수거/.test(c2.out), '다시 눌러도 두 번째는 막힘',
    (c2.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 45))
  ok(after === before + 1, '청구가 하나만 생김', `${after - before}건`)
  //  이 수거로 만들어진 청구만 셉니다 (앞 단계들이 같은 달에 만든 것과 섞이지 않게)
  const bySched = Number(psql(`select coalesce(sum(amount),0) from public.payments
                               where client_id='${CID}' and billing_month='${M2}' and status <> '취소'
                                 and snapshot->'scheduleIds' @> jsonb_build_array('${SID}')`))
  ok(bySched === 800000, '그 수거로 나간 청구가 80만원 한 번뿐 (두 배가 아님)', `${won(bySched)}원`)
}

//  수거가 0건인 달의 월정액 — 계약상 청구해야 하는 거래처
//   0035 가 「수거 0건이어도 청구 대상」이라고 화면에 올려 줍니다.
//   그런데 확정하는 함수가 받아 주는지는 별개입니다.
{
  const M3 = '2025-11'
  psql(`update public.clients set flat_fee_when_empty = true, monthly_flat_fee = 9000000,
        contract_start = '2024-01-01' where id='${CID}'`)
  const snap0 = `'{"kind":"월정액","scheduleIds":[],"materialIds":[]}'::jsonb`
  const flat = tryAs(OFFICE, `select public.confirm_billing('${CID}', '${M3}', 9000000, ${snap0})`)
  ok(flat.ok, '수거 0건인 달의 월정액도 확정할 수 있음 (계약상 청구하는 거래처)',
    flat.ok ? '900만원' : (flat.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 55))

  //  달에 한 번 — 다시 눌러도 두 번 나가지 않습니다
  const again = tryAs(OFFICE, `select public.confirm_billing('${CID}', '${M3}', 9000000, ${snap0})`)
  ok(!again.ok && /이미 청구가 있습니다/.test(again.out), '월정액을 다시 확정하면 막힘 (달에 한 번)',
    (again.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 50))
  const cnt = Number(psql(`select count(*) from public.payments
                           where client_id='${CID}' and billing_month='${M3}' and status <> '취소'`))
  ok(cnt === 1, '그 달 청구가 한 건', `${cnt}건`)

  //  계약이 그 달을 다 덮지 않으면 사람에게 돌립니다 (일할이냐 전액이냐는 계약마다 다릅니다)
  psql(`update public.clients set contract_start = '2025-11-15' where id='${CID}'`)
  const mid = tryAs(OFFICE, `select public.confirm_billing('${CID}', '2025-10', 9000000, ${snap0})`)
  ok(!mid.ok, '계약 시작 전 달에는 월정액이 저절로 나가지 않음',
    (mid.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 45))
  psql(`update public.clients set contract_start = '2024-01-01' where id='${CID}'`)

  //  「수거 0건에도 청구」를 켜지 않은 거래처는 여전히 거부합니다
  psql(`update public.clients set flat_fee_when_empty = false where id='${CID}'`)
  const off = tryAs(OFFICE, `select public.confirm_billing('${CID}', '2025-09', 9000000, ${snap0})`)
  ok(!off.ok && /수거·자재 기록이 없습니다/.test(off.out),
    '계약서 확인 없이 켜지 않은 곳은 빈 청구가 안 됨 (근거 없는 청구 차단)')
  psql(`update public.clients set flat_fee_when_empty = true where id='${CID}'`)
}

// ── 5. 연말 경계 — 12월 다음은 1월 ────────────────────────────────────────
//   달을 더하는 계산이 「12월 + 1 = 13월」이 되면 그 달 청구가 통째로 사라집니다.
{
  const bill = mkBill(1234567, '2025-12')
  ok(psql(`select billing_month from public.payments where id='${bill}'`) === '2025-12', '12월 청구가 만들어짐')
  const nextMonth = psql(`select to_char((date '2025-12-01' + interval '1 month'), 'YYYY-MM')`)
  ok(nextMonth === '2026-01', 'DB 안에서 12월 다음 달은 2026-01', nextMonth)
  //  0027 의 「오지 않은 날짜」 검사가 연말에도 제대로 도는지
  const future = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', (date '${TODAY}' + 1), 1000, '계좌이체', '')`)
  ok(!future.ok && /아직 오지 않은 날짜/.test(future.out), '내일 날짜로는 입금을 못 넣음')
  const past = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '2025-12-31'::date, 1000, '계좌이체', '')`)
  ok(past.ok, '지난 12월 31일자 입금은 넣을 수 있음 (실제로 늦게 입력합니다)')
}

// ── 6. 0원·음수·거대한 금액 ───────────────────────────────────────────────
{
  const bill = mkBill(1000000, `${MONTH}`)
  for (const [amt, label] of [['0', '0원'], ['-50000', '음수']]) {
    const r = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, ${amt}, '계좌이체', '')`)
    ok(!r.ok, `${label} 입금은 막힘`, (r.out.match(/ERROR:.*/) ?? [''])[0].slice(0, 40))
  }
  const huge = tryAs(OFFICE, `select public.add_payment_receipt('${bill}', '${TODAY}'::date, 9999999999, '계좌이체', '')`)
  ok(!huge.ok, '청구액을 훨씬 넘는 금액은 막힘')
  ok(paidOf(bill) === '0', '막힌 뒤 받은 돈은 0원 그대로')
}

// ── 마무리 ────────────────────────────────────────────────────────────────
const pass = out.filter(Boolean).length
console.log(`\n${pass}/${out.length} 통과`)
