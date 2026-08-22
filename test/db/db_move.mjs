import { execFileSync } from 'node:child_process'

//  0059 — 잡아 둔 방문을 옮기고 무를 때 서버가 지키는 것.
//
//   0058 은 잡는 길만 만들었습니다. 무르는 길이 없으면 잘못 잡은 방문에
//   그대로 기사가 나가고, 병원이 취소한 방문은 '예정'인 채 날짜만 지나가
//   **영원히 지워지지 않는 「수거 입력 밀림」**이 됩니다.
//
//   확인하는 것
//    · 사무실·관리자만 (기사·병원 계정은 못 함)
//    · **완료된 수거는 못 옮기고 못 무름** (정산·청구로 이어지는 기록)
//    · 지난 날짜로 못 옮김 · 반년 너머로 못 옮김
//    · 옮길 날에 살아 있는 방문이 있으면 거부
//    · **이유 없이 못 무름** — 「왜 그 주에 안 갔나」에 답할 근거
//    · 무른 방문은 **지워지지 않고 남음**
//    · 무른 자리에 **다시 잡을 수 있음** (제약이 자리를 비켜 줌)
//    · 자동 편성 되돌리기가 무른 방문을 안 지움
//    · 감사기록에 전후가 남음

const DB = 'moveq'
const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (sql) => run(sql)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => {
  console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`)
  if (!c) process.exitCode = 1
}
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 130)

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
        values ('${name}','병원','',true,true) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}'`)
}
const vehicle = (name, type) => {
  psql(`insert into public.vehicles (name, waste_type, driver) values ('${name}','${type}','기사') on conflict do nothing`)
  return psql(`select id from public.vehicles where name='${name}'`)
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)

const CA = client('[검증C]가나병원')
const ADMIN = mk('mv-admin@beonemirae.test', 'admin')
const OFFICE = mk('mv-office@beonemirae.test', 'office')
const FIELD = mk('mv-field@beonemirae.test', 'field')
const HOSP = mk('mv-hosp@beonemirae.test', 'client', CA)
const VMED = vehicle('[검증C]의료차', '의료폐기물')
const VDIA = vehicle('[검증C]기저귀차', '일회용기저귀')

const book = (uid, d, type = '의료폐기물') =>
  tryAs(uid, `select public.book_visit('${CA}'::uuid, '${d}'::date, '${type}', '', null, '', null, null)`)
const idOn = (d, type = '의료폐기물') =>
  psql(`select id from public.schedules where client_id='${CA}' and date='${d}' and waste_type='${type}' and canceled_at is null limit 1`)
const move = (uid, id, d, time = null) =>
  tryAs(uid, `select public.move_visit('${id}'::uuid, '${d}'::date, ${time === null ? 'null' : `'${time}'`})`)
const cancel = (uid, id, reason) =>
  tryAs(uid, `select public.cancel_visit('${id}'::uuid, '${reason}')`)

// ── 1. 권한 ────────────────────────────────────────────────────────────────
{
  book(ADMIN, day(5))
  const id = idOn(day(5))
  ok(!!id, '옮길 방문을 만들어 둠')

  const r1 = move(FIELD, id, day(6))
  ok(!r1.ok && /사무실 담당자와 관리자만/.test(r1.out), '**기사는 못 옮김**', err(r1))
  const r2 = cancel(FIELD, id, '기사가 무름')
  ok(!r2.ok && /사무실 담당자와 관리자만/.test(r2.out), '**기사는 못 무름**', err(r2))
  const r3 = cancel(HOSP, id, '병원이 무름')
  ok(!r3.ok, '**병원 계정도 못 무름**', err(r3))

  const r4 = move(OFFICE, id, day(6))
  ok(r4.ok, '사무실 담당자는 옮길 수 있음', err(r4))
  const d = psql(`select date::text from public.schedules where id='${id}'`)
  ok(d === day(6), '날짜가 실제로 바뀜', d)
}

// ── 2. 완료된 수거는 못 건드림 ─────────────────────────────────────────────
//
//   ⚠ 여기가 제일 위험합니다. 완료 기록의 날짜를 옮기면 그 달 매출이 통째로
//   옮겨 가고, 무르면 이미 청구한 수거가 사라집니다.
{
  psql(`insert into public.schedules (date, client_id, waste_type, status, actual_amount, completed_at, origin)
        values ('${day(-3)}','${CA}','의료폐기물','완료',120,now(),'field')`)
  const id = psql(`select id from public.schedules where client_id='${CA}' and date='${day(-3)}'`)
  const r1 = move(ADMIN, id, day(9))
  ok(!r1.ok && /완료된 수거는 옮길 수 없습니다/.test(r1.out), '**완료된 수거는 못 옮김**', err(r1))
  const r2 = cancel(ADMIN, id, '실수로 무르기')
  ok(!r2.ok && /완료된 수거는 무를 수 없습니다/.test(r2.out), '**완료된 수거는 못 무름**', err(r2))
  const still = psql(`select actual_amount::text from public.schedules where id='${id}'`)
  ok(still === '120', '실적이 그대로 남음', `${still}kg`)
}

