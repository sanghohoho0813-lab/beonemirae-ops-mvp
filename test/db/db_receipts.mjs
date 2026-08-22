import { execFileSync } from 'node:child_process'

//  부분입금 (0026) 을 실제 서버 함수로 검증합니다.
//   시나리오 4: 100만원 청구 → 30만원 → 남은 70만원 → 70만원 → 완납

const DB = 'recq'
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

//  관리자 + 사무실 + 현장 계정
psql(`
  insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','{"role":"admin"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','{"role":"office"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','{"role":"field"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','대표','admin',true,now()),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','사무실','office',true,now()),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','현장','field',true,now())
  on conflict (id) do update set role=excluded.role, active=true;
`)
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)
const ADMIN = '00000000-0000-0000-0000-0000000000ad'
const OFFICE = '00000000-0000-0000-0000-0000000000bf'
const FIELD = '00000000-0000-0000-0000-0000000000fd'

const cid = psql(`insert into public.clients (name, type, address) values ('[검증] 부분입금', '병원', '') returning id`)
const pid = psql(`insert into public.payments (client_id, billing_month, amount, status, method)
  values ('${cid}', '2026-07', 1000000, '미수금', '무통장') returning id`)

const paid = () => Number(psql(`select coalesce(sum(amount),0) from public.payment_receipts where payment_id='${pid}'`))
const status = () => psql(`select status from public.payments where id='${pid}'`)
const paidAt = () => psql(`select coalesce(paid_at::text,'') from public.payments where id='${pid}'`)

// ── 시나리오 4 ────────────────────────────────────────────────────────────
ok(status() === '미수금' && paid() === 0, '시작: 100만원 청구 · 미수금')

const r1 = JSON.parse(asRole(OFFICE,
  `select public.add_payment_receipt('${pid}'::uuid, '2026-08-05'::date, 300000, '계좌이체', '1차')`))
ok(r1.paidTotal === 300000 && r1.outstanding === 700000 && r1.status === '미수금',
  '30만원 입금 → 남은 70만원 · 아직 미수금', JSON.stringify(r1))
ok(status() === '미수금', '청구 상태가 미수금으로 유지')
ok(paidAt() === '', '완납 전에는 입금완료일이 비어 있음')

const r2 = JSON.parse(asRole(OFFICE,
  `select public.add_payment_receipt('${pid}'::uuid, '2026-08-12'::date, 700000, '카드', '2차')`))
ok(r2.paidTotal === 1000000 && r2.outstanding === 0 && r2.status === '입금완료',
  '70만원 추가 입금 → 완납', JSON.stringify(r2))
ok(status() === '입금완료', '청구 상태가 입금완료로 바뀜')
ok(paidAt().startsWith('2026-08-12'), '완납일이 마지막 입금일', paidAt())
ok(Number(psql(`select count(*) from public.payment_receipts where payment_id='${pid}'`)) === 2, '입금 기록 2건')

