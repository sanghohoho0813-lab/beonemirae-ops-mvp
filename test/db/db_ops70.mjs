import { execFileSync } from 'node:child_process'

//  0070 — 테스트 표시 · 호차 고정 · 3.5톤 · 구분 해제 · 예약
//   ⚠ 격리 DB 에서 **실제로 실행해 보고** 확인합니다. SQL 을 읽어서 맞다고
//     하는 것과 돌려 보는 것은 다릅니다.

const DB = 'ops70q'
//  ⚠ 이 검사는 **늘 새 DB** 에서 돌아야 합니다. 앞선 실행이 남은 DB 에
//    준비물을 또 넣으면 거래처·차량이 두 개가 되고, 「이름이 안 바뀌었다」로
//    잘못 읽힙니다 — 실제로 그렇게 났습니다.
execFileSync('bash', ['xl/setup_db.sh', DB], { stdio: 'ignore' })
const P = ['-h','/var/tmp/pgt','-p','55432','-U','postgres','-d',DB,'-qtA','-v','ON_ERROR_STOP=1']
const asRole = (uid, sql) =>
  `set local role authenticated; set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'; ${sql}`
const run = (sql, uid) =>
  execFileSync('sudo',['-u','pgtest','psql',...P,'-c', uid ? asRole(uid, sql) : sql],{encoding:'utf8'}).trim()
const psql = (s)=>run(s)
const tryAs = (uid, sql) => { try { return {ok:true,out:run(sql,uid)} } catch(e){ return {ok:false,out:String(e.stderr??e.message)} } }
const ok = (c,m,d='')=>{ console.log(`${c?' OK ':'FAIL'} | ${m}${d?` — ${d}`:''}`); if(!c) process.exitCode=1 }
const err = (r)=>(String(r.out).match(/ERROR:.*/)??[''])[0].slice(0,120)

const mk = (email, role, name) => {
  psql(`insert into auth.users (id,email) values (gen_random_uuid(),'${email}') on conflict (email) do nothing`)
  const id = psql(`select id from auth.users where email='${email}' limit 1`)
  psql(`insert into public.profiles (id,email,name,role,active,approved_at)
        values ('${id}','${email}','${name}','${role}',true,now())
        on conflict (id) do update set role=excluded.role, name=excluded.name, active=true, approved_at=now()`)
  return id
}

// ── 준비 — 운영과 같은 모양으로 ─────────────────────────────────────────────
psql(`insert into public.vehicles (name,waste_type,tonnage,nominal_capacity,expected_capacity,driver,active) values
  ('1호차','의료폐기물',1,1000,800,'',true),
  ('2호차','의료폐기물',1,1000,800,'',true),
  ('3호차','의료폐기물',1,1000,800,'',true),
  ('4호차','일회용기저귀',1,1000,800,'',true),
  ('5호차','일회용기저귀',1,1000,800,'',true),
  ('[검증]검증차량','의료폐기물',1,180,150,'검증기사',true)`)
const CA = psql(`insert into public.clients (name,type,collects_medical_waste,collects_diaper,active)
                 values ('가나병원','병원',true,true,true) returning id`)
psql(`insert into public.clients (name,type,collects_medical_waste,active)
      values ('[검증]한마음요양병원','요양병원',true,false)`)
const admin = mk('a@x.c','admin','송명근')
const f1 = mk('bkh@x.c','field','백광호')
const f2 = mk('kjh@x.c','field','김진환')
const f3 = mk('kjg@x.c','field','김준기')
const f4 = mk('ods@x.c','field','오대성')
const ft = mk('t@x.c','field','김상호(테스트용)')
//  병원 계정
psql(`insert into auth.users (id,email) values (gen_random_uuid(),'h@x.c') on conflict (email) do nothing`)
const hid = psql(`select id from auth.users where email='h@x.c' limit 1`)
psql(`insert into public.profiles (id,email,name,role,active,approved_at,client_id)
      values ('${hid}','h@x.c','가나병원','client',true,now(),'${CA}')
      on conflict (id) do update set role='client', active=true, approved_at=now(), client_id='${CA}'`)

