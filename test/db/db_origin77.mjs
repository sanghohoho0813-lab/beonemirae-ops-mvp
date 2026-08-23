import { execFileSync } from 'node:child_process'

//  0077 — 「이 일정 누가 넣었지?」 · 기사님이 본인 일정을 정리한다
//
//   ⚠ 여기가 헐거우면 대표님이 다시 전화로 물어보게 됩니다.
//   ⚠ 그리고 기사님이 **사무실이 짠 일정을 무를 수 있게** 되면, 사무실은
//     왜 안 갔는지 모른 채 다음 날 병원 전화를 받습니다.

const DB = 'origin77'
const ROOT = new URL('../../', import.meta.url).pathname
execFileSync('bash', [new URL('./setup_db.sh', import.meta.url).pathname, DB], { stdio: 'ignore' })
for (const f of ['0066_client_facts', '0067_field_schedule', '0070_ops_setup', '0073_day_close',
                 '0074_amend', '0075_supply_items', '0076_snooze_who', '0077_schedule_origin']) {
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

const mk = (email, role, name, vehicleId = null) => {
  psql(`insert into auth.users (id, email) values (gen_random_uuid(), '${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}'`)
  psql(`insert into public.profiles (id, email, name, role, active, approved_at, vehicle_id)
        values ('${id}','${email}','${name}','${role}',true,now(), ${vehicleId ? `'${vehicleId}'` : 'null'})
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true,
                                       approved_at=now(), vehicle_id=excluded.vehicle_id`)
  return id
}

const TODAY = psql(`select (now() at time zone 'Asia/Seoul')::date`)
const day = (n) => psql(`select ('${TODAY}'::date + ${n})::text`)
psql(`insert into public.vehicles (name, waste_type, driver) values ('[검증77]1호차','의료폐기물','')
      on conflict do nothing`)
const VID = psql(`select id from public.vehicles where name='[검증77]1호차' limit 1`)
const ADM = mk('a77@x.test', 'admin', '송대표')
const FLD = mk('f77@x.test', 'field', '김준기', VID)
const FL2 = mk('g77@x.test', 'field', '오대성', VID)

const CIDS = ['가', '나', '다', '라', '마'].map((k) => {
  psql(`insert into public.clients (name, type, address, collects_medical_waste)
        values ('[검증77]출처${k}병원','병원','',true) on conflict do nothing`)
  return psql(`select id from public.clients where name='[검증77]출처${k}병원' limit 1`)
})
//  ⚠ 배정을 하나도 안 하면 can_see_client() 가 전부 true 입니다 (0056 규칙).
//    여기서는 배정 자체를 안 켜므로 기사님이 모든 거래처를 잡을 수 있습니다 —
//    이 검사가 보려는 것은 배정 규칙이 아니라 **출처와 무르기 권한**입니다.

const book = (uid, cid, d, extra = '') =>
  tryAs(uid, `select public.book_visit('${cid}'::uuid, '${d}'::date, '의료폐기물', '09:00',
    '${VID}'::uuid, '', null, ${extra || 'null'}, '정기수거')`)
const viaOf = (cid) =>
  psql(`select created_via || '/' || created_by_name from public.schedules
        where client_id='${cid}' order by created_at desc limit 1`)

console.log('── 누가 · 어떻게 넣었나 ──')
{
  const a = book(ADM, CIDS[0], day(3))
  ok(a.ok, '① 사무실이 잡는다', err(a))
  ok(viaOf(CIDS[0]) === '사무실 배정/송대표', '② **사무실 배정 · 이름까지 남는다**', viaOf(CIDS[0]))

  const f = book(FLD, CIDS[1], day(3))
  ok(f.ok, '③ 기사님이 잡는다', err(f))
  ok(viaOf(CIDS[1]) === '기사 직접 추가/김준기', '④ **기사 직접 추가 · 이름까지**', viaOf(CIDS[1]))

  //  병원 요청으로 잡은 것
  const RID = psql(`insert into public.client_requests (client_id, kind, content, status, source, requester_name)
                    values ('${CIDS[2]}','추가수거','요청','접수','portal','병원')
                    returning id`)
  const r = tryAs(ADM, `select public.book_visit_via('${CIDS[2]}'::uuid, '${day(3)}'::date, '의료폐기물',
    '10:00', '${VID}'::uuid, '', null, '${RID}'::uuid, '추가수거')`)
  ok(r.ok, '⑤ 병원 요청을 걸고 잡는다', err(r))
  ok(viaOf(CIDS[2]) === '병원 요청/송대표', '⑥ **병원 요청 연계라고 남는다**', viaOf(CIDS[2]))

  //  자동 편성 — 묶음 번호가 붙은 줄
  const BATCH = psql(`select gen_random_uuid()`)
  psql(`insert into public.schedules (client_id, date, waste_type, scheduled_time, status,
        expected_amount, vehicle_id, plan_batch, created_by)
        values ('${CIDS[3]}','${day(4)}','의료폐기물','08:00','예정',100,'${VID}','${BATCH}','${ADM}')`)
  ok(viaOf(CIDS[3]) === '자동 편성/송대표', '⑦ **자동 편성은 자동 편성이라고 남는다**', viaOf(CIDS[3]))

  //  넣은 사람을 모르는 줄 — 지어내지 않습니다
  psql(`insert into public.schedules (client_id, date, waste_type, scheduled_time, status,
        expected_amount, vehicle_id, origin)
        values ('${CIDS[4]}','${day(5)}','의료폐기물','08:00','예정',100,'${VID}','migrated')`)
  ok(viaOf(CIDS[4]) === '엑셀·초기 자료/', '⑧ 엑셀 자료는 그렇게 · **이름은 비워 둔다**', viaOf(CIDS[4]))

  const blank = psql(`select count(*) from public.schedules where coalesce(created_via,'')=''`)
  ok(blank === '0', '⑨ **경로가 안 적힌 일정이 하나도 없다**', `${blank}건`)
}

console.log('── 기사님이 본인 일정을 무른다 ──')
{
  const mine = psql(`select id from public.schedules where client_id='${CIDS[1]}' limit 1`)
  const office = psql(`select id from public.schedules where client_id='${CIDS[0]}' limit 1`)

  const noWhy = tryAs(FLD, `select public.cancel_my_visit('${mine}'::uuid, '  ')`)
  ok(!noWhy.ok && /이유/.test(noWhy.out), '⑩ 이유 없이는 못 무른다', err(noWhy))

  //  ⚠ 여기가 제일 중요합니다.
  const other = tryAs(FLD, `select public.cancel_my_visit('${office}'::uuid, '못 갑니다')`)
  ok(!other.ok && /내가 넣은 일정이 아닙니다/.test(other.out) && /사무실 배정/.test(other.out),
    '⑪ **사무실이 잡은 일정은 못 무른다 · 경로까지 말해 준다**', err(other))

  const notMine = tryAs(FL2, `select public.cancel_my_visit('${mine}'::uuid, '내가 무르겠다')`)
  //  ⚠ 다른 기사님이 넣은 것도 못 무릅니다. 그때 「사무실에서 잡은
  //    일정입니다」라고 하면 거짓말이라, 아는 것만 말합니다.
  ok(!notMine.ok && /내가 넣은 일정이 아닙니다/.test(notMine.out) && /기사 직접 추가/.test(notMine.out),
    '⑫ 다른 기사님이 넣은 것도 못 무른다 · 거짓말하지 않는다', err(notMine))

  const a = tryAs(FLD, `select public.cancel_my_visit('${mine}'::uuid, '병원이 오늘 쉰다고 합니다')`)
  ok(a.ok, '⑬ **본인이 넣은 것은 무를 수 있다**', err(a))

  //  지우지 않고 남깁니다.
  const row = psql(`select (canceled_at is not null)::text || '/' || cancel_reason
                    from public.schedules where id='${mine}'`)
  ok(/^true\/병원이 오늘 쉰다/.test(row), '⑭ **지우지 않고 「무름」으로 남는다**', row)
  ok(psql(`select count(*) from public.schedules where id='${mine}'`) === '1', '⑮ 줄이 그대로 있다')
  const al = psql(`select actor_name || '/' || summary from public.audit_logs
                   where action='schedule.cancel' order by at desc limit 1`)
  ok(/김준기/.test(al) && /쉰다/.test(al), '⑯ 누가·왜 무른지 감사기록에 남는다', al.slice(0, 70))

  const twice = tryAs(FLD, `select public.cancel_my_visit('${mine}'::uuid, '또')`)
  ok(twice.ok && /alreadyCanceled" *: *true/.test(twice.out), '⑰ 두 번 눌러도 같은 결과', twice.out.slice(0, 50))

  //  사무실은 기존 함수로 남의 일정도 무릅니다 — 권한이 안 좁아졌습니다.
  const byAdm = tryAs(ADM, `select public.cancel_visit('${office}'::uuid, '사무실 판단')`)
  ok(byAdm.ok, '⑱ 사무실은 그대로 무를 수 있다 (권한 안 좁아짐)', err(byAdm))
}

console.log('── 수거기록이 붙은 일정 ──')
{
  const c = tryAs(FLD, `select public.complete_collection('${JSON.stringify({
    clientId: null, wasteType: '의료폐기물', actualAmount: 100, actualTime: '09:30',
    vehicleId: null, date: null, memo: '', supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  }).replace(/'/g, "''")}'::jsonb)`)
  //  위는 일부러 빈 값이라 실패합니다 — 제대로 넣습니다.
  const p = { clientId: CIDS[4], wasteType: '의료폐기물', actualAmount: 100, actualTime: '09:30',
    vehicleId: VID, date: TODAY, memo: '', driverName: '김준기',
    supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 } }
  const c2 = tryAs(FLD, `select public.complete_collection('${JSON.stringify(p).replace(/'/g, "''")}'::jsonb)`)
  ok(c2.ok, '⑲ 기사님이 수거를 넣는다 (일정 없이 직접)', err(c2))
  const sid = psql(`select id from public.schedules where client_id='${CIDS[4]}' and date='${TODAY}' limit 1`)
  ok(viaOf(CIDS[4]).startsWith('기사 직접 추가'), '⑳ 수거 입력으로 생긴 일정도 경로가 남는다', viaOf(CIDS[4]))

  //  ⚠ 여기서 일정을 무르게 두면 수거기록만 떠서 남습니다.
  const bad = tryAs(FLD, `select public.cancel_my_visit('${sid}'::uuid, '지우고 싶어요')`)
  ok(!bad.ok && /수거/.test(bad.out),
    '㉑ **수거기록이 붙은 일정은 못 무른다** (그 수거기록으로 가라고 말해 준다)', err(bad))
  ok(!c.ok, '㉒ (참고) 빈 값은 서버가 거절한다')
}

console.log('── 시간 바꾸기 ──')
{
  const f = book(FLD, CIDS[1], day(6))
  ok(f.ok, '㉓ 기사님이 다른 날 방문을 잡는다', err(f))
  const sid = psql(`select id from public.schedules where client_id='${CIDS[1]}' and date='${day(6)}' limit 1`)

  const bad = tryAs(FLD, `select public.retime_my_visit('${sid}'::uuid, '25:99')`)
  ok(!bad.ok && /24시간/.test(bad.out), '㉔ 이상한 시간은 거절한다', err(bad))

  const a = tryAs(FLD, `select public.retime_my_visit('${sid}'::uuid, '14:30')`)
  ok(a.ok, '㉕ **본인 일정 시간은 바꿀 수 있다**', err(a))
  ok(psql(`select scheduled_time from public.schedules where id='${sid}'`) === '14:30', '㉖ 시간이 바뀌었다')
  ok(psql(`select count(*) from public.audit_logs where action='schedule.retime'`) === '1',
    '㉗ 시간 바꾼 것도 기록에 남는다')

  const office = psql(`select id from public.schedules where client_id='${CIDS[2]}' limit 1`)
  const no = tryAs(FLD, `select public.retime_my_visit('${office}'::uuid, '15:00')`)
  ok(!no.ok && /내가 넣은 일정이 아닙니다/.test(no.out), '㉘ 남이 잡은 일정 시간은 못 바꾼다', err(no))
}

console.log('── 판 번호 ──')
ok(psql(`select public.app_schema_version()`) === '77', '㉙ app_schema_version = 77 (76 에서 올라감)')
