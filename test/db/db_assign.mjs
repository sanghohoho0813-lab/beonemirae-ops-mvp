import { execFileSync } from 'node:child_process'

//  0029 차량 배정을 실제 서버 함수로 검증합니다.
//   · 폐기물 구분이 다른 차는 어떤 경우에도 붙지 않아야 합니다 (분리 운행)
//   · 끝난 수거·지난 날짜·이미 배정된 건은 손대지 않아야 합니다
//   · 되돌리기는 아직 수거하지 않은 건만 풀어야 합니다

const DB = 'asgq'
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
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','{"role":"admin"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','{"role":"office"}'::jsonb),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','{"role":"field"}'::jsonb)
  on conflict (id) do nothing;
  insert into public.profiles (id, email, name, role, active, approved_at) values
    ('00000000-0000-0000-0000-0000000000ad','admin@t.test','대표','admin',true,now()),
    ('00000000-0000-0000-0000-0000000000bf','office@t.test','사무실','office',true,now()),
    ('00000000-0000-0000-0000-0000000000fd','field@t.test','현장','field',true,now())
  on conflict (id) do update set name=excluded.name, role=excluded.role, active=true;
`)
const asRole = (uid, sql) => psql(`
  set role authenticated;
  set request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql}
`)
const OFFICE = '00000000-0000-0000-0000-0000000000bf'
const FIELD = '00000000-0000-0000-0000-0000000000fd'

const kst = (n) => psql(`select ((now() at time zone 'Asia/Seoul')::date + ${n})::text`)
const TODAY = kst(0)
const TOM = kst(1)
const YDAY = kst(-1)

const cid = psql(`insert into public.clients (name, type, address) values ('[검증] 배정', '병원', '') returning id`)
const mkVeh = (name, type, cap, active = true) => psql(
  `insert into public.vehicles (name, waste_type, tonnage, nominal_capacity, expected_capacity, driver, active)
   values ('${name}','${type}',1,1000,${cap},'기사',${active}) returning id`)
const VM1 = mkVeh('의료 1톤 A', '의료폐기물', 670)
const VM2 = mkVeh('의료 1톤 B', '의료폐기물', 670)
const VD1 = mkVeh('기저귀 1톤', '일회용기저귀', 750)
const VOFF = mkVeh('세워둔 차', '의료폐기물', 670, false)

const mkSched = (date, type = '의료폐기물', status = '예정', kg = 100) => psql(
  `insert into public.schedules (date, client_id, waste_type, status, expected_amount, origin)
   values ('${date}','${cid}','${type}','${status}',${kg},'system') returning id`)

const s1 = mkSched(TOM)
//  같은 거래처·같은 날·같은 구분의 「예정」이 두 건인 상태는 0040 부터
//  DB 가 막습니다 — 앱도 만들 수 없는 상태였습니다(같은 방문이 두 번
//  나가는 것). 같은 날 다시 가는 실제 업무는 「추가 수거」이므로 그렇게 둡니다.
const s2 = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, origin, is_additional)
  values ('${TOM}','${cid}','의료폐기물','예정',100,'system',true) returning id`)
const sDiaper = mkSched(TOM, '일회용기저귀')
const sDone = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, actual_amount, completed_at, origin)
  values ('${TODAY}','${cid}','의료폐기물','완료',100,98, now(), 'field') returning id`)
const sPast = psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount, origin)
  values ('${YDAY}','${cid}','의료폐기물','예정',100,'system') returning id`)

const call = (uid, rows) =>
  JSON.parse(asRole(uid, `select public.assign_schedule_vehicles('${JSON.stringify(rows)}'::jsonb)`))
const vehOf = (id) => psql(`select coalesce(vehicle_id::text,'') from public.schedules where id='${id}'`)

// ── 1. 기본 배정 ──────────────────────────────────────────────────────────
const r1 = call(OFFICE, [{ scheduleId: s1, vehicleId: VM1 }, { scheduleId: s2, vehicleId: VM2 }])
ok(r1.assigned === 2 && r1.skipped === 0, '2건 배정', JSON.stringify(r1))
ok(r1.vehicles === 2 && r1.from === TOM && r1.to === TOM, '요약에 차량 수·날짜', JSON.stringify(r1))
ok(vehOf(s1) === VM1 && vehOf(s2) === VM2, '각 일정에 지정한 차가 붙음')
ok(Array.isArray(r1.ids) && r1.ids.length === 2, '되돌릴 수 있게 id 를 돌려줌')

// ── 2. 이미 배정된 건은 손대지 않음 ───────────────────────────────────────
const r2 = call(OFFICE, [{ scheduleId: s1, vehicleId: VM2 }])
ok(r2.assigned === 0 && r2.skipped === 1, '이미 차가 있으면 건너뜀', JSON.stringify(r2))
ok(vehOf(s1) === VM1, '기존 차량이 덮이지 않음')

// ── 3. 분리 운행 — 구분이 다른 차는 절대 붙지 않음 ────────────────────────
const bad = (uid, rows, name, re) => {
  let threw = false
  try { call(uid, rows) } catch (e) { threw = re ? re.test(String(e.stderr ?? e.message ?? e)) : true }
  ok(threw, name)
}
bad(OFFICE, [{ scheduleId: sDiaper, vehicleId: VM1 }], '기저귀 일정에 의료폐기물 차량 거부', /분리 운행/)
bad(OFFICE, [{ scheduleId: s1, vehicleId: VD1 }], '의료폐기물 일정에 기저귀 차량 거부', /분리 운행/)
ok(vehOf(sDiaper) === '', '거부된 기저귀 일정은 차량이 비어 있음')

