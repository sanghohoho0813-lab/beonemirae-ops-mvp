import { execFileSync } from 'node:child_process'

//  0032 청구 확정을 실제 서버 함수로 검증합니다.
//   가장 중요한 것: **같은 수거를 두 번 청구할 수 없어야 합니다.**
//   두 사람이 동시에 월말 청구를 눌러도 병원에 두 배로 청구되면 안 됩니다.
//   동시에, 확정 뒤 새로 들어온 수거의 「추가 청구」는 막히면 안 됩니다.

const DB = 'billq'
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
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','{"role":"office"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','{"role":"field"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at) values
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','사무실','office',true,now()),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','현장','field',true,now())
  on conflict (id) do update set name=excluded.name, role=excluded.role, active=true;
`)
const OFFICE = '00000000-0000-0000-0000-0000000000bf'
const FIELD = '00000000-0000-0000-0000-0000000000fd'
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)

// ── 0. DB 버전 ────────────────────────────────────────────────────────────
ok(asRole(OFFICE, `select public.app_schema_version()`) >= '36', 'DB 버전 36 이상을 돌려줌')

const cid = psql(`insert into public.clients (name, type, address) values ('[검증] 청구', '병원', '') returning id`)
const mkSched = (date, kg) => psql(
  `insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at, origin)
   values ('${date}','${cid}','의료폐기물','완료',${kg},${kg}, now(), 'field') returning id`)
const s1 = mkSched('2026-07-05', 300)
const s2 = mkSched('2026-07-12', 400)
const s3 = mkSched('2026-07-25', 200)

const snap = (schedIds, matIds = [], kind = '정기') => JSON.stringify({
  confirmedAt: '2026-07-31T00:00:00Z', scheduleIds: schedIds, materialIds: matIds, kind,
  revenue: 1, cost: 0, profit: 1, invoice: { clientId: cid, total: 1 },
})
const confirm = (uid, amount, schedIds, matIds = [], kind = '정기', month = '2026-07') =>
  JSON.parse(asRole(uid,
    `select public.confirm_billing('${cid}'::uuid, '${month}', ${amount}, '${snap(schedIds, matIds, kind)}'::jsonb)`))

// ── 1. 정상 확정 ──────────────────────────────────────────────────────────
const r1 = confirm(OFFICE, 665000, [s1, s2])
ok(r1.amount === 665000 && r1.month === '2026-07', '7월 청구 확정', JSON.stringify(r1))
ok(psql(`select status from public.payments where id='${r1.id}'`) === '미수금', '미수금 상태로 생성')
ok(psql(`select memo from public.payments where id='${r1.id}'`) === '정기 청구', '정기 청구로 기록')
ok(psql(`select (snapshot->>'kind') from public.payments where id='${r1.id}'`) === '정기', '스냅샷이 그대로 저장')

// ── 2. 같은 수거를 다시 확정하려 하면 거부 (동시 확정) ────────────────────
const bad = (fn, name, re) => {
  let threw = false
  try { fn() } catch (e) { threw = re ? re.test(String(e.stderr ?? e.message ?? e)) : true }
  ok(threw, name)
}
bad(() => confirm(OFFICE, 665000, [s1, s2]), '똑같은 청구를 또 하면 거부', /이미 청구한 수거/)
bad(() => confirm(OFFICE, 285000, [s2]), '일부만 겹쳐도 거부 (한 건이라도)', /이미 청구한 수거/)
ok(Number(psql(`select count(*) from public.payments where client_id='${cid}'`)) === 1,
  '거부된 확정은 청구를 만들지 않음', psql(`select count(*) from public.payments where client_id='${cid}'`))

// ── 3. 확정 뒤 새로 들어온 수거는 「추가 청구」로 통과 ─────────────────────
const r2 = confirm(OFFICE, 190000, [s3], [], '추가')
ok(r2.kind === '추가', '겹치지 않는 수거는 추가 청구로 통과', JSON.stringify(r2))
ok(Number(psql(`select count(*) from public.payments where client_id='${cid}'`)) === 2, '청구가 2건')

// ── 4. 자재 공급도 같은 규칙 ──────────────────────────────────────────────
const m1 = psql(`insert into public.materials (date, client_id, box_count, origin)
  values ('2026-07-05','${cid}',3,'field') returning id`)
const s4 = mkSched('2026-07-28', 100)
confirm(OFFICE, 95000, [s4], [m1], '추가')
const s5 = mkSched('2026-07-29', 100)
bad(() => confirm(OFFICE, 95000, [s5], [m1], '추가'), '이미 청구한 자재가 들어 있으면 거부', /이미 청구한 자재/)

// ── 5. 취소한 청구는 없는 것으로 — 다시 청구할 수 있어야 합니다 ───────────
psql(`update public.payments set status='취소', canceled_at=now() where id='${r1.id}'`)
const r3 = confirm(OFFICE, 665000, [s1, s2])
ok(r3.amount === 665000, '취소한 청구의 수거는 다시 청구할 수 있음', JSON.stringify(r3))

// ── 6. 다른 달은 서로 막지 않습니다 ───────────────────────────────────────
const s6 = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at, origin)
  values ('2026-08-03','${cid}','의료폐기물','완료',100,100, now(), 'field') returning id`)
const r4 = confirm(OFFICE, 95000, [s6], [], '정기', '2026-08')
ok(r4.month === '2026-08', '8월 청구는 7월과 무관하게 확정')

// ── 7. 잘못된 입력 ────────────────────────────────────────────────────────
bad(() => confirm(OFFICE, 0, [s6]), '0원 청구 거부', /0원보다 커야/)
bad(() => confirm(OFFICE, 1000, []), '담을 기록이 없으면 거부', /담을 수거·자재 기록이 없습니다/)
bad(() => asRole(OFFICE, `select public.confirm_billing('${cid}'::uuid, '2026-13', 100, '${snap([s6])}'::jsonb)`),
  '없는 달 표기 거부', /청구월이 올바르지/)
bad(() => asRole(OFFICE,
  `select public.confirm_billing('00000000-0000-0000-0000-0000000000ff'::uuid, '2026-09', 100, '${snap([s6])}'::jsonb)`),
  '없는 거래처 거부', /거래처를 찾을 수 없습니다/)

// ── 8. 권한 ───────────────────────────────────────────────────────────────
bad(() => confirm(FIELD, 1000, [s6], [], '정기', '2026-09'),
  '현장 담당자는 청구를 확정할 수 없음', /사무실 담당자와 관리자만/)

// ── 9. 감사기록이 같은 트랜잭션에 ─────────────────────────────────────────
//  성공한 확정: 7월 정기 · 7월 추가(s3) · 7월 추가(s4+m1) · 7월 재확정 · 8월 = 5건
ok(Number(psql(`select count(*) from public.audit_logs where action='payment.confirm'`)) === 5,
  '확정 성공 5건만 감사기록에 남음 (거부된 것은 없음)',
  psql(`select count(*) from public.audit_logs where action='payment.confirm'`))
const sum = psql(`select summary from public.audit_logs where action='payment.confirm' order by at limit 1`)
ok(/665,000원/.test(sum) && /수거 2건/.test(sum), '무엇을 얼마에 확정했는지 그대로', sum.slice(0, 70))
const actor = psql(`select actor_name || '/' || actor_role from public.audit_logs
  where action='payment.confirm' order by at limit 1`)
ok(actor === '사무실/office', '누가 확정했는지 서버가 적음', actor)

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
