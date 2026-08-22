import { execFileSync } from 'node:child_process'

//  0057 — 전달완료한 소모품이 그 달 청구에 실릴 때, 서버가 지키는 것.
//
//   화면이 계산한 금액을 서버가 그대로 받습니다(지금까지와 같습니다).
//   서버가 하는 일은 **같은 물건이 두 번 청구되지 않게** 막는 것입니다.
//
//   확인하는 것
//    · 전달완료한 주문을 담아 청구를 확정할 수 있다
//    · **같은 주문이 든 청구를 두 번 확정하지 못한다** (창 두 개 · 새로고침)
//    · 아직 전달 안 한 주문은 청구하지 못한다 (물건 없이 돈 달라는 것)
//    · 다른 거래처의 주문은 담지 못한다
//    · 소모품만 있는 달도 청구할 수 있다 (예전에는 아예 막혔습니다)
//    · 취소한 청구가 덮었던 주문은 다시 청구할 수 있다
//    · 옛 화면(orderIds 를 안 보냄)은 지금까지처럼 동작한다

const DB = 'prodq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const out = []
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  out.push(c)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 120)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,false) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}'`)
}

const CA = client('[검증]가나병원')
const CB = client('[검증]다라요양원')
const ADMIN = mk('pb-admin@beonemirae.test', 'admin')
const OFFICE = mk('pb-office@beonemirae.test', 'office')
const HOSP_A = mk('pb-hosp-a@beonemirae.test', 'client', CA)

const MONTH = '2026-07'

psql(`insert into public.office_stock (id, corrugated_box, plastic_container, bag, needle_box)
      values (1, 500, 200, 900, 120)
      on conflict (id) do update set corrugated_box=500, plastic_container=200, bag=900, needle_box=120`)

const PID = JSON.parse(
  run(`select public.upsert_product(null,'[검증]20L 용기','20L','개',9000,5200,'plastic_container')`, ADMIN),
).id

/** 주문을 올리고 전달완료까지 (실제 화면과 같은 길) */
const deliver = (clientId, qty, who = OFFICE) => {
  const r = tryAs(who, `select public.request_product_order('${clientId}',
      '[{"productId":"${PID}","qty":${qty}}]'::jsonb, '검증')`)
  if (!r.ok) throw new Error(r.out)
  const id = JSON.parse(r.out).id
  const d = tryAs(OFFICE, `select public.set_product_order_status('${id}','전달완료')`)
  if (!d.ok) throw new Error(d.out)
  return id
}
/** 주문만 올리고 그대로 둠 (아직 전달 안 함) */
const request = (clientId, qty) => {
  const r = tryAs(OFFICE, `select public.request_product_order('${clientId}',
      '[{"productId":"${PID}","qty":${qty}}]'::jsonb, '검증')`)
  if (!r.ok) throw new Error(r.out)
  return JSON.parse(r.out).id
}
const snap = (orderIds, extra = {}) =>
  JSON.stringify({
    confirmedAt: `${MONTH}-31T00:00:00Z`,
    scheduleIds: [], materialIds: [], orderIds,
    invoice: {}, revenue: 0, cost: 0, profit: 0, kind: '정기',
    ...extra,
  }).replace(/'/g, "''")

const bills = (clientId) =>
  Number(psql(`select count(*) from public.payments
                where client_id='${clientId}' and billing_month='${MONTH}' and status <> '취소'`))
const billed = (clientId) =>
  Number(psql(`select coalesce(sum(amount),0) from public.payments
                where client_id='${clientId}' and billing_month='${MONTH}' and status <> '취소'`))

// ── 0. 판 번호와 자가진단 ───────────────────────────────────────────────────
{
  ok(psql('select public.app_schema_version()') === '64', 'DB 판 64', psql('select public.app_schema_version()'))
  const h = JSON.parse(run('select public.app_health_check()', ADMIN))
  ok(h.ok === true, '자가진단 이상 없음', JSON.stringify(h.missing))
}

// ── 1. 전달완료한 소모품으로 청구가 만들어진다 ──────────────────────────────
const O1 = deliver(CA, 10)
{
  const r = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 90000, '${snap([O1])}'::jsonb)`)
  ok(r.ok, '**전달완료한 소모품만으로 청구를 확정함**', r.ok ? '' : err(r))
  ok(bills(CA) === 1 && billed(CA) === 90000, '청구 1건 · 90,000원', `${bills(CA)}건 · ${billed(CA)}원`)
  ok(JSON.parse(r.out).products === 1, '몇 건이 실렸는지 돌려줌', r.out.slice(0, 60))
  //  감사기록에 소모품 건수가 남아야 「이 금액이 왜 이렇게 됐나」에 답합니다.
  ok(/소모품 1건/.test(psql(`select summary from public.audit_logs
        where action='payment.confirm' order by at desc limit 1`)),
    '감사기록에 소모품 건수가 남음')
}

// ── 2. 같은 주문을 두 번 청구하지 못한다 ────────────────────────────────────
//   창을 두 개 열어 두거나 새로고침이 늦으면 실제로 벌어집니다.
{
  const r = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 90000, '${snap([O1])}'::jsonb)`)
  ok(!r.ok && /이미 청구한 소모품 주문/.test(r.out), '**같은 주문이 든 청구를 두 번 못 함**', err(r))
  ok(bills(CA) === 1 && billed(CA) === 90000, '금액이 두 배가 되지 않음', `${billed(CA)}원`)
}

