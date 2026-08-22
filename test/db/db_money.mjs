import { execFileSync } from 'node:child_process'

//  0037 돈 기록 잠금 — 격리 DB 에서 실제 서버로 확인합니다.
//
//   지키려는 것
//    · 확정한 청구는 지울 수 없다
//    · 금액·청구월·거래처·명세서는 굳는다
//    · 입금이 있는 청구는 취소할 수 없다 (받은 돈이 장부에서 사라짐)
//    · 취소한 청구는 되살리지 않는다
//    · 입금 표는 함수로만 — 직접 넣고 지울 수 없다
const DB = 'moneyq'
const run = (sql, role) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c',
    role ? `set local role authenticated; set local request.jwt.claims = '{"sub":"${role}","role":"authenticated"}'; ${sql}` : sql],
    { encoding: 'utf8' }).trim()

const psql = (sql) => run(sql)
const asRole = (uid, sql) => run(sql, uid)
const tryAs = (uid, sql) => {
  try {
    return { ok: true, out: asRole(uid, sql) }
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e.message) }
  }
}

const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

// ── 계정 ──────────────────────────────────────────────────────────────────
const mk = (email, role) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at)
        values ('${id}', '${email}', '${role}', '${role}', true, now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}
const ADMIN = mk('money-admin@beonemirae.test', 'admin')
const OFFICE = mk('money-office@beonemirae.test', 'office')
const FIELD = mk('money-field@beonemirae.test', 'field')

ok(Number(psql(`select public.app_schema_version()`)) >= 37, 'DB 버전이 37 이상 (0037 이 적용됨)',
  psql(`select public.app_schema_version()`))

// ── 자료 ──────────────────────────────────────────────────────────────────
psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
      values ('[검증]돈병원','병원','',true,false) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증]돈병원'`)
const TODAY = psql(`select to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')`)
const MONTH = TODAY.slice(0, 7)

const mkBill = (amount, month = MONTH) => {
  psql(`insert into public.payments (client_id, billing_month, amount, status, snapshot)
        values ('${CID}', '${month}', ${amount}, '미수금', '{"kind":"정기"}'::jsonb)`)
  return psql(`select id from public.payments where client_id='${CID}' and billing_month='${month}'
               order by created_at desc limit 1`)
}

// ── 1. 확정한 청구는 지울 수 없다 ─────────────────────────────────────────
const b1 = mkBill(1000000, `${MONTH}`)
const del = tryAs(OFFICE, `delete from public.payments where id='${b1}'`)
ok(!del.ok, '사무실 담당자가 청구를 지우지 못함', del.out.split('\n')[0].slice(0, 70))
ok(psql(`select count(*) from public.payments where id='${b1}'`) === '1', '막힌 뒤 청구가 그대로 남음')

const delAdmin = tryAs(ADMIN, `delete from public.payments where id='${b1}'`)
ok(!delAdmin.ok, '관리자도 지우지 못함 — 취소로 남깁니다', delAdmin.out.split('\n')[0].slice(0, 70))

//  서버(트리거)까지 내려가서도 막히는지 — 권한을 다 가진 자리에서도
const delSuper = (() => {
  try { psql(`delete from public.payments where id='${b1}'`); return { ok: true, out: '' } }
  catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
})()
ok(!delSuper.ok && /지우지 않습니다/.test(delSuper.out), 'SQL 로 직접 지우려 해도 트리거가 막음',
  delSuper.out.split('\n')[0].slice(0, 70))

// ── 2. 확정 순간에 굳는 값 ────────────────────────────────────────────────
const amt = tryAs(OFFICE, `update public.payments set amount = 9999999 where id='${b1}'`)
ok(!amt.ok && /바꿀 수 없습니다/.test(amt.out), '확정한 청구의 금액을 못 바꿈',
  amt.out.split('\n')[0].slice(0, 70))
ok(psql(`select amount from public.payments where id='${b1}'`) === '1000000', '금액이 그대로')