// ── 4. 끝난 수거·지난 날짜·세워둔 차 ──────────────────────────────────────
bad(OFFICE, [{ scheduleId: sDone, vehicleId: VM1 }], '이미 끝난 수거는 차량을 바꾸지 않음', /이미 끝난 수거/)
bad(OFFICE, [{ scheduleId: sPast, vehicleId: VM1 }], '지난 날짜 일정 거부', /지난 날짜/)
bad(OFFICE, [{ scheduleId: sDiaper, vehicleId: VOFF }], '사용 중지한 차량 거부', /사용 중인 차량이 아닙니다/)
bad(OFFICE, [{ scheduleId: '00000000-0000-0000-0000-0000000000ff', vehicleId: VM1 }],
  '없는 일정 거부', /배정할 일정을 찾을 수 없습니다/)

// ── 5. 잘못된 목록 ────────────────────────────────────────────────────────
bad(OFFICE, [], '빈 목록 거부', /배정할 일정이 없습니다/)
{
  let threw = false
  try { asRole(OFFICE, `select public.assign_schedule_vehicles('"x"'::jsonb)`) }
  catch (e) { threw = /목록 형태가 아닙니다/.test(String(e.stderr ?? e.message ?? e)) }
  ok(threw, '목록이 아닌 값 거부')
}
bad(OFFICE, Array.from({ length: 1001 }, () => ({ scheduleId: sDiaper, vehicleId: VD1 })),
  '1001건 거부', /1000건까지/)

// ── 6. 한 건이라도 막히면 전부 되돌아감 (원자성) ──────────────────────────
let atomic = false
try {
  call(OFFICE, [{ scheduleId: sDiaper, vehicleId: VD1 }, { scheduleId: sDiaper, vehicleId: VM1 }])
} catch { atomic = true }
ok(atomic, '섞인 목록은 예외로 막힘')
ok(vehOf(sDiaper) === '', '앞 줄이 성공했어도 남지 않음 (한 트랜잭션)', vehOf(sDiaper))

// ── 7. 권한 ───────────────────────────────────────────────────────────────
bad(FIELD, [{ scheduleId: sDiaper, vehicleId: VD1 }], '현장 담당자는 배정할 수 없음', /사무실 담당자와 관리자만/)
let undoBlocked = false
try { asRole(FIELD, `select public.unassign_schedule_vehicles(array['${s1}']::uuid[])`) }
catch (e) { undoBlocked = /사무실 담당자와 관리자만/.test(String(e.stderr ?? e.message ?? e)) }
ok(undoBlocked, '현장 담당자는 되돌릴 수 없음')

// ── 8. 되돌리기 ───────────────────────────────────────────────────────────
//  s2 는 그 사이에 수거를 다녀온 것으로 바꿉니다 — 풀리면 안 됩니다.
psql(`update public.schedules set status='완료', actual_amount=95, completed_at=now() where id='${s2}'`)
const u = JSON.parse(asRole(OFFICE,
  `select public.unassign_schedule_vehicles(array['${s1}','${s2}']::uuid[])`))
ok(u.cleared === 1 && u.kept === 1, '예정 1건만 풀고 수거한 1건은 그대로', JSON.stringify(u))
ok(vehOf(s1) === '', 's1 의 차량이 비워짐')
ok(vehOf(s2) === VM2, '수거를 다녀온 s2 는 차량이 남음')

let emptyUndo = false
try { asRole(OFFICE, `select public.unassign_schedule_vehicles(array[]::uuid[])`) }
catch (e) { emptyUndo = /되돌릴 일정이 없습니다/.test(String(e.stderr ?? e.message ?? e)) }
ok(emptyUndo, '빈 목록 되돌리기 거부')

// ── 9. 감사기록 ───────────────────────────────────────────────────────────
ok(Number(psql(`select count(*) from public.audit_logs where action='schedule.assign'`)) === 2,
  '배정 2회가 감사기록에 남음')
ok(Number(psql(`select count(*) from public.audit_logs where action='schedule.assign.undo'`)) === 1,
  '되돌리기도 감사기록에 남음')
const sum = psql(`select summary from public.audit_logs where action='schedule.assign' order by at limit 1`)
ok(/2건 배정/.test(sum) && /차량 2대/.test(sum), '무엇을 배정했는지 그대로', sum.slice(0, 60))
const actor = psql(`select actor_name || '/' || actor_role from public.audit_logs where action='schedule.assign' order by at limit 1`)
ok(actor === '사무실/office', '누가 했는지 서버가 적음', actor)

// ── 10. 오늘 날짜(한국 기준)에는 배정됨 ───────────────────────────────────
const sToday = mkSched(TODAY, '일회용기저귀')
const r3 = call(OFFICE, [{ scheduleId: sToday, vehicleId: VD1 }])
ok(r3.assigned === 1, '한국 기준 오늘 일정에는 배정됨', JSON.stringify(r3))

console.log('')
console.log(`총 ${out.length}건 · 실패 ${out.filter((v) => !v).length}건`)