// ── 3. 날짜 ────────────────────────────────────────────────────────────────
{
  book(ADMIN, day(10))
  const id = idOn(day(10))
  const r1 = move(ADMIN, id, day(-1))
  ok(!r1.ok && /지난 날짜/.test(r1.out), '**어제로는 못 옮김**', err(r1))
  const r2 = move(ADMIN, id, day(181))
  ok(!r2.ok && /너무 먼 날짜/.test(r2.out), '반년 너머로는 못 옮김', err(r2))
  const r3 = move(ADMIN, id, TODAY)
  ok(r3.ok, '**오늘로는 옮길 수 있음** (아침에 온 전화)', err(r3))
}

// ── 4. 옮길 날에 이미 있으면 거부 ──────────────────────────────────────────
{
  book(ADMIN, day(20))
  book(ADMIN, day(21))
  const a = idOn(day(20))
  const r = move(ADMIN, a, day(21))
  ok(!r.ok && /그날 이미 있습니다/.test(r.out), '**같은 날 두 번 가지 않음**', err(r))
  const d = psql(`select date::text from public.schedules where id='${a}'`)
  ok(d === day(20), '거절되면 원래 날짜 그대로', d)

  //  구분이 다르면 같은 날에 있어도 됩니다 (의료 + 기저귀).
  book(ADMIN, day(22), '일회용기저귀')
  const dia = idOn(day(22), '일회용기저귀')
  const r2 = move(ADMIN, dia, day(21))
  ok(r2.ok, '구분이 다르면 같은 날 가능 (의료 + 기저귀)', err(r2))
}

// ── 5. 시각·차량 ───────────────────────────────────────────────────────────
{
  book(ADMIN, day(30))
  const id = idOn(day(30))
  const r1 = move(ADMIN, id, day(31), '25:00')
  ok(!r1.ok && /시각이 올바르지 않습니다/.test(r1.out), '25시는 없음', err(r1))
  const r2 = move(ADMIN, id, day(31), '14:30')
  ok(r2.ok, '옮기면서 시각도 바꿈', err(r2))
  const t = psql(`select scheduled_time from public.schedules where id='${id}'`)
  ok(t === '14:30', '시각이 저장됨', t)

  //  차량은 그대로 따라갑니다 — 옮겼다고 배차가 풀리면 안 됩니다.
  psql(`update public.schedules set vehicle_id='${VMED}' where id='${id}'`)
  const r3 = move(ADMIN, id, day(32))
  ok(r3.ok, '차를 붙인 채로 옮김', err(r3))
  const v = psql(`select vehicle_id from public.schedules where id='${id}'`)
  ok(v === VMED, '**차량 배정이 따라감** (옮겼다고 풀리지 않음)')

  //  구분이 다른 차가 붙어 있으면 거부합니다.
  psql(`update public.schedules set vehicle_id='${VDIA}' where id='${id}'`)
  const r4 = move(ADMIN, id, day(33))
  ok(!r4.ok && /차량입니다/.test(r4.out), '구분이 다른 차가 붙어 있으면 거부', err(r4))
}

// ── 6. 무르기 ──────────────────────────────────────────────────────────────
{
  book(ADMIN, day(40))
  const id = idOn(day(40))

  const r1 = cancel(ADMIN, id, '')
  ok(!r1.ok && /이유를 적어 주세요/.test(r1.out),
    '**이유 없이 못 무름** (「왜 그 주에 안 갔나」에 답할 근거)', err(r1))
  const r2 = cancel(ADMIN, id, '   ')
  ok(!r2.ok, '공백만 적어도 안 됨', err(r2))

  const r3 = cancel(ADMIN, id, '병원 요청으로 다음 주로 미룸')
  ok(r3.ok, '이유를 적으면 무를 수 있음', err(r3))

  //  ⚠ 지우지 않습니다.
  const row = psql(`select (canceled_at is not null)::text || '|' || cancel_reason || '|' || status
                    from public.schedules where id='${id}'`)
  ok(row === 'true|병원 요청으로 다음 주로 미룸|예정',
    '**지우지 않고 이유와 함께 남음**', row)

  //  두 번 눌러도 같은 결과 — 오류로 막지 않습니다.
  const r4 = cancel(ADMIN, id, '또 무르기')
  ok(r4.ok && /true/.test(r4.out), '두 번 눌러도 안전 (이미 무름)', r4.out.slice(0, 40))
  const reason = psql(`select cancel_reason from public.schedules where id='${id}'`)
  ok(reason === '병원 요청으로 다음 주로 미룸', '**첫 이유가 덮이지 않음**', reason)

  //  무른 방문은 옮길 수 없습니다.
  const r5 = move(ADMIN, id, day(41))
  ok(!r5.ok && /이미 무른 방문/.test(r5.out), '무른 방문은 못 옮김', err(r5))
}