const mon = tryAs(OFFICE, `update public.payments set billing_month = '2020-01' where id='${b1}'`)
ok(!mon.ok, '청구월도 못 바꿈')
const snap = tryAs(OFFICE, `update public.payments set snapshot = '{"kind":"조작"}'::jsonb where id='${b1}'`)
ok(!snap.ok, '명세서(스냅샷)도 못 바꿈 — 병원이 받은 종이와 장부가 갈리지 않게')
const cli = tryAs(OFFICE, `update public.payments set client_id = gen_random_uuid() where id='${b1}'`)
ok(!cli.ok, '거래처도 못 바꿈')

//  실제 업무에서 손대는 값은 그대로 됩니다
const st = tryAs(OFFICE, `update public.payments set status = '확인필요' where id='${b1}'`)
ok(st.ok, '상태(확인필요)는 바꿀 수 있음 — 실제로 쓰는 값입니다',
  st.ok ? '' : st.out.split('\n')[0].slice(0, 60))
const memo = tryAs(OFFICE, `update public.payments set memo = '전화함' where id='${b1}'`)
ok(memo.ok, '메모도 바꿀 수 있음')
asRole(OFFICE, `update public.payments set status = '미수금' where id='${b1}'`)

// ── 3. 입금이 있는 청구는 취소할 수 없다 ──────────────────────────────────
//  여기가 이번 라운드의 핵심입니다. 취소한 청구는 매출에도 미수금에도
//  안 잡히는데 입금 기록만 남으면 받은 돈이 장부에서 사라집니다.
asRole(OFFICE, `select public.add_payment_receipt('${b1}'::uuid, '${TODAY}'::date, 400000, '계좌이체', '부분입금')`)
ok(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${b1}'`) === '400000',
  '부분입금 40만원이 기록됨')

const cancelPaid = tryAs(OFFICE, `select public.cancel_billing('${b1}'::uuid, '실수')`)
ok(!cancelPaid.ok && /입금 400,000원이 이미 기록/.test(cancelPaid.out),
  '입금이 있는 청구는 취소 함수가 거부 — 얼마가 들어왔는지 그대로 알려 줌',
  cancelPaid.out.split('\n')[0].slice(0, 90))
ok(psql(`select status from public.payments where id='${b1}'`) === '미수금', '거부된 뒤 상태가 그대로')

//  함수를 안 쓰고 표를 직접 고쳐도 막혀야 합니다 — 서버가 최종 방어선입니다
const cancelDirect = tryAs(OFFICE, `update public.payments set status='취소', canceled_at=now() where id='${b1}'`)
ok(!cancelDirect.ok && /입금 400,000원/.test(cancelDirect.out),
  '표를 직접 고쳐도 트리거가 막음', cancelDirect.out.split('\n')[0].slice(0, 90))
ok(psql(`select status from public.payments where id='${b1}'`) === '미수금', '여전히 미수금')

//  입금을 먼저 취소하면 청구도 취소할 수 있습니다 — 길이 막혀 있지 않습니다
const rid = psql(`select id from public.payment_receipts where payment_id='${b1}' limit 1`)
asRole(OFFICE, `select public.delete_payment_receipt('${rid}'::uuid)`)
const cancelNow = tryAs(OFFICE, `select public.cancel_billing('${b1}'::uuid, '중복 청구')`)
ok(cancelNow.ok, '입금을 먼저 지우면 청구를 취소할 수 있음',
  cancelNow.ok ? '' : cancelNow.out.split('\n')[0].slice(0, 70))
ok(psql(`select status from public.payments where id='${b1}'`) === '취소', '취소로 남음')
ok(psql(`select canceled_at is not null from public.payments where id='${b1}'`) === 't', '취소 시각이 찍힘')

// ── 4. 취소한 청구는 되살리지 않는다 ──────────────────────────────────────
const revive = tryAs(OFFICE, `update public.payments set status='미수금' where id='${b1}'`)
ok(!revive.ok && /되살리지 않습니다/.test(revive.out), '취소한 청구를 되살리지 못함',
  revive.out.split('\n')[0].slice(0, 70))
