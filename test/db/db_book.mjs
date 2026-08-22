import { execFileSync } from 'node:child_process'

//  0058 — 날짜를 정해 방문을 잡을 때 서버가 지키는 것.
//
//   여기가 헐거우면 **기사님이 헛걸음을 합니다.** 안 하는 구분의 방문,
//   기저귀 차로 가는 의료폐기물 방문, 같은 날 두 번 잡힌 방문 — 전부
//   현장에서 시간이 날아가는 방식입니다.
//
//   확인하는 것
//    · 사무실·관리자만 잡는다 (기사·병원 계정은 못 잡는다)
//    · 지난 날짜 · 반년 너머는 막는다
//    · 그 거래처가 안 하는 구분은 막는다
//    · 차량 구분이 다르면 막는다
//    · **같은 날 같은 구분은 하나뿐** (두 번 눌러도 방문은 하나)
//    · 요청을 걸면 같은 트랜잭션에서 「일정 반영」으로 넘어간다
//    · 남의 병원 요청은 못 건다
//    · 감사기록이 남는다
//    · **자동 편성 되돌리기에 쓸려 나가지 않는다** (병원과 한 약속입니다)

const DB = 'bookq'
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
const client = (name, med = true, dia = false) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',${med},${dia}) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}'`)
}
const vehicle = (name, type) => {
  psql(`insert into public.vehicles (name, waste_type, driver) values ('${name}','${type}','기사')
        on conflict do nothing`)
  return psql(`select id from public.vehicles where name='${name}'`)
}

//  「오늘」은 서버와 같은 기준(한국 시각)으로 잡습니다 — 자정 근처에
//  하루가 어긋나면 「지난 날짜」 검사가 엉뚱하게 실패합니다.
const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)

const CA = client('[검증B]가나병원', true, false)
const CB = client('[검증B]다라요양원', true, true)
const CDIA = client('[검증B]기저귀만요양원', false, true)
const ADMIN = mk('bk-admin@beonemirae.test', 'admin')
const OFFICE = mk('bk-office@beonemirae.test', 'office')
const FIELD = mk('bk-field@beonemirae.test', 'field')
const HOSP = mk('bk-hosp@beonemirae.test', 'client', CA)
const VMED = vehicle('[검증B]의료차', '의료폐기물')
const VDIA = vehicle('[검증B]기저귀차', '일회용기저귀')

const book = (uid, args) => {
  const a = {
    client: CA, date: day(7), type: '의료폐기물', time: '', vehicle: null,
    memo: '', expected: null, request: null, ...args,
  }
  return tryAs(uid, `select public.book_visit(
    '${a.client}'::uuid, '${a.date}'::date, '${a.type}',
    '${a.time}', ${a.vehicle ? `'${a.vehicle}'::uuid` : 'null'},
    '${a.memo}', ${a.expected ?? 'null'}, ${a.request ? `'${a.request}'::uuid` : 'null'})`)
}

// ── 1. 사무실·관리자만 ──────────────────────────────────────────────────────
{
  const r1 = book(ADMIN, { date: day(3) })
  ok(r1.ok, '관리자는 방문을 잡을 수 있음', err(r1))
  const r2 = book(OFFICE, { date: day(4) })
  ok(r2.ok, '사무실 담당자도 잡을 수 있음', err(r2))

  const r3 = book(FIELD, { date: day(5) })
  ok(!r3.ok && /사무실 담당자와 관리자만/.test(r3.out),
    '**기사는 못 잡음** (남의 일정을 만드는 자리가 아닙니다)', err(r3))
  const r4 = book(HOSP, { date: day(6) })
  ok(!r4.ok, '**병원 계정도 못 잡음**', err(r4))

  const n = psql(`select count(*) from public.schedules where client_id='${CA}' and booked_at is not null`)
  ok(n === '2', '통과한 둘만 들어감', `${n}건`)
}

// ── 2. 날짜 ─────────────────────────────────────────────────────────────────
{
  const r1 = book(ADMIN, { date: day(-1) })
  ok(!r1.ok && /지난 날짜/.test(r1.out), '**어제는 못 잡음** (이미 다녀온 것은 수거 입력으로)', err(r1))

  const r2 = book(ADMIN, { date: day(181) })
  ok(!r2.ok && /너무 먼 날짜/.test(r2.out), '**반년 너머는 막음** (연도 오타 방어)', err(r2))

  const r3 = book(ADMIN, { date: day(180) })
  ok(r3.ok, '반년 정확히는 통과', err(r3))

  const r4 = book(ADMIN, { date: TODAY })
  ok(r4.ok, '**오늘은 잡을 수 있음** (아침에 온 전화)', err(r4))
}

// ── 3. 그 거래처가 안 하는 구분 ─────────────────────────────────────────────
{
  const r1 = book(ADMIN, { client: CA, type: '일회용기저귀', date: day(10) })
  ok(!r1.ok && /배출하지 않는 거래처/.test(r1.out),
    '**기저귀를 안 받는 병원에 기저귀 방문 금지** (기사 헛걸음)', err(r1))

  const r2 = book(ADMIN, { client: CDIA, type: '의료폐기물', date: day(10) })
  ok(!r2.ok && /배출하지 않는 거래처/.test(r2.out), '반대 방향도 막음', err(r2))

  const r3 = book(ADMIN, { client: CB, type: '일회용기저귀', date: day(10) })
  ok(r3.ok, '둘 다 하는 곳은 통과', err(r3))

  const r4 = book(ADMIN, { type: '음식물', date: day(11) })
  ok(!r4.ok, '없는 구분은 막음', err(r4))
}

// ── 4. 차량 ─────────────────────────────────────────────────────────────────
{
  const r1 = book(ADMIN, { date: day(12), vehicle: VDIA })
  ok(!r1.ok && /차량입니다/.test(r1.out),
    '**기저귀 차로 의료폐기물 방문 금지**', err(r1))

  const r2 = book(ADMIN, { date: day(12), vehicle: VMED })
  ok(r2.ok, '구분이 맞는 차량은 통과', err(r2))
  const v = psql(`select vehicle_id from public.schedules where client_id='${CA}' and date='${day(12)}'`)
  ok(v === VMED, '차량이 실제로 붙음')

  psql(`update public.vehicles set active=false where id='${VMED}'`)
  const r3 = book(ADMIN, { date: day(13), vehicle: VMED })
  ok(!r3.ok && /운행하지 않는 차량/.test(r3.out), '세워 둔 차는 못 배정', err(r3))
  psql(`update public.vehicles set active=true where id='${VMED}'`)
}

// ── 5. 같은 날 같은 구분은 하나뿐 ───────────────────────────────────────────
//
//   두 번 누르면 방문이 두 번 나갑니다. 실제 돈은 아니지만 기사님 반나절이
//   날아가고 병원은 「왜 또 왔냐」고 합니다.
{
  const d = day(20)
  const r1 = book(ADMIN, { date: d })
  ok(r1.ok, '처음 한 번은 통과', err(r1))
  const r2 = book(ADMIN, { date: d })
  ok(!r2.ok && /이미 잡혀 있습니다/.test(r2.out), '**두 번 눌러도 방문은 하나**', err(r2))
  const r3 = book(OFFICE, { date: d })
  ok(!r3.ok, '다른 사람이 눌러도 마찬가지', err(r3))
  const n = psql(`select count(*) from public.schedules where client_id='${CA}' and date='${d}'`)
  ok(n === '1', '실제로 한 줄만 있음', `${n}줄`)

  //  자동 편성이 이미 만들어 둔 날에도 겹쳐 잡지 않습니다.
  const d2 = day(21)
  psql(`insert into public.schedules (date, client_id, waste_type, status, origin, plan_batch)
        values ('${d2}','${CA}','의료폐기물','예정','system', gen_random_uuid())`)
  const r4 = book(ADMIN, { date: d2 })
  ok(!r4.ok && /이미 잡혀 있습니다/.test(r4.out), '자동 편성분과도 안 겹침', err(r4))
}

// ── 6. 값 검사 ──────────────────────────────────────────────────────────────
{
  const r1 = book(ADMIN, { date: day(30), time: '25:00' })
  ok(!r1.ok && /시각이 올바르지 않습니다/.test(r1.out), '25시는 없음', err(r1))
  const r2 = book(ADMIN, { date: day(30), time: '9:5' })
  ok(!r2.ok, '흐트러진 형식도 막음', err(r2))
  const r3 = book(ADMIN, { date: day(30), time: '09:30' })
  ok(r3.ok, '09:30 은 통과', err(r3))
  const t = psql(`select scheduled_time from public.schedules where client_id='${CA}' and date='${day(30)}'`)
  ok(t === '09:30', '시각이 그대로 저장됨', t)

  const r4 = book(ADMIN, { date: day(31), expected: 999999 })
  ok(!r4.ok && /너무 큽니다/.test(r4.out), '**자릿수를 잘못 친 예상량은 막음**', err(r4))
  const r5 = book(ADMIN, { date: day(31), expected: 120 })
  ok(r5.ok, '정상 예상량은 통과', err(r5))
}

// ── 7. 거래 중이 아닌 거래처 ────────────────────────────────────────────────
{
  const gone = client('[검증B]문닫은의원')
  psql(`update public.clients set active=false where id='${gone}'`)
  const r = book(ADMIN, { client: gone, date: day(40) })
  ok(!r.ok && /거래 중이 아닌/.test(r.out), '**그만둔 거래처에는 못 잡음**', err(r))
}

// ── 8. 요청을 걸어 잡기 ─────────────────────────────────────────────────────
//
//   지금까지 「일정 반영」은 말이었습니다 — 눌러도 일정이 안 생겼습니다.
//   병원에는 「반영했습니다」라고 적혀 있는데 차가 안 가는 것이 가장 나쁩니다.
{
  psql(`insert into public.client_requests (id, client_id, kind, content, status, source)
        values ('11111111-1111-1111-1111-111111111111','${CA}','긴급수거','가득 찼습니다','접수','portal')
        on conflict (id) do update set status='접수', reply=''`)
  const REQ = '11111111-1111-1111-1111-111111111111'

  const r = book(ADMIN, { date: day(45), time: '14:00', request: REQ })
  ok(r.ok, '요청을 걸어 방문을 잡음', err(r))
  const st = psql(`select status from public.client_requests where id='${REQ}'`)
  ok(st === '일정 반영', '**요청이 같은 트랜잭션에서 「일정 반영」으로 넘어감**', st)
  const rep = psql(`select reply from public.client_requests where id='${REQ}'`)
  ok(/방문으로 잡았습니다/.test(rep) && /14:00/.test(rep),
    '병원 화면에 보일 회신이 적힘', rep.slice(0, 60))

  //  회신을 덮어쓰지 않습니다 — 사람이 적어 둔 말을 시스템이 지우면 안 됩니다.
  psql(`update public.client_requests set reply='담당자 확인했습니다', status='확인 중' where id='${REQ}'`)
  const r2 = book(ADMIN, { date: day(46), request: REQ })
  ok(r2.ok, '같은 요청으로 한 번 더 잡을 수 있음 (다른 날)', err(r2))
  const rep2 = psql(`select reply from public.client_requests where id='${REQ}'`)
  ok(/담당자 확인했습니다/.test(rep2) && /방문으로 잡았습니다/.test(rep2),
    '**사람이 적은 회신을 지우지 않고 이어 붙임**', rep2.replace(/\n/g, ' / ').slice(0, 80))

  //  이미 끝난 요청은 되돌리지 않습니다.
  psql(`update public.client_requests set status='처리 완료' where id='${REQ}'`)
  const r3 = book(ADMIN, { date: day(47), request: REQ })
  ok(r3.ok, '끝난 요청으로도 방문은 잡힘', err(r3))
  const st3 = psql(`select status from public.client_requests where id='${REQ}'`)
  ok(st3 === '처리 완료', '**끝난 요청을 뒤로 되돌리지 않음**', st3)

  //  남의 병원 요청은 못 겁니다.
  const r4 = book(ADMIN, { client: CB, date: day(48), request: REQ })
  ok(!r4.ok && /다른 거래처의 요청/.test(r4.out), '**남의 병원 요청은 못 걺**', err(r4))
}

// ── 9. 만들어진 방문의 모양 ─────────────────────────────────────────────────
{
  const d = day(60)
  const r = book(ADMIN, { date: d, memo: '3층 처치실 앞', expected: 80 })
  ok(r.ok, '방문 생성', err(r))
  const row = psql(`select status || '|' || origin || '|' || coalesce(is_additional::text,'-') || '|'
                      || (booked_at is not null)::text || '|' || (plan_batch is null)::text || '|'
                      || coalesce(actual_amount::text,'null') || '|' || memo || '|' || expected_amount
                    from public.schedules where client_id='${CA}' and date='${d}'`)
  ok(row === "예정|system|false|true|true|null|3층 처치실 앞|80",
    '**예정 · booked_at 있음 · plan_batch 없음 · 실적 비어 있음**', row)
}

// ── 10. 자동 편성 되돌리기에 쓸려 나가지 않는다 ─────────────────────────────
//
//   ⚠ 여기가 조용한 위험입니다. 병원과 한 약속이 「일괄 취소」로 사라지면
//   그 병원은 아무 연락 없이 안 오는 것을 겪습니다.
{
  const d = day(70)
  const batch = psql(`select gen_random_uuid()`)
  psql(`insert into public.schedules (date, client_id, waste_type, status, origin, plan_batch)
        values ('${d}','${CB}','의료폐기물','예정','system','${batch}')`)
  const r = book(ADMIN, { client: CB, date: day(71) })
  ok(r.ok, '같은 기간에 손으로도 한 건 잡음', err(r))

  const u = tryAs(ADMIN, `select public.undo_schedule_batch('${batch}'::uuid)`)
  ok(u.ok, '자동 편성 되돌리기 실행', err(u))

  const auto = psql(`select count(*) from public.schedules where client_id='${CB}' and date='${d}'`)
  ok(auto === '0', '자동 편성분은 지워짐', `${auto}건`)
  const kept = psql(`select count(*) from public.schedules where client_id='${CB}' and date='${day(71)}' and booked_at is not null`)
  ok(kept === '1', '**손으로 잡은 방문은 그대로 남음**', `${kept}건`)
}

// ── 11. 감사기록 ────────────────────────────────────────────────────────────
{
  const n = psql(`select count(*) from public.audit_logs where action='schedule.book'`)
  ok(Number(n) > 0, '방문 예약이 감사기록에 남음', `${n}건`)
  const s = psql(`select summary from public.audit_logs where action='schedule.book' order by at desc limit 1`)
  ok(/방문 예약/.test(s), '무슨 일이었는지 사람 말로 적힘', s.slice(0, 70))
  const who = psql(`select count(*) from public.audit_logs where action='schedule.book' and actor_id is null`)
  ok(who === '0', '**누가 했는지 빠진 줄이 없음**', `${who}건`)
}

// ── 12. 자가진단·버전 ───────────────────────────────────────────────────────
{
  const v = psql(`select public.app_schema_version()`)
  ok(v === '64', 'DB 버전 64', v)
  const h = tryAs(ADMIN, `select public.app_health_check()->>'ok'`)
  ok(h.ok && h.out === 'true', '자가진단 통과', h.out)
  const m = tryAs(ADMIN, `select public.app_health_check()->>'missing'`)
  ok(m.ok && m.out === '[]', '빠진 것 없음', m.out)
}

console.log(`\n총 ${process.exitCode ? '실패 있음' : '실패 0건'}`)