// ── 7. 무른 자리에 다시 잡을 수 있는가 ─────────────────────────────────────
//
//   ⚠ 0040 의 제약을 그대로 두면 무른 방문이 자리를 계속 차지해, 병원이
//   「역시 그날로 다시」 해도 넣을 방법이 없어집니다.
{
  const d = day(50)
  book(ADMIN, d)
  const id = idOn(d)
  cancel(ADMIN, id, '잘못 잡음')

  const r = book(ADMIN, d)
  ok(r.ok, '**무른 자리에 같은 날로 다시 잡을 수 있음**', err(r))
  const n = psql(`select count(*) from public.schedules where client_id='${CA}' and date='${d}'`)
  ok(n === '2', '무른 것 1 + 새로 잡은 것 1 = 2줄', `${n}줄`)
  const live = psql(`select count(*) from public.schedules where client_id='${CA}' and date='${d}' and canceled_at is null`)
  ok(live === '1', '**살아 있는 것은 하나뿐**', `${live}줄`)
}

// ── 8. 되돌리기가 무른 방문을 안 지움 ──────────────────────────────────────
{
  const batch = psql(`select gen_random_uuid()`)
  psql(`insert into public.schedules (date, client_id, waste_type, status, origin, plan_batch)
        values ('${day(60)}','${CA}','의료폐기물','예정','system','${batch}'),
               ('${day(61)}','${CA}','의료폐기물','예정','system','${batch}')`)
  const keep = psql(`select id from public.schedules where plan_batch='${batch}' and date='${day(61)}'`)
  cancel(ADMIN, keep, '병원이 그 주 휴진')

  const u = tryAs(ADMIN, `select public.undo_schedule_batch('${batch}'::uuid)`)
  ok(u.ok, '되돌리기 실행', err(u))
  const gone = psql(`select count(*) from public.schedules where plan_batch='${batch}' and date='${day(60)}'`)
  ok(gone === '0', '살아 있던 예정은 지워짐', `${gone}건`)
  const kept = psql(`select count(*) from public.schedules where id='${keep}'`)
  ok(kept === '1', '**무른 방문은 지워지지 않음** (취소 기록이 사라지면 안 됩니다)', `${kept}건`)

  //  0028 의 방어(이미 진행된 건은 그대로)가 살아 있는지도 함께 봅니다.
  const b2 = psql(`select gen_random_uuid()`)
  psql(`insert into public.schedules (date, client_id, waste_type, status, actual_amount, completed_at, origin, plan_batch)
        values ('${day(62)}','${CA}','의료폐기물','완료',80,now(),'field','${b2}')`)
  tryAs(ADMIN, `select public.undo_schedule_batch('${b2}'::uuid)`)
  const done = psql(`select count(*) from public.schedules where plan_batch='${b2}'`)
  ok(done === '1', '완료된 수거도 그대로 (0028 방어 유지)', `${done}건`)
}

// ── 9. 감사기록 ────────────────────────────────────────────────────────────
{
  const mv = psql(`select count(*) from public.audit_logs where action='schedule.move'`)
  ok(Number(mv) > 0, '옮긴 기록이 남음', `${mv}건`)
  const before = psql(`select (before_data->>'date' is not null)::text from public.audit_logs
                       where action='schedule.move' order by at desc limit 1`)
  ok(before === 'true', '**옮기기 전 날짜도 남음** (어디서 어디로 갔는지)')
  const cn = psql(`select summary from public.audit_logs where action='schedule.cancel' order by at desc limit 1`)
  ok(/무름/.test(cn) && /병원/.test(cn), '무른 이유가 요약에 적힘', cn.slice(0, 70))
  const who = psql(`select count(*) from public.audit_logs
                    where action in ('schedule.move','schedule.cancel') and actor_id is null`)
  ok(who === '0', '**누가 했는지 빠진 줄이 없음**', `${who}건`)
}

// ── 10. 자가진단·버전 ──────────────────────────────────────────────────────
{
  const v = psql(`select public.app_schema_version()`)
  ok(v === '64', 'DB 버전 64', v)
  const h = tryAs(ADMIN, `select public.app_health_check()->>'ok'`)
  ok(h.ok && h.out === 'true', '자가진단 통과', h.out)
  const m = tryAs(ADMIN, `select public.app_health_check()->>'missing'`)
  ok(m.ok && m.out === '[]', '빠진 것 없음', m.out)
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