// ── 3. 아직 전달 안 한 주문은 청구 못 한다 ──────────────────────────────────
//   물건도 안 갔는데 돈을 달라는 청구서가 나가면 안 됩니다.
{
  const pending = request(CA, 3)
  const r = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 27000, '${snap([pending])}'::jsonb)`)
  ok(!r.ok && /전달완료되지 않은/.test(r.out), '**전달 전인 주문은 청구 거절**', err(r))
  ok(bills(CA) === 1, '청구가 안 늘어남', `${bills(CA)}건`)

  //  전달완료로 바꾸면 그때는 됩니다.
  psql(`update public.product_orders set status='전달완료', delivered_at=now() where id='${pending}'`)
  const r2 = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 27000, '${snap([pending], { kind: '추가' })}'::jsonb)`)
  ok(r2.ok, '전달완료로 바꾸면 추가 청구가 됨', r2.ok ? '' : err(r2))
  ok(billed(CA) === 117000, '90,000 + 27,000 = 117,000원', `${billed(CA)}원`)
}

// ── 4. 다른 거래처의 주문은 담지 못한다 ─────────────────────────────────────
{
  const other = deliver(CB, 2)
  const r = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 18000, '${snap([other])}'::jsonb)`)
  ok(!r.ok && /전달완료되지 않은/.test(r.out), '**남의 병원 주문을 이 병원 청구에 못 담음**', err(r))
  ok(billed(CA) === 117000, '금액 그대로', `${billed(CA)}원`)
  //  없는 주문 id 도 마찬가지입니다.
  const ghost = tryAs(OFFICE,
    `select public.confirm_billing('${CA}','${MONTH}', 1000, '${snap(['00000000-0000-0000-0000-000000000999'])}'::jsonb)`)
  ok(!ghost.ok, '없는 주문 id 도 거절', err(ghost))
}

// ── 5. 취소한 청구가 덮었던 주문은 다시 청구할 수 있다 ──────────────────────
//   잘못 확정한 청구를 취소하고 다시 낼 길이 막히면 안 됩니다.
{
  //  ⚠ **O1 이 든 그 청구**를 골라야 합니다. 아무거나 취소하면 O1 은 아직
  //    살아 있는 청구에 남아 있어, 아래 재청구가 막히는 것이 오히려 정답이
  //    됩니다 — 검사가 엉뚱한 것을 보게 됩니다.
  const pid = psql(`select id from public.payments
                     where client_id='${CA}' and billing_month='${MONTH}' and status <> '취소'
                       and snapshot->'orderIds' ? '${O1}'
                     limit 1`)
  const c = tryAs(OFFICE, `select public.cancel_billing('${pid}', '검증용 취소')`)
  ok(c.ok, '청구를 취소함', c.ok ? '' : err(c))
  const r = tryAs(OFFICE, `select public.confirm_billing('${CA}','${MONTH}', 90000, '${snap([O1])}'::jsonb)`)
  ok(r.ok, '**취소한 청구가 덮었던 주문은 다시 청구할 수 있음**', r.ok ? '' : err(r))
}

// ── 6. 권한 — 병원 계정은 청구를 못 만든다 ──────────────────────────────────
{
  const o = deliver(CA, 1)
  const r = tryAs(HOSP_A, `select public.confirm_billing('${CA}','${MONTH}', 9000, '${snap([o])}'::jsonb)`)
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '병원 계정은 청구를 못 만듦', err(r))
}

// ── 7. 옛 화면(orderIds 없음)은 지금까지처럼 ────────────────────────────────
//   판을 올렸다고 예전 길이 막히면 안 됩니다.
{
  const CC = client('[검증]마바의원')
  const SID = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount)
        values ('${MONTH}-10','${CC}','의료폐기물','완료',100,100) returning id`)
  const old = JSON.stringify({
    confirmedAt: `${MONTH}-31T00:00:00Z`,
    scheduleIds: [SID], materialIds: [],
    invoice: {}, revenue: 100000, cost: 0, profit: 0, kind: '정기',
  }).replace(/'/g, "''")
  const r = tryAs(OFFICE, `select public.confirm_billing('${CC}','${MONTH}', 100000, '${old}'::jsonb)`)
  ok(r.ok, '**orderIds 를 안 보내도 지금까지처럼 확정됨**', r.ok ? '' : err(r))
  //  그리고 같은 수거를 두 번 청구하는 것은 여전히 막혀야 합니다.
  const twice = tryAs(OFFICE, `select public.confirm_billing('${CC}','${MONTH}', 100000, '${old}'::jsonb)`)
  ok(!twice.ok && /이미 청구한 수거/.test(twice.out), '수거 중복 방어도 그대로', err(twice))
  //  근거가 하나도 없는 청구도 여전히 막힙니다.
  const empty = JSON.stringify({ scheduleIds: [], materialIds: [], orderIds: [], kind: '정기' }).replace(/'/g, "''")
  const none = tryAs(OFFICE, `select public.confirm_billing('${CC}','${MONTH}', 50000, '${empty}'::jsonb)`)
  ok(!none.ok && /담을 수거·자재 기록이 없습니다/.test(none.out), '근거 없는 청구는 그대로 거절', err(none))
}

// ── 8. 돈이 아닌 곳은 안 건드렸다 ───────────────────────────────────────────
{
  ok(psql(`select count(*) from public.product_orders where status='전달완료' and delivered_at is null`) === '0',
    '전달완료인데 전달 시각이 빈 주문은 없음')
  //  청구했다고 주문 상태가 바뀌지는 않습니다 — 청구와 전달은 다른 일입니다.
  ok(psql(`select status from public.product_orders where id='${O1}'`) === '전달완료',
    '청구해도 주문 상태는 그대로')
}

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