const twice = tryAs(OFFICE, `select public.cancel_billing('${b1}'::uuid, '또')`)
ok(!twice.ok && /이미 취소한 청구/.test(twice.out), '두 번 취소하려 하면 알려 줌')

//  취소한 청구에는 입금도 못 넣습니다 (0031 이 이미 막고 있음 — 회귀 확인)
const payCanceled = tryAs(OFFICE, `select public.add_payment_receipt('${b1}'::uuid, '${TODAY}'::date, 10000, '계좌이체', '')`)
ok(!payCanceled.ok && /취소된 청구/.test(payCanceled.out), '취소된 청구에는 입금을 기록하지 못함')

// ── 5. 입금 표는 함수로만 ─────────────────────────────────────────────────
const b2 = mkBill(500000, `${MONTH}`)
const insDirect = tryAs(OFFICE,
  `insert into public.payment_receipts (payment_id, received_on, amount, method)
   values ('${b2}', '${TODAY}'::date, 500000, '계좌이체')`)
ok(!insDirect.ok, '입금을 표에 직접 넣지 못함 — 청구 상태가 같이 안 움직이기 때문',
  insDirect.out.split('\n')[0].slice(0, 70))

asRole(OFFICE, `select public.add_payment_receipt('${b2}'::uuid, '${TODAY}'::date, 200000, '계좌이체', '')`)
const rid2 = psql(`select id from public.payment_receipts where payment_id='${b2}' limit 1`)
const updDirect = tryAs(OFFICE, `update public.payment_receipts set amount = 999999 where id='${rid2}'`)
ok(!updDirect.ok, '입금액을 표에서 직접 고치지 못함')
const delDirect = tryAs(OFFICE, `delete from public.payment_receipts where id='${rid2}'`)
ok(!delDirect.ok, '입금을 표에서 직접 지우지 못함 — 함수로만')
ok(psql(`select count(*) from public.payment_receipts where id='${rid2}'`) === '1', '막힌 뒤 입금이 그대로')

//  함수로는 됩니다
const delFn = tryAs(OFFICE, `select public.delete_payment_receipt('${rid2}'::uuid)`)
ok(delFn.ok, '함수로는 지울 수 있음 — 청구 상태와 감사기록이 함께 움직입니다')

// ── 6. 권한 ───────────────────────────────────────────────────────────────
const b3 = mkBill(300000, `${MONTH}`)
const fieldCancel = tryAs(FIELD, `select public.cancel_billing('${b3}'::uuid, '')`)
ok(!fieldCancel.ok && /사무실 담당자와 관리자만/.test(fieldCancel.out), '현장 담당자는 청구를 취소하지 못함',
  fieldCancel.out.split('\n')[0].slice(0, 60))
ok(psql(`select status from public.payments where id='${b3}'`) === '미수금', '막힌 뒤 상태가 그대로')

// ── 7. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='payment.cancel'`)) === 1,
  '취소가 감사기록에 남음', psql(`select count(*) from public.audit_logs where action='payment.cancel'`))
const sum = psql(`select summary from public.audit_logs where action='payment.cancel' limit 1`)
ok(/돈병원/.test(sum) && /1,000,000원 취소/.test(sum) && /중복 청구/.test(sum),
  '누구의 얼마를 왜 취소했는지 적음', sum.slice(0, 80))

// ── 8. 취소한 청구는 다시 확정할 수 있다 (0032 회귀) ──────────────────────
//  취소를 막아 두면 잘못 만든 청구를 고칠 길이 없어집니다.
const again = tryAs(OFFICE, `insert into public.payments (client_id, billing_month, amount, status, snapshot)
                             values ('${CID}', '${MONTH}', 1000000, '미수금', '{"kind":"정기"}'::jsonb)`)
ok(again.ok, '취소한 뒤 같은 달로 다시 청구할 수 있음',
  again.ok ? '' : again.out.split('\n')[0].slice(0, 60))

console.log(`\n총 ${out.length}건 · 실패 ${out.filter((x) => !x).length}건`)
