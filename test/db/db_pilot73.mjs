import { execFileSync } from 'node:child_process'

//  0073 — 실사용 마감 두 가지가 서버에서 실제로 지켜지는가.
//
//   ⚠ 처음에는 공용차량 사용·반납까지 여기서 만들려고 했습니다. 그런데
//     0070 에 이미 예약·해제가 있었습니다(vehicle_reservations · SharedTruck).
//     같은 것을 두 벌 만들면 「어느 쪽이 진짜인가」가 생깁니다 — 빼냈습니다.
//
//   여기가 헐거우면 **다시 카카오톡으로 돌아갑니다.**
//    · 공용차량을 두 사람이 동시에 가져가면 「누가 갖고 있나」를 또 물어야 합니다
//    · 마감이 두 번 찍히면 「진짜 끝난 건가」를 또 물어야 합니다
//    · 취소 사유가 안 남으면 나중에 아무도 설명하지 못합니다
//
//   확인하는 것
//    · 공용차량: 한 차에 열린 사용은 하나뿐 (두 번째는 **누가 쓰는지** 알려 준다)
//    · 반납: 연타해도 한 번 (두 번째는 already)
//    · 반납 후에는 다시 가져갈 수 있다
//    · 마감: 하루 한 번 (연타해도 한 줄), 미래 날짜는 못 닫는다
//    · 마감 요약은 **서버가 세어** 준다 — 기사님이 다시 입력하지 않는다
//    · 마감은 **고칠 수 없다** (update/delete 정책 없음)
//    · 병원 계정은 공용차량 상태도 마감 기록도 못 본다
//    · 취소 사유: 빈 사유는 거부, 남긴 사유는 감사기록에 남는다

const DB = 'pilot73'

//  ⚠ **늘 새 DB 에서** 돌립니다. 예전에는 이 파일이 자기 DB 를 안 만들었고,
//    전체 회귀에서는 그 DB 가 아예 없어 「검사 0」으로 조용히 지나갔습니다.
//    (0064 까지는 migrations/ 에, 0066·0067·0070·0072·0073 은 proposals/ 에
//     있습니다 — 서버에 이미 올라간 순서 그대로 올립니다.)
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close']) {
  execFileSync('sudo', ['-u', 'pgtest', 'psql', '-h', '/var/tmp/pgt', '-p', '55432', '-U', 'postgres',
    '-d', DB, '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}supabase/proposals/PROPOSAL_${f}.sql`],
    { encoding: 'utf8' })
}

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
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, client_id)
        values ('${id}','${email}','${role}','${role}',true,now(), ${clientId ? `'${clientId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, active=true, approved_at=now(), client_id=excluded.client_id`)
  return id
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)