console.log('══ 0070 실행 ══')
execFileSync('sudo',['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres','-d',DB,'-q','-v','ON_ERROR_STOP=1',
  '-f','/home/user/beonemirae-ops-mvp/supabase/proposals/PROPOSAL_0070_ops_setup.sql'],{encoding:'utf8'})
ok(psql(`select public.app_schema_version()`) === '70', '판이 70 으로 올라감')

// ── A. [Test용] ────────────────────────────────────────────────────────────
console.log('\n══ A. 테스트 표시 ══')
ok(psql(`select count(*) from public.clients where name = '[Test용]한마음요양병원'`) === '1',
   '**거래처 이름 앞에 [Test용]**', psql(`select name from public.clients where name like '[Test%'`))
ok(psql(`select count(*) from public.vehicles where name = '[Test용]검증차량'`) === '1', '차량도 [Test용]')
ok(psql(`select active::text from public.vehicles where name='[Test용]검증차량'`) === 'false',
   '**검증 차량은 배차 목록에서 내려감**')
ok(psql(`select count(*) from public.profiles where name like '[Test용]%'`) === '1',
   '테스트 계정 이름 앞에도 [Test용]', psql(`select name from public.profiles where name like '[Test%'`))
//  실제 자료는 안 건드립니다
ok(psql(`select count(*) from public.clients where name = '가나병원'`) === '1', '실제 거래처 이름은 그대로')
//  여러 번 실행해도 안전한가
execFileSync('sudo',['-u','pgtest','psql','-h','/var/tmp/pgt','-p','55432','-U','postgres','-d',DB,'-q','-v','ON_ERROR_STOP=1',
  '-f','/home/user/beonemirae-ops-mvp/supabase/proposals/PROPOSAL_0070_ops_setup.sql'],{encoding:'utf8'})
ok(psql(`select count(*) from public.clients where name like '[Test용][Test용]%'`) === '0',
   '**두 번 실행해도 [Test용][Test용] 이 안 됨**')

// ── B. 호차 고정 ───────────────────────────────────────────────────────────
console.log('\n══ B. 호차 고정 ══')
for (const [who, car] of [['백광호','1호차'],['김진환','2호차'],['김준기','3호차'],['오대성','4호차']]) {
  const got = psql(`select coalesce(v.name,'없음') from public.profiles p
                    left join public.vehicles v on v.id=p.vehicle_id where p.name='${who}'`)
  ok(got === car, `${who} → ${car}`, got)
}
ok(psql(`select coalesce(vehicle_id::text,'없음') from public.profiles where name like '[Test용]%'`) === '없음',
   '테스트 계정에는 차를 안 붙임')

// ── C. 3.5톤 ───────────────────────────────────────────────────────────────
console.log('\n══ C. 3.5톤 ══')
ok(psql(`select count(*) from public.vehicles where name='3.5톤 (공용)'`) === '1', '3.5톤이 등록됨')
ok(psql(`select tonnage::text from public.vehicles where name='3.5톤 (공용)'`) === '3.5', '3.5톤으로 등록')
ok(psql(`select count(*) from public.vehicles where name='3.5톤 (공용)'`) === '1',
   '두 번 실행해도 하나만 (위에서 이미 두 번 돌렸습니다)')

// ── D. 차량 구분 해제 ──────────────────────────────────────────────────────
console.log('\n══ D. 차량 구분 해제 ══')
const v4 = psql(`select id from public.vehicles where name='4호차'`)   // 기저귀 차
const T = psql(`select (current_date)::text`)
const sc = psql(`insert into public.schedules (date,client_id,waste_type,status,origin,created_by)
                 values ('${T}','${CA}','의료폐기물','예정','system','${admin}') returning id`)
