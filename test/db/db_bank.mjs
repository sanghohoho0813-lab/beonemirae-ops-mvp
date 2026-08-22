import { execFileSync } from 'node:child_process'

//  0031 통장 대사 중복 방지를 실제 서버 함수로 검증합니다.
//   같은 통장 줄(source_ref)이 두 번 들어오면 돈이 두 배가 되고 미수금이
//   사라집니다. 파일을 다시 올리거나 버튼을 두 번 누르는 일은 반드시
//   생기므로 서버가 막아야 합니다.

const DB = 'bankq'
const psql = (sql, db = DB) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', db, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim()

const out = []
const ok = (c, m, d = '') => {
  //  바로 찍습니다 — 모아 뒀다가 끝에 한 번에 내보내면 중간에 터졌을 때
  //  앞의 결과까지 전부 사라지고, 회귀 집계에 「검사 0 · 실패 0」으로
  //  남아 통과한 것처럼 보입니다.
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}

psql(`
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','{"role":"office"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at) values
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','사무실','office',true,now())
  on conflict (id) do update set name=excluded.name, role=excluded.role, active=true;
`)
const OFFICE = '00000000-0000-0000-0000-0000000000bf'
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)

const cid = psql(`insert into public.clients (name, type, address) values ('[검증] 대사', '병원', '') returning id`)
const pay = (month, amt) => psql(`insert into public.payments (client_id, billing_month, amount, status, method)
  values ('${cid}', '${month}', ${amt}, '미수금', '무통장') returning id`)
const p1 = pay('2026-06', 1000000)
const p2 = pay('2026-07', 1000000)

const add = (pid, date, amt, ref) =>
  JSON.parse(asRole(OFFICE, `select public.add_payment_receipt('${pid}'::uuid, '${date}'::date, ${amt}, '계좌이체', '통장 대사', ${ref === null ? 'null' : `'${ref}'`})`))
const paid = (pid) => Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${pid}'`))

const REF = '2026-08-05|1000000|(주)대사병원'

// ── 1. 통장 줄로 기록 ─────────────────────────────────────────────────────
const r1 = add(p1, '2026-08-05', 1000000, REF)
ok(r1.paidTotal === 1000000 && r1.status === '입금완료', '통장 줄로 입금 기록 · 완납', JSON.stringify(r1))
ok(psql(`select source_ref from public.payment_receipts where id='${r1.id}'`) === REF,
  '어느 통장 줄에서 왔는지 함께 저장')

// ── 2. 같은 줄을 두 번 (파일 재업로드) ────────────────────────────────────
let dup = false
try { add(p2, '2026-08-05', 1000000, REF) }
catch (e) { dup = /이미 기록한 통장 입금입니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(dup, '같은 통장 줄을 다시 넣으면 거부 — 다른 청구에 붙이려 해도')
ok(paid(p2) === 0, '거부된 쪽에는 한 푼도 들어가지 않음', String(paid(p2)))
ok(Number(psql(`select count(*) from public.payment_receipts`)) === 1, '입금 기록은 여전히 1건')

// ── 3. 지문이 다르면 들어감 (같은 날 같은 금액이라도) ─────────────────────
const REF2 = '2026-08-05|1000000|(주)다른병원'
const r2 = add(p2, '2026-08-05', 1000000, REF2)
ok(r2.paidTotal === 1000000, '적요가 다르면 같은 날·같은 금액도 별개로 기록', JSON.stringify(r2))

// ── 4. 손입력(출처 없음)은 중복 검사를 하지 않음 ──────────────────────────
const p3 = pay('2026-05', 500000)
add(p3, '2026-08-06', 200000, null)
const r3 = add(p3, '2026-08-06', 200000, null)
ok(r3.paidTotal === 400000, '손으로 넣는 입금은 같은 날·같은 금액도 두 번 넣을 수 있음', JSON.stringify(r3))
ok(Number(psql(`select count(*) from public.payment_receipts where source_ref is null`)) === 2,
  '출처 없는 기록이 2건')

//  빈 문자열은 「없음」과 같게 다뤄야 합니다 (화면이 '' 를 보낼 수 있음)
const r4 = JSON.parse(asRole(OFFICE,
  `select public.add_payment_receipt('${p3}'::uuid, '2026-08-06'::date, 50000, '현금', '', '')`))
ok(r4.paidTotal === 450000, '빈 출처 문자열도 손입력으로 취급', JSON.stringify(r4))
ok(Number(psql(`select count(*) from public.payment_receipts where source_ref is null`)) === 3,
  '빈 문자열이 null 로 저장됨')

// ── 5. 중복 검사보다 금액·날짜 검사가 먼저 막히지 않는지 ──────────────────
//   (초과 입금은 지문이 새것이어도 여전히 막혀야 합니다)
let over = false
try { add(p1, '2026-08-07', 1, '새-지문-1') }
catch (e) { over = /청구액을 넘습니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(over, '완납된 청구에는 새 통장 줄이어도 더 넣지 못함')
ok(Number(psql(`select count(*) from public.payment_receipts where source_ref='새-지문-1'`)) === 0,
  '막힌 줄은 지문도 남지 않음')

// ── 6. 표 차원의 유일 제약 (함수를 우회해도) ──────────────────────────────
let idx = false
try {
  psql(`insert into public.payment_receipts (payment_id, received_on, amount, source_ref)
        values ('${p2}', '2026-08-05', 1, '${REF}')`)
} catch { idx = true }
ok(idx, '함수를 거치지 않아도 같은 지문은 표가 막음 (유일 인덱스)')

// ── 7. 지우면 그 지문은 다시 쓸 수 있어야 함 ──────────────────────────────
//   (잘못 붙인 것을 떼고 올바른 청구에 다시 붙이는 일이 실제로 있습니다)
const rid = psql(`select id from public.payment_receipts where source_ref='${REF}'`)
asRole(OFFICE, `select public.delete_payment_receipt('${rid}'::uuid)`)
const r5 = add(p1, '2026-08-05', 1000000, REF)
ok(r5.paidTotal === 1000000, '떼어낸 통장 줄은 다른 청구에 다시 붙일 수 있음', JSON.stringify(r5))

// ── 8. 감사기록에 통장 대사임이 남는가 ────────────────────────────────────
const sum = psql(`select summary from public.audit_logs
  where action='payment.receipt' and summary like '%통장 대사%' order by at limit 1`)
ok(/통장 대사/.test(sum), '감사기록에 통장 대사로 들어온 건임이 남음', sum.slice(0, 70))
const manual = Number(psql(`select count(*) from public.audit_logs
  where action='payment.receipt' and summary not like '%통장 대사%'`))
ok(manual === 3, '손입력 3건은 통장 대사 표시가 없음', String(manual))

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