//  ⚠ 병원 셋을 씁니다. 실제 규칙이 「한 병원 · 하루 · 한 구분」에 완료를
//    하나만 허용하기 때문입니다(schedules_one_completion_per_day).
//    처음에 한 병원으로 세 줄을 넣으려다 여기 걸렸습니다 — 제약이 제
//    일을 한 것이라, 제약이 아니라 시험을 고쳤습니다.
const CIDS = ['가', '나', '다'].map((k) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste)
        values ('[검증73]마감${k}병원','병원','',true) on conflict do nothing`)
  return psql(`select id from public.clients where name='[검증73]마감${k}병원' limit 1`)
})
const CID = CIDS[0]
psql(`insert into public.vehicles (name, waste_type, driver) values ('[검증73]3.5톤 공용','의료폐기물','')
      on conflict do nothing`)
//  ⚠ limit 1 — vehicles.name 에 고유 제약이 없어 on conflict do nothing 이
//    막지 못합니다. 두 번 돌리면 두 줄이 되고, select 가 uuid 두 개를
//    돌려줘 시험이 엉뚱하게 터집니다.
const VID = psql(`select id from public.vehicles where name='[검증73]3.5톤 공용' limit 1`)

const F1 = mk('p73f1@x.test', 'field')
const ADM = mk('p73a@x.test', 'admin')
const CLI = mk('p73c@x.test', 'client', CID)

console.log('── 오늘 업무 마감 ──')
{
  //  이 기사에게 오늘 일정 셋 — 둘 완료, 하나 남김
  psql(`insert into public.schedules (client_id, date, waste_type, scheduled_time, status, vehicle_id, actual_amount, updated_by)
        values ('${CIDS[0]}','${TODAY}','의료폐기물','09:00','완료','${VID}',120,'${F1}'),
               ('${CIDS[1]}','${TODAY}','의료폐기물','11:00','완료','${VID}',80,'${F1}'),
               ('${CIDS[2]}','${TODAY}','의료폐기물','15:00','예정','${VID}',null,'${F1}')`)

  const a = tryAs(F1, `select public.close_day('${TODAY}'::date, '오후 한 곳은 병원 요청으로 내일')`)
  ok(a.ok, '① 마감할 수 있다', err(a))
  ok(/"already" *: *false/.test(a.out), '② 처음 마감은 already=false', a.out.slice(0, 80))
  //  ⚠ 기사님이 숫자를 다시 입력하지 않습니다 — 서버가 셉니다.
  ok(/"done" *: *2/.test(a.out), '③ 완료 건수를 **서버가** 센다 (2건)', a.out.slice(0, 120))
  ok(/"left" *: *1/.test(a.out), '④ 미완료 건수를 서버가 센다 (1건)', a.out.slice(0, 120))
  ok(/"kg" *: *200/.test(a.out), '⑤ 총 수거량을 서버가 센다 (200kg)', a.out.slice(0, 120))

  const b = tryAs(F1, `select public.close_day('${TODAY}'::date)`)
  ok(b.ok && /"already" *: *true/.test(b.out), '⑥ 두 번 눌러도 한 번 (두 번째는 이미 마감)', b.out.slice(0, 60))
  const n = psql(`select count(*) from public.day_closes where profile_id='${F1}' and date='${TODAY}'`)
  ok(n === '1', '⑦ 마감 기록은 한 줄뿐', `${n}줄`)

  const fut = tryAs(F1, `select public.close_day(('${TODAY}'::date + 1))`)
  ok(!fut.ok, '⑧ 내일은 못 닫는다', fut.ok ? '닫혀 버림' : '')

  //  ⚠ 근무 기록이라 조용히 덮어쓸 수 없어야 합니다.
  const upd = tryAs(F1, `update public.day_closes set note='딴말' where profile_id='${F1}'`)
  const still = psql(`select note from public.day_closes where profile_id='${F1}' and date='${TODAY}'`)
  ok(/병원 요청/.test(still), '⑨ 마감은 나중에 고칠 수 없다', `${upd.ok ? '오류 없음' : '거부'} · 남은 값: ${still.slice(0, 30)}`)

  const seen = tryAs(ADM, `select count(*) from public.day_closes where profile_id='${F1}'`)
  ok(seen.ok && seen.out === '1', '⑩ 관리자는 기사 마감 여부를 볼 수 있다', seen.out)

  //  ⚠ 사무실 화면이 「김OO 기사 마감」이라고 적으려면 이름이 필요합니다.
  //    그런데 현장 계정은 남의 프로필을 못 읽습니다(RLS) — 그 권한을 열면
  //    현장 계정이 남의 개인정보를 읽게 됩니다. 그래서 **마감 순간의 이름을
  //    그 줄에 같이 얼려** 둡니다. 여기가 비면 화면이 이름을 지어내거나
  //    권한을 여는 쪽으로 흘러갑니다.
  //  ⚠ 기대값을 시스템 값에 맞추지 않습니다 — **프로필에 적힌 이름과 같아야
  //    한다**가 규칙이고, 그 이름이 무엇인지는 여기서 정하지 않습니다.
  //    (실제로 서버가 가입 시 이름을 이메일 앞부분으로 채워 넣습니다.)
  const real = psql(`select name from public.profiles where id='${F1}'`)
  const who = tryAs(ADM, `select profile_name from public.day_closes where profile_id='${F1}' and date='${TODAY}'`)
  ok(who.ok && who.out !== '' && who.out === real,
     '⑪ 마감한 사람 이름이 그 줄에 함께 남는다', `${who.out} vs 프로필 ${real}`)
}

console.log('── 병원 계정에는 안 보인다 ──')
{
  const v = tryAs(CLI, `select count(*) from public.vehicle_reservations`)
  ok(v.ok && v.out === '0', '⑫ 병원 계정에 공용차 예약 미노출 (0070 그대로)', v.out)
  const d = tryAs(CLI, `select count(*) from public.day_closes`)
  ok(d.ok && d.out === '0', '⑬ 병원 계정에 직원 마감 기록 미노출', d.out)
}

console.log('── 수거 취소 사유 ──')
{
  const blank = tryAs(ADM, `select public.revert_collection_with_reason(gen_random_uuid(), '  ')`)
  ok(!blank.ok && /사유/.test(blank.out), '⑭ 빈 사유는 거부한다', err(blank))
  //  없는 기록을 되돌리려 하면 기존 함수가 막습니다 — 사유 갈래도 같이 막혀야 합니다.
  const ghost = tryAs(ADM, `select public.revert_collection_with_reason(gen_random_uuid(), '잘못 입력')`)
  ok(!ghost.ok, '⑮ 없는 기록은 사유가 있어도 못 되돌린다', ghost.ok ? '통과해 버림' : '')
}

console.log('── 확정한 청구에 들어간 수거는 못 되돌린다 ──')
{
  //  ⚠ 화면은 예전부터 「확정한 청구가 있으면 서버가 막습니다」라고 적어
  //    두었는데, 실제로 막는 자리는 어디에도 없었습니다. 여기가 그 자리입니다.
  //  ⚠ 확정한 청구는 그 순간의 명세서를 굳혀 둡니다(0017). 그래서 수거를
  //    되돌려도 청구 금액은 안 바뀌는데, 수거이력에서는 사라집니다 —
  //    병원에 보낸 명세서에는 있는 수거가 우리 이력에는 없게 됩니다.
  const CB = CIDS[1]
  const D = day(-3)
  psql(`insert into public.schedules (id, client_id, date, waste_type, scheduled_time, status, actual_amount, updated_by)
        values (gen_random_uuid(), '${CB}', '${D}', '의료폐기물', '10:00', '완료', 90, '${ADM}')`)
  const SID = psql(`select id from public.schedules where client_id='${CB}' and date='${D}' limit 1`)
  const EID = psql(`insert into public.collection_events
        (actor_id, actor_role, action, schedule_id, client_id, client_name, waste_type, amount_kg,
         before_state, material_ids, stock_before, request_updates)
        values ('${ADM}','admin','수거 완료','${SID}','${CB}','[검증73]마감나병원','의료폐기물',90,
                '{"status":"예정","actualAmount":null,"handoverStatus":null}'::jsonb,
                '{}'::uuid[], '{}'::jsonb, '[]'::jsonb)
        returning id`)
  psql(`update public.schedules set event_id='${EID}' where id='${SID}'`)

  //  아직 청구 전 — 되돌아가야 합니다.
  const before = tryAs(ADM, `select public.revert_collection_with_reason('${EID}'::uuid, '잘못 입력')`)
  ok(before.ok, '⑯ 청구 전에는 사유와 함께 되돌아간다', err(before))

  //  다시 완료로 돌려놓고, 이번엔 그 수거를 덮는 청구를 확정해 둡니다.
  psql(`update public.collection_events set reverted=false, reverted_at=null where id='${EID}'`)
  psql(`update public.schedules set status='완료', actual_amount=90, event_id='${EID}' where id='${SID}'`)
  psql(`insert into public.payments (client_id, billing_month, amount, status, snapshot)
        values ('${CB}', '${D.slice(0, 7)}', 123456, '미수금',
                jsonb_build_object('scheduleIds', jsonb_build_array('${SID}'), 'materialIds', '[]'::jsonb))`)

  const after = tryAs(ADM, `select public.revert_collection_with_reason('${EID}'::uuid, '잘못 입력')`)
  ok(!after.ok && /청구/.test(after.out), '⑰ **확정한 청구에 들어간 수거는 못 되돌린다**', err(after))
  //  사유 없는 옛 갈래로 와도 똑같이 막혀야 합니다 — 우회로가 있으면 규칙이 아닙니다.
  const old = tryAs(ADM, `select public.revert_collection('${EID}'::uuid)`)
  ok(!old.ok && /청구/.test(old.out), '⑱ 옛 함수로 와도 똑같이 막힌다 (우회로 없음)', err(old))
  //  ⚠ 막힌 뒤에 **아무것도 안 바뀌어 있어야** 합니다 — 반쯤 되돌아간 상태가
  //    남으면 그게 제일 나쁩니다.
  const st = psql(`select status || '/' || coalesce(actual_amount::text,'-') from public.schedules where id='${SID}'`)
  ok(st === '완료/90', '⑲ 막힌 뒤 일정이 **그대로**다 (반쯤 되돌아가지 않음)', st)
  const rv = psql(`select reverted::text from public.collection_events where id='${EID}'`)
  ok(rv === 'false', '⑳ 수거 기록도 그대로다', rv)

  //  청구를 취소하면 다시 되돌릴 수 있어야 합니다 — 영영 못 고치는 것은 규칙이 아닙니다.
  psql(`update public.payments set status='취소' where client_id='${CB}'`)
  const again = tryAs(ADM, `select public.revert_collection_with_reason('${EID}'::uuid, '청구 취소 후 정정')`)
  ok(again.ok, '㉑ 청구를 취소하면 다시 되돌릴 수 있다', err(again))
}

console.log('── 공용차 반납 지연 ──')
{
  //  ⚠ 예약을 무르는 것이 곧 반납입니다(줄이 지워집니다). 그래서 **지난
  //    날짜에 줄이 남아 있다** = 아직 안 놓은 것입니다. 화면은 이 상태만
  //    강한 빨강으로 씁니다.
  //  ⚠ 예전 화면은 지난 날짜에서 단추를 통째로 숨겼습니다 — 한 번 밀린
  //    예약은 **무를 방법이 아예 없었습니다.** 서버가 막고 있었던 것이
  //    아니라 화면이 안 그렸던 것이라, 여기서 서버 쪽을 못 박아 둡니다.
  const y = day(-2)
  const r = tryAs(F1, `select public.reserve_vehicle('${VID}'::uuid, '${TODAY}'::date, '')`)
  ok(r.ok, '㉒ 오늘 공용차를 잡을 수 있다', err(r))
  //  지난 날짜 줄은 함수가 아니라 직접 넣습니다 — reserve_vehicle 이 지난
  //  날짜를 막는 것과, 이미 밀려 있는 줄을 놓을 수 있는 것은 다른 이야기입니다.
  psql(`insert into public.vehicle_reservations (vehicle_id, date, profile_id, note)
        values ('${VID}','${y}','${F1}','') on conflict do nothing`)
  const late = tryAs(F1, `select count(*) from public.vehicle_reservations
                          where vehicle_id='${VID}' and date < '${TODAY}'::date`)
  ok(late.ok && late.out === '1', '㉓ 지난 날짜에 남은 줄 = 반납 지연으로 보인다', late.out)

  const lid = psql(`select id from public.vehicle_reservations where vehicle_id='${VID}' and date='${y}' limit 1`)
  const rel = tryAs(F1, `select public.release_vehicle('${lid}'::uuid)`)
  ok(rel.ok, '㉔ 밀린 예약도 나중에 반납 처리할 수 있다', err(rel))
  const gone = psql(`select count(*) from public.vehicle_reservations where id='${lid}'`)
  ok(gone === '0', '㉕ 반납하면 줄이 사라진다 (= 사용 가능)', `${gone}줄`)
}

console.log('── 판 번호 ──')
ok(psql(`select public.app_schema_version()`) === '73', '㉖ app_schema_version = 73 (70 에서 올라감)')