// ── 초과 입금 차단 ────────────────────────────────────────────────────────
let over = false
//  오늘 날짜로 넣습니다 — 내일 날짜를 쓰면 금액 검사 전에 날짜 검사에 먼저 걸립니다.
try { asRole(OFFICE, `select public.add_payment_receipt('${pid}'::uuid, (now() at time zone 'Asia/Seoul')::date, 1, '현금', '')`) }
catch (e) { over = /청구액을 넘습니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(over, '완납 뒤 1원이라도 더 넣으면 거부')
ok(paid() === 1000000, '거부돼도 금액은 그대로', String(paid()))

// ── 되돌리기 ──────────────────────────────────────────────────────────────
const rid = psql(`select id from public.payment_receipts where payment_id='${pid}' and amount=700000`)
const rd = JSON.parse(asRole(OFFICE, `select public.delete_payment_receipt('${rid}'::uuid)`))
ok(rd.paidTotal === 300000 && rd.outstanding === 700000 && rd.status === '미수금',
  '입금 기록을 지우면 미수금이 다시 늘어남', JSON.stringify(rd))
ok(paidAt() === '', '완납 취소되면 입금완료일도 지워짐')
ok(Number(psql(`select count(*) from public.audit_logs where action='payment.receipt.delete'`)) === 1,
  '삭제도 감사기록에 남음')
ok(Number(psql(`select count(*) from public.audit_logs where action='payment.receipt'`)) === 2,
  '입금도 감사기록에 남음')
//  감사기록에 무엇이 얼마인지 적혀 있는가 (돈 기록)
const sum = psql(`select summary from public.audit_logs where action='payment.receipt' order by at limit 1`)
ok(/300,000원/.test(sum) && /2026-07/.test(sum), '감사기록에 월·금액이 그대로', sum.slice(0, 60))

// ── 잘못된 입력 ───────────────────────────────────────────────────────────
const bad = (sql, name, re) => {
  let threw = false
  try { asRole(OFFICE, sql) } catch (e) { threw = re ? re.test(String(e.stderr ?? e.message ?? e)) : true }
  ok(threw, name)
}
bad(`select public.add_payment_receipt('${pid}'::uuid, '2026-08-05'::date, 0, '현금', '')`, '0원 입금 거부')
bad(`select public.add_payment_receipt('${pid}'::uuid, '2026-08-05'::date, -100, '현금', '')`, '음수 입금 거부')
//  0027 부터 「오늘」은 한국 시각 기준입니다 — UTC current_date+1 은 한국에서
//  이미 오늘일 수 있어 거부되지 않습니다. 한국 기준 내일로 확인합니다.
bad(`select public.add_payment_receipt('${pid}'::uuid, ((now() at time zone 'Asia/Seoul')::date + 1), 100, '현금', '')`,
  '미래 날짜(한국 기준 내일) 입금 거부', /오지 않은 날짜/)
bad(`select public.add_payment_receipt('${pid}'::uuid, '2026-08-05'::date, 100, '비트코인', '')`, '모르는 결제수단 거부')

// ── 권한 ──────────────────────────────────────────────────────────────────
let fieldBlocked = false
try { asRole(FIELD, `select public.add_payment_receipt('${pid}'::uuid, '2026-08-05'::date, 100, '현금', '')`) }
catch { fieldBlocked = true }
ok(fieldBlocked, '현장 담당자는 입금을 기록할 수 없음')
const fieldRead = asRole(FIELD, `select count(*) from public.payment_receipts`)
ok(fieldRead === '0', '현장 담당자에게는 입금 기록이 아예 안 보임 (RLS)', fieldRead)
const adminRead = asRole(ADMIN, `select count(*) from public.payment_receipts`)
ok(adminRead === '1', '관리자에게는 보임', adminRead)

// ── 취소된 청구 ───────────────────────────────────────────────────────────
const pid2 = psql(`insert into public.payments (client_id, billing_month, amount, status, method)
  values ('${cid}', '2026-06', 500000, '취소', '무통장') returning id`)
let cancelBlocked = false
try { asRole(OFFICE, `select public.add_payment_receipt('${pid2}'::uuid, '2026-08-05'::date, 100, '현금', '')`) }
catch (e) { cancelBlocked = /취소된 청구/.test(String(e.stderr ?? e.message ?? e)) }
ok(cancelBlocked, '취소된 청구에는 입금을 기록할 수 없음')

// ── 0026 이전 청구(입금 기록 없이 입금완료)와의 호환 ──────────────────────
const pid3 = psql(`insert into public.payments (client_id, billing_month, amount, status, method, paid_at)
  values ('${cid}', '2026-05', 400000, '입금완료', '무통장', now()) returning id`)
let legacyOver = false
try { asRole(OFFICE, `select public.add_payment_receipt('${pid3}'::uuid, '2026-08-05'::date, 1, '현금', '')`) }
catch (e) { legacyOver = /청구액을 넘습니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(legacyOver, '기록 없는 옛 입금완료 청구도 전액 받은 것으로 보고 초과 차단')

// ── 고아 입금이 생길 수 없다 (0037) ───────────────────────────────────────
//  예전에는 청구를 지우면 입금이 함께 정리되는지를 봤습니다. 0037 부터는
//  **청구를 아예 지울 수 없습니다** — 지우면 「그런 청구는 없었다」가 되어
//  병원과 금액을 다툴 때 근거가 사라지기 때문입니다. 그래서 고아 입금은
//  애초에 생기지 않습니다.
let delBlocked = false
try { psql(`delete from public.payments where id='${pid}'`) }
catch (e) { delBlocked = /지우지 않습니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(delBlocked, '청구를 지울 수 없음 — 취소로만 남깁니다 (고아 입금이 생길 자리가 없음)')
ok(Number(psql(`select count(*) from public.payment_receipts where payment_id='${pid}'`)) > 0,
  '막힌 뒤 입금 기록이 그대로 남음')

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
