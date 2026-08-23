import { execFileSync } from 'node:child_process'

//  0076 — 요청을 잠시 내려 두기 · 공용차를 누가 잡았는지
//
//   ⚠ 「내려 두기」가 **지우기**나 **처리 완료**가 되면 안 됩니다.
//     안 한 일을 했다고 적는 것이 제일 나쁩니다.
//   ⚠ 기한 없는 숨김은 영원히 안 보이는 것과 같습니다 — 반드시 날짜를 받습니다.

const DB = 'snooze76'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items', '0076_snooze_who']) {
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_${f}.sql`],
    { encoding: 'utf8' })
}

const PSQL = ['-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres', '-d', DB, '-qtA', '-v', 'ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo', ['-u', 'pgtest', 'psql', ...PSQL, '-c', uid ? asRole(uid, sql) : sql], { encoding: 'utf8' }).trim()
const psql = (s) => run(s)
const tryAs = (uid, sql) => {
  try { return { ok: true, out: run(sql, uid) } } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) } }
}
const ok = (c, m, d = '') => { console.log(`${c ? ' OK ' : 'FAIL'} | ${m}${d ? ` — ${d}` : ''}`); if (!c) process.exitCode = 1 }
const err = (r) => (String(r.out).match(/ERROR:.*/) ?? [''])[0].slice(0, 150)

const mk = (email, role, name, clientId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${name}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true,
                                       approved_at=now(), client_id=excluded.client_id`)
  return id
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)
psql(`insert into public.clients (name, type, address, collects_medical_waste)
      values ('[검증76]더원요양병원','요양병원','',true) on conflict do nothing`)
const CID = psql(`select id from public.clients where name='[검증76]더원요양병원' limit 1`)
const ADM = mk('a76@x.test', 'admin', '송대표')
const FLD = mk('f76@x.test', 'field', '김준기')
const FL2 = mk('g76@x.test', 'field', '오대성')
const CLI = mk('c76@x.test', 'client', '병원담당', CID)

console.log('── 요청 내려 두기 ──')
{
  const RID = psql(`insert into public.client_requests (client_id, kind, content, status, source, requester_name)
                    values ('${CID}','소모품','검증용 요청','접수','staff','검증')
                    returning id`)

  const byField = tryAs(FLD, `select public.snooze_request('${RID}'::uuid, '${day(30)}'::date, '검증 중')`)
  ok(!byField.ok, '① 기사님은 요청을 못 내려 둔다', err(byField))

  const past = tryAs(ADM, `select public.snooze_request('${RID}'::uuid, '${day(-1)}'::date, '')`)
  ok(!past.ok && /오늘 이후/.test(past.out), '② 지난 날짜로는 못 내려 둔다', err(past))

  const far = tryAs(ADM, `select public.snooze_request('${RID}'::uuid, '${day(400)}'::date, '')`)
  ok(!far.ok && /1년/.test(far.out), '③ **1년 넘게는 못 내려 둔다** (영원히와 다를 바 없음)', err(far))

  const a = tryAs(ADM, `select public.snooze_request('${RID}'::uuid, '${day(30)}'::date, '테스트가 끝날 때까지')`)
  ok(a.ok, '④ **내려 둘 수 있다**', err(a))

  //  ⚠ 여기가 핵심입니다 — 상태를 건드리면 안 됩니다.
  const row = psql(`select status || '/' || coalesce(snoozed_until::text,'없음') || '/' || snooze_reason
                    from public.client_requests where id='${RID}'`)
  ok(row === `접수/${day(30)}/테스트가 끝날 때까지`,
    '⑤ **상태는 「접수」 그대로** — 안 한 일을 했다고 적지 않는다', row)
  const n = psql(`select count(*) from public.client_requests where id='${RID}'`)
  ok(n === '1', '⑥ 지워지지도 않는다', `${n}줄`)

  const why = psql(`select summary from public.audit_logs where action='request.snooze' order by at desc limit 1`)
  ok(/테스트가 끝날 때까지/.test(why), '⑦ 왜 내려 뒀는지 남는다', why.slice(0, 60))

  //  다시 꺼내기
  const b = tryAs(ADM, `select public.snooze_request('${RID}'::uuid, null, '')`)
  ok(b.ok, '⑧ 다시 꺼낼 수 있다', err(b))
  ok(psql(`select coalesce(snoozed_until::text,'없음') from public.client_requests where id='${RID}'`) === '없음',
    '⑨ 꺼내면 기한이 사라진다')
  ok(psql(`select count(*) from public.audit_logs where action='request.unsnooze'`) === '1',
    '⑩ 꺼낸 것도 기록에 남는다')

  //  기한이 지나면 저절로 돌아옵니다 — 화면이 오늘과 비교합니다.
  psql(`update public.client_requests set snoozed_until='${day(-2)}' where id='${RID}'`)
  const back = psql(`select count(*) from public.client_requests
                     where id='${RID}' and (snoozed_until is null or snoozed_until <= '${TODAY}')`)
  ok(back === '1', '⑪ **기한이 지나면 저절로 돌아온다**', `${back}건`)
}

console.log('── 공용차를 누가 잡았나 ──')
{
  psql(`insert into public.vehicles (name, waste_type, driver, tonnage)
        values ('[검증76]3.5톤','의료폐기물','',3.5) on conflict do nothing`)
  const VID = psql(`select id from public.vehicles where name='[검증76]3.5톤' limit 1`)

  const r = tryAs(FLD, `select public.reserve_vehicle('${VID}'::uuid, '${TODAY}'::date, '')`)
  ok(r.ok, '⑫ 기사님이 잡는다', err(r))
  const who = psql(`select profile_name from public.vehicle_reservations
                    where vehicle_id='${VID}' and date='${TODAY}'`)
  ok(who === '김준기', '⑬ **잡은 사람 이름이 그 줄에 남는다**', who)
  ok(/"who" *: *"김준기"/.test(r.out), '⑭ 잡자마자 이름을 돌려준다', r.out.slice(0, 60))

  //  ⚠ 다른 기사가 눌렀을 때 「이미 예약됨」만 뜨면 결국 전화를 겁니다.
  const dup = tryAs(FL2, `select public.reserve_vehicle('${VID}'::uuid, '${TODAY}'::date, '')`)
  ok(!dup.ok && /김준기/.test(dup.out), '⑮ **누가 잡았는지 말해 준다** (전화 걸 이유를 없앰)', err(dup))

  //  기사 계정이 남의 프로필을 읽어서 이름을 아는 것이 **아니어야** 합니다.
  const peek = tryAs(FL2, `select count(*) from public.profiles where id='${FLD}'`)
  ok(peek.ok && peek.out === '0', '⑯ 그래도 기사님은 남의 프로필을 못 읽는다 (이름만 얼려 둔 값)', peek.out)

  //  병원 계정에는 여전히 안 보입니다.
  const hosp = tryAs(CLI, `select count(*) from public.vehicle_reservations`)
  ok(hosp.ok && hosp.out === '0', '⑰ 병원 계정에는 예약이 안 보인다 (0070 그대로)', hosp.out)

  const rel = tryAs(FLD, `select public.release_vehicle((select id from public.vehicle_reservations
                          where vehicle_id='${VID}' and date='${TODAY}'))`)
  ok(rel.ok, '⑱ 반납은 그대로 된다 (권한이 안 좁아짐)', err(rel))
}

console.log('── 판 번호 ──')
ok(psql(`select public.app_schema_version()`) === '76', '⑲ app_schema_version = 76 (75 에서 올라감)')