//  기저귀 차(4호차)로 의료폐기물 수거를 저장 — 이제 막히면 안 됩니다
const payload = JSON.stringify({
  scheduleId: sc, clientId: CA, wasteType: '의료폐기물', vehicleId: v4,
  driverName: '오대성', actualAmount: 120, actualTime: '09:30',
  containers: { corrugated: 0, plastic: 0, bag: 0, etc: 0 },
  handoverStatus: '수거 완료',
  supplied: { corrugatedBox: 0, plasticContainer: 0, bag: 0, needleBox: 0 },
  suppliedItems: {}, isAdditional: false, memo: '', role: '현장 담당자', screen: '수거 입력',
})
const save = tryAs(f4, `select public.complete_collection('${payload.replace(/'/g, "''")}'::jsonb)`)
ok(save.ok, '**기저귀 차로 의료폐기물 수거가 저장됨** (구분 검사 해제)', save.ok ? '' : err(save))
ok(psql(`select waste_type from public.schedules where id='${sc}'`) === '의료폐기물',
   '무엇을 실었는지는 기록에 그대로 남음 (나중에 대조 가능)')

// ── E. 예약 ────────────────────────────────────────────────────────────────
console.log('\n══ E. 3.5톤 예약 ══')
const v35 = psql(`select id from public.vehicles where name='3.5톤 (공용)'`)
const D1 = psql(`select (current_date + 2)::text`)
const r1 = tryAs(f1, `select public.reserve_vehicle('${v35}','${D1}','오전에 큰 건')`)
ok(r1.ok, '**현장 기사가 3.5톤을 예약함**', r1.ok ? '' : err(r1))

//  다른 기사가 같은 날 — 막히고 **누가 잡았는지** 알려 줘야 합니다
const r2 = tryAs(f2, `select public.reserve_vehicle('${v35}','${D1}','')`)
ok(!r2.ok && /백광호/.test(r2.out), '**같은 날은 막고, 누가 잡았는지 알려 줌**', err(r2))

//  본인이 또 누르면
const r3 = tryAs(f1, `select public.reserve_vehicle('${v35}','${D1}','')`)
ok(!r3.ok && /본인이 예약/.test(r3.out), '본인이 다시 눌러도 그대로 알려 줌')

//  다른 날은 됩니다
const D2 = psql(`select (current_date + 3)::text`)
ok(tryAs(f2, `select public.reserve_vehicle('${v35}','${D2}','')`).ok, '다른 날은 다른 기사도 잡음')

//  ⚠ **모든 직원이 봐야** 합니다
for (const [who, uid] of [['현장 백광호', f1], ['현장 김진환', f2], ['현장 오대성', f4], ['관리자', admin]]) {
  const r = tryAs(uid, `select count(*) from public.vehicle_reservations`)
  ok(r.ok && Number(r.out) >= 2, `${who} 가 예약을 봄`, r.ok ? `${r.out}건` : err(r))
}
//  ⚠ **병원은 못 봐야** 합니다
const hv = tryAs(hid, `select count(*) from public.vehicle_reservations`)
ok(hv.ok && hv.out === '0', '**병원 계정에는 안 보임**', hv.ok ? `${hv.out}건` : err(hv))
const hr = tryAs(hid, `select public.reserve_vehicle('${v35}','${psql(`select (current_date+5)::text`)}','')`)
ok(!hr.ok, '병원 계정은 예약도 못 함', hr.ok ? '됐습니다' : '막힘')

//  무르기 — 본인 것만
const rid = psql(`select id from public.vehicle_reservations where date='${D1}'`)
ok(!tryAs(f2, `select public.release_vehicle('${rid}')`).ok, '**남의 예약은 못 무름**')
ok(tryAs(f1, `select public.release_vehicle('${rid}')`).ok, '본인 예약은 무름')
ok(psql(`select count(*) from public.vehicle_reservations where date='${D1}'`) === '0', '무르면 자리가 빔')
//  사무실은 남의 것도 뺄 수 있어야 합니다 (휴가 간 사람 차가 계속 잡혀 있으면 아무도 못 씁니다)
const rid2 = psql(`select id from public.vehicle_reservations where date='${D2}'`)
ok(tryAs(admin, `select public.release_vehicle('${rid2}')`).ok, '관리자는 남의 예약도 뺌')

//  지난 날짜
ok(!tryAs(f1, `select public.reserve_vehicle('${v35}',(current_date - 1),'')`).ok, '지난 날짜는 막힘')
