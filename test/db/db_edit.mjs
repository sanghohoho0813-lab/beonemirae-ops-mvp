import { execFileSync } from 'node:child_process'

//  0062 — 잡아 둔 일정을 고치고, 현장이 의견을 낼 때 서버가 지키는 것.
//
//   확인하는 것
//    · 상세 고치기(update_visit)는 **사무실·관리자만** — 기사는 못 함
//    · **완료된 수거는 못 고침** (정산·청구·매출이 거기서 나옴)
//    · 무른 방문도 못 고침 · 시각 형식 · 예상량 범위 · 차량 종류 일치
//    · 현장 담당자는 **의견은 낼 수 있음**, 같은 표로 두 번 보내도 하나
//    · 현장은 **자기 의견만 봄** — 남의 의견은 사무실·관리자만
//    · 의견 처리(handle)는 사무실·관리자만
//    · 월 실적 수정은 사무실·관리자만 · **확정 청구가 있는 달은 거부**
//    · 이익은 받지 않고 **매출 − 원가**로 계산 · 이전 값이 감사기록에 남음

const DB = 'editq'
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
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 140)

const mk = (email, role, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}
const client = (name) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste, collects_diaper)
        values ('${name}','병원','',true,true) on conflict do nothing`)
  return psql(`select id from public.clients where name='${name}' order by created_at limit 1`)
}
const vehicle = (name, type) => {
  psql(`insert into public.vehicles (name, waste_type, driver) values ('${name}','${type}','기사') on conflict do nothing`)
  return psql(`select id from public.vehicles where name='${name}' order by created_at limit 1`)
}
const sched = (clientId, date, status = '예정', waste = '의료폐기물') =>
  psql(`insert into public.schedules (date, client_id, waste_type, status, expected_amount)
        values ('${date}','${clientId}','${waste}','${status}',100) returning id`)

const CA = client('[검증E]가나병원')
const ADMIN = mk('ed-admin@beonemirae.test', 'admin')
const OFFICE = mk('ed-office@beonemirae.test', 'office')
const FIELD = mk('ed-field@beonemirae.test', 'field')
const FIELD2 = mk('ed-field2@beonemirae.test', 'field')
const HOSP = mk('ed-hosp@beonemirae.test', 'client', CA)
const VMED = vehicle('[검증E]의료차', '의료폐기물')
const VDIA = vehicle('[검증E]기저귀차', '일회용기저귀')

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)

console.log('── 1. 방문 상세 고치기 ──')
{
  const s = sched(CA, day(3))
  let r = tryAs(FIELD, `select public.update_visit('${s}', '10:30')`)
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '기사는 일정을 못 고침', err(r))

  r = tryAs(HOSP, `select public.update_visit('${s}', '10:30')`)
  ok(!r.ok, '병원 계정도 못 고침', err(r))

  r = tryAs(OFFICE, `select public.update_visit('${s}', '10:30', '${VMED}', 250, '지하 주차', false)`)
  ok(r.ok, '사무실은 시각·차량·예상량·메모를 고침')
  const row = psql(`select scheduled_time||'|'||coalesce(vehicle_id::text,'-')||'|'||expected_amount||'|'||memo
                    from public.schedules where id='${s}'`)
  ok(row === `10:30|${VMED}|250|지하 주차`, '고친 값이 그대로 들어감', row)

  //  날짜는 안 건드립니다 — 그 달 매출이 옮겨 가면 안 됩니다.
  const d = psql(`select date::text from public.schedules where id='${s}'`)
  ok(d === day(3), '날짜는 그대로 (옮기기는 move_visit 이 함)', d)

  r = tryAs(OFFICE, `select public.update_visit('${s}', '25:99')`)
  ok(!r.ok && /시각이 올바르지 않습니다/.test(r.out), '엉뚱한 시각은 거부', err(r))

  r = tryAs(OFFICE, `select public.update_visit('${s}', null, null, 999999)`)
  ok(!r.ok && /예상 배출량/.test(r.out), '말도 안 되는 예상량은 거부', err(r))

  r = tryAs(OFFICE, `select public.update_visit('${s}', null, '${VDIA}', null, null, false)`)
  ok(!r.ok && /차량입니다/.test(r.out), '폐기물 종류가 다른 차는 거부', err(r))
}

console.log('── 2. 완료·무른 방문은 못 고침 ──')
{
  const done = sched(CA, day(-2), '완료')
  let r = tryAs(ADMIN, `select public.update_visit('${done}', '11:00')`)
  ok(!r.ok && /완료된 수거는 여기서 못 고칩니다/.test(r.out), '**완료된 수거는 못 고침**', err(r))

  const s2 = sched(CA, day(5))
  run(`select public.cancel_visit('${s2}', '병원이 취소')`, ADMIN)
  r = tryAs(ADMIN, `select public.update_visit('${s2}', '11:00')`)
  ok(!r.ok && /이미 무른 방문/.test(r.out), '무른 방문도 못 고침', err(r))
}

console.log('── 3. 현장 의견 ──')
{
  const s = sched(CA, day(4))
  const req = psql(`select gen_random_uuid()`)
  let r = tryAs(FIELD, `select public.submit_schedule_feedback('${s}','요일변경','화요일이 더 낫습니다','${req}')`)
  ok(r.ok && /"duplicated": false/.test(r.out), '현장 담당자가 의견을 냄', err(r))

  r = tryAs(FIELD, `select public.submit_schedule_feedback('${s}','요일변경','화요일이 더 낫습니다','${req}')`)
  ok(r.ok && /"duplicated": true/.test(r.out), '**같은 표로 두 번 눌러도 하나** (0055 방식)', err(r))
  const n = psql(`select count(*) from public.schedule_feedback where schedule_id='${s}'`)
  ok(n === '1', '실제로 한 건만 쌓임', `${n}건`)

  r = tryAs(FIELD, `select public.submit_schedule_feedback('${s}','요일변경','')`)
  ok(!r.ok && /의견 내용을 적어/.test(r.out), '빈 의견은 거부', err(r))

  r = tryAs(HOSP, `select public.submit_schedule_feedback('${s}','기타','병원입니다')`)
  ok(!r.ok && /포털의 「수거 요청」/.test(r.out), '병원 계정은 포털로 안내됨 (엉뚱한 문구 아님)', err(r))

  //  현장은 자기 것만 봅니다
  //  ⚠ psql() 은 uid 를 안 받습니다 — 그대로 쓰면 superuser 로 돌아 **RLS 를
  //    건너뜁니다.** 실제로 이 줄 때문에 「남의 의견도 보인다」는 거짓 실패가 났습니다.
  const seenSelf = run(`select count(*) from public.schedule_feedback`, FIELD)
  const seenOther = run(`select count(*) from public.schedule_feedback`, FIELD2)
  ok(seenSelf === '1' && seenOther === '0', '**현장은 자기 의견만 봄**', `본인 ${seenSelf} · 남 ${seenOther}`)
  const seenOffice = run(`select count(*) from public.schedule_feedback`, OFFICE)
  ok(seenOffice === '1', '사무실은 전부 봄', `${seenOffice}건`)

  const fid = psql(`select id from public.schedule_feedback where schedule_id='${s}'`)
  r = tryAs(FIELD, `select public.handle_schedule_feedback('${fid}','반영','바꿨습니다')`)
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '현장은 자기 의견을 처리하지 못함', err(r))

  r = tryAs(ADMIN, `select public.handle_schedule_feedback('${fid}','반영','화요일로 옮겼습니다')`)
  ok(r.ok, '관리자가 처리함')
  const st = psql(`select status||'|'||reply||'|'||(handled_at is not null)::text from public.schedule_feedback where id='${fid}'`)
  ok(st === '반영|화요일로 옮겼습니다|true', '상태·회신·처리시각이 남음', st)

  //  직접 쓰기는 막혀 있어야 합니다
  r = tryAs(FIELD, `delete from public.schedule_feedback where id='${fid}'`)
  ok(!r.ok, '**의견은 직접 지울 수 없음** (기록이니까)', err(r))
  r = tryAs(ADMIN, `insert into public.schedule_feedback (schedule_id, client_id, body) values ('${s}','${CA}','직접')`)
  ok(!r.ok, '관리자도 직접 넣지 못함 (함수로만)', err(r))
}

console.log('── 4. 엑셀 월 실적 고치기 ──')
{
  const M = psql(`select to_char(('${TODAY}'::date - 60), 'YYYY-MM')`)
  const aid = psql(`insert into public.client_monthly_actuals (client_id, month, medical_kg, diaper_kg, revenue, cost, profit, source_file)
                    values ('${CA}','${M}', 900, 100, 500000, 200000, 300000, 'x.xlsx') returning id`)

  let r = tryAs(FIELD, `select public.update_monthly_actual('${aid}', null, null, 600000)`)
  ok(!r.ok && /사무실 담당자와 관리자만/.test(r.out), '현장은 월 실적을 못 고침', err(r))

  r = tryAs(OFFICE, `select public.update_monthly_actual('${aid}', 950, null, 600000, 250000)`)
  ok(r.ok, '사무실이 월 실적을 고침', err(r))
  const row = psql(`select medical_kg||'|'||revenue||'|'||cost||'|'||profit from public.client_monthly_actuals where id='${aid}'`)
  ok(row === '950|600000|250000|350000', '**이익은 매출 − 원가로 다시 계산** (따로 안 받음)', row)

  const log = psql(`select before_data->>'revenue' from public.audit_logs
                    where action='monthly_actual.update' and entity_id='${aid}' order by at desc limit 1`)
  ok(log === '500000', '고치기 전 값이 감사기록에 남음', log)

  r = tryAs(OFFICE, `select public.update_monthly_actual('${aid}', null, null, -1)`)
  ok(!r.ok && /0보다 작을 수 없습니다/.test(r.out), '음수 매출은 거부', err(r))

  //  확정한 청구가 있는 달은 막습니다
  psql(`insert into public.payments (client_id, billing_month, amount, status)
        values ('${CA}','${M}', 600000, '미수금')`)
  r = tryAs(ADMIN, `select public.update_monthly_actual('${aid}', null, null, 700000)`)
  ok(!r.ok && /이미 청구를 확정했습니다/.test(r.out), '**확정 청구가 있는 달은 거부**', err(r))
}

console.log('── 5. 자가진단 ──')
{
  const h = run(`select public.app_health_check()::text`, ADMIN)
  ok(/"ok": true/.test(h), '자가진단 통과', h.slice(0, 160))
  const v = run(`select public.app_schema_version()`, ADMIN)
  ok(v === '64', 'DB 버전 64', v)
}
